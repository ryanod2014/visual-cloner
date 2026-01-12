#!/usr/bin/env node
/**
 * SMART Pixel Capture - Uses optimal test patterns per operation category
 */

const fs = require('fs').promises;
const path = require('path');
const playwright = require('playwright');
const PNG = require('pngjs').PNG;

const PARALLEL_BROWSERS = parseInt(process.env.PARALLEL) || 4;

// Test patterns optimized for different operation types
const TEST_PATTERNS = {
  // Gradient for blur/sharpen effects
  gradient: `
    var doc = app.activeDocument;
    var black = new SolidColor(); black.rgb.red = 0; black.rgb.green = 0; black.rgb.blue = 0;
    var white = new SolidColor(); white.rgb.red = 255; white.rgb.green = 255; white.rgb.blue = 255;
    doc.selection.select([[0, 0], [50, 0], [50, 100], [0, 100]]);
    doc.selection.fill(black);
    doc.selection.select([[50, 0], [100, 0], [100, 100], [50, 100]]);
    doc.selection.fill(white);
    doc.selection.deselect();
  `,
  // Mid-gray for brightness/contrast/levels
  midgray: `
    var doc = app.activeDocument;
    var gray = new SolidColor(); gray.rgb.red = 128; gray.rgb.green = 128; gray.rgb.blue = 128;
    doc.selection.selectAll();
    doc.selection.fill(gray);
    doc.selection.deselect();
  `,
  // Color for hue/saturation
  color: `
    var doc = app.activeDocument;
    var red = new SolidColor(); red.rgb.red = 200; red.rgb.green = 50; red.rgb.blue = 50;
    var blue = new SolidColor(); blue.rgb.red = 50; blue.rgb.green = 50; blue.rgb.blue = 200;
    doc.selection.select([[0, 0], [50, 0], [50, 100], [0, 100]]);
    doc.selection.fill(red);
    doc.selection.select([[50, 0], [100, 0], [100, 100], [50, 100]]);
    doc.selection.fill(blue);
    doc.selection.deselect();
  `,
  // Multi-level gray for posterize/threshold
  multilevel: `
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
  `,
};

