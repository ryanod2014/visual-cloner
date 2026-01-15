/**
 * EXHAUSTIVE AST ANALYZER
 *
 * Extracts EVERYTHING from JavaScript source code:
 * - All keyboard shortcuts (every possible pattern)
 * - All canvas operations and blending modes
 * - All menu construction
 * - All tool definitions
 * - All event handlers
 * - All API calls
 * - All string literals (potential UI labels)
 *
 * Uses both AST parsing AND regex fallback for minified code.
 */

const parser = require('@babel/parser');
const acorn = require('acorn');
const walk = require('acorn-walk');

// All 27 canvas blending modes to search for
const BLENDING_MODES = [
  'source-over', 'source-in', 'source-out', 'source-atop',
  'destination-over', 'destination-in', 'destination-out', 'destination-atop',
  'lighter', 'copy', 'xor', 'multiply', 'screen', 'overlay',
  'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light',
  'soft-light', 'difference', 'exclusion', 'hue', 'saturation',
  'color', 'luminosity'
];

// Common key names
const KEY_NAMES = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'Enter', 'Escape', 'Backspace', 'Tab', 'Delete', 'Insert',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown', 'Space', ' ',
  '+', '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/'
];

// Key codes for older event handling
const KEY_CODES = {
  8: 'Backspace', 9: 'Tab', 13: 'Enter', 16: 'Shift', 17: 'Ctrl', 18: 'Alt',
  27: 'Escape', 32: 'Space', 33: 'PageUp', 34: 'PageDown', 35: 'End', 36: 'Home',
  37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown',
  45: 'Insert', 46: 'Delete',
  48: '0', 49: '1', 50: '2', 51: '3', 52: '4', 53: '5', 54: '6', 55: '7', 56: '8', 57: '9',
  65: 'a', 66: 'b', 67: 'c', 68: 'd', 69: 'e', 70: 'f', 71: 'g', 72: 'h', 73: 'i',
  74: 'j', 75: 'k', 76: 'l', 77: 'm', 78: 'n', 79: 'o', 80: 'p', 81: 'q', 82: 'r',
  83: 's', 84: 't', 85: 'u', 86: 'v', 87: 'w', 88: 'x', 89: 'y', 90: 'z',
  112: 'F1', 113: 'F2', 114: 'F3', 115: 'F4', 116: 'F5', 117: 'F6',
  118: 'F7', 119: 'F8', 120: 'F9', 121: 'F10', 122: 'F11', 123: 'F12',
  186: ';', 187: '=', 188: ',', 189: '-', 190: '.', 191: '/', 192: '`',
  219: '[', 220: '\\', 221: ']', 222: "'"
};

/**
 * Main analysis function - extracts everything from all scripts
 */
function analyzeASTExhaustive(scripts) {
  const results = {
    shortcuts: [],
    blendingModes: [],
    canvasOperations: [],
    webglOperations: [],
    menuItems: [],
    toolDefinitions: [],
    eventHandlers: [],
    apiCalls: [],
    domMutations: [],
    stringLiterals: [],
    functions: [],
    callGraph: {},
    stats: {
      totalScripts: scripts.length,
      totalBytes: 0,
      parsedAST: 0,
      parsedRegex: 0,
      failed: 0
    }
  };

  for (const script of scripts) {
    if (!script.content || script.content.length < 10) continue;

    results.stats.totalBytes += script.content.length;

    // Try AST parsing first (more accurate)
    const astResults = parseWithAST(script.content, script.url);
    if (astResults) {
      results.stats.parsedAST++;
      mergeResults(results, astResults);
    } else {
      results.stats.failed++;
    }

    // Always do regex extraction (catches minified code AST misses)
    const regexResults = parseWithRegex(script.content, script.url);
    results.stats.parsedRegex++;
    mergeResults(results, regexResults, true); // dedupe=true
  }

  // Deduplicate results
  results.shortcuts = dedupeByKey(results.shortcuts, s => `${s.key}-${s.modifiers?.sort().join(',')}`);
  results.blendingModes = [...new Set(results.blendingModes)];
  results.canvasOperations = dedupeByKey(results.canvasOperations, o => o.method);
  results.menuItems = dedupeByKey(results.menuItems, m => m.label || m.path?.join('/'));
  results.toolDefinitions = dedupeByKey(results.toolDefinitions, t => t.name || t.id);

  // Build summary
  results.summary = {
    shortcuts: results.shortcuts.length,
    blendingModes: results.blendingModes.length,
    canvasOperations: results.canvasOperations.length,
    webglOperations: results.webglOperations.length,
    menuItems: results.menuItems.length,
    toolDefinitions: results.toolDefinitions.length,
    eventHandlers: results.eventHandlers.length,
    apiCalls: results.apiCalls.length,
    functions: results.functions.length,
    stringLiterals: results.stringLiterals.length
  };

  return results;
}

