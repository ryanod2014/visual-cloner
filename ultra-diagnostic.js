#!/usr/bin/env node
import { chromium } from 'playwright';

console.log('ULTRA DIAGNOSTIC - Deep dive into why clicks fail\n');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Intercept ALL console messages
const allLogs = [];
page.on('console', msg => {
  const text = msg.text();
  allLogs.push(text);
  if (text.includes('ak6') || text.includes('blocking') || text.includes('disabled')) {
    console.log('[CONSOLE]', text);
  }
});

console.log('Loading page...');
await page.goto('http://localhost:3343/?test=1', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(12000);

// INJECT MONITORING CODE
console.log('\n=== Injecting Event Monitor ===');
await page.evaluate(() => {
  // Wrap the event handler to log what's happening
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  let eventCount = 0;

  EventTarget.prototype.addEventListener = function(type, listener, options) {
    eventCount++;

    // Wrap the listener to log when it fires
    const wrappedListener = function(event) {
      if (type === 'click' || type === 'mousedown' || type === 'mouseup') {
        console.log('[EVENT]', type, 'on', this.tagName, this.textContent?.substring(0, 30));
      }

      try {
        return listener.call(this, event);
      } catch (e) {
        console.error('[EVENT ERROR]', e.message);
        throw e;
      }
    };

    return originalAddEventListener.call(this, type, wrappedListener, options);
  };

  console.log('[MONITOR] Event listener wrapper installed');
  window.__eventCount = () => eventCount;
});

console.log('✅ Event monitor injected');

// Check if patch actually took effect
console.log('\n=== Verifying Patches ===');
const patchVerify = await page.evaluate(() => {
  const results = {
    hasJ: typeof window.J !== 'undefined',
    canAccessAdQ: false,
    adqResult: null,
    eventListeners: 0
  };

  // Try to call J.adQ through eval (might work if it's in scope)
  try {
    results.adqResult = eval('(function() { return typeof J !== "undefined" && typeof J.adQ === "function" ? J.adQ() : null; })()');
    results.canAccessAdQ = true;
  } catch (e) {
    results.adqError = e.message;
  }

  // Count event listeners
  if (typeof window.__eventCount === 'function') {
    results.eventListeners = window.__eventCount();
  }

  return results;
});

console.log('Has window.J:', patchVerify.hasJ);
console.log('Can access J.adQ:', patchVerify.canAccessAdQ);
console.log('J.adQ() result:', patchVerify.adqResult);
console.log('Event listeners attached:', patchVerify.eventListeners);

// Try clicking File button while monitoring
console.log('\n=== Testing File Button Click (Monitored) ===');

const clickTest = await page.evaluate(() => {
  console.log('[TEST] Starting File button click test');

  // Find File button
  const buttons = Array.from(document.querySelectorAll('button'));
  const fileBtn = buttons.find(btn => btn.textContent.trim() === 'File' && btn.offsetParent);

  if (!fileBtn) {
    return { found: false, error: 'File button not found' };
  }

  console.log('[TEST] Found File button:', fileBtn.tagName, fileBtn.className);

  // Check if it has event listeners
  const hasClickListener = fileBtn.onclick !== null;
  console.log('[TEST] Has onclick:', hasClickListener);

  // Try clicking multiple ways
  const results = {
    found: true,
    hasOnclick: hasClickListener,
    clickMethods: {}
  };

  try {
    console.log('[TEST] Method 1: Direct click()');
    fileBtn.click();
    results.clickMethods.direct = 'executed';
  } catch (e) {
    console.error('[TEST] Direct click error:', e.message);
    results.clickMethods.direct = 'error: ' + e.message;
  }

  setTimeout(() => {
    try {
      console.log('[TEST] Method 2: MouseEvent');
      const evt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        detail: 1
      });
      fileBtn.dispatchEvent(evt);
      results.clickMethods.mouseEvent = 'executed';
    } catch (e) {
      console.error('[TEST] MouseEvent error:', e.message);
      results.clickMethods.mouseEvent = 'error: ' + e.message;
    }
  }, 100);

  return results;
});

console.log('File button found:', clickTest.found);
console.log('Has onclick:', clickTest.hasOnclick);
console.log('Click methods:', JSON.stringify(clickTest.clickMethods, null, 2));

await page.waitForTimeout(2000);

