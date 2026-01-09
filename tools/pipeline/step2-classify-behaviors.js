#!/usr/bin/env node
/**
 * Step 2: Classify Behaviors
 *
 * Clicks each discovered element and classifies what happens.
 *
 * Input:  elements.json
 * Output: behaviors.json
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const inputDir = process.argv[2] || './pipeline-output';

async function main() {
  console.log('='.repeat(60));
  console.log('Step 2: Classify Behaviors');
  console.log('='.repeat(60));

  // Load elements from Step 1
  const elementsPath = path.join(inputDir, 'elements.json');
  if (!fs.existsSync(elementsPath)) {
    console.error(`ERROR: ${elementsPath} not found. Run Step 1 first.`);
    process.exit(1);
  }

  const { url, elements } = JSON.parse(fs.readFileSync(elementsPath, 'utf-8'));
  console.log(`Loaded ${elements.length} elements from ${elementsPath}`);
  console.log(`URL: ${url}`);

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const behaviors = [];

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    console.log('\nClassifying behaviors...\n');

    for (const element of elements) {
      const label = element.identifiers.ariaLabel ||
                    element.identifiers.title ||
                    element.identifiers.text ||
                    element.identifiers.testId ||
                    `element-${element.index}`;

      process.stdout.write(`[${element.index}/${elements.length}] ${label.slice(0, 40).padEnd(40)} `);

      try {
        // Capture state before click
        const beforeState = await capturePageState(page);

        // Click the element
        await page.mouse.click(element.center.x, element.center.y);
        await page.waitForTimeout(300); // Wait for UI to react

        // Capture state after click
        const afterState = await capturePageState(page);

        // Classify the behavior
        const behavior = classifyBehavior(beforeState, afterState, element);
        behavior.elementIndex = element.index;
        behavior.label = label;
        behavior.selector = element.uniqueSelector;
        behavior.center = element.center;

        behaviors.push(behavior);
        console.log(`→ ${behavior.type}`);

        // Reset state if needed (press Escape, click away)
        if (behavior.type === 'opens_dropdown' || behavior.type === 'opens_modal') {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(200);
        }

      } catch (err) {
        console.log(`→ error: ${err.message.slice(0, 30)}`);
        behaviors.push({
          elementIndex: element.index,
          label,
          selector: element.uniqueSelector,
          center: element.center,
          type: 'error',
          error: err.message
        });
      }
    }

    // Summarize
    const summary = {};
    for (const b of behaviors) {
      summary[b.type] = (summary[b.type] || 0) + 1;
    }

    console.log('\n' + '='.repeat(60));
    console.log('Behavior Summary:');
    for (const [type, count] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }

    // Save output
    const output = {
      url,
      timestamp: new Date().toISOString(),
      totalBehaviors: behaviors.length,
      summary,
      behaviors
    };

    const outputPath = path.join(inputDir, 'behaviors.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nSaved: ${outputPath}`);

    await browser.close();
    console.log('\nStep 2 complete!');

  } catch (err) {
    console.error('Error:', err.message);
    await browser.close();
    process.exit(1);
  }
}

async function capturePageState(page) {
  return await page.evaluate(() => {
    // Check for visible overlays/modals
    const modals = document.querySelectorAll('[role="dialog"], .Modal, .modal, [data-testid*="dialog"]');
    const visibleModals = [...modals].filter(m => {
      const style = window.getComputedStyle(m);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });

    // Check for visible dropdowns
    const dropdowns = document.querySelectorAll('[role="menu"], .dropdown-menu, [data-testid="dropdown-menu"]');
    const visibleDropdowns = [...dropdowns].filter(d => {
      const style = window.getComputedStyle(d);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });

    // Check for selected/active states
    const selectedTools = document.querySelectorAll('[data-testid*="tool"].selected, .tool-button.active, [aria-pressed="true"]');

    // Check for expanded states
    const expanded = document.querySelectorAll('[aria-expanded="true"]');

    // Check active element
    const activeTag = document.activeElement?.tagName;
    const activeType = document.activeElement?.type;

    return {
      modalCount: visibleModals.length,
      modalClasses: visibleModals.map(m => m.className).slice(0, 3),
      dropdownCount: visibleDropdowns.length,
      dropdownBounds: visibleDropdowns.map(d => {
        const rect = d.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }),
      selectedToolCount: selectedTools.length,
      expandedCount: expanded.length,
      activeElement: { tag: activeTag, type: activeType },
      bodyClasses: document.body.className
    };
  });
}

function classifyBehavior(before, after, element) {
  // Check for tool-related elements FIRST (before modal check)
  // These often show temporary selection UI that looks like modals
  const isToolButton =
    element.identifiers.testId?.includes('tool') ||
    element.identifiers.ariaLabel?.match(/rectangle|diamond|ellipse|arrow|line|draw|text|eraser|selection|hand/i) ||
    element.identifiers.className?.includes('ToolIcon');

  if (isToolButton) {
    // Even if a dropdown briefly appeared, this is primarily a tool selection
    return {
      type: 'selects_tool',
      toolId: element.identifiers.testId || element.identifiers.ariaLabel
    };
  }

  // Dropdown opened - check this before modal since dropdowns are more specific
  if (after.dropdownCount > before.dropdownCount) {
    return {
      type: 'opens_dropdown',
      dropdownBounds: after.dropdownBounds[after.dropdownBounds.length - 1]
    };
  }

  // Modal opened - but only if it's a "real" modal (significant UI)
  if (after.modalCount > before.modalCount) {
    // Check if this is a real modal vs a transient tooltip
    const hasRealModalClass = after.modalClasses.some(c =>
      c.includes('Modal') || c.includes('Dialog') || c.includes('modal')
    );
    if (hasRealModalClass) {
      return {
        type: 'opens_modal',
        modalClasses: after.modalClasses
      };
    }
  }

  // Something expanded
  if (after.expandedCount > before.expandedCount) {
    return {
      type: 'expands_content'
    };
  }

  // Text input focused
  if (after.activeElement.tag === 'INPUT' || after.activeElement.tag === 'TEXTAREA') {
    return {
      type: 'focuses_input',
      inputType: after.activeElement.type
    };
  }

  // Link navigation
  if (element.tagName === 'a') {
    return {
      type: 'navigation_link',
      href: element.identifiers.href
    };
  }

  // Body class changed (theme toggle, mode change)
  if (before.bodyClasses !== after.bodyClasses) {
    return {
      type: 'toggles_state',
      stateChange: 'body_class'
    };
  }

  // No observable change - likely an action or state change we can't detect
  return {
    type: 'action_or_unknown'
  };
}

main();
