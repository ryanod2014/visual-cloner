/**
 * Discover ALL keyboard shortcuts by systematic enumeration
 */
const logger = require('../utils/logger');
const config = require('../utils/config');

// All testable keys
const KEYS = [
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  ...'0123456789'.split(''),
  'Escape', 'Enter', 'Tab', 'Backspace', 'Delete', 'Insert',
  'Home', 'End', 'PageUp', 'PageDown',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  ' ', '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/'
];

// Modifier combinations
const MODIFIER_COMBOS = [
  [],
  ['Control'],
  ['Alt'],
  ['Shift'],
  ['Meta'],
  ['Control', 'Shift'],
  ['Control', 'Alt'],
  ['Alt', 'Shift']
];

// Browser-reserved shortcuts to skip
const RESERVED = new Set([
  'Control+t', 'Control+n', 'Control+w', 'Control+q',
  'Control+Tab', 'Control+Shift+Tab',
  'Alt+F4', 'F11', 'F12', 'Control+l', 'Control+d'
]);

async function discoverKeyboardShortcuts(page, hashStateFn) {
  logger.info('Discovering keyboard shortcuts...');
  const shortcuts = [];

  const initialHash = await hashStateFn(page);
  let tested = 0;
  const total = KEYS.length * MODIFIER_COMBOS.length;

  for (const key of KEYS) {
    for (const modifiers of MODIFIER_COMBOS) {
      const shortcut = formatShortcut(key, modifiers);

      // Skip reserved
      if (RESERVED.has(shortcut)) continue;

      tested++;
      if (tested % 100 === 0) {
        logger.debug(`Keyboard: ${tested}/${total} tested`);
      }

      try {
        // Press the key combination
        await page.keyboard.press(key, {
          modifiers: modifiers.map(m => m.toLowerCase())
        });

        // Small wait for any effects
        await page.waitForTimeout(50);

        // Check if state changed
        const newHash = await hashStateFn(page);

        if (newHash !== initialHash) {
          shortcuts.push({
            key,
            modifiers,
            shortcut,
            causedChange: true
          });

          // Restore state (press Escape, reload if needed)
          await page.keyboard.press('Escape');
          await page.waitForTimeout(50);
        }
      } catch (e) {
        // Some key combos may fail
      }
    }
  }

  logger.info(`Found ${shortcuts.length} active keyboard shortcuts`);
  return shortcuts;
}

function formatShortcut(key, modifiers) {
  const parts = [...modifiers];
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join('+');
}

module.exports = { discoverKeyboardShortcuts, KEYS, MODIFIER_COMBOS };
