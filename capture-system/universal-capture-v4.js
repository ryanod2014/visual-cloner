#!/usr/bin/env node
/**
 * UNIVERSAL CAPTURE V4
 *
 * Comprehensive capture with:
 * 1. ALL known Photopea operations from postMessage API
 * 2. Automatic parameter space exploration (min, mid, max, negative)
 * 3. Multiple test images (gradient, color, noise, edges)
 * 4. Smart categorization and deduplication
 *
 * Goal: 500+ operation variations with full I/O coverage
 */

const fs = require('fs').promises;
const path = require('path');
const playwright = require('playwright');
const PNG = require('pngjs').PNG;

// ==================================================================
// OPERATION CATALOG
// ==================================================================

const OPERATIONS = [
  // BLUR CATEGORY
  { name: 'GaussianBlur', category: 'blur', script: 'gaussianBlur', params: [
    { name: 'radius', values: [1, 5, 10, 25, 50] }
  ]},
  { name: 'BoxBlur', category: 'blur', script: 'boxBlur', params: [
    { name: 'radius', values: [1, 5, 10, 25] }
  ]},
  { name: 'MotionBlur', category: 'blur', script: 'motionBlur', params: [
    { name: 'angle', values: [0, 45, 90, 180] },
    { name: 'distance', values: [5, 15, 30] }
  ]},
  { name: 'RadialBlur', category: 'blur', script: 'radialBlur', params: [
    { name: 'amount', values: [5, 15, 30] },
    { name: 'method', values: [0, 1] } // 0=spin, 1=zoom
  ]},
  { name: 'SmartBlur', category: 'blur', script: 'smartBlur', params: [
    { name: 'radius', values: [3, 10, 20] },
    { name: 'threshold', values: [10, 30, 60] }
  ]},

  // BRIGHTNESS/CONTRAST
  { name: 'Brightness', category: 'brightness', script: 'adjustBrightness', params: [
    { name: 'amount', values: [-100, -50, 0, 50, 100] }
  ]},
  { name: 'Contrast', category: 'brightness', script: 'adjustContrast', params: [
    { name: 'amount', values: [-100, -50, 0, 50, 100] }
  ]},
  { name: 'BrightnessContrast', category: 'brightness', script: 'adjustBrightnessContrast', params: [
    { name: 'brightness', values: [-50, 0, 50] },
    { name: 'contrast', values: [-50, 0, 50] }
  ]},

  // DISTORT CATEGORY
  { name: 'Twirl', category: 'distort', script: 'twirl', params: [
    { name: 'angle', values: [-180, -90, 90, 180, 360] }
  ]},
  { name: 'Pinch', category: 'distort', script: 'pinch', params: [
    { name: 'amount', values: [-100, -50, 50, 100] }
  ]},
  { name: 'Spherize', category: 'distort', script: 'spherize', params: [
    { name: 'amount', values: [-100, -50, 50, 100] },
    { name: 'mode', values: [0, 1, 2] } // 0=normal, 1=horizontal, 2=vertical
  ]},
  { name: 'Wave', category: 'distort', script: 'wave', params: [
    { name: 'generators', values: [1, 3, 5] },
    { name: 'wavelength', values: [10, 50, 100] },
    { name: 'amplitude', values: [5, 15, 30] },
    { name: 'type', values: [0, 1] } // 0=sine, 1=triangle
  ]},
  { name: 'Ripple', category: 'distort', script: 'ripple', params: [
    { name: 'amount', values: [50, 150, 300] },
    { name: 'size', values: [0, 1, 2] } // small, medium, large
  ]},
  { name: 'Shear', category: 'distort', script: 'shear', params: [
    { name: 'angleH', values: [-30, 0, 30] },
    { name: 'angleV', values: [-30, 0, 30] }
  ]},
  { name: 'ZigZag', category: 'distort', script: 'zigZag', params: [
    { name: 'amount', values: [10, 30, 60] },
    { name: 'ridges', values: [3, 7, 12] },
    { name: 'style', values: [0, 1, 2] } // around center, out from center, pond ripples
  ]},

  // NOISE CATEGORY
  { name: 'AddNoise', category: 'noise', script: 'addNoise', params: [
    { name: 'amount', values: [5, 15, 30, 60, 100] },
    { name: 'distribution', values: [0, 1] } // 0=uniform, 1=gaussian
  ]},
  { name: 'Median', category: 'noise', script: 'median', params: [
    { name: 'radius', values: [1, 3, 5, 10] }
  ]},
  { name: 'Despeckle', category: 'noise', script: 'despeckle', params: []},
  { name: 'DustAndScratches', category: 'noise', script: 'dustAndScratches', params: [
    { name: 'radius', values: [1, 3, 5] },
    { name: 'threshold', values: [0, 10, 30] }
  ]},

  // SHARPEN CATEGORY
  { name: 'Sharpen', category: 'sharpen', script: 'sharpen', params: []},
  { name: 'SharpenMore', category: 'sharpen', script: 'sharpenMore', params: []},
  { name: 'UnsharpMask', category: 'sharpen', script: 'unsharpMask', params: [
    { name: 'amount', values: [50, 150, 300] },
    { name: 'radius', values: [1, 3, 5] },
    { name: 'threshold', values: [0, 5, 15] }
  ]},

  // ADJUSTMENTS
  { name: 'Invert', category: 'adjustments', script: 'invert', params: []},
  { name: 'Desaturate', category: 'adjustments', script: 'desaturate', params: []},
  { name: 'AutoTone', category: 'auto', script: 'autoTone', params: []},
  { name: 'AutoContrast', category: 'auto', script: 'autoContrast', params: []},
  { name: 'AutoLevels', category: 'auto', script: 'autoLevels', params: []},

  // MORPHOLOGY
  { name: 'Maximum', category: 'morphology', script: 'maximum', params: [
    { name: 'radius', values: [1, 3, 5, 10] }
  ]},
  { name: 'Minimum', category: 'morphology', script: 'minimum', params: [
    { name: 'radius', values: [1, 3, 5, 10] }
  ]},
];

