import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// Create a simple test image
const testImagePath = '/tmp/test-image.png';
if (!fs.existsSync(testImagePath)) {
  // Create a simple 100x100 red PNG using base64
  const redPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAFklEQVR4nO3BMQEAAADCoPVP7WsIoAAAHzoAATqBnPUAAAAASUVORK5CYII=',
    'base64'
  );
  fs.writeFileSync(testImagePath, redPng);
  console.log('Created test image');
}

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => {
  const text = msg.text();
  if (text.includes('[Patch]') || text.includes('error') || text.includes('Error')) {
    console.log('[browser]', text.slice(0, 200));
  }
});

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Click start
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(4000);
} catch (e) {}

console.log('Opening file chooser...');
const [chooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('text=/open from computer/i')
]);

console.log('Selecting test image...');
await chooser.setFiles(testImagePath);

// Wait for the image to load
await page.waitForTimeout(5000);

// Take a screenshot to see if the image loaded
await page.screenshot({ path: '/tmp/photopea-loaded.png' });
console.log('Screenshot saved to /tmp/photopea-loaded.png');

// Check if we're now in the editor (not the home screen)
const hasCanvas = await page.evaluate(() => {
  // Look for canvas elements which would indicate an image is open
  const canvases = document.querySelectorAll('canvas');
  return canvases.length;
});
console.log(`Canvas elements found: ${hasCanvas}`);

const hasLayers = await page.evaluate(() => {
  // Look for layer panel indicators
  return document.body.innerHTML.includes('Layer') ||
         document.body.innerHTML.includes('layer');
});
console.log(`Has "Layer" in UI: ${hasLayers}`);

console.log('\nCheck /tmp/photopea-loaded.png to see if the image loaded.');
console.log('Browser staying open...');
await new Promise(() => {});
