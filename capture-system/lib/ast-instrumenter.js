/**
 * AST Instrumenter - Wrap every function with I/O capture
 *
 * Instead of trying to hook running code, we instrument the source
 * BEFORE it runs, capturing all function I/O.
 */

const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

function instrumentSource(source, options = {}) {
  const { maxCapturesPerFunction = 50 } = options;

  // Parse the source
  const ast = parser.parse(source, {
    sourceType: 'module',
    plugins: ['classProperties', 'objectRestSpread']
  });

  let functionCount = 0;

  // Traverse and wrap all functions
  traverse(ast, {
    // Handle function declarations: function foo() {}
    FunctionDeclaration(path) {
      const name = path.node.id?.name || `anon_${functionCount++}`;
      wrapFunction(path, name, maxCapturesPerFunction);
    },

    // Handle function expressions: const foo = function() {}
    FunctionExpression(path) {
      // Try to get name from parent
      let name = `anon_${functionCount++}`;
      if (path.parent.type === 'VariableDeclarator' && path.parent.id.name) {
        name = path.parent.id.name;
      } else if (path.parent.type === 'AssignmentExpression' && path.parent.left.name) {
        name = path.parent.left.name;
      } else if (path.parent.type === 'Property' && path.parent.key.name) {
        name = path.parent.key.name;
      }
      wrapFunction(path, name, maxCapturesPerFunction);
    },

    // Handle arrow functions: const foo = () => {}
    ArrowFunctionExpression(path) {
      let name = `arrow_${functionCount++}`;
      if (path.parent.type === 'VariableDeclarator' && path.parent.id.name) {
        name = path.parent.id.name;
      } else if (path.parent.type === 'AssignmentExpression' && path.parent.left.name) {
        name = path.parent.left.name;
      } else if (path.parent.type === 'Property' && path.parent.key.name) {
        name = path.parent.key.name;
      }
      wrapFunction(path, name, maxCapturesPerFunction);
    },

    // Handle class methods
    ClassMethod(path) {
      const className = path.parentPath.parent.id?.name || 'UnknownClass';
      const methodName = path.node.key.name || path.node.key.value || 'unknownMethod';
      const name = `${className}.${methodName}`;
      wrapFunction(path, name, maxCapturesPerFunction);
    }
  });

  // Generate the instrumented code
  const output = generate(ast, {
    retainLines: true,
    compact: false
  });

  // Add the capture runtime at the top
  const captureRuntime = `
// ═══════════════════════════════════════════════════════════════
// I/O CAPTURE RUNTIME (injected by ast-instrumenter)
// ═══════════════════════════════════════════════════════════════
window.__capture = window.__capture || {
  io: [],
  counts: {},
  maxPerFn: ${maxCapturesPerFunction},

  serialize(obj, depth = 0, seen = new WeakSet()) {
    if (depth > 4) return '[MAX_DEPTH]';
    if (obj === null) return null;
    if (obj === undefined) return undefined;
    if (typeof obj === 'function') return '[Function]';
    if (typeof obj !== 'object') return obj;
    if (seen.has(obj)) return '[CIRCULAR]';
    seen.add(obj);

    // Handle typed arrays
    if (ArrayBuffer.isView(obj)) {
      return { __type: obj.constructor.name, length: obj.length, sample: [...obj.slice(0, 20)] };
    }
    if (obj instanceof ArrayBuffer) {
      return { __type: 'ArrayBuffer', byteLength: obj.byteLength };
    }

    // Handle DOM
    if (typeof HTMLElement !== 'undefined' && obj instanceof HTMLElement) {
      return { __type: 'HTMLElement', tag: obj.tagName, id: obj.id };
    }
    if (typeof HTMLCanvasElement !== 'undefined' && obj instanceof HTMLCanvasElement) {
      return { __type: 'Canvas', width: obj.width, height: obj.height };
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.slice(0, 20).map(x => this.serialize(x, depth + 1, seen));
    }

    // Handle objects
    const result = { __type: obj.constructor?.name || 'Object' };
    const keys = Object.keys(obj).slice(0, 15);
    for (const key of keys) {
      try {
        result[key] = this.serialize(obj[key], depth + 1, seen);
      } catch (e) {
        result[key] = '[ERROR]';
      }
    }
    return result;
  },

  record(fnName, args, thisArg, result, error) {
    this.counts[fnName] = (this.counts[fnName] || 0) + 1;
    if (this.counts[fnName] > this.maxPerFn) return;

    this.io.push({
      function: fnName,
      input: {
        args: this.serialize(args),
        this: this.serialize(thisArg)
      },
      output: error ? undefined : this.serialize(result),
      error: error ? error.message : null,
      timestamp: Date.now()
    });
  },

  getResults() {
    return {
      io: this.io,
      counts: this.counts,
      uniqueFunctions: Object.keys(this.counts).length,
      totalCaptures: this.io.length
    };
  }
};

`;

  return captureRuntime + output.code;
}

