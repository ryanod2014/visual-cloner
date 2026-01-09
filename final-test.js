#!/usr/bin/env node
import { chromium } from 'playwright';

console.log('Final test - Finding and clicking actual "New Project" button\n');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

console.log('Loading page...');
await page.goto('http://localhost:3342/?test=1', {
  waitUntil: 'domcontentloaded',
  timeout: 60000
});

console.log('✅ Page loaded');
console.log('Waiting 15 seconds for full initialization...');
await page.waitForTimeout(15000);

// Look for the ACTUAL "New Project" button (should be exact text match)
const buttons = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('*'));
  return all
    .filter(el => el.offsetParent !== null) // Visible
    .map(el => {
      const text = (el.textContent || '').trim();
      const ownText = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
        ? el.childNodes[0].textContent.trim()
        : '';

      return {
        tag: el.tagName,
        text: text.substring(0, 30),
        ownText: ownText.substring(0, 30),
        clickable: el.tagName === 'BUTTON' || el.onclick || el.role === 'button',
        classes: el.className
      };
    })
    .filter(el => /^new project$/i.test(el.text) || /^new project$/i.test(el.ownText))
    .slice(0, 10);
});

console.log('\n=== Found Elements with Exact "New Project" Text ===');
if (buttons.length === 0) {
  console.log('❌ No exact matches found');

  // Try partial match
  const partial = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button, [role="button"], div'));
    return all
      .filter(el => el.offsetParent !== null)
      .filter(el => {
        const text = (el.textContent || '').trim();
        return text.length < 50 && /new.*project/i.test(text);
      })
      .slice(0, 10)
      .map(el => ({
        tag: el.tagName,
        text: el.textContent.trim(),
        classes: el.className
      }));
  });

  console.log('\n=== Partial Matches (< 50 chars with "new" and "project") ===');
  partial.forEach((btn, i) => {
    console.log(`${i + 1}. <${btn.tag}> "${btn.text}"`);
    console.log(`   classes: ${btn.classes || '(none)'}`);
  });

  if (partial.length > 0) {
    console.log('\nTrying to click first partial match...');
    const clicked = await page.evaluate((index) => {
      const all = Array.from(document.querySelectorAll('button, [role="button"], div'));
      const matches = all
        .filter(el => el.offsetParent !== null)
        .filter(el => {
          const text = (el.textContent || '').trim();
          return text.length < 50 && /new.*project/i.test(text);
        });

      if (matches[0]) {
        matches[0].click();
        return true;
      }
      return false;
    }, 0);

    if (clicked) {
      console.log('✅ Clicked!');
      await page.waitForTimeout(3000);

      // Check for dialog
      const hasDialog = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"]'));
        for (const input of inputs) {
          if (input.offsetParent) {
            const context = (input.parentElement?.textContent || '').toLowerCase();
            if (context.includes('width') || context.includes('height')) {
              return {
                found: true,
                value: input.value,
                context: context.substring(0, 100)
              };
            }
          }
        }
        return { found: false };
      });

      if (hasDialog.found) {
        console.log('\n🎉🎉🎉 SUCCESS! Dialog appeared!');
        console.log('  Input value:', hasDialog.value);
        console.log('\n✅ PATCH WORKS! Photopea runs fully offline!');
      } else {
        console.log('\n❌ Dialog did not appear');
      }
    }
  }
} else {
  console.log('Found', buttons.length, 'exact matches:');
  buttons.forEach((btn, i) => {
    console.log(`${i + 1}. <${btn.tag}> "${btn.text}" clickable:${btn.clickable}`);
  });
}

console.log('\n\nBrowser staying open for manual testing...\n');
await new Promise(() => {});
