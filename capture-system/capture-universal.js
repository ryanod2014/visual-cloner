#!/usr/bin/env node
/**
 * UNIVERSAL Pixel Capture System
 *
 * Works on ANY canvas-based webapp using TWO approaches:
 * 1. PostMessage API (for apps that support it like Photopea)
 * 2. Screenshot + crop (universal fallback)
 *
 * Operations triggered via keyboard shortcuts (universal)
 */

const fs = require('fs').promises;
const path = require('path');
const playwright = require('playwright');
const PNG = require('pngjs').PNG;

// App configurations
const APP_CONFIGS = {
  photopea: {
    name: 'Photopea',
    url: 'https://www.photopea.com',
    method: 'postmessage', // Use postMessage API
    setupWait: 10000,
    clickToStart: { x: 640, y: 310 },
    postClickWait: 8000,
    docSize: { width: 100, height: 100 },
    operations: [
      // Keyboard shortcut based operations (use Meta for macOS Cmd key)
      { name: 'Invert', shortcut: ['Meta', 'i'] },
      { name: 'Desaturate', shortcut: ['Meta', 'Shift', 'u'] },
      { name: 'AutoTone', shortcut: ['Meta', 'Shift', 'l'] },
      { name: 'AutoContrast', shortcut: ['Meta', 'Alt', 'Shift', 'l'] },
      { name: 'Levels', shortcut: ['Meta', 'l'], hasDialog: true },
      { name: 'Curves', shortcut: ['Meta', 'm'], hasDialog: true },
      { name: 'HueSaturation', shortcut: ['Meta', 'u'], hasDialog: true },
      { name: 'ColorBalance', shortcut: ['Meta', 'b'], hasDialog: true },
    ]
  },

  // Template for other apps - uses screenshot method
  generic: {
    name: 'Generic Canvas App',
    url: '',
    method: 'screenshot',
    setupWait: 5000,
    operations: []
  }
};

async function main() {
  const appName = process.argv[2] || 'photopea';
  const config = APP_CONFIGS[appName];

  if (!config) {
    console.log(`Unknown app: ${appName}`);
    console.log(`Available: ${Object.keys(APP_CONFIGS).join(', ')}`);
    process.exit(1);
  }

  console.log('═'.repeat(60));
  console.log(`UNIVERSAL CAPTURE - ${config.name}`);
  console.log(`Method: ${config.method}`);
  console.log('═'.repeat(60));
  console.log(`Operations: ${config.operations.length}`);
  console.log('');

  const browser = await playwright.chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(60000);

  const results = [];

  try {
    if (config.method === 'postmessage') {
      await runPostMessageCapture(page, config, results);
    } else {
      await runScreenshotCapture(page, config, results);
    }

    // Save results
    const outputDir = path.join(__dirname, 'output', `universal-${appName}`);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      path.join(outputDir, 'operations.json'),
      JSON.stringify(results, null, 2)
    );

    // Summary
    const withChanges = results.filter(r => r.diff && r.diff.changedPixels > 0).length;
    console.log('\n' + '═'.repeat(60));
    console.log('CAPTURE COMPLETE');
    console.log('═'.repeat(60));
    console.log(`Captured: ${results.length}/${config.operations.length}`);
    console.log(`With changes: ${withChanges}`);
    console.log(`Output: ${outputDir}`);

  } finally {
    await browser.close();
  }
}

/**
 * PostMessage-based capture (for Photopea and similar apps)
 */
