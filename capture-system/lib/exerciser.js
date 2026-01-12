/**
 * Exerciser - Perform real operations on Photopea using keyboard shortcuts + menu clicks
 *
 * This triggers actual app code paths with correct `this` context.
 */

async function exercisePhotopea(page, exerciseSet) {
  const sleep = ms => page.waitForTimeout(ms);

  // Helper to safely click nested menu items using Alt+key accelerators
  const clickMenu = async (...items) => {
    try {
      // Try using Alt+first letter to open menu (common pattern)
      const firstLetter = items[0].charAt(0);
      await page.keyboard.press(`Alt+${firstLetter}`);
      await sleep(400);

      // Use arrow keys and type to navigate menus
      for (let i = 1; i < items.length; i++) {
        // Type first few chars to jump to item
        await page.keyboard.type(items[i].substring(0, 3), { delay: 50 });
        await sleep(200);
        await page.keyboard.press('ArrowRight'); // Open submenu
        await sleep(200);
      }

      // Press Enter to activate
      await page.keyboard.press('Enter');
      await sleep(300);
    } catch (e) {
      // console.log(`Menu click failed: ${items.join(' → ')}`);
      try { await page.keyboard.press('Escape'); } catch {}
      await sleep(100);
    }
  };

  // Helper to handle dialogs (click OK/Apply)
  const closeDialog = async () => {
    try {
      await sleep(500);
      const okBtn = page.locator('text=OK').first();
      if (await okBtn.isVisible({ timeout: 1000 })) {
        await okBtn.click();
        await sleep(300);
      }
    } catch (e) {}
  };

  // Helper for keyboard shortcuts
  const shortcut = async (keys) => {
    try {
      await page.keyboard.press(keys);
      await sleep(300);
    } catch (e) {
      console.log(`Shortcut failed: ${keys}`);
    }
  };

  console.log('  Starting keyboard shortcuts...');

  // ═══════════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS - Quick operations
  // ═══════════════════════════════════════════════════════════════

  const shortcuts = [
    // Selection shortcuts
    'Control+a',           // Select All
    'Control+d',           // Deselect
    'Control+Shift+i',     // Invert Selection

    // Edit shortcuts
    'Control+z',           // Undo
    'Control+Shift+z',     // Redo
    'Control+t',           // Free Transform
    'Escape',              // Cancel transform

    // Image adjustments
    'Control+i',           // Invert colors
    'Control+Shift+u',     // Desaturate
    'Control+l',           // Levels
    'Escape',              // Close dialog
    'Control+m',           // Curves
    'Escape',
    'Control+u',           // Hue/Saturation
    'Escape',
    'Control+b',           // Color Balance
    'Escape',

    // View shortcuts
    'Control+0',           // Fit to screen
    'Control+1',           // 100% zoom
    'Control++',           // Zoom in
    'Control+-',           // Zoom out

    // Layer shortcuts
    'Control+Shift+n',     // New Layer
    'Escape',              // Close dialog if any
    'Control+j',           // Duplicate Layer
    'Control+e',           // Merge Down

    // Brush/Tool shortcuts
    'b',                   // Brush tool
    'e',                   // Eraser tool
    'g',                   // Gradient tool
    'p',                   // Pen tool
    'm',                   // Marquee tool
    'l',                   // Lasso tool
    'w',                   // Magic Wand
    'c',                   // Crop tool
    'i',                   // Eyedropper
    'j',                   // Healing Brush
    's',                   // Clone Stamp
    't',                   // Text tool
    'u',                   // Shape tool
    'h',                   // Hand tool
    'z',                   // Zoom tool
    'v',                   // Move tool
  ];

  for (const key of shortcuts) {
    await shortcut(key);
  }

  console.log('  Starting menu operations...');

  // ═══════════════════════════════════════════════════════════════
  // FILTER MENU - Major image processing operations
  // ═══════════════════════════════════════════════════════════════

  // Blur filters
  await clickMenu('Filter', 'Blur', 'Gaussian Blur...');
  await closeDialog();

  await clickMenu('Filter', 'Blur', 'Motion Blur...');
  await closeDialog();

  await clickMenu('Filter', 'Blur', 'Radial Blur...');
  await closeDialog();

  await clickMenu('Filter', 'Blur', 'Box Blur...');
  await closeDialog();

  // Sharpen filters
  await clickMenu('Filter', 'Sharpen', 'Sharpen');

  await clickMenu('Filter', 'Sharpen', 'Sharpen More');

  await clickMenu('Filter', 'Sharpen', 'Unsharp Mask...');
  await closeDialog();

  // Noise filters
  await clickMenu('Filter', 'Noise', 'Add Noise...');
  await closeDialog();

  await clickMenu('Filter', 'Noise', 'Median...');
  await closeDialog();

  await clickMenu('Filter', 'Noise', 'Reduce Noise...');
  await closeDialog();

  // Distort filters
  await clickMenu('Filter', 'Distort', 'Wave...');
  await closeDialog();

  await clickMenu('Filter', 'Distort', 'Ripple...');
  await closeDialog();

  await clickMenu('Filter', 'Distort', 'Spherize...');
  await closeDialog();

  await clickMenu('Filter', 'Distort', 'Twirl...');
  await closeDialog();

  // Stylize filters
  await clickMenu('Filter', 'Stylize', 'Find Edges');

  await clickMenu('Filter', 'Stylize', 'Emboss...');
  await closeDialog();

  await clickMenu('Filter', 'Stylize', 'Oil Paint...');
  await closeDialog();

  // Pixelate filters
  await clickMenu('Filter', 'Pixelate', 'Mosaic...');
  await closeDialog();

  await clickMenu('Filter', 'Pixelate', 'Crystallize...');
  await closeDialog();

  // Other filters
  await clickMenu('Filter', 'Other', 'High Pass...');
  await closeDialog();

  console.log('  Starting Image menu operations...');

  // ═══════════════════════════════════════════════════════════════
  // IMAGE MENU - Color adjustments
  // ═══════════════════════════════════════════════════════════════

  await clickMenu('Image', 'Adjustments', 'Brightness/Contrast...');
  await closeDialog();

  await clickMenu('Image', 'Adjustments', 'Levels...');
  await closeDialog();

  await clickMenu('Image', 'Adjustments', 'Curves...');
  await closeDialog();

  await clickMenu('Image', 'Adjustments', 'Exposure...');
  await closeDialog();

  await clickMenu('Image', 'Adjustments', 'Vibrance...');
  await closeDialog();

  await clickMenu('Image', 'Adjustments', 'Hue/Saturation...');
  await closeDialog();

  await clickMenu('Image', 'Adjustments', 'Color Balance...');
  await closeDialog();

  await clickMenu('Image', 'Adjustments', 'Black & White...');
  await closeDialog();

  await clickMenu('Image', 'Adjustments', 'Photo Filter...');
  await closeDialog();

  await clickMenu('Image', 'Adjustments', 'Invert');

  await clickMenu('Image', 'Adjustments', 'Posterize...');
  await closeDialog();

  await clickMenu('Image', 'Adjustments', 'Threshold...');
  await closeDialog();

  await clickMenu('Image', 'Adjustments', 'Gradient Map...');
  await closeDialog();

  // Canvas/Image size
  await clickMenu('Image', 'Canvas Size...');
  await closeDialog();

  await clickMenu('Image', 'Image Size...');
  await closeDialog();

  // Rotate/Flip
  await clickMenu('Image', 'Image Rotation', 'Flip Canvas Horizontal');
  await clickMenu('Image', 'Image Rotation', 'Flip Canvas Vertical');
  await clickMenu('Image', 'Image Rotation', '90° CW');
  await clickMenu('Image', 'Image Rotation', '90° CCW');

  console.log('  Starting Layer menu operations...');

  // ═══════════════════════════════════════════════════════════════
  // LAYER MENU
  // ═══════════════════════════════════════════════════════════════

  await clickMenu('Layer', 'New', 'Layer...');
  await closeDialog();

  await clickMenu('Layer', 'Duplicate Layer...');
  await closeDialog();

  await clickMenu('Layer', 'New Fill Layer', 'Solid Color...');
  await closeDialog();

  await clickMenu('Layer', 'New Fill Layer', 'Gradient...');
  await closeDialog();

  await clickMenu('Layer', 'New Adjustment Layer', 'Brightness/Contrast...');
  await closeDialog();

  await clickMenu('Layer', 'New Adjustment Layer', 'Levels...');
  await closeDialog();

  await clickMenu('Layer', 'New Adjustment Layer', 'Curves...');
  await closeDialog();

  await clickMenu('Layer', 'Layer Style', 'Drop Shadow...');
  await closeDialog();

  await clickMenu('Layer', 'Layer Style', 'Inner Shadow...');
  await closeDialog();

  await clickMenu('Layer', 'Layer Style', 'Outer Glow...');
  await closeDialog();

  await clickMenu('Layer', 'Layer Style', 'Bevel & Emboss...');
  await closeDialog();

  await clickMenu('Layer', 'Layer Style', 'Stroke...');
  await closeDialog();

  // Flatten/Merge
  await clickMenu('Layer', 'Flatten Image');

  console.log('  Starting Select menu operations...');

  // ═══════════════════════════════════════════════════════════════
  // SELECT MENU
  // ═══════════════════════════════════════════════════════════════

  await clickMenu('Select', 'All');
  await clickMenu('Select', 'Deselect');

  await clickMenu('Select', 'All');
  await clickMenu('Select', 'Inverse');
  await clickMenu('Select', 'Deselect');

  await clickMenu('Select', 'Color Range...');
  await closeDialog();

  await clickMenu('Select', 'All');
  await clickMenu('Select', 'Modify', 'Expand...');
  await closeDialog();

  await clickMenu('Select', 'Modify', 'Contract...');
  await closeDialog();

  await clickMenu('Select', 'Modify', 'Feather...');
  await closeDialog();

  await clickMenu('Select', 'Deselect');

  console.log('  Starting Edit menu operations...');

  // ═══════════════════════════════════════════════════════════════
  // EDIT MENU
  // ═══════════════════════════════════════════════════════════════

  await clickMenu('Select', 'All');

  await clickMenu('Edit', 'Fill...');
  await closeDialog();

  await clickMenu('Edit', 'Stroke...');
  await closeDialog();

  await clickMenu('Select', 'Deselect');

  await clickMenu('Edit', 'Free Transform');
  await shortcut('Escape');

  await clickMenu('Edit', 'Transform', 'Scale');
  await shortcut('Escape');

  await clickMenu('Edit', 'Transform', 'Rotate');
  await shortcut('Escape');

  await clickMenu('Edit', 'Transform', 'Flip Horizontal');
  await clickMenu('Edit', 'Transform', 'Flip Vertical');

  console.log('  Starting drawing operations...');

  // ═══════════════════════════════════════════════════════════════
  // DRAWING - Use tools with actual strokes to trigger rendering
  // ═══════════════════════════════════════════════════════════════

  // Select brush and draw multiple strokes
  await shortcut('b');
  for (let i = 0; i < 5; i++) {
    const y = 200 + i * 50;
    await page.mouse.move(150, y);
    await page.mouse.down();
    await page.mouse.move(450, y);
    await page.mouse.up();
    await sleep(100);
  }

  // Draw curves to trigger bezier operations
  await page.mouse.move(200, 300);
  await page.mouse.down();
  for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
    await page.mouse.move(
      300 + Math.cos(angle) * 100,
      350 + Math.sin(angle) * 100
    );
  }
  await page.mouse.up();

  // Select eraser with varied strokes
  await shortcut('e');
  await page.mouse.move(250, 250);
  await page.mouse.down();
  await page.mouse.move(350, 350);
  await page.mouse.move(250, 350);
  await page.mouse.move(350, 250);
  await page.mouse.up();

  // Pencil tool
  await shortcut('n');
  await page.mouse.move(400, 200);
  await page.mouse.down();
  await page.mouse.move(500, 300);
  await page.mouse.move(400, 400);
  await page.mouse.up();

  // Marquee selection
  await shortcut('m');
  await page.mouse.move(100, 100);
  await page.mouse.down();
  await page.mouse.move(300, 300);
  await page.mouse.up();
  await sleep(200);

  // Fill selection
  await shortcut('Shift+F5');
  await sleep(500);
  await shortcut('Escape');
  await shortcut('Control+d');

  // Lasso selection
  await shortcut('l');
  await page.mouse.move(350, 150);
  await page.mouse.down();
  await page.mouse.move(450, 200);
  await page.mouse.move(400, 300);
  await page.mouse.move(350, 150);
  await page.mouse.up();
  await shortcut('Control+d');

  // Gradient tool with different directions
  await shortcut('g');
  await page.mouse.move(100, 100);
  await page.mouse.down();
  await page.mouse.move(400, 100);
  await page.mouse.up();
  await sleep(100);

  await page.mouse.move(100, 150);
  await page.mouse.down();
  await page.mouse.move(100, 450);
  await page.mouse.up();
  await sleep(100);

  // Clone stamp
  await shortcut('s');
  await page.keyboard.down('Alt');
  await page.mouse.click(200, 200);
  await page.keyboard.up('Alt');
  await page.mouse.move(300, 300);
  await page.mouse.down();
  await page.mouse.move(380, 380);
  await page.mouse.up();

  // Blur tool
  await shortcut('r');
  await page.mouse.move(250, 250);
  await page.mouse.down();
  await page.mouse.move(350, 350);
  await page.mouse.up();

  // Dodge tool
  await shortcut('o');
  await page.mouse.move(200, 300);
  await page.mouse.down();
  await page.mouse.move(300, 400);
  await page.mouse.up();

  // Shape tool - rectangle
  await shortcut('u');
  await page.mouse.move(450, 100);
  await page.mouse.down();
  await page.mouse.move(550, 200);
  await page.mouse.up();
  await sleep(200);

  // Text tool - add some text
  await shortcut('t');
  await page.mouse.click(100, 450);
  await sleep(200);
  await page.keyboard.type('Test', { delay: 50 });
  await shortcut('Escape');

  // Zoom operations to trigger view rendering
  await shortcut('z');
  await page.mouse.click(300, 300);
  await sleep(200);
  await shortcut('Control+0');
  await shortcut('Control+1');
  await shortcut('Control++');
  await shortcut('Control+-');

  // Hand tool to pan
  await shortcut('h');
  await page.mouse.move(300, 300);
  await page.mouse.down();
  await page.mouse.move(400, 400);
  await page.mouse.up();

  // Transform operations
  await shortcut('Control+a');
  await shortcut('Control+t');
  await sleep(300);
  await page.mouse.move(400, 300);
  await page.mouse.down();
  await page.mouse.move(450, 350);
  await page.mouse.up();
  await shortcut('Enter');
  await shortcut('Control+d');

  // More undo/redo to exercise history
  for (let i = 0; i < 10; i++) {
    await shortcut('Control+z');
    await sleep(50);
  }
  for (let i = 0; i < 5; i++) {
    await shortcut('Control+Shift+z');
    await sleep(50);
  }

  // Trigger repaint by resizing
  await page.mouse.wheel(0, 100);
  await sleep(200);
  await page.mouse.wheel(0, -100);

  console.log('  Exercise complete');
}

// Partition exercises across browsers (each gets different operations)
function partitionExercises(numBrowsers) {
  const partitions = [];

  for (let i = 0; i < numBrowsers; i++) {
    partitions.push({
      browserIndex: i,
      // Could partition different menus to different browsers for parallelism
      focusArea: ['filters', 'adjustments', 'layers', 'selections'][i % 4]
    });
  }

  return partitions;
}

module.exports = { exercisePhotopea, partitionExercises };
