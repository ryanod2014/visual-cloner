/**
 * CSS Transition Extractor
 *
 * Captures CSS transitions including:
 * - transition-* properties on elements
 * - Computed style values before/during/after transitions
 * - Transition events (start, end, cancel)
 * - Inline style changes that trigger transitions
 */

export const cssTransitionExtractor = {
  name: 'css-transition',

  getInjectionScript() {
    return `
(function() {
  if (window.__cssTransitionExtractorInstalled) return;
  window.__cssTransitionExtractorInstalled = true;

  window.__cssTransitionCaptured = {
    transitionedElements: [],
    transitionEvents: [],
    styleSnapshots: [],
    transitionDefinitions: [],
  };

  function getUniqueSelector(el) {
    if (el.id) return '#' + el.id;
    if (el === document.body) return 'body';

    const path = [];
    while (el && el !== document.body) {
      let selector = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        selector += '.' + el.className.trim().split(/\\s+/).join('.');
      }
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
        if (siblings.length > 1) {
          selector += ':nth-of-type(' + (siblings.indexOf(el) + 1) + ')';
        }
      }
      path.unshift(selector);
      el = parent;
    }
    return path.join(' > ');
  }

  // ============================================
  // EXTRACT ELEMENTS WITH TRANSITIONS
  // ============================================

  function extractTransitionElements() {
    const transitioned = [];
    const allElements = document.querySelectorAll('*');

    for (const el of allElements) {
      const style = getComputedStyle(el);
      const transitionProperty = style.transitionProperty;

      if (transitionProperty && transitionProperty !== 'none' && transitionProperty !== 'all 0s ease 0s') {
        const selector = getUniqueSelector(el);
        transitioned.push({
          selector,
          transitionProperty: transitionProperty,
          transitionDuration: style.transitionDuration,
          transitionTimingFunction: style.transitionTimingFunction,
          transitionDelay: style.transitionDelay,
        });
      }
    }

    return transitioned;
  }

  // ============================================
  // TRACK TRANSITION EVENTS
  // ============================================

  const activeTransitions = new Map();

  document.addEventListener('transitionstart', (e) => {
    const selector = getUniqueSelector(e.target);
    const key = selector + '-' + e.propertyName;

    // Capture start state
    const startStyle = {};
    const computed = getComputedStyle(e.target);
    startStyle[e.propertyName] = computed.getPropertyValue(e.propertyName);

    activeTransitions.set(key, {
      selector,
      propertyName: e.propertyName,
      startValue: startStyle[e.propertyName],
      startTime: Date.now(),
    });

    window.__cssTransitionCaptured.transitionEvents.push({
      type: 'start',
      selector,
      propertyName: e.propertyName,
      elapsedTime: e.elapsedTime,
      startValue: startStyle[e.propertyName],
      timestamp: Date.now(),
    });
  }, true);

  document.addEventListener('transitionend', (e) => {
    const selector = getUniqueSelector(e.target);
    const key = selector + '-' + e.propertyName;

    // Capture end state
    const computed = getComputedStyle(e.target);
    const endValue = computed.getPropertyValue(e.propertyName);

    const startData = activeTransitions.get(key);
    activeTransitions.delete(key);

    window.__cssTransitionCaptured.transitionEvents.push({
      type: 'end',
      selector,
      propertyName: e.propertyName,
      elapsedTime: e.elapsedTime,
      startValue: startData?.startValue,
      endValue: endValue,
      duration: startData ? Date.now() - startData.startTime : null,
      timestamp: Date.now(),
    });
  }, true);

  document.addEventListener('transitioncancel', (e) => {
    const selector = getUniqueSelector(e.target);
    const key = selector + '-' + e.propertyName;
    activeTransitions.delete(key);

    window.__cssTransitionCaptured.transitionEvents.push({
      type: 'cancel',
      selector,
      propertyName: e.propertyName,
      elapsedTime: e.elapsedTime,
      timestamp: Date.now(),
    });
  }, true);

  // ============================================
  // TRACK INLINE STYLE CHANGES
  // ============================================

  const styleObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        const el = mutation.target;
        const computed = getComputedStyle(el);
        const transitionProp = computed.transitionProperty;

        if (transitionProp && transitionProp !== 'none') {
          const selector = getUniqueSelector(el);

          // Snapshot relevant properties
          const snapshot = {
            selector,
            timestamp: Date.now(),
            properties: {},
          };

          // Get all transitioned properties
          const props = transitionProp.split(',').map(p => p.trim());
          props.forEach(prop => {
            if (prop === 'all') {
              // For 'all', capture common animated properties
              ['opacity', 'transform', 'background-color', 'color', 'width', 'height',
               'padding', 'margin', 'border-color', 'box-shadow', 'left', 'top', 'right', 'bottom'].forEach(p => {
                snapshot.properties[p] = computed.getPropertyValue(p);
              });
            } else {
              snapshot.properties[prop] = computed.getPropertyValue(prop);
            }
          });

          window.__cssTransitionCaptured.styleSnapshots.push(snapshot);
        }
      }
    }
  });

  styleObserver.observe(document.body, {
    attributes: true,
    subtree: true,
    attributeFilter: ['style', 'class'],
  });

  // ============================================
  // INTERCEPT style PROPERTY SETTERS
  // ============================================

  const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function(property, value, priority) {
    const el = this.parentElement || this.parentRule?.parentStyleSheet?.ownerNode;

    if (el && el.nodeType === 1) {
      const computed = getComputedStyle(el);
      const transitionProp = computed.transitionProperty;

      if (transitionProp && transitionProp !== 'none') {
        const selector = getUniqueSelector(el);
        const oldValue = computed.getPropertyValue(property);

        window.__cssTransitionCaptured.styleSnapshots.push({
          selector,
          timestamp: Date.now(),
          change: {
            property,
            oldValue,
            newValue: value,
            method: 'setProperty',
          },
        });
      }
    }

    return originalSetProperty.call(this, property, value, priority);
  };

  // ============================================
  // SNAPSHOT FUNCTION
  // ============================================

  window.__captureTransitionState = function() {
    window.__cssTransitionCaptured.transitionedElements = extractTransitionElements();
    return window.__cssTransitionCaptured;
  };

  // Initial capture
  if (document.readyState === 'complete') {
    window.__captureTransitionState();
  } else {
    window.addEventListener('load', () => window.__captureTransitionState());
  }

  console.log('[CSS Transition Extractor] Installed');
})();
`;
  },

  async extractData(page) {
    return await page.evaluate(() => {
      if (window.__captureTransitionState) {
        return window.__captureTransitionState();
      }
      return window.__cssTransitionCaptured || {
        transitionedElements: [],
        transitionEvents: [],
        styleSnapshots: [],
      };
    });
  },

  generateReplayCode(data) {
    if (!data.transitionedElements.length && !data.transitionEvents.length) {
      return null;
    }

    const lines = [];
    lines.push('// CSS Transition Replay Code');
    lines.push('');

    // Generate transition definitions
    if (data.transitionedElements.length) {
      lines.push('export const transitionStyles = {');
      data.transitionedElements.forEach(el => {
        lines.push(`  '${el.selector}': {`);
        lines.push(`    transitionProperty: '${el.transitionProperty}',`);
        lines.push(`    transitionDuration: '${el.transitionDuration}',`);
        lines.push(`    transitionTimingFunction: '${el.transitionTimingFunction}',`);
        lines.push(`    transitionDelay: '${el.transitionDelay}',`);
        lines.push(`  },`);
      });
      lines.push('};');
      lines.push('');
    }

    // Generate transition sequences from events
    if (data.transitionEvents.length) {
      // Group by selector
      const bySelector = {};
      data.transitionEvents.forEach(evt => {
        if (evt.type === 'end' && evt.startValue && evt.endValue) {
          if (!bySelector[evt.selector]) bySelector[evt.selector] = [];
          bySelector[evt.selector].push({
            property: evt.propertyName,
            from: evt.startValue,
            to: evt.endValue,
            duration: evt.elapsedTime,
          });
        }
      });

      lines.push('export const capturedTransitions = {');
      Object.entries(bySelector).forEach(([selector, transitions]) => {
        lines.push(`  '${selector}': [`);
        transitions.forEach(t => {
          lines.push(`    { property: '${t.property}', from: '${t.from}', to: '${t.to}', duration: ${t.duration} },`);
        });
        lines.push(`  ],`);
      });
      lines.push('};');
    }

    return lines.join('\n');
  },
};

export default cssTransitionExtractor;
