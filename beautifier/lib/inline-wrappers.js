#!/usr/bin/env node
/**
 * Inline Wrapper Functions
 *
 * Inlines simple wrapper functions created by control flow flattening:
 * - Binary ops: (a, b) => a + b, a === b, a !== b, etc.
 * - Call wrappers: (fn, ...args) => fn(...args)
 * - Unary wrappers: (fn) => fn()
 *
 * Example:
 *   Before: _obj.add(x, y)  where add: (a,b) => a + b
 *   After:  x + y
 */

const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile) {
  console.log('Usage: node inline-wrappers.js <input.js> [output.js]');
  process.exit(1);
}

const code = fs.readFileSync(inputFile, 'utf8');
let ast;

try {
  ast = parser.parse(code, {
    sourceType: 'script',
    plugins: ['jsx'],
    errorRecovery: true,
  });
} catch (err) {
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx'],
      errorRecovery: true,
    });
  } catch (err2) {
    console.error('Failed to parse:', err2.message);
    process.exit(1);
  }
}

console.log('Inline Wrapper Functions');
console.log('========================');

// Step 1: Find all wrapper function definitions in objects
const wrapperDefs = new Map(); // objName.propName -> { type, operator, paramCount }

traverse(ast, {
  ObjectExpression(path) {
    // Check if this object is assigned to a variable
    const parent = path.parent;
    let objName = null;

    if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
      objName = parent.id.name;
    } else if (t.isAssignmentExpression(parent) && t.isIdentifier(parent.left)) {
      objName = parent.left.name;
    }

    if (!objName) return;

    // Analyze each property
    for (const prop of path.node.properties) {
      if (!t.isObjectProperty(prop) && !t.isObjectMethod(prop)) continue;

      let key = null;
      if (t.isIdentifier(prop.key)) key = prop.key.name;
      else if (t.isStringLiteral(prop.key)) key = prop.key.value;
      if (!key) continue;

      let func = null;
      if (t.isObjectMethod(prop)) {
        func = prop;
      } else if (t.isFunctionExpression(prop.value) || t.isArrowFunctionExpression(prop.value)) {
        func = prop.value;
      }
      if (!func) continue;

      const params = func.params;
      const body = t.isBlockStatement(func.body) ? func.body.body : [{ type: 'ReturnStatement', argument: func.body }];

      // Must have exactly one return statement
      if (body.length !== 1) continue;
      const stmt = body[0];
      if (!t.isReturnStatement(stmt) || !stmt.argument) continue;

      const ret = stmt.argument;
      const fullKey = `${objName}.${key}`;

      // Check for binary operations: (a, b) => a OP b
      if (params.length === 2 && t.isBinaryExpression(ret)) {
        const [p1, p2] = params;
        if (t.isIdentifier(p1) && t.isIdentifier(p2) &&
            t.isIdentifier(ret.left) && t.isIdentifier(ret.right) &&
            ret.left.name === p1.name && ret.right.name === p2.name) {
          wrapperDefs.set(fullKey, { type: 'binary', operator: ret.operator, paramCount: 2 });
        }
      }

      // Check for call wrappers: (fn, arg) => fn(arg) or (fn, a, b) => fn(a, b)
      else if (params.length >= 1 && t.isCallExpression(ret)) {
        const [fnParam, ...argParams] = params;
        if (t.isIdentifier(fnParam) && t.isIdentifier(ret.callee) && ret.callee.name === fnParam.name) {
          // Check if all args match remaining params
          if (ret.arguments.length === argParams.length) {
            let allMatch = true;
            for (let i = 0; i < argParams.length; i++) {
              if (!t.isIdentifier(argParams[i]) || !t.isIdentifier(ret.arguments[i]) ||
                  argParams[i].name !== ret.arguments[i].name) {
                allMatch = false;
                break;
              }
            }
            if (allMatch) {
              wrapperDefs.set(fullKey, { type: 'call', paramCount: params.length });
            }
          }
        }
      }

      // Check for nullary call: (fn) => fn()
      else if (params.length === 1 && t.isCallExpression(ret) && ret.arguments.length === 0) {
        const [fnParam] = params;
        if (t.isIdentifier(fnParam) && t.isIdentifier(ret.callee) && ret.callee.name === fnParam.name) {
          wrapperDefs.set(fullKey, { type: 'nullary', paramCount: 1 });
        }
      }

      // Check for string concatenation with template or binary +
      else if (params.length === 2 && t.isBinaryExpression(ret) && ret.operator === '+') {
        const [p1, p2] = params;
        if (t.isIdentifier(p1) && t.isIdentifier(p2)) {
          // Check if it's simple a + b
          if (t.isIdentifier(ret.left) && t.isIdentifier(ret.right) &&
              ret.left.name === p1.name && ret.right.name === p2.name) {
            wrapperDefs.set(fullKey, { type: 'binary', operator: '+', paramCount: 2 });
          }
        }
      }
    }
  }
});

