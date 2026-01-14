/**
 * explorer.js - BFS State Space Exploration
 *
 * Core algorithm for exhaustive coverage of application states.
 * Implements breadth-first search to discover all reachable states
 * and transitions in a web application.
 */

const DEFAULT_OPTIONS = {
  maxStates: 10000,
  maxDepth: 100,
  convergenceThreshold: 100,
  onStateDiscovered: () => {},
  onTransition: () => {},
  onConvergence: () => {}
};

/**
 * Execute a single action on the page
 * @param {Object} page - Playwright page instance
 * @param {Object} action - Action to execute
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function executeAction(page, action) {
  try {
    switch (action.type) {
      case 'click': {
        const element = await page.$(action.target);
        if (!element) {
          return { success: false, error: `Element not found: ${action.target}` };
        }
        await element.click({ timeout: 5000 });
        break;
      }

      case 'type': {
        const input = await page.$(action.target);
        if (!input) {
          return { success: false, error: `Input not found: ${action.target}` };
        }
        await input.fill(action.value || '');
        break;
      }

      case 'keyboard': {
        const keyCombo = action.modifiers && action.modifiers.length > 0
          ? `${action.modifiers.join('+')}+${action.key}`
          : action.key;
        await page.keyboard.press(keyCombo);
        break;
      }

      case 'hover': {
        const hoverTarget = await page.$(action.target);
        if (!hoverTarget) {
          return { success: false, error: `Hover target not found: ${action.target}` };
        }
        await hoverTarget.hover();
        break;
      }

      case 'scroll': {
        if (action.target) {
          const scrollTarget = await page.$(action.target);
          if (scrollTarget) {
            await scrollTarget.scrollIntoViewIfNeeded();
          }
        } else {
          await page.evaluate((delta) => {
            window.scrollBy(0, delta);
          }, action.value || 300);
        }
        break;
      }

      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }

    // Wait for network idle after action
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Generate list of actions to try in current state
 * @param {Object} manifest - Application manifest with known interactions
 * @param {Array} currentElements - Currently visible interactive elements
 * @returns {Array<Object>} Array of action objects
 */
function generateActionsForState(manifest, currentElements) {
  const actions = [];

  // Generate click actions for clickable elements
  const clickableSelectors = currentElements
    .filter(el => el.clickable || el.tagName === 'BUTTON' || el.tagName === 'A')
    .map(el => el.selector);

  for (const selector of clickableSelectors) {
    actions.push({
      type: 'click',
      target: selector,
      value: null,
      key: null,
      modifiers: null
    });
  }

  // Generate type actions for input elements
  const inputElements = currentElements.filter(el =>
    el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
  );

  const testValues = ['test', 'hello@example.com', '12345', 'Test Value'];
  for (const input of inputElements) {
    for (const value of testValues) {
      actions.push({
        type: 'type',
        target: input.selector,
        value: value,
        key: null,
        modifiers: null
      });
    }
  }

  // Add keyboard shortcuts from manifest
  if (manifest && manifest.keyboardShortcuts) {
    for (const shortcut of manifest.keyboardShortcuts) {
      actions.push({
        type: 'keyboard',
        target: null,
        value: null,
        key: shortcut.key,
        modifiers: shortcut.modifiers || null
      });
    }
  }

  // Add common keyboard shortcuts
  const commonShortcuts = [
    { key: 'Escape', modifiers: null },
    { key: 'Enter', modifiers: null },
    { key: 'Tab', modifiers: null },
    { key: 'Tab', modifiers: ['Shift'] }
  ];

  for (const shortcut of commonShortcuts) {
    actions.push({
      type: 'keyboard',
      target: null,
      value: null,
      key: shortcut.key,
      modifiers: shortcut.modifiers
    });
  }

  // Generate hover actions for elements with hover states
  const hoverableElements = currentElements.filter(el =>
    el.hasHoverState || el.tagName === 'A' || el.tagName === 'BUTTON'
  );

  for (const el of hoverableElements.slice(0, 10)) { // Limit hover actions
    actions.push({
      type: 'hover',
      target: el.selector,
      value: null,
      key: null,
      modifiers: null
    });
  }

  return actions;
}

/**
 * Create an explorer instance for BFS state space exploration
 * @param {Object} options - Explorer configuration
 * @returns {Object} Explorer instance
 */
