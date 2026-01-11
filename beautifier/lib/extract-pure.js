#!/usr/bin/env node
/**
 * Pure Function Extractor
 *
 * Extracts TRULY pure functions that can run in complete isolation.
 * A function is truly pure if it ONLY references:
 *   - Its own parameters
 *   - Its own local variables
 *   - Safe built-in globals (Math, Array, Object, etc.)
 *
 * Unlike the purity check in inline-constants.js, this is STRICT:
 * - ColorMath, StringUtils, WebGLRenderer = NOT pure (module objects)
 * - Any uppercase identifier not in safe list = NOT pure
 */

const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const inputFile = process.argv[2];
const outputFile = process.argv[3] || inputFile.replace('.js', '.pure-functions.js');
const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

if (!inputFile) {
  console.log('Usage: node extract-pure.js <input.js> [output.js] [--verbose]');
  process.exit(1);
}

console.log('Pure Function Extractor (Strict)');
console.log('=================================');
console.log(`Input: ${inputFile}`);

const code = fs.readFileSync(inputFile, 'utf8');
let ast;

try {
  ast = parser.parse(code, { sourceType: 'script', errorRecovery: true });
} catch (e) {
  ast = parser.parse(code, { sourceType: 'module', errorRecovery: true });
}

// Truly safe globals - these exist in ANY JS environment
const SAFE_GLOBALS = new Set([
  // Values
  'undefined', 'null', 'NaN', 'Infinity',
  // Constructors that are pure when used correctly
  'Array', 'Object', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt',
  'Map', 'Set', 'WeakMap', 'WeakSet',
  'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array',
  'ArrayBuffer', 'DataView',
  'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'Promise',
  // Pure utility objects
  'Math', 'JSON', 'Reflect', 'Proxy',
  // Type checking
  'isNaN', 'isFinite', 'parseInt', 'parseFloat',
  'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent',
  // Keywords that look like identifiers
  'true', 'false', 'this', 'arguments',
]);

// These are NOT safe - they have side effects or require environment
const UNSAFE_GLOBALS = new Set([
  'console', 'window', 'document', 'global', 'globalThis',
  'fetch', 'XMLHttpRequest', 'WebSocket',
  'setTimeout', 'setInterval', 'requestAnimationFrame',
  'localStorage', 'sessionStorage',
  'navigator', 'location', 'history',
  'Image', 'Audio', 'Video', 'Canvas',
  'Worker', 'SharedWorker', 'ServiceWorker',
  'Blob', 'File', 'FileReader', 'URL',
  'Event', 'CustomEvent', 'EventTarget',
  'Node', 'Element', 'HTMLElement',
  'alert', 'confirm', 'prompt',
]);

// Results
const pureFunctions = [];
const impureFunctions = [];

