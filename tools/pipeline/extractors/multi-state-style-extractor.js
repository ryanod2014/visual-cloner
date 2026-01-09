/**
 * Multi-State Style Extractor
 *
 * Captures element styles in ALL visual states:
 * - Default (rest state)
 * - Hover (:hover)
 * - Focus (:focus, :focus-visible)
 * - Active (:active, mousedown)
 * - Selected/Checked (for toggles, checkboxes)
 * - Disabled (:disabled)
 * - Focus-within (:focus-within)
 * - Valid/Invalid (for form fields)
 *
 * Also computes diffs between states to know exactly what changes.
 */

export const multiStateStyleExtractor = {
  name: 'multi-state-style',

  getInjectionScript() {
    return `
(function() {
  if (window.__multiStateStyleExtractorInstalled) return;
  window.__multiStateStyleExtractorInstalled = true;

  window.__multiStateStylesCaptured = {
    elements: {},
    transitions: {},
  };

  // Comprehensive list of style properties to capture
  const STYLE_PROPERTIES = [
    // Colors
    'backgroundColor', 'color', 'borderColor', 'borderTopColor', 'borderRightColor',
    'borderBottomColor', 'borderLeftColor', 'outlineColor', 'textDecorationColor',
    'caretColor', 'accentColor',

    // Borders
    'borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'borderStyle', 'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
    'borderBottomLeftRadius', 'borderBottomRightRadius',

    // Shadows & Effects
    'boxShadow', 'textShadow', 'filter', 'backdropFilter', 'opacity', 'mixBlendMode',

    // Transforms
    'transform', 'transformOrigin', 'scale', 'rotate', 'translate',

    // Dimensions
    'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
    'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',

    // Typography
    'fontWeight', 'fontSize', 'fontStyle', 'letterSpacing', 'lineHeight',
    'textDecoration', 'textDecorationLine', 'textDecorationStyle', 'textTransform',

    // Layout
    'display', 'visibility', 'position', 'top', 'right', 'bottom', 'left', 'zIndex',
    'overflow', 'overflowX', 'overflowY', 'clip', 'clipPath',

    // Interactions
    'cursor', 'pointerEvents', 'userSelect',

    // Outline
    'outline', 'outlineWidth', 'outlineStyle', 'outlineOffset',

    // Transitions (capture what's animated)
    'transition', 'transitionProperty', 'transitionDuration', 'transitionTimingFunction', 'transitionDelay',

    // Background
    'background', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat',

    // Flex/Grid
    'gap', 'rowGap', 'columnGap', 'alignItems', 'justifyContent', 'flexGrow', 'flexShrink',
  ];

  // Capture computed styles for all properties
  function captureStyles(el) {
    const computed = getComputedStyle(el);
    const styles = {};

    STYLE_PROPERTIES.forEach(prop => {
      try {
        styles[prop] = computed[prop] || computed.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase());
      } catch (e) {
        styles[prop] = null;
      }
    });

    // Also capture CSS variables used on this element
    const cssVars = {};
    const inlineStyle = el.getAttribute('style') || '';
    const varMatches = inlineStyle.match(/--[\\w-]+/g);
    if (varMatches) {
      varMatches.forEach(v => {
        cssVars[v] = computed.getPropertyValue(v);
      });
    }

    styles.__cssVariables = cssVars;

    return styles;
  }

  // Capture transition config
  function captureTransitionConfig(el) {
    const computed = getComputedStyle(el);
    const properties = computed.transitionProperty.split(',').map(s => s.trim());
    const durations = computed.transitionDuration.split(',').map(s => s.trim());
    const timings = computed.transitionTimingFunction.split(',').map(s => s.trim());
    const delays = computed.transitionDelay.split(',').map(s => s.trim());

    if (properties.length === 1 && properties[0] === 'all') {
      return [{
        property: 'all',
        duration: durations[0] || '0s',
        timing: timings[0] || 'ease',
        delay: delays[0] || '0s',
      }];
    }

    return properties.map((prop, i) => ({
      property: prop,
      duration: durations[i % durations.length] || '0s',
      timing: timings[i % timings.length] || 'ease',
      delay: delays[i % delays.length] || '0s',
    }));
  }

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

  // Called from Node.js to capture element in current state
  window.__captureElementState = function(selector, stateName) {
    const el = document.querySelector(selector);
    if (!el) return null;

    if (!window.__multiStateStylesCaptured.elements[selector]) {
      window.__multiStateStylesCaptured.elements[selector] = {
        tagName: el.tagName.toLowerCase(),
        states: {},
        transitions: captureTransitionConfig(el),
      };
    }

    const styles = captureStyles(el);
    window.__multiStateStylesCaptured.elements[selector].states[stateName] = styles;
    return styles;
  };

  // Diff two states to find what actually changes
  window.__diffStates = function(state1, state2) {
    if (!state1 || !state2) return {};

    const diff = {};
    for (const prop of STYLE_PROPERTIES) {
      if (state1[prop] !== state2[prop]) {
        diff[prop] = { from: state1[prop], to: state2[prop] };
      }
    }

    return diff;
  };

  // Generate CSS for a specific pseudo-state
  window.__generateStateCSS = function(selector, stateName, diff) {
    if (Object.keys(diff).length === 0) return null;

    const pseudoMap = {
      hover: ':hover',
      focus: ':focus',
      focusVisible: ':focus-visible',
      focusWithin: ':focus-within',
      active: ':active',
      checked: ':checked',
      disabled: ':disabled',
      valid: ':valid',
      invalid: ':invalid',
    };

    const pseudo = pseudoMap[stateName] || '';
    const rules = Object.entries(diff)
      .filter(([_, v]) => v.to !== null && v.to !== undefined)
      .map(([prop, v]) => {
        const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
        return '  ' + cssProp + ': ' + v.to + ';';
      });

    if (rules.length === 0) return null;

    return selector + pseudo + ' {\\n' + rules.join('\\n') + '\\n}';
  };

  // Batch capture multiple elements
  window.__captureMultipleElements = function(selectors, state) {
    const results = {};
    selectors.forEach(sel => {
      results[sel] = window.__captureElementState(sel, state);
    });
    return results;
  };

  // Get all captured data
  window.__getAllMultiStateData = function() {
    return window.__multiStateStylesCaptured;
  };

  console.log('[Multi-State Style Extractor] Installed');
})();
`;
  },

  // This extractor requires active probing from Node.js
  async probeElement(page, selector, options = {}) {
    const states = {};
    const diffs = {};

    const captureState = async (name) => {
      return await page.evaluate(
        (sel, state) => window.__captureElementState(sel, state),
        selector, name
      );
    };

    const computeDiff = async (state1, state2) => {
      return await page.evaluate(
        (s1, s2) => window.__diffStates(s1, s2),
        state1, state2
      );
    };

    try {
      // 1. Default state
      states.default = await captureState('default');

      // 2. Hover state
      await page.hover(selector);
      await page.waitForTimeout(options.transitionWait || 200);
      states.hover = await captureState('hover');

      // 3. Focus state
      await page.focus(selector);
      await page.waitForTimeout(50);
      states.focus = await captureState('focus');

      // 4. Active state (mouse down)
      const element = await page.$(selector);
      if (element) {
        const box = await element.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.waitForTimeout(50);
          states.active = await captureState('active');
          await page.mouse.up();
        }
      }

      // 5. Check if element supports checked state
      const tagAndType = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        return {
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type'),
          hasChecked: 'checked' in el,
        };
      }, selector);

      if (tagAndType?.hasChecked) {
        // Toggle checked state
        await page.click(selector);
        await page.waitForTimeout(50);
        states.checked = await captureState('checked');
        // Toggle back
        await page.click(selector);
      }

      // Move mouse away to reset hover
      await page.mouse.move(0, 0);
      await page.waitForTimeout(50);

      // Compute diffs
      if (states.default) {
        if (states.hover) diffs.hoverDiff = await computeDiff(states.default, states.hover);
        if (states.focus) diffs.focusDiff = await computeDiff(states.default, states.focus);
        if (states.active) diffs.activeDiff = await computeDiff(states.default, states.active);
        if (states.checked) diffs.checkedDiff = await computeDiff(states.default, states.checked);
      }

    } catch (e) {
      console.warn(`[Multi-State] Failed to probe ${selector}:`, e.message);
    }

    return { states, diffs };
  },

  // Probe multiple elements in parallel
  async probeMultipleElements(page, selectors, options = {}) {
    const results = {};

    // Batch capture default state first (no interaction needed)
    await page.evaluate((sels) => {
      window.__captureMultipleElements(sels, 'default');
    }, selectors);

    // Then probe each element sequentially (interactions can't parallelize)
    for (const selector of selectors) {
      results[selector] = await this.probeElement(page, selector, options);
    }

    return results;
  },

  async extractData(page) {
    return await page.evaluate(() => {
      if (window.__getAllMultiStateData) {
        return window.__getAllMultiStateData();
      }
      return { elements: {}, transitions: {} };
    });
  },

  generateCSS(data) {
    const cssBlocks = [];

    for (const [selector, elementData] of Object.entries(data.elements)) {
      const { states, transitions } = elementData;

      if (!states.default) continue;

      // Generate base styles
      const baseProps = Object.entries(states.default)
        .filter(([k, v]) => !k.startsWith('__') && v !== null && v !== '')
        .map(([prop, val]) => {
          const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
          return `  ${cssProp}: ${val};`;
        });

      if (baseProps.length > 0) {
        cssBlocks.push(`${selector} {\n${baseProps.join('\n')}\n}`);
      }

      // Generate pseudo-state styles from diffs
      const stateMapping = {
        hover: ':hover',
        focus: ':focus',
        focusVisible: ':focus-visible',
        active: ':active',
        checked: ':checked',
      };

      for (const [state, pseudo] of Object.entries(stateMapping)) {
        if (states[state] && states.default) {
          const diff = {};
          for (const prop of Object.keys(states.default)) {
            if (prop.startsWith('__')) continue;
            if (states[state][prop] !== states.default[prop]) {
              diff[prop] = states[state][prop];
            }
          }

          if (Object.keys(diff).length > 0) {
            const diffProps = Object.entries(diff)
              .filter(([_, v]) => v !== null && v !== '')
              .map(([prop, val]) => {
                const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
                return `  ${cssProp}: ${val};`;
              });

            if (diffProps.length > 0) {
              cssBlocks.push(`${selector}${pseudo} {\n${diffProps.join('\n')}\n}`);
            }
          }
        }
      }

      // Add transition rules
      if (transitions && transitions.length > 0 && transitions[0].duration !== '0s') {
        const transitionValue = transitions
          .map(t => `${t.property} ${t.duration} ${t.timing} ${t.delay}`)
          .join(', ');
        cssBlocks.push(`${selector} {\n  transition: ${transitionValue};\n}`);
      }
    }

    return cssBlocks.join('\n\n');
  }
};
