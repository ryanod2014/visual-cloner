/**
 * discovery.js - Programmatic Discovery of Interactive Elements
 *
 * This module handles automatic discovery of all interactive elements,
 * event listeners, keyboard shortcuts, and API functions. No manual lists -
 * everything is discovered programmatically from the live page.
 */

// ============================================================================
// ELEMENT DISCOVERY
// ============================================================================

/**
 * Discover ALL interactive elements in current DOM
 * @param {import('playwright').Page} page - Playwright page instance
 * @returns {Promise<Array>} Array of element descriptors
 */
async function discoverElements(page) {
  try {
    return await page.evaluate(() => {
      const results = [];

      // Helper: Check if element is visible
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          style.opacity !== '0'
        );
      };

      // Helper: Check if element is clickable
      const isClickable = (el) => {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role');
        const style = window.getComputedStyle(el);

        // Inherently clickable elements
        if (['a', 'button', 'input', 'select', 'textarea'].includes(tag)) return true;
        // Role-based clickability
        if (['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio'].includes(role)) return true;
        // Cursor indicates clickability
        if (style.cursor === 'pointer') return true;
        // Has onclick attribute
        if (el.hasAttribute('onclick')) return true;

        return false;
      };

      // Helper: Check if element is focusable
      const isFocusable = (el) => {
        const tag = el.tagName.toLowerCase();
        const tabindex = el.getAttribute('tabindex');

        // Inherently focusable elements
        if (['input', 'select', 'textarea', 'button', 'a'].includes(tag)) return true;
        // Has positive tabindex
        if (tabindex !== null && parseInt(tabindex, 10) >= 0) return true;
        // contenteditable
        if (el.isContentEditable) return true;

        return false;
      };

      // Helper: Generate unique selector for element
      const getSelector = (el) => {
        if (el.id) return `#${el.id}`;

        const tag = el.tagName.toLowerCase();
        const classes = Array.from(el.classList).slice(0, 2).join('.');
        const nth = () => {
          const siblings = Array.from(el.parentElement?.children || []);
          const index = siblings.indexOf(el) + 1;
          return `:nth-child(${index})`;
        };

        if (classes) return `${tag}.${classes}`;
        return `${tag}${nth()}`;
      };

      // Helper: Get descriptive text from element
      const getText = (el) => {
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel.substring(0, 50);

        const title = el.getAttribute('title');
        if (title) return title.substring(0, 50);

        const text = el.textContent?.trim().substring(0, 50);
        return text || '';
      };

      // Query all elements and filter
      const allElements = document.querySelectorAll('*');

      for (const el of allElements) {
        if (!isVisible(el)) continue;

        const clickable = isClickable(el);
        const focusable = isFocusable(el);

        // Only include interactive elements
        if (!clickable && !focusable) continue;

        const rect = el.getBoundingClientRect();

        results.push({
          selector: getSelector(el),
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') || null,
          role: el.getAttribute('role') || null,
          text: getText(el),
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          interactive: true,
          clickable,
          focusable
        });
      }

      return results;
    });
  } catch (error) {
    console.error('[discovery] discoverElements failed:', error.message);
    return [];
  }
}

// ============================================================================
// EVENT LISTENER DISCOVERY (via CDP)
// ============================================================================

/**
 * Use Chrome DevTools Protocol to discover ALL registered event listeners
 * @param {import('playwright').Page} page - Playwright page instance
 * @returns {Promise<Array>} Array of { selector, events } objects
 */
async function discoverEventListeners(page) {
  let cdp = null;

  try {
    // Create CDP session
    cdp = await page.context().newCDPSession(page);

    // Enable DOM domain
    await cdp.send('DOM.enable');

    // Get document root
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });

    // Collect all node IDs
    const nodeIds = [];
    const collectNodes = (node) => {
      nodeIds.push(node.nodeId);
      if (node.children) {
        node.children.forEach(collectNodes);
      }
    };
    collectNodes(root);

    // Get listeners for each node
    const results = [];

    for (const nodeId of nodeIds) {
      try {
        // Resolve node to remote object
        const { object } = await cdp.send('DOM.resolveNode', { nodeId });
        if (!object?.objectId) continue;

        // Get event listeners
        const { listeners } = await cdp.send('DOMDebugger.getEventListeners', {
          objectId: object.objectId
        });

        if (listeners && listeners.length > 0) {
          // Get selector for this node
          const selector = await cdp.send('DOM.getOuterHTML', { nodeId })
            .then(() => `[nodeId:${nodeId}]`)
            .catch(() => `[nodeId:${nodeId}]`);

          const eventTypes = [...new Set(listeners.map(l => l.type))];

          results.push({
            selector,
            nodeId,
            events: eventTypes
          });
        }

        // Release object to prevent memory leaks
        await cdp.send('Runtime.releaseObject', { objectId: object.objectId }).catch(() => {});
      } catch (e) {
        // Skip nodes that fail - this is expected for some node types
        continue;
      }
    }

    return results;
  } catch (error) {
    console.error('[discovery] discoverEventListeners failed:', error.message);
    return [];
  } finally {
    if (cdp) {
      await cdp.detach().catch(() => {});
    }
  }
}

