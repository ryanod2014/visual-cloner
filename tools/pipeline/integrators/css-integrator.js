/**
 * CSS Integrator
 *
 * Integrates extracted CSS data into the cloned HTML:
 * - CSS Variables (root and scoped)
 * - @keyframes animations
 * - Transitions
 * - Pseudo-element styles
 *
 * Part of V6 Reconstruction Integration
 */

/**
 * Generate CSS from extracted CSS variables
 * @param {Object} data - cssVariables extraction data
 * @returns {string} CSS string
 */
export function generateVariablesCSS(data) {
  if (!data) return '';

  const lines = [];

  // Root variables
  if (data.rootVariables && Object.keys(data.rootVariables).length > 0) {
    lines.push(':root {');
    for (const [name, value] of Object.entries(data.rootVariables)) {
      lines.push(`  ${name}: ${value};`);
    }
    lines.push('}');
    lines.push('');
  }

  // Scoped variables
  if (data.scopedVariables && data.scopedVariables.length > 0) {
    // Group by selector
    const bySelector = {};
    data.scopedVariables.forEach(v => {
      if (!bySelector[v.selector]) {
        bySelector[v.selector] = {};
      }
      bySelector[v.selector][v.name] = v.value;
    });

    for (const [selector, vars] of Object.entries(bySelector)) {
      lines.push(`${selector} {`);
      for (const [name, value] of Object.entries(vars)) {
        lines.push(`  ${name}: ${value};`);
      }
      lines.push('}');
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Generate CSS from extracted animations
 * @param {Object} data - cssAnimation extraction data
 * @returns {string} CSS string
 */
export function generateAnimationsCSS(data) {
  if (!data) return '';

  const lines = [];

  // @keyframes
  if (data.keyframes && data.keyframes.length > 0) {
    data.keyframes.forEach(kf => {
      lines.push(`@keyframes ${kf.name} {`);
      if (kf.frames) {
        kf.frames.forEach(frame => {
          lines.push(`  ${frame.keyText} {`);
          lines.push(`    ${frame.style}`);
          lines.push(`  }`);
        });
      }
      lines.push('}');
      lines.push('');
    });
  }

  // Animated element styles
  if (data.animatedElements && data.animatedElements.length > 0) {
    lines.push('/* Animated Elements */');
    data.animatedElements.forEach(el => {
      lines.push(`${el.selector} {`);
      lines.push(`  animation-name: ${el.animationName};`);
      lines.push(`  animation-duration: ${el.animationDuration};`);
      lines.push(`  animation-timing-function: ${el.animationTimingFunction};`);
      lines.push(`  animation-delay: ${el.animationDelay};`);
      lines.push(`  animation-iteration-count: ${el.animationIterationCount};`);
      lines.push(`  animation-direction: ${el.animationDirection};`);
      lines.push(`  animation-fill-mode: ${el.animationFillMode};`);
      lines.push('}');
      lines.push('');
    });
  }

  return lines.join('\n');
}

/**
 * Generate CSS from extracted transitions
 * @param {Object} data - cssTransition extraction data
 * @returns {string} CSS string
 */
export function generateTransitionsCSS(data) {
  if (!data) return '';

  const lines = [];

  if (data.transitionedElements && data.transitionedElements.length > 0) {
    lines.push('/* Transition Styles */');
    data.transitionedElements.forEach(el => {
      // Skip if no meaningful transition
      if (el.transitionProperty === 'none' || el.transitionDuration === '0s') {
        return;
      }

      lines.push(`${el.selector} {`);
      lines.push(`  transition-property: ${el.transitionProperty};`);
      lines.push(`  transition-duration: ${el.transitionDuration};`);
      lines.push(`  transition-timing-function: ${el.transitionTimingFunction};`);
      if (el.transitionDelay && el.transitionDelay !== '0s') {
        lines.push(`  transition-delay: ${el.transitionDelay};`);
      }
      lines.push('}');
      lines.push('');
    });
  }

  return lines.join('\n');
}

/**
 * Generate CSS from extracted pseudo-elements
 * @param {Object} data - pseudoElement extraction data
 * @returns {string} CSS string
 */
export function generatePseudoElementCSS(data) {
  if (!data || !data.elements || data.elements.length === 0) return '';

  const lines = [];
  lines.push('/* Pseudo-element Styles */');

  data.elements.forEach(el => {
    if (el.before) {
      lines.push(`${el.selector}::before {`);
      lines.push(`  content: ${JSON.stringify(el.before.content || '')};`);
      if (el.before.styles) {
        for (const [prop, value] of Object.entries(el.before.styles)) {
          if (value && value !== 'none' && value !== 'auto' && value !== 'normal') {
            lines.push(`  ${camelToKebab(prop)}: ${value};`);
          }
        }
      }
      lines.push('}');
      lines.push('');
    }

    if (el.after) {
      lines.push(`${el.selector}::after {`);
      lines.push(`  content: ${JSON.stringify(el.after.content || '')};`);
      if (el.after.styles) {
        for (const [prop, value] of Object.entries(el.after.styles)) {
          if (value && value !== 'none' && value !== 'auto' && value !== 'normal') {
            lines.push(`  ${camelToKebab(prop)}: ${value};`);
          }
        }
      }
      lines.push('}');
      lines.push('');
    }
  });

  return lines.join('\n');
}

/**
 * Generate CSS from extracted multi-state styles (hover, focus, active)
 * @param {Object} data - multiStateStyle extraction data
 * @returns {string} CSS string
 */
export function generateMultiStateCSS(data) {
  if (!data || !data.elements) return '';

  // Handle both array and object formats
  const elements = Array.isArray(data.elements)
    ? data.elements
    : Object.values(data.elements);

  if (elements.length === 0) return '';

  const lines = [];
  lines.push('/* Multi-state Styles (hover, focus, active) */');

  elements.forEach(el => {
    const { selector, states } = el;

    // Hover state
    if (states?.hover && Object.keys(states.hover).length > 0) {
      lines.push(`${selector}:hover {`);
      for (const [prop, value] of Object.entries(states.hover)) {
        lines.push(`  ${camelToKebab(prop)}: ${value};`);
      }
      lines.push('}');
      lines.push('');
    }

    // Focus state
    if (states?.focus && Object.keys(states.focus).length > 0) {
      lines.push(`${selector}:focus {`);
      for (const [prop, value] of Object.entries(states.focus)) {
        lines.push(`  ${camelToKebab(prop)}: ${value};`);
      }
      lines.push('}');
      lines.push('');
    }

    // Active state
    if (states?.active && Object.keys(states.active).length > 0) {
      lines.push(`${selector}:active {`);
      for (const [prop, value] of Object.entries(states.active)) {
        lines.push(`  ${camelToKebab(prop)}: ${value};`);
      }
      lines.push('}');
      lines.push('');
    }
  });

  return lines.join('\n');
}

/**
 * Generate CSS from extracted stylesheets
 * @param {Object} data - stylesheet extraction data
 * @returns {string} CSS string
 */
export function generateStylesheetCSS(data) {
  if (!data) return '';

  const lines = [];

  // Raw stylesheet rules
  if (data.rules && data.rules.length > 0) {
    lines.push('/* Extracted Stylesheet Rules */');
    data.rules.forEach(rule => {
      if (rule.cssText) {
        lines.push(rule.cssText);
        lines.push('');
      }
    });
  }

  // Font faces
  if (data.fontFaces && data.fontFaces.length > 0) {
    lines.push('/* Font Faces */');
    data.fontFaces.forEach(ff => {
      lines.push(`@font-face {`);
      lines.push(`  font-family: ${ff.fontFamily};`);
      if (ff.src) lines.push(`  src: ${ff.src};`);
      if (ff.fontWeight) lines.push(`  font-weight: ${ff.fontWeight};`);
      if (ff.fontStyle) lines.push(`  font-style: ${ff.fontStyle};`);
      if (ff.fontDisplay) lines.push(`  font-display: ${ff.fontDisplay};`);
      lines.push('}');
      lines.push('');
    });
  }

  return lines.join('\n');
}

/**
 * Generate scroll/sticky element CSS
 * @param {Object} data - scrollIntersection extraction data
 * @returns {string} CSS string
 */
export function generateScrollCSS(data) {
  if (!data) return '';

  const lines = [];

  if (data.stickyElements && data.stickyElements.length > 0) {
    lines.push('/* Sticky Elements */');
    data.stickyElements.forEach(el => {
      lines.push(`${el.selector} {`);
      lines.push(`  position: sticky;`);
      lines.push(`  top: ${el.top || '0'};`);
      if (el.zIndex && el.zIndex !== 'auto') {
        lines.push(`  z-index: ${el.zIndex};`);
      }
      lines.push('}');
      lines.push('');
    });
  }

  // Parallax elements
  if (data.parallaxElements && data.parallaxElements.length > 0) {
    lines.push('/* Parallax Elements */');
    data.parallaxElements.forEach(el => {
      lines.push(`${el.selector} {`);
      lines.push(`  transform: translateZ(0);`);
      lines.push(`  will-change: transform;`);
      lines.push('}');
      lines.push('');
    });
  }

  return lines.join('\n');
}

/**
 * Combine all CSS generation into one
 * @param {Object} extractionData - Full extraction results
 * @returns {string} Combined CSS
 */
export function generateAllCSS(extractionData) {
  const sections = [];

  // Header
  sections.push(`/**
 * V6 Integrated CSS
 * Generated from extraction data
 * ${new Date().toISOString()}
 */
`);

  // CSS Variables (most important - use throughout)
  const variablesCSS = generateVariablesCSS(extractionData.cssVariables);
  if (variablesCSS) {
    sections.push('/* ============================================ */');
    sections.push('/* CSS VARIABLES                                */');
    sections.push('/* ============================================ */');
    sections.push(variablesCSS);
  }

  // Animations
  const animationsCSS = generateAnimationsCSS(extractionData.cssAnimation);
  if (animationsCSS) {
    sections.push('/* ============================================ */');
    sections.push('/* ANIMATIONS                                   */');
    sections.push('/* ============================================ */');
    sections.push(animationsCSS);
  }

  // Transitions
  const transitionsCSS = generateTransitionsCSS(extractionData.cssTransition);
  if (transitionsCSS) {
    sections.push('/* ============================================ */');
    sections.push('/* TRANSITIONS                                  */');
    sections.push('/* ============================================ */');
    sections.push(transitionsCSS);
  }

  // Pseudo-elements
  const pseudoCSS = generatePseudoElementCSS(extractionData.pseudoElement);
  if (pseudoCSS) {
    sections.push('/* ============================================ */');
    sections.push('/* PSEUDO-ELEMENTS                              */');
    sections.push('/* ============================================ */');
    sections.push(pseudoCSS);
  }

  // Multi-state styles
  const multiStateCSS = generateMultiStateCSS(extractionData.multiStateStyle);
  if (multiStateCSS) {
    sections.push('/* ============================================ */');
    sections.push('/* HOVER/FOCUS/ACTIVE STATES                    */');
    sections.push('/* ============================================ */');
    sections.push(multiStateCSS);
  }

  // Scroll/sticky
  const scrollCSS = generateScrollCSS(extractionData.scrollIntersection);
  if (scrollCSS) {
    sections.push('/* ============================================ */');
    sections.push('/* SCROLL & STICKY ELEMENTS                     */');
    sections.push('/* ============================================ */');
    sections.push(scrollCSS);
  }

  // Stylesheets
  const stylesheetCSS = generateStylesheetCSS(extractionData.stylesheet);
  if (stylesheetCSS) {
    sections.push('/* ============================================ */');
    sections.push('/* EXTRACTED STYLESHEETS                        */');
    sections.push('/* ============================================ */');
    sections.push(stylesheetCSS);
  }

  return sections.join('\n\n');
}

/**
 * Get statistics about generated CSS
 * @param {Object} extractionData - Full extraction results
 * @returns {Object} Stats
 */
export function getCSSStats(extractionData) {
  return {
    variables: {
      root: Object.keys(extractionData.cssVariables?.rootVariables || {}).length,
      scoped: extractionData.cssVariables?.scopedVariables?.length || 0,
    },
    animations: {
      keyframes: extractionData.cssAnimation?.keyframes?.length || 0,
      animatedElements: extractionData.cssAnimation?.animatedElements?.length || 0,
    },
    transitions: extractionData.cssTransition?.transitionedElements?.length || 0,
    pseudoElements: extractionData.pseudoElement?.elements?.length || 0,
    multiStateElements: extractionData.multiStateStyle?.elements?.length || 0,
    stickyElements: extractionData.scrollIntersection?.stickyElements?.length || 0,
  };
}

// Helper: camelCase to kebab-case
function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export default {
  generateVariablesCSS,
  generateAnimationsCSS,
  generateTransitionsCSS,
  generatePseudoElementCSS,
  generateMultiStateCSS,
  generateStylesheetCSS,
  generateScrollCSS,
  generateAllCSS,
  getCSSStats,
};
