#!/usr/bin/env node
/**
 * CAPTURE V2 - Comprehensive Photopea capture with better test images
 *
 * Focus on WORKING methods with:
 * - 4 test images: gradient, color, edges, noise
 * - Full parameter coverage (min/mid/max)
 * - All working API methods
 */

const fs = require('fs').promises;
const path = require('path');
const playwright = require('playwright');
const PNG = require('pngjs').PNG;

const PARALLEL_BROWSERS = parseInt(process.env.PARALLEL) || 4;
const DOC_WIDTH = 100;
const DOC_HEIGHT = 100;

// Better test images that reveal filter effects
const TEST_IMAGES = {
  // Gradient: black→gray→white for blur/sharpen/edge effects
  gradient: {
    name: 'gradient',
    description: 'Smooth gradient for blur/sharpen visibility',
    script: `
      var doc = app.activeDocument;
      for (var x = 0; x < 100; x++) {
        var gray = new SolidColor();
        var val = Math.floor(x * 2.55);
        gray.rgb.red = val; gray.rgb.green = val; gray.rgb.blue = val;
        doc.selection.select([[x, 0], [x+1, 0], [x+1, 100], [x, 100]]);
        doc.selection.fill(gray);
      }
      doc.selection.deselect();
    `
  },

  // Color: red/green/blue stripes for color operations
  color: {
    name: 'color',
    description: 'RGB stripes for hue/saturation visibility',
    script: `
      var doc = app.activeDocument;
      var red = new SolidColor(); red.rgb.red = 255; red.rgb.green = 0; red.rgb.blue = 0;
      var green = new SolidColor(); green.rgb.red = 0; green.rgb.green = 255; green.rgb.blue = 0;
      var blue = new SolidColor(); blue.rgb.red = 0; blue.rgb.green = 0; blue.rgb.blue = 255;
      doc.selection.select([[0, 0], [33, 0], [33, 100], [0, 100]]); doc.selection.fill(red);
      doc.selection.select([[33, 0], [66, 0], [66, 100], [33, 100]]); doc.selection.fill(green);
      doc.selection.select([[66, 0], [100, 0], [100, 100], [66, 100]]); doc.selection.fill(blue);
      doc.selection.deselect();
    `
  },

  // Edges: checkerboard pattern for edge detection
  edges: {
    name: 'edges',
    description: 'Checkerboard for edge/sharpen visibility',
    script: `
      var doc = app.activeDocument;
      var black = new SolidColor(); black.rgb.red = 0; black.rgb.green = 0; black.rgb.blue = 0;
      var white = new SolidColor(); white.rgb.red = 255; white.rgb.green = 255; white.rgb.blue = 255;
      doc.selection.selectAll(); doc.selection.fill(white); doc.selection.deselect();
      for (var y = 0; y < 10; y++) {
        for (var x = 0; x < 10; x++) {
          if ((x + y) % 2 === 0) {
            doc.selection.select([[x*10, y*10], [x*10+10, y*10], [x*10+10, y*10+10], [x*10, y*10+10]]);
            doc.selection.fill(black);
          }
        }
      }
      doc.selection.deselect();
    `
  },

  // Multilevel: 5 gray steps for posterize/threshold
  multilevel: {
    name: 'multilevel',
    description: '5 gray levels for level-based operations',
    script: `
      var doc = app.activeDocument;
      var levels = [0, 64, 128, 192, 255];
      for (var i = 0; i < 5; i++) {
        var gray = new SolidColor();
        gray.rgb.red = levels[i]; gray.rgb.green = levels[i]; gray.rgb.blue = levels[i];
        doc.selection.select([[i*20, 0], [i*20+20, 0], [i*20+20, 100], [i*20, 100]]);
        doc.selection.fill(gray);
      }
      doc.selection.deselect();
    `
  }
};

