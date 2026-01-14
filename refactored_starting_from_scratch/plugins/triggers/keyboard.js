/**
 * Keyboard Trigger
 * Triggers features via keyboard shortcuts
 */

import { ITrigger } from './interface.js';

export class KeyboardTrigger extends ITrigger {
  constructor() {
    super('keyboard', 'Trigger features via keyboard shortcuts');
  }

  async execute(page, options = {}) {
    const { delayMs = 50, onProgress = null } = options;

    const stats = {
      letters: 0,
      ctrlCombos: 0,
      ctrlShiftCombos: 0,
      altCombos: 0,
      functionKeys: 0,
      dialogs: 0,
    };

    const log = (msg) => onProgress?.(msg);

    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const dangerousKeys = ['w', 'q', 'r']; // Don't close/quit/refresh

    // Single letters (tool shortcuts)
    log('Testing single letter shortcuts...');
    for (const key of letters) {
      if (!dangerousKeys.includes(key)) {
        try {
          await page.keyboard.press(key);
          stats.letters++;
        } catch (e) {}
        await page.waitForTimeout(delayMs);
      }
    }

    // Ctrl+key combinations
    log('Testing Ctrl+key combinations...');
    for (const key of letters) {
      if (!dangerousKeys.includes(key)) {
        try {
          await page.keyboard.press(`Control+${key}`);
          stats.ctrlCombos++;
        } catch (e) {}
        await page.waitForTimeout(delayMs);
        try { await page.keyboard.press('Escape'); } catch (e) {}
      }
    }

    // Ctrl+Shift+key combinations
    log('Testing Ctrl+Shift+key combinations...');
    for (const key of letters) {
      if (!dangerousKeys.includes(key)) {
        try {
          await page.keyboard.press(`Control+Shift+${key}`);
          stats.ctrlShiftCombos++;
        } catch (e) {}
        await page.waitForTimeout(delayMs);
        try { await page.keyboard.press('Escape'); } catch (e) {}
      }
    }

    // Alt+key combinations
    log('Testing Alt+key combinations...');
    for (const key of letters) {
      if (!dangerousKeys.includes(key)) {
        try {
          await page.keyboard.press(`Alt+${key}`);
          stats.altCombos++;
        } catch (e) {}
        await page.waitForTimeout(delayMs);
        try { await page.keyboard.press('Escape'); } catch (e) {}
      }
    }

    // Function keys F1-F12
    log('Testing function keys...');
    for (let i = 1; i <= 12; i++) {
      try {
        await page.keyboard.press(`F${i}`);
        stats.functionKeys++;
      } catch (e) {}
      await page.waitForTimeout(delayMs);
      try { await page.keyboard.press('Escape'); } catch (e) {}
    }

    // Common dialog shortcuts
    log('Testing dialog shortcuts...');
    const dialogShortcuts = [
      'Control+o',       // Open
      'Control+n',       // New
      'Control+Shift+s', // Save As
      'Control+Shift+e', // Export
      'Control+p',       // Print/Preferences
      'Control+i',       // Info/Import
      'Control+l',       // Layers/Links
      'Control+m',       // Curves/Modify
      'Control+b',       // Bold/Brush
      'Control+t',       // Transform/Text
      'Control+Shift+x', // Extra features
      'Control+Alt+c',   // Copy special
      'Control+Alt+v',   // Paste special
    ];

    for (const shortcut of dialogShortcuts) {
      try {
        await page.keyboard.press(shortcut);
        stats.dialogs++;
      } catch (e) {}
      await page.waitForTimeout(200);
      try { await page.keyboard.press('Escape'); } catch (e) {}
      await page.waitForTimeout(100);
    }

    return stats;
  }
}

export default KeyboardTrigger;
