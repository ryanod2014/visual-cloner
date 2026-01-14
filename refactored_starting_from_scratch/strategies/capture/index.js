/**
 * Capture Orchestrator
 *
 * Factory and management functions for network capture strategies.
 * Supports CDP Fetch domain (primary) and Playwright response listener (fallback).
 *
 * Usage:
 *   const capture = createCapture(page, { method: 'cdp' });
 *   await startCapture(capture);
 *   // ... navigate and interact with page ...
 *   const resources = await stopCapture(capture);
 */

import { CDPCapture } from './cdp.js';
import { PlaywrightCapture } from './playwright.js';

/**
 * @typedef {Object} CaptureConfig
 * @property {'cdp' | 'playwright' | 'auto'} [method='auto'] - Capture method to use
 * @property {boolean} [fallbackEnabled=true] - Enable fallback on CDP failure
 * @property {number} [maxBodySize] - Maximum body size to capture (bytes)
 */

/**
 * @typedef {Object} CaptureInstance
 * @property {CDPCapture | PlaywrightCapture} capture - The capture instance
 * @property {'cdp' | 'playwright'} method - Active capture method
 * @property {CaptureConfig} config - Configuration used
 * @property {import('playwright').Page} page - Page being captured
 */

/**
 * Create a capture instance for the given page
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {CaptureConfig} [config={}] - Capture configuration
 * @returns {CaptureInstance} - Capture instance ready to start
 */
export function createCapture(page, config = {}) {
  const resolvedConfig = {
    method: config.method || 'auto',
    fallbackEnabled: config.fallbackEnabled !== false,
    maxBodySize: config.maxBodySize
  };

  // Determine which capture method to use
  let method = resolvedConfig.method;
  if (method === 'auto') {
    // Default to CDP as primary method
    method = 'cdp';
  }

  // Create the appropriate capture instance
  let capture;
  if (method === 'cdp') {
    capture = new CDPCapture(page);
  } else {
    capture = new PlaywrightCapture(page);
  }

  return {
    capture,
    method,
    config: resolvedConfig,
    page
  };
}

/**
 * Start capturing network responses
 * @param {CaptureInstance} instance - Capture instance from createCapture
 * @returns {Promise<void>}
 */
export async function startCapture(instance) {
  const { capture, method, config, page } = instance;

  try {
    await capture.start();
  } catch (error) {
    // If CDP fails and fallback is enabled, try Playwright capture
    if (method === 'cdp' && config.fallbackEnabled) {
      const fallbackCapture = new PlaywrightCapture(page);
      await fallbackCapture.start();

      // Update instance to use fallback
      instance.capture = fallbackCapture;
      instance.method = 'playwright';
    } else {
      throw error;
    }
  }
}

/**
 * Stop capturing and return collected resources
 * @param {CaptureInstance} instance - Capture instance from createCapture
 * @returns {Promise<Map<string, import('./cdp.js').CapturedResource>>} - Map of URL to captured resource
 */
export async function stopCapture(instance) {
  const { capture } = instance;
  return await capture.stop();
}

/**
 * Get statistics about captured resources
 * @param {CaptureInstance} instance - Capture instance from createCapture
 * @returns {Object} - Capture statistics
 */
export function getCaptureStats(instance) {
  const { capture, method } = instance;

  return {
    method,
    ...capture.getStats()
  };
}

/**
 * Create and start capture in one call (convenience function)
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {CaptureConfig} [config={}] - Capture configuration
 * @returns {Promise<CaptureInstance>} - Started capture instance
 */
export async function createAndStartCapture(page, config = {}) {
  const instance = createCapture(page, config);
  await startCapture(instance);
  return instance;
}

/**
 * Merge resources from multiple captures
 * @param {Map<string, import('./cdp.js').CapturedResource>[]} resourceMaps - Array of resource maps
 * @returns {Map<string, import('./cdp.js').CapturedResource>} - Merged resources (later captures override earlier)
 */
export function mergeResources(...resourceMaps) {
  const merged = new Map();

  for (const resourceMap of resourceMaps) {
    for (const [url, resource] of resourceMap) {
      // Prefer resources that have a body over those without
      const existing = merged.get(url);
      if (!existing || (resource.body && !existing.body)) {
        merged.set(url, resource);
      }
    }
  }

  return merged;
}

/**
 * Filter resources by content type
 * @param {Map<string, import('./cdp.js').CapturedResource>} resources - Resources to filter
 * @param {string[]} types - Content type patterns to match (e.g., ['javascript', 'css'])
 * @returns {Map<string, import('./cdp.js').CapturedResource>} - Filtered resources
 */
export function filterResourcesByType(resources, types) {
  const filtered = new Map();

  for (const [url, resource] of resources) {
    const contentType = (resource.contentType || '').toLowerCase();

    const matches = types.some(type => contentType.includes(type.toLowerCase()));
    if (matches) {
      filtered.set(url, resource);
    }
  }

  return filtered;
}

/**
 * Get resources that failed to capture
 * @param {Map<string, import('./cdp.js').CapturedResource>} resources - Resources to check
 * @returns {Map<string, import('./cdp.js').CapturedResource>} - Failed resources
 */
export function getFailedResources(resources) {
  const failed = new Map();

  for (const [url, resource] of resources) {
    if (resource.error || !resource.body) {
      failed.set(url, resource);
    }
  }

  return failed;
}

// Export capture classes for direct use
export { CDPCapture } from './cdp.js';
export { PlaywrightCapture } from './playwright.js';

export default {
  createCapture,
  startCapture,
  stopCapture,
  getCaptureStats,
  createAndStartCapture,
  mergeResources,
  filterResourcesByType,
  getFailedResources,
  CDPCapture,
  PlaywrightCapture
};
