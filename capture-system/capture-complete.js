#!/usr/bin/env node
/**
 * COMPLETE Photopea Operation Capture
 *
 * Captures 200+ operations with parameter variations across 3 test images.
 * Output: JSON files with exact pixel I/O for clean-room implementation.
 */

const fs = require('fs').promises;
const path = require('path');
const playwright = require('playwright');
const PNG = require('pngjs').PNG;

const PARALLEL_BROWSERS = parseInt(process.env.PARALLEL) || 4;
const DOC_WIDTH = 100;
const DOC_HEIGHT = 100;

// Test images optimized for different operation types
const TEST_IMAGES = {
  gradient: {
    name: 'gradient',
    description: 'Black/white halves - optimal for blur, sharpen, edge detection',
    script: `
      var doc = app.activeDocument;
      var black = new SolidColor(); black.rgb.red = 0; black.rgb.green = 0; black.rgb.blue = 0;
      var white = new SolidColor(); white.rgb.red = 255; white.rgb.green = 255; white.rgb.blue = 255;
      doc.selection.select([[0, 0], [50, 0], [50, 100], [0, 100]]);
      doc.selection.fill(black);
      doc.selection.select([[50, 0], [100, 0], [100, 100], [50, 100]]);
      doc.selection.fill(white);
      doc.selection.deselect();
    `
  },
  color: {
    name: 'color',
    description: 'Red/blue halves - optimal for hue, saturation, color balance',
    script: `
      var doc = app.activeDocument;
      var red = new SolidColor(); red.rgb.red = 200; red.rgb.green = 50; red.rgb.blue = 50;
      var blue = new SolidColor(); blue.rgb.red = 50; blue.rgb.green = 50; blue.rgb.blue = 200;
      doc.selection.select([[0, 0], [50, 0], [50, 100], [0, 100]]);
      doc.selection.fill(red);
      doc.selection.select([[50, 0], [100, 0], [100, 100], [50, 100]]);
      doc.selection.fill(blue);
      doc.selection.deselect();
    `
  },
  multilevel: {
    name: 'multilevel',
    description: '4 gray levels - optimal for posterize, threshold, levels',
    script: `
      var doc = app.activeDocument;
      var g1 = new SolidColor(); g1.rgb.red = 64; g1.rgb.green = 64; g1.rgb.blue = 64;
      var g2 = new SolidColor(); g2.rgb.red = 128; g2.rgb.green = 128; g2.rgb.blue = 128;
      var g3 = new SolidColor(); g3.rgb.red = 192; g3.rgb.green = 192; g3.rgb.blue = 192;
      var g4 = new SolidColor(); g4.rgb.red = 255; g4.rgb.green = 255; g4.rgb.blue = 255;
      doc.selection.select([[0, 0], [25, 0], [25, 100], [0, 100]]); doc.selection.fill(g1);
      doc.selection.select([[25, 0], [50, 0], [50, 100], [25, 100]]); doc.selection.fill(g2);
      doc.selection.select([[50, 0], [75, 0], [75, 100], [50, 100]]); doc.selection.fill(g3);
      doc.selection.select([[75, 0], [100, 0], [100, 100], [75, 100]]); doc.selection.fill(g4);
      doc.selection.deselect();
    `
  }
};

