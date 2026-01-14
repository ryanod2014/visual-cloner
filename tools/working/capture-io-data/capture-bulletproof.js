#!/usr/bin/env node
/**
 * Bulletproof I/O Capture - Extract Everything From The Code Itself
 *
 * The code contains ALL valid inputs ever used. We extract them.
 *
 * Step 1: Extract ALL literal values from entire codebase
 * Step 2: Extract ALL call sites with actual arguments
 * Step 3: Extract ALL object shapes from constructors
 * Step 4: Trace argument origins for non-literals
 * Step 5: Build complete input matrix
 * Step 6: Execute all functions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTRACTED_FILE = '/Users/ryanodonnell/projects/style_extractor_prototype/clean-room-cloner/extracted/photopea-v5-extracted.js';
const OUTPUT_DIR = path.join(__dirname, '..', 'captured-io', 'bulletproof');

// =============================================================================
// STEP 1: Extract ALL literals from codebase
// =============================================================================

function extractAllLiterals(ast, code) {
  const literals = {
    strings: new Set(),
    numbers: new Set(),
    booleans: new Set([true, false]),
  };

  walk.simple(ast, {
    Literal(node) {
      if (typeof node.value === 'string') {
        literals.strings.add(node.value);
      } else if (typeof node.value === 'number') {
        literals.numbers.add(node.value);
      }
    },
  });

  return {
    strings: [...literals.strings],
    numbers: [...literals.numbers].sort((a, b) => a - b),
    booleans: [true, false],
  };
}

// =============================================================================
// STEP 2: Extract ALL call sites with actual arguments
// =============================================================================

function extractCallSites(ast, code, functions) {
  const callSites = new Map();

  walk.simple(ast, {
    CallExpression(node) {
      let fnName = null;
      if (node.callee.type === 'Identifier') {
        fnName = node.callee.name;
      }

      if (fnName && functions.has(fnName)) {
        if (!callSites.has(fnName)) callSites.set(fnName, []);

        // Extract argument values/types from AST
        const args = node.arguments.map(arg => extractArgValue(arg, code));
        callSites.get(fnName).push(args);
      }
    },
    NewExpression(node) {
      if (node.callee.type === 'Identifier') {
        const fnName = node.callee.name;
        if (functions.has(fnName)) {
          if (!callSites.has(fnName)) callSites.set(fnName, []);
          const args = node.arguments.map(arg => extractArgValue(arg, code));
          callSites.get(fnName).push(args);
        }
      }
    },
  });

  return callSites;
}

function extractArgValue(node, code) {
  switch (node.type) {
    case 'Literal':
      return { type: typeof node.value, value: node.value, literal: true };

    case 'Identifier':
      return { type: 'identifier', name: node.name };

    case 'ArrayExpression':
      return {
        type: 'array',
        elements: node.elements.map(el => el ? extractArgValue(el, code) : { type: 'null', value: null }),
      };

    case 'ObjectExpression':
      const obj = {};
      for (const prop of node.properties) {
        const key = prop.key.name || prop.key.value;
        obj[key] = extractArgValue(prop.value, code);
      }
      return { type: 'object', properties: obj };

    case 'NewExpression':
      return {
        type: 'new',
        callee: node.callee.name || code.slice(node.callee.start, node.callee.end),
        args: node.arguments.map(arg => extractArgValue(arg, code)),
      };

    case 'MemberExpression':
      const objName = node.object.name || code.slice(node.object.start, node.object.end);
      const propName = node.property.name || node.property.value;
      return { type: 'member', object: objName, property: propName };

    case 'BinaryExpression':
    case 'UnaryExpression':
      return { type: 'number', computed: true };

    case 'CallExpression':
      return { type: 'call', callee: node.callee.name || 'anonymous' };

    default:
      return { type: 'unknown', astType: node.type };
  }
}

// =============================================================================
// STEP 3: Extract ALL object shapes from constructors
// =============================================================================

function extractObjectFactories(ast, code) {
  const factories = new Map();

  walk.simple(ast, {
    // Object literal assignments: var layer = { pixels: ..., width: ... }
    VariableDeclarator(node) {
      if (node.init?.type === 'ObjectExpression') {
        const shape = extractObjectShape(node.init, code);
        if (Object.keys(shape).length > 0) {
          const name = node.id.name;
          factories.set(name + '_shape', shape);
        }
      }
    },

    // Constructor functions: this.pixels = ...; this.width = ...
    FunctionDeclaration(node) {
      if (!node.id?.name) return;
      const bodyText = code.slice(node.body.start, node.body.end);
      const shape = extractThisAssignments(bodyText);
      if (Object.keys(shape).length > 0) {
        factories.set(node.id.name, shape);
      }
    },
  });

  return factories;
}

function extractObjectShape(node, code) {
  const shape = {};
  for (const prop of node.properties || []) {
    const key = prop.key.name || prop.key.value;
    const value = extractArgValue(prop.value, code);
    shape[key] = value;
  }
  return shape;
}

function extractThisAssignments(bodyText) {
  const shape = {};
  const pattern = /this\.(\w+)\s*=\s*([^;]+)/g;
  let match;
  while ((match = pattern.exec(bodyText)) !== null) {
    const [, prop, valueStr] = match;
    // Infer type from value
    if (/^\d+$/.test(valueStr.trim())) {
      shape[prop] = { type: 'number' };
    } else if (/^["']/.test(valueStr.trim())) {
      shape[prop] = { type: 'string' };
    } else if (/^(true|false)$/.test(valueStr.trim())) {
      shape[prop] = { type: 'boolean' };
    } else if (/^\[/.test(valueStr.trim())) {
      shape[prop] = { type: 'array' };
    } else if (/^\{/.test(valueStr.trim())) {
      shape[prop] = { type: 'object' };
    } else if (/^new\s+Uint8Array/.test(valueStr.trim())) {
      shape[prop] = { type: 'uint8array' };
    } else if (/^new\s+Float32Array/.test(valueStr.trim())) {
      shape[prop] = { type: 'float32array' };
    } else {
      shape[prop] = { type: 'unknown' };
    }
  }
  return shape;
}

// =============================================================================
// STEP 4: Build value generators from extracted literals
// =============================================================================

function buildValueGenerators(literals, factories) {
  return {
    number: () => {
      // Use all numbers from codebase, prioritizing common values
      const common = [0, 1, -1, 0.5, 100, 255, 256];
      const fromCode = literals.numbers.filter(n => Math.abs(n) < 10000).slice(0, 20);
      return [...new Set([...common, ...fromCode])].slice(0, 15);
    },

    string: () => {
      // Use all strings from codebase
      const common = ['', 'normal', 'multiply', 'screen', 'overlay'];
      const fromCode = literals.strings.filter(s => s.length > 0 && s.length < 50).slice(0, 50);
      return [...new Set([...common, ...fromCode])].slice(0, 30);
    },

    boolean: () => [true, false],

    array: () => [
      [],
      [0, 1, 2, 3],
      [0, 0, 0, 0],
      literals.numbers.slice(0, 10),
    ],

    uint8array: () => [
      new Uint8Array([0, 0, 0, 255]),
      new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]),
      new Uint8Array(16).fill(128),
      new Uint8Array(256).fill(0).map((_, i) => i),
    ],

    float32array: () => [
      new Float32Array([0, 0.5, 1]),
      new Float32Array(16).fill(0).map((_, i) => i / 16),
      new Float32Array([0, 0.25, 0.5, 0.75, 1]),
    ],

    object: () => [
      {},
      { x: 0, y: 0 },
      { x: 0, y: 0, s: 100, H: 100 },
      { width: 100, height: 100 },
    ],

    point: () => [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 0.5, y: 0.5 },
    ],

    rect: () => [
      { x: 0, y: 0, s: 100, H: 100 },
      { x: 0, y: 0, s: 256, H: 256 },
    ],

    matrix: () => [
      { OU: 1, c: 0, sJ: 0, $m: 1, Pb: 0, WQ: 0 },
      { OU: 2, c: 0, sJ: 0, $m: 2, Pb: 0, WQ: 0 },
    ],

    null: () => [null],
    undefined: () => [undefined],
    unknown: () => [0, '', null, [], {}],
  };
}

// =============================================================================
// STEP 5: Infer parameter types and generate inputs
// =============================================================================

function inferParamType(paramName, callSiteArgs, paramIndex) {
  // Handle missing param name
  if (!paramName) return 'unknown';

  // First check call site data
  if (callSiteArgs && callSiteArgs.length > 0) {
    const types = callSiteArgs
      .filter(args => args[paramIndex])
      .map(args => args[paramIndex].type);

    // Most common type
    const typeCounts = {};
    for (const t of types) {
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0 && sorted[0][0] !== 'unknown') {
      return sorted[0][0];
    }
  }

  // Fall back to name-based inference
  const n = (paramName || '').toLowerCase();
  if (/^(x|y|z|w|h|width|height|size|len|length|index|i|j|k|n|m|num|offset|scale)/.test(n)) return 'number';
  if (/^(r|g|b|a|red|green|blue|alpha|hue|sat|val|opacity)/.test(n)) return 'number';
  if (/pixel|data|buffer|uint8/.test(n)) return 'uint8array';
  if (/float|curve/.test(n)) return 'float32array';
  if (/array|arr|list/.test(n)) return 'array';
  if (/str|name|text|label|mode|type/.test(n)) return 'string';
  if (/^(is|has|should|can|flag)/.test(n)) return 'boolean';
  if (/point|pt|pos/.test(n)) return 'point';
  if (/rect|bounds|box/.test(n)) return 'rect';
  if (/matrix|transform/.test(n)) return 'matrix';

  return 'unknown';
}

function generateInputCombinations(params, callSiteArgs, generators) {
  const inputs = [];

  // Handle empty params
  if (!params || params.length === 0) {
    return [[]];
  }

  // First: use exact values from call sites
  if (callSiteArgs && callSiteArgs.length > 0) {
    for (const args of callSiteArgs.slice(0, 5)) { // Limit call site samples
      const concrete = args.map((arg, i) => {
        if (!arg) return null;
        if (arg.literal && arg.value !== undefined) return arg.value;
        if (arg.type === 'new' && arg.callee === 'Uint8Array') {
          return new Uint8Array([0, 0, 0, 255]);
        }
        if (arg.type === 'array' && arg.elements) {
          return arg.elements.map(el => el?.value ?? 0);
        }
        // Use generator for non-literal
        const paramType = inferParamType(params[i], null, i);
        const gen = generators[paramType] || generators.unknown;
        return gen()[0];
      });
      inputs.push(concrete);
    }
  }

  // Second: generate variations based on param types
  const paramTypes = params.map((p, i) => inferParamType(p, callSiteArgs, i));
  const paramValues = paramTypes.map(t => {
    const gen = generators[t] || generators.unknown;
    return gen();
  });

  // Generate combinations (limited)
  const maxCombinations = 10;
  const multiplier = paramValues[0]?.length || 1;
  for (let i = 0; i < maxCombinations && i < multiplier * (paramValues[1]?.length || 1); i++) {
    const args = paramTypes.map((t, idx) => {
      const vals = paramValues[idx] || [null];
      return vals[i % vals.length];
    });
    inputs.push(args);
  }

  // Remove duplicates
  const seen = new Set();
  return inputs.filter(args => {
    const key = JSON.stringify(args, (k, v) => {
      if (ArrayBuffer.isView(v)) return `[${v.constructor.name}:${v.length}]`;
      return v;
    });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// =============================================================================
// STEP 6: Execute and capture
// =============================================================================

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
  console.log('║       Bulletproof I/O Capture - Extract Everything        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Parse code
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
  console.log(`  Parsed in ${Date.now() - startTime}ms\n`);

  // Step 1: Extract all literals
  console.log('Step 2: Extracting all literals...');
  const literals = extractAllLiterals(ast, cleanCode);
  console.log(`  Strings: ${literals.strings.length}`);
  console.log(`  Numbers: ${literals.numbers.length}`);
  console.log(`  Sample strings: ${literals.strings.slice(0, 5).join(', ')}`);
  console.log(`  Sample numbers: ${literals.numbers.slice(0, 10).join(', ')}\n`);

  // Find all functions
  console.log('Step 3: Finding functions...');
  const functions = new Map();

  walk.simple(ast, {
    FunctionDeclaration(node) {
      if (node.id?.name) {
        const bodyText = cleanCode.slice(node.body.start, node.body.end);
        const isConstructor = /this\.\w+\s*=/.test(bodyText);
        functions.set(node.id.name, {
          name: node.id.name,
          params: node.params.map(p => p.name || 'arg'),
          isConstructor,
        });
      }
    },
    VariableDeclarator(node) {
      if (node.id?.name && node.init?.type === 'FunctionExpression') {
        const bodyText = cleanCode.slice(node.init.body.start, node.init.body.end);
        const isConstructor = /this\.\w+\s*=/.test(bodyText);
        functions.set(node.id.name, {
          name: node.id.name,
          params: node.init.params.map(p => p.name || 'arg'),
          isConstructor,
        });
      }
    },
  });
  console.log(`  Found ${functions.size} functions\n`);

  // Step 2: Extract call sites
  console.log('Step 4: Extracting call sites...');
  const callSites = extractCallSites(ast, cleanCode, functions);
  console.log(`  Functions with call sites: ${callSites.size}\n`);

  // Step 3: Extract object factories
  console.log('Step 5: Extracting object shapes...');
  const factories = extractObjectFactories(ast, cleanCode);
  console.log(`  Object shapes found: ${factories.size}\n`);

  // Build generators
  const generators = buildValueGenerators(literals, factories);

  // Load code into sandbox
  console.log('Step 6: Creating sandbox...');
  const sandbox = {
    Math, Array, Object, String, Number, Boolean, JSON,
    Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
    Int32Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView,
    Map, Set, WeakMap, WeakSet, Date, RegExp, Error,
    console: { log: () => {}, error: () => {}, warn: () => {} },
    setTimeout: () => {}, clearTimeout: () => {}, requestAnimationFrame: () => {},
  };

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
    console.log('  Sandbox ready\n');
  } catch (e) {
    console.error('  Error loading:', e.message.slice(0, 100));
  }

  // Execute all functions
  console.log('Step 7: Capturing I/O...');
  const results = {};
  let successCount = 0, failCount = 0, totalPairs = 0;

  for (const [name, fn] of functions) {
    const func = sandbox[name];
    if (typeof func !== 'function') continue;

    const fnCallSites = callSites.get(name) || [];
    const inputs = generateInputCombinations(fn.params, fnCallSites, generators);
    const captured = [];

    for (const args of inputs) {
      try {
        let output;
        if (fn.isConstructor) {
          output = new func(...args);
        } else {
          output = func(...args);
        }
        captured.push({
          input: args.map(serialize),
          output: serialize(output),
          error: null,
        });
        totalPairs++;
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
        isConstructor: fn.isConstructor,
        callSiteCount: fnCallSites.length,
        results: captured,
      };
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log(`  Success: ${successCount}, Failed: ${failCount}, Total I/O pairs: ${totalPairs}\n`);

  // Save results
  console.log('Step 8: Saving...');
  for (const [name, data] of Object.entries(results)) {
    fs.writeFileSync(path.join(OUTPUT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, '_all.json'), JSON.stringify(results, null, 2));

  // Save extracted metadata
  fs.writeFileSync(path.join(OUTPUT_DIR, '_literals.json'), JSON.stringify(literals, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, '_callsites.json'), JSON.stringify(
    Object.fromEntries([...callSites.entries()].map(([k, v]) => [k, v.length])),
    null, 2
  ));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total functions: ${functions.size}`);
  console.log(`Functions captured: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total I/O pairs: ${totalPairs}`);
  console.log(`Elapsed: ${elapsed}s`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

main().catch(err => { console.error(err); process.exit(1); });
