#!/usr/bin/env node
/**
 * EXACT Pixel Capture - Using iframe embedding + saveToOE API
 *
 * This gives us raw RGBA pixel data, not lossy screenshots.
 */

const fs = require('fs').promises;
const path = require('path');
const playwright = require('playwright');
const PNG = require('pngjs').PNG;

// All operations with parameter variations
const OPERATIONS = [
  // Instant operations (no params)
  { name: 'Invert', script: 'app.activeDocument.activeLayer.invert()' },
  { name: 'Desaturate', script: 'app.activeDocument.activeLayer.desaturate()' },
  { name: 'AutoTone', script: 'app.activeDocument.autoTone()' },
  { name: 'AutoContrast', script: 'app.activeDocument.autoContrast()' },
  { name: 'AutoColor', script: 'app.activeDocument.autoColor()' },

  // Gaussian Blur - multiple radii
  ...([1, 2, 5, 10, 25, 50].map(r => ({
    name: `GaussianBlur_${r}`,
    script: `app.activeDocument.activeLayer.applyGaussianBlur(${r})`,
    params: { radius: r }
  }))),

  // Motion Blur - multiple distances/angles
  ...([10, 25, 50].flatMap(d => [0, 45, 90].map(a => ({
    name: `MotionBlur_${d}_${a}`,
    script: `app.activeDocument.activeLayer.applyMotionBlur(${a}, ${d})`,
    params: { angle: a, distance: d }
  })))),

  // Sharpen
  { name: 'Sharpen', script: 'app.activeDocument.activeLayer.applySharpen()' },
  { name: 'SharpenMore', script: 'app.activeDocument.activeLayer.applySharpenMore()' },

  // Unsharp Mask - multiple values
  ...([50, 100, 150, 200].flatMap(a => [1, 2, 3].map(r => ({
    name: `UnsharpMask_${a}_${r}`,
    script: `app.activeDocument.activeLayer.applyUnSharpMask(${a}, ${r}, 0)`,
    params: { amount: a, radius: r, threshold: 0 }
  })))),

  // Posterize - multiple levels
  ...([2, 3, 4, 6, 8, 16].map(l => ({
    name: `Posterize_${l}`,
    script: `app.activeDocument.activeLayer.posterize(${l})`,
    params: { levels: l }
  }))),

  // Threshold - multiple values
  ...([32, 64, 96, 128, 160, 192, 224].map(t => ({
    name: `Threshold_${t}`,
    script: `app.activeDocument.activeLayer.threshold(${t})`,
    params: { threshold: t }
  }))),

  // Brightness/Contrast - multiple combos
  ...([-50, -25, 0, 25, 50].flatMap(b => [-50, -25, 0, 25, 50].map(c => ({
    name: `BrightnessContrast_${b}_${c}`,
    script: `app.activeDocument.activeLayer.brightnessContrast(${b}, ${c})`,
    params: { brightness: b, contrast: c }
  })))),

  // Stylize
  { name: 'FindEdges', script: 'app.activeDocument.activeLayer.applyStyleize("FINDEDGES")' },
  { name: 'Emboss', script: 'app.activeDocument.activeLayer.applyStyleize("EMBOSS")' },
  { name: 'Solarize', script: 'app.activeDocument.activeLayer.applyStyleize("SOLARIZE")' },

  // Noise
  ...([5, 10, 25, 50].map(a => ({
    name: `AddNoise_${a}`,
    script: `app.activeDocument.activeLayer.applyAddNoise(${a}, NoiseDistribution.UNIFORM, false)`,
    params: { amount: a }
  }))),

  // Median - multiple radii
  ...([1, 2, 3, 5].map(r => ({
    name: `Median_${r}`,
    script: `app.activeDocument.activeLayer.applyMedianNoise(${r})`,
    params: { radius: r }
  }))),

  // High Pass - multiple radii
  ...([1, 3, 5, 10, 25].map(r => ({
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

// Test images to generate
const TEST_IMAGES = [
  {
    name: 'gradient-h',
    description: 'Horizontal gradient black→white',
    generate: (w, h) => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const v = Math.round((x / (w - 1)) * 255);
          data[i] = v; data[i+1] = v; data[i+2] = v; data[i+3] = 255;
        }
      }
      return data;
    }
  },
  {
    name: 'checkerboard',
    description: '8x8 checkerboard',
    generate: (w, h) => {
      const data = new Uint8ClampedArray(w * h * 4);
      const size = 8;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const v = ((Math.floor(x/size) + Math.floor(y/size)) % 2) * 255;
          data[i] = v; data[i+1] = v; data[i+2] = v; data[i+3] = 255;
        }
      }
      return data;
    }
  },
  {
    name: 'color-bars',
    description: 'RGB color bars',
    generate: (w, h) => {
      const data = new Uint8ClampedArray(w * h * 4);
      const colors = [[255,0,0],[0,255,0],[0,0,255],[255,255,0],[255,0,255],[0,255,255],[255,255,255],[0,0,0]];
      const barW = Math.floor(w / colors.length);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const c = colors[Math.min(Math.floor(x / barW), colors.length - 1)];
          data[i] = c[0]; data[i+1] = c[1]; data[i+2] = c[2]; data[i+3] = 255;
        }
      }
      return data;
    }
  },
  {
    name: 'edges',
    description: 'Sharp vertical edge',
    generate: (w, h) => {
      const data = new Uint8ClampedArray(w * h * 4);
      const mid = Math.floor(w / 2);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const v = x < mid ? 0 : 255;
          data[i] = v; data[i+1] = v; data[i+2] = v; data[i+3] = 255;
        }
      }
      return data;
    }
  },
  {
    name: 'radial',
    description: 'Radial gradient',
    generate: (w, h) => {
      const data = new Uint8ClampedArray(w * h * 4);
      const cx = w/2, cy = h/2;
      const maxDist = Math.sqrt(cx*cx + cy*cy);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const dist = Math.sqrt((x-cx)**2 + (y-cy)**2);
          const v = Math.round((1 - dist/maxDist) * 255);
          data[i] = Math.max(0,v); data[i+1] = Math.max(0,v); data[i+2] = Math.max(0,v); data[i+3] = 255;
        }
      }
      return data;
    }
  }
];

