#!/usr/bin/env node
import { chromium } from 'playwright';

console.log('Checking if ak6 flag is blocking features\n');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

console.log('Loading page...');
await page.goto('http://localhost:3342/?test=1', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(10000);

// Exhaustive search for ak6 flag
const flagSearch = await page.evaluate(() => {
  const results = [];

  // Check every window property
  for (const key of Object.keys(window)) {
    try {
      const obj = window[key];
      if (obj && typeof obj === 'object') {
        // Check direct property
        if ('ak6' in obj) {
          results.push({
            location: `window.${key}.ak6`,
            value: obj.ak6,
            type: typeof obj.ak6
          });
        }

        // Check .C property
        if (obj.C && typeof obj.C === 'object' && 'ak6' in obj.C) {
          results.push({
            location: `window.${key}.C.ak6`,
            value: obj.C.ak6,
            type: typeof obj.C.ak6
          });
        }

        // Check nested objects
        for (const nestedKey of Object.keys(obj).slice(0, 20)) {
          try {
            const nested = obj[nestedKey];
            if (nested && typeof nested === 'object' && 'ak6' in nested) {
              results.push({
                location: `window.${key}.${nestedKey}.ak6`,
                value: nested.ak6,
                type: typeof nested.ak6
              });
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  // Also try to call J.adQ() if it exists
  let adqResult = null;
  if (typeof window.J !== 'undefined' && typeof window.J.adQ === 'function') {
    try {
      adqResult = window.J.adQ();
    } catch (e) {
      adqResult = 'error: ' + e.message;
    }
  }

  return { flagResults: results, adqResult };
});

console.log('=== ak6 FLAG SEARCH ===');
if (flagSearch.flagResults.length === 0) {
  console.log('❌ ak6 flag not found anywhere in window');
} else {
  console.log(`Found ${flagSearch.flagResults.length} instances:`);
  flagSearch.flagResults.forEach((result, i) => {
    console.log(`  ${i + 1}. ${result.location} = ${result.value} (${result.type})`);
  });
}

console.log('\n=== J.adQ() RESULT ===');
if (flagSearch.adqResult !== null) {
  console.log('J.adQ() returned:', flagSearch.adqResult);
  if (flagSearch.adqResult === 1) {
    console.log('✅ Patch is working! (returns 1 = valid domain)');
  } else if (flagSearch.adqResult === 0) {
    console.log('❌ Patch NOT working! (returns 0 = invalid domain)');
  }
} else {
  console.log('❌ J.adQ() not accessible from window');
}

// Try to find the actual fj instance and check its ak6
const fjSearch = await page.evaluate(() => {
  // J and fj are in closures, but we might find them through the DOM
  // Look for elements that might have references
  const results = [];

  // Check if we can access through app instance
  for (const key of Object.keys(window)) {
    try {
      const obj = window[key];
      if (obj && typeof obj === 'object') {
        // Look for methods that might be from fj.prototype
        if (typeof obj.aAM === 'function') {
          results.push({
            found: 'Has aAM method',
            key: key,
            hasC: !!obj.C,
            ak6: obj.C?.ak6
          });
        }
      }
    } catch (e) {}
  }

  return results;
});

console.log('\n=== LOOKING FOR fj INSTANCE ===');
if (fjSearch.length === 0) {
  console.log('❌ Cannot find fj instance (in closure)');
} else {
  console.log('Found potential fj instances:');
  fjSearch.forEach((result, i) => {
    console.log(`  ${i + 1}. window.${result.key}`);
    console.log(`     Has C object: ${result.hasC}`);
    console.log(`     ak6: ${result.ak6 !== undefined ? result.ak6 : 'not found'}`);
  });
}

// Try clicking File menu and monitoring console
console.log('\n=== TESTING FILE MENU CLICK ===');
const clickResult = await page.evaluate(() => {
  const messages = [];
  const originalLog = console.log;
  console.log = function(...args) {
    messages.push(args.join(' '));
    originalLog.apply(console, args);
  };

  // Find and click File button
  const buttons = Array.from(document.querySelectorAll('button'));
  const fileBtn = buttons.find(btn => btn.textContent.trim() === 'File' && btn.offsetParent);

  if (fileBtn) {
    // Try clicking with multiple event types
    fileBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    fileBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    fileBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    // Wait a moment
    setTimeout(() => {
      console.log = originalLog;
    }, 500);

    return { clicked: true, messages };
  }

  console.log = originalLog;
  return { clicked: false, messages };
});

console.log('Clicked File button:', clickResult.clicked);
if (clickResult.messages.length > 0) {
  console.log('Console messages during click:');
  clickResult.messages.forEach(msg => console.log('  ', msg));
} else {
  console.log('No console messages (event may be blocked)');
}

await page.waitForTimeout(2000);

console.log('\n\n=== DIAGNOSIS ===');
if (flagSearch.adqResult === 1) {
  console.log('✅ J.adQ() patch IS working (returns 1)');
  if (fjSearch.some(r => r.ak6 === true)) {
    console.log('❌ BUT ak6 flag is TRUE - features disabled!');
    console.log('   Issue: ak6 was set before patch took effect');
    console.log('   Solution: Need to patch earlier OR reset ak6 to false');
  } else if (fjSearch.some(r => r.ak6 === false)) {
    console.log('✅ AND ak6 flag is FALSE - features should work');
    console.log('   Issue must be something else (event system?)');
  } else {
    console.log('⚠️  Cannot find ak6 flag to verify');
    console.log('   fj instance may be in closure');
  }
} else if (flagSearch.adqResult === 0) {
  console.log('❌ J.adQ() patch NOT working!');
  console.log('   Patched file may not be served correctly');
} else {
  console.log('❌ Cannot check J.adQ() - function not accessible');
}

console.log('\n\nBrowser staying open...\n');
await new Promise(() => {});
