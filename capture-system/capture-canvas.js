#!/usr/bin/env node
/**
 * Canvas Pixel Capture - Direct canvas reading
 *
 * Reads pixels directly from Photopea's canvas element
 * using canvas.toDataURL() or getImageData().
 */

const fs = require('fs').promises;
const path = require('path');
const playwright = require('playwright');

// Simplified operations using keyboard shortcuts (most reliable)
const OPERATIONS = [
  { name: 'Invert', shortcut: 'Control+i' },
  { name: 'Desaturate', shortcut: 'Control+Shift+u' },
  { name: 'AutoTone', menu: ['Image', 'Auto Tone'] },
  { name: 'AutoContrast', menu: ['Image', 'Auto Contrast'] },
  { name: 'AutoColor', menu: ['Image', 'Auto Color'] },
  { name: 'Posterize', menu: ['Image', 'Adjustments', 'Posterize...'], dialogValue: 4 },
  { name: 'Threshold', menu: ['Image', 'Adjustments', 'Threshold...'], dialogValue: 128 },
  { name: 'GaussianBlur_5', menu: ['Filter', 'Blur', 'Gaussian Blur...'], dialogValue: 5 },
  { name: 'Sharpen', menu: ['Filter', 'Sharpen', 'Sharpen'] },
  { name: 'FindEdges', menu: ['Filter', 'Stylize', 'Find Edges'] },
  { name: 'Emboss', menu: ['Filter', 'Stylize', 'Emboss...'] },
];

async function main() {
  console.log('═'.repeat(60));
  console.log('CANVAS PIXEL CAPTURE - Direct canvas reading');
  console.log('═'.repeat(60));

  const browser = await playwright.chromium.launch({ headless: false });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    // Load Photopea directly
    console.log('\nLoading Photopea...');
    await page.goto('https://www.photopea.com', { waitUntil: 'load' });
    await page.waitForTimeout(5000);

    // Handle landing page
    try {
      const startBtn = page.locator('text=Start using Photopea').first();
      if (await startBtn.isVisible({ timeout: 3000 })) {
        await startBtn.click();
        await page.waitForTimeout(3000);
      }
    } catch (e) {}

    // Create new document
    console.log('Creating test document...');
    await page.keyboard.press('Control+n');
    await page.waitForTimeout(1000);

    // Set size to 100x100 if dialog appears
    try {
      const widthInput = page.locator('input[type="number"]').first();
      if (await widthInput.isVisible({ timeout: 2000 })) {
        await widthInput.fill('100');
        await page.keyboard.press('Tab');
        await page.keyboard.type('100');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      // Try clicking Create button
      const createBtn = page.locator('button:has-text("Create")').first();
      if (await createBtn.isVisible({ timeout: 1000 })) {
        await createBtn.click();
        await page.waitForTimeout(2000);
      }
    }

    // Fill with gradient using brush
    console.log('Drawing test content...');
    await page.keyboard.press('g'); // Gradient tool
    await page.waitForTimeout(300);

    // Find canvas and draw gradient
    const canvasInfo = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });

    if (canvasInfo) {
      // Draw horizontal gradient
      const startX = canvasInfo.x + canvasInfo.width * 0.2;
      const endX = canvasInfo.x + canvasInfo.width * 0.8;
      const centerY = canvasInfo.y + canvasInfo.height / 2;

      await page.mouse.move(startX, centerY);
      await page.mouse.down();
      await page.mouse.move(endX, centerY);
      await page.mouse.up();
      await page.waitForTimeout(500);
    }

    // Function to capture canvas pixels
    const captureCanvas = async () => {
      return await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return null;

        // Create a temp canvas to capture just the document area
        // Photopea's canvas may include UI elements
        const tempCanvas = document.createElement('canvas');
        const size = 100; // Our document size
        tempCanvas.width = size;
        tempCanvas.height = size;
        const ctx = tempCanvas.getContext('2d');

        // Try to find the document viewport area
        // This is approximate - we capture center region
        const srcX = Math.floor((canvas.width - size) / 2);
        const srcY = Math.floor((canvas.height - size) / 2);

        ctx.drawImage(canvas, srcX, srcY, size, size, 0, 0, size, size);

        const imageData = ctx.getImageData(0, 0, size, size);
        return {
          width: size,
          height: size,
          pixels: Array.from(imageData.data)
        };
      });
    };

    const outputDir = path.join(__dirname, 'output', 'canvas-specs');
    await fs.mkdir(outputDir, { recursive: true });

    const results = [];

    // Capture baseline
    console.log('\nCapturing baseline...');
    const baseline = await captureCanvas();
    if (baseline) {
      console.log(`Baseline: ${baseline.width}x${baseline.height}, ${baseline.pixels.length} values`);
    } else {
      console.log('Failed to capture baseline');
      await browser.close();
      return;
    }

    // Test each operation
    for (const op of OPERATIONS) {
      console.log(`\n[${OPERATIONS.indexOf(op) + 1}/${OPERATIONS.length}] ${op.name}`);

      // Capture before
      const before = await captureCanvas();

      // Apply operation
      if (op.shortcut) {
        await page.keyboard.press(op.shortcut);
        await page.waitForTimeout(500);
      } else if (op.menu) {
        // Navigate menu
        for (let i = 0; i < op.menu.length; i++) {
          const menuItem = op.menu[i];
          if (i === 0) {
            // Top level menu
            await page.click(`text="${menuItem}"`);
          } else {
            // Submenu
            await page.waitForTimeout(200);
            await page.click(`text="${menuItem}"`);
          }
          await page.waitForTimeout(200);
        }

        // Handle dialog if needed
        if (op.dialogValue !== undefined) {
          await page.waitForTimeout(500);
          await page.keyboard.press('Enter'); // Accept default
        }
        await page.waitForTimeout(500);
      }

      await page.waitForTimeout(300);

      // Capture after
      const after = await captureCanvas();

      if (before && after) {
        const diff = comparePixels(before.pixels, after.pixels);
        console.log(`  Changed: ${diff.percentChanged}% (${diff.changedPixels} pixels)`);

        results.push({
          operation: op.name,
          input: before,
          output: after,
          diff
        });
      } else {
        console.log('  Failed to capture');
      }

      // Undo
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(300);
    }

    // Save results
    await fs.writeFile(
      path.join(outputDir, 'operations.json'),
      JSON.stringify(results, null, 2)
    );

    // Save summary
    const summary = {
      totalOperations: OPERATIONS.length,
      capturedOperations: results.length,
      operationsWithChange: results.filter(r => r.diff.changedPixels > 0).length
    };
    await fs.writeFile(
      path.join(outputDir, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );

    console.log('\n' + '═'.repeat(60));
    console.log('CAPTURE COMPLETE');
    console.log('═'.repeat(60));
    console.log(`Operations: ${results.length}/${OPERATIONS.length}`);
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
