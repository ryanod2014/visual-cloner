import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Intercept before page loads
await page.addInitScript(() => {
  window.__callLog = [];
  window.__errorLog = [];

  // Catch all errors
  window.addEventListener('error', e => {
    window.__errorLog.push({
      msg: e.message,
      file: e.filename?.slice(-50),
      line: e.lineno,
    });
  });

  // Track when appendChild is called (UI creation)
  const origAppend = Element.prototype.appendChild;
  Element.prototype.appendChild = function(child) {
    if (child.nodeType === 1 && child.tagName !== 'SCRIPT') {
      window.__callLog.push({
        type: 'appendChild',
        parent: this.className?.slice(0, 20) || this.tagName,
        child: child.tagName + '.' + (child.className?.slice(0, 15) || ''),
        time: performance.now(),
      });
    }
    return origAppend.call(this, child);
  };

  // Track any function that looks like dialog creation
  const origSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    if (name === 'class' && value?.includes('window')) {
      window.__callLog.push({
        type: 'setClass-window',
        tag: this.tagName,
        value: value.slice(0, 30),
      });
    }
    return origSetAttribute.call(this, name, value);
  };
});

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Click start
await page.click('text=/start using photopea/i');
await page.waitForTimeout(2000);

// Clear logs
await page.evaluate(() => {
  window.__callLog = [];
  window.__errorLog = [];
});

console.log('Clicking New Project...');

// Also capture console output
page.on('console', msg => {
  if (msg.type() === 'error' || msg.text().includes('Error')) {
    console.log('[CONSOLE]', msg.text().slice(0, 100));
  }
});

await page.click('text=/new project/i');
await page.waitForTimeout(2000);

const logs = await page.evaluate(() => ({
  calls: window.__callLog.slice(0, 30),
  errors: window.__errorLog,
  totalCalls: window.__callLog.length,
}));

console.log(`\nTotal appendChild calls after click: ${logs.totalCalls}`);
console.log('\nFirst 30 calls:');
logs.calls.forEach(c => {
  console.log(`  ${c.type}: ${c.parent} <- ${c.child} @ ${c.time?.toFixed(0)}ms`);
});

console.log('\nErrors:', logs.errors.length);
logs.errors.forEach(e => console.log(`  ${e.msg} @ ${e.file}:${e.line}`));

// Compare with real Photopea
console.log('\n\n=== Comparing with REAL Photopea ===');
const page2 = await browser.newPage();
await page2.addInitScript(() => {
  window.__callLog = [];
  const origAppend = Element.prototype.appendChild;
  Element.prototype.appendChild = function(child) {
    if (child.nodeType === 1 && child.tagName !== 'SCRIPT') {
      window.__callLog.push({
        parent: this.className?.slice(0, 20) || this.tagName,
        child: child.tagName + '.' + (child.className?.slice(0, 15) || ''),
      });
    }
    return origAppend.call(this, child);
  };
});

await page2.goto('https://www.photopea.com', { waitUntil: 'networkidle' });
await page2.waitForTimeout(2000);
await page2.click('text=/start using photopea/i');
await page2.waitForTimeout(2000);
await page2.evaluate(() => window.__callLog = []);
await page2.click('text=/new project/i');
await page2.waitForTimeout(2000);

const realLogs = await page2.evaluate(() => ({
  totalCalls: window.__callLog.length,
  calls: window.__callLog.slice(0, 30),
}));

console.log(`Real Photopea: ${realLogs.totalCalls} appendChild calls`);
console.log('First 30:');
realLogs.calls.forEach(c => console.log(`  ${c.parent} <- ${c.child}`));

console.log(`\n\n=== COMPARISON ===`);
console.log(`Offline: ${logs.totalCalls} calls`);
console.log(`Real: ${realLogs.totalCalls} calls`);
console.log(`Difference: ${realLogs.totalCalls - logs.totalCalls} missing calls`);

await new Promise(() => {});
