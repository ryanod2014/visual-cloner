/**
 * Pixel Capture - Capture before/after pixel state for operations
 *
 * This captures the EXACT specification of what each operation does:
 * Input pixels + params → Output pixels
 */

async function capturePixelState(page) {
  return await page.evaluate(() => {
    // Find the main canvas (Photopea uses WebGL canvas)
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;

    // Create temp canvas to read pixels
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0);

    // Get pixel data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    return {
      width: canvas.width,
      height: canvas.height,
      // Convert to regular array for serialization
      pixels: Array.from(imageData.data)
    };
  });
}

async function captureOperation(page, operationName, triggerFn, options = {}) {
  const { waitTime = 500 } = options;

  // 1. BEFORE: Capture current canvas state
  const before = await capturePixelState(page);
  if (!before) {
    console.log(`  Warning: No canvas found for ${operationName}`);
    return null;
  }

  // 2. TRIGGER: Execute the operation and capture parameters
  let params;
  try {
    params = await triggerFn(page);
  } catch (e) {
    console.log(`  Operation failed: ${operationName} - ${e.message}`);
    return null;
  }

  // 3. Wait for operation to complete
  await page.waitForTimeout(waitTime);

  // 4. AFTER: Capture resulting canvas state
  const after = await capturePixelState(page);
  if (!after) {
    console.log(`  Warning: No canvas after ${operationName}`);
    return null;
  }

  // 5. Return exact specification
  return {
    operation: operationName,
    params: params || {},
    input: {
      width: before.width,
      height: before.height,
      pixels: before.pixels
    },
    output: {
      pixels: after.pixels
    },
    timestamp: Date.now()
  };
}

// Helper to navigate menus (with retry)
async function navigateMenu(page, menuPath) {
  const sleep = ms => page.waitForTimeout(ms);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Click top-level menu
      await page.click(`text="${menuPath[0]}"`, { timeout: 2000 });
      await sleep(300);

      // Hover/click through submenus
      for (let i = 1; i < menuPath.length; i++) {
        const item = menuPath[i];
        // Try exact match first
        const selector = `text="${item}"`;

        if (i < menuPath.length - 1) {
          // Intermediate item - hover to open submenu
          await page.hover(selector, { timeout: 2000 });
          await sleep(200);
        } else {
          // Final item - click it
          await page.click(selector, { timeout: 2000 });
          await sleep(300);
        }
      }
      return true;
    } catch (e) {
      // Close any open menus and retry
      await page.keyboard.press('Escape');
      await sleep(200);
      if (attempt === 1) {
        throw new Error(`Menu navigation failed: ${menuPath.join(' → ')}`);
      }
    }
  }
  return false;
}

// Helper to close dialogs
async function closeDialog(page, button = 'OK') {
  const sleep = ms => page.waitForTimeout(ms);
  await sleep(300);

  try {
    // Try clicking the specified button
    const btn = page.locator(`text="${button}"`).first();
    if (await btn.isVisible({ timeout: 1000 })) {
      await btn.click();
      await sleep(300);
      return true;
    }
  } catch (e) {}

  // Try Enter key as fallback
  try {
    await page.keyboard.press('Enter');
    await sleep(300);
  } catch (e) {}

  return false;
}

// Helper to fill dialog inputs
async function fillDialogInputs(page, values) {
  for (const [name, value] of Object.entries(values)) {
    try {
      // Try by name attribute
      let input = page.locator(`input[name="${name}"]`).first();
      if (await input.isVisible({ timeout: 500 })) {
        await input.fill(String(value));
        continue;
      }

      // Try by label
      input = page.locator(`label:has-text("${name}") + input, label:has-text("${name}") input`).first();
      if (await input.isVisible({ timeout: 500 })) {
        await input.fill(String(value));
      }
    } catch (e) {
      // Input not found, continue
    }
  }
}

// Undo last operation
async function undo(page) {
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
}

// Compute pixel difference stats
function computePixelDiff(before, after) {
  if (!before || !after || before.length !== after.length) {
    return { changed: true, stats: null };
  }

  let totalDiff = 0;
  let maxDiff = 0;
  let changedPixels = 0;

  for (let i = 0; i < before.length; i += 4) {
    const rDiff = Math.abs(before[i] - after[i]);
    const gDiff = Math.abs(before[i + 1] - after[i + 1]);
    const bDiff = Math.abs(before[i + 2] - after[i + 2]);
    const pixelDiff = rDiff + gDiff + bDiff;

    if (pixelDiff > 0) {
      changedPixels++;
      totalDiff += pixelDiff;
      maxDiff = Math.max(maxDiff, pixelDiff);
    }
  }

  const numPixels = before.length / 4;
  return {
    changed: changedPixels > 0,
    changedPixels,
    totalPixels: numPixels,
    percentChanged: ((changedPixels / numPixels) * 100).toFixed(2),
    avgDiff: changedPixels > 0 ? (totalDiff / changedPixels).toFixed(2) : 0,
    maxDiff
  };
}

module.exports = {
  capturePixelState,
  captureOperation,
  navigateMenu,
  closeDialog,
  fillDialogInputs,
  undo,
  computePixelDiff
};
