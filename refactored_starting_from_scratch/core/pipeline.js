/**
 * Pipeline Orchestrator
 *
 * Manages the execution of extraction phases in order:
 *   01-detect -> 02-capture -> 03-trigger -> 04-discover ->
 *   05-patch -> 06-assemble -> 07-validate
 *
 * Features:
 * - Sequential phase execution
 * - --phase flag to run single phase
 * - --start-phase flag to start from specific phase
 * - Resume from checkpoint
 * - Error handling and recovery
 * - Phase metrics and timing
 */

import { EventEmitter } from 'events';
import { PhaseError } from './errors.js';
import { PhaseStatus } from './state.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load WebGL capture script for early injection
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let WEBGL_CAPTURE_SCRIPT = '';
try {
  WEBGL_CAPTURE_SCRIPT = readFileSync(
    join(__dirname, '..', 'runtime', 'webgl-capture.js'),
    'utf8'
  );
} catch (e) {
  // Script not available - WebGL capture disabled
}

/**
 * Standard phase order
 */
export const PHASE_ORDER = [
  '01-detect',
  '02-capture',
  '03-trigger',
  '04-discover',
  '05-patch',
  '05b-normalize',
  '06-assemble',
  '07-validate',
];

/**
 * Phase name aliases (for backward compatibility)
 */
export const PHASE_ALIASES = {
  'detect': '01-detect',
  'capture': '02-capture',
  'trigger': '03-trigger',
  'discover': '04-discover',
  'patch': '05-patch',
  'normalize': '05b-normalize',
  'assemble': '06-assemble',
  'validate': '07-validate',
  'init': '01-detect', // Legacy alias
};

/**
 * Resolve phase name to canonical form
 * @param {string} name - Phase name or alias
 * @returns {string} Canonical phase name
 */
export function resolvePhase(name) {
  return PHASE_ALIASES[name] || name;
}

/**
 * Get phase index in execution order
 * @param {string} name - Phase name
 * @returns {number} Index or -1 if not found
 */
export function getPhaseIndex(name) {
  const resolved = resolvePhase(name);
  return PHASE_ORDER.indexOf(resolved);
}

/**
 * Pipeline class - orchestrates phase execution
 */
export class Pipeline extends EventEmitter {
  /**
   * Create a new Pipeline
   * @param {Object} config - Configuration options
   * @param {boolean} config.dryRun - Dry run mode
   * @param {boolean} config.verbose - Verbose output
   * @param {string} config.phase - Run single phase only
   * @param {string} config.startPhase - Start from this phase
   */
  constructor(config = {}) {
    super();
    this.config = config;
    this.phases = [];
    this.state = null;
    this.logger = null;
    this.context = null;
  }

  /**
   * Save checkpoint (for graceful shutdown)
   */
  async saveCheckpoint() {
    if (this.state && this.context) {
      await this.state.saveCheckpoint(this.context);
    }
  }

  /**
   * Register a phase with the pipeline
   * @param {Phase} phase - Phase instance to add
   * @returns {Pipeline} This pipeline (for chaining)
   */
  addPhase(phase) {
    this.phases.push(phase);
    return this;
  }

  /**
   * Register multiple phases
   * @param {Array<Phase>} phases - Array of phase instances
   * @returns {Pipeline} This pipeline (for chaining)
   */
  addPhases(phases) {
    for (const phase of phases) {
      this.addPhase(phase);
    }
    return this;
  }

  /**
   * Get phases filtered by config (--phase or --start-phase)
   * @returns {Array<Phase>} Phases to execute
   */
  getPhasesToRun() {
    // If --phase is specified, run only that phase
    if (this.config.phase) {
      const targetName = resolvePhase(this.config.phase);
      const phase = this.phases.find(p => p.name === targetName);
      return phase ? [phase] : [];
    }

    // If --start-phase is specified, skip earlier phases
    if (this.config.startPhase) {
      const startName = resolvePhase(this.config.startPhase);
      const startIndex = this.phases.findIndex(p => p.name === startName);
      if (startIndex >= 0) {
        return this.phases.slice(startIndex);
      }
    }

    // Return all phases
    return this.phases;
  }

  /**
   * Execute the pipeline
   * @param {State} state - State instance
   * @param {Logger} logger - Logger instance
   * @returns {Promise<Object>} Results keyed by phase name
   */
  async execute(state, logger) {
    this.state = state;
    this.logger = logger;

    // Store references in state for phases to access
    state.setLogger(logger);

    const results = {};
    const phasesToRun = this.getPhasesToRun();

    if (phasesToRun.length === 0) {
      logger.warn('No phases to execute');
      return results;
    }

    logger.info(`Pipeline will execute ${phasesToRun.length} phase(s)`);

    for (const phase of phasesToRun) {
      const phaseName = phase.name;

      // Skip completed phases (for resume)
      if (this.state.isPhaseComplete(phaseName) && !this.config.force) {
        logger.info(`Skipping completed phase: ${phaseName}`);
        this.state.skipPhase(phaseName, 'Already completed');
        continue;
      }

      // Execute the phase
      try {
        const result = await this.executePhase(phase);
        results[phaseName] = result;
      } catch (error) {
        // Error already logged in executePhase
        // Re-throw to stop pipeline
        throw error;
      }
    }

    // Save final summary (unless dry run)
    if (this.state.context.outputDir && !this.config.dryRun) {
      await this.state.savePhaseSummary(this.state.context.outputDir);
    }

    return results;
  }

