#!/usr/bin/env node
/**
 * Step 3: Extract UI Content
 *
 * For each behavior that opens UI, extracts STRUCTURED content.
 * Outputs JSON that can be used to generate React components.
 *
 * Input:  behaviors.json
 * Output: content/*.json (one per UI element)
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const inputDir = process.argv[2] || './pipeline-output';

async function main() {
  console.log('='.repeat(60));
  console.log('Step 3: Extract UI Content');
  console.log('='.repeat(60));

  // Load behaviors from Step 2
  const behaviorsPath = path.join(inputDir, 'behaviors.json');
  if (!fs.existsSync(behaviorsPath)) {
    console.error(`ERROR: ${behaviorsPath} not found. Run Step 2 first.`);
    process.exit(1);
  }

  const { url, behaviors } = JSON.parse(fs.readFileSync(behaviorsPath, 'utf-8'));

  // Filter to UI-opening behaviors
  const uiBehaviors = behaviors.filter(b =>
    b.type === 'opens_dropdown' || b.type === 'opens_modal'
  );

  console.log(`Found ${uiBehaviors.length} UI-opening behaviors to extract`);
  if (uiBehaviors.length === 0) {
    console.log('Nothing to extract. Step 3 complete!');
    return;
  }

  // Create content output directory
  const contentDir = path.join(inputDir, 'content');
  fs.mkdirSync(contentDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const extractedContent = [];

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    for (const behavior of uiBehaviors) {
      console.log(`\nExtracting: ${behavior.label}`);

      try {
        // Click to open the UI
        await page.mouse.click(behavior.center.x, behavior.center.y);

        // Wait for UI to appear with retry
        let content = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          await page.waitForTimeout(300 + attempt * 200);

          if (behavior.type === 'opens_dropdown') {
            content = await extractDropdownContent(page);
          } else if (behavior.type === 'opens_modal') {
            content = await extractModalContent(page);
          }

          if (content && (content.items?.length > 0 || content.buttons?.length > 0 || content.title)) {
            break;
          }
          console.log(`  Attempt ${attempt + 1}: no content found, retrying...`);
        }

        if (content && (content.items?.length > 0 || content.buttons?.length > 0 || content.title || content.sections?.length > 0)) {
          content.triggeredBy = {
            label: behavior.label,
            selector: behavior.selector,
            center: behavior.center,
            elementIndex: behavior.elementIndex
          };

          const filename = `ui-${behavior.elementIndex}.json`;
          const filepath = path.join(contentDir, filename);
          fs.writeFileSync(filepath, JSON.stringify(content, null, 2));
          console.log(`  Saved: ${filename} (${content.items?.length || content.buttons?.length || 0} items)`);

          extractedContent.push({
            elementIndex: behavior.elementIndex,
            label: behavior.label,
            type: content.type,
            filename,
            itemCount: content.items?.length || content.buttons?.length || 0
          });
        } else {
          console.log(`  No extractable content found`);
        }

        // Close the UI
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

      } catch (err) {
        console.log(`  Error: ${err.message}`);
      }
    }

    // Save manifest of extracted content
    const manifestPath = path.join(inputDir, 'content-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      url,
      timestamp: new Date().toISOString(),
      extractedCount: extractedContent.length,
      content: extractedContent
    }, null, 2));
    console.log(`\nSaved manifest: ${manifestPath}`);

    await browser.close();
    console.log('\nStep 3 complete!');

  } catch (err) {
    console.error('Error:', err.message);
    await browser.close();
    process.exit(1);
  }
}

async function extractDropdownContent(page) {
  return await page.evaluate(() => {
    // Find the visible dropdown
    const selectors = [
      '[role="menu"]',
      '.dropdown-menu',
      '[data-testid="dropdown-menu"]'
    ];

    let dropdown = null;
    for (const selector of selectors) {
      const candidates = document.querySelectorAll(selector);
      for (const el of candidates) {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          const rect = el.getBoundingClientRect();
          if (rect.width > 50 && rect.height > 50) {
            dropdown = el;
            break;
          }
        }
      }
      if (dropdown) break;
    }

    if (!dropdown) return null;

    const rect = dropdown.getBoundingClientRect();

    // Extract menu items
    const items = [];
    const itemSelectors = [
      '[role="menuitem"]',
      '.dropdown-menu-item',
      'button',
      'a'
    ];

    const seen = new Set();
    for (const selector of itemSelectors) {
      const els = dropdown.querySelectorAll(selector);
      for (const el of els) {
        if (seen.has(el)) continue;
        seen.add(el);

        // Skip hidden
        const style = window.getComputedStyle(el);
        if (style.display === 'none') continue;

        // Get icon SVG
        const iconEl = el.querySelector('svg');
        const iconSvg = iconEl ? iconEl.outerHTML : null;

        // Get label text
        const textEl = el.querySelector('.dropdown-menu-item__text, span');
        const label = textEl?.textContent?.trim() || el.textContent?.trim();

        // Get shortcut
        const shortcutEl = el.querySelector('.dropdown-menu-item__shortcut, kbd');
        const shortcut = shortcutEl?.textContent?.trim() || null;

        // Get any identifiers
        const testId = el.getAttribute('data-testid');
        const ariaLabel = el.getAttribute('aria-label');

        if (label && label.length > 0 && label.length < 100) {
          items.push({
            label,
            shortcut,
            icon: iconSvg,
            testId,
            ariaLabel,
            isLink: el.tagName === 'A',
            href: el.tagName === 'A' ? el.getAttribute('href') : null
          });
        }
      }
    }

    return {
      type: 'dropdown',
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      items
    };
  });
}

async function extractModalContent(page) {
  return await page.evaluate(() => {
    // Find the visible modal
    const selectors = [
      '[role="dialog"]',
      '.Modal',
      '.modal',
      '[data-testid*="dialog"]'
    ];

    let modal = null;
    for (const selector of selectors) {
      const candidates = document.querySelectorAll(selector);
      for (const el of candidates) {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          const rect = el.getBoundingClientRect();
          if (rect.width > 100 && rect.height > 100) {
            modal = el;
            break;
          }
        }
      }
      if (modal) break;
    }

    if (!modal) return null;

    const rect = modal.getBoundingClientRect();

    // Extract title
    const titleEl = modal.querySelector('h1, h2, h3, .Dialog__title, [class*="title"]');
    const title = titleEl?.textContent?.trim() || null;

    // Extract sections/content blocks
    const sections = [];
    const sectionEls = modal.querySelectorAll('section, .section, [class*="section"], [class*="picker"]');

    for (const section of sectionEls) {
      const headerEl = section.querySelector('h3, h4, [class*="header"]');
      const descEl = section.querySelector('p, [class*="description"]');

      sections.push({
        header: headerEl?.textContent?.trim() || null,
        description: descEl?.textContent?.trim() || null
      });
    }

    // Extract buttons
    const buttons = [];
    const buttonEls = modal.querySelectorAll('button, [role="button"]');

    for (const btn of buttonEls) {
      const label = btn.textContent?.trim();
      if (label && label.length > 0 && label.length < 50) {
        const iconEl = btn.querySelector('svg');
        buttons.push({
          label,
          icon: iconEl ? iconEl.outerHTML : null,
          isPrimary: btn.className.includes('primary'),
          testId: btn.getAttribute('data-testid')
        });
      }
    }

    // Extract links
    const links = [];
    const linkEls = modal.querySelectorAll('a[href]');
    for (const link of linkEls) {
      links.push({
        label: link.textContent?.trim(),
        href: link.getAttribute('href')
      });
    }

    return {
      type: 'modal',
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      title,
      sections,
      buttons,
      links
    };
  });
}

main();
