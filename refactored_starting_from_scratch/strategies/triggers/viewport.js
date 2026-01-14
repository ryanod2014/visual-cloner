import { BaseTrigger } from './base.js';

/**
 * Viewport trigger for loading responsive content (5-10% of lazy resources)
 * Resizes viewport to trigger media queries and responsive lazy loading
 */
export class ViewportTrigger extends BaseTrigger {
  name = 'viewport';

  /**
   * Execute viewport resize trigger
   * @param {import('playwright').Page} page - Playwright page instance
   * @param {object} logger - Logger instance
   * @returns {Promise<number>} - Number of new resources loaded
   */
  async trigger(page, logger) {
    const counter = this.createResourceCounter(page);

    try {
      logger.debug(`${this.name}: Starting viewport trigger`);

      // Get original viewport size
      const originalViewport = page.viewportSize();
      const resizeDelay = 300;

      // Viewports to test (common breakpoints)
      const viewports = [
        { name: 'mobile', width: 375, height: 812 },    // iPhone X
        { name: 'tablet', width: 768, height: 1024 },   // iPad
        { name: 'desktop', width: 1920, height: 1080 }  // Full HD
      ];

      for (const viewport of viewports) {
        try {
          logger.debug(`${this.name}: Testing ${viewport.name} viewport (${viewport.width}x${viewport.height})`);

          await page.setViewportSize({
            width: viewport.width,
            height: viewport.height
          });

          await this.wait(resizeDelay);

          // Trigger resize event explicitly (some sites listen for this)
          await page.evaluate(() => {
            window.dispatchEvent(new Event('resize'));
          });

          await this.wait(resizeDelay);

        } catch (error) {
          logger.debug(`${this.name}: Failed to test ${viewport.name}: ${error.message}`);
        }
      }

      // Restore original viewport
      if (originalViewport) {
        await page.setViewportSize(originalViewport);
        await this.wait(100);
      }

      const resourceCount = counter.getCount();
      logger.debug(`${this.name}: Loaded ${resourceCount} resources via viewport changes`);

      return resourceCount;
    } catch (error) {
      logger.error(`${this.name}: Error during viewport trigger: ${error.message}`);
      return counter.getCount();
    } finally {
      counter.cleanup();
    }
  }
}
