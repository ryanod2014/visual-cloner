/**
 * Base trigger class for lazy resource loading strategies
 */
export class BaseTrigger {
  name = 'base';

  /**
   * Execute the trigger to load lazy resources
   * @param {import('playwright').Page} page - Playwright page instance
   * @param {object} logger - Logger instance
   * @returns {Promise<number>} - Number of new resources loaded
   */
  async trigger(page, logger) {
    return 0;
  }

  /**
   * Create a resource counter that tracks new responses
   * @param {import('playwright').Page} page - Playwright page instance
   * @returns {{ getCount: () => number, cleanup: () => void }}
   */
  createResourceCounter(page) {
    let count = 0;

    const handler = (response) => {
      const url = response.url();
      const status = response.status();

      // Count successful resource responses
      if (status >= 200 && status < 400) {
        const contentType = response.headers()['content-type'] || '';

        // Track meaningful resources (not just navigation)
        if (
          contentType.includes('javascript') ||
          contentType.includes('css') ||
          contentType.includes('image') ||
          contentType.includes('font') ||
          contentType.includes('json') ||
          contentType.includes('html')
        ) {
          count++;
        }
      }
    };

    page.on('response', handler);

    return {
      getCount: () => count,
      cleanup: () => {
        page.off('response', handler);
      }
    };
  }

  /**
   * Safely execute an action with error handling
   * @param {Function} action - Action to execute
   * @param {object} logger - Logger instance
   * @param {string} description - Description for logging
   * @returns {Promise<boolean>} - Whether action succeeded
   */
  async safeExecute(action, logger, description) {
    try {
      await action();
      return true;
    } catch (error) {
      logger.debug(`${this.name}: Failed to ${description}: ${error.message}`);
      return false;
    }
  }

  /**
   * Wait for a specified duration
   * @param {number} ms - Milliseconds to wait
   */
  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
