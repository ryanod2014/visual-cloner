import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });

// Test OFFLINE version first
console.log('=== TESTING OFFLINE VERSION (port 3335) ===\n');
const offlinePage = await browser.newPage();

let offlineRegs = [];
offlinePage.on('console', msg => {
  const text = msg.text();
  if (text.includes('[REG]')) {
    offlineRegs.push(text);
    console.log('[offline]', text);
  }
  if (text.includes('[K]') && text.includes('newproject')) {
    console.log('[offline]', text);
  }
});

await offlinePage.goto('http://localhost:3335', { waitUntil: 'networkidle' });
await offlinePage.waitForTimeout(2000);
await offlinePage.click('text=/start using photopea/i');
await offlinePage.waitForTimeout(3000);

// Count registrations for event type "1"
const offlineRegCount = await offlinePage.evaluate(() => {
  const regs = window.__listenerRegistrations || [];
  return {
    total: regs.length,
    type1: regs.filter(r => r.eventType === "1" || r.eventType === 1).length,
    type1Handlers: regs.filter(r => r.eventType === "1" || r.eventType === 1).map(r => ({
      component: r.componentType,
      handler: r.handlerSnippet?.slice(0, 60),
    })),
  };
});

console.log(`\nOffline listener registrations: ${offlineRegCount.total} total, ${offlineRegCount.type1} for type "1"`);

// Now click New Project
console.log('\n--- Clicking New Project (offline) ---');
await offlinePage.click('text=/new project/i');
await offlinePage.waitForTimeout(2000);

const offlineKCalls = await offlinePage.evaluate(() => {
  return (window.__kCalls || []).filter(c => c.Dm === 'newproject');
});

console.log('\nOffline K calls for newproject:');
offlineKCalls.forEach((c, i) => {
  console.log(`  ${i}: listeners=${c.listenerCount}, type=${c.componentType}`);
});


// Now test REAL Photopea
console.log('\n\n=== TESTING REAL PHOTOPEA ===\n');

// We can't patch the real Photopea's JS, but we can compare behavior
const realPage = await browser.newPage();
await realPage.goto('https://www.photopea.com', { waitUntil: 'networkidle' });
await realPage.waitForTimeout(2000);
await realPage.click('text=/start using photopea/i');
await realPage.waitForTimeout(3000);

// Check if dialog appears when clicking New Project on real site
console.log('--- Clicking New Project (real) ---');
await realPage.click('text=/new project/i');
await realPage.waitForTimeout(2000);

const realDialogCheck = await realPage.evaluate(() => {
  const inputs = document.querySelectorAll('input');
  let hasWidthInput = false;
  for (const input of inputs) {
    if (input.offsetParent !== null) { // visible
      const nearby = input.previousSibling?.textContent || input.placeholder || '';
      if (nearby.toLowerCase().includes('width')) hasWidthInput = true;
    }
  }
  return {
    hasWidthInput,
    inputCount: inputs.length,
  };
});

console.log('Real Photopea dialog check:', realDialogCheck);

// Summary
console.log('\n\n=== SUMMARY ===');
console.log(`Offline: ${offlineRegCount.type1} listeners registered for type "1"`);
console.log(`Offline: K calls for newproject had ${offlineKCalls.map(c => c.listenerCount).join(', ')} listeners`);
console.log(`Real: Dialog appeared = ${realDialogCheck.hasWidthInput}`);

if (offlineKCalls.every(c => c.listenerCount === 0)) {
  console.log('\n*** ROOT CAUSE: No listeners registered for event type "1" ***');
  console.log('The event is propagating but nobody is listening!');
}

console.log('\n\nBrowsers staying open...');
await new Promise(() => {});
