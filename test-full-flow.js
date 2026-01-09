import { chromium } from 'playwright';
import fs from 'fs';

// Create test image
const testImagePath = '/tmp/test-image.png';
fs.writeFileSync(testImagePath, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAFklEQVR4nO3BMQEAAADCoPVP7WsIoAAAHzoAATqBnPUAAAAASUVORK5CYII=',
  'base64'
));

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => {
  const text = msg.text();
  if (text.includes('[Patch]')) console.log('[browser]', text);
});

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Click start
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(3000);
} catch (e) {}

console.log('Step 1: Click "Open From Computer"...');
await page.click('text=/open from computer/i');
await page.waitForTimeout(1000);

// Look for sidebar
const hasSidebar = await page.evaluate(() => {
  return document.body.innerHTML.includes('This Device');
});
console.log('Sidebar with "This Device" visible:', hasSidebar);

if (hasSidebar) {
  console.log('Step 2: Click "This Device"...');

  // Set up file chooser listener
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });

  await page.click('text=This Device');

  try {
    const chooser = await chooserPromise;
    console.log('✅ File chooser opened!');

    console.log('Step 3: Select test image...');
    await chooser.setFiles(testImagePath);
    await page.waitForTimeout(5000);

    // Check if image loaded
    const state = await page.evaluate(() => {
      const homeBtns = document.querySelectorAll('.bhover');
      const hasHome = [...homeBtns].some(b => b.textContent.includes('Open From Computer'));
      return {
        homeVisible: hasHome,
        canvasCount: document.querySelectorAll('canvas').length,
      };
    });

    console.log('State after file select:', state);

    if (!state.homeVisible || state.canvasCount > 2) {
      console.log('✅ Image appears to have loaded (home screen hidden or extra canvas)');
    }

    await page.screenshot({ path: '/tmp/full-flow-result.png' });
    console.log('Screenshot: /tmp/full-flow-result.png');

  } catch (e) {
    console.log('❌ File chooser error:', e.message);
  }
} else {
  console.log('❌ Sidebar did not appear');
}

console.log('\nBrowser staying open...');
await new Promise(() => {});
