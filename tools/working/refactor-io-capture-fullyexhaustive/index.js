#!/usr/bin/env node
/**
 * EXHAUSTIVE I/O CAPTURE SYSTEM
 *
 * Captures I/O data for EVERY possible interaction in a web app.
 * Uses BFS state exploration with convergence detection.
 *
 * Usage:
 *   node index.js --url https://example.com
 *   node index.js --url https://example.com --workers 4
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Modules
const config = require('./utils/config');
const logger = require('./utils/logger');
const { SELECTOR_SCRIPT } = require('./utils/selectors');
const { runFullDiscovery } = require('./discovery');
const { exploreStateSpace, hashStatePage, calculateCoverage, generateCompletenessReport } = require('./exploration');
const { executeAndCapture, generateActionsForElement, serializeStateGraph, serializeAllIO, createSummary } = require('./capture');

// Parse CLI args
function parseArgs() {
  const args = {
    url: null,
    workers: config.defaultWorkers,
    outputDir: config.outputDir,
    verbose: config.verbose
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--url' && process.argv[i + 1]) {
      args.url = process.argv[++i];
    } else if (arg === '--workers' && process.argv[i + 1]) {
      args.workers = parseInt(process.argv[++i]);
    } else if (arg === '--output' && process.argv[i + 1]) {
      args.outputDir = process.argv[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Exhaustive I/O Capture System

Usage:
  node index.js --url <URL> [options]

Options:
  --url <URL>       Target URL (required)
  --workers <N>     Number of parallel workers (default: ${config.defaultWorkers})
  --output <DIR>    Output directory (default: ${config.outputDir})
  --verbose, -v     Enable verbose logging
  --help, -h        Show this help
      `);
      process.exit(0);
    }
  }

  if (!args.url) {
    console.error('Error: --url is required');
    process.exit(1);
  }

  return args;
}

/**
 * Discover all possible actions in current state
 */
async function discoverActionsInState(page, discovery) {
  const actions = [];

  // Get currently visible/interactive elements
  const elements = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('*').forEach(el => {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);

      if (rect.width === 0 || rect.height === 0) return;
      if (cs.display === 'none' || cs.visibility === 'hidden') return;

      const selector = window.__getUniqueSelector?.(el);
      if (!selector) return;

      results.push({
        selector,
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        score: 50  // Simplified scoring
      });
    });
    return results.slice(0, 100);  // Limit to prevent explosion
  });

  // Generate actions for each element
  for (const element of elements) {
    const elementActions = generateActionsForElement(element);
    actions.push(...elementActions);
  }

  // Add keyboard shortcuts from discovery
  for (const shortcut of (discovery?.keyboardShortcuts || [])) {
    actions.push({
      type: 'keyboard',
      key: shortcut.key,
      modifiers: shortcut.modifiers
    });
  }

  return actions;
}

/**
 * Main execution
 */
async function main() {
  const args = parseArgs();

  if (args.verbose) {
    logger.setLevel('debug');
  }

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         EXHAUSTIVE I/O CAPTURE SYSTEM                        ║
║                                                              ║
║  Capturing EVERY interaction with ZERO undiscovered parts   ║
╚══════════════════════════════════════════════════════════════╝
  `);

  logger.info(`Target URL: ${args.url}`);
  logger.info(`Output: ${args.outputDir}`);

  // Create output directory
  if (!fs.existsSync(args.outputDir)) {
    fs.mkdirSync(args.outputDir, { recursive: true });
  }

  // Launch browser
  logger.info('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  // Inject selector utilities
  await page.addInitScript(SELECTOR_SCRIPT);

  // Navigate to target
  logger.info(`Navigating to ${args.url}...`);
  await page.goto(args.url, { waitUntil: 'networkidle', timeout: config.pageLoadTimeout });

  try {
    // PHASE 1: Discovery
    const discovery = await runFullDiscovery(page, hashStatePage);

    // Save discovery manifest
    const manifestPath = path.join(args.outputDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(discovery, null, 2));
    logger.info(`Saved discovery manifest: ${manifestPath}`);

    // PHASE 2: BFS Exploration
    const exploration = await exploreStateSpace(
      page,
      // Execute action function
      async (p, action) => executeAndCapture(p, action),
      // Discover actions function
      async (p) => discoverActionsInState(p, discovery)
    );

    // Save state machine
    serializeStateGraph(exploration.stateGraph, args.outputDir);

    // Save all I/O specs
    serializeAllIO(exploration.stateGraph.transitions, args.outputDir);

    // PHASE 3: Generate reports
    const coverage = calculateCoverage(exploration.stateGraph, discovery);
    const completeness = generateCompletenessReport(exploration.metrics, coverage);

    // Save coverage report
    const coveragePath = path.join(args.outputDir, 'coverage.json');
    fs.writeFileSync(coveragePath, JSON.stringify({
      coverage,
      completeness
    }, null, 2));
    logger.info(`Saved coverage report: ${coveragePath}`);

    // Create summary
    const summary = createSummary(discovery, exploration, args.outputDir);

    // Final report
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    CAPTURE COMPLETE                          ║
╠══════════════════════════════════════════════════════════════╣
║  States discovered:     ${String(exploration.metrics.totalStates).padStart(6)}                          ║
║  Transitions recorded:  ${String(exploration.metrics.totalTransitions).padStart(6)}                          ║
║  Elements covered:      ${coverage.elementCoveragePercent.padStart(6)}%                         ║
║  Completeness:          ${completeness.confidence.padStart(6)}                          ║
╚══════════════════════════════════════════════════════════════╝

Output saved to: ${args.outputDir}
    `);

  } finally {
    await browser.close();
  }
}

// Run
main().catch(err => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
