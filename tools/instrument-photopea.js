#!/usr/bin/env node
/**
 * Photopea Function Instrumentation
 *
 * Hooks into Photopea functions and captures I/O when user exercises features.
 *
 * Usage:
 *   node instrument-photopea.js                    # Start instrumented session
 *   node instrument-photopea.js --duration=300    # Run for 5 minutes then save
 *
 * The user interacts with Photopea normally while we capture function calls.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.join(__dirname, '..', 'captured-io');

// Instrumentation code to inject
const INSTRUMENTATION_SCRIPT = `
(function() {
  // Store for captured I/O
  window.__CAPTURED_IO__ = {};
  window.__CAPTURE_ENABLED__ = true;
  window.__CAPTURE_COUNT__ = 0;
  window.__MAX_CAPTURES_PER_FUNC__ = 50;

  // Serialize values for storage
  function serialize(val, maxDepth = 3, currentDepth = 0) {
    if (currentDepth > maxDepth) return '[MAX_DEPTH]';
    if (val === null) return null;
    if (val === undefined) return undefined;

    const type = typeof val;

    if (type === 'number' || type === 'string' || type === 'boolean') {
      return val;
    }

    if (val instanceof ArrayBuffer) {
      const arr = new Uint8Array(val);
      return {
        __type: 'ArrayBuffer',
        byteLength: val.byteLength,
        data: arr.length <= 200 ? Array.from(arr) : Array.from(arr.slice(0, 200)).concat(['...truncated'])
      };
    }

    if (val instanceof Uint8Array || val instanceof Int8Array ||
        val instanceof Uint16Array || val instanceof Int16Array ||
        val instanceof Uint32Array || val instanceof Int32Array ||
        val instanceof Float32Array || val instanceof Float64Array) {
      const typeName = val.constructor.name;
      return {
        __type: typeName,
        length: val.length,
        data: val.length <= 200 ? Array.from(val) : Array.from(val.slice(0, 200)).concat(['...truncated'])
      };
    }

    if (Array.isArray(val)) {
      if (val.length > 100) {
        return val.slice(0, 100).map(v => serialize(v, maxDepth, currentDepth + 1)).concat(['...truncated']);
      }
      return val.map(v => serialize(v, maxDepth, currentDepth + 1));
    }

    if (type === 'function') {
      return '[Function]';
    }

    if (type === 'object') {
      // Handle special objects
      if (val instanceof HTMLElement) return '[HTMLElement]';
      if (val instanceof Event) return '[Event]';

      const result = {};
      const keys = Object.keys(val).slice(0, 50);
      for (const key of keys) {
        try {
          result[key] = serialize(val[key], maxDepth, currentDepth + 1);
        } catch (e) {
          result[key] = '[Error: ' + e.message + ']';
        }
      }
      if (Object.keys(val).length > 50) {
        result.__truncated = true;
      }
      return result;
    }

    return String(val);
  }

  // Wrap a function to capture I/O
  function wrapFunction(obj, propName, namespace) {
    const original = obj[propName];
    if (typeof original !== 'function') return;

    const fullName = namespace + '.' + propName;

    // Skip internal/private methods
    if (propName.startsWith('_') && !propName.startsWith('__')) return;

    // Initialize storage for this function
    if (!window.__CAPTURED_IO__[fullName]) {
      window.__CAPTURED_IO__[fullName] = {
        function: fullName,
        namespace: namespace,
        method: propName,
        capturedAt: new Date().toISOString(),
        results: []
      };
    }

    obj[propName] = function(...args) {
      const captureData = window.__CAPTURED_IO__[fullName];

      // Check if we should capture
      if (!window.__CAPTURE_ENABLED__ || captureData.results.length >= window.__MAX_CAPTURES_PER_FUNC__) {
        return original.apply(this, args);
      }

      // Serialize input
      const serializedInput = args.map(a => serialize(a));

      // Call original
      let result, error = null;
      const startTime = performance.now();

      try {
        result = original.apply(this, args);
      } catch (e) {
        error = e.message;
        throw e;
      } finally {
        const duration = performance.now() - startTime;

        // Serialize output
        const serializedOutput = error ? null : serialize(result);

        // Store capture
        captureData.results.push({
          input: serializedInput,
          output: serializedOutput,
          error: error,
          duration: duration,
          timestamp: Date.now()
        });

        window.__CAPTURE_COUNT__++;

        // Log progress periodically
        if (window.__CAPTURE_COUNT__ % 100 === 0) {
          console.log('[Instrumentation] Captured ' + window.__CAPTURE_COUNT__ + ' function calls');
        }
      }

      return result;
    };

    // Preserve function properties
    obj[propName].toString = () => original.toString();
    obj[propName].__original = original;
  }

  // Instrument an API namespace
  function instrumentAPI(name) {
    const api = window[name];
    if (!api || typeof api !== 'object') return 0;

    let count = 0;
    for (const key of Object.keys(api)) {
      if (typeof api[key] === 'function') {
        wrapFunction(api, key, name);
        count++;
      }
    }
    return count;
  }

  // APIs to instrument
  const APIs = [
    'FFT', 'UPNG', 'pako', 'Typr', 'UZIP', 'UDOC', 'UTIF', 'UGIF', 'UTEX',
    'LZMA', 'ICC', 'EXRLoader', 'PDFJS', 'FromWMF', 'FromEMF', 'FromDXF',
    'BINDB', 'PIMG', 'FNTS'
  ];

  // Instrument all APIs
  let totalFunctions = 0;
  for (const api of APIs) {
    const count = instrumentAPI(api);
    if (count > 0) {
      console.log('[Instrumentation] Hooked ' + count + ' functions in ' + api);
      totalFunctions += count;
    }
  }

  console.log('[Instrumentation] Total: ' + totalFunctions + ' functions instrumented');
  console.log('[Instrumentation] Ready to capture. Use Photopea normally.');
  console.log('[Instrumentation] Call window.__GET_CAPTURES__() to retrieve data');

  // Helper to get captures
  window.__GET_CAPTURES__ = function() {
    const result = {};
    for (const [name, data] of Object.entries(window.__CAPTURED_IO__)) {
      if (data.results.length > 0) {
        result[name] = data;
      }
    }
    return result;
  };

  // Helper to get summary
  window.__CAPTURE_SUMMARY__ = function() {
    const summary = {};
    for (const [name, data] of Object.entries(window.__CAPTURED_IO__)) {
      if (data.results.length > 0) {
        summary[name] = data.results.length;
      }
    }
    return summary;
  };

  // Helper to clear captures
  window.__CLEAR_CAPTURES__ = function() {
    for (const data of Object.values(window.__CAPTURED_IO__)) {
      data.results = [];
    }
    window.__CAPTURE_COUNT__ = 0;
    console.log('[Instrumentation] Captures cleared');
  };

  // Helper to pause/resume
  window.__PAUSE_CAPTURE__ = () => { window.__CAPTURE_ENABLED__ = false; };
  window.__RESUME_CAPTURE__ = () => { window.__CAPTURE_ENABLED__ = true; };

})();
`;

async function main() {
  const args = process.argv.slice(2);
  const durationArg = args.find(a => a.startsWith('--duration='));
  const duration = durationArg ? parseInt(durationArg.split('=')[1]) * 1000 : null;

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Photopea Function Instrumentation                   ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Launching browser (visible)...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    viewport: null // Use full window
  });
  const page = await context.newPage();

  console.log('Loading Photopea...');
  await page.goto('https://www.photopea.com/', { waitUntil: 'domcontentloaded' });

  // Wait for app to initialize
  console.log('Waiting for Photopea to initialize...');
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(2000);
    const ready = await page.evaluate(() => typeof UPNG !== 'undefined' && typeof FFT !== 'undefined');
    if (ready) break;
    process.stdout.write('.');
  }
  console.log('\n');

  // Inject instrumentation
  console.log('Injecting instrumentation...');
  await page.evaluate(INSTRUMENTATION_SCRIPT);

  console.log('\n' + '='.repeat(60));
  console.log('INSTRUMENTATION ACTIVE');
  console.log('='.repeat(60));
  console.log('\nNow use Photopea normally:');
  console.log('  - Open/create images');
  console.log('  - Apply filters');
  console.log('  - Save in different formats');
  console.log('  - Use various tools\n');

  if (duration) {
    console.log(`Will automatically save captures in ${duration/1000} seconds.\n`);
  } else {
    console.log('Press Ctrl+C when done to save captures.\n');
  }

  // Periodic status updates
  const statusInterval = setInterval(async () => {
    try {
      const summary = await page.evaluate(() => window.__CAPTURE_SUMMARY__());
      const total = Object.values(summary).reduce((a, b) => a + b, 0);
      if (total > 0) {
        console.log(`[Status] Captured ${total} calls across ${Object.keys(summary).length} functions`);
      }
    } catch (e) {
      // Page might be closed
    }
  }, 10000);

  // Handle save and exit
  async function saveAndExit() {
    clearInterval(statusInterval);

    console.log('\n\nSaving captures...');

    try {
      const captures = await page.evaluate(() => window.__GET_CAPTURES__());

      // Save individual API files
      const apiGroups = {};
      for (const [funcName, data] of Object.entries(captures)) {
        const namespace = data.namespace;
        if (!apiGroups[namespace]) {
          apiGroups[namespace] = {
            namespace: namespace,
            capturedAt: new Date().toISOString(),
            methods: {}
          };
        }
        apiGroups[namespace].methods[data.method] = {
          function: funcName,
          params: 'captured',
          results: data.results
        };
      }

      // Save each API
      for (const [api, data] of Object.entries(apiGroups)) {
        const outputPath = path.join(OUTPUT_DIR, `${api}_captured.json`);
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
        console.log(`  Saved: ${outputPath}`);
      }

      // Save combined
      const combinedPath = path.join(OUTPUT_DIR, '_captured_all.json');
      fs.writeFileSync(combinedPath, JSON.stringify(captures, null, 2));
      console.log(`  Saved: ${combinedPath}`);

      // Summary
      console.log('\n' + '='.repeat(60));
      console.log('CAPTURE SUMMARY');
      console.log('='.repeat(60));

      let totalCalls = 0;
      for (const [funcName, data] of Object.entries(captures)) {
        console.log(`  ${funcName}: ${data.results.length} calls`);
        totalCalls += data.results.length;
      }
      console.log(`\nTotal: ${totalCalls} function calls captured`);

    } catch (e) {
      console.error('Error saving:', e.message);
    }

    await browser.close();
    process.exit(0);
  }

  // Handle Ctrl+C
  process.on('SIGINT', saveAndExit);
  process.on('SIGTERM', saveAndExit);

  // Auto-save after duration
  if (duration) {
    setTimeout(saveAndExit, duration);
  }

  // Keep running
  await new Promise(() => {}); // Wait forever
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
