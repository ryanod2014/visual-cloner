/**
 * Phase 02: Capture
 * Network response capture during page load
 *
 * Sets up CDP capture before navigation, navigates to URL,
 * waits for networkidle, saves initial HTML, and stores
 * captured resources in context.resources.
 */

import { Phase } from '../core/pipeline.js';

export class CapturePhase extends Phase {
  constructor(config = {}) {
    super('capture', 'Capture all network responses');
    this.config = config;
  }

  async execute(context) {
    const { page, url } = context;
    const resources = context.resources;

    let capturedCount = 0;
    let failedCount = 0;
    let totalSize = 0;

    if (this.config.dryRun) {
      this.logger.info('Would set up CDP capture before navigation');
      this.logger.info('Would navigate to page and capture network responses');
      this.logger.info('Would set up response listeners for all network requests');
      this.logger.info('Would wait for networkidle state');
      this.logger.info('Would capture landing page HTML');
      this.logger.info('Would attempt to click start buttons for SPA loading');
      this.logger.info('Would wait for additional resources (8s)');

      // Simulate some captured resources
      const simulatedCount = 150;
      const simulatedSize = 5 * 1024 * 1024; // 5MB
      this.logger.info(`Would capture approximately ${simulatedCount} resources (~${(simulatedSize / 1024 / 1024).toFixed(2)} MB)`);

      return {
        resourceCount: simulatedCount,
        failedCount: 0,
        totalSize: simulatedSize,
        htmlSize: 50000,
        dryRun: true,
      };
    }

    // Set up CDP session for enhanced capture if available
    let cdpSession = null;
    try {
      const browserContext = context.browserContext;
      cdpSession = await browserContext.newCDPSession(page);
      await cdpSession.send('Network.enable');
      this.logger.debug('CDP session established for enhanced capture');
      this.trackAction('CDP capture enabled');
    } catch (error) {
      this.logger.debug('CDP session not available, using standard capture');
    }

    // Set up response listener
    const responseHandler = async (response) => {
      const resUrl = response.url();
      const status = response.status();

      // Skip non-HTTP
      if (resUrl.startsWith('data:') || resUrl.startsWith('blob:')) return;

      // Skip duplicates
      if (resources.has(resUrl)) return;

      // Only capture successful responses
      if (status !== 200) return;

      try {
        const contentType = response.headers()['content-type'] || '';
        const body = await response.body();

        resources.set(resUrl, {
          url: resUrl,
          contentType,
          body,
          size: body.length,
          capturedAt: new Date().toISOString(),
          source: 'capture',
        });

        capturedCount++;
        totalSize += body.length;

        // Track metrics
        this.trackProcessed();
        this.trackCreated();

        // Progress every 50 resources
        if (capturedCount % 50 === 0) {
          this.logger.info(`Captured ${capturedCount} resources (${(totalSize / 1024 / 1024).toFixed(1)} MB)`);
        }
      } catch (error) {
        failedCount++;
        this.trackError();
        this.logger.debug(`Failed to capture: ${resUrl.slice(0, 60)}...`, { error: error.message });
      }
    };

    page.on('response', responseHandler);

    // Track failed requests
    const failedHandler = (request) => {
      const failure = request.failure();
      this.logger.debug(`Request failed: ${request.url().slice(0, 60)}...`, {
        error: failure?.errorText,
      });
    };
    page.on('requestfailed', failedHandler);

    // Navigate to page
    this.logger.info(`Loading ${url}...`);
    this.trackAction('Navigating to target URL');
    const timeout = this.config.timeout || 60000;

    try {
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout,
      });
      this.trackAction('Page loaded successfully');
    } catch (error) {
      if (error.message.includes('timeout')) {
        this.logger.warn(`Navigation timeout after ${timeout}ms, continuing with captured resources`);
        this.trackWarning();
        this.trackAction('Navigation timeout (continuing)');
      } else {
        throw error;
      }
    }

    // Extra wait for any pending requests
    this.logger.info('Waiting for additional resources...');
    await page.waitForTimeout(2000);

    // SAVE LANDING PAGE HTML FIRST (before any clicks)
    this.logger.info('Capturing landing page HTML...');
    const landingHtml = await page.content();
    context.landingHtml = landingHtml;
    this.trackAction(`Captured landing page HTML (${(landingHtml.length / 1024).toFixed(1)} KB)`);

    const beforeClickCount = capturedCount;

    // Try to click "start" buttons to load SPA content
    const clicked = await this.clickStartButtons(page);
    if (clicked) {
      this.trackAction('Clicked start button to load SPA');
    }

    // Wait for app to load
    this.logger.info('Waiting for app resources...');
    await page.waitForTimeout(8000);

    // Log if we got more resources
    const afterClickCount = capturedCount;
    if (afterClickCount > beforeClickCount) {
      this.logger.info(`Loaded ${afterClickCount - beforeClickCount} additional resources after click`);
      this.trackAction(`Loaded ${afterClickCount - beforeClickCount} resources after interaction`);
    }

    // Capture final HTML (use landing page for offline serving)
    this.logger.info('Using landing page HTML for offline serving');
    context.html = landingHtml;

    // Clean up CDP session
    if (cdpSession) {
      try {
        await cdpSession.detach();
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    // Remove event listeners
    page.off('response', responseHandler);
    page.off('requestfailed', failedHandler);

    // Log summary
    this.logger.info(`Capture complete: ${capturedCount} resources, ${failedCount} failed`);
    this.logger.info(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

    return {
      resourceCount: capturedCount,
      failedCount,
      totalSize,
      htmlSize: landingHtml.length,
    };
  }

  /**
   * Try to click common "start" buttons to load SPA content
   */
  async clickStartButtons(page) {
    const startSelectors = [
      // Photopea specific
      'text=/start using photopea/i',
      'text=/start for free/i',
      // Generic patterns
      'text=/get started/i',
      'text=/launch app/i',
      'text=/open editor/i',
      'text=/continue/i',
      '[data-testid="start-button"]',
      '.start-button',
      '#start-button',
    ];

    for (const selector of startSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          const isVisible = await button.isVisible();
          if (isVisible) {
            this.logger.info(`Found start button: ${selector}`);
            await button.click();
            this.logger.info('Clicked start button, waiting for app load...');
            return true;
          }
        }
      } catch (e) {
        // Selector didn't match, try next
      }
    }

    this.logger.debug('No start button found (this is fine for non-SPA sites)');
    return false;
  }
}

export default CapturePhase;
