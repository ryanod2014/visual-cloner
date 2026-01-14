/**
 * Detection Orchestrator
 *
 * Coordinates all bundler/framework detectors and returns
 * the highest confidence detection result.
 */

import { BaseDetector } from './base.js';
import { WebpackDetector } from './webpack.js';
import { NextJsDetector } from './nextjs.js';
import { ViteDetector } from './vite.js';
import { NuxtDetector } from './nuxt.js';
import { RemixDetector } from './remix.js';
import { AngularDetector } from './angular.js';
import { ParcelDetector } from './parcel.js';
import { StaticDetector } from './static.js';

// All available detectors in priority order
// Framework-specific detectors come first (they're more specific)
// followed by general bundler detectors, and static as fallback
const detectors = [
  new NextJsDetector(),
  new NuxtDetector(),
  new RemixDetector(),
  new AngularDetector(),
  new ViteDetector(),
  new WebpackDetector(),
  new ParcelDetector(),
  new StaticDetector()  // Always last - fallback
];

/**
 * Run all detectors and return the highest confidence result
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} html - Raw HTML content of the page
 * @returns {Promise<DetectionResult>} - Highest confidence detection result
 */
export async function detect(page, html) {
  const results = [];

  // Run detectors that pass canDetect() check
  for (const detector of detectors) {
    try {
      if (detector.canDetect(page, html)) {
        const result = await detector.detect(page, html);
        if (result.confidence > 0) {
          results.push(result);
        }
      }
    } catch (error) {
      // Log error but continue with other detectors
      console.error(`Detection error in ${detector.name}:`, error.message);
    }
  }

  // If no results, return static fallback
  if (results.length === 0) {
    return {
      bundler: 'static',
      version: null,
      confidence: 0.1,
      metadata: {
        fallback: true,
        reason: 'No detector matched'
      }
    };
  }

  // Sort by confidence and return highest
  results.sort((a, b) => b.confidence - a.confidence);

  // Get the winner
  const winner = results[0];

  // Add runner-up info if there are multiple results with similar confidence
  if (results.length > 1) {
    const runnerUp = results[1];
    if (runnerUp.confidence >= winner.confidence - 0.2) {
      winner.metadata.alternatives = results.slice(1, 3).map(r => ({
        bundler: r.bundler,
        confidence: r.confidence
      }));
    }
  }

  return winner;
}

/**
 * Run all detectors and return all results (for debugging)
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} html - Raw HTML content of the page
 * @returns {Promise<DetectionResult[]>} - All detection results sorted by confidence
 */
export async function detectAll(page, html) {
  const results = [];

  for (const detector of detectors) {
    try {
      const result = await detector.detect(page, html);
      results.push(result);
    } catch (error) {
      results.push({
        bundler: detector.name,
        version: null,
        confidence: 0,
        metadata: { error: error.message }
      });
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get list of all available detector names
 *
 * @returns {string[]} - Array of detector names
 */
export function getDetectorNames() {
  return detectors.map(d => d.name);
}

// Export individual detectors for direct use if needed
export {
  BaseDetector,
  WebpackDetector,
  NextJsDetector,
  ViteDetector,
  NuxtDetector,
  RemixDetector,
  AngularDetector,
  ParcelDetector,
  StaticDetector
};

/**
 * @typedef {Object} DetectionResult
 * @property {string} bundler - Name of the detected bundler/framework
 * @property {string|null} version - Detected version if available
 * @property {number} confidence - Confidence score between 0 and 1
 * @property {Object} metadata - Additional metadata for discovery phase
 * @property {Array<{bundler: string, confidence: number}>} [metadata.alternatives] - Other possible detections
 */
