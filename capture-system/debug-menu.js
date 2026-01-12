#!/usr/bin/env node
/**
 * Debug Photopea using menu commands instead of direct API methods
 */

const playwright = require('playwright');

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
  console.log('Photopea ready\n');

  // Create doc with gradient
  await runScript(page, 'app.documents.add(100, 100, 72, "Test", NewDocumentMode.RGB);');
  await page.waitForTimeout(500);

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

  // Test menu commands
  const menuTests = [
    // Try to discover what properties/methods exist on activeLayer
    { name: 'List layer methods', script: `
      var layer = app.activeDocument.activeLayer;
      var methods = [];
      for (var key in layer) {
        if (typeof layer[key] === 'function') methods.push(key);
      }
      app.echoToOE(methods.join(', '));
    `},

    // Try posterize with different approaches
    { name: 'Posterize via layer', script: 'app.activeDocument.activeLayer.posterize(4)' },

    // Try doAction
    { name: 'Posterize doAction', script: 'app.doAction("Posterize", "Default Actions")' },

    // Check if method exists
    { name: 'Check posterize exists', script: `
      app.echoToOE(typeof app.activeDocument.activeLayer.posterize);
    `},

    // Check adjustBrightnessContrast (we know this works)
    { name: 'Check adjustBrightnessContrast', script: `
      app.echoToOE(typeof app.activeDocument.activeLayer.adjustBrightnessContrast);
    `},

    // Check applyGaussianBlur (we know this works)
    { name: 'Check applyGaussianBlur', script: `
      app.echoToOE(typeof app.activeDocument.activeLayer.applyGaussianBlur);
    `},

    // Actually test adjustBrightnessContrast
    { name: 'Test adjustBrightnessContrast', script: 'app.activeDocument.activeLayer.adjustBrightnessContrast(50, 0)' },

    // Actually test applyGaussianBlur
    { name: 'Test applyGaussianBlur', script: 'app.activeDocument.activeLayer.applyGaussianBlur(5)' },
  ];

  console.log('Testing approaches...\n');

  for (const test of menuTests) {
    console.log(`${test.name}:`);

    // Reset pattern
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

    const before = await getPixelHash(page);

    // Run test
    try {
      await runScript(page, test.script);
      await page.waitForTimeout(300);
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
      continue;
    }

    // Check result
    const result = await page.evaluate(() => window.ppResult);
    if (result) {
      console.log(`  Result: ${result.substring(0, 200)}`);
      await page.evaluate(() => { window.ppResult = null; });
    }

    const after = await getPixelHash(page);
    if (before !== after) {
      console.log(`  ✅ PIXELS CHANGED`);
    } else {
      console.log(`  ⚠️  No pixel change`);
    }
    console.log();
  }

  console.log('Browser staying open for 60s...');
  await page.waitForTimeout(60000);
  await browser.close();
}

async function runScript(page, script) {
  await page.evaluate((s) => {
    window.ppReady = false;
    window.ppResult = null;
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
    return data.slice(0, 1000).reduce((a, b) => a + b, 0);
  } catch (e) {
    return null;
  }
}

main().catch(console.error);
