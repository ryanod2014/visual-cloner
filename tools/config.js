/**
 * Visual Cloner Configuration
 *
 * Optimized defaults for efficient cloning with reduced token usage.
 *
 * Usage:
 *   import { CONFIG, getConfig, mergeConfig } from './config.js';
 */

// ============================================================================
// Default Configuration
// ============================================================================

export const CONFIG = {
  // === Token Limits ===
  maxTokens: 5000,            // Max tokens per Claude response (down from 8000)
  htmlContextLimit: 800,      // Max lines of HTML context to send (down from 2000)
  cssContextLimit: 500,       // Max lines of CSS context
  maxPromptTokens: 3000,      // Estimated max input tokens

  // === Iteration Settings ===
  maxIterations: 1,           // One-shot mode (no refinement loops)
  maxRetries: 2,              // Retries on failure
  refinementThreshold: 0.95,  // Skip refinement if similarity > 95%

  // === Parallelism ===
  concurrency: 3,             // Parallel section processing
  batchSize: 5,               // Sections per batch

  // === Screenshot Settings ===
  screenshotQuality: 80,      // JPEG quality (0-100), reduced from 95
  screenshotFormat: 'jpeg',   // jpeg is smaller than png
  screenshotScale: 1,         // Device scale factor
  maxScreenshotWidth: 1440,   // Limit screenshot width
  maxScreenshotHeight: 900,   // Limit screenshot height

  // === Viewport ===
  viewport: {
    width: 1440,
    height: 900,
  },

  // === Timeouts (ms) ===
  pageLoadTimeout: 30000,     // 30 seconds
  sectionTimeout: 60000,      // 60 seconds per section
  hoverCaptureTimeout: 10000, // 10 seconds for hover states

  // === Output ===
  outputFormat: 'html',       // Output format
  includeHoverStates: true,   // Capture and include hover states
  minifyOutput: false,        // Minify final HTML

  // === Content Limits ===
  maxSections: 10,            // Max sections to process
  minSectionHeight: 100,      // Minimum section height in pixels
  maxElementDepth: 5,         // Max depth for element extraction

  // === Model Settings ===
  model: 'claude-sonnet-4-20250514', // Claude model to use
  temperature: 0.3,           // Lower = more deterministic

  // === Paths ===
  outputDir: './output',
  screenshotDir: './screenshots',
  cacheDir: './cache',
};

// ============================================================================
// Preset Configurations
// ============================================================================

