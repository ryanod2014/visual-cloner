#!/usr/bin/env node
/**
 * Class/Namespace Inferencer
 *
 * Analyzes minified code to infer what classes/objects represent
 * based on their method implementations and API usage.
 *
 * 100% FREE - no LLM calls!
 */

const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const inputFile = process.argv[2];
const outputFile = process.argv[3] || inputFile.replace('.js', '.classes-inferred.js');

if (!inputFile) {
  console.log('Usage: node infer-classes.js <input.js> [output.js]');
  process.exit(1);
}

console.log('Class/Namespace Inferencer');
console.log('==========================');
console.log(`Input: ${inputFile}`);

const code = fs.readFileSync(inputFile, 'utf8');
let ast;

try {
  ast = parser.parse(code, { sourceType: 'script', errorRecovery: true });
} catch (e) {
  ast = parser.parse(code, { sourceType: 'module', errorRecovery: true });
}

// Track class info
const classInfo = new Map(); // className -> { methods: Set, apiCalls: Set, strings: Set, hints: [] }

function getClassInfo(name) {
  if (!classInfo.has(name)) {
    classInfo.set(name, {
      methods: new Set(),
      apiCalls: new Set(),
      strings: new Set(),
      domMethods: new Set(),
      canvasMethods: new Set(),
      webglMethods: new Set(),
      mathOps: new Set(),
      hints: [],
    });
  }
  return classInfo.get(name);
}

// API patterns that reveal purpose
const API_PATTERNS = {
  // DOM
  dom: ['getElementById', 'querySelector', 'createElement', 'appendChild', 'removeChild',
        'addEventListener', 'removeEventListener', 'setAttribute', 'getAttribute',
        'innerHTML', 'innerText', 'textContent', 'classList', 'style', 'parentNode', 'childNodes'],

  // Canvas 2D
  canvas2d: ['getContext', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText',
             'drawImage', 'getImageData', 'putImageData', 'createImageData',
             'beginPath', 'moveTo', 'lineTo', 'arc', 'bezierCurveTo', 'quadraticCurveTo',
             'fill', 'stroke', 'clip', 'save', 'restore', 'translate', 'rotate', 'scale',
             'globalAlpha', 'globalCompositeOperation', 'fillStyle', 'strokeStyle'],

  // WebGL
  webgl: ['bindBuffer', 'bufferData', 'createBuffer', 'createShader', 'shaderSource',
          'compileShader', 'createProgram', 'attachShader', 'linkProgram', 'useProgram',
          'getAttribLocation', 'getUniformLocation', 'uniform1f', 'uniform2f', 'uniform3f', 'uniform4f',
          'uniform1fv', 'uniform2fv', 'uniform3fv', 'uniform4fv', 'uniformMatrix4fv',
          'vertexAttribPointer', 'enableVertexAttribArray', 'drawArrays', 'drawElements',
          'bindTexture', 'texImage2D', 'texParameteri', 'createTexture', 'activeTexture',
          'TRIANGLES', 'TRIANGLE_STRIP', 'ARRAY_BUFFER', 'ELEMENT_ARRAY_BUFFER'],

  // File/Blob
  file: ['FileReader', 'readAsArrayBuffer', 'readAsDataURL', 'readAsText', 'Blob', 'File',
         'ArrayBuffer', 'DataView', 'Uint8Array', 'Float32Array'],

  // Network
  network: ['XMLHttpRequest', 'fetch', 'open', 'send', 'setRequestHeader', 'responseText',
            'WebSocket', 'postMessage'],

  // Events/Input
  input: ['keyCode', 'which', 'key', 'code', 'ctrlKey', 'shiftKey', 'altKey', 'metaKey',
          'clientX', 'clientY', 'pageX', 'pageY', 'button', 'buttons', 'touches'],

  // Image
  image: ['Image', 'naturalWidth', 'naturalHeight', 'complete', 'onload', 'onerror', 'src'],

  // Color
  color: ['rgb', 'rgba', 'hsl', 'hsla', 'fillStyle', 'strokeStyle', '#'],

  // Font/Text
  font: ['font', 'fontSize', 'fontFamily', 'fontWeight', 'textAlign', 'textBaseline',
         'measureText', 'unitsPerEm', 'ascender', 'descender', 'glyph'],

  // Math/Geometry
  math: ['sin', 'cos', 'tan', 'atan', 'atan2', 'sqrt', 'pow', 'abs', 'floor', 'ceil', 'round',
         'min', 'max', 'PI', 'matrix', 'transform', 'translate', 'rotate', 'scale'],

  // Layer/Document
  layer: ['layer', 'layers', 'opacity', 'blendMode', 'visible', 'locked', 'mask', 'group'],

  // History/Undo
  history: ['undo', 'redo', 'history', 'state', 'snapshot', 'restore'],

  // Selection
  selection: ['selection', 'select', 'deselect', 'invert', 'feather', 'marching'],

  // Filter/Effect
  filter: ['blur', 'sharpen', 'brightness', 'contrast', 'saturation', 'hue', 'filter', 'effect'],

  // Tool
  tool: ['brush', 'pencil', 'eraser', 'bucket', 'gradient', 'clone', 'stamp', 'heal',
         'move', 'select', 'crop', 'eyedropper', 'zoom', 'hand'],
};

