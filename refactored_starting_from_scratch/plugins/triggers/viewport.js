/**
 * Viewport Trigger
 * Triggers features by resizing viewport and scrolling
 */

import { ITrigger } from './interface.js';

export class ViewportTrigger extends ITrigger {
  constructor() {
    super('viewport', 'Trigger features via viewport changes');
  }

  async execute(page, options = {}) {
    const { onProgress = null } = options;

    const stats = {
      resizes: 0,
      scrolls: 0,
    };

    const log = (msg) => onProgress?.(msg);

    // Save original viewport
    const originalViewport = page.viewportSize();

    // === VIEWPORT RESIZE ===
    log('Testing viewport sizes...');
    const viewports = [
      { width: 800, height: 600, name: 'small' },
      { width: 1920, height: 1080, name: 'full-hd' },
      { width: 2560, height: 1440, name: '2k' },
      { width: 3840, height: 2160, name: '4k' },
      { width: 375, height: 812, name: 'mobile' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 1024, height: 768, name: 'tablet-landscape' },
    ];

    for (const viewport of viewports) {
      try {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        stats.resizes++;
        await page.waitForTimeout(500);
      } catch (e) {}
    }

    // Reset to original or default
    try {
      if (originalViewport) {
        await page.setViewportSize(originalViewport);
      } else {
        await page.setViewportSize({ width: 1440, height: 900 });
      }
    } catch (e) {}

    // === SCROLL ===
    log('Scrolling page...');
    try {
      const pageHeight = await page.evaluate(() => document.body.scrollHeight);

      // Scroll down in chunks
      for (let y = 0; y < pageHeight; y += 500) {
        await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
        stats.scrolls++;
        await page.waitForTimeout(100);
      }

      // Scroll back to top
      await page.evaluate(() => window.scrollTo(0, 0));
    } catch (e) {}

    // === SCROLL INNER CONTAINERS ===
    log('Scrolling inner containers...');
    try {
      // Find scrollable elements and scroll them
      await page.evaluate(() => {
        const scrollables = document.querySelectorAll('[style*="overflow"]');
        scrollables.forEach(el => {
          if (el.scrollHeight > el.clientHeight) {
            el.scrollTop = el.scrollHeight;
            setTimeout(() => el.scrollTop = 0, 100);
          }
        });
      });
      stats.scrolls++;
    } catch (e) {}

    return stats;
  }
}

export default ViewportTrigger;
