#!/usr/bin/env node
/**
 * UNIVERSAL WebGL Capture System
 *
 * Works on ANY canvas-based webapp by:
 * 1. Direct navigation (no iframe)
 * 2. Keyboard shortcuts to trigger operations
 * 3. WebGL readPixels OR canvas toDataURL for capture
 *
 * Usage: node capture-webgl.js <url> [config.json]
 */

const fs = require('fs').promises;
const path = require('path');
const playwright = require('playwright');
const PNG = require('pngjs').PNG;

// Default config - can be overridden by JSON file
const DEFAULT_CONFIG = {
  setupWait: 5000,
  operationWait: 300,
  captureMethod: 'auto', // 'webgl', 'canvas2d', 'screenshot'
  viewport: { width: 1280, height: 800 },
  operations: []
};

async function main() {
  const url = process.argv[2];
  const configPath = process.argv[3];

  if (!url) {
    console.log('Usage: node capture-webgl.js <url> [config.json]');
    console.log('\nExample configs:');
    console.log('  node capture-webgl.js https://example.com/editor config.json');
    process.exit(1);
  }

  // Load config
  let config = { ...DEFAULT_CONFIG };
  if (configPath) {
    const customConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
    config = { ...config, ...customConfig };
  }

  console.log('═'.repeat(60));
  console.log('UNIVERSAL WEBGL CAPTURE');
  console.log('═'.repeat(60));
  console.log(`URL: ${url}`);
  console.log(`Capture method: ${config.captureMethod}`);
  console.log(`Operations: ${config.operations.length}`);
  console.log('');

  const browser = await playwright.chromium.launch({
    headless: false,
    args: ['--enable-webgl', '--use-gl=angle', '--disable-web-security']
  });

  const page = await browser.newPage({ viewport: config.viewport });
  page.setDefaultTimeout(60000);

  const results = [];

  try {
    // Navigate
    console.log('1. Loading page...');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(config.setupWait);

    // Find canvases
    console.log('2. Finding canvases...');
    const canvasInfo = await findCanvases(page);
    console.log(`   Found ${canvasInfo.length} canvas(es)`);

    if (canvasInfo.length === 0) {
      console.log('   No canvases found. Using screenshot mode.');
      config.captureMethod = 'screenshot';
    } else {
      // Find largest canvas
      const mainCanvas = canvasInfo.reduce((a, b) =>
        (a.width * a.height) > (b.width * b.height) ? a : b
      );
      console.log(`   Main canvas: ${mainCanvas.width}x${mainCanvas.height} at (${mainCanvas.x}, ${mainCanvas.y})`);
      console.log(`   Context: ${mainCanvas.contextType}`);

      // Set capture method based on context
      if (config.captureMethod === 'auto') {
        config.captureMethod = mainCanvas.contextType.includes('webgl') ? 'webgl' : 'canvas2d';
      }
    }

    console.log(`   Using: ${config.captureMethod}`);

    // Test capture
    console.log('\n3. Testing capture...');
    const testCapture = await capturePixels(page, config.captureMethod);
    if (testCapture) {
      console.log(`   Success: ${testCapture.width}x${testCapture.height}`);
    } else {
      console.log('   Failed! Falling back to screenshot.');
      config.captureMethod = 'screenshot';
    }

    // Run operations
    if (config.operations.length > 0) {
      console.log('\n4. Running operations...\n');

      for (const op of config.operations) {
        process.stdout.write(`   ${op.name}... `);

        // Capture before
        const before = await capturePixels(page, config.captureMethod);
        if (!before) {
          console.log('SKIP (no before)');
          continue;
        }

        // Execute operation
        try {
          if (op.shortcut) {
            await pressShortcut(page, op.shortcut);
          } else if (op.click) {
            await page.click(op.click);
          } else if (op.eval) {
            await page.evaluate(op.eval);
          }
          await page.waitForTimeout(op.wait || config.operationWait);
        } catch (e) {
          console.log(`ERROR: ${e.message}`);
          continue;
        }

        // Capture after
        const after = await capturePixels(page, config.captureMethod);
        if (!after) {
          console.log('SKIP (no after)');
          continue;
        }

        // Compare
        const diff = comparePixels(before.pixels, after.pixels);
        console.log(`${diff.percentChanged}% changed`);

        results.push({
          operation: op.name,
          method: config.captureMethod,
          input: { width: before.width, height: before.height, pixels: before.pixels },
          output: { width: after.width, height: after.height, pixels: after.pixels },
          diff
        });
      }
    } else {
      console.log('\n4. No operations defined. Interactive mode...');
      console.log('   Press Ctrl+C to exit when done exploring.');

      // Keep browser open for manual testing
      await page.waitForTimeout(300000); // 5 minutes
    }

    // Save results
    if (results.length > 0) {
      const outputDir = path.join(__dirname, 'output', 'webgl-capture');
      await fs.mkdir(outputDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      await fs.writeFile(
        path.join(outputDir, `capture-${timestamp}.json`),
        JSON.stringify(results, null, 2)
      );

      console.log('\n' + '═'.repeat(60));
      console.log('CAPTURE COMPLETE');
      console.log('═'.repeat(60));
      console.log(`Captured: ${results.length}`);
      console.log(`With changes: ${results.filter(r => r.diff.changedPixels > 0).length}`);
      console.log(`Output: ${outputDir}`);
    }

  } finally {
    await browser.close();
  }
}

async function findCanvases(page) {
  return page.evaluate(() => {
    const canvases = document.querySelectorAll('canvas');
    return Array.from(canvases).map((canvas, i) => {
      const rect = canvas.getBoundingClientRect();
      let contextType = 'unknown';

      // Try to detect context type
      try {
        if (canvas.getContext('webgl2')) contextType = 'webgl2';
        else if (canvas.getContext('webgl')) contextType = 'webgl';
        else if (canvas.getContext('2d')) contextType = '2d';
      } catch (e) {
        // Context might already be created with different type
        contextType = 'in-use';
      }

      return {
        index: i,
        width: canvas.width,
        height: canvas.height,
        x: rect.x,
        y: rect.y,
        contextType
      };
    });
  });
}

async function capturePixels(page, method) {
  try {
    if (method === 'screenshot') {
      return captureViaScreenshot(page);
    } else if (method === 'webgl') {
      return captureViaWebGL(page);
    } else if (method === 'canvas2d') {
      return captureViaCanvas2D(page);
    }
    return null;
  } catch (e) {
    console.error('Capture error:', e.message);
    return null;
  }
}

async function captureViaWebGL(page) {
  const result = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;

    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return null;

    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);

    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // WebGL has Y flipped, need to flip it back
    const flipped = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      const srcOffset = y * width * 4;
      const dstOffset = (height - 1 - y) * width * 4;
      flipped.set(pixels.subarray(srcOffset, srcOffset + width * 4), dstOffset);
    }

    return { width, height, pixels: Array.from(flipped) };
  });

  return result;
}

async function captureViaCanvas2D(page) {
  const result = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      width: canvas.width,
      height: canvas.height,
      pixels: Array.from(imageData.data)
    };
  });

  return result;
}

async function captureViaScreenshot(page) {
  // Find canvas bounds
  const bounds = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });

  if (!bounds) {
    // Screenshot full page
    const buffer = await page.screenshot();
    return parsePNG(buffer);
  }

  // Screenshot canvas area
  const buffer = await page.screenshot({ clip: bounds });
  return parsePNG(buffer);
}

function parsePNG(buffer) {
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
}

async function pressShortcut(page, keys) {
  // Handle array of keys or string
  const keyArray = Array.isArray(keys) ? keys : keys.split('+');
  const modifiers = keyArray.slice(0, -1);
  const key = keyArray[keyArray.length - 1];

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
    return { changed: true, percentChanged: '100.00', changedPixels: 0, totalPixels: 0 };
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