// Analyze the AST
traverse(ast, {
  // Track prototype method assignments: ClassName.prototype.methodName = function
  AssignmentExpression(path) {
    const left = path.node.left;

    // Pattern: X.prototype.Y = function
    if (t.isMemberExpression(left) &&
        t.isMemberExpression(left.object) &&
        t.isIdentifier(left.object.property, { name: 'prototype' })) {

      const className = left.object.object.name;
      const methodName = t.isIdentifier(left.property) ? left.property.name : null;

      if (className && methodName) {
        const info = getClassInfo(className);
        info.methods.add(methodName);

        // Analyze the function body for API usage
        if (t.isFunctionExpression(path.node.right) || t.isArrowFunctionExpression(path.node.right)) {
          analyzeFunction(path.node.right, info);
        }
      }
    }

    // Pattern: window.X = new Y() or window.X = obj
    if (t.isMemberExpression(left) && t.isIdentifier(left.object, { name: 'window' })) {
      const globalName = t.isIdentifier(left.property) ? left.property.name : null;
      const right = path.node.right;

      if (globalName && t.isNewExpression(right) && t.isIdentifier(right.callee)) {
        const className = right.callee.name;
        const info = getClassInfo(className);
        info.hints.push(`exported as window.${globalName}`);
      }
    }
  },

  // Track object property assignments: obj.X = value
  ObjectExpression(path) {
    const parent = path.parent;
    if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
      const objName = parent.id.name;
      const info = getClassInfo(objName);

      for (const prop of path.node.properties) {
        if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
          if (t.isFunctionExpression(prop.value) || t.isArrowFunctionExpression(prop.value)) {
            info.methods.add(prop.key.name);
            analyzeFunction(prop.value, info);
          }
        }
        if (t.isObjectMethod(prop) && t.isIdentifier(prop.key)) {
          info.methods.add(prop.key.name);
          analyzeFunction(prop, info);
        }
      }
    }
  },
});

function analyzeFunction(funcNode, info) {
  traverse(funcNode, {
    CallExpression(path) {
      const callee = path.node.callee;

      // Method call: x.method()
      if (t.isMemberExpression(callee)) {
        const method = t.isIdentifier(callee.property) ? callee.property.name : null;
        if (method) {
          info.apiCalls.add(method);

          // Categorize by API
          for (const [category, methods] of Object.entries(API_PATTERNS)) {
            if (methods.includes(method)) {
              info.hints.push(category);
            }
          }
        }
      }
    },

    StringLiteral(path) {
      const val = path.node.value;
      // Capture meaningful strings (skip long encoded stuff)
      if (val.length > 2 && val.length < 50 && !/^[%\d\s\W]+$/.test(val)) {
        info.strings.add(val);
      }
    },

    MemberExpression(path) {
      const prop = path.node.property;
      if (t.isIdentifier(prop)) {
        const name = prop.name;
        // Check for API patterns
        for (const [category, methods] of Object.entries(API_PATTERNS)) {
          if (methods.includes(name)) {
            info.hints.push(category);
          }
        }
      }
    },
  }, { scope: false, noScope: true });
}

