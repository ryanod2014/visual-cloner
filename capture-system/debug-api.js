#!/usr/bin/env node
/**
 * Debug Photopea API calls to find correct syntax
 */

const playwright = require('playwright');

async function main() {
  const browser = await playwright.chromium.launch({ headless: false });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  // Setup
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <body style="margin:0">
      <iframe id="pp" src="https://www.photopea.com" style="width:100vw;height:100vh;border:none;"></iframe>
      <script>
        window.ppQueue = [];
        window.ppReady = false;
        window.ppError = null;
        window.addEventListener('message', (e) => {
          if (e.data === 'done') window.ppReady = true;
          else if (typeof e.data === 'string' && e.data.startsWith('Error:')) {
            window.ppError = e.data;
            window.ppReady = true;
          }
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
  console.log('Photopea ready\n');

  // Create doc
  await runScript(page, 'app.documents.add(100, 100, 72, "Test", NewDocumentMode.RGB);');
  await page.waitForTimeout(500);

  // Fill with multilevel
  await runScript(page, `
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
  `);
  await page.waitForTimeout(300);

  // Test different API syntaxes
  const tests = [
    // Levels - try different syntaxes
    { name: 'levels v1', script: 'app.activeDocument.activeLayer.adjustLevels([0, 255], 0.5, [0, 255])' },
    { name: 'levels v2', script: 'app.activeDocument.activeLayer.adjustLevels(0, 255, 0.5, 0, 255)' },
    { name: 'levels v3', script: 'app.activeDocument.activeLayer.levels([0, 255], 0.5, [0, 255])' },

    // Curves
    { name: 'curves v1', script: 'app.activeDocument.activeLayer.adjustCurves([[0, 0], [128, 160], [255, 255]])' },
    { name: 'curves v2', script: 'app.activeDocument.activeLayer.curves([[0, 0], [128, 160], [255, 255]])' },

    // Posterize
    { name: 'posterize v1', script: 'app.activeDocument.activeLayer.posterize(4)' },
    { name: 'posterize v2', script: 'app.activeDocument.activeLayer.adjustPosterize(4)' },

    // Threshold
    { name: 'threshold v1', script: 'app.activeDocument.activeLayer.threshold(128)' },
    { name: 'threshold v2', script: 'app.activeDocument.activeLayer.adjustThreshold(128)' },

    // Sharpen
    { name: 'sharpen v1', script: 'app.activeDocument.activeLayer.applySharpen()' },
    { name: 'sharpen v2', script: 'app.activeDocument.activeLayer.sharpen()' },

    // Find Edges
    { name: 'findedges v1', script: 'app.activeDocument.activeLayer.applyStyleize("FINDEDGES")' },
    { name: 'findedges v2', script: 'app.activeDocument.activeLayer.applyFindEdges()' },

    // Median
    { name: 'median v1', script: 'app.activeDocument.activeLayer.applyMedianNoise(3)' },
    { name: 'median v2', script: 'app.activeDocument.activeLayer.applyMedian(3)' },

    // Exposure
    { name: 'exposure v1', script: 'app.activeDocument.activeLayer.adjustExposure(1, 0, 1)' },
    { name: 'exposure v2', script: 'app.activeDocument.activeLayer.exposure(1, 0, 1)' },
  ];

  console.log('Testing API syntaxes:\n');

  for (const test of tests) {
    // Reset
    await runScript(page, `
      var doc = app.activeDocument;
      var g2 = new SolidColor(); g2.rgb.red = 128; g2.rgb.green = 128; g2.rgb.blue = 128;
      doc.selection.selectAll();
      doc.selection.fill(g2);
      doc.selection.deselect();
    `);

    // Get before pixel
    const before = await getPixel(page);

    // Try operation
    let error = null;
    try {
      await runScript(page, test.script);
    } catch (e) {
      error = e.message;
    }

    // Get after pixel
    const after = await getPixel(page);
    const changed = before !== after;

    console.log(`${test.name}: ${changed ? 'WORKS' : 'NO CHANGE'} ${error ? '(ERROR: ' + error + ')' : ''}`);
    console.log(`  before: ${before}, after: ${after}`);
  }

  console.log('\nDone. Browser staying open...');
  await page.waitForTimeout(60000);
  await browser.close();
}

async function runScript(page, script) {
  await page.evaluate((s) => {
    window.ppReady = false;
    window.ppError = null;
    document.getElementById('pp').contentWindow.postMessage(s, '*');
  }, script);
  await page.waitForFunction(() => window.ppReady, { timeout: 10000 });
  const error = await page.evaluate(() => window.ppError);
  if (error) throw new Error(error);
}

async function getPixel(page) {
  await page.evaluate(() => { window.ppQueue = []; });
  await page.evaluate(() => {
    document.getElementById('pp').contentWindow.postMessage('app.echoToOE(app.activeDocument.activeLayer.bounds.toString());', '*');
  });
  await page.waitForTimeout(200);

  // Get center pixel via script
  await page.evaluate(() => {
    document.getElementById('pp').contentWindow.postMessage(`
      var doc = app.activeDocument;
      var sampler = doc.colorSamplers.add([50, 50]);
      app.echoToOE(sampler.color.rgb.red + "," + sampler.color.rgb.green + "," + sampler.color.rgb.blue);
      sampler.remove();
    `, '*');
  });
  await page.waitForTimeout(300);

  // Actually need to get PNG to check
  await page.evaluate(() => { window.ppQueue = []; });
  await page.evaluate(() => {
    document.getElementById('pp').contentWindow.postMessage('app.activeDocument.saveToOE("png");', '*');
  });

  try {
    await page.waitForFunction(() => window.ppQueue.length > 0, { timeout: 3000 });
    const data = await page.evaluate(() => Array.from(window.ppQueue.shift()));
    // Return first pixel RGB
    const PNG = require('pngjs').PNG;
    const buffer = Buffer.from(data);
    return new Promise(resolve => {
      new PNG().parse(buffer, (err, png) => {
        if (err) resolve('error');
        else resolve(`${png.data[0]},${png.data[1]},${png.data[2]}`);
      });
    });
  } catch (e) {
    return 'timeout';
  }
}

main().catch(console.error);
