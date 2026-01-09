import { chromium } from 'playwright';
import fs from 'fs';

const testImagePath = '/tmp/test-image.png';
const redPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAFklEQVR4nO3BMQEAAADCoPVP7WsIoAAAHzoAATqBnPUAAAAASUVORK5CYII=',
  'base64'
);
fs.writeFileSync(testImagePath, redPng);

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => {
  const text = msg.text();
  if (text.includes('file') || text.includes('File') || text.includes('input') || text.includes('change')) {
    console.log('[browser]', text.slice(0, 300));
  }
});

// Test on REAL Photopea first
console.log('Testing on REAL Photopea...');
await page.goto('https://www.photopea.com', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

// Click start
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(3000);
} catch (e) {}

// Inject file input monitor
await page.evaluate(() => {
  // Monitor createElement to catch any new file inputs
  const origCreate = document.createElement.bind(document);
  document.createElement = function(tag) {
    const el = origCreate(tag);
    if (tag.toLowerCase() === 'input') {
      setTimeout(() => {
        if (el.type === 'file') {
          console.log('NEW file input created!');
          // Monitor change events on this new input
          el.addEventListener('change', () => {
            console.log('Change on NEW input! Files:', el.files.length);
          });
        }
      }, 0);
    }
    return el;
  };

  // Also monitor existing
  const existing = document.querySelector('input[type="file"]');
  if (existing) {
    console.log('Existing file input found, parent:', existing.parentElement?.className);
    existing.addEventListener('change', () => {
      console.log('Change on EXISTING input! Files:', existing.files.length);
    });
  }
});

console.log('\nClicking Open From Computer on real site...');
const [chooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('text=/open from computer/i')
]);

console.log('Selecting file...');
await chooser.setFiles(testImagePath);

await page.waitForTimeout(5000);

// Check if image loaded
const loaded = await page.evaluate(() => {
  // Check if we're no longer on home screen
  const homeBtns = document.querySelectorAll('.bhover');
  const hasHome = [...homeBtns].some(b => b.textContent.includes('Open From Computer'));
  return {
    homeStillVisible: hasHome,
    canvasCount: document.querySelectorAll('canvas').length,
  };
});

console.log('\nReal Photopea state:', loaded);

await page.screenshot({ path: '/tmp/real-photopea.png' });
console.log('Screenshot: /tmp/real-photopea.png');

console.log('\nBrowser open for inspection...');
await new Promise(() => {});
