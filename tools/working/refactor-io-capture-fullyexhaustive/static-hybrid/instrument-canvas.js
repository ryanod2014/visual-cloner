/**
 * CANVAS/WEBGL INSTRUMENTATION
 *
 * Intercepts all canvas and WebGL operations to capture:
 * - Every draw call with parameters
 * - State changes (blending modes, transforms, etc.)
 * - Visual snapshots at key points
 *
 * This script must be injected BEFORE the app loads to intercept
 * canvas context creation.
 */

/**
 * Generate the canvas instrumentation script to inject into the page
 */
function generateCanvasInstrumentationScript() {
  return `
(function() {
  'use strict';

  // Global capture storage
  window.__CANVAS_CAPTURE__ = {
    contexts: new WeakMap(),
    calls: [],
    snapshots: [],
    maxCalls: 100000,
    captureSnapshots: true,
    snapshotInterval: 100, // Capture every N draw calls
    started: Date.now()
  };

  const capture = window.__CANVAS_CAPTURE__;

  // =========================================================================
  // 2D CONTEXT INSTRUMENTATION
  // =========================================================================

  const Canvas2DMethods = [
    // Drawing rectangles
    'fillRect', 'strokeRect', 'clearRect',
    // Drawing text
    'fillText', 'strokeText', 'measureText',
    // Drawing images
    'drawImage',
    // Creating paths
    'beginPath', 'closePath', 'moveTo', 'lineTo',
    'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo',
    'ellipse', 'rect',
    // Drawing paths
    'fill', 'stroke', 'clip',
    // Transformations
    'save', 'restore', 'scale', 'rotate', 'translate',
    'transform', 'setTransform', 'resetTransform',
    // Gradients and patterns
    'createLinearGradient', 'createRadialGradient', 'createPattern',
    // Image data
    'createImageData', 'getImageData', 'putImageData',
    // Other
    'isPointInPath', 'isPointInStroke'
  ];

  const Canvas2DProperties = [
    // Compositing
    'globalAlpha', 'globalCompositeOperation',
    // Line styles
    'lineWidth', 'lineCap', 'lineJoin', 'miterLimit',
    'lineDashOffset',
    // Text styles
    'font', 'textAlign', 'textBaseline', 'direction',
    // Fill and stroke styles
    'fillStyle', 'strokeStyle',
    // Shadows
    'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY',
    // Image smoothing
    'imageSmoothingEnabled', 'imageSmoothingQuality',
    // Filters
    'filter'
  ];

  function wrapCanvas2DContext(ctx, canvas) {
    const wrappedCtx = {};
    const contextId = capture.contexts.size;

    // Store original context reference
    capture.contexts.set(canvas, {
      id: contextId,
      original: ctx,
      wrapped: wrappedCtx,
      callCount: 0,
      lastState: {}
    });

    // Wrap methods
    for (const method of Canvas2DMethods) {
      if (typeof ctx[method] === 'function') {
        wrappedCtx[method] = function(...args) {
          const contextInfo = capture.contexts.get(canvas);
          contextInfo.callCount++;

          // Record the call
          if (capture.calls.length < capture.maxCalls) {
            capture.calls.push({
              type: '2d',
              contextId,
              method,
              args: serializeArgs(args),
              timestamp: performance.now(),
              state: captureState2D(ctx)
            });
          }

          // Take snapshot on draw operations
          const drawMethods = ['fillRect', 'strokeRect', 'fill', 'stroke', 'fillText', 'strokeText', 'drawImage', 'putImageData'];
          if (capture.captureSnapshots &&
              drawMethods.includes(method) &&
              contextInfo.callCount % capture.snapshotInterval === 0) {
            captureSnapshot(canvas, contextId, method);
          }

          return ctx[method].apply(ctx, args);
        };
      }
    }

    // Wrap property access
    for (const prop of Canvas2DProperties) {
      Object.defineProperty(wrappedCtx, prop, {
        get: function() {
          return ctx[prop];
        },
        set: function(value) {
          const contextInfo = capture.contexts.get(canvas);

          // Record property change
          if (capture.calls.length < capture.maxCalls) {
            capture.calls.push({
              type: '2d-property',
              contextId,
              property: prop,
              value: serializeValue(value),
              oldValue: serializeValue(ctx[prop]),
              timestamp: performance.now()
            });
          }

          ctx[prop] = value;
        },
        enumerable: true
      });
    }

    // Copy non-wrapped methods and properties
    for (const key of Object.keys(ctx.__proto__)) {
      if (!(key in wrappedCtx)) {
        if (typeof ctx[key] === 'function') {
          wrappedCtx[key] = ctx[key].bind(ctx);
        } else {
          Object.defineProperty(wrappedCtx, key, {
            get: () => ctx[key],
            set: (v) => { ctx[key] = v; },
            enumerable: true
          });
        }
      }
    }

    // Preserve canvas reference
    wrappedCtx.canvas = canvas;

    return wrappedCtx;
  }

  // =========================================================================
  // WEBGL CONTEXT INSTRUMENTATION
  // =========================================================================

  const WebGLMethods = [
    // Drawing
    'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced',
    // Clearing
    'clear', 'clearColor', 'clearDepth', 'clearStencil',
    // Buffers
    'createBuffer', 'deleteBuffer', 'bindBuffer', 'bufferData', 'bufferSubData',
    // Shaders
    'createShader', 'deleteShader', 'shaderSource', 'compileShader', 'getShaderParameter',
    'getShaderInfoLog',
    // Programs
    'createProgram', 'deleteProgram', 'attachShader', 'detachShader',
    'linkProgram', 'useProgram', 'getProgramParameter', 'getProgramInfoLog',
    // Textures
    'createTexture', 'deleteTexture', 'bindTexture', 'texImage2D', 'texSubImage2D',
    'texParameteri', 'texParameterf', 'generateMipmap',
    // Framebuffers
    'createFramebuffer', 'deleteFramebuffer', 'bindFramebuffer', 'framebufferTexture2D',
    'framebufferRenderbuffer', 'checkFramebufferStatus',
    // Renderbuffers
    'createRenderbuffer', 'deleteRenderbuffer', 'bindRenderbuffer', 'renderbufferStorage',
    // Uniforms
    'getUniformLocation', 'uniform1f', 'uniform2f', 'uniform3f', 'uniform4f',
    'uniform1i', 'uniform2i', 'uniform3i', 'uniform4i',
    'uniform1fv', 'uniform2fv', 'uniform3fv', 'uniform4fv',
    'uniform1iv', 'uniform2iv', 'uniform3iv', 'uniform4iv',
    'uniformMatrix2fv', 'uniformMatrix3fv', 'uniformMatrix4fv',
    // Attributes
    'getAttribLocation', 'vertexAttribPointer', 'enableVertexAttribArray',
    'disableVertexAttribArray', 'vertexAttrib1f', 'vertexAttrib2f',
    'vertexAttrib3f', 'vertexAttrib4f',
    // State
    'enable', 'disable', 'blendFunc', 'blendFuncSeparate', 'blendEquation',
    'blendEquationSeparate', 'blendColor', 'depthFunc', 'depthMask', 'depthRange',
    'cullFace', 'frontFace', 'stencilFunc', 'stencilMask', 'stencilOp',
    'scissor', 'viewport', 'lineWidth', 'polygonOffset',
    // Reading
    'readPixels', 'getParameter', 'getError'
  ];

  function wrapWebGLContext(gl, canvas, type) {
    const wrappedGL = {};
    const contextId = capture.contexts.size;

    capture.contexts.set(canvas, {
      id: contextId,
      type,
      original: gl,
      wrapped: wrappedGL,
      callCount: 0,
      shaders: new Map(),
      programs: new Map()
    });

    // Wrap methods
    for (const method of WebGLMethods) {
      if (typeof gl[method] === 'function') {
        wrappedGL[method] = function(...args) {
          const contextInfo = capture.contexts.get(canvas);
          contextInfo.callCount++;

          // Record the call
          if (capture.calls.length < capture.maxCalls) {
            capture.calls.push({
              type: type,
              contextId,
              method,
              args: serializeWebGLArgs(args, gl),
              timestamp: performance.now()
            });
          }

          // Capture shader source
          if (method === 'shaderSource') {
            const [shader, source] = args;
            contextInfo.shaders.set(shader, source);
          }

          // Take snapshot on draw operations
          const drawMethods = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'];
          if (capture.captureSnapshots &&
              drawMethods.includes(method) &&
              contextInfo.callCount % capture.snapshotInterval === 0) {
            captureSnapshot(canvas, contextId, method);
          }

          return gl[method].apply(gl, args);
        };
      }
    }

    // Copy constants and other properties
    for (const key of Object.getOwnPropertyNames(gl.__proto__)) {
      if (!(key in wrappedGL)) {
        const descriptor = Object.getOwnPropertyDescriptor(gl.__proto__, key);
        if (descriptor) {
          if (typeof gl[key] === 'function') {
            wrappedGL[key] = gl[key].bind(gl);
          } else {
            Object.defineProperty(wrappedGL, key, {
              get: () => gl[key],
              enumerable: true
            });
          }
        }
      }
    }

    // Copy WebGL constants
    for (const key of Object.keys(gl.constructor)) {
      if (typeof gl.constructor[key] === 'number') {
        wrappedGL[key] = gl.constructor[key];
      }
    }

    // Preserve canvas reference
    wrappedGL.canvas = canvas;

    return wrappedGL;
  }

  // =========================================================================
  // HELPER FUNCTIONS
  // =========================================================================

  function serializeArgs(args) {
    return args.map(serializeValue);
  }

  function serializeValue(value) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      return value;
    }
    if (value instanceof HTMLImageElement) {
      return { type: 'HTMLImageElement', src: value.src?.substring(0, 100) };
    }
    if (value instanceof HTMLCanvasElement) {
      return { type: 'HTMLCanvasElement', width: value.width, height: value.height };
    }
    if (value instanceof ImageData) {
      return { type: 'ImageData', width: value.width, height: value.height };
    }
    if (value instanceof CanvasGradient) {
      return { type: 'CanvasGradient' };
    }
    if (value instanceof CanvasPattern) {
      return { type: 'CanvasPattern' };
    }
    if (ArrayBuffer.isView(value)) {
      return { type: value.constructor.name, length: value.length };
    }
    if (Array.isArray(value)) {
      return value.slice(0, 10).map(serializeValue);
    }
    return { type: typeof value };
  }

  function serializeWebGLArgs(args, gl) {
    return args.map(arg => {
      if (arg === null || arg === undefined) return arg;
      if (typeof arg === 'number') {
        // Try to resolve GL constant name
        const constName = getGLConstantName(gl, arg);
        return constName ? { const: constName, value: arg } : arg;
      }
      if (typeof arg === 'string') return arg;
      if (arg instanceof WebGLBuffer) return { type: 'WebGLBuffer' };
      if (arg instanceof WebGLShader) return { type: 'WebGLShader' };
      if (arg instanceof WebGLProgram) return { type: 'WebGLProgram' };
      if (arg instanceof WebGLTexture) return { type: 'WebGLTexture' };
      if (arg instanceof WebGLFramebuffer) return { type: 'WebGLFramebuffer' };
      if (arg instanceof WebGLRenderbuffer) return { type: 'WebGLRenderbuffer' };
      if (arg instanceof WebGLUniformLocation) return { type: 'WebGLUniformLocation' };
      if (ArrayBuffer.isView(arg)) {
        return { type: arg.constructor.name, length: arg.length };
      }
      if (arg instanceof HTMLImageElement) {
        return { type: 'HTMLImageElement', src: arg.src?.substring(0, 100) };
      }
      if (arg instanceof HTMLCanvasElement) {
        return { type: 'HTMLCanvasElement', width: arg.width, height: arg.height };
      }
      return { type: typeof arg };
    });
  }

  // Cache for GL constant names
  const glConstantCache = new Map();

  function getGLConstantName(gl, value) {
    if (!glConstantCache.has(gl)) {
      const constants = {};
      for (const key in gl) {
        if (typeof gl[key] === 'number' && key === key.toUpperCase()) {
          constants[gl[key]] = key;
        }
      }
      glConstantCache.set(gl, constants);
    }
    return glConstantCache.get(gl)[value];
  }

  function captureState2D(ctx) {
    return {
      globalAlpha: ctx.globalAlpha,
      globalCompositeOperation: ctx.globalCompositeOperation,
      fillStyle: serializeValue(ctx.fillStyle),
      strokeStyle: serializeValue(ctx.strokeStyle),
      lineWidth: ctx.lineWidth,
      font: ctx.font,
      textAlign: ctx.textAlign,
      transform: ctx.getTransform?.() || null
    };
  }

  function captureSnapshot(canvas, contextId, trigger) {
    try {
      const dataUrl = canvas.toDataURL('image/png', 0.5);
      capture.snapshots.push({
        contextId,
        trigger,
        timestamp: performance.now(),
        width: canvas.width,
        height: canvas.height,
        dataUrl: dataUrl.substring(0, 1000) // Truncate for storage
      });
    } catch (e) {
      // Cross-origin canvas restrictions
    }
  }

  // =========================================================================
  // INTERCEPT CANVAS CONTEXT CREATION
  // =========================================================================

  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    const ctx = originalGetContext.apply(this, [type, ...args]);

    if (!ctx) return ctx;

    // Already wrapped?
    if (capture.contexts.has(this)) {
      return capture.contexts.get(this).wrapped;
    }

    // Wrap based on context type
    if (type === '2d') {
      console.log('[Canvas Instrumentation] Wrapping 2D context');
      return wrapCanvas2DContext(ctx, this);
    }

    if (type === 'webgl' || type === 'experimental-webgl') {
      console.log('[Canvas Instrumentation] Wrapping WebGL context');
      return wrapWebGLContext(ctx, this, 'webgl');
    }

    if (type === 'webgl2' || type === 'experimental-webgl2') {
      console.log('[Canvas Instrumentation] Wrapping WebGL2 context');
      return wrapWebGLContext(ctx, this, 'webgl2');
    }

    return ctx;
  };

  // Also intercept OffscreenCanvas if available
  if (typeof OffscreenCanvas !== 'undefined') {
    const originalOffscreenGetContext = OffscreenCanvas.prototype.getContext;

    OffscreenCanvas.prototype.getContext = function(type, ...args) {
      const ctx = originalOffscreenGetContext.apply(this, [type, ...args]);

      if (!ctx) return ctx;

      if (capture.contexts.has(this)) {
        return capture.contexts.get(this).wrapped;
      }

      if (type === '2d') {
        console.log('[Canvas Instrumentation] Wrapping OffscreenCanvas 2D context');
        return wrapCanvas2DContext(ctx, this);
      }

      if (type === 'webgl' || type === 'webgl2') {
        console.log('[Canvas Instrumentation] Wrapping OffscreenCanvas WebGL context');
        return wrapWebGLContext(ctx, this, type);
      }

      return ctx;
    };
  }

  // =========================================================================
  // API FOR RETRIEVING CAPTURED DATA
  // =========================================================================

  window.__CANVAS_CAPTURE__.getCalls = function() {
    return capture.calls;
  };

  window.__CANVAS_CAPTURE__.getSnapshots = function() {
    return capture.snapshots;
  };

  window.__CANVAS_CAPTURE__.getSummary = function() {
    const methodCounts = {};
    for (const call of capture.calls) {
      const key = call.method || call.property || 'unknown';
      methodCounts[key] = (methodCounts[key] || 0) + 1;
    }

    return {
      totalCalls: capture.calls.length,
      totalSnapshots: capture.snapshots.length,
      contextCount: capture.contexts.size,
      methodCounts,
      duration: performance.now() - capture.started
    };
  };

  window.__CANVAS_CAPTURE__.clear = function() {
    capture.calls = [];
    capture.snapshots = [];
  };

  console.log('[Canvas Instrumentation] Ready - all canvas contexts will be instrumented');
})();
`;
}

/**
 * Inject the instrumentation script into a page
 */
async function injectCanvasInstrumentation(page) {
  // Add initialization script to run before any page scripts
  await page.addInitScript(generateCanvasInstrumentationScript());
  console.log('  ✓ Canvas instrumentation injected');
}

/**
 * Retrieve captured canvas data from the page
 */
async function getCanvasCaptureData(page) {
  return await page.evaluate(() => {
    if (!window.__CANVAS_CAPTURE__) {
      return { error: 'Canvas instrumentation not found' };
    }

    return {
      summary: window.__CANVAS_CAPTURE__.getSummary(),
      calls: window.__CANVAS_CAPTURE__.getCalls().slice(-1000), // Last 1000 calls
      snapshots: window.__CANVAS_CAPTURE__.getSnapshots()
    };
  });
}

/**
 * Clear captured canvas data
 */
async function clearCanvasCaptureData(page) {
  return await page.evaluate(() => {
    if (window.__CANVAS_CAPTURE__) {
      window.__CANVAS_CAPTURE__.clear();
      return true;
    }
    return false;
  });
}

module.exports = {
  generateCanvasInstrumentationScript,
  injectCanvasInstrumentation,
  getCanvasCaptureData,
  clearCanvasCaptureData
};