  /**
   * Execute a single phase with error handling
   * @param {Phase} phase - Phase to execute
   * @returns {Promise<Object>} Phase result
   */
  async executePhase(phase) {
    const phaseName = phase.name;

    // Log phase start
    this.logger.phase(phaseName, phase.description);
    this.state.startPhase(phaseName);

    try {
      // Inject logger and state into phase
      phase.logger = this.logger;
      phase.state = this.state;
      phase.config = this.config;

      // Execute phase
      const result = await phase.execute(this.state.context);

      // Complete phase
      this.state.completePhase(phaseName, result);

      // Print phase summary
      this.printPhaseSummary(phaseName);

      // Save checkpoint after each phase (unless dry run)
      if (this.state.context.outputDir && !this.config.dryRun) {
        await this.state.saveCheckpoint(this.state.context.outputDir);
      }

      return result;

    } catch (error) {
      // Mark phase as failed
      this.state.failPhase(phaseName, error);

      // Save checkpoint with failure info (unless dry run)
      if (this.state.context.outputDir && !this.config.dryRun) {
        await this.state.saveCheckpoint(this.state.context.outputDir);
      }

      // Log error
      this.logger.error(`Phase ${phaseName} failed: ${error.message}`);

      // Wrap in PhaseError if not already
      if (error instanceof PhaseError) {
        throw error;
      }

      throw new PhaseError(phaseName, error, {
        url: this.state.context.url,
        resourceCount: this.state.context.resources?.size || 0,
      });
    }
  }

  /**
   * Print phase completion summary
   * @param {string} phaseName - Name of completed phase
   */
  printPhaseSummary(phaseName) {
    const phase = this.state.phases[phaseName];
    if (!phase) return;

    const metrics = phase.metrics;
    const duration = (phase.duration / 1000).toFixed(1);

    // Build summary object
    const summary = {
      'Duration': `${duration}s`,
    };

    if (metrics.itemsProcessed > 0) {
      summary['Processed'] = `${metrics.itemsProcessed} items`;
    }
    if (metrics.itemsCreated > 0) {
      summary['Created'] = `${metrics.itemsCreated} items`;
    }
    if (metrics.itemsModified > 0) {
      summary['Modified'] = `${metrics.itemsModified} items`;
    }
    if (metrics.errors > 0) {
      summary['Errors'] = metrics.errors;
    }
    if (metrics.warnings > 0) {
      summary['Warnings'] = metrics.warnings;
    }

    // Print summary box
    this.logger.summary(`PHASE COMPLETE: ${phaseName}`, summary);

    // Show key actions if verbose
    if (this.config.verbose && metrics.actions.length > 0) {
      this.logger.list('Key Actions', metrics.actions);
    }
  }

  /**
   * Get current phase being executed
   * @returns {string|null} Current phase name
   */
  getCurrentPhase() {
    for (const [name, phase] of Object.entries(this.state.phases)) {
      if (phase.status === PhaseStatus.IN_PROGRESS) {
        return name;
      }
    }
    return null;
  }

  /**
   * Check if pipeline can resume from checkpoint
   * @returns {boolean} True if resumable
   */
  canResume() {
    if (!this.state) return false;
    return Object.keys(this.state.phases).length > 0;
  }

  /**
   * Get resume point (first incomplete phase)
   * @returns {string|null} Phase name to resume from
   */
  getResumePoint() {
    for (const phase of this.phases) {
      if (!this.state.isPhaseComplete(phase.name)) {
        return phase.name;
      }
    }
    return null;
  }

