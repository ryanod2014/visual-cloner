#!/usr/bin/env node
/**
 * Function Renamer via Static Analysis
 *
 * Analyzes function bodies to infer meaningful names based on:
 * - Return value patterns
 * - DOM operations
 * - API calls
 * - Method calls on known objects
 */

const fs = require('fs');

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile) {
  console.log('Usage: node rename-functions.cjs <input.js> [output.js]');
  process.exit(1);
}

let code = fs.readFileSync(inputFile, 'utf8');

// ============================================================
// STEP 1: Extract function definitions
// ============================================================

const functions = new Map();

// Helper: extract balanced content (braces or parens)
function extractBalanced(str, startIdx, open = '{', close = '}') {
  if (str[startIdx] !== open) return null;
  let depth = 0;
  let i = startIdx;
  while (i < str.length) {
    const c = str[i];
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        return str.substring(startIdx, i + 1);
      }
    } else if (c === '"' || c === "'" || c === '`') {
      // Skip strings
      const quote = c;
      i++;
      while (i < str.length && str[i] !== quote) {
        if (str[i] === '\\') i++;
        i++;
      }
    }
    i++;
  }
  return null;
}

// Helper: extract function body starting after =>
function extractArrowBody(str, startIdx) {
  let i = startIdx;
  // Skip whitespace
  while (i < str.length && /\s/.test(str[i])) i++;

  if (str[i] === '{') {
    // Block body
    return extractBalanced(str, i, '{', '}');
  } else {
    // Expression body - find end (comma at depth 0 or semicolon)
    let depth = 0;
    let start = i;
    while (i < str.length) {
      const c = str[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if ((c === ',' || c === ';') && depth === 0) {
        return str.substring(start, i);
      } else if (c === '"' || c === "'" || c === '`') {
        const quote = c;
        i++;
        while (i < str.length && str[i] !== quote) {
          if (str[i] === '\\') i++;
          i++;
        }
      }
      i++;
    }
    return str.substring(start);
  }
}

// Pattern 1: NAME = (...) => ... or NAME = async (...) => ...
// This handles comma-separated assignments in minified code
const assignmentPattern = /\b([A-Z][a-zA-Z0-9]*|[a-z]{1,2})\s*=\s*(async\s*)?\(([^)]*)\)\s*=>/g;
let match;

while ((match = assignmentPattern.exec(code)) !== null) {
  const name = match[1];
  const params = match[3];
  const bodyStart = match.index + match[0].length;
  const body = extractArrowBody(code, bodyStart);
  if (body && !functions.has(name)) {
    functions.set(name, { params, body, type: 'arrow', index: match.index });
  }
}

// Pattern 2: NAME = element6 => ... (single param without parens)
const singleParamPattern = /\b([A-Z][a-zA-Z0-9]*|[a-z]{1,2})\s*=\s*(async\s*)?(\w+)\s*=>/g;
while ((match = singleParamPattern.exec(code)) !== null) {
  const name = match[1];
  const params = match[3];
  const bodyStart = match.index + match[0].length;
  const body = extractArrowBody(code, bodyStart);
  if (body && !functions.has(name)) {
    functions.set(name, { params, body, type: 'arrow-single', index: match.index });
  }
}

