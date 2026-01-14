#!/usr/bin/env node
/**
 * Capture I/O by analyzing call sites in beautified code
 *
 * 1. Parse AST
 * 2. Find all functions
 * 3. Find all call sites → extract argument patterns
 * 4. Generate matching inputs
 * 5. Execute & capture I/O
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTRACTED_FILE = '/Users/ryanodonnell/projects/style_extractor_prototype/clean-room-cloner/extracted/photopea-v5-extracted.js';
const OUTPUT_DIR = path.join(__dirname, '..', 'captured-io', 'from-callsites');

// Input generators by detected type
const generators = {
  number: () => [0, 1, 0.5, 100, 255, -1, Math.PI],
  string: () => ['', 'test', 'normal', 'multiply', 'gaussian'],
  boolean: () => [true, false],
  array: () => [[], [1,2,3], [0,0,0,0], Array(16).fill(0)],
  uint8array: () => [
    new Uint8Array([0,0,0,255]),
    new Uint8Array(16).fill(128),
    new Uint8Array(64).fill(0).map((_,i) => i % 256),
  ],
  float32array: () => [
    new Float32Array([0, 0.5, 1]),
    new Float32Array(16).fill(0).map((_,i) => Math.sin(i)),
  ],
  object: () => [{}, {x:0, y:0}, {width:100, height:100, pixels: new Uint8Array(400)}],
  null: () => [null],
  undefined: () => [undefined],
};

// Infer type from AST node
function inferType(node) {
  if (!node) return 'unknown';

  switch (node.type) {
    case 'Literal':
      if (node.value === null) return 'null';
      return typeof node.value; // 'number', 'string', 'boolean'

    case 'ArrayExpression':
      return 'array';

    case 'ObjectExpression':
      return 'object';

    case 'NewExpression':
      if (node.callee.name === 'Uint8Array') return 'uint8array';
      if (node.callee.name === 'Float32Array') return 'float32array';
      if (node.callee.name === 'Int32Array') return 'int32array';
      if (node.callee.name === 'ArrayBuffer') return 'arraybuffer';
      return 'object';

    case 'MemberExpression':
      // x.pixels, x.data, x.buffer → likely typed array
      const prop = node.property.name || node.property.value;
      if (['pixels', 'data', 'buffer'].includes(prop)) return 'uint8array';
      if (['width', 'height', 'length', 'x', 'y'].includes(prop)) return 'number';
      return 'unknown';

    case 'Identifier':
      // Guess from name
      const name = node.name.toLowerCase();
      if (/^(x|y|z|w|h|i|j|k|n|m|num|width|height|size|len|index|offset|opacity|alpha|r|g|b|a)$/.test(name)) return 'number';
      if (/pixel|data|buffer|arr|array/.test(name)) return 'uint8array';
      if (/str|name|mode|type/.test(name)) return 'string';
      if (/^(is|has|should|flag)/.test(name)) return 'boolean';
      return 'unknown';

    case 'BinaryExpression':
    case 'UnaryExpression':
      return 'number';

    case 'CallExpression':
      // Math.xxx returns number
      if (node.callee.type === 'MemberExpression' && node.callee.object.name === 'Math') {
        return 'number';
      }
      return 'unknown';

    default:
      return 'unknown';
  }
}

// Generate test values for a type
function generateValues(type) {
  if (generators[type]) return generators[type]();
  // Fallback for unknown
  return [0, 1, null, '', [], {}];
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
    for (const k of Object.keys(val).slice(0, 10)) {
      try { obj[k] = serialize(val[k], depth + 1); } catch(e) {}
    }
    return obj;
  }
  return String(val).slice(0, 100);
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Capture I/O from Call Site Analysis                 ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Step 1: Parse the code
  console.log('Step 1: Parsing AST...');
  const code = fs.readFileSync(EXTRACTED_FILE, 'utf8');

  // Remove export keywords for parsing
  const cleanCode = code.replace(/^export\s+/gm, '');

  let ast;
  try {
    ast = acorn.parse(cleanCode, { ecmaVersion: 2020, allowReturnOutsideFunction: true });
  } catch (e) {
    console.error('Parse error:', e.message);
    // Try with loose parsing
    ast = acorn.parse(cleanCode, { ecmaVersion: 2020, allowReturnOutsideFunction: true, allowReserved: true });
  }
  console.log('  AST parsed successfully\n');

  // Step 2: Find all function definitions
  console.log('Step 2: Finding function definitions...');
  const functions = new Map();

  walk.simple(ast, {
    FunctionDeclaration(node) {
      if (node.id?.name) {
        functions.set(node.id.name, {
          name: node.id.name,
          params: node.params.map(p => p.name || 'arg'),
          node: node,
          callSites: [],
        });
      }
    },
    VariableDeclarator(node) {
      if (node.id?.name && node.init?.type === 'FunctionExpression') {
        functions.set(node.id.name, {
          name: node.id.name,
          params: node.init.params.map(p => p.name || 'arg'),
          node: node.init,
          callSites: [],
        });
      }
    },
  });

  console.log(`  Found ${functions.size} functions\n`);

  // Step 3: Find all call sites
  console.log('Step 3: Analyzing call sites...');

  walk.simple(ast, {
    CallExpression(node) {
      let fnName = null;

      if (node.callee.type === 'Identifier') {
        fnName = node.callee.name;
      } else if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
        fnName = node.callee.property.name;
      }

      if (fnName && functions.has(fnName)) {
        const fn = functions.get(fnName);
        const argTypes = node.arguments.map(inferType);
        fn.callSites.push({
          args: node.arguments,
          argTypes: argTypes,
        });
      }
    },
  });

  // Count functions with call sites
  let withCallSites = 0;
  for (const fn of functions.values()) {
    if (fn.callSites.length > 0) withCallSites++;
  }
  console.log(`  ${withCallSites} functions have call sites\n`);

  // Step 4: Generate test inputs based on call site patterns
  console.log('Step 4: Generating test inputs...');

  const testCases = new Map();

  for (const [name, fn] of functions) {
    if (fn.callSites.length === 0) {
      // No call sites - use param names to guess
      const types = fn.params.map(p => inferType({ type: 'Identifier', name: p }));
      testCases.set(name, { fn, argTypes: types });
    } else {
      // Use most common pattern from call sites
      const typeCounts = {};
      for (const site of fn.callSites) {
        const key = site.argTypes.join(',');
        typeCounts[key] = (typeCounts[key] || 0) + 1;
      }
      const bestPattern = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0][0];
      testCases.set(name, { fn, argTypes: bestPattern.split(',') });
    }
  }

  console.log(`  Generated patterns for ${testCases.size} functions\n`);

  // Step 5: Create sandbox and execute
  console.log('Step 5: Executing functions...');

  // Build a sandbox with all functions
  // The extracted code already defines window, document, etc. - don't redeclare
  const sandbox = {
    Math, Array, Object, String, Number, Boolean, JSON,
    Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
    Int32Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView,
    Map, Set,
  };

  // Add the functions to sandbox using eval in a controlled way
  try {
    // The code already has stubs for window/document - just run it
    const wrappedCode = `
      (function(Math, Array, Object, String, Number, Boolean, JSON,
                Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
                Int32Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView,
                Map, Set) {
        ${cleanCode}
        return { ${[...functions.keys()].join(', ')} };
      })
    `;
    const fn = eval(wrappedCode);
    const exports = fn(Math, Array, Object, String, Number, Boolean, JSON,
                       Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
                       Int32Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView,
                       Map, Set);
    Object.assign(sandbox, exports);
  } catch (e) {
    console.error('Error loading functions:', e.message.slice(0, 200));
  }

  // Execute and capture
  const results = {};
  let success = 0, failed = 0;

  for (const [name, { fn, argTypes }] of testCases) {
    const func = sandbox[name];
    if (typeof func !== 'function') continue;

    // Generate 3 test cases
    const captured = [];

    for (let i = 0; i < 3; i++) {
      const args = argTypes.map(t => {
        const vals = generateValues(t);
        return vals[i % vals.length];
      });

      try {
        const output = func(...args);
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
        argTypes: argTypes,
        callSiteCount: fn.callSites.length,
        results: captured,
      };
      success++;
    } else {
      failed++;
    }
  }

  console.log(`  Success: ${success}, Failed: ${failed}\n`);

  // Save results
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
  console.log(`With call sites: ${withCallSites}`);
  console.log(`Successfully captured: ${success}`);
  console.log(`Failed: ${failed}`);
  console.log(`\nOutput: ${OUTPUT_DIR}`);
}

main().catch(err => { console.error(err); process.exit(1); });
