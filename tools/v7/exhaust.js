#!/usr/bin/env node
/**
 * V7 Feature Exhaustion
 * Triggers lazy-loaded features to capture all dynamic resources
 *
 * Strategies:
 * - Keyboard shortcuts (Ctrl+A-Z, F1-F12, etc.)
 * - Menu interactions
 * - Dialog triggers
 * - Viewport resize
 */

/**
 * Exhaustively trigger features on a page
 * @param {Object} page - Playwright page object
 * @param {Object} options - Configuration options
 * @returns {Object} - Statistics about what was triggered
 */
export async function exhaustFeatures(page, options = {}) {
  const {
    keyboard = true,
    menus = true,
    dialogs = true,
    resize = true,
    scroll = true,
    delayMs = 50,
    onProgress = null,
  } = options;

  const stats = {
    keyboardTriggers: 0,
    menuClicks: 0,
    dialogTriggers: 0,
    resizes: 0,
    scrolls: 0,
  };

  const log = (msg) => {
    if (onProgress) onProgress(msg);
  };

  // === KEYBOARD SHORTCUTS ===
  if (keyboard) {
    log('Triggering keyboard shortcuts...');

    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const dangerousKeys = ['w', 'q', 'r']; // Don't close/quit/refresh

    // Single letters
    for (const key of letters) {
      if (!dangerousKeys.includes(key)) {
        try {
          await page.keyboard.press(key);
          stats.keyboardTriggers++;
        } catch (e) {}
        await page.waitForTimeout(delayMs);
      }
    }

    // Ctrl+key combinations
    for (const key of letters) {
      if (!dangerousKeys.includes(key)) {
        try {
          await page.keyboard.press(`Control+${key}`);
          stats.keyboardTriggers++;
        } catch (e) {}
        await page.waitForTimeout(delayMs);
        // Escape any dialogs that opened
        try { await page.keyboard.press('Escape'); } catch (e) {}
      }
    }

    // Ctrl+Shift+key combinations
    for (const key of letters) {
      if (!dangerousKeys.includes(key)) {
        try {
          await page.keyboard.press(`Control+Shift+${key}`);
          stats.keyboardTriggers++;
        } catch (e) {}
        await page.waitForTimeout(delayMs);
        try { await page.keyboard.press('Escape'); } catch (e) {}
      }
    }

    // Alt+key combinations
    for (const key of letters) {
      if (!dangerousKeys.includes(key)) {
        try {
          await page.keyboard.press(`Alt+${key}`);
          stats.keyboardTriggers++;
        } catch (e) {}
        await page.waitForTimeout(delayMs);
        try { await page.keyboard.press('Escape'); } catch (e) {}
      }
    }

    // Function keys
    for (let i = 1; i <= 12; i++) {
      try {
        await page.keyboard.press(`F${i}`);
        stats.keyboardTriggers++;
      } catch (e) {}
      await page.waitForTimeout(delayMs);
      try { await page.keyboard.press('Escape'); } catch (e) {}
    }

    log(`Triggered ${stats.keyboardTriggers} keyboard shortcuts`);
  }

  // === MENU INTERACTIONS ===
  if (menus) {
    log('Triggering menu interactions...');

    // Horizontal menu positions (top bar)
    const menuXPositions = [30, 80, 140, 200, 260, 320, 380, 440, 500, 560];

    for (const x of menuXPositions) {
      try {
        // Click menu item
        await page.mouse.click(x, 12);
        stats.menuClicks++;
        await page.waitForTimeout(200);

        // Hover down the dropdown menu
        for (let y = 40; y < 400; y += 20) {
          await page.mouse.move(x + 50, y);
          await page.waitForTimeout(30);
        }

        // Close menu
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
      } catch (e) {}
    }

    // Left toolbar (vertical)
    for (let y = 60; y < 600; y += 25) {
      try {
        await page.mouse.click(25, y);
        stats.menuClicks++;
        await page.waitForTimeout(100);

        // Long press for sub-tools
        await page.mouse.down();
        await page.waitForTimeout(300);
        await page.mouse.up();

        await page.keyboard.press('Escape');
      } catch (e) {}
    }

    log(`Clicked ${stats.menuClicks} menu items`);
  }

  // === DIALOG TRIGGERS ===
  if (dialogs) {
    log('Triggering dialogs...');

    const dialogShortcuts = [
      'Control+o',       // Open
      'Control+n',       // New
      'Control+Shift+s', // Save As
      'Control+Shift+e', // Export
      'Control+p',       // Print/Preferences
      'Control+,',       // Settings
      'Control+i',       // Info/Import
      'Control+u',       // Upload/Utilities
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
        stats.dialogTriggers++;
        await page.waitForTimeout(400);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
      } catch (e) {}
    }

    log(`Triggered ${stats.dialogTriggers} dialogs`);
  }

  // === VIEWPORT RESIZE ===
  if (resize) {
    log('Testing viewport sizes...');

    const viewports = [
      { width: 800, height: 600 },
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
      { width: 375, height: 812 },  // Mobile
      { width: 768, height: 1024 }, // Tablet
    ];

    for (const viewport of viewports) {
      try {
        await page.setViewportSize(viewport);
        stats.resizes++;
        await page.waitForTimeout(300);
      } catch (e) {}
    }

    // Reset to default
    try {
      await page.setViewportSize({ width: 1920, height: 1080 });
    } catch (e) {}

    log(`Tested ${stats.resizes} viewport sizes`);
  }

  // === SCROLL ===
  if (scroll) {
    log('Scrolling page...');

    try {
      const pageHeight = await page.evaluate(() => document.body.scrollHeight);

      for (let y = 0; y < pageHeight; y += 500) {
        await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
        stats.scrolls++;
        await page.waitForTimeout(100);
      }

      // Scroll back to top
      await page.evaluate(() => window.scrollTo(0, 0));
    } catch (e) {}

    log(`Performed ${stats.scrolls} scroll operations`);
  }

  return stats;
}

/**
 * Capture resources that were loaded during exhaustion
 * @param {Object} page - Playwright page
 * @param {Map} existingResources - Already captured resources
 * @param {Function} onResource - Callback for each new resource
 */
export async function captureExhaustionResources(page, existingResources, onResource) {
  // This should be called after exhaustFeatures completes
  // Resources are captured via the existing response listener
  // This function is a placeholder for any post-exhaustion processing
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('V7 Feature Exhaustion Module');
  console.log('');
  console.log('This module is designed to be imported and used within the V7 extractor.');
  console.log('');
  console.log('Usage in extract.js:');
  console.log('  import { exhaustFeatures } from "./exhaust.js";');
  console.log('  await exhaustFeatures(page, { keyboard: true, menus: true });');
  console.log('');
  console.log('Options:');
  console.log('  keyboard: true/false - Trigger keyboard shortcuts');
  console.log('  menus: true/false - Click menu items');
  console.log('  dialogs: true/false - Trigger dialog shortcuts');
  console.log('  resize: true/false - Test viewport sizes');
  console.log('  scroll: true/false - Scroll page');
  console.log('  delayMs: number - Delay between actions (default 50)');
}