console.log(`Found ${wrapperDefs.size} wrapper functions:`);
for (const [key, def] of wrapperDefs) {
  console.log(`  ${key}: ${def.type}${def.operator ? ` (${def.operator})` : ''}`);
}

// Step 2: Inline wrapper calls
let inlined = 0;

traverse(ast, {
  CallExpression(path) {
    const callee = path.node.callee;

    // Check for obj.method(args) pattern
    if (!t.isMemberExpression(callee)) return;
    if (!t.isIdentifier(callee.object)) return;

    let propName = null;
    if (t.isIdentifier(callee.property)) propName = callee.property.name;
    else if (t.isStringLiteral(callee.property)) propName = callee.property.value;
    if (!propName) return;

    const fullKey = `${callee.object.name}.${propName}`;
    const def = wrapperDefs.get(fullKey);
    if (!def) return;

    const args = path.node.arguments;

    // Inline binary operations
    if (def.type === 'binary' && args.length === 2) {
      path.replaceWith(t.binaryExpression(def.operator, args[0], args[1]));
      inlined++;
    }

    // Inline call wrappers
    else if (def.type === 'call' && args.length >= 1) {
      const [fn, ...callArgs] = args;
      path.replaceWith(t.callExpression(fn, callArgs));
      inlined++;
    }

    // Inline nullary calls
    else if (def.type === 'nullary' && args.length === 1) {
      path.replaceWith(t.callExpression(args[0], []));
      inlined++;
    }
  }
});

console.log(`\nInlined ${inlined} wrapper calls`);

// Step 3: Remove unused wrapper definitions from objects
let removed = 0;

traverse(ast, {
  ObjectExpression(path) {
    const parent = path.parent;
    let objName = null;

    if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
      objName = parent.id.name;
    } else if (t.isAssignmentExpression(parent) && t.isIdentifier(parent.left)) {
      objName = parent.left.name;
    }

    if (!objName) return;

    // Filter out wrapper properties that are now unused
    const newProps = path.node.properties.filter(prop => {
      if (!t.isObjectProperty(prop) && !t.isObjectMethod(prop)) return true;

      let key = null;
      if (t.isIdentifier(prop.key)) key = prop.key.name;
      else if (t.isStringLiteral(prop.key)) key = prop.key.value;
      if (!key) return true;

      const fullKey = `${objName}.${key}`;
      if (wrapperDefs.has(fullKey)) {
        removed++;
        return false; // Remove this property
      }
      return true;
    });

    if (newProps.length !== path.node.properties.length) {
      path.node.properties = newProps;
    }
  }
});

console.log(`Removed ${removed} wrapper definitions`);

// Generate output
const output = generate(ast, {
  comments: true,
  compact: false,
});

if (outputFile) {
  fs.writeFileSync(outputFile, output.code);
  console.log(`\nOutput written to: ${outputFile}`);
} else {
  process.stdout.write(output.code);
}

const inputSize = code.length;
const outputSize = output.code.length;
console.log(`\nSize: ${inputSize} -> ${outputSize} bytes (${((1 - outputSize/inputSize) * 100).toFixed(1)}% reduction)`);
