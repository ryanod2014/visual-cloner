#!/usr/bin/env node
/**
 * Instrument Source Code with I/O Capture Hooks
 *
 * Transforms every function to capture inputs and outputs:
 *
 * BEFORE:
 *   function processLayer(layer) { return result; }
 *
 * AFTER:
 *   function processLayer(layer) {
 *     __capture.enter('processLayer', arguments);
 *     var __result = (function(layer) { return result; }).apply(this, arguments);
 *     __capture.exit('processLayer', __result);
 *     return __result;
 *   }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTRACTED_FILE = '/Users/ryanodonnell/projects/style_extractor_prototype/clean-room-cloner/extracted/photopea-v5-extracted.js';
const OUTPUT_FILE = path.join(__dirname, '..', 'instrumented', 'photopea-instrumented.js');

// The capture runtime that will be injected
const CAPTURE_RUNTIME = `
// === I/O CAPTURE RUNTIME ===
window.__capture = {
  calls: [],
  maxCalls: 10000,
  maxDepth: 5,
  currentDepth: 0,

  serialize: function(obj, depth, seen) {
    depth = depth || 0;
    seen = seen || new WeakSet();

    if (depth > this.maxDepth) return '[MAX_DEPTH]';
    if (obj === null) return null;
    if (obj === undefined) return undefined;
    if (typeof obj === 'function') return '[Function]';
    if (typeof obj === 'number') return Number.isFinite(obj) ? obj : String(obj);
    if (typeof obj === 'string') return obj.length > 200 ? obj.slice(0, 200) + '...' : obj;
    if (typeof obj === 'boolean') return obj;

    if (typeof obj !== 'object') return String(obj);

    // Avoid circular refs
    if (seen.has(obj)) return '[CIRCULAR]';
    seen.add(obj);

    // Typed arrays
    if (obj instanceof Uint8Array || obj instanceof Uint8ClampedArray) {
      return { __type: obj.constructor.name, length: obj.length, sample: Array.from(obj.slice(0, 50)) };
    }
    if (obj instanceof Float32Array || obj instanceof Float64Array) {
      return { __type: obj.constructor.name, length: obj.length, sample: Array.from(obj.slice(0, 50)) };
    }
    if (obj instanceof Int32Array || obj instanceof Int16Array || obj instanceof Int8Array) {
      return { __type: obj.constructor.name, length: obj.length, sample: Array.from(obj.slice(0, 50)) };
    }
    if (obj instanceof ArrayBuffer) {
      return { __type: 'ArrayBuffer', byteLength: obj.byteLength };
    }

    // DOM elements
    if (typeof HTMLElement !== 'undefined' && obj instanceof HTMLElement) {
      return { __type: 'Element', tag: obj.tagName, id: obj.id, className: obj.className };
    }
    if (typeof HTMLCanvasElement !== 'undefined' && obj instanceof HTMLCanvasElement) {
      return { __type: 'Canvas', width: obj.width, height: obj.height };
    }
    if (typeof CanvasRenderingContext2D !== 'undefined' && obj instanceof CanvasRenderingContext2D) {
      return { __type: 'Context2D' };
    }
    if (typeof WebGLRenderingContext !== 'undefined' && obj instanceof WebGLRenderingContext) {
      return { __type: 'WebGLContext' };
    }

    // Arrays
    if (Array.isArray(obj)) {
      return obj.slice(0, 30).map(x => this.serialize(x, depth + 1, seen));
    }

    // Regular objects
    var result = { __type: obj.constructor?.name || 'Object' };
    var keys = Object.keys(obj).slice(0, 20);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      try {
        result[key] = this.serialize(obj[key], depth + 1, seen);
      } catch (e) {
        result[key] = '[ERROR: ' + e.message + ']';
      }
    }
    return result;
  },

  enter: function(fnName, args) {
    if (this.calls.length >= this.maxCalls) return;
    if (this.currentDepth > 10) return; // Prevent deep recursion

    this.currentDepth++;

    var serializedArgs = [];
    for (var i = 0; i < args.length; i++) {
      serializedArgs.push(this.serialize(args[i], 0));
    }

    this.calls.push({
      fn: fnName,
      type: 'enter',
      args: serializedArgs,
      time: Date.now()
    });
  },

  exit: function(fnName, result, error) {
    if (this.calls.length >= this.maxCalls) return;

    this.currentDepth--;

    this.calls.push({
      fn: fnName,
      type: 'exit',
      result: error ? undefined : this.serialize(result, 0),
      error: error ? error.message : undefined,
      time: Date.now()
    });
  },

  getResults: function() {
    // Pair enter/exit calls into I/O pairs
    var results = {};
    var stack = [];

    for (var i = 0; i < this.calls.length; i++) {
      var call = this.calls[i];
      if (call.type === 'enter') {
        stack.push(call);
      } else if (call.type === 'exit' && stack.length > 0) {
        var enter = stack.pop();
        if (enter.fn === call.fn) {
          if (!results[call.fn]) {
            results[call.fn] = { function: call.fn, results: [] };
          }
          results[call.fn].results.push({
            input: enter.args,
            output: call.result,
            error: call.error || null
          });
        }
      }
    }

    return results;
  },

  clear: function() {
    this.calls = [];
    this.currentDepth = 0;
  }
};
// === END CAPTURE RUNTIME ===

`;

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Instrument Source with I/O Capture                  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Create output directory
  const outputDir = path.dirname(OUTPUT_FILE);
  fs.mkdirSync(outputDir, { recursive: true });

  // Read source
  console.log('Reading source...');
  const code = fs.readFileSync(EXTRACTED_FILE, 'utf8');

  // Parse and find all functions
  console.log('Parsing AST...');
  const cleanCode = code.replace(/^export\s+/gm, '');

  let ast;
  try {
    ast = acorn.parse(cleanCode, {
      ecmaVersion: 2020,
      allowReturnOutsideFunction: true,
      sourceType: 'script'
    });
  } catch (e) {
    console.error('Parse error:', e.message);
    return;
  }

  // Find all function definitions
  const functions = [];
  walk.simple(ast, {
    FunctionDeclaration(node) {
      if (node.id?.name) {
        functions.push({
          name: node.id.name,
          start: node.start,
          end: node.end,
          bodyStart: node.body.start,
          bodyEnd: node.body.end,
          params: node.params.map(p => p.name || 'arg')
        });
      }
    },
    VariableDeclarator(node) {
      if (node.id?.name && node.init?.type === 'FunctionExpression') {
        functions.push({
          name: node.id.name,
          start: node.init.start,
          end: node.init.end,
          bodyStart: node.init.body.start,
          bodyEnd: node.init.body.end,
          params: node.init.params.map(p => p.name || 'arg'),
          isConst: true
        });
      }
    }
  });

  console.log(`Found ${functions.length} functions to instrument\n`);

  // Sort functions by position (reverse order for string manipulation)
  functions.sort((a, b) => b.bodyStart - a.bodyStart);

  // Instrument each function by modifying the string
  let instrumented = cleanCode;

  for (const fn of functions) {
    // Get the original body content (without braces)
    const bodyContent = instrumented.slice(fn.bodyStart + 1, fn.bodyEnd - 1);

    // Create instrumented body
    const instrumentedBody = `{
  __capture.enter('${fn.name}', arguments);
  try {
    ${bodyContent}
  } catch (__e__) {
    __capture.exit('${fn.name}', null, __e__);
    throw __e__;
  }
}`;

    // Replace the body
    instrumented = instrumented.slice(0, fn.bodyStart) +
                   instrumentedBody +
                   instrumented.slice(fn.bodyEnd);
  }

  // We need to also wrap returns to capture the exit
  // This is tricky - for now, let's use a simpler approach:
  // Add exit call before every return

  // Actually, the try-catch approach won't capture return values.
  // Let's use a different strategy - wrap the entire function body in an IIFE

  // Re-read and use a better instrumentation strategy
  console.log('Applying instrumentation...');

  let result = cleanCode;

  // Sort by position (reverse)
  functions.sort((a, b) => b.bodyStart - a.bodyStart);

  for (const fn of functions) {
    const bodyContent = result.slice(fn.bodyStart + 1, fn.bodyEnd - 1).trim();

    // Wrap body in try-catch with capture
    const wrapped = `{
  __capture.enter('${fn.name}', arguments);
  var __result__;
  try {
    __result__ = (function() {
      ${bodyContent}
    }).apply(this, arguments);
  } catch (__e__) {
    __capture.exit('${fn.name}', undefined, __e__);
    throw __e__;
  }
  __capture.exit('${fn.name}', __result__);
  return __result__;
}`;

    result = result.slice(0, fn.bodyStart) + wrapped + result.slice(fn.bodyEnd);
  }

  // Add the capture runtime at the beginning
  const finalCode = CAPTURE_RUNTIME + '\n' + result;

  // Write output
  console.log('Writing instrumented code...');
  fs.writeFileSync(OUTPUT_FILE, finalCode);

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Functions instrumented: ${functions.length}`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log(`Size: ${(finalCode.length / 1024).toFixed(1)} KB`);
}

main().catch(err => { console.error(err); process.exit(1); });
