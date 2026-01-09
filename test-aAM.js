import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => {
  const text = msg.text();
  if (text.includes('[aAM]') || text.includes('[K-newproject]') || text.includes('[PATCHED]')) {
    console.log('[browser]', text);
  }
});

console.log('Loading debug server v3 at http://localhost:3336...');
await page.goto('http://localhost:3336', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

console.log('\nClicking "Start using Photopea"...');
await page.click('text=/start using photopea/i');
await page.waitForTimeout(3000);

console.log('\n=== Clicking "New Project" ===');
await page.click('text=/new project/i');
await page.waitForTimeout(3000);

// Check for dialog
const dialogCheck = await page.evaluate(() => {
  const inputs = document.querySelectorAll('input');
  let hasWidthInput = false;
  for (const input of inputs) {
    if (input.offsetParent !== null) { // visible
      const nearby = input.previousSibling?.textContent || input.placeholder || '';
      if (nearby.toLowerCase().includes('width')) hasWidthInput = true;
    }
  }

  // Also check for any dialog/popup elements
  const dialogs = document.querySelectorAll('.pref, .window, [class*="dialog"], [class*="modal"]');

  return {
    hasWidthInput,
    inputCount: inputs.length,
    dialogElements: dialogs.length,
  };
});

console.log('\nDialog check:', dialogCheck);

console.log('\n\nBrowser staying open for inspection...');
await new Promise(() => {});
