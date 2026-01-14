/**
 * Menu Trigger
 * Triggers features by clicking through menus
 */

import { ITrigger } from './interface.js';

export class MenuTrigger extends ITrigger {
  constructor() {
    super('menu', 'Trigger features via menu interactions');
  }

  async execute(page, options = {}) {
    const { delayMs = 100, onProgress = null } = options;

    const stats = {
      topMenuClicks: 0,
      dropdownHovers: 0,
      toolbarClicks: 0,
      rightPanelClicks: 0,
    };

    const log = (msg) => onProgress?.(msg);

    // === TOP MENU BAR ===
    log('Clicking top menu items...');
    const menuXPositions = [30, 80, 140, 200, 260, 320, 380, 440, 500];

    for (const x of menuXPositions) {
      try {
        // Click to open menu
        await page.mouse.click(x, 12);
        stats.topMenuClicks++;
        await page.waitForTimeout(200);

        // Hover down the dropdown to trigger lazy-loaded items
        for (let y = 40; y < 500; y += 25) {
          await page.mouse.move(x + 60, y);
          stats.dropdownHovers++;
          await page.waitForTimeout(30);
        }

        // Close menu
        await page.keyboard.press('Escape');
        await page.waitForTimeout(delayMs);
      } catch (e) {}
    }

    // === LEFT TOOLBAR ===
    log('Clicking toolbar items...');
    for (let y = 60; y < 500; y += 30) {
      try {
        // Click tool
        await page.mouse.click(20, y);
        stats.toolbarClicks++;
        await page.waitForTimeout(delayMs);

        // Long press for sub-tools
        await page.mouse.down();
        await page.waitForTimeout(400);
        await page.mouse.up();
        await page.waitForTimeout(delayMs);

        // Escape any popup
        await page.keyboard.press('Escape');
      } catch (e) {}
    }

    // === RIGHT PANEL TABS ===
    log('Clicking right panel tabs...');
    const panelYPositions = [100, 130, 160, 190, 220, 250];
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    for (const y of panelYPositions) {
      try {
        // Click on right edge of screen
        await page.mouse.click(viewportWidth - 30, y);
        stats.rightPanelClicks++;
        await page.waitForTimeout(delayMs);
      } catch (e) {}
    }

    // === CONTEXT MENU ===
    log('Testing context menu...');
    try {
      // Right-click in center area
      await page.mouse.click(viewportWidth / 2, 400, { button: 'right' });
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
    } catch (e) {}

    return stats;
  }
}

export default MenuTrigger;
