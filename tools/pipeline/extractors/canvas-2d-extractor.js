/**
 * Canvas 2D Extractor
 *
 * Captures ALL 2D canvas operations:
 * - Drawing paths (beginPath, moveTo, lineTo, arc, etc.)
 * - Fill and stroke operations
 * - Images drawn to canvas
 * - Text rendering
 * - Transformations (translate, rotate, scale)
 * - Clipping regions
 * - Gradients and patterns
 * - Composite operations
 * - Save/restore state stack
 *
 * This complements WebGL extractor for non-WebGL canvas uses.
 */

export const canvas2dExtractor = {
  name: 'canvas-2d',

  getInjectionScript() {
    return `
(function() {
  if (window.__canvas2dExtractorInstalled) return;
  window.__canvas2dExtractorInstalled = true;

  window.__canvas2dCaptured = {
    canvases: [],
    operations: [],
    images: [],
    gradients: [],
    patterns: [],
  };

  const canvasRegistry = new WeakMap();
  let canvasCounter = 0;
  let opCounter = 0;
  let gradientCounter = 0;
  let patternCounter = 0;

  // Methods to intercept
  const DRAWING_METHODS = [
    // Path methods
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'bezierCurveTo',
    'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect',
    // Drawing methods
    'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect',
    // Text methods
    'fillText', 'strokeText', 'measureText',
    // Image methods
    'drawImage',
    // Transform methods
    'translate', 'rotate', 'scale', 'transform', 'setTransform', 'resetTransform',
    // State methods
    'save', 'restore',
    // Compositing
    'globalAlpha', 'globalCompositeOperation',
    // Other
    'createLinearGradient', 'createRadialGradient', 'createConicGradient',
    'createPattern', 'createImageData', 'putImageData', 'getImageData',
  ];

  // Properties to track
  const STATE_PROPERTIES = [
    'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin',
    'miterLimit', 'lineDashOffset', 'font', 'textAlign', 'textBaseline',
    'direction', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY',
    'globalAlpha', 'globalCompositeOperation', 'imageSmoothingEnabled',
    'imageSmoothingQuality', 'filter',
  ];

  function serializeValue(val) {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') {
      return val;
    }
    if (val instanceof HTMLImageElement) {
      return { type: 'HTMLImageElement', src: val.src, width: val.width, height: val.height };
    }
    if (val instanceof HTMLCanvasElement) {
      return { type: 'HTMLCanvasElement', width: val.width, height: val.height };
    }
    if (val instanceof HTMLVideoElement) {
      return { type: 'HTMLVideoElement', src: val.src, width: val.videoWidth, height: val.videoHeight };
    }
    if (val instanceof ImageData) {
      return { type: 'ImageData', width: val.width, height: val.height };
    }
    if (val instanceof CanvasGradient) {
      return { type: 'CanvasGradient', id: val.__capturedId || 'unknown' };
    }
    if (val instanceof CanvasPattern) {
      return { type: 'CanvasPattern', id: val.__capturedId || 'unknown' };
    }
    if (val instanceof Path2D) {
      return { type: 'Path2D' };
    }
    if (Array.isArray(val)) {
      return val.map(serializeValue);
    }
    return String(val);
  }

  function captureState(ctx) {
    const state = {};
    STATE_PROPERTIES.forEach(prop => {
      try {
        state[prop] = serializeValue(ctx[prop]);
      } catch (e) {}
    });
    return state;
  }

  function wrapContext(ctx, canvasId) {
    if (ctx.__captured) return ctx;
    ctx.__captured = true;
    ctx.__canvasId = canvasId;

    const operations = [];

    // Wrap drawing methods
    DRAWING_METHODS.forEach(method => {
      if (typeof ctx[method] === 'function') {
        const original = ctx[method].bind(ctx);
        ctx[method] = function(...args) {
          const op = {
            id: opCounter++,
            canvasId,
            method,
            args: args.map(serializeValue),
            timestamp: Date.now(),
          };

          // Capture special return values
          let result = original(...args);

          if (method.includes('Gradient')) {
            if (result) {
              result.__capturedId = 'gradient_' + (gradientCounter++);
              window.__canvas2dCaptured.gradients.push({
                id: result.__capturedId,
                type: method,
                args: op.args,
              });
            }
          } else if (method === 'createPattern') {
            if (result) {
              result.__capturedId = 'pattern_' + (patternCounter++);
              window.__canvas2dCaptured.patterns.push({
                id: result.__capturedId,
                image: serializeValue(args[0]),
                repetition: args[1],
              });
            }
          } else if (method === 'drawImage') {
            // Record image draw operations
            window.__canvas2dCaptured.images.push({
              canvasId,
              source: serializeValue(args[0]),
              args: op.args,
              timestamp: op.timestamp,
            });
          }

          operations.push(op);
          window.__canvas2dCaptured.operations.push(op);

          return result;
        };
      }
    });

    // Track property changes
    STATE_PROPERTIES.forEach(prop => {
      const descriptor = Object.getOwnPropertyDescriptor(ctx.__proto__, prop) ||
                        Object.getOwnPropertyDescriptor(ctx.__proto__.__proto__, prop);

      if (descriptor && (descriptor.set || descriptor.writable)) {
        let currentValue = ctx[prop];

        Object.defineProperty(ctx, prop, {
          get() {
            return currentValue;
          },
          set(value) {
            const op = {
              id: opCounter++,
              canvasId,
              type: 'property',
              property: prop,
              value: serializeValue(value),
              timestamp: Date.now(),
            };
            operations.push(op);
            window.__canvas2dCaptured.operations.push(op);

            currentValue = value;
            if (descriptor.set) {
              descriptor.set.call(ctx, value);
            }
          },
          configurable: true,
        });
      }
    });

    return ctx;
  }

  // Intercept getContext to wrap 2d contexts
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(contextType, options) {
    const ctx = originalGetContext.call(this, contextType, options);

    if ((contextType === '2d') && ctx && !ctx.__captured) {
      let canvasId = canvasRegistry.get(this);
      if (canvasId === undefined) {
        canvasId = canvasCounter++;
        canvasRegistry.set(this, canvasId);

        window.__canvas2dCaptured.canvases.push({
          id: canvasId,
          width: this.width,
          height: this.height,
          cssWidth: this.style.width,
          cssHeight: this.style.height,
          timestamp: Date.now(),
        });
      }

      wrapContext(ctx, canvasId);
    }

    return ctx;
  };

  // Capture current state of all canvases
  window.__captureCanvas2dState = function() {
    const result = {
      canvases: [],
      operations: window.__canvas2dCaptured.operations,
      images: window.__canvas2dCaptured.images,
      gradients: window.__canvas2dCaptured.gradients,
      patterns: window.__canvas2dCaptured.patterns,
    };

    // Capture data URLs of all canvases
    document.querySelectorAll('canvas').forEach((canvas, index) => {
      try {
        const ctx = canvas.getContext('2d');
        result.canvases.push({
          id: canvasRegistry.get(canvas) ?? index,
          width: canvas.width,
          height: canvas.height,
          dataURL: canvas.toDataURL('image/png'),
          hasContent: ctx ? !isCanvasEmpty(canvas) : false,
        });
      } catch (e) {
        result.canvases.push({
          id: canvasRegistry.get(canvas) ?? index,
          width: canvas.width,
          height: canvas.height,
          error: e.message,
        });
      }
    });

    return result;
  };

  // Check if canvas has any drawing
  function isCanvasEmpty(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return true;

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return !imageData.data.some(channel => channel !== 0);
    } catch (e) {
      return true;
    }
  }

  // Get operations for a specific canvas
  window.__getCanvasOperations = function(canvasId) {
    return window.__canvas2dCaptured.operations.filter(op => op.canvasId === canvasId);
  };

  // Generate replay code for canvas operations
  window.__generateCanvasReplay = function(canvasId) {
    const ops = window.__getCanvasOperations(canvasId);
    const lines = ['const ctx = canvas.getContext("2d");'];

    ops.forEach(op => {
      if (op.type === 'property') {
        const value = typeof op.value === 'string' ? '"' + op.value + '"' : op.value;
        lines.push('ctx.' + op.property + ' = ' + value + ';');
      } else if (op.method) {
        const args = op.args.map(a => JSON.stringify(a)).join(', ');
        lines.push('ctx.' + op.method + '(' + args + ');');
      }
    });

    return lines.join('\\n');
  };

  console.log('[Canvas 2D Extractor] Installed');
})();
`;
  },

  async extractData(page) {
    return await page.evaluate(() => {
      if (window.__captureCanvas2dState) {
        return window.__captureCanvas2dState();
      }
      return window.__canvas2dCaptured || { canvases: [], operations: [] };
    });
  },

  async getCanvasOperations(page, canvasId) {
    return await page.evaluate((id) => {
      if (window.__getCanvasOperations) {
        return window.__getCanvasOperations(id);
      }
      return [];
    }, canvasId);
  },

  async generateReplayCode(page, canvasId) {
    return await page.evaluate((id) => {
      if (window.__generateCanvasReplay) {
        return window.__generateCanvasReplay(id);
      }
      return '';
    }, canvasId);
  },

  // Generate JavaScript to replay all canvas operations
  generateReplayScript(data) {
    const lines = [];
    lines.push('// Canvas 2D Replay Script');
    lines.push('// Generated from captured operations');
    lines.push('');

    // Group operations by canvas
    const byCanvas = {};
    data.operations.forEach(op => {
      if (!byCanvas[op.canvasId]) {
        byCanvas[op.canvasId] = [];
      }
      byCanvas[op.canvasId].push(op);
    });

    for (const [canvasId, ops] of Object.entries(byCanvas)) {
      const canvasInfo = data.canvases.find(c => c.id === parseInt(canvasId));

      lines.push(`// Canvas ${canvasId} (${canvasInfo?.width}x${canvasInfo?.height})`);
      lines.push(`function drawCanvas${canvasId}(ctx) {`);

      ops.forEach(op => {
        if (op.type === 'property') {
          const value = typeof op.value === 'string' ? `"${op.value}"` :
                       typeof op.value === 'object' ? JSON.stringify(op.value) :
                       op.value;
          lines.push(`  ctx.${op.property} = ${value};`);
        } else if (op.method) {
          const args = op.args.map(a => {
            if (typeof a === 'object' && a !== null) {
              if (a.type === 'HTMLImageElement') {
                return `/* image: ${a.src} */`;
              }
              return JSON.stringify(a);
            }
            return typeof a === 'string' ? `"${a}"` : a;
          }).join(', ');
          lines.push(`  ctx.${op.method}(${args});`);
        }
      });

      lines.push('}');
      lines.push('');
    }

    return lines.join('\n');
  }
};