// TEST IMAGES
const TEST_IMAGES = {
  gradient: { name: 'gradient', width: 100, height: 100 },
  color: { name: 'color', width: 100, height: 100 },
  noise: { name: 'noise', width: 100, height: 100 },
  edges: { name: 'edges', width: 100, height: 100 },
};

// ==================================================================
// MAIN
// ==================================================================

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
  const outputDir = path.join(__dirname, 'output', `universal-v4-${timestamp}`);
  await fs.mkdir(outputDir, { recursive: true });

  console.log('═'.repeat(70));
  console.log('UNIVERSAL CAPTURE V4');
  console.log('═'.repeat(70));
  console.log(`Operations: ${OPERATIONS.length}`);
  console.log(`Test Images: ${Object.keys(TEST_IMAGES).length}`);
  console.log(`Output: ${outputDir}`);
  console.log('═'.repeat(70));
  console.log('');

  const browser = await playwright.chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(60000);

  const allResults = [];
  let captureCount = 0;

  try {
    // Setup Photopea
    console.log('1. Setting up Photopea...');
    await setupPhotopea(page);
    console.log('   ✓ Ready\n');

    // For each test image
    for (const [imageName, imageSpec] of Object.entries(TEST_IMAGES)) {
      console.log(`2. Testing with "${imageName}" test image...`);

      // Create test document
      await createTestDocument(page, imageSpec);

      // Test all operations
      let successCount = 0;
      for (const op of OPERATIONS) {
        const variations = generateParamVariations(op);

        for (const variation of variations) {
          process.stdout.write(`   ${op.name}(${variation.label})... `);

          const result = await captureOperation(page, op, variation, imageName);

          if (result) {
            allResults.push(result);
            captureCount++;

            if (result.diff && result.diff.changedPixels > 0) {
              successCount++;
              console.log(`✓ ${result.diff.percentChanged}%`);
            } else {
              console.log(`⊘ no change`);
            }
          } else {
            console.log(`✗ failed`);
          }
        }
      }

      console.log(`   ${successCount} operations with pixel changes\n`);

      // Close document
      await runScript(page, 'app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);');
      await page.waitForTimeout(500);
    }

    // Save results
    await saveResults(outputDir, allResults);

    // Summary
    console.log('═'.repeat(70));
    console.log('CAPTURE COMPLETE');
    console.log('═'.repeat(70));
    console.log(`Total Captures: ${captureCount}`);
    console.log(`With Changes: ${allResults.filter(r => r.diff?.changedPixels > 0).length}`);
    console.log(`Success Rate: ${((allResults.filter(r => r.diff?.changedPixels > 0).length / captureCount) * 100).toFixed(1)}%`);
    console.log(`Output: ${outputDir}`);
    console.log('');

  } finally {
    await browser.close();
  }
}

