/**
 * WebGL Capture Injection Script
 *
 * This script is injected into the page BEFORE navigation to hook WebGL APIs
 * and capture shader source code, uniforms, and canvas information.
 *
 * Hooks:
 *   - HTMLCanvasElement.prototype.getContext (tracks canvas -> GL context)
 *   - WebGLRenderingContext.prototype.shaderSource (captures shader source)
 *   - WebGL2RenderingContext.prototype.shaderSource (captures WebGL2 shaders)
 *   - WebGLRenderingContext.prototype.getUniformLocation (tracks uniform names)
 *   - WebGL2RenderingContext.prototype.getUniformLocation (WebGL2 uniforms)
 *
 * Captured data is stored in:
 *   - window.__capturedShaders: Array of shader objects
 *   - window.__capturedUniforms: Array of uniform objects
 *   - window.__glContextToCanvas: WeakMap of GL context -> canvas element
 *
 * Usage:
 *   // In Playwright/Puppeteer:
 *   await page.addInitScript(fs.readFileSync('runtime/webgl-capture.js', 'utf8'));
 *
 *   // After page load:
 *   const data = await page.evaluate(() => ({
 *     shaders: window.__capturedShaders,
 *     uniforms: window.__capturedUniforms
 *   }));
 */

(function() {
  'use strict';

  // Prevent double-installation
  if (window.__webglCaptureInstalled) return;
  window.__webglCaptureInstalled = true;

  // Storage for captured data
  window.__capturedShaders = [];
  window.__capturedUniforms = [];
  window.__capturedUniformValues = {};  // name -> {type, value}
  window.__glContextToCanvas = new WeakMap();
  window.__uniformLocations = new WeakMap();  // location -> name

  // ============================================
  // CANVAS CONTEXT TRACKING
  // ============================================

  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(contextType, ...args) {
    const ctx = originalGetContext.call(this, contextType, ...args);

    // Track WebGL contexts to their canvas elements
    if (ctx && (contextType === 'webgl' || contextType === 'webgl2' || contextType === 'experimental-webgl')) {
      window.__glContextToCanvas.set(ctx, this);
    }

    return ctx;
  };

  // ============================================
  // WEBGL 1 SHADER CAPTURE
  // ============================================

  if (typeof WebGLRenderingContext !== 'undefined') {
    const originalShaderSource = WebGLRenderingContext.prototype.shaderSource;
    WebGLRenderingContext.prototype.shaderSource = function(shader, source) {
      try {
        const type = this.getShaderParameter(shader, this.SHADER_TYPE);
        const canvas = window.__glContextToCanvas.get(this);

        window.__capturedShaders.push({
          type: type === this.VERTEX_SHADER ? 'vertex' : 'fragment',
          source: source,
          timestamp: Date.now(),
          context: 'webgl',
          canvasId: canvas?.id || null,
          canvasClass: canvas?.className || null,
          canvasWidth: canvas?.width || null,
          canvasHeight: canvas?.height || null,
        });
      } catch (e) {
        // Silent fail - don't break the app
      }

      return originalShaderSource.call(this, shader, source);
    };

    const originalGetUniformLocation = WebGLRenderingContext.prototype.getUniformLocation;
    WebGLRenderingContext.prototype.getUniformLocation = function(program, name) {
      const location = originalGetUniformLocation.call(this, program, name);

      if (location) {
        try {
          // Track location -> name mapping for value capture
          window.__uniformLocations.set(location, name);

          const canvas = window.__glContextToCanvas.get(this);
          window.__capturedUniforms.push({
            name: name,
            timestamp: Date.now(),
            context: 'webgl',
            canvasId: canvas?.id || null,
          });
        } catch (e) {
          // Silent fail
        }
      }

      return location;
    };

    // Hook uniform setters to capture VALUES
    const uniformSetters = [
      { name: 'uniform1f', type: 'float', count: 1 },
      { name: 'uniform2f', type: 'vec2', count: 2 },
      { name: 'uniform3f', type: 'vec3', count: 3 },
      { name: 'uniform4f', type: 'vec4', count: 4 },
      { name: 'uniform1i', type: 'int', count: 1 },
      { name: 'uniform1fv', type: 'float[]', count: -1 },
      { name: 'uniform2fv', type: 'vec2[]', count: -1 },
      { name: 'uniform3fv', type: 'vec3[]', count: -1 },
      { name: 'uniform4fv', type: 'vec4[]', count: -1 },
      { name: 'uniformMatrix4fv', type: 'mat4', count: -1 },
    ];

    uniformSetters.forEach(({ name: fnName, type, count }) => {
      const original = WebGLRenderingContext.prototype[fnName];
      if (!original) return;

      WebGLRenderingContext.prototype[fnName] = function(location, ...args) {
        try {
          const uniformName = window.__uniformLocations.get(location);
          if (uniformName) {
            let value;
            if (count === -1) {
              // Array or matrix - args[0] might be transpose flag for matrices
              value = fnName.includes('Matrix') ? Array.from(args[1] || args[0]) : Array.from(args[0]);
            } else if (count === 1) {
              value = args[0];
            } else {
              value = args.slice(0, count);
            }
            window.__capturedUniformValues[uniformName] = { type, value, timestamp: Date.now() };
          }
        } catch (e) {
          // Silent fail
        }
        return original.call(this, location, ...args);
      };
    });
  }

  // ============================================
  // WEBGL 2 SHADER CAPTURE
  // ============================================

  if (typeof WebGL2RenderingContext !== 'undefined') {
    const originalShaderSource2 = WebGL2RenderingContext.prototype.shaderSource;
    WebGL2RenderingContext.prototype.shaderSource = function(shader, source) {
      try {
        const type = this.getShaderParameter(shader, this.SHADER_TYPE);
        const canvas = window.__glContextToCanvas.get(this);

        window.__capturedShaders.push({
          type: type === this.VERTEX_SHADER ? 'vertex' : 'fragment',
          source: source,
          timestamp: Date.now(),
          context: 'webgl2',
          canvasId: canvas?.id || null,
          canvasClass: canvas?.className || null,
          canvasWidth: canvas?.width || null,
          canvasHeight: canvas?.height || null,
        });
      } catch (e) {
        // Silent fail
      }

      return originalShaderSource2.call(this, shader, source);
    };

    const originalGetUniformLocation2 = WebGL2RenderingContext.prototype.getUniformLocation;
    WebGL2RenderingContext.prototype.getUniformLocation = function(program, name) {
      const location = originalGetUniformLocation2.call(this, program, name);

      if (location) {
        try {
          const canvas = window.__glContextToCanvas.get(this);
          window.__capturedUniforms.push({
            name: name,
            timestamp: Date.now(),
            context: 'webgl2',
            canvasId: canvas?.id || null,
          });
        } catch (e) {
          // Silent fail
        }
      }

      return location;
    };
  }

  // Log installation (can be seen in browser console for debugging)
  console.log('[WebGL Capture] Installed - hooks active for shaderSource and getUniformLocation');
})();