// Check console logs for event firing
console.log('\n=== Event Logs ===');
const eventLogs = allLogs.filter(log => log.includes('[EVENT]'));
if (eventLogs.length > 0) {
  console.log('Events that fired:');
  eventLogs.forEach(log => console.log('  ', log));
} else {
  console.log('❌ NO EVENTS FIRED!');
}

// Check for blocking errors
console.log('\n=== Error Logs ===');
const errorLogs = allLogs.filter(log => log.includes('[EVENT ERROR]') || log.toLowerCase().includes('error'));
if (errorLogs.length > 0) {
  console.log('Errors found:');
  errorLogs.forEach(log => console.log('  ', log));
} else {
  console.log('No errors in console ✅');
}

// Deep inspection of File button
console.log('\n=== File Button Deep Inspection ===');
const btnInspect = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button'));
  const fileBtn = buttons.find(btn => btn.textContent.trim() === 'File');

  if (!fileBtn) return { found: false };

  const rect = fileBtn.getBoundingClientRect();
  const computed = window.getComputedStyle(fileBtn);

  return {
    found: true,
    tag: fileBtn.tagName,
    type: fileBtn.type,
    disabled: fileBtn.disabled,
    textContent: fileBtn.textContent,
    className: fileBtn.className,
    id: fileBtn.id,
    visible: fileBtn.offsetParent !== null,
    position: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    },
    style: {
      pointerEvents: computed.pointerEvents,
      display: computed.display,
      visibility: computed.visibility,
      opacity: computed.opacity,
      zIndex: computed.zIndex
    },
    hasOnclick: fileBtn.onclick !== null,
    hasEventListener: fileBtn.hasAttribute('data-event') || fileBtn.__listeners !== undefined
  };
});

if (btnInspect.found) {
  console.log('Tag:', btnInspect.tag);
  console.log('Type:', btnInspect.type);
  console.log('Disabled:', btnInspect.disabled);
  console.log('Visible:', btnInspect.visible);
  console.log('Position:', btnInspect.position);
  console.log('Pointer events:', btnInspect.style.pointerEvents);
  console.log('Display:', btnInspect.style.display);
  console.log('Opacity:', btnInspect.style.opacity);
  console.log('Z-index:', btnInspect.style.zIndex);
  console.log('Has onclick:', btnInspect.hasOnclick);
}

// Try to find WHY events aren't working
console.log('\n=== Searching for Event Blockers ===');
const blockers = await page.evaluate(() => {
  const issues = [];

  // Check if pointer-events are disabled globally
  const bodyStyle = window.getComputedStyle(document.body);
  if (bodyStyle.pointerEvents === 'none') {
    issues.push('Body has pointer-events: none');
  }

  // Check for modal overlays
  const overlays = Array.from(document.querySelectorAll('*')).filter(el => {
    const style = window.getComputedStyle(el);
    return style.position === 'fixed' &&
           parseInt(style.zIndex) > 1000 &&
           el.offsetParent !== null;
  });

  if (overlays.length > 0) {
    issues.push(`${overlays.length} high z-index overlays found`);
  }

  // Check if window has focus
  if (!document.hasFocus()) {
    issues.push('Document does not have focus');
  }

  return issues;
});

if (blockers.length > 0) {
  console.log('⚠️  Potential blockers found:');
  blockers.forEach(b => console.log('   -', b));
} else {
  console.log('✅ No obvious blockers found');
}

// Final check: Try Playwright's real click
console.log('\n=== Trying Playwright Real Click ===');
try {
  const fileButton = page.locator('button').filter({ hasText: /^File$/ }).first();
  await fileButton.click({ force: true });
  console.log('✅ Playwright click executed');

  await page.waitForTimeout(1000);

  // Check if dropdown appeared
  const dropdownAppeared = await page.evaluate(() => {
    // Look for any newly visible elements containing "New Project"
    const elements = Array.from(document.querySelectorAll('*'));
    return elements.some(el => {
      return el.offsetParent !== null &&
             el.textContent.includes('New Project') &&
             el.getBoundingClientRect().width < 300;
    });
  });

  console.log('Dropdown appeared:', dropdownAppeared ? '✅' : '❌');
} catch (e) {
  console.log('❌ Playwright click failed:', e.message);
}

console.log('\n=== All Console Logs ===');
console.log('Total logs:', allLogs.length);
allLogs.slice(-30).forEach(log => console.log('  ', log));

console.log('\n\nBrowser staying open for manual inspection...\n');
await new Promise(() => {});
