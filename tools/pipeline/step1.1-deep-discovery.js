#!/usr/bin/env node
/**
 * Step 1.1: Deep Discovery
 *
 * Discovers ALL interactive elements, including those hidden inside
 * dropdowns, modals, tabs, and other expandable UI.
 *
 * Input:  elements.json, behaviors.json
 * Output: elements-deep.json (complete element inventory)
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const inputDir = process.argv[2] || './pipeline-output';

async function main() {
  console.log('='.repeat(60));
  console.log('Step 1.1: Deep Discovery');
  console.log('='.repeat(60));

  // Load elements from Step 1
  const elementsPath = path.join(inputDir, 'elements.json');
  if (!fs.existsSync(elementsPath)) {
    console.error(`ERROR: ${elementsPath} not found. Run Step 1 first.`);
    process.exit(1);
  }

  // Load behaviors from Step 2
  const behaviorsPath = path.join(inputDir, 'behaviors.json');
  if (!fs.existsSync(behaviorsPath)) {
    console.error(`ERROR: ${behaviorsPath} not found. Run Step 2 first.`);
    process.exit(1);
  }

  const { url, elements } = JSON.parse(fs.readFileSync(elementsPath, 'utf-8'));
  const { behaviors } = JSON.parse(fs.readFileSync(behaviorsPath, 'utf-8'));

  console.log(`Loaded ${elements.length} surface elements`);
  console.log(`Loaded ${behaviors.length} behaviors`);

  // Find behaviors that reveal UI
  const uiRevealingBehaviors = behaviors.filter(b =>
    b.type === 'opens_dropdown' ||
    b.type === 'opens_modal' ||
    b.type === 'expands_content'
  );

  console.log(`Found ${uiRevealingBehaviors.length} UI-revealing behaviors to explore`);

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // Complete element registry - starts with surface elements
  const allElements = elements.map(el => ({
    ...el,
    location: 'surface',
    parentUI: null,
    visibleOnLoad: true
  }));

  // Track discovered UI containers
  const uiContainers = [];

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // =================================================================
    // STATE NORMALIZATION - Ensure elements are in unselected state
    // This prevents "selected" styles from being baked into base CSS
    // =================================================================
    console.log('\nNormalizing UI state (deselecting all elements)...');

    // 1. Press Escape to close any modals/dropdowns
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 2. Click on canvas/body to deselect any selected elements
    const canvasSelector = 'canvas, .excalidraw__canvas, [class*="canvas"]';
    const hasCanvas = await page.$(canvasSelector);
    if (hasCanvas) {
      await page.mouse.click(960, 540);
      await page.waitForTimeout(200);
    } else {
      await page.mouse.click(10, 10);
      await page.waitForTimeout(200);
    }

    // 3. Press Escape again
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 4. Remove any lingering selection classes via JS
    await page.evaluate(() => {
      const selectionClasses = ['selected', 'active', 'tool-selected', 'option-selected', 'is-selected', 'is-active'];
      document.querySelectorAll('*').forEach(el => {
        selectionClasses.forEach(cls => el.classList.remove(cls));
      });
      document.querySelectorAll('[aria-selected="true"]').forEach(el => {
        el.setAttribute('aria-selected', 'false');
      });
    });
    await page.waitForTimeout(200);

    console.log('  UI state normalized\n');

    console.log('Exploring hidden UI...\n');

    // Special handling: For canvas-based apps like Excalidraw, draw a shape first
    // to reveal stroke/style options panel
    const canvasToolBehaviors = behaviors.filter(b =>
      b.type === 'selects_tool' &&
      ['toolbar-rectangle', 'toolbar-ellipse', 'toolbar-diamond'].includes(b.toolId)
    );

    if (canvasToolBehaviors.length > 0) {
      console.log('\n[Canvas Interaction] Attempting to reveal style panel by drawing a shape...\n');

      try {
        // Find the rectangle tool
        const rectTool = canvasToolBehaviors.find(b => b.toolId === 'toolbar-rectangle') || canvasToolBehaviors[0];

        // Click the rectangle tool
        console.log(`  Selecting tool: ${rectTool.toolId}`);
        await page.mouse.click(rectTool.center.x, rectTool.center.y);
        await page.waitForTimeout(300);

        // Draw a shape in the center of the canvas
        const canvasCenter = { x: 960, y: 540 };
        console.log(`  Drawing shape at canvas center...`);

        await page.mouse.move(canvasCenter.x - 100, canvasCenter.y - 50);
        await page.mouse.down();
        await page.waitForTimeout(50);
        await page.mouse.move(canvasCenter.x + 100, canvasCenter.y + 50, { steps: 10 });
        await page.waitForTimeout(50);
        await page.mouse.up();
        await page.waitForTimeout(500);

        // Now capture any newly visible elements (style panel)
        const styleElements = await page.evaluate(() => {
          const elements = [];
          const seen = new Set();

          // Look for style/property panels
          const panelSelectors = [
            '[class*="sidebar"]',
            '[class*="panel"]',
            '[class*="properties"]',
            '[class*="style"]',
            '[role="radiogroup"]',
            '[class*="buttonList"]',
            '.Island',
            '[class*="color"]'
          ];

          // Also look for aria-labels that indicate stroke/style options
          const styleLabels = ['Thin', 'Bold', 'Solid', 'Dashed', 'Dotted', 'Fill', 'Stroke', 'stroke width'];

          // Find elements with style-related labels
          for (const label of styleLabels) {
            const els = document.querySelectorAll(`[aria-label*="${label}"], [title*="${label}"], button:has([aria-label*="${label}"])`);
            for (const el of els) {
              if (seen.has(el)) continue;
              seen.add(el);

              const rect = el.getBoundingClientRect();
              if (rect.width < 5 || rect.height < 5) continue;

              const style = window.getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden') continue;

              elements.push({
                tagName: el.tagName.toLowerCase(),
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
                  testId: el.getAttribute('data-testid'),
                  ariaLabel: el.getAttribute('aria-label'),
                  title: el.getAttribute('title'),
                  role: el.getAttribute('role'),
                  text: el.textContent?.trim().slice(0, 50),
                  className: typeof el.className === 'string' ?
                    el.className.split(' ').filter(c => c).slice(0, 5).join(' ') : null
                },
                uniqueSelector: el.getAttribute('data-testid') ?
                  `[data-testid="${el.getAttribute('data-testid')}"]` :
                  el.getAttribute('aria-label') ?
                    `[aria-label="${el.getAttribute('aria-label')}"]` : null
              });
            }
          }

          // Also look in any visible panel containers
          for (const sel of panelSelectors) {
            const containers = document.querySelectorAll(sel);
            for (const container of containers) {
              const containerRect = container.getBoundingClientRect();
              // Only consider panels on the left side (Excalidraw's style panel location)
              if (containerRect.width < 50 || containerRect.height < 50) continue;
              if (containerRect.x > 400) continue; // Style panel is on the left

              const buttons = container.querySelectorAll('button, [role="radio"], [role="button"]');
              for (const el of buttons) {
                if (seen.has(el)) continue;
                seen.add(el);

                const rect = el.getBoundingClientRect();
                if (rect.width < 5 || rect.height < 5) continue;

                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') continue;

                elements.push({
                  tagName: el.tagName.toLowerCase(),
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
                    testId: el.getAttribute('data-testid'),
                    ariaLabel: el.getAttribute('aria-label'),
                    title: el.getAttribute('title'),
                    role: el.getAttribute('role'),
                    text: el.textContent?.trim().slice(0, 50),
                    className: typeof el.className === 'string' ?
                      el.className.split(' ').filter(c => c).slice(0, 5).join(' ') : null
                  },
                  uniqueSelector: el.getAttribute('data-testid') ?
                    `[data-testid="${el.getAttribute('data-testid')}"]` :
                    el.getAttribute('aria-label') ?
                      `[aria-label="${el.getAttribute('aria-label')}"]` : null
                });
              }
            }
          }

          return elements;
        });

        if (styleElements.length > 0) {
          console.log(`  Found ${styleElements.length} style panel elements`);

          for (const el of styleElements) {
            el.index = allElements.length;
            el.location = 'canvas-style-panel';
            el.parentUI = 'shape-selected';
            el.visibleOnLoad = false;
            el.revealedBy = 'selecting-shape-on-canvas';
            allElements.push(el);
          }

          uiContainers.push({
            id: 'canvas-style-panel',
            type: 'style-panel',
            triggeredBy: 'shape-selection',
            triggerLabel: 'Select shape on canvas',
            elementCount: styleElements.length,
            elementIndices: styleElements.map((_, i) => allElements.length - styleElements.length + i)
          });
        } else {
          console.log(`  No style panel elements found`);
        }

        // Clear the shape (press Delete or Backspace)
        await page.keyboard.press('Delete');
        await page.waitForTimeout(300);

        // Click selection tool to deselect
        const selectionTool = behaviors.find(b => b.toolId === 'toolbar-selection');
        if (selectionTool) {
          await page.mouse.click(selectionTool.center.x, selectionTool.center.y);
          await page.waitForTimeout(200);
        }

      } catch (err) {
        console.log(`  Error during canvas interaction: ${err.message}`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }

    for (const behavior of uiRevealingBehaviors) {
      const containerType = behavior.type.replace('opens_', '').replace('expands_', '');
      const containerId = `${containerType}-${behavior.elementIndex}`;

      console.log(`\n[${containerId}] Exploring: ${behavior.label}`);

      try {
        // Click to open the UI
        await page.mouse.click(behavior.center.x, behavior.center.y);
        await page.waitForTimeout(500);

        // Discover elements inside this UI
        const innerElements = await discoverInnerElements(page, behavior, containerId);

        if (innerElements.length > 0) {
          console.log(`  Found ${innerElements.length} elements inside`);

          // Add to complete registry
          for (const el of innerElements) {
            // Assign new index
            el.index = allElements.length;
            el.location = `in-${containerId}`;
            el.parentUI = containerId;
            el.visibleOnLoad = false;
            el.parentTrigger = {
              elementIndex: behavior.elementIndex,
              label: behavior.label,
              selector: behavior.selector,
              center: behavior.center
            };
            allElements.push(el);
          }

          uiContainers.push({
            id: containerId,
            type: containerType,
            triggeredBy: behavior.elementIndex,
            triggerLabel: behavior.label,
            triggerCenter: behavior.center,
            elementCount: innerElements.length,
            elementIndices: innerElements.map((_, i) => allElements.length - innerElements.length + i)
          });

          // Check for nested UI (dropdown inside modal, etc.)
          const nestedUI = await checkForNestedUI(page, innerElements);
          if (nestedUI.length > 0) {
            console.log(`  Found ${nestedUI.length} nested UI triggers`);
            // TODO: Recursively explore nested UI
          }
        } else {
          console.log(`  No additional elements found inside`);
        }

        // Close the UI
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // Click away to ensure closed
        await page.mouse.click(960, 540);
        await page.waitForTimeout(200);

      } catch (err) {
        console.log(`  Error exploring: ${err.message}`);
        // Try to recover by pressing Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }

    // Summary
    const surfaceCount = elements.length;
    const hiddenCount = allElements.length - surfaceCount;

    console.log('\n' + '='.repeat(60));
    console.log('Deep Discovery Summary:');
    console.log(`  Surface elements: ${surfaceCount}`);
    console.log(`  Hidden elements:  ${hiddenCount}`);
    console.log(`  Total elements:   ${allElements.length}`);
    console.log(`  UI containers:    ${uiContainers.length}`);

    // Save complete elements
    const output = {
      url,
      timestamp: new Date().toISOString(),
      viewport: { width: 1920, height: 1080 },
      totalElements: allElements.length,
      surfaceElements: surfaceCount,
      hiddenElements: hiddenCount,
      uiContainers,
      elements: allElements
    };

    const outputPath = path.join(inputDir, 'elements-deep.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nSaved: ${outputPath}`);

    await browser.close();
    console.log('\nStep 1.1 complete!');

  } catch (err) {
    console.error('Error:', err.message);
    await browser.close();
    process.exit(1);
  }
}

async function discoverInnerElements(page, behavior, containerId) {
  return await page.evaluate(({ behaviorType }) => {
    const elements = [];
    const seen = new Set();

    // Find the opened container
    let container = null;

    if (behaviorType === 'opens_dropdown') {
      const dropdownSelectors = [
        '[role="menu"]',
        '.dropdown-menu',
        '[data-testid="dropdown-menu"]',
        '.popover',
        '[role="listbox"]'
      ];
      for (const sel of dropdownSelectors) {
        const candidates = document.querySelectorAll(sel);
        for (const el of candidates) {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            const rect = el.getBoundingClientRect();
            if (rect.width > 50 && rect.height > 30) {
              container = el;
              break;
            }
          }
        }
        if (container) break;
      }
    } else if (behaviorType === 'opens_modal') {
      const modalSelectors = [
        '[role="dialog"]',
        '.Modal',
        '.modal',
        '[data-testid*="dialog"]',
        '.Dialog'
      ];
      for (const sel of modalSelectors) {
        const candidates = document.querySelectorAll(sel);
        for (const el of candidates) {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            const rect = el.getBoundingClientRect();
            if (rect.width > 100 && rect.height > 100) {
              container = el;
              break;
            }
          }
        }
        if (container) break;
      }
    }

    if (!container) return elements;

    // Find interactive elements inside the container
    const interactiveSelectors = [
      'button',
      'a[href]',
      '[role="menuitem"]',
      '[role="option"]',
      '[role="button"]',
      '[role="tab"]',
      '[onclick]',
      '[data-testid]',
      'input',
      'select',
      '[tabindex="0"]'
    ];

    for (const selector of interactiveSelectors) {
      const els = container.querySelectorAll(selector);

      for (const el of els) {
        if (seen.has(el)) continue;
        seen.add(el);

        // Skip hidden
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        const rect = el.getBoundingClientRect();
        if (rect.width < 5 || rect.height < 5) continue;

        // Get identifiers
        const testId = el.getAttribute('data-testid');
        const ariaLabel = el.getAttribute('aria-label');
        const role = el.getAttribute('role');
        const text = el.textContent?.trim().slice(0, 50);
        const tagName = el.tagName.toLowerCase();

        // Generate unique selector
        let uniqueSelector = null;
        if (testId) {
          uniqueSelector = `[data-testid="${testId}"]`;
        } else if (ariaLabel) {
          uniqueSelector = `[aria-label="${ariaLabel}"]`;
        }

        elements.push({
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
            testId,
            ariaLabel,
            role,
            text: text && text.length > 0 ? text : null,
            className: typeof el.className === 'string' ?
              el.className.split(' ').filter(c => c).slice(0, 5).join(' ') : null
          },
          uniqueSelector
        });
      }
    }

    return elements;
  }, { behaviorType: behavior.type });
}

async function checkForNestedUI(page, elements) {
  // Check if any of the discovered elements could reveal more UI
  const potentialTriggers = elements.filter(el =>
    el.identifiers.ariaLabel?.includes('...') ||
    el.identifiers.text?.includes('...') ||
    el.identifiers.role === 'menuitem' ||
    el.tagName === 'button'
  );

  return potentialTriggers;
}

main();
