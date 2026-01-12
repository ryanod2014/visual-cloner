#!/usr/bin/env node
/**
 * Simple debug - list all layer methods and test known working vs failing
 */

const playwright = require('playwright');

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
        window.ppEcho = null;
        window.addEventListener('message', (e) => {
          if (e.data === 'done') window.ppReady = true;
          else if (e.data instanceof ArrayBuffer) window.ppQueue.push(new Uint8Array(e.data));
          else if (typeof e.data === 'string' && !e.data.startsWith('{')) window.ppEcho = e.data;
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

  // List all methods on activeLayer
  console.log('=== LAYER METHODS ===\n');
  await page.evaluate(() => { window.ppEcho = null; });
  await runScript(page, `
    var layer = app.activeDocument.activeLayer;
    var methods = [];
    for (var key in layer) {
      if (typeof layer[key] === 'function') methods.push(key);
    }
    app.echoToOE(methods.sort().join('\\n'));
  `);
  await page.waitForTimeout(500);
  const methods = await page.evaluate(() => window.ppEcho);
  if (methods) {
    console.log(methods);
  }

  console.log('\n=== DOCUMENT METHODS ===\n');
  await page.evaluate(() => { window.ppEcho = null; });
  await runScript(page, `
    var doc = app.activeDocument;
    var methods = [];
    for (var key in doc) {
      if (typeof doc[key] === 'function') methods.push(key);
    }
    app.echoToOE(methods.sort().join('\\n'));
  `);
  await page.waitForTimeout(500);
  const docMethods = await page.evaluate(() => window.ppEcho);
  if (docMethods) {
    console.log(docMethods);
  }

  console.log('\nBrowser staying open for 30s...');
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

main().catch(console.error);
