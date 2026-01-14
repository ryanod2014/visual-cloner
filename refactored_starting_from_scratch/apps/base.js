/**
 * Base App Plugin
 *
 * App plugins provide app-specific overrides for the extraction pipeline.
 * Each plugin can customize:
 * - Detection: How to identify when this app is loaded
 * - Discovery: How to find URLs/resources specific to this app
 * - Triggers: Additional interaction patterns to reveal features
 * - Patchers: Code modifications needed for offline functionality
 *
 * Extend this class to create app-specific plugins.
 */

export class BaseAppPlugin {
  /**
   * Human-readable name of the app
   * @type {string}
   */
  name = 'base';

  /**
   * URL pattern to match for this app
   * Default pattern never matches - override in subclasses
   * @type {RegExp}
   */
  urlPattern = /^$/;

  /**
   * Check if this plugin matches a URL
   * @param {string} url - URL to check
   * @returns {boolean} - True if this plugin should handle the URL
   */
  matches(url) {
    return this.urlPattern.test(url);
  }

  /**
   * Get a custom detector for this app
   * Return null to use default detection logic
   *
   * @returns {Object|null} - Custom detector instance or null
   * @example
   * getDetector() {
   *   return {
   *     async detect(page) {
   *       // Custom detection logic
   *       return { appType: 'spa', framework: 'react' };
   *     }
   *   };
   * }
   */
  getDetector() {
    return null;
  }

  /**
   * Get a custom discoverer for this app
   * Return null to use default discovery logic
   *
   * @returns {Object|null} - Custom discoverer instance or null
   * @example
   * getDiscoverer() {
   *   return {
   *     async discover(page, options) {
   *       // Custom URL discovery logic
   *       return { urls: [...], resources: [...] };
   *     }
   *   };
   * }
   */
  getDiscoverer() {
    return null;
  }

  /**
   * Get additional triggers specific to this app
   * These are added to (not replacing) the default triggers
   *
   * @returns {Array} - Array of ITrigger instances
   * @example
   * getTriggers() {
   *   return [
   *     new FileFormatTrigger(),
   *     new LongPressTrigger(),
   *   ];
   * }
   */
  getTriggers() {
    return [];
  }

  /**
   * Get additional patchers specific to this app
   * These are added to (not replacing) the default patchers
   *
   * @returns {Array} - Array of IPatcher instances
   * @example
   * getPatchers() {
   *   return [
   *     new LicenseBypassPatcher(),
   *     new DomainCheckPatcher(),
   *   ];
   * }
   */
  getPatchers() {
    return [];
  }

  /**
   * Get app-specific configuration overrides
   * These override the default pipeline configuration
   *
   * @returns {Object} - Configuration overrides
   * @example
   * getConfig() {
   *   return {
   *     capture: { timeout: 60000 },
   *     trigger: { delayMs: 100 },
   *   };
   * }
   */
  getConfig() {
    return {};
  }

  /**
   * Hook called before extraction starts
   * Use for app-specific setup
   *
   * @param {Object} page - Playwright page instance
   * @param {Object} state - Pipeline state
   * @returns {Promise<void>}
   */
  async beforeExtraction(page, state) {
    // Override in subclasses
  }

  /**
   * Hook called after extraction completes
   * Use for app-specific cleanup or post-processing
   *
   * @param {Object} page - Playwright page instance
   * @param {Object} state - Pipeline state
   * @returns {Promise<void>}
   */
  async afterExtraction(page, state) {
    // Override in subclasses
  }

  /**
   * Get documentation about this app's special requirements
   * Useful for debugging and understanding behavior
   *
   * @returns {string} - Markdown documentation
   */
  getDocumentation() {
    return `# ${this.name}\n\nNo special documentation provided.`;
  }
}

export default BaseAppPlugin;
