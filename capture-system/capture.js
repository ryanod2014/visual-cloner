#!/usr/bin/env node
/**
 * 100% I/O Capture - Live App Injection
 *
 * Instead of extracting code and running it in isolation (34% success),
 * this approach injects capture hooks into the LIVE Photopea application
 * where real objects (Document, Layer, etc.) exist with proper `this` context.
 *
 * Expected: 90%+ function coverage
 */

const fs = require('fs').promises;
const path = require('path');
const { analyzeSource } = require('./lib/static-analysis');
const { launchBrowserPool, loadPhotopeaInBrowser, closeBrowserPool } = require('./lib/browser-pool');
const { injectCaptureHooks } = require('./lib/hook-injector');
const { exercisePhotopea, partitionExercises } = require('./lib/exerciser');
const { collectCoverage, mergeCoverage, sweepGaps, identifyUncalledMethods } = require('./lib/coverage-merger');

const NUM_BROWSERS = parseInt(process.env.BROWSERS) || 4;
const PHOTOPEA_URL = process.env.PHOTOPEA_URL || 'https://www.photopea.com';
const SOURCE_FILE = process.argv[2] || path.join(__dirname, '..', '..', '..', 'clean-room-cloner', 'extracted', 'photopea-v5-extracted.js');

async function main() {
  console.log('═'.repeat(60));
  console.log('100% I/O CAPTURE - LIVE APP INJECTION');
  console.log('═'.repeat(60));
  console.log(`Browsers: ${NUM_BROWSERS}`);
  console.log(`Photopea URL: ${PHOTOPEA_URL}`);
  console.log(`Source File: ${SOURCE_FILE}`);
  console.log('');

  console.time('TOTAL TIME');

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1: Static analysis + browser pre-launch (parallel)
  // ═══════════════════════════════════════════════════════════════
  console.log('PHASE 1: Static analysis + browser pre-launch');
  console.time('Phase 1');

  let source;
  try {
    source = await fs.readFile(SOURCE_FILE, 'utf8');
  } catch (e) {
    console.error(`Could not read source file: ${e.message}`);
    console.log('Continuing with minimal static analysis...');
    source = ''; // Will use runtime discovery
  }

  const [analysis, browsers] = await Promise.all([
    analyzeSource(source),
    launchBrowserPool(NUM_BROWSERS)
  ]);

  console.log(`  Classes found: ${analysis.classes.length}`);
  console.log(`  Prototype methods: ${analysis.prototypeMethods.length}`);
  console.log(`  Global functions: ${analysis.globalFunctions.length}`);
  console.timeEnd('Phase 1');
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2: Load REAL Photopea in all browsers
  // ═══════════════════════════════════════════════════════════════
  console.log('PHASE 2: Loading Photopea in all browsers');
  console.time('Phase 2');

  const pages = [];
  for (let i = 0; i < browsers.length; i++) {
    try {
      console.log(`  Loading browser ${i + 1}/${browsers.length}...`);
      const page = await loadPhotopeaInBrowser(browsers[i], PHOTOPEA_URL);
      pages.push(page);
    } catch (e) {
      console.error(`  Browser ${i + 1} failed: ${e.message}`);
    }
  }

  console.log(`  ${pages.length} browsers loaded with Photopea`);
  console.timeEnd('Phase 2');
  console.log('');

  if (pages.length === 0) {
    console.error('No browsers loaded successfully. Exiting.');
    await closeBrowserPool(browsers);
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: Inject capture hooks
  // ═══════════════════════════════════════════════════════════════
  console.log('PHASE 3: Injecting capture hooks');
  console.time('Phase 3');

  for (let i = 0; i < pages.length; i++) {
    try {
      console.log(`  Injecting hooks in browser ${i + 1}...`);
      await injectCaptureHooks(pages[i], analysis);
    } catch (e) {
      console.error(`  Browser ${i + 1} hook injection failed: ${e.message}`);
    }
  }

  console.log('  Hooks injected in all browsers');
  console.timeEnd('Phase 3');
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4: Exercise app (parallel)
  // ═══════════════════════════════════════════════════════════════
  console.log('PHASE 4: Exercising Photopea');
  console.time('Phase 4');

  const partitions = partitionExercises(pages.length);

  await Promise.all(
    pages.map((page, i) => {
      console.log(`  Browser ${i + 1}: Exercising (${partitions[i].focusArea})`);
      return exercisePhotopea(page, partitions[i]).catch(e => {
        console.error(`  Browser ${i + 1} exercise error: ${e.message}`);
      });
    })
  );

  console.timeEnd('Phase 4');
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // PHASE 5: Collect and merge coverage
  // ═══════════════════════════════════════════════════════════════
  console.log('PHASE 5: Collecting coverage');
  console.time('Phase 5');

  const results = await Promise.all(
    pages.map(page => collectCoverage(page).catch(e => {
      console.error(`Collection error: ${e.message}`);
      return { io: [], calledFunctions: [], wrappedMethods: [] };
    }))
  );

  const merged = mergeCoverage(results);

  console.log(`  Methods wrapped: ${merged.totalWrapped}`);
  console.log(`  Functions called: ${merged.uniqueFunctions}`);
  console.log(`  I/O pairs: ${merged.totalCaptures}`);
  console.timeEnd('Phase 5');
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // PHASE 6: Gap sweep (try to call uncalled methods)
  // ═══════════════════════════════════════════════════════════════
  console.log('PHASE 6: Gap sweep');
  console.time('Phase 6');

  const uncalled = identifyUncalledMethods(analysis, merged.calledFunctions);
  console.log(`  Uncalled methods: ${uncalled.length}`);

  if (uncalled.length > 0 && pages.length > 0) {
    await sweepGaps(pages[0], uncalled);

    // Collect again after sweep
    const sweepResults = await Promise.all(
      pages.map(page => collectCoverage(page).catch(() => ({ io: [], calledFunctions: [], wrappedMethods: [] })))
    );
    const sweepMerged = mergeCoverage(sweepResults);

    console.log(`  After sweep - Functions called: ${sweepMerged.uniqueFunctions}`);
    console.log(`  After sweep - I/O pairs: ${sweepMerged.totalCaptures}`);

    // Update merged with sweep results
    Object.assign(merged, sweepMerged);
  }

  console.timeEnd('Phase 6');
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════════════════════════
  const totalMethods = analysis.prototypeMethods.length + analysis.globalFunctions.length;
  const coverage = totalMethods > 0 ? (merged.uniqueFunctions / totalMethods * 100).toFixed(2) : 0;

  // Count successful vs error I/O
  const successfulIO = merged.io.filter(io => !io.error).length;
  const errorIO = merged.io.filter(io => io.error).length;

  console.log('═'.repeat(60));
  console.log('FINAL REPORT');
  console.log('═'.repeat(60));
  console.log(`Total methods found:     ${totalMethods}`);
  console.log(`Methods wrapped:         ${merged.totalWrapped}`);
  console.log(`Functions called:        ${merged.uniqueFunctions}`);
  console.log(`Coverage:                ${coverage}%`);
  console.log(`Total I/O pairs:         ${merged.totalCaptures}`);
  console.log(`  Successful:            ${successfulIO}`);
  console.log(`  With errors:           ${errorIO}`);
  console.log('');
  console.timeEnd('TOTAL TIME');

  // ═══════════════════════════════════════════════════════════════
  // SAVE OUTPUT
  // ═══════════════════════════════════════════════════════════════
  const outputDir = path.join(__dirname, 'output', 'captured-io');
  await fs.mkdir(outputDir, { recursive: true });

  // Save all I/O
  await fs.writeFile(
    path.join(outputDir, 'all-io.json'),
    JSON.stringify(merged.io, null, 2)
  );

  // Save per-function I/O
  for (const [fnName, ios] of Object.entries(merged.byFunction || {})) {
    const safeName = fnName.replace(/[^a-zA-Z0-9._-]/g, '_');
    await fs.writeFile(
      path.join(outputDir, `${safeName}.json`),
      JSON.stringify({
        function: fnName,
        results: ios.map(io => ({
          input: io.input,
          output: io.output,
          error: io.error || null
        }))
      }, null, 2)
    );
  }

  // Save coverage report
  await fs.writeFile(
    path.join(outputDir, 'coverage-report.json'),
    JSON.stringify({
      totalMethods,
      wrappedMethods: merged.totalWrapped,
      capturedMethods: merged.uniqueFunctions,
      coverage: parseFloat(coverage),
      calledFunctions: merged.calledFunctions,
      totalIOPairs: merged.totalCaptures,
      successfulIO,
      errorIO,
      functionStats: merged.functionStats
    }, null, 2)
  );

  console.log(`\nOutput saved to: ${outputDir}`);

  // Cleanup
  await closeBrowserPool(browsers);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
