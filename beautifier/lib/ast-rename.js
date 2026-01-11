#!/usr/bin/env node
/**
 * AST-Based Variable Renamer
 *
 * Uses Babel to safely rename scoped variables:
 * - IIFE parameters (d, e) → (window, document)
 * - Short constant names → meaningful names
 * - Handles scope properly to avoid conflicts
 */

const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile) {
  console.log('Usage: node ast-rename.cjs <input.js> [output.js]');
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
  console.error('Parse error:', err.message);
  // Try as module
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx'],
      errorRecovery: true,
    });
  } catch (err2) {
    console.error('Failed to parse as module too:', err2.message);
    process.exit(1);
  }
}

console.log('AST-Based Variable Renamer');
console.log('==========================');
console.log(`Input: ${inputFile}`);
console.log('');

const renames = new Map();
const usedNames = new Set();

// Collect all existing identifiers to avoid conflicts
traverse(ast, {
  Identifier(path) {
    usedNames.add(path.node.name);
  }
});

// Helper to get a unique name
function getUniqueName(baseName) {
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }
  let i = 2;
  while (usedNames.has(baseName + i)) i++;
  usedNames.add(baseName + i);
  return baseName + i;
}

// Infer name from how a variable is used
function inferNameFromUsage(binding) {
  const name = binding.identifier.name;

  // Check all references to see how it's used
  for (const ref of binding.referencePaths) {
    const parent = ref.parent;

    // d.jQuery or d.document → d is window
    if (t.isMemberExpression(parent) && ref.key === 'object') {
      const prop = parent.property;
      if (t.isIdentifier(prop)) {
        if (['jQuery', '$', 'console', 'location', 'history', 'localStorage', 'sessionStorage', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'fetch', 'alert', 'confirm', 'dispatchEvent', 'addEventListener', 'removeEventListener', 'WAVV', 'WavvDialer', 'WavvVideo', 'wavvLogs', 'wavvBothInstalled'].includes(prop.name)) {
          return 'window';
        }
        if (['body', 'head', 'createElement', 'getElementById', 'querySelector', 'querySelectorAll', 'documentElement', 'cookie', 'URL', 'referrer', 'title', 'readyState'].includes(prop.name)) {
          return 'document';
        }
        if (['href', 'pathname', 'search', 'hash', 'host', 'hostname', 'origin', 'protocol', 'port'].includes(prop.name)) {
          return 'urlString';
        }
      }
    }

    // new URL(x) or URL.includes() → x is urlString
    if (t.isNewExpression(parent) && parent.callee.name === 'URL') {
      return 'urlString';
    }
    if (t.isCallExpression(parent) && t.isMemberExpression(parent.callee)) {
      if (parent.callee.property.name === 'includes' && ref.key === 'object') {
        // Could be a string
      }
    }
  }

  return null;
}

// Process IIFE parameters
let iifeRenames = 0;
traverse(ast, {
  CallExpression(path) {
    const callee = path.node.callee;

    // Check for IIFE: (function(a,b){...})(arg1, arg2)
    if (t.isFunctionExpression(callee) || t.isArrowFunctionExpression(callee)) {
      const params = callee.params;
      const args = path.node.arguments;

      // Get the function scope
      const funcPath = path.get('callee');
      const scope = funcPath.scope;

      params.forEach((param, i) => {
        if (!t.isIdentifier(param)) return;
        const paramName = param.name;

        // Skip if already a good name
        if (paramName.length > 2) return;

        const binding = scope.getBinding(paramName);
        if (!binding) return;

        let newName = null;

        // Try to infer from arguments passed
        if (args[i]) {
          const arg = args[i];
          if (t.isIdentifier(arg)) {
            if (arg.name === 'window' || arg.name === 'this') {
              newName = 'window';
            } else if (arg.name === 'document') {
              newName = 'document';
            } else if (arg.name.length > 2) {
              newName = arg.name;
            }
          } else if (t.isThisExpression(arg)) {
            newName = 'window';
          } else if (t.isMemberExpression(arg)) {
            // window.document or this.document
            if (t.isIdentifier(arg.property) && arg.property.name === 'document') {
              newName = 'document';
            }
          }
        }

        // If no name from args, infer from usage
        if (!newName) {
          newName = inferNameFromUsage(binding);
        }

        if (newName && newName !== paramName) {
          const uniqueName = getUniqueName(newName);
          console.log(`  IIFE param: ${paramName} → ${uniqueName}`);
          scope.rename(paramName, uniqueName);
          iifeRenames++;
        }
      });
    }
  }
});

