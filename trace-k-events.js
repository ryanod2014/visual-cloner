import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Capture all console logs
page.on('console', msg => {
  const text = msg.text();
  if (text.includes('[K]') || text.includes('[lo.K]') || text.includes('[PATCHED]') || text.includes('[DEBUG]')) {
    console.log('[browser]', text);
  }
});

console.log('Loading debug server at http://localhost:3334...');
await page.goto('http://localhost:3334', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

console.log('\nClicking "Start using Photopea"...');
await page.click('text=/start using photopea/i');
await page.waitForTimeout(3000);

// Check if K function patching worked
const patchCheck = await page.evaluate(() => {
  return {
    kCallsExists: Array.isArray(window.__kCalls),
    kCallsCount: window.__kCalls?.length || 0,
  };
});
console.log('\nPatch check:', patchCheck);

// Clear K calls before clicking
await page.evaluate(() => {
  window.__kCalls = [];
});

console.log('\n=== Clicking "New Project" button ===');

// Find and click New Project
const newProjectButton = await page.locator('text=/new project/i').first();
await newProjectButton.click();
await page.waitForTimeout(2000);

// Get all K calls after the click
const kCalls = await page.evaluate(() => {
  return {
    calls: window.__kCalls || [],
    totalCount: window.__kCalls?.length || 0,
  };
});

console.log(`\nTotal K function calls after click: ${kCalls.totalCount}`);
if (kCalls.calls.length > 0) {
  console.log('\nK calls captured:');
  kCalls.calls.forEach((call, i) => {
    console.log(`  ${i}: d=${call.d}, S=${call.S}, Dm=${call.Dm}`);
  });
} else {
  console.log('\n*** NO K CALLS CAPTURED - Patching may have failed ***');
}

// Check if dialog appeared
const dialogCheck = await page.evaluate(() => {
  const result = {
    dialogExists: false,
    widthInputExists: false,
    heightInputExists: false,
  };

  // Look for dialog elements
  const inputs = document.querySelectorAll('input');
  for (const input of inputs) {
    const placeholder = input.placeholder?.toLowerCase() || '';
    const label = input.previousSibling?.textContent?.toLowerCase() || '';
    if (placeholder.includes('width') || label.includes('width')) {
      result.widthInputExists = true;
      result.dialogExists = true;
    }
    if (placeholder.includes('height') || label.includes('height')) {
      result.heightInputExists = true;
    }
  }

  // Also check for any modal/dialog containers
  const dialogs = document.querySelectorAll('[class*="dialog"], [class*="modal"], [class*="popup"]');
  if (dialogs.length > 0) {
    result.dialogContainers = dialogs.length;
    result.dialogExists = true;
  }

  return result;
});

console.log('\nDialog check:', dialogCheck);

// Keep browser open for inspection
console.log('\n\nBrowser staying open for manual inspection...');
await new Promise(() => {});
