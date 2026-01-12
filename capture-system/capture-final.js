#!/usr/bin/env node
/**
 * FINAL Pixel Capture System
 *
 * Uses iframe + postMessage + saveToOE API to get exact document pixels.
 * This captures the ACTUAL operation specifications: input pixels + params → output pixels
 */

const fs = require('fs').promises;
const path = require('path');
const playwright = require('playwright');
const PNG = require('pngjs').PNG;

// All operations with parameter variations
const OPERATIONS = [
  // Simple operations
  { name: 'Invert', script: 'app.activeDocument.activeLayer.invert()' },
  { name: 'Desaturate', script: 'app.activeDocument.activeLayer.desaturate()' },
  { name: 'AutoTone', script: 'app.activeDocument.autoTone()' },
  { name: 'AutoContrast', script: 'app.activeDocument.autoContrast()' },
  { name: 'AutoColor', script: 'app.activeDocument.autoColor()' },

  // Blur
  ...([1, 2, 5, 10, 25].map(r => ({
    name: `GaussianBlur_${r}`,
    script: `app.activeDocument.activeLayer.applyGaussianBlur(${r})`,
    params: { radius: r }
  }))),

  // Sharpen
  { name: 'Sharpen', script: 'app.activeDocument.activeLayer.applySharpen()' },
  { name: 'SharpenMore', script: 'app.activeDocument.activeLayer.applySharpenMore()' },

  // Posterize
  ...([2, 3, 4, 6, 8, 16].map(l => ({
    name: `Posterize_${l}`,
    script: `app.activeDocument.activeLayer.posterize(${l})`,
    params: { levels: l }
  }))),

  // Threshold
  ...([32, 64, 96, 128, 160, 192, 224].map(t => ({
    name: `Threshold_${t}`,
    script: `app.activeDocument.activeLayer.threshold(${t})`,
    params: { threshold: t }
  }))),

  // Brightness/Contrast
  ...([-50, -25, 25, 50].flatMap(b => [-50, -25, 0, 25, 50].map(c => ({
    name: `BrightnessContrast_${b}_${c}`,
    script: `app.activeDocument.activeLayer.brightnessContrast(${b}, ${c})`,
    params: { brightness: b, contrast: c }
  })))),

  // Stylize
  { name: 'FindEdges', script: 'app.activeDocument.activeLayer.applyStyleize("FINDEDGES")' },
  { name: 'Emboss', script: 'app.activeDocument.activeLayer.applyStyleize("EMBOSS")' },
  { name: 'Solarize', script: 'app.activeDocument.activeLayer.applyStyleize("SOLARIZE")' },

  // High Pass
  ...([1, 3, 5, 10].map(r => ({
    name: `HighPass_${r}`,
    script: `app.activeDocument.activeLayer.applyHighPass(${r})`,
    params: { radius: r }
  }))),

  // Maximum/Minimum
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

// Test images
const TEST_IMAGES = [
  {
    name: 'gradient-h',
    description: 'Horizontal gradient black→white',
    fill: `
      var doc = app.activeDocument;
      app.foregroundColor.rgb.red = 0; app.foregroundColor.rgb.green = 0; app.foregroundColor.rgb.blue = 0;
      app.backgroundColor.rgb.red = 255; app.backgroundColor.rgb.green = 255; app.backgroundColor.rgb.blue = 255;
    `,
    draw: async (page) => {
      // Draw gradient with gradient tool
      await page.keyboard.press('g');
      await page.waitForTimeout(200);
      await page.mouse.move(100, 360);
      await page.mouse.down();
      await page.mouse.move(900, 360);
      await page.mouse.up();
      await page.waitForTimeout(300);
    }
  },
  {
    name: 'solid-gray',
    description: 'Solid 50% gray',
    fill: `
      var doc = app.activeDocument;
      app.foregroundColor.rgb.red = 128; app.foregroundColor.rgb.green = 128; app.foregroundColor.rgb.blue = 128;
      doc.selection.selectAll();
      doc.selection.fill(app.foregroundColor);
      doc.selection.deselect();
    `
  },
  {
    name: 'checkerboard',
    description: '8x8 checkerboard pattern',
    fill: `
      var doc = app.activeDocument;
      app.foregroundColor.rgb.red = 255; app.foregroundColor.rgb.green = 255; app.foregroundColor.rgb.blue = 255;
      doc.selection.selectAll();
      doc.selection.fill(app.foregroundColor);
      doc.selection.deselect();
    `,
    draw: async (page) => {
      // Draw black squares for checkerboard
      await page.keyboard.press('m'); // Marquee
      await page.waitForTimeout(100);
      await page.keyboard.press('d'); // Default colors
    }
  }
];

const DOC_WIDTH = 100;
const DOC_HEIGHT = 100;

async function main() {
  console.log('═'.repeat(60));
  console.log('FINAL PIXEL CAPTURE');
  console.log('═'.repeat(60));
  console.log(`Document size: ${DOC_WIDTH}x${DOC_HEIGHT}`);
  console.log(`Operations: ${OPERATIONS.length}`);
  console.log(`Test images: ${TEST_IMAGES.length}`);
  console.log(`Total captures: ${OPERATIONS.length * TEST_IMAGES.length}`);
  console.log('');

  const browser = await playwright.chromium.launch({ headless: false });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);

  // Log important messages
  page.on('console', msg => {
    if (msg.text().startsWith('PP:')) {
      console.log(`[Browser] ${msg.text()}`);
    }
  });

  try {
    // Setup Photopea in iframe
    console.log('1. Setting up Photopea...');
    await setupPhotopea(page);

    // Create output directory
    const outputDir = path.join(__dirname, 'output', 'final-specs');
    await fs.mkdir(outputDir, { recursive: true });

    const allResults = [];
    let successCount = 0;
    let failCount = 0;

    // For each test image
    for (const testImg of TEST_IMAGES) {
      console.log(`\n▶ Test image: ${testImg.name}`);

      // Create new document
      await runScript(page, `app.documents.add(${DOC_WIDTH}, ${DOC_HEIGHT}, 72, "Test", NewDocumentMode.RGB);`);
      await page.waitForTimeout(1000);

      // Fill with test pattern
      if (testImg.fill) {
        await runScript(page, testImg.fill);
        await page.waitForTimeout(500);
      }

      // Draw if needed
      if (testImg.draw) {
        await testImg.draw(page);
        await page.waitForTimeout(500);
      }

      // Flatten to ensure we have pixel layer
      await runScript(page, 'app.activeDocument.flatten();');
      await page.waitForTimeout(300);

      // Get baseline
      const baseline = await getPixels(page);
      if (!baseline) {
        console.log('  ✗ Failed to get baseline');
        continue;
      }
      console.log(`  Baseline: ${baseline.width}x${baseline.height}`);

      // Test each operation
      for (const op of OPERATIONS) {
        process.stdout.write(`  ${op.name}... `);

        // Reset to baseline (go to first history state)
        await runScript(page, 'app.activeDocument.activeHistoryState = app.activeDocument.historyStates[0];');
        await page.waitForTimeout(200);

        // Get before
        const before = await getPixels(page);
        if (!before) {
          console.log('✗ no before');
          failCount++;
          continue;
        }

        // Apply operation
        try {
          await runScript(page, op.script);
          await page.waitForTimeout(400);
        } catch (e) {
          console.log(`✗ script error: ${e.message}`);
          failCount++;
          continue;
        }

        // Get after
        const after = await getPixels(page);
        if (!after) {
          console.log('✗ no after');
          failCount++;
          continue;
        }

        // Compare
        const diff = comparePixels(before.pixels, after.pixels);
        console.log(`✓ ${diff.percentChanged}% changed`);

        allResults.push({
          operation: op.name,
          params: op.params || {},
          testImage: testImg.name,
          input: before,
          output: after,
          diff
        });
        successCount++;
      }

      // Close document
      await runScript(page, 'app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);');
      await page.waitForTimeout(300);
    }

    // Save results
    console.log('\nSaving results...');

    await fs.writeFile(
      path.join(outputDir, 'all-operations.json'),
      JSON.stringify(allResults, null, 2)
    );

    // Save per-operation files
    const byOp = {};
    for (const r of allResults) {
      if (!byOp[r.operation]) byOp[r.operation] = [];
      byOp[r.operation].push(r);
    }
    for (const [opName, results] of Object.entries(byOp)) {
      const safeName = opName.replace(/[^a-zA-Z0-9_-]/g, '_');
      await fs.writeFile(
        path.join(outputDir, `${safeName}.json`),
        JSON.stringify({ operation: opName, testCases: results }, null, 2)
      );
    }

    // Summary
    const summary = {
      captureDate: new Date().toISOString(),
      documentSize: { width: DOC_WIDTH, height: DOC_HEIGHT },
      totalOperations: OPERATIONS.length,
      totalTestImages: TEST_IMAGES.length,
      totalCaptures: successCount,
      failedCaptures: failCount,
      operationsWithChange: allResults.filter(r => r.diff.changedPixels > 0).length,
      operations: Object.keys(byOp)
    };
    await fs.writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));

    console.log('\n' + '═'.repeat(60));
    console.log('CAPTURE COMPLETE');
    console.log('═'.repeat(60));
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`With pixel changes: ${summary.operationsWithChange}`);
    console.log(`Output: ${outputDir}`);

  } finally {
    await browser.close();
  }
}

