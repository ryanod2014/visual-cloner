#!/usr/bin/env node
/**
 * Operation-Level Pixel Capture v2
 *
 * Uses Photopea's postMessage API to:
 * 1. Create test images programmatically
 * 2. Apply operations via script
 * 3. Export document pixels via saveToOE
 *
 * This gives us the ACTUAL document pixels, not the UI canvas.
 */

const fs = require('fs').promises;
const path = require('path');
const playwright = require('playwright');
const PNG = require('pngjs').PNG;

const PHOTOPEA_URL = 'https://www.photopea.com';
const TEST_WIDTH = 100;
const TEST_HEIGHT = 100;

// Operations to capture with their Photopea script commands
const OPERATIONS = [
  // Simple operations (no parameters)
  { name: 'Invert', script: 'app.activeDocument.activeLayer.invert()' },
  { name: 'Desaturate', script: 'app.activeDocument.activeLayer.desaturate()' },
  { name: 'AutoTone', script: 'app.activeDocument.autoTone()' },
  { name: 'AutoContrast', script: 'app.activeDocument.autoContrast()' },
  { name: 'AutoColor', script: 'app.activeDocument.autoColor()' },

  // Blur filters
  { name: 'GaussianBlur_1', script: 'app.activeDocument.activeLayer.applyGaussianBlur(1)' },
  { name: 'GaussianBlur_5', script: 'app.activeDocument.activeLayer.applyGaussianBlur(5)' },
  { name: 'GaussianBlur_10', script: 'app.activeDocument.activeLayer.applyGaussianBlur(10)' },

  // Sharpen
  { name: 'Sharpen', script: 'app.activeDocument.activeLayer.applySharpen()' },
  { name: 'SharpenMore', script: 'app.activeDocument.activeLayer.applySharpenMore()' },

  // Stylize
  { name: 'FindEdges', script: 'app.activeDocument.activeLayer.applyStyleize("FINDEDGES")' },
  { name: 'Emboss', script: 'app.activeDocument.activeLayer.applyStyleize("EMBOSS")' },
  { name: 'Solarize', script: 'app.activeDocument.activeLayer.applyStyleize("SOLARIZE")' },

  // Adjustments
  { name: 'Posterize_2', script: 'app.activeDocument.activeLayer.posterize(2)' },
  { name: 'Posterize_4', script: 'app.activeDocument.activeLayer.posterize(4)' },
  { name: 'Posterize_8', script: 'app.activeDocument.activeLayer.posterize(8)' },
  { name: 'Threshold_64', script: 'app.activeDocument.activeLayer.threshold(64)' },
  { name: 'Threshold_128', script: 'app.activeDocument.activeLayer.threshold(128)' },
  { name: 'Threshold_192', script: 'app.activeDocument.activeLayer.threshold(192)' },

  // Brightness/Contrast
  { name: 'Brightness_+25', script: 'app.activeDocument.activeLayer.brightnessContrast(25, 0)' },
  { name: 'Brightness_-25', script: 'app.activeDocument.activeLayer.brightnessContrast(-25, 0)' },
  { name: 'Contrast_+25', script: 'app.activeDocument.activeLayer.brightnessContrast(0, 25)' },
  { name: 'Contrast_-25', script: 'app.activeDocument.activeLayer.brightnessContrast(0, -25)' },

  // Noise
  { name: 'AddNoise_10', script: 'app.activeDocument.activeLayer.applyAddNoise(10, NoiseDistribution.UNIFORM, false)' },
  { name: 'Median_1', script: 'app.activeDocument.activeLayer.applyMedianNoise(1)' },
  { name: 'Median_3', script: 'app.activeDocument.activeLayer.applyMedianNoise(3)' },
];

// Test images to create
const TEST_IMAGES = [
  {
    name: 'gradient-h',
    description: 'Horizontal gradient black to white',
    // Script to create in Photopea
    createScript: `
      var doc = app.activeDocument;
      var layer = doc.activeLayer;
      // Fill with gradient using native tools
      app.foregroundColor.rgb.red = 0;
      app.foregroundColor.rgb.green = 0;
      app.foregroundColor.rgb.blue = 0;
      app.backgroundColor.rgb.red = 255;
      app.backgroundColor.rgb.green = 255;
      app.backgroundColor.rgb.blue = 255;
    `
  },
  {
    name: 'solid-gray',
    description: 'Solid 50% gray',
    createScript: `
      var doc = app.activeDocument;
      app.foregroundColor.rgb.red = 128;
      app.foregroundColor.rgb.green = 128;
      app.foregroundColor.rgb.blue = 128;
      doc.selection.selectAll();
      doc.selection.fill(app.foregroundColor);
      doc.selection.deselect();
    `
  }
];

