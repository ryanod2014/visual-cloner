import { chromium } from 'playwright';

console.log('Testing theory: Load with # in URL to trigger script loading\n');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

const scriptLoads = [];
page.on('response', response => {
  const url = response.url();
  if (url.includes('.js')) {
    scriptLoads.push({ url, status: response.status() });
  }
});

console.log('Loading with HASH: http://localhost:3333/#app');
await page.goto('http://localhost:3333/#app', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

console.log(`\n=== Script Loading ===`);
console.log(`Total scripts loaded: ${scriptLoads.length}`);

const keyScripts = ['pp1767826327.js', 'DBS1764527275.js', 'ext1767565813.js'];
keyScripts.forEach(script => {
  const found = scriptLoads.find(s => s.url.includes(script));
  if (found) {
    console.log(`✅ ${script} (status ${found.status})`);
  } else {
    console.log(`❌ ${script} - NOT LOADED`);
  }
});

// Check for Photopea globals
const globalsCheck = await page.evaluate(() => {
  return {
    J: typeof window.J !== 'undefined',
    fj: typeof window.fj !== 'undefined',
    gA: typeof window.gA !== 'undefined',
  };
});

console.log(`\n=== Global Objects ===`);
console.log(`J exists: ${globalsCheck.J ? '✅' : '❌'}`);
console.log(`fj exists: ${globalsCheck.fj ? '✅' : '❌'}`);
console.log(`gA exists: ${globalsCheck.gA ? '✅' : '❌'}`);

// Try clicking through the app
if (globalsCheck.J) {
  console.log(`\n✅ Scripts loaded! Now testing functionality...\n`);

  await page.waitForTimeout(2000);

  // Try clicking New Project
  try {
    await page.click('text=/new project/i', { timeout: 5000 });
    console.log('✅ New Project button clicked');
    await page.waitForTimeout(2000);

    // Check for dialog
    const hasDialog = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        if (input.offsetParent !== null) {
          const text = (input.previousSibling?.textContent || '').toLowerCase();
          if (text.includes('width')) return true;
        }
      }
      return false;
    });

    if (hasDialog) {
      console.log('✅✅✅ DIALOG APPEARED! FUNCTIONALITY WORKS!');
    } else {
      console.log('❌ Dialog did not appear (but scripts loaded)');
    }
  } catch (e) {
    console.log('❌ New Project button not found');
  }
} else {
  console.log(`\n❌ Scripts still didn't load. There's another issue.`);
}

console.log('\n\nBrowser staying open...');
await new Promise(() => {});
