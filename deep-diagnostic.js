#!/usr/bin/env node
import { chromium } from 'playwright';

console.log('DEEP DIAGNOSTIC - Finding why interactions fail\n');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

const consoleMessages = [];
const errors = [];

page.on('console', msg => {
  consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
});

page.on('pageerror', error => {
  errors.push(error.message);
});

console.log('Loading page...');
await page.goto('http://localhost:3342/?test=1', { waitUntil: 'load', timeout: 60000 });
console.log('✅ Loaded\n');

console.log('Waiting 15 seconds for initialization...');
await page.waitForTimeout(15000);

// COMPREHENSIVE STATE CHECK
const state = await page.evaluate(() => {
  const result = {
    // Page state
    title: document.title,
    bodyClasses: document.body.className,

    // DOM counts
    divCount: document.querySelectorAll('div').length,
    buttonCount: document.querySelectorAll('button').length,
    canvasCount: document.querySelectorAll('canvas').length,

    // Look for Photopea app vs landing page indicators
    hasLandingPage: !!document.querySelector('.landing-page, .splash, .welcome'),
    hasEditor: !!document.querySelector('canvas[width][height]'),

    // Check for key elements
    fileMenus: [],
    clickableElements: [],

    // Try to find app state
    appState: {},

    // Event listeners check
    hasEventListeners: false,
  };

  // Find "File" text
  const allElements = Array.from(document.querySelectorAll('*'));
  allElements.forEach(el => {
    const text = (el.textContent || '').trim();
    if (text === 'File' && el.offsetParent) {
      result.fileMenus.push({
        tag: el.tagName,
        classes: el.className,
        hasClick: !!el.onclick,
        parent: el.parentElement?.tagName
      });
    }
  });

  // Find clickable elements with text
  const clickable = allElements.filter(el => {
    return (el.tagName === 'BUTTON' || el.onclick || el.role === 'button') &&
           el.offsetParent !== null &&
           el.textContent.trim().length < 50;
  });

  result.clickableElements = clickable.slice(0, 10).map(el => ({
    tag: el.tagName,
    text: el.textContent.trim().substring(0, 30),
    hasClick: !!el.onclick
  }));

  // Check event listeners
  result.hasEventListeners = document.body.onclick !== null;

  // Try to access Photopea internals through window
  for (const key of Object.keys(window)) {
    if (key.length < 10 && typeof window[key] === 'object' && window[key] !== null) {
      try {
        // Look for objects with 'ak6' or 'C' properties (Photopea state)
        if (window[key].C && typeof window[key].C === 'object') {
          result.appState.foundKey = key;
          result.appState.hasC = true;
          if ('ak6' in window[key].C) {
            result.appState.ak6 = window[key].C.ak6;
          }
          if ('j1' in window[key].C) {
            result.appState.hasJ1 = true;
          }
        }
      } catch (e) {}
    }
  }

  return result;
});

console.log('=== PAGE STATE ===');
console.log('Title:', state.title);
console.log('Body classes:', state.bodyClasses || '(none)');
console.log('Divs:', state.divCount);
console.log('Buttons:', state.buttonCount);
console.log('Canvases:', state.canvasCount);
console.log('Has landing page:', state.hasLandingPage);
console.log('Has editor:', state.hasEditor);

console.log('\n=== FILE MENU ===');
if (state.fileMenus.length === 0) {
  console.log('❌ No "File" menu found');
} else {
  console.log(`Found ${state.fileMenus.length} "File" elements:`);
  state.fileMenus.forEach((fm, i) => {
    console.log(`  ${i + 1}. <${fm.tag}> classes="${fm.classes}" hasClick=${fm.hasClick} parent=<${fm.parent}>`);
  });
}