async function main() {
  console.log('═'.repeat(60));
  console.log('PIXEL CAPTURE v2 - Using Photopea Script API');
  console.log('═'.repeat(60));

  const browser = await playwright.chromium.launch({ headless: false }); // Show browser for debugging
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    // Load Photopea
    console.log('\nLoading Photopea...');
    await page.goto(PHOTOPEA_URL, { waitUntil: 'load' });
    await page.waitForTimeout(5000);

    // Click through landing
    try {
      const startBtn = page.locator('text=Start using Photopea').first();
      if (await startBtn.isVisible({ timeout: 3000 })) {
        console.log('Clicking Start button...');
        await startBtn.click();
        await page.waitForTimeout(3000);
      }
    } catch (e) {
      console.log('No start button found');
    }

    // Wait for app to be ready
    await page.waitForTimeout(3000);

    // Click New Project if visible
    try {
      const newProjectBtn = page.locator('text=New Project').first();
      if (await newProjectBtn.isVisible({ timeout: 2000 })) {
        console.log('Clicking New Project...');
        await newProjectBtn.click();
        await page.waitForTimeout(1500);

        // Click Create in dialog
        const createBtn = page.locator('button:has-text("Create")').first();
        if (await createBtn.isVisible({ timeout: 2000 })) {
          await createBtn.click();
          await page.waitForTimeout(2000);
        }
      }
    } catch (e) {
      console.log('New Project flow:', e.message);
    }

    console.log('Creating test document via script...');

    // Create new document via script
    await runPhotopeaScript(page, `app.documents.add(${TEST_WIDTH}, ${TEST_HEIGHT}, 72, "Test", NewDocumentMode.RGB)`);
    await page.waitForTimeout(2000);

    // Fill with gradient (simple approach - fill with gray first)
    await runPhotopeaScript(page, `
      var doc = app.activeDocument;
      app.foregroundColor.rgb.red = 128;
      app.foregroundColor.rgb.green = 128;
      app.foregroundColor.rgb.blue = 128;
      doc.selection.selectAll();
      doc.selection.fill(app.foregroundColor);
      doc.selection.deselect();
    `);
    await page.waitForTimeout(500);

    // Capture before state
    // Debug: check if document exists
    const docInfo = await page.evaluate(() => {
      return new Promise((resolve) => {
        const handler = (e) => {
          if (typeof e.data === 'string') {
            window.removeEventListener('message', handler);
            resolve(e.data);
          }
        };
        window.addEventListener('message', handler);
        window.postMessage('app.documents.length', '*');
        setTimeout(() => {
          window.removeEventListener('message', handler);
          resolve('timeout');
        }, 3000);
      });
    });
    console.log('Document count:', docInfo);

    console.log('\nCapturing baseline...');
    const beforePng = await exportDocument(page);
    if (!beforePng) {
      console.log('Export failed - trying alternative approach');
      // Try keyboard shortcut Ctrl+Shift+E for quick export
      await page.keyboard.press('Control+Shift+e');
      await page.waitForTimeout(1000);
    }
    console.log(`Baseline: ${beforePng ? beforePng.length + ' bytes' : 'null'}`);

    if (!beforePng) {
      console.log('Cannot proceed without baseline export. Photopea API may not be responding.');
      console.log('Make sure the document was created successfully.');
      await browser.close();
      return;
    }

    const results = [];

    // Test each operation
    for (const op of OPERATIONS) {
      console.log(`\nTesting: ${op.name}`);

      // Reset document (undo or recreate)
      await runPhotopeaScript(page, `
        app.activeDocument.activeHistoryState = app.activeDocument.historyStates[0];
      `);
      await page.waitForTimeout(300);

      // Get before state
      const before = await exportDocument(page);

      // Apply operation
      try {
        await runPhotopeaScript(page, op.script);
        await page.waitForTimeout(500);
      } catch (e) {
        console.log(`  Error: ${e.message}`);
        continue;
      }

      // Get after state
      const after = await exportDocument(page);

      if (before && after) {
        // Parse PNGs and compare
        const beforePixels = await pngToPixels(before);
        const afterPixels = await pngToPixels(after);

        const diff = comparePixels(beforePixels, afterPixels);
        console.log(`  Changed: ${diff.percentChanged}% (${diff.changedPixels}/${diff.totalPixels} pixels)`);

        results.push({
          operation: op.name,
          script: op.script,
          input: { pixels: beforePixels },
          output: { pixels: afterPixels },
          diff: diff
        });
      }
    }

    // Save results
    const outputDir = path.join(__dirname, 'output', 'pixel-specs');
    await fs.mkdir(outputDir, { recursive: true });

    await fs.writeFile(
      path.join(outputDir, 'operations.json'),
      JSON.stringify(results, null, 2)
    );

    console.log('\n' + '═'.repeat(60));
    console.log(`Captured ${results.length} operations`);
    console.log(`Output: ${outputDir}`);

  } finally {
    await browser.close();
  }
}

async function runPhotopeaScript(page, script) {
  // Photopea API: send script via postMessage, results come back as message events
  await page.evaluate((s) => {
    // Photopea listens on window for postMessage
    window.postMessage(s, '*');
  }, script);
  // Wait for script to execute
  await page.waitForTimeout(500);
}

async function exportDocument(page) {
  return await page.evaluate(() => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 10000);

      window.addEventListener('message', function handler(e) {
        if (e.data instanceof ArrayBuffer) {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          // Convert to base64
          const bytes = new Uint8Array(e.data);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          resolve(btoa(binary));
        }
      });

      window.postMessage('app.activeDocument.saveToOE("png")', '*');
    });
  });
}

async function pngToPixels(base64) {
  const buffer = Buffer.from(base64, 'base64');
  return new Promise((resolve, reject) => {
    new PNG().parse(buffer, (err, png) => {
      if (err) reject(err);
      else resolve(Array.from(png.data));
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
    if (before[i] !== after[i] ||
        before[i + 1] !== after[i + 1] ||
        before[i + 2] !== after[i + 2]) {
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
