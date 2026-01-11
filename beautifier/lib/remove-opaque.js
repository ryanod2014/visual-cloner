#!/usr/bin/env node
/**
 * Remove Opaque Predicates
 *
 * Removes opaque predicates created by control flow flattening:
 * - Constant comparisons: "abc" === "abc" -> true
 * - Dead branches from always-true/false conditions
 * - Ternary with constant condition
 *
 * Example:
 *   Before: if ("ASFsI" === "ASFsI") { realCode(); } else { deadCode(); }
 *   After:  realCode();
 */

const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile) {
  console.log('Usage: node remove-opaque.js <input.js> [output.js]');
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

console.log('Remove Opaque Predicates');
console.log('========================');

// Helper: Try to evaluate a constant expression
function tryEvaluate(node) {
  if (t.isStringLiteral(node)) return { value: node.value, confident: true };
  if (t.isNumericLiteral(node)) return { value: node.value, confident: true };
  if (t.isBooleanLiteral(node)) return { value: node.value, confident: true };
  if (t.isNullLiteral(node)) return { value: null, confident: true };

  if (t.isUnaryExpression(node)) {
    const arg = tryEvaluate(node.argument);
    if (!arg.confident) return { confident: false };

    switch (node.operator) {
      case '!': return { value: !arg.value, confident: true };
      case '-': return { value: -arg.value, confident: true };
      case '+': return { value: +arg.value, confident: true };
      case 'typeof': return { value: typeof arg.value, confident: true };
    }
  }

  if (t.isBinaryExpression(node)) {
    const left = tryEvaluate(node.left);
    const right = tryEvaluate(node.right);
    if (!left.confident || !right.confident) return { confident: false };

    switch (node.operator) {
      case '===': return { value: left.value === right.value, confident: true };
      case '!==': return { value: left.value !== right.value, confident: true };
      case '==': return { value: left.value == right.value, confident: true };
      case '!=': return { value: left.value != right.value, confident: true };
      case '<': return { value: left.value < right.value, confident: true };
      case '>': return { value: left.value > right.value, confident: true };
      case '<=': return { value: left.value <= right.value, confident: true };
      case '>=': return { value: left.value >= right.value, confident: true };
      case '+': return { value: left.value + right.value, confident: true };
      case '-': return { value: left.value - right.value, confident: true };
      case '*': return { value: left.value * right.value, confident: true };
      case '/': return { value: left.value / right.value, confident: true };
      case '%': return { value: left.value % right.value, confident: true };
      case '&&': return { value: left.value && right.value, confident: true };
      case '||': return { value: left.value || right.value, confident: true };
    }
  }

  if (t.isLogicalExpression(node)) {
    const left = tryEvaluate(node.left);
    const right = tryEvaluate(node.right);
    if (!left.confident || !right.confident) return { confident: false };

    switch (node.operator) {
      case '&&': return { value: left.value && right.value, confident: true };
      case '||': return { value: left.value || right.value, confident: true };
      case '??': return { value: left.value ?? right.value, confident: true };
    }
  }

  return { confident: false };
}

let simplifiedConditions = 0;
let removedBranches = 0;
let simplifiedTernaries = 0;

// Pass 1: Simplify constant binary expressions
traverse(ast, {
  BinaryExpression(path) {
    const result = tryEvaluate(path.node);
    if (result.confident) {
      if (typeof result.value === 'boolean') {
        path.replaceWith(t.booleanLiteral(result.value));
        simplifiedConditions++;
      } else if (typeof result.value === 'number') {
        path.replaceWith(t.numericLiteral(result.value));
        simplifiedConditions++;
      } else if (typeof result.value === 'string') {
        path.replaceWith(t.stringLiteral(result.value));
        simplifiedConditions++;
      }
    }
  }
});

// Pass 2: Remove dead branches from if statements
traverse(ast, {
  IfStatement(path) {
    const test = tryEvaluate(path.node.test);
    if (!test.confident) return;

    if (test.value) {
      // Condition is always true - keep consequent, remove alternate
      if (t.isBlockStatement(path.node.consequent)) {
        path.replaceWithMultiple(path.node.consequent.body);
      } else {
        path.replaceWith(path.node.consequent);
      }
      removedBranches++;
    } else {
      // Condition is always false - keep alternate (if exists), remove consequent
      if (path.node.alternate) {
        if (t.isBlockStatement(path.node.alternate)) {
          path.replaceWithMultiple(path.node.alternate.body);
        } else {
          path.replaceWith(path.node.alternate);
        }
      } else {
        path.remove();
      }
      removedBranches++;
    }
  }
});

// Pass 3: Simplify ternary expressions with constant conditions
traverse(ast, {
  ConditionalExpression(path) {
    const test = tryEvaluate(path.node.test);
    if (!test.confident) return;

    if (test.value) {
      path.replaceWith(path.node.consequent);
      simplifiedTernaries++;
    } else {
      path.replaceWith(path.node.alternate);
      simplifiedTernaries++;
    }
  }
});

// Pass 4: Remove unreachable code after return/throw/break/continue
traverse(ast, {
  BlockStatement(path) {
    const body = path.node.body;
    let foundTerminator = -1;

    for (let i = 0; i < body.length; i++) {
      const stmt = body[i];
      if (t.isReturnStatement(stmt) || t.isThrowStatement(stmt) ||
          t.isBreakStatement(stmt) || t.isContinueStatement(stmt)) {
        foundTerminator = i;
        break;
      }
    }

    if (foundTerminator >= 0 && foundTerminator < body.length - 1) {
      const removed = body.length - foundTerminator - 1;
      path.node.body = body.slice(0, foundTerminator + 1);
      removedBranches += removed;
    }
  }
});

console.log(`Simplified conditions: ${simplifiedConditions}`);
console.log(`Removed dead branches: ${removedBranches}`);
console.log(`Simplified ternaries: ${simplifiedTernaries}`);

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
