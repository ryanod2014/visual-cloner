#!/usr/bin/env node
/**
 * Type Inference Variable Renamer
 *
 * Renames minified variables based on usage patterns - NO LLM needed.
 * Analyzes how variables are used to infer meaningful names.
 *
 * Works per-scope to handle same-letter-different-meaning correctly.
 */

const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const inputFile = process.argv[2];
const outputFile = process.argv[3] || inputFile.replace('.js', '.inferred.js');

if (!inputFile) {
  console.log('Usage: node type-inference-rename.js <input.js> [output.js]');
  process.exit(1);
}

console.log('Type Inference Renamer');
console.log('======================');
console.log(`Input: ${inputFile}`);

const code = fs.readFileSync(inputFile, 'utf8');
let ast;

try {
  ast = parser.parse(code, { sourceType: 'script', errorRecovery: true });
} catch (e) {
  ast = parser.parse(code, { sourceType: 'module', errorRecovery: true });
}

// Track inferred types per scope
const scopeData = new Map();

function getScopeId(path) {
  // Find the nearest function scope (not the root)
  let scope = path.scope;
  while (scope && !scope.path.isFunction() && scope.parent) {
    scope = scope.parent;
  }
  return scope ? scope.uid : 'global';
}

function getOrCreateVarData(scopeId, varName) {
  if (!scopeData.has(scopeId)) scopeData.set(scopeId, new Map());
  const scope = scopeData.get(scopeId);
  if (!scope.has(varName)) {
    scope.set(varName, {
      name: varName,
      hints: [],
      methodsCalled: new Set(),
      propertiesAccessed: new Set(),
      assignedFrom: null,
      usedAsArg: [],
    });
  }
  return scope.get(varName);
}

// ============================================================
// PHASE 1: Collect usage patterns
// ============================================================

