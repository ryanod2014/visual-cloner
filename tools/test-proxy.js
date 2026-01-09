#!/usr/bin/env node
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') {
    consoleErrors.push(msg.text());
  }
});

page.on('pageerror', err => {
  consoleErrors.push('PAGE ERROR: ' + err.message);
});

console.log('Opening proxy at localhost:3333...');
await page.goto('http://localhost:3333', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(5000);

// Check what loaded
const rootContent = await page.evaluate(() => {
  const root = document.querySelector('#root');
  return root ? root.innerHTML.length : 0;
});
console.log('React root content length:', rootContent);

const canvasExists = await page.evaluate(() => {
  return document.querySelector('canvas') ? true : false;
});
console.log('Canvas exists:', canvasExists);

const toolbarExists = await page.evaluate(() => {
  const t1 = document.querySelector('[class*=toolbar]');
  const t2 = document.querySelector('[class*=Tool]');
  const t3 = document.querySelector('.Island');
  return t1 || t2 || t3 ? true : false;
});
console.log('Toolbar/Tools found:', toolbarExists);

console.log('Console errors:', consoleErrors.length);
if (consoleErrors.length > 0) {
  console.log('First 5 errors:');
  consoleErrors.slice(0, 5).forEach(e => console.log('  -', e.substring(0, 150)));
}

await page.screenshot({ path: 'output/proxy-test.png' });
console.log('Screenshot saved to output/proxy-test.png');

await browser.close();
