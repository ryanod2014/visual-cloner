#!/usr/bin/env node
/**
 * Simple Pixel Capture - Using screenshots
 *
 * Takes screenshots before/after operations to capture pixel changes.
 * This works reliably without needing Photopea's script API.
 */

const fs = require('fs').promises;
const path = require('path');
const playwright = require('playwright');
const PNG = require('pngjs').PNG;

const PHOTOPEA_URL = 'https://www.photopea.com';

// Operations using keyboard shortcuts
const OPERATIONS = [
  { name: 'Invert', shortcut: 'Control+i' },
  { name: 'Desaturate', shortcut: 'Control+Shift+u' },
  { name: 'Levels', shortcut: 'Control+l', dialog: true },
  { name: 'Curves', shortcut: 'Control+m', dialog: true },
  { name: 'HueSaturation', shortcut: 'Control+u', dialog: true },
  { name: 'ColorBalance', shortcut: 'Control+b', dialog: true },
  { name: 'SelectAll', shortcut: 'Control+a' },
  { name: 'Deselect', shortcut: 'Control+d' },
  { name: 'Undo', shortcut: 'Control+z' },
  { name: 'Redo', shortcut: 'Control+Shift+z' },
  { name: 'FreeTransform', shortcut: 'Control+t', dialog: true },
  { name: 'ZoomIn', shortcut: 'Control+=' },
  { name: 'ZoomOut', shortcut: 'Control+-' },
  { name: 'FitToScreen', shortcut: 'Control+0' },
  { name: 'ActualPixels', shortcut: 'Control+1' },
];

async function main() {
  console.log('═'.repeat(60));
  console.log('SIMPLE PIXEL CAPTURE - Screenshots');
  console.log('═'.repeat(60));

  const browser = await playwright.chromium.launch({ headless: false });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    // Load Photopea
    console.log('\nLoading Photopea...');
    await page.goto(PHOTOPEA_URL, { waitUntil: 'load' });
    await page.waitForTimeout(3000);

    // Handle landing page
    try {
      const startBtn = page.locator('text=Start using Photopea').first();
      if (await startBtn.isVisible({ timeout: 3000 })) {
        await startBtn.click();
        await page.waitForTimeout(3000);
      }
    } catch (e) {}

    // Create new document
    try {
      const newProjectBtn = page.locator('text=New Project').first();
      if (await newProjectBtn.isVisible({ timeout: 2000 })) {
        await newProjectBtn.click();
        await page.waitForTimeout(1500);

        const createBtn = page.locator('button:has-text("Create")').first();
        if (await createBtn.isVisible({ timeout: 2000 })) {
          await createBtn.click();
          await page.waitForTimeout(2000);
        }
      }
    } catch (e) {}

    // Draw something on the canvas
    console.log('Drawing test content...');

    // Select brush tool and draw
    await page.keyboard.press('b');
    await page.waitForTimeout(300);

    // Draw some strokes
    const canvasBounds = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });

    if (canvasBounds) {
      const centerX = canvasBounds.x + canvasBounds.width / 2;
      const centerY = canvasBounds.y + canvasBounds.height / 2;

      // Draw some strokes
      await page.mouse.move(centerX - 50, centerY - 50);
      await page.mouse.down();
      await page.mouse.move(centerX + 50, centerY + 50);
      await page.mouse.up();

      await page.mouse.move(centerX + 50, centerY - 50);
      await page.mouse.down();
      await page.mouse.move(centerX - 50, centerY + 50);
      await page.mouse.up();

      // Draw a circle
      for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
        const x = centerX + Math.cos(angle) * 80;
        const y = centerY + Math.sin(angle) * 80;
        if (angle === 0) {
          await page.mouse.move(x, y);
          await page.mouse.down();
        } else {
          await page.mouse.move(x, y);
        }
      }
      await page.mouse.up();
    }

    await page.waitForTimeout(500);

    // Output directory
    const outputDir = path.join(__dirname, 'output', 'screenshots');
    await fs.mkdir(outputDir, { recursive: true });

    // Capture baseline
    console.log('\nCapturing baseline...');
    const baselinePath = path.join(outputDir, '00-baseline.png');
    await page.screenshot({ path: baselinePath, fullPage: false });
    console.log(`Saved: ${baselinePath}`);

    const results = [];

    // Test each operation
    for (let i = 0; i < OPERATIONS.length; i++) {
      const op = OPERATIONS[i];
      console.log(`\n[${i + 1}/${OPERATIONS.length}] ${op.name}`);

      // Take before screenshot
      const beforePath = path.join(outputDir, `${String(i + 1).padStart(2, '0')}-${op.name}-before.png`);
      await page.screenshot({ path: beforePath });

      // Apply operation
      await page.keyboard.press(op.shortcut);
      await page.waitForTimeout(300);

      // Handle dialog if present
      if (op.dialog) {
        await page.waitForTimeout(500);
        // Press Enter to accept defaults
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
      }

      await page.waitForTimeout(300);

      // Take after screenshot
      const afterPath = path.join(outputDir, `${String(i + 1).padStart(2, '0')}-${op.name}-after.png`);
      await page.screenshot({ path: afterPath });

      // Compare screenshots
      const beforeData = await fs.readFile(beforePath);
      const afterData = await fs.readFile(afterPath);

      const diff = compareBuffers(beforeData, afterData);
      console.log(`  Before: ${beforeData.length} bytes, After: ${afterData.length} bytes`);
      console.log(`  Changed: ${diff.changed ? 'YES' : 'NO'} (${diff.percentDiff}% difference)`);

      results.push({
        operation: op.name,
        shortcut: op.shortcut,
        beforeFile: beforePath,
        afterFile: afterPath,
        changed: diff.changed,
        percentDiff: diff.percentDiff
      });

      // Undo to reset for next operation
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(300);
    }

    // Save results summary
    await fs.writeFile(
      path.join(outputDir, 'results.json'),
      JSON.stringify(results, null, 2)
    );

    console.log('\n' + '═'.repeat(60));
    console.log('CAPTURE COMPLETE');
    console.log('═'.repeat(60));
    console.log(`Operations tested: ${OPERATIONS.length}`);
    console.log(`Changed: ${results.filter(r => r.changed).length}`);
    console.log(`Output: ${outputDir}`);

  } finally {
    await browser.close();
  }
}

function compareBuffers(buf1, buf2) {
  if (buf1.length !== buf2.length) {
    return { changed: true, percentDiff: 100 };
  }

  let diffBytes = 0;
  for (let i = 0; i < buf1.length; i++) {
    if (buf1[i] !== buf2[i]) diffBytes++;
  }

  return {
    changed: diffBytes > 0,
    percentDiff: ((diffBytes / buf1.length) * 100).toFixed(2)
  };
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
