/**
 * Browser Pool - Manage parallel Playwright browser instances
 */

const playwright = require('playwright');

async function launchBrowserPool(count) {
  console.log(`Pre-launching ${count} browsers...`);

  const headless = process.env.HEADLESS !== 'false';

  const browsers = await Promise.all(
    Array(count).fill().map(() =>
      playwright.chromium.launch({
        headless,
        args: [
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--no-sandbox',
        ]
      })
    )
  );

  console.log(`${count} browsers ready`);
  return browsers;
}

async function loadPhotopeaInBrowser(browser, photopeaUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Set default timeout higher
  page.setDefaultTimeout(120000);

  // Navigate to Photopea
  console.log(`Loading ${photopeaUrl}...`);
  try {
    await page.goto(photopeaUrl, {
      waitUntil: 'load',
      timeout: 120000
    });
  } catch (e) {
    console.log(`Navigation issue: ${e.message}`);
    // Try to continue if page partially loaded
  }

  // Check if we're on the landing page and need to click "Start using Photopea"
  console.log('Checking for landing page...');
  await page.waitForTimeout(2000);

  try {
    const startButton = await page.locator('text=Start using Photopea').first();
    if (await startButton.isVisible()) {
      console.log('  Clicking "Start using Photopea" button...');
      await startButton.click();
      await page.waitForTimeout(3000);
    }
  } catch (e) {
    console.log('  No landing page button found, continuing...');
  }

  // Wait for Photopea app to fully initialize
  console.log('Waiting for app initialization...');

  // Poll until canvas appears (indicates app is ready)
  let attempts = 0;
  const maxAttempts = 15; // 15 * 2s = 30s max wait
  let state;

  while (attempts < maxAttempts) {
    await page.waitForTimeout(2000);
    attempts++;

    state = await page.evaluate(() => {
      return {
        hasPhotopea: typeof window.Photopea !== 'undefined',
        hasApp: typeof window.app !== 'undefined',
        hasCanvas: document.querySelector('canvas') !== null,
        bodyLength: document.body.innerHTML.length,
        title: document.title,
        windowKeys: Object.keys(window).filter(k => /^[A-Z]/.test(k)).length
      };
    });

    console.log(`  Attempt ${attempts}: canvas=${state.hasCanvas}, bodyLen=${state.bodyLength}, windowKeys=${state.windowKeys}`);

    // Take screenshot on first attempt for debugging
    if (attempts === 1) {
      try {
        await page.screenshot({ path: '/tmp/photopea-debug.png' });
        console.log('  Debug screenshot saved to /tmp/photopea-debug.png');
      } catch (e) {}
    }

    // Ready when canvas appears or we have many capitalized globals (app code loaded)
    if (state.hasCanvas || state.windowKeys > 100) {
      break;
    }
  }

  if (!state.hasCanvas && state.bodyLength < 50000) {
    throw new Error('App did not fully initialize');
  }

  // Extra wait for app to stabilize
  await page.waitForTimeout(3000);

  // Click "New Project" to create an initial document
  console.log('Creating initial document...');
  try {
    const newProjectBtn = await page.locator('text=New Project').first();
    if (await newProjectBtn.isVisible()) {
      await newProjectBtn.click();
      await page.waitForTimeout(2000);

      // Click Create button in the dialog (it's a specific button element)
      const createBtn = await page.locator('button:has-text("Create")').first();
      if (await createBtn.isVisible()) {
        console.log('  Clicking Create button...');
        await createBtn.click();
        await page.waitForTimeout(3000);
      } else {
        // Try clicking by role
        await page.click('text=Create');
        await page.waitForTimeout(3000);
      }
    }
  } catch (e) {
    console.log('  Could not create initial document:', e.message);
  }

  // Check if canvas now exists
  const hasCanvas = await page.evaluate(() => document.querySelector('canvas') !== null);
  console.log(`  Document created: canvas=${hasCanvas}`);

  // Final screenshot
  try {
    await page.screenshot({ path: '/tmp/photopea-ready.png' });
    console.log('  Ready screenshot saved to /tmp/photopea-ready.png');
  } catch (e) {}

  console.log('Photopea loaded');
  return page;
}

async function closeBrowserPool(browsers) {
  await Promise.all(browsers.map(b => b.close()));
}

module.exports = { launchBrowserPool, loadPhotopeaInBrowser, closeBrowserPool };
