/**
 * Debug Utilities - Main Entry Point
 *
 * Provides debug tools for troubleshooting extraction issues.
 * All tools are optional and designed not to slow down extraction.
 *
 * Usage:
 *   import { enableDebug, generateReport, findMissing } from './debug/index.js';
 *
 *   // Enable verbose logging
 *   enableDebug(context);
 *
 *   // After extraction, generate debug report
 *   await generateReport(context, issues);
 *
 *   // Compare online vs offline resources
 *   const analysis = findMissing(online, offline);
 */

// Re-export all debug tools
export { generateReport, createIssue, Severity, Category } from './reporter.js';
export { findMissing, diffResources, classifyResource, analyzeCause, printMissingAnalysis } from './missing.js';
export { comparePage, compareConsole, compareNetwork, compareVisual, compareFunctional, createConsoleCollector, printComparison } from './diff.js';
export { createNetworkLogger, NetworkLogger } from './network-log.js';

/**
 * Debug mode state
 */
let debugEnabled = false;
let debugStartTime = null;
let debugEvents = [];

/**
 * Enable debug mode for a context
 * Sets up verbose logging and event capture
 *
 * @param {Object} context - Extraction context
 * @param {Object} options - Debug options
 * @returns {Object} Debug controller
 */
export function enableDebug(context, options = {}) {
  debugEnabled = true;
  debugStartTime = Date.now();
  debugEvents = [];

  const opts = {
    logLevel: 'debug',
    captureTimeline: true,
    captureNetworkLog: true,
    captureConsole: true,
    ...options,
  };

  // Update logger if available
  if (context.logger) {
    context.logger.level = opts.logLevel;
    context.logger.verbose = true;
  }

  // Add debug flag to context
  context.debug = true;
  context.debugOptions = opts;

  // Initialize debug collections
  context.debugData = {
    startTime: debugStartTime,
    events: debugEvents,
    networkLog: [],
    consoleLog: [],
    errors: [],
    warnings: [],
  };

  log('Debug mode enabled', { options: opts });

  return {
    log,
    warn,
    error,
    event,
    getEvents: () => [...debugEvents],
    getElapsed: () => Date.now() - debugStartTime,
    disable: () => disableDebug(context),
  };
}

/**
 * Disable debug mode
 * @param {Object} context - Extraction context
 */
export function disableDebug(context) {
  debugEnabled = false;

  if (context.logger) {
    context.logger.level = 'info';
    context.logger.verbose = false;
  }

  context.debug = false;
}

/**
 * Check if debug mode is enabled
 * @returns {boolean}
 */
export function isDebugEnabled() {
  return debugEnabled;
}

/**
 * Log a debug message
 * @param {string} message - Message to log
 * @param {Object} data - Additional data
 */
export function log(message, data = {}) {
  if (!debugEnabled) return;

  const entry = {
    type: 'log',
    timestamp: new Date().toISOString(),
    elapsed: Date.now() - debugStartTime,
    message,
    data,
  };

  debugEvents.push(entry);

  // Also log to console in debug mode
  const elapsed = ((Date.now() - debugStartTime) / 1000).toFixed(2);
  console.log(`\x1b[2m[${elapsed}s]\x1b[0m ${message}`, Object.keys(data).length > 0 ? data : '');
}

/**
 * Log a warning
 * @param {string} message - Warning message
 * @param {Object} data - Additional data
 */
export function warn(message, data = {}) {
  if (!debugEnabled) return;

  const entry = {
    type: 'warn',
    timestamp: new Date().toISOString(),
    elapsed: Date.now() - debugStartTime,
    message,
    data,
  };

  debugEvents.push(entry);

  const elapsed = ((Date.now() - debugStartTime) / 1000).toFixed(2);
  console.log(`\x1b[33m[${elapsed}s] [WARN]\x1b[0m ${message}`, Object.keys(data).length > 0 ? data : '');
}

/**
 * Log an error
 * @param {string} message - Error message
 * @param {Object} data - Additional data
 */