console.log('\n=== CLICKABLE ELEMENTS ===');
if (state.clickableElements.length === 0) {
  console.log('❌ No clickable elements found');
} else {
  console.log(`Found ${state.clickableElements.length} clickable elements:`);
  state.clickableElements.forEach((el, i) => {
    console.log(`  ${i + 1}. <${el.tag}> "${el.text}" hasClick=${el.hasClick}`);
  });
}

console.log('\n=== APP STATE ===');
if (state.appState.foundKey) {
  console.log('✅ Found app state object at window.' + state.appState.foundKey);
  console.log('  Has C object:', state.appState.hasC);
  console.log('  ak6 flag:', state.appState.ak6 !== undefined ? state.appState.ak6 : 'not found');
  console.log('  Has j1 registry:', state.appState.hasJ1 || false);
} else {
  console.log('❌ Could not find app state object');
}

console.log('\n=== EVENT LISTENERS ===');
console.log('Body has onclick:', state.hasEventListeners);

console.log('\n=== CONSOLE MESSAGES ===');
console.log('Total messages:', consoleMessages.length);
consoleMessages.slice(-15).forEach(msg => console.log('  ' + msg));

console.log('\n=== JAVASCRIPT ERRORS ===');
if (errors.length === 0) {
  console.log('No errors ✅');
} else {
  errors.forEach(err => console.log('  ❌', err));
}

// Try clicking File menu programmatically
console.log('\n=== TRYING TO CLICK FILE MENU ===');
const clicked = await page.evaluate(() => {
  const allElements = Array.from(document.querySelectorAll('*'));
  const fileElements = allElements.filter(el => {
    return el.textContent.trim() === 'File' && el.offsetParent !== null;
  });

  if (fileElements.length > 0) {
    const el = fileElements[0];

    // Try multiple click methods
    const results = {
      element: el.tagName,
      methods: {}
    };

    // Method 1: Direct click
    try {
      el.click();
      results.methods.click = 'executed';
    } catch (e) {
      results.methods.click = 'error: ' + e.message;
    }

    // Method 2: Dispatch MouseEvent
    try {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      results.methods.dispatchClick = 'executed';
    } catch (e) {
      results.methods.dispatchClick = 'error: ' + e.message;
    }

    // Method 3: MouseDown + MouseUp
    try {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      results.methods.mouseDownUp = 'executed';
    } catch (e) {
      results.methods.mouseDownUp = 'error: ' + e.message;
    }

    return { found: true, ...results };
  }

  return { found: false };
});

if (clicked.found) {
  console.log('✅ Found File element:', clicked.element);
  console.log('Click methods tried:');
  for (const [method, result] of Object.entries(clicked.methods)) {
    console.log(`  ${method}: ${result}`);
  }

  console.log('\nWaiting 2 seconds to see if menu appears...');
  await page.waitForTimeout(2000);

  const menuAppeared = await page.evaluate(() => {
    // Look for dropdown/menu that appeared
    const dropdowns = Array.from(document.querySelectorAll('[role="menu"], .menu, .dropdown'));
    return dropdowns.some(d => d.offsetParent !== null);
  });

  if (menuAppeared) {
    console.log('✅ Menu appeared!');
  } else {
    console.log('❌ No menu appeared');
  }
} else {
  console.log('❌ Could not find File element to click');
}

console.log('\n\n=== DIAGNOSIS ===');
if (!state.hasEditor && state.canvasCount < 2) {
  console.log('🔍 App may not have initialized - still on landing page?');
  console.log('   Try: Look for "Start using Photopea" button');
} else if (state.appState.ak6 === true) {
  console.log('🔍 ak6 flag is TRUE - features are disabled!');
  console.log('   Patch may not have been applied correctly');
} else if (state.appState.ak6 === false) {
  console.log('✅ ak6 flag is FALSE - features should work');
  console.log('   Issue may be with event handlers not attaching');
} else {
  console.log('🔍 Cannot find ak6 flag - app may not be fully loaded');
}

console.log('\n\nBrowser staying open for manual inspection...\n');
await new Promise(() => {});
