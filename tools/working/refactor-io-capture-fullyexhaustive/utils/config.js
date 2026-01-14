/**
 * Configuration for exhaustive I/O capture
 */
module.exports = {
  // Exploration limits
  maxStates: 10000,
  maxTransitions: 100000,
  maxDepth: 50,

  // Convergence
  convergenceThreshold: 100,  // No new states for N iterations = done

  // Parallelization
  defaultWorkers: 4,

  // Timeouts
  actionTimeout: 5000,
  pageLoadTimeout: 30000,
  networkIdleTimeout: 2000,

  // Output
  outputDir: './output',
  screenshotQuality: 80,

  // Debug
  verbose: false,
  saveIntermediateStates: true
};
