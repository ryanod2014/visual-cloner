/**
 * Hook Injector - Inject capture hooks onto EXISTING prototypes at runtime
 *
 * This is the KEY CHANGE from the previous approach:
 * - Previous: Extract code → Instrument → Run isolated (34% success)
 * - New: Load live app → Inject hooks on existing prototypes (90%+ success)
 */

async function injectCaptureHooks(page, analysis) {
  await page.evaluate((analysisData) => {
    // ═══════════════════════════════════════════════════════════════
    // CAPTURE RUNTIME
    // ═══════════════════════════════════════════════════════════════
    window.__capture = {
      io: [],
      calledFunctions: new Set(),
      wrappedMethods: new Set(),
      maxPerFunction: 50,

      // Serialize complex objects safely
      serialize(obj, depth = 0, seen = new WeakSet()) {
        if (depth > 5) return '[MAX_DEPTH]';
        if (obj === null) return null;
        if (obj === undefined) return undefined;
        if (typeof obj === 'function') return '[Function]';
        if (typeof obj !== 'object') return obj;
        if (seen.has(obj)) return '[CIRCULAR]';
        seen.add(obj);

        // Handle typed arrays
        if (obj instanceof Uint8Array) {
          return { __type: 'Uint8Array', length: obj.length, sample: [...obj.slice(0, 100)] };
        }
        if (obj instanceof Uint8ClampedArray) {
          return { __type: 'Uint8ClampedArray', length: obj.length, sample: [...obj.slice(0, 100)] };
        }
        if (obj instanceof Float32Array) {
          return { __type: 'Float32Array', length: obj.length, sample: [...obj.slice(0, 100)] };
        }
        if (obj instanceof Float64Array) {
          return { __type: 'Float64Array', length: obj.length, sample: [...obj.slice(0, 100)] };
        }
        if (obj instanceof Int32Array) {
          return { __type: 'Int32Array', length: obj.length, sample: [...obj.slice(0, 100)] };
        }
        if (obj instanceof ArrayBuffer) {
          return { __type: 'ArrayBuffer', byteLength: obj.byteLength };
        }
        if (obj instanceof ImageData) {
          return { __type: 'ImageData', width: obj.width, height: obj.height };
        }

        // Handle DOM elements
        if (obj instanceof HTMLElement) {
          return { __type: 'HTMLElement', tag: obj.tagName, id: obj.id, className: obj.className };
        }
        if (obj instanceof HTMLCanvasElement) {
          return { __type: 'Canvas', width: obj.width, height: obj.height };
        }
        if (obj instanceof CanvasRenderingContext2D) {
          return { __type: 'Context2D' };
        }
        if (typeof WebGLRenderingContext !== 'undefined' && obj instanceof WebGLRenderingContext) {
          return { __type: 'WebGLContext' };
        }
        if (typeof WebGL2RenderingContext !== 'undefined' && obj instanceof WebGL2RenderingContext) {
          return { __type: 'WebGL2Context' };
        }

        // Handle Blob/File
        if (obj instanceof Blob) {
          return { __type: 'Blob', size: obj.size, type: obj.type };
        }

        // Handle arrays
        if (Array.isArray(obj)) {
          return obj.slice(0, 50).map(x => this.serialize(x, depth + 1, seen));
        }

        // Handle regular objects - capture key properties
        const result = { __type: obj.constructor?.name || 'Object' };
        const keys = Object.keys(obj).slice(0, 30);
        for (const key of keys) {
          try {
            result[key] = this.serialize(obj[key], depth + 1, seen);
          } catch (e) {
            result[key] = '[ERROR]';
          }
        }
        return result;
      },

      // Count captures per function to avoid flooding
      getCaptureCount(fnName) {
        return this.io.filter(e => e.function === fnName).length;
      },

      // Wrap a method with capture
      wrapMethod(obj, methodName, className) {
        const original = obj[methodName];
        if (typeof original !== 'function') return false;

        const fullName = className ? `${className}.${methodName}` : methodName;

        // Skip if already wrapped
        if (this.wrappedMethods.has(fullName)) return false;

        const capture = this;

        obj[methodName] = function(...args) {
          capture.calledFunctions.add(fullName);

          // Limit captures per function
          if (capture.getCaptureCount(fullName) >= capture.maxPerFunction) {
            return original.apply(this, args);
          }

          const entry = {
            function: fullName,
            input: {
              args: capture.serialize(args),
              this: capture.serialize(this)
            },
            timestamp: Date.now()
          };

          try {
            const result = original.apply(this, args);  // CORRECT `this`!
            entry.output = capture.serialize(result);
            capture.io.push(entry);
            return result;
          } catch (e) {
            entry.error = e.message;
            capture.io.push(entry);
            throw e;
          }
        };

        this.wrappedMethods.add(fullName);
        return true;
      },

      // Get all captured I/O
      getResults() {
        return {
          io: this.io,
          calledFunctions: [...this.calledFunctions],
          wrappedMethods: [...this.wrappedMethods],
          totalCaptures: this.io.length
        };
      }
    };

    // ═══════════════════════════════════════════════════════════════
    // WRAP PROTOTYPE METHODS FROM STATIC ANALYSIS
    // ═══════════════════════════════════════════════════════════════

    let wrappedCount = 0;

    for (const cls of analysisData.classes || []) {
      const Constructor = window[cls.name];
      if (!Constructor || !Constructor.prototype) continue;

      const proto = Constructor.prototype;
      const methods = Object.getOwnPropertyNames(proto)
        .filter(name => {
          try {
            return typeof proto[name] === 'function' && name !== 'constructor';
          } catch (e) {
            return false;
          }
        });

      for (const method of methods) {
        try {
          if (__capture.wrapMethod(proto, method, cls.name)) {
            wrappedCount++;
          }
        } catch (e) {
          console.warn(`Failed to wrap ${cls.name}.${method}:`, e.message);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // WRAP GLOBAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    for (const fnName of analysisData.globalFunctions || []) {
      if (typeof window[fnName] === 'function') {
        try {
          if (__capture.wrapMethod(window, fnName, null)) {
            wrappedCount++;
          }
        } catch (e) {
          console.warn(`Failed to wrap global ${fnName}:`, e.message);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // AUTO-DISCOVER AND WRAP ADDITIONAL CLASSES
    // ═══════════════════════════════════════════════════════════════

    // Look for common Photopea classes that might not be in static analysis
    const commonClasses = [
      // Document/Layer hierarchy
      'Document', 'Layer', 'LayerGroup', 'TextLayer', 'ShapeLayer',
      'AdjustmentLayer', 'SmartObject', 'Background',
      // Selections
      'Selection', 'SelectionManager',
      // Tools
      'Tool', 'Brush', 'Eraser', 'Pencil', 'Clone', 'Heal',
      'Fill', 'Gradient', 'Eyedropper', 'Move', 'Transform',
      // Filters
      'Filter', 'Blur', 'Sharpen', 'Noise', 'Distort',
      // Colors
      'Color', 'ColorSpace', 'Palette',
      // History
      'History', 'HistoryState',
      // Canvas
      'Canvas', 'CanvasRenderer', 'WebGLRenderer',
      // File formats
      'PSD', 'PNG', 'JPEG', 'GIF', 'WebP', 'SVG', 'PDF',
      // Utilities
      'Math', 'Matrix', 'Vector', 'Point', 'Rectangle', 'Path',
    ];

    // Also check in Photopea namespace
    const namespaces = [window, window.Photopea, window.app].filter(Boolean);

    for (const name of commonClasses) {
      for (const ns of namespaces) {
        const Constructor = ns[name];
        if (!Constructor?.prototype) continue;

        const proto = Constructor.prototype;
        const methods = Object.getOwnPropertyNames(proto)
          .filter(n => {
            try {
              return typeof proto[n] === 'function' && n !== 'constructor';
            } catch (e) {
              return false;
            }
          });

        for (const method of methods) {
          try {
            if (__capture.wrapMethod(proto, method, name)) {
              wrappedCount++;
            }
          } catch (e) {}
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // DISCOVER AND WRAP ALL CAPITALIZED GLOBALS (likely constructors)
    // ═══════════════════════════════════════════════════════════════

    for (const key of Object.keys(window)) {
      if (!/^[A-Z]/.test(key)) continue;

      try {
        const Constructor = window[key];
        if (typeof Constructor !== 'function' || !Constructor.prototype) continue;

        const proto = Constructor.prototype;
        const methods = Object.getOwnPropertyNames(proto)
          .filter(n => {
            try {
              return typeof proto[n] === 'function' && n !== 'constructor';
            } catch (e) {
              return false;
            }
          });

        for (const method of methods) {
          try {
            if (__capture.wrapMethod(proto, method, key)) {
              wrappedCount++;
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    // ═══════════════════════════════════════════════════════════════
    // WRAP CANVAS 2D CONTEXT (captures all drawing operations)
    // ═══════════════════════════════════════════════════════════════

    const ctx2dProto = CanvasRenderingContext2D.prototype;
    const ctx2dMethods = [
      // Basic shapes
      'fillRect', 'strokeRect', 'clearRect', 'rect',
      // Text
      'fillText', 'strokeText', 'measureText',
      // Path operations
      'beginPath', 'closePath', 'moveTo', 'lineTo',
      'arc', 'arcTo', 'bezierCurveTo', 'quadraticCurveTo',
      'ellipse', 'roundRect',
      // Drawing
      'fill', 'stroke', 'clip',
      // Image operations
      'drawImage', 'createImageData', 'getImageData', 'putImageData',
      // Gradients/Patterns
      'createLinearGradient', 'createRadialGradient', 'createConicGradient', 'createPattern',
      // Transformations
      'setTransform', 'getTransform', 'transform', 'resetTransform',
      'translate', 'rotate', 'scale',
      // State
      'save', 'restore', 'reset', 'getContextAttributes',
      // Compositing
      'globalCompositeOperation', 'globalAlpha',
      // Line styles
      'setLineDash', 'getLineDash',
      // Hit testing
      'isPointInPath', 'isPointInStroke',
      // Filter effects (if available)
      'filter'
    ];

    for (const method of ctx2dMethods) {
      try {
        if (__capture.wrapMethod(ctx2dProto, method, 'Context2D')) {
          wrappedCount++;
        }
      } catch (e) {}
    }

    // ═══════════════════════════════════════════════════════════════
    // WRAP WEBGL CONTEXT (captures all WebGL operations)
    // ═══════════════════════════════════════════════════════════════

    if (typeof WebGLRenderingContext !== 'undefined') {
      const webglProto = WebGLRenderingContext.prototype;
      const webglMethods = [
        // Drawing
        'drawArrays', 'drawElements', 'clear', 'clearColor', 'clearDepth', 'clearStencil',
        // Programs/Shaders
        'useProgram', 'createProgram', 'linkProgram', 'createShader', 'compileShader',
        'attachShader', 'shaderSource', 'getShaderParameter', 'getProgramParameter',
        // Textures
        'bindTexture', 'createTexture', 'texImage2D', 'texSubImage2D', 'texParameteri',
        'generateMipmap', 'activeTexture',
        // Buffers
        'bindBuffer', 'createBuffer', 'bufferData', 'bufferSubData',
        // Framebuffers
        'bindFramebuffer', 'createFramebuffer', 'framebufferTexture2D',
        // Renderbuffers
        'bindRenderbuffer', 'createRenderbuffer', 'renderbufferStorage',
        // Uniforms
        'uniform1f', 'uniform2f', 'uniform3f', 'uniform4f',
        'uniform1i', 'uniform2i', 'uniform3i', 'uniform4i',
        'uniform1fv', 'uniform2fv', 'uniform3fv', 'uniform4fv',
        'uniformMatrix2fv', 'uniformMatrix3fv', 'uniformMatrix4fv',
        'getUniformLocation',
        // Vertex attributes
        'vertexAttribPointer', 'enableVertexAttribArray', 'disableVertexAttribArray',
        'getAttribLocation',
        // State
        'viewport', 'scissor', 'enable', 'disable', 'blendFunc', 'blendFuncSeparate',
        'depthFunc', 'depthMask', 'stencilFunc', 'stencilMask', 'stencilOp',
        'colorMask', 'cullFace', 'frontFace',
        // Reading
        'readPixels', 'getParameter'
      ];

      for (const method of webglMethods) {
        try {
          if (__capture.wrapMethod(webglProto, method, 'WebGL')) {
            wrappedCount++;
          }
        } catch (e) {}
      }
    }

    if (typeof WebGL2RenderingContext !== 'undefined') {
      const webgl2Proto = WebGL2RenderingContext.prototype;
      const webgl2Methods = [
        // Drawing
        'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced',
        'drawRangeElements', 'clear', 'clearColor', 'clearDepth',
        // Programs
        'useProgram', 'createProgram', 'linkProgram',
        // Textures
        'bindTexture', 'createTexture', 'texImage2D', 'texImage3D', 'texStorage2D', 'texStorage3D',
        'generateMipmap', 'activeTexture',
        // Buffers
        'bindBuffer', 'createBuffer', 'bufferData', 'bufferSubData',
        // VAO
        'createVertexArray', 'bindVertexArray', 'deleteVertexArray',
        // Transform feedback
        'createTransformFeedback', 'bindTransformFeedback', 'beginTransformFeedback', 'endTransformFeedback',
        // Uniforms
        'uniform1f', 'uniform2f', 'uniform3f', 'uniform4f',
        'uniform1i', 'uniform2i', 'uniform3i', 'uniform4i',
        'uniformMatrix2fv', 'uniformMatrix3fv', 'uniformMatrix4fv',
        'uniformBlockBinding', 'getUniformBlockIndex',
        // State
        'viewport', 'scissor', 'enable', 'disable', 'blendFunc', 'depthFunc',
        // Reading
        'readPixels', 'getParameter', 'getBufferSubData'
      ];

      for (const method of webgl2Methods) {
        try {
          if (__capture.wrapMethod(webgl2Proto, method, 'WebGL2')) {
            wrappedCount++;
          }
        } catch (e) {}
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // DISCOVER PHOTOPEA INTERNAL OBJECTS
    // ═══════════════════════════════════════════════════════════════

    const discoveredProtos = new Set();
    const skipProtos = new Set([
      Object.prototype, Array.prototype,
      CanvasRenderingContext2D.prototype,
      typeof WebGLRenderingContext !== 'undefined' ? WebGLRenderingContext.prototype : null,
      typeof WebGL2RenderingContext !== 'undefined' ? WebGL2RenderingContext.prototype : null
    ].filter(Boolean));

    function discoverFromObject(obj, depth = 0) {
      if (depth > 3 || !obj || typeof obj !== 'object') return;

      try {
        const proto = Object.getPrototypeOf(obj);
        if (!proto || skipProtos.has(proto) || discoveredProtos.has(proto)) return;

        discoveredProtos.add(proto);

        const constructorName = obj.constructor?.name || 'Unknown';
        // Only wrap if constructor name is meaningful (not minified single letters)
        if (constructorName && constructorName.length > 2 && constructorName !== 'Object') {
          const methods = Object.getOwnPropertyNames(proto)
            .filter(n => {
              try {
                return typeof proto[n] === 'function' && n !== 'constructor' && !n.startsWith('_');
              } catch (e) {
                return false;
              }
            });

          for (const method of methods) {
            try {
              if (__capture.wrapMethod(proto, method, constructorName)) {
                wrappedCount++;
              }
            } catch (e) {}
          }
        }

        // Traverse properties (limited)
        const keys = Object.keys(obj).slice(0, 10);
        for (const key of keys) {
          try {
            const val = obj[key];
            if (val && typeof val === 'object' && !Array.isArray(val) &&
                !(val instanceof HTMLElement) && !(val instanceof HTMLDocument)) {
              discoverFromObject(val, depth + 1);
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    // Try to find Photopea's app object
    const possibleApps = [
      window.app,
      window.Photopea?.app,
      window.pea
    ].filter(Boolean);

    for (const app of possibleApps) {
      discoverFromObject(app, 0);
    }

    console.log(`Capture hooks injected: ${wrappedCount} methods wrapped`);
    console.log(`Discovered prototypes: ${discoveredProtos.size}`);
    window.__captureReady = true;

  }, analysis);

  // Wait for hooks to be ready
  await page.waitForFunction(() => window.__captureReady === true);
}

module.exports = { injectCaptureHooks };