function analyzeFunctionPurity(funcNode, funcName, funcPath) {
  const localVars = new Set();
  const params = new Set();
  const externalRefs = new Set();
  const unsafeReason = [];

  // Collect parameter names (including destructured)
  function collectParams(param) {
    if (t.isIdentifier(param)) {
      params.add(param.name);
    } else if (t.isAssignmentPattern(param)) {
      collectParams(param.left);
    } else if (t.isRestElement(param)) {
      collectParams(param.argument);
    } else if (t.isObjectPattern(param)) {
      for (const prop of param.properties) {
        if (t.isRestElement(prop)) {
          collectParams(prop.argument);
        } else if (t.isObjectProperty(prop)) {
          collectParams(prop.value);
        }
      }
    } else if (t.isArrayPattern(param)) {
      for (const elem of param.elements) {
        if (elem) collectParams(elem);
      }
    }
  }

  for (const param of funcNode.params) {
    collectParams(param);
  }

  // Track if function uses 'this' (makes it impure for extraction)
  let usesThis = false;

  // Traverse function body
  const bodyPath = funcPath.get('body');
  bodyPath.traverse({
    VariableDeclarator(innerPath) {
      if (t.isIdentifier(innerPath.node.id)) {
        localVars.add(innerPath.node.id.name);
      } else if (t.isObjectPattern(innerPath.node.id)) {
        for (const prop of innerPath.node.id.properties) {
          if (t.isObjectProperty(prop) && t.isIdentifier(prop.value)) {
            localVars.add(prop.value.name);
          } else if (t.isRestElement(prop) && t.isIdentifier(prop.argument)) {
            localVars.add(prop.argument.name);
          }
        }
      } else if (t.isArrayPattern(innerPath.node.id)) {
        for (const elem of innerPath.node.id.elements) {
          if (t.isIdentifier(elem)) {
            localVars.add(elem.name);
          }
        }
      }
    },

    FunctionDeclaration(innerPath) {
      // Skip nested functions - they have their own scope
      if (innerPath.node.id) {
        localVars.add(innerPath.node.id.name);
      }
      innerPath.skip();
    },

    FunctionExpression(innerPath) {
      innerPath.skip();
    },

    ArrowFunctionExpression(innerPath) {
      innerPath.skip();
    },

    ThisExpression() {
      usesThis = true;
      unsafeReason.push('uses this');
    },

    // Detect mutations to parameters (impure side effect)
    AssignmentExpression(innerPath) {
      const left = innerPath.node.left;

      // Check if assigning to a parameter's property: param.x = y or param[x] = y
      if (t.isMemberExpression(left)) {
        let root = left;
        while (t.isMemberExpression(root.object)) {
          root = root.object;
        }
        if (t.isIdentifier(root.object) && params.has(root.object.name)) {
          unsafeReason.push(`mutates parameter: ${root.object.name}`);
        }
      }
    },

    UpdateExpression(innerPath) {
      const arg = innerPath.node.argument;

      // Check if updating a parameter's property: param.x++ or param[x]++
      if (t.isMemberExpression(arg)) {
        let root = arg;
        while (t.isMemberExpression(root.object)) {
          root = root.object;
        }
        if (t.isIdentifier(root.object) && params.has(root.object.name)) {
          unsafeReason.push(`mutates parameter: ${root.object.name}`);
        }
      }
    },

    CallExpression(innerPath) {
      const callee = innerPath.node.callee;

      // Check for mutating array methods on parameters: param.push(), param.splice(), etc.
      const MUTATING_METHODS = new Set([
        'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin',
        'set' // for TypedArrays
      ]);

      if (t.isMemberExpression(callee) && t.isIdentifier(callee.property) &&
          MUTATING_METHODS.has(callee.property.name)) {
        let root = callee.object;
        while (t.isMemberExpression(root)) {
          root = root.object;
        }
        if (t.isIdentifier(root) && params.has(root.name)) {
          unsafeReason.push(`mutates parameter via .${callee.property.name}()`);
        }
      }

      // Check for eval
      if (t.isIdentifier(callee) && callee.name === 'eval') {
        unsafeReason.push('uses eval');
      }
    },

    Identifier(innerPath) {
      const name = innerPath.node.name;

      // Skip if it's a property key
      if (innerPath.parent && t.isMemberExpression(innerPath.parent) &&
          innerPath.parent.property === innerPath.node && !innerPath.parent.computed) {
        return;
      }

      // Skip if it's a key in object literal
      if (innerPath.parent && t.isObjectProperty(innerPath.parent) &&
          innerPath.parent.key === innerPath.node && !innerPath.parent.computed) {
        return;
      }

      // Skip if it's a declaration
      if (innerPath.parent && t.isVariableDeclarator(innerPath.parent) &&
          innerPath.parent.id === innerPath.node) {
        return;
      }

      // Skip if it's a function parameter
      if (innerPath.parent && (t.isFunctionDeclaration(innerPath.parent) ||
          t.isFunctionExpression(innerPath.parent) ||
          t.isArrowFunctionExpression(innerPath.parent)) &&
          innerPath.parent.params.includes(innerPath.node)) {
        return;
      }

      // Skip if it's a function name
      if (innerPath.parent && (t.isFunctionDeclaration(innerPath.parent) ||
          t.isFunctionExpression(innerPath.parent)) &&
          innerPath.parent.id === innerPath.node) {
        return;
      }

      // Check if it's a known safe/unsafe global
      if (UNSAFE_GLOBALS.has(name)) {
        externalRefs.add(name);
        unsafeReason.push(`uses unsafe global: ${name}`);
        return;
      }

      if (SAFE_GLOBALS.has(name)) {
        return; // OK
      }

      // Check if it's local
      if (params.has(name) || localVars.has(name)) {
        return; // OK
      }

      // Check if it looks like a module object (PascalCase or known patterns)
      if (/^[A-Z]/.test(name) || /^obj\d*$/.test(name) || /Utils|Manager|Handler|Renderer/.test(name)) {
        externalRefs.add(name);
        unsafeReason.push(`references module object: ${name}`);
        return;
      }

      // Any other unresolved identifier is external
      externalRefs.add(name);
      unsafeReason.push(`unresolved reference: ${name}`);
    },

    MemberExpression(innerPath) {
      // Check for global object access patterns
      const obj = innerPath.node.object;
      if (t.isIdentifier(obj)) {
        const name = obj.name;
        if (!params.has(name) && !localVars.has(name) && !SAFE_GLOBALS.has(name)) {
          // Already handled by Identifier visitor
        }
      }
    },

    CallExpression(innerPath) {
      const callee = innerPath.node.callee;

      // Check for eval, Function constructor, etc.
      if (t.isIdentifier(callee)) {
        if (callee.name === 'eval') {
          unsafeReason.push('uses eval');
        }
      }

      // Check for new Function()
      if (t.isNewExpression(innerPath.node) && t.isIdentifier(innerPath.node.callee)) {
        if (innerPath.node.callee.name === 'Function') {
          unsafeReason.push('uses new Function()');
        }
      }
    }
  });

  const isPure = externalRefs.size === 0 && !usesThis && unsafeReason.length === 0;

  return {
    name: funcName,
    isPure,
    externalRefs: [...externalRefs],
    reasons: unsafeReason,
    node: funcNode,
    code: generate(funcNode, { compact: false }).code
  };
}

