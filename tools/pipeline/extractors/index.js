/**
 * Extractor Registry and Orchestrator
 *
 * Combines all extractors into a unified capture system.
 * This module provides:
 * - getAllExtractors(): Get list of all available extractors
 * - getCombinedInjectionScript(): Get all injection scripts combined
 * - extractAllData(page): Extract data from all extractors
 * - generateAllReplayCode(data): Generate replay code from all captured data
 *
 * V5 Update: Added high-priority extractors for perfect extraction:
 * - Event listeners
 * - Multi-state styles
 * - Behavioral recording
 * - Exhaustive state exploration
 * - Stylesheets
 * - Pseudo-elements
 * - Canvas 2D
 *
 * V5.1 Update: Added comprehensive exploration:
 * - Keyboard shortcuts
 * - Touch gestures
 * - Viewport breakpoints
 * - Worker scripts
 * - API recording
 * - Device emulation (desktop vs mobile)
 */

// Original extractors
import { webglExtractor } from './webgl-extractor.js';
import { cssAnimationExtractor } from './css-animation-extractor.js';
import { cssTransitionExtractor } from './css-transition-extractor.js';
import { cssVariablesExtractor } from './css-variables-extractor.js';
import { svgExtractor } from './svg-extractor.js';
import { scrollIntersectionExtractor } from './scroll-intersection-extractor.js';
import { animationLibsExtractor } from './animation-libs-extractor.js';

// V5 extractors for perfect extraction
import { eventListenerExtractor } from './event-listener-extractor.js';
import { multiStateStyleExtractor } from './multi-state-style-extractor.js';
import { behavioralRecorder } from './behavioral-recorder.js';
import { exhaustiveStateExplorer } from './exhaustive-state-explorer.js';
import { stylesheetExtractor } from './stylesheet-extractor.js';
import { pseudoElementExtractor } from './pseudo-element-extractor.js';
import { canvas2dExtractor } from './canvas-2d-extractor.js';

// Robust exploration and verification
import { robustStateExplorer } from './robust-state-explorer.js';
import { coverageVerifier } from './coverage-verifier.js';

// Additional explorers for comprehensive coverage
import { keyboardShortcutExplorer } from './keyboard-shortcut-explorer.js';
import { touchGestureExplorer } from './touch-gesture-explorer.js';
import { viewportBreakpointTester } from './viewport-breakpoint-tester.js';
import { workerScriptCapturer } from './worker-script-capturer.js';
import { apiRecorder } from './api-recorder.js';

// Device emulation for desktop vs mobile
import { deviceEmulator } from './device-emulator.js';

/**
 * All available extractors - organized by category
 */
export const extractors = {
  // Graphics
  webgl: webglExtractor,
  canvas2d: canvas2dExtractor,
  svg: svgExtractor,

  // Animations & Transitions
  cssAnimation: cssAnimationExtractor,
  cssTransition: cssTransitionExtractor,
  animationLibs: animationLibsExtractor,

  // Styles
  cssVariables: cssVariablesExtractor,
  stylesheet: stylesheetExtractor,
  pseudoElement: pseudoElementExtractor,
  multiStateStyle: multiStateStyleExtractor,

  // Behavior & Interaction
  eventListener: eventListenerExtractor,
  behavioral: behavioralRecorder,
  scrollIntersection: scrollIntersectionExtractor,

  // Exploration (not auto-injected)
  // exhaustiveExplorer: exhaustiveStateExplorer,
};

/**
 * Extractors that require pre-navigation injection
 */
export const preNavigationExtractors = [
  'webgl',
  'canvas2d',
  'eventListener',
  'cssAnimation',
  'cssTransition',
  'animationLibs',
];

/**
 * Extractors that can be injected post-load
 */
export const postLoadExtractors = [
  'cssVariables',
  'stylesheet',
  'pseudoElement',
  'multiStateStyle',
  'svg',
  'scrollIntersection',
  'behavioral',
];

/**
 * Get all extractors as an array
 */
export function getAllExtractors() {
  return Object.values(extractors);
}

/**
 * Get combined injection script for PRE-NAVIGATION extractors
 * This should be added via page.addInitScript() before navigating
 */
