#!/usr/bin/env node
/**
 * Debug the fill operation to understand why it's not working
 */

const playwright = require('playwright');
const PNG = require('pngjs').PNG;

async function main() {
  const browser = await playwright.chromium.launch({ headless: false });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);

  page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

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
          console.log('MSG:', typeof e.data, e.data instanceof ArrayBuffer ? 'ArrayBuffer' : e.data);
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
  console.log('Photopea ready');

  // Create document
  await runScript(page, 'app.documents.add(100, 100, 72, "Test", NewDocumentMode.RGB);');
  await page.waitForTimeout(1000);

  // Check what we have
  console.log('\n=== After create document ===');
  const pixels1 = await getPixels(page);
  if (pixels1) {
    console.log(`Size: ${pixels1.width}x${pixels1.height}`);
    console.log('First pixel RGBA:', pixels1.pixels.slice(0, 4));
  }

  // Fill with mid-gray - try SolidColor approach
  console.log('\n=== Filling with gray 128 (SolidColor) ===');
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
  await page.waitForTimeout(500);

  const pixels2 = await getPixels(page);
  if (pixels2) {
    console.log('First pixel RGBA:', pixels2.pixels.slice(0, 4));
  }

  // Try Edit > Fill instead
  console.log('\n=== Trying different fill approach ===');
  await runScript(page, `
    var doc = app.activeDocument;
    var layer = doc.activeLayer;
    app.foregroundColor.rgb.red = 200;
    app.foregroundColor.rgb.green = 100;
    app.foregroundColor.rgb.blue = 50;
  `);
  await page.waitForTimeout(200);

  // Use Edit menu fill
  await runScript(page, `
    var doc = app.activeDocument;
    doc.selection.selectAll();
    app.doAction("Fill", "Fill");
  `);
  await page.waitForTimeout(500);

  const pixels3 = await getPixels(page);
  if (pixels3) {
    console.log('First pixel RGBA:', pixels3.pixels.slice(0, 4));
  }

  // Take screenshot
  await page.screenshot({ path: 'debug-fill.png' });
  console.log('\nSaved debug-fill.png');

  await browser.close();
}

async function runScript(page, script) {
  await page.evaluate((s) => {
    document.getElementById('pp').contentWindow.postMessage(s, '*');
  }, script);
  try {
    await page.waitForFunction(() => window.ppReady, { timeout: 5000 });
  } catch (e) {}
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

main().catch(console.error);
