import { chromium } from 'playwright';
import fs from 'fs';

// Create test PNG
const testImagePath = '/tmp/test-image.png';
const redPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAFklEQVR4nO3BMQEAAADCoPVP7WsIoAAAHzoAATqBnPUAAAAASUVORK5CYII=',
  'base64'
);
fs.writeFileSync(testImagePath, redPng);

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => console.log('[browser]', msg.text().slice(0, 300)));

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Click start
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(4000);
} catch (e) {}

// Check the file input's change handler
await page.evaluate(() => {
  const fileInput = document.querySelector('input[type="file"]');
  if (fileInput) {
    console.log('File input found');
    console.log('Has onchange:', !!fileInput.onchange);

    // Try to find event listeners (Chrome DevTools method)
    if (typeof getEventListeners === 'function') {
      const listeners = getEventListeners(fileInput);
      console.log('Event listeners:', JSON.stringify(Object.keys(listeners)));
    }

    // Add our own listener to debug
    fileInput.addEventListener('change', function(e) {
      console.log('Change event fired!');
      console.log('Files:', e.target.files.length);
      if (e.target.files.length > 0) {
        console.log('File name:', e.target.files[0].name);
        console.log('File size:', e.target.files[0].size);
      }
    });
  }
});

console.log('\nOpening file chooser...');
const [chooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('text=/open from computer/i')
]);

console.log('Selecting test image...');
await chooser.setFiles(testImagePath);

// Wait longer
await page.waitForTimeout(8000);

// Check what happened
const state = await page.evaluate(() => {
  const fileInput = document.querySelector('input[type="file"]');
  return {
    hasFiles: fileInput?.files?.length || 0,
    fileName: fileInput?.files?.[0]?.name,
    // Check if home screen is still visible
    homeVisible: !!document.querySelector('.bhover'),
    // Check for canvas/image
    canvasCount: document.querySelectorAll('canvas').length,
  };
});

console.log('\nState after file selection:', state);

await page.screenshot({ path: '/tmp/after-file.png' });
console.log('Screenshot saved to /tmp/after-file.png');

console.log('\nBrowser staying open...');
await new Promise(() => {});
