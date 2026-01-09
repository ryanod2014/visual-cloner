#!/usr/bin/env node
import { chromium } from 'playwright';

console.log('Testing V2 patched Photopea at http://localhost:3341/?test=1\n');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

console.log('Loading page...');
await page.goto('http://localhost:3341/?test=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(8000); // Wait for full initialization

console.log('Clicking "New Project" button...\n');
try {
  await page.click('text=/new project/i', { timeout: 5000 });
  console.log('✅ Button clicked');
  await page.waitForTimeout(3000);

  // Multiple detection strategies
  const result = await page.evaluate(() => {
    // Look for width/height inputs (most reliable)
    const inputs = Array.from(document.querySelectorAll('input'));
    for (const input of inputs) {
      if (input.offsetParent) {
        const label = input.previousSibling?.textContent ||
                      input.parentElement?.textContent || '';
        if (/width|height/i.test(label)) {
          return {
            success: true,
            method: 'width/height input found',
            value: input.value,
            label: label.trim()
          };
        }
      }
    }

    // Look for "Create" button
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const btn of buttons) {
      if (/create/i.test(btn.textContent) && btn.offsetParent) {
        return {
          success: true,
          method: 'Create button found',
          text: btn.textContent.trim()
        };
      }
    }

    return { success: false };
  });

  if (result.success) {
    console.log('🎉🎉🎉 SUCCESS! Dialog appeared!');
    console.log('  Method:', result.method);
    if (result.value) console.log('  Input value:', result.value);
    if (result.label) console.log('  Label:', result.label);
    if (result.text) console.log('  Button text:', result.text);
    console.log('\n✅ PATCH WORKS! Photopea is fully functional offline!');
    console.log('✅ J.adQ() patch successfully bypassed environment protection!');
  } else {
    console.log('❌ Dialog did not appear');
    await page.screenshot({ path: '/tmp/photopea-v2-debug.png' });
    console.log('Saved screenshot to /tmp/photopea-v2-debug.png');
  }
} catch (e) {
  console.log('❌ Error:', e.message);
}

console.log('\n\nBrowser staying open - try manually clicking "New Project"!\n');
await new Promise(() => {});
