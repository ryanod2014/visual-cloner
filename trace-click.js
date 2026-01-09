import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false, devtools: true });
const page = await browser.newPage();

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Click start button
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(2000);
} catch (e) {}

// Set up debugging - intercept click on the button
await page.evaluate(() => {
  const btn = document.evaluate(
    "//*[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'open from computer')]",
    document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
  ).singleNodeValue;

  if (!btn) {
    console.log('Button not found!');
    return;
  }

  // Wrap click to trace it
  btn.addEventListener('click', function(e) {
    console.log('Click event fired on button');
    console.log('Event:', e.type, 'bubbles:', e.bubbles, 'cancelable:', e.cancelable);
    console.log('Target:', e.target.tagName, e.target.className);

    // Check if event propagation is being stopped
    const orig = e.stopPropagation;
    e.stopPropagation = function() {
      console.log('stopPropagation called!');
      orig.call(e);
    };
  }, true); // capture phase

  // Also monitor the file input
  const fileInput = document.querySelector('input[type="file"]');
  if (fileInput) {
    const origClick = fileInput.click;
    fileInput.click = function() {
      console.log('File input click() was called!');
      return origClick.call(this);
    };
  }
});

console.log('\nNow click "Open From Computer" in the browser...');
console.log('Watch the browser console for trace output.');
console.log('Press Ctrl+C to close');

await new Promise(() => {});
