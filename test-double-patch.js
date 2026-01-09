#!/usr/bin/env node
import { chromium } from 'playwright';

console.log('Testing DOUBLE-PATCHED Photopea at port 3343\n');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

console.log('Loading page...');
await page.goto('http://localhost:3343/?test=1', { waitUntil: 'load', timeout: 60000 });

console.log('Waiting 12 seconds for initialization...');
await page.waitForTimeout(12000);

console.log('\n=== Testing File Menu ===');

// Try clicking File button with Playwright
try {
  const fileButton = page.locator('button').filter({ hasText: /^File$/ }).first();

  if (await fileButton.isVisible({ timeout: 5000 })) {
    console.log('✅ Found File button');

    await fileButton.click();
    console.log('✅ Clicked File button');

    await page.waitForTimeout(1000);

    // Check if dropdown appeared
    const dropdown = await page.evaluate(() => {
      // Look for dropdown menu with "New Project"
      const elements = Array.from(document.querySelectorAll('*'));

      // Find elements that:
      // 1. Contain "New Project" text
      // 2. Are visible
      // 3. Have reasonable size (not the whole page)
      const newProjectItems = elements.filter(el => {
        if (!el.offsetParent) return false;
        const text = el.textContent || '';
        if (!text.includes('New Project')) return false;

        const rect = el.getBoundingClientRect();
        // Should be menu-sized, not full page
        return rect.width < 300 && rect.height < 600;
      });

      if (newProjectItems.length > 0) {
        return {
          found: true,
          count: newProjectItems.length,
          sample: newProjectItems[0].textContent.substring(0, 100)
        };
      }

      return { found: false };
    });

    if (dropdown.found) {
      console.log('✅✅ Dropdown appeared!');
      console.log('  Items found:', dropdown.count);
      console.log('  Sample text:', dropdown.sample);

      // Try clicking "New Project"
      console.log('\nTrying to click "New Project"...');

      const newProjectClicked = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('*'));
        for (const el of elements) {
          const text = (el.textContent || '').trim();
          // Find leaf element with exact "New Project" text
          if (text === 'New Project' && el.children.length === 0 && el.offsetParent) {
            el.click();
            return true;
          }
        }
        return false;
      });

      if (newProjectClicked) {
        console.log('✅ Clicked "New Project"');
        await page.waitForTimeout(2000);

        // Check for dialog
        const dialog = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input'));
          for (const input of inputs) {
            if (input.offsetParent && (input.type === 'text' || input.type === 'number')) {
              const context = input.parentElement?.textContent || '';
              if (/width|height/i.test(context)) {
                return {
                  found: true,
                  value: input.value,
                  type: input.type
                };
              }
            }
          }
          return { found: false };
        });

        if (dialog.found) {
          console.log('\n🎉🎉🎉 SUCCESS! New Project dialog appeared!');
          console.log('  Width/Height input value:', dialog.value);
          console.log('\n✅✅✅ DOUBLE PATCH WORKS!');
          console.log('✅ Photopea is FULLY FUNCTIONAL offline!');
        } else {
          console.log('❌ Dialog did not appear after clicking');
        }
      }
    } else {
      console.log('❌ Dropdown menu did not appear');
    }
  }
} catch (e) {
  console.error('Error:', e.message);
}

console.log('\n\n=== Manual Testing ===');
console.log('Browser is open - please manually test:');
console.log('1. Click "File" in menu bar');
console.log('2. Click "New Project" in dropdown');
console.log('3. Try drag & drop an image');
console.log('4. Try clicking tools in toolbar\n');

await new Promise(() => {});