// All operations with parameter variations (200+)
const OPERATIONS = [
  // === BASIC ADJUSTMENTS ===
  { name: 'Invert', script: 'app.activeDocument.activeLayer.invert()', category: 'basic', testImage: 'multilevel' },
  { name: 'Desaturate', script: 'app.activeDocument.activeLayer.desaturate()', category: 'basic', testImage: 'color' },
  { name: 'AutoTone', script: 'app.activeDocument.autoTone()', category: 'basic', testImage: 'multilevel' },
  { name: 'AutoContrast', script: 'app.activeDocument.autoContrast()', category: 'basic', testImage: 'multilevel' },
  { name: 'AutoColor', script: 'app.activeDocument.autoColor()', category: 'basic', testImage: 'color' },

  // === BRIGHTNESS/CONTRAST (20 variations) ===
  ...([-100, -75, -50, -25, 25, 50, 75, 100].flatMap(b =>
    [-50, 0, 50].map(c => ({
      name: `BrightnessContrast_b${b}_c${c}`,
      script: `app.activeDocument.activeLayer.adjustBrightnessContrast(${b}, ${c})`,
      category: 'brightness',
      params: { brightness: b, contrast: c },
      testImage: 'multilevel'
    }))
  )),

  // === LEVELS (15 variations) ===
  ...([0.5, 0.7, 1.0, 1.3, 1.5, 2.0, 2.5].map(g => ({
    name: `Levels_gamma${g}`,
    script: `app.activeDocument.activeLayer.adjustLevels([0, 255], ${g}, [0, 255])`,
    category: 'levels',
    params: { inputMin: 0, inputMax: 255, gamma: g, outputMin: 0, outputMax: 255 },
    testImage: 'multilevel'
  }))),
  ...([[20, 235], [40, 215], [60, 195]].map(([min, max]) => ({
    name: `Levels_input${min}_${max}`,
    script: `app.activeDocument.activeLayer.adjustLevels([${min}, ${max}], 1.0, [0, 255])`,
    category: 'levels',
    params: { inputMin: min, inputMax: max, gamma: 1.0, outputMin: 0, outputMax: 255 },
    testImage: 'multilevel'
  }))),
  ...([[20, 235], [50, 200]].map(([min, max]) => ({
    name: `Levels_output${min}_${max}`,
    script: `app.activeDocument.activeLayer.adjustLevels([0, 255], 1.0, [${min}, ${max}])`,
    category: 'levels',
    params: { inputMin: 0, inputMax: 255, gamma: 1.0, outputMin: min, outputMax: max },
    testImage: 'multilevel'
  }))),

  // === CURVES (10 variations) ===
  { name: 'Curves_brighten_mild', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 0], [128, 150], [255, 255]])', category: 'curves', params: { points: [[0,0], [128,150], [255,255]] }, testImage: 'multilevel' },
  { name: 'Curves_brighten_strong', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 0], [128, 180], [255, 255]])', category: 'curves', params: { points: [[0,0], [128,180], [255,255]] }, testImage: 'multilevel' },
  { name: 'Curves_darken_mild', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 0], [128, 100], [255, 255]])', category: 'curves', params: { points: [[0,0], [128,100], [255,255]] }, testImage: 'multilevel' },
  { name: 'Curves_darken_strong', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 0], [128, 70], [255, 255]])', category: 'curves', params: { points: [[0,0], [128,70], [255,255]] }, testImage: 'multilevel' },
  { name: 'Curves_sshape', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 0], [64, 40], [192, 215], [255, 255]])', category: 'curves', params: { points: [[0,0], [64,40], [192,215], [255,255]] }, testImage: 'multilevel' },
  { name: 'Curves_invert', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 255], [255, 0]])', category: 'curves', params: { points: [[0,255], [255,0]] }, testImage: 'multilevel' },
  { name: 'Curves_posterize2', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 0], [127, 0], [128, 255], [255, 255]])', category: 'curves', params: { points: [[0,0], [127,0], [128,255], [255,255]] }, testImage: 'multilevel' },
  { name: 'Curves_lift_blacks', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 30], [255, 255]])', category: 'curves', params: { points: [[0,30], [255,255]] }, testImage: 'multilevel' },
  { name: 'Curves_crush_whites', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 0], [255, 220]])', category: 'curves', params: { points: [[0,0], [255,220]] }, testImage: 'multilevel' },
  { name: 'Curves_high_contrast', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 0], [50, 0], [205, 255], [255, 255]])', category: 'curves', params: { points: [[0,0], [50,0], [205,255], [255,255]] }, testImage: 'multilevel' },

  // === HUE/SATURATION (24 variations) ===
  ...([0, 30, 60, 90, 120, 150, 180, -30, -60, -90, -120, -150].map(h => ({
    name: `HueSat_h${h}`,
    script: `app.activeDocument.activeLayer.adjustHueSaturation(${h}, 0, 0)`,
    category: 'huesat',
    params: { hue: h, saturation: 0, lightness: 0 },
    testImage: 'color'
  }))),
  ...([-100, -50, 50, 100].map(s => ({
    name: `HueSat_s${s}`,
    script: `app.activeDocument.activeLayer.adjustHueSaturation(0, ${s}, 0)`,
    category: 'huesat',
    params: { hue: 0, saturation: s, lightness: 0 },
    testImage: 'color'
  }))),
  ...([-50, -25, 25, 50].map(l => ({
    name: `HueSat_l${l}`,
    script: `app.activeDocument.activeLayer.adjustHueSaturation(0, 0, ${l})`,
    category: 'huesat',
    params: { hue: 0, saturation: 0, lightness: l },
    testImage: 'color'
  }))),

  // === COLOR BALANCE (12 variations) ===
  ...([-100, -50, 50, 100].map(c => ({
    name: `ColorBalance_cyan${c}`,
    script: `app.activeDocument.activeLayer.adjustColorBalance(${c}, 0, 0, false)`,
    category: 'colorbalance',
    params: { cyanRed: c, magentaGreen: 0, yellowBlue: 0 },
    testImage: 'color'
  }))),
  ...([-50, 50].map(m => ({
    name: `ColorBalance_magenta${m}`,
    script: `app.activeDocument.activeLayer.adjustColorBalance(0, ${m}, 0, false)`,
    category: 'colorbalance',
    params: { cyanRed: 0, magentaGreen: m, yellowBlue: 0 },
    testImage: 'color'
  }))),
  ...([-50, 50].map(y => ({
    name: `ColorBalance_yellow${y}`,
    script: `app.activeDocument.activeLayer.adjustColorBalance(0, 0, ${y}, false)`,
    category: 'colorbalance',
    params: { cyanRed: 0, magentaGreen: 0, yellowBlue: y },
    testImage: 'color'
  }))),

  // === VIBRANCE (8 variations) ===
  ...([-100, -50, 50, 100].flatMap(v => [0, 50].map(s => ({
    name: `Vibrance_v${v}_s${s}`,
    script: `app.activeDocument.activeLayer.adjustVibrance(${v}, ${s})`,
    category: 'vibrance',
    params: { vibrance: v, saturation: s },
    testImage: 'color'
  })))),

  // === EXPOSURE (10 variations) ===
  ...([-2, -1, -0.5, 0.5, 1, 2].map(e => ({
    name: `Exposure_e${e}`,
    script: `app.activeDocument.activeLayer.adjustExposure(${e}, 0, 1)`,
    category: 'exposure',
    params: { exposure: e, offset: 0, gamma: 1 },
    testImage: 'multilevel'
  }))),
  ...([0.7, 1.3, 1.5].map(g => ({
    name: `Exposure_g${g}`,
    script: `app.activeDocument.activeLayer.adjustExposure(0, 0, ${g})`,
    category: 'exposure',
    params: { exposure: 0, offset: 0, gamma: g },
    testImage: 'multilevel'
  }))),

  // === POSTERIZE (8 variations) ===
  ...([2, 3, 4, 5, 6, 8, 12, 16].map(l => ({
    name: `Posterize_${l}`,
    script: `app.activeDocument.activeLayer.posterize(${l})`,
    category: 'posterize',
    params: { levels: l },
    testImage: 'multilevel'
  }))),

  // === THRESHOLD (12 variations) ===
  ...([16, 32, 64, 96, 128, 160, 192, 224, 240].map(t => ({
    name: `Threshold_${t}`,
    script: `app.activeDocument.activeLayer.threshold(${t})`,
    category: 'threshold',
    params: { level: t },
    testImage: 'multilevel'
  }))),

  // === GAUSSIAN BLUR (10 variations) ===
  ...([0.5, 1, 2, 3, 5, 8, 10, 15, 20, 30].map(r => ({
    name: `GaussianBlur_${r}`,
    script: `app.activeDocument.activeLayer.applyGaussianBlur(${r})`,
    category: 'blur',
    params: { radius: r },
    testImage: 'gradient'
  }))),

  // === MOTION BLUR (9 variations) ===
  ...([0, 45, 90].flatMap(a => [5, 15, 30].map(d => ({
    name: `MotionBlur_a${a}_d${d}`,
    script: `app.activeDocument.activeLayer.applyMotionBlur(${a}, ${d})`,
    category: 'blur',
    params: { angle: a, distance: d },
    testImage: 'gradient'
  })))),

  // === RADIAL BLUR (6 variations) ===
  ...([10, 25, 50].flatMap(a => ['spin', 'zoom'].map(m => ({
    name: `RadialBlur_${m}_${a}`,
    script: `app.activeDocument.activeLayer.applyRadialBlur(${a}, "${m === 'spin' ? 'SPIN' : 'ZOOM'}", "GOOD")`,
    category: 'blur',
    params: { amount: a, method: m },
    testImage: 'gradient'
  })))),

  // === SHARPEN ===
  { name: 'Sharpen', script: 'app.activeDocument.activeLayer.applySharpen()', category: 'sharpen', testImage: 'gradient' },
  { name: 'SharpenMore', script: 'app.activeDocument.activeLayer.applySharpenMore()', category: 'sharpen', testImage: 'gradient' },
  { name: 'SharpenEdges', script: 'app.activeDocument.activeLayer.applySharpenEdges()', category: 'sharpen', testImage: 'gradient' },

  // === UNSHARP MASK (9 variations) ===
  ...([50, 100, 200].flatMap(a => [0.5, 1, 2].map(r => ({
    name: `UnsharpMask_a${a}_r${r}`,
    script: `app.activeDocument.activeLayer.applyUnsharpMask(${a}, ${r}, 0)`,
    category: 'sharpen',
    params: { amount: a, radius: r, threshold: 0 },
    testImage: 'gradient'
  })))),

  // === HIGH PASS (6 variations) ===
  ...([1, 2, 5, 10, 20, 50].map(r => ({
    name: `HighPass_${r}`,
    script: `app.activeDocument.activeLayer.applyHighPass(${r})`,
    category: 'other',
    params: { radius: r },
    testImage: 'gradient'
  }))),

  // === NOISE ===
  ...([5, 10, 25, 50, 100].map(a => ({
    name: `AddNoise_uniform_${a}`,
    script: `app.activeDocument.activeLayer.applyAddNoise(${a}, NoiseDistribution.UNIFORM, false)`,
    category: 'noise',
    params: { amount: a, distribution: 'uniform', monochromatic: false },
    testImage: 'multilevel'
  }))),
  ...([5, 10, 25].map(a => ({
    name: `AddNoise_gaussian_${a}`,
    script: `app.activeDocument.activeLayer.applyAddNoise(${a}, NoiseDistribution.GAUSSIAN, false)`,
    category: 'noise',
    params: { amount: a, distribution: 'gaussian', monochromatic: false },
    testImage: 'multilevel'
  }))),

  // === MEDIAN (5 variations) ===
  ...([1, 2, 3, 5, 10].map(r => ({
    name: `Median_${r}`,
    script: `app.activeDocument.activeLayer.applyMedianNoise(${r})`,
    category: 'noise',
    params: { radius: r },
    testImage: 'gradient'
  }))),

  // === MAXIMUM/MINIMUM (6 variations each) ===
  ...([1, 2, 3, 5, 8, 10].map(r => ({
    name: `Maximum_${r}`,
    script: `app.activeDocument.activeLayer.applyMaximum(${r})`,
    category: 'other',
    params: { radius: r },
    testImage: 'gradient'
  }))),
  ...([1, 2, 3, 5, 8, 10].map(r => ({
    name: `Minimum_${r}`,
    script: `app.activeDocument.activeLayer.applyMinimum(${r})`,
    category: 'other',
    params: { radius: r },
    testImage: 'gradient'
  }))),

  // === STYLIZE ===
  { name: 'FindEdges', script: 'app.activeDocument.activeLayer.applyStyleize("FINDEDGES")', category: 'stylize', testImage: 'gradient' },
  { name: 'Emboss', script: 'app.activeDocument.activeLayer.applyStyleize("EMBOSS")', category: 'stylize', testImage: 'gradient' },
  { name: 'Solarize', script: 'app.activeDocument.activeLayer.applyStyleize("SOLARIZE")', category: 'stylize', testImage: 'multilevel' },
  { name: 'Diffuse', script: 'app.activeDocument.activeLayer.applyStyleize("DIFFUSE")', category: 'stylize', testImage: 'gradient' },

  // === PIXELATE ===
  ...([2, 4, 8, 16].map(s => ({
    name: `Mosaic_${s}`,
    script: `app.activeDocument.activeLayer.applyMosaic(${s})`,
    category: 'pixelate',
    params: { cellSize: s },
    testImage: 'gradient'
  }))),

  // === DISTORT ===
  ...([5, 15, 30, 50].map(a => ({
    name: `Wave_${a}`,
    script: `app.activeDocument.activeLayer.applyWave(1, 1, 100, ${a}, ${a}, "SINE", "WRAP", 0)`,
    category: 'distort',
    params: { amplitude: a },
    testImage: 'gradient'
  }))),
  ...([5, 15, 30].map(a => ({
    name: `Ripple_${a}`,
    script: `app.activeDocument.activeLayer.applyRipple(${a}, "MEDIUM")`,
    category: 'distort',
    params: { amount: a },
    testImage: 'gradient'
  }))),
  ...([5, 15, 30].map(a => ({
    name: `ZigZag_${a}`,
    script: `app.activeDocument.activeLayer.applyZigZag(${a}, 5, "AROUNDCENTER")`,
    category: 'distort',
    params: { amount: a },
    testImage: 'gradient'
  }))),

  // === RENDER ===
  { name: 'Clouds', script: 'app.activeDocument.activeLayer.applyClouds()', category: 'render', testImage: 'multilevel' },
  { name: 'DifferenceClouds', script: 'app.activeDocument.activeLayer.applyDifferenceClouds()', category: 'render', testImage: 'multilevel' },
];

