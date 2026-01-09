/**
 * Responsive Integrator
 *
 * Generates responsive CSS from viewport breakpoint testing:
 * - Media queries at detected breakpoints
 * - Layout changes per breakpoint
 * - Device-specific styles (desktop vs mobile vs tablet)
 *
 * Part of V6 Reconstruction Integration
 */

/**
 * Generate media queries from viewport breakpoint data
 * @param {Object} data - viewportBreakpoint exploration data
 * @returns {string} CSS with media queries
 */
export function generateBreakpointCSS(data) {
  if (!data) return '';

  const lines = [];
  lines.push('/* Responsive Breakpoints (from extraction) */');
  lines.push('');

  // Detected breakpoints
  if (data.detectedBreakpoints && data.detectedBreakpoints.length > 0) {
    lines.push('/* Detected breakpoint widths: ' +
      data.detectedBreakpoints.map(b => b.width + 'px').join(', ') + ' */');
    lines.push('');
  }

  // Layout changes per viewport
  if (data.layoutChanges && data.layoutChanges.length > 0) {
    // Sort by width ascending
    const sortedChanges = [...data.layoutChanges].sort((a, b) => a.width - b.width);

    // Group changes into ranges
    const ranges = [];
    for (let i = 0; i < sortedChanges.length; i++) {
      const current = sortedChanges[i];
      const next = sortedChanges[i + 1];

      ranges.push({
        minWidth: current.width,
        maxWidth: next ? next.width - 1 : null,
        changes: current.changes || current,
      });
    }

    // Generate media queries
    ranges.forEach(range => {
      let mediaQuery;
      if (range.maxWidth) {
        mediaQuery = `@media (min-width: ${range.minWidth}px) and (max-width: ${range.maxWidth}px)`;
      } else {
        mediaQuery = `@media (min-width: ${range.minWidth}px)`;
      }

      lines.push(mediaQuery + ' {');
      lines.push(`  /* Layout at ${range.minWidth}px */`);

      // Add comments about what changed
      if (range.changes) {
        if (range.changes.bodyWidth) {
          lines.push(`  /* Body width: ${range.changes.bodyWidth}px */`);
        }
        if (range.changes.visibleElements) {
          lines.push(`  /* Visible elements changed */`);
        }
        if (range.changes.layoutShift) {
          lines.push(`  /* Layout shift detected */`);
        }
      }

      lines.push('}');
      lines.push('');
    });
  }

  // Viewports tested (for reference)
  if (data.viewports && data.viewports.length > 0) {
    lines.push('/* Viewports tested: ');
    data.viewports.forEach(v => {
      lines.push(`   ${v.width}px - ${v.height}px`);
    });
    lines.push('*/');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate device-specific CSS from comparison data
 * @param {Object} data - deviceEmulator comparison data
 * @returns {string} CSS with device-specific styles
 */
export function generateDeviceCSS(data) {
  if (!data) return '';

  const lines = [];
  lines.push('/* Device-Specific Styles (from extraction) */');
  lines.push('');

  // Desktop styles
  if (data.desktop) {
    lines.push('/* Desktop (1920x1080) */');
    lines.push('@media (min-width: 1280px) {');
    if (data.desktop.styles) {
      Object.entries(data.desktop.styles).forEach(([selector, styles]) => {
        lines.push(`  ${selector} {`);
        Object.entries(styles).forEach(([prop, value]) => {
          lines.push(`    ${camelToKebab(prop)}: ${value};`);
        });
        lines.push('  }');
      });
    }
    lines.push('}');
    lines.push('');
  }

  // Tablet styles
  if (data.tablet) {
    lines.push('/* Tablet (768x1024) */');
    lines.push('@media (min-width: 768px) and (max-width: 1279px) {');
    if (data.tablet.styles) {
      Object.entries(data.tablet.styles).forEach(([selector, styles]) => {
        lines.push(`  ${selector} {`);
        Object.entries(styles).forEach(([prop, value]) => {
          lines.push(`    ${camelToKebab(prop)}: ${value};`);
        });
        lines.push('  }');
      });
    }
    lines.push('}');
    lines.push('');
  }

  // Mobile styles
  if (data.mobile) {
    lines.push('/* Mobile (390x844) */');
    lines.push('@media (max-width: 767px) {');
    if (data.mobile.styles) {
      Object.entries(data.mobile.styles).forEach(([selector, styles]) => {
        lines.push(`  ${selector} {`);
        Object.entries(styles).forEach(([prop, value]) => {
          lines.push(`    ${camelToKebab(prop)}: ${value};`);
        });
        lines.push('  }');
      });
    }
    lines.push('}');
    lines.push('');
  }

  // Differences between devices
  if (data.differences && data.differences.length > 0) {
    lines.push('/* Device Differences Detected:');
    data.differences.forEach(diff => {
      lines.push(`   - ${diff.type}: ${diff.description || JSON.stringify(diff)}`);
    });
    lines.push('*/');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate common responsive utility classes
 * @returns {string} CSS utility classes
 */
export function generateResponsiveUtilities() {
  return `/* Responsive Utilities */

/* Hide on mobile */
@media (max-width: 767px) {
  .hide-mobile { display: none !important; }
}

/* Hide on tablet */
@media (min-width: 768px) and (max-width: 1279px) {
  .hide-tablet { display: none !important; }
}

/* Hide on desktop */
@media (min-width: 1280px) {
  .hide-desktop { display: none !important; }
}

/* Show only on mobile */
.show-mobile { display: none !important; }
@media (max-width: 767px) {
  .show-mobile { display: block !important; }
}

/* Show only on tablet */
.show-tablet { display: none !important; }
@media (min-width: 768px) and (max-width: 1279px) {
  .show-tablet { display: block !important; }
}

/* Show only on desktop */
.show-desktop { display: none !important; }
@media (min-width: 1280px) {
  .show-desktop { display: block !important; }
}
`;
}

/**
 * Generate container queries if supported
 * @param {Object} data - extraction data with container info
 * @returns {string} CSS with container queries
 */
export function generateContainerCSS(data) {
  if (!data || !data.containerQueries || data.containerQueries.length === 0) return '';

  const lines = [];
  lines.push('/* Container Queries (from extraction) */');
  lines.push('');

  data.containerQueries.forEach(cq => {
    lines.push(`/* Container: ${cq.name || 'unnamed'} */`);
    lines.push(`${cq.selector} {`);
    lines.push(`  container-type: ${cq.type || 'inline-size'};`);
    if (cq.name) {
      lines.push(`  container-name: ${cq.name};`);
    }
    lines.push('}');
    lines.push('');

    if (cq.queries) {
      cq.queries.forEach(q => {
        lines.push(`@container ${cq.name ? cq.name + ' ' : ''}(${q.condition}) {`);
        lines.push(`  ${q.selector} {`);
        Object.entries(q.styles).forEach(([prop, value]) => {
          lines.push(`    ${camelToKebab(prop)}: ${value};`);
        });
        lines.push('  }');
        lines.push('}');
        lines.push('');
      });
    }
  });

  return lines.join('\n');
}

/**
 * Generate JavaScript for responsive behavior
 * @param {Object} data - viewportBreakpoint and device data
 * @returns {string} JavaScript code
 */
export function generateResponsiveJS(data) {
  if (!data) return '';

  const breakpoints = data.viewportBreakpoints?.detectedBreakpoints || [];
  const navChanges = data.viewportBreakpoints?.navigationChanges || [];

  if (breakpoints.length === 0 && navChanges.length === 0) return '';

  const lines = [];
  lines.push('// Responsive Behavior (from extraction)');
  lines.push('');
  lines.push('const responsiveConfig = {');
  lines.push('  breakpoints: [');
  breakpoints.forEach(bp => {
    lines.push(`    { width: ${bp.width}, name: '${bp.name || getBreakpointName(bp.width)}' },`);
  });
  lines.push('  ],');
  lines.push('};');
  lines.push('');

  // Breakpoint change detection
  lines.push('let currentBreakpoint = null;');
  lines.push('');
  lines.push('function detectBreakpoint() {');
  lines.push('  const width = window.innerWidth;');
  lines.push('  let breakpoint = null;');
  lines.push('');
  lines.push('  for (let i = responsiveConfig.breakpoints.length - 1; i >= 0; i--) {');
  lines.push('    if (width >= responsiveConfig.breakpoints[i].width) {');
  lines.push('      breakpoint = responsiveConfig.breakpoints[i];');
  lines.push('      break;');
  lines.push('    }');
  lines.push('  }');
  lines.push('');
  lines.push('  if (breakpoint?.name !== currentBreakpoint?.name) {');
  lines.push('    currentBreakpoint = breakpoint;');
  lines.push('    document.dispatchEvent(new CustomEvent("breakpointChange", {');
  lines.push('      detail: { breakpoint, width }');
  lines.push('    }));');
  lines.push('    console.log("[Responsive] Breakpoint:", breakpoint?.name || "default", "at", width + "px");');
  lines.push('  }');
  lines.push('}');
  lines.push('');
  lines.push('window.addEventListener("resize", detectBreakpoint);');
  lines.push('detectBreakpoint(); // Initial check');

  // Navigation changes
  if (navChanges.length > 0) {
    lines.push('');
    lines.push('// Navigation layout changes at breakpoints');
    lines.push('document.addEventListener("breakpointChange", (e) => {');
    lines.push('  const { breakpoint, width } = e.detail;');
    lines.push('  // Handle navigation changes based on breakpoint');

    navChanges.forEach(change => {
      lines.push(`  if (width ${change.condition || '<'} ${change.width}) {`);
      lines.push(`    // ${change.description || 'Layout change'}`);
      lines.push('  }');
    });

    lines.push('});');
  }

  return lines.join('\n');
}

/**
 * Combine all responsive CSS generation
 * @param {Object} extractionData - Full extraction results
 * @returns {string} Combined responsive CSS
 */
export function generateAllResponsiveCSS(extractionData) {
  const sections = [];

  // Header
  sections.push(`/**
 * V6 Responsive CSS
 * Generated from extraction data
 * ${new Date().toISOString()}
 */
`);

  // Breakpoints
  const breakpointCSS = generateBreakpointCSS(extractionData.viewportBreakpoints);
  if (breakpointCSS) {
    sections.push('/* ============================================ */');
    sections.push('/* VIEWPORT BREAKPOINTS                         */');
    sections.push('/* ============================================ */');
    sections.push(breakpointCSS);
  }

  // Device-specific
  const deviceCSS = generateDeviceCSS(extractionData.deviceComparison);
  if (deviceCSS) {
    sections.push('/* ============================================ */');
    sections.push('/* DEVICE-SPECIFIC STYLES                       */');
    sections.push('/* ============================================ */');
    sections.push(deviceCSS);
  }

  // Container queries
  const containerCSS = generateContainerCSS(extractionData.stylesheet);
  if (containerCSS) {
    sections.push('/* ============================================ */');
    sections.push('/* CONTAINER QUERIES                            */');
    sections.push('/* ============================================ */');
    sections.push(containerCSS);
  }

  // Utilities
  sections.push('/* ============================================ */');
  sections.push('/* RESPONSIVE UTILITIES                         */');
  sections.push('/* ============================================ */');
  sections.push(generateResponsiveUtilities());

  return sections.join('\n\n');
}

/**
 * Get statistics about responsive data
 * @param {Object} extractionData - Full extraction results
 * @returns {Object} Stats
 */
export function getResponsiveStats(extractionData) {
  return {
    breakpointsDetected: extractionData.viewportBreakpoints?.detectedBreakpoints?.length || 0,
    viewportsTested: extractionData.viewportBreakpoints?.viewports?.length || 0,
    layoutChanges: extractionData.viewportBreakpoints?.layoutChanges?.length || 0,
    navigationChanges: extractionData.viewportBreakpoints?.navigationChanges?.length || 0,
    deviceDifferences: extractionData.deviceComparison?.differences?.length || 0,
  };
}

// Helper: Get breakpoint name from width
function getBreakpointName(width) {
  if (width >= 1920) return 'xxl';
  if (width >= 1440) return 'xl';
  if (width >= 1280) return 'lg';
  if (width >= 1024) return 'md';
  if (width >= 768) return 'sm';
  if (width >= 480) return 'xs';
  return 'mobile';
}

// Helper: camelCase to kebab-case
function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export default {
  generateBreakpointCSS,
  generateDeviceCSS,
  generateResponsiveUtilities,
  generateContainerCSS,
  generateResponsiveJS,
  generateAllResponsiveCSS,
  getResponsiveStats,
};
