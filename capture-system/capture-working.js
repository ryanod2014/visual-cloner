#!/usr/bin/env node
/**
 * Working Pixel Capture
 *
 * Uses element screenshots of the canvas to capture exact pixels.
 * This approach works reliably even when canvas context can't be read directly.
 */

const fs = require('fs').promises;
const path = require('path');
const playwright = require('playwright');
const PNG = require('pngjs').PNG;

const OPERATIONS = [
  { name: 'Invert', shortcut: 'Control+i' },
  { name: 'Desaturate', shortcut: 'Control+Shift+u' },
  { name: 'Levels', shortcut: 'Control+l', hasDialog: true },
  { name: 'Curves', shortcut: 'Control+m', hasDialog: true },
  { name: 'HueSaturation', shortcut: 'Control+u', hasDialog: true },
  { name: 'ColorBalance', shortcut: 'Control+b', hasDialog: true },
];

async function main() {
  console.log('═'.repeat(60));
  console.log('WORKING PIXEL CAPTURE');
  console.log('═'.repeat(60));

  const browser = await playwright.chromium.launch({ headless: false });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    // Load Photopea
    console.log('\n1. Loading Photopea...');
    await page.goto('https://www.photopea.com', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    // Click through landing
    console.log('2. Clicking Start button...');
    try {
      await page.click('text=Start using Photopea', { timeout: 5000 });
    } catch (e) {
      console.log('   Start button not found, app may already be loaded');
    }

    // Wait for app to load - use longer timeout with fallback
    console.log('3. Waiting for app to fully load...');
    try {
      await page.waitForSelector('canvas', { timeout: 30000 });
      console.log('   Canvas found!');
    } catch (e) {
      console.log('   Canvas not found after 30s, waiting more...');
      await page.waitForTimeout(20000);
    }
    await page.waitForTimeout(3000);

    // Click New Project
    console.log('4. Creating new project...');
    await page.click('text=New Project');
    await page.waitForTimeout(1500);

    // Click Create in dialog
    try {
      await page.click('button:has-text("Create")');
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log('   (Create button not found, trying Enter)');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    // Take screenshot to verify
    await page.screenshot({ path: 'capture-state.png' });
    console.log('   Saved capture-state.png');

    // Find the main canvas (largest one)
    const canvases = await page.$$('canvas');
    console.log(`5. Found ${canvases.length} canvases`);

    let mainCanvas = null;
    let maxArea = 0;
    for (const canvas of canvases) {
      const box = await canvas.boundingBox();
      if (box) {
        const area = box.width * box.height;
        if (area > maxArea) {
          maxArea = area;
          mainCanvas = canvas;
        }
      }
    }

    if (!mainCanvas) {
      console.log('ERROR: No main canvas found');
      await browser.close();
      return;
    }

    const mainBox = await mainCanvas.boundingBox();
    console.log(`   Main canvas: ${mainBox.width}x${mainBox.height} at (${mainBox.x}, ${mainBox.y})`);

    // Draw colorful test content
    console.log('6. Drawing test content...');

    // Reset colors to default (D key) and swap if needed (X key)
    await page.keyboard.press('d'); // Default colors: black foreground
    await page.waitForTimeout(200);

    // Select gradient tool and draw a gradient
    await page.keyboard.press('g'); // Gradient tool
    await page.waitForTimeout(300);

    // Draw horizontal gradient across the canvas
    const cx = mainBox.x + mainBox.width / 2;
    const cy = mainBox.y + mainBox.height / 2;
    const startX = mainBox.x + 50;
    const endX = mainBox.x + mainBox.width - 50;

    await page.mouse.move(startX, cy);
    await page.mouse.down();
    await page.mouse.move(endX, cy);
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Also add some colored brush strokes
    await page.keyboard.press('b'); // Brush tool
    await page.waitForTimeout(200);

    // Draw with default black
    await page.mouse.move(cx - 80, cy - 80);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy + 80);
    await page.mouse.up();
    await page.waitForTimeout(100);

    // Swap to white and draw another stroke
    await page.keyboard.press('x'); // Swap foreground/background
    await page.waitForTimeout(100);
    await page.mouse.move(cx + 80, cy - 80);
    await page.mouse.down();
    await page.mouse.move(cx - 80, cy + 80);
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Take a screenshot to verify content
    await mainCanvas.screenshot({ path: 'test-content.png' });
    console.log('   Saved test-content.png');

    // Create output directory
    const outputDir = path.join(__dirname, 'output', 'working-specs');
    await fs.mkdir(outputDir, { recursive: true });

    // Try to get document bounds from the visible document area
    // The document appears as a lighter rectangle in the gray workspace
    const docBounds = await page.evaluate(() => {
      // Look for the document area - it's usually marked by a specific element or we can detect it
      // The document in Photopea has a shadow/border around it
      // For now, we'll try to use the postMessage API to export
      return null;
    });

    // Function to export document pixels via postMessage API
    const exportDocumentPixels = async () => {
      const result = await page.evaluate(() => {
        return new Promise((resolve) => {
          const handler = (e) => {
            if (e.data instanceof ArrayBuffer) {
              window.removeEventListener('message', handler);
              const bytes = new Uint8Array(e.data);
              let binary = '';
              for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              resolve(btoa(binary));
            }
          };
          window.addEventListener('message', handler);
          window.postMessage('app.activeDocument.saveToOE("png")', '*');
          setTimeout(() => {
            window.removeEventListener('message', handler);
            resolve(null);
          }, 10000);
        });
      });

      if (!result) return null;

      const buffer = Buffer.from(result, 'base64');
      return new Promise((resolve) => {
        new PNG().parse(buffer, (err, png) => {
          if (err) resolve(null);
          else resolve({
            width: png.width,
            height: png.height,
            pixels: Array.from(png.data)
          });
        });
      });
    };

    // Detect document bounds by finding non-gray area
    const detectDocBounds = (png) => {
      const isGray = (r, g, b) => {
        return Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && r < 100 && r > 30;
      };

      let minX = png.width, maxX = 0, minY = png.height, maxY = 0;
      for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
          const idx = (y * png.width + x) * 4;
          if (!isGray(png.data[idx], png.data[idx+1], png.data[idx+2])) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      return { minX, minY, maxX, maxY };
    };

    // Crop PNG to document bounds
    const cropToDoc = (png, bounds) => {
      const w = bounds.maxX - bounds.minX + 1;
      const h = bounds.maxY - bounds.minY + 1;
      const cropped = new Array(w * h * 4);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const srcIdx = ((bounds.minY + y) * png.width + (bounds.minX + x)) * 4;
          const dstIdx = (y * w + x) * 4;
          cropped[dstIdx] = png.data[srcIdx];
          cropped[dstIdx + 1] = png.data[srcIdx + 1];
          cropped[dstIdx + 2] = png.data[srcIdx + 2];
          cropped[dstIdx + 3] = png.data[srcIdx + 3];
        }
      }
      return { width: w, height: h, pixels: cropped };
    };

    // Store detected bounds after first capture
    let docBoundsCache = null;

    // Function to capture - try postMessage first, fall back to cropped screenshot
    const captureCanvasPixels = async () => {
      // Try postMessage API first
      const docPixels = await exportDocumentPixels();
      if (docPixels) {
        return docPixels;
      }

      // Fallback to canvas screenshot, cropped to document area
      const buffer = await mainCanvas.screenshot({ type: 'png' });
      return new Promise((resolve) => {
        new PNG().parse(buffer, (err, png) => {
          if (err) {
            resolve(null);
            return;
          }

          // Detect bounds on first capture
          if (!docBoundsCache) {
            docBoundsCache = detectDocBounds(png);
            console.log(`      (doc bounds: ${docBoundsCache.minX},${docBoundsCache.minY} to ${docBoundsCache.maxX},${docBoundsCache.maxY})`);
          }

          const cropped = cropToDoc(png, docBoundsCache);
          resolve(cropped);
        });
      });
    };

    const results = [];

    // Test each operation
    console.log('\n7. Testing operations...');
    for (const op of OPERATIONS) {
      console.log(`\n   [${OPERATIONS.indexOf(op) + 1}/${OPERATIONS.length}] ${op.name}`);

      // Capture before
      const before = await captureCanvasPixels();

      // DEBUG: Save before image for first operation
      if (OPERATIONS.indexOf(op) === 0) {
        const beforePng = new PNG({ width: before.width, height: before.height });
        beforePng.data = Buffer.from(before.pixels);
        const beforeBuffer = PNG.sync.write(beforePng);
        await fs.writeFile(path.join(outputDir, 'debug-before.png'), beforeBuffer);
        console.log(`      (saved debug-before.png: ${before.width}x${before.height})`);
      }

      // Apply operation
      await page.keyboard.press(op.shortcut);
      await page.waitForTimeout(800);

      // Handle dialog
      if (op.hasDialog) {
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
      }

      await page.waitForTimeout(500);

      // Capture after
      const after = await captureCanvasPixels();

      // DEBUG: Save after image for first operation
      if (OPERATIONS.indexOf(op) === 0) {
        const afterPng = new PNG({ width: after.width, height: after.height });
        afterPng.data = Buffer.from(after.pixels);
        const afterBuffer = PNG.sync.write(afterPng);
        await fs.writeFile(path.join(outputDir, 'debug-after.png'), afterBuffer);
        console.log(`      (saved debug-after.png: ${after.width}x${after.height})`);
      }

      if (before && after) {
        const diff = comparePixels(before.pixels, after.pixels);
        console.log(`      Changed: ${diff.percentChanged}% (${diff.changedPixels}/${diff.totalPixels})`);

        results.push({
          operation: op.name,
          shortcut: op.shortcut,
          hasDialog: op.hasDialog || false,
          input: { width: before.width, height: before.height, pixels: before.pixels },
          output: { width: after.width, height: after.height, pixels: after.pixels },
          diff
        });
      }

      // Undo
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(300);
    }

    // Save results
    console.log('\n8. Saving results...');

    await fs.writeFile(
      path.join(outputDir, 'operations.json'),
      JSON.stringify(results, null, 2)
    );

    // Save individual operation files
    for (const r of results) {
      const safeName = r.operation.replace(/[^a-zA-Z0-9]/g, '_');
      await fs.writeFile(
        path.join(outputDir, `${safeName}.json`),
        JSON.stringify(r, null, 2)
      );
    }

    // Summary
    const summary = {
      captureDate: new Date().toISOString(),
      totalOperations: OPERATIONS.length,
      capturedOperations: results.length,
      operationsWithChange: results.filter(r => r.diff.changedPixels > 0).length,
      operations: results.map(r => ({
        name: r.operation,
        changed: r.diff.changedPixels > 0,
        percentChanged: r.diff.percentChanged
      }))
    };
    await fs.writeFile(
      path.join(outputDir, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );

    console.log('\n' + '═'.repeat(60));
    console.log('CAPTURE COMPLETE');
    console.log('═'.repeat(60));
    console.log(`Operations captured: ${results.length}/${OPERATIONS.length}`);
    console.log(`With pixel changes: ${summary.operationsWithChange}`);
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
