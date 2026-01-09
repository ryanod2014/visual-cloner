/**
 * V6 Integration Runner
 *
 * Combines all integrators to produce a complete reconstruction
 * from visual clone + extraction data.
 *
 * Usage:
 *   node integrate-extraction.js --html assembled.html --extraction extraction-results.json --output ./integrated/
 */

import cssIntegrator from './css-integrator.js';
import eventIntegrator from './event-integrator.js';
import responsiveIntegrator from './responsive-integrator.js';
import svgIntegrator from './svg-integrator.js';
import canvasIntegrator from './canvas-integrator.js';
import apiIntegrator from './api-integrator.js';

/**
 * Normalize extraction data from various formats
 * The V5.1 test output has: { phases: { static: { data: {...} }, events: {...}, ... }}
 * We need a flat structure: { cssVariables: {...}, eventListener: {...}, ... }
 */
function normalizeExtractionData(extractionData) {
  // If already flat, return as-is
  if (extractionData.cssVariables || extractionData.eventListener) {
    return extractionData;
  }

  const normalized = {};

  // Handle phases structure from test-v5-extraction.js
  if (extractionData.phases) {
    const phases = extractionData.phases;

    // Static data extractors (cssVariables, svg, canvas2d, etc.)
    if (phases.static?.data) {
      Object.assign(normalized, phases.static.data);
    }

    // Event listeners (stored directly in phases.events)
    if (phases.events) {
      normalized.eventListener = phases.events;
    }

    // Viewport breakpoints
    if (phases.breakpoints) {
      normalized.viewportBreakpoints = phases.breakpoints;
    }

    // Device comparison
    if (phases.devices) {
      normalized.deviceComparison = phases.devices;
    }

    // API traffic
    if (phases.api) {
      normalized.api = phases.api;
    }

    // Worker scripts
    if (phases.workers) {
      normalized.workers = phases.workers;
    }

    // Keyboard shortcuts
    if (phases.keyboard) {
      normalized.keyboardShortcuts = phases.keyboard;
    }

    // State exploration
    if (phases.exploration) {
      normalized.stateExploration = phases.exploration;
    }

    // Coverage
    if (phases.coverage) {
      normalized.coverage = phases.coverage;
    }
  }

  return normalized;
}

/**
 * Run full integration
 * @param {Object} options
 * @param {string} options.htmlContent - Content of assembled.html
 * @param {Object} options.extractionData - Parsed extraction-results.json
 * @returns {Object} Integrated outputs { html, css, js, mockServer, serviceWorker }
 */
export async function runIntegration(options) {
  const { htmlContent, extractionData } = options;

  console.log('='.repeat(60));
  console.log('V6 RECONSTRUCTION INTEGRATION');
  console.log('='.repeat(60));

  // Normalize the extraction data structure
  // The test output has: phases.static.data, phases.events, phases.breakpoints, etc.
  const data = normalizeExtractionData(extractionData);

  // ============================================
  // PHASE 1: Generate CSS
  // ============================================
  console.log('\n[Phase 1] Generating CSS...');

  const cssStats = cssIntegrator.getCSSStats(data);
  console.log(`  - CSS Variables: ${cssStats.variables.root} root, ${cssStats.variables.scoped} scoped`);
  console.log(`  - Animations: ${cssStats.animations.keyframes} keyframes`);
  console.log(`  - Transitions: ${cssStats.transitions} elements`);
  console.log(`  - Pseudo-elements: ${cssStats.pseudoElements}`);
  console.log(`  - Multi-state: ${cssStats.multiStateElements} elements`);

  const generatedCSS = cssIntegrator.generateAllCSS(data);

  // ============================================
  // PHASE 2: Generate Responsive CSS
  // ============================================
  console.log('\n[Phase 2] Generating responsive CSS...');

  const responsiveStats = responsiveIntegrator.getResponsiveStats(data);
  console.log(`  - Breakpoints: ${responsiveStats.breakpointsDetected}`);
  console.log(`  - Viewports tested: ${responsiveStats.viewportsTested}`);
  console.log(`  - Layout changes: ${responsiveStats.layoutChanges}`);
  console.log(`  - Device differences: ${responsiveStats.deviceDifferences}`);

  const responsiveCSS = responsiveIntegrator.generateAllResponsiveCSS(data);

  // ============================================
  // PHASE 3: Generate JavaScript
  // ============================================
  console.log('\n[Phase 3] Generating JavaScript...');

  const eventStats = eventIntegrator.getEventStats(data);
  console.log(`  - Event listeners: ${eventStats.eventListeners}`);
  console.log(`  - Inline handlers: ${eventStats.inlineHandlers}`);
  console.log(`  - Keyboard shortcuts: ${eventStats.keyboardShortcuts}`);
  console.log(`  - Touch gestures: ${eventStats.touchGestures}`);

  const generatedJS = eventIntegrator.generateAllJS(data);
  const responsiveJS = responsiveIntegrator.generateResponsiveJS(data);

  // ============================================
  // PHASE 4: Generate SVG
  // ============================================
  console.log('\n[Phase 4] Generating SVG...');

  const svgStats = svgIntegrator.getSVGStats(data);
  console.log(`  - SVG elements: ${svgStats.svgElements}`);
  console.log(`  - Path changes: ${svgStats.pathChanges}`);
  console.log(`  - Animations: ${svgStats.smilAnimations}`);

  const svgOutput = svgIntegrator.generateAllSVG(data);

  // ============================================
  // PHASE 5: Generate Canvas
  // ============================================
  console.log('\n[Phase 5] Generating Canvas behaviors...');

  const canvasStats = canvasIntegrator.getCanvasStats(data);
  console.log(`  - Canvas 2D operations: ${canvasStats.canvas2d.operations}`);
  console.log(`  - WebGL shaders: ${canvasStats.webgl.shaders}`);
  console.log(`  - WebGL draw calls: ${canvasStats.webgl.drawCalls}`);
  console.log(`  - Tool behaviors: ${canvasStats.toolBehaviors}`);

  const canvasJS = canvasIntegrator.generateAllCanvasJS(data);

  // ============================================
  // PHASE 6: Generate API Mock
  // ============================================
  console.log('\n[Phase 6] Generating API mock...');

  const apiStats = apiIntegrator.getAPIStats(data);
  console.log(`  - Fetch requests: ${apiStats.fetchRequests}`);
  console.log(`  - XHR requests: ${apiStats.xhrRequests}`);
  console.log(`  - WebSocket connections: ${apiStats.websocketConnections}`);
  console.log(`  - Service workers: ${apiStats.serviceWorkers}`);

  const apiOutput = apiIntegrator.generateAllAPI(data);

  // ============================================
  // PHASE 7: Combine into final HTML
  // ============================================
  console.log('\n[Phase 7] Building integrated HTML...');

  const integratedHTML = buildIntegratedHTML(htmlContent, {
    css: generatedCSS,
    responsiveCSS,
    js: generatedJS,
    responsiveJS,
    svgDefs: svgOutput.html,
    svgCSS: svgOutput.css,
    svgJS: svgOutput.js,
    canvasJS,
    fetchInterceptor: apiOutput.fetchInterceptor,
  });

  // ============================================
  // Summary
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('INTEGRATION COMPLETE');
  console.log('='.repeat(60));

  return {
    html: integratedHTML,
    css: [generatedCSS, responsiveCSS, svgOutput.css].filter(Boolean).join('\n\n'),
    js: [generatedJS, responsiveJS, svgOutput.js, canvasJS, apiOutput.fetchInterceptor].filter(Boolean).join('\n\n'),
    mockServer: apiOutput.mockServer,
    serviceWorker: apiOutput.serviceWorker,
    stats: {
      css: cssStats,
      responsive: responsiveStats,
      events: eventStats,
      svg: svgStats,
      canvas: canvasStats,
      api: apiStats,
    },
  };
}

