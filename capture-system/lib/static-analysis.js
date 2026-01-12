/**
 * Static Analysis - Parse source to find all classes, methods, and functions
 */

const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

async function analyzeSource(source) {
  // Try as module first, fallback to script
  let ast;
  try {
    ast = parse(source, {
      sourceType: 'module',
      allowReturnOutsideFunction: true,
      plugins: ['jsx']
    });
  } catch (e) {
    try {
      ast = parse(source, {
        sourceType: 'script',
        allowReturnOutsideFunction: true,
        plugins: ['jsx']
      });
    } catch (e2) {
      console.warn('Could not parse source for static analysis:', e2.message);
      return {
        functions: [],
        classes: [],
        prototypeMethods: [],
        globalFunctions: [],
      };
    }
  }

  const analysis = {
    functions: [],
    classes: [],
    prototypeMethods: [],
    globalFunctions: [],
  };

  traverse(ast, {
    // Find constructor functions (function Foo() {})
    FunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (!name) return;

      if (/^[A-Z]/.test(name)) {
        // Likely a constructor
        analysis.classes.push({ name, type: 'constructor', methods: [] });
      } else {
        analysis.globalFunctions.push(name);
      }
      analysis.functions.push({ name, loc: path.node.loc });
    },

    // Find const/var function expressions
    VariableDeclarator(path) {
      if (path.node.init?.type === 'FunctionExpression' ||
          path.node.init?.type === 'ArrowFunctionExpression') {
        const name = path.node.id?.name;
        if (!name) return;

        if (/^[A-Z]/.test(name)) {
          analysis.classes.push({ name, type: 'constructor', methods: [] });
        } else {
          analysis.globalFunctions.push(name);
        }
        analysis.functions.push({ name, loc: path.node.loc });
      }
    },

    // Find prototype methods (Foo.prototype.bar = function() {})
    AssignmentExpression(path) {
      const left = path.node.left;
      if (left.type === 'MemberExpression' &&
          left.object.type === 'MemberExpression' &&
          left.object.property?.name === 'prototype') {
        const className = left.object.object?.name;
        const methodName = left.property?.name;

        if (className && methodName) {
          analysis.prototypeMethods.push({ className, methodName });

          // Add to class if exists
          const cls = analysis.classes.find(c => c.name === className);
          if (cls) {
            cls.methods = cls.methods || [];
            if (!cls.methods.includes(methodName)) {
              cls.methods.push(methodName);
            }
          }
        }
      }
    },

    // Find ES6 classes
    ClassDeclaration(path) {
      const name = path.node.id?.name;
      if (!name) return;

      const methods = path.node.body.body
        .filter(m => m.type === 'ClassMethod' || m.type === 'MethodDefinition')
        .map(m => m.key?.name)
        .filter(Boolean);

      analysis.classes.push({ name, type: 'class', methods });
    }
  });

  // Dedupe
  analysis.globalFunctions = [...new Set(analysis.globalFunctions)];

  return analysis;
}

module.exports = { analyzeSource };
