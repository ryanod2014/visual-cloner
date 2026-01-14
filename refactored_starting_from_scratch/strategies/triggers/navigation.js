import { BaseTrigger } from './base.js';

/**
 * Navigation trigger for loading route-specific content
 * Visits internal routes to trigger route-based lazy loading
 */
export class NavigationTrigger extends BaseTrigger {
  name = 'navigation';

  /**
   * Execute navigation trigger
   * @param {import('playwright').Page} page - Playwright page instance
   * @param {object} logger - Logger instance
   * @returns {Promise<number>} - Number of new resources loaded
   */
  async trigger(page, logger) {
    const counter = this.createResourceCounter(page);

    try {
      logger.debug(`${this.name}: Starting navigation trigger`);

      // Get the original URL to return to
      const originalUrl = page.url();
      const baseUrl = new URL(originalUrl);

      // Find all internal links
      const links = await page.$$eval('a[href^="/"], a[href^="./"], a[href^="../"]', (elements, origin) => {
        return elements
          .map(el => {
            try {
              const href = el.getAttribute('href');
              if (!href) return null;

              // Convert to absolute URL
              const url = new URL(href, origin);

              // Only include same-origin links
              if (url.origin !== origin) return null;

              return url.pathname;
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      }, baseUrl.origin);

      // Also find links that use the full origin
      const absoluteLinks = await page.$$eval(`a[href^="${baseUrl.origin}"]`, (elements, origin) => {
        return elements
          .map(el => {
            try {
              const url = new URL(el.href);
              if (url.origin !== origin) return null;
              return url.pathname;
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      }, baseUrl.origin);

      // Combine and deduplicate routes
      const allRoutes = [...new Set([...links, ...absoluteLinks])];

      // Filter out potentially dangerous routes
      const safeRoutes = allRoutes.filter(route => {
        const lowerRoute = route.toLowerCase();

        // Skip dangerous routes
        const dangerousPatterns = [
          '/logout', '/signout', '/sign-out',
          '/delete', '/remove',
          '/admin', '/settings',
          '/checkout', '/payment', '/purchase',
          '/api/', '/graphql',
          '.pdf', '.zip', '.exe', '.dmg'
        ];

        return !dangerousPatterns.some(pattern => lowerRoute.includes(pattern));
      });

      // Limit the number of routes to visit
      const maxRoutes = 20;
      const routesToVisit = safeRoutes.slice(0, maxRoutes);

      logger.debug(`${this.name}: Found ${safeRoutes.length} safe routes, visiting ${routesToVisit.length}`);

      let visitedCount = 0;

      for (const route of routesToVisit) {
        try {
          const targetUrl = new URL(route, baseUrl.origin).href;

          // Skip if it's the same as current URL
          if (targetUrl === page.url()) {
            continue;
          }

          logger.debug(`${this.name}: Visiting ${route}`);

          // Navigate to the route
          await page.goto(targetUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 10000
          });

          visitedCount++;

          // Wait a bit for lazy content to load
          await this.wait(500);

        } catch (error) {
          logger.debug(`${this.name}: Failed to visit ${route}: ${error.message}`);
        }
      }

      // Return to original URL
      try {
        await page.goto(originalUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 10000
        });
        await this.wait(300);
      } catch (error) {
        logger.debug(`${this.name}: Failed to return to original URL: ${error.message}`);
      }

      const resourceCount = counter.getCount();
      logger.debug(`${this.name}: Visited ${visitedCount} routes, loaded ${resourceCount} resources`);

      return resourceCount;
    } catch (error) {
      logger.error(`${this.name}: Error during navigation trigger: ${error.message}`);
      return counter.getCount();
    } finally {
      counter.cleanup();
    }
  }
}
