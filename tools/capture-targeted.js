#!/usr/bin/env node
/**
 * Targeted Function Capture
 *
 * Captures specific functions with known-good test inputs.
 * Fast and reliable.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.join(__dirname, '..', 'captured-io');

// Define specific test cases for each function
const FUNCTION_TESTS = `
window.__FUNCTION_TESTS__ = {
  'FFT.init': {
    tests: [
      { args: [8], desc: '8-point FFT' },
      { args: [16], desc: '16-point FFT' },
      { args: [64], desc: '64-point FFT' },
      { args: [256], desc: '256-point FFT' }
    ]
  },
  'FFT.fft2d': {
    tests: [
      {
        args: [new Float64Array([1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]), new Float64Array(16)],
        desc: '4x4 impulse'
      },
      {
        args: [new Float64Array([1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1]), new Float64Array(16)],
        desc: '4x4 DC'
      }
    ]
  },
  'pako.deflate': {
    tests: [
      { args: [new Uint8Array([72,101,108,108,111])], desc: '"Hello"' },
      { args: [new Uint8Array(100).fill(65)], desc: '100 x "A"' },
      { args: [new Uint8Array([1,2,3,4,5,6,7,8,9,10])], desc: 'bytes 1-10' },
      { args: [new TextEncoder().encode(JSON.stringify({a:1,b:2}))], desc: 'JSON' }
    ]
  },
  'pako.inflate': {
    setup: () => {
      // Create compressed data to decompress
      window.__compressed1 = pako.deflate(new Uint8Array([72,101,108,108,111]));
      window.__compressed2 = pako.deflate(new Uint8Array(100).fill(65));
    },
    tests: [
      { args: [window.__compressed1], desc: 'decompress "Hello"' },
      { args: [window.__compressed2], desc: 'decompress 100 x "A"' }
    ]
  },
  'UPNG.encode': {
    tests: [
      {
        args: [[new Uint8Array([255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,0,255])], 2, 2, 0],
        desc: '2x2 RGBA'
      },
      {
        args: [[new Uint8Array(16*16*4).fill(128)], 16, 16, 0],
        desc: '16x16 gray'
      }
    ]
  },
  'UZIP.deflate': {
    tests: [
      { args: [new Uint8Array([1,2,3,4,5])], desc: 'bytes 1-5' },
      { args: [new Uint8Array(50).fill(42)], desc: '50 x 42' }
    ]
  },
  'UZIP.inflate': {
    setup: () => {
      window.__uzipComp = UZIP.deflate(new Uint8Array([1,2,3,4,5]));
    },
    tests: [
      { args: [window.__uzipComp, new Uint8Array(5)], desc: 'decompress 1-5' }
    ]
  },
  'UZIP.adler': {
    tests: [
      { args: [new Uint8Array([1,2,3,4,5]), 0, 5], desc: 'adler32 of 1-5' },
      { args: [new Uint8Array([72,101,108,108,111]), 0, 5], desc: 'adler32 of Hello' }
    ]
  },
  'UZIP.crc': {
    tests: [
      { args: [new Uint8Array([1,2,3,4,5]), 0, 5], desc: 'crc32 of 1-5' },
      { args: [new Uint8Array([72,101,108,108,111]), 0, 5], desc: 'crc32 of Hello' }
    ]
  },

  // Typr - font parsing
  'Typr.findTable': {
    tests: [
      { args: [{tables:{}}, 'head'], desc: 'find head table (empty)' },
      { args: [{tables:{head:{}}}, 'head'], desc: 'find head table (exists)' }
    ]
  },

  // UTIF - TIFF encoding
  'UTIF.encodeImage': {
    tests: [
      {
        args: [new Uint8Array([255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,0,255]), 2, 2],
        desc: '2x2 RGBA as TIFF'
      }
    ]
  },

  // ICC color profiles
  'ICC.parse': {
    tests: [
      { args: [new Uint8Array(128)], desc: 'empty ICC profile' }
    ]
  },

  // UDOC
  'UDOC.getState': {
    tests: [
      { args: [], desc: 'get state' }
    ]
  }
};
`;

const CAPTURE_SCRIPT = `
window.__CAPTURE_TARGETED__ = function() {
  const results = {};
  const errors = [];

  function serialize(val, depth = 0) {
    if (depth > 3) return '[MAX_DEPTH]';
    if (val === null) return null;
    if (val === undefined) return undefined;
    if (typeof val === 'function') return '[Function]';
    if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') return val;
    if (ArrayBuffer.isView(val)) {
      return { __type: val.constructor.name, length: val.length, data: Array.from(val.slice(0, 200)) };
    }
    if (Array.isArray(val)) {
      return val.slice(0, 50).map(v => serialize(v, depth + 1));
    }
    if (typeof val === 'object') {
      const obj = {};
      for (const k of Object.keys(val).slice(0, 30)) {
        try { obj[k] = serialize(val[k], depth + 1); } catch(e) { obj[k] = '[Error]'; }
      }
      return obj;
    }
    return String(val);
  }

  function getFunction(path) {
    const parts = path.split('.');
    let obj = window;
    for (const p of parts) {
      obj = obj[p];
      if (!obj) return null;
    }
    return obj;
  }

  for (const [funcPath, config] of Object.entries(window.__FUNCTION_TESTS__)) {
    const fn = getFunction(funcPath);
    if (!fn) {
      errors.push({ function: funcPath, error: 'Function not found' });
      continue;
    }

    // Run setup if needed
    if (config.setup) {
      try { config.setup(); } catch (e) { errors.push({ function: funcPath, error: 'Setup failed: ' + e.message }); }
    }

    const captured = [];
    for (const test of config.tests) {
      console.log('[Test] ' + funcPath + ': ' + test.desc);
      try {
        const args = typeof test.args === 'function' ? test.args() : test.args;
        const output = fn.apply(null, args);
        captured.push({
          description: test.desc,
          input: args.map(a => serialize(a)),
          output: serialize(output),
          error: null
        });
      } catch (e) {
        captured.push({
          description: test.desc,
          input: null,
          output: null,
          error: e.message
        });
      }
    }

    results[funcPath] = {
      function: funcPath,
      namespace: funcPath.split('.')[0],
      results: captured
    };
  }

  return { results, errors };
};
`;

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Targeted Function Capture                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.text().startsWith('[')) console.log(msg.text());
  });

  console.log('Loading Photopea...');
  await page.goto('https://www.photopea.com/');
  await page.waitForTimeout(3000);

  console.log('Triggering app load...');
  await page.evaluate(() => { if (typeof addPP === 'function') addPP(); });

  console.log('Waiting for APIs...');
  for (let i = 0; i < 30; i++) {
    const ready = await page.evaluate(() => typeof pako !== 'undefined' && typeof FFT !== 'undefined');
    if (ready) { console.log('APIs ready!\n'); break; }
    await page.waitForTimeout(1000);
  }

  console.log('Injecting tests...');
  await page.evaluate(FUNCTION_TESTS);
  await page.evaluate(CAPTURE_SCRIPT);

  console.log('\n' + '='.repeat(50));
  console.log('RUNNING TESTS');
  console.log('='.repeat(50) + '\n');

  const { results, errors } = await page.evaluate(() => window.__CAPTURE_TARGETED__());

  // Save results
  console.log('\n' + '='.repeat(50));
  console.log('SAVING');
  console.log('='.repeat(50) + '\n');

  for (const [funcName, data] of Object.entries(results)) {
    const safeName = funcName.replace('.', '_');
    const outputPath = path.join(OUTPUT_DIR, `${safeName}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`  ${funcName}: ${data.results.length} tests → ${safeName}.json`);
  }

  // Save all
  const allPath = path.join(OUTPUT_DIR, '_targeted_all.json');
  fs.writeFileSync(allPath, JSON.stringify(results, null, 2));

  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  console.log(`Functions tested: ${Object.keys(results).length}`);
  console.log(`Errors: ${errors.length}`);
  if (errors.length) console.log('Errors:', errors);

  await browser.close();
  console.log('\nDone!');
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
