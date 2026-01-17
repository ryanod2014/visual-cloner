/**
 * AST-Based Expression Evaluation
 *
 * Parses JavaScript to AST, identifies environment-dependent expressions,
 * evaluates them with known values, and generates clean code.
 *
 * Example:
 *   Input:  "www.photopea.com".endsWith("jampea.com") ? 2 : 0
 *   Output: 0
 */

import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';

// Handle both ESM and CJS imports
const traverse = _traverse.default || _traverse;
const generate = _generate.default || _generate;

/**
 * Environment values to substitute
 * @param {string} hostname - Original hostname (e.g., "www.photopea.com")
 * @returns {Object} - Map of expressions to their values
 */
function getEnvironmentValues(hostname) {
  const origin = `https://${hostname}`;
  const href = `${origin}/`;

  return {
    'window.location.hostname': hostname,
    'window.location.host': hostname,
    'window.location.origin': origin,
    'window.location.href': href,
    'location.hostname': hostname,
    'location.host': hostname,
    'location.origin': origin,
    'location.href': href,
    'document.domain': hostname,
  };
}

/**
 * Check if a node represents a known environment expression
 * Handles both dot notation (location.hostname) and bracket notation (location["hostname"])
 * Also handles aliased window references (J.AP["location"]["hostname"])
 * @param {Object} node - AST node
 * @param {Object} env - Environment values
 * @returns {string|null} - The value if matched, null otherwise
 */
function matchEnvironmentExpression(node, env) {
  if (!t.isMemberExpression(node)) return null;

  // Build the full expression string
  const parts = [];
  let current = node;

  while (t.isMemberExpression(current)) {
    if (t.isIdentifier(current.property)) {
      parts.unshift(current.property.name);
    } else if (t.isStringLiteral(current.property)) {
      parts.unshift(current.property.value);
    } else {
      return null; // Can't handle other computed properties
    }
    current = current.object;
  }

  if (t.isIdentifier(current)) {
    parts.unshift(current.name);
  } else if (t.isMemberExpression(current)) {
    // Handle nested member expressions that we couldn't fully resolve
    return null;
  } else {
    return null;
  }

  const expr = parts.join('.');

  // Direct match
  if (env[expr]) return env[expr];

  // Handle window aliases: X.location.hostname or X["location"]["hostname"]
  // If we see *.location.hostname pattern, treat it as window.location.hostname
  if (parts.length >= 2) {
    const lastTwo = parts.slice(-2).join('.');
    const lastThree = parts.length >= 3 ? parts.slice(-3).join('.') : null;

    // Match patterns like *.location.hostname
    if (lastTwo === 'location.hostname') {
      return env['window.location.hostname'] || env['location.hostname'] || null;
    }
    if (lastTwo === 'location.host') {
      return env['window.location.host'] || env['location.host'] || null;
    }
    if (lastTwo === 'location.origin') {
      return env['window.location.origin'] || env['location.origin'] || null;
    }
    if (lastTwo === 'location.href') {
      return env['window.location.href'] || env['location.href'] || null;
    }
  }

  return null;
}

/**
 * Evaluate a string method call if possible
 * @param {string} str - The string value
 * @param {string} method - Method name
 * @param {Array} args - Method arguments (as values)
 * @returns {*} - Result or undefined if can't evaluate
 */
function evaluateStringMethod(str, method, args) {
  try {
    switch (method) {
      case 'endsWith':
        return str.endsWith(args[0]);
      case 'startsWith':
        return str.startsWith(args[0]);
      case 'includes':
        return str.includes(args[0]);
      case 'indexOf':
        return str.indexOf(args[0]);
      case 'lastIndexOf':
        return str.lastIndexOf(args[0]);
      case 'charAt':
        return str.charAt(args[0]);
      case 'charCodeAt':
        return str.charCodeAt(args[0]);
      case 'substring':
        return str.substring(args[0], args[1]);
      case 'slice':
        return str.slice(args[0], args[1]);
      case 'toLowerCase':
        return str.toLowerCase();
      case 'toUpperCase':
        return str.toUpperCase();
      case 'trim':
        return str.trim();
      case 'split':
        return undefined; // Don't evaluate split - returns array
      case 'replace':
        return undefined; // Don't evaluate replace - complex
      default:
        return undefined;
    }
  } catch (e) {
    return undefined;
  }
}

/**
 * Convert a JavaScript value to an AST node
 * @param {*} value - JavaScript value
 * @returns {Object|null} - AST node or null
 */
function valueToNode(value) {
  if (typeof value === 'string') {
    return t.stringLiteral(value);
  }
  if (typeof value === 'number') {
    if (value < 0) {
      return t.unaryExpression('-', t.numericLiteral(-value));
    }
    return t.numericLiteral(value);
  }
  if (typeof value === 'boolean') {
    return t.booleanLiteral(value);
  }
  if (value === null) {
    return t.nullLiteral();
  }
  if (value === undefined) {
    return t.identifier('undefined');
  }
  return null;
}

/**
 * Try to get a constant value from an AST node
 * @param {Object} node - AST node
 * @returns {{ value: *, known: boolean }}
 */
