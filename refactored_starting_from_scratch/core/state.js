/**
 * Extraction State Manager
 *
 * Manages pipeline state including:
 * - Context object passed through all phases
 * - Phase tracking (status, timing, metrics)
 * - Checkpoint persistence to .checkpoint.json
 * - Resume from checkpoint functionality
 * - Timeline event tracking
 *
 * The state object is the central data store that phases read from
 * and write to as they execute.
 */

import fs from 'fs/promises';
import path from 'path';

// Checkpoint file name
const CHECKPOINT_FILE = '.checkpoint.json';
const PHASE_SUMMARY_FILE = 'phase-summary.json';
const CHECKPOINT_VERSION = '2.0';

/**
 * Phase status constants
 */
export const PhaseStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

/**
 * Main state management class
 */
export class State {
  constructor() {
    // Phase tracking
    this.phases = {};

    // Context object passed through pipeline
    // This is the main data structure phases read/write
    this.context = {
      // Input configuration
      url: null,
      origin: null,
      config: {},

      // Browser/page instances (not serialized)
      browser: null,
      page: null,

      // Captured resources
      resources: new Map(),

      // Detection results
      detection: null,

      // App plugin reference
      appPlugin: null,

      // Output location
      outputDir: null,

      // Logger reference (not serialized)
      logger: null,

      // State reference (circular, not serialized)
      state: null,

      // Error tracking
      errors: [],

      // Timeline of events
      timeline: [],
    };

    // Timing
    this.startTime = Date.now();
  }

  /**
   * Initialize state with URL and output directory
   * @param {string} url - Target URL
   * @param {string} outputDir - Output directory path
   * @param {Object} config - Configuration object
   */
  init(url, outputDir, config = {}) {
    try {
      const parsedUrl = new URL(url);
      this.context.url = url;
      this.context.origin = parsedUrl.origin;
    } catch (e) {
      this.context.url = url;
      this.context.origin = url;
    }

    this.context.outputDir = outputDir;
    this.context.config = config;
    this.context.state = this; // Self-reference for phases

    this.addTimelineEvent('Extraction initialized', { url, outputDir });
  }

  /**
   * Set browser and page instances
   * @param {Browser} browser - Playwright browser instance
   * @param {Page} page - Playwright page instance
   */
  setBrowser(browser, page) {
    this.context.browser = browser;
    this.context.page = page;
  }

  /**
   * Set logger reference
   * @param {Logger} logger - Logger instance
   */
  setLogger(logger) {
    this.context.logger = logger;
  }

  /**
   * Initialize context with provided values
   * Merges provided context with existing defaults
   * @param {Object} ctx - Context values to set
   */
  initContext(ctx) {
    Object.assign(this.context, ctx);
    // Ensure state reference is set
    this.context.state = this;
  }

  // ==================== Timeline Events ====================

  /**
   * Add an event to the timeline
   * @param {string} event - Event description
   * @param {Object} data - Additional event data
   */
  addTimelineEvent(event, data = {}) {
    this.context.timeline.push({
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - this.startTime,
      event,
      data,
    });
  }

  // ==================== Phase Tracking ====================

  /**
   * Mark a phase as started
   * @param {string} phaseName - Name of the phase
   */
  startPhase(phaseName) {
    this.phases[phaseName] = {
      status: PhaseStatus.IN_PROGRESS,
      startedAt: new Date().toISOString(),
      startTime: Date.now(),
      completedAt: null,
      duration: null,
      result: null,
      error: null,
      metrics: {
        itemsProcessed: 0,
        itemsCreated: 0,
        itemsModified: 0,
        errors: 0,
        warnings: 0,
        actions: [],
      },
    };

    this.addTimelineEvent(`Phase started: ${phaseName}`);
  }