// Infer class names based on collected info
const CLASS_INFERENCE_RULES = [
  { hints: ['webgl'], name: 'WebGLRenderer' },
  { hints: ['canvas2d', 'drawImage'], name: 'CanvasRenderer' },
  { hints: ['canvas2d', 'fillText'], name: 'TextRenderer' },
  { hints: ['dom', 'addEventListener', 'input'], name: 'InputManager' },
  { hints: ['dom', 'input', 'keyCode'], name: 'KeyboardManager' },
  { hints: ['dom', 'input', 'clientX'], name: 'MouseManager' },
  { hints: ['font', 'glyph'], name: 'FontManager' },
  { hints: ['font', 'measureText'], name: 'TextMetrics' },
  { hints: ['file', 'ArrayBuffer'], name: 'FileHandler' },
  { hints: ['file', 'Blob'], name: 'BlobHandler' },
  { hints: ['network', 'XMLHttpRequest'], name: 'HttpClient' },
  { hints: ['network', 'WebSocket'], name: 'SocketClient' },
  { hints: ['layer', 'opacity'], name: 'LayerManager' },
  { hints: ['layer', 'blendMode'], name: 'BlendManager' },
  { hints: ['history', 'undo'], name: 'HistoryManager' },
  { hints: ['selection'], name: 'SelectionManager' },
  { hints: ['filter', 'blur'], name: 'FilterEngine' },
  { hints: ['filter', 'effect'], name: 'EffectEngine' },
  { hints: ['color', 'rgb'], name: 'ColorUtils' },
  { hints: ['math', 'matrix'], name: 'MatrixUtils' },
  { hints: ['math', 'transform'], name: 'TransformUtils' },
  { hints: ['tool', 'brush'], name: 'BrushTool' },
  { hints: ['image', 'onload'], name: 'ImageLoader' },
  { hints: ['dom', 'createElement'], name: 'DOMBuilder' },
  { hints: ['dom'], name: 'DOMUtils' },
  { hints: ['canvas2d'], name: 'CanvasUtils' },
  { hints: ['webgl'], name: 'GLUtils' },
  { hints: ['file'], name: 'FileUtils' },
  { hints: ['network'], name: 'NetworkUtils' },
  { hints: ['math'], name: 'MathUtils' },
];

function inferClassName(info) {
  const hintCounts = {};
  for (const hint of info.hints) {
    hintCounts[hint] = (hintCounts[hint] || 0) + 1;
  }

  // Try to match rules
  for (const rule of CLASS_INFERENCE_RULES) {
    const matchScore = rule.hints.filter(h => hintCounts[h] > 0).length;
    if (matchScore === rule.hints.length) {
      return rule.name;
    }
  }

  // Fallback: use dominant hint
  const sorted = Object.entries(hintCounts).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) {
    const dominant = sorted[0][0];
    return dominant.charAt(0).toUpperCase() + dominant.slice(1) + 'Handler';
  }

  return null;
}

// Build rename map
const renames = new Map();
const usedNames = new Map(); // Track usage count for disambiguation
let inferred = 0;

console.log('\nAnalyzing classes...\n');

for (const [className, info] of classInfo) {
  if (info.methods.size < 2) continue; // Skip trivial objects

  let inferredName = inferClassName(info);

  console.log(`${className}:`);
  console.log(`  Methods: ${[...info.methods].slice(0, 10).join(', ')}${info.methods.size > 10 ? '...' : ''}`);
  console.log(`  API hints: ${[...new Set(info.hints)].slice(0, 5).join(', ')}`);
  console.log(`  Strings: ${[...info.strings].slice(0, 3).join(', ')}`);

  if (inferredName) {
    // Disambiguate duplicate names
    const count = usedNames.get(inferredName) || 0;
    usedNames.set(inferredName, count + 1);
    if (count > 0) {
      inferredName = `${inferredName}${count + 1}`;
    }

    console.log(`  → Inferred: ${inferredName}`);
    renames.set(className, inferredName);
    inferred++;
  }
  console.log('');
}

console.log(`\nInferred ${inferred} class names`);

// Apply renames
if (renames.size > 0) {
  console.log('\nApplying renames...');

  let renamed = 0;
  traverse(ast, {
    Identifier(path) {
      const newName = renames.get(path.node.name);
      if (!newName) return;

      // Don't rename property access
      if (path.parent && t.isMemberExpression(path.parent) &&
          path.parent.property === path.node && !path.parent.computed) {
        return;
      }

      path.node.name = newName;
      renamed++;
    }
  });

  console.log(`Renamed ${renamed} occurrences`);

  const output = generate(ast, { retainLines: false, compact: false }).code;
  fs.writeFileSync(outputFile, output);
  console.log(`\nOutput: ${outputFile}`);
} else {
  console.log('\nNo renames to apply');
  fs.copyFileSync(inputFile, outputFile);
}