export const PRESETS = {
  /**
   * Fast mode - prioritizes speed over quality
   */
  fast: {
    maxTokens: 4000,
    htmlContextLimit: 500,
    maxIterations: 1,
    concurrency: 5,
    screenshotQuality: 60,
    includeHoverStates: false,
    maxSections: 5,
  },

  /**
   * Quality mode - prioritizes accuracy
   */
  quality: {
    maxTokens: 8000,
    htmlContextLimit: 1500,
    maxIterations: 3,
    concurrency: 2,
    screenshotQuality: 95,
    screenshotFormat: 'png',
    includeHoverStates: true,
    refinementThreshold: 0.98,
  },

  /**
   * Minimal mode - absolute minimum token usage
   */
  minimal: {
    maxTokens: 3000,
    htmlContextLimit: 300,
    cssContextLimit: 200,
    maxIterations: 1,
    concurrency: 1,
    screenshotQuality: 50,
    includeHoverStates: false,
    maxSections: 3,
    temperature: 0.1,
  },

  /**
   * Debug mode - verbose with full context
   */
  debug: {
    maxTokens: 10000,
    htmlContextLimit: 2000,
    maxIterations: 5,
    concurrency: 1,
    screenshotQuality: 100,
    screenshotFormat: 'png',
    includeHoverStates: true,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get configuration with optional preset and overrides
 *
 * @param {string} preset - Preset name (fast, quality, minimal, debug)
 * @param {Object} overrides - Custom overrides
 * @returns {Object} - Merged configuration
 */
export function getConfig(preset = null, overrides = {}) {
  let config = { ...CONFIG };

  // Apply preset if specified
  if (preset && PRESETS[preset]) {
    config = { ...config, ...PRESETS[preset] };
  }

  // Apply overrides
  config = { ...config, ...overrides };

  // Handle nested objects
  if (overrides.viewport) {
    config.viewport = { ...CONFIG.viewport, ...overrides.viewport };
  }

  return config;
}

/**
 * Merge partial config with defaults
 *
 * @param {Object} partial - Partial configuration
 * @returns {Object} - Complete configuration
 */
export function mergeConfig(partial) {
  return { ...CONFIG, ...partial };
}

/**
 * Validate configuration
 *
 * @param {Object} config - Configuration to validate
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validateConfig(config) {
  const errors = [];

  if (config.maxTokens < 1000) {
    errors.push('maxTokens must be at least 1000');
  }

  if (config.maxTokens > 16000) {
    errors.push('maxTokens must be at most 16000');
  }

  if (config.concurrency < 1 || config.concurrency > 10) {
    errors.push('concurrency must be between 1 and 10');
  }

  if (config.screenshotQuality < 10 || config.screenshotQuality > 100) {
    errors.push('screenshotQuality must be between 10 and 100');
  }

  if (config.maxIterations < 1 || config.maxIterations > 10) {
    errors.push('maxIterations must be between 1 and 10');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get estimated token budget for a section
 *
 * @param {Object} config - Configuration
 * @returns {Object} - Token budget breakdown
 */
export function getTokenBudget(config = CONFIG) {
  return {
    systemPrompt: 500,        // Base system prompt
    screenshot: 1000,         // Image tokens (estimated)
    htmlContext: Math.min(config.htmlContextLimit * 2, config.maxPromptTokens / 2),
    cssContext: Math.min(config.cssContextLimit * 2, config.maxPromptTokens / 4),
    response: config.maxTokens,
    total: config.maxPromptTokens + config.maxTokens,
  };
}

/**
 * Print configuration summary
 */
export function printConfig(config = CONFIG) {
  console.log('\n=== Configuration ===\n');
  console.log('Token Limits:');
  console.log(`  Max tokens: ${config.maxTokens}`);
  console.log(`  HTML context: ${config.htmlContextLimit} lines`);
  console.log(`  CSS context: ${config.cssContextLimit} lines`);
  console.log('\nProcessing:');
  console.log(`  Max iterations: ${config.maxIterations}`);
  console.log(`  Concurrency: ${config.concurrency}`);
  console.log(`  Max sections: ${config.maxSections}`);
  console.log('\nScreenshots:');
  console.log(`  Quality: ${config.screenshotQuality}%`);
  console.log(`  Format: ${config.screenshotFormat}`);
  console.log(`  Viewport: ${config.viewport.width}x${config.viewport.height}`);
  console.log('\nFeatures:');
  console.log(`  Hover states: ${config.includeHoverStates ? 'Yes' : 'No'}`);
  console.log(`  Minify output: ${config.minifyOutput ? 'Yes' : 'No'}`);
  console.log('');
}

// ============================================================================
// Environment-based Configuration
// ============================================================================

/**
 * Load configuration from environment variables
 */
export function loadEnvConfig() {
  const envConfig = {};

  if (process.env.CLONER_MAX_TOKENS) {
    envConfig.maxTokens = parseInt(process.env.CLONER_MAX_TOKENS);
  }

  if (process.env.CLONER_CONCURRENCY) {
    envConfig.concurrency = parseInt(process.env.CLONER_CONCURRENCY);
  }

  if (process.env.CLONER_PRESET) {
    return getConfig(process.env.CLONER_PRESET, envConfig);
  }

  return mergeConfig(envConfig);
}

// Default export
export default CONFIG;