// Pattern 3: NAME = function(...) { ... }
const funcExprPattern = /\b([A-Z][a-zA-Z0-9]*|[a-z]{1,2})\s*=\s*(async\s*)?function\s*\(([^)]*)\)\s*\{/g;
while ((match = funcExprPattern.exec(code)) !== null) {
  const name = match[1];
  const params = match[3];
  const braceIdx = code.indexOf('{', match.index + match[0].length - 1);
  const body = extractBalanced(code, braceIdx, '{', '}');
  if (body && !functions.has(name)) {
    functions.set(name, { params, body, type: 'function-expr', index: match.index });
  }
}

// Pattern 4: function NAME(...) { ... }
const funcDeclPattern = /function\s+([A-Z][a-zA-Z0-9]*|[a-z]{1,2})\s*\(([^)]*)\)\s*\{/g;
while ((match = funcDeclPattern.exec(code)) !== null) {
  const name = match[1];
  const params = match[2];
  const braceIdx = code.indexOf('{', match.index + match[0].length - 1);
  const body = extractBalanced(code, braceIdx, '{', '}');
  if (body && !functions.has(name)) {
    functions.set(name, { params, body, type: 'function-decl', index: match.index });
  }
}

// Pattern 5: Objects with methods like Df = { debug: ..., info: ..., error: ... }
const objectPattern = /\b([A-Z][a-zA-Z0-9]*|[a-z]{1,2})\s*=\s*\{/g;
while ((match = objectPattern.exec(code)) !== null) {
  const name = match[1];
  const braceIdx = match.index + match[0].length - 1;
  const objBody = extractBalanced(code, braceIdx, '{', '}');
  if (objBody && !functions.has(name)) {
    // Check if it looks like a logger object
    if (objBody.includes('debug') && objBody.includes('error') && objBody.includes('info')) {
      functions.set(name, { params: '', body: objBody, type: 'object', inferredName: 'logger' });
    }
  }
}

console.log(`Found ${functions.size} function definitions`);

// ============================================================
// STEP 2: Infer names from patterns
// ============================================================

const renames = new Map();

// Track which inferred names are used to avoid duplicates
const usedNames = new Set();

function getUniqueName(baseName) {
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }
  let i = 2;
  while (usedNames.has(baseName + i)) i++;
  usedNames.add(baseName + i);
  return baseName + i;
}

for (const [name, info] of functions) {
  // Skip if already has a reasonable name (not just letters/numbers)
  if (name.length > 3 && !/^[A-Z][a-z]?[0-9]*$/.test(name) && !/^[a-z]{1,2}[0-9]*$/.test(name)) {
    continue;
  }

  const body = info.body || '';
  const params = info.params || '';
  let inferredName = null;

  // Already has an inferred name from object detection
  if (info.inferredName) {
    inferredName = info.inferredName;
  }

  // Pattern: jQuery wrapper - returns d.jQuery(...) or window.jQuery(...)
  else if (/[dw]\.jQuery\s*\(/.test(body) && body.length < 100) {
    inferredName = '$jq';
  }

  // Pattern: Element exists check - .length > 0 or .length > 0x0
  else if (/\.length\s*>\s*0/.test(body) && /#/.test(body) && body.length < 150) {
    inferredName = 'elementExists';
  }

  // Pattern: Wait for element - setInterval + clearInterval + selector
  else if (/setInterval/.test(body) && /clearInterval/.test(body) && /\.length\s*>/.test(body)) {
    if (/strValue|URL|url/i.test(body)) {
      inferredName = 'observeElement';
    } else {
      inferredName = 'waitForElement';
    }
  }

  // Pattern: Observe/watch - setInterval without clearInterval in same scope
  else if (/setInterval/.test(body) && !/clearInterval/.test(body)) {
    inferredName = 'pollElement';
  }

  // Pattern: API call with specific endpoint
  else if (/E\s*\(\s*\{/.test(body) || /fetch\s*\(/.test(body)) {
    if (/url['"]?\s*:\s*['"]\/auth/.test(body)) {
      inferredName = 'authenticate';
    } else if (/url['"]?\s*:\s*['"]\/contact['"s]?/.test(body)) {
      if (/campaign/i.test(body)) {
        inferredName = 'getCampaignContacts';
      } else if (params.includes(',')) {
        inferredName = 'getContacts';
      } else {
        inferredName = 'getContact';
      }
    } else if (/url['"]?\s*:\s*['"]\/campaign/.test(body)) {
      inferredName = 'createCampaign';
    } else if (/url['"]?\s*:\s*['"]\/stage/.test(body)) {
      inferredName = 'getCampaignByStage';
    } else if (/url['"]?\s*:\s*['"]\/tags/.test(body)) {
      inferredName = 'addTags';
    } else if (/url['"]?\s*:\s*['"]\/notes/.test(body)) {
      inferredName = 'addNote';
    } else if (/url['"]?\s*:\s*['"]\/locations/.test(body)) {
      inferredName = 'getLocations';
    } else if (/url['"]?\s*:\s*['"]\/recordings/.test(body)) {
      inferredName = 'getRecordings';
    } else if (/url['"]?\s*:\s*['"]\/conversations/.test(body)) {
      inferredName = 'getConversation';
    } else if (/fetch\s*\(/.test(body) && /await/.test(body)) {
      inferredName = 'fetchApi';
    }
  }

  // Pattern: Encodes data with Base64
  else if (/Base64\.encode/.test(body)) {
    inferredName = 'encryptedFetch';
  }

  // Pattern: Get contact ID from URL
  else if (/\/contacts\/detail\//.test(body) || /\/conversations\//.test(body)) {
    if (/contactId/.test(body)) {
      inferredName = 'getContactIdFromUrl';
    }
  }

  // Pattern: Render/create UI element
  else if (/createElement|innerHTML|\.html\(|\.append\(|<div|<img|<svg/.test(body)) {
    if (/tooltip/i.test(body)) {
      inferredName = 'showTooltip';
    } else if (/hide\(\)/.test(body) && body.length < 100) {
      inferredName = 'hideTooltip';
    } else if (/button/i.test(body) && /<span|<button/.test(body)) {
      inferredName = 'createButton';
    } else if (/dialer/i.test(body)) {
      inferredName = 'renderDialerButton';
    } else if (/dropdown|menu/i.test(body)) {
      inferredName = 'showDropdown';
    } else if (/sidebar|nav/i.test(body)) {
      inferredName = 'setupSidebar';
    } else if (/<div/.test(body) && /append/.test(body)) {
      inferredName = 'renderElement';
    }
  }

  // Pattern: Hide element - .hide() call
  else if (/\.hide\s*\(\s*\)/.test(body) && body.length < 100) {
    inferredName = 'hideElement';
  }

  // Pattern: Show element - .show() call
  else if (/\.show\s*\(\s*\)/.test(body) && body.length < 100) {
    inferredName = 'showElement';
  }

  // Pattern: Event handler setup
  else if (/addEventListener|\.on\s*\(|\.click\s*\(/.test(body)) {
    if (/smart_?list/i.test(body)) {
      inferredName = 'setupSmartlistHandlers';
    } else if (/phone/i.test(body)) {
      inferredName = 'setupPhoneHandlers';
    } else if (/opportunity|opportunities/i.test(body)) {
      inferredName = 'setupOpportunityHandlers';
    } else if (/contact/i.test(body)) {
      inferredName = 'setupContactHandlers';
    }
  }

  // Pattern: Dialer/call related
  else if (/WavvDialer|callPhone|WAVV\.dispatch/.test(body)) {
    if (/callPhone/.test(body)) {
      inferredName = 'callContact';
    } else if (/startCampaign/.test(body)) {
      inferredName = 'startEmptyCampaign';
    } else if (/LOAD_CAMPAIGN/.test(body)) {
      inferredName = 'loadCampaign';
    } else if (/init\s*\(/.test(body)) {
      inferredName = 'initDialer';
    } else if (/openSettings/.test(body)) {
      inferredName = 'openSettings';
    } else if (/addDialerVisibleListener|addLinesChangedListener/.test(body)) {
      inferredName = 'setupDialerListeners';
    }
  }

  // Pattern: URL/routing
  else if (/history\.pushState|pathname|location\.href/.test(body)) {
    if (/pushState/.test(body)) {
      inferredName = 'navigateTo';
    } else if (/includes\s*\(/.test(body)) {
      inferredName = 'checkRoute';
    }
  }

  // Pattern: Script loading
  else if (/createElement\s*\(\s*['"]script/.test(body) || /\.src\s*=/.test(body) && /body\.appendChild/.test(body)) {
    inferredName = 'loadScript';
  }

  // Pattern: Format phone number
  else if (/replace.*\d|phone|number/i.test(body) && /format/i.test(name)) {
    inferredName = 'formatPhoneNumber';
  }

  // Pattern: Data URI / SVG
  else if (/data:image|svg\+xml/.test(body)) {
    inferredName = 'toDataUri';
  }

  // Pattern: Get location ID
  else if (/location.*id|locationId/i.test(body) && body.length < 200) {
    inferredName = 'getLocationId';
  }

  // Pattern: Check selected items
  else if (/checkbox.*checked|:checked/.test(body)) {
    inferredName = 'getSelectedContacts';
  }

  // Pattern: Show dialog/modal/alert
  else if (/modal|dialog|alert|message/i.test(body) && /show|display|visible/i.test(body)) {
    inferredName = 'showDialog';
  }

  // Pattern: Close/dismiss
  else if (/close|dismiss|hide/i.test(body) && body.length < 150) {
    inferredName = 'closeDialog';
  }

  // Pattern: Router/page handler
  else if (/pathname|smart_list|contacts\/detail|opportunities\/list/.test(body) && body.length > 500) {
    inferredName = 'handleRouteChange';
  }

  // Pattern: Main polling/check function
  else if (/lastUrl|setInterval.*\d{3}/.test(body) && body.length < 300) {
    inferredName = 'checkForUrlChange';
  }

  // Pattern: Start polling
  else if (/setInterval.*checkForUrlChange|setInterval.*handleRoute/i.test(body)) {
    inferredName = 'startUrlWatcher';
  }

  // Pattern: Sign in detection
  else if (/Sign into|login|sign.*in/i.test(body)) {
    inferredName = 'checkSignInPage';
  }

  // Pattern: Environment indicator
  else if (/wavv\.com\/ghl|env|environment/i.test(body) && /header|prepend/i.test(body)) {
    inferredName = 'showEnvIndicator';
  }

  // Pattern: Phone icon handlers
  else if (/phone.*icon|wavv-phone/i.test(body)) {
    inferredName = 'addPhoneIcons';
  }

  // Pattern: Notes/recordings display
  else if (/notes.*list|recording|WAVV:/i.test(body) && /audio|play/i.test(body)) {
    inferredName = 'enhanceCallNotes';
  }

  // Pattern: Tooltip positioning
  else if (/offset|top|left|transform|translate3d/i.test(body) && /tooltip/i.test(body)) {
    inferredName = 'positionTooltip';
  }

  // Pattern: Create dialer containers
  else if (/wavv-dialer-mini|wavv-dialer-minimized/.test(body) && /append/.test(body)) {
    inferredName = 'createDialerContainers';
  }

  // Pattern: Create tooltip element
  else if (/tooltip.*fade|bs-tooltip/.test(body) && /append/.test(body)) {
    inferredName = 'createTooltipElement';
  }

  // Pattern: Button creator utility
  else if (/btn.*btn-light|button.*type/i.test(body) && /<span|<button/.test(body) && /return/.test(body)) {
    inferredName = 'createToolbarButton';
  }

  // Pattern: Phone button component
  else if (/dialer\.svg|Call.*button/i.test(body) && /background-color|border-radius/.test(body)) {
    inferredName = 'createCallButton';
  }

  // Pattern: Menu item creator
  else if (/display:\s*flex|cursor:\s*pointer/.test(body) && /mouseenter|mouseleave/.test(body) && /click/.test(body)) {
    inferredName = 'createMenuItem';
  }

  // If we found a name, add to renames
  if (inferredName) {
    const uniqueName = getUniqueName(inferredName);
    renames.set(name, uniqueName);
    console.log(`  ${name} → ${uniqueName}`);
  }
}

// ============================================================
// STEP 3: Apply renames
// ============================================================

console.log(`\nRenaming ${renames.size} functions...`);

// Sort by name length descending to avoid partial replacements
const sortedRenames = [...renames.entries()].sort((a, b) => b[0].length - a[0].length);

for (const [oldName, newName] of sortedRenames) {
  // Replace all occurrences of the function name
  // Be careful to only replace whole words
  const pattern = new RegExp(`\\b${oldName}\\b`, 'g');
  code = code.replace(pattern, newName);
}

// ============================================================
// OUTPUT
// ============================================================

console.log(`\nRenamed ${renames.size} functions`);

if (outputFile) {
  fs.writeFileSync(outputFile, code);
  console.log(`Output written to: ${outputFile}`);
} else {
  process.stdout.write(code);
}
