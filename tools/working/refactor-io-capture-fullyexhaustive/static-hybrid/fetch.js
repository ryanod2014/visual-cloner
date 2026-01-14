/**
 * PHASE 0: Asset Fetch
 *
 * One-time browser interaction to fetch all assets.
 * Goal: Get HTML, CSS, JS, and event bindings in < 10 seconds.
 *
 * IMPORTANT: For SPAs like Photopea that load scripts from external domains,
 * we need to explicitly fetch scripts after page load since response handlers
 * may not capture cross-origin script bodies due to CORS.
 */

const { chromium } = require('playwright');

/**
 * Fetch all assets from a URL
 */
async function fetchAssets(url) {
  const startTime = Date.now();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  // Track script URLs we've captured via response handler
  const capturedScriptUrls = new Set();
  const capturedStyleUrls = new Set();
  const scripts = [];
  const styles = [];

  page.on('response', async (response) => {
    const respUrl = response.url();
    const contentType = response.headers()['content-type'] || '';

    try {
      if (contentType.includes('javascript') || respUrl.endsWith('.js')) {
        const content = await response.text().catch(() => '');
        if (content && content.length > 100) { // Only count substantial scripts
          capturedScriptUrls.add(respUrl);
          scripts.push({
            url: respUrl,
            content,
            size: content.length
          });
        }
      } else if (contentType.includes('css') || respUrl.endsWith('.css')) {
        const content = await response.text().catch(() => '');
        if (content) {
          capturedStyleUrls.add(respUrl);
          styles.push({
            url: respUrl,
            content,
            size: content.length
          });
        }
      }
    } catch (e) {
      // Ignore failed resource fetches
    }
  });

  // Navigate and wait for load
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  // For heavy SPAs, wait additional time for JS to fully initialize
  console.log('  Waiting for SPA initialization...');
  await page.waitForTimeout(2000);

  // Detect if this is a landing page that needs interaction to load the actual app
  // Check for canvas, iframe, or significant DOM complexity
  const isLandingPage = await page.evaluate(() => {
    const hasCanvas = !!document.querySelector('canvas');
    const hasIframe = !!document.querySelector('iframe:not([src*="ad"]):not([src*="google"]):not([src*="facebook"])');
    const elemCount = document.querySelectorAll('*').length;
    const hasComplexApp = elemCount > 500; // Simple heuristic

    return !hasCanvas && !hasIframe && !hasComplexApp;
  });

  if (isLandingPage) {
    console.log('  Landing page detected, looking for entry point...');

    // Look for common entry buttons
    const entrySelectors = [
      'button:has-text("Start")',
      'button:has-text("Launch")',
      'button:has-text("Enter")',
      'button:has-text("Open")',
      'button:has-text("Get Started")',
      'button:has-text("Try")',
      '[data-action="start"]',
      '.start-button',
      '.launch-button',
      'a.cta-button',
      'button.primary'
    ];

    for (const selector of entrySelectors) {
      try {
        const btn = await page.$(selector);
        if (btn) {
          const btnText = await btn.textContent().catch(() => '');
          console.log(`  Found entry button: "${btnText?.trim()?.substring(0, 40)}", clicking...`);
          await btn.click();

          // Wait for the app to load
          console.log('  Waiting for app to load...');
          await page.waitForTimeout(10000);

          // Wait for network idle again
          await page.waitForLoadState('networkidle').catch(() => {});
          break;
        }
      } catch (e) {
        // Selector not found, try next
      }
    }
  }

  // Wait for potential lazy-loaded content
  let lastScriptCount = scripts.length;
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(1000);
    if (scripts.length === lastScriptCount) break;
    lastScriptCount = scripts.length;
  }

  // Get HTML content
  const html = await page.content();

  // CRITICAL: Explicitly fetch all script sources that weren't captured via response handler
  // This handles cross-origin scripts (like Photopea loading from vecpea.com)
  console.log('  Fetching external scripts...');
  const externalScriptUrls = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
  });

  for (const scriptUrl of externalScriptUrls) {
    if (!capturedScriptUrls.has(scriptUrl)) {
      try {
        // Fetch using page context to bypass CORS
        const content = await page.evaluate(async (fetchUrl) => {
          try {
            const resp = await fetch(fetchUrl);
            return await resp.text();
          } catch (e) {
            return null;
          }
        }, scriptUrl);

        if (content && content.length > 0) {
          scripts.push({
            url: scriptUrl,
            content,
            size: content.length,
            fetchedManually: true
          });
          console.log(`    ✓ Fetched: ${scriptUrl.substring(0, 60)}... (${(content.length / 1024).toFixed(0)} KB)`);
        }
      } catch (e) {
        console.log(`    ✗ Failed to fetch: ${scriptUrl}`);
      }
    }
  }

  // Get inline scripts
  const inlineScripts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script:not([src])')).map(s => ({
      url: 'inline',
      content: s.textContent,
      size: s.textContent.length
    }));
  });
  scripts.push(...inlineScripts);

  // Fetch external stylesheets that weren't captured
  console.log('  Fetching external stylesheets...');
  const externalStyleUrls = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(s => s.href);
  });

  for (const styleUrl of externalStyleUrls) {
    if (!capturedStyleUrls.has(styleUrl)) {
      try {
        const content = await page.evaluate(async (fetchUrl) => {
          try {
            const resp = await fetch(fetchUrl);
            return await resp.text();
          } catch (e) {
            return null;
          }
        }, styleUrl);

        if (content && content.length > 0) {
          styles.push({
            url: styleUrl,
            content,
            size: content.length,
            fetchedManually: true
          });
          console.log(`    ✓ Fetched: ${styleUrl.substring(0, 60)}... (${(content.length / 1024).toFixed(0)} KB)`);
        }
      } catch (e) {
        // Ignore
      }
    }
  }

  // Get inline styles
  const inlineStyles = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('style')).map(s => ({
      url: 'inline',
      content: s.textContent,
      size: s.textContent.length
    }));
  });
  styles.push(...inlineStyles);

  // Also get computed stylesheets from CSSOM (catches dynamically injected styles)
  const cssomStyles = await page.evaluate(() => {
    const results = [];
    for (const sheet of document.styleSheets) {
      try {
        let cssText = '';
        for (const rule of sheet.cssRules) {
          cssText += rule.cssText + '\n';
        }
        if (cssText.length > 0) {
          results.push({
            url: sheet.href || 'cssom-inline',
            content: cssText,
            size: cssText.length,
            fromCSSOM: true
          });
        }
      } catch (e) {
        // Cross-origin stylesheets can't be read via CSSOM
      }
    }
    return results;
  });

  // Add CSSOM styles that we don't already have
  for (const cssomStyle of cssomStyles) {
    if (!styles.some(s => s.url === cssomStyle.url)) {
      styles.push(cssomStyle);
    }
  }

  // Extract event listeners via CDP
  const eventListeners = await extractEventListeners(page);

  // Get initial DOM state
  const initialDOM = await page.evaluate(() => {
    function serializeElement(el, depth = 0) {
      if (depth > 10) return null;

      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);

      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        className: el.className || undefined,
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y + window.scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        visible: rect.width > 0 && rect.height > 0 &&
                 cs.display !== 'none' && cs.visibility !== 'hidden',
        interactive: ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) ||
                     el.onclick || el.getAttribute('role') === 'button',
        children: Array.from(el.children).map(c => serializeElement(c, depth + 1)).filter(Boolean)
      };
    }

    return serializeElement(document.body);
  });

  await browser.close();

  return {
    url,
    html,
    scripts,
    styles,
    eventListeners,
    initialDOM,
    timing: Date.now() - startTime
  };
}