traverse(ast, {
  // Track method calls: z.push(), z.getContext(), etc.
  CallExpression(path) {
    const callee = path.node.callee;

    // Method call: obj.method()
    if (t.isMemberExpression(callee) && t.isIdentifier(callee.object)) {
      const objName = callee.object.name;
      const scopeId = getScopeId(path);
      const data = getOrCreateVarData(scopeId, objName);

      let methodName = null;
      if (t.isIdentifier(callee.property)) {
        methodName = callee.property.name;
      } else if (t.isStringLiteral(callee.property)) {
        methodName = callee.property.value;
      }

      if (methodName) {
        data.methodsCalled.add(methodName);

        // Special method patterns
        if (methodName === 'getContext') {
          const arg = path.node.arguments[0];
          if (t.isStringLiteral(arg)) {
            if (arg.value === '2d') data.hints.push('canvas');
            else if (arg.value === 'webgl' || arg.value === 'webgl2') data.hints.push('canvas');
          }
        }

        if (methodName === 'getElementById' || methodName === 'querySelector') {
          data.hints.push('document');
        }

        if (methodName === 'createElement') {
          data.hints.push('document');
        }

        if (methodName === 'addEventListener') {
          data.hints.push('element');
        }

        if (methodName === 'appendChild' || methodName === 'removeChild' || methodName === 'insertBefore') {
          data.hints.push('element');
        }

        if (methodName === 'drawImage' || methodName === 'fillRect' || methodName === 'strokeRect') {
          data.hints.push('ctx');
        }

        if (methodName === 'getImageData' || methodName === 'putImageData' || methodName === 'createImageData') {
          data.hints.push('ctx');
        }

        if (methodName === 'then' || methodName === 'catch' || methodName === 'finally') {
          data.hints.push('promise');
        }

        if (methodName === 'push' || methodName === 'pop' || methodName === 'shift' || methodName === 'unshift') {
          data.hints.push('array');
        }

        if (methodName === 'splice' || methodName === 'slice' || methodName === 'concat' || methodName === 'map' || methodName === 'filter' || methodName === 'reduce' || methodName === 'forEach') {
          data.hints.push('array');
        }

        if (methodName === 'set' || methodName === 'get' || methodName === 'has' || methodName === 'delete') {
          if (data.methodsCalled.has('set') && data.methodsCalled.has('get')) {
            data.hints.push('map');
          }
        }

        if (methodName === 'add' || methodName === 'has' || methodName === 'delete' || methodName === 'clear') {
          data.hints.push('set');
        }

        if (methodName === 'read' || methodName === 'write' || methodName === 'readAsArrayBuffer' || methodName === 'readAsDataURL') {
          data.hints.push('reader');
        }

        if (methodName === 'send' || methodName === 'open' || methodName === 'setRequestHeader') {
          data.hints.push('xhr');
        }

        if (methodName === 'postMessage') {
          data.hints.push('worker');
        }

        if (methodName === 'texImage2D' || methodName === 'bindTexture' || methodName === 'bindBuffer') {
          data.hints.push('gl');
        }
      }
    }

    // Track arguments to known functions
    if (t.isIdentifier(callee)) {
      const fnName = callee.name;

      // setTimeout/setInterval second arg is delay
      if (fnName === 'setTimeout' || fnName === 'setInterval') {
        const delayArg = path.node.arguments[1];
        if (t.isIdentifier(delayArg)) {
          const scopeId = getScopeId(path);
          const data = getOrCreateVarData(scopeId, delayArg.name);
          data.hints.push('delay');
        }
      }
    }

    // addEventListener callback parameter is event
    if (t.isMemberExpression(callee) &&
        t.isIdentifier(callee.property, { name: 'addEventListener' })) {
      const callback = path.node.arguments[1];
      if (t.isFunctionExpression(callback) || t.isArrowFunctionExpression(callback)) {
        const firstParam = callback.params[0];
        if (t.isIdentifier(firstParam)) {
          const scopeId = path.scope.uid;
          const data = getOrCreateVarData(scopeId, firstParam.name);
          data.hints.push('event');
        }
      }
    }
  },

  // Track property access: z.width, z.x, z.r, etc.
  MemberExpression(path) {
    if (!t.isIdentifier(path.node.object)) return;

    const objName = path.node.object.name;
    const scopeId = getScopeId(path);
    const data = getOrCreateVarData(scopeId, objName);

    let propName = null;
    if (t.isIdentifier(path.node.property) && !path.node.computed) {
      propName = path.node.property.name;
    } else if (t.isStringLiteral(path.node.property)) {
      propName = path.node.property.value;
    }

    if (propName) {
      data.propertiesAccessed.add(propName);
    }
  },

  // Track assignments: var z = document.getElementById(...)
  VariableDeclarator(path) {
    if (!t.isIdentifier(path.node.id)) return;

    const varName = path.node.id.name;
    const scopeId = getScopeId(path);
    const data = getOrCreateVarData(scopeId, varName);
    const init = path.node.init;

    if (!init) return;

    // new Something()
    if (t.isNewExpression(init) && t.isIdentifier(init.callee)) {
      const className = init.callee.name;
      if (className === 'Image') data.hints.push('image');
      else if (className === 'Audio') data.hints.push('audio');
      else if (className === 'ArrayBuffer') data.hints.push('buffer');
      else if (className === 'Uint8Array' || className === 'Uint8ClampedArray') data.hints.push('bytes');
      else if (className === 'Uint16Array' || className === 'Uint32Array') data.hints.push('uints');
      else if (className === 'Int8Array' || className === 'Int16Array' || className === 'Int32Array') data.hints.push('ints');
      else if (className === 'Float32Array' || className === 'Float64Array') data.hints.push('floats');
      else if (className === 'DataView') data.hints.push('view');
      else if (className === 'Blob') data.hints.push('blob');
      else if (className === 'File') data.hints.push('file');
      else if (className === 'FileReader') data.hints.push('reader');
      else if (className === 'XMLHttpRequest') data.hints.push('xhr');
      else if (className === 'WebSocket') data.hints.push('socket');
      else if (className === 'Worker') data.hints.push('worker');
      else if (className === 'Map') data.hints.push('map');
      else if (className === 'Set') data.hints.push('set');
      else if (className === 'WeakMap') data.hints.push('weakMap');
      else if (className === 'WeakSet') data.hints.push('weakSet');
      else if (className === 'Promise') data.hints.push('promise');
      else if (className === 'RegExp') data.hints.push('regex');
      else if (className === 'Date') data.hints.push('date');
      else if (className === 'Error' || className.endsWith('Error')) data.hints.push('error');
    }

    // document.getElementById(...) or document.createElement(...)
    if (t.isCallExpression(init) && t.isMemberExpression(init.callee)) {
      const method = init.callee.property;
      if (t.isIdentifier(method)) {
        if (method.name === 'getElementById') {
          data.hints.push('element');
          // Try to get element ID for better naming
          const arg = init.arguments[0];
          if (t.isStringLiteral(arg)) {
            data.hints.push(`${arg.value}Element`);
          }
        } else if (method.name === 'querySelector' || method.name === 'querySelectorAll') {
          data.hints.push('element');
        } else if (method.name === 'createElement') {
          data.hints.push('element');
          const arg = init.arguments[0];
          if (t.isStringLiteral(arg)) {
            data.hints.push(`${arg.value}Element`);
          }
        } else if (method.name === 'getContext') {
          const arg = init.arguments[0];
          if (t.isStringLiteral(arg)) {
            if (arg.value === '2d') data.hints.push('ctx');
            else if (arg.value.includes('webgl')) data.hints.push('gl');
          }
        } else if (method.name === 'getImageData') {
          data.hints.push('imageData');
        } else if (method.name === 'getBoundingClientRect') {
          data.hints.push('rect');
        } else if (method.name === 'cloneNode') {
          data.hints.push('element');
        }
      }
    }

    // Array literals
    if (t.isArrayExpression(init)) {
      data.hints.push('array');
    }

    // Object literals
    if (t.isObjectExpression(init)) {
      data.hints.push('obj');
    }

    // Function expressions
    if (t.isFunctionExpression(init) || t.isArrowFunctionExpression(init)) {
      data.hints.push('fn');
    }

    // String literals
    if (t.isStringLiteral(init)) {
      data.hints.push('str');
    }

    // Number literals
    if (t.isNumericLiteral(init)) {
      data.hints.push('num');
    }

    // Boolean
    if (t.isBooleanLiteral(init)) {
      data.hints.push('bool');
    }
  },

  // Track for loop index variables
  ForStatement(path) {
    const init = path.node.init;
    if (t.isVariableDeclaration(init)) {
      for (const decl of init.declarations) {
        if (t.isIdentifier(decl.id) && decl.id.name.length === 1) {
          const scopeId = getScopeId(path);
          const data = getOrCreateVarData(scopeId, decl.id.name);
          data.hints.push('index');
        }
      }
    }
  },
});

