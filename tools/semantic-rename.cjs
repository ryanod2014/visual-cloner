#!/usr/bin/env node
/**
 * Semantic Variable Renamer
 *
 * Infers meaningful variable names from usage context without LLM.
 * Uses static analysis heuristics:
 * - String content analysis (URLs, paths, selectors)
 * - Method call patterns (fetch, querySelector, etc.)
 * - Property access patterns
 * - Control flow context (conditions, loops)
 * - Function parameter position inference
 * - Assignment context analysis
 * - Usage context analysis
 * - Loop/iteration context
 */

const fs = require('fs');

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile) {
  console.log('Usage: node semantic-rename.cjs <input.js> [output.js]');
  process.exit(1);
}

let code = fs.readFileSync(inputFile, 'utf8');

// Track variable info: { name: { contexts: [], suggestedName: '' } }
const varInfo = new Map();

// Reserved words and common names we shouldn't rename TO
const reserved = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'return', 'function', 'const', 'let', 'var', 'class', 'new', 'this',
  'true', 'false', 'null', 'undefined', 'typeof', 'instanceof', 'in',
  'try', 'catch', 'finally', 'throw', 'async', 'await', 'yield',
  'import', 'export', 'default', 'from', 'as',
  'window', 'document', 'console', 'Math', 'JSON', 'Object', 'Array',
  'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Error', 'Promise',
  'Map', 'Set', 'Symbol', 'Proxy', 'Reflect',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'fetch', 'XMLHttpRequest', 'localStorage', 'sessionStorage',
  'alert', 'confirm', 'prompt', 'event', 'e', 'i', 'j', 'k', 'n', 'x', 'y',
  'el', 'fn', 'cb', 'id', 'ok', 'tag', 'url', 'key', 'val', 'ref', 'src',
  'err', 'res', 'req', 'opt', 'obj', 'arr', 'str', 'num', 'idx', 'len',
  'min', 'max', 'sum', 'avg', 'cnt', 'ptr', 'buf', 'tmp', 'ret', 'acc'
]);

// Names we've already assigned (to avoid duplicates)
const usedNames = new Set();

// Track loop nesting level for index naming
let loopNestingLevel = 0;

// ============================================================
// CRYPTIC NAME DETECTION
// ============================================================

function isCrypticName(varName) {
  // Skip reserved words
  if (reserved.has(varName)) return false;

  // Skip if too short (single char)
  if (varName.length < 2) return false;

  // 1-3 character names are cryptic
  if (varName.length <= 3) return true;

  // Letter followed by digits (D7, Z0, Z1, Dp, Ds)
  if (/^[A-Z][a-z]?\d*$/.test(varName)) return true;
  if (/^[a-z][A-Z\d]+$/.test(varName)) return true;

  // Single uppercase letter followed by lowercase letters (short)
  if (/^[A-Z][a-z]{1,2}$/.test(varName)) return true;

  // Patterns like ZX, ZA, etc (two uppercase letters)
  if (/^[A-Z]{2}$/.test(varName)) return true;

  // Patterns like i0, i1, i2 (letter + digit)
  if (/^[a-z]\d+$/.test(varName)) return true;

  return false;
}

// ============================================================
// PATTERN MATCHERS
// ============================================================

