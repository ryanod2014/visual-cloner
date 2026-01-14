#!/usr/bin/env node
/**
 * Capture I/O from extracted Photopea functions
 *
 * Loads the beautified/extracted functions and tests them programmatically.
 * No network needed - all local execution.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTRACTED_FILE = '/Users/ryanodonnell/projects/style_extractor_prototype/clean-room-cloner/extracted/photopea-v5-extracted.js';
const OUTPUT_DIR = path.join(__dirname, '..', 'captured-io', 'internal');

// Test input generators based on parameter patterns
const INPUT_GENERATORS = {
  // Numeric parameters
  number: () => [0, 1, -1, 0.5, 100, 255, Math.PI],

  // Array/buffer parameters
  array: () => [
    [],
    [1, 2, 3],
    [0, 0, 0, 0],
    new Array(16).fill(0).map((_, i) => i),
  ],

  uint8: () => [
    new Uint8Array([0, 128, 255]),
    new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]), // RGBA red, green
    new Uint8Array(16).fill(128),
  ],

  float: () => [
    new Float32Array([0, 0.5, 1]),
    new Float64Array([0, 0.25, 0.5, 0.75, 1]),
    new Float32Array(16).fill(0).map((_, i) => Math.sin(i * 0.1)),
  ],

  // String parameters
  string: () => ['', 'test', 'hello world', 'rgba(255,0,0,1)'],

  // Object parameters
  object: () => [
    {},
    { x: 0, y: 0 },
    { width: 100, height: 100 },
    { r: 255, g: 0, b: 0, a: 255 },
  ],

  // Boolean
  boolean: () => [true, false],

  // Mixed/unknown
  unknown: () => [0, 1, null, undefined, '', [], {}],
};

// Detect parameter type from name
function guessParamType(name) {
  const n = name.toLowerCase();
  if (/^(x|y|z|w|h|width|height|size|len|length|index|i|j|k|n|m|num|count|offset|stride)$/.test(n)) return 'number';
  if (/^(r|g|b|a|red|green|blue|alpha|hue|sat|val|opacity)$/.test(n)) return 'number';
  if (/^(angle|rotation|theta|phi|rad|deg|scale|zoom|ratio)$/.test(n)) return 'number';
  if (/array|arr|list|items|data|buffer|pixels|rgba|img/.test(n)) return 'array';
  if (/uint8|u8|bytes/.test(n)) return 'uint8';
  if (/float|f32|f64/.test(n)) return 'float';
  if (/str|name|text|label|id|key|path|url/.test(n)) return 'string';
  if (/obj|opts|options|config|props|style/.test(n)) return 'object';
  if (/^(is|has|should|can|enable|disable|flag|bool)/.test(n)) return 'boolean';
  return 'unknown';
}

// Generate test cases for a function
function generateTestCases(params) {
  if (params.length === 0) return [[]]; // No params = one test with empty args

  const paramTypes = params.map(p => guessParamType(p));
  const paramValues = paramTypes.map(t => INPUT_GENERATORS[t]());

  // Generate cartesian product (limited)
  const testCases = [];
  const maxPerParam = 3;
  const maxTotal = 10;

  function generate(index, current) {
    if (testCases.length >= maxTotal) return;
    if (index === params.length) {
      testCases.push([...current]);
      return;
    }
    const values = paramValues[index].slice(0, maxPerParam);
    for (const val of values) {
      current.push(val);
      generate(index + 1, current);
      current.pop();
    }
  }

  generate(0, []);
  return testCases;
}

// Serialize value for JSON
function serialize(val, depth = 0) {
  if (depth > 3) return '[MAX_DEPTH]';
  if (val === null) return null;
  if (val === undefined) return undefined;
  if (typeof val === 'function') return '[Function]';
  if (typeof val === 'number') return Number.isFinite(val) ? val : String(val);
  if (typeof val === 'string' || typeof val === 'boolean') return val;

  if (ArrayBuffer.isView(val)) {
    return {
      __type: val.constructor.name,
      length: val.length,
      data: Array.from(val.slice(0, 50)),
    };
  }

  if (Array.isArray(val)) {
    return val.slice(0, 20).map(v => serialize(v, depth + 1));
  }

  if (typeof val === 'object') {
    const obj = {};
    let count = 0;
    for (const k of Object.keys(val)) {
      if (count++ > 10) break;
      try { obj[k] = serialize(val[k], depth + 1); } catch (e) { obj[k] = '[Error]'; }
    }
    return obj;
  }

  return String(val).slice(0, 100);
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Capture I/O from Extracted Functions                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Read the extracted functions file
  console.log('Loading extracted functions...');
  const code = fs.readFileSync(EXTRACTED_FILE, 'utf8');

  // Parse exports
  const exportRegex = /export\s+(const|function)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:=\s*function\s*)?\(([^)]*)\)/g;
  const functions = [];

  let match;
  while ((match = exportRegex.exec(code)) !== null) {
    const [, type, name, paramsStr] = match;
    const params = paramsStr.split(',').map(p => p.trim()).filter(p => p && !p.includes('='));

    // Skip classes (constructors that use 'this')
    const funcStart = match.index;
    const funcSnippet = code.slice(funcStart, funcStart + 500);
    const isClass = /this\.\w+\s*=/.test(funcSnippet);

    functions.push({
      name,
      type,
      params,
      isClass,
      position: funcStart,
    });
  }

  console.log(`Found ${functions.length} exported functions`);

  // Filter to testable functions (not classes)
  const testable = functions.filter(f => !f.isClass && f.params.length <= 5);
  console.log(`Testable functions (not classes, ≤5 params): ${testable.length}\n`);

  // Create a sandbox to execute functions
  const sandbox = {
    Math,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Int8Array, Uint8Array, Uint8ClampedArray,
    Int16Array, Uint16Array, Int32Array, Uint32Array,
    Float32Array, Float64Array,
    ArrayBuffer, DataView,
    Map, Set, WeakMap, WeakSet,
    JSON,
    console: { log: () => {}, error: () => {}, warn: () => {} },
    window: {},
    document: { getElementById: () => null, querySelector: () => null, createElement: () => ({}) },
    localStorage: { getItem: () => null, setItem: () => {} },
    // Add stubs for common dependencies
    ColorMath: { E: { f: null } },
    StringUtils: { w: () => ({}) },
    MathUtils: { ai: (a, b) => Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2) },
  };

  // Load the extracted code into sandbox
  console.log('Loading code into sandbox...');
  try {
    const wrappedCode = `
      ${code.replace(/export\s+/g, '')}
      // Return all functions
      ({${functions.map(f => f.name).join(', ')}})
    `;

    const script = new vm.Script(wrappedCode);
    const context = vm.createContext(sandbox);
    const exports = script.runInContext(context, { timeout: 10000 });

    // Merge exports into sandbox
    Object.assign(sandbox, exports);
    console.log('Code loaded successfully\n');
  } catch (e) {
    console.error('Error loading code:', e.message);
    console.log('Continuing with partial execution...\n');
  }

  // Test each function
  console.log('='.repeat(60));
  console.log('TESTING FUNCTIONS');
  console.log('='.repeat(60) + '\n');

  const results = {};
  let successCount = 0;
  let errorCount = 0;

  for (const func of testable.slice(0, 100)) { // Limit to first 100 for speed
    const fn = sandbox[func.name];
    if (typeof fn !== 'function') continue;

    const testCases = generateTestCases(func.params);
    const captured = [];

    for (const args of testCases) {
      try {
        const output = fn(...args);
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

    // Only save if we got at least one successful result
    const successes = captured.filter(c => c.error === null);
    if (successes.length > 0) {
      results[func.name] = {
        function: func.name,
        params: func.params,
        results: captured,
      };
      successCount++;
      console.log(`✓ ${func.name}(${func.params.join(', ')}) - ${successes.length}/${captured.length} OK`);
    } else {
      errorCount++;
      console.log(`✗ ${func.name} - all tests failed`);
    }
  }

  // Save results
  console.log('\n' + '='.repeat(60));
  console.log('SAVING RESULTS');
  console.log('='.repeat(60) + '\n');

  // Save individual files
  for (const [name, data] of Object.entries(results)) {
    const outPath = path.join(OUTPUT_DIR, `${name}.json`);
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  }

  // Save combined
  const allPath = path.join(OUTPUT_DIR, '_all.json');
  fs.writeFileSync(allPath, JSON.stringify(results, null, 2));

  console.log(`Success: ${successCount} functions`);
  console.log(`Failed: ${errorCount} functions`);
  console.log(`\nSaved to: ${OUTPUT_DIR}`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
