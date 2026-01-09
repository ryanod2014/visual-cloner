/**
 * SVG Integrator
 *
 * Integrates extracted SVG elements into the cloned HTML:
 * - Replace placeholder SVGs with exact captured content
 * - Include inline SVG definitions
 * - Set up SVG animations
 *
 * Part of V6 Reconstruction Integration
 */

/**
 * Generate SVG definitions block
 * @param {Object} data - svg extraction data
 * @returns {string} SVG defs HTML
 */
export function generateSVGDefs(data) {
  if (!data || !data.svgElements || data.svgElements.length === 0) return '';

  const lines = [];
  lines.push('<!-- SVG Definitions (from extraction) -->');
  lines.push('<svg style="display: none;" xmlns="http://www.w3.org/2000/svg">');
  lines.push('  <defs>');

  // Extract unique symbols/patterns/gradients
  const symbols = new Map();
  const gradients = new Map();
  const patterns = new Map();

  data.svgElements.forEach(svg => {
    // Extract symbols (often used for icons)
    if (svg.id) {
      symbols.set(svg.id, svg);
    }

    // Extract gradients
    if (svg.gradients) {
      svg.gradients.forEach(g => {
        gradients.set(g.id, g);
      });
    }

    // Extract patterns
    if (svg.patterns) {
      svg.patterns.forEach(p => {
        patterns.set(p.id, p);
      });
    }
  });

  // Add symbols
  symbols.forEach((svg, id) => {
    lines.push(`    <symbol id="${id}" viewBox="${svg.viewBox || '0 0 24 24'}">`);
    lines.push(`      ${svg.innerHTML || ''}`);
    lines.push('    </symbol>');
  });

  // Add gradients
  gradients.forEach((gradient, id) => {
    if (gradient.type === 'linear') {
      lines.push(`    <linearGradient id="${id}" ${gradient.attributes || ''}>`);
      (gradient.stops || []).forEach(stop => {
        lines.push(`      <stop offset="${stop.offset}" stop-color="${stop.color}" />`);
      });
      lines.push('    </linearGradient>');
    } else if (gradient.type === 'radial') {
      lines.push(`    <radialGradient id="${id}" ${gradient.attributes || ''}>`);
      (gradient.stops || []).forEach(stop => {
        lines.push(`      <stop offset="${stop.offset}" stop-color="${stop.color}" />`);
      });
      lines.push('    </radialGradient>');
    }
  });

  // Add patterns
  patterns.forEach((pattern, id) => {
    lines.push(`    <pattern id="${id}" ${pattern.attributes || ''}>`);
    lines.push(`      ${pattern.content || ''}`);
    lines.push('    </pattern>');
  });

  lines.push('  </defs>');
  lines.push('</svg>');

  return lines.join('\n');
}

/**
 * Generate a map of selector -> SVG content for replacement
 * @param {Object} data - svg extraction data
 * @returns {Map<string, string>} Map of selector to SVG HTML
 */
export function getSVGReplacementMap(data) {
  const map = new Map();

  if (!data || !data.svgElements) return map;

  data.svgElements.forEach(svg => {
    if (svg.selector && svg.innerHTML) {
      const fullSVG = `<svg ${svg.viewBox ? `viewBox="${svg.viewBox}"` : ''}
        ${svg.width ? `width="${svg.width}"` : ''}
        ${svg.height ? `height="${svg.height}"` : ''}
        ${svg.className ? `class="${svg.className}"` : ''}
        xmlns="http://www.w3.org/2000/svg">
        ${svg.innerHTML}
      </svg>`.replace(/\s+/g, ' ').trim();

      map.set(svg.selector, fullSVG);
    }
  });

  return map;
}

/**
 * Generate CSS for SVG animations
 * @param {Object} data - svg extraction data
 * @returns {string} CSS for SVG animations
 */