/**
 * Parse with Babel AST (handles modern JS better)
 */
function parseWithAST(code, sourceUrl) {
  let ast;

  // Try Babel parser first (handles more syntax)
  try {
    ast = parser.parse(code, {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'typescript', 'classProperties', 'decorators-legacy'],
      errorRecovery: true
    });
  } catch (e) {
    // Fall back to Acorn
    try {
      ast = acorn.parse(code, {
        ecmaVersion: 2022,
        sourceType: 'module',
        allowHashBang: true,
        locations: true,
        onComment: () => {} // Ignore comments
      });
    } catch (e2) {
      // Try as script
      try {
        ast = acorn.parse(code, {
          ecmaVersion: 2022,
          sourceType: 'script',
          allowHashBang: true,
          locations: true
        });
      } catch (e3) {
        return null; // Can't parse, will use regex
      }
    }
  }

  const results = {
    shortcuts: [],
    blendingModes: [],
    canvasOperations: [],
    webglOperations: [],
    menuItems: [],
    toolDefinitions: [],
    eventHandlers: [],
    apiCalls: [],
    domMutations: [],
    stringLiterals: [],
    functions: []
  };

  // Use acorn-walk for traversal (works with both Babel and Acorn ASTs)
  try {
    walkAST(ast, results, sourceUrl);
  } catch (e) {
    // Walk failed, return partial results
  }

  return results;
}

/**
 * Walk AST and extract everything
 */
function walkAST(ast, results, sourceUrl) {
  const body = ast.program?.body || ast.body || [];

  function visit(node, parent) {
    if (!node || typeof node !== 'object') return;

    const nodeType = node.type;

    // Extract string literals
    if (nodeType === 'StringLiteral' || (nodeType === 'Literal' && typeof node.value === 'string')) {
      const value = node.value;
      if (value && value.length > 1 && value.length < 100) {
        results.stringLiterals.push(value);

        // Check if it's a blending mode
        if (BLENDING_MODES.includes(value)) {
          results.blendingModes.push(value);
        }

        // Check if it could be a key name
        if (KEY_NAMES.includes(value) || value.match(/^[A-Z]$/)) {
          // Might be a keyboard shortcut - will be confirmed by context
        }
      }
    }

    // Extract function declarations
    if (nodeType === 'FunctionDeclaration' || nodeType === 'FunctionExpression' ||
        nodeType === 'ArrowFunctionExpression') {
      const name = node.id?.name || getAssignedName(parent) || 'anonymous';
      results.functions.push({
        name,
        type: nodeType,
        loc: node.loc,
        sourceUrl,
        params: node.params?.map(p => p.name || p.left?.name || '...').filter(Boolean)
      });
    }

    // Extract call expressions
    if (nodeType === 'CallExpression') {
      extractCallExpression(node, results, sourceUrl);
    }

    // Extract member expressions for canvas/WebGL
    if (nodeType === 'MemberExpression') {
      extractMemberExpression(node, results);
    }

    // Extract binary expressions for keyboard shortcuts
    if (nodeType === 'BinaryExpression') {
      extractKeyboardShortcut(node, results);
    }

    // Extract switch statements for keyboard handling
    if (nodeType === 'SwitchStatement') {
      extractSwitchShortcuts(node, results);
    }

    // Extract object expressions for tool/menu definitions
    if (nodeType === 'ObjectExpression') {
      extractObjectDefinitions(node, results, parent);
    }

    // Extract array expressions for menu/tool arrays
    if (nodeType === 'ArrayExpression') {
      extractArrayDefinitions(node, results, parent);
    }

    // Recurse into children
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'range') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(c => visit(c, node));
      } else if (child && typeof child === 'object') {
        visit(child, node);
      }
    }
  }

  body.forEach(node => visit(node, null));
}

/**
 * Extract information from call expressions
 */