function createExplorer(options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  // Internal state
  const visitedStates = new Map(); // hash -> stateData
  const transitions = [];
  const queue = [];
  let initialStateHash = null;
  let iterationsSinceNewState = 0;
  let currentDepth = 0;
  let isExplorationConverged = false;

  /**
   * Check if exploration has converged
   * @returns {boolean}
   */
  function isConverged() {
    return isExplorationConverged ||
           iterationsSinceNewState >= config.convergenceThreshold;
  }

  /**
   * Get current exploration statistics
   * @returns {Object}
   */
  function getStats() {
    const convergenceProgress = Math.min(
      100,
      (iterationsSinceNewState / config.convergenceThreshold) * 100
    );

    return {
      statesDiscovered: visitedStates.size,
      transitionsRecorded: transitions.length,
      queueSize: queue.length,
      currentDepth: currentDepth,
      convergenceProgress: convergenceProgress,
      isConverged: isConverged()
    };
  }

  /**
   * Get the discovered state graph
   * @returns {Object}
   */
  function getStateGraph() {
    return {
      states: new Map(visitedStates),
      transitions: [...transitions],
      initialState: initialStateHash
    };
  }

  /**
   * Add a state to the visited set and queue if new
   * @param {string} hash - State hash
   * @param {Object} stateData - State information
   * @param {number} depth - Current exploration depth
   * @returns {boolean} True if state was new
   */
  function addState(hash, stateData, depth) {
    if (visitedStates.has(hash)) {
      return false;
    }

    if (visitedStates.size >= config.maxStates) {
      return false;
    }

    visitedStates.set(hash, { ...stateData, depth });

    if (depth < config.maxDepth) {
      queue.push({ hash, depth });
    }

    config.onStateDiscovered(stateData);
    iterationsSinceNewState = 0;

    return true;
  }

  /**
   * Record a transition between states
   * @param {string} fromHash - Source state hash
   * @param {Object} action - Action that caused transition
   * @param {string} toHash - Target state hash
   * @param {Object} ioData - I/O data captured during transition
   */
  function recordTransition(fromHash, action, toHash, ioData) {
    const transition = {
      from: fromHash,
      action: { ...action },
      to: toHash,
      timestamp: Date.now()
    };

    transitions.push(transition);
    config.onTransition(fromHash, action, toHash, ioData);
  }

  /**
   * Main BFS exploration loop
   * @param {Object} page - Playwright page instance
   * @param {Object} initialManifest - Application manifest
   * @returns {Promise<Object>} Exploration results
   */
  async function explore(page, initialManifest) {
    // Import state capture module (lazy load to avoid circular deps)
    const { captureState, restoreState, getInteractiveElements } =
      require('./state-capture');

    // Step 1: Capture initial state
    const initialState = await captureState(page);
    initialStateHash = initialState.hash;
    addState(initialState.hash, initialState, 0);

    // Step 2: BFS exploration loop
    while (queue.length > 0 && !isConverged()) {
      // Check state limits
      if (visitedStates.size >= config.maxStates) {
        break;
      }

      // Pop next state from queue
      const { hash: currentHash, depth } = queue.shift();
      currentDepth = depth;

      // Restore page to current state
      const currentStateData = visitedStates.get(currentHash);
      await restoreState(page, currentStateData);

      // Get available actions
      const currentElements = await getInteractiveElements(page);
      const actions = generateActionsForState(initialManifest, currentElements);

      // Try each action
      for (const action of actions) {
        // Check convergence before each action
        if (isConverged()) {
          break;
        }

        // Restore state before action (actions may have side effects)
        await restoreState(page, currentStateData);

        // Execute action
        const actionResult = await executeAction(page, action);

        if (!actionResult.success) {
          continue;
        }

        // Capture new state
        const newState = await captureState(page);

        // Record transition
        const ioData = {
          networkRequests: newState.networkActivity || [],
          consoleMessages: newState.consoleMessages || [],
          storageChanges: newState.storageChanges || {}
        };

        recordTransition(currentHash, action, newState.hash, ioData);

        // Add new state if not visited
        const isNew = addState(newState.hash, newState, depth + 1);

        if (!isNew) {
          iterationsSinceNewState++;
        }
      }

      // Update convergence metrics
      iterationsSinceNewState++;

      if (isConverged()) {
        isExplorationConverged = true;
        config.onConvergence(getStats());
      }
    }

    // Step 3: Return exploration results
    return {
      success: true,
      stats: getStats(),
      graph: getStateGraph(),
      converged: isConverged(),
      reason: determineCompletionReason()
    };
  }

  /**
   * Determine why exploration completed
   * @returns {string}
   */
  function determineCompletionReason() {
    if (visitedStates.size >= config.maxStates) {
      return 'max_states_reached';
    }
    if (currentDepth >= config.maxDepth) {
      return 'max_depth_reached';
    }
    if (queue.length === 0) {
      return 'queue_exhausted';
    }
    if (isConverged()) {
      return 'converged';
    }
    return 'unknown';
  }

  // Return explorer instance
  return {
    explore,
    getStats,
    getStateGraph,
    isConverged
  };
}

module.exports = {
  createExplorer,
  executeAction,
  generateActionsForState
};