// Operations with their optimal test pattern
const OPERATIONS = [
  // === INVERT/DESATURATE ===
  { name: 'Invert', script: 'app.activeDocument.activeLayer.invert()', pattern: 'multilevel' },
  { name: 'Desaturate', script: 'app.activeDocument.activeLayer.desaturate()', pattern: 'color' },

  // === BRIGHTNESS/CONTRAST - needs mid-gray ===
  ...([[-50, 0], [-25, 0], [25, 0], [50, 0], [0, -50], [0, 50], [-25, -25], [25, 25]].map(([b, c]) => ({
    name: `BrightnessContrast_${b}_${c}`,
    script: `app.activeDocument.activeLayer.adjustBrightnessContrast(${b}, ${c})`,
    pattern: 'midgray'
  }))),

  // === LEVELS - needs mid-gray ===
  { name: 'Levels_Gamma_0.5', script: 'app.activeDocument.activeLayer.adjustLevels([0, 255], 0.5, [0, 255])', pattern: 'midgray' },
  { name: 'Levels_Gamma_1.5', script: 'app.activeDocument.activeLayer.adjustLevels([0, 255], 1.5, [0, 255])', pattern: 'midgray' },
  { name: 'Levels_Gamma_2.0', script: 'app.activeDocument.activeLayer.adjustLevels([0, 255], 2.0, [0, 255])', pattern: 'midgray' },
  { name: 'Levels_Crush', script: 'app.activeDocument.activeLayer.adjustLevels([20, 235], 1.0, [0, 255])', pattern: 'multilevel' },
  { name: 'Levels_Output', script: 'app.activeDocument.activeLayer.adjustLevels([0, 255], 1.0, [20, 235])', pattern: 'multilevel' },

  // === CURVES - needs variation ===
  { name: 'Curves_Brighten', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 0], [128, 160], [255, 255]])', pattern: 'midgray' },
  { name: 'Curves_Darken', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 0], [128, 96], [255, 255]])', pattern: 'midgray' },
  { name: 'Curves_SShape', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 0], [64, 48], [192, 208], [255, 255]])', pattern: 'multilevel' },
  { name: 'Curves_Invert', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 255], [255, 0]])', pattern: 'multilevel' },

  // === HUE/SATURATION - needs color ===
  ...([[30, 0, 0], [-30, 0, 0], [90, 0, 0], [180, 0, 0], [0, 50, 0], [0, -50, 0], [0, 0, 30], [0, 0, -30]].map(([h, s, l]) => ({
    name: `HueSat_${h}_${s}_${l}`,
    script: `app.activeDocument.activeLayer.adjustHueSaturation(${h}, ${s}, ${l})`,
    pattern: 'color'
  }))),

  // === POSTERIZE - needs multilevel ===
  ...([2, 3, 4, 6, 8, 16].map(l => ({
    name: `Posterize_${l}`,
    script: `app.activeDocument.activeLayer.posterize(${l})`,
    pattern: 'multilevel'
  }))),

  // === THRESHOLD - needs multilevel ===
  ...([32, 64, 96, 128, 160, 192, 224].map(t => ({
    name: `Threshold_${t}`,
    script: `app.activeDocument.activeLayer.threshold(${t})`,
    pattern: 'multilevel'
  }))),

  // === GAUSSIAN BLUR - needs gradient/edge ===
  ...([1, 2, 5, 10, 25].map(r => ({
    name: `GaussianBlur_${r}`,
    script: `app.activeDocument.activeLayer.applyGaussianBlur(${r})`,
    pattern: 'gradient'
  }))),

  // === MOTION BLUR - needs gradient ===
  ...([[0, 10], [45, 25], [90, 25]].map(([a, d]) => ({
    name: `MotionBlur_${a}_${d}`,
    script: `app.activeDocument.activeLayer.applyMotionBlur(${a}, ${d})`,
    pattern: 'gradient'
  }))),

  // === SHARPEN - needs gradient ===
  { name: 'Sharpen', script: 'app.activeDocument.activeLayer.applySharpen()', pattern: 'gradient' },
  { name: 'SharpenMore', script: 'app.activeDocument.activeLayer.applySharpenMore()', pattern: 'gradient' },

  // === UNSHARP MASK - needs gradient ===
  ...([[100, 1, 0], [100, 2, 0], [200, 2, 0]].map(([a, r, t]) => ({
    name: `UnsharpMask_${a}_${r}_${t}`,
    script: `app.activeDocument.activeLayer.applyUnsharpMask(${a}, ${r}, ${t})`,
    pattern: 'gradient'
  }))),

  // === HIGH PASS - needs gradient ===
  ...([1, 3, 5, 10, 25].map(r => ({
    name: `HighPass_${r}`,
    script: `app.activeDocument.activeLayer.applyHighPass(${r})`,
    pattern: 'gradient'
  }))),

  // === STYLIZE - needs gradient ===
  { name: 'FindEdges', script: 'app.activeDocument.activeLayer.applyStyleize("FINDEDGES")', pattern: 'gradient' },
  { name: 'Emboss', script: 'app.activeDocument.activeLayer.applyStyleize("EMBOSS")', pattern: 'gradient' },
  { name: 'Solarize', script: 'app.activeDocument.activeLayer.applyStyleize("SOLARIZE")', pattern: 'multilevel' },

  // === NOISE - any pattern works ===
  ...([5, 10, 25, 50].map(a => ({
    name: `AddNoise_${a}`,
    script: `app.activeDocument.activeLayer.applyAddNoise(${a}, NoiseDistribution.UNIFORM, false)`,
    pattern: 'midgray'
  }))),

  // === MEDIAN - needs gradient ===
  ...([1, 2, 3, 5].map(r => ({
    name: `Median_${r}`,
    script: `app.activeDocument.activeLayer.applyMedianNoise(${r})`,
    pattern: 'gradient'
  }))),

  // === MAXIMUM/MINIMUM - needs gradient ===
  ...([1, 2, 3].map(r => ({
    name: `Maximum_${r}`,
    script: `app.activeDocument.activeLayer.applyMaximum(${r})`,
    pattern: 'gradient'
  }))),
  ...([1, 2, 3].map(r => ({
    name: `Minimum_${r}`,
    script: `app.activeDocument.activeLayer.applyMinimum(${r})`,
    pattern: 'gradient'
  }))),

  // === VIBRANCE - needs color ===
  ...([[50, 0], [-50, 0], [0, 50], [0, -50]].map(([v, s]) => ({
    name: `Vibrance_${v}_${s}`,
    script: `app.activeDocument.activeLayer.adjustVibrance(${v}, ${s})`,
    pattern: 'color'
  }))),

  // === COLOR BALANCE - needs color ===
  ...([[30, 0, 0], [-30, 0, 0], [0, 30, 0], [0, 0, 30]].map(([c, m, y]) => ({
    name: `ColorBalance_${c}_${m}_${y}`,
    script: `app.activeDocument.activeLayer.adjustColorBalance(${c}, ${m}, ${y}, false)`,
    pattern: 'color'
  }))),

  // === EXPOSURE - needs midgray ===
  ...([[1, 0, 1], [-1, 0, 1], [0, 0.1, 1], [0, 0, 1.5], [0, 0, 0.7]].map(([e, o, g]) => ({
    name: `Exposure_${e}_${o}_${g}`,
    script: `app.activeDocument.activeLayer.adjustExposure(${e}, ${o}, ${g})`,
    pattern: 'midgray'
  }))),
];

const DOC_WIDTH = 100;
const DOC_HEIGHT = 100;

async function main() {
  console.log('═'.repeat(60));
  console.log('SMART PIXEL CAPTURE - Optimized Test Patterns');
  console.log('═'.repeat(60));
  console.log(`Parallel browsers: ${PARALLEL_BROWSERS}`);
  console.log(`Total operations: ${OPERATIONS.length}`);
  console.log('');

  const startTime = Date.now();

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

  const outputDir = path.join(__dirname, 'output', 'smart-specs');
  await fs.mkdir(outputDir, { recursive: true });

  await fs.writeFile(
    path.join(outputDir, 'all-operations.json'),
    JSON.stringify(allResults, null, 2)
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const successCount = allResults.length;
  const withChanges = allResults.filter(r => r.diff.changedPixels > 0).length;

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

    await runScript(page, `app.documents.add(${DOC_WIDTH}, ${DOC_HEIGHT}, 72, "Test", NewDocumentMode.RGB);`);
    await page.waitForTimeout(500);

    for (const op of operations) {
      // Apply optimal test pattern
      const pattern = TEST_PATTERNS[op.pattern || 'midgray'];
      await runScript(page, pattern);
      await page.waitForTimeout(100);

      const before = await getPixels(page);
      if (!before) continue;

      try {
        await runScript(page, op.script);
        await page.waitForTimeout(150);
      } catch (e) {
        console.log(`[Worker ${workerId}] ${op.name}: ERROR`);
        continue;
      }

      const after = await getPixels(page);
      if (!after) continue;

      const diff = comparePixels(before.pixels, after.pixels);

      results.push({
        operation: op.name,
        pattern: op.pattern,
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