// ============================================================================
// KEYBOARD SHORTCUT DISCOVERY
// ============================================================================

// All keys to test for shortcuts
const ALL_KEYS = [
  // Letters
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  // Numbers
  ...'0123456789'.split(''),
  // Function keys
  ...['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
  // Arrow keys
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  // Special keys
  'Enter', 'Escape', 'Tab', 'Space', 'Backspace', 'Delete', 'Home', 'End',
  'PageUp', 'PageDown', 'Insert',
  // Punctuation
  '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/'
];

// Modifier combinations to test
const MODIFIER_COMBOS = [
  [],
  ['Control'],
  ['Shift'],
  ['Alt'],
  ['Meta'],
  ['Control', 'Shift'],
  ['Control', 'Alt'],
  ['Meta', 'Shift'],
  ['Control', 'Shift', 'Alt']
];

// Browser-reserved shortcuts to skip (would interfere with browser operation)
const RESERVED_SHORTCUTS = new Set([
  'Control+t', 'Control+w', 'Control+n', 'Control+q',
  'Control+Tab', 'Control+Shift+Tab',
  'Meta+t', 'Meta+w', 'Meta+n', 'Meta+q',
  'Alt+F4', 'Control+F4',
  'F11' // Fullscreen
]);

/**
 * Systematically test keyboard combinations for shortcuts
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {Object} options - Options for discovery
 * @param {boolean} options.quickMode - If true, only test common shortcuts
 * @returns {Promise<Array>} Array of discovered shortcuts
 */
async function discoverKeyboardShortcuts(page, options = {}) {
  const { quickMode = false } = options;
  const results = [];

  try {
    // In quick mode, only test common shortcut keys
    const keysToTest = quickMode
      ? [...'ascdvxznpofwe'.split(''), 'Enter', 'Escape', 'Delete', 'Backspace']
      : ALL_KEYS;

    const modifiersToTest = quickMode
      ? [['Control'], ['Meta'], ['Control', 'Shift']]
      : MODIFIER_COMBOS;

    // Helper: Build shortcut string for comparison
    const buildShortcutKey = (modifiers, key) => {
      return [...modifiers.sort(), key].join('+');
    };

    // Helper: Get page state snapshot for comparison
    const getStateSnapshot = async () => {
      return await page.evaluate(() => {
        return {
          url: window.location.href,
          title: document.title,
          bodyText: document.body?.innerText?.substring(0, 500) || '',
          dialogOpen: !!document.querySelector('[role="dialog"], .modal, [aria-modal="true"]'),
          activeElement: document.activeElement?.tagName
        };
      });
    };

    // Get initial state
    const initialState = await getStateSnapshot();

    for (const modifiers of modifiersToTest) {
      for (const key of keysToTest) {
        const shortcutKey = buildShortcutKey(modifiers, key);

        // Skip reserved shortcuts
        if (RESERVED_SHORTCUTS.has(shortcutKey)) continue;

        try {
          // Build key combo string for Playwright
          const keyCombo = [...modifiers, key].join('+');

          // Press the key combination
          await page.keyboard.press(keyCombo);

          // Small delay to let effects happen
          await page.waitForTimeout(50);

          // Check if state changed
          const newState = await getStateSnapshot();
          const causesChange = (
            newState.url !== initialState.url ||
            newState.title !== initialState.title ||
            newState.dialogOpen !== initialState.dialogOpen ||
            newState.bodyText !== initialState.bodyText
          );

          if (causesChange) {
            results.push({
              key,
              modifiers,
              causesChange: true,
              shortcutKey
            });

            // Try to reset state (press Escape, navigate back if needed)
            await page.keyboard.press('Escape').catch(() => {});
            if (newState.url !== initialState.url) {
              await page.goBack().catch(() => {});
            }
          }
        } catch (e) {
          // Key combo failed - skip
          continue;
        }
      }
    }

    return results;
  } catch (error) {
    console.error('[discovery] discoverKeyboardShortcuts failed:', error.message);
    return [];
  }
}

// ============================================================================
// API FUNCTION DISCOVERY
// ============================================================================

/**
 * Find all callable functions on window and app-specific objects
 * @param {import('playwright').Page} page - Playwright page instance
 * @returns {Promise<Array>} Array of { path, arity } objects
 */
async function discoverAPIFunctions(page) {
  try {
    return await page.evaluate(() => {
      const results = [];
      const visited = new WeakSet();

      // Built-in functions/objects to skip
      const SKIP_BUILTINS = new Set([
        'constructor', 'toString', 'valueOf', 'hasOwnProperty',
        'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
        '__defineGetter__', '__defineSetter__', '__lookupGetter__',
        '__lookupSetter__', '__proto__'
      ]);

      // Global objects to skip (browser builtins)
      const SKIP_GLOBALS = new Set([
        'chrome', 'navigator', 'location', 'history', 'document',
        'window', 'self', 'top', 'parent', 'frames', 'opener',
        'localStorage', 'sessionStorage', 'indexedDB', 'caches',
        'crypto', 'performance', 'console', 'fetch', 'XMLHttpRequest'
      ]);

      // Recursively walk object properties
      const walkObject = (obj, path, depth = 0) => {
        // Limit depth to prevent infinite recursion
        if (depth > 3) return;
        if (!obj || typeof obj !== 'object') return;
        if (visited.has(obj)) return;

        try {
          visited.add(obj);
        } catch (e) {
          return; // Some objects can't be added to WeakSet
        }

        let keys;
        try {
          keys = Object.getOwnPropertyNames(obj);
        } catch (e) {
          return;
        }

        for (const key of keys) {
          if (SKIP_BUILTINS.has(key)) continue;
          if (key.startsWith('_')) continue; // Skip private-looking

          const fullPath = path ? `${path}.${key}` : key;

          try {
            const value = obj[key];

            if (typeof value === 'function') {
              results.push({
                path: fullPath,
                arity: value.length
              });
            } else if (typeof value === 'object' && value !== null) {
              // Recurse into nested objects
              walkObject(value, fullPath, depth + 1);
            }
          } catch (e) {
            // Property access failed - skip
            continue;
          }
        }
      };

      // Look for app-specific namespaces on window
      const appNamespaces = ['app', 'App', 'Photopea', 'editor', 'Editor',
                             'api', 'API', 'ctrl', 'controller', 'main'];

      for (const ns of appNamespaces) {
        if (window[ns] && !SKIP_GLOBALS.has(ns)) {
          walkObject(window[ns], `window.${ns}`);
        }
      }

      // Also check direct window properties that look app-specific
      for (const key of Object.getOwnPropertyNames(window)) {
        if (SKIP_GLOBALS.has(key)) continue;
        if (SKIP_BUILTINS.has(key)) continue;

        try {
          const value = window[key];
          // Look for capitalized names (likely app classes/namespaces)
          if (typeof value === 'object' && value !== null && /^[A-Z]/.test(key)) {
            walkObject(value, `window.${key}`);
          }
        } catch (e) {
          continue;
        }
      }

      return results;
    });
  } catch (error) {
    console.error('[discovery] discoverAPIFunctions failed:', error.message);
    return [];
  }
}

// ============================================================================
// COMBINED DISCOVERY
// ============================================================================

/**
 * Run all discovery methods and return combined manifest
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {Object} options - Options passed to individual discovery functions
 * @returns {Promise<Object>} Combined discovery manifest
 */
async function discoverAll(page, options = {}) {
  const results = {
    timestamp: new Date().toISOString(),
    url: page.url(),
    elements: [],
    eventListeners: [],
    keyboardShortcuts: [],
    apiFunctions: []
  };

  try {
    // Run discoveries in parallel where possible
    const [elements, eventListeners, apiFunctions] = await Promise.all([
      discoverElements(page),
      discoverEventListeners(page),
      discoverAPIFunctions(page)
    ]);

    results.elements = elements;
    results.eventListeners = eventListeners;
    results.apiFunctions = apiFunctions;

    // Keyboard shortcuts need to run sequentially (modifies page state)
    results.keyboardShortcuts = await discoverKeyboardShortcuts(page, options);

  } catch (error) {
    console.error('[discovery] discoverAll failed:', error.message);
  }

  return results;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  discoverElements,
  discoverEventListeners,
  discoverKeyboardShortcuts,
  discoverAPIFunctions,
  discoverAll
};
