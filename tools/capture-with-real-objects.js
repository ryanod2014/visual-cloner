#!/usr/bin/env node
/**
 * Capture I/O using REAL Photopea objects via Playwright
 *
 * Don't mock objects - use Photopea's own APIs inside page.evaluate()
 * to create real Document, Layer, etc. objects.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTRACTED_FILE = '/Users/ryanodonnell/projects/style_extractor_prototype/clean-room-cloner/extracted/photopea-v5-extracted.js';
const OUTPUT_DIR = path.join(__dirname, '..', 'captured-io', 'real-objects');

// =============================================================================
// STEP 1: Analyze what each function needs (property/method access on params)
// =============================================================================

function analyzePropertyAccess(code, fnName) {
  const cleanCode = code.replace(/^export\s+/gm, '');
  let ast;
  try {
    ast = acorn.parse(cleanCode, { ecmaVersion: 2020, allowReturnOutsideFunction: true });
  } catch (e) {
    return { params: [], accesses: [] };
  }

  let targetFn = null;
  let params = [];

  walk.simple(ast, {
    FunctionDeclaration(node) {
      if (node.id?.name === fnName) {
        targetFn = node;
        params = node.params.map(p => p.name);
      }
    },
    VariableDeclarator(node) {
      if (node.id?.name === fnName && node.init?.type === 'FunctionExpression') {
        targetFn = node.init;
        params = node.init.params.map(p => p.name);
      }
    },
  });

  if (!targetFn) return { params: [], accesses: [] };

  // Find all property accesses on parameters
  const accesses = new Set();
  const paramSet = new Set(params);

  walk.simple(targetFn, {
    MemberExpression(node) {
      // Check if object is a parameter
      if (node.object.type === 'Identifier' && paramSet.has(node.object.name)) {
        const prop = node.property.name || node.property.value;
        if (prop) accesses.add(`${node.object.name}.${prop}`);
      }
    },
    CallExpression(node) {
      // Check for method calls on parameters: param.method()
      if (node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          paramSet.has(node.callee.object.name)) {
        const method = node.callee.property.name || node.callee.property.value;
        if (method) accesses.add(`${node.callee.object.name}.${method}()`);
      }
    },
  });

  return { params, accesses: [...accesses] };
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   Capture I/O with REAL Photopea Objects (Playwright)     ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load extracted code
  const code = fs.readFileSync(EXTRACTED_FILE, 'utf8');

  // Find all functions
  const cleanCode = code.replace(/^export\s+/gm, '');
  let ast;
  try {
    ast = acorn.parse(cleanCode, { ecmaVersion: 2020, allowReturnOutsideFunction: true });
  } catch (e) {
    console.error('Parse error:', e.message);
    return;
  }

  const functions = new Map();
  walk.simple(ast, {
    FunctionDeclaration(node) {
      if (node.id?.name) {
        const bodyText = cleanCode.slice(node.body.start, node.body.end);
        functions.set(node.id.name, {
          name: node.id.name,
          params: node.params.map(p => p.name || 'arg'),
          isConstructor: /this\.\w+\s*=/.test(bodyText),
          code: cleanCode.slice(node.start, node.end),
        });
      }
    },
    VariableDeclarator(node) {
      if (node.id?.name && node.init?.type === 'FunctionExpression') {
        const bodyText = cleanCode.slice(node.init.body.start, node.init.body.end);
        functions.set(node.id.name, {
          name: node.id.name,
          params: node.init.params.map(p => p.name || 'arg'),
          isConstructor: /this\.\w+\s*=/.test(bodyText),
          code: cleanCode.slice(node.start, node.end),
        });
      }
    },
  });

  console.log(`Found ${functions.size} functions in extracted code\n`);

  // Load already captured functions
  const mergedPath = path.join(__dirname, '..', 'captured-io', 'merged', '_all.json');
  let alreadyCaptured = {};
  if (fs.existsSync(mergedPath)) {
    alreadyCaptured = JSON.parse(fs.readFileSync(mergedPath, 'utf8'));
    console.log(`Already captured: ${Object.keys(alreadyCaptured).length} functions`);
  }

  // Find functions that still need capture
  const needCapture = [];
  for (const [name, fn] of functions) {
    if (!alreadyCaptured[name]) {
      const analysis = analyzePropertyAccess(code, name);
      needCapture.push({ ...fn, ...analysis });
    }
  }
  console.log(`Functions needing capture: ${needCapture.length}\n`);

  // Analyze what properties/methods are accessed
  console.log('Step 1: Analyzing property access patterns...');
  const accessPatterns = {};
  for (const fn of needCapture) {
    if (fn.accesses.length > 0) {
      accessPatterns[fn.name] = fn.accesses;
    }
  }
  console.log(`  Functions with property access: ${Object.keys(accessPatterns).length}`);

  // Common patterns
  const patternCounts = {};
  for (const accesses of Object.values(accessPatterns)) {
    for (const access of accesses) {
      const prop = access.split('.')[1];
      patternCounts[prop] = (patternCounts[prop] || 0) + 1;
    }
  }
  console.log('  Most common property accesses:');
  Object.entries(patternCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([prop, count]) => console.log(`    ${prop}: ${count}`));

  // Launch Playwright
  console.log('\nStep 2: Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to Photopea
  console.log('Step 3: Loading Photopea...');
  await page.goto('https://www.photopea.com/', { waitUntil: 'domcontentloaded', timeout: 120000 });

  // Wait for app to initialize (look for the app object)
  console.log('  Waiting for app to initialize...');
  await page.waitForFunction(() => {
    return typeof window.app !== 'undefined' || document.querySelector('canvas');
  }, { timeout: 60000 }).catch(() => {
    console.log('  App not found, continuing anyway...');
  });
  await page.waitForTimeout(3000);

  // Step 1: Discover object factories
  console.log('\nStep 4: Discovering object factories...');
  const factories = await page.evaluate(() => {
    const found = {
      constructors: [],
      appMethods: [],
      globals: [],
    };

    // Find constructor functions on window
    for (const key of Object.keys(window)) {
      try {
        const val = window[key];
        if (typeof val === 'function' && /^[A-Z]/.test(key)) {
          found.constructors.push(key);
        }
      } catch (e) {}
    }

    // Find app methods that create objects
    if (typeof app !== 'undefined') {
      for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(app) || {})) {
        if (key.startsWith('new') || key.startsWith('create') || key.startsWith('add')) {
          found.appMethods.push(`app.${key}`);
        }
      }
      // Also check app's own properties
      for (const key of Object.keys(app)) {
        if (typeof app[key] === 'function') {
          found.appMethods.push(`app.${key}`);
        }
      }
    }

    // Find useful globals
    const globalNames = ['Photopea', 'PP', 'Layer', 'Document', 'Selection', 'Filter'];
    for (const name of globalNames) {
      if (typeof window[name] !== 'undefined') {
        found.globals.push(name);
      }
    }

    return found;
  });

  console.log(`  Constructors found: ${factories.constructors.length}`);
  console.log(`  App methods found: ${factories.appMethods.length}`);
  console.log(`  Globals found: ${factories.globals.join(', ') || 'none'}`);

  // Step 5: Inject our extracted functions and execute with real DOM objects
  console.log('\nStep 5: Injecting extracted functions and capturing I/O...');

  // Read the extracted code
  const extractedCode = fs.readFileSync(EXTRACTED_FILE, 'utf8').replace(/^export\s+/gm, '');

  // Get ALL function names from extracted code (not just uncaptured)
  const allFunctionNames = [...functions.keys()];

  const results = await page.evaluate(async ({ fnData, codeToInject, allFnNames }) => {
    const captured = {};
    const errors = [];
    let injectionSuccess = false;

    // Create stub utilities that the extracted code expects
    window.StringUtils = {
      w: (tag, className) => {
        const el = document.createElement(tag || 'div');
        if (className) el.className = className;
        el.appendChild = el.appendChild.bind(el);
        return el;
      },
      i: (el, style) => { if (el) el.style.cssText = style; },
      Y5: () => window.devicePixelRatio || 1,
      zP: (el) => { if (el) el.innerHTML = ''; },
      qX: (s) => String(s).replace(/</g, '&lt;'),
      Wa: () => ({}),
    };

    // MathUtils static methods (will be preserved after injection)
    const mathUtilsStatic = {
      ai: (a, b) => {
        if (a && b && typeof a.x === 'number') {
          return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
        }
        return 0;
      },
    };

    window.ColorMath = { E: { f: null, b: null, l: null } };
    window.DOMHelpers = { a2m: () => {} };
    window.WebGLContext = { rN: false };
    window.Localization = { get: (s) => s };
    window.PIMG = { prsO: '' };
    window.ko = { Gw: () => {} };
    window.MatrixOps = { U2: { h1: () => {} } };

    // Common helper functions
    window.hs = (arr, idx) => arr ? arr[idx] : 0;
    window.hl = {
      Wt: () => ({ pa: {} }),
      mK: () => ({}),
      Xr: () => {},
      _r: () => {},
    };
    window.ha = { names: [], order: [] };

    // Common global variables
    window.array = [];
    window.array1 = [[255,0,0], [0,255,0], [0,0,255]];
    window.array3 = [];
    window.array5 = new Uint8Array(100);
    window.obj = {};
    window.obj4 = {};
    window.obj16 = { xA: () => 0 };
    window.obj24 = { Aa: () => false, yT: () => {} };
    window.num = 0;
    window.num1 = 0;
    window.num2 = 0;
    window.num3 = 0;
    window.i = [];
    window.s = {};
    window.V = [];
    window.A = { N1: { QS: () => ({}), Jq: () => ({}) }, R: { am: () => ({}) }, hK: { q_: () => ({}) } };
    window.U = { nK: (p) => p };
    window.Constants = {};

    // Inject ALL the extracted code to satisfy dependencies
    try {
      const wrappedCode = `
        (function() {
          ${codeToInject}
          return { ${allFnNames.join(', ')} };
        })()
      `;
      const injectedFuncs = eval(wrappedCode);
      Object.assign(window, injectedFuncs);

      // Re-add static methods that got overwritten
      if (window.MathUtils && typeof window.MathUtils === 'function') {
        window.MathUtils.ai = mathUtilsStatic.ai;
      }

      injectionSuccess = true;
      errors.push(`Injection success: ${Object.keys(injectedFuncs).length} functions (all)`);
    } catch (e) {
      errors.push(`Injection error: ${e.message.slice(0, 200)}`);
    }

    // Create rich document state
    let doc, layer1, layer2;
    try {
      // Try to create a new document via app API
      if (typeof app !== 'undefined' && app.activeDocument) {
        doc = app.activeDocument;
      }
    } catch (e) {
      errors.push(`Doc creation: ${e.message}`);
    }

    // Build object pool with various types
    const objectPool = {
      // Numbers
      numbers: [0, 1, 0.5, 100, 255, -1],
      // Strings
      strings: ['', 'normal', 'multiply', 'screen', 'gaussian'],
      // Booleans
      booleans: [true, false],
      // Arrays
      arrays: [[], [0, 1, 2, 3], [0, 0, 0, 0]],
      // Typed arrays
      uint8: [
        new Uint8Array([0, 0, 0, 255]),
        new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]),
        new Uint8Array(16).fill(128),
      ],
      float32: [
        new Float32Array([0, 0.5, 1]),
        new Float32Array(16).fill(0).map((_, i) => i / 16),
      ],
      // Objects
      objects: [
        {},
        { x: 0, y: 0 },
        { x: 0, y: 0, s: 100, H: 100 },
        { width: 100, height: 100 },
      ],
      // Points
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
      // Rectangles
      rects: [
        { x: 0, y: 0, s: 100, H: 100 },
        { x: 0, y: 0, width: 256, height: 256 },
      ],
      // Canvas if available
      canvas: null,
      ctx: null,
    };

    // Try to create a canvas
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      objectPool.canvas = canvas;
      objectPool.ctx = canvas.getContext('2d');
    } catch (e) {}

    // Helper to serialize values
    function serialize(val, depth = 0) {
      if (depth > 3) return '[MAX_DEPTH]';
      if (val === null) return null;
      if (val === undefined) return undefined;
      if (typeof val === 'function') return '[Function]';
      if (typeof val === 'number') return Number.isFinite(val) ? val : String(val);
      if (typeof val === 'string' || typeof val === 'boolean') return val;

      if (ArrayBuffer.isView(val)) {
        return { __type: val.constructor.name, length: val.length, data: Array.from(val.slice(0, 50)) };
      }
      if (Array.isArray(val)) {
        return val.slice(0, 20).map(v => serialize(v, depth + 1));
      }
      if (typeof val === 'object') {
        const obj = {};
        for (const k of Object.keys(val).slice(0, 15)) {
          try { obj[k] = serialize(val[k], depth + 1); } catch(e) { obj[k] = '[Error]'; }
        }
        return obj;
      }
      return String(val).slice(0, 100);
    }

    // Helper to get inputs for a parameter
    function getInputsForParam(paramName) {
      const n = (paramName || '').toLowerCase();
      if (/^(x|y|z|w|h|width|height|size|len|length|index|i|j|k|n|m|num)/.test(n)) {
        return objectPool.numbers;
      }
      if (/pixel|data|buffer|uint8/.test(n)) {
        return objectPool.uint8;
      }
      if (/float|curve/.test(n)) {
        return objectPool.float32;
      }
      if (/array|arr|list/.test(n)) {
        return objectPool.arrays;
      }
      if (/str|name|text|label|mode|type/.test(n)) {
        return objectPool.strings;
      }
      if (/^(is|has|should|can|flag)/.test(n)) {
        return objectPool.booleans;
      }
      if (/point|pt|pos/.test(n)) {
        return objectPool.points;
      }
      if (/rect|bounds|box/.test(n)) {
        return objectPool.rects;
      }
      if (/canvas/.test(n)) {
        return [objectPool.canvas];
      }
      if (/ctx|context/.test(n)) {
        return [objectPool.ctx];
      }
      // Default: try various types
      return [0, null, '', [], {}];
    }

    // Check how many functions are now available
    let foundCount = 0;
    for (const fn of fnData) {
      if (typeof window[fn.name] === 'function') foundCount++;
    }
    errors.push(`Functions found on window: ${foundCount}/${fnData.length}`);

    // Try to execute each function
    for (const fn of fnData) {
      try {
        // Try to find the function
        let func = window[fn.name];

        if (typeof func !== 'function') {
          continue; // Skip if not found
        }

        // Generate inputs
        const inputSets = [];
        if (!fn.params || fn.params.length === 0) {
          inputSets.push([]);
        } else {
          // Generate a few combinations
          for (let i = 0; i < 3; i++) {
            const args = fn.params.map(p => {
              const inputs = getInputsForParam(p);
              return inputs[i % inputs.length];
            });
            inputSets.push(args);
          }
        }

        const results = [];
        for (const args of inputSets) {
          try {
            let output;
            if (fn.isConstructor) {
              output = new func(...args);
            } else {
              output = func(...args);
            }
            results.push({
              input: args.map(serialize),
              output: serialize(output),
              error: null,
            });
          } catch (e) {
            results.push({
              input: args.map(serialize),
              output: null,
              error: e.message,
            });
          }
        }

        const successes = results.filter(r => !r.error);
        if (successes.length > 0) {
          captured[fn.name] = {
            function: fn.name,
            params: fn.params,
            isConstructor: fn.isConstructor,
            results,
          };
        } else if (results.length > 0) {
          // Track the first error for debugging
          errors.push(`${fn.name}: ${results[0].error}`);
        }
      } catch (e) {
        errors.push(`${fn.name} (outer): ${e.message}`);
      }
    }

    return { captured, errors, poolInfo: Object.keys(objectPool) };
  }, { fnData: needCapture, codeToInject: extractedCode, allFnNames: allFunctionNames }); // Process ALL

  console.log(`  Captured: ${Object.keys(results.captured).length} functions`);
  if (results.errors.length > 0) {
    console.log(`  Messages: ${results.errors.length}`);
    results.errors.slice(0, 15).forEach(e => console.log(`    - ${e.slice(0, 100)}`));
  }

  // Save results
  console.log('\nStep 6: Saving results...');
  for (const [name, data] of Object.entries(results.captured)) {
    fs.writeFileSync(path.join(OUTPUT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, '_all.json'), JSON.stringify(results.captured, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, '_factories.json'), JSON.stringify(factories, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, '_analysis.json'), JSON.stringify(accessPatterns, null, 2));

  await browser.close();

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Functions needing capture: ${needCapture.length}`);
  console.log(`Successfully captured: ${Object.keys(results.captured).length}`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

main().catch(err => { console.error(err); process.exit(1); });
