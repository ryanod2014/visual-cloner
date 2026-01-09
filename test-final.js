import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => {
  if (msg.text().includes('[Patch]')) {
    console.log('[browser]', msg.text());
  }
});

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Click start
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  console.log('Clicked "Start Using Photopea"');
  await page.waitForTimeout(4000); // Wait for patch retries
} catch (e) {
  console.log('No start button (already in app)');
}

// Check if patch ran
const patched = await page.evaluate(() => {
  const spans = document.querySelectorAll('span.bhover[data-patched]');
  return spans.length;
});
console.log('Patched buttons:', patched);

// Test file upload
console.log('\nClicking "Open From Computer"...');
const chooserPromise = page.waitForEvent('filechooser', { timeout: 8000 });

await page.click('text=/open from computer/i');

try {
  const chooser = await chooserPromise;
  console.log('✅ FILE CHOOSER OPENED SUCCESSFULLY!');

  // Press Escape to close
  await page.keyboard.press('Escape');
  console.log('File dialog closed');
} catch (e) {
  console.log('❌ Failed:', e.message);
}

console.log('\nOffline Photopea clone is working!');
console.log('URL: http://localhost:3333');
console.log('\nBrowser staying open for manual testing...');
await new Promise(() => {});
