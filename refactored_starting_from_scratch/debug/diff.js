/**
 * Page Comparison Tool
 *
 * Compares online and offline page states to identify differences.
 * Checks console errors, network failures, visual differences, and functionality.
 *
 * Usage:
 *   const result = await comparePage(onlinePage, offlinePage);
 *   console.log(result.differences);
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Comparison result structure
 * @typedef {Object} ComparisonResult
 * @property {boolean} match - Overall match (true if pages are equivalent)
 * @property {number} score - Match score 0-100
 * @property {Object} console - Console comparison results
 * @property {Object} network - Network comparison results
 * @property {Object} visual - Visual comparison results
 * @property {Object} functional - Functional test results
 * @property {string[]} differences - List of identified differences
 * @property {string[]} recommendations - Suggestions for fixing differences
 */

/**
 * Compare online and offline page states
 * @param {import('playwright').Page} onlinePage - Online page instance
 * @param {import('playwright').Page} offlinePage - Offline page instance
 * @param {Object} options - Comparison options
 * @returns {Promise<ComparisonResult>}
 */
export async function comparePage(onlinePage, offlinePage, options = {}) {
  const opts = {
    screenshotDir: options.screenshotDir || null,
    checkConsole: options.checkConsole !== false,
    checkNetwork: options.checkNetwork !== false,
    checkVisual: options.checkVisual !== false,
    checkFunctional: options.checkFunctional || false,
    timeout: options.timeout || 5000,
    ...options,
  };

  const result = {
    match: true,
    score: 100,
    console: null,
    network: null,
    visual: null,
    functional: null,
    differences: [],
    recommendations: [],
  };

  // 1. Console comparison
  if (opts.checkConsole) {
    result.console = await compareConsole(onlinePage, offlinePage);
    if (!result.console.match) {
      result.match = false;
      result.score -= result.console.newErrors.length * 5;
      result.differences.push(...result.console.differences);
      result.recommendations.push(...result.console.recommendations);
    }
  }

  // 2. Network comparison
  if (opts.checkNetwork) {
    result.network = await compareNetwork(onlinePage, offlinePage, opts);
    if (!result.network.match) {
      result.match = false;
      result.score -= result.network.failedOffline.length * 3;
      result.differences.push(...result.network.differences);
      result.recommendations.push(...result.network.recommendations);
    }
  }

  // 3. Visual comparison
  if (opts.checkVisual && opts.screenshotDir) {
    result.visual = await compareVisual(onlinePage, offlinePage, opts);
    if (!result.visual.match) {
      result.match = false;
      result.score -= Math.round(result.visual.diffPercentage);
      result.differences.push(...result.visual.differences);
      result.recommendations.push(...result.visual.recommendations);
    }
  }

  // 4. Functional tests
  if (opts.checkFunctional) {
    result.functional = await compareFunctional(onlinePage, offlinePage, opts);
    if (!result.functional.match) {
      result.match = false;
      result.score -= result.functional.failures.length * 10;
      result.differences.push(...result.functional.differences);
      result.recommendations.push(...result.functional.recommendations);
    }
  }

  // Normalize score
  result.score = Math.max(0, result.score);

  return result;
}

/**
 * Compare console output between pages
 * @param {import('playwright').Page} onlinePage
 * @param {import('playwright').Page} offlinePage
 * @returns {Promise<Object>}
 */
export async function compareConsole(onlinePage, offlinePage) {
  const result = {
    match: true,
    onlineErrors: [],
    offlineErrors: [],
    newErrors: [],
    differences: [],
    recommendations: [],
  };

  // Collect console messages
  const collectConsole = async (page, timeout = 2000) => {
    const messages = [];

    const handler = (msg) => {
      messages.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location(),
      });
    };

    page.on('console', handler);

    // Wait a bit for any async errors
    await page.waitForTimeout(timeout);

    page.off('console', handler);

    return messages;
  };

  // Note: This is a simplified version - in practice you'd capture
  // console during page load, not after
  result.onlineErrors = await getPageErrors(onlinePage);
  result.offlineErrors = await getPageErrors(offlinePage);

  // Find new errors (in offline but not in online)
  const onlineErrorTexts = new Set(result.onlineErrors.map(e => e.text));

  for (const error of result.offlineErrors) {
    if (!onlineErrorTexts.has(error.text)) {
      result.newErrors.push(error);
    }
  }

  if (result.newErrors.length > 0) {
    result.match = false;

    // Categorize errors
    const networkErrors = result.newErrors.filter(e =>
      e.text.includes('Failed to fetch') ||
      e.text.includes('NetworkError') ||
      e.text.includes('net::') ||
      e.text.includes('404')
    );

    const scriptErrors = result.newErrors.filter(e =>
      e.text.includes('Uncaught') ||
      e.text.includes('SyntaxError') ||
      e.text.includes('ReferenceError') ||
      e.text.includes('TypeError')
    );

    if (networkErrors.length > 0) {
      result.differences.push(`${networkErrors.length} network-related errors in offline mode`);
      result.recommendations.push('Check for missing resources that fail to load offline');
    }

    if (scriptErrors.length > 0) {
      result.differences.push(`${scriptErrors.length} JavaScript errors in offline mode`);
      result.recommendations.push('Review JavaScript patches - some functionality may be broken');
    }
  }

  return result;
}

