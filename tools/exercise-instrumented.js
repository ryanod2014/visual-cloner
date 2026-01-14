#!/usr/bin/env node
/**
 * Exercise Instrumented Code to Capture I/O (v3)
 *
 * Uses script tag injection instead of eval() for better handling of large code.
 * Sets up stubs BEFORE loading code to prevent crashes.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INSTRUMENTED_FILE = path.join(__dirname, '..', 'instrumented', 'photopea-instrumented-v2.js');
const OUTPUT_DIR = path.join(__dirname, '..', 'captured-io', 'instrumented');

// Stubs that need to be defined BEFORE loading the instrumented code
const STUBS_CODE = `
// === STUB DEPENDENCIES (must be before instrumented code) ===

// StringUtils - DOM helper (must be constructor-compatible)
window.StringUtils = {
  // w must work both as function and constructor
  w: function(tag, className) {
    const el = document.createElement(tag || 'div');
    if (className) el.className = className;
    if (new.target) return el; // constructor call
    return el; // regular call
  },
  i: function(el, style) { if (el) el.style.cssText = style; },
  Y5: function() { return window.devicePixelRatio || 1; },
  zP: function(el) { if (el) el.innerHTML = ''; },
  qX: function(s) { return String(s).replace(/</g, '&lt;'); },
  Wa: function() { return {}; },
  mU: function() { return ''; },
  Vt: function() { return {}; },
  r3: function() {},
  Rv: function() { return null; },
  WP: function() { return null; },
};

// ImageFilters (image processing filters)
window.ImageFilters = {
  gaussianBlur: function(data, w, h, r) { return data; },
  convolve: function(data, w, h, k) { return data; },
  grayscale: function(data) { return data; },
  brightness: function(data, v) { return data; },
  contrast: function(data, v) { return data; },
  levels: function(data, s, m, h) { return data; },
  curves: function(data, c) { return data; },
  hsl: function(data, h, s, l) { return data; },
  colorBalance: function(data) { return data; },
  sharpen: function(data, v) { return data; },
  unsharpMask: function(data, a, r, t) { return data; },
};

// CanvasUtils
window.CanvasUtils = {
  cx: function() { return document.getElementById('testCanvas')?.getContext('2d'); },
  create: function(w, h) {
    const c = document.createElement('canvas');
    c.width = w || 256; c.height = h || 256;
    return c;
  },
  getData: function(c) { return c?.getContext('2d')?.getImageData(0, 0, c.width, c.height); },
  putData: function(c, d) { c?.getContext('2d')?.putImageData(d, 0, 0); },
};

window.ColorMath = { E: { f: null, b: null, l: null } };
window.DOMHelpers = { a2m: function() {} };
window.WebGLContext = { rN: false };
window.Localization = { get: function(s) { return s; } };
window.PIMG = { prsO: '' };
window.ko = { Gw: function() {} };
window.MatrixOps = { U2: { h1: function() {} } };

window.hs = function(arr, idx) { return arr ? arr[idx] : 0; };
window.hl = {
  Wt: function() { return { pa: {} }; },
  mK: function() { return {}; },
  Xr: function() {},
  _r: function() {},
};

// Global arrays/objects
window.array = [];
window.array1 = [[255,0,0], [0,255,0], [0,0,255]];
window.array3 = [];
window.array5 = new Uint8Array(100);
window.obj = {};
window.obj4 = {};
window.obj16 = { xA: function() { return 0; } };
window.obj24 = { Aa: function() { return false; }, yT: function() {} };
window.num = 0;
window.num1 = 0;
window.num2 = 0;
window.num3 = 0;
window.num9 = 0;
window.i = [];
window.s = {};
window.V = { Gl: function() { return []; } };
window.A = { N1: { QS: function() { return {}; }, Jq: function() { return {}; } }, R: { am: function() { return {}; } }, hK: { q_: function() { return {}; } } };
window.U = { nK: function(p) { return p; } };
window.Constants = {};
window.fg = {};
window.q = { Fo: function() {} };

console.log('[STUBS] Dependencies initialized');
`;

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Exercise Instrumented Code & Capture I/O (v3)       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Read instrumented code
  console.log('Loading instrumented code...');
  const instrumentedCode = fs.readFileSync(INSTRUMENTED_FILE, 'utf8');
  console.log(`  Size: ${(instrumentedCode.length / 1024).toFixed(1)} KB\n`);

  // Launch browser with longer timeout
  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    timeout: 60000
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen for console messages
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`  [Browser Error] ${msg.text()}`);
    }
  });

  // Listen for page crashes
  page.on('crash', () => {
    console.log('  [Browser] Page crashed!');
  });

  // Create HTML with canvas
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head><title>I/O Capture</title></head>
    <body>
      <canvas id="testCanvas" width="256" height="256"></canvas>
      <div id="testDiv"></div>
    </body>
    </html>
  `);

  console.log('Injecting stubs...');

  // Step 1: Inject stubs FIRST
  await page.addScriptTag({ content: STUBS_CODE });

  console.log('Injecting instrumented code via script tag...');

  // Step 2: Inject instrumented code via script tag (safer than eval for large code)
  try {
    await page.addScriptTag({
      content: instrumentedCode,
      type: 'text/javascript'
    });
    console.log('  Code injected successfully\n');
  } catch (e) {
    console.error('  Failed to inject code:', e.message);
    await browser.close();
    return;
  }

  // Step 3: Get the exact list of wrapped functions from instrumented code
  // (Extract from the __wrapFn calls)
  const wrappedFunctions = instrumentedCode
    .match(/__wrapFn\([^,]+,/g)
    ?.map(m => m.replace('__wrapFn(', '').replace(',', '').trim()) || [];

  console.log(`Found ${wrappedFunctions.length} wrapped functions to exercise\n`);

  // Step 4: Exercise functions
  console.log('Exercising functions...');

  const results = await page.evaluate((targetFunctions) => {
    const logs = [];
    const log = (msg) => logs.push(msg);

    // Check if capture runtime is available
    if (!window.__capture) {
      log('ERROR: __capture runtime not found');
      return { logs, error: 'Capture runtime not found', results: {} };
    }

    log('Capture runtime detected');

    // Create test objects
    const testObjects = {
      uint8: [
        new Uint8Array([0, 0, 0, 255]),
        new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]),
        new Uint8Array(16).fill(128),
      ],
      float32: [
        new Float32Array([0, 0.5, 1]),
        new Float32Array(16).fill(0).map((_, i) => i / 16),
      ],
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
      rects: [
        { x: 0, y: 0, s: 100, H: 100 },
      ],
      canvas: document.getElementById('testCanvas'),
      ctx: document.getElementById('testCanvas').getContext('2d'),
      element: document.getElementById('testDiv'),
    };

    // Reduced input combinations for speed
    const inputCombos = [
      [],
      [0],
      [0, 0],
      [0, 0, 0, 0],
      [255, 255, 255, 255],
      [null],
      [''],
      ['test'],
      [testObjects.uint8[0]],
      [testObjects.points[0]],
      [testObjects.rects[0]],
      [testObjects.canvas],
      [testObjects.ctx],
      [0.5],
    ];

    let exercised = 0;
    let errors = 0;
    let captured = 0;

    // Only exercise the wrapped functions (not all window functions)
    for (let i = 0; i < targetFunctions.length; i++) {
      const name = targetFunctions[i];
      const fn = window[name];

      if (typeof fn !== 'function') continue;

      // Log progress every 50 functions
      if (i > 0 && i % 50 === 0) {
        log(`Progress: ${i}/${targetFunctions.length} functions...`);
      }

      // Try as constructor
      for (const args of inputCombos.slice(0, 5)) {
        try {
          new fn(...args);
          exercised++;
        } catch (e) {
          errors++;
        }
      }

      // Try as regular function
      for (const args of inputCombos) {
        try {
          fn.apply(null, args);
          exercised++;
        } catch (e) {
          errors++;
        }
      }
    }

    log(`Total calls: ${exercised}, Errors caught: ${errors}`);

    // Get captured results
    const capturedResults = window.__capture.getData();
    const capturedCount = Object.keys(capturedResults).length;
    const totalPairs = Object.values(capturedResults).reduce((sum, r) => sum + (r.results?.length || 0), 0);

    log(`Captured ${capturedCount} functions with ${totalPairs} I/O pairs`);

    return {
      logs,
      results: capturedResults,
      stats: {
        functions: capturedCount,
        pairs: totalPairs,
        exercised,
        errors
      }
    };
  }, wrappedFunctions);

  // Log results
  console.log('\n=== Execution Log ===');
  results.logs.forEach(l => console.log(`  ${l}`));

  console.log('\n=== Results ===');
  console.log(`Functions captured: ${results.stats?.functions || 0}`);
  console.log(`Total I/O pairs: ${results.stats?.pairs || 0}`);
  console.log(`Calls exercised: ${results.stats?.exercised || 0}`);
  console.log(`Errors caught: ${results.stats?.errors || 0}`);

  // Save results
  if (results.results && Object.keys(results.results).length > 0) {
    console.log('\nSaving results...');

    // Save individual files
    for (const [name, data] of Object.entries(results.results)) {
      const successes = data.results?.filter(r => !r.error) || [];
      if (successes.length > 0) {
        fs.writeFileSync(
          path.join(OUTPUT_DIR, `${name}.json`),
          JSON.stringify(data, null, 2)
        );
      }
    }

    // Save combined file
    fs.writeFileSync(
      path.join(OUTPUT_DIR, '_all.json'),
      JSON.stringify(results.results, null, 2)
    );

    console.log(`Output: ${OUTPUT_DIR}`);
  }

  await browser.close();

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Functions with I/O: ${results.stats?.functions || 0}`);
  console.log(`Total I/O pairs: ${results.stats?.pairs || 0}`);
}

main().catch(err => { console.error(err); process.exit(1); });
