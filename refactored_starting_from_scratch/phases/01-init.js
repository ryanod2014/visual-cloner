/**
 * Phase 01: Init
 * Browser launch and context setup
 */

import { chromium } from 'playwright';
import { Phase } from '../core/pipeline.js';

export class InitPhase extends Phase {
  constructor(config = {}) {
    super('init', 'Launch browser and configure context');
    this.config = config;
  }

  async execute(context) {
    const { url } = context;

    this.logger.info(`Target URL: ${url}`);

    if (this.config.dryRun) {
      this.logger.info('Would launch browser with headless mode');
      this.logger.info('Would create browser context with viewport 1920x1080');
      this.logger.info('Would create new page');
      this.logger.info('Would set up dialog handlers');

      // In dry run, we still need to create minimal browser for other phases
      // but we won't actually use it
      this.logger.info('Launching browser (minimal for dry-run)...');
      const browser = await chromium.launch({
        headless: true,
        args: ['--disable-web-security'],
      });
      const browserContext = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        bypassCSP: true,
      });
      const page = await browserContext.newPage();

      context.browser = browser;
      context.browserContext = browserContext;
      context.page = page;

      return {
        browserVersion: browser.version(),
        viewport: { width: 1920, height: 1080 },
        dryRun: true,
      };
    }

    // Launch browser
    this.logger.info('Launching browser...');
    this.trackAction(`Target: ${url}`);
    const browser = await chromium.launch({
      headless: this.config.headless !== false,
      args: ['--disable-web-security'],
    });
    this.trackCreated();
    this.trackAction(`Launched browser (v${browser.version()})`);

    // Create context with settings
    this.logger.info('Creating browser context...');
    const browserContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      bypassCSP: true,
    });
    this.trackCreated();
    this.trackAction('Created browser context (1920x1080, CSP bypassed)');

    // Create page
    const page = await browserContext.newPage();
    this.trackCreated();
    this.trackAction('Created new page');

    // Handle dialogs automatically
    page.on('dialog', async dialog => {
      this.logger.debug(`Dialog dismissed: ${dialog.message()}`);
      await dialog.dismiss();
    });

    // Store in context
    context.browser = browser;
    context.browserContext = browserContext;
    context.page = page;

    this.logger.info('Browser ready');

    return {
      browserVersion: browser.version(),
      viewport: { width: 1920, height: 1080 },
    };
  }
}

export default InitPhase;