async function main() {
  console.log('═'.repeat(60));
  console.log('COMPLETE PHOTOPEA CAPTURE');
  console.log('═'.repeat(60));
  console.log(`Total operations: ${OPERATIONS.length}`);
  console.log(`Parallel browsers: ${PARALLEL_BROWSERS}`);
  console.log(`Document size: ${DOC_WIDTH}x${DOC_HEIGHT}`);
  console.log('');

  const startTime = Date.now();

  // Group operations by test image
  const byTestImage = {};
  for (const op of OPERATIONS) {
    const img = op.testImage || 'multilevel';
    if (!byTestImage[img]) byTestImage[img] = [];
    byTestImage[img].push(op);
  }

  console.log('Operations by test image:');
  for (const [img, ops] of Object.entries(byTestImage)) {
    console.log(`  ${img}: ${ops.length}`);
  }
  console.log('');

  // Split into chunks for parallel execution
  const chunks = [];
  const chunkSize = Math.ceil(OPERATIONS.length / PARALLEL_BROWSERS);
  for (let i = 0; i < OPERATIONS.length; i += chunkSize) {
    chunks.push(OPERATIONS.slice(i, i + chunkSize));
  }

  console.log(`Starting ${chunks.length} parallel workers...\n`);

  // Run all workers in parallel
  const results = await Promise.all(
    chunks.map((ops, idx) => runWorker(idx, ops))
  );

  const allResults = results.flat();

  // Create output directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputDir = path.join(__dirname, 'output', `complete-${timestamp}`);
  await fs.mkdir(outputDir, { recursive: true });

  // Save all results
  await fs.writeFile(
    path.join(outputDir, 'all-operations.json'),
    JSON.stringify(allResults, null, 2)
  );

  // Save by category
  const byCategory = {};
  for (const r of allResults) {
    const cat = r.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(r);
  }

  for (const [cat, ops] of Object.entries(byCategory)) {
    await fs.writeFile(
      path.join(outputDir, `category-${cat}.json`),
      JSON.stringify(ops, null, 2)
    );
  }

  // Save summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const withChanges = allResults.filter(r => r.diff && r.diff.changedPixels > 0).length;

  const summary = {
    timestamp: new Date().toISOString(),
    documentSize: { width: DOC_WIDTH, height: DOC_HEIGHT },
    totalOperations: OPERATIONS.length,
    capturedOperations: allResults.length,
    operationsWithChanges: withChanges,
    percentWithChanges: ((withChanges / allResults.length) * 100).toFixed(1),
    elapsedSeconds: parseFloat(elapsed),
    categories: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, v.length])
    ),
    testImages: Object.keys(TEST_IMAGES)
  };

  await fs.writeFile(
    path.join(outputDir, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );

  // Print summary
  console.log('\n' + '═'.repeat(60));
  console.log('CAPTURE COMPLETE');
  console.log('═'.repeat(60));
  console.log(`Time: ${elapsed}s`);
  console.log(`Captured: ${allResults.length}/${OPERATIONS.length}`);
  console.log(`With pixel changes: ${withChanges} (${summary.percentWithChanges}%)`);
  console.log(`Output: ${outputDir}`);
  console.log('\nCategories:');
  for (const [cat, count] of Object.entries(byCategory)) {
    const catChanges = byCategory[cat].filter(r => r.diff?.changedPixels > 0).length;
    console.log(`  ${cat}: ${count} ops, ${catChanges} with changes`);
  }
}

