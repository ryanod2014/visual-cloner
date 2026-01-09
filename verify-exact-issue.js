import { chromium } from 'playwright';

/**
 * Let's trace EXACTLY what's happening when the button is clicked
 * WITHOUT guessing - just pure observation
 */

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

console.log('Loading offline Photopea...');
await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Inject deep tracing into the page
await page.evaluate(() => {
  window.__trace = [];

  // Find and trace the aAM function
  window.addEventListener('load', () => {
    console.log('[TRACE] Page loaded, searching for aAM function...');

    // Try to find the main app object
    for (const key in window) {
      const obj = window[key];
      if (obj && typeof obj === 'object') {
        // Look for prototype with aAM
        const proto = obj.constructor?.prototype;
        if (proto && proto.aAM) {
          console.log('[TRACE] Found aAM on:', key);

          // Wrap aAM to see if it's called
          const original = proto.aAM;
          proto.aAM = function(z) {
            console.log('[TRACE] aAM CALLED!');
            console.log('[TRACE] this.ak6 =', this.ak6);
            console.log('[TRACE] z.data =', z.data);

            // Call original
            const result = original.call(this, z);

            console.log('[TRACE] aAM returned:', result);
            return result;
          };
        }
      }
    }
  });
});

await page.click('text=/start using photopea/i');
await page.waitForTimeout(2000);

console.log('\n=== Clicking "New Project" ===\n');

// Capture console before click
const consoleLogs = [];
page.on('console', msg => {
  const text = msg.text();
  if (text.includes('[TRACE]')) {
    consoleLogs.push(text);
    console.log('[browser]', text);
  }
});

await page.click('text=/new project/i');
await page.waitForTimeout(2000);

// Now let's directly inspect the app state
const inspection = await page.evaluate(() => {
  const results = {
    ak6Found: false,
    ak6Value: null,
    locationHostname: window.location.hostname,
    objectsWithAk6: [],
  };

  // Search through window for objects with ak6 property
  for (const key in window) {
    try {
      const obj = window[key];
      if (obj && typeof obj === 'object' && 'ak6' in obj) {
        results.objectsWithAk6.push({
          key,
          ak6: obj.ak6,
          type: obj.constructor?.name,
        });
        results.ak6Found = true;
        results.ak6Value = obj.ak6;
      }
    } catch (e) {}
  }

  return results;
});

console.log('\n=== Direct Inspection ===');
console.log('Location hostname:', inspection.locationHostname);
console.log('Found objects with ak6:', inspection.objectsWithAk6.length);
inspection.objectsWithAk6.forEach(obj => {
  console.log(`  - ${obj.key}: ak6 = ${obj.ak6} (${obj.type})`);
});

console.log('\n=== Console Logs ===');
console.log('Total trace logs:', consoleLogs.length);

// Check if dialog appeared
const dialogAppeared = await page.evaluate(() => {
  const inputs = document.querySelectorAll('input');
  for (const input of inputs) {
    if (input.offsetParent !== null) {
      const text = (input.previousSibling?.textContent || '').toLowerCase();
      if (text.includes('width')) return true;
    }
  }
  return false;
});

console.log('\n=== Result ===');
console.log('Dialog appeared:', dialogAppeared);
console.log('aAM was called:', consoleLogs.some(log => log.includes('aAM CALLED')));
console.log('ak6 flag exists:', inspection.ak6Found);
console.log('ak6 value:', inspection.ak6Value);

if (inspection.ak6Value === true) {
  console.log('\n🔍 CONFIRMED: ak6 is TRUE, which blocks the handler');
} else if (inspection.ak6Value === false) {
  console.log('\n🤔 UNEXPECTED: ak6 is FALSE, so handler should work');
} else {
  console.log('\n⚠️  Could not find ak6 flag');
}

console.log('\n\nBrowser staying open...');
await new Promise(() => {});
