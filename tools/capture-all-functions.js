#!/usr/bin/env node
/**
 * Comprehensive Function Capture
 *
 * Finds ALL functions in Photopea and captures I/O programmatically.
 * No clicking - pure automation.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.join(__dirname, '..', 'captured-io');

// Test input generators by detected type
const TEST_GENERATORS = `
window.__TEST_GENERATORS__ = {
  // Detect param types from function source
  detectParamTypes(fn) {
    const src = fn.toString();
    const types = [];

    // Look for type hints in the code
    if (src.includes('Uint8Array') || src.includes('byteLength')) types.push('Uint8Array');
    if (src.includes('Float32Array') || src.includes('Float64Array')) types.push('FloatArray');
    if (src.includes('.width') && src.includes('.height')) types.push('ImageData');
    if (src.includes('JSON') || src.includes('parse')) types.push('JSON');
    if (src.includes('charCodeAt') || src.includes('substring')) types.push('String');
    if (src.includes('[0]') || src.includes('.length')) types.push('Array');

    return types.length ? types : ['unknown'];
  },

  // Generate test inputs
  generateInputs(fn, paramCount) {
    const types = this.detectParamTypes(fn);
    const inputs = [];

    // Generate 3 test cases (reduced from 5 for speed)
    for (let i = 0; i < 3; i++) {
      const args = [];
      for (let p = 0; p < paramCount; p++) {
        args.push(this.generateValue(types, i, p));
      }
      inputs.push(args);
    }
    return inputs;
  },

  generateValue(types, testIndex, paramIndex) {
    // Uint8Array inputs
    if (types.includes('Uint8Array')) {
      const sizes = [8, 16, 64, 256, 1024];
      const size = sizes[testIndex % sizes.length];
      const arr = new Uint8Array(size);
      for (let i = 0; i < size; i++) arr[i] = (i * (testIndex + 1)) % 256;
      return arr;
    }

    // Float array inputs
    if (types.includes('FloatArray')) {
      const sizes = [4, 8, 16, 64, 256];
      const size = sizes[testIndex % sizes.length];
      const arr = new Float64Array(size);
      for (let i = 0; i < size; i++) arr[i] = Math.sin(i * 0.1 * (testIndex + 1));
      return arr;
    }

    // Image data
    if (types.includes('ImageData')) {
      const sizes = [4, 8, 16, 32];
      const w = sizes[testIndex % sizes.length];
      const h = w;
      const data = new Uint8Array(w * h * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = (testIndex * 50) % 256;     // R
        data[i+1] = (testIndex * 100) % 256;  // G
        data[i+2] = (testIndex * 150) % 256;  // B
        data[i+3] = 255;                       // A
      }
      return { width: w, height: h, data };
    }

    // String inputs
    if (types.includes('String')) {
      const strings = ['test', 'Hello World', 'abc123', JSON.stringify({a:1}), 'x'.repeat(100)];
      return strings[testIndex % strings.length];
    }

    // Array inputs
    if (types.includes('Array')) {
      const sizes = [4, 8, 16, 32, 64];
      return Array.from({length: sizes[testIndex]}, (_, i) => i * (testIndex + 1));
    }

    // JSON inputs
    if (types.includes('JSON')) {
      const jsons = [
        {a: 1},
        {name: 'test', value: 123},
        {nested: {deep: {value: true}}},
        {array: [1,2,3,4,5]},
        {mixed: {str: 'hello', num: 42, arr: [1,2]}}
      ];
      return jsons[testIndex % jsons.length];
    }

    // Default: try multiple types
    const defaults = [0, 1, 'test', [1,2,3], {a:1}];
    return defaults[(testIndex + paramIndex) % defaults.length];
  }
};
`;

// Function discovery and capture script
const CAPTURE_SCRIPT = `
window.__CAPTURE_ALL__ = async function() {
  const results = {};
  const errors = [];

  // Serialize for JSON output
  function serialize(val, depth = 0) {
    if (depth > 4) return '[MAX_DEPTH]';
    if (val === null) return null;
    if (val === undefined) return undefined;
    if (typeof val === 'function') return '[Function]';
    if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') return val;

    if (val instanceof ArrayBuffer) {
      const arr = new Uint8Array(val);
      return { __type: 'ArrayBuffer', length: arr.length, data: Array.from(arr.slice(0, 100)) };
    }
    if (ArrayBuffer.isView(val)) {
      return { __type: val.constructor.name, length: val.length, data: Array.from(val.slice(0, 100)) };
    }
    if (Array.isArray(val)) {
      return val.slice(0, 50).map(v => serialize(v, depth + 1));
    }
    if (typeof val === 'object') {
      if (val instanceof HTMLElement) return '[HTMLElement]';
      if (val instanceof Event) return '[Event]';
      const obj = {};
      const keys = Object.keys(val).slice(0, 30);
      for (const k of keys) {
        try { obj[k] = serialize(val[k], depth + 1); } catch(e) { obj[k] = '[Error]'; }
      }
      return obj;
    }
    return String(val);
  }

  // Get param count from function
  function getParamCount(fn) {
    const src = fn.toString();
    const match = src.match(/^(?:function\\s*\\w*)?\\s*\\(([^)]*)\\)/);
    if (!match) return 1;
    const params = match[1].trim();
    if (!params) return 0;
    return params.split(',').length;
  }

  // Test a single function with timeout
  function testFunction(fn, name, namespace) {
    const paramCount = getParamCount(fn);
    const testInputs = window.__TEST_GENERATORS__.generateInputs(fn, paramCount);
    const captured = [];

    for (const args of testInputs) {
      try {
        // Use a sync timeout approach - set flag and check
        let timedOut = false;
        const startTime = Date.now();
        const timeout = 1000; // 1 second max per call

        const output = fn.apply(null, args);

        // Check if it took too long (for slow functions)
        if (Date.now() - startTime > timeout) {
          captured.push({
            input: args.map(a => serialize(a)),
            output: null,
            error: 'Timeout: function took > 1s'
          });
        } else {
          captured.push({
            input: args.map(a => serialize(a)),
            output: serialize(output),
            error: null
          });
        }
      } catch (e) {
        captured.push({
          input: args.map(a => serialize(a)),
          output: null,
          error: e.message
        });
      }
    }

    return {
      function: name,
      namespace: namespace,
      paramCount: paramCount,
      results: captured
    };
  }

  // ============================================
  // 1. GLOBAL APIs (known)
  // ============================================
  const GLOBAL_APIS = [
    'FFT', 'UPNG', 'pako', 'Typr', 'UZIP', 'UDOC', 'UTIF', 'UGIF', 'UTEX',
    'LZMA', 'ICC', 'EXRLoader', 'PDFJS', 'FromWMF', 'FromEMF', 'FromDXF',
    'BINDB', 'PIMG', 'FNTS', 'FromPS', 'FromEPS', 'FromAI'
  ];

  // Skip constructors and problematic functions
  const SKIP_FUNCTIONS = new Set([
    'Deflate', 'Inflate', 'Decoder', 'Encoder', // Constructors
    'JpegDecoder', 'GifWriter', // Constructors
    'parse', // Usually needs valid file data
    'decode', // Usually needs valid file data
    'decodeImage', // Needs valid image
  ]);

  for (const apiName of GLOBAL_APIS) {
    const api = window[apiName];
    if (!api || typeof api !== 'object') continue;

    for (const methodName of Object.keys(api)) {
      if (typeof api[methodName] !== 'function') continue;
      if (methodName.startsWith('_')) continue;

      // Skip constructors (start with capital) and known problematic
      if (methodName[0] === methodName[0].toUpperCase() && methodName[0] !== methodName[0].toLowerCase()) {
        continue; // Skip functions starting with capital (constructors)
      }
      if (SKIP_FUNCTIONS.has(methodName)) continue;

      const fullName = apiName + '.' + methodName;
      console.log('[Capturing] ' + fullName);

      try {
        results[fullName] = testFunction(api[methodName], fullName, apiName);
      } catch (e) {
        errors.push({ function: fullName, error: e.message });
      }
    }
  }

  // ============================================
  // 2. DISCOVER ADDITIONAL PHOTOPEA APIs
  // ============================================

  // Known Photopea-specific namespaces (not browser built-ins)
  const BROWSER_BUILTINS = new Set([
    'window', 'self', 'document', 'location', 'navigator', 'history',
    'screen', 'frames', 'top', 'parent', 'opener', 'localStorage',
    'sessionStorage', 'indexedDB', 'caches', 'crypto', 'performance',
    'console', 'CSS', 'URL', 'URLSearchParams', 'Headers', 'Request',
    'Response', 'Blob', 'File', 'FileReader', 'FormData', 'Image',
    'Audio', 'Video', 'WebSocket', 'Worker', 'SharedWorker',
    'EventSource', 'XMLHttpRequest', 'fetch', 'AbortController',
    'MutationObserver', 'IntersectionObserver', 'ResizeObserver',
    'customElements', 'speechSynthesis', 'visualViewport', 'devicePixelRatio',
    'innerWidth', 'innerHeight', 'outerWidth', 'outerHeight',
    'scrollX', 'scrollY', 'pageXOffset', 'pageYOffset', 'screenX', 'screenY',
    'screenLeft', 'screenTop', 'name', 'length', 'closed', 'status',
    'defaultStatus', 'frameElement', 'menubar', 'personalbar', 'scrollbars',
    'statusbar', 'toolbar', 'locationbar', 'external', 'clientInformation'
  ]);

  // Look for non-browser namespaces with functions
  const discoveredAPIs = [];
  for (const key of Object.keys(window)) {
    if (BROWSER_BUILTINS.has(key)) continue;
    if (key.startsWith('_') || key.startsWith('webkit') || key.startsWith('on')) continue;
    if (key === key.toUpperCase() && key.length <= 2) continue; // Skip constants like 'PI'
    if (GLOBAL_APIS.includes(key)) continue; // Already captured

    const val = window[key];
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      const fnKeys = Object.keys(val).filter(k => typeof val[k] === 'function');
      if (fnKeys.length >= 1) {
        // Check if functions are non-native
        const hasUserFunctions = fnKeys.some(k => !val[k].toString().includes('[native code]'));
        if (hasUserFunctions) {
          discoveredAPIs.push(key);
        }
      }
    }
  }

  console.log('[Discovery] Found additional APIs: ' + (discoveredAPIs.length ? discoveredAPIs.join(', ') : 'none'));

  for (const ns of discoveredAPIs) {
    const obj = window[ns];
    for (const methodName of Object.keys(obj)) {
      if (typeof obj[methodName] !== 'function') continue;
      if (methodName.startsWith('_')) continue;
      if (obj[methodName].toString().includes('[native code]')) continue;

      const fullName = ns + '.' + methodName;
      if (results[fullName]) continue;

      console.log('[Capturing] ' + fullName);

      try {
        results[fullName] = testFunction(obj[methodName], fullName, ns);
      } catch (e) {
        errors.push({ function: fullName, error: e.message });
      }
    }
  }

  // ============================================
  // 3. LOOK FOR PHOTOPEA-SPECIFIC STANDALONE FUNCTIONS
  // ============================================
  // Skip browser built-ins entirely - focus only on app-specific code
  const knownPhotopeaFunctions = ['addPP']; // Add more if discovered

  for (const fnName of knownPhotopeaFunctions) {
    const fn = window[fnName];
    if (typeof fn !== 'function') continue;
    if (fn.toString().includes('[native code]')) continue;

    const fullName = 'window.' + fnName;
    if (results[fullName]) continue;

    console.log('[Capturing] ' + fullName);

    try {
      results[fullName] = testFunction(fn, fullName, 'window');
    } catch (e) {
      errors.push({ function: fullName, error: e.message });
    }
  }

  return { results, errors };
};
`;

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Comprehensive Function Capture                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Launching browser (visible - Photopea requires this)...');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Capture console
  page.on('console', msg => {
    if (msg.text().startsWith('[')) console.log(msg.text());
  });

  console.log('Loading Photopea...');
  await page.goto('https://www.photopea.com/');
  await page.waitForTimeout(3000);

  // Trigger app load via addPP()
  console.log('Triggering app load...');
  await page.evaluate(() => {
    if (typeof addPP === 'function') addPP();
  });

  // Wait for APIs
  console.log('Waiting for APIs to load...');
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const apis = await page.evaluate(() => ({
      UPNG: typeof UPNG !== 'undefined',
      FFT: typeof FFT !== 'undefined',
      pako: typeof pako !== 'undefined',
      Typr: typeof Typr !== 'undefined',
      UZIP: typeof UZIP !== 'undefined'
    }));

    if (apis.UPNG && apis.FFT && apis.pako) {
      console.log(`APIs ready after ${i}s: ${Object.entries(apis).filter(([k,v]) => v).map(([k]) => k).join(', ')}`);
      ready = true;
      break;
    }
    process.stdout.write('.');
    await page.waitForTimeout(1000);
  }

  if (!ready) {
    console.error('\nFailed to load Photopea APIs. Exiting.');
    await browser.close();
    process.exit(1);
  }

  // Inject helpers
  console.log('Injecting test generators...');
  await page.evaluate(TEST_GENERATORS);

  console.log('Injecting capture script...');
  await page.evaluate(CAPTURE_SCRIPT);

  // Run capture
  console.log('\n' + '='.repeat(60));
  console.log('CAPTURING ALL FUNCTIONS');
  console.log('='.repeat(60) + '\n');

  const { results, errors } = await page.evaluate(() => window.__CAPTURE_ALL__());

  // Save results
  console.log('\n' + '='.repeat(60));
  console.log('SAVING RESULTS');
  console.log('='.repeat(60) + '\n');

  // Group by namespace
  const byNamespace = {};
  for (const [name, data] of Object.entries(results)) {
    const ns = data.namespace;
    if (!byNamespace[ns]) byNamespace[ns] = {};
    byNamespace[ns][data.function] = data;
  }

  // Save per-namespace files
  for (const [ns, funcs] of Object.entries(byNamespace)) {
    const outputPath = path.join(OUTPUT_DIR, `${ns}.json`);
    fs.writeFileSync(outputPath, JSON.stringify({
      namespace: ns,
      capturedAt: new Date().toISOString(),
      functions: funcs
    }, null, 2));
    console.log(`  ${ns}: ${Object.keys(funcs).length} functions → ${outputPath}`);
  }

  // Save all combined
  const allPath = path.join(OUTPUT_DIR, '_all_functions.json');
  fs.writeFileSync(allPath, JSON.stringify(results, null, 2));
  console.log(`\n  Combined: ${Object.keys(results).length} functions → ${allPath}`);

  // Save errors
  if (errors.length > 0) {
    const errPath = path.join(OUTPUT_DIR, '_errors.json');
    fs.writeFileSync(errPath, JSON.stringify(errors, null, 2));
    console.log(`  Errors: ${errors.length} → ${errPath}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`\nTotal functions captured: ${Object.keys(results).length}`);
  console.log(`Namespaces: ${Object.keys(byNamespace).join(', ')}`);
  console.log(`Errors: ${errors.length}`);

  await browser.close();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
