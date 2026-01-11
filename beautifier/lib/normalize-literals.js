#!/usr/bin/env node
/**
 * Literal Normalizer
 *
 * Converts obfuscated literals to readable form:
 * - !![] → true
 * - ![] → false
 * - 0x1f4 → 500 (hex to decimal)
 * - \x22 → " (hex escapes to chars)
 * - \x20 → space
 */

const fs = require('fs');

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile) {
  console.log('Usage: node normalize-literals.cjs <input.js> [output.js]');
  process.exit(1);
}

let code = fs.readFileSync(inputFile, 'utf8');
const originalLength = code.length;
let stats = {
  boolTrue: 0,
  boolFalse: 0,
  hexNumbers: 0,
  hexEscapes: 0,
};

// ============================================================
// STEP 1: Boolean normalization
// ============================================================

// !![] → true (empty array is truthy, double negation = true)
code = code.replace(/!!\s*\[\s*\]/g, () => {
  stats.boolTrue++;
  return 'true';
});

// ![] → false (negation of truthy = false)
code = code.replace(/!\s*\[\s*\]/g, () => {
  stats.boolFalse++;
  return 'false';
});

// !!'' or !!"" → false (empty string is falsy)
code = code.replace(/!!\s*['"]{2}/g, 'false');

// !'' or !"" → true (negation of falsy = true)
code = code.replace(/!\s*['"]{2}/g, 'true');

// !!0 → false
code = code.replace(/!!\s*0(?![0-9x])/g, 'false');

// !0 → true
code = code.replace(/!\s*0(?![0-9x])/g, 'true');

// !!1 → true
code = code.replace(/!!\s*1(?![0-9])/g, 'true');

// !1 → false
code = code.replace(/!\s*1(?![0-9])/g, 'false');

// ============================================================
// STEP 2: Hex number conversion (outside of strings)
// ============================================================

// Match hex numbers not inside strings
// We need to be careful not to convert hex inside string literals
function convertHexNumbers(code) {
  let result = '';
  let i = 0;
  let converted = 0;

  while (i < code.length) {
    // Check for string start
    if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
      const quote = code[i];
      result += code[i++];

      // Skip to end of string
      while (i < code.length) {
        if (code[i] === '\\' && i + 1 < code.length) {
          result += code[i++] + code[i++];
        } else if (code[i] === quote) {
          result += code[i++];
          break;
        } else {
          result += code[i++];
        }
      }
    }
    // Check for hex number
    else if (code[i] === '0' && (code[i + 1] === 'x' || code[i + 1] === 'X')) {
      let hexStr = '0x';
      let j = i + 2;
      while (j < code.length && /[0-9a-fA-F]/.test(code[j])) {
        hexStr += code[j++];
      }

      if (hexStr.length > 2) {
        const decimal = parseInt(hexStr, 16);
        result += decimal.toString();
        converted++;
        i = j;
      } else {
        result += code[i++];
      }
    }
    else {
      result += code[i++];
    }
  }

  stats.hexNumbers = converted;
  return result;
}

code = convertHexNumbers(code);

// ============================================================
// STEP 3: Hex escape sequences in strings
// ============================================================

// Convert \x20 style escapes to actual characters (inside strings)
function convertHexEscapes(code) {
  let result = '';
  let i = 0;
  let converted = 0;

  while (i < code.length) {
    // Check for string start
    if (code[i] === '"' || code[i] === "'") {
      const quote = code[i];
      result += code[i++];

      // Process string contents
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\' && code[i + 1] === 'x' && i + 3 < code.length) {
          const hex = code.substring(i + 2, i + 4);
          if (/^[0-9a-fA-F]{2}$/.test(hex)) {
            const charCode = parseInt(hex, 16);
            // Only convert printable ASCII (32-126) except quotes and backslash
            if (charCode >= 32 && charCode <= 126 && charCode !== quote.charCodeAt(0) && charCode !== 92) {
              result += String.fromCharCode(charCode);
              converted++;
              i += 4;
              continue;
            }
          }
        }

        if (code[i] === '\\' && i + 1 < code.length) {
          result += code[i++] + code[i++];
        } else {
          result += code[i++];
        }
      }

      if (i < code.length) {
        result += code[i++]; // closing quote
      }
    }
    else {
      result += code[i++];
    }
  }

  stats.hexEscapes = converted;
  return result;
}

code = convertHexEscapes(code);

// ============================================================
// STEP 4: Unicode escapes (\u0020 style)
// ============================================================

// Similar to hex escapes but \uXXXX format
code = code.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
  const charCode = parseInt(hex, 16);
  // Only convert printable ASCII
  if (charCode >= 32 && charCode <= 126) {
    return String.fromCharCode(charCode);
  }
  return match;
});

// ============================================================
// STEP 5: Clean up common patterns
// ============================================================

// void 0 → undefined
code = code.replace(/\bvoid\s+0\b/g, 'undefined');

// ============================================================
// OUTPUT
// ============================================================

const totalChanges = stats.boolTrue + stats.boolFalse + stats.hexNumbers + stats.hexEscapes;

console.log('Literal normalization:');
console.log(`  !![] → true: ${stats.boolTrue}`);
console.log(`  ![] → false: ${stats.boolFalse}`);
console.log(`  Hex numbers: ${stats.hexNumbers}`);
console.log(`  Hex escapes: ${stats.hexEscapes}`);
console.log(`  Total: ${totalChanges} conversions`);

if (outputFile) {
  fs.writeFileSync(outputFile, code);
  console.log(`\nOutput written to: ${outputFile}`);
} else {
  process.stdout.write(code);
}
