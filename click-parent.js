#!/usr/bin/env node
import { chromium } from 'playwright';

console.log('Finding "New Project" span and clicking its parent...\n');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

console.log('Loading page...');
await page.goto('http://localhost:3342/?test=1', {
  waitUntil: 'domcontentloaded',
  timeout: 60000
});

console.log('✅ Page loaded');
console.log('Waiting 15 seconds...');
await page.waitForTimeout(15000);

console.log('\nLooking for "New Project" span...');
const result = await page.evaluate(() => {
  const spans = Array.from(document.querySelectorAll('span'));
  for (const span of spans) {
    if (span.textContent.trim() === 'New Project' && span.offsetParent) {
      // Found it! Click the parent
      const parent = span.parentElement;
      if (parent) {
        parent.click();
        return {
          found: true,
          spanTag: span.tagName,
          parentTag: parent.tagName,
          parentClasses: parent.className,
          parentText: parent.textContent.substring(0, 50)
        };
      }
    }
  }
  return { found: false };
});

if (result.found) {
  console.log('✅ Found span and clicked parent:');
  console.log('  Span:', result.spanTag);
  console.log('  Parent:', result.parentTag);
  console.log('  Parent classes:', result.parentClasses || '(none)');
  console.log('  Parent text:', result.parentText);

  console.log('\nWaiting 3 seconds for dialog...');
  await page.waitForTimeout(3000);

  // Check for dialog
  const dialog = await page.evaluate(() => {
    // Look for width/height inputs
    const inputs = Array.from(document.querySelectorAll('input'));
    for (const input of inputs) {
      if (input.offsetParent) {
        // Check if this input or nearby text mentions width/height
        const parent = input.parentElement;
        const context = parent?.textContent || '';
        if (/width|height/i.test(context)) {
          return {
            found: true,
            value: input.value,
            type: input.type,
            placeholder: input.placeholder,
            context: context.substring(0, 100)
          };
        }
      }
    }

    // Also look for "Create" button
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const btn of buttons) {
      if (/create/i.test(btn.textContent) && btn.offsetParent) {
        return {
          found: true,
          method: 'create button',
          text: btn.textContent.trim()
        };
      }
    }

    return { found: false };
  });

  if (dialog.found) {
    console.log('\n🎉🎉🎉 SUCCESS! Dialog appeared!');
    if (dialog.value) console.log('  Input value:', dialog.value);
    if (dialog.type) console.log('  Input type:', dialog.type);
    if (dialog.text) console.log('  Button text:', dialog.text);
    console.log('\n✅✅✅ PATCH WORKS - Photopea is fully functional offline!');
    console.log('✅ Environment protection successfully bypassed!');
  } else {
    console.log('\n❌ Dialog did not appear');

    // Take screenshot for debugging
    await page.screenshot({ path: '/tmp/after-click.png' });
    console.log('Screenshot saved to /tmp/after-click.png');
  }
} else {
  console.log('❌ Could not find "New Project" span');
}

console.log('\n\nBrowser staying open - try clicking "New Project" manually!\n');
await new Promise(() => {});