async function setupPhotopea(page) {
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head><title>Photopea Capture</title></head>
    <body style="margin:0;padding:0;background:#333;">
      <iframe id="pp" src="https://www.photopea.com"
              style="width:100vw;height:100vh;border:none;"></iframe>
      <script>
        window.ppQueue = [];
        window.ppReady = false;

        window.addEventListener('message', (e) => {
          if (e.data === 'done') {
            window.ppReady = true;
          } else if (e.data instanceof ArrayBuffer) {
            window.ppQueue.push(new Uint8Array(e.data));
          }
        });
      </script>
    </body>
    </html>
  `, { waitUntil: 'domcontentloaded' });

  // Wait for iframe to load
  await page.waitForTimeout(10000);

  // Click Start button
  await page.mouse.click(640, 310);
  await page.waitForTimeout(8000);

  // Wait for ready signal
  await page.waitForFunction(() => window.ppReady, { timeout: 60000 });
  console.log('   Photopea ready!');
}

async function runScript(page, script) {
  await page.evaluate((s) => {
    const iframe = document.getElementById('pp');
    iframe.contentWindow.postMessage(s, '*');
  }, script);
  // Wait for done signal
  await page.waitForFunction(() => window.ppReady, { timeout: 10000 });
}

async function getPixels(page) {
  // Clear queue
  await page.evaluate(() => { window.ppQueue = []; });

  // Request export
  await page.evaluate(() => {
    const iframe = document.getElementById('pp');
    iframe.contentWindow.postMessage('app.activeDocument.saveToOE("png");', '*');
  });

  // Wait for data
  try {
    await page.waitForFunction(() => window.ppQueue.length > 0, { timeout: 10000 });
  } catch (e) {
    return null;
  }

  const data = await page.evaluate(() => Array.from(window.ppQueue.shift()));
  const buffer = Buffer.from(data);

  return new Promise((resolve) => {
    new PNG().parse(buffer, (err, png) => {
      if (err) resolve(null);
      else resolve({
        width: png.width,
        height: png.height,
        pixels: Array.from(png.data)
      });
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

  return {
    changed: changedPixels > 0,
    changedPixels,
    totalPixels,
    percentChanged: ((changedPixels / totalPixels) * 100).toFixed(2)
  };
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