// Process short constant declarations at module/function scope
let constRenames = 0;
traverse(ast, {
  VariableDeclarator(path) {
    const id = path.node.id;
    if (!t.isIdentifier(id)) return;

    const name = id.name;

    // Skip if already a good name
    if (name.length > 2) return;

    // Skip if it's a destructuring or complex pattern
    const init = path.node.init;
    if (!init) return;

    const binding = path.scope.getBinding(name);
    if (!binding) return;

    // Skip if it has too many references (likely important short name intentionally)
    if (binding.references > 150) return;

    let newName = null;

    // String literal assignments
    if (t.isStringLiteral(init)) {
      const val = init.value;

      // URL patterns
      if (val.startsWith('http://') || val.startsWith('https://')) {
        if (val.includes('/api/')) {
          newName = 'apiBaseUrl';
        } else if (val.includes('cdn') || val.includes('assets') || val.includes('s3.amazonaws')) {
          newName = 'cdnUrl';
        } else if (val.includes('jquery')) {
          newName = 'jqueryUrl';
        } else if (val.includes('dialer')) {
          newName = 'dialerScriptUrl';
        } else {
          newName = 'scriptUrl';
        }
      }
      // CSS color
      else if (val.match(/^#[0-9a-fA-F]{3,8}$/)) {
        newName = 'color';
      }
      // Element ID
      else if (val.startsWith('wavv-')) {
        newName = 'elementId';
      }
    }

    // Numeric literal assignments
    else if (t.isNumericLiteral(init)) {
      const val = init.value;
      // Common CSS values
      if (val >= 100 && val <= 900 && val % 100 === 0) {
        newName = 'fontWeight';
      } else if (val >= 8 && val <= 48) {
        newName = 'fontSize';
      } else if (val >= 1 && val <= 20) {
        newName = 'spacing';
      } else if (val >= 50 && val <= 5000) {
        newName = 'delay';
      }
    }

    // Template literal with URL
    else if (t.isTemplateLiteral(init) || t.isBinaryExpression(init)) {
      // Check if it's a URL construction
      const code = generate(init).code;
      if (code.includes('http') || code.includes('.com')) {
        newName = 'url';
      }
    }

    // Infer from usage if no name yet
    if (!newName) {
      newName = inferNameFromUsage(binding);
    }

    if (newName && newName !== name) {
      const uniqueName = getUniqueName(newName);
      console.log(`  Constant: ${name} → ${uniqueName}`);
      path.scope.rename(name, uniqueName);
      constRenames++;
    }
  }
});

// Process object that becomes main state
let stateRenames = 0;
traverse(ast, {
  VariableDeclarator(path) {
    const id = path.node.id;
    if (!t.isIdentifier(id)) return;

    const name = id.name;
    if (name.length > 2) return;

    const init = path.node.init;

    // Check for k = {} followed by k.userId = null, etc.
    if (t.isObjectExpression(init) && init.properties.length === 0) {
      // Empty object - check if it's assigned state-like properties
      const binding = path.scope.getBinding(name);
      if (!binding) return;

      let hasStateProps = false;
      for (const ref of binding.referencePaths) {
        const parent = ref.parent;
        if (t.isAssignmentExpression(parent) && t.isMemberExpression(parent.left)) {
          const prop = parent.left.property;
          if (t.isIdentifier(prop) && ['userId', 'companyId', 'token', 'isAdmin', 'initialized'].includes(prop.name)) {
            hasStateProps = true;
            break;
          }
        }
      }

      if (hasStateProps) {
        const uniqueName = getUniqueName('appState');
        console.log(`  State object: ${name} → ${uniqueName}`);
        path.scope.rename(name, uniqueName);
        stateRenames++;
      }
    }
  }
});

// Generate output
const output = generate(ast, {
  comments: true,
  compact: false,
  concise: false,
}, code);

console.log('');
console.log(`Summary:`);
console.log(`  IIFE params renamed: ${iifeRenames}`);
console.log(`  Constants renamed: ${constRenames}`);
console.log(`  State objects renamed: ${stateRenames}`);
console.log(`  Total: ${iifeRenames + constRenames + stateRenames}`);

if (outputFile) {
  fs.writeFileSync(outputFile, output.code);
  console.log(`\nOutput written to: ${outputFile}`);
} else {
  process.stdout.write(output.code);
}
