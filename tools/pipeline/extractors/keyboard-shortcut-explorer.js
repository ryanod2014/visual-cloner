/**
 * Keyboard Shortcut Explorer
 *
 * Systematically discovers ALL keyboard shortcuts by:
 * 1. Testing common shortcut patterns globally
 * 2. Testing shortcuts on focused elements
 * 3. Testing multi-key sequences (vim-style)
 * 4. Recording which shortcuts cause state changes
 *
 * This catches Cmd+K, Ctrl+P, /, ?, g g, etc.
 */

export const keyboardShortcutExplorer = {
  name: 'keyboard-shortcut-explorer',

  // Common shortcuts to test
  SINGLE_KEYS: [
    'Escape', 'Enter', 'Space', 'Tab', 'Backspace', 'Delete',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown',
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
    '/', '?', '.', ',', '[', ']', '\\', '`', '-', '=',
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  ],

  // Ctrl/Cmd + key combinations
  CTRL_SHORTCUTS: [
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    '/', '\\', '[', ']', '`', '-', '=', ',', '.', ';', "'",
    'Enter', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  ],

  // Shift + key combinations
  SHIFT_SHORTCUTS: [
    'Tab', 'Enter', 'Escape',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    '/', '?',
  ],

  // Alt/Option + key combinations
  ALT_SHORTCUTS: [
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Enter', 'Backspace',
  ],

  // Ctrl+Shift combinations
  CTRL_SHIFT_SHORTCUTS: [
    'p', 'f', 'e', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
    'z', 's', 'Tab', 'Enter',
    'ArrowUp', 'ArrowDown',
  ],

  // Multi-key sequences (vim-style, Gmail-style)
  SEQUENCES: [
    ['g', 'g'],  // Go to top
    ['g', 'h'],  // Go home
    ['g', 'i'],  // Go to inbox
    ['g', 'a'],  // Go to all
    ['g', 's'],  // Go to starred
    ['g', 't'],  // Go to sent
    ['g', 'd'],  // Go to drafts
    ['g', 'l'],  // Go to label
    ['g', 'n'],  // Next conversation
    ['g', 'p'],  // Previous conversation
    ['z', 'z'],  // Center
    ['z', 't'],  // Top
    ['z', 'b'],  // Bottom
    ['d', 'd'],  // Delete line
    ['y', 'y'],  // Yank line
    ['.', '.'],  // Repeat
    ['>', '>'],  // Indent
    ['<', '<'],  // Outdent
  ],

  getInjectionScript() {
    return `
(function() {
  if (window.__keyboardShortcutExplorerInstalled) return;
  window.__keyboardShortcutExplorerInstalled = true;

  window.__keyboardShortcutsCaptured = {
    shortcuts: [],
    sequencesInProgress: [],
    lastKeyTime: 0,
    keyBuffer: [],
  };

  // Track all keyboard events
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const keyboardListeners = [];

  // Intercept to find what's listening for keyboard events
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (type === 'keydown' || type === 'keyup' || type === 'keypress') {
      keyboardListeners.push({
        target: this === window ? 'window' : this === document ? 'document' : this.tagName || 'unknown',
        type,
        listener: listener.toString().slice(0, 200),
      });
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  // Track keyboard event that caused state changes
  window.__recordShortcut = function(shortcut, stateChanged, diff) {
    window.__keyboardShortcutsCaptured.shortcuts.push({
      shortcut,
      stateChanged,
      diff,
      timestamp: Date.now(),
    });
  };

  // Get all keyboard listeners
  window.__getKeyboardListeners = function() {
    return keyboardListeners;
  };

  // Get captured shortcuts
  window.__getCapturedShortcuts = function() {
    return window.__keyboardShortcutsCaptured;
  };

  console.log('[Keyboard Shortcut Explorer] Installed');
})();
`;
  },

  /**
   * Test a single keyboard shortcut
   */
  async testShortcut(page, shortcut, options = {}) {
    const { settleTime = 300 } = options;

    // Get state before
    const beforeHash = await page.evaluate(() => window.__getrobustStateHash?.()?.hash || 'unknown');

    // Press the shortcut
    try {
      await page.keyboard.press(shortcut, { timeout: 1000 });
    } catch (e) {
      return { shortcut, error: e.message, stateChanged: false };
    }

    // Wait for effects
    await page.waitForTimeout(settleTime);

    // Get state after
    const afterHash = await page.evaluate(() => window.__getrobustStateHash?.()?.hash || 'unknown');

    const stateChanged = beforeHash !== afterHash;

    // If state changed, get the diff
    let diff = null;
    if (stateChanged) {
      // Check for common UI changes
      diff = await page.evaluate(() => {
        const changes = [];

        // Check for modals/dialogs
        const modal = document.querySelector('[role="dialog"], .modal, [data-modal], [aria-modal="true"]');
        if (modal && getComputedStyle(modal).display !== 'none') {
          changes.push({ type: 'modal-opened', selector: modal.className || modal.id });
        }

        // Check for search/command palette
        const search = document.querySelector('[role="combobox"], [role="searchbox"], .command-palette, .search-modal');
        if (search && getComputedStyle(search).display !== 'none') {
          changes.push({ type: 'search-opened', selector: search.className || search.id });
        }

        // Check for menus
        const menu = document.querySelector('[role="menu"]:not([style*="display: none"])');
        if (menu) {
          changes.push({ type: 'menu-opened', selector: menu.className || menu.id });
        }

        // Check for focus change
        const focused = document.activeElement;
        if (focused && focused !== document.body) {
          changes.push({ type: 'focus-changed', element: focused.tagName, selector: focused.className || focused.id });
        }

        return changes;
      });
    }

    // Record the shortcut
    await page.evaluate(({ s, changed, d }) => {
      window.__recordShortcut?.(s, changed, d);
    }, { s: shortcut, changed: stateChanged, d: diff });

    // If something opened, close it (press Escape)
    if (stateChanged) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }

    return {
      shortcut,
      stateChanged,
      beforeHash,
      afterHash,
      diff,
    };
  },

  /**
   * Test a multi-key sequence
   */
  async testSequence(page, keys, options = {}) {
    const { settleTime = 300, sequenceDelay = 100 } = options;

    const beforeHash = await page.evaluate(() => window.__getrobustStateHash?.()?.hash || 'unknown');

    // Press keys in sequence
    for (const key of keys) {
      await page.keyboard.press(key);
      await page.waitForTimeout(sequenceDelay);
    }

    await page.waitForTimeout(settleTime);

    const afterHash = await page.evaluate(() => window.__getrobustStateHash?.()?.hash || 'unknown');
    const stateChanged = beforeHash !== afterHash;

    // Reset if changed
    if (stateChanged) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }

    return {
      shortcut: keys.join(' '),
      sequence: keys,
      stateChanged,
      beforeHash,
      afterHash,
    };
  },

  /**
   * Explore all keyboard shortcuts
   */
  async explore(page, options = {}) {
    const {
      testSingleKeys = true,
      testCtrlShortcuts = true,
      testShiftShortcuts = true,
      testAltShortcuts = true,
      testCtrlShiftShortcuts = true,
      testSequences = true,
      settleTime = 300,
      onProgress = null,
    } = options;

    const results = {
      foundShortcuts: [],
      testedCount: 0,
      totalToTest: 0,
    };

    // Calculate total
    if (testSingleKeys) results.totalToTest += this.SINGLE_KEYS.length;
    if (testCtrlShortcuts) results.totalToTest += this.CTRL_SHORTCUTS.length;
    if (testShiftShortcuts) results.totalToTest += this.SHIFT_SHORTCUTS.length;
    if (testAltShortcuts) results.totalToTest += this.ALT_SHORTCUTS.length;
    if (testCtrlShiftShortcuts) results.totalToTest += this.CTRL_SHIFT_SHORTCUTS.length;
    if (testSequences) results.totalToTest += this.SEQUENCES.length;

    const isMac = await page.evaluate(() => navigator.platform.includes('Mac'));
    const ctrlKey = isMac ? 'Meta' : 'Control';

    // Test single keys
    if (testSingleKeys) {
      for (const key of this.SINGLE_KEYS) {
        const result = await this.testShortcut(page, key, { settleTime });
        results.testedCount++;

        if (result.stateChanged) {
          results.foundShortcuts.push(result);
        }

        if (onProgress) {
          onProgress({ tested: results.testedCount, total: results.totalToTest, found: results.foundShortcuts.length });
        }
      }
    }

    // Test Ctrl/Cmd shortcuts
    if (testCtrlShortcuts) {
      for (const key of this.CTRL_SHORTCUTS) {
        const shortcut = `${ctrlKey}+${key}`;
        const result = await this.testShortcut(page, shortcut, { settleTime });
        results.testedCount++;

        if (result.stateChanged) {
          results.foundShortcuts.push(result);
        }

        if (onProgress) {
          onProgress({ tested: results.testedCount, total: results.totalToTest, found: results.foundShortcuts.length });
        }
      }
    }

    // Test Shift shortcuts
    if (testShiftShortcuts) {
      for (const key of this.SHIFT_SHORTCUTS) {
        const shortcut = `Shift+${key}`;
        const result = await this.testShortcut(page, shortcut, { settleTime });
        results.testedCount++;

        if (result.stateChanged) {
          results.foundShortcuts.push(result);
        }

        if (onProgress) {
          onProgress({ tested: results.testedCount, total: results.totalToTest, found: results.foundShortcuts.length });
        }
      }
    }

    // Test Alt shortcuts
    if (testAltShortcuts) {
      for (const key of this.ALT_SHORTCUTS) {
        const shortcut = `Alt+${key}`;
        const result = await this.testShortcut(page, shortcut, { settleTime });
        results.testedCount++;

        if (result.stateChanged) {
          results.foundShortcuts.push(result);
        }

        if (onProgress) {
          onProgress({ tested: results.testedCount, total: results.totalToTest, found: results.foundShortcuts.length });
        }
      }
    }

    // Test Ctrl+Shift shortcuts
    if (testCtrlShiftShortcuts) {
      for (const key of this.CTRL_SHIFT_SHORTCUTS) {
        const shortcut = `${ctrlKey}+Shift+${key}`;
        const result = await this.testShortcut(page, shortcut, { settleTime });
        results.testedCount++;

        if (result.stateChanged) {
          results.foundShortcuts.push(result);
        }

        if (onProgress) {
          onProgress({ tested: results.testedCount, total: results.totalToTest, found: results.foundShortcuts.length });
        }
      }
    }

    // Test sequences
    if (testSequences) {
      for (const sequence of this.SEQUENCES) {
        const result = await this.testSequence(page, sequence, { settleTime });
        results.testedCount++;

        if (result.stateChanged) {
          results.foundShortcuts.push(result);
        }

        if (onProgress) {
          onProgress({ tested: results.testedCount, total: results.totalToTest, found: results.foundShortcuts.length });
        }
      }
    }

    return results;
  },

  /**
   * Generate code for found shortcuts
   */
  generateShortcutHandlers(results) {
    const lines = [];
    lines.push('// Discovered keyboard shortcuts');
    lines.push('const keyboardShortcuts = {');

    for (const shortcut of results.foundShortcuts) {
      const key = shortcut.shortcut.replace(/\+/g, '_').toLowerCase();
      lines.push(`  '${shortcut.shortcut}': {`);
      lines.push(`    // Causes: ${JSON.stringify(shortcut.diff || 'state change')}`);
      lines.push(`    handler: () => { /* TODO: implement */ },`);
      lines.push(`  },`);
    }

    lines.push('};');
    lines.push('');
    lines.push('// Register shortcuts');
    lines.push('document.addEventListener("keydown", (e) => {');
    lines.push('  const key = [');
    lines.push('    e.ctrlKey || e.metaKey ? "Control" : "",');
    lines.push('    e.shiftKey ? "Shift" : "",');
    lines.push('    e.altKey ? "Alt" : "",');
    lines.push('    e.key,');
    lines.push('  ].filter(Boolean).join("+");');
    lines.push('  ');
    lines.push('  if (keyboardShortcuts[key]) {');
    lines.push('    e.preventDefault();');
    lines.push('    keyboardShortcuts[key].handler();');
    lines.push('  }');
    lines.push('});');

    return lines.join('\n');
  }
};
