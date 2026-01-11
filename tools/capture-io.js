#!/usr/bin/env node
/**
 * Function I/O Capture Tool
 *
 * Captures input/output pairs from running Photopea functions.
 * Uses Playwright to load Photopea and execute functions in their native runtime.
 *
 * Usage:
 *   node capture-io.js                    # Capture all known functions
 *   node capture-io.js FFT.fft2d          # Capture specific function
 *   node capture-io.js --list             # List available functions
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, '..', 'captured-io');

// Function definitions with test generators
const FUNCTION_SPECS = {
  'FFT.init': {
    namespace: 'FFT',
    params: [{ name: 'size', type: 'number' }],
    returnType: 'void',
    testInputs: [
      [4], [8], [16], [32], [64], [128], [256]
    ]
  },

  'FFT.fft2d': {
    namespace: 'FFT',
    params: [
      { name: 'real', type: 'Float64Array' },
      { name: 'imag', type: 'Float64Array' }
    ],
    returnType: 'void (in-place)',
    setup: 'FFT.init(8)', // 8x8 = 64 elements
    testInputs: () => {
      const inputs = [];

      // Sine wave
      const real1 = Array(64).fill(0).map((_, i) => Math.sin(i * 0.5));
      const imag1 = Array(64).fill(0);
      inputs.push([real1, imag1]);

      // Cosine wave
      const real2 = Array(64).fill(0).map((_, i) => Math.cos(i * 0.3));
      const imag2 = Array(64).fill(0);
      inputs.push([real2, imag2]);

      // Square wave
      const real3 = Array(64).fill(0).map((_, i) => i % 8 < 4 ? 1 : -1);
      const imag3 = Array(64).fill(0);
      inputs.push([real3, imag3]);

      // Impulse
      const real4 = Array(64).fill(0);
      real4[0] = 1;
      const imag4 = Array(64).fill(0);
      inputs.push([real4, imag4]);

      // Random
      const real5 = Array(64).fill(0).map(() => Math.random() * 2 - 1);
      const imag5 = Array(64).fill(0);
      inputs.push([real5, imag5]);

      // Gradient
      const real6 = Array(64).fill(0).map((_, i) => i / 64);
      const imag6 = Array(64).fill(0);
      inputs.push([real6, imag6]);

      return inputs;
    }
  },

  'FFT.ifft2d': {
    namespace: 'FFT',
    params: [
      { name: 'real', type: 'Float64Array' },
      { name: 'imag', type: 'Float64Array' }
    ],
    returnType: 'void (in-place)',
    setup: 'FFT.init(8)',
    testInputs: () => {
      // Use FFT outputs as inputs for inverse
      const inputs = [];

      // DC component only
      const real1 = Array(64).fill(0);
      real1[0] = 64; // DC = sum of signal
      const imag1 = Array(64).fill(0);
      inputs.push([real1, imag1]);

      // Single frequency
      const real2 = Array(64).fill(0);
      real2[1] = 32;
      real2[63] = 32;
      const imag2 = Array(64).fill(0);
      inputs.push([real2, imag2]);

      return inputs;
    }
  },

  'UPNG.encode': {
    namespace: 'UPNG',
    params: [
      { name: 'imgs', type: 'ArrayBuffer[]' },
      { name: 'w', type: 'number' },
      { name: 'h', type: 'number' },
      { name: 'cnum', type: 'number' }
    ],
    returnType: 'ArrayBuffer',
    testInputs: () => {
      const inputs = [];

      // 2x2 red
      const red2x2 = Array(16).fill(0);
      for (let i = 0; i < 4; i++) { red2x2[i*4] = 255; red2x2[i*4+3] = 255; }
      inputs.push([[red2x2], 2, 2, 0]);

      // 4x4 gradient
      const grad4x4 = Array(64).fill(0);
      for (let i = 0; i < 16; i++) {
        const v = Math.floor(i / 16 * 255);
        grad4x4[i*4] = v; grad4x4[i*4+1] = v; grad4x4[i*4+2] = v; grad4x4[i*4+3] = 255;
      }
      inputs.push([[grad4x4], 4, 4, 0]);

      // 8x8 checkerboard
      const check8x8 = Array(256).fill(0);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const i = (y * 8 + x) * 4;
          const white = (x + y) % 2 === 0;
          check8x8[i] = check8x8[i+1] = check8x8[i+2] = white ? 255 : 0;
          check8x8[i+3] = 255;
        }
      }
      inputs.push([[check8x8], 8, 8, 0]);

      // 4x4 with alpha
      const alpha4x4 = Array(64).fill(0);
      for (let i = 0; i < 16; i++) {
        alpha4x4[i*4] = 255; // Red
        alpha4x4[i*4+3] = Math.floor(i / 16 * 255); // Gradient alpha
      }
      inputs.push([[alpha4x4], 4, 4, 0]);

      // 16x16 rainbow
      const rainbow = Array(1024).fill(0);
      for (let i = 0; i < 256; i++) {
        const hue = (i / 256) * 360;
        const [r, g, b] = hslToRgb(hue, 1, 0.5);
        rainbow[i*4] = r; rainbow[i*4+1] = g; rainbow[i*4+2] = b; rainbow[i*4+3] = 255;
      }
      inputs.push([[rainbow], 16, 16, 0]);

      return inputs;
    }
  },

  'UPNG.decode': {
    namespace: 'UPNG',
    params: [{ name: 'buff', type: 'ArrayBuffer' }],
    returnType: '{ width, height, data, ... }',
    // Test inputs will be PNG buffers - we'll generate them from encode
    testInputs: 'from_encode'
  },

  'UPNG.toRGBA8': {
    namespace: 'UPNG',
    params: [{ name: 'img', type: 'UPNG.decode result' }],
    returnType: 'ArrayBuffer[]',
    testInputs: 'from_decode'
  },

  'pako.deflate': {
    namespace: 'pako',
    params: [{ name: 'data', type: 'Uint8Array' }],
    returnType: 'Uint8Array',
    testInputs: () => {
      const inputs = [];

      // Simple string
      inputs.push([Array.from(new TextEncoder().encode('Hello, World!'))]);

      // Repeated pattern (high compression)
      inputs.push([Array(100).fill(65)]); // 'AAAA...'

      // Random data (low compression)
      inputs.push([Array(100).fill(0).map(() => Math.floor(Math.random() * 256))]);

      // Binary data
      inputs.push([Array(256).fill(0).map((_, i) => i)]);

      // JSON-like
      const json = JSON.stringify({ name: 'test', values: [1, 2, 3, 4, 5] });
      inputs.push([Array.from(new TextEncoder().encode(json))]);

      return inputs;
    }
  },

  'pako.inflate': {
    namespace: 'pako',
    params: [{ name: 'data', type: 'Uint8Array' }],
    returnType: 'Uint8Array',
    testInputs: 'from_deflate'
  }
};

// Helper: HSL to RGB
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

async function captureFunction(page, funcName, spec) {
  console.log(`\nCapturing: ${funcName}`);

  const results = {
    function: funcName,
    namespace: spec.namespace,
    params: spec.params,
    returnType: spec.returnType || 'unknown',
    capturedAt: new Date().toISOString(),
    results: []
  };

  // Get test inputs
  let testInputs;
  if (typeof spec.testInputs === 'function') {
    testInputs = spec.testInputs();
  } else if (spec.testInputs === 'from_encode') {
    // Generate PNG buffers from UPNG.encode results
    testInputs = await generatePngInputs(page);
  } else if (spec.testInputs === 'from_decode') {
    // Generate decoded images for toRGBA8
    testInputs = await generateDecodedInputs(page);
  } else if (spec.testInputs === 'from_deflate') {
    // Generate compressed data for inflate
    testInputs = await generateDeflatedInputs(page);
  } else {
    testInputs = spec.testInputs;
  }

  console.log(`  Running ${testInputs.length} test cases...`);

  for (let i = 0; i < testInputs.length; i++) {
    const input = testInputs[i];

    try {
      const result = await page.evaluate(async ({ funcName, input, setup }) => {
        // Run setup if needed
        if (setup) {
          eval(setup);
        }

        // Parse function path
        const parts = funcName.split('.');
        let fn = window;
        for (const part of parts) {
          fn = fn[part];
        }

        // Convert arrays back to typed arrays if needed
        const processedInput = input.map((arg, idx) => {
          if (Array.isArray(arg) && funcName.includes('fft')) {
            return new Float64Array(arg);
          }
          if (Array.isArray(arg) && funcName.includes('UPNG.encode')) {
            // First arg is array of buffers
            if (idx === 0) {
              return arg.map(a => new Uint8Array(a).buffer);
            }
          }
          if (Array.isArray(arg) && funcName.includes('pako')) {
            return new Uint8Array(arg);
          }
          return arg;
        });

        // Call the function
        const startTime = performance.now();
        let output;

        if (funcName.includes('fft2d') || funcName.includes('ifft2d')) {
          // In-place transform
          fn(processedInput[0], processedInput[1]);
          output = {
            real: Array.from(processedInput[0]),
            imag: Array.from(processedInput[1])
          };
        } else {
          output = fn(...processedInput);
        }

        const duration = performance.now() - startTime;

        // Convert output to serializable form
        let serializedOutput;
        if (output instanceof ArrayBuffer) {
          serializedOutput = { type: 'ArrayBuffer', data: Array.from(new Uint8Array(output)) };
        } else if (output instanceof Uint8Array) {
          serializedOutput = { type: 'Uint8Array', data: Array.from(output) };
        } else if (Array.isArray(output) && output[0] instanceof ArrayBuffer) {
          serializedOutput = { type: 'ArrayBuffer[]', data: output.map(b => Array.from(new Uint8Array(b))) };
        } else if (output && typeof output === 'object') {
          // UPNG.decode result
          serializedOutput = {
            width: output.width,
            height: output.height,
            depth: output.depth,
            ctype: output.ctype,
            frames: output.frames?.length,
            data: output.data ? Array.from(new Uint8Array(output.data)).slice(0, 100) : null
          };
        } else {
          serializedOutput = output;
        }

        return {
          success: true,
          output: serializedOutput,
          duration
        };
      }, { funcName, input, setup: spec.setup });

      results.results.push({
        input: input,
        output: result.output,
        duration: result.duration,
        error: null
      });

      process.stdout.write('.');
    } catch (err) {
      results.results.push({
        input: input,
        output: null,
        error: err.message
      });
      process.stdout.write('x');
    }
  }

  console.log(` Done (${results.results.filter(r => !r.error).length}/${results.results.length} passed)`);

  return results;
}

async function generatePngInputs(page) {
  // Generate PNG buffers using UPNG.encode
  const pngBuffers = await page.evaluate(() => {
    const results = [];

    // 2x2 red
    const red = new Uint8Array(16);
    for (let i = 0; i < 4; i++) { red[i*4] = 255; red[i*4+3] = 255; }
    results.push(Array.from(new Uint8Array(UPNG.encode([red.buffer], 2, 2, 0))));

    // 4x4 blue
    const blue = new Uint8Array(64);
    for (let i = 0; i < 16; i++) { blue[i*4+2] = 255; blue[i*4+3] = 255; }
    results.push(Array.from(new Uint8Array(UPNG.encode([blue.buffer], 4, 4, 0))));

    // 8x8 gradient
    const grad = new Uint8Array(256);
    for (let i = 0; i < 64; i++) {
      const v = Math.floor(i / 64 * 255);
      grad[i*4] = grad[i*4+1] = grad[i*4+2] = v; grad[i*4+3] = 255;
    }
    results.push(Array.from(new Uint8Array(UPNG.encode([grad.buffer], 8, 8, 0))));

    return results;
  });

  return pngBuffers.map(buf => [buf]);
}

async function generateDecodedInputs(page) {
  // First encode some PNGs, then decode them for toRGBA8 input
  return []; // Skip for now - complex dependency chain
}

async function generateDeflatedInputs(page) {
  // Generate compressed data using pako.deflate
  const deflated = await page.evaluate(() => {
    const results = [];

    // Simple text
    const text = new TextEncoder().encode('Hello, World! This is a test.');
    results.push(Array.from(pako.deflate(text)));

    // Repeated pattern
    const repeated = new Uint8Array(100).fill(65);
    results.push(Array.from(pako.deflate(repeated)));

    return results;
  });

  return deflated.map(buf => [buf]);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    console.log('Available functions:');
    for (const func of Object.keys(FUNCTION_SPECS)) {
      const spec = FUNCTION_SPECS[func];
      console.log(`  ${func}`);
      console.log(`    Params: ${spec.params.map(p => `${p.name}: ${p.type}`).join(', ')}`);
      console.log(`    Returns: ${spec.returnType || 'unknown'}`);
    }
    return;
  }

  const targetFuncs = args.filter(a => !a.startsWith('--'));
  const funcsToCapture = targetFuncs.length > 0
    ? targetFuncs.filter(f => FUNCTION_SPECS[f])
    : Object.keys(FUNCTION_SPECS);

  if (funcsToCapture.length === 0) {
    console.error('No valid functions specified');
    process.exit(1);
  }

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           Function I/O Capture Tool                       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Functions to capture: ${funcsToCapture.join(', ')}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Launch browser
  console.log('\nLaunching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Navigate to Photopea
  console.log('Loading Photopea...');
  await page.goto('https://www.photopea.com/', { waitUntil: 'networkidle' });

  // Wait for app to fully initialize (check for main script loaded)
  console.log('Waiting for app initialization...');
  await page.waitForFunction(() => {
    // Check if main app object exists
    return typeof window.Photopea !== 'undefined' ||
           document.querySelector('.panelrows') !== null;
  }, { timeout: 30000 }).catch(() => {});

  // Give extra time for all scripts to load
  await page.waitForTimeout(5000);

  // Verify APIs are available
  let available = await page.evaluate(() => {
    return {
      FFT: typeof FFT !== 'undefined',
      UPNG: typeof UPNG !== 'undefined',
      pako: typeof pako !== 'undefined',
      Typr: typeof Typr !== 'undefined'
    };
  });

  // If not available, check window properties more thoroughly
  if (!available.UPNG) {
    console.log('APIs not in global scope, searching...');
    const foundAPIs = await page.evaluate(() => {
      const found = {};
      // Search in window
      for (const key of Object.keys(window)) {
        if (key === 'UPNG' || key === 'FFT' || key === 'pako' || key === 'Typr') {
          found[key] = true;
        }
      }
      // Also check if they might be in a module
      if (typeof window.UPNG === 'undefined') {
        // Try to find in script evaluations
        const scripts = document.querySelectorAll('script');
        found.scriptCount = scripts.length;
      }
      return found;
    });
    console.log('Found in window:', foundAPIs);

    // Try waiting longer and checking again
    console.log('Waiting additional time...');
    await page.waitForTimeout(5000);

    available = await page.evaluate(() => {
      return {
        FFT: typeof FFT !== 'undefined',
        UPNG: typeof UPNG !== 'undefined',
        pako: typeof pako !== 'undefined',
        Typr: typeof Typr !== 'undefined',
        photopeaVersion: window.Photopea?.version
      };
    });
  }

  console.log('Available APIs:', available);

  // Capture each function
  const allResults = {};

  for (const funcName of funcsToCapture) {
    const spec = FUNCTION_SPECS[funcName];
    if (!spec) continue;

    // Check if namespace is available
    const nsAvailable = await page.evaluate((ns) => typeof window[ns] !== 'undefined', spec.namespace);
    if (!nsAvailable) {
      console.log(`\nSkipping ${funcName} - ${spec.namespace} not available`);
      continue;
    }

    const results = await captureFunction(page, funcName, spec);
    allResults[funcName] = results;

    // Save individual function results
    const safeFileName = funcName.replace(/\./g, '_');
    const outputPath = path.join(OUTPUT_DIR, `${safeFileName}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`  Saved to: ${outputPath}`);
  }

  // Save combined results
  const combinedPath = path.join(OUTPUT_DIR, '_all_functions.json');
  fs.writeFileSync(combinedPath, JSON.stringify(allResults, null, 2));
  console.log(`\nCombined results saved to: ${combinedPath}`);

  await browser.close();

  // Summary
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                       Summary                             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  let totalTests = 0;
  let totalPassed = 0;

  for (const [func, results] of Object.entries(allResults)) {
    const passed = results.results.filter(r => !r.error).length;
    const total = results.results.length;
    totalTests += total;
    totalPassed += passed;
    console.log(`  ${func}: ${passed}/${total} passed`);
  }

  console.log(`\nTotal: ${totalPassed}/${totalTests} test cases passed`);
  console.log(`Files saved to: ${OUTPUT_DIR}/`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
