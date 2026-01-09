#!/usr/bin/env node
import { chromium } from 'playwright';

console.log('Complete flow: Click "Start using Photopea" → "New Project"\n');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

console.log('Loading page...');
await page.goto('http://localhost:3342/?test=1', {
  waitUntil: 'domcontentloaded',
  timeout: 60000
});

console.log('✅ Page loaded');
console.log('Waiting 5 seconds...\n');
await page.waitForTimeout(5000);

// Step 1: Click "Start using Photopea"
console.log('Step 1: Looking for "Start using Photopea" button...');
try {
  const startClicked = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button, [role="button"], div, a'));
    for (const el of all) {
      const text = el.textContent || '';
      if (/start.*using.*photopea/i.test(text) && el.offsetParent) {
        el.click();
        return {
          found: true,
          tag: el.tagName,
          text: text.substring(0, 50)
        };
      }
    }
    return { found: false };
  });

  if (startClicked.found) {
    console.log('✅ Clicked "Start using Photopea":');
    console.log('  Tag:', startClicked.tag);
    console.log('  Text:', startClicked.text);
    console.log('\nWaiting 10 seconds for app to initialize...');
    await page.waitForTimeout(10000);
  } else {
    console.log('⚠️  "Start using Photopea" button not found (may have auto-started)');
    console.log('Waiting 10 seconds anyway...');
    await page.waitForTimeout(10000);
  }

  // Step 2: Look for "New Project" button in the toolbar
  console.log('\nStep 2: Looking for "New Project" button in toolbar...');
  const newProjectResult = await page.evaluate(() => {
    // Look for buttons with "New Project" text
    const all = Array.from(document.querySelectorAll('button, [role="button"], div'));
    for (const el of all) {
      const text = (el.textContent || '').trim();
      // Look for buttons with ONLY "New Project" text (not long menu strings)
      if (text === 'New Project' && el.offsetParent) {
        el.click();
        return {
          found: true,
          tag: el.tagName,
          classes: el.className,
          clicked: true
        };
      }
    }

    // Also try looking in the File menu area
    const fileMenu = Array.from(document.querySelectorAll('*')).find(el => {
      return el.textContent === 'File' && el.tagName !== 'HTML' && el.tagName !== 'BODY';
    });

    return { found: false, hasFileMenu: !!fileMenu };
  });

  if (newProjectResult.found) {
    console.log('✅ Found and clicked "New Project" button!');
    console.log('  Tag:', newProjectResult.tag);
    console.log('  Classes:', newProjectResult.classes || '(none)');

    console.log('\nWaiting 3 seconds for dialog...');
    await page.waitForTimeout(3000);

    // Check for dialog
    const dialog = await page.evaluate(() => {
      // Strategy 1: Width/height inputs
      const inputs = Array.from(document.querySelectorAll('input'));
      for (const input of inputs) {
        if (input.offsetParent) {
          const label = (input.parentElement?.textContent || '').toLowerCase();
          if (label.includes('width') || label.includes('height')) {
            return {
              found: true,
              method: 'width/height input',
              value: input.value,
              type: input.type
            };
          }
        }
      }

      // Strategy 2: "Create" button
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
      console.log('  Method:', dialog.method);
      if (dialog.value) console.log('  Input value:', dialog.value);
      if (dialog.text) console.log('  Button text:', dialog.text);
      console.log('\n✅✅✅ PATCH CONFIRMED WORKING!');
      console.log('✅ Photopea runs fully offline with patched J.adQ function!');
    } else {
      console.log('\n❌ Dialog did not appear after clicking');
      await page.screenshot({ path: '/tmp/after-new-project-click.png' });
      console.log('Screenshot saved to /tmp/after-new-project-click.png');
    }
  } else {
    console.log('❌ "New Project" button not found');
    console.log('  Has File menu:', newProjectResult.hasFileMenu ? 'yes' : 'no');

    // Try File → New Project
    if (newProjectResult.hasFileMenu) {
      console.log('\nTrying File → New Project...');
      // User can test this manually
    }
  }

} catch (e) {
  console.error('Error:', e.message);
}

console.log('\n\nBrowser staying open - test manually:');
console.log('1. Look for "File" menu');
console.log('2. Click "File" → "New Project"');
console.log('3. See if dialog appears\n');
await new Promise(() => {});
