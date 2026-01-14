#!/usr/bin/env node
/**
 * Enhanced I/O Capture with Object Factory
 *
 * Based on traced patterns from the extracted code:
 * 1. Identifies constructors vs regular functions
 * 2. Creates proper class instances
 * 3. Uses object factory for common types
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTRACTED_FILE = '/Users/ryanodonnell/projects/style_extractor_prototype/clean-room-cloner/extracted/photopea-v5-extracted.js';
const OUTPUT_DIR = path.join(__dirname, '..', 'captured-io', 'enhanced');

// Object factories based on traced patterns
const objectFactories = {
  // MathUtils = Point(x, y)
  point: () => [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: -50, y: 200 },
    { x: 0.5, y: 0.5 },
  ],

  // MathUtils2 = Rect(x, y, s, H) where s=width, H=height
  rect: () => [
    { x: 0, y: 0, s: 100, H: 100 },
    { x: 0, y: 0, s: 256, H: 256 },
    { x: 10, y: 10, s: 50, H: 50 },
  ],

  // MathUtils3 = 2D Transform Matrix
  matrix: () => [
    { OU: 1, c: 0, sJ: 0, $m: 1, Pb: 0, WQ: 0 }, // Identity
    { OU: 2, c: 0, sJ: 0, $m: 2, Pb: 0, WQ: 0 }, // Scale 2x
    { OU: 1, c: 0, sJ: 0, $m: 1, Pb: 100, WQ: 50 }, // Translate
  ],

  // CanvasUtils8/9 = Document-like object
  document: () => [
    {
      m: { qy: 960, zR: 60, To: false },
      s: 256, H: 256,
      N: [], j: [],
    },
  ],

  // Layer-like object
  layer: () => [
    {
      V: { D: () => 256 * 256 },
      add: { lmfx: null },
      U6: { XV: { d: null } },
      Op: () => null,
    },
  ],

  // Color object
  color: () => [
    { r: 255, g: 0, b: 0, a: 255 },
    { r: 0, g: 255, b: 0, a: 255 },
    { r: 0, g: 0, b: 255, a: 255 },
    { r: 128, g: 128, b: 128, a: 255 },
  ],

  // Pixel data
  pixels: () => [
    new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]),
    new Uint8Array(256 * 4).fill(0).map((_, i) => (i % 4 === 3) ? 255 : Math.floor(i / 4) % 256),
    new Uint8Array(64).fill(128),
  ],

  // Float data for gradients/curves
  floats: () => [
    new Float32Array([0, 0.25, 0.5, 0.75, 1]),
    new Float32Array(256).fill(0).map((_, i) => i / 255),
    new Float32Array([0, 1, 0.5]),
  ],
};

// Type inference from parameter names and AST
function inferParamType(name, fnName) {
  const n = name.toLowerCase();

  // Specific patterns from traced code
  if (/^(x|y|z|w|h|width|height|size|len|length|index|i|j|k|n|m)$/.test(n)) return 'number';
  if (/^(r|g|b|a|red|green|blue|alpha|hue|sat|val|opacity)$/.test(n)) return 'number';
  if (/^(angle|rotation|theta|phi|rad|deg|scale|zoom|ratio)$/.test(n)) return 'number';
  if (/^num\d*$/.test(n)) return 'number';

  // Object types based on name patterns
  if (/point|pt|pos|coord/.test(n)) return 'point';
  if (/rect|bounds|box|area/.test(n)) return 'rect';
  if (/matrix|transform|mat/.test(n)) return 'matrix';
  if (/layer|lyr/.test(n)) return 'layer';
  if (/color|clr|col/.test(n)) return 'color';
  if (/pixel|px|rgba|data|buffer/.test(n)) return 'pixels';
  if (/float|curve|gradient/.test(n)) return 'floats';
  if (/doc|document/.test(n)) return 'document';

  // Arrays
  if (/array|arr|list|items/.test(n)) return 'array';

  // Strings
  if (/str|name|text|label|id|key|path|url|mode|type/.test(n)) return 'string';

  // Booleans
  if (/^(is|has|should|can|enable|disable|flag|bool)/.test(n)) return 'boolean';

  // Capital letters suggest class instances
  if (/^[A-Z]/.test(name)) return 'object';

  // Default based on position
  return 'unknown';
}

// Generate values for a type
function generateValues(type) {
  if (objectFactories[type]) return objectFactories[type]();

  switch (type) {
    case 'number': return [0, 1, 0.5, 100, 255, -1];
    case 'string': return ['', 'test', 'normal', 'multiply'];
    case 'boolean': return [true, false];
    case 'array': return [[], [1, 2, 3], [0, 0, 0, 0]];
    case 'object': return [{}, { x: 0, y: 0 }];
    case 'null': return [null];
    default: return [0, null, '', [], {}];
  }
}

// Serialize for JSON
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

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Enhanced I/O Capture with Object Factory            ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Step 1: Parse the code
  console.log('Step 1: Parsing AST...');
  const code = fs.readFileSync(EXTRACTED_FILE, 'utf8');
  const cleanCode = code.replace(/^export\s+/gm, '');

  let ast;
  try {
    ast = acorn.parse(cleanCode, { ecmaVersion: 2020, allowReturnOutsideFunction: true });
  } catch (e) {
    console.error('Parse error:', e.message);
    return;
  }
  console.log('  AST parsed successfully\n');

  // Step 2: Categorize functions
  console.log('Step 2: Categorizing functions...');
  const functions = new Map();
  const constructors = new Set();

  walk.simple(ast, {
    FunctionDeclaration(node) {
      if (node.id?.name) {
        const name = node.id.name;
        const params = node.params.map(p => p.name || 'arg');
        const bodyText = cleanCode.slice(node.body.start, node.body.end);
        const isConstructor = /this\.\w+\s*=/.test(bodyText);

        functions.set(name, { name, params, node, isConstructor });
        if (isConstructor) constructors.add(name);
      }
    },
    VariableDeclarator(node) {
      if (node.id?.name && node.init?.type === 'FunctionExpression') {
        const name = node.id.name;
        const params = node.init.params.map(p => p.name || 'arg');
        const bodyText = cleanCode.slice(node.init.body.start, node.init.body.end);
        const isConstructor = /this\.\w+\s*=/.test(bodyText);

        functions.set(name, { name, params, node: node.init, isConstructor });
        if (isConstructor) constructors.add(name);
      }
    },
  });

  console.log(`  Total functions: ${functions.size}`);
  console.log(`  Constructors: ${constructors.size}`);
  console.log(`  Regular functions: ${functions.size - constructors.size}\n`);

  // Step 3: Find call sites for type inference
  console.log('Step 3: Analyzing call sites...');
  const callSites = new Map();

  walk.simple(ast, {
    CallExpression(node) {
      let fnName = null;
      if (node.callee.type === 'Identifier') {
        fnName = node.callee.name;
      }
      if (fnName && functions.has(fnName)) {
        if (!callSites.has(fnName)) callSites.set(fnName, []);
        callSites.get(fnName).push(node.arguments);
      }
    },
    NewExpression(node) {
      if (node.callee.type === 'Identifier') {
        const fnName = node.callee.name;
        if (functions.has(fnName)) {
          if (!callSites.has(fnName)) callSites.set(fnName, []);
          callSites.get(fnName).push(node.arguments);
        }
      }
    },
  });

  console.log(`  Functions with call sites: ${callSites.size}\n`);

  // Step 4: Create sandbox
  console.log('Step 4: Creating sandbox...');

  const sandbox = {
    Math, Array, Object, String, Number, Boolean, JSON,
    Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
    Int32Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView,
    Map, Set, WeakMap, WeakSet, Date, RegExp, Error,
    console: { log: () => {}, error: () => {}, warn: () => {} },
    setTimeout: () => {},
    clearTimeout: () => {},
    requestAnimationFrame: () => {},
  };

  // Load all functions into sandbox
  try {
    const wrappedCode = `
      (function(Math, Array, Object, String, Number, Boolean, JSON,
                Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
                Int32Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView,
                Map, Set, WeakMap, WeakSet, Date, RegExp, Error) {
        ${cleanCode}
        return { ${[...functions.keys()].join(', ')} };
      })
    `;
    const fn = eval(wrappedCode);
    const exports = fn(Math, Array, Object, String, Number, Boolean, JSON,
                       Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
                       Int32Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView,
                       Map, Set, WeakMap, WeakSet, Date, RegExp, Error);
    Object.assign(sandbox, exports);
    console.log('  Code loaded successfully\n');
  } catch (e) {
    console.error('  Error loading code:', e.message.slice(0, 200));
    console.log('  Continuing with partial load...\n');
  }

  // Step 5: Execute and capture
  console.log('Step 5: Capturing I/O...\n');

  const results = {};
  let successCount = 0;
  let failCount = 0;
  let testedCount = 0;

  // Helper to create test inputs
  function createInputs(fn) {
    const paramTypes = fn.params.map((p, i) => inferParamType(p, fn.name));
    const inputs = [];

    // Generate 5 test cases using different value combinations
    for (let testIdx = 0; testIdx < 5; testIdx++) {
      const args = paramTypes.map((type, i) => {
        const values = generateValues(type);
        return values[testIdx % values.length];
      });
      inputs.push(args);
    }

    return { inputs, paramTypes };
  }

  // Test regular functions
  for (const [name, fn] of functions) {
    const func = sandbox[name];
    if (typeof func !== 'function') continue;

    testedCount++;
    const { inputs, paramTypes } = createInputs(fn);
    const captured = [];

    for (const args of inputs) {
      try {
        let output;
        if (fn.isConstructor) {
          // Use 'new' for constructors
          output = new func(...args);
        } else {
          output = func(...args);
        }
        captured.push({
          input: args.map(serialize),
          output: serialize(output),
          error: null,
        });
      } catch (e) {
        captured.push({
          input: args.map(serialize),
          output: null,
          error: e.message,
        });
      }
    }

    const successes = captured.filter(c => !c.error);
    if (successes.length > 0) {
      results[name] = {
        function: name,
        params: fn.params,
        paramTypes,
        isConstructor: fn.isConstructor,
        results: captured,
      };
      successCount++;
    } else {
      failCount++;
    }

    // Progress every 50 functions
    if (testedCount % 50 === 0) {
      process.stdout.write(`  Tested ${testedCount}/${functions.size}...\r`);
    }
  }

  console.log(`\n  Success: ${successCount}, Failed: ${failCount}\n`);

  // Step 6: Save results
  console.log('Step 6: Saving results...');

  for (const [name, data] of Object.entries(results)) {
    fs.writeFileSync(path.join(OUTPUT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, '_all.json'), JSON.stringify(results, null, 2));

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total functions: ${functions.size}`);
  console.log(`  - Constructors: ${constructors.size}`);
  console.log(`  - Regular: ${functions.size - constructors.size}`);
  console.log(`Tested: ${testedCount}`);
  console.log(`Successfully captured: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`\nOutput: ${OUTPUT_DIR}`);

  // Show some successful captures
  console.log('\n=== Sample Captures ===');
  const samples = Object.entries(results).slice(0, 5);
  for (const [name, data] of samples) {
    const successResults = data.results.filter(r => !r.error);
    if (successResults.length > 0) {
      console.log(`\n${name}(${data.params.join(', ')})${data.isConstructor ? ' [CONSTRUCTOR]' : ''}:`);
      console.log(`  Input: ${JSON.stringify(successResults[0].input).slice(0, 80)}`);
      console.log(`  Output: ${JSON.stringify(successResults[0].output).slice(0, 80)}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
