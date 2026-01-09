#!/usr/bin/env node
/**
 * Step 1: Discover Elements
 *
 * Finds all interactive elements on a page.
 *
 * Input:  URL (command line arg)
 * Output: elements.json
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const url = process.argv[2];
const outputDir = process.argv[3] || './pipeline-output';

if (!url) {
  console.error('Usage: node step1-discover-elements.js <url> [output-dir]');
  process.exit(1);
}

async function main() {
  console.log('='.repeat(60));
  console.log('Step 1: Discover Elements');
  console.log('='.repeat(60));
  console.log(`URL: ${url}`);
  console.log(`Output: ${outputDir}`);

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000); // Let dynamic content load

    // =================================================================
    // STATE NORMALIZATION - Ensure elements are in unselected state
    // This prevents "selected" styles from being baked into base CSS
    // =================================================================
    console.log('\nNormalizing UI state (deselecting all elements)...');

    // 1. Press Escape to close any modals/dropdowns
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 2. Click on canvas/body to deselect any selected elements
    //    For canvas-based apps like Excalidraw, click in canvas area
    const canvasSelector = 'canvas, .excalidraw__canvas, [class*="canvas"]';
    const hasCanvas = await page.$(canvasSelector);
    if (hasCanvas) {
      // Click center of viewport on canvas to deselect
      await page.mouse.click(960, 540);
      await page.waitForTimeout(200);
    } else {
      // Click somewhere neutral (body)
      await page.mouse.click(10, 10);
      await page.waitForTimeout(200);
    }

    // 3. Press Escape again to ensure nothing is selected
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 4. Remove any lingering selection classes via JS
    await page.evaluate(() => {
      // Remove common selection classes from all elements
      const selectionClasses = ['selected', 'active', 'tool-selected', 'option-selected', 'is-selected', 'is-active'];
      document.querySelectorAll('*').forEach(el => {
        selectionClasses.forEach(cls => el.classList.remove(cls));
      });

      // Reset aria-selected attributes
      document.querySelectorAll('[aria-selected="true"]').forEach(el => {
        el.setAttribute('aria-selected', 'false');
      });
    });
    await page.waitForTimeout(200);

    console.log('  UI state normalized - elements should be in unselected state');

    console.log('\nDiscovering interactive elements...');

    const elements = await page.evaluate(() => {
      const interactive = [];

      // Selectors for interactive elements - expanded for better coverage
      const selectors = [
        'button',
        'a[href]',
        '[role="button"]',
        '[role="menuitem"]',
        '[role="tab"]',
        '[role="radio"]',
        '[role="checkbox"]',
        '[onclick]',
        '[data-testid]',
        'input[type="button"]',
        'input[type="submit"]',
        '.clickable',
        '[tabindex="0"]',
        // Excalidraw-specific
        '.ToolIcon_type_button',
        '.ToolIcon',
        '[class*="button"]',
        '[class*="Button"]',
        '[aria-label]', // Many interactive elements have aria-labels
        'label[for]', // Clickable labels
      ];

      const seen = new Set();

      for (const selector of selectors) {
        const els = document.querySelectorAll(selector);

        for (const el of els) {
          // Skip if already processed
          if (seen.has(el)) continue;
          seen.add(el);

          // Skip hidden elements
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          if (el.offsetParent === null && style.position !== 'fixed') continue;

          const rect = el.getBoundingClientRect();

          // Skip tiny or zero-size elements
          if (rect.width < 10 || rect.height < 10) continue;

          // Skip elements outside viewport
          if (rect.right < 0 || rect.bottom < 0) continue;
          if (rect.left > window.innerWidth || rect.top > window.innerHeight) continue;

          // Get identifying info
          const id = el.id || null;
          const testId = el.getAttribute('data-testid') || null;
          const ariaLabel = el.getAttribute('aria-label') || null;
          const title = el.getAttribute('title') || null;
          const role = el.getAttribute('role') || null;
          const text = el.textContent?.trim().slice(0, 50) || null;
          const tagName = el.tagName.toLowerCase();
          const className = el.className || null;

          // Generate a unique selector for this element
          let uniqueSelector = null;
          if (testId) {
            uniqueSelector = `[data-testid="${testId}"]`;
          } else if (id) {
            uniqueSelector = `#${id}`;
          } else if (ariaLabel) {
            uniqueSelector = `[aria-label="${ariaLabel}"]`;
          }

          interactive.push({
            index: interactive.length,
            tagName,
            bounds: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            center: {
              x: Math.round(rect.x + rect.width / 2),
              y: Math.round(rect.y + rect.height / 2)
            },
            identifiers: {
              id,
              testId,
              ariaLabel,
              title,
              role,
              text: text && text.length > 0 ? text : null,
              className: typeof className === 'string' ? className.split(' ').filter(c => c).slice(0, 5).join(' ') : null
            },
            uniqueSelector
          });
        }
      }

      // Sort by position (top-left to bottom-right)
      interactive.sort((a, b) => {
        const rowA = Math.floor(a.bounds.y / 50);
        const rowB = Math.floor(b.bounds.y / 50);
        if (rowA !== rowB) return rowA - rowB;
        return a.bounds.x - b.bounds.x;
      });

      // Re-index after sorting
      interactive.forEach((el, i) => el.index = i);

      return interactive;
    });

    console.log(`Found ${elements.length} interactive elements`);

    // Group by area for summary
    const areas = {
      topLeft: elements.filter(e => e.bounds.x < 400 && e.bounds.y < 200),
      topCenter: elements.filter(e => e.bounds.x >= 400 && e.bounds.x < 1500 && e.bounds.y < 200),
      topRight: elements.filter(e => e.bounds.x >= 1500 && e.bounds.y < 200),
      middle: elements.filter(e => e.bounds.y >= 200 && e.bounds.y < 800),
      bottom: elements.filter(e => e.bounds.y >= 800)
    };

    console.log('\nElement distribution:');
    console.log(`  Top-left:   ${areas.topLeft.length}`);
    console.log(`  Top-center: ${areas.topCenter.length}`);
    console.log(`  Top-right:  ${areas.topRight.length}`);
    console.log(`  Middle:     ${areas.middle.length}`);
    console.log(`  Bottom:     ${areas.bottom.length}`);

    // Save output
    const output = {
      url,
      timestamp: new Date().toISOString(),
      viewport: { width: 1920, height: 1080 },
      totalElements: elements.length,
      elements
    };

    const outputPath = path.join(outputDir, 'elements.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nSaved: ${outputPath}`);

    // Also save a human-readable summary
    const summaryLines = ['# Discovered Elements\n'];
    summaryLines.push(`URL: ${url}`);
    summaryLines.push(`Total: ${elements.length}\n`);

    for (const el of elements.slice(0, 50)) {
      const label = el.identifiers.ariaLabel || el.identifiers.title || el.identifiers.text || el.identifiers.testId || `(${el.tagName})`;
      summaryLines.push(`[${el.index}] ${label} @ (${el.bounds.x}, ${el.bounds.y})`);
    }
    if (elements.length > 50) {
      summaryLines.push(`... and ${elements.length - 50} more`);
    }

    const summaryPath = path.join(outputDir, 'elements-summary.txt');
    fs.writeFileSync(summaryPath, summaryLines.join('\n'));
    console.log(`Saved: ${summaryPath}`);

    await browser.close();
    console.log('\nStep 1 complete!');

  } catch (err) {
    console.error('Error:', err.message);
    await browser.close();
    process.exit(1);
  }
}

main();
