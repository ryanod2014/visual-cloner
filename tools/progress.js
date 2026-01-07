#!/usr/bin/env node
/**
 * Progress Tracking Utilities
 *
 * Provides checkpoint/resume functionality for the cloning process.
 * Tracks which sections have been completed, failed, or are in progress.
 *
 * Usage:
 *   import { initProgress, updateProgress, getIncomplete, getProgress } from './progress.js';
 *
 *   // Initialize progress for a new clone
 *   await initProgress('./output/spotify', sections);
 *
 *   // Update section status
 *   await updateProgress('./output/spotify', 'hero', 'completed');
 *
 *   // Get incomplete sections
 *   const remaining = await getIncomplete('./output/spotify', allSections);
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Constants
// ============================================================================

const PROGRESS_FILE = 'progress.json';

const STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get the progress file path for a directory
 */
function getProgressPath(outputDir) {
  return path.join(outputDir, PROGRESS_FILE);
}

/**
 * Initialize progress tracking for a new cloning session
 *
 * @param {string} outputDir - Output directory path
 * @param {Array} sections - Array of section objects with id property
 * @param {Object} metadata - Optional metadata (url, timestamp, etc.)
 * @returns {Object} - Initial progress object
 */
async function initProgress(outputDir, sections = [], metadata = {}) {
  const progressPath = getProgressPath(outputDir);

  // Create directory if needed
  await fs.mkdir(outputDir, { recursive: true });

  const progress = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      url: metadata.url || null,
      title: metadata.title || null,
      totalSections: sections.length,
      ...metadata,
    },
    sections: {},
    stats: {
      pending: sections.length,
      in_progress: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    },
  };

  // Initialize all sections as pending
  for (const section of sections) {
    const sectionId = typeof section === 'string' ? section : section.id;
    progress.sections[sectionId] = {
      status: STATUS.PENDING,
      startedAt: null,
      completedAt: null,
      attempts: 0,
      lastError: null,
      outputFile: null,
    };
  }

  await fs.writeFile(progressPath, JSON.stringify(progress, null, 2));
  return progress;
}

/**
 * Load existing progress or return null if not found
 *
 * @param {string} outputDir - Output directory path
 * @returns {Object|null} - Progress object or null
 */
