#!/usr/bin/env node
/**
 * Function Dependency Bundler
 *
 * Extracts a function along with ALL its dependencies into a self-contained bundle.
 *
 * Usage:
 *   node bundle-function.js <input.js> <functionName> [output.js]
 *   node bundle-function.js <input.js> --all [output-dir]
 *
 * This solves the "impure function" problem by bundling dependencies rather than skipping.
 */

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const args = process.argv.slice(2);
const inputFile = args.find(a => !a.startsWith('--'));
const bundleAll = args.includes('--all');
const targetFunc = !bundleAll ? args.find((a, i) => !a.startsWith('--') && i > 0) : null;
const outputPath = args.find((a, i) => !a.startsWith('--') && i > 1) ||
                   (bundleAll ? './bundled-functions' : null);

if (!inputFile || (!bundleAll && !targetFunc)) {
  console.log(`
Function Dependency Bundler
===========================

Usage:
  node bundle-function.js <input.js> <functionName> [output.js]
  node bundle-function.js <input.js> --all [output-dir]

Examples:
  node bundle-function.js app.js processColor output.js
  node bundle-function.js app.js --all ./extracted/
`);
  process.exit(1);
}

console.log('Function Dependency Bundler');
console.log('===========================');
console.log(`Input: ${inputFile}`);

const code = fs.readFileSync(inputFile, 'utf8');
let ast;

try {
  ast = parser.parse(code, { sourceType: 'script', errorRecovery: true });
} catch (e) {
  ast = parser.parse(code, { sourceType: 'module', errorRecovery: true });
}

// Safe built-in globals that don't need bundling
const BUILTIN_GLOBALS = new Set([
  'undefined', 'null', 'NaN', 'Infinity', 'true', 'false',
  'Array', 'Object', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise',
  'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array',
  'ArrayBuffer', 'DataView', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError',
  'Math', 'JSON', 'Reflect', 'Proxy', 'console',
  'isNaN', 'isFinite', 'parseInt', 'parseFloat',
  'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent',
  'arguments', 'this'
]);

// ============================================
// PHASE 1: Build definition map
// ============================================

// Maps identifier names to their definitions
const definitions = new Map(); // name -> { type, node, dependencies: Set }

// Track what each definition references
function getReferencesInNode(node) {
  const refs = new Set();

  // Wrap node appropriately for traversal
  let wrapper;
  if (t.isStatement(node)) {
    wrapper = t.file(t.program([node]));
  } else if (t.isExpression(node)) {
    wrapper = t.file(t.program([t.expressionStatement(node)]));
  } else {
    // For other nodes, try wrapping in a program
    try {
      wrapper = t.file(t.program([node]));
    } catch (e) {
      return refs; // Can't traverse this node
    }
  }

  traverse(wrapper, {
    Identifier(path) {
      const name = path.node.name;

      // Skip property keys
      if (path.parent && t.isMemberExpression(path.parent) &&
          path.parent.property === path.node && !path.parent.computed) {
        return;
      }

      // Skip object property keys
      if (path.parent && t.isObjectProperty(path.parent) &&
          path.parent.key === path.node && !path.parent.computed) {
        return;
      }

      // Skip declarations
      if (path.parent && t.isVariableDeclarator(path.parent) &&
          path.parent.id === path.node) {
        return;
      }

      // Skip function names
      if (path.parent && (t.isFunctionDeclaration(path.parent) || t.isFunctionExpression(path.parent)) &&
          path.parent.id === path.node) {
        return;
      }

      // Skip function params
      if (path.parent && (t.isFunctionDeclaration(path.parent) ||
          t.isFunctionExpression(path.parent) || t.isArrowFunctionExpression(path.parent)) &&
          path.parent.params && path.parent.params.includes(path.node)) {
        return;
      }

      if (!BUILTIN_GLOBALS.has(name)) {
        refs.add(name);
      }
    },

    MemberExpression(path) {
      // Track namespace access: ColorMath.E.b -> ColorMath
      if (t.isIdentifier(path.node.object) && !BUILTIN_GLOBALS.has(path.node.object.name)) {
        refs.add(path.node.object.name);
      }
    }
  }, { scope: false, noScope: true });

  return refs;
}

