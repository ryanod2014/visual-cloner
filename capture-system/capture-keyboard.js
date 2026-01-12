#!/usr/bin/env node
/**
 * KEYBOARD CAPTURE - Operations requiring keyboard shortcuts
 *
 * Loads Photopea DIRECTLY (no iframe) so keyboard shortcuts work.
 * Uses element screenshots to capture canvas state before/after.
 *
 * Target: Missing operations from API approach
 * - Levels (Cmd+L)
 * - Curves (Cmd+M)
 * - Hue/Saturation (Cmd+U)
 * - Color Balance (Cmd+B)
 * - Posterize, Threshold (via Image menu)
 * - Channel Mixer, Selective Color
 */

const fs = require('fs').promises;
const path = require('path');
const playwright = require('playwright');
const PNG = require('pngjs').PNG;

const DOC_WIDTH = 100;
const DOC_HEIGHT = 100;

// Better test images that show color/level changes
const TEST_IMAGES = {
  // Smooth gradient for Levels/Curves
  gradient: {
    name: 'gradient',
    description: 'Black→white gradient for levels/curves',
    create: async (page) => {
      await page.evaluate(() => {
        const pp = window;
        for (let x = 0; x < 100; x++) {
          const gray = new pp.SolidColor();
          const val = Math.floor(x * 2.55);
          gray.rgb.red = val;
          gray.rgb.green = val;
          gray.rgb.blue = val;
          pp.app.activeDocument.selection.select([[x, 0], [x+1, 0], [x+1, 100], [x, 100]]);
          pp.app.activeDocument.selection.fill(gray);
        }
        pp.app.activeDocument.selection.deselect();
      });
    }
  },

  // RGB stripes for Hue/Saturation
  color: {
    name: 'color',
    description: 'RGB stripes for hue/saturation',
    create: async (page) => {
      await page.evaluate(() => {
        const pp = window;
        const red = new pp.SolidColor(); red.rgb.red = 255; red.rgb.green = 0; red.rgb.blue = 0;
        const green = new pp.SolidColor(); green.rgb.red = 0; green.rgb.green = 255; green.rgb.blue = 0;
        const blue = new pp.SolidColor(); blue.rgb.red = 0; blue.rgb.green = 0; blue.rgb.blue = 255;
        pp.app.activeDocument.selection.select([[0, 0], [33, 0], [33, 100], [0, 100]]);
        pp.app.activeDocument.selection.fill(red);
        pp.app.activeDocument.selection.select([[33, 0], [66, 0], [66, 100], [33, 100]]);
        pp.app.activeDocument.selection.fill(green);
        pp.app.activeDocument.selection.select([[66, 0], [100, 0], [100, 100], [66, 100]]);
        pp.app.activeDocument.selection.fill(blue);
        pp.app.activeDocument.selection.deselect();
      });
    }
  },

  // Multi-level for posterize/threshold
  multilevel: {
    name: 'multilevel',
    description: '5 gray levels for posterize/threshold',
    create: async (page) => {
      await page.evaluate(() => {
        const pp = window;
        const levels = [0, 64, 128, 192, 255];
        for (let i = 0; i < 5; i++) {
          const gray = new pp.SolidColor();
          gray.rgb.red = levels[i];
          gray.rgb.green = levels[i];
          gray.rgb.blue = levels[i];
          pp.app.activeDocument.selection.select([[i*20, 0], [i*20+20, 0], [i*20+20, 100], [i*20, 100]]);
          pp.app.activeDocument.selection.fill(gray);
        }
        pp.app.activeDocument.selection.deselect();
      });
    }
  }
};

// Operations via keyboard shortcuts
const OPERATIONS = [
  // === LEVELS - Full parameter range (15 ops) ===
  { name: 'Levels_default', shortcut: ['Meta', 'l'], testImage: 'gradient', acceptDialog: true },

  // === CURVES (5 ops) ===
  { name: 'Curves_default', shortcut: ['Meta', 'm'], testImage: 'gradient', acceptDialog: true },

  // === HUE/SATURATION (15 ops) ===
  { name: 'HueSat_default', shortcut: ['Meta', 'u'], testImage: 'color', acceptDialog: true },

  // === COLOR BALANCE (5 ops) ===
  { name: 'ColorBalance_default', shortcut: ['Meta', 'b'], testImage: 'color', acceptDialog: true },

  // === POSTERIZE - via Image menu (8 ops) ===
  { name: 'Posterize_default', menu: ['Image', 'Adjustments', 'Posterize'], testImage: 'multilevel', acceptDialog: true },

  // === THRESHOLD - via Image menu (5 ops) ===
  { name: 'Threshold_default', menu: ['Image', 'Adjustments', 'Threshold'], testImage: 'multilevel', acceptDialog: true },
];