export function error(message, data = {}) {
  if (!debugEnabled) return;

  const entry = {
    type: 'error',
    timestamp: new Date().toISOString(),
    elapsed: Date.now() - debugStartTime,
    message,
    data,
  };

  debugEvents.push(entry);

  const elapsed = ((Date.now() - debugStartTime) / 1000).toFixed(2);
  console.log(`\x1b[31m[${elapsed}s] [ERROR]\x1b[0m ${message}`, Object.keys(data).length > 0 ? data : '');
}

/**
 * Record a significant event
 * @param {string} name - Event name
 * @param {Object} data - Event data
 */
export function event(name, data = {}) {
  const entry = {
    type: 'event',
    timestamp: new Date().toISOString(),
    elapsed: debugStartTime ? Date.now() - debugStartTime : 0,
    name,
    data,
  };

  debugEvents.push(entry);

  if (debugEnabled) {
    const elapsed = ((Date.now() - debugStartTime) / 1000).toFixed(2);
    console.log(`\x1b[36m[${elapsed}s] [EVENT]\x1b[0m ${name}`, Object.keys(data).length > 0 ? data : '');
  }
}

/**
 * Create a debug context for a specific component
 * @param {string} component - Component name
 * @returns {Object} Component-specific debug functions
 */
export function createDebugContext(component) {
  return {
    log: (msg, data) => log(`[${component}] ${msg}`, data),
    warn: (msg, data) => warn(`[${component}] ${msg}`, data),
    error: (msg, data) => error(`[${component}] ${msg}`, data),
    event: (name, data) => event(`${component}:${name}`, data),
    isEnabled: isDebugEnabled,
  };
}

/**
 * Measure execution time of an async function
 * @param {string} label - Label for the measurement
 * @param {Function} fn - Async function to measure
 * @returns {Promise<*>} Result of the function
 */
export async function measure(label, fn) {
  const start = Date.now();
  event(`${label}:start`);

  try {
    const result = await fn();
    const duration = Date.now() - start;
    event(`${label}:end`, { duration });
    log(`${label} completed in ${duration}ms`);
    return result;
  } catch (err) {
    const duration = Date.now() - start;
    event(`${label}:error`, { duration, error: err.message });
    error(`${label} failed after ${duration}ms: ${err.message}`);
    throw err;
  }
}

/**
 * Wrap a function with debug logging
 * @param {string} name - Function name
 * @param {Function} fn - Function to wrap
 * @returns {Function} Wrapped function
 */
export function wrap(name, fn) {
  return async function(...args) {
    return measure(name, () => fn.apply(this, args));
  };
}

/**
 * Assert a condition and log if it fails
 * @param {boolean} condition - Condition to check
 * @param {string} message - Message if condition fails
 * @param {Object} data - Additional data
 */
export function assert(condition, message, data = {}) {
  if (!condition) {
    warn(`Assertion failed: ${message}`, data);
  }
}

/**
 * Print a debug summary
 * @param {Object} context - Extraction context
 */
export function printDebugSummary(context) {
  if (!debugEnabled) {
    console.log('Debug mode was not enabled.');
    return;
  }

  const duration = Date.now() - debugStartTime;

  console.log('\n' + '='.repeat(60));
  console.log('  DEBUG SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Duration:       ${(duration / 1000).toFixed(1)}s`);
  console.log(`  Events:         ${debugEvents.length}`);
  console.log(`  Warnings:       ${debugEvents.filter(e => e.type === 'warn').length}`);
  console.log(`  Errors:         ${debugEvents.filter(e => e.type === 'error').length}`);

  if (context.resources) {
    console.log(`  Resources:      ${context.resources.size}`);
  }

  if (context.errors && context.errors.length > 0) {
    console.log('\n  Errors encountered:');
    for (const err of context.errors.slice(0, 5)) {
      console.log(`    - ${err.message || err}`);
    }
    if (context.errors.length > 5) {
      console.log(`    ... and ${context.errors.length - 5} more`);
    }
  }

  console.log('='.repeat(60) + '\n');
}

// Export a default debug interface
export default {
  enableDebug,
  disableDebug,
  isDebugEnabled,
  log,
  warn,
  error,
  event,
  createDebugContext,
  measure,
  wrap,
  assert,
  printDebugSummary,
};
