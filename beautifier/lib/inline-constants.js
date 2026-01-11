#!/usr/bin/env node
/**
 * Constant Inliner & Purity Analyzer
 *
 * 1. Finds module-scope constants (obj.prop = literal, never reassigned)
 * 2. Inlines those constants throughout the code
 * 3. Flags functions that reference module-scope variables (impure)
 *
 * 100% FREE - static analysis only
 */

const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const inputFile = process.argv[2];
const outputFile = process.argv[3] || inputFile.replace('.js', '.inlined.js');
const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

if (!inputFile) {
  console.log('Usage: node inline-constants.js <input.js> [output.js] [--verbose]');
  process.exit(1);
}

console.log('Constant Inliner & Purity Analyzer');
console.log('===================================');
console.log(`Input: ${inputFile}`);

const code = fs.readFileSync(inputFile, 'utf8');
let ast;

try {
  ast = parser.parse(code, { sourceType: 'script', errorRecovery: true });
} catch (e) {
  ast = parser.parse(code, { sourceType: 'module', errorRecovery: true });
}

// ============================================
// PHASE 1: Find potential constants
// ============================================

// Track: namespace.property -> { value, assignmentCount, isLiteral }
const propertyAssignments = new Map();

// Known safe globals (pure, no side effects)
const SAFE_GLOBALS = new Set([
  'Math', 'Number', 'String', 'Array', 'Object', 'JSON', 'Date',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'undefined', 'null',
  'true', 'false', 'NaN', 'Infinity', 'console'
]);

// First pass: find all property assignments
traverse(ast, {
  AssignmentExpression(path) {
    const left = path.node.left;

    // Pattern: namespace.property = value
    if (t.isMemberExpression(left) &&
        t.isIdentifier(left.object) &&
        t.isIdentifier(left.property) &&
        !left.computed) {

      const key = `${left.object.name}.${left.property.name}`;
      const right = path.node.right;

      const existing = propertyAssignments.get(key) || {
        value: null,
        assignmentCount: 0,
        isLiteral: false,
        node: null
      };

      existing.assignmentCount++;

      // Check if it's a simple literal
      if (t.isNumericLiteral(right) ||
          t.isStringLiteral(right) ||
          t.isBooleanLiteral(right) ||
          t.isNullLiteral(right)) {
        existing.isLiteral = true;
        existing.value = right.value;
        existing.node = t.cloneNode(right);
      } else if (t.isUnaryExpression(right) &&
                 right.operator === '!' &&
                 t.isNumericLiteral(right.argument)) {
        // !0 = true, !1 = false
        existing.isLiteral = true;
        existing.value = !right.argument.value;
        existing.node = t.booleanLiteral(!right.argument.value);
      }

      propertyAssignments.set(key, existing);
    }
  }
});

// Find properties that are used in update/compound expressions (not safe to inline)
const mutableProps = new Set();

traverse(ast, {
  UpdateExpression(path) {
    const arg = path.node.argument;
    if (t.isMemberExpression(arg) && t.isIdentifier(arg.object) && t.isIdentifier(arg.property)) {
      mutableProps.add(`${arg.object.name}.${arg.property.name}`);
    }
  },
  AssignmentExpression(path) {
    if (path.node.operator !== '=') {
      const left = path.node.left;
      if (t.isMemberExpression(left) && t.isIdentifier(left.object) && t.isIdentifier(left.property)) {
        mutableProps.add(`${left.object.name}.${left.property.name}`);
      }
    }
  }
});

// Filter to only constants (assigned exactly once, is a literal, never mutated)
const constants = new Map();
for (const [key, info] of propertyAssignments) {
  if (info.assignmentCount === 1 && info.isLiteral && info.node && !mutableProps.has(key)) {
    constants.set(key, info);
  }
}

console.log(`\nFound ${constants.size} inlinable constants`);
if (verbose) {
  for (const [key, info] of [...constants].slice(0, 20)) {
    console.log(`  ${key} = ${JSON.stringify(info.value)}`);
  }
  if (constants.size > 20) console.log(`  ... and ${constants.size - 20} more`);
}

// ============================================
// PHASE 2: Inline constants
// ============================================

let inlinedCount = 0;

traverse(ast, {
  MemberExpression(path) {
    // Skip if this is the left side of an assignment
    if (path.parent && t.isAssignmentExpression(path.parent) && path.parent.left === path.node) {
      return;
    }

    // Skip if this is in an UpdateExpression (x++, ++x, x--, --x)
    if (path.parent && t.isUpdateExpression(path.parent)) {
      return;
    }

    // Skip if this is in a compound assignment (x += 1, x -= 1, etc.)
    if (path.parent && t.isAssignmentExpression(path.parent) &&
        path.parent.operator !== '=' && path.parent.left === path.node) {
      return;
    }

    // Skip if not simple property access
    if (!t.isIdentifier(path.node.object) || !t.isIdentifier(path.node.property) || path.node.computed) {
      return;
    }

    const key = `${path.node.object.name}.${path.node.property.name}`;
    const constant = constants.get(key);

    if (constant && constant.node) {
      path.replaceWith(t.cloneNode(constant.node));
      inlinedCount++;
    }
  }
});

console.log(`Inlined ${inlinedCount} constant references`);

// ============================================
// PHASE 3: Analyze function purity
// ============================================

// Collect module-scope variable names
const moduleScopeVars = new Set();

