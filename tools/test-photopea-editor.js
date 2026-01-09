#!/usr/bin/env node
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

console.log('Opening Photopea clone...');
await page.goto('http://localhost:3333', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2000);

// Click "Start using Photopea" button
console.log('Clicking "Start using Photopea"...');
await page.click('text=Start using Photopea');
await page.waitForTimeout(10000); // Editor takes time to load

// Check if editor loaded
const hasCanvas = await page.evaluate(() => {
  return document.querySelector('canvas') !== null;
});
console.log('Has canvas (editor loaded):', hasCanvas);

const hasToolbar = await page.evaluate(() => {
  // Look for Photopea-specific UI elements
  const menuBar = document.querySelector('[class*="menu"]');
  const toolbar = document.querySelector('[class*="tool"]');
  return menuBar !== null || toolbar !== null;
});
console.log('Has toolbar:', hasToolbar);

await page.screenshot({ path: 'output/photopea-editor.png' });
console.log('Screenshot saved to output/photopea-editor.png');

await browser.close();
