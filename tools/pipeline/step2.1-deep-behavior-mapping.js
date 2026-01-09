#!/usr/bin/env node
/**
 * Step 2.1: Deep Behavior Mapping
 *
 * For each element inside revealed UI (dropdowns, modals), clicks it
 * and captures what changes. This tells us what each item DOES.
 *
 * Input:  elements-deep.json, uiContainers
 * Output: behaviors-deep.json (complete behavior map with effects)
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const inputDir = process.argv[2] || './pipeline-output';

async function main() {
  console.log('='.repeat(60));
  console.log('Step 2.1: Deep Behavior Mapping');
  console.log('='.repeat(60));

  // Load deep elements from Step 1.1
  const elementsPath = path.join(inputDir, 'elements-deep.json');
  if (!fs.existsSync(elementsPath)) {
    console.error(`ERROR: ${elementsPath} not found. Run Step 1.1 first.`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(elementsPath, 'utf-8'));
  const { url, elements, uiContainers } = data;

  // Get only hidden elements (inside dropdowns/modals)
  const hiddenElements = elements.filter(el => !el.visibleOnLoad);

  console.log(`Loaded ${elements.length} total elements`);
  console.log(`Found ${hiddenElements.length} hidden elements to analyze`);
  console.log(`Found ${uiContainers.length} UI containers`);

  if (hiddenElements.length === 0) {
    console.log('No hidden elements to analyze. Step 2.1 complete!');
    return;
  }

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const behaviorMap = [];
  const stateChanges = new Set();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    console.log('\nMapping hidden element behaviors...\n');

    // Process by container to be efficient
    for (const container of uiContainers) {
      console.log(`\n[${ container.id}] Processing ${container.elementCount} elements`);
      console.log(`  Trigger: ${container.triggerLabel}`);

      const containerElements = hiddenElements.filter(el => el.parentUI === container.id);

      for (const element of containerElements) {
        const label = element.identifiers.ariaLabel ||
                      element.identifiers.text ||
                      element.identifiers.testId ||
                      `element-${element.index}`;

        process.stdout.write(`  [${element.index}] ${label.slice(0, 35).padEnd(35)} `);

        try {
          // Open the parent container
          await page.mouse.click(container.triggerCenter.x, container.triggerCenter.y);
          await page.waitForTimeout(400);

          // Capture state BEFORE clicking the item
          const stateBefore = await captureAppState(page);

          // Click the item
          await page.mouse.click(element.center.x, element.center.y);
          await page.waitForTimeout(400);

          // Capture state AFTER clicking
          const stateAfter = await captureAppState(page);

          // Analyze what changed
          const effect = analyzeStateChange(stateBefore, stateAfter, element);

          behaviorMap.push({
            elementIndex: element.index,
            testId: element.identifiers.testId,
            label,
            parentUI: element.parentUI,
            effect
          });

          // Track unique state changes for state registry
          if (effect.stateChanges) {
            for (const [key, value] of Object.entries(effect.stateChanges)) {
              stateChanges.add(JSON.stringify({ variable: key, value }));
            }
          }

          console.log(`→ ${effect.type}`);

          // Reset: close any UI and restore state
          await page.keyboard.press('Escape');
          await page.waitForTimeout(200);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(200);

        } catch (err) {
          console.log(`→ error: ${err.message.slice(0, 25)}`);
          behaviorMap.push({
            elementIndex: element.index,
            testId: element.identifiers.testId,
            label,
            parentUI: element.parentUI,
            effect: { type: 'error', error: err.message }
          });

          // Try to recover
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        }
      }
    }

    // Build state registry from observed changes
    const stateRegistry = buildStateRegistry(stateChanges, behaviorMap);

    // Summary
    const effectTypes = {};
    for (const b of behaviorMap) {
      effectTypes[b.effect.type] = (effectTypes[b.effect.type] || 0) + 1;
    }

    console.log('\n' + '='.repeat(60));
    console.log('Deep Behavior Summary:');
    for (const [type, count] of Object.entries(effectTypes).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }
    console.log(`\nState variables discovered: ${Object.keys(stateRegistry).length}`);

    // Save output
    const output = {
      url,
      timestamp: new Date().toISOString(),
      totalBehaviors: behaviorMap.length,
      effectSummary: effectTypes,
      stateRegistry,
      behaviors: behaviorMap
    };

    const outputPath = path.join(inputDir, 'behaviors-deep.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nSaved: ${outputPath}`);

    await browser.close();
    console.log('\nStep 2.1 complete!');

  } catch (err) {
    console.error('Error:', err.message);
    await browser.close();
    process.exit(1);
  }
}

async function captureAppState(page) {
  return await page.evaluate(() => {
    const state = {};

    // Check which tool is selected (Excalidraw-specific + generic)
    const selectedTools = document.querySelectorAll(
      '[data-testid*="tool"].selected, ' +
      '.ToolIcon.selected, ' +
      '[aria-pressed="true"], ' +
      '.tool-button.active, ' +
      '[data-state="active"]'
    );
    if (selectedTools.length > 0) {
      const toolEl = selectedTools[0];
      state.activeTool = toolEl.getAttribute('data-testid') ||
                         toolEl.getAttribute('aria-label') ||
                         toolEl.className;
    }

    // Check for active/selected states on other elements
    const activeElements = document.querySelectorAll('.selected, .active, [aria-selected="true"]');
    state.activeElements = [...activeElements].map(el => ({
      testId: el.getAttribute('data-testid'),
      className: el.className
    })).slice(0, 10);

    // Check body/root classes (theme, mode changes)
    state.bodyClasses = document.body.className;
    state.rootClasses = document.documentElement.className;

    // Check for visible modals/dialogs
    const modals = document.querySelectorAll('[role="dialog"]:not([hidden])');
    state.visibleModals = [...modals].filter(m => {
      const style = window.getComputedStyle(m);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }).map(m => m.getAttribute('data-testid') || m.className).slice(0, 5);

    // Check URL (for navigation)
    state.url = window.location.href;

    // Check for any data attributes on app root that might indicate state
    const appRoot = document.querySelector('#root, #app, [data-app]');
    if (appRoot) {
      state.appDataAttrs = {};
      for (const attr of appRoot.attributes) {
        if (attr.name.startsWith('data-')) {
          state.appDataAttrs[attr.name] = attr.value;
        }
      }
    }

    // Check localStorage for state (common pattern)
    try {
      const excalidrawState = localStorage.getItem('excalidraw');
      if (excalidrawState) {
        const parsed = JSON.parse(excalidrawState);
        state.localStorage = {
          activeTool: parsed.activeTool,
          theme: parsed.theme
        };
      }
    } catch (e) {}

    return state;
  });
}

function analyzeStateChange(before, after, element) {
  const effect = {
    type: 'unknown',
    stateChanges: {},
    cssChanges: [],
    uiChanges: []
  };

  // Check if tool changed
  if (before.activeTool !== after.activeTool) {
    effect.type = 'selects_tool';
    effect.stateChanges.activeTool = after.activeTool;
    return effect;
  }

  // Check if modal appeared
  if (after.visibleModals.length > before.visibleModals.length) {
    effect.type = 'opens_modal';
    effect.uiChanges.push({
      action: 'modal_opened',
      modal: after.visibleModals[after.visibleModals.length - 1]
    });
    return effect;
  }

  // Check if URL changed (navigation)
  if (before.url !== after.url) {
    effect.type = 'navigates';
    effect.stateChanges.url = after.url;
    return effect;
  }

  // Check if body classes changed (theme toggle, etc.)
  if (before.bodyClasses !== after.bodyClasses) {
    effect.type = 'toggles_theme';
    effect.cssChanges.push({
      selector: 'body',
      before: before.bodyClasses,
      after: after.bodyClasses
    });
    return effect;
  }

  // Check for changes in active elements
  const beforeActive = JSON.stringify(before.activeElements);
  const afterActive = JSON.stringify(after.activeElements);
  if (beforeActive !== afterActive) {
    effect.type = 'changes_selection';
    effect.stateChanges.activeElements = after.activeElements;
    return effect;
  }

  // Check localStorage changes
  if (before.localStorage && after.localStorage) {
    if (before.localStorage.activeTool !== after.localStorage.activeTool) {
      effect.type = 'selects_tool';
      effect.stateChanges.activeTool = after.localStorage.activeTool;
      return effect;
    }
    if (before.localStorage.theme !== after.localStorage.theme) {
      effect.type = 'toggles_theme';
      effect.stateChanges.theme = after.localStorage.theme;
      return effect;
    }
  }

  // If testId contains hints about what it does
  const testId = element.identifiers.testId || '';
  const label = element.identifiers.ariaLabel || element.identifiers.text || '';

  if (testId.includes('tool') || label.toLowerCase().includes('tool')) {
    effect.type = 'selects_tool';
    effect.stateChanges.activeTool = testId || label;
    return effect;
  }

  if (testId.includes('export') || label.toLowerCase().includes('export')) {
    effect.type = 'triggers_export';
    return effect;
  }

  if (testId.includes('save') || label.toLowerCase().includes('save')) {
    effect.type = 'triggers_save';
    return effect;
  }

  if (testId.includes('load') || testId.includes('open') ||
      label.toLowerCase().includes('open')) {
    effect.type = 'triggers_open';
    return effect;
  }

  if (element.tagName === 'a' && element.identifiers.href) {
    effect.type = 'external_link';
    effect.stateChanges.href = element.identifiers.href;
    return effect;
  }

  // Default: action with no observable state change
  effect.type = 'action_no_state_change';
  return effect;
}

function buildStateRegistry(stateChangesSet, behaviorMap) {
  const registry = {};

  // Group state changes by variable
  for (const item of stateChangesSet) {
    const { variable, value } = JSON.parse(item);

    if (!registry[variable]) {
      registry[variable] = {
        type: 'unknown',
        values: new Set(),
        setBy: {}
      };
    }

    registry[variable].values.add(value);
  }

  // Map which elements set which values
  for (const behavior of behaviorMap) {
    if (behavior.effect.stateChanges) {
      for (const [variable, value] of Object.entries(behavior.effect.stateChanges)) {
        if (registry[variable]) {
          if (!registry[variable].setBy[value]) {
            registry[variable].setBy[value] = [];
          }
          registry[variable].setBy[value].push({
            elementIndex: behavior.elementIndex,
            testId: behavior.testId,
            label: behavior.label
          });
        }
      }
    }
  }

  // Convert sets to arrays for JSON
  for (const key of Object.keys(registry)) {
    registry[key].values = [...registry[key].values];
    registry[key].type = registry[key].values.length > 2 ? 'enum' : 'toggle';
  }

  return registry;
}

main();
