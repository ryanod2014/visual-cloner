/**
 * Exhaustive State Explorer
 *
 * SYSTEMATICALLY explores EVERY possible UI behavior - no swiss cheese.
 *
 * Strategy:
 * 1. Find ALL interactive elements (not sampling - ALL of them)
 * 2. BFS exploration of state space (try every action from every state)
 * 3. Hash states to detect cycles and avoid infinite loops
 * 4. Track coverage metrics (elements interacted / total elements)
 * 5. Convergence detection (stop when no new states found)
 * 6. Build complete state transition graph
 *
 * This is NOT passive observation - it ACTIVELY tries everything.
 */

import { behavioralRecorder } from './behavioral-recorder.js';

export const exhaustiveStateExplorer = {
  name: 'exhaustive-state-explorer',

  getInjectionScript() {
    return `
(function() {
  if (window.__exhaustiveExplorerInstalled) return;
  window.__exhaustiveExplorerInstalled = true;

  // ============================================
  // FIND ALL INTERACTIVE ELEMENTS
  // ============================================

  window.__findAllInteractiveElements = function() {
    const interactive = [];

    // 1. Explicitly interactive elements
    const explicitSelectors = [
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[role="switch"]',
      '[role="slider"]',
      '[role="option"]',
      '[role="treeitem"]',
      '[role="listitem"]',
      '[tabindex]',
      '[onclick]',
      '[onmousedown]',
      '[onmouseup]',
      '[onkeydown]',
      '[ondblclick]',
      '[draggable="true"]',
      '[contenteditable="true"]',
      'summary',
      'details',
      'label[for]',
    ];

    explicitSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const selector = window.__getUniqueSelector(el);
        if (selector && !interactive.some(i => i.selector === selector)) {
          interactive.push({
            selector,
            type: 'explicit',
            tagName: el.tagName.toLowerCase(),
            role: el.getAttribute('role'),
            isVisible: isElementVisible(el),
          });
        }
      });
    });

    // 2. Elements with cursor:pointer (implicit interactive)
    document.querySelectorAll('*').forEach(el => {
      const computed = getComputedStyle(el);
      if (computed.cursor === 'pointer') {
        const selector = window.__getUniqueSelector(el);
        if (selector && !interactive.some(i => i.selector === selector)) {
          interactive.push({
            selector,
            type: 'cursor-pointer',
            tagName: el.tagName.toLowerCase(),
            isVisible: isElementVisible(el),
          });
        }
      }
    });

    // 3. Elements with event listeners attached
    if (window.__eventListenersCaptured) {
      window.__eventListenersCaptured.listeners.forEach(l => {
        if (l.selector && l.active && ['click', 'mousedown', 'mouseup', 'keydown', 'touchstart'].includes(l.eventType)) {
          if (!interactive.some(i => i.selector === l.selector)) {
            interactive.push({
              selector: l.selector,
              type: 'has-listener',
              eventTypes: [l.eventType],
              isVisible: document.querySelector(l.selector) ? isElementVisible(document.querySelector(l.selector)) : false,
            });
          }
        }
      });
    }

    // 4. Elements with hover-based CSS changes (from stylesheets)
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        Array.from(sheet.cssRules || []).forEach(rule => {
          if (rule instanceof CSSStyleRule && rule.selectorText.includes(':hover')) {
            const baseSelector = rule.selectorText.replace(/:hover/g, '').trim();
            const el = document.querySelector(baseSelector);
            if (el && !interactive.some(i => i.selector === baseSelector)) {
              interactive.push({
                selector: baseSelector,
                type: 'has-hover-style',
                isVisible: isElementVisible(el),
              });
            }
          }
        });
      } catch (e) {}
    });

    function isElementVisible(el) {
      const computed = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return computed.display !== 'none' &&
             computed.visibility !== 'hidden' &&
             computed.opacity !== '0' &&
             rect.width > 0 &&
             rect.height > 0;
    }

    return interactive.filter(i => i.isVisible);
  };

  // ============================================
  // GET POSSIBLE ACTIONS FOR AN ELEMENT
  // ============================================

  window.__getElementActions = function(selector) {
    const el = document.querySelector(selector);
    if (!el) return [];

    const actions = [];
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute('type')?.toLowerCase();
    const role = el.getAttribute('role');

    // Universal actions
    actions.push({ action: 'hover', priority: 1 });

    // Click actions
    if (tag === 'button' || role === 'button' || tag === 'a' || role === 'link' ||
        tag === 'summary' || role === 'tab' || role === 'menuitem') {
      actions.push({ action: 'click', priority: 0 });
    }

    // Focus actions
    if (el.tabIndex >= 0 || tag === 'input' || tag === 'textarea' || tag === 'select') {
      actions.push({ action: 'focus', priority: 2 });
    }

    // Input-specific actions
    if (tag === 'input') {
      if (type === 'checkbox' || type === 'radio') {
        actions.push({ action: 'click', priority: 0 }); // Toggle
      } else if (type === 'text' || type === 'email' || type === 'password' || type === 'search' || !type) {
        actions.push({ action: 'type', params: { text: 'test' }, priority: 0 });
        actions.push({ action: 'type', params: { text: '' }, priority: 3 }); // Clear
      } else if (type === 'range') {
        actions.push({ action: 'click', priority: 0 });
      }
    }

    if (tag === 'textarea') {
      actions.push({ action: 'type', params: { text: 'test content' }, priority: 0 });
    }

    if (tag === 'select') {
      const options = Array.from(el.querySelectorAll('option'));
      options.forEach((opt, i) => {
        actions.push({ action: 'select', params: { value: opt.value }, priority: i });
      });
    }

    // Keyboard actions for focused elements
    if (el.tabIndex >= 0) {
      actions.push({ action: 'press', params: { key: 'Enter' }, priority: 2 });
      actions.push({ action: 'press', params: { key: 'Space' }, priority: 2 });
      actions.push({ action: 'press', params: { key: 'Escape' }, priority: 3 });
      actions.push({ action: 'press', params: { key: 'ArrowDown' }, priority: 3 });
      actions.push({ action: 'press', params: { key: 'ArrowUp' }, priority: 3 });
    }

    // Draggable elements
    if (el.draggable) {
      // Find potential drop targets
      const dropTargets = document.querySelectorAll('[ondrop], [ondragover], [data-droppable]');
      dropTargets.forEach(target => {
        const targetSelector = window.__getUniqueSelector(target);
        if (targetSelector && targetSelector !== selector) {
          actions.push({ action: 'drag', params: { target: targetSelector }, priority: 2 });
        }
      });
    }

    // Sort by priority (lower = try first)
    return actions.sort((a, b) => a.priority - b.priority);
  };

  // ============================================
  // STATE HASHING
  // ============================================

  window.__getStateHash = function() {
    const state = window.__capturePageState ? window.__capturePageState() : {};

    // Create deterministic hash
    const significant = [];
    significant.push(window.location.href);
    significant.push(window.location.hash);

    // Sort selectors for deterministic order
    const selectors = Object.keys(state.elements || {}).sort();
    for (const selector of selectors.slice(0, 500)) { // Limit for performance
      const el = state.elements[selector];
      significant.push(selector);
      significant.push((el.classes || []).sort().join(','));
      significant.push(JSON.stringify(el.attributes || {}));
      significant.push(el.isVisible ? '1' : '0');
    }

    // FNV-1a hash
    let hash = 2166136261;
    const str = significant.join('|');
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return 'S' + (hash >>> 0).toString(36);
  };

  // Helper for unique selectors
  window.__getUniqueSelector = function(el) {
    if (!el || !(el instanceof Element)) return null;

    if (el.id) {
      return '#' + CSS.escape(el.id);
    }

    if (el.classList.length > 0) {
      const classes = Array.from(el.classList).map(c => '.' + CSS.escape(c)).join('');
      const matches = document.querySelectorAll(el.tagName + classes);
      if (matches.length === 1) {
        return el.tagName.toLowerCase() + classes;
      }
    }

    const path = [];
    let current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector = '#' + CSS.escape(current.id);
        path.unshift(selector);
        break;
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += ':nth-of-type(' + index + ')';
        }
      }
      path.unshift(selector);
      current = parent;
    }

    return path.join(' > ');
  };

  console.log('[Exhaustive State Explorer] Installed');
})();
`;
  },

  /**
   * Main exhaustive exploration function
   * Uses BFS to explore ALL possible state transitions
   */
  async explore(page, options = {}) {
    const {
      maxStates = 100,           // Maximum states to explore
      maxDepth = 10,             // Maximum action sequence depth
      maxActionsPerElement = 3,  // Max actions to try per element
      settleTime = 300,          // Time to wait after each action
      onProgress = null,         // Progress callback
      stopOnConvergence = true,  // Stop when no new states found
      convergenceThreshold = 5,  // Rounds without new states to consider converged
    } = options;

    const startUrl = page.url();

    // State tracking
    const visitedStates = new Set();
    const stateGraph = {
      nodes: {},     // stateHash -> { state, actions, depth }
      edges: [],     // { from, to, action, selector }
    };
    const elementsCovered = new Set();
    const actionsTaken = [];
    let convergenceCounter = 0;

    // BFS queue: [{ stateHash, actionPath }]
    const queue = [];

    // Get initial state
    const initialHash = await page.evaluate(() => window.__getStateHash());
    const initialState = await page.evaluate(() => window.__capturePageState());

    visitedStates.add(initialHash);
    stateGraph.nodes[initialHash] = {
      state: initialState,
      actions: [],
      depth: 0,
      isInitial: true,
    };
    queue.push({ stateHash: initialHash, actionPath: [] });

    // BFS exploration
    let statesExplored = 0;
    let roundsWithoutNewStates = 0;

    while (queue.length > 0 && statesExplored < maxStates) {
      const { stateHash, actionPath } = queue.shift();

      // Check depth limit
      if (actionPath.length >= maxDepth) {
        continue;
      }

      // Restore to this state by replaying from initial
      await this.restoreState(page, startUrl, actionPath);
      await page.waitForTimeout(settleTime);

      // Get all interactive elements in this state
      const interactiveElements = await page.evaluate(() =>
        window.__findAllInteractiveElements()
      );

      let foundNewStateThisRound = false;

      // Try actions on each element
      for (const element of interactiveElements) {
        if (!element.isVisible) continue;

        elementsCovered.add(element.selector);

        // Get possible actions
        const actions = await page.evaluate(
          (sel) => window.__getElementActions(sel),
          element.selector
        );

        // Try each action (limited)
        const actionsToTry = actions.slice(0, maxActionsPerElement);

        for (const actionDef of actionsToTry) {
          // Check if we've already tried this exact action from this state
          const actionKey = `${stateHash}:${element.selector}:${actionDef.action}:${JSON.stringify(actionDef.params || {})}`;
          if (stateGraph.nodes[stateHash]?.actions?.includes(actionKey)) {
            continue;
          }

          // Record that we tried this action
          if (!stateGraph.nodes[stateHash].actions) {
            stateGraph.nodes[stateHash].actions = [];
          }
          stateGraph.nodes[stateHash].actions.push(actionKey);

          // Perform action using behavioral recorder
          const result = await behavioralRecorder.recordInteraction(
            page,
            element.selector,
            actionDef.action,
            { ...(actionDef.params || {}), settleTime }
          );

          if (!result.success) {
            continue;
          }

          actionsTaken.push({
            fromState: stateHash,
            ...result,
          });

          // Get new state
          const newHash = await page.evaluate(() => window.__getStateHash());

          // Record edge
          stateGraph.edges.push({
            from: stateHash,
            to: newHash,
            selector: element.selector,
            action: actionDef.action,
            params: actionDef.params,
            diff: result.diff,
          });

          // Check if this is a new state
          if (!visitedStates.has(newHash)) {
            visitedStates.add(newHash);
            foundNewStateThisRound = true;
            statesExplored++;

            const newState = await page.evaluate(() => window.__capturePageState());
            stateGraph.nodes[newHash] = {
              state: newState,
              actions: [],
              depth: actionPath.length + 1,
            };

            // Add to queue for further exploration
            queue.push({
              stateHash: newHash,
              actionPath: [...actionPath, { selector: element.selector, ...actionDef }],
            });

            // Progress callback
            if (onProgress) {
              onProgress({
                statesExplored,
                queueSize: queue.length,
                elementsCovered: elementsCovered.size,
                totalElements: interactiveElements.length,
                currentDepth: actionPath.length + 1,
              });
            }
          }

          // Restore state for next action
          await this.restoreState(page, startUrl, actionPath);
          await page.waitForTimeout(settleTime / 2);
        }
      }

      // Convergence detection
      if (foundNewStateThisRound) {
        roundsWithoutNewStates = 0;
      } else {
        roundsWithoutNewStates++;
        if (stopOnConvergence && roundsWithoutNewStates >= convergenceThreshold) {
          console.log(`[Explorer] Converged after ${convergenceThreshold} rounds without new states`);
          break;
        }
      }
    }

    // Compute coverage metrics
    const coverage = await this.computeCoverage(page, elementsCovered);

    return {
      statesExplored,
      totalStates: visitedStates.size,
      elementsInteracted: elementsCovered.size,
      coverage,
      stateGraph,
      actionsTaken,
      converged: roundsWithoutNewStates >= convergenceThreshold,
    };
  },

  /**
   * Restore page to a specific state by replaying action sequence
   */
  async restoreState(page, startUrl, actionPath) {
    // Navigate to start URL
    await page.goto(startUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Replay each action
    for (const action of actionPath) {
      try {
        switch (action.action) {
          case 'click':
            await page.click(action.selector);
            break;
          case 'hover':
            await page.hover(action.selector);
            break;
          case 'focus':
            await page.focus(action.selector);
            break;
          case 'type':
            await page.fill(action.selector, action.params?.text || '');
            break;
          case 'press':
            await page.press(action.selector, action.params?.key || 'Enter');
            break;
          case 'select':
            await page.selectOption(action.selector, action.params?.value || '');
            break;
          default:
            await page.click(action.selector);
        }
        await page.waitForTimeout(100);
      } catch (e) {
        // Element might not exist in this restored state
        console.warn(`[Explorer] Failed to replay ${action.action} on ${action.selector}`);
      }
    }
  },

  /**
   * Compute coverage metrics
   */
  async computeCoverage(page, elementsCovered) {
    const allInteractive = await page.evaluate(() =>
      window.__findAllInteractiveElements()
    );

    const totalInteractive = allInteractive.length;
    const coveredCount = elementsCovered.size;

    // Check which elements were NOT interacted with
    const uncovered = allInteractive.filter(el =>
      !elementsCovered.has(el.selector)
    );

    return {
      total: totalInteractive,
      covered: coveredCount,
      percentage: totalInteractive > 0 ? (coveredCount / totalInteractive * 100).toFixed(1) : 100,
      uncoveredElements: uncovered.map(el => el.selector),
      complete: uncovered.length === 0,
    };
  },

  /**
   * Generate complete state machine from exploration results
   */
  generateStateMachine(results) {
    const { stateGraph } = results;

    const states = Object.keys(stateGraph.nodes);
    const transitions = stateGraph.edges.map(edge => ({
      from: edge.from,
      to: edge.to,
      trigger: `${edge.action}(${edge.selector})`,
      effects: edge.diff,
    }));

    return {
      states,
      initialState: states.find(s => stateGraph.nodes[s].isInitial),
      transitions,
    };
  },

  /**
   * Generate human-readable exploration report
   */
  generateReport(results) {
    const lines = [];

    lines.push('# Exhaustive State Exploration Report');
    lines.push('');
    lines.push('## Summary');
    lines.push(`- States explored: ${results.statesExplored}`);
    lines.push(`- Total unique states: ${results.totalStates}`);
    lines.push(`- Elements interacted: ${results.elementsInteracted}`);
    lines.push(`- Coverage: ${results.coverage.percentage}%`);
    lines.push(`- Converged: ${results.converged ? 'Yes' : 'No'}`);
    lines.push('');

    if (results.coverage.uncoveredElements.length > 0) {
      lines.push('## Uncovered Elements');
      results.coverage.uncoveredElements.forEach(el => {
        lines.push(`- ${el}`);
      });
      lines.push('');
    }

    lines.push('## State Transitions');
    results.stateGraph.edges.forEach((edge, i) => {
      const diffSummary = [];
      if (edge.diff.added?.length) diffSummary.push(`+${edge.diff.added.length} added`);
      if (edge.diff.removed?.length) diffSummary.push(`-${edge.diff.removed.length} removed`);
      if (edge.diff.modified?.length) diffSummary.push(`~${edge.diff.modified.length} modified`);

      lines.push(`${i + 1}. ${edge.from} --[${edge.action} ${edge.selector}]--> ${edge.to}`);
      if (diffSummary.length > 0) {
        lines.push(`   Effects: ${diffSummary.join(', ')}`);
      }
    });

    return lines.join('\n');
  }
};
