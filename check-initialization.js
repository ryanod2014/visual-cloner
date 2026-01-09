#!/usr/bin/env node
import { chromium } from 'playwright';

console.log('Checking if Photopea actually initializes\n');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Capture console from the very beginning
const allLogs = [];
page.on('console', msg => allLogs.push(msg.text()));

console.log('Loading page...');
await page.goto('http://localhost:3343/?test=1', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(15000);

// Check what console says
console.log('\n=== Console Messages ===');
allLogs.forEach((log, i) => console.log(`${i + 1}. ${log}`));

// Look for the initialization sequence
console.log('\n=== Initialization Check ===');
const hasAdding = allLogs.some(log => log.includes('adding'));
const hasNumber1 = allLogs.some(log => log === '1');

console.log('Has "adding" log:', hasAdding ? '✅' : '❌');
console.log('Has "1" log:', hasNumber1 ? '✅' : '❌');

if (hasAdding && hasNumber1) {
  console.log('→ Scripts ARE executing');
} else {
  console.log('→ Scripts may NOT be executing properly');
}

// Check for app globals in a different way
const appCheck = await page.evaluate(() => {
  const results = {
    windowKeys: Object.keys(window).length,
    hasCanvas: document.querySelectorAll('canvas').length,
    hasButtons: document.querySelectorAll('button').length,
    bodyChildren: document.body.children.length,

    // Try to find any photopea-specific globals
    foundGlobals: []
  };

  // Look for objects that might be photopea
  for (const key of Object.keys(window)) {
    const obj = window[key];
    if (obj && typeof obj === 'object') {
      // Check for photopea-like properties
      if (obj.C || obj.j1 || obj.ak6 !== undefined) {
        results.foundGlobals.push(key);
      }
    }
  }

  // Check for script execution by looking at DOM modifications
  const appDiv = Array.from(document.querySelectorAll('div')).find(div => {
    return div.className && div.className.includes('app');
  });

  results.hasAppDiv = !!appDiv;

  return results;
});

console.log('\n=== DOM State ===');
console.log('Window properties:', appCheck.windowKeys);
console.log('Canvas elements:', appCheck.hasCanvas);
console.log('Button elements:', appCheck.hasButtons);
console.log('Body children:', appCheck.bodyChildren);
console.log('Has app div:', appCheck.hasAppDiv);
console.log('Found globals:', appCheck.foundGlobals.length > 0 ? appCheck.foundGlobals.join(', ') : 'none');

// Check if script tags were added dynamically
const scriptCheck = await page.evaluate(() => {
  const scripts = Array.from(document.querySelectorAll('script'));
  return {
    total: scripts.length,
    withSrc: scripts.filter(s => s.src).length,
    inline: scripts.filter(s => !s.src).length,
    sources: scripts.filter(s => s.src).slice(0, 10).map(s => {
      const url = new URL(s.src);
      return url.pathname;
    })
  };
});

console.log('\n=== Script Tags ===');
console.log('Total scripts:', scriptCheck.total);
console.log('With src:', scriptCheck.withSrc);
console.log('Inline:', scriptCheck.inline);
console.log('Sample sources:', scriptCheck.sources.join(', '));

// Try to verify our patches are in the loaded code
console.log('\n=== Verifying Patches in Loaded Code ===');
const patchCheck = await page.evaluate(async () => {
  try {
    // Fetch the r9.js file that was loaded
    const response = await fetch('/code/pp/pp1767826327.js');
    const text = await response.text();

    // Check if our patches are there
    const hasAdqPatch = text.includes('J.adQ=function(){return 1;}');
    const hasAk6Patch = text.includes('this.ak6=!1');
    const originalAk6Pattern = text.includes('this.ak6=!0');

    return {
      fileSize: text.length,
      hasAdqPatch,
      hasAk6Patch,
      originalAk6Pattern
    };
  } catch (e) {
    return { error: e.message };
  }
});

if (patchCheck.error) {
  console.log('❌ Could not verify patches:', patchCheck.error);
} else {
  console.log('File size:', (patchCheck.fileSize / 1024 / 1024).toFixed(2), 'MB');
  console.log('Has J.adQ patch:', patchCheck.hasAdqPatch ? '✅' : '❌');
  console.log('Has ak6=!1 patch:', patchCheck.hasAk6Patch ? '✅' : '❌');
  console.log('Still has ak6=!0:', patchCheck.originalAk6Pattern ? '⚠️ YES' : '✅ NO');
}

console.log('\n\n=== DIAGNOSIS ===');

if (!hasAdding) {
  console.log('❌ CRITICAL: Scripts are NOT executing!');
  console.log('   The "adding" console log never appeared');
  console.log('   This means the main app code is not running');
} else if (appCheck.hasButtons === 0) {
  console.log('❌ CRITICAL: No buttons in DOM!');
  console.log('   App may not have rendered');
} else if (appCheck.foundGlobals.length === 0) {
  console.log('⚠️  App state objects not found in window');
  console.log('   They may be in closures (normal for minified code)');
} else {
  console.log('✅ App appears to be initialized');
  console.log('   But event listeners are not attaching');
  console.log('   This suggests an initialization race condition');
  console.log('   or the patch is preventing proper initialization');
}

console.log('\n\nBrowser staying open...\n');
await new Promise(() => {});
