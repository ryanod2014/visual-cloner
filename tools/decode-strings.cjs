#!/usr/bin/env node
/**
 * String Array Decoder for JavaScript obfuscation
 *
 * Uses Node.js VM to safely execute the string array initialization
 * and rotation, then replaces all decoder calls with actual strings.
 */

const fs = require('fs');
const vm = require('vm');

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile) {
  console.log('Usage: node decode-strings.js <input.js> [output.js]');
  process.exit(1);
}

const code = fs.readFileSync(inputFile, 'utf8');

// Find the string array function and decoder function
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

console.log(`Array function: ${arrayFuncName}`);
console.log(`Decoder function: ${decoderFuncName}`);
console.log(`Offset: ${offset} (0x${offset.toString(16)})`);

// Find the end of the rotation IIFE to extract initialization code
// Pattern: ...}}(arrayFuncName, checksum)...
const rotationEndPattern = new RegExp(`\\}\\}\\s*\\(\\s*${arrayFuncName}\\s*,\\s*(0x[0-9a-fA-F]+|\\d+)\\s*\\)`);
const rotationMatch = code.match(rotationEndPattern);

let initCode;
if (rotationMatch) {
  // Extract from start to end of rotation IIFE
  const endPos = code.indexOf(rotationMatch[0]) + rotationMatch[0].length;
  initCode = code.substring(0, endPos);
  console.log(`Found rotation IIFE, checksum: ${rotationMatch[1]}`);
} else {
  // Just extract the array function
  const funcStart = code.indexOf(`function ${arrayFuncName}`);
  // Find matching brace
  let braceCount = 0;
  let i = funcStart;
  let started = false;
  while (i < code.length) {
    if (code[i] === '{') { braceCount++; started = true; }
    if (code[i] === '}') { braceCount--; }
    if (started && braceCount === 0) break;
    i++;
  }
  initCode = code.substring(funcStart, i + 1);
}

// Execute the initialization code in a VM context
const context = { parseInt, console: { log: () => {} } };
vm.createContext(context);

try {
  vm.runInContext(initCode, context, { timeout: 5000 });

  // Get the string array
  const getArray = vm.runInContext(`${arrayFuncName}()`, context);
  console.log(`String array has ${getArray.length} strings`);
  console.log(`Sample: [0]="${getArray[0]}", [1]="${getArray[1]}", [2]="${getArray[2]}"`);

  // Create the decoder function
  const decode = (idx) => {
    const actualIdx = idx - offset;
    if (actualIdx >= 0 && actualIdx < getArray.length) {
      return getArray[actualIdx];
    }
    return null;
  };

  // Find all aliases: const XX = decoderFuncName
  const aliases = [decoderFuncName];
  const aliasPattern = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*${decoderFuncName}(?:\\s*[,;]|\\s*$)`, 'g');
  let aliasMatch;
  while ((aliasMatch = aliasPattern.exec(code)) !== null) {
    if (!aliases.includes(aliasMatch[1])) {
      aliases.push(aliasMatch[1]);
    }
  }
  console.log(`Found ${aliases.length} decoder aliases: ${aliases.slice(0, 10).join(', ')}${aliases.length > 10 ? '...' : ''}`);

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
        // Escape for JS string
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

  if (outputFile) {
    fs.writeFileSync(outputFile, decoded);
    console.log(`Output written to: ${outputFile}`);
  } else {
    // Print first 1000 chars of decoded
    console.log('\n--- Decoded preview (first 1000 chars) ---');
    console.log(decoded.substring(0, 1000));
  }

} catch (err) {
  console.error('Error executing initialization code:', err.message);
  process.exit(1);
}
