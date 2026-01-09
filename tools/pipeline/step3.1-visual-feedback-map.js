#!/usr/bin/env node
/**
 * Step 3.1: Visual Feedback Map
 *
 * Captures which elements get visual changes (classes) when state changes.
 * Maps: stateValue → element → CSS class changes
 *
 * Input:  elements-deep.json, behaviors-deep.json
 * Output: visual-feedback-map.json
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const inputDir = process.argv[2] || './pipeline-output';

async function main() {
  console.log('='.repeat(60));
  console.log('Step 3.1: Visual Feedback Map');
  console.log('='.repeat(60));

  // Load deep elements
  const elementsDeepPath = path.join(inputDir, 'elements-deep.json');
  if (!fs.existsSync(elementsDeepPath)) {
    console.error(`ERROR: ${elementsDeepPath} not found.`);
    process.exit(1);
  }

  // Load behaviors
  const behaviorsPath = path.join(inputDir, 'behaviors.json');
  const behaviorsDeepPath = path.join(inputDir, 'behaviors-deep.json');

  const { url, elements } = JSON.parse(fs.readFileSync(elementsDeepPath, 'utf-8'));
  const surfaceBehaviors = JSON.parse(fs.readFileSync(behaviorsPath, 'utf-8'));

  let deepBehaviors = { behaviors: [] };
  if (fs.existsSync(behaviorsDeepPath)) {
    deepBehaviors = JSON.parse(fs.readFileSync(behaviorsDeepPath, 'utf-8'));
  }

  // Find all tool-selection behaviors
  const toolBehaviors = [
    ...surfaceBehaviors.behaviors.filter(b => b.type === 'selects_tool'),
    ...deepBehaviors.behaviors.filter(b => b.effect?.type === 'selects_tool')
  ];

  console.log(`Found ${toolBehaviors.length} tool-selection behaviors to map`);

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const visualFeedbackMap = {};

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    console.log('\nMapping visual feedback for each tool...\n');

    // First, capture the baseline (what's selected by default)
    const baseline = await captureSelectedElements(page);
    console.log(`Baseline: ${baseline.length} elements have .selected`);

    for (const behavior of toolBehaviors) {
      const toolId = behavior.toolId ||
                     behavior.effect?.stateChanges?.activeTool ||
                     behavior.identifiers?.testId ||
                     behavior.testId ||
                     behavior.label;

      const label = behavior.label || toolId;
      process.stdout.write(`[${toolId?.slice(0, 30)?.padEnd(30)}] `);

      try {
        // If this is a hidden tool, we need to open its parent dropdown first
        const isHidden = behavior.parentUI || behavior.effect?.location?.startsWith('dropdown');
        let parentTriggerCenter = null;

        if (isHidden) {
          // Find the parent dropdown trigger
          const parentUI = behavior.parentUI || behavior.effect?.location;
          const parentIndex = parentUI?.match(/\d+/)?.[0];
          if (parentIndex) {
            const parentBehavior = surfaceBehaviors.behaviors.find(
              b => b.elementIndex === parseInt(parentIndex)
            );
            if (parentBehavior) {
              parentTriggerCenter = parentBehavior.center;
              // Open the dropdown
              await page.mouse.click(parentTriggerCenter.x, parentTriggerCenter.y);
              await page.waitForTimeout(300);
            }
          }
        }

        // Click the tool
        const center = behavior.center || behavior.effect?.center;
        if (center) {
          await page.mouse.click(center.x, center.y);
        } else {
          // Try to find by selector
          const selector = behavior.selector ||
                          `[data-testid="${behavior.identifiers?.testId || behavior.testId}"]`;
          await page.click(selector).catch(() => {});
        }

        await page.waitForTimeout(400);

        // Capture which elements now have .selected
        const afterClick = await captureSelectedElements(page);

        // Find elements that GAINED .selected (weren't in baseline)
        const gained = afterClick.filter(el =>
          !baseline.some(b => b.testId === el.testId && b.className === el.className)
        );

        // Find elements that LOST .selected
        const lost = baseline.filter(el =>
          !afterClick.some(a => a.testId === el.testId)
        );

        visualFeedbackMap[toolId] = {
          label,
          isHidden: !!isHidden,
          parentUI: behavior.parentUI,
          visualChanges: {
            elementsGainedSelected: gained,
            elementsLostSelected: lost.map(e => e.testId).filter(Boolean),
            totalSelectedAfter: afterClick.length
          }
        };

        if (gained.length > 0) {
          console.log(`→ ${gained.length} elements gained .selected`);
          gained.forEach(el => {
            console.log(`    + ${el.testId || el.ariaLabel || el.className?.slice(0, 40)}`);
          });
        } else {
          console.log(`→ no visible .selected change`);
        }

        // Reset by clicking selection tool or pressing Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        await page.keyboard.press('v'); // Usually selects "selection" tool
        await page.waitForTimeout(200);

      } catch (err) {
        console.log(`→ error: ${err.message.slice(0, 30)}`);
        visualFeedbackMap[toolId] = {
          label,
          error: err.message
        };

        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
    }

    // Build the reverse map: element → which tools select it
    const elementToToolMap = {};
    for (const [toolId, data] of Object.entries(visualFeedbackMap)) {
      if (data.visualChanges?.elementsGainedSelected) {
        for (const el of data.visualChanges.elementsGainedSelected) {
          const elKey = el.testId || el.ariaLabel || 'unknown';
          if (!elementToToolMap[elKey]) {
            elementToToolMap[elKey] = [];
          }
          elementToToolMap[elKey].push({
            toolId,
            label: data.label,
            isHidden: data.isHidden
          });
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Visual Feedback Summary:');
    console.log(`  Tools mapped: ${Object.keys(visualFeedbackMap).length}`);
    console.log(`  Elements with feedback: ${Object.keys(elementToToolMap).length}`);

    // Save output
    const output = {
      url,
      timestamp: new Date().toISOString(),
      toolCount: Object.keys(visualFeedbackMap).length,
      visualFeedbackMap,
      elementToToolMap
    };

    const outputPath = path.join(inputDir, 'visual-feedback-map.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nSaved: ${outputPath}`);

    await browser.close();
    console.log('\nStep 3.1 complete!');

  } catch (err) {
    console.error('Error:', err.message);
    await browser.close();
    process.exit(1);
  }
}

async function captureSelectedElements(page) {
  return await page.evaluate(() => {
    const selected = document.querySelectorAll(
      '.selected, .active, [aria-pressed="true"], [data-state="active"], [aria-selected="true"]'
    );

    return [...selected].map(el => {
      const rect = el.getBoundingClientRect();
      return {
        testId: el.getAttribute('data-testid'),
        ariaLabel: el.getAttribute('aria-label'),
        className: el.className,
        tagName: el.tagName.toLowerCase(),
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      };
    }).filter(el => el.bounds.width > 0 && el.bounds.height > 0);
  });
}

main();
