#!/usr/bin/env node
/**
 * Debug script to understand Photopea's canvas structure
 */

const playwright = require('playwright');

async function main() {
  const browser = await playwright.chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto('https://www.photopea.com', { waitUntil: 'networkidle' });
  console.log('Page loaded, waiting for app...');
  await page.waitForTimeout(8000);

  // Take screenshot to see current state
  await page.screenshot({ path: 'debug-1-initial.png' });
  console.log('Saved debug-1-initial.png');

  // Click through landing - try multiple selectors
  const selectors = [
    'text=Start using Photopea',
    'button:has-text("Start")',
    '.start-button',
    '[onclick*="start"]'
  ];

  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1000 })) {
        console.log(`Clicking: ${sel}`);
        await btn.click();
        await page.waitForTimeout(5000);
        break;
      }
    } catch (e) {}
  }

  await page.screenshot({ path: 'debug-2-after-start.png' });
  console.log('Saved debug-2-after-start.png');

  // Wait for app to fully load - look for app container or menu bar
  console.log('Waiting for app to load fully...');
  try {
    await page.waitForSelector('canvas', { timeout: 30000 });
    console.log('Canvas found!');
  } catch (e) {
    console.log('No canvas after 30s, waiting more...');
    await page.waitForTimeout(15000);
  }

  await page.screenshot({ path: 'debug-3-app-loaded.png' });
  console.log('Saved debug-3-app-loaded.png');

  // Create new document
  try {
    const newProjectBtn = page.locator('text=New Project').first();
    if (await newProjectBtn.isVisible({ timeout: 2000 })) {
      await newProjectBtn.click();
      await page.waitForTimeout(1000);
      const createBtn = page.locator('button:has-text("Create")').first();
      if (await createBtn.isVisible({ timeout: 2000 })) {
        await createBtn.click();
        await page.waitForTimeout(2000);
      }
    }
  } catch (e) {}

  // Analyze page structure
  const pageInfo = await page.evaluate(() => {
    return {
      iframes: document.querySelectorAll('iframe').length,
      canvases: document.querySelectorAll('canvas').length,
      divs: document.querySelectorAll('div').length,
      bodyHTML: document.body.innerHTML.substring(0, 500),
      url: window.location.href
    };
  });
  console.log('Page info:', pageInfo);

  // Analyze canvas structure
  const canvasInfo = await page.evaluate(() => {
    const canvases = document.querySelectorAll('canvas');
    const results = [];

    for (let i = 0; i < canvases.length; i++) {
      const canvas = canvases[i];
      const rect = canvas.getBoundingClientRect();

      // Check context type
      let contextType = 'unknown';
      let canRead = false;
      try {
        const ctx2d = canvas.getContext('2d');
        if (ctx2d) {
          contextType = '2d';
          const imageData = ctx2d.getImageData(0, 0, 10, 10);
          canRead = true;
        }
      } catch (e) {
        try {
          const webgl = canvas.getContext('webgl') || canvas.getContext('webgl2');
          if (webgl) {
            contextType = 'webgl';
            // Try to read pixels from WebGL
            const pixels = new Uint8Array(4 * 10 * 10);
            webgl.readPixels(0, 0, 10, 10, webgl.RGBA, webgl.UNSIGNED_BYTE, pixels);
            canRead = true;
          }
        } catch (e2) {
          contextType = 'error: ' + e2.message;
        }
      }

      results.push({
        index: i,
        width: canvas.width,
        height: canvas.height,
        displayWidth: rect.width,
        displayHeight: rect.height,
        x: rect.x,
        y: rect.y,
        contextType,
        canRead,
        id: canvas.id,
        className: canvas.className
      });
    }

    return results;
  });

  console.log('Canvas elements found:', canvasInfo.length);
  console.log(JSON.stringify(canvasInfo, null, 2));

  // Try screenshot approach instead
  console.log('\nTrying element screenshot...');
  const canvas = page.locator('canvas').first();
  if (await canvas.isVisible()) {
    await canvas.screenshot({ path: 'debug-canvas.png' });
    console.log('Saved debug-canvas.png');
  }

  await browser.close();
}

main().catch(console.error);
