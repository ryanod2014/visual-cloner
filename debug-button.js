import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => console.log('[browser]', msg.text()));

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Click start
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(3000);
} catch (e) {}

// Check what buttons exist
const buttons = await page.evaluate(() => {
  const results = [];
  const bhovers = document.querySelectorAll('.bhover');
  bhovers.forEach((btn, i) => {
    results.push({
      index: i,
      text: btn.textContent.slice(0, 50),
      hasOpenComputer: btn.textContent.toLowerCase().includes('open from computer'),
    });
  });
  return results;
});

console.log('Bhover buttons found:', buttons);

// Try alternate approach - find by visible text
const byText = await page.evaluate(() => {
  const el = [...document.querySelectorAll('*')].find(e =>
    e.textContent.toLowerCase().includes('open from computer') &&
    e.textContent.length < 100
  );
  return el ? {
    tag: el.tagName,
    class: el.className,
    text: el.textContent.slice(0, 50)
  } : null;
});

console.log('\nElement with "Open From Computer" text:', byText);

// Now try to manually wire up the click
await page.evaluate(() => {
  // Find the button more directly
  const spans = document.querySelectorAll('span');
  for (const span of spans) {
    if (span.textContent.toLowerCase().includes('open from computer')) {
      console.log('Found button:', span.outerHTML.slice(0, 200));

      // Add click handler
      span.addEventListener('click', function(e) {
        console.log('Patch click handler fired!');
        e.stopPropagation();

        const fileInput = document.querySelector('input[type="file"]');
        console.log('File input:', fileInput ? 'exists' : 'missing');
        if (fileInput) {
          fileInput.click();
          console.log('Clicked file input!');
        }
      }, true); // capture phase

      console.log('Added patch click handler');
      break;
    }
  }
});

// Now try clicking
console.log('\nTrying to click button...');
const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
await page.click('text=/open from computer/i');
const chooser = await chooserPromise;

if (chooser) {
  console.log('✅ File chooser opened!');
} else {
  console.log('❌ File chooser did NOT open');
}

console.log('\nBrowser staying open...');
await new Promise(() => {});
