/**
 * Core Module Exports
 *
 * Re-exports all core infrastructure modules for convenient importing.
 *
 * Usage:
 *   import { Pipeline, Phase, Logger, State, ConfigError } from './core/index.js';
 *
 * Or import specific modules:
 *   import { Logger } from './core/logger.js';
 */

// ==================== Errors ====================
export {
  ExtractionError,
  PhaseError,
  NetworkError,
  ValidationError,
  ResourceError,
  ConfigError,
  PatchError,
  BrowserError,
  isErrorType,
  wrapError,
} from './errors.js';

// ==================== Logger ====================
export {
  Logger,
  createLogger,
} from './logger.js';

// ==================== State ====================
export {
  State,
  ExtractionState, // Backward compatibility alias
  PhaseStatus,
  createState,
} from './state.js';

// ==================== Config ====================
export {
  DEFAULTS,
  CLI_FLAGS,
  VALID_PHASES,
  parseArgs,
  loadConfigFile,
  loadEnvConfig,
  mergeConfig,
  validateConfig,
  normalizeViewport,
  createConfig,
  printHelp,
  Config,
} from './config.js';

// ==================== Pipeline ====================
export {
  Pipeline,
  Phase,
  PHASE_ORDER,
  PHASE_ALIASES,
  resolvePhase,
  getPhaseIndex,
  createPipeline,
} from './pipeline.js';

// ==================== Convenience Factory Functions ====================

/**
 * Create a complete extraction environment
 * Sets up logger, state, and pipeline with standard configuration
 *
 * @param {Object} options - Configuration options
 * @param {string} options.url - Target URL
 * @param {string} options.outputDir - Output directory
 * @param {boolean} options.debug - Enable debug logging
 * @param {boolean} options.verbose - Enable verbose output
 * @param {boolean} options.dryRun - Dry run mode
 * @returns {Object} { logger, state, pipeline, config }
 */
export function createExtractionEnv(options = {}) {
  // Import dynamically to avoid circular dependency
  const { Logger } = require('./logger.js');
  const { State } = require('./state.js');
  const { Pipeline } = require('./pipeline.js');
  const { DEFAULTS } = require('./config.js');

  // Merge with defaults
  const config = {
    ...DEFAULTS,
    ...options,
  };

  // Create logger
  const logger = new Logger({
    level: config.debug ? 'debug' : 'info',
    verbose: config.verbose,
    dryRun: config.dryRun,
  });

  // Create state
  const state = new State();
  if (config.url && config.outputDir) {
    state.init(config.url, config.outputDir, config);
  }

  // Create pipeline
  const pipeline = new Pipeline(config);

  return {
    logger,
    state,
    pipeline,
    config,
  };
}

// ==================== Default Export ====================

import * as errors from './errors.js';
import * as logger from './logger.js';
import * as state from './state.js';
import * as config from './config.js';
import * as pipeline from './pipeline.js';

export default {
  // Modules
  errors,
  logger,
  state,
  config,
  pipeline,

  // Classes (direct access)
  ExtractionError: errors.ExtractionError,
  PhaseError: errors.PhaseError,
  NetworkError: errors.NetworkError,
  ValidationError: errors.ValidationError,
  ResourceError: errors.ResourceError,
  ConfigError: errors.ConfigError,
  PatchError: errors.PatchError,
  BrowserError: errors.BrowserError,

  Logger: logger.Logger,
  State: state.State,
  Pipeline: pipeline.Pipeline,
  Phase: pipeline.Phase,
  Config: config.Config,

  // Factory functions
  createLogger: logger.createLogger,
  createState: state.createState,
  createPipeline: pipeline.createPipeline,
  createConfig: config.createConfig,
  createExtractionEnv,

  // Constants
  PHASE_ORDER: pipeline.PHASE_ORDER,
  PHASE_ALIASES: pipeline.PHASE_ALIASES,
  PhaseStatus: state.PhaseStatus,
  DEFAULTS: config.DEFAULTS,
};
