/**
 * Pipeline Orchestrator
 * Manages phase execution, checkpointing, and error handling
 */

import { PhaseError } from './errors.js';

export class Pipeline {
  constructor(config = {}) {
    this.config = config;
    this.phases = [];
    this.state = null;
    this.logger = null;
  }

  // Register a phase
  addPhase(phase) {
    this.phases.push(phase);
  }

  // Execute all phases
  async execute(state, logger) {
    this.state = state;
    this.logger = logger;

    const results = {};

    for (const phase of this.phases) {
      const phaseName = phase.name;

      // Skip completed phases (for resume)
      if (this.state.isPhaseComplete(phaseName)) {
        this.logger.info(`Skipping completed phase: ${phaseName}`);
        continue;
      }

      // Log phase start
      this.logger.phase(phaseName, phase.description);
      this.state.startPhase(phaseName);

      try {
        // Inject logger and state into phase for metrics tracking
        phase.logger = this.logger;
        phase.state = this.state;

        // Execute phase
        const result = await phase.execute(this.state.context);

        // Store result
        results[phaseName] = result;
        this.state.completePhase(phaseName, result);

        // Print phase summary
        this.printPhaseSummary(phaseName);

        // Checkpoint after each phase (unless dry run)
        if (this.state.context.outputDir && !this.config.dryRun) {
          await this.state.saveCheckpoint(this.state.context.outputDir);
        }

      } catch (error) {
        // Mark phase as failed
        this.state.failPhase(phaseName, error);

        // Save checkpoint with failure info (unless dry run)
        if (this.state.context.outputDir && !this.config.dryRun) {
          await this.state.saveCheckpoint(this.state.context.outputDir);
        }

        // Wrap and rethrow
        throw new PhaseError(phaseName, error, {
          url: this.state.context.url,
          resourceCount: this.state.context.resources.size,
        });
      }
    }

    // Save phase summary report (unless dry run)
    if (this.state.context.outputDir && !this.config.dryRun) {
      await this.state.savePhaseSummary(this.state.context.outputDir);
    }

    return results;
  }

  // Print phase summary box
  printPhaseSummary(phaseName) {
    const phase = this.state.phases[phaseName];
    if (!phase) return;

    const metrics = phase.metrics;
    const duration = (phase.duration / 1000).toFixed(1);

    console.log('');
    console.log('\x1b[36m' + '='.repeat(50) + '\x1b[0m');
    console.log('\x1b[36m' + `PHASE COMPLETE: ${phaseName}` + '\x1b[0m');
    console.log('\x1b[36m' + '='.repeat(50) + '\x1b[0m');
    console.log(`Duration:    ${duration}s`);

    if (metrics.itemsProcessed > 0) {
      console.log(`Processed:   ${metrics.itemsProcessed} items`);
    }
    if (metrics.itemsCreated > 0) {
      console.log(`Created:     ${metrics.itemsCreated} items`);
    }
    if (metrics.itemsModified > 0) {
      console.log(`Modified:    ${metrics.itemsModified} items`);
    }
    if (metrics.errors > 0) {
      console.log(`\x1b[31mErrors:      ${metrics.errors}\x1b[0m`);
    }
    if (metrics.warnings > 0) {
      console.log(`\x1b[33mWarnings:    ${metrics.warnings}\x1b[0m`);
    }

    // Show key actions if in verbose mode
    if (this.config.verbose && metrics.actions.length > 0) {
      console.log(`\nKey Actions:`);
      metrics.actions.forEach(action => {
        console.log(`  - ${action}`);
      });
    }

    console.log('\x1b[36m' + '='.repeat(50) + '\x1b[0m');
    console.log('');
  }
}

/**
 * Base Phase class
 * All phases should extend this
 */
export class Phase {
  constructor(name, description = '') {
    this.name = name;
    this.description = description;
    this.logger = null; // Injected by pipeline
    this.state = null; // Injected by pipeline
  }

  // Helper methods for tracking metrics
  trackProcessed(count = 1) {
    if (this.state) {
      const current = this.state.phases[this.name]?.metrics.itemsProcessed || 0;
      this.state.updatePhaseMetrics(this.name, { itemsProcessed: current + count });
    }
  }

  trackCreated(count = 1) {
    if (this.state) {
      const current = this.state.phases[this.name]?.metrics.itemsCreated || 0;
      this.state.updatePhaseMetrics(this.name, { itemsCreated: current + count });
    }
  }

  trackModified(count = 1) {
    if (this.state) {
      const current = this.state.phases[this.name]?.metrics.itemsModified || 0;
      this.state.updatePhaseMetrics(this.name, { itemsModified: current + count });
    }
  }

  trackError() {
    if (this.state) {
      const current = this.state.phases[this.name]?.metrics.errors || 0;
      this.state.updatePhaseMetrics(this.name, { errors: current + 1 });
    }
  }

  trackWarning() {
    if (this.state) {
      const current = this.state.phases[this.name]?.metrics.warnings || 0;
      this.state.updatePhaseMetrics(this.name, { warnings: current + 1 });
    }
  }

  trackAction(action) {
    if (this.state) {
      this.state.updatePhaseMetrics(this.name, { action });
    }
  }

  // Override in subclasses
  async execute(context) {
    throw new Error(`Phase.execute() must be implemented in ${this.name}`);
  }
}

export default { Pipeline, Phase };
