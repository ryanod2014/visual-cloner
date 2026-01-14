/**
 * Base Detector Class
 *
 * Abstract base class for all bundler/framework detectors.
 * Subclasses should override canDetect() and detect() methods.
 */
export class BaseDetector {
  name = 'base';

  /**
   * Quick check if this detector might apply
   * @param {import('puppeteer').Page} page - Puppeteer page instance
   * @param {string} html - Raw HTML content
   * @returns {boolean} - True if detection should be attempted
   */
  canDetect(page, html) {
    return false;
  }

  /**
   * Perform full detection
   * @param {import('puppeteer').Page} page - Puppeteer page instance
   * @param {string} html - Raw HTML content
   * @returns {Promise<DetectionResult>} - Detection result with confidence score
   */
  async detect(page, html) {
    return {
      bundler: this.name,
      version: null,
      confidence: 0,
      metadata: {}
    };
  }

  /**
   * Helper to safely evaluate JavaScript in page context
   * @param {import('puppeteer').Page} page - Puppeteer page instance
   * @param {Function} fn - Function to evaluate
   * @returns {Promise<any>} - Evaluation result or null on error
   */
  async safeEvaluate(page, fn) {
    try {
      return await page.evaluate(fn);
    } catch (error) {
      return null;
    }
  }

  /**
   * Helper to check if HTML contains any of the given patterns
   * @param {string} html - HTML content
   * @param {string[]} patterns - Array of string patterns to search for
   * @returns {string[]} - Array of matched patterns
   */
  findPatterns(html, patterns) {
    return patterns.filter(pattern => html.includes(pattern));
  }

  /**
   * Helper to check if HTML matches any of the given regex patterns
   * @param {string} html - HTML content
   * @param {RegExp[]} regexPatterns - Array of regex patterns
   * @returns {RegExpMatchArray[]} - Array of match results
   */
  findRegexMatches(html, regexPatterns) {
    const matches = [];
    for (const regex of regexPatterns) {
      const match = html.match(regex);
      if (match) {
        matches.push(match);
      }
    }
    return matches;
  }
}

/**
 * @typedef {Object} DetectionResult
 * @property {string} bundler - Name of the detected bundler/framework
 * @property {string|null} version - Detected version if available
 * @property {number} confidence - Confidence score between 0 and 1
 * @property {Object} metadata - Additional metadata for discovery phase
 */