traverse(ast, {
  VariableDeclarator(path) {
    // Only top-level or IIFE-level
    if (path.scope.parent === null ||
        (path.scope.parent && path.scope.parent.parent === null)) {
      if (t.isIdentifier(path.node.id)) {
        moduleScopeVars.add(path.node.id.name);
      }
    }
  },
  FunctionDeclaration(path) {
    if (path.scope.parent === null ||
        (path.scope.parent && path.scope.parent.parent === null)) {
      if (path.node.id) {
        moduleScopeVars.add(path.node.id.name);
      }
    }
  }
});

// Also add known namespace objects
for (const key of constants.keys()) {
  const ns = key.split('.')[0];
  moduleScopeVars.add(ns);
}

console.log(`\nModule-scope variables: ${moduleScopeVars.size}`);

// Analyze each function for purity
const functionPurity = new Map(); // functionName -> { pure: bool, references: Set }

function analyzeFunctionPurity(funcPath, funcName) {
  const localVars = new Set();
  const params = new Set();
  const externalRefs = new Set();

  // Collect parameter names
  for (const param of funcPath.node.params) {
    if (t.isIdentifier(param)) {
      params.add(param.name);
    } else if (t.isAssignmentPattern(param) && t.isIdentifier(param.left)) {
      params.add(param.left.name);
    } else if (t.isRestElement(param) && t.isIdentifier(param.argument)) {
      params.add(param.argument.name);
    }
  }

  // Traverse function body
  funcPath.traverse({
    VariableDeclarator(innerPath) {
      if (t.isIdentifier(innerPath.node.id)) {
        localVars.add(innerPath.node.id.name);
      }
    },

    Identifier(innerPath) {
      const name = innerPath.node.name;

      // Skip if it's a property key
      if (innerPath.parent && t.isMemberExpression(innerPath.parent) &&
          innerPath.parent.property === innerPath.node && !innerPath.parent.computed) {
        return;
      }

      // Skip if it's a declaration
      if (innerPath.parent && t.isVariableDeclarator(innerPath.parent) &&
          innerPath.parent.id === innerPath.node) {
        return;
      }

      // Skip if it's a function name
      if (innerPath.parent && t.isFunctionDeclaration(innerPath.parent) &&
          innerPath.parent.id === innerPath.node) {
        return;
      }

      // Check if it's an external reference
      if (!params.has(name) && !localVars.has(name) && !SAFE_GLOBALS.has(name)) {
        if (moduleScopeVars.has(name) || /^[A-Z]/.test(name)) {
          externalRefs.add(name);
        }
      }
    },

    ThisExpression() {
      externalRefs.add('this');
    }
  });

  const isPure = externalRefs.size === 0;

  functionPurity.set(funcName, {
    pure: isPure,
    references: externalRefs
  });

  return isPure;
}

// Analyze all functions
let pureCount = 0;
let impureCount = 0;

traverse(ast, {
  FunctionDeclaration(path) {
    if (path.node.id) {
      const isPure = analyzeFunctionPurity(path, path.node.id.name);
      if (isPure) pureCount++;
      else impureCount++;
    }
  },

  FunctionExpression(path) {
    // Named function expressions
    if (path.node.id) {
      const isPure = analyzeFunctionPurity(path, path.node.id.name);
      if (isPure) pureCount++;
      else impureCount++;
    }
    // Assignment to variable
    else if (path.parent && t.isVariableDeclarator(path.parent) && t.isIdentifier(path.parent.id)) {
      const isPure = analyzeFunctionPurity(path, path.parent.id.name);
      if (isPure) pureCount++;
      else impureCount++;
    }
    // Method definition: X.prototype.method = function
    else if (path.parent && t.isAssignmentExpression(path.parent)) {
      const left = path.parent.left;
      if (t.isMemberExpression(left) && t.isIdentifier(left.property)) {
        const isPure = analyzeFunctionPurity(path, left.property.name);
        if (isPure) pureCount++;
        else impureCount++;
      }
    }
  },

  ArrowFunctionExpression(path) {
    if (path.parent && t.isVariableDeclarator(path.parent) && t.isIdentifier(path.parent.id)) {
      const isPure = analyzeFunctionPurity(path, path.parent.id.name);
      if (isPure) pureCount++;
      else impureCount++;
    }
  }
});

console.log(`\nFunction purity analysis:`);
console.log(`  Pure functions: ${pureCount}`);
console.log(`  Impure functions: ${impureCount}`);
console.log(`  Purity ratio: ${(pureCount / (pureCount + impureCount) * 100).toFixed(1)}%`);

if (verbose) {
  console.log('\nSample impure functions:');
  let shown = 0;
  for (const [name, info] of functionPurity) {
    if (!info.pure && shown < 10) {
      console.log(`  ${name}: references ${[...info.references].slice(0, 5).join(', ')}`);
      shown++;
    }
  }
}

// ============================================
// PHASE 4: Add purity comments
// ============================================

// Optionally add comments marking pure functions
// (Skipping for now to avoid bloating output)

// ============================================
// Output
// ============================================

const output = generate(ast, { retainLines: false, compact: false }).code;
fs.writeFileSync(outputFile, output);

console.log(`\nOutput: ${outputFile}`);
console.log(`Size: ${code.length.toLocaleString()} → ${output.length.toLocaleString()} bytes`);
