import { BaseTrigger } from './base.js';

/**
 * Scroll trigger for loading lazy content (40-50% of lazy resources)
 * Scrolls through the page to trigger intersection observers and lazy loaders
 */
export class ScrollTrigger extends BaseTrigger {
  name = 'scroll';

  /**
   * Execute scroll-based lazy loading trigger
   * @param {import('playwright').Page} page - Playwright page instance
   * @param {object} logger - Logger instance
   * @returns {Promise<number>} - Number of new resources loaded
   */
  async trigger(page, logger) {
    const counter = this.createResourceCounter(page);

    try {
      logger.debug(`${this.name}: Starting scroll trigger`);

      // Get initial page height
      let previousHeight = await page.evaluate(() => document.body.scrollHeight);
      let noChangeCount = 0;
      const maxNoChangeCount = 10;
      const scrollIncrement = 500;
      const scrollDelay = 200;

      // Scroll to top first
      await page.evaluate(() => window.scrollTo(0, 0));
      await this.wait(100);

      while (noChangeCount < maxNoChangeCount) {
        // Get current scroll position and page height
        const { scrollY, scrollHeight, innerHeight } = await page.evaluate(() => ({
          scrollY: window.scrollY,
          scrollHeight: document.body.scrollHeight,
          innerHeight: window.innerHeight
        }));

        // Check if we're at the bottom
        if (scrollY + innerHeight >= scrollHeight) {
          // Check for infinite scroll - did the page height change?
          await this.wait(scrollDelay * 2); // Extra wait for content to load

          const newHeight = await page.evaluate(() => document.body.scrollHeight);

          if (newHeight === previousHeight) {
            noChangeCount++;
            logger.debug(`${this.name}: No height change (${noChangeCount}/${maxNoChangeCount})`);
          } else {
            noChangeCount = 0;
            previousHeight = newHeight;
            logger.debug(`${this.name}: Page height increased to ${newHeight}px`);
          }

          // Continue scrolling if page grew
          if (noChangeCount < maxNoChangeCount && newHeight > scrollHeight) {
            continue;
          }

          // If no change, we're done
          if (noChangeCount >= maxNoChangeCount) {
            break;
          }
        }

        // Scroll down by increment
        await page.evaluate((increment) => {
          window.scrollBy(0, increment);
        }, scrollIncrement);

        await this.wait(scrollDelay);
      }

      // Return to top of page
      await page.evaluate(() => window.scrollTo(0, 0));
      await this.wait(100);

      const resourceCount = counter.getCount();
      logger.debug(`${this.name}: Loaded ${resourceCount} resources via scrolling`);

      return resourceCount;
    } catch (error) {
      logger.error(`${this.name}: Error during scroll trigger: ${error.message}`);
      return counter.getCount();
    } finally {
      counter.cleanup();
    }
  }
}