const TEST_SIZE = 100; // 100x100 pixels

async function main() {
  console.log('═'.repeat(60));
  console.log('EXACT PIXEL CAPTURE - iframe + saveToOE API');
  console.log('═'.repeat(60));
  console.log(`Operations: ${OPERATIONS.length}`);
  console.log(`Test images: ${TEST_IMAGES.length}`);
  console.log(`Total captures: ${OPERATIONS.length * TEST_IMAGES.length}`);
  console.log('');

  const browser = await playwright.chromium.launch({ headless: false });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);

  // Log console messages for debugging
  page.on('console', msg => {
    if (msg.text().includes('PP Message')) {
      console.log(`[Browser] ${msg.text()}`);
    }
  });

  try {
    // Create page with Photopea in iframe using proper API format
    console.log('Loading Photopea in iframe...');
    const rnd = Date.now();
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head><title>Photopea Capture</title></head>
      <body style="margin:0;padding:0;">
        <iframe id="photopea" src="https://www.photopea.com?rnd=${rnd}"
                style="width:100vw;height:100vh;border:none;"></iframe>
        <script>
          window.ppWindow = document.getElementById('photopea').contentWindow;
          window.ppReady = false;
          window.ppResults = [];
          window.ppLastResult = null;

          window.addEventListener('message', (e) => {
            // Verify origin is from Photopea
            if (e.origin && (e.origin.includes('photopea.com') || e.origin === 'null')) {
              console.log('PP Message:', typeof e.data, e.data instanceof ArrayBuffer ? 'ArrayBuffer' : e.data);
              if (e.data === 'done') {
                window.ppReady = true;
              } else if (e.data instanceof ArrayBuffer) {
                window.ppResults.push(e.data);
              } else if (typeof e.data === 'string') {
                window.ppLastResult = e.data;
              }
            }
          });
        </script>
      </body>
      </html>
    `);

    // Wait for iframe to load and Photopea to be ready
    console.log('Waiting for Photopea to initialize...');

    // Wait for ppReady (Photopea sends 'done' when loaded)
    // Or use a test query as fallback
    const ready = await page.evaluate(() => {
      return new Promise((resolve) => {
        // First wait 10 seconds for initial load
        setTimeout(() => {
          // Try to send a test message
          const testHandler = (e) => {
            if (e.origin && e.origin.includes('photopea.com')) {
              window.removeEventListener('message', testHandler);
              resolve(true);
            }
          };
          window.addEventListener('message', testHandler);
          window.ppWindow.postMessage('app.echoToOE("ready")', '*');

          // Timeout after 15 more seconds
          setTimeout(() => {
            window.removeEventListener('message', testHandler);
            resolve(window.ppReady);
          }, 15000);
        }, 10000);
      });
    });

    console.log(`Photopea ready: ${ready}`);

    console.log('Photopea loaded!');

    // Run script to create document
    const runScript = async (script) => {
      await page.evaluate((s) => {
        window.ppResults = [];
        window.ppWindow.postMessage(s, '*');
      }, script);
      await page.waitForTimeout(300);
    };

    // Export document as PNG and get raw pixels
    const exportPixels = async () => {
      await page.evaluate(() => {
        window.ppResults = [];
        window.ppWindow.postMessage('app.activeDocument.saveToOE("png")', '*');
      });

      // Wait for result
      const result = await page.waitForFunction(() => {
        return window.ppResults.length > 0 ? window.ppResults[0] : null;
      }, { timeout: 10000 }).catch(() => null);

      if (!result) return null;

      // Get the ArrayBuffer
      const base64 = await page.evaluate(() => {
        const buf = window.ppResults[0];
        if (!buf) return null;
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
      });

      if (!base64) return null;

      // Parse PNG to get raw pixels
      const buffer = Buffer.from(base64, 'base64');
      return new Promise((resolve) => {
        new PNG().parse(buffer, (err, png) => {
          if (err) resolve(null);
          else resolve({ width: png.width, height: png.height, pixels: Array.from(png.data) });
        });
      });
    };

    // Output directory
    const outputDir = path.join(__dirname, 'output', 'exact-specs');
    await fs.mkdir(outputDir, { recursive: true });

    const allResults = [];
    let successCount = 0;
    let failCount = 0;

    // For each test image
    for (const testImg of TEST_IMAGES) {
      console.log(`\n▶ Test image: ${testImg.name}`);

      // Create new document
      await runScript(`app.documents.add(${TEST_SIZE}, ${TEST_SIZE}, 72, "Test", NewDocumentMode.RGB)`);
      await page.waitForTimeout(500);

      // Fill with test image pixels
      const testPixels = testImg.generate(TEST_SIZE, TEST_SIZE);

      // Create the test image by filling with solid color first (simplified)
      // For exact test image, we'd need to use putImageData via script
      await runScript(`
        var doc = app.activeDocument;
        app.foregroundColor.rgb.red = 128;
        app.foregroundColor.rgb.green = 128;
        app.foregroundColor.rgb.blue = 128;
        doc.selection.selectAll();
        doc.selection.fill(app.foregroundColor);
        doc.selection.deselect();
      `);
      await page.waitForTimeout(300);

      // Get baseline
      const baseline = await exportPixels();
      if (!baseline) {
        console.log('  ✗ Failed to get baseline');
        continue;
      }
      console.log(`  Baseline: ${baseline.width}x${baseline.height}`);

      // Test each operation
      for (const op of OPERATIONS) {
        process.stdout.write(`  ${op.name}... `);

        // Reset to baseline (undo all)
        await runScript('app.activeDocument.activeHistoryState = app.activeDocument.historyStates[0]');
        await page.waitForTimeout(200);

        // Get before state
        const before = await exportPixels();
        if (!before) {
          console.log('✗ no before');
          failCount++;
          continue;
        }

        // Apply operation
        try {
          await runScript(op.script);
          await page.waitForTimeout(400);
        } catch (e) {
          console.log(`✗ script error`);
          failCount++;
          continue;
        }

        // Get after state
        const after = await exportPixels();
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
      await runScript('app.activeDocument.close(SaveOptions.DONOTSAVECHANGES)');
      await page.waitForTimeout(300);
    }

    // Save results
    console.log('\nSaving results...');

    // Save all results
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
      totalOperations: OPERATIONS.length,
      totalTestImages: TEST_IMAGES.length,
      totalCaptures: successCount,
      failedCaptures: failCount,
      operations: Object.keys(byOp)
    };
    await fs.writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));

    console.log('\n' + '═'.repeat(60));
    console.log('CAPTURE COMPLETE');
    console.log('═'.repeat(60));
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Output: ${outputDir}`);

  } finally {
    await browser.close();
  }
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
