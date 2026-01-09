import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => {
  const text = msg.text();
  if (text.includes('[Patch]') || text.includes('Error') || text.includes('error')) {
    console.log('[browser]', text.slice(0, 150));
  }
});

console.log('Testing OFFLINE version...');
await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Click start
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(2000);
} catch (e) {}

// Click "New Project" button
console.log('Clicking "New Project"...');
await page.click('text=/new project/i');
await page.waitForTimeout(2000);

// Check what happened
await page.screenshot({ path: '/tmp/after-new-project-offline.png' });
console.log('Screenshot: /tmp/after-new-project-offline.png');

// Check if a dialog appeared
const dialogInfo = await page.evaluate(() => {
  // Look for modal/dialog
  const modals = document.querySelectorAll('[class*="dialog"], [class*="modal"], [role="dialog"]');
  const inputs = document.querySelectorAll('input[type="text"], input[type="number"]');
  const createBtn = [...document.querySelectorAll('button, div')].find(el =>
    el.textContent?.toLowerCase().includes('create') ||
    el.textContent?.toLowerCase().includes('ok')
  );

  return {
    modalsFound: modals.length,
    inputsFound: inputs.length,
    createBtnFound: createBtn ? createBtn.textContent.slice(0, 30) : null,
    bodyClasses: document.body.className,
  };
});
console.log('Dialog info:', dialogInfo);

// Look for any new visible panel
const newElements = await page.evaluate(() => {
  const visible = [];
  document.querySelectorAll('div').forEach(el => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    // Look for centered dialogs
    if (rect.width > 200 && rect.width < 600 &&
        rect.height > 150 && rect.height < 500 &&
        rect.left > 100 && rect.top > 50 &&
        style.display !== 'none') {
      const text = el.textContent?.slice(0, 50);
      if (text && (text.includes('Width') || text.includes('Height') || text.includes('Create'))) {
        visible.push({
          class: el.className?.slice(0, 30),
          text: text,
          rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
        });
      }
    }
  });
  return visible.slice(0, 5);
});
console.log('New Project dialog candidates:', newElements);

// Now compare with REAL Photopea
console.log('\n=== Testing REAL Photopea ===');
const page2 = await browser.newPage();
await page2.goto('https://www.photopea.com', { waitUntil: 'networkidle' });
await page2.waitForTimeout(3000);

try {
  await page2.click('text=/start using photopea/i', { timeout: 3000 });
  await page2.waitForTimeout(2000);
} catch (e) {}

console.log('Clicking "New Project" on real...');
await page2.click('text=/new project/i');
await page2.waitForTimeout(2000);

await page2.screenshot({ path: '/tmp/after-new-project-real.png' });
console.log('Real screenshot: /tmp/after-new-project-real.png');

const realDialog = await page2.evaluate(() => {
  const inputs = document.querySelectorAll('input[type="text"], input[type="number"]');
  return {
    inputsFound: inputs.length,
    firstInput: inputs[0]?.outerHTML?.slice(0, 100),
  };
});
console.log('Real dialog:', realDialog);

console.log('\nCompare /tmp/after-new-project-offline.png and /tmp/after-new-project-real.png');
await new Promise(() => {});
