#!/usr/bin/env node
/**
 * Fix Destructure Names
 *
 * Renames variables to match their destructured property names:
 *   { contactId: element2 }  →  { contactId }
 *   { tags: element7 }       →  { tags }
 *
 * Also fixes parameters used as property values:
 *   getRecordings = (element2) => ({ callIds: element2 })  →  (callIds) => ({ callIds })
 */

const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const inputFile = process.argv[2];
const outputFile = process.argv[3] || inputFile;

if (!inputFile) {
  console.log('Usage: node fix-destructure-names.js <input.js> [output.js]');
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
  ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx'],
    errorRecovery: true,
  });
}

console.log('Fix Destructure Names');
console.log('=====================');

let fixed = 0;

// Process each function scope independently
traverse(ast, {
  'FunctionExpression|ArrowFunctionExpression|FunctionDeclaration'(path) {
    const scopeRenames = new Map();
    const usedInScope = new Set();

    // Collect all names used in this scope
    path.traverse({
      Identifier(idPath) {
        usedInScope.add(idPath.node.name);
      },
    });

    // Find destructuring patterns with generic names in this function's params
    for (const param of path.node.params) {
      if (!t.isObjectPattern(param)) continue;

      for (const prop of param.properties) {
        if (!t.isObjectProperty(prop)) continue;
        if (!t.isIdentifier(prop.key)) continue;
        if (!t.isIdentifier(prop.value)) continue;

        const keyName = prop.key.name;
        const valueName = prop.value.name;

        // If value looks generic and key is semantic, rename value to match key
        if (/^element\d*$/.test(valueName) && !/^element\d*$/.test(keyName)) {
          scopeRenames.set(valueName, keyName);
          console.log(`  ${valueName} → ${keyName} (from destructuring)`);
        }
      }
    }

    // For single-param arrow functions, check if param is used as property value
    if (path.node.params.length === 1 && t.isIdentifier(path.node.params[0])) {
      const paramName = path.node.params[0].name;
      if (/^element\d*$/.test(paramName) && !scopeRenames.has(paramName)) {
        let foundKey = null;
        path.traverse({
          ObjectProperty(propPath) {
            if (!t.isIdentifier(propPath.node.key)) return;
            if (!t.isIdentifier(propPath.node.value)) return;
            if (propPath.node.value.name !== paramName) return;
            if (propPath.node.shorthand) return;
            if (foundKey) return; // Only use first match

            const keyName = propPath.node.key.name;
            if (!/^element\d*$/.test(keyName)) {
              foundKey = keyName;
            }
          },
        });

        if (foundKey) {
          scopeRenames.set(paramName, foundKey);
          console.log(`  ${paramName} → ${foundKey} (from property usage)`);
        }
      }
    }

    // Also check for multi-param functions where params are used as property values
    for (const param of path.node.params) {
      if (!t.isIdentifier(param)) continue;
      const paramName = param.name;
      if (!/^element\d*$/.test(paramName)) continue;
      if (scopeRenames.has(paramName)) continue;

      let foundKey = null;
      path.traverse({
        ObjectProperty(propPath) {
          if (!t.isIdentifier(propPath.node.key)) return;
          if (!t.isIdentifier(propPath.node.value)) return;
          if (propPath.node.value.name !== paramName) return;
          if (propPath.node.shorthand) return;
          if (foundKey) return;

          const keyName = propPath.node.key.name;
          if (!/^element\d*$/.test(keyName)) {
            foundKey = keyName;
          }
        },
      });

      if (foundKey) {
        scopeRenames.set(paramName, foundKey);
        console.log(`  ${paramName} → ${foundKey} (from property usage)`);
      }
    }

    // Apply renames within this scope only
    if (scopeRenames.size > 0) {
      path.traverse({
        Identifier(idPath) {
          const newName = scopeRenames.get(idPath.node.name);
          if (!newName) return;

          // Don't rename property keys (unless it's a shorthand or computed)
          if (idPath.parent && t.isObjectProperty(idPath.parent) &&
              idPath.parent.key === idPath.node && !idPath.parent.computed && !idPath.parent.shorthand) {
            return;
          }

          // Don't rename member expression properties
          if (idPath.parent && t.isMemberExpression(idPath.parent) &&
              idPath.parent.property === idPath.node && !idPath.parent.computed) {
            return;
          }

          idPath.node.name = newName;
          fixed++;
        },
      });
    }
  },
});

// Step 4: Convert to shorthand where possible: { contactId: contactId } → { contactId }
traverse(ast, {
  ObjectProperty(path) {
    if (path.node.shorthand) return;
    if (!t.isIdentifier(path.node.key)) return;
    if (!t.isIdentifier(path.node.value)) return;
    if (path.node.key.name === path.node.value.name) {
      path.node.shorthand = true;
    }
  },
});

const output = generate(ast, {
  retainLines: false,
  compact: false,
}).code;

fs.writeFileSync(outputFile, output);
console.log(`\nApplied ${fixed} renames`);
console.log(`Output: ${outputFile}`);
