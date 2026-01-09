import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false, devtools: true });

// Test on REAL Photopea first to understand the flow
console.log('=== Tracing REAL Photopea "New Project" flow ===\n');

const page = await browser.newPage();

await page.addInitScript(() => {
  window.__trace = [];

  // Track DOM mutations (dialog creation)
  const observer = new MutationObserver(mutations => {
    mutations.forEach(m => {
      if (m.type === 'childList' && m.addedNodes.length > 0) {
        m.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            const text = node.textContent?.slice(0, 30);
            if (text?.includes('Width') || text?.includes('Height') ||
                text?.includes('Create') || text?.includes('New Project') ||
                node.className?.includes('dialog')) {
              window.__trace.push({
                type: 'DOM_ADD',
                tag: node.tagName,
                class: node.className?.slice(0, 30),
                text: text,
                time: performance.now(),
              });
            }
          }
        });
      }
    });
  });

  // Start observing after DOM is ready
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // Track function calls that might create dialogs
  const origAppendChild = Element.prototype.appendChild;
  Element.prototype.appendChild = function(child) {
    if (child.nodeType === 1) {
      const text = child.textContent?.slice(0, 20);
      if (text?.includes('Width') || text?.includes('Create') || text?.includes('New')) {
        window.__trace.push({
          type: 'appendChild',
          parent: this.className?.slice(0, 20),
          child: child.tagName + '.' + (child.className?.slice(0, 20) || ''),
          text,
          stack: new Error().stack.split('\n')[2]?.slice(0, 80),
          time: performance.now(),
        });
      }
    }
    return origAppendChild.call(this, child);
  };
});

await page.goto('https://www.photopea.com', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(2000);
} catch (e) {}

// Clear trace before clicking
await page.evaluate(() => window.__trace = []);

console.log('Clicking "New Project"...');
await page.click('text=/new project/i');
await page.waitForTimeout(2000);

const trace = await page.evaluate(() => window.__trace);
console.log(`\nCaptured ${trace.length} trace events:`);
trace.slice(0, 15).forEach(t => {
  console.log(`  ${t.type}: ${t.child || t.tag} @ ${t.time?.toFixed(0)}ms`);
  if (t.stack) console.log(`    Stack: ${t.stack}`);
});

// Check what dialog element was created
const dialogInfo = await page.evaluate(() => {
  const dialog = document.querySelector('[class*="New Project"], [class*="newproject"], .popup, .modal');
  if (!dialog) {
    // Try to find by content
    const allDivs = [...document.querySelectorAll('div')];
    const found = allDivs.find(d => d.textContent?.includes('Width') && d.textContent?.includes('Height'));
    if (found) {
      return {
        found: true,
        class: found.className,
        parent: found.parentElement?.className,
        grandparent: found.parentElement?.parentElement?.className,
      };
    }
  }
  return dialog ? { class: dialog.className } : { found: false };
});
console.log('\nDialog element:', dialogInfo);

// Now test OFFLINE
console.log('\n\n=== Testing OFFLINE version ===');
const page2 = await browser.newPage();

await page2.addInitScript(() => {
  window.__trace = [];
  window.__errors = [];

  // Catch any errors
  window.onerror = (msg, src, line) => {
    window.__errors.push({ msg, src, line });
  };

  // Track appendChild
  const origAppendChild = Element.prototype.appendChild;
  Element.prototype.appendChild = function(child) {
    if (child.nodeType === 1) {
      const text = child.textContent?.slice(0, 20);
      if (text?.includes('Width') || text?.includes('Create')) {
        window.__trace.push({ type: 'appendChild', text, time: performance.now() });
      }
    }
    return origAppendChild.call(this, child);
  };
});

await page2.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page2.waitForTimeout(3000);

try {
  await page2.click('text=/start using photopea/i', { timeout: 3000 });
  await page2.waitForTimeout(2000);
} catch (e) {}

await page2.evaluate(() => { window.__trace = []; window.__errors = []; });

console.log('Clicking "New Project" on offline...');
await page2.click('text=/new project/i');
await page2.waitForTimeout(2000);

const offlineTrace = await page2.evaluate(() => ({
  trace: window.__trace,
  errors: window.__errors,
}));

console.log(`\nOffline trace events: ${offlineTrace.trace.length}`);
offlineTrace.trace.forEach(t => console.log(`  ${t.type}: ${t.text}`));

console.log(`\nOffline errors: ${offlineTrace.errors.length}`);
offlineTrace.errors.forEach(e => console.log(`  ${e.msg} @ ${e.src}:${e.line}`));

await new Promise(() => {});