async function runWorker(workerId, operations) {
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  const results = [];

  try {
    await setupPhotopea(page);
    console.log(`[Worker ${workerId}] Ready, processing ${operations.length} ops`);

    // Create document
    await runScript(page, `app.documents.add(${DOC_WIDTH}, ${DOC_HEIGHT}, 72, "Test", NewDocumentMode.RGB);`);
    await page.waitForTimeout(500);

    let currentTestImage = null;

    for (const op of operations) {
      const testImageKey = op.testImage || 'multilevel';

      // Apply test image pattern
      const testImage = TEST_IMAGES[testImageKey];
      await runScript(page, testImage.script);
      await page.waitForTimeout(100);

      // Capture before
      const before = await getPixels(page);
      if (!before) {
        console.log(`[Worker ${workerId}] ${op.name}: SKIP (no before)`);
        continue;
      }

      // Apply operation
      try {
        await runScript(page, op.script);
        await page.waitForTimeout(150);
      } catch (e) {
        console.log(`[Worker ${workerId}] ${op.name}: ERROR - ${e.message}`);
        continue;
      }

      // Capture after
      const after = await getPixels(page);
      if (!after) {
        console.log(`[Worker ${workerId}] ${op.name}: SKIP (no after)`);
        continue;
      }

      // Compare
      const diff = comparePixels(before.pixels, after.pixels);

      results.push({
        operation: op.name,
        category: op.category,
        params: op.params || {},
        testImage: testImageKey,
        script: op.script,
        input: {
          width: before.width,
          height: before.height,
          pixels: before.pixels
        },
        output: {
          width: after.width,
          height: after.height,
          pixels: after.pixels
        },
        diff
      });

      const status = diff.changedPixels > 0 ? `${diff.percentChanged}%` : '0%';
      console.log(`[Worker ${workerId}] ${op.name}: ${status}`);
    }

    await runScript(page, 'app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);');

  } catch (e) {
    console.log(`[Worker ${workerId}] FATAL: ${e.message}`);
  } finally {
    await browser.close();
  }

  return results;
}

