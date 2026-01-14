#!/usr/bin/env node
/**
 * String Concatenation Simplifier
 *
 * Joins adjacent string literals: "foo" + "bar" → "foobar"
 */

const fs = require('fs');

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile) {
  console.log('Usage: node simplify-strings.cjs <input.js> [output.js]');
  process.exit(1);
}

let code = fs.readFileSync(inputFile, 'utf8');
const originalLength = code.length;

// Count concatenations before
const beforeCount = (code.match(/["']\s*\+\s*["']/g) || []).length;

/**
 * Convert hex escapes to readable chars within strings
 */
function simplifyHexEscapes(code) {
  return code.replace(/(['"])([^'"]*)\1/g, (match, quote, content) => {
    const simplified = content.replace(/\\x([0-9a-fA-F]{2})/g, (esc, hex) => {
      const charCode = parseInt(hex, 16);
      if (charCode >= 32 && charCode <= 126) {
        const char = String.fromCharCode(charCode);
        if (char === "'" && quote === "'") return "\\'";
        if (char === '"' && quote === '"') return '\\"';
        if (char === '\\') return '\\\\';
        return char;
      }
      return esc;
    });
    return quote + simplified + quote;
  });
}

/**
 * Join adjacent string literals using global replace
 */
function simplifyStringConcat(code) {
  let result = code;
  let prevLength;
  let iterations = 0;

  // Keep replacing until no more changes
  do {
    prevLength = result.length;
    iterations++;

    // Global replace: 'a' + 'b' → 'ab' (same quote type)
    result = result.replace(/('([^'\\]|\\.)*')\s*\+\s*'(([^'\\]|\\.)*)'/g, (m, first, _, second) => {
      // Remove closing quote from first, opening quote from second
      return first.slice(0, -1) + second + "'";
    });

    // Global replace: "a" + "b" → "ab" (double quotes)
    result = result.replace(/("([^"\\]|\\.)*")\s*\+\s*"(([^"\\]|\\.)*)"/g, (m, first, _, second) => {
      return first.slice(0, -1) + second + '"';
    });

  } while (result.length !== prevLength && iterations < 100);

  console.log(`  Iterations: ${iterations}`);
  return result;
}

console.log('Simplifying hex escapes...');
code = simplifyHexEscapes(code);

console.log('Simplifying string concatenations...');
code = simplifyStringConcat(code);

// Count concatenations after
const afterCount = (code.match(/["']\s*\+\s*["']/g) || []).length;

console.log(`String concatenations: ${beforeCount} → ${afterCount} (${beforeCount - afterCount} simplified)`);
console.log(`Code size: ${originalLength} → ${code.length} bytes`);

if (outputFile) {
  fs.writeFileSync(outputFile, code);
  console.log(`Output written to: ${outputFile}`);
}

// Show sample of URLs
console.log('\nSample URLs found:');
const urls = code.match(/'https?:\/\/[^']+'/g) || [];
urls.slice(0, 5).forEach(u => console.log('  ' + u));
