/**
 * Configuration module for the visual cloner state explorer.
 * Provides sensible defaults with override capability.
 */

// Default configuration values
const CONFIG = {
  // Target URL - from CLI arg or environment variable
  url: process.argv[2] || process.env.TARGET_URL || null,

  // Output directory for results
  outputDir: './output',

  // State exploration limits
  maxStates: 10000,        // Maximum unique states to discover
  maxDepth: 100,           // Maximum BFS traversal depth

  // Convergence detection
  convergenceThreshold: 100, // Stop after N iterations with no new states

  // Parallelization
  workers: 4,              // Number of concurrent browser instances

  // Timing
  timeout: 5000,           // Action timeout in milliseconds

  // Capture settings
  screenshotOnChange: true, // Capture screenshot on state change
  headless: true            // Run browsers in headless mode
};

/**
 * Creates a new config object by merging overrides with defaults.
 * @param {Object} overrides - Configuration values to override
 * @returns {Object} Merged configuration object
 */
function createConfig(overrides = {}) {
  return {
    ...CONFIG,
    ...overrides
  };
}

export { CONFIG, createConfig };