/**
 * Extract event listeners via Chrome DevTools Protocol
 *
 * Uses a more robust approach:
 * 1. Get all elements via querySelectorAll('*')
 * 2. For each element, use CDP to get its event listeners
 */
async function extractEventListeners(page) {
  const listeners = [];

  // Get CDP session
  const client = await page.context().newCDPSession(page);

  console.log('  Extracting event listeners via CDP...');

  try {
    // First, check document and window level listeners
    const docResult = await client.send('Runtime.evaluate', {
      expression: 'document',
      objectGroup: 'listeners'
    });

    if (docResult.result?.objectId) {
      const { listeners: docListeners } = await client.send('DOMDebugger.getEventListeners', {
        objectId: docResult.result.objectId
      }).catch(() => ({ listeners: [] }));

      for (const listener of docListeners) {
        listeners.push({
          selector: 'document',
          type: listener.type,
          handler: listener.handler?.description?.substring(0, 500) || 'anonymous',
          useCapture: listener.useCapture,
          passive: listener.passive,
          once: listener.once,
          scriptId: listener.scriptId,
          lineNumber: listener.lineNumber,
          columnNumber: listener.columnNumber
        });
      }
    }

    // Check window level listeners
    const winResult = await client.send('Runtime.evaluate', {
      expression: 'window',
      objectGroup: 'listeners'
    });

    if (winResult.result?.objectId) {
      const { listeners: winListeners } = await client.send('DOMDebugger.getEventListeners', {
        objectId: winResult.result.objectId
      }).catch(() => ({ listeners: [] }));

      for (const listener of winListeners) {
        listeners.push({
          selector: 'window',
          type: listener.type,
          handler: listener.handler?.description?.substring(0, 500) || 'anonymous',
          useCapture: listener.useCapture,
          passive: listener.passive,
          once: listener.once,
          scriptId: listener.scriptId,
          lineNumber: listener.lineNumber,
          columnNumber: listener.columnNumber
        });
      }
    }

    // Get count of all elements
    const countResult = await page.evaluate(() => document.querySelectorAll('*').length);
    console.log(`    Found ${countResult} elements to check`);

    // Process elements in batches to avoid memory issues
    const batchSize = 100;
    let processedCount = 0;
    let foundCount = 0;

    for (let offset = 0; offset < countResult; offset += batchSize) {
      // Get batch of elements
      const batchResult = await client.send('Runtime.evaluate', {
        expression: `
          (function() {
            const all = document.querySelectorAll('*');
            const batch = [];
            for (let i = ${offset}; i < Math.min(${offset + batchSize}, all.length); i++) {
              const el = all[i];
              batch.push({
                index: i,
                selector: el.id ? '#' + el.id :
                         el.className ? el.tagName.toLowerCase() + '.' + el.className.split(' ')[0] :
                         el.tagName.toLowerCase()
              });
            }
            return batch;
          })()
        `,
        returnByValue: true
      });

      const batchElements = batchResult.result?.value || [];

      // For each element in batch, get its listeners
      for (const elemInfo of batchElements) {
        try {
          const elResult = await client.send('Runtime.evaluate', {
            expression: `document.querySelectorAll('*')[${elemInfo.index}]`,
            objectGroup: 'listeners'
          });

          if (elResult.result?.objectId) {
            const { listeners: elListeners } = await client.send('DOMDebugger.getEventListeners', {
              objectId: elResult.result.objectId
            }).catch(() => ({ listeners: [] }));

            for (const listener of elListeners) {
              foundCount++;
              listeners.push({
                selector: elemInfo.selector,
                elementIndex: elemInfo.index,
                type: listener.type,
                handler: listener.handler?.description?.substring(0, 500) || 'anonymous',
                useCapture: listener.useCapture,
                passive: listener.passive,
                once: listener.once,
                scriptId: listener.scriptId,
                lineNumber: listener.lineNumber,
                columnNumber: listener.columnNumber
              });
            }
          }
        } catch (e) {
          // Element might have been removed
        }
        processedCount++;
      }

      // Progress indicator for large DOMs
      if (processedCount % 500 === 0) {
        console.log(`    Processed ${processedCount}/${countResult} elements, found ${foundCount} listeners...`);
      }
    }

    console.log(`    ✓ Found ${listeners.length} event listeners across ${countResult} elements`);

  } catch (e) {
    console.log(`    ✗ Error extracting event listeners: ${e.message}`);
  }

  return listeners;
}

module.exports = { fetchAssets, extractEventListeners };
