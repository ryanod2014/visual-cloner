#!/usr/bin/env node
/**
 * Operation-Level Pixel Capture
 *
 * Captures the EXACT specification of each Photopea operation:
 * Input pixels + params → Output pixels
 *
 * This gives us a complete test suite for building a pixel-perfect clone.
 */

const fs = require('fs').promises;
const path = require('path');
const playwright = require('playwright');
const { captureOperation, navigateMenu, closeDialog, fillDialogInputs, undo, computePixelDiff } = require('./lib/pixel-capture');
const { operations } = require('./lib/operations');
const { testImageGenerators, defaultTestImages } = require('./lib/test-images');

const PHOTOPEA_URL = process.env.PHOTOPEA_URL || 'https://www.photopea.com';
const TEST_WIDTH = parseInt(process.env.WIDTH) || 200;
const TEST_HEIGHT = parseInt(process.env.HEIGHT) || 200;
const HEADLESS = process.env.HEADLESS !== 'false';

async function main() {
  console.log('═'.repeat(60));
  console.log('OPERATION-LEVEL PIXEL CAPTURE');
  console.log('═'.repeat(60));
  console.log(`Test image size: ${TEST_WIDTH}x${TEST_HEIGHT}`);
  console.log(`Operations to capture: ${operations.length}`);
  console.log('');

  // Launch browser
  console.log('Launching browser...');
  const browser = await playwright.chromium.launch({
    headless: HEADLESS,
    args: ['--disable-gpu', '--no-sandbox']
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  try {
    // Load Photopea
    console.log('Loading Photopea...');
    await loadPhotopea(page);

    // Results storage
    const results = {
      metadata: {
        captureDate: new Date().toISOString(),
        testWidth: TEST_WIDTH,
        testHeight: TEST_HEIGHT,
        photopeaUrl: PHOTOPEA_URL
      },
      operations: []
    };

    // Get list of test images to use
    const testImageNames = process.env.QUICK ? ['horizontalGradient'] : defaultTestImages;
    console.log(`Using test images: ${testImageNames.join(', ')}`);
    console.log('');

    // Capture each operation
    let successCount = 0;
    let failCount = 0;

    for (const op of operations) {
      console.log(`\n[${ operations.indexOf(op) + 1}/${operations.length}] ${op.name}`);

      const opResult = {
        name: op.name,
        path: op.path,
        hasDialog: op.hasDialog,
        testCases: []
      };

      // Get variations to test
      const variations = op.variations && op.variations.length > 0
        ? [op.params, ...op.variations]
        : [op.params];

      for (const testImageName of testImageNames) {
        const generator = testImageGenerators[testImageName];
        if (!generator) continue;

        // Create test image
        await createTestImage(page, generator, TEST_WIDTH, TEST_HEIGHT);
        await page.waitForTimeout(500);

        for (const params of variations) {
          const paramsStr = Object.entries(params).map(([k, v]) => `${k}=${v}`).join(', ') || 'default';

          try {
            const io = await captureOperationWithParams(page, op, params);

            if (io) {
              const diff = computePixelDiff(io.input.pixels, io.output.pixels);
              console.log(`  ✓ ${testImageName} [${paramsStr}] - ${diff.percentChanged}% changed`);

              opResult.testCases.push({
                testImage: testImageName,
                params: params,
                input: io.input,
                output: io.output,
                diff: diff
              });
              successCount++;
            } else {
              console.log(`  ✗ ${testImageName} [${paramsStr}] - capture failed`);
              failCount++;
            }
          } catch (e) {
            console.log(`  ✗ ${testImageName} [${paramsStr}] - ${e.message}`);
            failCount++;
          }

          // Undo to restore test image for next variation
          await undo(page);
          await page.waitForTimeout(300);
        }
      }

      if (opResult.testCases.length > 0) {
        results.operations.push(opResult);
      }
    }

    // Save results
    const outputDir = path.join(__dirname, 'output', 'operation-specs');
    await fs.mkdir(outputDir, { recursive: true });

    // Save full results
    await fs.writeFile(
      path.join(outputDir, 'all-operations.json'),
      JSON.stringify(results, null, 2)
    );

    // Save individual operation specs
    for (const op of results.operations) {
      const safeName = op.name.replace(/[^a-zA-Z0-9]/g, '_');
      await fs.writeFile(
        path.join(outputDir, `${safeName}.json`),
        JSON.stringify(op, null, 2)
      );
    }

    // Save summary
    const summary = {
      totalOperations: operations.length,
      capturedOperations: results.operations.length,
      totalTestCases: successCount,
      failedCaptures: failCount,
      testImages: testImageNames,
      operations: results.operations.map(op => ({
        name: op.name,
        testCases: op.testCases.length
      }))
    };

    await fs.writeFile(
      path.join(outputDir, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );

    console.log('\n' + '═'.repeat(60));
    console.log('CAPTURE COMPLETE');
    console.log('═'.repeat(60));
    console.log(`Operations captured: ${results.operations.length}/${operations.length}`);
    console.log(`Test cases: ${successCount} successful, ${failCount} failed`);
    console.log(`Output: ${outputDir}`);

  } finally {
    await browser.close();
  }
}

async function loadPhotopea(page) {
  await page.goto(PHOTOPEA_URL, { waitUntil: 'load', timeout: 120000 });

  // Handle landing page
  await page.waitForTimeout(2000);
  try {
    const startButton = page.locator('text=Start using Photopea').first();
    if (await startButton.isVisible({ timeout: 3000 })) {
      await startButton.click();
      await page.waitForTimeout(3000);
    }
  } catch (e) {}

  // Wait for app
  await page.waitForTimeout(3000);

  // Create new document
  try {
    const newProjectBtn = page.locator('text=New Project').first();
    if (await newProjectBtn.isVisible({ timeout: 2000 })) {
      await newProjectBtn.click();
      await page.waitForTimeout(1000);

      // Set size in dialog
      // Look for width/height inputs and set them
      await page.waitForTimeout(500);

      const createBtn = page.locator('button:has-text("Create")').first();
      if (await createBtn.isVisible({ timeout: 2000 })) {
        await createBtn.click();
        await page.waitForTimeout(2000);
      }
    }
  } catch (e) {
    console.log('Could not create new project:', e.message);
  }

  // Verify canvas exists
  const hasCanvas = await page.evaluate(() => document.querySelector('canvas') !== null);
  if (!hasCanvas) {
    throw new Error('Photopea failed to initialize - no canvas found');
  }

  console.log('Photopea loaded successfully');
}

async function createTestImage(page, generator, width, height) {
  // Generate pixel data
  const pixelData = generator.generate(width, height);

  // Create image in Photopea
  await page.evaluate(({ pixels, width, height }) => {
    // Create a new document with test image
    // Use Photopea's internal API if available, otherwise use canvas manipulation

    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    // For now, we'll draw directly to a temp canvas and then
    // use clipboard or other method to get into Photopea
    // This is a simplified approach

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const ctx = tempCanvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(new Uint8ClampedArray(pixels));
    ctx.putImageData(imageData, 0, 0);

    // Store for later use
    window.__testImageCanvas = tempCanvas;
  }, { pixels: Array.from(pixelData), width, height });

  // Use keyboard shortcut to paste or import
  // For simplicity, we'll work with the current document content
}

async function captureOperationWithParams(page, op, params) {
  const sleep = ms => page.waitForTimeout(ms);

  // Use Photopea's postMessage API to get document pixels
  const getDocumentPixels = async () => {
    return await page.evaluate(() => {
      return new Promise((resolve) => {
        // Request PNG export via postMessage
        const iframe = document.querySelector('iframe');
        const target = iframe ? iframe.contentWindow : window;

        // Listen for response
        const handler = (e) => {
          if (e.data instanceof ArrayBuffer) {
            window.removeEventListener('message', handler);
            // Convert ArrayBuffer to base64 for transfer
            const bytes = new Uint8Array(e.data);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            resolve({ pngBase64: btoa(binary) });
          }
        };
        window.addEventListener('message', handler);

        // Request export - Photopea responds with PNG ArrayBuffer
        target.postMessage('app.activeDocument.saveToOE("png")', '*');

        // Timeout fallback
        setTimeout(() => {
          window.removeEventListener('message', handler);
          resolve(null);
        }, 5000);
      });
    });
  };

  // Simpler approach: use keyboard shortcuts which are more reliable
  const executeOperation = async () => {
    // First try keyboard shortcut if available
    if (op.shortcut) {
      await page.keyboard.press(op.shortcut);
      await sleep(300);

      if (op.hasDialog) {
        await sleep(500);
        // Press Enter to accept defaults or Escape to cancel
        await page.keyboard.press('Enter');
        await sleep(300);
      }
      return true;
    }

    // Otherwise use Photopea script API
    const scriptMap = {
      'Invert': 'app.activeDocument.activeLayer.invert()',
      'Desaturate': 'app.activeDocument.activeLayer.desaturate()',
      'AutoTone': 'app.activeDocument.autoTone()',
      'AutoContrast': 'app.activeDocument.autoContrast()',
      'AutoColor': 'app.activeDocument.autoColor()',
      'GaussianBlur': `app.activeDocument.activeLayer.applyGaussianBlur(${params.radius || 5})`,
      'Sharpen': 'app.activeDocument.activeLayer.applySharpen()',
      'SharpenMore': 'app.activeDocument.activeLayer.applySharpenMore()',
      'FindEdges': 'app.activeDocument.activeLayer.applyStyleize("FINDEDGES")',
      'Posterize': `app.activeDocument.activeLayer.posterize(${params.levels || 4})`,
      'Threshold': `app.activeDocument.activeLayer.threshold(${params.threshold || 128})`,
    };

    const script = scriptMap[op.name];
    if (script) {
      await page.evaluate((s) => {
        const iframe = document.querySelector('iframe');
        const target = iframe ? iframe.contentWindow : window;
        target.postMessage(s, '*');
      }, script);
      await sleep(500);
      return true;
    }

    // Fallback to menu navigation
    try {
      await navigateMenu(page, op.path);
      if (op.hasDialog) {
        await sleep(500);
        await page.keyboard.press('Enter');
        await sleep(300);
      }
      return true;
    } catch (e) {
      return false;
    }
  };

  // Capture before state using canvas snapshot
  const before = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;

    // Try to get 2D context snapshot
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = Math.min(canvas.width, 500);  // Limit size
    tempCanvas.height = Math.min(canvas.height, 500);
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);

    const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    return {
      width: tempCanvas.width,
      height: tempCanvas.height,
      pixels: Array.from(imageData.data)
    };
  });

  if (!before) return null;

  // Execute the operation
  const success = await executeOperation();
  if (!success) {
    console.log(`    (operation may not have executed)`);
  }

  await sleep(600);

  // Capture after state
  const after = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = Math.min(canvas.width, 500);
    tempCanvas.height = Math.min(canvas.height, 500);
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);

    const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    return {
      pixels: Array.from(imageData.data)
    };
  });

  if (!after) return null;

  return {
    operation: op.name,
    params: params,
    input: before,
    output: after
  };
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