const patterns = [
  // ============================================================
  // 1. FUNCTION PARAMETER POSITION INFERENCE
  // ============================================================

  // Destructured params with meaningful names - keep them
  {
    pattern: /(?:async\s+)?\(\s*\{\s*(\w+)\s*(?:,\s*\w+)*\s*\}\s*\)/g,
    handler: (match, firstParam) => {
      // These are already meaningful, just mark them as known
    }
  },

  // Arrow function in .then() callback
  {
    pattern: /\.then\s*\(\s*(?:async\s+)?(\w+)\s*=>/g,
    handler: (match, varName) => {
      addContext(varName, 'result');
    }
  },
  {
    pattern: /\.then\s*\(\s*(?:async\s+)?(?:function\s*)?\(\s*(\w+)\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'result');
    }
  },

  // Arrow function in .catch() callback
  {
    pattern: /\.catch\s*\(\s*(?:async\s+)?(\w+)\s*=>/g,
    handler: (match, varName) => {
      addContext(varName, 'error');
    }
  },
  {
    pattern: /\.catch\s*\(\s*(?:async\s+)?(?:function\s*)?\(\s*(\w+)\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'error');
    }
  },

  // Arrow function in .finally() callback
  {
    pattern: /\.finally\s*\(\s*(?:async\s+)?\(\s*\)\s*=>/g,
    handler: (match) => {
      // No params, nothing to rename
    }
  },

  // Single param arrow function used with fetch
  {
    pattern: /fetch\s*\([^)]*\)\s*\.\s*then\s*\(\s*(\w+)\s*=>/g,
    handler: (match, varName) => {
      addContext(varName, 'response');
    }
  },

  // ============================================================
  // 2. ASSIGNMENT CONTEXT
  // ============================================================

  // X = await fetch(...)
  {
    pattern: /(\w+)\s*=\s*(?:await\s+)?fetch\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'response');
    }
  },

  // X = await Y.json()
  {
    pattern: /(\w+)\s*=\s*(?:await\s+)?(\w+)\.json\s*\(\s*\)/g,
    handler: (match, varName, sourceVar) => {
      addContext(varName, 'data');
      addContext(sourceVar, 'response');
    }
  },

  // X = await Y.text()
  {
    pattern: /(\w+)\s*=\s*(?:await\s+)?(\w+)\.text\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'text');
    }
  },

  // X = document.querySelector(...)
  {
    pattern: /(\w+)\s*=\s*document\.querySelector\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    handler: (match, varName, selector) => {
      if (selector.startsWith('#')) {
        addContext(varName, 'element', selector.slice(1));
      } else if (selector.startsWith('.')) {
        addContext(varName, 'element', selector.slice(1));
      } else {
        addContext(varName, 'element', selector);
      }
    }
  },

  // X = document.querySelectorAll(...)
  {
    pattern: /(\w+)\s*=\s*document\.querySelectorAll\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'elements');
    }
  },

  // X = document.getElementById(...)
  {
    pattern: /(\w+)\s*=\s*document\.getElementById\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    handler: (match, varName, id) => {
      addContext(varName, 'element', id);
    }
  },

  // X = document.createElement(...)
  {
    pattern: /(\w+)\s*=\s*document\.createElement\s*\(\s*['"`](\w+)['"`]\s*\)/g,
    handler: (match, varName, tag) => {
      addContext(varName, 'element', tag);
    }
  },

  // X = setInterval(...)
  {
    pattern: /(\w+)\s*=\s*setInterval\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'intervalId');
    }
  },

  // X = setTimeout(...)
  {
    pattern: /(\w+)\s*=\s*setTimeout\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'timerId');
    }
  },

  // X = new Date()
  {
    pattern: /(\w+)\s*=\s*new\s+Date\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'date');
    }
  },

  // X = {} followed by X['prop'] = or X.prop = (config/options pattern)
  // Only match if it looks like config-related properties
  {
    pattern: /(\w+)\s*=\s*\{\s*\}\s*[;,]/g,
    handler: (match, varName) => {
      // Check if this variable is used with config-like properties
      const configProps = ['url', 'method', 'headers', 'body', 'type', 'payload', 'data', 'config', 'options', 'settings'];
      for (const prop of configProps) {
        const propPattern = new RegExp(varName + "\\s*\\[\\s*['\"`]" + prop + "['\"`]\\s*\\]\\s*=", 'g');
        if (propPattern.test(code)) {
          addContext(varName, 'configObj');
          return;
        }
      }
    }
  },

  // X = new RegExp or /pattern/
  {
    pattern: /(\w+)\s*=\s*(?:new\s+RegExp\s*\(|\/[^\/]+\/[gimsuy]*)/g,
    handler: (match, varName) => {
      addContext(varName, 'regex');
    }
  },

  // X = new Error(...)
  {
    pattern: /(\w+)\s*=\s*new\s+Error\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'error');
    }
  },

  // X = new Promise(...)
  {
    pattern: /(\w+)\s*=\s*new\s+Promise\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'promise');
    }
  },

  // X = JSON.parse(...)
  {
    pattern: /(\w+)\s*=\s*JSON\.parse\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'data');
    }
  },

  // X = JSON.stringify(...)
  {
    pattern: /(\w+)\s*=\s*JSON\.stringify\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'jsonString');
    }
  },

  // X = new URL(...)
  {
    pattern: /(\w+)\s*=\s*new\s+URL\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'urlObj');
    }
  },

  // X = new URLSearchParams(...)
  {
    pattern: /(\w+)\s*=\s*new\s+URLSearchParams\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'params');
    }
  },

  // X = new MutationObserver(...)
  {
    pattern: /(\w+)\s*=\s*new\s+MutationObserver\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'observer');
    }
  },

  // X = new IntersectionObserver(...)
  {
    pattern: /(\w+)\s*=\s*new\s+IntersectionObserver\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'observer');
    }
  },

  // ============================================================
  // 3. USAGE CONTEXT
  // ============================================================

  // X.preventDefault() → event
  {
    pattern: /(\w+)\.preventDefault\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'event');
    }
  },

  // X.stopPropagation() → event
  {
    pattern: /(\w+)\.stopPropagation\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'event');
    }
  },

  // X.target → event
  {
    pattern: /(\w+)\.target(?:\.|,|\s|;|\)|\])/g,
    handler: (match, varName) => {
      // Only if it looks like event usage
      const eventPattern = new RegExp(varName + '\\.(?:target|currentTarget|preventDefault|stopPropagation|type|key|keyCode)', 'g');
      if (eventPattern.test(code)) {
        addContext(varName, 'event');
      }
    }
  },

  // X.appendChild(...) → element or container
  {
    pattern: /(\w+)\.appendChild\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'container');
    }
  },

  // X.removeChild(...) → element or container
  {
    pattern: /(\w+)\.removeChild\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'container');
    }
  },

  // X.append(...) → element
  {
    pattern: /(\w+)\.append\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // X.prepend(...) → element
  {
    pattern: /(\w+)\.prepend\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // JSON.stringify(X) → data
  {
    pattern: /JSON\.stringify\s*\(\s*(\w+)\s*[,)]/g,
    handler: (match, varName) => {
      addContext(varName, 'data');
    }
  },

  // Variable used in template literal for URL
  {
    pattern: /['"`]https?:\/\/[^'"`]*\$\{(\w+)\}/g,
    handler: (match, varName) => {
      addContext(varName, 'urlPart');
    }
  },

  // Variable in URL template literal
  {
    pattern: /['"`][^'"`]*\/\$\{(\w+)\}[^'"`]*['"`]/g,
    handler: (match, varName) => {
      addContext(varName, 'pathPart');
    }
  },

  // X.innerHTML = → element
  {
    pattern: /(\w+)\.innerHTML\s*=/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // X.textContent = → element
  {
    pattern: /(\w+)\.textContent\s*=/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // X.style. → element
  {
    pattern: /(\w+)\.style\./g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // X.classList. → element
  {
    pattern: /(\w+)\.classList\./g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // X.setAttribute → element
  {
    pattern: /(\w+)\.setAttribute\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // X.getAttribute → element
  {
    pattern: /(\w+)\.getAttribute\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // X.addEventListener → element
  {
    pattern: /(\w+)\.addEventListener\s*\(/g,
    handler: (match, varName) => {
      if (!reserved.has(varName) && varName !== 'document' && varName !== 'window') {
        addContext(varName, 'element');
      }
    }
  },

  // X.removeEventListener → element
  {
    pattern: /(\w+)\.removeEventListener\s*\(/g,
    handler: (match, varName) => {
      if (!reserved.has(varName) && varName !== 'document' && varName !== 'window') {
        addContext(varName, 'element');
      }
    }
  },

  // X.find(...) → could be element or array
  {
    pattern: /(\w+)\.find\s*\(/g,
    handler: (match, varName) => {
      // Check for jQuery vs array
      const jqueryPattern = new RegExp("\\$\\s*\\([^)]*\\)\\s*" + varName, 'g');
      if (!jqueryPattern.test(code)) {
        addContext(varName, 'array');
      }
    }
  },

  // X.closest(...) → element
  {
    pattern: /(\w+)\.closest\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // X.matches(...) → element
  {
    pattern: /(\w+)\.matches\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // X.blur() → element
  {
    pattern: /(\w+)\.blur\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // X.focus() → element
  {
    pattern: /(\w+)\.focus\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // X.click() → element
  {
    pattern: /(\w+)\.click\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // X.replaceWith(...) → element
  {
    pattern: /(\w+)\.replaceWith\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // X.before(...) → element
  {
    pattern: /(\w+)\.before\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // X.after(...) → element
  {
    pattern: /(\w+)\.after\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // ============================================================
  // 4. LOOP/ITERATION CONTEXT
  // ============================================================

  // for (let X = 0; → index
  {
    pattern: /for\s*\(\s*(?:let|var|const)\s+(\w+)\s*=\s*0\s*;/g,
    handler: (match, varName) => {
      addContext(varName, 'index');
    }
  },

  // .forEach(X => or .forEach(function(X))
  {
    pattern: /\.forEach\s*\(\s*(?:async\s+)?(\w+)\s*=>/g,
    handler: (match, varName) => {
      addContext(varName, 'item');
    }
  },
  {
    pattern: /\.forEach\s*\(\s*(?:async\s+)?(?:function\s*)?\(\s*(\w+)/g,
    handler: (match, varName) => {
      addContext(varName, 'item');
    }
  },

  // .map(X => or .map(function(X))
  {
    pattern: /\.map\s*\(\s*(?:async\s+)?(\w+)\s*=>/g,
    handler: (match, varName) => {
      addContext(varName, 'item');
    }
  },
  {
    pattern: /\.map\s*\(\s*(?:async\s+)?(?:function\s*)?\(\s*(\w+)/g,
    handler: (match, varName) => {
      addContext(varName, 'item');
    }
  },

  // .filter(X => or .filter(function(X))
  {
    pattern: /\.filter\s*\(\s*(?:async\s+)?(\w+)\s*=>/g,
    handler: (match, varName) => {
      addContext(varName, 'item');
    }
  },
  {
    pattern: /\.filter\s*\(\s*(?:async\s+)?(?:function\s*)?\(\s*(\w+)/g,
    handler: (match, varName) => {
      addContext(varName, 'item');
    }
  },

  // .find(X => or .find(function(X))
  {
    pattern: /\.find\s*\(\s*(?:async\s+)?(\w+)\s*=>/g,
    handler: (match, varName) => {
      addContext(varName, 'item');
    }
  },
  {
    pattern: /\.find\s*\(\s*(?:async\s+)?(?:function\s*)?\(\s*(\w+)/g,
    handler: (match, varName) => {
      addContext(varName, 'item');
    }
  },

  // .some(X => or .some(function(X))
  {
    pattern: /\.some\s*\(\s*(?:async\s+)?(\w+)\s*=>/g,
    handler: (match, varName) => {
      addContext(varName, 'item');
    }
  },

  // .every(X => or .every(function(X))
  {
    pattern: /\.every\s*\(\s*(?:async\s+)?(\w+)\s*=>/g,
    handler: (match, varName) => {
      addContext(varName, 'item');
    }
  },

  // .reduce((acc, X) =>
  {
    pattern: /\.reduce\s*\(\s*(?:async\s+)?\(\s*(\w+)\s*,\s*(\w+)\s*\)/g,
    handler: (match, accVar, itemVar) => {
      addContext(accVar, 'accumulator');
      addContext(itemVar, 'item');
    }
  },

  // for...of loop: for (const X of Y)
  {
    pattern: /for\s*\(\s*(?:const|let|var)\s+(\w+)\s+of\s+(\w+)\s*\)/g,
    handler: (match, itemVar, arrayVar) => {
      addContext(itemVar, 'item');
      addContext(arrayVar, 'array');
    }
  },

  // for...in loop: for (const X in Y)
  {
    pattern: /for\s*\(\s*(?:const|let|var)\s+(\w+)\s+in\s+(\w+)\s*\)/g,
    handler: (match, keyVar, objVar) => {
      addContext(keyVar, 'key');
      addContext(objVar, 'obj');
    }
  },

  // ============================================================
  // ADDITIONAL PATTERNS
  // ============================================================

  // URL assignments
  {
    pattern: /(\w+)\s*=\s*['"`](https?:\/\/[^'"`]+)['"`]/g,
    handler: (match, varName, url) => {
      addContext(varName, 'url', url);
    }
  },

  // URL path assignments
  {
    pattern: /(\w+)\s*=\s*['"`](\/[^'"`]+)['"`]/g,
    handler: (match, varName, path) => {
      if (path.includes('/api/') || path.includes('/v1/') || path.includes('/v2/')) {
        addContext(varName, 'endpoint', path);
      } else {
        addContext(varName, 'path', path);
      }
    }
  },

  // catch block param
  {
    pattern: /catch\s*\(\s*(\w+)\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'error');
    }
  },

  // addEventListener - event param (arrow function)
  {
    pattern: /\.addEventListener\s*\(\s*['"`]\w+['"`]\s*,\s*(\w+)\s*=>/g,
    handler: (match, varName) => {
      addContext(varName, 'event');
    }
  },

  // addEventListener - event param (function)
  {
    pattern: /\.addEventListener\s*\(\s*['"`]\w+['"`]\s*,\s*(?:async\s+)?(?:function\s*)?\(\s*(\w+)\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'event');
    }
  },

  // .length access suggests array
  {
    pattern: /(\w+)\.length/g,
    handler: (match, varName) => {
      if (!reserved.has(varName)) {
        addContext(varName, 'array');
      }
    }
  },

  // .push() suggests array
  {
    pattern: /(\w+)\.push\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'array');
    }
  },

  // .pop() suggests array
  {
    pattern: /(\w+)\.pop\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'array');
    }
  },

  // .shift() suggests array
  {
    pattern: /(\w+)\.shift\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'array');
    }
  },

  // .unshift() suggests array
  {
    pattern: /(\w+)\.unshift\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'array');
    }
  },

  // .splice() suggests array
  {
    pattern: /(\w+)\.splice\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'array');
    }
  },

  // .slice() suggests array or string
  {
    pattern: /(\w+)\.slice\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'arrayOrString');
    }
  },

  // .concat() suggests array
  {
    pattern: /(\w+)\.concat\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'array');
    }
  },

  // .join() suggests array
  {
    pattern: /(\w+)\.join\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'array');
    }
  },

  // .includes() on what looks like array
  {
    pattern: /(\w+)\.includes\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'arrayOrString');
    }
  },

  // Boolean expressions (true/false assignment)
  {
    pattern: /(\w+)\s*=\s*(?:true|false)\s*[;,\n)]/g,
    handler: (match, varName) => {
      addContext(varName, 'flag');
    }
  },

  // Comparison results
  {
    pattern: /(\w+)\s*=\s*\w+\s*[=!<>]=+\s*\w+/g,
    handler: (match, varName) => {
      addContext(varName, 'flag');
    }
  },

  // Object literal with specific keys - fetch options
  {
    pattern: /(\w+)\s*=\s*\{\s*method\s*:\s*['"`](?:GET|POST|PUT|DELETE|PATCH)/g,
    handler: (match, varName) => {
      addContext(varName, 'fetchOptions');
    }
  },
  {
    pattern: /fetch\s*\([^,]+,\s*(\w+)\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'fetchOptions');
    }
  },

  // Config/options objects
  {
    pattern: /(\w+)\s*=\s*\{\s*(?:url|baseUrl|apiKey|token)\s*:/g,
    handler: (match, varName) => {
      addContext(varName, 'config');
    }
  },

  // String method hints
  {
    pattern: /(\w+)\.split\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'str');
    }
  },
  {
    pattern: /(\w+)\.trim\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'str');
    }
  },
  {
    pattern: /(\w+)\.toLowerCase\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'str');
    }
  },
  {
    pattern: /(\w+)\.toUpperCase\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'str');
    }
  },
  {
    pattern: /(\w+)\.replace\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'str');
    }
  },
  {
    pattern: /(\w+)\.replaceAll\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'str');
    }
  },
  {
    pattern: /(\w+)\.match\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'str');
    }
  },
  {
    pattern: /(\w+)\.substring\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'str');
    }
  },
  {
    pattern: /(\w+)\.substr\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'str');
    }
  },
  {
    pattern: /(\w+)\.startsWith\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'str');
    }
  },
  {
    pattern: /(\w+)\.endsWith\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'str');
    }
  },

  // parseInt suggests string input
  {
    pattern: /parseInt\s*\(\s*(\w+)/g,
    handler: (match, varName) => {
      addContext(varName, 'str');
    }
  },

  // parseFloat suggests string input
  {
    pattern: /parseFloat\s*\(\s*(\w+)/g,
    handler: (match, varName) => {
      addContext(varName, 'str');
    }
  },

  // Number method hints
  {
    pattern: /(\w+)\.toFixed\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'num');
    }
  },

  // Width/height suggests dimension
  {
    pattern: /(\w+)\s*=\s*\w+\.(?:width|height|offsetWidth|offsetHeight|clientWidth|clientHeight)/g,
    handler: (match, varName) => {
      addContext(varName, 'dimension');
    }
  },

  // .offset() (jQuery) suggests element
  {
    pattern: /(\w+)\.offset\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .width() / .height() (jQuery)
  {
    pattern: /(\w+)\.width\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },
  {
    pattern: /(\w+)\.height\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .css() (jQuery) suggests element
  {
    pattern: /(\w+)\.css\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .attr() (jQuery) suggests element
  {
    pattern: /(\w+)\.attr\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .prop() (jQuery) suggests element
  {
    pattern: /(\w+)\.prop\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .val() (jQuery) suggests element
  {
    pattern: /(\w+)\.val\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .html() (jQuery) suggests element
  {
    pattern: /(\w+)\.html\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .text() but not as json/fetch result
  {
    pattern: /(\w+)\.text\s*\(\s*\)/g,
    handler: (match, varName) => {
      // Could be element.text() in jQuery
      addContext(varName, 'element');
    }
  },

  // .show() / .hide() (jQuery)
  {
    pattern: /(\w+)\.show\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },
  {
    pattern: /(\w+)\.hide\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .toggle() (jQuery)
  {
    pattern: /(\w+)\.toggle\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .on() (jQuery)
  {
    pattern: /(\w+)\.on\s*\(\s*['"`]/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .off() (jQuery)
  {
    pattern: /(\w+)\.off\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .each() (jQuery)
  {
    pattern: /(\w+)\.each\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'elements');
    }
  },

  // .parent() / .parents() (jQuery)
  {
    pattern: /(\w+)\.parents?\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .children() (jQuery)
  {
    pattern: /(\w+)\.children\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .siblings() (jQuery)
  {
    pattern: /(\w+)\.siblings\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .clone() (jQuery)
  {
    pattern: /(\w+)\.clone\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .remove() (jQuery/DOM)
  {
    pattern: /(\w+)\.remove\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .empty() (jQuery)
  {
    pattern: /(\w+)\.empty\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .hover() (jQuery)
  {
    pattern: /(\w+)\.hover\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // .addClass() / .removeClass() (jQuery)
  {
    pattern: /(\w+)\.addClass\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },
  {
    pattern: /(\w+)\.removeClass\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },
  {
    pattern: /(\w+)\.toggleClass\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },
  {
    pattern: /(\w+)\.hasClass\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // X.dispatch({type: ...}) → often store/action pattern
  {
    pattern: /(\w+)\.dispatch\s*\(\s*\{/g,
    handler: (match, varName) => {
      addContext(varName, 'store');
    }
  },

  // X.observe(...) → observer
  {
    pattern: /(\w+)\.observe\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'observer');
    }
  },

  // X.disconnect() → observer
  {
    pattern: /(\w+)\.disconnect\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'observer');
    }
  },

  // clearInterval(X) → intervalId
  {
    pattern: /clearInterval\s*\(\s*(\w+)\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'intervalId');
    }
  },

  // clearTimeout(X) → timerId
  {
    pattern: /clearTimeout\s*\(\s*(\w+)\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'timerId');
    }
  },

  // X.pause() → media element or timer
  {
    pattern: /(\w+)\.pause\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'mediaElement');
    }
  },

  // X.play() → media element
  {
    pattern: /(\w+)\.play\s*\(\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'mediaElement');
    }
  },

  // Object.keys(X) / Object.values(X) / Object.entries(X)
  {
    pattern: /Object\.(?:keys|values|entries)\s*\(\s*(\w+)\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'obj');
    }
  },

  // Array.isArray(X)
  {
    pattern: /Array\.isArray\s*\(\s*(\w+)\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'value');
    }
  },

  // typeof X
  {
    pattern: /typeof\s+(\w+)/g,
    handler: (match, varName) => {
      // Don't infer type from typeof checks
    }
  },

  // X?.prop (optional chaining suggests object) - lower priority
  {
    pattern: /(\w+)\?\.\[/g,
    handler: (match, varName) => {
      addContext(varName, 'nullable');
    }
  },

  // ...X (spread operator suggests array or object)
  {
    pattern: /\.\.\.\s*(\w+)/g,
    handler: (match, varName) => {
      addContext(varName, 'spreadable');
    }
  },

  // X['something'] bracket notation - only if it's a config-like property
  // Don't match generic bracket access as it's too noisy
  {
    pattern: /(\w+)\s*\[\s*['"`](?:url|method|headers|body|type|payload|config|options|settings)['"`]\s*\]\s*=/g,
    handler: (match, varName) => {
      addContext(varName, 'configObj');
    }
  },

  // atob(X) / btoa(X)
  {
    pattern: /atob\s*\(\s*(\w+)\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'encodedStr');
    }
  },
  {
    pattern: /btoa\s*\(\s*(\w+)\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'str');
    }
  },

  // encodeURIComponent / decodeURIComponent
  {
    pattern: /(?:encode|decode)URIComponent\s*\(\s*(\w+)\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'str');
    }
  },

  // history.pushState / replaceState
  {
    pattern: /history\.(?:push|replace)State\s*\(\s*(\w+)/g,
    handler: (match, varName) => {
      addContext(varName, 'state');
    }
  },

  // localStorage.setItem / getItem
  {
    pattern: /localStorage\.setItem\s*\([^,]+,\s*(\w+)\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'value');
    }
  },
  {
    pattern: /(\w+)\s*=\s*localStorage\.getItem/g,
    handler: (match, varName) => {
      addContext(varName, 'storedValue');
    }
  },

  // sessionStorage.setItem / getItem
  {
    pattern: /sessionStorage\.setItem\s*\([^,]+,\s*(\w+)\s*\)/g,
    handler: (match, varName) => {
      addContext(varName, 'value');
    }
  },
  {
    pattern: /(\w+)\s*=\s*sessionStorage\.getItem/g,
    handler: (match, varName) => {
      addContext(varName, 'storedValue');
    }
  },

  // X.data() (jQuery data)
  {
    pattern: /(\w+)\.data\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  },

  // X.removeData() (jQuery)
  {
    pattern: /(\w+)\.removeData\s*\(/g,
    handler: (match, varName) => {
      addContext(varName, 'element');
    }
  }
];

function addContext(varName, type, hint = '') {
  // Skip if it's a reserved word
  if (reserved.has(varName)) return;

  // Only process cryptic names
  if (!isCrypticName(varName)) return;

  if (!varInfo.has(varName)) {
    varInfo.set(varName, { contexts: [], hints: [] });
  }

  const info = varInfo.get(varName);
  if (!info.contexts.includes(type)) {
    info.contexts.push(type);
  }
  if (hint && !info.hints.includes(hint)) {
    info.hints.push(hint);
  }
}

// ============================================================
// NAME GENERATION
// ============================================================

const contextToName = {
  url: ['apiUrl', 'requestUrl', 'targetUrl', 'urlValue'],
  urlPart: ['urlPart', 'urlSegment', 'hostPart'],
  pathPart: ['pathSegment', 'routePart'],
  endpoint: ['endpoint', 'apiEndpoint', 'apiPath'],
  path: ['filePath', 'routePath', 'pathValue'],
  response: ['response', 'fetchResult', 'httpResponse'],
  result: ['result', 'outcome', 'returnValue'],
  data: ['data', 'responseData', 'jsonData', 'parsedData'],
  text: ['textValue', 'content', 'textContent'],
  element: ['element', 'node', 'domNode', 'elem'],
  elements: ['elements', 'nodes', 'nodeList'],
  container: ['container', 'parent', 'wrapper'],
  event: ['evt', 'eventObj'],
  item: ['item', 'entry', 'currentItem'],
  index: ['index', 'loopIndex'],
  key: ['propKey', 'propName', 'keyName'],
  array: ['items', 'list', 'collection', 'arrayVal'],
  arrayOrString: ['value', 'content'],
  date: ['dateValue', 'timestamp', 'dateObj'],
  timerId: ['timerId', 'timer', 'timeoutId'],
  intervalId: ['intervalId', 'interval', 'pollerId'],
  regex: ['regex', 'regexPattern', 'regexp'],
  error: ['error', 'exception', 'errorObj'],
  promise: ['promise', 'pending', 'deferred'],
  jsonString: ['jsonStr', 'serialized'],
  flag: ['flag', 'isValid', 'shouldProcess', 'enabled'],
  options: ['options', 'opts', 'settings'],
  fetchOptions: ['fetchOptions', 'requestOptions', 'httpOptions'],
  configObj: ['configObj', 'settings', 'configuration', 'payload'],
  config: ['configVal', 'settingsObj'],
  str: ['strValue', 'textVal', 'stringValue'],
  encodedStr: ['encoded', 'base64Str'],
  num: ['numValue', 'count', 'numberVal'],
  dimension: ['size', 'dimension', 'measure'],
  obj: ['record', 'dataObj'],
  accumulator: ['accumulated', 'accValue'],
  urlObj: ['urlObj', 'parsedUrl'],
  params: ['params', 'searchParams', 'queryParams'],
  observer: ['observer', 'mutationObserver', 'watcher'],
  mediaElement: ['media', 'player', 'audioEl', 'videoEl'],
  store: ['store', 'storeRef'],
  state: ['stateObj', 'historyState'],
  storedValue: ['storedValue', 'cached', 'saved'],
  value: ['value', 'valueRef'],
  spreadable: ['spreadItems', 'restParams'],
  nullable: ['nullable', 'maybeValue']
};

// Track used name suffixes per context
const usedSuffixes = new Map();

function generateName(varName, info) {
  const { contexts, hints } = info;

  if (contexts.length === 0) return null;

  // Prioritize certain contexts (more specific first)
  const priority = ['response', 'element', 'container', 'data', 'url', 'endpoint', 'event', 'error',
                    'result', 'item', 'index', 'timerId', 'intervalId', 'observer', 'flag',
                    'fetchOptions', 'configObj', 'options', 'array', 'str', 'date', 'params'];

  for (const ctx of priority) {
    if (contexts.includes(ctx)) {
      const candidates = contextToName[ctx] || [ctx];

      // Try to use hint to make name more specific
      if (hints.length > 0) {
        const hint = hints[0];
        // Camel case the hint
        const hintPart = hint
          .replace(/[^a-zA-Z0-9]/g, ' ')
          .split(' ')
          .filter(p => p.length > 0)
          .map((p, i) => i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
          .join('')
          .slice(0, 15);

        if (hintPart && hintPart.length > 2) {
          const specificName = hintPart + candidates[0].charAt(0).toUpperCase() + candidates[0].slice(1);
          if (!usedNames.has(specificName) && !reserved.has(specificName)) {
            return specificName;
          }
        }
      }

      // Use generic name from context
      for (const name of candidates) {
        if (!usedNames.has(name) && !reserved.has(name)) {
          return name;
        }
        // Try with number suffix
        for (let i = 2; i <= 99; i++) {
          const numbered = name + i;
          if (!usedNames.has(numbered) && !reserved.has(numbered)) {
            return numbered;
          }
        }
      }
    }
  }

  // Fallback to first context
  const ctx = contexts[0];
  const candidates = contextToName[ctx] || [ctx];
  for (const name of candidates) {
    if (!usedNames.has(name) && !reserved.has(name)) {
      return name;
    }
    // Try with number suffix
    for (let i = 2; i <= 99; i++) {
      const numbered = name + i;
      if (!usedNames.has(numbered) && !reserved.has(numbered)) {
        return numbered;
      }
    }
  }

  return null;
}

// ============================================================
// MAIN PROCESSING
// ============================================================

console.log('Analyzing code patterns...');

// Run all pattern matchers
for (const { pattern, handler } of patterns) {
  let match;
  const regex = new RegExp(pattern.source, pattern.flags);
  while ((match = regex.exec(code)) !== null) {
    handler(...match);
  }
}

console.log(`Found ${varInfo.size} variables with context`);

// Generate rename mapping
const renames = new Map();
let renamed = 0;

// Sort by context count (more context = more confident rename)
const sortedVars = [...varInfo.entries()].sort((a, b) =>
  b[1].contexts.length - a[1].contexts.length
);

for (const [varName, info] of sortedVars) {
  const newName = generateName(varName, info);
  if (newName && newName !== varName) {
    renames.set(varName, newName);
    usedNames.add(newName);
    renamed++;
  }
}

console.log(`Generated ${renamed} renames`);

// Sort renames by variable name length (longest first) to avoid partial replacements
const sortedRenames = [...renames.entries()].sort((a, b) => b[0].length - a[0].length);

// Apply renames (careful to only rename whole words)
for (const [oldName, newName] of sortedRenames) {
  // Escape special regex characters in the old name
  const escapedOld = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordBoundary = new RegExp(`\\b${escapedOld}\\b`, 'g');
  const before = code;
  code = code.replace(wordBoundary, newName);
  if (code !== before) {
    const varInfoEntry = varInfo.get(oldName);
    console.log(`  ${oldName} → ${newName} (${varInfoEntry?.contexts?.join(', ') || 'unknown'})`);
  }
}

// ============================================================
// OUTPUT
// ============================================================

if (outputFile) {
  fs.writeFileSync(outputFile, code);
  console.log(`\nOutput written to: ${outputFile}`);
}

console.log(`\nRenamed ${renamed} variables`);
