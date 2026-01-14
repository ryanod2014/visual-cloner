/**
 * CSS Static Analyzer
 *
 * Extract all CSS state rules (hover, focus, active, etc.)
 * and responsive breakpoints. No browser needed.
 */

const css = require('css');

/**
 * Analyze all CSS to extract state rules and breakpoints
 */
function analyzeCSS(styles) {
  const stateRules = [];
  const breakpoints = new Set();
  const animations = [];
  const transitions = [];
  const variables = new Map();

  for (const style of styles) {
    try {
      const parsed = css.parse(style.content, { silent: true });
      if (!parsed.stylesheet) continue;

      processRules(parsed.stylesheet.rules, {
        stateRules,
        breakpoints,
        animations,
        transitions,
        variables
      });
    } catch (e) {
      // Skip unparseable CSS
    }
  }

  return {
    stateRules,
    breakpoints: Array.from(breakpoints).sort((a, b) => parseInt(a) - parseInt(b)),
    animations,
    transitions,
    variables: Object.fromEntries(variables),
    summary: {
      stateRules: stateRules.length,
      breakpoints: breakpoints.size,
      animations: animations.length,
      transitions: transitions.length,
      variables: variables.size
    }
  };
}

/**
 * Process CSS rules recursively
 */
function processRules(rules, context, mediaQuery = null) {
  for (const rule of rules) {
    if (rule.type === 'rule') {
      processRule(rule, context, mediaQuery);
    } else if (rule.type === 'media') {
      // Track breakpoints
      const bp = extractBreakpoint(rule.media);
      if (bp) {
        context.breakpoints.add(bp);
      }
      // Recurse into media query
      if (rule.rules) {
        processRules(rule.rules, context, rule.media);
      }
    } else if (rule.type === 'keyframes') {
      context.animations.push({
        name: rule.name,
        keyframes: rule.keyframes?.map(kf => ({
          values: kf.values,
          declarations: kf.declarations?.map(d => ({
            property: d.property,
            value: d.value
          }))
        }))
      });
    }
  }
}

/**
 * Process a single CSS rule
 */
function processRule(rule, context, mediaQuery) {
  for (const selector of rule.selectors || []) {
    // Check for pseudo-class states
    const stateMatch = selector.match(/:(?:hover|focus|focus-within|focus-visible|active|visited|checked|disabled|enabled|required|valid|invalid|placeholder-shown|target)/);

    if (stateMatch) {
      const state = stateMatch[0].substring(1); // Remove ':'
      const baseSelector = selector.replace(/:(?:hover|focus|focus-within|focus-visible|active|visited|checked|disabled|enabled|required|valid|invalid|placeholder-shown|target)/g, '').trim();

      context.stateRules.push({
        selector,
        baseSelector,
        state,
        mediaQuery,
        declarations: extractDeclarations(rule.declarations)
      });
    }

    // Check for transitions
    if (rule.declarations) {
      const transitionDecl = rule.declarations.find(d => d.property === 'transition' || d.property?.startsWith('transition-'));
      if (transitionDecl) {
        context.transitions.push({
          selector,
          mediaQuery,
          transition: extractTransitionInfo(rule.declarations)
        });
      }

      // Track CSS variables
      for (const decl of rule.declarations) {
        if (decl.property?.startsWith('--')) {
          context.variables.set(decl.property, decl.value);
        }
      }
    }
  }
}

/**
 * Extract declarations from a rule
 */
function extractDeclarations(declarations) {
  if (!declarations) return [];

  return declarations
    .filter(d => d.type === 'declaration')
    .map(d => ({
      property: d.property,
      value: d.value
    }));
}

/**
 * Extract breakpoint from media query
 */
function extractBreakpoint(mediaQuery) {
  const match = mediaQuery?.match(/(?:min|max)-width:\s*(\d+)/);
  return match ? match[1] + 'px' : null;
}

/**
 * Extract transition info from declarations
 */
function extractTransitionInfo(declarations) {
  const result = {
    property: 'all',
    duration: '0s',
    timing: 'ease',
    delay: '0s'
  };

  for (const decl of declarations || []) {
    if (decl.property === 'transition') {
      // Parse shorthand
      const parts = decl.value.split(/\s+/);
      result.property = parts[0] || result.property;
      result.duration = parts[1] || result.duration;
      result.timing = parts[2] || result.timing;
      result.delay = parts[3] || result.delay;
    } else if (decl.property === 'transition-property') {
      result.property = decl.value;
    } else if (decl.property === 'transition-duration') {
      result.duration = decl.value;
    } else if (decl.property === 'transition-timing-function') {
      result.timing = decl.value;
    } else if (decl.property === 'transition-delay') {
      result.delay = decl.value;
    }
  }

  return result;
}

/**
 * Analyze which properties change between states
 */
function analyzeStateChanges(stateRules) {
  const changes = new Map(); // baseSelector -> { state -> properties[] }

  for (const rule of stateRules) {
    if (!changes.has(rule.baseSelector)) {
      changes.set(rule.baseSelector, new Map());
    }

    const selectorChanges = changes.get(rule.baseSelector);
    if (!selectorChanges.has(rule.state)) {
      selectorChanges.set(rule.state, []);
    }

    selectorChanges.get(rule.state).push(...rule.declarations.map(d => d.property));
  }

  return Object.fromEntries(
    Array.from(changes.entries()).map(([selector, states]) => [
      selector,
      Object.fromEntries(states)
    ])
  );
}

/**
 * Get all possible visual states for an element
 */
function getElementStates(selector, cssAnalysis) {
  const states = [];

  // Find matching rules
  for (const rule of cssAnalysis.stateRules) {
    // Check if this rule could apply to the selector
    // (simplified matching - in production would use proper specificity)
    if (rule.baseSelector === selector ||
        selector.includes(rule.baseSelector) ||
        rule.baseSelector.includes(selector.split(' ').pop())) {
      states.push({
        state: rule.state,
        mediaQuery: rule.mediaQuery,
        changes: rule.declarations.map(d => d.property)
      });
    }
  }

  // Add responsive states
  for (const bp of cssAnalysis.breakpoints) {
    states.push({
      state: `viewport-${bp}`,
      mediaQuery: `(min-width: ${bp})`,
      changes: ['layout'] // Generic indicator
    });
  }

  return states;
}

module.exports = {
  analyzeCSS,
  analyzeStateChanges,
  getElementStates
};