  /**
   * Mark a phase as completed
   * @param {string} phaseName - Name of the phase
   * @param {Object} result - Phase result data
   */
  completePhase(phaseName, result = {}) {
    const phase = this.phases[phaseName];
    if (!phase) return;

    phase.status = PhaseStatus.COMPLETED;
    phase.completedAt = new Date().toISOString();
    phase.duration = Date.now() - phase.startTime;
    phase.result = result;

    this.addTimelineEvent(`Phase completed: ${phaseName}`, {
      duration: phase.duration,
      metrics: phase.metrics,
    });
  }

  /**
   * Mark a phase as failed
   * @param {string} phaseName - Name of the phase
   * @param {Error} error - The error that occurred
   */
  failPhase(phaseName, error) {
    const phase = this.phases[phaseName];
    if (!phase) return;

    phase.status = PhaseStatus.FAILED;
    phase.completedAt = new Date().toISOString();
    phase.duration = Date.now() - phase.startTime;
    phase.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      context: error.context || {},
    };

    // Track error globally
    this.context.errors.push(phase.error);

    this.addTimelineEvent(`Phase failed: ${phaseName}`, {
      error: error.message,
    });
  }

  /**
   * Mark a phase as skipped
   * @param {string} phaseName - Name of the phase
   * @param {string} reason - Reason for skipping
   */
  skipPhase(phaseName, reason = 'Already completed') {
    if (!this.phases[phaseName]) {
      this.phases[phaseName] = {
        status: PhaseStatus.SKIPPED,
        startedAt: null,
        completedAt: new Date().toISOString(),
        duration: 0,
        result: null,
        error: null,
        metrics: {
          itemsProcessed: 0,
          itemsCreated: 0,
          itemsModified: 0,
          errors: 0,
          warnings: 0,
          actions: [],
        },
      };
    } else {
      this.phases[phaseName].status = PhaseStatus.SKIPPED;
    }

    this.addTimelineEvent(`Phase skipped: ${phaseName}`, { reason });
  }

  /**
   * Check if a phase is completed
   * @param {string} phaseName - Name of the phase
   * @returns {boolean} True if phase is completed
   */
  isPhaseComplete(phaseName) {
    return this.phases[phaseName]?.status === PhaseStatus.COMPLETED;
  }

  /**
   * Check if a phase has failed
   * @param {string} phaseName - Name of the phase
   * @returns {boolean} True if phase failed
   */
  isPhaseFailed(phaseName) {
    return this.phases[phaseName]?.status === PhaseStatus.FAILED;
  }

  /**
   * Get phase status
   * @param {string} phaseName - Name of the phase
   * @returns {string|null} Phase status or null if not found
   */
  getPhaseStatus(phaseName) {
    return this.phases[phaseName]?.status || null;
  }

  // ==================== Phase Metrics ====================

  /**
   * Update metrics for a phase
   * @param {string} phaseName - Name of the phase
   * @param {Object} updates - Metric updates
   */
  updatePhaseMetrics(phaseName, updates) {
    const phase = this.phases[phaseName];
    if (!phase) return;

    if (updates.itemsProcessed !== undefined) {
      phase.metrics.itemsProcessed = updates.itemsProcessed;
    }
    if (updates.itemsCreated !== undefined) {
      phase.metrics.itemsCreated = updates.itemsCreated;
    }
    if (updates.itemsModified !== undefined) {
      phase.metrics.itemsModified = updates.itemsModified;
    }
    if (updates.errors !== undefined) {
      phase.metrics.errors = updates.errors;
    }
    if (updates.warnings !== undefined) {
      phase.metrics.warnings = updates.warnings;
    }
    if (updates.action) {
      phase.metrics.actions.push(updates.action);
    }
  }

  /**
   * Increment a metric counter
   * @param {string} phaseName - Name of the phase
   * @param {string} metric - Metric name
   * @param {number} amount - Amount to increment (default: 1)
   */
  incrementMetric(phaseName, metric, amount = 1) {
    const phase = this.phases[phaseName];
    if (!phase || !phase.metrics.hasOwnProperty(metric)) return;

    if (typeof phase.metrics[metric] === 'number') {
      phase.metrics[metric] += amount;
    }
  }

  /**
   * Add an action to phase metrics
   * @param {string} phaseName - Name of the phase
   * @param {string} action - Action description
   */
  addPhaseAction(phaseName, action) {
    const phase = this.phases[phaseName];
    if (!phase) return;

    phase.metrics.actions.push(action);
  }

  /**
   * Get metrics for a phase
   * @param {string} phaseName - Name of the phase
   * @returns {Object|null} Phase metrics or null
   */
  getPhaseMetrics(phaseName) {
    const phase = this.phases[phaseName];
    if (!phase) return null;

    return {
      duration: phase.duration || (Date.now() - phase.startTime),
      ...phase.metrics,
    };
  }

  // ==================== Checkpoint Persistence ====================

  /**
   * Save checkpoint to disk
   * @param {string} outputDir - Directory to save checkpoint to
   * @returns {Promise<string>} Path to saved checkpoint
   */
  async saveCheckpoint(outputDir = this.context.outputDir) {
    if (!outputDir) {
      throw new Error('No output directory specified for checkpoint');
    }

    const checkpointPath = path.join(outputDir, CHECKPOINT_FILE);

    // Serialize resources Map (metadata only, not content)
    const resourcesMeta = [];
    for (const [url, data] of this.context.resources) {
      resourcesMeta.push({
        url,
        contentType: data.contentType,
        size: data.size || 0,
        localPath: data.localPath,
        // Don't serialize body/content
      });
    }

    const checkpoint = {
      version: CHECKPOINT_VERSION,
      savedAt: new Date().toISOString(),
      url: this.context.url,
      origin: this.context.origin,
      outputDir: this.context.outputDir,
      phases: this.phases,
      resourceCount: this.context.resources.size,
      resourcesMeta,
      detection: this.context.detection,
      timeline: this.context.timeline,
      errors: this.context.errors,
      totalDuration: Date.now() - this.startTime,
    };

    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));

    this.addTimelineEvent('Checkpoint saved', { path: checkpointPath });

    return checkpointPath;
  }

  /**
   * Load checkpoint from disk
   * @param {string} outputDir - Directory to load checkpoint from
   * @returns {Promise<boolean>} True if checkpoint was loaded
   */
  async loadCheckpoint(outputDir) {
    const checkpointPath = path.join(outputDir, CHECKPOINT_FILE);

    try {
      const data = await fs.readFile(checkpointPath, 'utf-8');
      const checkpoint = JSON.parse(data);

      // Restore state
      this.phases = checkpoint.phases || {};
      this.context.url = checkpoint.url;
      this.context.origin = checkpoint.origin;
      this.context.outputDir = checkpoint.outputDir || outputDir;
      this.context.detection = checkpoint.detection;
      this.context.timeline = checkpoint.timeline || [];
      this.context.errors = checkpoint.errors || [];

      // Note: resources Map needs to be rebuilt by re-reading files
      // We only store metadata in checkpoint

      this.addTimelineEvent('Checkpoint loaded', {
        path: checkpointPath,
        phasesRestored: Object.keys(this.phases).length,
      });

      return true;
    } catch (e) {
      if (e.code === 'ENOENT') {
        return false; // No checkpoint exists
      }
      throw e; // Re-throw other errors
    }
  }

  /**
   * Check if checkpoint exists
   * @param {string} outputDir - Directory to check
   * @returns {Promise<boolean>} True if checkpoint exists
   */
  async hasCheckpoint(outputDir) {
    const checkpointPath = path.join(outputDir, CHECKPOINT_FILE);
    try {
      await fs.access(checkpointPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete checkpoint file
   * @param {string} outputDir - Directory containing checkpoint
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteCheckpoint(outputDir = this.context.outputDir) {
    if (!outputDir) return false;

    const checkpointPath = path.join(outputDir, CHECKPOINT_FILE);
    try {
      await fs.unlink(checkpointPath);
      return true;
    } catch {
      return false;
    }
  }

  // ==================== Phase Summary Report ====================

  /**
   * Save detailed phase summary report
   * @param {string} outputDir - Directory to save to
   * @returns {Promise<string>} Path to saved summary
   */
  async savePhaseSummary(outputDir = this.context.outputDir) {
    if (!outputDir) {
      throw new Error('No output directory specified for summary');
    }

    const summaryPath = path.join(outputDir, PHASE_SUMMARY_FILE);

    const summary = {
      version: CHECKPOINT_VERSION,
      generatedAt: new Date().toISOString(),
      url: this.context.url,
      origin: this.context.origin,
      totalDuration: Date.now() - this.startTime,
      resourceCount: this.context.resources.size,
      phases: {},
      errors: this.context.errors,
    };

    // Build detailed phase summaries
    for (const [name, phase] of Object.entries(this.phases)) {
      summary.phases[name] = {
        status: phase.status,
        startedAt: phase.startedAt,
        completedAt: phase.completedAt,
        duration: phase.duration,
        metrics: phase.metrics,
        result: phase.result,
        error: phase.error,
      };
    }

    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    return summaryPath;
  }

  // ==================== Result Summary ====================

  /**
   * Get final result summary
   * @returns {Object} Summary of extraction results
   */
  getFinalResult() {
    // Categorize resources by type
    const byType = {};
    for (const [url, data] of this.context.resources) {
      const ct = data.contentType || '';
      const type = ct.includes('javascript') ? 'js'
        : ct.includes('css') ? 'css'
        : ct.includes('image') ? 'image'
        : ct.includes('font') ? 'font'
        : ct.includes('wasm') ? 'wasm'
        : ct.includes('json') ? 'json'
        : ct.includes('html') ? 'html'
        : 'other';
      byType[type] = (byType[type] || 0) + 1;
    }

    // Calculate phase statistics
    const phaseStats = {
      total: Object.keys(this.phases).length,
      completed: 0,
      failed: 0,
      skipped: 0,
    };

    for (const phase of Object.values(this.phases)) {
      if (phase.status === PhaseStatus.COMPLETED) phaseStats.completed++;
      else if (phase.status === PhaseStatus.FAILED) phaseStats.failed++;
      else if (phase.status === PhaseStatus.SKIPPED) phaseStats.skipped++;
    }

    return {
      url: this.context.url,
      origin: this.context.origin,
      outputDir: this.context.outputDir,
      resourceCount: this.context.resources.size,
      byType,
      phases: this.phases,
      phaseStats,
      timeline: this.context.timeline,
      totalTime: Date.now() - this.startTime,
      errors: this.context.errors,
      success: phaseStats.failed === 0,
    };
  }

  /**
   * Get the last completed phase
   * @returns {string|null} Name of last completed phase
   */
  getLastCompletedPhase() {
    let lastPhase = null;
    let lastTime = 0;

    for (const [name, phase] of Object.entries(this.phases)) {
      if (phase.status === PhaseStatus.COMPLETED && phase.completedAt) {
        const time = new Date(phase.completedAt).getTime();
        if (time > lastTime) {
          lastTime = time;
          lastPhase = name;
        }
      }
    }

    return lastPhase;
  }

  /**
   * Get phases that need to run (not completed)
   * @param {Array<string>} allPhases - All phase names in order
   * @returns {Array<string>} Phase names that need to run
   */
  getPendingPhases(allPhases) {
    return allPhases.filter(name => !this.isPhaseComplete(name));
  }
}

// Convenience factory function
export function createState() {
  return new State();
}

// Also export as ExtractionState for backward compatibility
export { State as ExtractionState };

export default State;