export function getPreNavigationScript() {
  const scripts = preNavigationExtractors
    .map(name => extractors[name]?.getInjectionScript?.())
    .filter(Boolean);

  return `
(function() {
  // V5 Pre-Navigation Extractor Suite
  console.log('[Extractors] Installing pre-navigation extractors...');

  ${scripts.join('\n\n')}

  console.log('[Extractors] Pre-navigation extractors installed');
})();
`;
}

/**
 * Get combined injection script for POST-LOAD extractors
 */
export function getPostLoadScript() {
  const scripts = postLoadExtractors
    .map(name => extractors[name]?.getInjectionScript?.())
    .filter(Boolean);

  return `
(function() {
  // V5 Post-Load Extractor Suite
  console.log('[Extractors] Installing post-load extractors...');

  ${scripts.join('\n\n')}

  console.log('[Extractors] Post-load extractors installed');
})();
`;
}

/**
 * Get combined injection script for all extractors (legacy compatibility)
 */
export function getCombinedInjectionScript() {
  const scripts = getAllExtractors()
    .map(ext => ext.getInjectionScript?.())
    .filter(Boolean);

  return `
(function() {
  // V5 Complete Extractor Suite
  window.__extractorData = {};
  console.log('[Extractors] Installing complete extractor suite...');

  ${scripts.join('\n\n')}

  // Unified capture function
  window.__captureAllData = function() {
    return {
      // Graphics
      webgl: window.__webglCaptured || null,
      canvas2d: window.__captureCanvas2dState?.() || window.__canvas2dCaptured || null,
      svg: window.__captureSvgState?.() || window.__svgCaptured || null,

      // Animations
      cssAnimation: window.__captureAnimationState?.() || window.__cssAnimationCaptured || null,
      cssTransition: window.__captureTransitionState?.() || window.__cssTransitionCaptured || null,
      animationLibs: window.__captureAnimationLibs?.() || window.__animationLibsCaptured || null,

      // Styles
      cssVariables: window.__captureCSSVariables?.() || window.__cssVariablesCaptured || null,
      stylesheet: window.__captureStylesheets?.() || window.__stylesheetsCaptured || null,
      pseudoElement: window.__capturePseudoElements?.() || window.__pseudoElementsCaptured || null,
      multiStateStyle: window.__getAllMultiStateData?.() || window.__multiStateStylesCaptured || null,

      // Behavior
      eventListener: window.__captureEventListeners?.() || window.__eventListenersCaptured || null,
      behavioral: window.__getBehavioralRecords?.() || window.__behavioralRecords || null,
      scrollIntersection: window.__captureScrollState?.() || window.__scrollIntersectionCaptured || null,
    };
  };

  console.log('[Extractors] Complete suite installed');
})();
`;
}

/**
 * Extract data from all extractors
 * @param {Page} page - Playwright page object
 * @returns {Promise<Object>} Combined data from all extractors
 */
export async function extractAllData(page) {
  return await page.evaluate(() => {
    if (window.__captureAllData) {
      return window.__captureAllData();
    }

    // Fallback: collect from individual extractors
    return {
      webgl: window.__webglCaptured || null,
      canvas2d: window.__canvas2dCaptured || null,
      svg: window.__svgCaptured || null,
      cssAnimation: window.__cssAnimationCaptured || null,
      cssTransition: window.__cssTransitionCaptured || null,
      animationLibs: window.__animationLibsCaptured || null,
      cssVariables: window.__cssVariablesCaptured || null,
      stylesheet: window.__stylesheetsCaptured || null,
      pseudoElement: window.__pseudoElementsCaptured || null,
      multiStateStyle: window.__multiStateStylesCaptured || null,
      eventListener: window.__eventListenersCaptured || null,
      behavioral: window.__behavioralRecords || null,
      scrollIntersection: window.__scrollIntersectionCaptured || null,
    };
  });
}

/**
 * Generate replay code from all captured data
 * @param {Object} data - Combined data from extractAllData
 * @returns {Object} Object with replay code for each extractor
 */
