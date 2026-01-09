import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Intercept click handling
await page.addInitScript(() => {
  window.__clickLog = [];

  // Monitor actual click events
  document.addEventListener('click', (e) => {
    window.__clickLog.push({
      phase: 'capture-doc',
      target: e.target.tagName + '.' + (e.target.className || '').slice(0, 30),
      defaultPrevented: e.defaultPrevented,
      time: performance.now(),
    });
  }, true);

  document.addEventListener('click', (e) => {
    window.__clickLog.push({
      phase: 'bubble-doc',
      target: e.target.tagName + '.' + (e.target.className || '').slice(0, 30),
      defaultPrevented: e.defaultPrevented,
    });
  }, false);

  // Monitor if handlers are actually called
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, handler, options) {
    if (type === 'click') {
      const wrappedHandler = function(e) {
        window.__clickLog.push({
          phase: 'handler-called',
          target: this.tagName + '.' + (this.className || '').slice(0, 30),
          handlerStart: handler.toString().slice(0, 50),
        });
        return handler.call(this, e);
      };
      return origAdd.call(this, type, wrappedHandler, options);
    }
    return origAdd.call(this, type, handler, options);
  };
});

console.log('Testing clicks on OFFLINE version...');
await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Click start
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(3000);
} catch (e) {}

// Clear log
await page.evaluate(() => window.__clickLog = []);

// Try clicking the brush tool (usually in left sidebar)
console.log('\nClicking on brush tool area...');

// Get the left toolbar
const toolbarInfo = await page.evaluate(() => {
  const sidebar = document.querySelector('.panelblock.mainblock');
  const icons = sidebar?.querySelectorAll('div[style*="cursor"]') || [];
  return {
    sidebarFound: !!sidebar,
    clickableIcons: icons.length,
    firstIcon: icons[0]?.outerHTML?.slice(0, 100),
  };
});
console.log('Toolbar info:', toolbarInfo);

// Click on the sidebar area where brush should be
await page.click('.panelblock.mainblock >> nth=0', { position: { x: 20, y: 100 } });
await page.waitForTimeout(500);

const clickLog = await page.evaluate(() => window.__clickLog);
console.log('\nClick log:');
clickLog.forEach(log => console.log(' ', JSON.stringify(log)));

// Now try on REAL Photopea
console.log('\n\n=== Testing on REAL Photopea ===');
const page2 = await browser.newPage();
await page2.addInitScript(() => {
  window.__clickLog = [];
  document.addEventListener('click', (e) => {
    window.__clickLog.push({
      phase: 'capture-doc',
      target: e.target.tagName + '.' + (e.target.className || '').slice(0, 30),
    });
  }, true);
});

await page2.goto('https://www.photopea.com', { waitUntil: 'networkidle' });
await page2.waitForTimeout(3000);

try {
  await page2.click('text=/start using photopea/i', { timeout: 3000 });
  await page2.waitForTimeout(3000);
} catch (e) {}

await page2.evaluate(() => window.__clickLog = []);
await page2.click('.panelblock.mainblock >> nth=0', { position: { x: 20, y: 100 } });
await page2.waitForTimeout(500);

const realClickLog = await page2.evaluate(() => window.__clickLog);
console.log('\nReal Photopea click log:');
realClickLog.forEach(log => console.log(' ', JSON.stringify(log)));

// Compare DOM structure
console.log('\n=== Comparing DOM structure ===');
const offlineStructure = await page.evaluate(() => {
  const sidebar = document.querySelector('.panelblock.mainblock');
  return sidebar?.innerHTML?.slice(0, 500);
});

const realStructure = await page2.evaluate(() => {
  const sidebar = document.querySelector('.panelblock.mainblock');
  return sidebar?.innerHTML?.slice(0, 500);
});

console.log('\nOffline sidebar HTML:');
console.log(offlineStructure?.slice(0, 300));
console.log('\nReal sidebar HTML:');
console.log(realStructure?.slice(0, 300));

await new Promise(() => {});
