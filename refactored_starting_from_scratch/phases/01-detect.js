/**
 * Phase 01: Detect
 * Bundler/Framework detection phase
 *
 * Identifies the bundler and framework used by the target site
 * to optimize subsequent discovery and extraction phases.
 */

import { chromium } from 'playwright';
import { Phase } from '../core/pipeline.js';
import { BaseDetector } from '../strategies/detection/base.js';
import { WebpackDetector } from '../strategies/detection/webpack.js';
import { NextJsDetector } from '../strategies/detection/nextjs.js';

// Available detectors in priority order
const DETECTORS = [
  new NextJsDetector(),
  new WebpackDetector(),
];

export class DetectPhase extends Phase {
  constructor(config = {}) {
    super('detect', 'Identify bundler and framework');
    this.config = config;
    this.detectors = DETECTORS;
  }

  async execute(context) {
    const { url } = context;

    this.logger.info(`Analyzing target: ${url}`);
    this.trackAction(`Target: ${url}`);

    if (this.config.dryRun) {
      this.logger.info('Would launch browser for detection');
      this.logger.info('Would analyze HTML and JavaScript for bundler patterns');
      this.logger.info('Would detect webpack, Next.js, Vite, or other bundlers');
      this.logger.info('Would check for matching app plugins');

      return {
        bundler: 'unknown',
        version: null,
        confidence: 0,
        appPlugin: null,
        dryRun: true,
      };
    }

    // Launch browser if not already available
    let browser = context.browser;
    let page = context.page;
    let browserContext = context.browserContext;
    let launchedBrowser = false;

    if (!browser) {
      this.logger.info('Launching browser for detection...');
      browser = await chromium.launch({
        headless: this.config.headless !== false,
        args: ['--disable-web-security'],
      });
      browserContext = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        bypassCSP: true,
      });
      page = await browserContext.newPage();
      launchedBrowser = true;

      // Store in context for subsequent phases
      context.browser = browser;
      context.browserContext = browserContext;
      context.page = page;

      // Handle dialogs
      page.on('dialog', async dialog => {
        this.logger.debug(`Dialog dismissed: ${dialog.message()}`);
        await dialog.dismiss();
      });

      this.trackCreated();
      this.trackAction(`Launched browser (v${browser.version()})`);
    }

    // Navigate to URL if needed
    const currentUrl = page.url();
    if (currentUrl === 'about:blank' || !currentUrl.startsWith('http')) {
      this.logger.info('Loading page for analysis...');
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        this.trackAction('Page loaded for analysis');
      } catch (error) {
        if (error.message.includes('timeout')) {
          this.logger.warn('Navigation timeout, continuing with partial content');
          this.trackWarning();
        } else {
          throw error;
        }
      }
    }

    // Get HTML content
    const html = await page.content();
    this.trackProcessed();

    // Run all detectors
    this.logger.info('Running bundler detection...');
    const results = [];

    for (const detector of this.detectors) {
      try {
        if (detector.canDetect(page, html)) {
          this.logger.debug(`Running ${detector.name} detector...`);
          const result = await detector.detect(page, html);
          results.push(result);
          this.trackProcessed();

          if (result.confidence > 0) {
            this.logger.info(`  ${detector.name}: ${(result.confidence * 100).toFixed(0)}% confidence`);
          }
        }
      } catch (error) {
        this.logger.warn(`Detector ${detector.name} failed: ${error.message}`);
        this.trackError();
      }
    }

    // Find best match
    const bestResult = results.reduce(
      (best, current) => (current.confidence > best.confidence ? current : best),
      { bundler: 'unknown', version: null, confidence: 0, metadata: {} }
    );

    // Check for matching app plugin
    const appPlugin = await this.findAppPlugin(context, html);

    // Store detection results in context
    context.detection = {
      bundler: bestResult.bundler,
      version: bestResult.version,
      confidence: bestResult.confidence,
      metadata: bestResult.metadata,
      allResults: results,
    };

    context.appPlugin = appPlugin;

    // Log result
    if (bestResult.confidence > 0.5) {
      this.logger.info(`Detected: ${bestResult.bundler} (${(bestResult.confidence * 100).toFixed(0)}% confidence)`);
      if (bestResult.version) {
        this.logger.info(`  Version: ${bestResult.version}`);
      }
      this.trackAction(`Detected ${bestResult.bundler} (${(bestResult.confidence * 100).toFixed(0)}%)`);
    } else {
      this.logger.info('No bundler detected with high confidence');
      this.trackAction('No bundler detected');
    }

    if (appPlugin) {
      this.logger.info(`App plugin: ${appPlugin.name}`);
      this.trackAction(`App plugin found: ${appPlugin.name}`);
    }

    return {
      bundler: bestResult.bundler,
      version: bestResult.version,
      confidence: bestResult.confidence,
      metadata: bestResult.metadata,
      appPlugin: appPlugin ? appPlugin.name : null,
    };
  }

  /**
   * Check if there's a matching app-specific plugin
   * @param {Object} context - Extraction context
   * @param {string} html - HTML content
   * @returns {Object|null} - App plugin if found
   */
  async findAppPlugin(context, html) {
    const { url } = context;
    const hostname = new URL(url).hostname;

    // Known app patterns
    const appPatterns = [
      {
        name: 'photopea',
        patterns: ['photopea.com', 'vecpea.com', 'jampea.com', 'U.alp'],
        test: (u, h) => u.includes('photopea') || h.includes('U.alp') || h.includes('Photopea'),
      },
      {
        name: 'figma',
        patterns: ['figma.com', 'figma-'],
        test: (u, h) => u.includes('figma') || h.includes('figma.'),
      },
      {
        name: 'canva',
        patterns: ['canva.com'],
        test: (u, h) => u.includes('canva.com') || h.includes('canva.'),
      },
    ];

    for (const app of appPatterns) {
      if (app.test(hostname, html)) {
        return {
          name: app.name,
          patterns: app.patterns,
        };
      }
    }

    return null;
  }

  /**
   * Register a custom detector
   * @param {BaseDetector} detector - Detector instance
   */
  addDetector(detector) {
    this.detectors.push(detector);
  }
}

export default DetectPhase;