// ============================================================
// PHASE 2: Infer best names from collected data
// ============================================================

function inferName(data) {
  const { name, hints, methodsCalled, propertiesAccessed } = data;

  // Skip if already a good name (more than 2 chars and not cryptic)
  if (name.length > 2 && !/^[a-z][A-Z]/.test(name) && !/^[A-Z][0-9]/.test(name)) {
    return null;
  }

  // Skip common index variables
  if (name === 'i' || name === 'j' || name === 'k' || name === 'n') {
    return null;
  }

  // Property pattern matching
  const props = Array.from(propertiesAccessed);

  // Point pattern: x, y
  if (props.includes('x') && props.includes('y')) {
    if (props.includes('z')) return 'point3d';
    return 'point';
  }

  // Color pattern: r, g, b
  if (props.includes('r') && props.includes('g') && props.includes('b')) {
    return 'color';
  }

  // Size pattern: width, height
  if (props.includes('width') && props.includes('height')) {
    if (props.includes('x') && props.includes('y')) return 'rect';
    return 'size';
  }

  // Bounds pattern
  if (props.includes('left') && props.includes('top') && props.includes('right') && props.includes('bottom')) {
    return 'bounds';
  }

  // Range pattern
  if (props.includes('min') && props.includes('max')) {
    return 'range';
  }

  if (props.includes('start') && props.includes('end')) {
    return 'range';
  }

  // Use hints (prioritize more specific hints)
  const hintPriority = [
    'canvasElement', 'divElement', 'imgElement', 'spanElement',
    'imageData', 'ctx', 'gl', 'canvas', 'image', 'audio',
    'element', 'document', 'event', 'error',
    'bytes', 'floats', 'ints', 'uints', 'buffer', 'view', 'blob', 'file',
    'reader', 'xhr', 'socket', 'worker',
    'promise', 'map', 'set', 'weakMap', 'weakSet',
    'array', 'obj', 'fn', 'str', 'num', 'bool', 'regex', 'date',
    'delay', 'index',
  ];

  for (const priority of hintPriority) {
    if (hints.includes(priority)) {
      return priority;
    }
  }

  // Check method patterns
  const methods = Array.from(methodsCalled);

  if (methods.includes('getContext')) return 'canvas';
  if (methods.includes('drawImage') || methods.includes('fillRect')) return 'ctx';
  if (methods.includes('texImage2D') || methods.includes('bindTexture')) return 'gl';
  if (methods.includes('getElementById') || methods.includes('createElement')) return 'doc';
  if (methods.includes('appendChild') || methods.includes('addEventListener')) return 'element';
  if (methods.includes('then') || methods.includes('catch')) return 'promise';
  if (methods.includes('push') || methods.includes('pop') || methods.includes('splice')) return 'arr';
  if (methods.includes('set') && methods.includes('get')) return 'map';
  if (methods.includes('exec') || methods.includes('test')) return 'regex';
  if (methods.includes('getTime') || methods.includes('getFullYear')) return 'date';
  if (methods.includes('send') || methods.includes('open')) return 'xhr';
  if (methods.includes('postMessage') || methods.includes('terminate')) return 'worker';
  if (methods.includes('write') || methods.includes('read')) return 'stream';

  return null;
}

