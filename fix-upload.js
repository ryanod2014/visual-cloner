import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Inject a patch BEFORE the page loads
await page.addInitScript(() => {
  // Monitor when file input is created
  const origCreateElement = document.createElement.bind(document);
  document.createElement = function(tag) {
    const el = origCreateElement(tag);
    if (tag.toLowerCase() === 'input') {
      setTimeout(() => {
        if (el.type === 'file') {
          console.log('File input created!', el);
          // Store reference globally so we can find it
          window.__fileInputs = window.__fileInputs || [];
          window.__fileInputs.push(el);
        }
      }, 0);
    }
    return el;
  };
});

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Click start
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(2000);
} catch (e) {}

// Check file inputs created
const fileInputCount = await page.evaluate(() => (window.__fileInputs || []).length);
console.log('File inputs created:', fileInputCount);

// Get info about the file input
const inputInfo = await page.evaluate(() => {
  const input = document.querySelector('input[type="file"]');
  if (!input) return { error: 'No file input found' };

  // Try to find click handler
  const events = {};
  try {
    // Check if using onclick
    events.onclick = !!input.onclick;
    // Try jQuery-style
    events.hasJQuery = typeof jQuery !== 'undefined';
  } catch (e) {}

  return {
    exists: true,
    id: input.id,
    name: input.name,
    parent: input.parentElement?.className,
    events
  };
});
console.log('File input info:', inputInfo);

// Test: manually trigger file open
console.log('\nTrying to manually open file dialog...');

// Method 1: Direct call on file input (works as we confirmed)
// Let's try creating a NEW file input and triggering it
const result = await page.evaluate(() => {
  // Create temp file input
  const input = document.createElement('input');
  input.type = 'file';
  input.style.display = 'none';
  input.accept = 'image/*';
  document.body.appendChild(input);

  // Listen for change
  input.onchange = function(e) {
    console.log('File selected!', e.target.files);
    // TODO: Would need to feed to Photopea
  };

  // Click it
  input.click();
  return 'Created and clicked temp file input';
});
console.log(result);

// Set up file chooser handler
page.on('filechooser', async chooser => {
  console.log('File chooser opened!');
  // You could auto-select a file here
  // await chooser.setFiles('/path/to/image.png');
});

console.log('\nA file dialog should have opened.');
console.log('If so, our workaround is to inject our own file input.');
console.log('\nBrowser staying open...');
await new Promise(() => {});
