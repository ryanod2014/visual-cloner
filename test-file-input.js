import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Click start button
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(2000);
} catch (e) {}

// Try to find and directly click the hidden file input
console.log('Looking for hidden file input...');

// Check what event listeners exist on the button
const eventInfo = await page.evaluate(() => {
  // Find the span
  const span = document.evaluate(
    "//*[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'open from computer')]",
    document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
  ).singleNodeValue;

  // Find hidden file input
  const fileInput = document.querySelector('input[type="file"]');

  // Check if there's a relationship
  return {
    spanHTML: span?.outerHTML?.slice(0, 200),
    fileInputParent: fileInput?.parentElement?.className,
    fileInputGrandparent: fileInput?.parentElement?.parentElement?.className,
    // Try to find what handles clicks
    documentHasClickHandler: !!document.onclick,
    bodyHasClickHandler: !!document.body.onclick,
  };
});

console.log('Event info:', JSON.stringify(eventInfo, null, 2));

// Try setting up file chooser and manually triggering click on hidden input
console.log('\nTrying to trigger file input directly...');

const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);

// Click the hidden input directly using JavaScript
await page.evaluate(() => {
  const input = document.querySelector('input[type="file"]');
  if (input) {
    console.log('Found input, clicking...');
    input.click();
  }
});

const chooser = await fileChooserPromise;
if (chooser) {
  console.log('✅ File chooser opened by direct click!');
} else {
  console.log('❌ File chooser did NOT open');

  // Check if maybe the input needs special activation
  console.log('\nTrying with dispatchEvent...');

  const fileChooserPromise2 = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);

  await page.evaluate(() => {
    const input = document.querySelector('input[type="file"]');
    if (input) {
      input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  });

  const chooser2 = await fileChooserPromise2;
  if (chooser2) {
    console.log('✅ File chooser opened by dispatchEvent!');
  } else {
    console.log('❌ dispatchEvent also failed');
  }
}

// Check if there are any JS errors about missing functions
console.log('\nChecking what code handles the button click...');

await page.evaluate(() => {
  const span = document.evaluate(
    "//*[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'open from computer')]",
    document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
  ).singleNodeValue;

  // Try to capture click event
  if (span) {
    console.log('Span parent chain:');
    let el = span;
    for (let i = 0; i < 5 && el; i++) {
      console.log(`  ${i}: ${el.tagName}.${el.className || '(no class)'} onclick=${!!el.onclick}`);
      el = el.parentElement;
    }
  }
});

console.log('\nBrowser staying open...');
await new Promise(() => {});