async function main() {
  console.log('═'.repeat(60));
  console.log('KEYBOARD CAPTURE - Missing API Operations');
  console.log('═'.repeat(60));
  console.log(`Operations: ${OPERATIONS.length}`);
  console.log(`Method: Direct navigation + keyboard shortcuts`);
  console.log('');

  const browser = await playwright.chromium.launch({
    headless: false,
    args: ['--enable-webgl', '--use-gl=angle']
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(120000);

  const results = [];

  try {
    console.log('1. Loading Photopea (direct)...');
    await page.goto('https://www.photopea.com', { waitUntil: 'networkidle' });
    await page.waitForTimeout(8000);

    // Click through landing page
    console.log('2. Clicking through landing page...');
    await page.mouse.click(640, 310);
    await page.waitForTimeout(6000);

    // Wait for Photopea to be ready
    console.log('3. Waiting for Photopea to initialize...');
    await page.waitForFunction(() => window.app !== undefined, { timeout: 30000 });
    console.log('   Photopea ready!');

    // Create document
    console.log('4. Creating test document...');
    await page.evaluate((w, h) => {
      window.app.documents.add(w, h, 72, 'Test', window.NewDocumentMode.RGB);
    }, DOC_WIDTH, DOC_HEIGHT);
    await page.waitForTimeout(2000);

    // Find canvas bounds for screenshot
    const canvasBounds = await findCanvasBounds(page);
    console.log(`   Canvas: ${canvasBounds.width}x${canvasBounds.height} at (${canvasBounds.x}, ${canvasBounds.y})`);

    console.log('\n5. Testing operations...\n');

    for (const op of OPERATIONS) {
      process.stdout.write(`   ${op.name}... `);

      // Apply test image
      const testImage = TEST_IMAGES[op.testImage];
      await testImage.create(page);
      await page.waitForTimeout(300);

      // Capture before via screenshot
      const beforeBuffer = await page.screenshot({ clip: canvasBounds });
      const before = await parsePNG(beforeBuffer);

      // Execute operation
      try {
        if (op.shortcut) {
          // Press keyboard shortcut
          await pressShortcut(page, op.shortcut);
          await page.waitForTimeout(800);

          if (op.acceptDialog) {
            // Press Enter to accept dialog with defaults
            await page.keyboard.press('Enter');
            await page.waitForTimeout(500);
          }
        } else if (op.menu) {
          // TODO: Navigate menu (more complex)
          console.log('SKIP (menu nav not implemented)');
          continue;
        }

        // Undo to restore state for next operation
        await pressShortcut(page, ['Meta', 'z']);
        await page.waitForTimeout(300);

      } catch (e) {
        console.log(`ERROR: ${e.message}`);
        continue;
      }

      // Capture after (before undo)
      const afterBuffer = await page.screenshot({ clip: canvasBounds });
      const after = await parsePNG(afterBuffer);

      // Compare
      const diff = comparePixels(before.pixels, after.pixels);
      console.log(`${diff.percentChanged}% changed`);

      results.push({
        operation: op.name,
        method: 'keyboard',
        testImage: op.testImage,
        input: { width: before.width, height: before.height, pixels: before.pixels },
        output: { width: after.width, height: after.height, pixels: after.pixels },
        diff
      });
    }

    // Save results
    if (results.length > 0) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const outputDir = path.join(__dirname, 'output', `keyboard-${timestamp}`);
      await fs.mkdir(outputDir, { recursive: true });

      await fs.writeFile(
        path.join(outputDir, 'operations.json'),
        JSON.stringify(results, null, 2)
      );

      const withChanges = results.filter(r => r.diff.changedPixels > 0).length;
      console.log('\n' + '═'.repeat(60));
      console.log('CAPTURE COMPLETE');
      console.log('═'.repeat(60));
      console.log(`Captured: ${results.length}`);
      console.log(`With changes: ${withChanges}`);
      console.log(`Output: ${outputDir}`);
    }

    console.log('\nBrowser staying open for 30s...');
    await page.waitForTimeout(30000);

  } finally {
    await browser.close();
  }
}

async function findCanvasBounds(page) {
  // Find the main canvas element
  const bounds = await page.evaluate(() => {
    const canvases = document.querySelectorAll('canvas');
    if (canvases.length === 0) return null;

    // Find largest canvas (main document canvas)
    let largest = canvases[0];
    let maxArea = 0;
    for (const canvas of canvases) {
      const area = canvas.width * canvas.height;
      if (area > maxArea) {
        maxArea = area;
        largest = canvas;
      }
    }

    const rect = largest.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    };
  });

  return bounds;
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
