#!/usr/bin/env node
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

console.log('Opening proxy at localhost:3333...');
await page.goto('http://localhost:3333', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);

// Close the welcome modal by pressing Escape
console.log('Closing welcome modal (Escape)...');
await page.keyboard.press('Escape');
await page.waitForTimeout(1000);

// Select the rectangle tool (keyboard shortcut)
console.log('Selecting rectangle tool (press R)...');
await page.keyboard.press('r');
await page.waitForTimeout(500);

// Draw a rectangle using force click
console.log('Drawing a rectangle...');
const canvas = page.locator('canvas').first();
await canvas.click({ position: { x: 300, y: 300 }, force: true });
await page.mouse.move(300, 300);
await page.mouse.down();
await page.mouse.move(600, 500);
await page.mouse.up();
await page.waitForTimeout(1000);

// Select the ellipse tool
console.log('Selecting ellipse tool (press O)...');
await page.keyboard.press('o');
await page.waitForTimeout(500);

// Draw an ellipse
console.log('Drawing an ellipse...');
await page.mouse.move(700, 300);
await page.mouse.down();
await page.mouse.move(900, 450);
await page.mouse.up();
await page.waitForTimeout(1000);

// Take screenshot
await page.screenshot({ path: 'output/proxy-drawing-test.png' });
console.log('Screenshot saved to output/proxy-drawing-test.png');

console.log('Drawing test complete!');

await browser.close();
