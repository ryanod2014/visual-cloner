import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// Create a proper test image (100x100 red square)
const testImagePath = '/tmp/test-red.png';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => console.log('[browser]', msg.text().slice(0, 200)));

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Click start
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(3000);
} catch (e) {}

// Find the drop zone
const dropZone = await page.$('text=Drop any files here');
if (!dropZone) {
  console.log('Drop zone not found!');
} else {
  console.log('Found drop zone, attempting drag and drop...');

  // Create a simple PNG file
  // This is a minimal valid 1x1 red PNG
  const pngData = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, // RGB, no compression
    0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
    0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, // compressed red pixel
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82  // IEND chunk
  ]);
  fs.writeFileSync(testImagePath, pngData);

  // Use Playwright's drag and drop
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());

  // Add file to dataTransfer
  await page.evaluate(async ([filePath]) => {
    const response = await fetch('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    const blob = await response.blob();
    const file = new File([blob], 'test.png', { type: 'image/png' });

    // Simulate drop event
    const dropZone = document.querySelector('[style*="Drop any files"]') ||
                     [...document.querySelectorAll('*')].find(el => el.textContent === 'Drop any files here')?.parentElement;

    if (dropZone) {
      const dt = new DataTransfer();
      dt.items.add(file);

      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt
      });

      dropZone.dispatchEvent(dropEvent);
      console.log('Drop event dispatched!');
    } else {
      console.log('Drop zone element not found for dispatch');
    }
  }, [testImagePath]);

  await page.waitForTimeout(3000);
}

// Check if anything changed
await page.screenshot({ path: '/tmp/after-drop.png' });
console.log('Screenshot: /tmp/after-drop.png');

// Check state
const state = await page.evaluate(() => ({
  hasHomeButtons: document.body.innerHTML.includes('Open From Computer'),
  canvasCount: document.querySelectorAll('canvas').length,
}));
console.log('State:', state);

console.log('\nBrowser staying open...');
await new Promise(() => {});
