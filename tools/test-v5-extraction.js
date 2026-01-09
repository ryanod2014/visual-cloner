#!/usr/bin/env node
/**
 * V5.1 Complete Extraction Test
 *
 * Tests all extractors on excalidraw.com from scratch.
 * Fixed: Pre-navigation injection for event listeners and API traffic.
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

// Import all extractors
import {
  extractors,
  getPreNavigationScript,
  getPostLoadScript,
  extractAllData,
  getCaptureStatistics,
  keyboardShortcutExplorer,
  viewportBreakpointTester,
  workerScriptCapturer,
  apiRecorder,
  deviceEmulator,
  robustStateExplorer,
  behavioralRecorder,
  coverageVerifier,
} from './pipeline/extractors/index.js';

const TEST_URL = 'https://excalidraw.com';
const OUTPUT_DIR = './output/v5-extraction-test';

/**
 * Build a comprehensive pre-navigation script that captures everything
 */
function buildPreNavigationScript() {
  // Get individual extractor scripts
  const eventListenerScript = extractors.eventListener?.getInjectionScript?.() || '';
  const apiRecorderScript = apiRecorder.getInjectionScript();
  const workerCapturerScript = workerScriptCapturer.getInjectionScript();
  const behavioralScript = behavioralRecorder.getInjectionScript();
  const robustExplorerScript = robustStateExplorer.getInjectionScript();

  // Also get the standard pre-navigation scripts
  const standardPreNav = getPreNavigationScript();

  return `
(function() {
  // ============================================
  // V5.1 PRE-NAVIGATION CAPTURE SUITE
  // Injected BEFORE page load to capture everything
  // ============================================
  console.log('[V5.1] Installing pre-navigation capture suite...');

  // 1. Event Listener Extractor (must be first to intercept addEventListener)
  ${eventListenerScript}

  // 2. API Recorder (intercept fetch/XHR/WebSocket)
  ${apiRecorderScript}

  // 3. Worker Script Capturer (intercept Worker/ServiceWorker)
  ${workerCapturerScript}

  // 4. Behavioral Recorder (track DOM mutations)
  ${behavioralScript}

  // 5. Robust State Explorer (state hashing)
  ${robustExplorerScript}

  // 6. Standard pre-navigation extractors
  ${standardPreNav}

  console.log('[V5.1] Pre-navigation suite installed');
})();
`;
}

