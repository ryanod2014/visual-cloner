#!/usr/bin/env node
/**
 * Iframe-based Pixel Capture with proper postMessage handling
 *
 * This approach embeds Photopea in an iframe and uses saveToOE to get raw document pixels.
 */

const fs = require('fs').promises;
const path = require('path');
const playwright = require('playwright');
const PNG = require('pngjs').PNG;

const OPERATIONS = [
  { name: 'Invert', shortcut: 'Control+i' },
  { name: 'Desaturate', shortcut: 'Control+Shift+u' },
  { name: 'Posterize', script: 'app.activeDocument.activeLayer.posterize(4)' },
  { name: 'Threshold', script: 'app.activeDocument.activeLayer.threshold(128)' },
  { name: 'GaussianBlur_5', script: 'app.activeDocument.activeLayer.applyGaussianBlur(5)' },
];

async function main() {
  console.log('═'.repeat(60));
  console.log('IFRAME PIXEL CAPTURE - saveToOE approach');
  console.log('═'.repeat(60));

  const browser = await playwright.chromium.launch({ headless: false });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);

  // Listen for console messages from the page
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('PP:') || text.includes('Message')) {
      console.log(`[Browser] ${text}`);
    }
  });

  try {
    // Create page with Photopea in iframe
    console.log('\n1. Setting up iframe with Photopea...');
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
          window.ppLastString = null;
          window.ppMessageCount = 0;

          window.addEventListener('message', (e) => {
            window.ppMessageCount++;
            const type = typeof e.data;
            const isBuffer = e.data instanceof ArrayBuffer;

            console.log('PP: Message #' + window.ppMessageCount + ' type=' + type +
                        ' isBuffer=' + isBuffer +
                        (isBuffer ? ' size=' + e.data.byteLength : '') +
                        (!isBuffer && type === 'string' ? ' value=' + e.data.substring(0, 50) : ''));

            if (e.data === 'done') {
              console.log('PP: Photopea signaled READY');
              window.ppReady = true;
            } else if (isBuffer) {
              console.log('PP: Got ArrayBuffer, size=' + e.data.byteLength);
              window.ppQueue.push(new Uint8Array(e.data));
            } else if (type === 'string') {
              window.ppLastString = e.data;
            }
          });

          console.log('PP: Message listener installed');
        </script>
      </body>
      </html>
    `, { waitUntil: 'domcontentloaded' });

    // Wait for iframe to load
    console.log('2. Waiting for iframe to load...');
    await page.waitForTimeout(10000);

    // Click "Start using Photopea" button - use coordinates since iframe click is tricky
    console.log('3. Clicking Start button...');
    // The button is roughly at center of page, around y=310
    await page.mouse.click(640, 310);
    await page.waitForTimeout(8000);  // Wait for app to load after click

    // Take screenshot to see state
    await page.screenshot({ path: 'iframe-state-1.png' });
    console.log('   Saved iframe-state-1.png');

    // Now wait for ready signal
    console.log('4. Waiting for Photopea ready signal...');
    try {
      await page.waitForFunction(() => window.ppReady, { timeout: 60000 });
      console.log('   Photopea signaled ready!');
    } catch (e) {
      console.log('   Timeout waiting for ready signal');
      const count = await page.evaluate(() => window.ppMessageCount);
      console.log(`   Received ${count} messages so far`);
    }

    // Send a test script to verify communication
    console.log('\n5. Testing postMessage communication...');
    await page.evaluate(() => {
      const iframe = document.getElementById('pp');
      console.log('PP: Sending test message');
      iframe.contentWindow.postMessage('app.echoToOE("test123");', '*');
    });
    await page.waitForTimeout(2000);

    // Check if we got a response
    const testResult = await page.evaluate(() => {
      return {
        queueLength: window.ppQueue.length,
        lastString: window.ppLastString,
        messageCount: window.ppMessageCount
      };
    });
    console.log('   Test result:', testResult);

    // Create a new document
    console.log('\n6. Creating new document...');
    await page.evaluate(() => {
      const iframe = document.getElementById('pp');
      iframe.contentWindow.postMessage('app.documents.add(200, 200, 72, "Test", NewDocumentMode.RGB);', '*');
    });
    await page.waitForTimeout(3000);

    // Fill with gradient
    console.log('7. Filling with test pattern...');
    await page.evaluate(() => {
      const iframe = document.getElementById('pp');
      iframe.contentWindow.postMessage(`
        var doc = app.activeDocument;
        app.foregroundColor.rgb.red = 0;
        app.foregroundColor.rgb.green = 0;
        app.foregroundColor.rgb.blue = 0;
        app.backgroundColor.rgb.red = 255;
        app.backgroundColor.rgb.green = 255;
        app.backgroundColor.rgb.blue = 255;
        doc.selection.selectAll();
        doc.selection.fill(app.foregroundColor);
        doc.selection.deselect();
      `, '*');
    });
    await page.waitForTimeout(2000);

    // Try to export
    console.log('\n8. Attempting saveToOE export...');
    await page.evaluate(() => {
      window.ppQueue = []; // Clear queue
      const iframe = document.getElementById('pp');
      console.log('PP: Requesting PNG export');
      iframe.contentWindow.postMessage('app.activeDocument.saveToOE("png");', '*');
    });

    // Wait for export result
    console.log('   Waiting for ArrayBuffer...');
    try {
      const hasData = await page.waitForFunction(() => window.ppQueue.length > 0, { timeout: 15000 });
      if (hasData) {
        const exportData = await page.evaluate(() => {
          const data = window.ppQueue.shift();
          return Array.from(data);
        });
        console.log(`   SUCCESS! Got ${exportData.length} bytes`);

        // Parse PNG
        const buffer = Buffer.from(exportData);
        const png = PNG.sync.read(buffer);
        console.log(`   Document size: ${png.width}x${png.height}`);

        // Save it
        await fs.writeFile(path.join(__dirname, 'output', 'export-test.png'), buffer);
        console.log('   Saved output/export-test.png');
      }
    } catch (e) {
      console.log('   No ArrayBuffer received within timeout');
      const state = await page.evaluate(() => ({
        queueLength: window.ppQueue.length,
        messageCount: window.ppMessageCount,
        ready: window.ppReady,
        lastString: window.ppLastString
      }));
      console.log('   Current state:', state);
    }

    await page.screenshot({ path: 'iframe-state-2.png' });
    console.log('   Saved iframe-state-2.png');

    console.log('\n' + '═'.repeat(60));
    console.log('DEBUG COMPLETE - Check console output above');
    console.log('═'.repeat(60));

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