async function loadProgress(outputDir) {
  const progressPath = getProgressPath(outputDir);

  try {
    const content = await fs.readFile(progressPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Save progress to file
 *
 * @param {string} outputDir - Output directory path
 * @param {Object} progress - Progress object
 */
async function saveProgress(outputDir, progress) {
  const progressPath = getProgressPath(outputDir);
  progress.updatedAt = new Date().toISOString();
  await fs.writeFile(progressPath, JSON.stringify(progress, null, 2));
}

/**
 * Update the status of a specific section
 *
 * @param {string} outputDir - Output directory path
 * @param {string} sectionId - Section identifier
 * @param {string} status - New status (pending, in_progress, completed, failed, skipped)
 * @param {Object} extra - Extra data (error, outputFile, etc.)
 * @returns {Object} - Updated progress object
 */
async function updateProgress(outputDir, sectionId, status, extra = {}) {
  let progress = await loadProgress(outputDir);

  if (!progress) {
    // Create minimal progress if not exists
    progress = await initProgress(outputDir, [sectionId]);
  }

  // Ensure section exists
  if (!progress.sections[sectionId]) {
    progress.sections[sectionId] = {
      status: STATUS.PENDING,
      startedAt: null,
      completedAt: null,
      attempts: 0,
      lastError: null,
      outputFile: null,
    };
  }

  const section = progress.sections[sectionId];
  const oldStatus = section.status;

  // Update section data
  section.status = status;

  if (status === STATUS.IN_PROGRESS) {
    section.startedAt = new Date().toISOString();
    section.attempts += 1;
  }

  if (status === STATUS.COMPLETED) {
    section.completedAt = new Date().toISOString();
    section.outputFile = extra.outputFile || null;
  }

  if (status === STATUS.FAILED) {
    section.lastError = extra.error || 'Unknown error';
  }

  // Update stats
  if (oldStatus !== status) {
    if (progress.stats[oldStatus] > 0) {
      progress.stats[oldStatus]--;
    }
    progress.stats[status] = (progress.stats[status] || 0) + 1;
  }

  await saveProgress(outputDir, progress);
  return progress;
}

/**
 * Get current progress summary
 *
 * @param {string} outputDir - Output directory path
 * @returns {Object} - Progress summary
 */
async function getProgress(outputDir) {
  const progress = await loadProgress(outputDir);

  if (!progress) {
    return null;
  }

  const sections = Object.keys(progress.sections);
  const completed = sections.filter(s => progress.sections[s].status === STATUS.COMPLETED);
  const failed = sections.filter(s => progress.sections[s].status === STATUS.FAILED);
  const pending = sections.filter(s => progress.sections[s].status === STATUS.PENDING);
  const inProgress = sections.filter(s => progress.sections[s].status === STATUS.IN_PROGRESS);

  return {
    total: sections.length,
    completed: completed.length,
    failed: failed.length,
    pending: pending.length,
    inProgress: inProgress.length,
    percentage: Math.round((completed.length / sections.length) * 100) || 0,
    sections: progress.sections,
    metadata: progress.metadata,
  };
}

/**
 * Get list of incomplete sections (pending or failed)
 *
 * @param {string} outputDir - Output directory path
 * @param {Array} allSections - All sections to check against
 * @returns {Array} - Array of section objects that need processing
 */
async function getIncomplete(outputDir, allSections = []) {
  const progress = await loadProgress(outputDir);

  if (!progress) {
    // No progress file - all sections are incomplete
    return allSections;
  }

  const incomplete = [];

  for (const section of allSections) {
    const sectionId = typeof section === 'string' ? section : section.id;
    const sectionProgress = progress.sections[sectionId];

    if (!sectionProgress) {
      // Section not in progress file - needs processing
      incomplete.push(section);
    } else if (sectionProgress.status === STATUS.PENDING ||
               sectionProgress.status === STATUS.FAILED ||
               sectionProgress.status === STATUS.IN_PROGRESS) {
      incomplete.push(section);
    }
  }

  return incomplete;
}

/**
 * Mark all in_progress sections as failed (for recovery after crash)
 *
 * @param {string} outputDir - Output directory path
 * @returns {number} - Number of sections reset
 */
async function resetStale(outputDir) {
  const progress = await loadProgress(outputDir);

  if (!progress) {
    return 0;
  }

  let resetCount = 0;

  for (const [sectionId, section] of Object.entries(progress.sections)) {
    if (section.status === STATUS.IN_PROGRESS) {
      section.status = STATUS.PENDING;
      section.lastError = 'Reset: was in progress when session ended';
      resetCount++;
    }
  }

  // Recalculate stats
  progress.stats = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const section of Object.values(progress.sections)) {
    progress.stats[section.status] = (progress.stats[section.status] || 0) + 1;
  }

  await saveProgress(outputDir, progress);
  return resetCount;
}

/**
 * Clear progress and start fresh
 *
 * @param {string} outputDir - Output directory path
 */
async function clearProgress(outputDir) {
  const progressPath = getProgressPath(outputDir);
  try {
    await fs.unlink(progressPath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Print a progress summary to console
 *
 * @param {string} outputDir - Output directory path
 */
async function printProgress(outputDir) {
  const summary = await getProgress(outputDir);

  if (!summary) {
    console.log('No progress file found.');
    return;
  }

  console.log('\n=== Clone Progress ===\n');
  console.log(`Total sections: ${summary.total}`);
  console.log(`Completed: ${summary.completed} (${summary.percentage}%)`);
  console.log(`Pending: ${summary.pending}`);
  console.log(`In Progress: ${summary.inProgress}`);
  console.log(`Failed: ${summary.failed}`);

  if (summary.metadata.url) {
    console.log(`\nSource: ${summary.metadata.url}`);
  }

  console.log('\nSection Details:');
  for (const [id, section] of Object.entries(summary.sections)) {
    const statusIcon = {
      [STATUS.COMPLETED]: '[OK]',
      [STATUS.FAILED]: '[X]',
      [STATUS.PENDING]: '[ ]',
      [STATUS.IN_PROGRESS]: '[~]',
      [STATUS.SKIPPED]: '[-]',
    }[section.status] || '[?]';

    let line = `  ${statusIcon} ${id}`;
    if (section.attempts > 1) {
      line += ` (${section.attempts} attempts)`;
    }
    if (section.lastError) {
      line += ` - ${section.lastError.substring(0, 40)}...`;
    }
    console.log(line);
  }
  console.log('');
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const outputDir = args[1] ? path.resolve(args[1]) : null;

  if (!command || command === '--help' || command === '-h') {
    console.log(`
Progress Tracking CLI

Usage:
  node tools/progress.js <command> <output-dir>

Commands:
  show <dir>      Show progress summary
  reset <dir>     Reset stale in-progress sections
  clear <dir>     Clear all progress data
  init <dir>      Initialize empty progress file

Examples:
  node tools/progress.js show ./output/spotify
  node tools/progress.js reset ./output/linear
`);
    process.exit(0);
  }

  if (!outputDir) {
    console.error('Error: Please provide an output directory');
    process.exit(1);
  }

  try {
    switch (command) {
      case 'show':
        await printProgress(outputDir);
        break;

      case 'reset':
        const resetCount = await resetStale(outputDir);
        console.log(`Reset ${resetCount} stale section(s)`);
        break;

      case 'clear':
        await clearProgress(outputDir);
        console.log('Progress cleared');
        break;

      case 'init':
        await initProgress(outputDir, []);
        console.log('Initialized empty progress file');
        break;

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1].endsWith('progress.js')) {
  main();
}

// Export for use as module
export {
  initProgress,
  updateProgress,
  getProgress,
  getIncomplete,
  loadProgress,
  saveProgress,
  resetStale,
  clearProgress,
  printProgress,
  STATUS,
};
