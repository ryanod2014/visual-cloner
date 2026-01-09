import { chromium } from 'playwright';

console.log('Testing both servers...\n');

// Test UNPATCHED version
console.log('=== UNPATCHED (localhost:3333) ===');
const browser1 = await chromium.launch({ headless: false });
const page1 = await browser1.newPage();

let unpatchedConsole = [];
page1.on('console', msg => {
  if (msg.text().includes('[PATCHED]')) unpatchedConsole.push(msg.text());
});

await page1.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page1.waitForTimeout(2000);

console.log('Patched console messages:', unpatchedConsole.length);

await page1.click('text=/start using photopea/i');
await page1.waitForTimeout(2000);

const unpatched = await page1.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('*')).filter(el => {
    const text = el.textContent || '';
    return text.toLowerCase().includes('new project') && el.children.length === 0;
  });

  return {
    hasNewProjectButton: buttons.length > 0,
    buttonText: buttons[0]?.textContent,
  };
});

console.log('Has New Project button:', unpatched.hasNewProjectButton);
console.log('Button text:', unpatched.buttonText);

// Now test PATCHED version
console.log('\n=== PATCHED (localhost:3338) ===');
const browser2 = await chromium.launch({ headless: false });
const page2 = await browser2.newPage();

let patchedConsole = [];
page2.on('console', msg => {
  if (msg.text().includes('[PATCHED]')) {
    patchedConsole.push(msg.text());
    console.log('[browser]', msg.text());
  }
});

await page2.goto('http://localhost:3338', { waitUntil: 'networkidle' });
await page2.waitForTimeout(2000);

console.log('Patched console messages:', patchedConsole.length);

await page2.click('text=/start using photopea/i');
await page2.waitForTimeout(2000);

const patched = await page2.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('*')).filter(el => {
    const text = el.textContent || '';
    return text.toLowerCase().includes('new project') && el.children.length === 0;
  });

  return {
    hasNewProjectButton: buttons.length > 0,
    buttonText: buttons[0]?.textContent,
  };
});

console.log('Has New Project button:', patched.hasNewProjectButton);
console.log('Button text:', patched.buttonText);

console.log('\n\n=== COMPARISON ===');
console.log('Both have New Project button:', unpatched.hasNewProjectButton && patched.hasNewProjectButton);
console.log('Patches were logged:', patchedConsole.length > 0);

console.log('\nBrowsers staying open...');
await new Promise(() => {});
