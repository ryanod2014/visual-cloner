#!/usr/bin/env node
/**
 * Instrument Source Code v2 - Simpler approach
 *
 * Instead of wrapping function bodies (which breaks on nested functions),
 * just add entry hook at start and wrap each return statement.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTRACTED_FILE = '/Users/ryanodonnell/projects/style_extractor_prototype/clean-room-cloner/extracted/photopea-v5-extracted.js';
const OUTPUT_FILE = path.join(__dirname, '..', 'instrumented', 'photopea-instrumented-v2.js');

// Simpler capture runtime
const CAPTURE_RUNTIME = `
// === I/O CAPTURE RUNTIME ===
window.__capture = {
  data: {},
  maxPerFn: 20,

  serialize: function(obj, depth) {
    depth = depth || 0;
    if (depth > 4) return '[DEEP]';
    if (obj === null) return null;
    if (obj === undefined) return undefined;
    if (typeof obj === 'function') return '[Fn]';
    if (typeof obj === 'number') return Number.isFinite(obj) ? obj : String(obj);
    if (typeof obj === 'string') return obj.length > 100 ? obj.slice(0, 100) + '...' : obj;
    if (typeof obj === 'boolean') return obj;
    if (typeof obj !== 'object') return String(obj);

    // Typed arrays
    if (ArrayBuffer.isView(obj)) {
      return { __t: obj.constructor.name, len: obj.length, d: Array.from(obj.slice(0, 30)) };
    }

    // Arrays
    if (Array.isArray(obj)) {
      return obj.slice(0, 20).map(x => this.serialize(x, depth + 1));
    }

    // Objects
    var r = {};
    var keys = Object.keys(obj).slice(0, 15);
    for (var i = 0; i < keys.length; i++) {
      try { r[keys[i]] = this.serialize(obj[keys[i]], depth + 1); } catch(e) { r[keys[i]] = '[E]'; }
    }
    return r;
  },

  record: function(fn, args, result, error) {
    if (!this.data[fn]) this.data[fn] = [];
    if (this.data[fn].length >= this.maxPerFn) return;

    var sArgs = [];
    for (var i = 0; i < args.length; i++) {
      sArgs.push(this.serialize(args[i]));
    }

    this.data[fn].push({
      i: sArgs,
      o: error ? undefined : this.serialize(result),
      e: error ? String(error) : null
    });
  },

  getData: function() {
    var results = {};
    for (var fn in this.data) {
      results[fn] = {
        function: fn,
        results: this.data[fn].map(function(d) {
          return { input: d.i, output: d.o, error: d.e };
        })
      };
    }
    return results;
  }
};

// Helper to wrap function execution
window.__wrapFn = function(fn, name) {
  return function() {
    var args = arguments;
    try {
      var result = fn.apply(this, args);
      __capture.record(name, args, result, null);
      return result;
    } catch (e) {
      __capture.record(name, args, null, e.message);
      throw e;
    }
  };
};
// === END CAPTURE RUNTIME ===

`;

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Instrument Source v2 (Wrapper-based)                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const outputDir = path.dirname(OUTPUT_FILE);
  fs.mkdirSync(outputDir, { recursive: true });

  console.log('Reading source...');
  const code = fs.readFileSync(EXTRACTED_FILE, 'utf8');
  let cleanCode = code.replace(/^export\s+/gm, '');

  // Remove browser stub declarations (they conflict with real browser)
  // These are at the top of the extracted file
  const stubSection = cleanCode.indexOf('// Stub browser globals');
  const stubEnd = cleanCode.indexOf('\n\nconst n = function');
  if (stubSection !== -1 && stubEnd !== -1) {
    cleanCode = cleanCode.slice(0, stubSection) + '// Browser stubs removed (using real browser)\n' + cleanCode.slice(stubEnd);
  }

  console.log('Parsing AST...');
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

  // Collect all top-level function names
  const functionDefs = [];

  walk.simple(ast, {
    FunctionDeclaration(node) {
      if (node.id?.name) {
        functionDefs.push({
          name: node.id.name,
          type: 'declaration'
        });
      }
    },
    VariableDeclarator(node) {
      if (node.id?.name && node.init?.type === 'FunctionExpression') {
        functionDefs.push({
          name: node.id.name,
          type: 'const'
        });
      }
    }
  });

  console.log(`Found ${functionDefs.length} functions\n`);

  // Convert const functions to var so they can be reassigned
  let modifiedCode = cleanCode;
  for (const fn of functionDefs) {
    if (fn.type === 'const') {
      // Replace 'const fnName = function' with 'var fnName = function'
      const pattern = new RegExp(`const\\s+${fn.name}\\s*=\\s*function`, 'g');
      modifiedCode = modifiedCode.replace(pattern, `var ${fn.name} = function`);
    }
  }

  // Generate wrapper code that wraps each function after definition
  let wrapperCode = '\n// === WRAP ALL FUNCTIONS ===\n';
  for (const fn of functionDefs) {
    wrapperCode += `if (typeof ${fn.name} === 'function') { ${fn.name} = __wrapFn(${fn.name}, '${fn.name}'); }\n`;
  }
  wrapperCode += '// === END WRAPPERS ===\n';

  // Combine: runtime + modified code + wrappers
  const finalCode = CAPTURE_RUNTIME + '\n' + modifiedCode + '\n' + wrapperCode;

  console.log('Writing instrumented code...');
  fs.writeFileSync(OUTPUT_FILE, finalCode);

  // Verify syntax
  console.log('Verifying syntax...');
  try {
    new Function(finalCode);
    console.log('  Syntax OK!\n');
  } catch (e) {
    console.error('  Syntax error:', e.message);
    return;
  }

  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Functions: ${functionDefs.length}`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log(`Size: ${(finalCode.length / 1024).toFixed(1)} KB`);
}

main().catch(err => { console.error(err); process.exit(1); });
