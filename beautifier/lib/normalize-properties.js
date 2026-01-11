#!/usr/bin/env node
/**
 * normalize-properties.cjs
 * Converts bracket notation to dot notation where valid.
 *
 * Usage: node normalize-properties.cjs input.js [output.js]
 *
 * Converts:
 *   obj['property'] -> obj.property
 *   obj["property"] -> obj.property
 *
 * Does NOT convert:
 *   obj['123'] (starts with number)
 *   obj['foo-bar'] (contains invalid characters)
 *   arr[0] (numeric index)
 *   obj[variable] (dynamic access)
 */

const fs = require('fs');
const path = require('path');

// JavaScript reserved words - these are actually fine in property access
// but we'll keep a list for reference. In modern JS, reserved words
// are valid as property names with dot notation.
const RESERVED_WORDS = new Set([
  'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'finally', 'for', 'function', 'if', 'in', 'instanceof',
  'new', 'return', 'switch', 'this', 'throw', 'try', 'typeof', 'var',
  'void', 'while', 'with', 'class', 'const', 'enum', 'export', 'extends',
  'import', 'super', 'implements', 'interface', 'let', 'package', 'private',
  'protected', 'public', 'static', 'yield', 'null', 'true', 'false'
]);

/**
 * Check if a property name is a valid JavaScript identifier
 * Valid identifiers: start with letter, underscore, or $
 * followed by letters, numbers, underscores, or $
 */
function isValidIdentifier(name) {
  if (!name || name.length === 0) return false;

  // Must start with letter, underscore, or $
  if (!/^[a-zA-Z_$]/.test(name)) return false;

  // Rest must be letters, numbers, underscore, or $
  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) return false;

  // Note: Reserved words are actually valid in property access
  // obj.class, obj.function, etc. are all valid in modern JS
  // So we don't exclude them

  return true;
}

/**
 * Convert bracket notation to dot notation in JavaScript code
 */
function normalizeBracketNotation(code) {
  let result = code;
  let conversionCount = 0;

  // Match patterns like ['property'] or ["property"]
  // This regex captures:
  // - Optional preceding character (to ensure we're after valid JS context)
  // - The bracket notation with single or double quotes
  const bracketPattern = /\[(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\1\]/g;

  result = code.replace(bracketPattern, (match, quote, propertyName) => {
    // Unescape the property name (handle escaped quotes)
    const unescapedName = propertyName
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');

    // Check if it's a valid identifier
    if (isValidIdentifier(unescapedName)) {
      conversionCount++;
      return '.' + unescapedName;
    }

    // Keep original if not convertible
    return match;
  });

  return { result, conversionCount };
}

/**
 * Process the file
 */
function processFile(inputPath, outputPath) {
  // Read input file
  let code;
  try {
    code = fs.readFileSync(inputPath, 'utf8');
  } catch (err) {
    console.error(`Error reading file: ${inputPath}`);
    console.error(err.message);
    process.exit(1);
  }

  // Count original bracket notations
  const originalBracketCount = (code.match(/\[['"][^'"]+['"]\]/g) || []).length;
  console.log(`Original bracket notations: ${originalBracketCount}`);

  // Perform conversion
  const { result, conversionCount } = normalizeBracketNotation(code);

  // Count remaining bracket notations
  const remainingBracketCount = (result.match(/\[['"][^'"]+['"]\]/g) || []).length;

  // Write output
  const finalOutputPath = outputPath || inputPath;
  try {
    fs.writeFileSync(finalOutputPath, result, 'utf8');
  } catch (err) {
    console.error(`Error writing file: ${finalOutputPath}`);
    console.error(err.message);
    process.exit(1);
  }

  // Print summary
  console.log(`Conversions made: ${conversionCount}`);
  console.log(`Remaining bracket notations: ${remainingBracketCount}`);
  console.log(`Output written to: ${finalOutputPath}`);

  return { conversionCount, originalBracketCount, remainingBracketCount };
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: node normalize-properties.cjs input.js [output.js]');
    console.log('');
    console.log('Converts bracket notation to dot notation where valid:');
    console.log("  obj['property'] -> obj.property");
    console.log('  obj["property"] -> obj.property');
    console.log('');
    console.log('Does NOT convert:');
    console.log("  obj['123'] (starts with number)");
    console.log("  obj['foo-bar'] (invalid characters)");
    console.log('  arr[0] (numeric index)');
    console.log('  obj[variable] (dynamic access)');
    process.exit(1);
  }

  const inputPath = path.resolve(args[0]);
  const outputPath = args[1] ? path.resolve(args[1]) : null;

  processFile(inputPath, outputPath);
}

module.exports = { normalizeBracketNotation, isValidIdentifier };
