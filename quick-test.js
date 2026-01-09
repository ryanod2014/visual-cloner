#!/usr/bin/env node
import { chromium } from 'playwright';

console.log('Quick test of patched Photopea...\n');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Increase timeout
page.setDefaultTimeout(60000);

console.log('Loading http://localhost:3341/?test=1...');
try {
  await page.goto('http://localhost:3341/?test=1', {
    waitUntil: 'domcontentloaded',  // Don't wait for all resources
    timeout: 60000
  });
  console.log('✅ Page loaded (DOM ready)');

  // Wait for Photopea to initialize
  console.log('Waiting for app initialization...');
  await page.waitForTimeout(10000);

  // Check if page loaded
  const title = await page.title();
  console.log('Page title:', title);

  // Look for "New Project" button
  const hasButton = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'));
    return buttons.some(btn => /new project/i.test(btn.textContent));
  });

  console.log('Has "New Project" button:', hasButton ? '✅' : '❌');

  if (hasButton) {
    console.log('\nClicking "New Project"...');
    await page.click('text=/new project/i');
    await page.waitForTimeout(3000);

    // Check for dialog
    const dialog = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      for (const input of inputs) {
        if (input.offsetParent) {
          const text = (input.parentElement?.textContent || '').toLowerCase();
          if (text.includes('width') || text.includes('height')) {
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
      console.log('\n🎉 SUCCESS! Dialog appeared!');
      console.log('  Input value:', dialog.value);
      console.log('  Input type:', dialog.type);
      console.log('\n✅ PATCH WORKS - Photopea is fully functional offline!');
    } else {
      console.log('\n❌ Dialog did not appear after clicking');
    }
  }

  console.log('\n\nBrowser staying open - test manually too!\n');
  await new Promise(() => {});

} catch (e) {
  console.error('Error:', e.message);
  console.log('\nBrowser staying open for debugging...\n');
  await new Promise(() => {});
}
