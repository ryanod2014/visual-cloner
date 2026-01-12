#!/usr/bin/env node
/**
 * Discover Photopea API by inspecting the app object
 */

const playwright = require('playwright');
const fs = require('fs').promises;

async function main() {
  const browser = await playwright.chromium.launch({ headless: false });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);

  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <body style="margin:0">
      <iframe id="pp" src="https://www.photopea.com" style="width:100vw;height:100vh;border:none;"></iframe>
      <script>
        window.ppQueue = [];
        window.ppReady = false;
        window.ppData = null;
        window.addEventListener('message', (e) => {
          if (e.data === 'done') window.ppReady = true;
          else if (e.data instanceof ArrayBuffer) {
            // Check if it's a string (from echoToOE)
            try {
              const text = new TextDecoder().decode(e.data);
              if (text.length < 50000) window.ppData = text;
            } catch(err) {}
            window.ppQueue.push(new Uint8Array(e.data));
          }
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

  // Test specific methods that we KNOW work from previous captures
  console.log('Testing KNOWN WORKING methods:\n');

  const workingTests = [
    { name: 'invert', script: 'app.activeDocument.activeLayer.invert()' },
    { name: 'desaturate', script: 'app.activeDocument.activeLayer.desaturate()' },
    { name: 'adjustBrightnessContrast', script: 'app.activeDocument.activeLayer.adjustBrightnessContrast(50, 0)' },
    { name: 'applyGaussianBlur', script: 'app.activeDocument.activeLayer.applyGaussianBlur(5)' },
    { name: 'applyHighPass', script: 'app.activeDocument.activeLayer.applyHighPass(5)' },
    { name: 'applyAddNoise', script: 'app.activeDocument.activeLayer.applyAddNoise(25, NoiseDistribution.UNIFORM, false)' },
  ];

  for (const test of workingTests) {
    await resetPattern(page);
    const before = await getPixelSum(page);
    await runScript(page, test.script);
    await page.waitForTimeout(200);
    const after = await getPixelSum(page);
    console.log(`${test.name}: ${before !== after ? '✅' : '❌'}`);
  }

  console.log('\nTesting FAILING methods with DIFFERENT patterns:\n');

  // Maybe posterize/threshold need a flattened layer or specific layer type?
  // Let's try on a freshly created filled layer
  const failingTests = [
    // Try posterize on fresh layer
    { name: 'posterize (4 levels)', script: 'app.activeDocument.activeLayer.posterize(4)' },

    // Maybe posterize needs different layer access
    { name: 'posterize via artLayers', script: 'app.activeDocument.artLayers[0].posterize(4)' },

    // Try threshold
    { name: 'threshold (128)', script: 'app.activeDocument.activeLayer.threshold(128)' },

    // Try with explicit layer selection
    { name: 'posterize after select', script: `
      app.activeDocument.activeLayer = app.activeDocument.layers[0];
      app.activeDocument.activeLayer.posterize(4);
    `},
  ];

  for (const test of failingTests) {
    await resetPattern(page);
    const before = await getPixelSum(page);
    try {
      await runScript(page, test.script);
      await page.waitForTimeout(200);
    } catch (e) {
      console.log(`${test.name}: ERROR - ${e.message.substring(0, 50)}`);
      continue;
    }
    const after = await getPixelSum(page);
    console.log(`${test.name}: ${before !== after ? '✅' : '❌'}`);
  }

  // Maybe the issue is that these methods exist but do nothing without params or specific state
  // Let's check what happens with console output
  console.log('\nChecking method existence...\n');

  await runScript(page, `
    var layer = app.activeDocument.activeLayer;
    var results = [];
    var methods = ['posterize', 'threshold', 'adjustLevels', 'adjustCurves', 'adjustHueSaturation',
                   'invert', 'desaturate', 'adjustBrightnessContrast', 'applyGaussianBlur'];
    for (var i = 0; i < methods.length; i++) {
      results.push(methods[i] + ': ' + (typeof layer[methods[i]]));
    }
    app.echoToOE(results.join('|'));
  `);
  await page.waitForTimeout(500);

  // Get the data
  const data = await page.evaluate(() => window.ppData);
  if (data) {
    console.log('Method types:');
    data.split('|').forEach(r => console.log('  ' + r));
  }

  console.log('\nBrowser staying open for 30s...');
  await page.waitForTimeout(30000);
  await browser.close();
}

async function runScript(page, script) {
  await page.evaluate((s) => {
    window.ppReady = false;
    window.ppData = null;
    document.getElementById('pp').contentWindow.postMessage(s, '*');
  }, script);
  await page.waitForFunction(() => window.ppReady, { timeout: 10000 });
}

async function resetPattern(page) {
  await runScript(page, `
    var doc = app.activeDocument;
    var g1 = new SolidColor(); g1.rgb.red = 64; g1.rgb.green = 64; g1.rgb.blue = 64;
    var g2 = new SolidColor(); g2.rgb.red = 128; g2.rgb.green = 128; g2.rgb.blue = 128;
    var g3 = new SolidColor(); g3.rgb.red = 192; g3.rgb.green = 192; g3.rgb.blue = 192;
    doc.selection.select([[0, 0], [33, 0], [33, 100], [0, 100]]); doc.selection.fill(g1);
    doc.selection.select([[33, 0], [66, 0], [66, 100], [33, 100]]); doc.selection.fill(g2);
    doc.selection.select([[66, 0], [100, 0], [100, 100], [66, 100]]); doc.selection.fill(g3);
    doc.selection.deselect();
  `);
  await page.waitForTimeout(100);
}

async function getPixelSum(page) {
  await page.evaluate(() => { window.ppQueue = []; });
  await page.evaluate(() => {
    document.getElementById('pp').contentWindow.postMessage('app.activeDocument.saveToOE("png");', '*');
  });
  try {
    await page.waitForFunction(() => window.ppQueue.length > 0, { timeout: 3000 });
    const data = await page.evaluate(() => Array.from(window.ppQueue.shift()));
    return data.slice(0, 2000).reduce((a, b) => a + b, 0);
  } catch (e) {
    return null;
  }
}

main().catch(console.error);
