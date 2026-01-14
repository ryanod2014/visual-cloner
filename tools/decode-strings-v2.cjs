#!/usr/bin/env node
/**
 * String Array Decoder v2 - Brute force rotation
 *
 * Extracts the string array and tries different rotations
 * until known patterns match.
 */

const fs = require('fs');

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile) {
  console.log('Usage: node decode-strings-v2.cjs <input.js> [output.js]');
  process.exit(1);
}

const code = fs.readFileSync(inputFile, 'utf8');

// Find array function and decoder
const arrayFuncMatch = code.match(/function\s+(\w+)\s*\(\s*\)\s*\{\s*(?:const|var|let)\s+(\w+)\s*=\s*\[/);
const decoderFuncMatch = code.match(/function\s+(\w+)\s*\(\s*(\w+)\s*,\s*\w*\s*\)\s*\{\s*\2\s*=\s*\2\s*-\s*(0x[0-9a-fA-F]+|\d+)/);

if (!arrayFuncMatch || !decoderFuncMatch) {
  console.log('Could not find string array obfuscation pattern');
  process.exit(1);
}

const arrayFuncName = arrayFuncMatch[1];
const decoderFuncName = decoderFuncMatch[1];
const offset = decoderFuncMatch[3].startsWith('0x')
  ? parseInt(decoderFuncMatch[3], 16)
  : parseInt(decoderFuncMatch[3]);

console.log(`Decoder: ${decoderFuncName}, Offset: 0x${offset.toString(16)}`);

// Extract the raw string array content
function extractArray(code, funcName) {
  const startMatch = code.match(new RegExp(`function\\s+${funcName}\\s*\\(\\s*\\)\\s*\\{\\s*(?:const|var|let)\\s+\\w+\\s*=\\s*\\[`));
  if (!startMatch) return null;

  const start = startMatch.index + startMatch[0].length - 1;
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

  return code.substring(start + 1, i);
}

// Parse string array
function parseArray(raw) {
  const strings = [];
  let current = '', inStr = false, quote = null, i = 0;

  while (i < raw.length) {
    const c = raw[i];
    if (!inStr) {
      if (c === '"' || c === "'") { inStr = true; quote = c; current = ''; }
    } else {
      if (c === '\\' && i + 1 < raw.length) {
        const next = raw[i + 1];
        if (next === 'x' && i + 3 < raw.length) {
          current += String.fromCharCode(parseInt(raw.substr(i + 2, 2), 16));
          i += 3;
        } else if (next === 'n') { current += '\n'; i++; }
        else if (next === 'r') { current += '\r'; i++; }
        else if (next === 't') { current += '\t'; i++; }
        else if (next === '0') { current += '\0'; i++; }
        else { current += next; i++; }
      } else if (c === quote) {
        strings.push(current);
        inStr = false; quote = null;
      } else {
        current += c;
      }
    }
    i++;
  }
  return strings;
}

const rawArray = extractArray(code, arrayFuncName);
if (!rawArray) {
  console.log('Could not extract string array');
  process.exit(1);
}

const strings = parseArray(rawArray);
console.log(`Extracted ${strings.length} strings`);

// Find known patterns to verify rotation
// Look for decoder calls followed by known strings
const knownPatterns = [
  { pattern: /['"]https['"]/, expectedStr: 'https' },
  { pattern: /['"]POST['"]/, expectedStr: 'POST' },
  { pattern: /['"]GET['"]/, expectedStr: 'GET' },
  { pattern: /['"]json['"]/, expectedStr: 'json' },
  { pattern: /['"]error['"]/, expectedStr: 'error' },
  { pattern: /['"]click['"]/, expectedStr: 'click' },
];

// Find decoder calls and their context
const aliases = [decoderFuncName];
const aliasPattern = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*${decoderFuncName}`, 'g');
let m;
while ((m = aliasPattern.exec(code)) !== null) {
  if (!aliases.includes(m[1])) aliases.push(m[1]);
}

// Extract decoder calls with their indices
const calls = [];
for (const alias of aliases) {
  const callPattern = new RegExp(`${alias}\\s*\\(\\s*(0x[0-9a-fA-F]+|\\d+)\\s*\\)`, 'g');
  while ((m = callPattern.exec(code)) !== null) {
    const idx = m[1].startsWith('0x') ? parseInt(m[1], 16) : parseInt(m[1]);
    calls.push({ pos: m.index, idx, match: m[0] });
  }
}

console.log(`Found ${calls.length} decoder calls, ${aliases.length} aliases`);

// Try to find correct rotation by looking for known strings
function tryRotation(arr, rot) {
  const rotated = arr.slice(rot).concat(arr.slice(0, rot));
  let score = 0;

  // Check if known string indices return expected values
  for (const { expectedStr } of knownPatterns) {
    const foundIdx = rotated.indexOf(expectedStr);
    if (foundIdx >= 0) score++;
  }

  return { rotated, score };
}

// Try all rotations
console.log('Testing rotations...');
let bestRotation = 0;
let bestScore = 0;
let bestArray = strings;

for (let rot = 0; rot < strings.length; rot++) {
  const { rotated, score } = tryRotation(strings, rot);
  if (score > bestScore) {
    bestScore = score;
    bestRotation = rot;
    bestArray = rotated;
  }
}

console.log(`Best rotation: ${bestRotation} (score: ${bestScore})`);

// Alternative: Use checksum from IIFE
const checksumMatch = code.match(/\}\}\s*\(\s*wavvv1D\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*\)/);
if (checksumMatch) {
  const targetChecksum = checksumMatch[1].startsWith('0x')
    ? parseInt(checksumMatch[1], 16)
    : parseInt(checksumMatch[1]);
  console.log(`Target checksum: 0x${targetChecksum.toString(16)}`);

  // The rotation code uses parseInt on strings at specific indices
  // Extract which indices: parseInt(ZW(0x355))/0x1 ...
  const checksumPattern = /parseInt\s*\(\s*\w+\s*\(\s*(0x[0-9a-fA-F]+|\d+)\s*\)\s*\)\s*\/\s*(0x[0-9a-fA-F]+|\d+)/g;
  const checksumIndices = [];
  while ((m = checksumPattern.exec(code)) !== null) {
    const idx = m[1].startsWith('0x') ? parseInt(m[1], 16) : parseInt(m[1]);
    const div = m[2].startsWith('0x') ? parseInt(m[2], 16) : parseInt(m[2]);
    checksumIndices.push({ idx, div });
  }
  console.log(`Checksum uses ${checksumIndices.length} indices`);

  // Try to find rotation that makes checksum work
  for (let rot = 0; rot < strings.length; rot++) {
    const rotated = strings.slice(rot).concat(strings.slice(0, rot));
    let sum = 0;
    let valid = true;

    for (let i = 0; i < checksumIndices.length; i++) {
      const { idx, div } = checksumIndices[i];
      const actualIdx = idx - offset;
      if (actualIdx < 0 || actualIdx >= rotated.length) { valid = false; break; }

      const str = rotated[actualIdx];
      const num = parseInt(str);
      if (isNaN(num)) { valid = false; break; }

      // The pattern alternates: sometimes multiply, sometimes divide
      // Need to match exact expression from code
      sum += num / div;
    }

    if (valid && Math.abs(sum - targetChecksum) < 1000) {
      console.log(`Rotation ${rot} gives checksum close to target: ${sum}`);
    }
  }
}

// Decode with best rotation found
function decode(idx) {
  const actualIdx = idx - offset;
  if (actualIdx >= 0 && actualIdx < bestArray.length) {
    return bestArray[actualIdx];
  }
  return null;
}

// Replace all decoder calls
let decoded = code;
let replaced = 0;

for (const alias of aliases) {
  const callPattern = new RegExp(`${alias}\\s*\\(\\s*(0x[0-9a-fA-F]+|\\d+)\\s*\\)`, 'g');
  decoded = decoded.replace(callPattern, (match, idxStr) => {
    const idx = idxStr.startsWith('0x') ? parseInt(idxStr, 16) : parseInt(idxStr);
    const str = decode(idx);
    if (str !== null) {
      replaced++;
      const escaped = str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
      return `'${escaped}'`;
    }
    return match;
  });
}

console.log(`Replaced ${replaced} calls`);

if (outputFile) {
  fs.writeFileSync(outputFile, decoded);
  console.log(`Output: ${outputFile}`);
}

// Show sample decoded strings
console.log('\nSample decoded strings:');
const sampleIndices = [0x174, 0x175, 0x200, 0x300, 0x400, 0x485, 0x507];
for (const idx of sampleIndices) {
  const str = decode(idx);
  console.log(`  0x${idx.toString(16)}: "${str}"`);
}