// Find all functions and analyze them
traverse(ast, {
  FunctionDeclaration(path) {
    if (path.node.id) {
      const result = analyzeFunctionPurity(path.node, path.node.id.name, path);
      if (result.isPure) {
        pureFunctions.push(result);
      } else {
        impureFunctions.push(result);
      }
    }
  },

  FunctionExpression(path) {
    let funcName = null;

    // Named function expression
    if (path.node.id) {
      funcName = path.node.id.name;
    }
    // Assignment: var foo = function() {}
    else if (path.parent && t.isVariableDeclarator(path.parent) && t.isIdentifier(path.parent.id)) {
      funcName = path.parent.id.name;
    }
    // Method: X.prototype.foo = function() {}
    else if (path.parent && t.isAssignmentExpression(path.parent)) {
      const left = path.parent.left;
      if (t.isMemberExpression(left) && t.isIdentifier(left.property)) {
        funcName = left.property.name;
      }
    }
    // Object method: { foo: function() {} }
    else if (path.parent && t.isObjectProperty(path.parent) && t.isIdentifier(path.parent.key)) {
      funcName = path.parent.key.name;
    }

    if (funcName) {
      const result = analyzeFunctionPurity(path.node, funcName, path);
      if (result.isPure) {
        pureFunctions.push(result);
      } else {
        impureFunctions.push(result);
      }
    }
  },

  ArrowFunctionExpression(path) {
    let funcName = null;

    if (path.parent && t.isVariableDeclarator(path.parent) && t.isIdentifier(path.parent.id)) {
      funcName = path.parent.id.name;
    }

    if (funcName) {
      const result = analyzeFunctionPurity(path.node, funcName, path);
      if (result.isPure) {
        pureFunctions.push(result);
      } else {
        impureFunctions.push(result);
      }
    }
  }
});

// Output results
console.log(`\nAnalyzed ${pureFunctions.length + impureFunctions.length} functions`);
console.log(`Truly pure (extractable): ${pureFunctions.length}`);
console.log(`Impure (have dependencies): ${impureFunctions.length}`);

if (verbose && impureFunctions.length > 0) {
  console.log('\nSample impure functions:');
  for (const func of impureFunctions.slice(0, 15)) {
    console.log(`  ${func.name}: ${func.reasons.slice(0, 2).join(', ')}`);
  }
}

// Generate output with pure functions
const output = [];
output.push('/**');
output.push(' * Pure Functions Extracted from ' + inputFile);
output.push(' * These functions can run in complete isolation.');
output.push(' * Generated: ' + new Date().toISOString());
output.push(' */\n');

// Sort by name
pureFunctions.sort((a, b) => a.name.localeCompare(b.name));

for (const func of pureFunctions) {
  output.push('// ' + func.name);
  output.push(func.code);
  output.push('');
}

// Also export as module
output.push('\n// Export all functions');
output.push('if (typeof module !== "undefined") {');
output.push('  module.exports = {');
for (const func of pureFunctions) {
  output.push(`    ${func.name},`);
}
output.push('  };');
output.push('}');

fs.writeFileSync(outputFile, output.join('\n'));

console.log(`\nPure functions written to: ${outputFile}`);

// Also output a JSON summary
const summaryFile = outputFile.replace('.js', '.json');
const summary = {
  source: inputFile,
  generated: new Date().toISOString(),
  totalFunctions: pureFunctions.length + impureFunctions.length,
  pureFunctions: pureFunctions.map(f => ({
    name: f.name,
    lineCount: f.code.split('\n').length
  })),
  impureFunctions: impureFunctions.map(f => ({
    name: f.name,
    reasons: f.reasons.slice(0, 3),
    externalRefs: f.externalRefs.slice(0, 5)
  }))
};

fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
console.log(`Summary written to: ${summaryFile}`);
