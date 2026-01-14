#!/usr/bin/env node
/**
 * FULL Pixel Capture System - All operations with correct API syntax
 */

const fs = require('fs').promises;
const path = require('path');
const playwright = require('playwright');
const PNG = require('pngjs').PNG;

const PARALLEL_BROWSERS = parseInt(process.env.PARALLEL) || 4;

// All operations with CORRECT Photopea API syntax
const OPERATIONS = [
  // === INVERT / DESATURATE ===
  { name: 'Invert', script: 'app.activeDocument.activeLayer.invert()' },
  { name: 'Desaturate', script: 'app.activeDocument.activeLayer.desaturate()' },

  // === AUTO ADJUSTMENTS ===
  { name: 'AutoTone', script: 'app.activeDocument.autoTone()' },
  { name: 'AutoContrast', script: 'app.activeDocument.autoContrast()' },
  { name: 'AutoColor', script: 'app.activeDocument.autoColor()' },

  // === BRIGHTNESS/CONTRAST (adjustBrightnessContrast) ===
  ...([[-50, 0], [-25, 0], [25, 0], [50, 0], [0, -50], [0, -25], [0, 25], [0, 50], [-25, -25], [25, 25], [50, 50]].map(([b, c]) => ({
    name: `BrightnessContrast_${b}_${c}`,
    script: `app.activeDocument.activeLayer.adjustBrightnessContrast(${b}, ${c})`,
    params: { brightness: b, contrast: c }
  }))),

  // === LEVELS (adjustLevels) ===
  { name: 'Levels_Default', script: 'app.activeDocument.activeLayer.adjustLevels([0, 255], 1.0, [0, 255])', params: { inputBlack: 0, inputWhite: 255, gamma: 1.0 } },
  { name: 'Levels_Crush', script: 'app.activeDocument.activeLayer.adjustLevels([20, 235], 1.0, [0, 255])', params: { inputBlack: 20, inputWhite: 235 } },
  { name: 'Levels_Gamma_0.5', script: 'app.activeDocument.activeLayer.adjustLevels([0, 255], 0.5, [0, 255])', params: { gamma: 0.5 } },
  { name: 'Levels_Gamma_1.5', script: 'app.activeDocument.activeLayer.adjustLevels([0, 255], 1.5, [0, 255])', params: { gamma: 1.5 } },
  { name: 'Levels_Gamma_2.0', script: 'app.activeDocument.activeLayer.adjustLevels([0, 255], 2.0, [0, 255])', params: { gamma: 2.0 } },
  { name: 'Levels_Output_20_235', script: 'app.activeDocument.activeLayer.adjustLevels([0, 255], 1.0, [20, 235])', params: { outputBlack: 20, outputWhite: 235 } },

  // === CURVES (adjustCurves) ===
  { name: 'Curves_Linear', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 0], [255, 255]])', params: { points: [[0,0], [255,255]] } },
  { name: 'Curves_Brighten', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 0], [128, 160], [255, 255]])', params: { points: [[0,0], [128,160], [255,255]] } },
  { name: 'Curves_Darken', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 0], [128, 96], [255, 255]])', params: { points: [[0,0], [128,96], [255,255]] } },
  { name: 'Curves_SShape', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 0], [64, 48], [192, 208], [255, 255]])', params: { points: [[0,0], [64,48], [192,208], [255,255]] } },
  { name: 'Curves_Invert', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 255], [255, 0]])', params: { points: [[0,255], [255,0]] } },

  // === HUE/SATURATION (adjustHueSaturation) ===
  ...([[0, 0, 0], [30, 0, 0], [-30, 0, 0], [0, 30, 0], [0, -30, 0], [0, 0, 20], [0, 0, -20], [180, 0, 0], [0, 50, 0], [0, -100, 0]].map(([h, s, l]) => ({
    name: `HueSat_${h}_${s}_${l}`,
    script: `app.activeDocument.activeLayer.adjustHueSaturation(${h}, ${s}, ${l})`,
    params: { hue: h, saturation: s, lightness: l }
  }))),

  // === POSTERIZE ===
  ...([2, 3, 4, 5, 6, 8, 16, 32].map(l => ({
    name: `Posterize_${l}`,
    script: `app.activeDocument.activeLayer.posterize(${l})`,
    params: { levels: l }
  }))),

  // === THRESHOLD ===
  ...([1, 32, 64, 96, 128, 160, 192, 224, 254].map(t => ({
    name: `Threshold_${t}`,
    script: `app.activeDocument.activeLayer.threshold(${t})`,
    params: { threshold: t }
  }))),

  // === GAUSSIAN BLUR ===
  ...([0.5, 1, 2, 3, 5, 10, 25, 50].map(r => ({
    name: `GaussianBlur_${r}`,
    script: `app.activeDocument.activeLayer.applyGaussianBlur(${r})`,
    params: { radius: r }
  }))),

  // === MOTION BLUR ===
  ...([[0, 10], [45, 10], [90, 10], [0, 25], [45, 25], [90, 50]].map(([a, d]) => ({
    name: `MotionBlur_${a}_${d}`,
    script: `app.activeDocument.activeLayer.applyMotionBlur(${a}, ${d})`,
    params: { angle: a, distance: d }
  }))),

  // === SHARPEN ===
  { name: 'Sharpen', script: 'app.activeDocument.activeLayer.applySharpen()' },
  { name: 'SharpenMore', script: 'app.activeDocument.activeLayer.applySharpenMore()' },

  // === UNSHARP MASK ===
  ...([[50, 1, 0], [100, 1, 0], [150, 1, 0], [100, 2, 0], [100, 3, 0], [200, 2, 0], [100, 1, 10]].map(([a, r, t]) => ({
    name: `UnsharpMask_${a}_${r}_${t}`,
    script: `app.activeDocument.activeLayer.applyUnsharpMask(${a}, ${r}, ${t})`,
    params: { amount: a, radius: r, threshold: t }
  }))),

  // === HIGH PASS ===
  ...([0.5, 1, 2, 3, 5, 10, 25].map(r => ({
    name: `HighPass_${r}`,
    script: `app.activeDocument.activeLayer.applyHighPass(${r})`,
    params: { radius: r }
  }))),

  // === STYLIZE ===
  { name: 'FindEdges', script: 'app.activeDocument.activeLayer.applyStyleize("FINDEDGES")' },
  { name: 'Emboss', script: 'app.activeDocument.activeLayer.applyStyleize("EMBOSS")' },
  { name: 'Solarize', script: 'app.activeDocument.activeLayer.applyStyleize("SOLARIZE")' },

  // === NOISE ===
  ...([5, 10, 25, 50].map(a => ({
    name: `AddNoise_Uniform_${a}`,
    script: `app.activeDocument.activeLayer.applyAddNoise(${a}, NoiseDistribution.UNIFORM, false)`,
    params: { amount: a, distribution: 'uniform', monochrome: false }
  }))),
  ...([5, 10, 25].map(a => ({
    name: `AddNoise_Gaussian_${a}`,
    script: `app.activeDocument.activeLayer.applyAddNoise(${a}, NoiseDistribution.GAUSSIAN, false)`,
    params: { amount: a, distribution: 'gaussian', monochrome: false }
  }))),

  // === MEDIAN ===
  ...([1, 2, 3, 5].map(r => ({
    name: `Median_${r}`,
    script: `app.activeDocument.activeLayer.applyMedianNoise(${r})`,
    params: { radius: r }
  }))),

  // === MAXIMUM / MINIMUM ===
  ...([1, 2, 3, 5].map(r => ({
    name: `Maximum_${r}`,
    script: `app.activeDocument.activeLayer.applyMaximum(${r})`,
    params: { radius: r }
  }))),
  ...([1, 2, 3, 5].map(r => ({
    name: `Minimum_${r}`,
    script: `app.activeDocument.activeLayer.applyMinimum(${r})`,
    params: { radius: r }
  }))),

  // === EXPOSURE ===
  ...([[0, 0, 1], [1, 0, 1], [-1, 0, 1], [0, 0.1, 1], [0, -0.1, 1], [0, 0, 1.5], [0, 0, 0.7]].map(([e, o, g]) => ({
    name: `Exposure_${e}_${o}_${g}`,
    script: `app.activeDocument.activeLayer.adjustExposure(${e}, ${o}, ${g})`,
    params: { exposure: e, offset: o, gamma: g }
  }))),

  // === VIBRANCE ===
  ...([[0, 0], [50, 0], [-50, 0], [0, 50], [0, -50], [50, 25], [-25, -25]].map(([v, s]) => ({
    name: `Vibrance_${v}_${s}`,
    script: `app.activeDocument.activeLayer.adjustVibrance(${v}, ${s})`,
    params: { vibrance: v, saturation: s }
  }))),

  // === COLOR BALANCE ===
  ...([[30, 0, 0], [-30, 0, 0], [0, 30, 0], [0, -30, 0], [0, 0, 30], [0, 0, -30]].map(([c, m, y]) => ({
    name: `ColorBalance_${c}_${m}_${y}`,
    script: `app.activeDocument.activeLayer.adjustColorBalance(${c}, ${m}, ${y}, false)`,
    params: { cyanRed: c, magentaGreen: m, yellowBlue: y }
  }))),
];