function getConstantValue(node) {
  if (t.isStringLiteral(node)) {
    return { value: node.value, known: true };
  }
  if (t.isNumericLiteral(node)) {
    return { value: node.value, known: true };
  }
  if (t.isBooleanLiteral(node)) {
    return { value: node.value, known: true };
  }
  if (t.isNullLiteral(node)) {
    return { value: null, known: true };
  }
  if (t.isIdentifier(node) && node.name === 'undefined') {
    return { value: undefined, known: true };
  }
  if (t.isUnaryExpression(node) && node.operator === '-' && t.isNumericLiteral(node.argument)) {
    return { value: -node.argument.value, known: true };
  }
  return { value: undefined, known: false };
}

/**
 * Evaluate binary expression if both sides are known
 * @param {string} operator
 * @param {*} left
 * @param {*} right
 * @returns {*}
 */
function evaluateBinaryOp(operator, left, right) {
  switch (operator) {
    case '===': return left === right;
    case '!==': return left !== right;
    case '==': return left == right;
    case '!=': return left != right;
    case '<': return left < right;
    case '>': return left > right;
    case '<=': return left <= right;
    case '>=': return left >= right;
    case '+': return left + right;
    case '-': return left - right;
    case '*': return left * right;
    case '/': return left / right;
    case '%': return left % right;
    case '&&': return left && right;
    case '||': return left || right;
    default: return undefined;
  }
}

/**
 * Main AST evaluation function
 * @param {string} code - JavaScript source code
 * @param {string} hostname - Original hostname
 * @param {Object} options - Options
 * @returns {{ code: string, changes: string[] }}
 */
export function evaluateAST(code, hostname, options = {}) {
  const { verbose = false } = options;
  const env = getEnvironmentValues(hostname);
  const changes = [];

  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: 'unambiguous',
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      errorRecovery: true,
    });
  } catch (e) {
    if (verbose) {
      console.log(`[ast-evaluate] Parse error: ${e.message}`);
    }
    return { code, changes: [] };
  }

  // Track if we made any changes
  let modified = false;

  traverse(ast, {
    // Replace environment expressions with literals
    MemberExpression(path) {
      const value = matchEnvironmentExpression(path.node, env);
      if (value !== null) {
        path.replaceWith(t.stringLiteral(value));
        modified = true;
        changes.push(`env:${value.substring(0, 20)}`);
      }
    },

    // Evaluate string method calls on string literals
    CallExpression(path) {
      const { callee, arguments: args } = path.node;

      // Check for string.method() pattern
      if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
        const obj = getConstantValue(callee.object);
        if (obj.known && typeof obj.value === 'string') {
          const method = callee.property.name;

          // Get argument values
          const argValues = args.map(arg => getConstantValue(arg));
          if (argValues.every(a => a.known)) {
            const result = evaluateStringMethod(
              obj.value,
              method,
              argValues.map(a => a.value)
            );

            if (result !== undefined) {
              const newNode = valueToNode(result);
              if (newNode) {
                path.replaceWith(newNode);
                modified = true;
                changes.push(`str:${method}`);
              }
            }
          }
        }
      }
    },

    // Evaluate binary expressions with known values
    BinaryExpression(path) {
      const left = getConstantValue(path.node.left);
      const right = getConstantValue(path.node.right);

      if (left.known && right.known) {
        const result = evaluateBinaryOp(path.node.operator, left.value, right.value);
        if (result !== undefined) {
          const newNode = valueToNode(result);
          if (newNode) {
            path.replaceWith(newNode);
            modified = true;
            changes.push(`bin:${path.node.operator}`);
          }
        }
      }
    },

    // Evaluate logical expressions
    LogicalExpression(path) {
      const left = getConstantValue(path.node.left);

      if (left.known) {
        if (path.node.operator === '&&') {
          if (!left.value) {
            // false && X → false
            path.replaceWith(t.booleanLiteral(false));
            modified = true;
            changes.push('logic:&&false');
          } else {
            // true && X → X
            path.replaceWith(path.node.right);
            modified = true;
            changes.push('logic:&&true');
          }
        } else if (path.node.operator === '||') {
          if (left.value) {
            // true || X → true
            path.replaceWith(t.booleanLiteral(true));
            modified = true;
            changes.push('logic:||true');
          } else {
            // false || X → X
            path.replaceWith(path.node.right);
            modified = true;
            changes.push('logic:||false');
          }
        }
      }
    },

    // Evaluate unary expressions
    UnaryExpression(path) {
      if (path.node.operator === '!') {
        const arg = getConstantValue(path.node.argument);
        if (arg.known) {
          path.replaceWith(t.booleanLiteral(!arg.value));
          modified = true;
          changes.push('unary:!');
        }
      }
    },
  });

  if (!modified) {
    return { code, changes: [] };
  }

  // Generate code from modified AST
  const output = generate(ast, {
    retainLines: false,
    compact: true,
    comments: false,
  });

  if (verbose) {
    console.log(`[ast-evaluate] Made ${changes.length} changes`);
  }

  return { code: output.code, changes };
}

export default { evaluateAST };
