import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false, devtools: true });
const page = await browser.newPage();

// Intercept and analyze event system BEFORE page loads
await page.addInitScript(() => {
  window.__eventLog = [];
  window.__listeners = new Map();

  // Track all addEventListener calls
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, handler, options) {
    const entry = {
      target: this.constructor.name,
      type,
      handler: handler.toString().slice(0, 100),
    };
    window.__eventLog.push(entry);

    if (!window.__listeners.has(this)) {
      window.__listeners.set(this, []);
    }
    window.__listeners.get(this).push({ type, handler });

    return origAdd.call(this, type, handler, options);
  };

  // Track custom event dispatching
  const origDispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function(event) {
    if (event.type !== 'message') { // Skip noisy events
      window.__eventLog.push({
        action: 'dispatch',
        target: this.constructor.name,
        type: event.type,
        detail: event.detail ? JSON.stringify(event.detail).slice(0, 100) : null,
      });
    }
    return origDispatch.call(this, event);
  };

  // Track any global app initialization
  window.__appInit = [];
  Object.defineProperty(window, 'app', {
    set(v) {
      window.__appInit.push({ type: 'app set', value: typeof v });
      window._app = v;
    },
    get() { return window._app; }
  });

  Object.defineProperty(window, 'Photopea', {
    set(v) {
      window.__appInit.push({ type: 'Photopea set', value: typeof v });
      window._Photopea = v;
    },
    get() { return window._Photopea; }
  });
});

console.log('Loading REAL Photopea to analyze event system...');
await page.goto('https://www.photopea.com', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

// Click start
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(3000);
} catch (e) {}

// Analyze what we captured
const analysis = await page.evaluate(() => {
  const result = {
    totalListeners: window.__eventLog.filter(e => e.type).length,
    eventTypes: {},
    appInit: window.__appInit,
    globalObjects: [],
  };

  // Count event types
  window.__eventLog.forEach(e => {
    if (e.type) {
      result.eventTypes[e.type] = (result.eventTypes[e.type] || 0) + 1;
    }
  });

  // Check for global objects
  ['app', 'Photopea', 'PP', 'ps', 'pea', '_', 'J'].forEach(name => {
    if (window[name]) {
      result.globalObjects.push({
        name,
        type: typeof window[name],
        keys: Object.keys(window[name]).slice(0, 10),
      });
    }
  });

  return result;
});

console.log('\n=== Event System Analysis ===');
console.log('Total event listeners registered:', analysis.totalListeners);
console.log('\nTop event types:');
const sorted = Object.entries(analysis.eventTypes).sort((a, b) => b[1] - a[1]).slice(0, 15);
sorted.forEach(([type, count]) => console.log(`  ${type}: ${count}`));

console.log('\nGlobal app objects:');
analysis.globalObjects.forEach(obj => {
  console.log(`  ${obj.name} (${obj.type}): ${obj.keys.join(', ')}`);
});

console.log('\nApp initialization events:', analysis.appInit);

// Now try clicking a tool and see what happens
console.log('\n=== Testing Tool Click ===');
const toolResult = await page.evaluate(() => {
  // Find brush tool (or any tool)
  const tools = document.querySelectorAll('[class*="tool"]');
  const clickLogs = [];

  // Monitor what happens on click
  const origDispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function(event) {
    clickLogs.push({
      type: event.type,
      target: this.constructor?.name,
      detail: event.detail,
    });
    return origDispatch.call(this, event);
  };

  // Click first tool-like element
  const sidebar = document.querySelector('.panelblock');
  if (sidebar) {
    const icons = sidebar.querySelectorAll('div');
    if (icons[5]) {
      icons[5].click();
    }
  }

  return {
    toolsFound: tools.length,
    clickLogs: clickLogs.slice(0, 10),
  };
});

console.log('Tools found:', toolResult.toolsFound);
console.log('Click events:', toolResult.clickLogs);

console.log('\nBrowser staying open for manual inspection...');
console.log('Check DevTools > Console for more details');
await new Promise(() => {});
