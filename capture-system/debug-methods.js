#!/usr/bin/env node
/**
 * Debug Photopea API methods - find correct syntax for each operation
 */

const playwright = require('playwright');
const PNG = require('pngjs').PNG;

async function main() {
  const browser = await playwright.chromium.launch({ headless: false });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);

  // Setup
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <body style="margin:0">
      <iframe id="pp" src="https://www.photopea.com" style="width:100vw;height:100vh;border:none;"></iframe>
      <script>
        window.ppQueue = [];
        window.ppReady = false;
        window.ppResult = null;
        window.addEventListener('message', (e) => {
          if (e.data === 'done') window.ppReady = true;
          else if (e.data instanceof ArrayBuffer) window.ppQueue.push(new Uint8Array(e.data));
          else if (typeof e.data === 'string') window.ppResult = e.data;
        });
      </script>
    </body>
    </html>
  `, { waitUntil: 'domcontentloaded' });

  await page.waitForTimeout(10000);
  await page.mouse.click(640, 310);
  await page.waitForTimeout(8000);
  await page.waitForFunction(() => window.ppReady, { timeout: 60000 });
  console.log('Photopea ready\n');

  // Create doc with gradient pattern (will show edge effects)
  await runScript(page, 'app.documents.add(100, 100, 72, "Test", NewDocumentMode.RGB);');
  await page.waitForTimeout(500);

  // Create gradient: left half black, right half white
  await runScript(page, `
    var doc = app.activeDocument;
    var black = new SolidColor(); black.rgb.red = 0; black.rgb.green = 0; black.rgb.blue = 0;
    var white = new SolidColor(); white.rgb.red = 255; white.rgb.green = 255; white.rgb.blue = 255;
    doc.selection.select([[0, 0], [50, 0], [50, 100], [0, 100]]);
    doc.selection.fill(black);
    doc.selection.select([[50, 0], [100, 0], [100, 100], [50, 100]]);
    doc.selection.fill(white);
    doc.selection.deselect();
  `);
  await page.waitForTimeout(300);
  console.log('Created gradient test pattern\n');

  // Test each method and report which ones work
  const methodTests = [
    // === POSTERIZE ===
    { category: 'Posterize', methods: [
      'app.activeDocument.activeLayer.posterize(4)',
      'app.activeDocument.artLayers[0].posterize(4)',
      'app.activeDocument.layers[0].posterize(4)',
    ]},

    // === THRESHOLD ===
    { category: 'Threshold', methods: [
      'app.activeDocument.activeLayer.threshold(128)',
      'app.activeDocument.artLayers[0].threshold(128)',
    ]},

    // === LEVELS ===
    { category: 'Levels', methods: [
      'app.activeDocument.activeLayer.adjustLevels([0, 255], 0.5, [0, 255])',
      'app.activeDocument.activeLayer.levels([0, 255], 0.5, [0, 255])',
      'app.activeDocument.activeLayer.adjustLevels(0, 255, 0.5, 0, 255)',
    ]},

    // === CURVES ===
    { category: 'Curves', methods: [
      'app.activeDocument.activeLayer.adjustCurves([[0, 0], [128, 180], [255, 255]])',
      'app.activeDocument.activeLayer.curves([[0, 0], [128, 180], [255, 255]])',
    ]},

    // === HUE/SATURATION (need color image) ===
    { category: 'HueSaturation', methods: [
      'app.activeDocument.activeLayer.adjustHueSaturation(0, -100, 0)', // desaturate should work
      'app.activeDocument.activeLayer.hueSaturation(0, -100, 0)',
    ]},

    // === SHARPEN ===
    { category: 'Sharpen', methods: [
      'app.activeDocument.activeLayer.applySharpen()',
      'app.activeDocument.activeLayer.sharpen()',
      'app.activeDocument.activeLayer.applyFilter("Sharpen")',
    ]},

    // === FIND EDGES ===
    { category: 'FindEdges', methods: [
      'app.activeDocument.activeLayer.applyStyleize("FINDEDGES")',
      'app.activeDocument.activeLayer.applyFindEdges()',
      'app.activeDocument.activeLayer.findEdges()',
    ]},

    // === EMBOSS ===
    { category: 'Emboss', methods: [
      'app.activeDocument.activeLayer.applyStyleize("EMBOSS")',
      'app.activeDocument.activeLayer.applyEmboss()',
    ]},

    // === SOLARIZE ===
    { category: 'Solarize', methods: [
      'app.activeDocument.activeLayer.applyStyleize("SOLARIZE")',
      'app.activeDocument.activeLayer.applySolarize()',
    ]},

    // === MEDIAN ===
    { category: 'Median', methods: [
      'app.activeDocument.activeLayer.applyMedianNoise(3)',
      'app.activeDocument.activeLayer.applyMedian(3)',
    ]},

    // === MOSAIC ===
    { category: 'Mosaic', methods: [
      'app.activeDocument.activeLayer.applyMosaic(8)',
      'app.activeDocument.activeLayer.mosaic(8)',
    ]},

    // === EXPOSURE ===
    { category: 'Exposure', methods: [
      'app.activeDocument.activeLayer.adjustExposure(1, 0, 1)',
      'app.activeDocument.activeLayer.exposure(1, 0, 1)',
    ]},

    // === VIBRANCE ===
    { category: 'Vibrance', methods: [
      'app.activeDocument.activeLayer.adjustVibrance(50, 0)',
      'app.activeDocument.activeLayer.vibrance(50, 0)',
    ]},

    // === COLOR BALANCE ===
    { category: 'ColorBalance', methods: [
      'app.activeDocument.activeLayer.adjustColorBalance(50, 0, 0, false)',
      'app.activeDocument.activeLayer.colorBalance(50, 0, 0)',
    ]},
  ];

  console.log('Testing API methods...\n');
  console.log('=' .repeat(60));

  for (const test of methodTests) {
    console.log(`\n${test.category}:`);

    for (const method of test.methods) {
      // Reset to gradient
      await runScript(page, `
        var doc = app.activeDocument;
        var black = new SolidColor(); black.rgb.red = 0; black.rgb.green = 0; black.rgb.blue = 0;
        var white = new SolidColor(); white.rgb.red = 255; white.rgb.green = 255; white.rgb.blue = 255;
        doc.selection.select([[0, 0], [50, 0], [50, 100], [0, 100]]);
        doc.selection.fill(black);
        doc.selection.select([[50, 0], [100, 0], [100, 100], [50, 100]]);
        doc.selection.fill(white);
        doc.selection.deselect();
      `);
      await page.waitForTimeout(100);

      // Get before
      const before = await getPixelHash(page);

      // Try method
      let error = null;
      try {
        await runScript(page, method);
        await page.waitForTimeout(200);
      } catch (e) {
        error = e.message;
      }

      // Get after
      const after = await getPixelHash(page);
      const changed = before !== after;

      const status = error ? '❌ ERROR' : (changed ? '✅ WORKS' : '⚠️  NO CHANGE');
      console.log(`  ${status}: ${method.substring(0, 60)}...`);
      if (error) console.log(`       ${error.substring(0, 50)}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Testing complete. Browser staying open for 30s...');
  await page.waitForTimeout(30000);
  await browser.close();
}

async function runScript(page, script) {
  await page.evaluate((s) => {
    window.ppReady = false;
    document.getElementById('pp').contentWindow.postMessage(s, '*');
  }, script);
  await page.waitForFunction(() => window.ppReady, { timeout: 10000 });
}

async function getPixelHash(page) {
  await page.evaluate(() => { window.ppQueue = []; });
  await page.evaluate(() => {
    document.getElementById('pp').contentWindow.postMessage('app.activeDocument.saveToOE("png");', '*');
  });

  try {
    await page.waitForFunction(() => window.ppQueue.length > 0, { timeout: 3000 });
    const data = await page.evaluate(() => Array.from(window.ppQueue.shift()));
    // Simple hash: sum of first 1000 pixels
    return data.slice(0, 1000).reduce((a, b) => a + b, 0);
  } catch (e) {
    return null;
  }
}

main().catch(console.error);