// Helper to check if we're inside a named function (not IIFE module scope)
function isInsideNamedFunction(path) {
  let current = path.parentPath;
  while (current) {
    const node = current.node;

    // Named function = local scope (skip this definition)
    if (t.isFunctionDeclaration(node) && node.id) {
      return true;
    }

    // Named function expression = local scope
    if (t.isFunctionExpression(node) && node.id) {
      return true;
    }

    // Method definition = local scope
    if (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
      // Check if it's an IIFE (immediately invoked) - that's module scope
      if (current.parent && t.isCallExpression(current.parent) && current.parent.callee === node) {
        // This is an IIFE, continue checking parent
        current = current.parentPath;
        continue;
      }

      // Check if it's assigned to a variable at module scope
      if (current.parent && t.isVariableDeclarator(current.parent)) {
        current = current.parentPath;
        continue;
      }

      // Check if it's a method (X.prototype.foo = function)
      if (current.parent && t.isAssignmentExpression(current.parent)) {
        current = current.parentPath;
        continue;
      }

      // Otherwise it's inside a function body = local scope
      return true;
    }

    current = current.parentPath;
  }
  return false;
}

// First pass: collect all module-level definitions
traverse(ast, {
  // var x = ..., const x = ..., let x = ...
  VariableDeclaration(path) {
    // Skip if inside a named function (not module IIFE)
    if (isInsideNamedFunction(path)) return;

    for (const decl of path.node.declarations) {
      if (t.isIdentifier(decl.id) && decl.init) {
        const name = decl.id.name;
        const deps = getReferencesInNode(decl.init);

        definitions.set(name, {
          type: 'variable',
          node: decl,
          fullNode: path.node,
          dependencies: deps
        });
      }
    }
  },

  // function x() {}
  FunctionDeclaration(path) {
    if (isInsideNamedFunction(path)) return;

    if (path.node.id) {
      const name = path.node.id.name;
      const deps = getReferencesInNode(path.node);

      // Remove params from deps
      for (const param of path.node.params) {
        if (t.isIdentifier(param)) deps.delete(param.name);
      }

      definitions.set(name, {
        type: 'function',
        node: path.node,
        dependencies: deps
      });
    }
  },

  // X.Y = ... or X.prototype.Y = ...
  AssignmentExpression(path) {
    const left = path.node.left;

    // X.Y = value
    if (t.isMemberExpression(left) && t.isIdentifier(left.object)) {
      const namespace = left.object.name;
      const prop = t.isIdentifier(left.property) ? left.property.name : null;

      if (prop) {
        const fullName = `${namespace}.${prop}`;
        const deps = getReferencesInNode(path.node.right);
        deps.delete(namespace); // Don't depend on self

        // Track the namespace itself
        if (!definitions.has(namespace)) {
          definitions.set(namespace, {
            type: 'namespace',
            properties: new Map(),
            dependencies: new Set()
          });
        }

        const nsDef = definitions.get(namespace);
        if (nsDef.type === 'namespace' || nsDef.properties) {
          if (!nsDef.properties) nsDef.properties = new Map();
          nsDef.properties.set(prop, {
            node: path.node,
            dependencies: deps
          });

          // Add deps to namespace deps
          for (const d of deps) {
            nsDef.dependencies.add(d);
          }
        }
      }
    }

    // X.prototype.Y = function
    if (t.isMemberExpression(left) && t.isMemberExpression(left.object) &&
        t.isIdentifier(left.object.property, { name: 'prototype' })) {
      const className = t.isIdentifier(left.object.object) ? left.object.object.name : null;
      const methodName = t.isIdentifier(left.property) ? left.property.name : null;

      if (className && methodName) {
        const fullName = `${className}.prototype.${methodName}`;
        const deps = getReferencesInNode(path.node.right);
        deps.delete(className);

        if (!definitions.has(className)) {
          definitions.set(className, {
            type: 'class',
            methods: new Map(),
            dependencies: new Set()
          });
        }

        const classDef = definitions.get(className);
        if (!classDef.methods) classDef.methods = new Map();
        classDef.methods.set(methodName, {
          node: path.node,
          dependencies: deps
        });

        for (const d of deps) {
          classDef.dependencies.add(d);
        }
      }
    }
  }
});

console.log(`\nFound ${definitions.size} top-level definitions`);

// ============================================
// PHASE 2: Resolve dependencies recursively
// ============================================

function resolveDependencies(name, visited = new Set()) {
  if (visited.has(name) || BUILTIN_GLOBALS.has(name)) {
    return new Set();
  }

  visited.add(name);
  const allDeps = new Set([name]);

  const def = definitions.get(name);
  if (!def) {
    // Unknown dependency - might be a parameter or truly undefined
    return allDeps;
  }

  for (const dep of def.dependencies) {
    if (!visited.has(dep) && !BUILTIN_GLOBALS.has(dep)) {
      const transitive = resolveDependencies(dep, visited);
      for (const t of transitive) {
        allDeps.add(t);
      }
    }
  }

  return allDeps;
}