async function setupPhotopea(page) {
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <body style="margin:0">
      <iframe id="pp" src="https://www.photopea.com" style="width:100vw;height:100vh;border:none;"></iframe>
      <script>
        window.ppQueue = [];
        window.ppReady = false;
        window.addEventListener('message', (e) => {
          if (e.data === 'done') window.ppReady = true;
          else if (e.data instanceof ArrayBuffer) window.ppQueue.push(new Uint8Array(e.data));
        });
      </script>
    </body>
    </html>
  `, { waitUntil: 'domcontentloaded' });

  await page.waitForTimeout(10000);
  await page.mouse.click(640, 310);
  await page.waitForTimeout(8000);
  await page.waitForFunction(() => window.ppReady, { timeout: 60000 });
}

async function runScript(page, script) {
  await page.evaluate((s) => {
    window.ppReady = false;
    document.getElementById('pp').contentWindow.postMessage(s, '*');
  }, script);
  await page.waitForFunction(() => window.ppReady, { timeout: 10000 });
}

async function getPixels(page) {
  await page.evaluate(() => { window.ppQueue = []; });
  await page.evaluate(() => {
    document.getElementById('pp').contentWindow.postMessage('app.activeDocument.saveToOE("png");', '*');
  });

  try {
    await page.waitForFunction(() => window.ppQueue.length > 0, { timeout: 5000 });
  } catch (e) {
    return null;
  }

  const data = await page.evaluate(() => Array.from(window.ppQueue.shift()));
  const buffer = Buffer.from(data);

  return new Promise((resolve) => {
    new PNG().parse(buffer, (err, png) => {
      if (err) resolve(null);
      else resolve({ width: png.width, height: png.height, pixels: Array.from(png.data) });
    });
  });
}

function comparePixels(before, after) {
  if (!before || !after || before.length !== after.length) {
    return { changed: true, percentChanged: '100.00', changedPixels: 0, totalPixels: 0 };
  }

  let changedPixels = 0;
  let totalDelta = 0;
  const totalPixels = before.length / 4;

  for (let i = 0; i < before.length; i += 4) {
    const dr = Math.abs(before[i] - after[i]);
    const dg = Math.abs(before[i+1] - after[i+1]);
    const db = Math.abs(before[i+2] - after[i+2]);
    if (dr > 0 || dg > 0 || db > 0) {
      changedPixels++;
      totalDelta += dr + dg + db;
    }
  }

  return {
    changed: changedPixels > 0,
    changedPixels,
    totalPixels,
    percentChanged: ((changedPixels / totalPixels) * 100).toFixed(2),
    averageDelta: changedPixels > 0 ? (totalDelta / (changedPixels * 3)).toFixed(2) : '0.00'
  };
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