function extractCallExpression(node, results, sourceUrl) {
  const callee = getCalleeName(node.callee);
  const args = node.arguments || [];

  // Event listeners
  if (callee.includes('addEventListener')) {
    const eventType = getStringValue(args[0]);
    if (eventType) {
      results.eventHandlers.push({
        type: eventType,
        callee,
        loc: node.loc,
        sourceUrl
      });

      // If it's a keyboard event, try to extract the shortcuts from the handler
      if (eventType === 'keydown' || eventType === 'keyup' || eventType === 'keypress') {
        extractShortcutsFromHandler(args[1], results);
      }
    }
  }

  // Canvas 2D operations
  const canvas2DMethods = [
    'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'measureText',
    'drawImage', 'createImageData', 'getImageData', 'putImageData',
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo',
    'arc', 'arcTo', 'ellipse', 'rect', 'fill', 'stroke', 'clip',
    'save', 'restore', 'scale', 'rotate', 'translate', 'transform', 'setTransform',
    'createLinearGradient', 'createRadialGradient', 'createPattern'
  ];

  for (const method of canvas2DMethods) {
    if (callee.endsWith('.' + method) || callee === method) {
      results.canvasOperations.push({
        method,
        callee,
        loc: node.loc
      });
      break;
    }
  }

  // WebGL operations
  const webglMethods = [
    'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced',
    'createShader', 'shaderSource', 'compileShader', 'createProgram', 'attachShader',
    'linkProgram', 'useProgram', 'createBuffer', 'bindBuffer', 'bufferData',
    'createTexture', 'bindTexture', 'texImage2D', 'texParameteri',
    'enable', 'disable', 'blendFunc', 'blendFuncSeparate', 'blendEquation',
    'viewport', 'clear', 'clearColor', 'clearDepth', 'clearStencil'
  ];

  for (const method of webglMethods) {
    if (callee.endsWith('.' + method) || callee === method) {
      results.webglOperations.push({
        method,
        callee,
        loc: node.loc
      });
      break;
    }
  }

  // API calls
  if (callee === 'fetch' || callee.includes('.fetch') ||
      callee.includes('axios') || callee.includes('XMLHttpRequest') ||
      callee.includes('.get') || callee.includes('.post') ||
      callee.includes('.put') || callee.includes('.delete')) {
    const url = getStringValue(args[0]);
    results.apiCalls.push({
      type: callee.includes('fetch') ? 'fetch' : callee.includes('axios') ? 'axios' : 'xhr',
      callee,
      url,
      loc: node.loc
    });
  }

  // DOM mutations
  const domMethods = [
    'appendChild', 'removeChild', 'insertBefore', 'replaceChild', 'remove',
    'createElement', 'createTextNode', 'cloneNode',
    'setAttribute', 'removeAttribute', 'toggleAttribute',
    'insertAdjacentHTML', 'insertAdjacentElement', 'append', 'prepend'
  ];

  for (const method of domMethods) {
    if (callee.endsWith('.' + method)) {
      results.domMutations.push({
        method,
        callee,
        loc: node.loc
      });
      break;
    }
  }

  // Hotkey libraries
  if (callee.includes('hotkey') || callee.includes('Mousetrap') ||
      callee.includes('keymaster') || callee.includes('shortcut')) {
    const shortcutStr = getStringValue(args[0]);
    if (shortcutStr) {
      const parsed = parseShortcutString(shortcutStr);
      if (parsed) {
        results.shortcuts.push(parsed);
      }
    }
  }

  // Menu creation patterns
  if (callee.includes('MenuItem') || callee.includes('createMenu') ||
      callee.includes('addMenu') || callee.includes('menuItem')) {
    const label = getStringValue(args[0]) || getStringValue(args[1]);
    if (label) {
      results.menuItems.push({
        label,
        callee,
        loc: node.loc
      });
    }
  }
}

/**
 * Extract from member expressions (assignments to canvas properties)
 */
function extractMemberExpression(node, results) {
  const prop = node.property?.name || node.property?.value;

  // globalCompositeOperation assignments
  if (prop === 'globalCompositeOperation') {
    results.canvasOperations.push({
      method: 'globalCompositeOperation',
      type: 'property'
    });
  }

  // WebGL state
  if (prop === 'BLEND' || prop === 'SRC_ALPHA' || prop === 'ONE_MINUS_SRC_ALPHA') {
    results.webglOperations.push({
      method: prop,
      type: 'constant'
    });
  }
}

/**
 * Extract keyboard shortcuts from binary expressions like e.key === 'a'
 */
