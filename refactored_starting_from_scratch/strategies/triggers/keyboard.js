import { BaseTrigger } from './base.js';

/**
 * Keyboard trigger for loading shortcut-activated content (3-5% of lazy resources)
 * Tests common keyboard shortcuts that may trigger lazy loading
 */
export class KeyboardTrigger extends BaseTrigger {
  name = 'keyboard';

  /**
   * Execute keyboard shortcut trigger
   * @param {import('playwright').Page} page - Playwright page instance
   * @param {object} logger - Logger instance
   * @returns {Promise<number>} - Number of new resources loaded
   */
  async trigger(page, logger) {
    const counter = this.createResourceCounter(page);

    try {
      logger.debug(`${this.name}: Starting keyboard trigger`);

      const keyDelay = 200;

      // Common keyboard shortcuts that might open dialogs/panels
      // Use Meta on macOS, Control on others
      const isMac = process.platform === 'darwin';
      const modifier = isMac ? 'Meta' : 'Control';

      const shortcuts = [
        { key: 'o', description: 'Open' },
        { key: 'n', description: 'New' },
        { key: 's', description: 'Save' },
        { key: 'p', description: 'Print' },
        { key: 'f', description: 'Find' },
        { key: 'h', description: 'History/Help' },
        { key: 'k', description: 'Command palette' },
        { key: '/', description: 'Search' },
        { key: '?', description: 'Help' }
      ];

      // Also test some common single key shortcuts
      const singleKeyShortcuts = [
        { key: '/', description: 'Search' },
        { key: '?', description: 'Help' },
        { key: 'g', description: 'Go to' },
        { key: 'j', description: 'Next item' },
        { key: 'k', description: 'Previous item' }
      ];

      // Test modifier + key shortcuts
      for (const shortcut of shortcuts) {
        try {
          logger.debug(`${this.name}: Testing ${modifier}+${shortcut.key} (${shortcut.description})`);

          // Press the shortcut
          await page.keyboard.press(`${modifier}+${shortcut.key}`);
          await this.wait(keyDelay);

          // Press Escape to close any opened dialog
          await page.keyboard.press('Escape');
          await this.wait(100);

        } catch (error) {
          logger.debug(`${this.name}: Shortcut ${modifier}+${shortcut.key} failed: ${error.message}`);
        }
      }

      // Test single key shortcuts (usually in applications)
      for (const shortcut of singleKeyShortcuts) {
        try {
          // Only trigger if we're not in an input field
          const isInInput = await page.evaluate(() => {
            const active = document.activeElement;
            return active && (
              active.tagName === 'INPUT' ||
              active.tagName === 'TEXTAREA' ||
              active.isContentEditable
            );
          });

          if (isInInput) {
            continue;
          }

          logger.debug(`${this.name}: Testing ${shortcut.key} (${shortcut.description})`);

          await page.keyboard.press(shortcut.key);
          await this.wait(keyDelay);

          // Press Escape to close any opened dialog
          await page.keyboard.press('Escape');
          await this.wait(100);

        } catch (error) {
          logger.debug(`${this.name}: Shortcut ${shortcut.key} failed: ${error.message}`);
        }
      }

      const resourceCount = counter.getCount();
      logger.debug(`${this.name}: Loaded ${resourceCount} resources via keyboard shortcuts`);

      return resourceCount;
    } catch (error) {
      logger.error(`${this.name}: Error during keyboard trigger: ${error.message}`);
      return counter.getCount();
    } finally {
      counter.cleanup();
    }
  }
}