export function generateSVGAnimationCSS(data) {
  if (!data) return '';

  const lines = [];

  // SMIL animations converted to CSS
  if (data.smilAnimations && data.smilAnimations.length > 0) {
    lines.push('/* SVG Animations (converted from SMIL) */');
    lines.push('');

    data.smilAnimations.forEach((anim, i) => {
      const animName = `svg-anim-${i}`;

      lines.push(`@keyframes ${animName} {`);

      if (anim.type === 'animate') {
        lines.push('  from {');
        lines.push(`    ${anim.attributeName}: ${anim.from};`);
        lines.push('  }');
        lines.push('  to {');
        lines.push(`    ${anim.attributeName}: ${anim.to};`);
        lines.push('  }');
      } else if (anim.values) {
        const values = anim.values.split(';');
        const step = 100 / (values.length - 1);
        values.forEach((val, j) => {
          lines.push(`  ${Math.round(step * j)}% {`);
          lines.push(`    ${anim.attributeName}: ${val.trim()};`);
          lines.push('  }');
        });
      }

      lines.push('}');
      lines.push('');

      // Apply to element
      if (anim.selector) {
        lines.push(`${anim.selector} {`);
        lines.push(`  animation: ${animName} ${anim.dur || '1s'} ${anim.repeatCount === 'indefinite' ? 'infinite' : (anim.repeatCount || 1)};`);
        lines.push('}');
        lines.push('');
      }
    });
  }

  // Path animations
  if (data.pathChanges && data.pathChanges.length > 0) {
    lines.push('/* SVG Path Animations */');
    lines.push('');

    // Group by selector
    const bySelector = {};
    data.pathChanges.forEach(change => {
      if (!bySelector[change.selector]) {
        bySelector[change.selector] = [];
      }
      bySelector[change.selector].push(change);
    });

    Object.entries(bySelector).forEach(([selector, changes], i) => {
      const animName = `svg-path-anim-${i}`;

      lines.push(`@keyframes ${animName} {`);
      changes.forEach((change, j) => {
        const percent = Math.round((j / changes.length) * 100);
        lines.push(`  ${percent}% {`);
        lines.push(`    d: path("${change.newValue}");`);
        lines.push('  }');
      });
      lines.push('}');
      lines.push('');

      lines.push(`${selector} {`);
      lines.push(`  animation: ${animName} 2s infinite;`);
      lines.push('}');
      lines.push('');
    });
  }

  return lines.join('\n');
}

/**
 * Generate JavaScript for SVG interactions
 * @param {Object} data - svg extraction data
 * @returns {string} JavaScript code
 */
export function generateSVGJS(data) {
  if (!data) return '';

  const lines = [];
  lines.push('// SVG Interaction Handlers (from extraction)');
  lines.push('');

  // Attribute change handlers
  if (data.attributeChanges && data.attributeChanges.length > 0) {
    lines.push('const svgAttributeChanges = [');
    data.attributeChanges.forEach(change => {
      lines.push('  {');
      lines.push(`    selector: '${change.selector}',`);
      lines.push(`    attribute: '${change.attribute}',`);
      lines.push(`    values: ${JSON.stringify(change.values || [change.oldValue, change.newValue])},`);
      lines.push('  },');
    });
    lines.push('];');
    lines.push('');

    lines.push('// Function to cycle SVG attribute values');
    lines.push('function cycleSVGAttribute(selector, attribute, values) {');
    lines.push('  const el = document.querySelector(selector);');
    lines.push('  if (!el) return;');
    lines.push('');
    lines.push('  let currentIndex = 0;');
    lines.push('  setInterval(() => {');
    lines.push('    currentIndex = (currentIndex + 1) % values.length;');
    lines.push('    el.setAttribute(attribute, values[currentIndex]);');
    lines.push('  }, 1000);');
    lines.push('}');
    lines.push('');
  }

  // Style change handlers
  if (data.styleChanges && data.styleChanges.length > 0) {
    lines.push('const svgStyleChanges = [');
    data.styleChanges.forEach(change => {
      lines.push('  {');
      lines.push(`    selector: '${change.selector}',`);
      lines.push(`    property: '${change.property}',`);
      lines.push(`    values: ${JSON.stringify(change.values || [change.oldValue, change.newValue])},`);
      lines.push('  },');
    });
    lines.push('];');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Combine all SVG generation
 * @param {Object} extractionData - Full extraction results
 * @returns {Object} { html, css, js }
 */
export function generateAllSVG(extractionData) {
  const svgData = extractionData.svg;

  return {
    html: generateSVGDefs(svgData),
    css: generateSVGAnimationCSS(svgData),
    js: generateSVGJS(svgData),
    replacementMap: getSVGReplacementMap(svgData),
  };
}

/**
 * Get statistics about SVG data
 * @param {Object} extractionData - Full extraction results
 * @returns {Object} Stats
 */
export function getSVGStats(extractionData) {
  const svgData = extractionData.svg;
  return {
    svgElements: svgData?.svgElements?.length || 0,
    pathChanges: svgData?.pathChanges?.length || 0,
    attributeChanges: svgData?.attributeChanges?.length || 0,
    smilAnimations: svgData?.smilAnimations?.length || 0,
    styleChanges: svgData?.styleChanges?.length || 0,
  };
}

export default {
  generateSVGDefs,
  getSVGReplacementMap,
  generateSVGAnimationCSS,
  generateSVGJS,
  generateAllSVG,
  getSVGStats,
};
