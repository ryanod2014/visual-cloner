#!/usr/bin/env node
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

console.log('Loading Photopea...');
await page.goto('https://www.photopea.com/');
await page.waitForTimeout(5000);

// Trigger the main app to load by calling addPP()
console.log('Triggering app load via addPP()...');
await page.evaluate(() => {
  if (typeof addPP === 'function') addPP();
});

// Wait for the main scripts to load and execute
console.log('Waiting for app initialization...');
for (let i = 0; i < 60; i++) {
  const apis = await page.evaluate(() => ({
    UPNG: typeof UPNG !== 'undefined',
    FFT: typeof FFT !== 'undefined',
    pako: typeof pako !== 'undefined'
  }));
  if (apis.UPNG && apis.FFT && apis.pako) {
    console.log('APIs loaded after', i, 'seconds');
    break;
  }
  await page.waitForTimeout(1000);
  process.stdout.write('.');
}

// Check specifically for our target APIs
const targetAPIs = await page.evaluate(() => {
  const targets = ['FFT', 'UPNG', 'pako', 'Typr', 'UZIP', 'UDOC', 'UTIF', 'UGIF', 'LZMA'];
  const result = {};
  for (const name of targets) {
    if (typeof window[name] !== 'undefined') {
      result[name] = Object.keys(window[name]);
    }
  }
  return result;
});
console.log('\nTarget APIs found:', JSON.stringify(targetAPIs, null, 2));

// Get all window keys
const allKeys = await page.evaluate(() => {
  const defaultKeys = new Set(['window','self','document','location','navigator','history','screen','crypto','performance','console','CSS','fetch','alert','confirm','prompt','open','close','focus','blur','print','postMessage','addEventListener','removeEventListener','dispatchEvent']);
  const keys = Object.keys(window).filter(k => {
    if (defaultKeys.has(k)) return false;
    if (k.startsWith('webkit')) return false;
    if (k.startsWith('on')) return false;
    return true;
  });
  return keys;
});

console.log('Non-default window keys (' + allKeys.length + '):\n', allKeys.join(', '));

// Check for iframes
const frameCount = await page.evaluate(() => document.getElementsByTagName('iframe').length);
console.log('\nIframes found:', frameCount);

// Check for Web Workers
const workers = await page.evaluate(() => {
  // Can't directly enumerate workers, but check if Worker was used
  return typeof Worker !== 'undefined' ? 'Worker available' : 'No Worker';
});
console.log('Workers:', workers);

// Check what ppinst contains (it's the main Photopea instance)
const ppCheck = await page.evaluate(() => {
  if (typeof pp !== 'undefined') return { pp: Object.keys(pp).slice(0, 50) };
  if (typeof ppinst !== 'undefined') return { ppinst: Object.keys(ppinst).slice(0, 50) };
  if (typeof Photopea !== 'undefined') return { Photopea: Object.keys(Photopea).slice(0, 50) };
  return 'No pp/ppinst/Photopea found';
});
console.log('\nPhotopea instance:', JSON.stringify(ppCheck, null, 2));

// Check Photopea-specific globals
const ppGlobals = await page.evaluate(() => {
  const result = {};

  // Check ppp
  if (typeof ppp !== 'undefined') {
    result.ppp = {
      type: typeof ppp,
      keys: typeof ppp === 'object' ? Object.keys(ppp).slice(0, 100) : null
    };
  }

  // Check addPP
  if (typeof addPP !== 'undefined') {
    result.addPP = {
      type: typeof addPP,
      source: addPP.toString().slice(0, 500)
    };
  }

  // Check cap
  if (typeof cap !== 'undefined') {
    result.cap = { type: typeof cap };
  }

  // Check ls
  if (typeof ls !== 'undefined') {
    result.ls = { type: typeof ls };
  }

  // Look for WASM modules or other potential API containers
  const suspiciousKeys = ['Module', 'HEAPU8', 'asm', 'wasm', 'wasmMemory', 'wasmTable'];
  for (const key of suspiciousKeys) {
    if (typeof window[key] !== 'undefined') {
      result[key] = { type: typeof window[key] };
    }
  }

  return result;
});
console.log('\nPhotopea globals:', JSON.stringify(ppGlobals, null, 2));

// Try to find where the image processing happens
const canvasCheck = await page.evaluate(() => {
  const canvases = document.getElementsByTagName('canvas');
  return {
    count: canvases.length,
    sizes: Array.from(canvases).slice(0, 5).map(c => c.width + 'x' + c.height)
  };
});
console.log('\nCanvases:', canvasCheck);

await browser.close();