function extractKeyboardShortcut(node, results) {
  const left = node.left;
  const right = node.right;
  const op = node.operator;

  if (op !== '===' && op !== '==' && op !== '!==' && op !== '!=') return;

  // e.key === 'x' or 'x' === e.key
  const keyCheck = extractKeyCheck(left, right) || extractKeyCheck(right, left);
  if (keyCheck) {
    results.shortcuts.push(keyCheck);
  }

  // e.keyCode === 65
  const keyCodeCheck = extractKeyCodeCheck(left, right) || extractKeyCodeCheck(right, left);
  if (keyCodeCheck) {
    results.shortcuts.push(keyCodeCheck);
  }
}

/**
 * Extract key check from e.key === 'x' pattern
 */
function extractKeyCheck(member, literal) {
  if (member?.type !== 'MemberExpression') return null;

  const prop = member.property?.name;
  if (prop !== 'key' && prop !== 'code') return null;

  const value = literal?.value;
  if (typeof value !== 'string') return null;

  return {
    key: value,
    keyProperty: prop,
    modifiers: [] // Will be filled by context analysis
  };
}

/**
 * Extract key code check from e.keyCode === 65 pattern
 */
function extractKeyCodeCheck(member, literal) {
  if (member?.type !== 'MemberExpression') return null;

  const prop = member.property?.name;
  if (prop !== 'keyCode' && prop !== 'which' && prop !== 'charCode') return null;

  const code = literal?.value;
  if (typeof code !== 'number') return null;

  const keyName = KEY_CODES[code];
  if (!keyName) return null;

  return {
    key: keyName,
    keyCode: code,
    keyProperty: prop,
    modifiers: []
  };
}

/**
 * Extract shortcuts from switch statements
 */
function extractSwitchShortcuts(node, results) {
  const discriminant = node.discriminant;

  // Check if switching on e.key, e.keyCode, etc.
  const prop = discriminant?.property?.name;
  if (prop !== 'key' && prop !== 'keyCode' && prop !== 'code' && prop !== 'which') return;

  const isKeyCode = prop === 'keyCode' || prop === 'which';

  for (const caseNode of node.cases || []) {
    const test = caseNode.test;
    if (!test) continue; // default case

    let key;
    if (isKeyCode && typeof test.value === 'number') {
      key = KEY_CODES[test.value];
    } else if (typeof test.value === 'string') {
      key = test.value;
    }

    if (key) {
      results.shortcuts.push({
        key,
        keyProperty: prop,
        modifiers: [],
        fromSwitch: true
      });
    }
  }
}

/**
 * Extract tool/menu definitions from object expressions
 */
function extractObjectDefinitions(node, results, parent) {
  const props = {};
  for (const prop of node.properties || []) {
    const key = prop.key?.name || prop.key?.value;
    const value = prop.value;
    if (key && value) {
      if (value.type === 'StringLiteral' || (value.type === 'Literal' && typeof value.value === 'string')) {
        props[key] = value.value;
      }
    }
  }

  // Tool definition patterns
  if (props.name || props.id || props.tool || props.label) {
    const name = props.name || props.id || props.tool || props.label;

    // Check if this looks like a tool definition
    if (props.icon || props.cursor || props.action || props.shortcut || props.onClick) {
      results.toolDefinitions.push({
        name,
        id: props.id,
        icon: props.icon,
        cursor: props.cursor,
        shortcut: props.shortcut,
        type: 'tool'
      });
    }

    // Check if this looks like a menu item
    if (props.submenu || props.items || props.children || props.command || props.action) {
      results.menuItems.push({
        label: name,
        command: props.command || props.action,
        shortcut: props.shortcut || props.accelerator,
        type: 'menu'
      });
    }
  }

  // Check for blending mode in properties
  if (props.blendMode || props.blend || props.compositeOperation) {
    const mode = props.blendMode || props.blend || props.compositeOperation;
    if (BLENDING_MODES.includes(mode)) {
      results.blendingModes.push(mode);
    }
  }
}

/**
 * Extract from array expressions (tool lists, menu arrays)
 */
function extractArrayDefinitions(node, results, parent) {
  // Get the variable name this array is assigned to
  const varName = parent?.id?.name || parent?.left?.name || '';
  const lowerName = varName.toLowerCase();

  const isToolArray = lowerName.includes('tool') || lowerName.includes('instrument');
  const isMenuArray = lowerName.includes('menu') || lowerName.includes('item');
  const isModeArray = lowerName.includes('mode') || lowerName.includes('blend');

  for (const elem of node.elements || []) {
    // String elements in arrays
    if (elem?.type === 'StringLiteral' || (elem?.type === 'Literal' && typeof elem.value === 'string')) {
      const value = elem.value;

      if (isModeArray && BLENDING_MODES.includes(value)) {
        results.blendingModes.push(value);
      }
      if (isToolArray) {
        results.toolDefinitions.push({ name: value, type: 'array-item' });
      }
      if (isMenuArray) {
        results.menuItems.push({ label: value, type: 'array-item' });
      }
    }
  }
}

