#!/usr/bin/env node
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

console.log('Opening Photopea clone at localhost:3333...');
await page.goto('http://localhost:3333', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(5000);

// Check if app loaded
const hasCanvas = await page.evaluate(() => {
  return document.querySelector('canvas') !== null;
});
console.log('Has canvas:', hasCanvas);

const bodyLength = await page.evaluate(() => document.body.innerHTML.length);
console.log('Body HTML length:', bodyLength);

// Take screenshot
await page.screenshot({ path: 'output/photopea-test.png' });
console.log('Screenshot saved to output/photopea-test.png');

// Test navigation to /learn
console.log('\nNavigating to /learn...');
await page.goto('http://localhost:3333/learn', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

await page.screenshot({ path: 'output/photopea-learn.png' });
console.log('Screenshot saved to output/photopea-learn.png');

// Test navigation to /templates
console.log('\nNavigating to /templates...');
await page.goto('http://localhost:3333/templates', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

await page.screenshot({ path: 'output/photopea-templates.png' });
console.log('Screenshot saved to output/photopea-templates.png');

console.log('\nAll pages loaded successfully!');
await browser.close();
