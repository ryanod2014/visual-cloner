#!/usr/bin/env node
import { chromium } from 'playwright';

console.log('Diagnosing patched Photopea DOM...\n');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.setDefaultTimeout(60000);

console.log('Loading page...');
await page.goto('http://localhost:3341/?test=1', {
  waitUntil: 'domcontentloaded',
  timeout: 60000
});
console.log('✅ Page loaded\n');

// Wait for initialization
console.log('Waiting 12 seconds for full initialization...');
await page.waitForTimeout(12000);

const info = await page.evaluate(() => {
  return {
    title: document.title,
    bodyText: document.body.textContent.substring(0, 200),
    buttonCount: document.querySelectorAll('button').length,
    divCount: document.querySelectorAll('div').length,
    scriptCount: document.querySelectorAll('script').length,
    hasCanvas: document.querySelectorAll('canvas').length > 0,

    // Look for buttons
    buttons: Array.from(document.querySelectorAll('button, [role="button"], a'))
      .slice(0, 20)
      .map(b => ({
        text: b.textContent.trim().substring(0, 30),
        visible: b.offsetParent !== null,
        tag: b.tagName
      })),

    // Check for Photopea globals
    globals: {
      J: typeof window.J,
      fj: typeof window.fj,
      gA: typeof window.gA
    },

    // Console errors
    errors: window.__errors || []
  };
});

console.log('=== DOM Analysis ===');
console.log('Title:', info.title);
console.log('Buttons:', info.buttonCount);
console.log('Divs:', info.divCount);
console.log('Scripts:', info.scriptCount);
console.log('Has canvas:', info.hasCanvas);

console.log('\n=== Globals ===');
console.log('window.J:', info.globals.J);
console.log('window.fj:', info.globals.fj);
console.log('window.gA:', info.globals.gA);

console.log('\n=== Visible Buttons ===');
info.buttons.filter(b => b.visible).forEach((b, i) => {
  console.log(`${i + 1}. [${b.tag}] "${b.text}"`);
});

console.log('\n=== Body Text (first 200 chars) ===');
console.log(info.bodyText);

console.log('\n\nSearching for "new" or "project"...');
const matches = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('*'));
  return all
    .filter(el => /new|project/i.test(el.textContent) && el.offsetParent !== null)
    .slice(0, 10)
    .map(el => ({
      tag: el.tagName,
      text: el.textContent.trim().substring(0, 50),
      classes: el.className
    }));
});

console.log('Found', matches.length, 'elements with "new" or "project":');
matches.forEach((m, i) => {
  console.log(`${i + 1}. <${m.tag}> "${m.text}"`);
});

console.log('\n\nBrowser staying open for manual inspection...\n');
await new Promise(() => {});
