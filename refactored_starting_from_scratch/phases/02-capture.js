/**
 * Phase 02: Capture
 * Network response capture during page load
 *
 * Sets up CDP capture before navigation, navigates to URL,
 * waits for networkidle, saves initial HTML, and stores
 * captured resources in context.resources.
 *
 * Also proactively fetches resources referenced in HTML that
 * the browser hasn't requested yet.
 *
 * Includes WebGL shader capture via injection script.
 */

import { Phase } from '../core/pipeline.js';
import { extractFromHtml } from '../utils/url-extractor.js';
import { batch } from '../utils/async.js';

// Note: WebGL capture hooks are now installed at pipeline level (core/pipeline.js)

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
      this.logger.info('Would intercept service worker registrations');
      this.logger.info('Would navigate to page and capture network responses');
      this.logger.info('Would set up response listeners for all network requests');
      this.logger.info('Would wait for load event then networkidle state');
      this.logger.info('Would capture service worker scripts (intercepted + common paths)');
      this.logger.info('Would capture landing page HTML');
      this.logger.info('Would parse HTML for resource URLs');
      this.logger.info('Would proactively fetch resources referenced in HTML but not captured');
      this.logger.info('Would attempt to click start buttons for SPA loading');
      this.logger.info('Would wait for additional resources (8s)');

      // Simulate some captured resources
      const simulatedCount = 150;
      const simulatedDiscovered = 25;
      const simulatedSwCount = 1;
      const simulatedSize = 5 * 1024 * 1024; // 5MB
      this.logger.info(`Would capture approximately ${simulatedCount} resources (~${(simulatedSize / 1024 / 1024).toFixed(2)} MB)`);
      this.logger.info(`Would discover and fetch approximately ${simulatedDiscovered} additional resources from HTML`);
      this.logger.info(`Would capture approximately ${simulatedSwCount} service worker scripts`);

      return {
        resourceCount: simulatedCount,
        failedCount: 0,
        totalSize: simulatedSize,
        htmlSize: 50000,
        htmlDiscoveredCount: simulatedDiscovered,
        swCapturedCount: simulatedSwCount,
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

    // Intercept service worker registration before navigation
    await page.addInitScript(() => {
      // Store original registration function
      const originalRegister = navigator.serviceWorker?.register;
      window.__swUrls = [];

      if (originalRegister) {
        navigator.serviceWorker.register = function(scriptURL, options) {
          window.__swUrls.push(scriptURL);
          console.log('[SW Intercept] Captured:', scriptURL);
          // Don't actually register to prevent SW from interfering with capture
          return Promise.resolve({ scope: '/' });
        };
      }
    });
    this.logger.debug('Service worker interception enabled');

    // Note: WebGL capture hooks are installed at pipeline level (core/pipeline.js)
    // to ensure they're active before ANY navigation, including detect phase

    // Navigate to page
    this.logger.info(`Loading ${url}...`);
    this.trackAction('Navigating to target URL');
    const timeout = this.config.timeout || 60000;

    try {
      // Navigate with waitUntil: 'load' (ensures HTML and critical resources are loaded)
      await page.goto(url, {
        waitUntil: 'load',
        timeout,
      });
      this.trackAction('Page load event fired');
    } catch (error) {
      if (error.message.includes('timeout')) {
        this.logger.warn(`Navigation timeout after ${timeout}ms, continuing with captured resources`);
        this.trackWarning();
        this.trackAction('Navigation timeout (continuing)');
      } else {
        throw error;
      }
    }

    // ============================================
    // WEBGL SHADER EXTRACTION - MUST HAPPEN IMMEDIATELY AFTER LOAD
    // ============================================
    // Extract shaders NOW while page is fresh, BEFORE networkidle
    // V3 research shows this must happen within 5s of navigation
    this.logger.info('Waiting 5s for WebGL/gradient initialization...');
    await page.waitForTimeout(5000);

    // Scroll to trigger gradient initialization (like V3)
    this.logger.debug('Scrolling page to trigger lazy WebGL init...');
    try {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.3));
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
    } catch (e) {
      this.logger.debug('Scroll failed, continuing...');
    }

    // Check shader capture status
    const shaderStatus = await page.evaluate(() => ({
      installed: window.__webglCaptureInstalled === true,
      count: (window.__capturedShaders || []).length,
      canvases: document.querySelectorAll('canvas').length
    }));
    this.logger.info(`WebGL capture status: hooks=${shaderStatus.installed}, shaders=${shaderStatus.count}, canvases=${shaderStatus.canvases}`);

    // Extract WebGL data
    const webglData = await page.evaluate(() => {
      const shaders = window.__capturedShaders || [];
      const uniforms = window.__capturedUniforms || [];
      const uniformValues = window.__capturedUniformValues || {};
      const canvases = [];

      document.querySelectorAll('canvas').forEach((canvas, idx) => {
        const rect = canvas.getBoundingClientRect();
        const style = getComputedStyle(canvas);
        canvases.push({
          id: canvas.id || null,
          className: canvas.className || null,
          width: canvas.width,
          height: canvas.height,
          isVisible: rect.width > 10 && rect.height > 10 &&
                     style.display !== 'none' && style.visibility !== 'hidden'
        });
      });

      return {
        shaders: shaders.map(s => ({
          type: s.type,
          source: s.source,
          context: s.context,
          canvasId: s.canvasId,
          canvasClass: s.canvasClass,
          timestamp: s.timestamp
        })),
        uniforms: [...new Set(uniforms.map(u => u.name))],
        uniformValues: uniformValues,  // Captured uniform values!
        canvases,
        meta: {
          totalShadersCaptured: shaders.length,
          uniqueUniformCount: [...new Set(uniforms.map(u => u.name))].length,
          uniformValuesCount: Object.keys(uniformValues).length,
          canvasCount: canvases.length
        }
      };
    });

    if (webglData.shaders.length > 0) {
      context.webglData = webglData;
      this.logger.info(`Captured ${webglData.shaders.length} WebGL shaders, ${webglData.uniforms.length} uniforms`);
      this.trackAction(`Captured ${webglData.shaders.length} WebGL shaders`);
    } else {
      this.logger.info('No WebGL shaders captured');
      context.webglData = null;
    }

    // Now wait for network to settle (async resources)
    this.logger.info('Waiting for network to settle...');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {
      this.logger.debug('Network did not fully settle, continuing...');
    });
    this.trackAction('Network settled');

    // SERVICE WORKER CAPTURE: Collect intercepted SW URLs and fetch their scripts
    const origin = new URL(url).origin;
    let swCapturedCount = 0;

    // Get URLs captured by our interception
    const swUrls = await page.evaluate(() => window.__swUrls || []);
    if (swUrls.length > 0) {
      this.logger.info(`Intercepted ${swUrls.length} service worker registration(s)`);
    }

    // Common service worker paths to try proactively
    const commonSwPaths = [
      '/sw.js',
      '/service-worker.js',
      '/serviceworker.js',
      '/firebase-messaging-sw.js',
    ];

    // Combine intercepted URLs with common paths
    const allSwUrls = new Set([
      ...swUrls.map(swUrl => new URL(swUrl, origin).href),
      ...commonSwPaths.map(path => new URL(path, origin).href),
    ]);

    this.logger.debug(`Checking ${allSwUrls.size} potential service worker URLs...`);

    // Fetch service worker scripts
    for (const swUrl of allSwUrls) {
      if (resources.has(swUrl)) {
        continue; // Already captured
      }

      try {
        const response = await page.request.get(swUrl, {
          timeout: 5000,
          failOnStatusCode: false,
        });

        if (response.ok()) {
          const body = await response.body();
          resources.set(swUrl, {
            url: swUrl,
            body,
            contentType: 'application/javascript',
            size: body.length,
            capturedAt: new Date().toISOString(),
            source: 'service-worker',
          });

          swCapturedCount++;
          totalSize += body.length;
          capturedCount++;
          this.trackProcessed();
          this.trackCreated();
          this.logger.info(`Captured service worker: ${swUrl}`);
        }
      } catch (e) {
        this.logger.debug(`Service worker not found: ${swUrl}`);
      }
    }

    if (swCapturedCount > 0) {
      this.logger.info(`Service worker capture: ${swCapturedCount} scripts captured`);
      this.trackAction(`Captured ${swCapturedCount} service worker scripts`);
    } else {
      this.logger.debug('No service workers found');
    }

    // SAVE LANDING PAGE HTML FIRST (before any clicks)
    this.logger.info('Capturing landing page HTML...');
    const landingHtml = await page.content();
    context.landingHtml = landingHtml;
    this.trackAction(`Captured landing page HTML (${(landingHtml.length / 1024).toFixed(1)} KB)`);

    // PROACTIVE HTML DISCOVERY: Parse HTML for resource URLs the browser hasn't fetched yet
    const htmlUrls = extractFromHtml(landingHtml, origin);
    this.logger.info(`Found ${htmlUrls.size} URLs in HTML`);

    // Find URLs that weren't captured during page load
    const uncapturedUrls = [];
    for (const discoveredUrl of htmlUrls) {
      if (!resources.has(discoveredUrl)) {
        uncapturedUrls.push(discoveredUrl);
      }
    }

    this.logger.info(`Discovered ${uncapturedUrls.length} uncaptured resources in HTML`);

    // Track discovery metrics
    let htmlDiscoveredCount = 0;
    let htmlDiscoveryFailed = 0;

    // Proactively fetch uncaptured resources in parallel batches
    if (uncapturedUrls.length > 0) {
      const CONCURRENT_FETCHES = 15;

      this.logger.info(`Proactively fetching ${uncapturedUrls.length} resources (${CONCURRENT_FETCHES} concurrent)...`);

      await batch(uncapturedUrls, CONCURRENT_FETCHES, async (resourceUrl) => {
        try {
          // Skip if already captured (could happen during parallel fetching)
          if (resources.has(resourceUrl)) {
            return;
          }

          const response = await page.request.get(resourceUrl, {
            timeout: 10000,
            failOnStatusCode: false,
          });

          const status = response.status();
          if (status !== 200) {
            htmlDiscoveryFailed++;
            return;
          }

          const contentType = response.headers()['content-type'] || '';
          const body = await response.body();

          resources.set(resourceUrl, {
            url: resourceUrl,
            contentType,
            body,
            size: body.length,
            capturedAt: new Date().toISOString(),
            source: 'html-discovery',
          });

          htmlDiscoveredCount++;
          totalSize += body.length;
          capturedCount++;
          this.trackProcessed();
          this.trackCreated();
        } catch (error) {
          htmlDiscoveryFailed++;
          this.logger.debug(`Failed to fetch discovered URL: ${resourceUrl.slice(0, 60)}...`, { error: error.message });
        }
      });

      this.logger.info(`HTML discovery: fetched ${htmlDiscoveredCount}, failed ${htmlDiscoveryFailed}`);
      this.trackAction(`Proactively fetched ${htmlDiscoveredCount} resources from HTML`);
    }

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
    this.logger.info(`Service workers: ${swCapturedCount} captured`);
    this.logger.info(`HTML discovery: ${htmlDiscoveredCount} fetched, ${htmlDiscoveryFailed} failed`);
    this.logger.info(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

    return {
      resourceCount: capturedCount,
      failedCount,
      totalSize,
      htmlSize: landingHtml.length,
      htmlUrlsFound: htmlUrls.size,
      htmlDiscoveredCount,
      htmlDiscoveryFailed,
      swCapturedCount,
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