// ============================================
// PHASE 3: Generate bundle for a function
// ============================================

function generateBundle(funcName) {
  const def = definitions.get(funcName);
  if (!def) {
    console.error(`Function '${funcName}' not found`);
    return null;
  }

  // Get all dependencies
  const allDeps = resolveDependencies(funcName);
  console.log(`\n${funcName} requires ${allDeps.size} dependencies:`);

  // Sort dependencies by type and name
  const depList = [...allDeps].filter(d => d !== funcName);

  // Generate code for each dependency
  const parts = [];
  const generated = new Set();

  // Helper to generate code for a definition
  function emitDefinition(name) {
    if (generated.has(name) || name === funcName) return;
    generated.add(name);

    const d = definitions.get(name);
    if (!d) {
      // Unknown - emit as undefined placeholder
      parts.push(`// WARNING: '${name}' not found in source`);
      parts.push(`var ${name}; // undefined dependency\n`);
      return;
    }

    // First emit this definition's dependencies
    for (const dep of d.dependencies) {
      if (!generated.has(dep) && !BUILTIN_GLOBALS.has(dep) && dep !== funcName) {
        emitDefinition(dep);
      }
    }

    // Then emit this definition
    if (d.type === 'function') {
      parts.push(generate(d.node, { compact: false }).code);
      parts.push('');
    } else if (d.type === 'variable') {
      parts.push(generate(d.fullNode || t.variableDeclaration('var', [d.node]), { compact: false }).code);
      parts.push('');
    } else if (d.type === 'namespace' || d.type === 'class') {
      // Emit namespace/class with all its properties
      parts.push(`var ${name} = {};`);

      if (d.properties) {
        for (const [prop, propDef] of d.properties) {
          parts.push(generate(propDef.node, { compact: false }).code + ';');
        }
      }

      if (d.methods) {
        for (const [method, methodDef] of d.methods) {
          parts.push(generate(methodDef.node, { compact: false }).code + ';');
        }
      }
      parts.push('');
    }
  }

  // Emit all dependencies first
  for (const dep of depList) {
    emitDefinition(dep);
  }

  // Emit the main function last
  if (def.type === 'function') {
    parts.push('// Main function');
    parts.push(generate(def.node, { compact: false }).code);
  } else if (def.type === 'variable') {
    parts.push('// Main function');
    parts.push(generate(def.fullNode || t.variableDeclaration('var', [def.node]), { compact: false }).code);
  }

  // Add export
  parts.push('');
  parts.push(`// Export`);
  parts.push(`if (typeof module !== 'undefined') module.exports = ${funcName};`);

  return {
    name: funcName,
    dependencies: [...allDeps].filter(d => d !== funcName),
    code: parts.join('\n')
  };
}

// ============================================
// PHASE 4: Execute
// ============================================

if (bundleAll) {
  // Bundle all functions that have dependencies
  const outputDir = outputPath || './bundled-functions';
  fs.mkdirSync(outputDir, { recursive: true });

  let bundled = 0;
  let skipped = 0;

  for (const [name, def] of definitions) {
    if (def.type !== 'function' && def.type !== 'variable') continue;

    // Skip if it's a simple constant
    if (def.type === 'variable' && def.dependencies.size === 0) {
      skipped++;
      continue;
    }

    const bundle = generateBundle(name);
    if (bundle && bundle.code) {
      const outFile = path.join(outputDir, `${name}.js`);
      fs.writeFileSync(outFile, bundle.code);
      bundled++;
    }
  }

  console.log(`\nBundled ${bundled} functions to ${outputDir}/`);
  console.log(`Skipped ${skipped} simple constants`);

} else {
  // Bundle single function
  const bundle = generateBundle(targetFunc);

  if (bundle) {
    if (outputPath) {
      fs.writeFileSync(outputPath, bundle.code);
      console.log(`\nBundle written to: ${outputPath}`);
    } else {
      console.log('\n--- Generated Bundle ---\n');
      console.log(bundle.code);
    }

    console.log(`\nDependencies (${bundle.dependencies.length}):`);
    for (const dep of bundle.dependencies.slice(0, 20)) {
      console.log(`  - ${dep}`);
    }
    if (bundle.dependencies.length > 20) {
      console.log(`  ... and ${bundle.dependencies.length - 20} more`);
    }
  }
}
