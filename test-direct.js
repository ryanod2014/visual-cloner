import { chromium } from 'playwright';
import fs from 'fs';

// Create test PNG
const testImagePath = '/tmp/test-image.png';
fs.writeFileSync(testImagePath, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAFklEQVR4nO3BMQEAAADCoPVP7WsIoAAAHzoAATqBnPUAAAAASUVORK5CYII=',
  'base64'
));

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => {
  const text = msg.text();
  if (text.includes('[Patch]') || text.includes('error')) {
    console.log('[browser]', text.slice(0, 200));
  }
});

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Click start
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(3000);
} catch (e) {}

console.log('Clicking "Open From Computer"...');

// Set up file chooser listener BEFORE clicking
const chooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
await page.click('text=/open from computer/i');

try {
  const chooser = await chooserPromise;
  console.log('✅ File chooser opened!');

  console.log('Selecting test image...');
  await chooser.setFiles(testImagePath);
  await page.waitForTimeout(3000);

  console.log('File selected.');
  await page.screenshot({ path: '/tmp/direct-upload-result.png' });
  console.log('Screenshot: /tmp/direct-upload-result.png');

} catch (e) {
  console.log('❌ Error:', e.message);
}

console.log('\nBrowser staying open for manual testing...');
console.log('URL: http://localhost:3333');
await new Promise(() => {});
