/**
 * Control Flow Simplification
 *
 * Simplifies ternary expressions and if statements with known conditions.
 *
 * Example:
 *   Input:  false ? 2 : false ? 1 : 0
 *   Output: 0
 */

import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';

const traverse = _traverse.default || _traverse;
const generate = _generate.default || _generate;

/**
 * Get boolean value from a node if it's a known constant
 * @param {Object} node - AST node
 * @returns {{ value: boolean, known: boolean }}
 */
function getBooleanValue(node) {
  if (t.isBooleanLiteral(node)) {
    return { value: node.value, known: true };
  }
  // Treat 0 as falsy, non-zero numbers as truthy
  if (t.isNumericLiteral(node)) {
    return { value: node.value !== 0, known: true };
  }
  // Empty string is falsy
  if (t.isStringLiteral(node)) {
    return { value: node.value !== '', known: true };
  }
  // null is falsy
  if (t.isNullLiteral(node)) {
    return { value: false, known: true };
  }
  // undefined is falsy
  if (t.isIdentifier(node) && node.name === 'undefined') {
    return { value: false, known: true };
  }
  return { value: undefined, known: false };
}

/**
 * Simplify control flow in AST
 * @param {string} code - JavaScript source code
 * @param {Object} options - Options
 * @returns {{ code: string, changes: string[] }}
 */
export function simplifyControlFlow(code, options = {}) {
  const { verbose = false, maxPasses = 5 } = options;
  const allChanges = [];

  let currentCode = code;
  let passNum = 0;

  // Multiple passes to handle nested simplifications
  while (passNum < maxPasses) {
    passNum++;
    const passChanges = [];

    let ast;
    try {
      ast = parser.parse(currentCode, {
        sourceType: 'unambiguous',
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        errorRecovery: true,
      });
    } catch (e) {
      if (verbose) {
        console.log(`[simplify] Parse error: ${e.message}`);
      }
      break;
    }

    traverse(ast, {
      // Simplify ternary expressions: cond ? a : b
      ConditionalExpression(path) {
        const test = getBooleanValue(path.node.test);
        if (test.known) {
          if (test.value) {
            // true ? a : b → a
            path.replaceWith(path.node.consequent);
            passChanges.push('ternary:true');
          } else {
            // false ? a : b → b
            path.replaceWith(path.node.alternate);
            passChanges.push('ternary:false');
          }
        }
      },

      // Simplify if statements
      IfStatement(path) {
        const test = getBooleanValue(path.node.test);
        if (test.known) {
          if (test.value) {
            // if (true) { A } else { B } → A
            if (t.isBlockStatement(path.node.consequent)) {
              path.replaceWithMultiple(path.node.consequent.body);
            } else {
              path.replaceWith(path.node.consequent);
            }
            passChanges.push('if:true');
          } else {
            // if (false) { A } else { B } → B (or nothing)
            if (path.node.alternate) {
              if (t.isBlockStatement(path.node.alternate)) {
                path.replaceWithMultiple(path.node.alternate.body);
              } else {
                path.replaceWith(path.node.alternate);
              }
            } else {
              path.remove();
            }
            passChanges.push('if:false');
          }
        }
      },

      // Simplify logical expressions (again, in case new ones emerged)
      LogicalExpression(path) {
        const left = getBooleanValue(path.node.left);

        if (left.known) {
          if (path.node.operator === '&&') {
            if (!left.value) {
              path.replaceWith(path.node.left);
              passChanges.push('&&:short');
            }
          } else if (path.node.operator === '||') {
            if (left.value) {
              path.replaceWith(path.node.left);
              passChanges.push('||:short');
            }
          }
        }
      },

      // Remove dead code after return/throw/break/continue
      BlockStatement(path) {
        const body = path.node.body;
        let foundTerminator = false;
        const newBody = [];

        for (const stmt of body) {
          if (foundTerminator) {
            passChanges.push('deadcode');
            continue; // Skip dead code
          }
          newBody.push(stmt);
          if (
            t.isReturnStatement(stmt) ||
            t.isThrowStatement(stmt) ||
            t.isBreakStatement(stmt) ||
            t.isContinueStatement(stmt)
          ) {
            foundTerminator = true;
          }
        }

        if (newBody.length !== body.length) {
          path.node.body = newBody;
        }
      },
    });

    if (passChanges.length === 0) {
      break; // No more changes
    }

    allChanges.push(...passChanges);

    // Generate code for next pass
    const output = generate(ast, {
      retainLines: false,
      compact: true,
      comments: false,
    });
    currentCode = output.code;

    if (verbose) {
      console.log(`[simplify] Pass ${passNum}: ${passChanges.length} changes`);
    }
  }

  if (allChanges.length === 0) {
    return { code, changes: [] };
  }

  if (verbose) {
    console.log(`[simplify] Total: ${allChanges.length} changes in ${passNum} passes`);
  }

  return { code: currentCode, changes: allChanges };
}

export default { simplifyControlFlow };
