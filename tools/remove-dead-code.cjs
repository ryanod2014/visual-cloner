#!/usr/bin/env node
/**
 * Dead Code Remover
 *
 * Removes obfuscation artifacts after string decoding:
 * - String array declarations
 * - Decoder functions
 * - Rotation IIFEs
 * - Decoder aliases
 */

const fs = require('fs');

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile) {
  console.log('Usage: node remove-dead-code.cjs <input.js> [output.js]');
  process.exit(1);
}

let code = fs.readFileSync(inputFile, 'utf8');
const originalLength = code.length;
let removedItems = [];

// ============================================================
// STEP 1: Find decoder function name
// ============================================================

const decoderMatch = code.match(/function\s+(\w+)\s*\(\s*(\w+)\s*,\s*\w*\s*\)\s*\{\s*\2\s*=\s*\2\s*-\s*(0x[0-9a-fA-F]+|\d+)/);
const decoderFuncName = decoderMatch ? decoderMatch[1] : null;

if (decoderFuncName) {
  console.log(`Found decoder function: ${decoderFuncName}`);
}

// ============================================================
// STEP 2: Find all decoder aliases
// ============================================================

const aliases = decoderFuncName ? [decoderFuncName] : [];
if (decoderFuncName) {
  const aliasPattern = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*${decoderFuncName}\\s*[,;]`, 'g');
  let m;
  while ((m = aliasPattern.exec(code)) !== null) {
    if (!aliases.includes(m[1])) {
      aliases.push(m[1]);
    }
  }
  console.log(`Found ${aliases.length} decoder aliases: ${aliases.join(', ')}`);
}

// ============================================================
// STEP 3: Remove string array declaration
// ============================================================

// Pattern: const/var/let XX = ['...', '...', ...]; (large array at start)
const arrayMatch = code.match(/^(\s*(?:const|var|let)\s+(\w+)\s*=\s*\[)/m);
if (arrayMatch) {
  const arrayVarName = arrayMatch[2];
  const start = arrayMatch.index;

  // Find the end of the array
  let bracket = 0, i = start;
  let inString = false, quote = null;

  while (i < code.length) {
    const c = code[i];
    if (!inString) {
      if (c === '[') bracket++;
      else if (c === ']') {
        bracket--;
        if (bracket === 0) break;
      }
      else if (c === '"' || c === "'") {
        inString = true;
        quote = c;
      }
    } else {
      if (c === '\\') i++;
      else if (c === quote) {
        inString = false;
        quote = null;
      }
    }
    i++;
  }

  // Find the semicolon after the array
  while (i < code.length && code[i] !== ';') i++;

  const arrayDecl = code.substring(start, i + 1);
  const stringCount = (arrayDecl.match(/['"]/g) || []).length / 2;

  // Only remove if it's a large array (likely the obfuscation array)
  if (stringCount > 50) {
    code = code.substring(0, start) + code.substring(i + 1);
    removedItems.push(`String array (${arrayVarName}): ~${Math.round(stringCount)} strings`);
    console.log(`Removed string array: ${arrayVarName} (~${Math.round(stringCount)} strings)`);
  }
}

// ============================================================
// STEP 4: Remove decoder function
// ============================================================

if (decoderFuncName) {
  // Match: function NAME(a, b) { ... } with balanced braces
  const funcPattern = new RegExp(`function\\s+${decoderFuncName}\\s*\\([^)]*\\)\\s*\\{`);
  const funcMatch = code.match(funcPattern);

  if (funcMatch) {
    const start = funcMatch.index;
    let brace = 0, i = start;

    // Find opening brace
    while (i < code.length && code[i] !== '{') i++;

    // Match braces
    while (i < code.length) {
      if (code[i] === '{') brace++;
      else if (code[i] === '}') {
        brace--;
        if (brace === 0) break;
      }
      i++;
    }

    code = code.substring(0, start) + code.substring(i + 1);
    removedItems.push(`Decoder function: ${decoderFuncName}`);
    console.log(`Removed decoder function: ${decoderFuncName}`);
  }
}

// ============================================================
// STEP 5: Remove "array getter" function that returns the array
// ============================================================

// Pattern: function XX() { const YY = [...]; XX = function() { return YY; }; return XX(); }
const getterPattern = /function\s+(\w+)\s*\(\s*\)\s*\{\s*(?:const|let|var)\s+\w+\s*=\s*\[[\s\S]*?\];\s*\1\s*=\s*function\s*\(\s*\)\s*\{[\s\S]*?\};\s*return\s+\1\s*\(\s*\);\s*\}/;
const getterMatch = code.match(getterPattern);
if (getterMatch) {
  code = code.replace(getterMatch[0], '');
  removedItems.push(`Array getter function: ${getterMatch[1]}`);
  console.log(`Removed array getter: ${getterMatch[1]}`);
}

// ============================================================
// STEP 6: Remove rotation IIFE
// ============================================================

// Pattern: (function(a, b) { ... while(true) { try { ... } catch { a.push(a.shift()) } } })(arrayFunc, target)
const rotationPattern = /\(\s*function\s*\(\s*\w+\s*,\s*\w+\s*\)\s*\{[\s\S]*?while\s*\(\s*!!\s*\[\s*\]\s*\)[\s\S]*?\.push\s*\([\s\S]*?\.shift\s*\(\s*\)[\s\S]*?\}\s*\)\s*\(\s*\w+\s*,\s*(?:0x[0-9a-fA-F]+|\d+)\s*\)\s*;?/;
const rotationMatch = code.match(rotationPattern);
if (rotationMatch) {
  code = code.replace(rotationMatch[0], '');
  removedItems.push('Rotation IIFE');
  console.log('Removed rotation IIFE');
}

// Also try to match IIFE with different pattern (leading comma or paren)
const rotationPattern2 = /\(\(function\s*\(\s*\w+\s*,\s*\w+\s*\)\s*\{[\s\S]*?while\s*\(\s*!!\s*\[\s*\]\s*\)[\s\S]*?\.push\s*\([\s\S]*?\.shift\s*\(\s*\)[\s\S]*?\}\s*\)\s*\(\s*\w+\s*,\s*(?:0x[0-9a-fA-F]+|\d+)\s*\)\s*,/;
const rotationMatch2 = code.match(rotationPattern2);
if (rotationMatch2) {
  // Replace with just opening paren to maintain code structure
  code = code.replace(rotationMatch2[0], '(');
  removedItems.push('Rotation IIFE (variant)');
  console.log('Removed rotation IIFE (variant)');
}

// Pattern for rotation IIFE that starts at beginning of code and ends with comma before next function
// Matches: (function(D,Z){...while(!![]){...push(...shift())...}}}(wavvv1D,0x66018),
// Note: In minified code, the IIFE ends with }}}( not })( - three closing braces then direct invocation
// Supports both dot notation (.push/.shift) and bracket notation (['push']/['shift'])
const rotationPattern3 = /^\s*\(\s*function\s*\(\s*\w+\s*,\s*\w+\s*\)\s*\{[\s\S]*?while\s*\(\s*!!\s*\[\s*\]\s*\)[\s\S]*?(?:\.push|\['push'\])\s*\([\s\S]*?(?:\.shift|\['shift'\])\s*\(\s*\)[\s\S]*?\}\}\}\s*\(\s*\w+\s*,\s*(?:0x[0-9a-fA-F]+|\d+)\s*\)\s*,\s*/;
const rotationMatch3 = code.match(rotationPattern3);
if (rotationMatch3) {
  // Replace with opening paren to maintain (function(d,e){...})(args) structure
  // The rotation IIFE was part of: (rotationIIFE,mainIIFE)(args) -> we want (mainIIFE)(args)
  code = code.replace(rotationMatch3[0], '(');
  removedItems.push('Rotation IIFE (leading comma variant)');
  console.log('Removed rotation IIFE (leading comma variant)');
}

// ============================================================
// STEP 7: Remove decoder aliases
// ============================================================

for (const alias of aliases) {
  if (alias === decoderFuncName) continue; // Already removed the main function

  // Remove: const ALIAS = DECODER;
  const aliasPattern = new RegExp(`(?:const|let|var)\\s+${alias}\\s*=\\s*${decoderFuncName}\\s*[,;]\\s*`, 'g');
  const before = code.length;
  code = code.replace(aliasPattern, '');
  if (code.length < before) {
    removedItems.push(`Alias: ${alias}`);
    console.log(`Removed alias: ${alias}`);
  }
}

// ============================================================
// STEP 8: Clean up empty lines
// ============================================================

// Remove multiple consecutive blank lines
code = code.replace(/\n{3,}/g, '\n\n');

// Remove leading whitespace-only lines
code = code.replace(/^\s*\n/, '');

// ============================================================
// OUTPUT
// ============================================================

const bytesRemoved = originalLength - code.length;
const percentRemoved = ((bytesRemoved / originalLength) * 100).toFixed(1);

console.log(`\nSummary:`);
console.log(`  Removed ${removedItems.length} items`);
console.log(`  Size: ${originalLength} → ${code.length} bytes (${percentRemoved}% reduction)`);

if (outputFile) {
  fs.writeFileSync(outputFile, code);
  console.log(`\nOutput written to: ${outputFile}`);
}

// Output for pipeline parsing
console.log(`\nDead code removed: ${removedItems.length} items, ${bytesRemoved} bytes`);