export function generateAllReplayCode(data) {
  const replayCode = {};

  for (const [name, extractor] of Object.entries(extractors)) {
    const extractorData = data[name];
    if (extractorData && extractor.generateReplayCode) {
      const code = extractor.generateReplayCode(extractorData);
      if (code) {
        replayCode[name] = code;
      }
    } else if (extractorData && extractor.generateCSS) {
      // Some extractors generate CSS instead of JS
      const css = extractor.generateCSS(extractorData);
      if (css) {
        replayCode[name + 'CSS'] = css;
      }
    }
  }

  return replayCode;
}

/**
 * Generate a combined replay module
 * @param {Object} data - Combined data from extractAllData
 * @returns {string} Combined JavaScript module with all replay code
 */
export function generateCombinedReplayModule(data) {
  const replayCodes = generateAllReplayCode(data);
  const lines = [];

  lines.push('/**');
  lines.push(' * Generated Replay Module (V5 Perfect Extraction)');
  lines.push(' * Contains all captured behaviors from the original webapp.');
  lines.push(` * Generated: ${new Date().toISOString()}`);
  lines.push(' */');
  lines.push('');

  // Add each extractor's code
  for (const [name, code] of Object.entries(replayCodes)) {
    lines.push(`// ============================================`);
    lines.push(`// ${name.toUpperCase()} BEHAVIORS`);
    lines.push(`// ============================================`);
    lines.push('');
    lines.push(code);
    lines.push('');
  }

  // Add summary
  lines.push('// ============================================');
  lines.push('// CAPTURE SUMMARY');
  lines.push('// ============================================');
  lines.push('');
  lines.push('export const captureSummary = {');

  for (const [name, extractorData] of Object.entries(data)) {
    if (extractorData) {
      const counts = {};
      for (const [key, value] of Object.entries(extractorData)) {
        if (Array.isArray(value)) {
          counts[key] = value.length;
        } else if (typeof value === 'object' && value !== null) {
          counts[key] = Object.keys(value).length;
        }
      }
      lines.push(`  ${name}: ${JSON.stringify(counts)},`);
    }
  }

  lines.push('};');

  return lines.join('\n');
}

/**
 * Get statistics about captured data
 * @param {Object} data - Combined data from extractAllData
 * @returns {Object} Statistics object
 */
export function getCaptureStatistics(data) {
  const stats = {
    total: 0,
    byExtractor: {},
    categories: {
      graphics: 0,
      animations: 0,
      styles: 0,
      behavior: 0,
    },
  };

  const categoryMap = {
    webgl: 'graphics',
    canvas2d: 'graphics',
    svg: 'graphics',
    cssAnimation: 'animations',
    cssTransition: 'animations',
    animationLibs: 'animations',
    cssVariables: 'styles',
    stylesheet: 'styles',
    pseudoElement: 'styles',
    multiStateStyle: 'styles',
    eventListener: 'behavior',
    behavioral: 'behavior',
    scrollIntersection: 'behavior',
  };

  for (const [name, extractorData] of Object.entries(data)) {
    if (extractorData) {
      const extractorStats = { items: 0, details: {} };

      for (const [key, value] of Object.entries(extractorData)) {
        if (Array.isArray(value)) {
          extractorStats.details[key] = value.length;
          extractorStats.items += value.length;
        } else if (typeof value === 'object' && value !== null) {
          extractorStats.details[key] = Object.keys(value).length;
          extractorStats.items += Object.keys(value).length;
        }
      }

      stats.byExtractor[name] = extractorStats;
      stats.total += extractorStats.items;

      // Categorize
      const category = categoryMap[name];
      if (category) {
        stats.categories[category] += extractorStats.items;
      }
    }
  }

  return stats;
}

/**
 * Run exhaustive state exploration
 * This is separate from the injection pipeline - it actively explores the app.
 */
export async function runExhaustiveExploration(page, options = {}) {
  // Inject required scripts first
  await page.evaluate(behavioralRecorder.getInjectionScript());
  await page.evaluate(exhaustiveStateExplorer.getInjectionScript());

  // Run exploration
  return await exhaustiveStateExplorer.explore(page, options);
}

