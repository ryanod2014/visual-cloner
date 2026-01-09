import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Click start
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(3000); // Wait for fix script to run
} catch (e) {}

console.log('Waiting for file chooser after clicking button...');

// Set up file chooser listener
const chooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });

// Click Open From Computer
await page.click('text=/open from computer/i');

try {
  const chooser = await chooserPromise;
  console.log('✅ SUCCESS! File chooser opened!');

  // Optionally select a test file
  // await chooser.setFiles('/path/to/test/image.png');

  // Cancel by clicking elsewhere
  await page.keyboard.press('Escape');
} catch (e) {
  console.log('❌ FAILED:', e.message);
}

console.log('\nKeeping browser open...');
await new Promise(() => {});
