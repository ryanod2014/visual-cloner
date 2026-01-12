#!/usr/bin/env node
/**
 * PARALLEL Pixel Capture System
 *
 * Runs multiple browser instances in parallel, each processing a subset of operations.
 */

const fs = require('fs').promises;
const path = require('path');
const playwright = require('playwright');
const PNG = require('pngjs').PNG;

const PARALLEL_BROWSERS = parseInt(process.env.PARALLEL) || 4;

// All operations
const OPERATIONS = [
  { name: 'Invert', script: 'app.activeDocument.activeLayer.invert()' },
  { name: 'Desaturate', script: 'app.activeDocument.activeLayer.desaturate()' },
  { name: 'AutoTone', script: 'app.activeDocument.autoTone()' },
  { name: 'AutoContrast', script: 'app.activeDocument.autoContrast()' },
  { name: 'AutoColor', script: 'app.activeDocument.autoColor()' },

  ...([1, 2, 5, 10, 25].map(r => ({
    name: `GaussianBlur_${r}`,
    script: `app.activeDocument.activeLayer.applyGaussianBlur(${r})`,
    params: { radius: r }
  }))),

  { name: 'Sharpen', script: 'app.activeDocument.activeLayer.applySharpen()' },
  { name: 'SharpenMore', script: 'app.activeDocument.activeLayer.applySharpenMore()' },

  ...([2, 3, 4, 6, 8, 16].map(l => ({
    name: `Posterize_${l}`,
    script: `app.activeDocument.activeLayer.posterize(${l})`,
    params: { levels: l }
  }))),

  ...([32, 64, 96, 128, 160, 192, 224].map(t => ({
    name: `Threshold_${t}`,
    script: `app.activeDocument.activeLayer.threshold(${t})`,
    params: { threshold: t }
  }))),

  ...([-50, -25, 25, 50].flatMap(b => [-50, 0, 50].map(c => ({
    name: `BrightnessContrast_${b}_${c}`,
    script: `app.activeDocument.activeLayer.brightnessContrast(${b}, ${c})`,
    params: { brightness: b, contrast: c }
  })))),

  { name: 'FindEdges', script: 'app.activeDocument.activeLayer.applyStyleize("FINDEDGES")' },
  { name: 'Emboss', script: 'app.activeDocument.activeLayer.applyStyleize("EMBOSS")' },
  { name: 'Solarize', script: 'app.activeDocument.activeLayer.applyStyleize("SOLARIZE")' },

  ...([1, 3, 5, 10].map(r => ({
    name: `HighPass_${r}`,
    script: `app.activeDocument.activeLayer.applyHighPass(${r})`,
    params: { radius: r }
  }))),

  ...([1, 2, 3].map(r => ({
    name: `Maximum_${r}`,
    script: `app.activeDocument.activeLayer.applyMaximum(${r})`,
    params: { radius: r }
  }))),
  ...([1, 2, 3].map(r => ({
    name: `Minimum_${r}`,
    script: `app.activeDocument.activeLayer.applyMinimum(${r})`,
    params: { radius: r }
  }))),
];

const DOC_WIDTH = 100;
const DOC_HEIGHT = 100;

async function main() {
  console.log('═'.repeat(60));
  console.log('PARALLEL PIXEL CAPTURE');
  console.log('═'.repeat(60));
  console.log(`Parallel browsers: ${PARALLEL_BROWSERS}`);
  console.log(`Operations: ${OPERATIONS.length}`);
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
  const outputDir = path.join(__dirname, 'output', 'parallel-specs');
  await fs.mkdir(outputDir, { recursive: true });

  await fs.writeFile(
    path.join(outputDir, 'all-operations.json'),
    JSON.stringify(allResults, null, 2)
  );

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const successCount = allResults.length;
  const withChanges = allResults.filter(r => r.diff.changedPixels > 0).length;

  console.log('\n' + '═'.repeat(60));
  console.log('CAPTURE COMPLETE');
  console.log('═'.repeat(60));
  console.log(`Time: ${elapsed}s`);
  console.log(`Captured: ${successCount}/${OPERATIONS.length}`);
  console.log(`With changes: ${withChanges}`);
  console.log(`Output: ${outputDir}`);
}

async function runWorker(workerId, operations) {
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  const results = [];

  try {
    // Setup Photopea
    await setupPhotopea(page);
    console.log(`[Worker ${workerId}] Ready, processing ${operations.length} ops`);

    // Create document with varying content (different per worker for variety)
    await runScript(page, `app.documents.add(${DOC_WIDTH}, ${DOC_HEIGHT}, 72, "Test", NewDocumentMode.RGB);`);
    await page.waitForTimeout(500);

    // Process each operation - for each op, we'll create fresh content and apply it
    for (const op of operations) {
      // Fill with mid-gray (128) using SolidColor - fresh fill for each operation
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
      await page.waitForTimeout(200);

      const before = await getPixels(page);
      if (!before) continue;

      try {
        await runScript(page, op.script);
        await page.waitForTimeout(200);
      } catch (e) {
        continue;
      }

      const after = await getPixels(page);
      if (!after) continue;

      const diff = comparePixels(before.pixels, after.pixels);

      results.push({
        operation: op.name,
        params: op.params || {},
        input: before,
        output: after,
        diff
      });

      console.log(`[Worker ${workerId}] ${op.name}: ${diff.percentChanged}% changed`);
    }

    await runScript(page, 'app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);');

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
