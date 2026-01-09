import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Check event delegation AFTER page loads
await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('text=/start using photopea/i');
await page.waitForTimeout(2000);

// Analyze event listeners on document and key elements
const listenerInfo = await page.evaluate(() => {
  const results = {
    documentClick: [],
    bodyClick: [],
    buttonClick: [],
  };

  // Chrome DevTools API (only in devtools context - won't work in page context)
  // But we can check _eventListeners property or use MutationObserver tricks

  // Find the New Project button
  const btn = [...document.querySelectorAll('.bhover')].find(el =>
    el.textContent?.includes('New Project')
  );

  if (btn) {
    results.buttonInfo = {
      hasOnclick: !!btn.onclick,
      eventListenerCount: 'unknown (no API access)',
      parentChain: [],
    };

    // Check parent chain for potential delegation
    let el = btn;
    while (el && results.buttonInfo.parentChain.length < 8) {
      results.buttonInfo.parentChain.push({
        tag: el.tagName,
        class: el.className?.slice(0, 30),
        hasOnclick: !!el.onclick,
        id: el.id,
      });
      el = el.parentElement;
    }
  }

  return results;
});

console.log('Listener info:');
console.log(JSON.stringify(listenerInfo, null, 2));

// Now intercept ALL click events at capture phase on document
await page.evaluate(() => {
  window.__clickChain = [];

  document.addEventListener('click', (e) => {
    window.__clickChain.push({
      phase: 'capture',
      target: e.target.tagName + '.' + (e.target.className?.slice(0, 20) || ''),
      currentTarget: e.currentTarget?.tagName,
      eventPhase: e.eventPhase,
      path: e.composedPath().slice(0, 5).map(el => el.tagName || 'WINDOW'),
    });
  }, true);

  document.addEventListener('click', (e) => {
    window.__clickChain.push({
      phase: 'bubble',
      target: e.target.tagName + '.' + (e.target.className?.slice(0, 20) || ''),
    });
  }, false);
});

console.log('\nClicking New Project and watching event flow...');
await page.click('text=/new project/i');
await page.waitForTimeout(1000);

const clickChain = await page.evaluate(() => window.__clickChain);
console.log('\nClick event chain:');
clickChain.forEach(c => console.log(JSON.stringify(c)));

// Check if Photopea has a global event bus or dispatcher
const globalState = await page.evaluate(() => {
  const globals = [];

  // Look for common patterns
  ['_', '$', 'app', 'App', 'Photopea', 'PP', 'ps', 'EventBus', 'dispatcher'].forEach(name => {
    try {
      const val = window[name];
      if (val && typeof val === 'object') {
        globals.push({
          name,
          type: typeof val,
          hasOn: typeof val.on === 'function',
          hasEmit: typeof val.emit === 'function',
          hasTrigger: typeof val.trigger === 'function',
          hasDispatch: typeof val.dispatch === 'function',
          keys: Object.keys(val).slice(0, 10),
        });
      }
    } catch (e) {}
  });

  return globals;
});

console.log('\nGlobal event-related objects:');
globalState.forEach(g => console.log(JSON.stringify(g)));

await new Promise(() => {});
