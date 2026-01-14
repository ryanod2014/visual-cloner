#!/usr/bin/env node
/**
 * Comprehensive API I/O Capture Tool
 *
 * Captures input/output pairs from ALL exposed Photopea APIs.
 * Generates diverse test cases including edge cases.
 *
 * Usage:
 *   node capture-all-apis.js              # Capture all APIs
 *   node capture-all-apis.js --api=UPNG   # Capture specific API
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.join(__dirname, '..', 'captured-io');

// API definitions with test generators
const API_SPECS = {
  // ==================== FFT ====================
  FFT: {
    methods: {
      'init': {
        params: [{ name: 'size', type: 'number' }],
        testInputs: [[4], [8], [16], [32], [64], [128]],
        returnType: 'void'
      },
      'fft2d': {
        params: [
          { name: 'real', type: 'Float64Array' },
          { name: 'imag', type: 'Float64Array' }
        ],
        setup: 'FFT.init(8)',
        testInputs: [
          // Sine wave
          { real: Array(64).fill(0).map((_, i) => Math.sin(i * 0.5)), imag: Array(64).fill(0) },
          // Impulse
          { real: [1, ...Array(63).fill(0)], imag: Array(64).fill(0) },
          // Square wave
          { real: Array(64).fill(0).map((_, i) => i % 8 < 4 ? 1 : -1), imag: Array(64).fill(0) },
          // Random
          { real: Array(64).fill(0).map(() => Math.random() * 2 - 1), imag: Array(64).fill(0) },
          // DC only
          { real: Array(64).fill(1), imag: Array(64).fill(0) }
        ],
        returnType: 'void (in-place)'
      },
      'ifft2d': {
        params: [
          { name: 'real', type: 'Float64Array' },
          { name: 'imag', type: 'Float64Array' }
        ],
        setup: 'FFT.init(8)',
        testInputs: [
          { real: [64, ...Array(63).fill(0)], imag: Array(64).fill(0) },
          { real: Array(64).fill(1), imag: Array(64).fill(0) }
        ],
        returnType: 'void (in-place)'
      }
    }
  },

  // ==================== UPNG ====================
  UPNG: {
    methods: {
      'encode': {
        params: [
          { name: 'imgs', type: 'ArrayBuffer[]' },
          { name: 'w', type: 'number' },
          { name: 'h', type: 'number' },
          { name: 'cnum', type: 'number' }
        ],
        testInputs: 'generatePngInputs',
        returnType: 'ArrayBuffer'
      },
      'decode': {
        params: [{ name: 'buff', type: 'ArrayBuffer' }],
        testInputs: 'generatePngBuffers',
        returnType: 'object'
      },
      'toRGBA8': {
        params: [{ name: 'img', type: 'object' }],
        testInputs: 'fromDecode',
        returnType: 'ArrayBuffer[]'
      },
      'quantize': {
        params: [
          { name: 'data', type: 'ArrayBuffer' },
          { name: 'ps', type: 'number' },
          { name: 'cols', type: 'number' }
        ],
        testInputs: 'generateQuantizeInputs',
        returnType: 'Uint8Array'
      }
    }
  },

  // ==================== pako ====================
  pako: {
    methods: {
      'deflate': {
        params: [{ name: 'data', type: 'Uint8Array' }],
        testInputs: [
          Array.from(new TextEncoder().encode('Hello, World!')),
          Array(100).fill(65), // 'AAA...'
          Array(256).fill(0).map((_, i) => i), // 0-255
          Array.from(new TextEncoder().encode(JSON.stringify({ test: 'data', arr: [1,2,3] }))),
          [], // empty
          Array(1000).fill(0).map(() => Math.floor(Math.random() * 256)) // random
        ],
        returnType: 'Uint8Array'
      },
      'inflate': {
        params: [{ name: 'data', type: 'Uint8Array' }],
        testInputs: 'fromDeflate',
        returnType: 'Uint8Array'
      },
      'gzip': {
        params: [{ name: 'data', type: 'Uint8Array' }],
        testInputs: [
          Array.from(new TextEncoder().encode('Hello, gzip!')),
          Array(50).fill(66)
        ],
        returnType: 'Uint8Array'
      },
      'ungzip': {
        params: [{ name: 'data', type: 'Uint8Array' }],
        testInputs: 'fromGzip',
        returnType: 'Uint8Array'
      }
    }
  },

  // ==================== UZIP ====================
  UZIP: {
    methods: {
      'deflate': {
        params: [{ name: 'data', type: 'Uint8Array' }],
        testInputs: [
          Array.from(new TextEncoder().encode('UZIP deflate test')),
          Array(100).fill(67),
          Array(50).fill(0).map((_, i) => i * 5 % 256)
        ],
        returnType: 'Uint8Array'
      },
      'inflate': {
        params: [{ name: 'data', type: 'Uint8Array' }],
        testInputs: 'fromUzipDeflate',
        returnType: 'Uint8Array'
      },
      'parse': {
        params: [{ name: 'buf', type: 'ArrayBuffer' }],
        testInputs: 'generateZipBuffer',
        returnType: 'object'
      },
      'encode': {
        params: [{ name: 'obj', type: 'object' }],
        testInputs: [
          { 'test.txt': new TextEncoder().encode('Hello from ZIP!') },
          { 'a.txt': new TextEncoder().encode('File A'), 'b.txt': new TextEncoder().encode('File B') }
        ],
        returnType: 'ArrayBuffer'
      }
    }
  },

  // ==================== Typr ====================
  Typr: {
    methods: {
      'parse': {
        params: [{ name: 'buff', type: 'ArrayBuffer' }],
        testInputs: 'generateFontBuffer',
        returnType: 'object'
      }
    }
  },

  // ==================== UTIF ====================
  UTIF: {
    methods: {
      'decode': {
        params: [{ name: 'buff', type: 'ArrayBuffer' }],
        testInputs: 'generateTiffBuffer',
        returnType: 'array'
      },
      'encodeImage': {
        params: [
          { name: 'rgba', type: 'Uint8Array' },
          { name: 'w', type: 'number' },
          { name: 'h', type: 'number' }
        ],
        testInputs: 'generateRgbaImages',
        returnType: 'ArrayBuffer'
      }
    }
  },

  // ==================== UGIF ====================
  UGIF: {
    methods: {
      'decode': {
        params: [{ name: 'buff', type: 'ArrayBuffer' }],
        testInputs: 'generateGifBuffer',
        returnType: 'object'
      }
    }
  },

  // ==================== LZMA ====================
  LZMA: {
    methods: {
      'Decoder': {
        isConstructor: true,
        params: [],
        testInputs: [[]],
        returnType: 'object'
      }
    }
  },

  // ==================== EXRLoader ====================
  EXRLoader: {
    methods: {
      'parse': {
        params: [{ name: 'buffer', type: 'ArrayBuffer' }],
        testInputs: 'generateExrBuffer',
        returnType: 'object'
      }
    }
  },

  // ==================== FromWMF/EMF/DXF ====================
  FromWMF: {
    methods: {
      'Parse': {
        params: [{ name: 'buff', type: 'ArrayBuffer' }],
        testInputs: 'generateWmfBuffer',
        returnType: 'object'
      }
    }
  }
};

async function captureAllAPIs(page, specificAPI = null) {
  const results = {};

  const apisToCapture = specificAPI ? { [specificAPI]: API_SPECS[specificAPI] } : API_SPECS;

  for (const [apiName, apiSpec] of Object.entries(apisToCapture)) {
    if (!apiSpec) continue;

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Capturing: ${apiName}`);
    console.log('='.repeat(50));

    // Check if API exists
    const exists = await page.evaluate((name) => typeof window[name] !== 'undefined', apiName);
    if (!exists) {
      console.log(`  [SKIP] ${apiName} not available`);
      continue;
    }

    results[apiName] = {
      namespace: apiName,
      capturedAt: new Date().toISOString(),
      methods: {}
    };

    for (const [methodName, methodSpec] of Object.entries(apiSpec.methods)) {
      console.log(`\n  ${apiName}.${methodName}:`);

      try {
        const methodResults = await captureMethod(page, apiName, methodName, methodSpec);
        results[apiName].methods[methodName] = methodResults;
        console.log(`    ✓ Captured ${methodResults.results.length} test cases`);
      } catch (err) {
        console.log(`    ✗ Error: ${err.message}`);
        results[apiName].methods[methodName] = { error: err.message };
      }
    }

    // Save individual API file
    const outputPath = path.join(OUTPUT_DIR, `${apiName}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(results[apiName], null, 2));
    console.log(`\n  Saved: ${outputPath}`);
  }

  return results;
}

async function captureMethod(page, apiName, methodName, spec) {
  const result = {
    function: `${apiName}.${methodName}`,
    params: spec.params,
    returnType: spec.returnType || 'unknown',
    results: []
  };

  // Generate test inputs
  let testInputs = spec.testInputs;

  // Handle dynamic test input generators
  if (typeof testInputs === 'string') {
    testInputs = await generateDynamicInputs(page, apiName, methodName, testInputs);
  }

  if (!testInputs || testInputs.length === 0) {
    console.log(`    [WARN] No test inputs for ${apiName}.${methodName}`);
    return result;
  }

  // Run each test
  for (const input of testInputs) {
    try {
      const testResult = await page.evaluate(
        async ({ apiName, methodName, input, setup, isConstructor }) => {
          try {
            // Run setup if needed
            if (setup) {
              eval(setup);
            }

            const api = window[apiName];
            const method = api[methodName];

            // Handle different input types
            let args = Array.isArray(input) ? input : [input];

            // Convert to typed arrays where needed
            args = args.map(arg => {
              if (arg && typeof arg === 'object' && arg.real && arg.imag) {
                // FFT input
                return [new Float64Array(arg.real), new Float64Array(arg.imag)];
              }
              if (Array.isArray(arg) && methodName.includes('flate')) {
                return new Uint8Array(arg);
              }
              if (arg && arg.buffer && arg.type === 'Uint8Array') {
                return new Uint8Array(arg.data);
              }
              return arg;
            });

            // Flatten FFT args
            if (args.length === 1 && Array.isArray(args[0]) && args[0].length === 2) {
              args = args[0];
            }

            let output;
            const startTime = performance.now();

            if (isConstructor) {
              output = new method(...args);
            } else if (methodName === 'fft2d' || methodName === 'ifft2d') {
              // In-place transform
              method(args[0], args[1]);
              output = { real: Array.from(args[0]), imag: Array.from(args[1]) };
            } else {
              output = method(...args);
            }

            const duration = performance.now() - startTime;

            // Serialize output
            let serializedOutput;
            if (output instanceof ArrayBuffer) {
              serializedOutput = { type: 'ArrayBuffer', data: Array.from(new Uint8Array(output)).slice(0, 500) };
            } else if (output instanceof Uint8Array) {
              serializedOutput = { type: 'Uint8Array', data: Array.from(output).slice(0, 500) };
            } else if (Array.isArray(output) && output[0] instanceof ArrayBuffer) {
              serializedOutput = { type: 'ArrayBuffer[]', data: output.map(b => Array.from(new Uint8Array(b)).slice(0, 200)) };
            } else if (output && typeof output === 'object') {
              // Complex object - extract key properties
              serializedOutput = JSON.parse(JSON.stringify(output, (key, val) => {
                if (val instanceof ArrayBuffer) return { type: 'ArrayBuffer', length: val.byteLength };
                if (val instanceof Uint8Array) return { type: 'Uint8Array', length: val.length, sample: Array.from(val.slice(0, 20)) };
                if (typeof val === 'function') return '[Function]';
                return val;
              }));
            } else {
              serializedOutput = output;
            }

            return { success: true, output: serializedOutput, duration };
          } catch (err) {
            return { success: false, error: err.message };
          }
        },
        { apiName, methodName, input, setup: spec.setup, isConstructor: spec.isConstructor }
      );

      if (testResult.success) {
        result.results.push({
          input: input,
          output: testResult.output,
          duration: testResult.duration,
          error: null
        });
      } else {
        result.results.push({
          input: input,
          output: null,
          error: testResult.error
        });
      }
    } catch (err) {
      result.results.push({
        input: input,
        output: null,
        error: err.message
      });
    }
  }

  return result;
}

async function generateDynamicInputs(page, apiName, methodName, generatorName) {
  const generators = {
    'generatePngInputs': async () => {
      // Generate various RGBA images for PNG encoding
      return [
        { rgba: Array(16).fill(0).map((_, i) => i % 4 === 3 ? 255 : (i % 4 === 0 ? 255 : 0)), w: 2, h: 2, cnum: 0 },
        { rgba: Array(64).fill(0).map((_, i) => i % 4 === 3 ? 255 : 128), w: 4, h: 4, cnum: 0 },
        { rgba: Array(256).fill(0).map((_, i) => { const p = Math.floor(i/4); return i%4===3 ? 255 : (p%8<4?255:0); }), w: 8, h: 8, cnum: 0 }
      ];
    },

    'generatePngBuffers': async () => {
      // Create PNG buffers using UPNG.encode
      return await page.evaluate(() => {
        const results = [];
        // 2x2 red
        const r2 = new Uint8Array([255,0,0,255, 255,0,0,255, 255,0,0,255, 255,0,0,255]);
        results.push(Array.from(new Uint8Array(UPNG.encode([r2.buffer], 2, 2, 0))));
        // 4x4 blue
        const b4 = new Uint8Array(64);
        for(let i=0;i<16;i++){b4[i*4+2]=255;b4[i*4+3]=255;}
        results.push(Array.from(new Uint8Array(UPNG.encode([b4.buffer], 4, 4, 0))));
        return results;
      });
    },

    'fromDecode': async () => {
      return await page.evaluate(() => {
        const r = new Uint8Array([255,0,0,255, 255,0,0,255, 255,0,0,255, 255,0,0,255]);
        const png = UPNG.encode([r.buffer], 2, 2, 0);
        const decoded = UPNG.decode(png);
        return [decoded];
      });
    },

    'fromDeflate': async () => {
      return await page.evaluate(() => {
        const results = [];
        results.push(Array.from(pako.deflate(new TextEncoder().encode('Hello!'))));
        results.push(Array.from(pako.deflate(new Uint8Array(50).fill(65))));
        return results;
      });
    },

    'fromGzip': async () => {
      return await page.evaluate(() => {
        return [Array.from(pako.gzip(new TextEncoder().encode('Gzipped!')))];
      });
    },

    'fromUzipDeflate': async () => {
      return await page.evaluate(() => {
        return [Array.from(UZIP.deflate(new TextEncoder().encode('UZIP test')))];
      });
    },

    'generateZipBuffer': async () => {
      return await page.evaluate(() => {
        const files = { 'hello.txt': new TextEncoder().encode('Hello from ZIP!') };
        const zip = UZIP.encode(files);
        return [Array.from(new Uint8Array(zip))];
      });
    },

    'generateQuantizeInputs': async () => {
      return [
        { data: Array(64).fill(0).map((_, i) => i % 4 === 3 ? 255 : Math.floor(i/4)*4), ps: 4, cols: 256 }
      ];
    },

    'generateRgbaImages': async () => {
      return [
        { rgba: Array(16).fill(0).map((_, i) => i % 4 === 3 ? 255 : 200), w: 2, h: 2 },
        { rgba: Array(64).fill(0).map((_, i) => i % 4 === 3 ? 255 : 100), w: 4, h: 4 }
      ];
    },

    // These return empty for formats we can't easily generate
    'generateFontBuffer': async () => [],
    'generateTiffBuffer': async () => [],
    'generateGifBuffer': async () => [],
    'generateExrBuffer': async () => [],
    'generateWmfBuffer': async () => []
  };

  const generator = generators[generatorName];
  if (generator) {
    return await generator();
  }
  return [];
}

async function main() {
  const args = process.argv.slice(2);
  const apiArg = args.find(a => a.startsWith('--api='));
  const specificAPI = apiArg ? apiArg.split('=')[1] : null;

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Comprehensive API I/O Capture Tool                  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Loading Photopea...');
  await page.goto('https://www.photopea.com/', { waitUntil: 'domcontentloaded' });

  // Wait for APIs to load with retries
  console.log('Waiting for APIs...');
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(3000);
    const ready = await page.evaluate(() => typeof UPNG !== 'undefined' && typeof FFT !== 'undefined');
    if (ready) {
      console.log('APIs ready!');
      break;
    }
    console.log(`  Waiting... (${i + 1}/10)`);
  }
  await page.waitForTimeout(2000);

  // List available APIs
  const available = await page.evaluate(() => {
    const apis = ['FFT', 'UPNG', 'pako', 'Typr', 'UZIP', 'UDOC', 'UTIF', 'UGIF', 'LZMA', 'EXRLoader'];
    return apis.filter(a => typeof window[a] !== 'undefined');
  });
  console.log(`Available APIs: ${available.join(', ')}`);

  // Capture all APIs
  const results = await captureAllAPIs(page, specificAPI);

  // Save combined results
  const combinedPath = path.join(OUTPUT_DIR, '_all_apis.json');
  fs.writeFileSync(combinedPath, JSON.stringify(results, null, 2));

  await browser.close();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('CAPTURE COMPLETE');
  console.log('='.repeat(60));

  let totalMethods = 0;
  let totalTests = 0;

  for (const [api, data] of Object.entries(results)) {
    if (data.methods) {
      const methodCount = Object.keys(data.methods).length;
      const testCount = Object.values(data.methods).reduce((sum, m) => sum + (m.results?.length || 0), 0);
      totalMethods += methodCount;
      totalTests += testCount;
      console.log(`  ${api}: ${methodCount} methods, ${testCount} tests`);
    }
  }

  console.log(`\nTotal: ${totalMethods} methods, ${totalTests} test cases`);
  console.log(`Output: ${OUTPUT_DIR}/`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
