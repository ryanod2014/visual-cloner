import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Collect ALL console messages and network
const logs = [];
page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => logs.push(`[ERROR] ${err.message}`));

// Track failed network requests
page.on('requestfailed', req => {
  logs.push(`[NET FAIL] ${req.url()} - ${req.failure()?.errorText}`);
});

// Track 404s
page.on('response', res => {
  if (res.status() >= 400) {
    logs.push(`[${res.status()}] ${res.url()}`);
  }
});

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Click start button
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(2000);
} catch (e) {}

console.log('\n=== Before clicking Open From Computer ===');
logs.forEach(l => console.log(l));
logs.length = 0;

// Find and analyze the Open From Computer button
const button = await page.$('text=/open from computer/i');
if (button) {
  console.log('\nButton found! Checking its properties...');

  // Check onclick handlers
  const handlers = await page.evaluate(() => {
    const btn = document.evaluate(
      "//*[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'open from computer')]",
      document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;

    if (!btn) return { error: 'Button not found' };

    // Get element info
    return {
      tagName: btn.tagName,
      className: btn.className,
      id: btn.id,
      onclick: btn.onclick ? btn.onclick.toString() : null,
      parentTag: btn.parentElement?.tagName,
      parentClass: btn.parentElement?.className,
      hasInputNearby: !!btn.closest('div')?.querySelector('input[type="file"]'),
    };
  });

  console.log('Button info:', JSON.stringify(handlers, null, 2));

  // Now click and watch what happens
  console.log('\nClicking button...');
  await button.click();
  await page.waitForTimeout(2000);

  console.log('\n=== After clicking ===');
  logs.forEach(l => console.log(l));

  // Check if any hidden file input exists
  const fileInputs = await page.$$('input[type="file"]');
  console.log(`\nFile inputs on page: ${fileInputs.length}`);

  for (let i = 0; i < fileInputs.length; i++) {
    const info = await fileInputs[i].evaluate(el => ({
      id: el.id,
      name: el.name,
      style: el.getAttribute('style'),
      display: window.getComputedStyle(el).display,
      visibility: window.getComputedStyle(el).visibility,
      accept: el.accept,
    }));
    console.log(`Input ${i}:`, JSON.stringify(info));
  }

} else {
  console.log('Button NOT found!');
}

console.log('\nBrowser staying open for inspection...');
console.log('Press Ctrl+C to close');

// Keep browser open
await new Promise(() => {});
