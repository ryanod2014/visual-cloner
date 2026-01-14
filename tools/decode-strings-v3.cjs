#!/usr/bin/env node
/**
 * String Array Decoder v3 - Proper Rotation Solver
 *
 * Parses the checksum expression from the obfuscated code and
 * brute-forces the rotation to find the correct array order.
 */

const fs = require('fs');

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile) {
  console.log('Usage: node decode-strings-v3.cjs <input.js> [output.js]');
  process.exit(1);
}

const code = fs.readFileSync(inputFile, 'utf8');

// ============================================================
// STEP 1: Extract decoder info
// ============================================================

const decoderMatch = code.match(/function\s+(\w+)\s*\(\s*(\w+)\s*,\s*\w*\s*\)\s*\{\s*\2\s*=\s*\2\s*-\s*(0x[0-9a-fA-F]+|\d+)/);
if (!decoderMatch) {
  console.error('Could not find decoder function');
  process.exit(1);
}

const decoderFuncName = decoderMatch[1];
const offset = decoderMatch[3].startsWith('0x') ? parseInt(decoderMatch[3], 16) : parseInt(decoderMatch[3]);
console.log(`Decoder: ${decoderFuncName}, Offset: 0x${offset.toString(16)}`);

// ============================================================
// STEP 2: Extract string array
// ============================================================

function extractStringArray(code) {
  // Find: const/var/let XX = ['...', '...']
  const match = code.match(/(?:const|var|let)\s+(\w+)\s*=\s*\[/);
  if (!match) return null;

  const start = match.index + match[0].length - 1;
  let bracket = 0, inStr = false, quote = null, i = start;

  while (i < code.length) {
    const c = code[i];
    if (!inStr) {
      if (c === '[') bracket++;
      else if (c === ']') { bracket--; if (bracket === 0) break; }
      else if (c === '"' || c === "'") { inStr = true; quote = c; }
    } else {
      if (c === '\\') i++;
      else if (c === quote) { inStr = false; quote = null; }
    }
    i++;
  }

  const rawContent = code.substring(start + 1, i);

  // Parse into array
  const strings = [];
  let current = '', parsing = false;
  quote = null;
  i = 0;

  while (i < rawContent.length) {
    const c = rawContent[i];
    if (!parsing) {
      if (c === '"' || c === "'") { parsing = true; quote = c; current = ''; }
    } else {
      if (c === '\\' && i + 1 < rawContent.length) {
        const next = rawContent[i + 1];
        if (next === 'x' && i + 3 < rawContent.length) {
          current += String.fromCharCode(parseInt(rawContent.substr(i + 2, 2), 16));
          i += 3;
        } else if (next === 'u' && i + 5 < rawContent.length) {
          current += String.fromCharCode(parseInt(rawContent.substr(i + 2, 4), 16));
          i += 5;
        } else if (next === 'n') { current += '\n'; i++; }
        else if (next === 'r') { current += '\r'; i++; }
        else if (next === 't') { current += '\t'; i++; }
        else if (next === '0') { current += '\0'; i++; }
        else { current += next; i++; }
      } else if (c === quote) {
        strings.push(current);
        parsing = false;
      } else {
        current += c;
      }
    }
    i++;
  }

  return strings;
}

let strings = extractStringArray(code);
if (!strings || strings.length === 0) {
  console.error('Could not extract string array');
  process.exit(1);
}
console.log(`Extracted ${strings.length} strings`);

// ============================================================
// STEP 2.5: Detect and decode base64 encoding
// ============================================================

// Check if the decoder uses base64 encoding
// Indicator: presence of the base64 alphabet in the decoder function
const hasBase64 = code.includes("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=");

if (hasBase64) {
  console.log('Detected base64-encoded string array');

  // javascript-obfuscator uses a custom base64 alphabet:
  // lowercase first, then uppercase (opposite of standard base64)
  const customAlphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';

  function decodeCustomBase64(str) {
    try {
      let result = '';
      let buffer = '';

      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const index = customAlphabet.indexOf(char);
        if (index === -1 || index === 64) continue; // Skip invalid or padding

        buffer += index.toString(2).padStart(6, '0');

        while (buffer.length >= 8) {
          const byte = parseInt(buffer.substring(0, 8), 2);
          buffer = buffer.substring(8);
          result += String.fromCharCode(byte);
        }
      }

      // Handle UTF-8 decoding via percent-encoding (same as obfuscator does)
      try {
        let percentEncoded = '';
        for (let i = 0; i < result.length; i++) {
          percentEncoded += '%' + ('00' + result.charCodeAt(i).toString(16)).slice(-2);
        }
        return decodeURIComponent(percentEncoded);
      } catch (e) {
        return result;
      }
    } catch (e) {
      return str; // Return original if decoding fails
    }
  }

  strings = strings.map(s => decodeCustomBase64(s));
  console.log(`Decoded ${strings.length} base64 strings`);

  // Show sample decoded strings
  console.log('Sample decoded:');
  strings.slice(0, 5).forEach((s, i) => console.log(`  [${i}]: "${s}"`));
}

// ============================================================
// STEP 3: Parse checksum expression
// ============================================================

// Find the rotation IIFE and extract the checksum calculation
// Pattern: while(!![]){try{const d=EXPR;if(d===Z)break;...}}(arrayFunc,TARGET)

const rotationMatch = code.match(/while\s*\(\s*!!\s*\[\s*\]\s*\)\s*\{\s*try\s*\{\s*(?:const|var|let)\s+\w+\s*=\s*([^;]+);/);
const targetMatch = code.match(/\}\}\s*\(\s*\w+\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*\)/);

if (!rotationMatch || !targetMatch) {
  console.error('Could not find rotation expression');
  process.exit(1);
}

const checksumExpr = rotationMatch[1];
const targetChecksum = targetMatch[1].startsWith('0x') ? parseInt(targetMatch[1], 16) : parseInt(targetMatch[1]);
console.log(`Target checksum: ${targetChecksum} (0x${targetChecksum.toString(16)})`);
console.log(`Checksum expression: ${checksumExpr.substring(0, 100)}...`);

// Parse the checksum expression to extract terms
// Pattern: [-]parseInt(ALIAS(0xNNN))/0xMMM [*(...)]
// We need: sign, index, divisor, and optional multiplier

function parseChecksumExpression(expr, offset) {
  const terms = [];

  // Match patterns like: -parseInt(ZW(0x355))/0x1 or parseInt(ZW(0x494))/0x2*(parseInt(...)/0x3)
  // Simplified: find all parseInt(ALIAS(IDX))/DIV patterns and their signs

  const pattern = /(-?)parseInt\s*\(\s*\w+\s*\(\s*(0x[0-9a-fA-F]+|\d+)\s*\)\s*\)\s*\/\s*(0x[0-9a-fA-F]+|\d+)/g;
  let match;
  let lastEnd = 0;

  while ((match = pattern.exec(expr)) !== null) {
    const sign = match[1] === '-' ? -1 : 1;
    const idx = match[2].startsWith('0x') ? parseInt(match[2], 16) : parseInt(match[2]);
    const div = match[3].startsWith('0x') ? parseInt(match[3], 16) : parseInt(match[3]);

    // Check if this term is multiplied by another term
    // Look for * after this match
    const afterMatch = expr.substring(match.index + match[0].length);
    let multiplier = null;

    if (afterMatch.startsWith('*')) {
      // This term is multiplied by something
      // For simplicity, we'll handle multiplication pairs
      multiplier = true;
    }

    // Check if there's a - before this match (not captured by our sign)
    const beforeMatch = expr.substring(lastEnd, match.index);
    let actualSign = sign;
    if (beforeMatch.includes('+-') || beforeMatch.trimEnd().endsWith('-')) {
      actualSign = -sign;
    }

    terms.push({ idx: idx - offset, div, sign: actualSign, multiplier });
    lastEnd = match.index + match[0].length;
  }

  return terms;
}

const terms = parseChecksumExpression(checksumExpr, offset);
console.log(`Parsed ${terms.length} checksum terms`);

// ============================================================
// STEP 4: Brute force rotation
// ============================================================

function computeChecksum(arr, terms) {
  // Simplified checksum: sum of parseInt(arr[idx])/div * sign
  // The actual expression is more complex with multiplications
  // but we can iterate to find which rotation works

  let sum = 0;
  for (let i = 0; i < terms.length; i++) {
    const { idx, div, sign } = terms[i];
    if (idx < 0 || idx >= arr.length) return NaN;

    const val = parseInt(arr[idx]);
    if (isNaN(val)) return NaN;

    sum += sign * (val / div);
  }
  return sum;
}

// The actual checksum calculation from the code is more complex
// Let's parse it more carefully
function computeActualChecksum(arr, expr, offset) {
  // Replace all decoder calls with actual string values
  let evalExpr = expr;

  // Find all ALIAS(0xNNN) patterns and replace with the array value
  const callPattern = /\w+\s*\(\s*(0x[0-9a-fA-F]+|\d+)\s*\)/g;
  evalExpr = evalExpr.replace(callPattern, (match, idxStr) => {
    const idx = idxStr.startsWith('0x') ? parseInt(idxStr, 16) : parseInt(idxStr);
    const actualIdx = idx - offset;
    if (actualIdx >= 0 && actualIdx < arr.length) {
      const str = arr[actualIdx];
      // Return as a string literal for parseInt to parse
      return `'${str.replace(/'/g, "\\'")}'`;
    }
    return match;
  });

  try {
    return eval(evalExpr);
  } catch (e) {
    return NaN;
  }
}

console.log('Brute forcing rotation...');

let foundRotation = -1;
for (let rot = 0; rot < strings.length; rot++) {
  // Rotate array
  const rotated = strings.slice(rot).concat(strings.slice(0, rot));

  // Compute checksum
  const checksum = computeActualChecksum(rotated, checksumExpr, offset);

  if (!isNaN(checksum) && Math.abs(checksum - targetChecksum) < 0.001) {
    console.log(`✅ Found rotation: ${rot} (checksum: ${checksum})`);
    foundRotation = rot;
    break;
  }

  // Progress every 100 iterations
  if (rot % 100 === 0) {
    process.stdout.write(`  Testing rotation ${rot}/${strings.length}...\r`);
  }
}

if (foundRotation === -1) {
  console.log('\n⚠️ Could not find correct rotation, using rotation 0');
  foundRotation = 0;
}

// Apply rotation
const finalArray = strings.slice(foundRotation).concat(strings.slice(0, foundRotation));

// Verify with known patterns
console.log('\nVerifying rotation...');
const knownTests = [
  { idx: 0x485, expected: 'POST' },
  { idx: 0x507, expected: 'GET' },
  { idx: 0x31e, expected: 'https' },
];

for (const { idx, expected } of knownTests) {
  const actual = finalArray[idx - offset];
  const match = actual === expected ? '✅' : '❌';
  console.log(`  ${match} 0x${idx.toString(16)}: "${actual}" (expected: "${expected}")`);
}

// ============================================================
// STEP 5: Find aliases and replace calls (with chain resolution)
// ============================================================

const aliases = new Set([decoderFuncName]);

// Find ALL variable assignments: const X = Y
const allAssignments = new Map();
const assignPattern = /(?:const|let|var)\s+(\w+)\s*=\s*(\w+)(?:[,;\s]|$)/g;
let m;
while ((m = assignPattern.exec(code)) !== null) {
  allAssignments.set(m[1], m[2]);
}

// Resolve chains: if X = Y and Y is an alias, then X is also an alias
let changed = true;
let iterations = 0;
while (changed && iterations < 100) {
  changed = false;
  iterations++;
  for (const [varName, assignedTo] of allAssignments) {
    if (!aliases.has(varName) && aliases.has(assignedTo)) {
      aliases.add(varName);
      changed = true;
    }
  }
}

console.log(`\nFound ${aliases.size} decoder aliases (${iterations} iterations)`);

function decode(idx) {
  const actualIdx = idx - offset;
  if (actualIdx >= 0 && actualIdx < finalArray.length) {
    return finalArray[actualIdx];
  }
  return null;
}

let decoded = code;
let replaced = 0;

for (const alias of aliases) {
  // Escape special regex chars in alias name
  const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const callPattern = new RegExp(`\\b${escapedAlias}\\s*\\(\\s*(0x[0-9a-fA-F]+|\\d+)\\s*\\)`, 'g');
  decoded = decoded.replace(callPattern, (match, idxStr) => {
    const idx = idxStr.startsWith('0x') ? parseInt(idxStr, 16) : parseInt(idxStr);
    const str = decode(idx);
    if (str !== null) {
      replaced++;
      const escaped = str
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
      return `'${escaped}'`;
    }
    return match;
  });
}

console.log(`Replaced ${replaced} decoder calls`);

// ============================================================
// STEP 6: Output
// ============================================================

if (outputFile) {
  fs.writeFileSync(outputFile, decoded);
  console.log(`\nOutput written to: ${outputFile}`);
}

// Show sample
console.log('\nSample decoded strings:');
[0x174, 0x175, 0x200, 0x300, 0x400, 0x485, 0x507, 0x31e].forEach(idx => {
  const str = decode(idx);
  console.log(`  0x${idx.toString(16)}: "${str}"`);
});