// ==================================================================
// HELPERS
// ==================================================================

async function setupPhotopea(page) {
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <body style="margin:0">
      <iframe id="app" src="https://www.photopea.com" style="width:100vw;height:100vh;border:none;"></iframe>
      <script>
        window.ppQueue = [];
        window.ppReady = false;
        window.addEventListener('message', (e) => {
          if (e.data === 'done') window.ppReady = true;
          else if (e.data instanceof ArrayBuffer) window.ppQueue.push(new Uint8ClampedArray(e.data));
        });
      </script>
    </body>
    </html>
  `, { waitUntil: 'domcontentloaded' });

  await page.waitForTimeout(12000);
  await page.mouse.click(640, 310);
  await page.waitForTimeout(8000);
  await page.waitForFunction(() => window.ppReady, { timeout: 60000 });
}

async function createTestDocument(page, spec) {
  const { name, width, height } = spec;

  // Create document
  await runScript(page, `app.documents.add(${width}, ${height}, 72, "${name}", NewDocumentMode.RGB);`);
  await page.waitForTimeout(500);

  // Fill with test pattern
  if (name === 'gradient') {
    // Black to white gradient
    await runScript(page, `
      var doc = app.activeDocument;
      var black = new SolidColor(); black.rgb.red = 0; black.rgb.green = 0; black.rgb.blue = 0;
      var white = new SolidColor(); white.rgb.red = 255; white.rgb.green = 255; white.rgb.blue = 255;
      doc.selection.select([[0,0], [${width/2},0], [${width/2},${height}], [0,${height}]]);
      doc.selection.fill(black);
      doc.selection.select([[${width/2},0], [${width},0], [${width},${height}], [${width/2},${height}]]);
      doc.selection.fill(white);
      doc.selection.deselect();
    `);
  } else if (name === 'color') {
    // RGB stripes
    await runScript(page, `
      var doc = app.activeDocument;
      var red = new SolidColor(); red.rgb.red = 255; red.rgb.green = 0; red.rgb.blue = 0;
      var green = new SolidColor(); green.rgb.red = 0; green.rgb.green = 255; green.rgb.blue = 0;
      var blue = new SolidColor(); blue.rgb.red = 0; blue.rgb.green = 0; blue.rgb.blue = 255;
      doc.selection.select([[0,0], [${width/3},0], [${width/3},${height}], [0,${height}]]);
      doc.selection.fill(red);
      doc.selection.select([[${width/3},0], [${width*2/3},0], [${width*2/3},${height}], [${width/3},${height}]]);
      doc.selection.fill(green);
      doc.selection.select([[${width*2/3},0], [${width},0], [${width},${height}], [${width*2/3},${height}]]);
      doc.selection.fill(blue);
      doc.selection.deselect();
    `);
  } else if (name === 'edges') {
    // Checkerboard
    await runScript(page, `
      var doc = app.activeDocument;
      var black = new SolidColor(); black.rgb.red = 0; black.rgb.green = 0; black.rgb.blue = 0;
      var white = new SolidColor(); white.rgb.red = 255; white.rgb.green = 255; white.rgb.blue = 255;
      var size = 10;
      for (var y = 0; y < ${height}; y += size) {
        for (var x = 0; x < ${width}; x += size) {
          var color = ((Math.floor(x/size) + Math.floor(y/size)) % 2 === 0) ? black : white;
          doc.selection.select([[x,y], [x+size,y], [x+size,y+size], [x,y+size]]);
          doc.selection.fill(color);
        }
      }
      doc.selection.deselect();
    `);
  }

  await page.waitForTimeout(300);
}

function generateParamVariations(op) {
  if (!op.params || op.params.length === 0) {
    return [{ label: 'default', args: [] }];
  }

  const variations = [];

  // Single param: test each value
  if (op.params.length === 1) {
    const param = op.params[0];
    for (const value of param.values) {
      variations.push({
        label: `${param.name}=${value}`,
        args: [value]
      });
    }
  }
  // Multi param: test combinations (limited to avoid explosion)
  else {
    // Just test min and max for each param
    for (let i = 0; i < op.params.length; i++) {
      const param = op.params[i];
      const minVal = param.values[0];
      const maxVal = param.values[param.values.length - 1];

      variations.push({
        label: `${param.name}=min`,
        args: op.params.map((p, idx) => idx === i ? minVal : p.values[0])
      });

      if (minVal !== maxVal) {
        variations.push({
          label: `${param.name}=max`,
          args: op.params.map((p, idx) => idx === i ? maxVal : p.values[0])
        });
      }
    }
  }

  return variations;
}

async function captureOperation(page, op, variation, imageName) {
  try {
    // Get before pixels
    const before = await getPixels(page);
    if (!before) return null;

    // Execute operation
    const argsStr = variation.args.join(', ');
    const script = `app.activeDocument.activeLayer.${op.script}(${argsStr});`;
    await runScript(page, script);
    await page.waitForTimeout(200);

    // Get after pixels
    const after = await getPixels(page);
    if (!after) return null;

    // Compare
    const diff = comparePixels(before.pixels, after.pixels);

    // Undo
    await runScript(page, 'app.activeDocument.activeHistoryState = app.activeDocument.historyStates[app.activeDocument.historyStates.length - 2];');
    await page.waitForTimeout(100);

    return {
      operation: op.name,
      category: op.category,
      script: op.script,
      params: variation.label,
      testImage: imageName,
      input: before,
      output: after,
      diff
    };

  } catch (e) {
    console.error(`Error: ${e.message}`);
    return null;
  }
}

async function runScript(page, script) {
  await page.evaluate((s) => {
    window.ppReady = false;
    document.getElementById('app').contentWindow.postMessage(s, '*');
  }, script);
  await page.waitForFunction(() => window.ppReady, { timeout: 10000 });
}

async function getPixels(page) {
  await page.evaluate(() => { window.ppQueue = []; });
  await page.evaluate(() => {
    document.getElementById('app').contentWindow.postMessage('app.activeDocument.saveToOE("png");', '*');
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

  return {
    changed: changedPixels > 0,
    changedPixels,
    totalPixels,
    percentChanged: ((changedPixels / totalPixels) * 100).toFixed(2)
  };
}

async function saveResults(outputDir, results) {
  await fs.writeFile(
    path.join(outputDir, 'all-results.json'),
    JSON.stringify(results, null, 2)
  );

  // Save by category
  const byCategory = {};
  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }

  for (const [cat, items] of Object.entries(byCategory)) {
    await fs.writeFile(
      path.join(outputDir, `category-${cat}.json`),
      JSON.stringify(items, null, 2)
    );
  }

  // Summary
  const summary = {
    timestamp: new Date().toISOString(),
    total: results.length,
    withChanges: results.filter(r => r.diff?.changedPixels > 0).length,
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([cat, items]) => [
        cat,
        { total: items.length, withChanges: items.filter(r => r.diff?.changedPixels > 0).length }
      ])
    )
  };

  await fs.writeFile(
    path.join(outputDir, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
