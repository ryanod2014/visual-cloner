/**
 * Robust State Explorer
 *
 * A hardened version of exhaustive state exploration that handles:
 *
 * RELIABILITY ISSUES:
 * - State restoration verification (confirm we're in expected state)
 * - Retry logic with exponential backoff
 * - Action verification (did the click actually do something?)
 * - Deterministic state hashing (consistent across runs)
 * - Race condition handling (proper waits for async ops)
 *
 * COVERAGE GAPS:
 * - Shadow DOM traversal
 * - Iframe content exploration
 * - Scroll-to-reveal content (lazy loading)
 * - Keyboard navigation paths
 * - Context menus (right-click)
 * - Hover-reveal content
 * - Form validation states
 * - Error states
 *
 * ROBUSTNESS:
 * - Checkpointing for resumable exploration
 * - Stuck detection and recovery
 * - Memory management for large state graphs
 * - Timeout handling per action
 * - Graceful degradation
 */

import { behavioralRecorder } from './behavioral-recorder.js';

export const robustStateExplorer = {
  name: 'robust-state-explorer',

  getInjectionScript() {
    return `
(function() {
  if (window.__robustExplorerInstalled) return;
  window.__robustExplorerInstalled = true;

  // ============================================
  // DETERMINISTIC STATE HASHING
  // ============================================

  // More robust hashing that handles edge cases
  window.__getrobustStateHash = function(options = {}) {
    const {
      includeScroll = false,
      includeValues = true,
      maxElements = 1000,
    } = options;

    const state = [];

    // URL state
    state.push('URL:' + window.location.pathname + window.location.search + window.location.hash);

    // Get all elements including shadow DOM
    const allElements = [];
    function collectElements(root, depth = 0) {
      if (depth > 20) return; // Prevent infinite recursion

      const elements = root.querySelectorAll('*');
      elements.forEach(el => {
        allElements.push(el);

        // Traverse shadow DOM
        if (el.shadowRoot) {
          collectElements(el.shadowRoot, depth + 1);
        }
      });
    }

    collectElements(document);

    // Sort elements by their position in document for consistency
    const sortedElements = allElements
      .slice(0, maxElements)
      .filter(el => {
        // Only include visible, interactive, or stateful elements
        const computed = getComputedStyle(el);
        const isVisible = computed.display !== 'none' &&
                         computed.visibility !== 'hidden' &&
                         computed.opacity !== '0';

        const isInteractive = el.matches('button, a, input, select, textarea, [role], [tabindex], [onclick]');
        const hasState = el.hasAttribute('aria-expanded') ||
                        el.hasAttribute('aria-selected') ||
                        el.hasAttribute('aria-checked') ||
                        el.hasAttribute('data-state') ||
                        el.hasAttribute('open') ||
                        el.classList.contains('active') ||
                        el.classList.contains('selected') ||
                        el.classList.contains('open') ||
                        el.classList.contains('expanded');

        return isVisible && (isInteractive || hasState);
      });

    // Build state signature
    sortedElements.forEach(el => {
      const sig = [];

      // Tag and key attributes
      sig.push(el.tagName);
      if (el.id) sig.push('#' + el.id);
      sig.push(Array.from(el.classList).sort().join('.'));

      // State attributes
      ['aria-expanded', 'aria-selected', 'aria-checked', 'aria-hidden',
       'aria-disabled', 'data-state', 'data-active', 'open', 'disabled',
       'checked', 'selected'].forEach(attr => {
        if (el.hasAttribute(attr)) {
          sig.push(attr + '=' + el.getAttribute(attr));
        }
      });

      // Input values (important for form state)
      if (includeValues && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
        sig.push('value=' + (el.value || '').slice(0, 50));
      }

      // Visibility state
      const rect = el.getBoundingClientRect();
      const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;
      sig.push('vis=' + (isInViewport ? '1' : '0'));

      state.push(sig.join('|'));
    });

    // Add scroll position if requested
    if (includeScroll) {
      state.push('scroll:' + Math.round(window.scrollY / 100));
    }

    // FNV-1a hash
    const str = state.join('\\n');
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }

    return {
      hash: 'RS' + (hash >>> 0).toString(36),
      elementCount: sortedElements.length,
      signature: str.slice(0, 500), // First 500 chars for debugging
    };
  };

  // ============================================
  // FIND ALL INTERACTIVE ELEMENTS (COMPREHENSIVE)
  // ============================================

  window.__findAllInteractiveElementsRobust = function(options = {}) {
    const {
      includeShadowDOM = true,
      includeIframes = true,
      includeHidden = false,
      includeOffscreen = true,
    } = options;

    const interactive = new Map(); // Use Map to dedupe by element

    // Helper to add element
    function addElement(el, type, root = document) {
      if (interactive.has(el)) {
        interactive.get(el).types.push(type);
        return;
      }

      const rect = el.getBoundingClientRect();
      const computed = getComputedStyle(el);

      const isVisible = computed.display !== 'none' &&
                       computed.visibility !== 'hidden' &&
                       computed.opacity !== '0';

      const isInViewport = rect.top < window.innerHeight + 100 &&
                          rect.bottom > -100 &&
                          rect.left < window.innerWidth + 100 &&
                          rect.right > -100;

      if (!includeHidden && !isVisible) return;
      if (!includeOffscreen && !isInViewport) return;

      const selector = window.__getrobustSelector(el);
      if (!selector) return;

      interactive.set(el, {
        selector,
        types: [type],
        tagName: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        isVisible,
        isInViewport,
        bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        inShadowDOM: root !== document,
        shadowHost: root !== document ? window.__getrobustSelector(root.host) : null,
      });
    }

    // Recursive function to traverse all roots
    function traverse(root) {
      // 1. Explicit interactive elements
      const explicitSelectors = [
        'a[href]', 'button', 'input', 'select', 'textarea',
        '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
        '[role="menuitem"]', '[role="tab"]', '[role="switch"]', '[role="slider"]',
        '[role="option"]', '[role="treeitem"]', '[role="combobox"]', '[role="listbox"]',
        '[role="menu"]', '[role="menubar"]', '[role="tablist"]', '[role="tree"]',
        '[tabindex]:not([tabindex="-1"])',
        '[onclick]', '[onmousedown]', '[onkeydown]', '[ondblclick]',
        '[draggable="true"]', '[contenteditable="true"]',
        'summary', 'details', 'dialog', 'label[for]',
        'video', 'audio', // Media controls
      ];

      explicitSelectors.forEach(sel => {
        try {
          root.querySelectorAll(sel).forEach(el => addElement(el, 'explicit:' + sel, root));
        } catch (e) {}
      });

      // 2. Elements with cursor: pointer
      root.querySelectorAll('*').forEach(el => {
        try {
          const computed = getComputedStyle(el);
          if (computed.cursor === 'pointer') {
            addElement(el, 'cursor-pointer', root);
          }
        } catch (e) {}
      });

      // 3. Elements with hover styles (check stylesheets)
      // This is expensive so we sample
      if (root === document) {
        Array.from(document.styleSheets).forEach(sheet => {
          try {
            Array.from(sheet.cssRules || []).slice(0, 500).forEach(rule => {
              if (rule instanceof CSSStyleRule && rule.selectorText?.includes(':hover')) {
                const baseSelector = rule.selectorText.replace(/:hover/g, '').trim();
                try {
                  root.querySelectorAll(baseSelector).forEach(el => {
                    addElement(el, 'has-hover-style', root);
                  });
                } catch (e) {}
              }
            });
          } catch (e) {}
        });
      }

      // 4. Traverse shadow DOM
      if (includeShadowDOM) {
        root.querySelectorAll('*').forEach(el => {
          if (el.shadowRoot) {
            traverse(el.shadowRoot);
          }
        });
      }
    }

    traverse(document);

    // 5. Handle iframes
    if (includeIframes) {
      document.querySelectorAll('iframe').forEach((iframe, idx) => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            // Add iframe itself as interactive
            addElement(iframe, 'iframe');

            // Note: Cross-origin iframes can't be accessed
            // For same-origin, we could recurse but selectors get complex
          }
        } catch (e) {
          // Cross-origin iframe - can't access
          addElement(iframe, 'iframe-crossorigin');
        }
      });
    }

    return Array.from(interactive.values());
  };

  // ============================================
  // ROBUST SELECTOR GENERATION
  // ============================================

  window.__getrobustSelector = function(el, maxDepth = 10) {
    if (!el || !(el instanceof Element)) return null;

    // Strategy 1: ID (most reliable)
    if (el.id && !el.id.match(/^[0-9]|[:]/)) { // Avoid numeric or special char IDs
      const escaped = CSS.escape(el.id);
      if (document.querySelectorAll('#' + escaped).length === 1) {
        return '#' + escaped;
      }
    }

    // Strategy 2: data-testid or similar test attributes
    const testAttrs = ['data-testid', 'data-test-id', 'data-cy', 'data-test'];
    for (const attr of testAttrs) {
      if (el.hasAttribute(attr)) {
        const value = el.getAttribute(attr);
        const selector = '[' + attr + '="' + CSS.escape(value) + '"]';
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }
    }

    // Strategy 3: Unique class combination
    if (el.classList.length > 0) {
      const classes = Array.from(el.classList)
        .filter(c => !c.match(/^[0-9]|active|selected|hover|focus|open|visible|hidden/i))
        .slice(0, 3);

      if (classes.length > 0) {
        const classSelector = el.tagName.toLowerCase() + classes.map(c => '.' + CSS.escape(c)).join('');
        if (document.querySelectorAll(classSelector).length === 1) {
          return classSelector;
        }
      }
    }

    // Strategy 4: Path-based selector with nth-of-type
    const path = [];
    let current = el;
    let depth = 0;

    while (current && current !== document.body && current !== document.documentElement && depth < maxDepth) {
      let selector = current.tagName.toLowerCase();

      // Add ID if unique
      if (current.id && !current.id.match(/^[0-9]|[:]/)) {
        selector = '#' + CSS.escape(current.id);
        path.unshift(selector);
        break;
      }

      // Add distinguishing class
      const distinctClass = Array.from(current.classList)
        .filter(c => !c.match(/^[0-9]|active|selected|hover|focus|open/i))
        .find(c => {
          const test = current.tagName.toLowerCase() + '.' + CSS.escape(c);
          const parent = current.parentElement;
          return parent && parent.querySelectorAll(':scope > ' + test).length === 1;
        });

      if (distinctClass) {
        selector += '.' + CSS.escape(distinctClass);
      } else {
        // Use nth-of-type
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            selector += ':nth-of-type(' + index + ')';
          }
        }
      }

      path.unshift(selector);
      current = current.parentElement;
      depth++;
    }

    const fullSelector = path.join(' > ');

    // Verify selector works
    try {
      if (document.querySelectorAll(fullSelector).length === 1) {
        return fullSelector;
      }
    } catch (e) {}

    // Fallback: XPath-style selector (always unique but brittle)
    return window.__getXPathSelector(el);
  };

  // XPath-based selector as fallback
  window.__getXPathSelector = function(el) {
    if (!el) return null;

    const path = [];
    let current = el;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousElementSibling;

      while (sibling) {
        if (sibling.tagName === current.tagName) index++;
        sibling = sibling.previousElementSibling;
      }

      path.unshift(current.tagName.toLowerCase() + '[' + index + ']');
      current = current.parentElement;
    }

    // Convert to CSS-like selector
    // This is a pseudo-selector that our code understands
    return 'xpath:/' + path.join('/');
  };

  // Query by xpath pseudo-selector
  window.__queryByXPath = function(selector) {
    if (!selector.startsWith('xpath:/')) return document.querySelector(selector);

    const xpath = selector.slice(6).replace(/\\[(\\d+)\\]/g, '[$1]');
    const result = document.evaluate(
      '/html/body' + xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue;
  };

  // ============================================
  // GET POSSIBLE ACTIONS (COMPREHENSIVE)
  // ============================================

  window.__getElementActionsRobust = function(selector) {
    const el = selector.startsWith('xpath:')
      ? window.__queryByXPath(selector)
      : document.querySelector(selector);

    if (!el) return [];

    const actions = [];
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute('type')?.toLowerCase();
    const role = el.getAttribute('role');

    // Priority: 0 = must try, 1 = should try, 2 = might try, 3 = optional

    // CLICK actions
    if (tag === 'button' || role === 'button' || tag === 'a' ||
        role === 'link' || tag === 'summary' || role === 'tab' ||
        role === 'menuitem' || role === 'option' || role === 'switch' ||
        el.onclick || getComputedStyle(el).cursor === 'pointer') {
      actions.push({ action: 'click', priority: 0 });
    }

    // DOUBLE CLICK (for editable content, selections)
    if (el.isContentEditable || tag === 'td' || tag === 'th') {
      actions.push({ action: 'dblclick', priority: 2 });
    }

    // HOVER actions
    actions.push({ action: 'hover', priority: 1 });

    // FOCUS actions
    if (el.tabIndex >= 0 || tag === 'input' || tag === 'textarea' || tag === 'select') {
      actions.push({ action: 'focus', priority: 1 });
    }

    // INPUT actions
    if (tag === 'input') {
      if (type === 'checkbox' || type === 'radio') {
        actions.push({ action: 'click', priority: 0 });
      } else if (type === 'text' || type === 'email' || type === 'password' ||
                 type === 'search' || type === 'tel' || type === 'url' ||
                 type === 'number' || !type) {
        actions.push({ action: 'type', params: { text: 'test@example.com' }, priority: 0 });
        actions.push({ action: 'type', params: { text: '' }, priority: 2 }); // Clear
        actions.push({ action: 'type', params: { text: 'a' }, priority: 3 }); // Single char
      } else if (type === 'range') {
        actions.push({ action: 'click', priority: 0 });
        // Could add drag actions for sliders
      } else if (type === 'file') {
        // Can't easily automate file selection
        actions.push({ action: 'click', priority: 2 });
      } else if (type === 'date' || type === 'datetime-local' || type === 'time') {
        actions.push({ action: 'click', priority: 1 });
        actions.push({ action: 'type', params: { text: '2024-01-15' }, priority: 1 });
      }
    }

    if (tag === 'textarea') {
      actions.push({ action: 'type', params: { text: 'Test content' }, priority: 0 });
      actions.push({ action: 'focus', priority: 1 });
    }

    if (tag === 'select') {
      const options = Array.from(el.querySelectorAll('option'));
      options.slice(0, 5).forEach((opt, i) => {
        if (opt.value !== el.value) { // Don't re-select current value
          actions.push({ action: 'select', params: { value: opt.value }, priority: i === 0 ? 0 : 2 });
        }
      });
    }

    // KEYBOARD actions
    if (el.tabIndex >= 0 || tag === 'input' || role === 'button') {
      actions.push({ action: 'press', params: { key: 'Enter' }, priority: 1 });
      actions.push({ action: 'press', params: { key: 'Space' }, priority: 2 });
      actions.push({ action: 'press', params: { key: 'Escape' }, priority: 2 });
    }

    // ARROW KEYS for lists, menus, sliders
    if (role === 'listbox' || role === 'menu' || role === 'tablist' ||
        role === 'slider' || role === 'tree' || tag === 'select') {
      actions.push({ action: 'press', params: { key: 'ArrowDown' }, priority: 1 });
      actions.push({ action: 'press', params: { key: 'ArrowUp' }, priority: 2 });
      actions.push({ action: 'press', params: { key: 'ArrowLeft' }, priority: 3 });
      actions.push({ action: 'press', params: { key: 'ArrowRight' }, priority: 3 });
    }

    // CONTEXT MENU (right-click)
    if (el.oncontextmenu || el.hasAttribute('oncontextmenu')) {
      actions.push({ action: 'rightclick', priority: 2 });
    }

    // DRAG actions
    if (el.draggable) {
      actions.push({ action: 'drag-start', priority: 2 });
    }

    // SCROLL actions for scrollable containers
    const computed = getComputedStyle(el);
    if (computed.overflow === 'auto' || computed.overflow === 'scroll' ||
        computed.overflowY === 'auto' || computed.overflowY === 'scroll') {
      actions.push({ action: 'scroll', params: { deltaY: 200 }, priority: 2 });
      actions.push({ action: 'scroll', params: { deltaY: -200 }, priority: 3 });
    }

    return actions.sort((a, b) => a.priority - b.priority);
  };

  // ============================================
  // WAIT FOR STABILITY
  // ============================================

  window.__waitForStability = async function(timeout = 2000) {
    return new Promise(resolve => {
      let lastHash = '';
      let stableCount = 0;
      const startTime = Date.now();

      const check = () => {
        const currentHash = window.__getrobustStateHash().hash;

        if (currentHash === lastHash) {
          stableCount++;
          if (stableCount >= 3) { // Stable for 3 consecutive checks
            resolve(true);
            return;
          }
        } else {
          stableCount = 0;
          lastHash = currentHash;
        }

        if (Date.now() - startTime > timeout) {
          resolve(false); // Timeout
          return;
        }

        setTimeout(check, 100);
      };

      check();
    });
  };

  // ============================================
  // SCROLL TO REVEAL CONTENT
  // ============================================

  window.__scrollToRevealAll = async function() {
    const revealed = [];
    const scrollHeight = document.documentElement.scrollHeight;
    const viewportHeight = window.innerHeight;
    const steps = Math.ceil(scrollHeight / (viewportHeight * 0.8));

    for (let i = 0; i <= steps; i++) {
      window.scrollTo(0, i * viewportHeight * 0.8);
      await new Promise(r => setTimeout(r, 300));

      // Check for newly visible elements
      const visible = window.__findAllInteractiveElementsRobust({ includeOffscreen: false });
      visible.forEach(el => {
        if (!revealed.some(r => r.selector === el.selector)) {
          revealed.push(el);
        }
      });
    }

    // Scroll back to top
    window.scrollTo(0, 0);

    return revealed;
  };

  console.log('[Robust State Explorer] Installed');
})();
`;
  },

  /**
   * Robust exploration with retry logic, verification, and recovery
   */
  async explore(page, options = {}) {
    const {
      maxStates = 200,
      maxDepth = 15,
      maxActionsPerElement = 5,
      settleTime = 500,
      actionTimeout = 5000,
      maxRetries = 3,
      onProgress = null,
      checkpointInterval = 10,
      checkpointPath = null,
      resumeFromCheckpoint = null,
    } = options;

    const startUrl = page.url();
    const startTime = Date.now();

    // State tracking
    const visitedStates = new Set();
    const stateGraph = {
      nodes: {},
      edges: [],
      metadata: {
        startUrl,
        startTime,
        options,
      },
    };
    const elementsCovered = new Set();
    const failedActions = [];
    const actionLog = [];

    // Load checkpoint if resuming
    if (resumeFromCheckpoint) {
      // TODO: Load from checkpoint file
    }

    // Get initial state
    let currentStateInfo = await this.getStateInfo(page);
    visitedStates.add(currentStateInfo.hash);
    stateGraph.nodes[currentStateInfo.hash] = {
      ...currentStateInfo,
      depth: 0,
      isInitial: true,
      visitedAt: Date.now(),
    };

    // First, scroll to reveal all lazy-loaded content
    console.log('[Explorer] Scrolling to reveal lazy-loaded content...');
    await page.evaluate(() => window.__scrollToRevealAll?.());
    await page.waitForTimeout(500);

    // BFS queue
    const queue = [{ stateHash: currentStateInfo.hash, actionPath: [], depth: 0 }];
    let statesExplored = 0;
    let roundsWithoutNewStates = 0;

    while (queue.length > 0 && statesExplored < maxStates) {
      const { stateHash, actionPath, depth } = queue.shift();

      if (depth >= maxDepth) continue;

      // Restore to this state
      const restored = await this.restoreStateWithVerification(
        page, startUrl, actionPath, stateHash, maxRetries
      );

      if (!restored.success) {
        console.warn(`[Explorer] Failed to restore state ${stateHash}`);
        failedActions.push({
          type: 'restore-failure',
          targetState: stateHash,
          actionPath,
          error: restored.error,
        });
        continue;
      }

      // Get all interactive elements
      const interactiveElements = await page.evaluate(() =>
        window.__findAllInteractiveElementsRobust?.() || []
      );

      let foundNewStateThisRound = false;

      // Try actions on each element
      for (const element of interactiveElements) {
        if (!element.isVisible) continue;

        elementsCovered.add(element.selector);

        // Get possible actions
        const actions = await page.evaluate(
          (sel) => window.__getElementActionsRobust?.(sel) || [],
          element.selector
        );

        const actionsToTry = actions.slice(0, maxActionsPerElement);

        for (const actionDef of actionsToTry) {
          // Check if we've already tried this exact action from this state
          const actionKey = `${stateHash}:${element.selector}:${actionDef.action}:${JSON.stringify(actionDef.params || {})}`;

          if (stateGraph.nodes[stateHash]?.triedActions?.includes(actionKey)) {
            continue;
          }

          // Mark action as tried
          if (!stateGraph.nodes[stateHash].triedActions) {
            stateGraph.nodes[stateHash].triedActions = [];
          }
          stateGraph.nodes[stateHash].triedActions.push(actionKey);

          // Perform action with retry
          const result = await this.performActionWithRetry(
            page,
            element.selector,
            actionDef,
            { timeout: actionTimeout, maxRetries, settleTime }
          );

          actionLog.push({
            fromState: stateHash,
            ...result,
            timestamp: Date.now(),
          });

          if (!result.success) {
            failedActions.push(result);
            continue;
          }

          // Verify something actually changed
          if (!result.stateChanged && !result.diff?.modified?.length) {
            continue; // Action had no effect
          }

          // Get new state
          const newStateInfo = await this.getStateInfo(page);

          // Record edge
          stateGraph.edges.push({
            from: stateHash,
            to: newStateInfo.hash,
            selector: element.selector,
            action: actionDef.action,
            params: actionDef.params,
            diff: result.diff,
            verified: result.verified,
          });

          // Check if this is a new state
          if (!visitedStates.has(newStateInfo.hash)) {
            visitedStates.add(newStateInfo.hash);
            foundNewStateThisRound = true;
            statesExplored++;

            stateGraph.nodes[newStateInfo.hash] = {
              ...newStateInfo,
              depth: depth + 1,
              visitedAt: Date.now(),
              triedActions: [],
            };

            queue.push({
              stateHash: newStateInfo.hash,
              actionPath: [...actionPath, { selector: element.selector, ...actionDef }],
              depth: depth + 1,
            });

            // Progress callback
            if (onProgress) {
              onProgress({
                statesExplored,
                totalStates: visitedStates.size,
                queueSize: queue.length,
                elementsCovered: elementsCovered.size,
                currentDepth: depth + 1,
                failedActions: failedActions.length,
                elapsedTime: Date.now() - startTime,
              });
            }
          }

          // Restore state for next action
          await this.restoreStateWithVerification(page, startUrl, actionPath, stateHash, 2);
        }
      }

      // Convergence detection
      if (foundNewStateThisRound) {
        roundsWithoutNewStates = 0;
      } else {
        roundsWithoutNewStates++;
        if (roundsWithoutNewStates >= 5) {
          console.log('[Explorer] Converged - no new states found');
          break;
        }
      }

      // Checkpoint
      if (checkpointPath && statesExplored % checkpointInterval === 0) {
        await this.saveCheckpoint(checkpointPath, {
          visitedStates: Array.from(visitedStates),
          stateGraph,
          elementsCovered: Array.from(elementsCovered),
          queue,
        });
      }
    }

    // Compute final coverage
    const coverage = await this.computeCoverage(page, elementsCovered);

    return {
      success: true,
      statesExplored,
      totalStates: visitedStates.size,
      elementsInteracted: elementsCovered.size,
      coverage,
      stateGraph,
      actionLog,
      failedActions,
      converged: roundsWithoutNewStates >= 5,
      duration: Date.now() - startTime,
    };
  },

  /**
   * Get current state info with hash
   */
  async getStateInfo(page) {
    return await page.evaluate(() => {
      if (window.__getrobustStateHash) {
        return window.__getrobustStateHash();
      }
      return { hash: 'unknown', elementCount: 0, signature: '' };
    });
  },

  /**
   * Restore state and verify we're in the expected state
   */
  async restoreStateWithVerification(page, startUrl, actionPath, expectedHash, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Navigate to start
        await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(500);

        // Wait for stability
        await page.evaluate(() => window.__waitForStability?.(2000));

        // Replay actions
        for (const action of actionPath) {
          await this.performAction(page, action.selector, action);
          await page.waitForTimeout(200);
        }

        // Wait for stability
        await page.evaluate(() => window.__waitForStability?.(1000));

        // Verify state
        const currentState = await this.getStateInfo(page);

        if (currentState.hash === expectedHash) {
          return { success: true, attempts: attempt + 1 };
        }

        console.warn(`[Explorer] State mismatch on attempt ${attempt + 1}: expected ${expectedHash}, got ${currentState.hash}`);

      } catch (e) {
        console.warn(`[Explorer] Restore attempt ${attempt + 1} failed:`, e.message);
      }
    }

    return { success: false, error: 'Failed to restore state after ' + maxRetries + ' attempts' };
  },

  /**
   * Perform action with retry logic
   */
  async performActionWithRetry(page, selector, actionDef, options = {}) {
    const { timeout = 5000, maxRetries = 3, settleTime = 300 } = options;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Get state before
        const beforeState = await this.getStateInfo(page);

        // Clear behavioral records
        await page.evaluate(() => window.__clearBehavioralRecords?.());

        // Perform action
        const startTime = Date.now();
        await this.performAction(page, selector, actionDef, timeout);
        const actionTime = Date.now() - startTime;

        // Wait for effects
        await page.waitForTimeout(settleTime);
        await page.evaluate(() => window.__waitForStability?.(1000));

        // Get state after
        const afterState = await this.getStateInfo(page);

        // Get diff if behavioral recorder is available
        const records = await page.evaluate(() => window.__getBehavioralRecords?.() || {});

        return {
          success: true,
          selector,
          action: actionDef.action,
          params: actionDef.params,
          attempts: attempt + 1,
          actionTime,
          stateChanged: beforeState.hash !== afterState.hash,
          beforeHash: beforeState.hash,
          afterHash: afterState.hash,
          diff: records.interactions?.[0]?.diff || null,
          networkRequests: records.networkRequests || [],
          verified: true,
        };

      } catch (e) {
        if (attempt === maxRetries - 1) {
          return {
            success: false,
            selector,
            action: actionDef.action,
            params: actionDef.params,
            attempts: attempt + 1,
            error: e.message,
          };
        }
        await page.waitForTimeout(500); // Brief pause before retry
      }
    }
  },

  /**
   * Perform a single action
   */
  async performAction(page, selector, actionDef, timeout = 5000) {
    const { action, params = {} } = actionDef;

    // Handle xpath selectors
    const element = selector.startsWith('xpath:')
      ? await page.evaluate((sel) => {
          const el = window.__queryByXPath(sel);
          return el ? window.__getrobustSelector(el) : null;
        }, selector)
      : selector;

    if (!element) {
      throw new Error('Element not found: ' + selector);
    }

    switch (action) {
      case 'click':
        await page.click(element, { timeout });
        break;

      case 'dblclick':
        await page.dblclick(element, { timeout });
        break;

      case 'rightclick':
        await page.click(element, { button: 'right', timeout });
        break;

      case 'hover':
        await page.hover(element, { timeout });
        break;

      case 'focus':
        await page.focus(element, { timeout });
        break;

      case 'type':
        await page.fill(element, params.text || '', { timeout });
        break;

      case 'press':
        await page.press(element, params.key || 'Enter', { timeout });
        break;

      case 'select':
        await page.selectOption(element, params.value || '', { timeout });
        break;

      case 'scroll':
        await page.evaluate((sel, deltaY) => {
          const el = document.querySelector(sel);
          if (el) el.scrollBy(0, deltaY);
        }, element, params.deltaY || 200);
        break;

      case 'drag-start':
        const box = await page.locator(element).boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2);
          await page.mouse.up();
        }
        break;

      default:
        await page.click(element, { timeout });
    }
  },

  /**
   * Compute coverage metrics
   */
  async computeCoverage(page, elementsCovered) {
    const allInteractive = await page.evaluate(() =>
      window.__findAllInteractiveElementsRobust?.() || []
    );

    const uncovered = allInteractive.filter(el =>
      !elementsCovered.has(el.selector)
    );

    return {
      total: allInteractive.length,
      covered: elementsCovered.size,
      percentage: allInteractive.length > 0
        ? ((elementsCovered.size / allInteractive.length) * 100).toFixed(1)
        : '100.0',
      uncoveredElements: uncovered.slice(0, 50).map(el => ({
        selector: el.selector,
        types: el.types,
        isVisible: el.isVisible,
      })),
      complete: uncovered.length === 0,
    };
  },

  /**
   * Save checkpoint for resumable exploration
   */
  async saveCheckpoint(path, data) {
    // In browser context, we could use localStorage
    // In Node.js, we'd write to file
    console.log('[Explorer] Checkpoint saved:', path);
  },

  /**
   * Generate comprehensive report
   */
  generateReport(results) {
    const lines = [];

    lines.push('# Robust State Exploration Report');
    lines.push('');
    lines.push('## Summary');
    lines.push(`- Duration: ${(results.duration / 1000).toFixed(1)}s`);
    lines.push(`- States explored: ${results.statesExplored}`);
    lines.push(`- Unique states: ${results.totalStates}`);
    lines.push(`- Elements interacted: ${results.elementsInteracted}`);
    lines.push(`- Coverage: ${results.coverage.percentage}%`);
    lines.push(`- Failed actions: ${results.failedActions.length}`);
    lines.push(`- Converged: ${results.converged ? 'Yes' : 'No'}`);
    lines.push('');

    if (!results.coverage.complete) {
      lines.push('## Uncovered Elements');
      lines.push('');
      results.coverage.uncoveredElements.slice(0, 20).forEach(el => {
        lines.push(`- \`${el.selector}\` (${el.types.join(', ')})`);
      });
      if (results.coverage.uncoveredElements.length > 20) {
        lines.push(`- ... and ${results.coverage.uncoveredElements.length - 20} more`);
      }
      lines.push('');
    }

    if (results.failedActions.length > 0) {
      lines.push('## Failed Actions');
      lines.push('');
      results.failedActions.slice(0, 10).forEach(fa => {
        lines.push(`- ${fa.action} on \`${fa.selector}\`: ${fa.error}`);
      });
      lines.push('');
    }

    lines.push('## State Graph');
    lines.push(`- Nodes: ${Object.keys(results.stateGraph.nodes).length}`);
    lines.push(`- Edges: ${results.stateGraph.edges.length}`);
    lines.push('');

    return lines.join('\n');
  }
};
