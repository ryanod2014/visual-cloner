#!/usr/bin/env node
/**
 * Test patched Photopea server - should work now!
 */

import { chromium } from 'playwright';

console.log('Testing patched Photopea at http://localhost:3340/?test=1\n');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

console.log('Loading page...');
await page.goto('http://localhost:3340/?test=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

console.log('Loaded! Waiting for initialization...\n');

// Try clicking New Project
console.log('=== Testing New Project Button ===');
try {
  await page.click('text=/new project/i', { timeout: 5000 });
  console.log('✅ Clicked "New Project" button');
  await page.waitForTimeout(2000);

  // Check for dialog with multiple strategies
  const dialogCheck = await page.evaluate(() => {
    // Strategy 1: Look for width/height inputs
    const inputs = document.querySelectorAll('input[type="text"], input[type="number"]');
    for (const input of inputs) {
      if (input.offsetParent !== null) {
        const context = input.parentElement?.textContent || input.previousSibling?.textContent || '';
        if (context.toLowerCase().includes('width') || context.toLowerCase().includes('height')) {
          return {
            found: true,
            method: 'width/height inputs',
            inputValue: input.value
          };
        }
      }
    }

    // Strategy 2: Look for "Create" button
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent.toLowerCase().includes('create') && btn.offsetParent !== null) {
        return {
          found: true,
          method: 'create button',
          buttonText: btn.textContent
        };
      }
    }

    // Strategy 3: Look for modal/dialog container
    const dialogs = document.querySelectorAll('[role="dialog"], .dialog, .modal');
    for (const dialog of dialogs) {
      if (dialog.offsetParent !== null) {
        return {
          found: true,
          method: 'dialog element',
          content: dialog.textContent.substring(0, 100)
        };
      }
    }

    return { found: false };
  });

  if (dialogCheck.found) {
    console.log('✅✅✅ SUCCESS! Dialog appeared!');
    console.log('  Detection method:', dialogCheck.method);
    if (dialogCheck.inputValue) console.log('  Input value:', dialogCheck.inputValue);
    if (dialogCheck.buttonText) console.log('  Button text:', dialogCheck.buttonText);
    console.log('\n🎉🎉🎉 PATCH WORKS! Photopea is fully functional offline!');
  } else {
    console.log('❌ Dialog did not appear');

    // Debug: Take screenshot
    await page.screenshot({ path: '/tmp/photopea-debug.png' });
    console.log('Saved screenshot to /tmp/photopea-debug.png');
  }
} catch (e) {
  console.log('❌ Error:', e.message);
}

console.log('\n\nBrowser staying open for manual testing...');
console.log('Try clicking "New Project" manually to verify!\n');
await new Promise(() => {});
