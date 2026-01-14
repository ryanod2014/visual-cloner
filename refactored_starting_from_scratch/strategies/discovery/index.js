/**
 * Discovery Orchestrator
 *
 * Picks the correct discoverer based on bundler detection
 * and coordinates chunk URL discovery.
 */

import { BaseDiscoverer } from './base.js';
import { WebpackDiscoverer } from './webpack.js';
import { NextjsDiscoverer } from './nextjs.js';
import { ViteDiscoverer } from './vite.js';
import { NuxtDiscoverer } from './nuxt.js';
import { RemixDiscoverer } from './remix.js';
import { AngularDiscoverer } from './angular.js';
import { FallbackDiscoverer } from './fallback.js';

// Registry of all discoverers
const discoverers = [
  new WebpackDiscoverer(),
  new NextjsDiscoverer(),
  new ViteDiscoverer(),
  new NuxtDiscoverer(),
  new RemixDiscoverer(),
  new AngularDiscoverer(),
  new FallbackDiscoverer()
];

/**
 * Discover chunk URLs based on bundler detection
 *
 * @param {Object} detection - Detection result containing bundler type
 * @param {Map} resources - Map of URL to resource data (captured during loading)
 * @param {string} origin - Origin URL for resolving relative paths
 * @param {Object} page - Playwright page for additional fetching
 * @returns {Promise<Set<string>>} Set of discovered chunk URLs
 */
export async function discover(detection, resources, origin, page) {
  const discovered = new Set();
  const bundlerType = detection?.bundler || 'unknown';

  console.log(`[Discovery] Starting discovery for bundler: ${bundlerType}`);

  // Find the appropriate discoverer
  let primaryDiscoverer = null;

  for (const discoverer of discoverers) {
    if (discoverer.canDiscover(detection)) {
      primaryDiscoverer = discoverer;
      break;
    }
  }

  // If no specific discoverer found, use fallback
  if (!primaryDiscoverer) {
    primaryDiscoverer = new FallbackDiscoverer();
  }

  try {
    // Run primary discoverer
    console.log(`[Discovery] Running ${primaryDiscoverer.bundler} discoverer`);
    const primaryUrls = await primaryDiscoverer.discover(resources, origin, page);
    primaryUrls.forEach(url => discovered.add(url));
    console.log(`[Discovery] ${primaryDiscoverer.bundler} found ${primaryUrls.size} URLs`);

    // For meta-frameworks, also run underlying bundler discoverer
    const metaFrameworks = {
      'nextjs': 'webpack',
      'nuxt': 'vite',
      'remix': 'webpack'
    };

    if (metaFrameworks[bundlerType]) {
      const underlyingBundler = metaFrameworks[bundlerType];
      const underlyingDiscoverer = discoverers.find(d => d.bundler === underlyingBundler);

      if (underlyingDiscoverer) {
        console.log(`[Discovery] Also running underlying ${underlyingBundler} discoverer`);
        const underlyingUrls = await underlyingDiscoverer.discover(resources, origin, page);
        underlyingUrls.forEach(url => discovered.add(url));
        console.log(`[Discovery] ${underlyingBundler} found ${underlyingUrls.size} additional URLs`);
      }
    }

    // Always run fallback as supplementary if primary isn't fallback
    if (primaryDiscoverer.bundler !== 'unknown') {
      const fallback = new FallbackDiscoverer();
      console.log(`[Discovery] Running fallback discoverer as supplement`);
      const fallbackUrls = await fallback.discover(resources, origin, page);

      // Only add truly new URLs
      let newCount = 0;
      for (const url of fallbackUrls) {
        if (!discovered.has(url)) {
          discovered.add(url);
          newCount++;
        }
      }
      console.log(`[Discovery] Fallback found ${newCount} additional unique URLs`);
    }
  } catch (error) {
    console.error(`[Discovery] Error during discovery:`, error.message);

    // On error, try fallback
    if (primaryDiscoverer.bundler !== 'unknown') {
      try {
        console.log(`[Discovery] Falling back to generic discoverer`);
        const fallback = new FallbackDiscoverer();
        const fallbackUrls = await fallback.discover(resources, origin, page);
        fallbackUrls.forEach(url => discovered.add(url));
      } catch (fallbackError) {
        console.error(`[Discovery] Fallback also failed:`, fallbackError.message);
      }
    }
  }

  // Filter out already-captured resources
  const newUrls = new Set();
  for (const url of discovered) {
    if (!resources.has(url)) {
      newUrls.add(url);
    }
  }

  console.log(`[Discovery] Total discovered: ${discovered.size}, New (not yet captured): ${newUrls.size}`);

  return newUrls;
}

/**
 * Get available discoverer types
 * @returns {string[]}
 */
export function getDiscovererTypes() {
  return discoverers.map(d => d.bundler);
}

/**
 * Create a custom discoverer instance
 * @param {string} bundlerType - Bundler type to create discoverer for
 * @returns {BaseDiscoverer}
 */
export function createDiscoverer(bundlerType) {
  const found = discoverers.find(d => d.bundler === bundlerType);
  return found || new FallbackDiscoverer();
}

// Export individual discoverers for direct use if needed
export {
  BaseDiscoverer,
  WebpackDiscoverer,
  NextjsDiscoverer,
  ViteDiscoverer,
  NuxtDiscoverer,
  RemixDiscoverer,
  AngularDiscoverer,
  FallbackDiscoverer
};
