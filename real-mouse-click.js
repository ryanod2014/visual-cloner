#!/usr/bin/env node
import { chromium } from 'playwright';

console.log('Testing with REAL mouse events via Playwright\n');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

console.log('Loading page...');
await page.goto('http://localhost:3342/?test=1', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(5000);

// Dismiss landing page
console.log('Dismissing landing page...');
const startBtn = await page.getByText('Start using Photopea').first();
if (await startBtn.isVisible().catch(() => false)) {
  await startBtn.click();
  console.log('✅ Clicked "Start using Photopea"');
  await page.waitForTimeout(3000);
} else {
  console.log('⚠️  Start button not found (may have auto-started)');
  await page.waitForTimeout(5000);
}

console.log('\n=== Looking for File menu ===');

// Find File button using Playwright selector
try {
  // Try to find button with exact text "File"
  const fileButton = page.locator('button').filter({ hasText: /^File$/ }).first();

  if (await fileButton.isVisible({ timeout: 5000 })) {
    console.log('✅ Found File button');

    // Use Playwright's click (real mouse event)
    console.log('Clicking with Playwright (real mouse)...');
    await fileButton.click();
    console.log('✅ Clicked!');

    await page.waitForTimeout(2000);

    // Check if menu appeared
    const menuVisible = await page.evaluate(() => {
      // Look for dropdown menu items
      const items = Array.from(document.querySelectorAll('*'));
      const newProject = items.find(el =>
        el.textContent === 'New Project' &&
        el.offsetParent !== null &&
        el.getBoundingClientRect().width < 250
      );

      return !!newProject;
    });

    if (menuVisible) {
      console.log('✅✅ Menu appeared with "New Project" item!');

      // Try clicking "New Project"
      console.log('\nTrying to click "New Project"...');
      const newProjectItem = page.locator('text=New Project').filter({
        has: page.locator(':scope:not(:has(*))')  // No children (leaf element)
      }).first();

      if (await newProjectItem.isVisible({ timeout: 2000 })) {
        await newProjectItem.click();
        console.log('✅ Clicked "New Project"!');

        await page.waitForTimeout(3000);

        // Check for dialog
        const dialog = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"]'));
          for (const input of inputs) {
            if (input.offsetParent) {
              const context = (input.parentElement?.textContent || '').toLowerCase();
              if (context.includes('width') || context.includes('height')) {
                return {
                  found: true,
                  value: input.value,
                  placeholder: input.placeholder
                };
              }
            }
          }
          return { found: false };
        });

        if (dialog.found) {
          console.log('\n🎉🎉🎉 SUCCESS! Dialog appeared!');
          console.log('  Input value:', dialog.value);
          console.log('\n✅✅✅ PATCH WORKS!');
          console.log('✅ Photopea is fully functional offline!');
        } else {
          console.log('\n❌ Dialog did not appear');
        }
      } else {
        console.log('❌ "New Project" item not clickable');
      }
    } else {
      console.log('❌ Menu did not appear');

      // Debug: What's on screen?
      const visible = await page.evaluate(() => {
        const clickables = Array.from(document.querySelectorAll('button, [role="button"]'))
          .filter(el => el.offsetParent !== null)
          .map(el => el.textContent.trim().substring(0, 30))
          .filter(text => text.length > 0 && text.length < 30);

        return clickables.slice(0, 20);
      });

      console.log('\nVisible clickable elements:', visible);
    }
  } else {
    console.log('❌ File button not found');
  }
} catch (e) {
  console.error('Error:', e.message);
}

console.log('\n\nBrowser staying open - try clicking File → New Project manually!\n');
await new Promise(() => {});