// All WORKING operations with full parameter coverage
const OPERATIONS = [
  // === INVERT (1 op) ===
  { name: 'Invert', script: 'app.activeDocument.activeLayer.invert()', category: 'basic', testImage: 'multilevel' },

  // === DESATURATE (1 op) ===
  { name: 'Desaturate', script: 'app.activeDocument.activeLayer.desaturate()', category: 'basic', testImage: 'color' },

  // === BRIGHTNESS/CONTRAST - Full range (45 ops) ===
  ...([-100, -75, -50, -25, 0, 25, 50, 75, 100].flatMap(b =>
    [-100, -50, 0, 50, 100].map(c => ({
      name: `BrightnessContrast_b${b}_c${c}`,
      script: `app.activeDocument.activeLayer.adjustBrightnessContrast(${b}, ${c})`,
      category: 'brightness',
      params: { brightness: b, contrast: c },
      testImage: 'multilevel'
    }))
  )),

  // === GAUSSIAN BLUR - Fine-grained (15 ops) ===
  ...([0.3, 0.5, 1, 2, 3, 5, 8, 10, 15, 20, 25, 30, 40, 50, 75].map(r => ({
    name: `GaussianBlur_${r}`,
    script: `app.activeDocument.activeLayer.applyGaussianBlur(${r})`,
    category: 'blur',
    params: { radius: r },
    testImage: 'edges'
  }))),

  // === MOTION BLUR - All angles (27 ops) ===
  ...([0, 30, 45, 60, 90, 120, 135, 150, 180].flatMap(a =>
    [5, 15, 30].map(d => ({
      name: `MotionBlur_a${a}_d${d}`,
      script: `app.activeDocument.activeLayer.applyMotionBlur(${a}, ${d})`,
      category: 'blur',
      params: { angle: a, distance: d },
      testImage: 'edges'
    }))
  )),

  // === HIGH PASS - Full range (12 ops) ===
  ...([0.5, 1, 2, 3, 5, 8, 10, 15, 20, 30, 50, 100].map(r => ({
    name: `HighPass_${r}`,
    script: `app.activeDocument.activeLayer.applyHighPass(${r})`,
    category: 'other',
    params: { radius: r },
    testImage: 'edges'
  }))),

  // === ADD NOISE - Uniform & Gaussian (20 ops) ===
  ...([5, 10, 15, 25, 50, 75, 100, 150, 200, 400].flatMap(a => [
    {
      name: `AddNoise_uniform_${a}`,
      script: `app.activeDocument.activeLayer.applyAddNoise(${a}, NoiseDistribution.UNIFORM, false)`,
      category: 'noise',
      params: { amount: a, distribution: 'uniform', monochromatic: false },
      testImage: 'multilevel'
    },
    {
      name: `AddNoise_gaussian_${a}`,
      script: `app.activeDocument.activeLayer.applyAddNoise(${a}, NoiseDistribution.GAUSSIAN, false)`,
      category: 'noise',
      params: { amount: a, distribution: 'gaussian', monochromatic: false },
      testImage: 'multilevel'
    }
  ])),

  // === MONOCHROMATIC NOISE (10 ops) ===
  ...([5, 10, 25, 50, 100].flatMap(a => [
    {
      name: `AddNoise_uniform_mono_${a}`,
      script: `app.activeDocument.activeLayer.applyAddNoise(${a}, NoiseDistribution.UNIFORM, true)`,
      category: 'noise',
      params: { amount: a, distribution: 'uniform', monochromatic: true },
      testImage: 'multilevel'
    },
    {
      name: `AddNoise_gaussian_mono_${a}`,
      script: `app.activeDocument.activeLayer.applyAddNoise(${a}, NoiseDistribution.GAUSSIAN, true)`,
      category: 'noise',
      params: { amount: a, distribution: 'gaussian', monochromatic: true },
      testImage: 'multilevel'
    }
  ])),

  // === MAXIMUM - Full range (10 ops) ===
  ...([1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map(r => ({
    name: `Maximum_${r}`,
    script: `app.activeDocument.activeLayer.applyMaximum(${r})`,
    category: 'morphology',
    params: { radius: r },
    testImage: 'edges'
  }))),

  // === MINIMUM - Full range (10 ops) ===
  ...([1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map(r => ({
    name: `Minimum_${r}`,
    script: `app.activeDocument.activeLayer.applyMinimum(${r})`,
    category: 'morphology',
    params: { radius: r },
    testImage: 'edges'
  }))),

  // === WAVE - Various params (20 ops) ===
  ...([1, 2, 3, 5].flatMap(gen =>
    [10, 30, 100].flatMap(wl =>
      [5, 20].map(amp => ({
        name: `Wave_g${gen}_w${wl}_a${amp}`,
        script: `app.activeDocument.activeLayer.applyWave(${gen}, ${gen}, ${wl}, ${wl}, ${amp}, ${amp}, "SINE", "WRAP", 0)`,
        category: 'distort',
        params: { generators: gen, wavelength: wl, amplitude: amp },
        testImage: 'edges'
      }))
    )
  )).slice(0, 20),

  // === RIPPLE - Various params (12 ops) ===
  ...([100, 300, 500, 999].flatMap(a =>
    ['SMALL', 'MEDIUM', 'LARGE'].map(s => ({
      name: `Ripple_${a}_${s}`,
      script: `app.activeDocument.activeLayer.applyRipple(${a}, "${s}")`,
      category: 'distort',
      params: { amount: a, size: s },
      testImage: 'edges'
    }))
  )),

  // === AUTO ADJUSTMENTS (3 ops) ===
  { name: 'AutoTone', script: 'app.activeDocument.autoTone()', category: 'auto', testImage: 'gradient' },
  { name: 'AutoContrast', script: 'app.activeDocument.autoContrast()', category: 'auto', testImage: 'gradient' },
  { name: 'AutoColor', script: 'app.activeDocument.autoColor()', category: 'auto', testImage: 'color' },

  // === DIFFERENCE CLOUDS (1 op) ===
  { name: 'DifferenceClouds', script: 'app.activeDocument.activeLayer.applyDifferenceClouds()', category: 'render', testImage: 'multilevel' },
];

async function main() {
  console.log('═'.repeat(60));
  console.log('CAPTURE V2 - Comprehensive with Better Test Images');
  console.log('═'.repeat(60));
  console.log(`Total operations: ${OPERATIONS.length}`);
  console.log(`Test images: ${Object.keys(TEST_IMAGES).length}`);
  console.log(`Parallel browsers: ${PARALLEL_BROWSERS}`);
  console.log('');

  const startTime = Date.now();

  // Group by test image for logging
  const byTestImage = {};
  for (const op of OPERATIONS) {
    const img = op.testImage;
    if (!byTestImage[img]) byTestImage[img] = [];
    byTestImage[img].push(op);
  }
  console.log('Operations by test image:');
  for (const [img, ops] of Object.entries(byTestImage)) {
    console.log(`  ${img}: ${ops.length}`);
  }
  console.log('');

  // Split into chunks
  const chunks = [];
  const chunkSize = Math.ceil(OPERATIONS.length / PARALLEL_BROWSERS);
  for (let i = 0; i < OPERATIONS.length; i += chunkSize) {
    chunks.push(OPERATIONS.slice(i, i + chunkSize));
  }

  console.log(`Starting ${chunks.length} parallel workers...\n`);

  const results = await Promise.all(
    chunks.map((ops, idx) => runWorker(idx, ops))
  );

  const allResults = results.flat();

  // Save output
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputDir = path.join(__dirname, 'output', `v2-${timestamp}`);
  await fs.mkdir(outputDir, { recursive: true });

  // All operations
  await fs.writeFile(
    path.join(outputDir, 'all-operations.json'),
    JSON.stringify(allResults, null, 2)
  );

  // By category
  const byCategory = {};
  for (const r of allResults) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }
  for (const [cat, ops] of Object.entries(byCategory)) {
    await fs.writeFile(
      path.join(outputDir, `category-${cat}.json`),
      JSON.stringify(ops, null, 2)
    );
  }

  // Summary
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
      Object.entries(byCategory).map(([k, v]) => [
        k,
        { total: v.length, withChanges: v.filter(r => r.diff?.changedPixels > 0).length }
      ])
    ),
    testImages: Object.keys(TEST_IMAGES)
  };
  await fs.writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));

  // Console summary
  console.log('\n' + '═'.repeat(60));
  console.log('CAPTURE COMPLETE');
  console.log('═'.repeat(60));
  console.log(`Time: ${elapsed}s`);
  console.log(`Captured: ${allResults.length}/${OPERATIONS.length}`);
  console.log(`With pixel changes: ${withChanges} (${summary.percentWithChanges}%)`);
  console.log(`Output: ${outputDir}`);
  console.log('\nBy category:');
  for (const [cat, data] of Object.entries(summary.categories)) {
    console.log(`  ${cat}: ${data.total} ops, ${data.withChanges} with changes`);
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

    await runScript(page, `app.documents.add(${DOC_WIDTH}, ${DOC_HEIGHT}, 72, "Test", NewDocumentMode.RGB);`);
    await page.waitForTimeout(500);

    for (const op of operations) {
      // Apply test image
      const testImage = TEST_IMAGES[op.testImage];
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
        console.log(`[Worker ${workerId}] ${op.name}: ERROR`);
        continue;
      }

      // Capture after
      const after = await getPixels(page);
      if (!after) {
        console.log(`[Worker ${workerId}] ${op.name}: SKIP (no after)`);
        continue;
      }

      const diff = comparePixels(before.pixels, after.pixels);

      results.push({
        operation: op.name,
        category: op.category,
        params: op.params || {},
        testImage: op.testImage,
        script: op.script,
        input: { width: before.width, height: before.height, pixels: before.pixels },
        output: { width: after.width, height: after.height, pixels: after.pixels },
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
