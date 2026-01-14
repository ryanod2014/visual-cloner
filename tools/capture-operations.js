#!/usr/bin/env node
/**
 * Operation Capture via getContext Override
 *
 * Instead of modifying prototypes (which causes "Illegal invocation"),
 * we override getContext to return a Proxy that captures all calls.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.join(__dirname, '..', 'captured-io');

const HOOK_SCRIPT = `
(function() {
  window.__OPS__ = [];
  window.__CAPTURE_ENABLED__ = true;
  window.__OP_ID__ = 0;

  function serializeLight(val) {
    if (val === null || val === undefined) return val;
    if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') return val;

    if (val instanceof ImageData) {
      // Hash the pixel data instead of storing it all
      let hash = 0;
      for (let i = 0; i < val.data.length; i += 100) {
        hash = ((hash << 5) - hash + val.data[i]) | 0;
      }
      return { __type: 'ImageData', width: val.width, height: val.height, hash: hash };
    }

    if (ArrayBuffer.isView(val)) {
      let hash = 0;
      for (let i = 0; i < Math.min(val.length, 1000); i++) {
        hash = ((hash << 5) - hash + val[i]) | 0;
      }
      return { __type: val.constructor.name, length: val.length, hash: hash };
    }

    if (val instanceof HTMLCanvasElement) return { __type: 'Canvas', w: val.width, h: val.height };
    if (val instanceof HTMLImageElement) return { __type: 'Image', w: val.width, h: val.height };
    if (typeof WebGLProgram !== 'undefined' && val instanceof WebGLProgram) return '[WebGLProgram]';
    if (typeof WebGLShader !== 'undefined' && val instanceof WebGLShader) return '[WebGLShader]';
    if (typeof WebGLTexture !== 'undefined' && val instanceof WebGLTexture) return '[WebGLTexture]';
    if (typeof WebGLBuffer !== 'undefined' && val instanceof WebGLBuffer) return '[WebGLBuffer]';

    if (Array.isArray(val)) return val.slice(0, 10).map(serializeLight);

    if (typeof val === 'object') {
      const obj = {};
      let count = 0;
      for (const k in val) {
        if (count++ > 5) break;
        try { obj[k] = serializeLight(val[k]); } catch(e) {}
      }
      return obj;
    }

    return String(val).slice(0, 50);
  }

  // Override getContext to wrap the returned context
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    const ctx = origGetContext.call(this, type, ...args);
    if (!ctx) return ctx;

    // Already wrapped?
    if (ctx.__wrapped__) return ctx;

    const canvas = this;
    const ctxType = type;

    // Create a proxy to intercept all method calls
    const proxy = new Proxy(ctx, {
      get(target, prop) {
        const val = target[prop];

        // Don't wrap non-functions or internal props
        if (typeof val !== 'function' || prop.startsWith('__')) {
          return val;
        }

        // Return a wrapper function
        return function(...fnArgs) {
          const result = val.apply(target, fnArgs);

          if (window.__CAPTURE_ENABLED__ && canvas.width >= minSize && canvas.height >= minSize) {
            try {
              // Log important operations (skip basic path ops)
              const skip = ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'rect', 'arc'];

              // For WebGL, capture shader and draw calls
              const webglImportant = ['shaderSource', 'drawArrays', 'drawElements', 'texImage2D', 'uniform', 'bufferData'];
              const isWebGL = ctxType.includes('webgl');
              const isImportant = isWebGL ? webglImportant.some(w => prop.includes(w)) : !skip.includes(prop);

              if (isImportant) {
                const entry = {
                  id: ++window.__OP_ID__,
                  ctx: ctxType,
                  op: prop,
                  args: fnArgs.map(serializeLight),
                  canvas: { w: canvas.width, h: canvas.height }
                };

                // For shaderSource, include the GLSL code
                if (prop === 'shaderSource' && fnArgs[1]) {
                  entry.glsl = fnArgs[1];
                }

                // For texImage2D, note what kind of data
                if (prop === 'texImage2D') {
                  entry.texInfo = { width: fnArgs[3], height: fnArgs[4], format: fnArgs[2] };
                }

                window.__OPS__.push(entry);
              }
            } catch(e) {}
          }

          return result;
        };
      },

      set(target, prop, value) {
        if (window.__CAPTURE_ENABLED__ && canvas.width >= minSize && canvas.height >= minSize) {
          try {
            const interesting = ['fillStyle', 'strokeStyle', 'filter', 'globalAlpha', 'globalCompositeOperation'];
            if (interesting.includes(prop)) {
              window.__OPS__.push({
                id: ++window.__OP_ID__,
                ctx: ctxType,
                op: 'set_' + prop,
                args: [serializeLight(value)],
                canvas: { w: canvas.width, h: canvas.height }
              });
            }
          } catch(e) {}
        }
        target[prop] = value;
        return true;
      }
    });

    proxy.__wrapped__ = true;
    return proxy;
  };

  // Helpers
  window.__GET_OPS__ = () => window.__OPS__;
  window.__CLEAR_OPS__ = () => { window.__OPS__ = []; window.__OP_ID__ = 0; };
  window.__SUMMARY__ = () => window.__OPS__.length;
  window.__PAUSE__ = () => { window.__CAPTURE_ENABLED__ = false; };
  window.__RESUME__ = () => { window.__CAPTURE_ENABLED__ = true; };

  console.log('[Hooks] getContext wrapped. Ready to capture.');
})();
`;

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Canvas Operation Capture (via Proxy)                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // Inject BEFORE navigation
  await context.addInitScript(HOOK_SCRIPT);

  console.log('Loading Photopea...');
  await page.goto('https://www.photopea.com/');
  await page.waitForTimeout(3000);

  await page.evaluate(() => { if (typeof addPP === 'function') addPP(); });

  console.log('Waiting for app (15s)...');
  await page.waitForTimeout(15000);

  // Verify hooks work
  const hasHooks = await page.evaluate(() => typeof window.__GET_OPS__ === 'function');
  if (!hasHooks) {
    console.error('Hooks not installed!');
    await browser.close();
    process.exit(1);
  }

  await page.evaluate(() => window.__CLEAR_OPS__());

  console.log('\n' + '='.repeat(50));
  console.log('PERFORMING AUTOMATED OPERATIONS');
  console.log('='.repeat(50) + '\n');

  // 1. Create new document
  console.log('[1] Creating document (Ctrl+N)...');
  await page.keyboard.press('Control+n');
  await page.waitForTimeout(2000);
  await page.keyboard.press('Enter'); // Accept defaults
  await page.waitForTimeout(3000);

  let count = await page.evaluate(() => window.__SUMMARY__());
  console.log(`  Operations captured: ${count}`);

  // 2. Fill
  console.log('\n[2] Filling with bucket tool...');
  await page.evaluate(() => window.__CLEAR_OPS__());
  await page.keyboard.press('g');
  await page.waitForTimeout(500);
  await page.mouse.click(700, 450);
  await page.waitForTimeout(1000);

  count = await page.evaluate(() => window.__SUMMARY__());
  console.log(`  Operations: ${count}`);
  const fillOps = await page.evaluate(() => window.__GET_OPS__());
  if (fillOps.length > 0) {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'op_fill.json'), JSON.stringify(fillOps, null, 2));
    console.log('  Saved: op_fill.json');
  }

  // 3. Blur - use menu bar
  console.log('\n[3] Applying Gaussian Blur...');
  await page.evaluate(() => window.__CLEAR_OPS__());

  // Click the menu bar "Filter" (the actual menu, not page content)
  try {
    const filterMenu = await page.$('div[class*="menu"] >> text=Filter');
    if (filterMenu) await filterMenu.click();
    else await page.click('[role="menubar"] >> text=Filter');
  } catch(e) {
    // Fallback: use Alt+T for Filter menu (Photopea shortcut)
    await page.keyboard.press('Alt+t');
  }
  await page.waitForTimeout(500);

  // Navigate to Blur submenu
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight'); // Open Blur submenu
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter'); // Select first blur option
  await page.waitForTimeout(3000);
  await page.keyboard.press('Enter'); // Apply
  await page.waitForTimeout(2000);

  count = await page.evaluate(() => window.__SUMMARY__());
  console.log(`  Operations: ${count}`);
  const blurOps = await page.evaluate(() => window.__GET_OPS__());
  if (blurOps.length > 0) {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'op_blur.json'), JSON.stringify(blurOps, null, 2));
    console.log('  Saved: op_blur.json');
  }

  // 4. Levels (Ctrl+L)
  console.log('\n[4] Adjusting Levels...');
  await page.evaluate(() => window.__CLEAR_OPS__());

  await page.keyboard.press('Control+l');
  await page.waitForTimeout(2000);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);

  count = await page.evaluate(() => window.__SUMMARY__());
  console.log(`  Operations: ${count}`);
  const levelsOps = await page.evaluate(() => window.__GET_OPS__());
  if (levelsOps.length > 0) {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'op_levels.json'), JSON.stringify(levelsOps, null, 2));
    console.log('  Saved: op_levels.json');
  }

  // 5. Hue/Saturation (Ctrl+U)
  console.log('\n[5] Adjusting Hue/Saturation...');
  await page.evaluate(() => window.__CLEAR_OPS__());

  await page.keyboard.press('Control+u');
  await page.waitForTimeout(2000);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);

  count = await page.evaluate(() => window.__SUMMARY__());
  console.log(`  Operations: ${count}`);
  const hueOps = await page.evaluate(() => window.__GET_OPS__());
  if (hueOps.length > 0) {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'op_hue_sat.json'), JSON.stringify(hueOps, null, 2));
    console.log('  Saved: op_hue_sat.json');
  }

  // 6. Invert (Ctrl+I)
  console.log('\n[6] Inverting colors...');
  await page.evaluate(() => window.__CLEAR_OPS__());

  await page.keyboard.press('Control+i');
  await page.waitForTimeout(2000);

  count = await page.evaluate(() => window.__SUMMARY__());
  console.log(`  Operations: ${count}`);
  const invertOps = await page.evaluate(() => window.__GET_OPS__());
  if (invertOps.length > 0) {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'op_invert.json'), JSON.stringify(invertOps, null, 2));
    console.log('  Saved: op_invert.json');
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('DONE');
  console.log('='.repeat(50));

  await browser.close();
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
