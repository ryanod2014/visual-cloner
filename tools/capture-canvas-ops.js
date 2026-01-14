#!/usr/bin/env node
/**
 * Canvas/WebGL Operation Capture
 *
 * Hooks low-level APIs that ALL image operations must use.
 * Much more efficient than finding thousands of internal functions.
 *
 * When user applies Gaussian Blur, we capture:
 * - What pixels went in (getImageData)
 * - What pixels came out (putImageData)
 * - What WebGL shaders ran
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
  window.__CANVAS_OPS__ = [];
  window.__WEBGL_OPS__ = [];
  window.__CAPTURE_ENABLED__ = true;
  window.__OP_ID__ = 0;

  // Efficient serialization - just capture structure, not full pixel data
  function serializeLight(val, maxBytes = 1000) {
    if (val === null || val === undefined) return val;
    if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') return val;

    if (val instanceof ImageData) {
      return {
        __type: 'ImageData',
        width: val.width,
        height: val.height,
        // Sample: first 100 pixels + checksum
        sample: Array.from(val.data.slice(0, 400)),
        checksum: Array.from(val.data).reduce((a, b) => a + b, 0) % 0xFFFFFFFF
      };
    }

    if (ArrayBuffer.isView(val)) {
      return {
        __type: val.constructor.name,
        length: val.length,
        sample: Array.from(val.slice(0, Math.min(100, val.length))),
        checksum: Array.from(val).reduce((a, b) => a + b, 0) % 0xFFFFFFFF
      };
    }

    if (val instanceof HTMLCanvasElement) {
      return { __type: 'Canvas', width: val.width, height: val.height };
    }

    if (val instanceof HTMLImageElement) {
      return { __type: 'Image', width: val.width, height: val.height, src: val.src?.slice(0, 100) };
    }

    if (val instanceof WebGLProgram) return { __type: 'WebGLProgram' };
    if (val instanceof WebGLShader) return { __type: 'WebGLShader' };
    if (val instanceof WebGLBuffer) return { __type: 'WebGLBuffer' };
    if (val instanceof WebGLTexture) return { __type: 'WebGLTexture' };
    if (val instanceof WebGLFramebuffer) return { __type: 'WebGLFramebuffer' };

    if (Array.isArray(val)) {
      return val.slice(0, 20).map(v => serializeLight(v));
    }

    if (typeof val === 'object') {
      const obj = {};
      for (const k of Object.keys(val).slice(0, 10)) {
        obj[k] = serializeLight(val[k]);
      }
      return obj;
    }

    return String(val).slice(0, 100);
  }

  // ===========================================
  // HOOK CANVAS 2D
  // ===========================================
  const CANVAS_METHODS = [
    'drawImage', 'putImageData', 'getImageData',
    'fillRect', 'strokeRect', 'clearRect',
    'fill', 'stroke', 'clip',
    'drawFocusIfNeeded', 'createImageData',
    'createLinearGradient', 'createRadialGradient', 'createPattern',
    'transform', 'setTransform', 'resetTransform',
    'scale', 'rotate', 'translate',
    'save', 'restore',
    'filter' // CSS filter property
  ];

  const ctx2dProto = CanvasRenderingContext2D.prototype;

  for (const method of CANVAS_METHODS) {
    const original = ctx2dProto[method];
    if (typeof original !== 'function') continue;

    // Use a closure to capture method name
    (function(methodName, origFn) {
      ctx2dProto[methodName] = function(...args) {
        const result = origFn.call(this, ...args);

        if (window.__CAPTURE_ENABLED__) {
          try {
            window.__CANVAS_OPS__.push({
              id: ++window.__OP_ID__,
              method: methodName,
              args: args.map(a => serializeLight(a)),
              result: serializeLight(result),
              canvas: { width: this.canvas?.width, height: this.canvas?.height },
              timestamp: Date.now()
            });
          } catch (e) { /* ignore serialization errors */ }
        }

        return result;
      };
    })(method, original);
  }

  // Also capture filter property sets
  const filterDesc = Object.getOwnPropertyDescriptor(ctx2dProto, 'filter');
  if (filterDesc && filterDesc.set) {
    const originalSet = filterDesc.set;
    Object.defineProperty(ctx2dProto, 'filter', {
      ...filterDesc,
      set: function(value) {
        if (window.__CAPTURE_ENABLED__) {
          window.__CANVAS_OPS__.push({
            id: ++window.__OP_ID__,
            method: 'set_filter',
            args: [value],
            canvas: { width: this.canvas.width, height: this.canvas.height },
            timestamp: Date.now()
          });
        }
        return originalSet.call(this, value);
      }
    });
  }

  // ===========================================
  // HOOK WEBGL
  // ===========================================
  const WEBGL_METHODS = [
    // Shaders
    'createShader', 'shaderSource', 'compileShader', 'createProgram',
    'attachShader', 'linkProgram', 'useProgram',
    // Textures
    'texImage2D', 'texSubImage2D', 'createTexture', 'bindTexture',
    // Drawing
    'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced',
    // Buffers
    'bufferData', 'bufferSubData',
    // Framebuffers
    'framebufferTexture2D', 'readPixels',
    // Uniforms
    'uniform1f', 'uniform2f', 'uniform3f', 'uniform4f',
    'uniform1i', 'uniform2i', 'uniform3i', 'uniform4i',
    'uniform1fv', 'uniform2fv', 'uniform3fv', 'uniform4fv',
    'uniformMatrix2fv', 'uniformMatrix3fv', 'uniformMatrix4fv'
  ];

  function hookWebGL(proto, ctxName) {
    for (const method of WEBGL_METHODS) {
      const original = proto[method];
      if (typeof original !== 'function') continue;

      (function(methodName, origFn) {
        proto[methodName] = function(...args) {
          const result = origFn.call(this, ...args);

          if (window.__CAPTURE_ENABLED__) {
            try {
              // Special handling for shaderSource - capture the GLSL code
              let extra = null;
              if (methodName === 'shaderSource') {
                extra = { glsl: args[1] };
              }

              window.__WEBGL_OPS__.push({
                id: ++window.__OP_ID__,
                context: ctxName,
                method: methodName,
                args: args.map(a => serializeLight(a)),
                result: serializeLight(result),
                extra: extra,
                timestamp: Date.now()
              });
            } catch (e) { /* ignore */ }
          }

          return result;
        };
      })(method, original);
    }
  }

  hookWebGL(WebGLRenderingContext.prototype, 'WebGL1');
  if (typeof WebGL2RenderingContext !== 'undefined') {
    hookWebGL(WebGL2RenderingContext.prototype, 'WebGL2');
  }

  // ===========================================
  // HELPERS
  // ===========================================
  window.__GET_CANVAS_OPS__ = () => window.__CANVAS_OPS__;
  window.__GET_WEBGL_OPS__ = () => window.__WEBGL_OPS__;
  window.__GET_ALL_OPS__ = () => ({
    canvas: window.__CANVAS_OPS__,
    webgl: window.__WEBGL_OPS__
  });

  window.__CLEAR_OPS__ = () => {
    window.__CANVAS_OPS__ = [];
    window.__WEBGL_OPS__ = [];
    window.__OP_ID__ = 0;
  };

  window.__PAUSE_CAPTURE__ = () => { window.__CAPTURE_ENABLED__ = false; };
  window.__RESUME_CAPTURE__ = () => { window.__CAPTURE_ENABLED__ = true; };

  window.__SUMMARY__ = () => ({
    canvas: window.__CANVAS_OPS__.length,
    webgl: window.__WEBGL_OPS__.length,
    total: window.__CANVAS_OPS__.length + window.__WEBGL_OPS__.length
  });

  console.log('[Hooks] Canvas2D and WebGL hooked. Ready to capture operations.');
})();
`;

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Canvas/WebGL Operation Capture                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  console.log('Loading Photopea...');
  await page.goto('https://www.photopea.com/');
  await page.waitForTimeout(3000);

  // Trigger app load
  await page.evaluate(() => { if (typeof addPP === 'function') addPP(); });

  console.log('Waiting for app to initialize...');
  await page.waitForTimeout(10000);

  // Inject hooks AFTER app loads
  console.log('Injecting hooks...');
  await page.evaluate(HOOK_SCRIPT);
  await page.waitForTimeout(1000);

  // Clear any startup noise
  await page.evaluate(() => window.__CLEAR_OPS__());

  console.log('\n' + '='.repeat(50));
  console.log('HOOKS ACTIVE - Now performing automated operations...');
  console.log('='.repeat(50) + '\n');

  // ===========================================
  // AUTOMATED OPERATIONS
  // ===========================================

  // 1. Create a new document
  console.log('[1] Creating new document...');
  await page.keyboard.press('Control+n');
  await page.waitForTimeout(1000);

  // Look for the "New Project" dialog and create a small image
  try {
    // Try to find width/height inputs and set them
    await page.evaluate(() => {
      // Find inputs in dialog
      const inputs = document.querySelectorAll('input[type="text"], input[type="number"]');
      for (const inp of inputs) {
        if (inp.value === '1920' || inp.value === '1280') inp.value = '256';
        if (inp.value === '1080' || inp.value === '720') inp.value = '256';
      }
    });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
  } catch (e) {
    console.log('  (dialog handling skipped)');
  }

  let summary = await page.evaluate(() => window.__SUMMARY__());
  console.log(`  Captured: ${summary.total} ops\n`);

  // 2. Fill with color
  console.log('[2] Filling with color...');
  await page.evaluate(() => window.__CLEAR_OPS__());
  await page.keyboard.press('g'); // Bucket tool
  await page.waitForTimeout(500);
  await page.mouse.click(400, 400);
  await page.waitForTimeout(1000);

  summary = await page.evaluate(() => window.__SUMMARY__());
  console.log(`  Captured: ${summary.total} ops`);

  // Save fill operations
  const fillOps = await page.evaluate(() => window.__GET_ALL_OPS__());
  fs.writeFileSync(path.join(OUTPUT_DIR, 'op_fill.json'), JSON.stringify(fillOps, null, 2));
  console.log('  Saved: op_fill.json\n');

  // 3. Apply Gaussian Blur
  console.log('[3] Applying Gaussian Blur...');
  await page.evaluate(() => window.__CLEAR_OPS__());

  // Filter > Blur > Gaussian Blur
  await page.click('text=Filter');
  await page.waitForTimeout(300);
  await page.click('text=Blur');
  await page.waitForTimeout(300);
  await page.click('text=Gaussian Blur');
  await page.waitForTimeout(1000);

  // Apply with default settings
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);

  summary = await page.evaluate(() => window.__SUMMARY__());
  console.log(`  Captured: ${summary.total} ops`);

  const blurOps = await page.evaluate(() => window.__GET_ALL_OPS__());
  fs.writeFileSync(path.join(OUTPUT_DIR, 'op_gaussian_blur.json'), JSON.stringify(blurOps, null, 2));
  console.log('  Saved: op_gaussian_blur.json\n');

  // 4. Adjust Levels
  console.log('[4] Adjusting Levels...');
  await page.evaluate(() => window.__CLEAR_OPS__());

  await page.click('text=Image');
  await page.waitForTimeout(300);
  await page.click('text=Adjustments');
  await page.waitForTimeout(300);
  await page.click('text=Levels');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);

  summary = await page.evaluate(() => window.__SUMMARY__());
  console.log(`  Captured: ${summary.total} ops`);

  const levelsOps = await page.evaluate(() => window.__GET_ALL_OPS__());
  fs.writeFileSync(path.join(OUTPUT_DIR, 'op_levels.json'), JSON.stringify(levelsOps, null, 2));
  console.log('  Saved: op_levels.json\n');

  // 5. Hue/Saturation
  console.log('[5] Adjusting Hue/Saturation...');
  await page.evaluate(() => window.__CLEAR_OPS__());

  await page.keyboard.press('Control+u');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);

  summary = await page.evaluate(() => window.__SUMMARY__());
  console.log(`  Captured: ${summary.total} ops`);

  const hueOps = await page.evaluate(() => window.__GET_ALL_OPS__());
  fs.writeFileSync(path.join(OUTPUT_DIR, 'op_hue_saturation.json'), JSON.stringify(hueOps, null, 2));
  console.log('  Saved: op_hue_saturation.json\n');

  // Summary
  console.log('='.repeat(50));
  console.log('CAPTURE COMPLETE');
  console.log('='.repeat(50));
  console.log('\nCaptured operations for:');
  console.log('  - Fill');
  console.log('  - Gaussian Blur');
  console.log('  - Levels');
  console.log('  - Hue/Saturation');
  console.log('\nFiles saved to: captured-io/op_*.json');

  await browser.close();
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
