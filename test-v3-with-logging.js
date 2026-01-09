#!/usr/bin/env node
import { chromium } from 'playwright';

console.log('Loading http://localhost:3342/?test=1 to see what gets requested...\n');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

console.log('Loading page...');
await page.goto('http://localhost:3342/?test=1', {
  waitUntil: 'domcontentloaded',
  timeout: 60000
});

console.log('✅ Page loaded. Waiting 15 seconds for scripts to load...');
await page.waitForTimeout(15000);

console.log('\nCheck the server logs (other terminal) to see what was requested.');
console.log('Browser staying open...\n');
await new Promise(() => {});
