import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

const diagnostics = {
  networkAttempts: [],
  errors: [],
};

// Inject diagnostics
await page.addInitScript(() => {
  window.__diagnostics = { networkAttempts: [] };

  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '[object]';
    window.__diagnostics.networkAttempts.push({
      type: 'fetch',
      url,
      stack: new Error().stack.split('\n')[2], // Caller location
    });
    return originalFetch(...args);
  };

  const originalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new originalXHR();
    const originalOpen = xhr.open;
    xhr.open = function(method, url) {
      window.__diagnostics.networkAttempts.push({
        type: 'xhr',
        method,
        url,
        stack: new Error().stack.split('\n')[2],
      });
      return originalOpen.apply(this, arguments);
    };
    return xhr;
  };
});

page.on('console', msg => {
  if (msg.type() === 'error') {
    diagnostics.errors.push(msg.text());
  }
});

console.log('Loading offline Photopea...');
await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

await page.click('text=/start using photopea/i');
await page.waitForTimeout(2000);

// Clear network attempts before the action
await page.evaluate(() => { window.__diagnostics.networkAttempts = []; });

console.log('\nClicking "New Project"...');
await page.click('text=/new project/i');
await page.waitForTimeout(2000);

// Check if dialog appeared
const dialogCheck = await page.evaluate(() => {
  // Look for visible input fields with "width" or "height" nearby
  const inputs = document.querySelectorAll('input');
  let widthInput = null;
  let heightInput = null;

  for (const input of inputs) {
    if (input.offsetParent !== null) { // visible
      const label = input.previousSibling?.textContent?.toLowerCase() || '';
      const placeholder = input.placeholder?.toLowerCase() || '';
      const nearby = label + placeholder;

      if (nearby.includes('width')) widthInput = input;
      if (nearby.includes('height')) heightInput = input;
    }
  }

  return {
    dialogAppeared: !!(widthInput && heightInput),
    visibleInputs: Array.from(inputs).filter(i => i.offsetParent !== null).length,
    widthInput: !!widthInput,
    heightInput: !!heightInput,
  };
});

const networkAttempts = await page.evaluate(() => window.__diagnostics.networkAttempts);

console.log('\n=== RESULTS ===');
console.log('\nDialog appeared:', dialogCheck.dialogAppeared);
console.log('Visible inputs:', dialogCheck.visibleInputs);
console.log('Width input:', dialogCheck.widthInput);
console.log('Height input:', dialogCheck.heightInput);

console.log('\n=== Network Attempts During Click ===');
console.log(`Total: ${networkAttempts.length}`);

if (networkAttempts.length > 0) {
  // Categorize network requests
  const requiredRequests = networkAttempts.filter(req =>
    !req.url.includes('doubleclick') &&
    !req.url.includes('google') &&
    !req.url.includes('uniconsent') &&
    !req.url.includes('adsbygoogle')
  );

  const optionalRequests = networkAttempts.filter(req =>
    req.url.includes('doubleclick') ||
    req.url.includes('google') ||
    req.url.includes('uniconsent') ||
    req.url.includes('adsbygoogle')
  );

  console.log(`\nRequired requests: ${requiredRequests.length}`);
  requiredRequests.forEach((req, i) => {
    console.log(`  ${i + 1}. ${req.type.toUpperCase()}: ${req.url}`);
    console.log(`     Called from: ${req.stack}`);
  });

  console.log(`\nOptional requests (ads/analytics): ${optionalRequests.length}`);
  optionalRequests.forEach((req, i) => {
    console.log(`  ${i + 1}. ${req.type.toUpperCase()}: ${req.url}`);
  });
}

// Key distinction
console.log('\n=== DIAGNOSIS ===');
if (!dialogCheck.dialogAppeared && networkAttempts.length === 0) {
  console.log('❌ Dialog failed to appear, NO network requests');
  console.log('→ This is an EXTRACTION ISSUE (missing resources or initialization)');
} else if (!dialogCheck.dialogAppeared && networkAttempts.length > 0) {
  const required = networkAttempts.filter(req =>
    !req.url.includes('doubleclick') &&
    !req.url.includes('google') &&
    !req.url.includes('uniconsent') &&
    !req.url.includes('adsbygoogle')
  );
  if (required.length > 0) {
    console.log('❌ Dialog failed to appear, WITH required network requests');
    console.log('→ This is a BACKEND API DEPENDENCY');
    console.log('→ The following requests are blocking functionality:');
    required.forEach(req => console.log(`   - ${req.url}`));
  } else {
    console.log('❌ Dialog failed to appear, only optional network requests');
    console.log('→ This is an EXTRACTION ISSUE (network requests are just ads)');
  }
} else {
  console.log('✅ Dialog appeared successfully!');
  if (networkAttempts.length > 0) {
    console.log('→ Network requests are happening but NOT blocking functionality');
  }
}

console.log('\n\nBrowser staying open...');
await new Promise(() => {});