/**
 * Get page errors from console
 * @param {import('playwright').Page} page
 * @returns {Promise<Object[]>}
 */
async function getPageErrors(page) {
  try {
    // Evaluate to get any stored console errors
    const errors = await page.evaluate(() => {
      // This would need to be set up during page load
      return window.__consoleErrors || [];
    });
    return errors;
  } catch (e) {
    return [];
  }
}

/**
 * Compare network requests between pages
 * @param {import('playwright').Page} onlinePage
 * @param {import('playwright').Page} offlinePage
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function compareNetwork(onlinePage, offlinePage, options = {}) {
  const result = {
    match: true,
    onlineRequests: [],
    offlineRequests: [],
    failedOnline: [],
    failedOffline: [],
    differences: [],
    recommendations: [],
  };

  // Collect failed requests during a navigation/interaction
  const collectFailed = async (page, timeout = 3000) => {
    const failed = [];

    const handler = (request) => {
      const failure = request.failure();
      failed.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        error: failure?.errorText || 'Unknown error',
      });
    };

    page.on('requestfailed', handler);

    await page.waitForTimeout(timeout);

    page.off('requestfailed', handler);

    return failed;
  };

  // This is simplified - in practice you'd collect during page load
  // For now, we'll try to detect current state

  try {
    // Get any network-related errors from offline page
    const offlineNetworkErrors = await offlinePage.evaluate(() => {
      const errors = [];

      // Check for failed image loads
      document.querySelectorAll('img').forEach(img => {
        if (!img.complete || img.naturalWidth === 0) {
          errors.push({ type: 'image', url: img.src });
        }
      });

      // Check for failed script loads
      document.querySelectorAll('script[src]').forEach(script => {
        // Scripts that fail to load don't have an easy way to detect
        // This is a simplified check
      });

      return errors;
    });

    if (offlineNetworkErrors.length > 0) {
      result.match = false;
      result.failedOffline = offlineNetworkErrors;
      result.differences.push(`${offlineNetworkErrors.length} resources failed to load offline`);
      result.recommendations.push('Check missing resources analysis for details');
    }
  } catch (e) {
    // Page might not be accessible
  }

  return result;
}

/**
 * Compare visual appearance between pages
 * @param {import('playwright').Page} onlinePage
 * @param {import('playwright').Page} offlinePage
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function compareVisual(onlinePage, offlinePage, options = {}) {
  const result = {
    match: true,
    diffPercentage: 0,
    onlineScreenshot: null,
    offlineScreenshot: null,
    diffScreenshot: null,
    differences: [],
    recommendations: [],
  };

  if (!options.screenshotDir) {
    return result;
  }

  try {
    await fs.mkdir(options.screenshotDir, { recursive: true });

    // Take screenshots
    const onlinePath = path.join(options.screenshotDir, 'online.png');
    const offlinePath = path.join(options.screenshotDir, 'offline.png');

    await onlinePage.screenshot({
      path: onlinePath,
      fullPage: options.fullPage || false,
    });

    await offlinePage.screenshot({
      path: offlinePath,
      fullPage: options.fullPage || false,
    });

    result.onlineScreenshot = onlinePath;
    result.offlineScreenshot = offlinePath;

    // Compare screenshots (simplified - no pixel diff library)
    // In a full implementation, you'd use a library like pixelmatch

    const onlineStats = await fs.stat(onlinePath);
    const offlineStats = await fs.stat(offlinePath);

    // Very rough comparison based on file size
    // Significantly different sizes suggest visual differences
    const sizeDiff = Math.abs(onlineStats.size - offlineStats.size);
    const avgSize = (onlineStats.size + offlineStats.size) / 2;
    const diffRatio = sizeDiff / avgSize;

    if (diffRatio > 0.1) { // More than 10% size difference
      result.match = false;
      result.diffPercentage = Math.round(diffRatio * 100);
      result.differences.push(`Screenshots differ by approximately ${result.diffPercentage}%`);
      result.recommendations.push('Review screenshots manually for visual differences');
      result.recommendations.push('Check for missing CSS, fonts, or images');
    }

  } catch (e) {
    result.differences.push(`Screenshot comparison failed: ${e.message}`);
  }

  return result;
}

/**
 * Compare basic functionality between pages
 * @param {import('playwright').Page} onlinePage
 * @param {import('playwright').Page} offlinePage
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function compareFunctional(onlinePage, offlinePage, options = {}) {
  const result = {
    match: true,
    tests: [],
    failures: [],
    differences: [],
    recommendations: [],
  };

  // Define basic functional tests
  const tests = [
    {
      name: 'Page title',
      test: async (page) => await page.title(),
    },
    {
      name: 'Body content exists',
      test: async (page) => {
        const body = await page.$('body');
        return body !== null;
      },
    },
    {
      name: 'No error overlays',
      test: async (page) => {
        const errorOverlay = await page.$('[class*="error"], [id*="error"]');
        return errorOverlay === null;
      },
    },
    {
      name: 'Main content visible',
      test: async (page) => {
        const main = await page.$('main, [role="main"], #app, #root');
        if (!main) return true; // No main element is fine
        return await main.isVisible();
      },
    },
    {
      name: 'Buttons are clickable',
      test: async (page) => {
        const buttons = await page.$$('button:not([disabled])');
        return buttons.length > 0 ? await buttons[0].isEnabled() : true;
      },
    },
  ];

  // Add custom tests if provided
  if (options.customTests) {
    tests.push(...options.customTests);
  }

  // Run tests on both pages
  for (const test of tests) {
    try {
      const onlineResult = await test.test(onlinePage);
      const offlineResult = await test.test(offlinePage);

      const testResult = {
        name: test.name,
        online: onlineResult,
        offline: offlineResult,
        match: onlineResult === offlineResult,
      };

      result.tests.push(testResult);

      if (!testResult.match) {
        result.match = false;
        result.failures.push(testResult);
        result.differences.push(`${test.name}: online=${onlineResult}, offline=${offlineResult}`);
      }
    } catch (e) {
      result.tests.push({
        name: test.name,
        error: e.message,
        match: false,
      });
    }
  }

  if (result.failures.length > 0) {
    result.recommendations.push('Review functional test failures to identify broken features');
  }

  return result;
}

/**
 * Create a console error collector for a page
 * Call this before page navigation to capture all errors
 * @param {import('playwright').Page} page
 * @returns {Object} Collector with getErrors() method
 */
