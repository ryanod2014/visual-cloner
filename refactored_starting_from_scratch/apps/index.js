/**
 * App Plugin Registry
 *
 * Central registry for all app-specific plugins.
 * Plugins provide custom triggers, patchers, and configuration
 * for specific web applications.
 *
 * Usage:
 *   import { findPlugin, getAllPlugins } from './apps/index.js';
 *
 *   // Find plugin for a URL
 *   const plugin = findPlugin('https://photopea.com/editor');
 *   if (plugin) {
 *     const triggers = plugin.getTriggers();
 *     const patchers = plugin.getPatchers();
 *   }
 *
 *   // List all available plugins
 *   const plugins = getAllPlugins();
 *   for (const plugin of plugins) {
 *     console.log(plugin.name, plugin.urlPattern);
 *   }
 */

// Import all app plugins
import { BaseAppPlugin } from './base.js';
import { PhotopeaAppPlugin } from './photopea.js';

// =============================================================================
// PLUGIN REGISTRY
// =============================================================================

/**
 * All registered app plugins
 * Add new plugins here as they are created
 *
 * Order matters: First matching plugin wins
 * Put more specific patterns before more general ones
 */
const plugins = [
  new PhotopeaAppPlugin(),
  // Add new plugins here:
  // new FigmaAppPlugin(),
  // new CanvaAppPlugin(),
  // new NotionAppPlugin(),
];

// =============================================================================
// REGISTRY FUNCTIONS
// =============================================================================

/**
 * Find a plugin that matches the given URL
 *
 * @param {string} url - URL to match against
 * @returns {BaseAppPlugin|null} - Matching plugin or null if none found
 *
 * @example
 * const plugin = findPlugin('https://photopea.com/editor');
 * if (plugin) {
 *   console.log('Found plugin:', plugin.name);
 *   const triggers = plugin.getTriggers();
 * }
 */
export function findPlugin(url) {
  if (!url) return null;

  for (const plugin of plugins) {
    if (plugin.matches(url)) {
      return plugin;
    }
  }

  return null;
}

/**
 * Get all registered plugins
 *
 * @returns {BaseAppPlugin[]} - Array of all plugins
 *
 * @example
 * const allPlugins = getAllPlugins();
 * console.log('Available plugins:', allPlugins.map(p => p.name));
 */
export function getAllPlugins() {
  return [...plugins];
}

/**
 * Get a plugin by name
 *
 * @param {string} name - Plugin name (case-insensitive)
 * @returns {BaseAppPlugin|null} - Plugin or null if not found
 *
 * @example
 * const photopeaPlugin = getPluginByName('photopea');
 */
export function getPluginByName(name) {
  if (!name) return null;

  const lowerName = name.toLowerCase();
  return plugins.find(p => p.name.toLowerCase() === lowerName) || null;
}

/**
 * Check if a URL has a matching plugin
 *
 * @param {string} url - URL to check
 * @returns {boolean} - True if a plugin matches
 *
 * @example
 * if (hasPlugin('https://photopea.com')) {
 *   console.log('Custom plugin available');
 * }
 */
export function hasPlugin(url) {
  return findPlugin(url) !== null;
}

/**
 * Get combined triggers from default triggers and app plugin
 *
 * @param {string} url - URL to match
 * @param {ITrigger[]} defaultTriggers - Default triggers
 * @returns {ITrigger[]} - Combined triggers (defaults + app-specific)
 *
 * @example
 * import { getAllTriggers } from './plugins/triggers/index.js';
 * const triggers = getCombinedTriggers(url, getAllTriggers());
 */
export function getCombinedTriggers(url, defaultTriggers = []) {
  const plugin = findPlugin(url);
  if (!plugin) {
    return defaultTriggers;
  }

  const appTriggers = plugin.getTriggers();
  return [...defaultTriggers, ...appTriggers];
}

/**
 * Get combined patchers from default patchers and app plugin
 *
 * @param {string} url - URL to match
 * @param {IPatcher[]} defaultPatchers - Default patchers
 * @returns {IPatcher[]} - Combined patchers (defaults + app-specific)
 *
 * @example
 * import { getAllPatchers } from './plugins/patchers/index.js';
 * const patchers = getCombinedPatchers(url, getAllPatchers());
 */
export function getCombinedPatchers(url, defaultPatchers = []) {
  const plugin = findPlugin(url);
  if (!plugin) {
    return defaultPatchers;
  }

  const appPatchers = plugin.getPatchers();
  return [...defaultPatchers, ...appPatchers];
}

/**
 * Get merged configuration (defaults + app overrides)
 *
 * @param {string} url - URL to match
 * @param {Object} defaultConfig - Default configuration
 * @returns {Object} - Merged configuration
 *
 * @example
 * const config = getMergedConfig(url, { capture: { timeout: 30000 } });
 */
export function getMergedConfig(url, defaultConfig = {}) {
  const plugin = findPlugin(url);
  if (!plugin) {
    return defaultConfig;
  }

  const appConfig = plugin.getConfig();

  // Deep merge configuration
  return deepMerge(defaultConfig, appConfig);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Deep merge two objects
 * @private
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

// =============================================================================
// EXPORTS
// =============================================================================

// Export the base class for extension
export { BaseAppPlugin } from './base.js';

// Export specific plugins for direct use
export { PhotopeaAppPlugin } from './photopea.js';

// Default export: the registry functions
export default {
  findPlugin,
  getAllPlugins,
  getPluginByName,
  hasPlugin,
  getCombinedTriggers,
  getCombinedPatchers,
  getMergedConfig,
};