const DOC_WIDTH = 100;
const DOC_HEIGHT = 100;

async function main() {
  console.log('═'.repeat(60));
  console.log('FULL PIXEL CAPTURE - All Operations');
  console.log('═'.repeat(60));
  console.log(`Parallel browsers: ${PARALLEL_BROWSERS}`);
  console.log(`Total operations: ${OPERATIONS.length}`);
  console.log(`Ops per browser: ~${Math.ceil(OPERATIONS.length / PARALLEL_BROWSERS)}`);
  console.log('');

  const startTime = Date.now();

  // Split operations into chunks
  const chunks = [];
  const chunkSize = Math.ceil(OPERATIONS.length / PARALLEL_BROWSERS);
  for (let i = 0; i < OPERATIONS.length; i += chunkSize) {
    chunks.push(OPERATIONS.slice(i, i + chunkSize));
  }

  console.log(`Starting ${chunks.length} parallel workers...\n`);

  // Run all chunks in parallel
  const results = await Promise.all(
    chunks.map((ops, idx) => runWorker(idx, ops))
  );

  // Merge results
  const allResults = results.flat();

  // Save
  const outputDir = path.join(__dirname, 'output', 'full-specs');
  await fs.mkdir(outputDir, { recursive: true });

  await fs.writeFile(
    path.join(outputDir, 'all-operations.json'),
    JSON.stringify(allResults, null, 2)
  );

  // Save per-category files
  const categories = {};
  for (const r of allResults) {
    const cat = r.operation.split('_')[0];
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(r);
  }
  for (const [cat, ops] of Object.entries(categories)) {
    await fs.writeFile(
      path.join(outputDir, `${cat}.json`),
      JSON.stringify(ops, null, 2)
    );
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const successCount = allResults.length;
  const withChanges = allResults.filter(r => r.diff.changedPixels > 0).length;

  const summary = {
    captureDate: new Date().toISOString(),
    elapsedSeconds: parseFloat(elapsed),
    parallelBrowsers: PARALLEL_BROWSERS,
    totalOperations: OPERATIONS.length,
    capturedOperations: successCount,
    operationsWithChanges: withChanges,
    categories: Object.keys(categories).map(c => ({ name: c, count: categories[c].length }))
  };
  await fs.writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log('\n' + '═'.repeat(60));
  console.log('CAPTURE COMPLETE');
  console.log('═'.repeat(60));
  console.log(`Time: ${elapsed}s`);
  console.log(`Captured: ${successCount}/${OPERATIONS.length}`);
  console.log(`With pixel changes: ${withChanges} (${(withChanges/successCount*100).toFixed(1)}%)`);
  console.log(`Output: ${outputDir}`);
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

    // Process each operation
    for (const op of operations) {
      // Fresh fill with mid-gray for each operation
      await runScript(page, `
        var doc = app.activeDocument;
        var grayColor = new SolidColor();
        grayColor.rgb.red = 128;
        grayColor.rgb.green = 128;
        grayColor.rgb.blue = 128;
        doc.selection.selectAll();
        doc.selection.fill(grayColor);
        doc.selection.deselect();
      `);
      await page.waitForTimeout(100);

      const before = await getPixels(page);
      if (!before) continue;

      try {
        await runScript(page, op.script);
        await page.waitForTimeout(150);
      } catch (e) {
        console.log(`[Worker ${workerId}] ${op.name}: ERROR - ${e.message}`);
        continue;
      }

      const after = await getPixels(page);
      if (!after) continue;

      const diff = comparePixels(before.pixels, after.pixels);

      results.push({
        operation: op.name,
        params: op.params || {},
        script: op.script,
        input: before,
        output: after,
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
    return { changed: true, percentChanged: 100, changedPixels: 0, totalPixels: 0 };
  }
  let changedPixels = 0;
  const totalPixels = before.length / 4;
  for (let i = 0; i < before.length; i += 4) {
    if (before[i] !== after[i] || before[i+1] !== after[i+1] || before[i+2] !== after[i+2]) {
      changedPixels++;
    }
  }
  return { changed: changedPixels > 0, changedPixels, totalPixels, percentChanged: ((changedPixels / totalPixels) * 100).toFixed(2) };
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
