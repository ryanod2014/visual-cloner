/**
 * Behavioral Recorder
 *
 * Captures EXACT behavior when interactions happen:
 * - What DOM changes occur (added, removed, modified elements)
 * - What classes are toggled
 * - What styles change
 * - What attributes change
 * - What visibility changes occur
 * - What new elements appear
 * - Network requests triggered
 *
 * This is the "before/after diff" system that knows exactly what clicking does.
 */

export const behavioralRecorder = {
  name: 'behavioral-recorder',

  getInjectionScript() {
    return `
(function() {
  if (window.__behavioralRecorderInstalled) return;
  window.__behavioralRecorderInstalled = true;

  window.__behavioralRecords = {
    interactions: [],
    networkRequests: [],
    consoleMessages: [],
    mutations: [],
  };

  // Properties to track in state snapshots
  const TRACKED_STYLE_PROPS = [
    'display', 'visibility', 'opacity', 'transform', 'width', 'height',
    'backgroundColor', 'color', 'borderColor', 'boxShadow', 'position',
    'top', 'left', 'right', 'bottom', 'zIndex', 'overflow', 'pointerEvents',
  ];

  // Generate unique selector
  function getUniqueSelector(el) {
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
  }

  // Capture full page state
  window.__capturePageState = function() {
    const state = {
      elements: {},
      documentTitle: document.title,
      url: window.location.href,
      hash: window.location.hash,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      timestamp: Date.now(),
    };

    // Capture all visible elements and their key properties
    const allElements = document.querySelectorAll('*');
    allElements.forEach(el => {
      const selector = getUniqueSelector(el);
      if (!selector) return;

      const computed = getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      // Skip invisible elements that are far outside viewport
      if (rect.width === 0 && rect.height === 0) return;

      const styles = {};
      TRACKED_STYLE_PROPS.forEach(prop => {
        styles[prop] = computed[prop];
      });

      // Get important attributes
      const attrs = {};
      ['class', 'disabled', 'aria-expanded', 'aria-hidden', 'aria-selected', 'aria-checked',
       'data-state', 'data-active', 'data-selected', 'data-open', 'data-closed',
       'hidden', 'open', 'checked', 'selected', 'value', 'href', 'src'].forEach(attr => {
        if (el.hasAttribute(attr)) {
          attrs[attr] = el.getAttribute(attr);
        }
      });

      state.elements[selector] = {
        tagName: el.tagName.toLowerCase(),
        classes: Array.from(el.classList),
        attributes: attrs,
        styles,
        bounds: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        textContent: el.textContent?.slice(0, 100) || '',
        isVisible: computed.display !== 'none' &&
                   computed.visibility !== 'hidden' &&
                   computed.opacity !== '0',
      };
    });

    return state;
  };

  // Diff two states
  window.__diffPageStates = function(before, after) {
    const diff = {
      added: [],
      removed: [],
      modified: [],
      navigation: null,
      scroll: null,
    };

    // Check navigation changes
    if (before.url !== after.url || before.hash !== after.hash) {
      diff.navigation = {
        from: { url: before.url, hash: before.hash },
        to: { url: after.url, hash: after.hash },
      };
    }

    // Check scroll changes
    if (before.scrollX !== after.scrollX || before.scrollY !== after.scrollY) {
      diff.scroll = {
        from: { x: before.scrollX, y: before.scrollY },
        to: { x: after.scrollX, y: after.scrollY },
      };
    }

    // Find added elements
    for (const selector of Object.keys(after.elements)) {
      if (!before.elements[selector]) {
        diff.added.push({
          selector,
          element: after.elements[selector],
        });
      }
    }

    // Find removed elements
    for (const selector of Object.keys(before.elements)) {
      if (!after.elements[selector]) {
        diff.removed.push({
          selector,
          element: before.elements[selector],
        });
      }
    }

    // Find modified elements
    for (const selector of Object.keys(before.elements)) {
      if (!after.elements[selector]) continue;

      const beforeEl = before.elements[selector];
      const afterEl = after.elements[selector];
      const changes = {};

      // Check classes
      const addedClasses = afterEl.classes.filter(c => !beforeEl.classes.includes(c));
      const removedClasses = beforeEl.classes.filter(c => !afterEl.classes.includes(c));
      if (addedClasses.length || removedClasses.length) {
        changes.classes = { added: addedClasses, removed: removedClasses };
      }

      // Check attributes
      const attrChanges = {};
      const allAttrs = new Set([...Object.keys(beforeEl.attributes), ...Object.keys(afterEl.attributes)]);
      for (const attr of allAttrs) {
        if (beforeEl.attributes[attr] !== afterEl.attributes[attr]) {
          attrChanges[attr] = { from: beforeEl.attributes[attr], to: afterEl.attributes[attr] };
        }
      }
      if (Object.keys(attrChanges).length > 0) {
        changes.attributes = attrChanges;
      }

      // Check styles
      const styleChanges = {};
      for (const prop of TRACKED_STYLE_PROPS) {
        if (beforeEl.styles[prop] !== afterEl.styles[prop]) {
          styleChanges[prop] = { from: beforeEl.styles[prop], to: afterEl.styles[prop] };
        }
      }
      if (Object.keys(styleChanges).length > 0) {
        changes.styles = styleChanges;
      }

      // Check visibility
      if (beforeEl.isVisible !== afterEl.isVisible) {
        changes.visibility = { from: beforeEl.isVisible, to: afterEl.isVisible };
      }

      // Check bounds (element moved/resized)
      if (beforeEl.bounds.width !== afterEl.bounds.width ||
          beforeEl.bounds.height !== afterEl.bounds.height ||
          Math.abs(beforeEl.bounds.x - afterEl.bounds.x) > 1 ||
          Math.abs(beforeEl.bounds.y - afterEl.bounds.y) > 1) {
        changes.bounds = { from: beforeEl.bounds, to: afterEl.bounds };
      }

      // Check text content
      if (beforeEl.textContent !== afterEl.textContent) {
        changes.textContent = { from: beforeEl.textContent, to: afterEl.textContent };
      }

      if (Object.keys(changes).length > 0) {
        diff.modified.push({ selector, changes });
      }
    }

    return diff;
  };

  // Generate a hash of page state for comparison
  window.__hashPageState = function(state) {
    const significant = [];

    // Hash URL and scroll position
    significant.push(state.url);
    significant.push(state.hash);

    // Hash element states (sort for consistency)
    const selectors = Object.keys(state.elements).sort();
    for (const selector of selectors) {
      const el = state.elements[selector];
      significant.push(selector);
      significant.push(el.classes.sort().join(','));
      significant.push(JSON.stringify(el.attributes));
      significant.push(el.isVisible ? '1' : '0');
    }

    // Simple hash function
    const str = significant.join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return 'state_' + Math.abs(hash).toString(36);
  };

  // Track network requests
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    const method = args[1]?.method || 'GET';

    window.__behavioralRecords.networkRequests.push({
      type: 'fetch',
      url,
      method,
      timestamp: Date.now(),
    });

    return originalFetch.apply(this, args);
  };

  const originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__capturedMethod = method;
    this.__capturedUrl = url;
    return originalXHROpen.apply(this, arguments);
  };

  const originalXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
    window.__behavioralRecords.networkRequests.push({
      type: 'xhr',
      url: this.__capturedUrl,
      method: this.__capturedMethod,
      timestamp: Date.now(),
    });
    return originalXHRSend.apply(this, arguments);
  };

  // Track console messages
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  function wrapConsole(original, level) {
    return function(...args) {
      window.__behavioralRecords.consoleMessages.push({
        level,
        message: args.map(a => String(a)).join(' ').slice(0, 500),
        timestamp: Date.now(),
      });
      return original.apply(this, args);
    };
  }

  console.log = wrapConsole(originalConsoleLog, 'log');
  console.error = wrapConsole(originalConsoleError, 'error');
  console.warn = wrapConsole(originalConsoleWarn, 'warn');

  // Get all recorded data
  window.__getBehavioralRecords = function() {
    return window.__behavioralRecords;
  };

  // Clear records for fresh recording
  window.__clearBehavioralRecords = function() {
    window.__behavioralRecords = {
      interactions: [],
      networkRequests: [],
      consoleMessages: [],
      mutations: [],
    };
  };

  console.log('[Behavioral Recorder] Installed');
})();
`;
  },

  // Record a single interaction and its effects
  async recordInteraction(page, selector, action, actionParams = {}) {
    // Clear network/console buffers
    await page.evaluate(() => {
      window.__behavioralRecords.networkRequests = [];
      window.__behavioralRecords.consoleMessages = [];
    });

    // Capture before state
    const before = await page.evaluate(() => window.__capturePageState());
    const beforeHash = await page.evaluate((s) => window.__hashPageState(s), before);

    // Track timing
    const startTime = Date.now();

    // Perform action
    try {
      switch (action) {
        case 'click':
          await page.click(selector);
          break;

        case 'dblclick':
          await page.dblclick(selector);
          break;

        case 'hover':
          await page.hover(selector);
          break;

        case 'focus':
          await page.focus(selector);
          break;

        case 'type':
          await page.fill(selector, actionParams.text || '');
          break;

        case 'press':
          await page.press(selector, actionParams.key || 'Enter');
          break;

        case 'select':
          await page.selectOption(selector, actionParams.value || '');
          break;

        case 'check':
          await page.check(selector);
          break;

        case 'uncheck':
          await page.uncheck(selector);
          break;

        case 'drag':
          await page.dragAndDrop(selector, actionParams.target);
          break;

        case 'scroll':
          await page.evaluate((sel, amt) => {
            const el = document.querySelector(sel);
            if (el) el.scrollBy(0, amt);
          }, selector, actionParams.amount || 100);
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (e) {
      return {
        success: false,
        error: e.message,
        selector,
        action,
      };
    }

    // Wait for effects to settle
    await page.waitForTimeout(actionParams.settleTime || 300);

    // Capture after state
    const after = await page.evaluate(() => window.__capturePageState());
    const afterHash = await page.evaluate((s) => window.__hashPageState(s), after);

    // Compute diff
    const diff = await page.evaluate(
      (b, a) => window.__diffPageStates(b, a),
      before, after
    );

    // Get triggered network requests and console messages
    const records = await page.evaluate(() => window.__getBehavioralRecords());

    const duration = Date.now() - startTime;

    return {
      success: true,
      selector,
      action,
      actionParams,
      timestamp: Date.now(),
      duration,
      stateChange: {
        from: beforeHash,
        to: afterHash,
        changed: beforeHash !== afterHash,
      },
      diff,
      networkRequests: records.networkRequests,
      consoleMessages: records.consoleMessages,
    };
  },

  // Record sequence of interactions
  async recordSequence(page, interactions) {
    const results = [];

    for (const interaction of interactions) {
      const result = await this.recordInteraction(
        page,
        interaction.selector,
        interaction.action,
        interaction.params
      );
      results.push(result);

      // If this interaction failed, we might want to stop
      if (!result.success && interaction.stopOnFailure) {
        break;
      }
    }

    return results;
  },

  async extractData(page) {
    return await page.evaluate(() => {
      if (window.__getBehavioralRecords) {
        return window.__getBehavioralRecords();
      }
      return { interactions: [], networkRequests: [], consoleMessages: [], mutations: [] };
    });
  },

  // Generate replay code from recorded interactions
  generateReplayCode(interactions) {
    const lines = [];
    lines.push('// Auto-generated interaction replay');
    lines.push('async function replayInteractions() {');

    for (const interaction of interactions) {
      if (!interaction.success) continue;

      const { selector, action, actionParams, diff } = interaction;

      lines.push(`  // ${action} on ${selector}`);

      // Generate state change code based on diff
      if (diff.modified && diff.modified.length > 0) {
        lines.push(`  // This action causes ${diff.modified.length} element(s) to change`);

        for (const mod of diff.modified) {
          if (mod.changes.classes) {
            const { added, removed } = mod.changes.classes;
            if (added.length > 0) {
              lines.push(`  document.querySelector('${mod.selector}')?.classList.add(${added.map(c => `'${c}'`).join(', ')});`);
            }
            if (removed.length > 0) {
              lines.push(`  document.querySelector('${mod.selector}')?.classList.remove(${removed.map(c => `'${c}'`).join(', ')});`);
            }
          }

          if (mod.changes.attributes) {
            for (const [attr, change] of Object.entries(mod.changes.attributes)) {
              if (change.to !== undefined) {
                lines.push(`  document.querySelector('${mod.selector}')?.setAttribute('${attr}', '${change.to}');`);
              } else {
                lines.push(`  document.querySelector('${mod.selector}')?.removeAttribute('${attr}');`);
              }
            }
          }
        }
      }

      lines.push('');
    }

    lines.push('}');
    return lines.join('\n');
  }
};