function wrapFunction(path, name, maxCaptures) {
  const body = path.node.body;

  // Skip if already wrapped or if body isn't a block
  if (!t.isBlockStatement(body)) {
    // Convert arrow function expression body to block
    if (path.node.type === 'ArrowFunctionExpression') {
      const returnStmt = t.returnStatement(body);
      path.node.body = t.blockStatement([returnStmt]);
    } else {
      return;
    }
  }

  // Skip if already instrumented
  if (body._instrumented) return;
  body._instrumented = true;

  const fnNameLiteral = t.stringLiteral(name);

  // Create the wrapper:
  // const __args = [...arguments];
  // const __this = this;
  // try {
  //   ... original body ...
  //   __capture.record(fnName, __args, __this, __result, null);
  //   return __result;
  // } catch (__err) {
  //   __capture.record(fnName, __args, __this, null, __err);
  //   throw __err;
  // }

  const originalStatements = [...path.node.body.body];

  // Check if there's already a return statement
  const hasReturn = originalStatements.some(stmt =>
    t.isReturnStatement(stmt) ||
    (t.isIfStatement(stmt) && hasReturnInStatement(stmt))
  );

  // Wrap the original body
  const wrappedBody = t.blockStatement([
    // const __args = [...arguments];
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier('__args'),
        t.arrayExpression([t.spreadElement(t.identifier('arguments'))])
      )
    ]),
    // const __this = this;
    t.variableDeclaration('const', [
      t.variableDeclarator(t.identifier('__this'), t.thisExpression())
    ]),
    // try { ... } catch { ... }
    t.tryStatement(
      t.blockStatement([
        ...instrumentReturns(originalStatements, fnNameLiteral),
        // If no explicit return, record undefined
        t.expressionStatement(
          t.callExpression(
            t.memberExpression(
              t.identifier('__capture'),
              t.identifier('record')
            ),
            [fnNameLiteral, t.identifier('__args'), t.identifier('__this'), t.identifier('undefined'), t.nullLiteral()]
          )
        )
      ]),
      t.catchClause(
        t.identifier('__err'),
        t.blockStatement([
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(t.identifier('__capture'), t.identifier('record')),
              [fnNameLiteral, t.identifier('__args'), t.identifier('__this'), t.nullLiteral(), t.identifier('__err')]
            )
          ),
          t.throwStatement(t.identifier('__err'))
        ])
      )
    )
  ]);

  path.node.body = wrappedBody;
}

function hasReturnInStatement(stmt) {
  if (t.isReturnStatement(stmt)) return true;
  if (t.isBlockStatement(stmt)) {
    return stmt.body.some(s => hasReturnInStatement(s));
  }
  if (t.isIfStatement(stmt)) {
    return (stmt.consequent && hasReturnInStatement(stmt.consequent)) ||
           (stmt.alternate && hasReturnInStatement(stmt.alternate));
  }
  return false;
}

function instrumentReturns(statements, fnNameLiteral) {
  return statements.map(stmt => {
    if (t.isReturnStatement(stmt)) {
      // Transform: return X;
      // Into: { const __result = X; __capture.record(...); return __result; }
      const resultExpr = stmt.argument || t.identifier('undefined');
      return t.blockStatement([
        t.variableDeclaration('const', [
          t.variableDeclarator(t.identifier('__result'), resultExpr)
        ]),
        t.expressionStatement(
          t.callExpression(
            t.memberExpression(t.identifier('__capture'), t.identifier('record')),
            [fnNameLiteral, t.identifier('__args'), t.identifier('__this'), t.identifier('__result'), t.nullLiteral()]
          )
        ),
        t.returnStatement(t.identifier('__result'))
      ]);
    }
    return stmt;
  });
}

module.exports = { instrumentSource };