/**
 * Build the final integrated HTML
 */
function buildIntegratedHTML(originalHTML, generated) {
  let html = originalHTML;

  // Find </head> to inject CSS
  const headCloseIndex = html.indexOf('</head>');
  if (headCloseIndex > -1) {
    const cssInjection = `
<!-- V6 Integration: Extracted CSS -->
<style id="v6-extracted-css">
${generated.css}
</style>

<!-- V6 Integration: Responsive CSS -->
<style id="v6-responsive-css">
${generated.responsiveCSS}
</style>

<!-- V6 Integration: SVG CSS -->
<style id="v6-svg-css">
${generated.svgCSS || ''}
</style>
`;
    html = html.slice(0, headCloseIndex) + cssInjection + html.slice(headCloseIndex);
  }

  // Find <body> to inject SVG defs
  const bodyOpenIndex = html.indexOf('<body');
  const bodyTagEnd = html.indexOf('>', bodyOpenIndex);
  if (bodyTagEnd > -1 && generated.svgDefs) {
    html = html.slice(0, bodyTagEnd + 1) + '\n' + generated.svgDefs + '\n' + html.slice(bodyTagEnd + 1);
  }

  // Find </body> to inject JS
  const bodyCloseIndex = html.indexOf('</body>');
  if (bodyCloseIndex > -1) {
    const jsInjection = `
<!-- V6 Integration: Event Wiring -->
<script id="v6-events-js">
${generated.js}
</script>

<!-- V6 Integration: Responsive JS -->
<script id="v6-responsive-js">
${generated.responsiveJS || ''}
</script>

<!-- V6 Integration: SVG JS -->
<script id="v6-svg-js">
${generated.svgJS || ''}
</script>

<!-- V6 Integration: Canvas JS -->
<script id="v6-canvas-js">
${generated.canvasJS || ''}
</script>

<!-- V6 Integration: API Interceptor -->
<script id="v6-api-js">
${generated.fetchInterceptor || ''}
</script>
`;
    html = html.slice(0, bodyCloseIndex) + jsInjection + html.slice(bodyCloseIndex);
  }

  return html;
}

/**
 * Get combined statistics
 */
export function getCombinedStats(extractionData) {
  const data = normalizeExtractionData(extractionData);

  return {
    css: cssIntegrator.getCSSStats(data),
    responsive: responsiveIntegrator.getResponsiveStats(data),
    events: eventIntegrator.getEventStats(data),
    svg: svgIntegrator.getSVGStats(data),
    canvas: canvasIntegrator.getCanvasStats(data),
    api: apiIntegrator.getAPIStats(data),
  };
}

// Re-export individual integrators
export {
  cssIntegrator,
  eventIntegrator,
  responsiveIntegrator,
  svgIntegrator,
  canvasIntegrator,
  apiIntegrator,
};

export default {
  runIntegration,
  getCombinedStats,
  cssIntegrator,
  eventIntegrator,
  responsiveIntegrator,
  svgIntegrator,
  canvasIntegrator,
  apiIntegrator,
};
