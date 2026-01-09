import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => {
  const text = msg.text();
  if (text.includes('[SPOOF]')) {
    console.log('[browser]', text);
  }
});

console.log('Loading Photopea with environment spoofing...');
await page.goto('http://localhost:3337', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Check what location.hostname is
const locationCheck = await page.evaluate(() => ({
  hostname: window.location.hostname,
  href: window.location.href,
  origin: window.location.origin,
}));

console.log('\n=== Location Check ===');
console.log('Hostname:', locationCheck.hostname);
console.log('Href:', locationCheck.href);
console.log('Origin:', locationCheck.origin);

console.log('\nClicking "Start using Photopea"...');
await page.click('text=/start using photopea/i');
await page.waitForTimeout(3000);

console.log('\n=== Clicking "New Project" ===');
await page.click('text=/new project/i');
await page.waitForTimeout(3000);

// Check if dialog appeared
const dialogCheck = await page.evaluate(() => {
  const inputs = document.querySelectorAll('input');
  let widthInput = null;
  let heightInput = null;

  for (const input of inputs) {
    if (input.offsetParent !== null) { // visible
      const text = (input.previousSibling?.textContent || input.placeholder || '').toLowerCase();
      if (text.includes('width')) widthInput = input;
      if (text.includes('height')) heightInput = input;
    }
  }

  // Also look for any dialog/modal elements
  const modalElements = document.querySelectorAll('.pref, .window, [class*="dialog"]');
  const visibleModals = Array.from(modalElements).filter(el => el.offsetParent !== null);

  return {
    dialogAppeared: !!(widthInput && heightInput),
    widthInput: !!widthInput,
    heightInput: !!heightInput,
    visibleInputs: Array.from(inputs).filter(i => i.offsetParent !== null).length,
    visibleModals: visibleModals.length,
  };
});

console.log('\n=== RESULT ===');
console.log('Dialog appeared:', dialogCheck.dialogAppeared);
console.log('Width input found:', dialogCheck.widthInput);
console.log('Height input found:', dialogCheck.heightInput);
console.log('Visible inputs:', dialogCheck.visibleInputs);
console.log('Visible modals:', dialogCheck.visibleModals);

if (dialogCheck.dialogAppeared) {
  console.log('\n✅ SUCCESS! Environment spoofing FIXED the issue!');
  console.log('The dialog works when the app thinks it\'s on photopea.com');
} else {
  console.log('\n❌ Dialog still not appearing. May need additional fixes.');
}

console.log('\n\nBrowser staying open for inspection...');
await new Promise(() => {});
