import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Deep trace of initialization
await page.addInitScript(() => {
  window.__initTrace = [];
  window.__clickHandlers = [];

  // Track when click handlers are added
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, handler, options) {
    if (type === 'click') {
      const stack = new Error().stack.split('\n').slice(2, 5).join(' <- ');
      window.__clickHandlers.push({
        target: this.tagName || this.constructor.name,
        className: this.className || '',
        stack: stack.slice(0, 200),
        time: performance.now(),
      });
    }
    return origAdd.call(this, type, handler, options);
  };

  // Track script execution
  const origEval = window.eval;
  window.eval = function(code) {
    window.__initTrace.push({ type: 'eval', len: code?.length, time: performance.now() });
    return origEval.call(this, code);
  };

  // Track when body gets children
  const origAppend = Element.prototype.appendChild;
  Element.prototype.appendChild = function(child) {
    if (this.tagName === 'BODY' && child.tagName === 'SCRIPT') {
      window.__initTrace.push({
        type: 'script',
        src: child.src?.slice(-50) || 'inline',
        time: performance.now(),
      });
    }
    return origAppend.call(this, child);
  };
});

console.log('Tracing initialization on REAL Photopea...');
await page.goto('https://www.photopea.com', { waitUntil: 'networkidle' });

// Wait for full init
await page.waitForTimeout(3000);

// Click start
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(3000);
} catch (e) {}

const trace = await page.evaluate(() => {
  return {
    clickHandlerCount: window.__clickHandlers.length,
    sampleHandlers: window.__clickHandlers.slice(0, 5),
    lastHandlers: window.__clickHandlers.slice(-5),
    initTrace: window.__initTrace.slice(0, 20),
  };
});

console.log('\n=== Click Handler Analysis ===');
console.log('Total click handlers:', trace.clickHandlerCount);
console.log('\nFirst 5 click handlers (early init):');
trace.sampleHandlers.forEach((h, i) => {
  console.log(`  ${i}: ${h.target}.${h.className.slice(0, 30)} @ ${h.time.toFixed(0)}ms`);
  console.log(`     Stack: ${h.stack.slice(0, 100)}`);
});

console.log('\nLast 5 click handlers (late init):');
trace.lastHandlers.forEach((h, i) => {
  console.log(`  ${i}: ${h.target}.${h.className.slice(0, 30)} @ ${h.time.toFixed(0)}ms`);
});

console.log('\nInit trace:');
trace.initTrace.forEach(t => console.log(`  ${t.type}: ${t.src || t.len} @ ${t.time?.toFixed(0)}ms`));

// Now compare with offline version
console.log('\n\n=== Comparing with OFFLINE version ===');

const page2 = await browser.newPage();
await page2.addInitScript(() => {
  window.__clickHandlers = [];
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, handler, options) {
    if (type === 'click') {
      window.__clickHandlers.push({
        target: this.tagName || this.constructor.name,
        className: this.className || '',
        time: performance.now(),
      });
    }
    return origAdd.call(this, type, handler, options);
  };
});

await page2.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page2.waitForTimeout(3000);

try {
  await page2.click('text=/start using photopea/i', { timeout: 3000 });
  await page2.waitForTimeout(3000);
} catch (e) {}

const offlineTrace = await page2.evaluate(() => ({
  clickHandlerCount: window.__clickHandlers.length,
  sampleHandlers: window.__clickHandlers.slice(0, 5),
}));

console.log('Offline click handlers:', offlineTrace.clickHandlerCount);
console.log('\nFirst 5 offline handlers:');
offlineTrace.sampleHandlers.forEach((h, i) => {
  console.log(`  ${i}: ${h.target}.${h.className.slice(0, 30)} @ ${h.time.toFixed(0)}ms`);
});

console.log('\n\n=== DIFFERENCE ===');
console.log(`Real: ${trace.clickHandlerCount} handlers`);
console.log(`Offline: ${offlineTrace.clickHandlerCount} handlers`);
console.log(`Missing: ${trace.clickHandlerCount - offlineTrace.clickHandlerCount} handlers`);

await new Promise(() => {});