export function createConsoleCollector(page) {
  const errors = [];
  const warnings = [];
  const logs = [];

  const handler = (msg) => {
    const entry = {
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
      timestamp: Date.now(),
    };

    switch (msg.type()) {
      case 'error':
        errors.push(entry);
        break;
      case 'warning':
        warnings.push(entry);
        break;
      default:
        logs.push(entry);
    }
  };

  page.on('console', handler);

  return {
    getErrors: () => [...errors],
    getWarnings: () => [...warnings],
    getLogs: () => [...logs],
    getAll: () => ({ errors, warnings, logs }),
    detach: () => page.off('console', handler),
  };
}

/**
 * Print comparison result to console
 * @param {ComparisonResult} result
 */
export function printComparison(result) {
  console.log('\n' + '='.repeat(60));
  console.log('  PAGE COMPARISON RESULTS');
  console.log('='.repeat(60));

  const status = result.match
    ? '\x1b[32mMATCH\x1b[0m'
    : '\x1b[31mDIFFERENCES FOUND\x1b[0m';

  console.log(`\n  Status: ${status}`);
  console.log(`  Score:  ${result.score}/100`);

  if (result.console) {
    console.log('\n  Console:');
    console.log(`    Online errors:  ${result.console.onlineErrors.length}`);
    console.log(`    Offline errors: ${result.console.offlineErrors.length}`);
    console.log(`    New errors:     ${result.console.newErrors.length}`);
  }

  if (result.network) {
    console.log('\n  Network:');
    console.log(`    Failed offline: ${result.network.failedOffline.length}`);
  }

  if (result.visual) {
    console.log('\n  Visual:');
    console.log(`    Difference:     ${result.visual.diffPercentage}%`);
    if (result.visual.onlineScreenshot) {
      console.log(`    Online:         ${result.visual.onlineScreenshot}`);
      console.log(`    Offline:        ${result.visual.offlineScreenshot}`);
    }
  }

  if (result.functional) {
    console.log('\n  Functional:');
    console.log(`    Tests run:      ${result.functional.tests.length}`);
    console.log(`    Failures:       ${result.functional.failures.length}`);
  }

  if (result.differences.length > 0) {
    console.log('\n  Differences:');
    for (const diff of result.differences) {
      console.log(`    - ${diff}`);
    }
  }

  if (result.recommendations.length > 0) {
    console.log('\n  Recommendations:');
    for (const rec of result.recommendations) {
      console.log(`    - ${rec}`);
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

export default {
  comparePage,
  compareConsole,
  compareNetwork,
  compareVisual,
  compareFunctional,
  createConsoleCollector,
  printComparison,
};
