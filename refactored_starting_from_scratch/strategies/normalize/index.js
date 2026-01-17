/**
 * Code Normalization Pipeline
 *
 * Transforms environment-dependent code into clean standalone code.
 *
 * Pipeline:
 *   1. Deobfuscate - Decode encoded strings (J.SQ("xyz") → "hostname")
 *   2. AST Evaluate - Replace location.hostname, evaluate string methods
 *   3. Simplify - Simplify ternaries, remove dead code
 *
 * Example:
 *   Input:  var fH=window.location.hostname.endsWith("jampea.com")?2:window.location.hostname=="www.vectorpea.com"?1:0
 *   Output: var fH=0;
 */

import { deobfuscate } from './deobfuscate.js';
import { evaluateAST } from './ast-evaluate.js';
import { simplifyControlFlow } from './simplify.js';

/**
 * Main normalization function - runs the full pipeline
 * @param {string} code - JavaScript source code
 * @param {string} hostname - Original hostname (e.g., "www.photopea.com")
 * @param {Object} options - Options
 * @param {boolean} options.verbose - Log detailed info
 * @param {boolean} options.deobfuscate - Run deobfuscation (default: true)
 * @param {boolean} options.evaluate - Run AST evaluation (default: true)
 * @param {boolean} options.simplify - Run simplification (default: true)
 * @returns {{ code: string, changes: Object }}
 */
export function normalizeCode(code, hostname, options = {}) {
  const {
    verbose = false,
    deobfuscate: doDeobfuscate = true,
    evaluate: doEvaluate = true,
    simplify: doSimplify = true,
  } = options;

  const changes = {
    deobfuscate: { enabled: doDeobfuscate, decoders: [], replacements: 0 },
    evaluate: { enabled: doEvaluate, changes: [] },
    simplify: { enabled: doSimplify, changes: [] },
  };

  let currentCode = code;

  // Step 1: Deobfuscate encoded strings
  if (doDeobfuscate) {
    if (verbose) console.log('\n[normalize] Step 1: Deobfuscate');
    const result = deobfuscate(currentCode, { verbose });
    currentCode = result.code;
    changes.deobfuscate.decoders = result.decoders;
    changes.deobfuscate.replacements = result.replacements;
  }

  // Step 2: AST evaluation (replace location.*, evaluate string methods)
  if (doEvaluate) {
    if (verbose) console.log('\n[normalize] Step 2: AST Evaluate');
    const result = evaluateAST(currentCode, hostname, { verbose });
    currentCode = result.code;
    changes.evaluate.changes = result.changes;
  }

  // Step 3: Simplify control flow
  if (doSimplify) {
    if (verbose) console.log('\n[normalize] Step 3: Simplify');
    const result = simplifyControlFlow(currentCode, { verbose });
    currentCode = result.code;
    changes.simplify.changes = result.changes;
  }

  return { code: currentCode, changes };
}

/**
 * Quick normalization using regex only (faster, for simple cases)
 * This is the original implementation preserved for fallback
 * @param {string} code - JavaScript source code
 * @param {string} hostname - Original hostname
 * @returns {{ code: string, changes: string[] }}
 */
export function normalizeCodeRegex(code, hostname) {
  const changes = [];
  let result = code;

  // Build values
  const origin = `https://${hostname}`;
  const href = `${origin}/`;

  // Replace location properties
  const replacements = [
    [/\bwindow\.location\.href\b/g, `"${href}"`],
    [/\bwindow\.location\.origin\b/g, `"${origin}"`],
    [/\bwindow\.location\.hostname\b/g, `"${hostname}"`],
    [/\bwindow\.location\.host\b(?!name)/g, `"${hostname}"`],
    [/\blocation\.hostname\b/g, `"${hostname}"`],
    [/\blocation\.host\b(?!name)/g, `"${hostname}"`],
    [/\blocation\.origin\b/g, `"${origin}"`],
    [/\bdocument\.domain\b/g, `"${hostname}"`],
  ];

  for (const [pattern, replacement] of replacements) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) changes.push('location-replace');
  }

  // Evaluate string methods
  result = result.replace(
    /"([^"]+)"\.endsWith\("([^"]+)"\)/g,
    (match, str, suffix) => (str.endsWith(suffix) ? 'true' : 'false')
  );

  result = result.replace(
    /"([^"]+)"\.startsWith\("([^"]+)"\)/g,
    (match, str, prefix) => (str.startsWith(prefix) ? 'true' : 'false')
  );

  result = result.replace(
    /"([^"]+)"\.includes\("([^"]+)"\)/g,
    (match, str, sub) => (str.includes(sub) ? 'true' : 'false')
  );

  // Evaluate string comparisons
  result = result.replace(
    /"([^"]+)"\s*(===?)\s*"([^"]+)"/g,
    (match, a, op, b) => (a === b ? 'true' : 'false')
  );

  result = result.replace(
    /"([^"]+)"\s*(!==?)\s*"([^"]+)"/g,
    (match, a, op, b) => (a !== b ? 'true' : 'false')
  );

  // Simplify ternaries (multiple passes)
  for (let i = 0; i < 5; i++) {
    const before = result;
    result = result.replace(/\bfalse\s*\?\s*([^:]+)\s*:\s*([^,;}\]]+)/g, '$2');
    result = result.replace(/\btrue\s*\?\s*([^:]+)\s*:\s*([^,;}\]]+)/g, '$1');
    if (result === before) break;
  }

  // Simplify boolean logic
  result = result.replace(/\bfalse\s*\|\|/g, '');
  result = result.replace(/\btrue\s*&&/g, '');

  if (result !== code) {
    changes.push('simplified');
  }

  return { code: result, changes };
}

// Re-export individual modules for direct access
export { deobfuscate } from './deobfuscate.js';
export { evaluateAST } from './ast-evaluate.js';
export { simplifyControlFlow } from './simplify.js';

export default { normalizeCode, normalizeCodeRegex };