/**
 * Run ROBUST state exploration with retry logic, verification, and recovery
 * This is the hardened version for production use.
 */
export async function runRobustExploration(page, options = {}) {
  // Inject required scripts
  await page.evaluate(behavioralRecorder.getInjectionScript());
  await page.evaluate(robustStateExplorer.getInjectionScript());

  // Run robust exploration
  return await robustStateExplorer.explore(page, options);
}

/**
 * Verify coverage after exploration
 * Returns a completeness certificate showing what was/wasn't explored.
 */
export async function verifyCoverage(page, explorationResults = null) {
  // Inject coverage verifier
  await page.evaluate(coverageVerifier.getInjectionScript());

  // Run verification
  return await coverageVerifier.verify(page, explorationResults);
}

/**
 * Full extraction pipeline: explore + verify
 * Returns exploration results AND coverage certificate.
 */
export async function runCompleteExtraction(page, options = {}) {
  console.log('[Extraction] Starting complete extraction pipeline...');

  // 1. Inject all extractors
  const injectionScript = getCombinedInjectionScript();
  await page.addInitScript(injectionScript);

  // 2. Run robust exploration
  console.log('[Extraction] Running robust state exploration...');
  const explorationResults = await runRobustExploration(page, {
    maxStates: options.maxStates || 100,
    maxDepth: options.maxDepth || 10,
    onProgress: options.onProgress,
    ...options,
  });

  // 3. Extract all static data
  console.log('[Extraction] Extracting static data...');
  const staticData = await extractAllData(page);

  // 4. Verify coverage
  console.log('[Extraction] Verifying coverage...');
  const verification = await verifyCoverage(page, explorationResults);

  // 5. Generate report
  const report = coverageVerifier.generateReport(verification);

  return {
    exploration: explorationResults,
    staticData,
    verification,
    report,
    isComplete: verification.isComplete,
  };
}

/**
 * Run desktop vs mobile comparison
 * Tests the same page on desktop and mobile devices, detecting differences.
 * @param {Page} page - Playwright page (must already be navigated to target URL)
 * @param {Object} options - Options (desktopDevice, mobileDevice, tabletDevice, testTablet, takeScreenshots, settleTime)
 */
export async function runDeviceComparison(page, options = {}) {
  console.log('[Extraction] Running desktop vs mobile comparison...');
  return await deviceEmulator.compareDesktopMobile(page, options);
}

/**
 * Run extraction across all device profiles
 * Captures device-specific behaviors and layouts.
 * @param {Page} page - Playwright page (must already be navigated to target URL)
 * @param {Object} options - Options (devices, takeScreenshots, settleTime, onProgress)
 */
export async function runMultiDeviceExtraction(page, options = {}) {
  console.log('[Extraction] Running multi-device extraction...');
  return await deviceEmulator.exploreAllDevices(page, options);
}

// Re-export individual extractors for direct access
export {
  webglExtractor,
  cssAnimationExtractor,
  cssTransitionExtractor,
  cssVariablesExtractor,
  svgExtractor,
  scrollIntersectionExtractor,
  animationLibsExtractor,
  eventListenerExtractor,
  multiStateStyleExtractor,
  behavioralRecorder,
  exhaustiveStateExplorer,
  stylesheetExtractor,
  pseudoElementExtractor,
  canvas2dExtractor,
  robustStateExplorer,
  coverageVerifier,
  // New comprehensive explorers
  keyboardShortcutExplorer,
  touchGestureExplorer,
  viewportBreakpointTester,
  workerScriptCapturer,
  apiRecorder,
  // Device emulation
  deviceEmulator,
};

export default {
  extractors,
  preNavigationExtractors,
  postLoadExtractors,
  getAllExtractors,
  getPreNavigationScript,
  getPostLoadScript,
  getCombinedInjectionScript,
  extractAllData,
  generateAllReplayCode,
  generateCombinedReplayModule,
  getCaptureStatistics,
  runExhaustiveExploration,
  runRobustExploration,
  verifyCoverage,
  runCompleteExtraction,
  // Device comparison
  runDeviceComparison,
  runMultiDeviceExtraction,
};
