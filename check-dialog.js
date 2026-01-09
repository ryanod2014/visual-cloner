import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => console.log('[browser]', msg.text().slice(0, 300)));

// Test on REAL Photopea
console.log('Testing on REAL Photopea...');
await page.goto('https://www.photopea.com', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

// Click start
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(3000);
} catch (e) {}

// Check what happens when clicking the button
const beforeClick = await page.evaluate(() => ({
  dialogs: document.querySelectorAll('[role="dialog"], .dialog, .modal').length,
  fileInputs: document.querySelectorAll('input[type="file"]').length,
}));
console.log('Before click:', beforeClick);

// Click the button WITHOUT intercepting file chooser
await page.click('text=/open from computer/i');
await page.waitForTimeout(2000);

const afterClick = await page.evaluate(() => ({
  dialogs: document.querySelectorAll('[role="dialog"], .dialog, .modal').length,
  fileInputs: document.querySelectorAll('input[type="file"]').length,
  // Look for any new visible elements
  newElements: [...document.querySelectorAll('*')].filter(el => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' &&
           el.offsetWidth > 200 && el.offsetHeight > 100 &&
           el.className && el.className.includes && !el.className.includes('bhover');
  }).slice(0, 5).map(el => ({
    tag: el.tagName,
    class: el.className?.slice?.(0, 50),
    text: el.textContent?.slice?.(0, 30),
  })),
}));
console.log('After click:', afterClick);

// Take screenshot
await page.screenshot({ path: '/tmp/after-click.png' });
console.log('Screenshot: /tmp/after-click.png');

// Check what's clickable/selectable now
const clickables = await page.evaluate(() => {
  const results = [];
  const elements = document.querySelectorAll('button, [role="button"], .btn, input, a');
  elements.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width > 50 && rect.height > 20 && rect.top > 0 && rect.top < 800) {
      results.push({
        tag: el.tagName,
        type: el.type,
        text: el.textContent?.slice(0, 30) || el.value?.slice(0, 30),
        top: rect.top,
      });
    }
  });
  return results.slice(0, 10);
});
console.log('\nClickable elements:', clickables);

console.log('\nBrowser staying open...');
await new Promise(() => {});
