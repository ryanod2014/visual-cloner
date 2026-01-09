import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => {
  const text = msg.text();
  if (text.includes('[TRACE]') || text.includes('[LISTENER]')) {
    console.log('[browser]', text);
  }
});

// First, let's modify the serve-debug.js to capture aP listeners
// For now, let's inject additional tracking into the page

await page.addInitScript(() => {
  window.__listenersByComponent = [];
  window.__eventPath = [];
});

console.log('Loading debug server at http://localhost:3334...');
await page.goto('http://localhost:3334', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

console.log('\nClicking "Start using Photopea"...');
await page.click('text=/start using photopea/i');
await page.waitForTimeout(3000);

// Inject listener inspection before clicking
await page.evaluate(() => {
  // Find objects with aP property (listener storage)
  window.__findAP = (obj, path = '', depth = 0) => {
    if (depth > 5 || !obj || typeof obj !== 'object') return [];
    const results = [];

    if (obj.aP && typeof obj.aP === 'object') {
      const listenerTypes = Object.keys(obj.aP);
      if (listenerTypes.length > 0) {
        results.push({
          path,
          listenerTypes,
          listenerCounts: listenerTypes.map(t => [t, obj.aP[t]?.length || 0]),
        });
      }
    }

    return results;
  };
});

console.log('\n=== Examining listener registration ===');

// Look at what's happening when the event propagates
// We need to modify the K function to log the aP state
await page.evaluate(() => {
  // The K function logs z.d (event type) and checks this.aP[z.d]
  // Event type "1" with S=25 and Dm="newproject" should trigger dialog

  // Let's check: what handler at the TOP of the hierarchy handles this event?
  window.__traceEvent = [];
});

console.log('\nClicking "New Project" and tracing listener lookups...');

// Click and watch
await page.click('text=/new project/i');
await page.waitForTimeout(2000);

// Now let's analyze the captured K calls
const analysis = await page.evaluate(() => {
  const result = {
    kCallsWithListenerInfo: [],
  };

  // The k calls have been captured by our patched code
  // But we need to see what's in aP at each level

  // Let's do a different approach: find the home screen component
  // and manually check its parent chain

  // Search for elements with aP
  const allObjects = [];

  // Check window for any exposed objects
  for (const key of Object.keys(window)) {
    try {
      const obj = window[key];
      if (obj && typeof obj === 'object' && obj.aP) {
        allObjects.push({
          key,
          aPKeys: Object.keys(obj.aP),
        });
      }
    } catch (e) {}
  }

  result.windowObjectsWithAP = allObjects;

  return result;
});

console.log('\nWindow objects with aP:', analysis.windowObjectsWithAP);

// Let's check the real Photopea to see the difference
console.log('\n\n=== Comparing with REAL Photopea ===');
const page2 = await browser.newPage();
await page2.goto('https://www.photopea.com', { waitUntil: 'networkidle' });
await page2.waitForTimeout(2000);
await page2.click('text=/start using photopea/i');
await page2.waitForTimeout(3000);

// Check window objects on real version
const realAnalysis = await page2.evaluate(() => {
  const allObjects = [];
  for (const key of Object.keys(window)) {
    try {
      const obj = window[key];
      if (obj && typeof obj === 'object' && obj.aP) {
        allObjects.push({
          key,
          aPKeys: Object.keys(obj.aP),
        });
      }
    } catch (e) {}
  }
  return { windowObjectsWithAP: allObjects };
});

console.log('Real Photopea window objects with aP:', realAnalysis.windowObjectsWithAP);

// The aP is likely in closure scope, not window
// Let's try a different approach: inject into the actual K function to dump aP

console.log('\n\n=== Key insight needed ===');
console.log('The event IS propagating correctly (d=1, S=25, Dm=newproject)');
console.log('But no handler is responding to it.');
console.log('');
console.log('Possible causes:');
console.log('1. The listener is never registered in the first place');
console.log('2. The listener IS registered but looks for different event data');
console.log('3. There is a missing initialization step');

await new Promise(() => {});
