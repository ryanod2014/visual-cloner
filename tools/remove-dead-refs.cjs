#!/usr/bin/env node
/**
 * remove-dead-refs.cjs
 *
 * Removes dead/unused variable references from JavaScript code.
 * After deobfuscation, code often has leftover decoder references like:
 *
 *   const Za = ZX;  // Za is never used - dead code
 *   const Zb = ZX;  // Zb is never used - dead code
 *
 * These should be removed to clean up the code.
 *
 * Usage: node remove-dead-refs.cjs input.js [output.js]
 *
 * Features:
 *   - Finds all const/let/var declarations
 *   - Checks if the variable is ever used after assignment
 *   - Removes unused variables where the right side has no side effects
 *   - Handles comma-separated declarations
 *   - Safe: only removes if RHS is a simple identifier (no function calls)
 */

const fs = require('fs');
const path = require('path');

/**
 * Check if an expression has potential side effects
 * Safe to remove: identifiers, literals, simple property access
 * Not safe: function calls, new expressions, assignments, etc.
 */
function hasSideEffects(expr) {
  const trimmed = expr.trim();

  // Simple identifier (e.g., "ZX", "foo", "_bar")
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed)) {
    return false;
  }

  // Simple property access (e.g., "obj.prop", "a.b.c")
  if (/^[a-zA-Z_$][a-zA-Z0-9_$.]*$/.test(trimmed)) {
    return false;
  }

  // Numeric literal
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return false;
  }

  // String literal
  if (/^(['"`]).*\1$/.test(trimmed)) {
    return false;
  }

  // Boolean/null/undefined literals
  if (/^(true|false|null|undefined)$/.test(trimmed)) {
    return false;
  }

  // Function calls, new expressions, etc. have side effects
  if (/\(/.test(trimmed)) {
    return true;
  }

  // Assignment operators
  if (/[+\-*/%&|^]?=/.test(trimmed)) {
    return true;
  }

  // Increment/decrement
  if (/\+\+|--/.test(trimmed)) {
    return true;
  }

  // await/yield
  if (/^(await|yield)\s/.test(trimmed)) {
    return true;
  }

  // Default to unsafe
  return true;
}

/**
 * Find all variable declarations in the code
 * Returns array of { name, fullMatch, start, end, rhs, declType, isSingleDecl }
 */
function findDeclarations(code) {
  const declarations = [];

  // Match const/let/var declarations
  // This regex finds the start of declarations
  const declRegex = /\b(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*/g;

  let match;
  while ((match = declRegex.exec(code)) !== null) {
    const declType = match[1];
    const varName = match[2];
    const declStart = match.index;
    const rhsStart = declStart + match[0].length;

    // Find the end of the RHS - this is tricky due to nested structures
    // We need to find the next , or ; that's not inside brackets/parens/braces
    let i = rhsStart;
    let depth = { paren: 0, bracket: 0, brace: 0 };
    let inString = false;
    let stringChar = null;

    while (i < code.length) {
      const c = code[i];
      const prev = i > 0 ? code[i - 1] : '';

      if (inString) {
        if (c === stringChar && prev !== '\\') {
          inString = false;
          stringChar = null;
        }
      } else {
        if (c === '"' || c === "'" || c === '`') {
          inString = true;
          stringChar = c;
        } else if (c === '(') depth.paren++;
        else if (c === ')') depth.paren--;
        else if (c === '[') depth.bracket++;
        else if (c === ']') depth.bracket--;
        else if (c === '{') depth.brace++;
        else if (c === '}') depth.brace--;
        else if ((c === ',' || c === ';') && depth.paren === 0 && depth.bracket === 0 && depth.brace === 0) {
          break;
        }
      }
      i++;
    }

    const rhs = code.substring(rhsStart, i).trim();
    const terminator = code[i]; // ',' or ';'

    // Determine if this is a single declaration or part of a comma-separated list
    // Look backwards to see if there's a preceding variable in the same declaration
    const beforeDecl = code.substring(0, declStart).trim();
    const isContinuation = beforeDecl.endsWith(',');

    // Look forward to see if there's another variable after
    const afterRhs = code.substring(i).trim();
    const hasMore = terminator === ',';

    declarations.push({
      name: varName,
      declType,
      rhs,
      start: declStart,
      rhsEnd: i,
      terminator,
      isContinuation,
      hasMore,
      fullMatch: match[0]
    });
  }

  return declarations;
}

/**
 * Check if a variable name is used in the code after its declaration
 * @param {string} code - The full code
 * @param {string} varName - The variable name to check
 * @param {number} afterPos - Position after which to search
 * @returns {boolean} - True if the variable is used
 */
function isVariableUsed(code, varName, afterPos) {
  // Create a regex that matches the variable name as a word boundary
  // but not as the LHS of an assignment at declaration
  const useRegex = new RegExp(`\\b${escapeRegex(varName)}\\b`, 'g');

  const searchArea = code.substring(afterPos);
  let match;

  while ((match = useRegex.exec(searchArea)) !== null) {
    const pos = match.index;
    const before = searchArea.substring(Math.max(0, pos - 30), pos);
    const after = searchArea.substring(pos + varName.length, pos + varName.length + 10);

    // Skip if this looks like another declaration of the same name
    if (/\b(const|let|var)\s*$/.test(before)) {
      continue;
    }

    // Skip if this is the variable being declared (in case of hoisting)
    if (/^\s*=\s*[^=]/.test(after) && /[,;{(]\s*$/.test(before)) {
      continue;
    }

    // Found a use!
    return true;
  }

  return false;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove dead references from the code
 */
function removeDeadRefs(code) {
  const declarations = findDeclarations(code);
  const deadRefs = [];

  // Check each declaration
  for (const decl of declarations) {
    // Check if the variable is used anywhere after its declaration
    const isUsed = isVariableUsed(code, decl.name, decl.rhsEnd);

    if (!isUsed) {
      // Check if the RHS has side effects
      const sideEffects = hasSideEffects(decl.rhs);

      if (!sideEffects) {
        deadRefs.push({
          ...decl,
          reason: 'never used'
        });
      } else {
        // Has side effects - can't safely remove
        // console.log(`  Skipping ${decl.name} - RHS may have side effects: ${decl.rhs.substring(0, 50)}`);
      }
    }
  }

  // Sort dead refs by position (descending) so we can remove from end to start
  deadRefs.sort((a, b) => b.start - a.start);

  // Track what we removed for stats
  const removed = [];

  // Remove dead references
  let result = code;
  for (const dead of deadRefs) {
    // Recalculate positions since we may have modified the string
    // Use the variable pattern to find the current position
    const pattern = new RegExp(
      `(const|let|var)\\s+${escapeRegex(dead.name)}\\s*=\\s*${escapeRegex(dead.rhs)}\\s*[,;]`,
      'g'
    );

    // Try to match this specific declaration
    const match = pattern.exec(result);
    if (match) {
      const start = match.index;
      const end = start + match[0].length;
      const terminator = match[0].slice(-1);

      // If it ends with comma, we're in a multi-declaration
      // If it ends with semicolon, it's standalone or last in chain

      // Look before to see if this is a continuation
      const before = result.substring(Math.max(0, start - 5), start);
      const isContinuation = /,\s*$/.test(before);

      if (isContinuation) {
        // Remove ", varName = rhs" or ", varName = rhs;"
        // But we need to be careful - find the comma before us
        let commaPos = start - 1;
        while (commaPos >= 0 && result[commaPos] !== ',') commaPos--;

        if (commaPos >= 0) {
          result = result.substring(0, commaPos) + (terminator === ';' ? ';' : ',') + result.substring(end);
          removed.push({ name: dead.name, rhs: dead.rhs });
        }
      } else if (terminator === ',') {
        // First in a chain, remove "const varName = rhs, " and keep the rest
        // The next var needs to get the const/let/var keyword
        const afterComma = result.substring(end);
        const nextVarMatch = afterComma.match(/^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/);
        if (nextVarMatch) {
          result = result.substring(0, start) + dead.declType + ' ' + afterComma.trimStart();
          removed.push({ name: dead.name, rhs: dead.rhs });
        }
      } else {
        // Standalone declaration - remove the whole thing
        // Also remove the newline after if present
        let removeEnd = end;
        while (removeEnd < result.length && (result[removeEnd] === ' ' || result[removeEnd] === '\n' || result[removeEnd] === '\r')) {
          if (result[removeEnd] === '\n') {
            removeEnd++;
            break;
          }
          removeEnd++;
        }
        result = result.substring(0, start) + result.substring(removeEnd);
        removed.push({ name: dead.name, rhs: dead.rhs });
      }
    }
  }

  return { result, removed };
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

  const originalSize = code.length;
  console.log(`Input file: ${inputPath}`);
  console.log(`Original size: ${originalSize} bytes`);

  // Process the code - run multiple passes until no more changes
  let totalRemoved = [];
  let pass = 0;
  let changed = true;

  while (changed && pass < 10) {
    pass++;
    const { result, removed } = removeDeadRefs(code);

    if (removed.length > 0) {
      console.log(`\nPass ${pass}: Removed ${removed.length} dead references`);
      for (const r of removed) {
        console.log(`  - ${r.name} = ${r.rhs}`);
      }
      totalRemoved = totalRemoved.concat(removed);
      code = result;
    } else {
      changed = false;
    }
  }

  // Write output
  const finalOutputPath = outputPath || inputPath;
  try {
    fs.writeFileSync(finalOutputPath, code, 'utf8');
  } catch (err) {
    console.error(`Error writing file: ${finalOutputPath}`);
    console.error(err.message);
    process.exit(1);
  }

  // Print summary
  const newSize = code.length;
  const bytesRemoved = originalSize - newSize;
  const percentRemoved = ((bytesRemoved / originalSize) * 100).toFixed(2);

  console.log(`\n=== Summary ===`);
  console.log(`Dead references removed: ${totalRemoved.length}`);
  console.log(`Passes required: ${pass}`);
  console.log(`Size: ${originalSize} -> ${newSize} bytes (${bytesRemoved} bytes, ${percentRemoved}% reduction)`);
  console.log(`Output written to: ${finalOutputPath}`);

  return { removed: totalRemoved, originalSize, newSize };
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: node remove-dead-refs.cjs input.js [output.js]');
    console.log('');
    console.log('Removes dead/unused variable references from JavaScript code.');
    console.log('');
    console.log('After deobfuscation, code often has leftover decoder references like:');
    console.log('  const Za = ZX;  // Za is never used - dead code');
    console.log('  const Zb = ZX;  // Zb is never used - dead code');
    console.log('');
    console.log('This tool removes such dead references safely:');
    console.log('  - Only removes if the variable is never used after declaration');
    console.log('  - Only removes if the RHS has no side effects (simple identifiers)');
    console.log('  - Handles comma-separated declarations properly');
    process.exit(1);
  }

  const inputPath = path.resolve(args[0]);
  const outputPath = args[1] ? path.resolve(args[1]) : null;

  processFile(inputPath, outputPath);
}

module.exports = { removeDeadRefs, hasSideEffects, isVariableUsed };
