/**
 * Convergence detection - determine when exploration is complete
 */
const config = require('../utils/config');
const logger = require('../utils/logger');

/**
 * Check if we've reached convergence (no new discoveries)
 */
function checkConvergence(metrics) {
  // Not enough data yet
  if (metrics.newStatesWindow.length < metrics.windowSize) {
    return false;
  }

  // Count new states in recent window
  const recentNewStates = metrics.newStatesWindow.reduce((a, b) => a + b, 0);

  // Converged if no new states for threshold iterations
  if (recentNewStates === 0) {
    metrics.noProgressCount++;

    if (metrics.noProgressCount >= config.convergenceThreshold) {
      logger.debug(`Convergence: No new states for ${metrics.noProgressCount} iterations`);
      return true;
    }
  } else {
    metrics.noProgressCount = 0;
  }

  return false;
}

/**
 * Update metrics after each state exploration
 */
function updateMetrics(metrics, newStatesCount) {
  metrics.newStatesWindow.push(newStatesCount);

  // Keep window size bounded
  if (metrics.newStatesWindow.length > metrics.windowSize) {
    metrics.newStatesWindow.shift();
  }
}

/**
 * Calculate coverage statistics
 */
function calculateCoverage(stateGraph, discovery) {
  const coverage = {
    statesCovered: stateGraph.states.size,
    transitionsCovered: stateGraph.transitions.length,

    // Element coverage
    elementsInteracted: new Set(),
    elementsTotal: discovery.elements.length,

    // Event coverage
    eventTypesTriggered: new Set(),
    eventTypesTotal: new Set()
  };

  // Count interacted elements
  for (const t of stateGraph.transitions) {
    if (t.action?.selector) {
      coverage.elementsInteracted.add(t.action.selector);
    }
    if (t.action?.type) {
      coverage.eventTypesTriggered.add(t.action.type);
    }
  }

  // Count total event types
  for (const el of discovery.eventListeners) {
    for (const e of el.events) {
      coverage.eventTypesTotal.add(e.type);
    }
  }

  coverage.elementCoveragePercent =
    (coverage.elementsInteracted.size / coverage.elementsTotal * 100).toFixed(1);
  coverage.eventCoveragePercent =
    (coverage.eventTypesTriggered.size / coverage.eventTypesTotal.size * 100).toFixed(1);

  return coverage;
}

/**
 * Generate completeness report
 */
function generateCompletenessReport(metrics, coverage) {
  return {
    isComplete: metrics.noProgressCount >= config.convergenceThreshold,

    stateSpace: {
      statesDiscovered: metrics.totalStates,
      transitionsRecorded: metrics.totalTransitions,
      convergenceIterations: metrics.noProgressCount
    },

    coverage: {
      elements: `${coverage.elementsInteracted.size}/${coverage.elementsTotal} (${coverage.elementCoveragePercent}%)`,
      eventTypes: `${coverage.eventTypesTriggered.size}/${coverage.eventTypesTotal.size} (${coverage.eventCoveragePercent}%)`
    },

    confidence: calculateConfidence(metrics, coverage)
  };
}

function calculateConfidence(metrics, coverage) {
  let confidence = 0;

  // Convergence adds confidence
  if (metrics.noProgressCount >= config.convergenceThreshold) {
    confidence += 50;
  }

  // Element coverage adds confidence
  const elemPct = parseFloat(coverage.elementCoveragePercent);
  confidence += Math.min(elemPct / 2, 25);

  // Event coverage adds confidence
  const eventPct = parseFloat(coverage.eventCoveragePercent);
  confidence += Math.min(eventPct / 4, 25);

  return Math.min(confidence, 100).toFixed(1) + '%';
}

module.exports = {
  checkConvergence,
  updateMetrics,
  calculateCoverage,
  generateCompletenessReport
};
