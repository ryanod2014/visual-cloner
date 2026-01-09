#!/usr/bin/env node
import { chromium } from 'playwright';

console.log('Checking for JavaScript errors...\n');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

const errors = [];
const logs = [];

page.on('console', msg => {
  logs.push(`[${msg.type()}] ${msg.text()}`);
});

page.on('pageerror', error => {
  errors.push(error.message);
});

console.log('Loading http://localhost:3342/?test=1...');
await page.goto('http://localhost:3342/?test=1', {
  waitUntil: 'domcontentloaded',
  timeout: 60000
});

console.log('Waiting 15 seconds...');
await page.waitForTimeout(15000);

console.log('\n=== JavaScript Errors ===');
if (errors.length === 0) {
  console.log('No errors! ✅');
} else {
  errors.forEach((err, i) => {
    console.log(`${i + 1}. ${err}`);
  });
}

console.log('\n=== Console Logs (last 20) ===');
logs.slice(-20).forEach(log => console.log(log));

// Check if clicking "New Project" button works
console.log('\n=== Testing Button Click ===');
try {
  // Look for elements with "New Project" text
  const result = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const matches = all.filter(el => {
      const text = el.textContent || '';
      return text.includes('New Project') && el.offsetParent !== null;
    });

    if (matches.length === 0) return { found: false };

    // Try to click the first one
    const el = matches[0];
    el.click();

    return {
      found: true,
      tag: el.tagName,
      text: el.textContent.substring(0, 50),
      clicked: true
    };
  });

  if (result.found) {
    console.log('✅ Found and clicked element:');
    console.log('  Tag:', result.tag);
    console.log('  Text:', result.text);

    await page.waitForTimeout(3000);

    // Check for dialog
    const hasDialog = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      for (const input of inputs) {
        if (input.offsetParent) {
          const label = (input.parentElement?.textContent || '').toLowerCase();
          if (label.includes('width') || label.includes('height')) {
            return true;
          }
        }
      }
      return false;
    });

    if (hasDialog) {
      console.log('\n🎉🎉🎉 SUCCESS! Dialog appeared after click!');
    } else {
      console.log('\n❌ Dialog did not appear after click');
    }
  } else {
    console.log('❌ Could not find "New Project" element');
  }
} catch (e) {
  console.log('Error clicking:', e.message);
}

console.log('\n\nBrowser staying open...\n');
await new Promise(() => {});
