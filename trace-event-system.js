import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Intercept event registration and dispatching
await page.addInitScript(() => {
  window.__eventRegistrations = [];
  window.__eventDispatches = [];
  window.__listenerCounts = {};

  // We'll patch the Q function (addEventListener equivalent) once it's defined
  const checkAndPatch = () => {
    // Look for objects with Q and aP properties (event emitters)
    if (window.__patched) return;

    // Try to find and patch prototype chain
    const origDefine = Object.defineProperty;
    Object.defineProperty = function(obj, prop, desc) {
      if (prop === 'Q' && desc.value && typeof desc.value === 'function') {
        const origQ = desc.value;
        desc.value = function(eventType, handler, ctx) {
          window.__eventRegistrations.push({
            eventType,
            handlerSnippet: handler?.toString()?.slice(0, 50),
            hasContext: !!ctx,
            time: performance.now(),
          });
          window.__listenerCounts[eventType] = (window.__listenerCounts[eventType] || 0) + 1;
          return origQ.call(this, eventType, handler, ctx);
        };
      }
      if (prop === 'K' && desc.value && typeof desc.value === 'function') {
        const origK = desc.value;
        desc.value = function(event) {
          window.__eventDispatches.push({
            eventType: event?.d,
            dataS: event?.data?.S,
            dataDm: event?.data?.Dm,
            bubbles: event?.bubbles,
            time: performance.now(),
          });
          return origK.call(this, event);
        };
      }
      return origDefine.call(this, obj, prop, desc);
    };
  };

  checkAndPatch();
});

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('text=/start using photopea/i');
await page.waitForTimeout(2000);

// Check listener counts
const beforeClick = await page.evaluate(() => ({
  registrations: window.__eventRegistrations?.length || 0,
  dispatches: window.__eventDispatches?.length || 0,
  listenerCounts: window.__listenerCounts || {},
}));

console.log('Before clicking New Project:');
console.log('  Event registrations:', beforeClick.registrations);
console.log('  Event dispatches:', beforeClick.dispatches);
console.log('  Listener counts by type:', beforeClick.listenerCounts);

// Clear dispatch log
await page.evaluate(() => window.__eventDispatches = []);

console.log('\nClicking New Project...');
await page.click('text=/new project/i');
await page.waitForTimeout(1000);

const afterClick = await page.evaluate(() => ({
  dispatches: window.__eventDispatches,
  lastDispatches: window.__eventDispatches?.slice(-10),
}));

console.log('\nEvent dispatches after click:', afterClick.dispatches?.length);
afterClick.lastDispatches?.forEach((d, i) => {
  console.log(`  ${i}: type=${d.eventType}, S=${d.dataS}, Dm=${d.dataDm}, bubbles=${d.bubbles}`);
});

// Try to manually trigger what should happen
console.log('\n\n=== Manual Event Test ===');
const manualTest = await page.evaluate(() => {
  // Try to find the event constants
  let result = { found: false };

  // Search for the _ object in any scope we can access
  try {
    // The constants are: _.E.b = "1", _.m.eh = "25"
    // Let's try creating a fake event and see if we can dispatch it

    // Find any element that might have the K method
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      // Check if element has a __reactInternalInstance or similar
      for (const key of Object.keys(el)) {
        if (key.startsWith('__')) {
          result.foundKey = key;
          break;
        }
      }
      if (result.foundKey) break;
    }
  } catch (e) {
    result.error = e.message;
  }

  return result;
});

console.log('Manual test result:', manualTest);

await new Promise(() => {});
