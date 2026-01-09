import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false, devtools: true });
const page = await browser.newPage();

// Deep intercept
await page.addInitScript(() => {
  window.__handlerCalls = [];
  window.__lastError = null;

  // Wrap ALL click handlers to trace execution
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, handler, options) {
    if (type === 'click') {
      const wrappedHandler = function(event) {
        const startTime = performance.now();
        let result, error;

        try {
          result = handler.call(this, event);
        } catch (e) {
          error = e;
          window.__lastError = {
            message: e.message,
            stack: e.stack?.slice(0, 500),
          };
        }

        const endTime = performance.now();
        window.__handlerCalls.push({
          target: this.tagName + '.' + (this.className?.slice(0, 20) || ''),
          handlerSnippet: handler.toString().slice(0, 60),
          duration: endTime - startTime,
          hadError: !!error,
          errorMsg: error?.message,
        });

        if (error) throw error;
        return result;
      };
      return origAdd.call(this, type, wrappedHandler, options);
    }
    return origAdd.call(this, type, handler, options);
  };

  // Track if certain key functions are called
  window.__functionCalls = [];

  // Common dialog creation patterns
  ['createElement', 'appendChild', 'insertBefore'].forEach(fn => {
    const orig = document[fn] || Element.prototype[fn];
    if (orig) {
      const target = document[fn] ? document : Element.prototype;
      target[fn] = function(...args) {
        window.__functionCalls.push({ fn, time: performance.now() });
        return orig.apply(this, args);
      };
    }
  });
});

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('text=/start using photopea/i');
await page.waitForTimeout(2000);

// Clear logs
await page.evaluate(() => {
  window.__handlerCalls = [];
  window.__functionCalls = [];
  window.__lastError = null;
});

console.log('Clicking New Project and tracing handler execution...\n');
await page.click('text=/new project/i');
await page.waitForTimeout(2000);

const trace = await page.evaluate(() => ({
  handlers: window.__handlerCalls,
  lastError: window.__lastError,
  functionCallCount: window.__functionCalls.length,
}));

console.log('Handler calls:', trace.handlers.length);
trace.handlers.forEach((h, i) => {
  console.log(`\n${i}: ${h.target}`);
  console.log(`   Handler: ${h.handlerSnippet}...`);
  console.log(`   Duration: ${h.duration.toFixed(1)}ms`);
  if (h.hadError) {
    console.log(`   ERROR: ${h.errorMsg}`);
  }
});

console.log(`\nLast error: ${trace.lastError ? JSON.stringify(trace.lastError) : 'None'}`);
console.log(`Function calls after click: ${trace.functionCallCount}`);

// Check what the New Project button's handler looks like in more detail
const handlerInfo = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.bhover')].find(el =>
    el.textContent?.includes('New Project')
  );

  if (!btn) return { error: 'Button not found' };

  // Try to get event listeners (only works in some contexts)
  return {
    found: true,
    tag: btn.tagName,
    onclick: btn.onclick?.toString()?.slice(0, 100),
    className: btn.className,
    parentClass: btn.parentElement?.className,
  };
});

console.log('\nNew Project button info:', handlerInfo);

await new Promise(() => {});
