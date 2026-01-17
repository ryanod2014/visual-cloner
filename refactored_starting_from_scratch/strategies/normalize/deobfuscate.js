/**
 * String Deobfuscation Module
 *
 * Detects string encoder/decoder functions in obfuscated code,
 * executes them safely, and replaces encoded calls with literal strings.
 *
 * Example:
 *   Input:  J.SQ("W[\\ZQAJ?")  where J.SQ is a decoder function
 *   Output: "hostname"
 */

import vm from 'vm';

/**
 * Patterns that indicate a string decoder function
 * These functions typically:
 * - Take a string parameter
 * - Use String.fromCharCode or charCodeAt
 * - Do arithmetic on character codes
 * - Return a string
 */
const DECODER_PATTERNS = [
  /String\.fromCharCode/,
  /\.charCodeAt\s*\(/,
  /\.fromCharCode\s*\(/,
];

/**
 * Extract a function body by counting braces (handles nested braces)
 * @param {string} code - Code starting from function keyword
 * @returns {string|null} - Function body including braces, or null if not found
 */
function extractFunctionBody(code) {
  const start = code.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let stringChar = '';
  let escaped = false;

  for (let i = start; i < code.length; i++) {
    const char = code[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (inString) {
      if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return code.substring(0, i + 1);
      }
    }
  }

  return null;
}

/**
 * Extract potential decoder functions from code
 * @param {string} code - JavaScript source code
 * @returns {Map<string, string>} - Map of function name to function body
 */
export function findDecoderFunctions(code) {
  const decoders = new Map();

  // Pattern to find start of function assignments: obj.name = function(...)
  const funcStartPattern = /([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)\s*=\s*function\s*\([^)]*\)\s*\{/g;

  let match;
  while ((match = funcStartPattern.exec(code)) !== null) {
    const name = match[1];
    const startIdx = match.index;

    // Extract the full function body using brace counting
    const codeFromFunc = code.substring(startIdx);
    const fullFunc = extractFunctionBody(codeFromFunc.substring(codeFromFunc.indexOf('function')));

    if (fullFunc) {
      const assignment = codeFromFunc.substring(0, codeFromFunc.indexOf('function')) + fullFunc;

      // Check if body contains decoder patterns
      const isDecoder = DECODER_PATTERNS.some(pattern => pattern.test(fullFunc));
      if (isDecoder) {
        decoders.set(name, assignment);
      }
    }
  }

  return decoders;
}

/**
 * Find helper functions that decoders depend on
 * @param {string} code - JavaScript source code
 * @param {Set<string>} namespaces - Namespaces that have decoders
 * @returns {Map<string, string>} - Map of helper name to code
 */
function findHelperFunctions(code, namespaces) {
  const helpers = new Map();

  for (const ns of namespaces) {
    // Look for simple helper functions in the same namespace
    // Pattern: ns.name = function(...) { ... }
    const helperPattern = new RegExp(
      `(${ns}\\.\\w+)\\s*=\\s*function\\s*\\([^)]*\\)\\s*\\{`,
      'g'
    );

    let match;
    while ((match = helperPattern.exec(code)) !== null) {
      const name = match[1];
      if (helpers.has(name)) continue;

      const codeFromFunc = code.substring(match.index);
      const fullFunc = extractFunctionBody(codeFromFunc.substring(codeFromFunc.indexOf('function')));

      if (fullFunc) {
        const assignment = codeFromFunc.substring(0, codeFromFunc.indexOf('function')) + fullFunc;
        helpers.set(name, assignment);
      }
    }
  }

  return helpers;
}

/**
 * Create a safe sandbox to execute decoder functions
 * @param {Map<string, string>} decoders - Decoder functions to load
 * @param {string} fullCode - Full source code (to find dependencies)
 * @returns {vm.Context} - VM context with decoders loaded
 */
export function createDecoderSandbox(decoders, fullCode = '') {
  // Create a minimal sandbox with only what's needed
  const sandbox = {
    String: String,
    Math: Math,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    Number: Number,
    Array: Array,
    Object: Object,
    // Result storage
    __results__: {},
  };

  const context = vm.createContext(sandbox);

  // Initialize namespace objects
  const namespaces = new Set();
  for (const [name] of decoders) {
    const ns = name.split('.')[0];
    namespaces.add(ns);
  }

  // Create namespace objects
  for (const ns of namespaces) {
    vm.runInContext(`var ${ns} = {};`, context);
  }

  // Find and load helper functions first (potential dependencies)
  if (fullCode) {
    const helpers = findHelperFunctions(fullCode, namespaces);

    // Load helpers (sorted by name to get dependencies first)
    const sortedHelpers = Array.from(helpers.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [name, funcCode] of sortedHelpers) {
      try {
        vm.runInContext(funcCode, context, { timeout: 1000 });
      } catch (e) {
        // Helper might have unresolved dependencies, skip it
      }
    }
  }

  // Load each decoder function
  for (const [name, funcCode] of decoders) {
    try {
      vm.runInContext(funcCode, context, { timeout: 1000 });
    } catch (e) {
      // Some decoders might still have unresolved dependencies
    }
  }

  return context;
}

/**
 * Decode a single string using a decoder function
 * @param {vm.Context} context - VM context with decoders
 * @param {string} funcName - Name of decoder function (e.g., "J.SQ")
 * @param {string} encodedStr - The encoded string argument
 * @returns {string|null} - Decoded string or null if failed
 */
export function decodeString(context, funcName, encodedStr) {
  try {
    // Escape the string properly for evaluation
    const escaped = JSON.stringify(encodedStr);
    const code = `${funcName}(${escaped})`;
    const result = vm.runInContext(code, context, { timeout: 100 });

    if (typeof result === 'string') {
      return result;
    }
  } catch (e) {
    // Decoder failed - might have unresolved dependencies
  }
  return null;
}

/**
 * Find all calls to decoder functions and decode them
 * @param {string} code - JavaScript source code
 * @param {vm.Context} context - VM context with decoders loaded
 * @param {Set<string>} decoderNames - Names of decoder functions
 * @returns {{ code: string, replacements: Array }} - Deobfuscated code and list of replacements
 */
export function replaceEncodedStrings(code, context, decoderNames) {
  const replacements = [];
  let result = code;

  for (const funcName of decoderNames) {
    // Escape the function name for regex (handle dots)
    const escapedName = funcName.replace(/\./g, '\\.');

    // Pattern: funcName("encoded string") or funcName('encoded string')
    const pattern = new RegExp(
      `${escapedName}\\(\\s*["']([^"']*(?:\\\\.[^"']*)*)["']\\s*\\)`,
      'g'
    );

    result = result.replace(pattern, (match, encodedStr) => {
      // Unescape the string (handle \\, \n, etc.)
      const unescaped = encodedStr.replace(/\\(.)/g, (_, char) => {
        switch (char) {
          case 'n': return '\n';
          case 'r': return '\r';
          case 't': return '\t';
          case '\\': return '\\';
          default: return char;
        }
      });

      const decoded = decodeString(context, funcName, unescaped);

      if (decoded !== null) {
        replacements.push({
          original: match,
          decoded: decoded,
          function: funcName,
        });
        // Return the decoded string as a literal
        return JSON.stringify(decoded);
      }

      // Couldn't decode - keep original
      return match;
    });
  }

  return { code: result, replacements };
}

/**
 * Main deobfuscation function
 * @param {string} code - JavaScript source code
 * @param {Object} options - Options
 * @param {boolean} options.verbose - Log detailed info
 * @returns {{ code: string, decoders: string[], replacements: number }}
 */
export function deobfuscate(code, options = {}) {
  const { verbose = false } = options;

  // Step 1: Find decoder functions
  const decoders = findDecoderFunctions(code);

  if (decoders.size === 0) {
    return { code, decoders: [], replacements: 0 };
  }

  if (verbose) {
    console.log(`[deobfuscate] Found ${decoders.size} decoder functions:`);
    for (const name of decoders.keys()) {
      console.log(`  - ${name}`);
    }
  }

  // Step 2: Create sandbox and load decoders (pass full code for dependency resolution)
  const context = createDecoderSandbox(decoders, code);

  // Step 3: Replace all encoded strings
  const { code: deobfuscatedCode, replacements } = replaceEncodedStrings(
    code,
    context,
    new Set(decoders.keys())
  );

  if (verbose) {
    console.log(`[deobfuscate] Made ${replacements.length} replacements`);
    if (replacements.length > 0 && replacements.length <= 20) {
      for (const r of replacements) {
        console.log(`  ${r.function}("...") → "${r.decoded}"`);
      }
    } else if (replacements.length > 20) {
      for (let i = 0; i < 10; i++) {
        console.log(`  ${replacements[i].function}("...") → "${replacements[i].decoded}"`);
      }
      console.log(`  ... and ${replacements.length - 10} more`);
    }
  }

  return {
    code: deobfuscatedCode,
    decoders: Array.from(decoders.keys()),
    replacements: replacements.length,
  };
}

export default { deobfuscate, findDecoderFunctions };