  /**
   * Run the full extraction pipeline
   * High-level method that sets up everything and runs
   * @returns {Promise<Object>} Extraction result with outputDir, assetCount, etc.
   */
  async run() {
    const { chromium } = await import('playwright');
    const { Logger } = await import('./logger.js');
    const { State } = await import('./state.js');
    const { getPhases } = await import('../phases/index.js');
    const path = await import('path');
    const fs = await import('fs/promises');

    // Create output directory based on URL
    const url = this.config.url;
    if (!url) {
      throw new Error('URL is required. Set config.url before calling run()');
    }

    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const timestamp = Date.now();
    const outputDir = this.config.output || `./output/${domain}-${timestamp}`;

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Create logger and state
    const logger = new Logger({
      verbose: this.config.verbose || this.config.debug,
      debug: this.config.debug
    });
    const state = new State();

    // Initialize context
    const context = {
      url,
      origin: urlObj.origin,
      config: this.config,
      browser: null,
      page: null,
      resources: new Map(),
      detection: null,
      appPlugin: null,
      outputDir,
      logger,
      state,
    };

    // Store context reference for saveCheckpoint
    this.context = context;
    state.initContext(context);

    // Add phases
    const phases = getPhases(this.config);
    this.addPhases(phases);

    // Emit progress events
    this.emit('progress', 'init', `Starting extraction of ${url}`);

    // Launch browser
    // Note: headless: false is required for reliable WebGL capture
    this.emit('progress', 'browser', 'Launching browser...');
    const browser = await chromium.launch({
      headless: false,
    });
    context.browser = browser;

    const browserContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    context.page = await browserContext.newPage();
    context.browserContext = browserContext;

    // Install WebGL capture hooks BEFORE any navigation
    // This ensures shaders are captured from the first page load
    if (WEBGL_CAPTURE_SCRIPT) {
      await context.page.addInitScript(WEBGL_CAPTURE_SCRIPT);
      this.emit('progress', 'webgl', 'WebGL capture hooks installed');
    }

    try {
      // Execute pipeline
      const results = await this.execute(state, logger);

      // Get final stats
      const assetCount = context.resources?.size || 0;

      // Generate API spec (non-blocking)
      try {
        const { execSync } = await import('child_process');
        const toolPath = new URL('../tools/analyze-api.js', import.meta.url).pathname;
        execSync(`node "${toolPath}" "${outputDir}"`, { stdio: 'pipe' });
        this.emit('progress', 'api-spec', 'API spec generated');
      } catch (e) {
        this.emit('progress', 'api-spec', 'API spec generation skipped (no API calls found)');
      }

      // Emit completion
      this.emit('progress', 'done', `Extraction complete: ${assetCount} resources`);

      return {
        outputDir: path.resolve(outputDir),
        assetCount,
        pageCount: 1,
        results,
        detection: context.detection,
      };

    } finally {
      // Always close browser
      if (browser) {
        await browser.close();
      }
    }
  }
}

/**
 * Base Phase class
 * All phases should extend this class
 */
export class Phase {
  /**
   * Create a new Phase
   * @param {string} name - Phase name (e.g., '01-detect')
   * @param {string} description - Human-readable description
   */
  constructor(name, description = '') {
    this.name = name;
    this.description = description;

    // Injected by Pipeline during execution
    this.logger = null;
    this.state = null;
    this.config = null;
  }

  /**
   * Execute the phase
   * Override in subclasses
   * @param {Object} context - Pipeline context
   * @returns {Promise<Object>} Phase result
   */
  async execute(context) {
    throw new Error(`Phase.execute() must be implemented in ${this.name}`);
  }

  // ==================== Metric Tracking Helpers ====================

  /**
   * Track items processed
   * @param {number} count - Number of items (default: 1)
   */
  trackProcessed(count = 1) {
    if (this.state) {
      this.state.incrementMetric(this.name, 'itemsProcessed', count);
    }
  }

  /**
   * Track items created
   * @param {number} count - Number of items (default: 1)
   */
  trackCreated(count = 1) {
    if (this.state) {
      this.state.incrementMetric(this.name, 'itemsCreated', count);
    }
  }

  /**
   * Track items modified
   * @param {number} count - Number of items (default: 1)
   */
  trackModified(count = 1) {
    if (this.state) {
      this.state.incrementMetric(this.name, 'itemsModified', count);
    }
  }

  /**
   * Track an error
   */
  trackError() {
    if (this.state) {
      this.state.incrementMetric(this.name, 'errors', 1);
    }
  }

  /**
   * Track a warning
   */
  trackWarning() {
    if (this.state) {
      this.state.incrementMetric(this.name, 'warnings', 1);
    }
  }

  /**
   * Record a key action taken
   * @param {string} action - Action description
   */
  trackAction(action) {
    if (this.state) {
      this.state.addPhaseAction(this.name, action);
    }
  }

  /**
   * Update multiple metrics at once
   * @param {Object} updates - Metric updates
   */
  updateMetrics(updates) {
    if (this.state) {
      this.state.updatePhaseMetrics(this.name, updates);
    }
  }

  // ==================== Logging Helpers ====================

  /**
   * Log debug message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  debug(message, context) {
    if (this.logger) {
      this.logger.debug(message, context);
    }
  }

  /**
   * Log info message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  info(message, context) {
    if (this.logger) {
      this.logger.info(message, context);
    }
  }

  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  warn(message, context) {
    if (this.logger) {
      this.logger.warn(message, context);
    }
    this.trackWarning();
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  error(message, context) {
    if (this.logger) {
      this.logger.error(message, context);
    }
    this.trackError();
  }

  /**
   * Show progress bar
   * @param {number} current - Current progress
   * @param {number} total - Total items
   * @param {string} item - Current item description
   */
  progress(current, total, item) {
    if (this.logger) {
      this.logger.progress(current, total, item);
    }
  }
}

/**
 * Create a pipeline with standard phases
 * @param {Object} config - Pipeline configuration
 * @param {Array<Phase>} phases - Phases to add
 * @returns {Pipeline} Configured pipeline
 */
export function createPipeline(config, phases = []) {
  const pipeline = new Pipeline(config);
  pipeline.addPhases(phases);
  return pipeline;
}

// Default export
export default {
  Pipeline,
  Phase,
  PHASE_ORDER,
  PHASE_ALIASES,
  resolvePhase,
  getPhaseIndex,
  createPipeline,
};
