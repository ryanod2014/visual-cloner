/**
 * Extraction State
 * Tracks progress, enables checkpointing, stores phase results
 */

import fs from 'fs/promises';
import path from 'path';

export class ExtractionState {
  constructor() {
    this.phases = {};
    this.context = {
      url: null,
      outputDir: null,
      browser: null,
      page: null,
      resources: new Map(),
      html: null,
      errors: [],
      timeline: [],
    };
    this.startTime = Date.now();
  }

  // Initialize context
  init(url, outputDir) {
    this.context.url = url;
    this.context.outputDir = outputDir;
    this.addTimelineEvent('Extraction started');
  }

  // Timeline tracking
  addTimelineEvent(event) {
    this.context.timeline.push({
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - this.startTime,
      event,
    });
  }

  // Phase status tracking
  startPhase(name) {
    this.phases[name] = {
      status: 'in_progress',
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
    this.addTimelineEvent(`Phase started: ${name}`);
  }

  completePhase(name, result = {}) {
    const phase = this.phases[name];
    phase.status = 'completed';
    phase.completedAt = new Date().toISOString();
    phase.duration = Date.now() - phase.startTime;
    phase.result = result;
    this.addTimelineEvent(`Phase completed: ${name} (${phase.duration}ms)`);
  }

  // Update phase metrics
  updatePhaseMetrics(name, updates) {
    const phase = this.phases[name];
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

  // Get phase metrics for display
  getPhaseMetrics(name) {
    const phase = this.phases[name];
    if (!phase) return null;
    return {
      duration: phase.duration || (Date.now() - phase.startTime),
      ...phase.metrics,
    };
  }

  failPhase(name, error) {
    const phase = this.phases[name];
    phase.status = 'failed';
    phase.completedAt = new Date().toISOString();
    phase.duration = Date.now() - new Date(phase.startedAt).getTime();
    phase.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    this.context.errors.push(phase.error);
    this.addTimelineEvent(`Phase failed: ${name} - ${error.message}`);
  }

  isPhaseComplete(name) {
    return this.phases[name]?.status === 'completed';
  }

  // Checkpoint persistence
  async saveCheckpoint(outputDir) {
    const checkpointPath = path.join(outputDir, '.checkpoint.json');

    // Serialize resources Map
    const resourcesArray = [];
    for (const [url, data] of this.context.resources) {
      resourcesArray.push({
        url,
        contentType: data.contentType,
        size: data.size,
        // Don't save body in checkpoint, just metadata
      });
    }

    const checkpoint = {
      version: '1.0',
      savedAt: new Date().toISOString(),
      url: this.context.url,
      phases: this.phases,
      resourceCount: this.context.resources.size,
      resourcesMeta: resourcesArray,
      timeline: this.context.timeline,
      errors: this.context.errors,
    };

    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
    return checkpointPath;
  }

  // Save phase summary report
  async savePhaseSummary(outputDir) {
    const summaryPath = path.join(outputDir, 'phase-summary.json');

    const summary = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      url: this.context.url,
      totalDuration: Date.now() - this.startTime,
      phases: {},
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

  async loadCheckpoint(outputDir) {
    const checkpointPath = path.join(outputDir, '.checkpoint.json');
    try {
      const data = await fs.readFile(checkpointPath, 'utf-8');
      const checkpoint = JSON.parse(data);

      this.phases = checkpoint.phases;
      this.context.url = checkpoint.url;
      this.context.timeline = checkpoint.timeline || [];
      this.context.errors = checkpoint.errors || [];

      return true;
    } catch (e) {
      return false; // No checkpoint exists
    }
  }

  // Get final result summary
  getFinalResult() {
    const byType = {};
    for (const [url, data] of this.context.resources) {
      const ct = data.contentType || '';
      const type = ct.includes('javascript') ? 'js'
        : ct.includes('css') ? 'css'
        : ct.includes('image') ? 'image'
        : ct.includes('font') ? 'font'
        : ct.includes('wasm') ? 'wasm'
        : ct.includes('json') ? 'json'
        : 'other';
      byType[type] = (byType[type] || 0) + 1;
    }

    return {
      url: this.context.url,
      outputDir: this.context.outputDir,
      resourceCount: this.context.resources.size,
      byType,
      phases: this.phases,
      timeline: this.context.timeline,
      totalTime: Date.now() - this.startTime,
      errors: this.context.errors,
    };
  }
}

export default ExtractionState;