async function runTest() {
  console.log('='.repeat(60));
  console.log('V5.1 COMPLETE EXTRACTION TEST (FIXED)');
  console.log('='.repeat(60));
  console.log(`Target: ${TEST_URL}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('');

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });

  // Create context with pre-navigation scripts BEFORE any page is created
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });

  // Build and add comprehensive pre-navigation script
  const preNavScript = buildPreNavigationScript();
  await context.addInitScript(preNavScript);
  console.log('[Setup] Pre-navigation scripts registered');

  const page = await context.newPage();

  const results = {
    url: TEST_URL,
    timestamp: new Date().toISOString(),
    phases: {},
  };

  try {
    // ============================================
    // PHASE 1: Navigate (scripts already injected)
    // ============================================
    console.log('\n[Phase 1] Navigating to target...');
    await page.goto(TEST_URL, { waitUntil: 'networkidle', timeout: 60000 });
    console.log('  ✓ Page loaded');

    // Inject post-load scripts
    const postLoadScript = getPostLoadScript();
    await page.evaluate(postLoadScript);
    console.log('  ✓ Post-load extractors injected');

    // Wait for app to fully initialize
    await page.waitForTimeout(3000);

    // Verify pre-navigation scripts are working
    const preNavCheck = await page.evaluate(() => ({
      hasEventCapture: typeof window.__captureEventListeners === 'function',
      hasApiCapture: typeof window.__getRecordedAPI === 'function',
      hasWorkerCapture: typeof window.__getWorkerData === 'function',
      hasBehavioralCapture: typeof window.__getBehavioralRecords === 'function',
      hasStateHash: typeof window.__getrobustStateHash === 'function',
    }));
    console.log('  ✓ Pre-nav verification:', preNavCheck);

    // ============================================
    // PHASE 2: Static extraction
    // ============================================
    console.log('\n[Phase 2] Extracting static data...');
    const staticData = await extractAllData(page);
    const stats = getCaptureStatistics(staticData);

    console.log(`  ✓ Total items captured: ${stats.total}`);
    console.log(`    - Graphics: ${stats.categories.graphics}`);
    console.log(`    - Animations: ${stats.categories.animations}`);
    console.log(`    - Styles: ${stats.categories.styles}`);
    console.log(`    - Behavior: ${stats.categories.behavior}`);

    results.phases.static = { stats, data: staticData };

    // ============================================
    // PHASE 3: Event listener extraction
    // ============================================
    console.log('\n[Phase 3] Capturing event listeners...');
    const eventData = await page.evaluate(() => {
      if (window.__captureEventListeners) {
        return window.__captureEventListeners();
      }
      return { listeners: [], removed: [], inline: [] };
    });
    console.log(`  ✓ Event listeners: ${eventData.listeners?.length || 0}`);
    console.log(`  ✓ Removed listeners: ${eventData.removed?.length || 0}`);
    console.log(`  ✓ Inline handlers: ${eventData.inline?.length || 0}`);

    results.phases.events = eventData;

    // ============================================
    // PHASE 4: API traffic recording
    // ============================================
    console.log('\n[Phase 4] Capturing API traffic...');
    const apiData = await apiRecorder.extractData(page);
    console.log(`  ✓ Fetch requests: ${apiData.fetchRequests?.length || 0}`);
    console.log(`  ✓ XHR requests: ${apiData.xhrRequests?.length || 0}`);
    console.log(`  ✓ WebSocket connections: ${apiData.websocketConnections?.length || 0}`);

    results.phases.api = apiData;

    // ============================================
    // PHASE 5: Worker script capture
    // ============================================
    console.log('\n[Phase 5] Capturing worker scripts...');
    const workerData = await workerScriptCapturer.extractData(page);
    console.log(`  ✓ Web Workers: ${workerData.workers?.length || 0}`);
    console.log(`  ✓ Service Workers: ${workerData.serviceWorkers?.length || 0}`);
    console.log(`  ✓ Worker scripts captured: ${Object.keys(workerData.workerScripts || {}).length}`);

    results.phases.workers = workerData;

    // ============================================
    // PHASE 6: Keyboard shortcut exploration
    // ============================================
    console.log('\n[Phase 6] Exploring keyboard shortcuts...');
    const keyboardResults = await keyboardShortcutExplorer.explore(page, {
      testSingleKeys: true,
      testCtrlShortcuts: true,
      testShiftShortcuts: false,
      testSequences: false,
      onProgress: (p) => process.stdout.write(`\r  Testing: ${p.tested}/${p.total}`),
    });
    console.log(`\n  ✓ Shortcuts found: ${keyboardResults.shortcuts?.length || 0}`);
    if (keyboardResults.shortcuts?.length > 0) {
      keyboardResults.shortcuts.slice(0, 5).forEach(s => {
        console.log(`    - ${s.key}: ${s.effect || 'state change'}`);
      });
    }

    results.phases.keyboard = keyboardResults;

    // ============================================
    // PHASE 7: Viewport breakpoint testing
    // ============================================
    console.log('\n[Phase 7] Testing viewport breakpoints...');

    // Navigate fresh for breakpoint testing (scripts persist via addInitScript)
    await page.goto(TEST_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const breakpointResults = await viewportBreakpointTester.explore(page, {
      useCommonBreakpoints: true,
      useCSSBreakpoints: false,
      settleTime: 300,
      onProgress: (p) => process.stdout.write(`\r  Testing viewport ${p.currentWidth}px (${p.tested}/${p.total})`),
    });
    console.log(`\n  ✓ Viewports tested: ${breakpointResults.viewports?.length || 0}`);
    console.log(`  ✓ Breakpoints detected: ${breakpointResults.detectedBreakpoints?.length || 0}`);
    console.log(`  ✓ Layout changes: ${breakpointResults.layoutChanges?.length || 0}`);
    console.log(`  ✓ Navigation changes: ${breakpointResults.navigationChanges?.length || 0}`);

    results.phases.breakpoints = breakpointResults;

    // ============================================
    // PHASE 8: Device comparison (desktop vs mobile)
    // ============================================
    console.log('\n[Phase 8] Comparing desktop vs mobile...');

    // Navigate fresh
    await page.goto(TEST_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const deviceResults = await deviceEmulator.compareDesktopMobile(page, {
      desktopDevice: 'desktop-chrome',
      mobileDevice: 'iphone-14',
      testTablet: true,
      settleTime: 1000,
    });
    console.log(`  ✓ Desktop state captured`);
    console.log(`  ✓ Mobile state captured`);
    console.log(`  ✓ Tablet state captured`);
    console.log(`  ✓ Differences found: ${deviceResults.differences?.length || 0}`);

    results.phases.devices = deviceResults;

    // ============================================
    // PHASE 9: Robust state exploration
    // ============================================
    console.log('\n[Phase 9] Running state exploration...');

    // Navigate fresh - scripts should already be injected via addInitScript
    await page.goto(TEST_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Verify state hash function is available
    const hashCheck = await page.evaluate(() => {
      if (typeof window.__getrobustStateHash === 'function') {
        return window.__getrobustStateHash();
      }
      return null;
    });
    console.log(`  State hash available: ${hashCheck ? 'YES (' + hashCheck.hash + ')' : 'NO'}`);

    let explorationResults = { statesExplored: 0, actionsPerformed: 0, uniqueStates: 0 };

    if (hashCheck) {
      try {
        explorationResults = await robustStateExplorer.explore(page, {
          maxStates: 5,  // Minimal for fast testing
          maxDepth: 1,
          actionTimeout: 1000,
          onProgress: (p) => {
            process.stdout.write(`\r  States: ${p.statesExplored}, Depth: ${p.currentDepth}, Queue: ${p.queueSize}`);
          },
        });
        console.log(`\n  ✓ States explored: ${explorationResults.statesExplored}`);
        console.log(`  ✓ Actions performed: ${explorationResults.actionsPerformed}`);
        console.log(`  ✓ Unique states found: ${explorationResults.uniqueStates}`);
      } catch (err) {
        console.log(`\n  ⚠ Exploration error: ${err.message}`);
        explorationResults = { statesExplored: 0, actionsPerformed: 0, uniqueStates: 0, error: err.message };
      }
    } else {
      console.log('  ⚠ State hash not available, skipping exploration');
    }

    // Clean up exploration results
    const cleanedExplorationResults = JSON.parse(JSON.stringify(explorationResults, (key, value) => {
      if (typeof value === 'function') return undefined;
      if (value instanceof Set) return [...value];
      return value;
    }));
    results.phases.exploration = cleanedExplorationResults;

    // ============================================
    // PHASE 10: Coverage verification
    // ============================================
    console.log('\n[Phase 10] Verifying coverage...');
    await page.evaluate(coverageVerifier.getInjectionScript());
    const coverage = await coverageVerifier.verify(page, cleanedExplorationResults);

    console.log(`  ✓ Interactive elements: ${coverage.static?.interactiveElements || 0}`);
    console.log(`  ✓ Elements explored: ${coverage.dynamic?.elementsInteracted?.size || coverage.dynamic?.elementsInteracted?.length || 0}`);
    console.log(`  ✓ Coverage complete: ${coverage.isComplete ? 'YES' : 'NO'}`);

    results.phases.coverage = coverage;

    // ============================================
    // SAVE RESULTS
    // ============================================
    console.log('\n[Saving] Writing results to disk...');

    // Save full results
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'extraction-results.json'),
      JSON.stringify(results, (key, value) => {
        if (value instanceof Set) return [...value];
        return value;
      }, 2)
    );

    // Save summary
    const summary = {
      url: TEST_URL,
      timestamp: results.timestamp,
      stats: {
        staticCapture: stats,
        eventListeners: eventData.listeners?.length || 0,
        removedListeners: eventData.removed?.length || 0,
        inlineHandlers: eventData.inline?.length || 0,
        apiRequests: (apiData.fetchRequests?.length || 0) + (apiData.xhrRequests?.length || 0),
        websocketConnections: apiData.websocketConnections?.length || 0,
        workerScripts: Object.keys(workerData.workerScripts || {}).length,
        keyboardShortcuts: keyboardResults.shortcuts?.length || 0,
        breakpointsDetected: breakpointResults.detectedBreakpoints?.length || 0,
        deviceDifferences: deviceResults.differences?.length || 0,
        statesExplored: explorationResults.statesExplored || 0,
        coverageComplete: coverage.isComplete,
      },
    };

    await fs.writeFile(
      path.join(OUTPUT_DIR, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );

    // Generate mock server if API data exists
    if (apiData.fetchRequests?.length > 0 || apiData.xhrRequests?.length > 0) {
      const mockServer = apiRecorder.generateMockServer(apiData);
      await fs.writeFile(
        path.join(OUTPUT_DIR, 'mock-server.js'),
        mockServer
      );
      console.log('  ✓ Mock server generated');
    }

    // Generate responsive CSS
    if (breakpointResults.detectedBreakpoints?.length > 0) {
      const responsiveCSS = viewportBreakpointTester.generateResponsiveCSS(breakpointResults);
      await fs.writeFile(
        path.join(OUTPUT_DIR, 'responsive-breakpoints.css'),
        responsiveCSS
      );
      console.log('  ✓ Responsive CSS generated');
    }

    console.log('  ✓ Results saved to', OUTPUT_DIR);

    // ============================================
    // FINAL REPORT
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('EXTRACTION COMPLETE');
    console.log('='.repeat(60));
    console.log(`
Summary:
  - Static items captured: ${stats.total}
  - Event listeners: ${summary.stats.eventListeners}
  - Inline handlers: ${summary.stats.inlineHandlers}
  - API endpoints recorded: ${summary.stats.apiRequests}
  - WebSocket connections: ${summary.stats.websocketConnections}
  - Worker scripts: ${summary.stats.workerScripts}
  - Keyboard shortcuts: ${summary.stats.keyboardShortcuts}
  - Breakpoints detected: ${summary.stats.breakpointsDetected}
  - Device differences: ${summary.stats.deviceDifferences}
  - States explored: ${summary.stats.statesExplored}
  - Coverage complete: ${summary.stats.coverageComplete ? 'YES' : 'NO'}

Output files:
  - ${OUTPUT_DIR}/extraction-results.json (full data)
  - ${OUTPUT_DIR}/summary.json (stats)
  - ${OUTPUT_DIR}/mock-server.js (API mocks)
  - ${OUTPUT_DIR}/responsive-breakpoints.css (breakpoints)
`);

  } catch (error) {
    console.error('\n[ERROR]', error.message);
    console.error(error.stack);
    results.error = error.message;
  } finally {
    await browser.close();
  }
}

// Run the test
runTest().catch(console.error);
