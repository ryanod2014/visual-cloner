import { BaseTrigger } from './base.js';

/**
 * Click trigger for loading interactive content (10-15% of lazy resources)
 * Clicks interactive elements to trigger dynamic content loading
 */
export class ClickTrigger extends BaseTrigger {
  name = 'click';

  /**
   * Execute click-based lazy loading trigger
   * @param {import('playwright').Page} page - Playwright page instance
   * @param {object} logger - Logger instance
   * @returns {Promise<number>} - Number of new resources loaded
   */
  async trigger(page, logger) {
    const counter = this.createResourceCounter(page);

    try {
      logger.debug(`${this.name}: Starting click trigger`);

      // Find interactive elements
      const selectors = [
        'button:not([type="submit"]):not([formaction])',
        '[role="button"]',
        'a[href^="/"]:not([target="_blank"])',
        '[onclick]',
        '[data-toggle]',
        '[data-bs-toggle]',
        '.accordion-header',
        '.tab',
        '[role="tab"]',
        '.dropdown-toggle',
        '[aria-haspopup]',
        '[aria-expanded]'
      ];

      const combinedSelector = selectors.join(', ');

      // Get all matching elements
      const elements = await page.$$(combinedSelector);
      const maxElements = 50;
      const clickDelay = 300;

      logger.debug(`${this.name}: Found ${elements.length} interactive elements (max ${maxElements})`);

      let clickedCount = 0;

      for (const element of elements.slice(0, maxElements)) {
        try {
          // Check if element is visible and enabled
          const isVisible = await element.isVisible();
          const isEnabled = await element.isEnabled();

          if (!isVisible || !isEnabled) {
            continue;
          }

          // Check if this is a dangerous element (form submit, delete action)
          const isDangerous = await element.evaluate((el) => {
            const text = (el.textContent || '').toLowerCase();
            const classes = (el.className || '').toLowerCase();
            const id = (el.id || '').toLowerCase();

            // Skip delete/submit/destructive actions
            const dangerousPatterns = [
              'delete', 'remove', 'submit', 'send', 'post',
              'checkout', 'buy', 'purchase', 'order', 'pay',
              'logout', 'sign out', 'signout'
            ];

            return dangerousPatterns.some(pattern =>
              text.includes(pattern) ||
              classes.includes(pattern) ||
              id.includes(pattern)
            );
          });

          if (isDangerous) {
            logger.debug(`${this.name}: Skipping potentially dangerous element`);
            continue;
          }

          // Click the element
          await element.click({ timeout: 1000 });
          clickedCount++;

          await this.wait(clickDelay);

          // Press Escape to close any modals/dropdowns
          await page.keyboard.press('Escape');
          await this.wait(100);

        } catch (error) {
          // Skip elements that throw errors (detached, covered, etc.)
          logger.debug(`${this.name}: Skipped element: ${error.message}`);
        }
      }

      const resourceCount = counter.getCount();
      logger.debug(`${this.name}: Clicked ${clickedCount} elements, loaded ${resourceCount} resources`);

      return resourceCount;
    } catch (error) {
      logger.error(`${this.name}: Error during click trigger: ${error.message}`);
      return counter.getCount();
    } finally {
      counter.cleanup();
    }
  }
}