async function runPostMessageCapture(page, config, results) {
  console.log('1. Setting up iframe with postMessage...');

  // Embed app in iframe with message handler
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <body style="margin:0">
      <iframe id="app" src="${config.url}" style="width:100vw;height:100vh;border:none;"></iframe>
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

  await page.waitForTimeout(config.setupWait);

  // Click to start
  if (config.clickToStart) {
    console.log('2. Clicking to start app...');
    await page.mouse.click(config.clickToStart.x, config.clickToStart.y);
    await page.waitForTimeout(config.postClickWait);
  }

  // Wait for ready
  await page.waitForFunction(() => window.ppReady, { timeout: 60000 });
  console.log('   App ready!');

  // Create test document
  console.log('3. Creating test document...');
  const { width, height } = config.docSize;
  await runScript(page, `app.documents.add(${width}, ${height}, 72, "Test", NewDocumentMode.RGB);`);
  await page.waitForTimeout(500);

  // Fill with test pattern (gradient for edges)
  await runScript(page, `
    var doc = app.activeDocument;
    var black = new SolidColor(); black.rgb.red = 0; black.rgb.green = 0; black.rgb.blue = 0;
    var white = new SolidColor(); white.rgb.red = 255; white.rgb.green = 255; white.rgb.blue = 255;
    doc.selection.select([[0, 0], [${width/2}, 0], [${width/2}, ${height}], [0, ${height}]]);
    doc.selection.fill(black);
    doc.selection.select([[${width/2}, 0], [${width}, 0], [${width}, ${height}], [${width/2}, ${height}]]);
    doc.selection.fill(white);
    doc.selection.deselect();
  `);
  await page.waitForTimeout(300);

  console.log('4. Testing operations...\n');

  // Get iframe frame handle
  const iframe = page.frameLocator('#app');

  for (const op of config.operations) {
    process.stdout.write(`   ${op.name}... `);

    // Get before pixels
    const before = await getPixelsViaPostMessage(page);
    if (!before) {
      console.log('SKIP (no before)');
      continue;
    }

    // Execute via postMessage API (keyboard shortcuts don't work cross-origin)
    // Convert shortcut to equivalent Photopea script command
    const script = shortcutToScript(op.name);
    if (!script) {
      console.log('SKIP (no script mapping)');
      continue;
    }

    try {
      await runScript(page, script);
      await page.waitForTimeout(op.hasDialog ? 500 : 200);

      // Accept dialog with Enter (if dialog shown)
      if (op.hasDialog) {
        // Click OK button via script
        await runScript(page, 'app.activeDocument.activeLayer'); // trigger any pending dialog
        await page.waitForTimeout(300);
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      continue;
    }

    // Get after pixels
    const after = await getPixelsViaPostMessage(page);
    if (!after) {
      console.log('SKIP (no after)');
      continue;
    }

    // Compare
    const diff = comparePixels(before.pixels, after.pixels);
    console.log(`${diff.percentChanged}% changed`);

    results.push({
      operation: op.name,
      shortcut: op.shortcut.join('+'),
      method: 'postmessage-script',
      input: before,
      output: after,
      diff
    });
  }

  // Cleanup
  await runScript(page, 'app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);');
}

/**
 * Screenshot-based capture (universal fallback)
 */
async function runScreenshotCapture(page, config, results) {
  console.log('1. Loading app directly...');
  await page.goto(config.url);
  await page.waitForTimeout(config.setupWait);

  console.log('2. Finding canvas...');
  const canvasBox = await page.$eval('canvas', el => {
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  console.log(`   Canvas at (${canvasBox.x}, ${canvasBox.y}) ${canvasBox.width}x${canvasBox.height}`);

  console.log('3. Testing operations...\n');

  for (const op of config.operations) {
    process.stdout.write(`   ${op.name}... `);

    // Screenshot before
    const beforeBuffer = await page.screenshot({ clip: canvasBox });
    const before = await parsePNG(beforeBuffer);

    // Execute shortcut
    await pressShortcut(page, op.shortcut);
    await page.waitForTimeout(300);

    // Screenshot after
    const afterBuffer = await page.screenshot({ clip: canvasBox });
    const after = await parsePNG(afterBuffer);

    // Compare
    const diff = comparePixels(before.pixels, after.pixels);
    console.log(`${diff.percentChanged}% changed`);

    results.push({
      operation: op.name,
      shortcut: op.shortcut.join('+'),
      method: 'screenshot',
      diff
    });
  }
}

// Map operation names to Photopea script commands
function shortcutToScript(opName) {
  const scripts = {
    'Invert': 'app.activeDocument.activeLayer.invert()',
    'Desaturate': 'app.activeDocument.activeLayer.desaturate()',
    'AutoTone': 'app.activeDocument.autoTone()',
    'AutoContrast': 'app.activeDocument.autoContrast()',
    'Levels': 'app.activeDocument.activeLayer.adjustLevels([0, 255], 1.2, [0, 255])',
    'Curves': 'app.activeDocument.activeLayer.adjustCurves([[0, 0], [128, 160], [255, 255]])',
    'HueSaturation': 'app.activeDocument.activeLayer.adjustHueSaturation(30, 0, 0)',
    'ColorBalance': 'app.activeDocument.activeLayer.adjustColorBalance(30, 0, 0, false)',
  };
  return scripts[opName];
}

async function runScript(page, script) {
  await page.evaluate((s) => {
    window.ppReady = false;
    document.getElementById('app').contentWindow.postMessage(s, '*');
  }, script);
  await page.waitForFunction(() => window.ppReady, { timeout: 10000 });
}

async function getPixelsViaPostMessage(page) {
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

  return parsePNG(buffer);
}

function parsePNG(buffer) {
  return new Promise((resolve) => {
    new PNG().parse(buffer, (err, png) => {
      if (err) resolve(null);
      else resolve({ width: png.width, height: png.height, pixels: Array.from(png.data) });
    });
  });
}

async function pressShortcut(page, keys) {
  const modifiers = keys.slice(0, -1);
  const key = keys[keys.length - 1];

  for (const mod of modifiers) {
    await page.keyboard.down(mod);
  }
  await page.keyboard.press(key);
  for (const mod of [...modifiers].reverse()) {
    await page.keyboard.up(mod);
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
