/**
 * Exploration module - BFS state space exploration
 */
const { exploreStateSpace } = require('./bfs');
const { captureState, hashStatePage, restoreState, statesEqual } = require('./state');
const { checkConvergence, calculateCoverage, generateCompletenessReport } = require('./convergence');

module.exports = {
  exploreStateSpace,
  captureState,
  hashStatePage,
  restoreState,
  statesEqual,
  checkConvergence,
  calculateCoverage,
  generateCompletenessReport
};
