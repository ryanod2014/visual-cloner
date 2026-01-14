/**
 * BFS State Space Exploration
 * Guarantees all reachable states are discovered
 */
const logger = require('../utils/logger');
const config = require('../utils/config');
const { captureState, hashStatePage, restoreState } = require('./state');
const { checkConvergence, updateMetrics } = require('./convergence');

/**
 * Main BFS exploration loop
 */
async function exploreStateSpace(page, executeActionFn, discoverActionsFn) {
  logger.info('=== PHASE 2: BFS EXPLORATION ===');

  const visited = new Set();
  const queue = [];
  const stateGraph = {
    states: new Map(),
    transitions: [],
    initialState: null
  };

  // Metrics for convergence detection
  const metrics = {
    totalStates: 0,
    totalTransitions: 0,
    newStatesWindow: [],
    windowSize: 100,
    noProgressCount: 0
  };

  // Capture initial state
  const initialState = await captureState(page);
  visited.add(initialState.hash);
  queue.push(initialState);
  stateGraph.states.set(initialState.hash, initialState);
  stateGraph.initialState = initialState.hash;
  metrics.totalStates = 1;

  logger.info(`Initial state: ${initialState.hash}`);

  // BFS loop
  while (queue.length > 0) {
    // Check limits
    if (metrics.totalStates >= config.maxStates) {
      logger.warn(`Reached max states limit: ${config.maxStates}`);
      break;
    }

    if (metrics.totalTransitions >= config.maxTransitions) {
      logger.warn(`Reached max transitions limit: ${config.maxTransitions}`);
      break;
    }

    // Check convergence
    if (checkConvergence(metrics)) {
      logger.info('Convergence detected - exploration complete');
      break;
    }

    // Get next state
    const currentState = queue.shift();
    logger.debug(`Exploring state: ${currentState.hash} (queue: ${queue.length})`);

    // Restore to this state
    await restoreState(page, currentState);

    // Discover available actions in this state
    const actions = await discoverActionsFn(page);
    let newStatesThisRound = 0;

    // Try each action
    for (const action of actions) {
      // Restore before each action
      await restoreState(page, currentState);

      // Execute action and capture result
      const result = await executeActionFn(page, action);

      if (!result.success) continue;

      const newState = result.stateAfter;
      const newHash = newState.hash;

      // Record transition
      stateGraph.transitions.push({
        from: currentState.hash,
        action: action,
        to: newHash,
        io: result.io
      });
      metrics.totalTransitions++;

      // New state discovered?
      if (!visited.has(newHash)) {
        visited.add(newHash);
        stateGraph.states.set(newHash, newState);
        queue.push(newState);
        metrics.totalStates++;
        newStatesThisRound++;

        logger.debug(`New state discovered: ${newHash}`);
      }
    }

    // Update convergence metrics
    updateMetrics(metrics, newStatesThisRound);

    // Progress report
    if (metrics.totalTransitions % 100 === 0) {
      logger.progress(metrics.totalStates, config.maxStates, 'States');
    }
  }

  logger.info(`Exploration complete: ${metrics.totalStates} states, ${metrics.totalTransitions} transitions`);

  return {
    stateGraph,
    metrics: {
      totalStates: metrics.totalStates,
      totalTransitions: metrics.totalTransitions,
      visitedHashes: Array.from(visited)
    }
  };
}

module.exports = { exploreStateSpace };