/**
 * Parse with regex for minified code (fallback)
 */
function parseWithRegex(code, sourceUrl) {
  const results = {
    shortcuts: [],
    blendingModes: [],
    canvasOperations: [],
    webglOperations: [],
    menuItems: [],
    toolDefinitions: [],
    eventHandlers: [],
    apiCalls: [],
    stringLiterals: []
  };

  // Find all blending modes
  for (const mode of BLENDING_MODES) {
    const regex = new RegExp(`['"\`]${mode}['"\`]`, 'gi');
    if (regex.test(code)) {
      results.blendingModes.push(mode);
    }
  }

  // Find keyboard shortcuts patterns
  // Pattern: e.key === 'x' or e.key == 'x'
  const keyPatterns = code.matchAll(/\.key\s*[!=]==?\s*['"`]([^'"`]+)['"`]/g);
  for (const match of keyPatterns) {
    results.shortcuts.push({
      key: match[1],
      pattern: 'e.key',
      source: 'regex'
    });
  }

  // Pattern: e.keyCode === 65
  const keyCodePatterns = code.matchAll(/\.keyCode\s*[!=]==?\s*(\d+)/g);
  for (const match of keyCodePatterns) {
    const keyCode = parseInt(match[1]);
    const keyName = KEY_CODES[keyCode];
    if (keyName) {
      results.shortcuts.push({
        key: keyName,
        keyCode,
        pattern: 'e.keyCode',
        source: 'regex'
      });
    }
  }

  // Pattern: case 'KeyA': or case 65:
  const casePatterns = code.matchAll(/case\s+['"`]?(\w+)['"`]?\s*:/g);
  for (const match of casePatterns) {
    const value = match[1];
    // Check if it's a key code number
    if (/^\d+$/.test(value)) {
      const keyName = KEY_CODES[parseInt(value)];
      if (keyName) {
        results.shortcuts.push({ key: keyName, pattern: 'switch-case', source: 'regex' });
      }
    }
    // Check if it's a key name
    else if (KEY_NAMES.includes(value) || value.match(/^Key[A-Z]$/) || value.match(/^F\d+$/)) {
      results.shortcuts.push({ key: value.replace('Key', ''), pattern: 'switch-case', source: 'regex' });
    }
  }

  // Pattern: ctrlKey && key patterns
  const modifierPatterns = code.matchAll(/([a-z]+Key)\s*&&/gi);
  for (const match of modifierPatterns) {
    // This indicates modifier usage, context needed for full shortcut
  }

  // Pattern: hotkey strings like 'ctrl+s', 'cmd+shift+a'
  const hotkeyPatterns = code.matchAll(/['"`]((?:ctrl|cmd|alt|shift|meta)[+\-][\w+\-]+)['"`]/gi);
  for (const match of hotkeyPatterns) {
    const parsed = parseShortcutString(match[1]);
    if (parsed) {
      results.shortcuts.push({ ...parsed, source: 'regex' });
    }
  }

  // Find canvas operations
  const canvasMethods = [
    'fillRect', 'strokeRect', 'clearRect', 'drawImage', 'fillText', 'strokeText',
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'fill', 'stroke',
    'save', 'restore', 'scale', 'rotate', 'translate', 'transform',
    'createLinearGradient', 'createRadialGradient', 'getImageData', 'putImageData'
  ];

  for (const method of canvasMethods) {
    const regex = new RegExp(`\\.${method}\\s*\\(`, 'g');
    if (regex.test(code)) {
      results.canvasOperations.push({ method, source: 'regex' });
    }
  }

  // Find globalCompositeOperation assignments
  const compositeMatches = code.matchAll(/globalCompositeOperation\s*=\s*['"`]([^'"`]+)['"`]/g);
  for (const match of compositeMatches) {
    if (BLENDING_MODES.includes(match[1])) {
      results.blendingModes.push(match[1]);
    }
  }

  // Find WebGL operations
  const webglMethods = [
    'drawArrays', 'drawElements', 'createShader', 'shaderSource', 'compileShader',
    'createProgram', 'useProgram', 'createBuffer', 'bindBuffer', 'bufferData',
    'createTexture', 'bindTexture', 'texImage2D', 'blendFunc', 'enable', 'disable'
  ];

  for (const method of webglMethods) {
    const regex = new RegExp(`\\.${method}\\s*\\(`, 'g');
    if (regex.test(code)) {
      results.webglOperations.push({ method, source: 'regex' });
    }
  }

  // Find event listeners
  const eventPatterns = code.matchAll(/addEventListener\s*\(\s*['"`](\w+)['"`]/g);
  for (const match of eventPatterns) {
    results.eventHandlers.push({ type: match[1], source: 'regex' });
  }

  // Find fetch/API calls
  const fetchPatterns = code.matchAll(/fetch\s*\(\s*['"`]([^'"`]+)['"`]/g);
  for (const match of fetchPatterns) {
    results.apiCalls.push({ type: 'fetch', url: match[1], source: 'regex' });
  }

  // Find tool-like strings (capitalized words that look like tool names)
  const toolPatterns = code.matchAll(/['"`]((?:Brush|Pencil|Eraser|Lasso|Selection|Move|Zoom|Hand|Crop|Eyedropper|Paint|Fill|Gradient|Text|Shape|Line|Rectangle|Ellipse|Polygon|Path|Pen|Clone|Stamp|Heal|Dodge|Burn|Sponge|Smudge|Blur|Sharpen|Wand|Magic)[^'"`]*)['"`]/gi);
  for (const match of toolPatterns) {
    results.toolDefinitions.push({ name: match[1], source: 'regex' });
  }

  // Find menu-like strings
  const menuPatterns = code.matchAll(/['"`]((?:File|Edit|View|Image|Layer|Filter|Select|Window|Help|New|Open|Save|Export|Import|Undo|Redo|Cut|Copy|Paste|Delete|Preferences|Settings)[^'"`]*)['"`]/gi);
  for (const match of menuPatterns) {
    results.menuItems.push({ label: match[1], source: 'regex' });
  }

  return results;
}

/**
 * Parse shortcut string like 'ctrl+shift+s' into structured format
 */
function parseShortcutString(str) {
  if (!str) return null;

  const parts = str.toLowerCase().split(/[+\-]/);
  const modifiers = [];
  let key = null;

  for (const part of parts) {
    const p = part.trim();
    if (p === 'ctrl' || p === 'control') modifiers.push('ctrl');
    else if (p === 'cmd' || p === 'meta' || p === 'command') modifiers.push('meta');
    else if (p === 'alt' || p === 'option') modifiers.push('alt');
    else if (p === 'shift') modifiers.push('shift');
    else if (p) key = p;
  }

  if (!key) return null;

  return { key, modifiers: [...new Set(modifiers)], pattern: 'hotkey-string' };
}

/**
 * Extract shortcuts from handler function body
 */
function extractShortcutsFromHandler(handler, results) {
  // This would recursively analyze the handler function
  // For now, shortcuts are extracted from the global AST walk
}

/**
 * Get string value from AST node
 */
function getStringValue(node) {
  if (!node) return null;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

/**
 * Get callee name from AST node
 */
function getCalleeName(node) {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') {
    const obj = getCalleeName(node.object);
    const prop = node.property?.name || node.property?.value || '[]';
    return `${obj}.${prop}`;
  }
  return '';
}

/**
 * Get assigned name from parent context
 */
function getAssignedName(parent) {
  if (!parent) return null;
  if (parent.type === 'VariableDeclarator') return parent.id?.name;
  if (parent.type === 'AssignmentExpression') return parent.left?.name;
  if (parent.type === 'Property') return parent.key?.name;
  return null;
}

/**
 * Merge results, optionally deduplicating
 */
function mergeResults(target, source, dedupe = false) {
  for (const key of Object.keys(source)) {
    if (Array.isArray(source[key])) {
      if (dedupe) {
        // Simple dedup for primitives
        const existing = new Set(target[key].map(x => JSON.stringify(x)));
        for (const item of source[key]) {
          const str = JSON.stringify(item);
          if (!existing.has(str)) {
            target[key].push(item);
            existing.add(str);
          }
        }
      } else {
        target[key].push(...source[key]);
      }
    }
  }
}

/**
 * Deduplicate array by key function
 */
function dedupeByKey(arr, keyFn) {
  const seen = new Set();
  return arr.filter(item => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { analyzeASTExhaustive, BLENDING_MODES, KEY_CODES };
