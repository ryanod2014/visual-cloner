#!/usr/bin/env node
/**
 * V6 SAFE DANGEROUS ACTION CAPTURE
 *
 * Strategies to capture "dangerous" action code safely:
 *
 * 1. CREATE SANDBOX DATA FIRST
 *    - Create a test document/layer/object
 *    - Now "delete" is safe (we're deleting our test data)
 *
 * 2. TRIGGER BUT DON'T CONFIRM
 *    - Most dangerous actions show confirmation dialogs
 *    - Opening the dialog loads the code
 *    - Click Cancel instead of OK
 *
 * 3. IMMEDIATE UNDO
 *    - Execute action, immediately Ctrl+Z
 *    - Code is captured, effect is reversed
 *
 * 4. INTERCEPT BEFORE EXECUTION
 *    - Inject code that prevents actual execution
 *    - But still loads the handler code
 *
 * 5. HOVER/FOCUS ONLY
 *    - Some apps lazy-load on hover
 *    - Hover over dangerous items without clicking
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const allResources = new Map();

async function captureResource(response) {
  const url = response.url();
  if (url.startsWith('data:') || url.startsWith('blob:')) return;
  if (allResources.has(url)) return;
  try {
    const body = await response.body();
    allResources.set(url, {
      url,
      contentType: response.headers()['content-type'] || '',
      body,
      size: body.length
    });
    if (body.length > 50000) {
      console.log(`  [+] ${(body.length/1024).toFixed(0)}KB - ${url.substring(0, 60)}`);
    }
  } catch (e) {}
}

// Create sandbox data that we can safely delete/modify
async function createSandboxData(page) {
  console.log('\n  [SANDBOX] Creating test data for safe deletion...');

  // Create a new layer (so we can safely delete it)
  await page.keyboard.press('Control+Shift+n'); // New layer
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter'); // Accept defaults
  await page.waitForTimeout(500);

  // Draw something on it (so we have content to clear)
  await page.keyboard.press('b'); // Brush tool
  await page.waitForTimeout(300);

  const canvas = await page.$('canvas');
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      // Draw a squiggle
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y + 150, { steps: 5 });
      await page.mouse.move(box.x + 150, box.y + 200, { steps: 5 });
      await page.mouse.up();
    }
  }

  // Create a selection (so we can delete selection)
  await page.keyboard.press('m'); // Marquee tool
  await page.waitForTimeout(300);
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 50, box.y + 50);
      await page.mouse.down();
      await page.mouse.move(box.x + 150, box.y + 150);
      await page.mouse.up();
    }
  }

  await page.waitForTimeout(500);
  console.log('    Created: layer, brush strokes, selection');
}

// Strategy 1: Open dialog, click Cancel
async function triggerWithCancel(page, actionName, clickAction) {
  console.log(`    [CANCEL] ${actionName}`);

  const beforeCount = allResources.size;

  try {
    await clickAction();
    await page.waitForTimeout(800);

    // Look for confirmation dialog
    const confirmButtons = await page.$$('button:has-text("OK"), button:has-text("Yes"), button:has-text("Confirm"), button:has-text("Delete")');
    const cancelButtons = await page.$$('button:has-text("Cancel"), button:has-text("No"), button:has-text("Close")');

    if (cancelButtons.length > 0) {
      // Found a dialog - click Cancel
      await cancelButtons[0].click();
      console.log(`      Dialog opened, clicked Cancel`);
    } else if (confirmButtons.length > 0) {
      // Has confirm but no cancel visible - press Escape
      await page.keyboard.press('Escape');
    } else {
      // No dialog - might have executed, undo it
      await page.keyboard.press('Control+z');
    }

    await page.waitForTimeout(300);

    if (allResources.size > beforeCount) {
      console.log(`      [+${allResources.size - beforeCount} resources]`);
    }
  } catch (e) {
    await page.keyboard.press('Escape');
  }
}

// Strategy 2: Execute then immediately Undo
async function triggerWithUndo(page, actionName, clickAction) {
  console.log(`    [UNDO] ${actionName}`);

  const beforeCount = allResources.size;

  try {
    await clickAction();
    await page.waitForTimeout(500);

    // Immediately undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    if (allResources.size > beforeCount) {
      console.log(`      [+${allResources.size - beforeCount} resources]`);
    }
  } catch (e) {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
  }
}

// Strategy 3: Hover only (for apps that lazy-load on hover)
async function triggerWithHover(page, actionName, element) {
  console.log(`    [HOVER] ${actionName}`);

  const beforeCount = allResources.size;

  try {
    await element.hover();
    await page.waitForTimeout(1000); // Wait for lazy load

    if (allResources.size > beforeCount) {
      console.log(`      [+${allResources.size - beforeCount} resources]`);
    }
  } catch (e) {}
}

// Strategy 4: Intercept before execution
async function injectInterceptors(page) {
  await page.addInitScript(() => {
    // Track what dangerous functions get called
    window.__dangerousCalls = [];

    // We can't truly prevent execution, but we can track it
    const originalConfirm = window.confirm;
    window.confirm = function(msg) {
      window.__dangerousCalls.push({ type: 'confirm', message: msg });
      return false; // Always cancel
    };

    // Intercept alert
    const originalAlert = window.alert;
    window.alert = function(msg) {
      window.__dangerousCalls.push({ type: 'alert', message: msg });
    };
  });
}

// Dangerous actions we want to capture
const dangerousActions = {
  // File operations
  'File > Close': { strategy: 'cancel', keys: 'Control+w' },
  'File > Close All': { strategy: 'cancel' },
  'File > Revert': { strategy: 'cancel' },

  // Edit operations
  'Edit > Clear': { strategy: 'undo', keys: 'Delete' },
  'Edit > Cut': { strategy: 'undo', keys: 'Control+x' },
  'Edit > Fill': { strategy: 'undo', keys: 'Shift+F5' },

  // Layer operations
  'Layer > Delete Layer': { strategy: 'sandbox-then-do' },
  'Layer > Flatten Image': { strategy: 'cancel' },
  'Layer > Merge Visible': { strategy: 'undo', keys: 'Control+Shift+e' },
  'Layer > Merge Down': { strategy: 'undo', keys: 'Control+e' },

  // Image operations
  'Image > Trim': { strategy: 'undo' },
  'Image > Flatten Image': { strategy: 'cancel' },

  // Select operations
  'Select > Deselect': { strategy: 'undo', keys: 'Control+d' },
  'Select > Delete Selection': { strategy: 'undo' },

  // History
  'Edit > Clear History': { strategy: 'cancel' },
};

async function captureDangerousActions(page) {
  console.log('\n  [DANGEROUS] Capturing dangerous action handlers...');

  // First create sandbox data
  await createSandboxData(page);

  // Strategy: Keyboard shortcuts with undo
  console.log('\n  Keyboard shortcuts (with immediate undo):');

  const shortcutActions = [
    { name: 'Delete/Clear', keys: 'Delete', needsSelection: true },
    { name: 'Cut', keys: 'Control+x', needsSelection: true },
    { name: 'Deselect', keys: 'Control+d', needsSelection: true },
    { name: 'Merge Down', keys: 'Control+e', needsLayer: true },
    { name: 'Close', keys: 'Control+w', strategy: 'escape' },
  ];

  for (const action of shortcutActions) {
    const beforeCount = allResources.size;
    console.log(`    ${action.name} (${action.keys})`);

    try {
      await page.keyboard.press(action.keys);
      await page.waitForTimeout(500);

      if (action.strategy === 'escape') {
        await page.keyboard.press('Escape');
      } else {
        await page.keyboard.press('Control+z'); // Undo
      }

      await page.waitForTimeout(300);

      if (allResources.size > beforeCount) {
        console.log(`      [+${allResources.size - beforeCount} resources]`);
      }
    } catch (e) {
      await page.keyboard.press('Escape');
    }
  }

  // Strategy: Menu items with Cancel/Undo
  console.log('\n  Menu items (open then cancel/undo):');

  const menuActions = [
    { menu: 'File', item: 'Close', strategy: 'escape' },
    { menu: 'File', item: 'Revert', strategy: 'escape' },
    { menu: 'Edit', item: 'Clear', strategy: 'undo' },
    { menu: 'Layer', item: 'Delete', strategy: 'undo' },  // Safe because we have sandbox layer
    { menu: 'Layer', item: 'Flatten', strategy: 'escape' },
    { menu: 'Layer', item: 'Merge Visible', strategy: 'undo' },
    { menu: 'Image', item: 'Flatten', strategy: 'escape' },
    { menu: 'Image', item: 'Trim', strategy: 'undo' },
    { menu: 'Select', item: 'Deselect', strategy: 'undo' },
  ];

  for (const action of menuActions) {
    const beforeCount = allResources.size;
    console.log(`    ${action.menu} > ${action.item}`);

    try {
      // Open menu
      await page.click(`text="${action.menu}"`, { timeout: 1000 });
      await page.waitForTimeout(400);

      // Find and click item (or hover)
      const menuItem = await page.$(`text=/${action.item}/i`);
      if (menuItem) {
        if (action.strategy === 'hover') {
          await menuItem.hover();
          await page.waitForTimeout(800);
          await page.keyboard.press('Escape');
        } else {
          await menuItem.click();
          await page.waitForTimeout(600);

          if (action.strategy === 'escape') {
            await page.keyboard.press('Escape');
          } else if (action.strategy === 'undo') {
            // Check for dialog first
            const dialog = await page.$('[role="dialog"], [class*="modal"]');
            if (dialog) {
              await page.keyboard.press('Escape');
            } else {
              await page.keyboard.press('Control+z');
            }
          }
        }
      }

      await page.keyboard.press('Escape'); // Close menu if still open
      await page.waitForTimeout(300);

      if (allResources.size > beforeCount) {
        console.log(`      [+${allResources.size - beforeCount} resources]`);
      }
    } catch (e) {
      await page.keyboard.press('Escape');
    }
  }
}

async function main() {
  const url = process.argv[2] || 'https://www.photopea.com';
  const origin = new URL(url).origin;
  const domain = new URL(url).hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = path.join(__dirname, '..', 'output', `${domain}-safe-dangerous-${timestamp}`);

  await fs.mkdir(path.join(outputDir, 'cache'), { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 SAFE DANGEROUS ACTION CAPTURE');
  console.log('='.repeat(60));
  console.log('URL:', url);
  console.log('\nStrategies:');
  console.log('  1. Create sandbox data, then safely delete it');
  console.log('  2. Open dialogs, click Cancel');
  console.log('  3. Execute, immediately Undo');
  console.log('  4. Hover only (for lazy-load apps)');
  console.log('');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Inject safety interceptors
  await injectInterceptors(page);

  page.on('response', captureResource);

  // Handle confirmation dialogs automatically
  page.on('dialog', async dialog => {
    console.log(`    [DIALOG] ${dialog.type()}: ${dialog.message().substring(0, 50)}`);
    await dialog.dismiss(); // Always cancel
  });

  try {
    console.log('\n[1/4] Loading page...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    console.log(`  Resources: ${allResources.size}`);

    console.log('\n[2/4] Launching app...');
    try {
      await page.click('text=/start using photopea/i', { timeout: 5000 });
      await page.waitForTimeout(8000);
    } catch (e) {}
    console.log(`  Resources: ${allResources.size}`);

    console.log('\n[3/4] Capturing safe actions first...');
    // Do normal safe exploration first
    const safeMenus = ['View', 'Window', 'Help'];
    for (const menu of safeMenus) {
      try {
        await page.click(`text="${menu}"`, { timeout: 1000 });
        await page.waitForTimeout(400);
        await page.keyboard.press('Escape');
      } catch (e) {}
    }
    console.log(`  Resources: ${allResources.size}`);

    console.log('\n[4/4] Capturing dangerous actions safely...');
    await captureDangerousActions(page);
    console.log(`\n  Final resources: ${allResources.size}`);

    // Save
    console.log('\n[SAVING]...');
    const finalHtml = await page.content();

    const urlMap = {};
    let totalSize = 0;

    for (const [resUrl, res] of allResources) {
      const safePath = new URL(resUrl).pathname.replace(/[^a-zA-Z0-9.-]/g, '_') || 'index';
      await fs.mkdir(path.dirname(path.join(outputDir, 'cache', safePath)), { recursive: true });
      await fs.writeFile(path.join(outputDir, 'cache', safePath), res.body);
      urlMap[resUrl] = { localFile: safePath, contentType: res.contentType, size: res.size };
      totalSize += res.size;
    }

    await fs.writeFile(path.join(outputDir, 'url-map.json'), JSON.stringify(urlMap, null, 2));
    await fs.writeFile(path.join(outputDir, 'original.html'), finalHtml);

    // Get intercepted calls
    const intercepted = await page.evaluate(() => window.__dangerousCalls || []);
    await fs.writeFile(path.join(outputDir, 'intercepted-dialogs.json'), JSON.stringify(intercepted, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('SAFE DANGEROUS CAPTURE COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nCaptured ${allResources.size} resources (${(totalSize/1024/1024).toFixed(2)} MB)`);
    console.log(`Intercepted ${intercepted.length} confirmation dialogs`);
    console.log(`\nOutput: ${outputDir}`);

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