// ============================================================
// PHASE 3: Build rename map per function
// ============================================================

let totalRenamed = 0;
const renameStats = new Map();
const functionRenames = new Map(); // path.node -> Map<oldName, newName>

traverse(ast, {
  'FunctionExpression|ArrowFunctionExpression|FunctionDeclaration'(path) {
    const scopeId = getScopeId(path);
    const scopeVars = scopeData.get(scopeId);
    if (!scopeVars) return;

    const renames = new Map();
    const usedNames = new Set();

    // Collect existing names in this function to avoid conflicts
    path.traverse({
      Identifier(idPath) {
        usedNames.add(idPath.node.name);
      }
    });

    // Infer names for each variable
    for (const [varName, data] of scopeVars) {
      const inferred = inferName(data);
      if (inferred && inferred !== varName) {
        // Make unique if needed
        let newName = inferred;
        let counter = 1;
        while (usedNames.has(newName) || [...renames.values()].includes(newName)) {
          newName = `${inferred}${counter++}`;
        }
        renames.set(varName, newName);
        usedNames.add(newName);

        // Track stats
        renameStats.set(inferred, (renameStats.get(inferred) || 0) + 1);
      }
    }

    if (renames.size > 0) {
      functionRenames.set(path.node, renames);
    }
  }
});

// ============================================================
// PHASE 4: Apply renames by walking AST
// ============================================================

traverse(ast, {
  'FunctionExpression|ArrowFunctionExpression|FunctionDeclaration'(path) {
    const renames = functionRenames.get(path.node);
    if (!renames || renames.size === 0) return;

    // Get all variable declarations in this function
    const declaredVars = new Set();

    // Check params
    for (const param of path.node.params) {
      if (t.isIdentifier(param)) declaredVars.add(param.name);
      if (t.isAssignmentPattern(param) && t.isIdentifier(param.left)) declaredVars.add(param.left.name);
    }

    // Check var/let/const declarations
    path.traverse({
      VariableDeclarator(declPath) {
        if (declPath.scope.uid === path.scope.uid || declPath.scope.parent?.uid === path.scope.uid) {
          if (t.isIdentifier(declPath.node.id)) {
            declaredVars.add(declPath.node.id.name);
          }
        }
      }
    });

    // Only rename variables that are declared in this scope
    const validRenames = new Map();
    for (const [oldName, newName] of renames) {
      if (declaredVars.has(oldName)) {
        validRenames.set(oldName, newName);
      }
    }

    if (validRenames.size === 0) return;

    // Apply renames to all identifiers in this function
    path.traverse({
      Identifier(idPath) {
        const oldName = idPath.node.name;
        const newName = validRenames.get(oldName);
        if (!newName) return;

        // Don't rename property keys
        if (idPath.parent && t.isObjectProperty(idPath.parent) &&
            idPath.parent.key === idPath.node && !idPath.parent.computed) {
          return;
        }

        // Don't rename member expression properties
        if (idPath.parent && t.isMemberExpression(idPath.parent) &&
            idPath.parent.property === idPath.node && !idPath.parent.computed) {
          return;
        }

        // Don't rename object method names
        if (idPath.parent && t.isObjectMethod(idPath.parent) &&
            idPath.parent.key === idPath.node) {
          return;
        }

        idPath.node.name = newName;
        totalRenamed++;
      }
    });
  }
});

console.log(`\nTotal variables renamed: ${totalRenamed}`);
console.log('\nRename distribution:');
const sortedStats = [...renameStats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [name, count] of sortedStats) {
  console.log(`  ${name.padEnd(15)} ${count}`);
}

// Generate output
const output = generate(ast, { retainLines: false, compact: false }).code;
fs.writeFileSync(outputFile, output);
console.log(`\nOutput: ${outputFile}`);
