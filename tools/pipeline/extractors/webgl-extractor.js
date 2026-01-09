/**
 * WebGL Complete Extractor
 *
 * Captures ALL WebGL operations including:
 * - Shader source code (vertex + fragment)
 * - Uniform values and locations
 * - Buffer data (vertices, indices)
 * - Texture data and parameters
 * - Draw calls with parameters
 * - WebGL state (blend, depth, stencil)
 */

export const webglExtractor = {
  name: 'webgl',

  getInjectionScript() {
    return `
(function() {
  if (window.__webglExtractorInstalled) return;
  window.__webglExtractorInstalled = true;

  window.__webglCaptured = {
    shaders: [],
    programs: [],
    uniforms: [],
    buffers: [],
    textures: [],
    drawCalls: [],
    stateChanges: [],
    framebuffers: [],
    renderbuffers: [],
  };

  const capturedPrograms = new WeakMap();
  const capturedShaders = new WeakMap();
  const capturedBuffers = new WeakMap();
  const capturedTextures = new WeakMap();
  let programCounter = 0;
  let shaderCounter = 0;
  let bufferCounter = 0;
  let textureCounter = 0;

  function wrapWebGLContext(gl, contextType) {
    if (gl.__captured) return gl;
    gl.__captured = true;
    gl.__contextType = contextType;

    // ============================================
    // SHADER CAPTURE
    // ============================================

    const originalCreateShader = gl.createShader.bind(gl);
    gl.createShader = function(type) {
      const shader = originalCreateShader(type);
      const id = shaderCounter++;
      capturedShaders.set(shader, { id, type, source: null });
      return shader;
    };

    const originalShaderSource = gl.shaderSource.bind(gl);
    gl.shaderSource = function(shader, source) {
      const meta = capturedShaders.get(shader);
      if (meta) {
        meta.source = source;
        window.__webglCaptured.shaders.push({
          id: meta.id,
          type: meta.type === gl.VERTEX_SHADER ? 'vertex' : 'fragment',
          source: source,
          timestamp: Date.now(),
        });
      }
      return originalShaderSource(shader, source);
    };

    // ============================================
    // PROGRAM CAPTURE
    // ============================================

    const originalCreateProgram = gl.createProgram.bind(gl);
    gl.createProgram = function() {
      const program = originalCreateProgram();
      const id = programCounter++;
      capturedPrograms.set(program, { id, shaders: [], linked: false });
      return program;
    };

    const originalAttachShader = gl.attachShader.bind(gl);
    gl.attachShader = function(program, shader) {
      const progMeta = capturedPrograms.get(program);
      const shaderMeta = capturedShaders.get(shader);
      if (progMeta && shaderMeta) {
        progMeta.shaders.push(shaderMeta.id);
      }
      return originalAttachShader(program, shader);
    };

    const originalLinkProgram = gl.linkProgram.bind(gl);
    gl.linkProgram = function(program) {
      const result = originalLinkProgram(program);
      const progMeta = capturedPrograms.get(program);
      if (progMeta) {
        progMeta.linked = true;
        window.__webglCaptured.programs.push({
          id: progMeta.id,
          shaders: progMeta.shaders,
          timestamp: Date.now(),
        });
      }
      return result;
    };

    // ============================================
    // UNIFORM CAPTURE
    // ============================================

    const uniformLocations = new WeakMap();

    const originalGetUniformLocation = gl.getUniformLocation.bind(gl);
    gl.getUniformLocation = function(program, name) {
      const loc = originalGetUniformLocation(program, name);
      if (loc) {
        uniformLocations.set(loc, { program: capturedPrograms.get(program)?.id, name });
      }
      return loc;
    };

    // Wrap all uniform setters
    const uniformSetters = [
      'uniform1f', 'uniform2f', 'uniform3f', 'uniform4f',
      'uniform1i', 'uniform2i', 'uniform3i', 'uniform4i',
      'uniform1fv', 'uniform2fv', 'uniform3fv', 'uniform4fv',
      'uniform1iv', 'uniform2iv', 'uniform3iv', 'uniform4iv',
      'uniformMatrix2fv', 'uniformMatrix3fv', 'uniformMatrix4fv',
    ];

    uniformSetters.forEach(setter => {
      if (gl[setter]) {
        const original = gl[setter].bind(gl);
        gl[setter] = function(location, ...args) {
          const locMeta = uniformLocations.get(location);
          if (locMeta) {
            window.__webglCaptured.uniforms.push({
              program: locMeta.program,
              name: locMeta.name,
              setter: setter,
              values: args.map(a => a instanceof Float32Array || a instanceof Int32Array ? Array.from(a) : a),
              timestamp: Date.now(),
            });
          }
          return original(location, ...args);
        };
      }
    });

    // ============================================
    // BUFFER CAPTURE
    // ============================================

    const originalCreateBuffer = gl.createBuffer.bind(gl);
    gl.createBuffer = function() {
      const buffer = originalCreateBuffer();
      const id = bufferCounter++;
      capturedBuffers.set(buffer, { id, data: null, target: null });
      return buffer;
    };

    const originalBindBuffer = gl.bindBuffer.bind(gl);
    gl.bindBuffer = function(target, buffer) {
      if (buffer) {
        const meta = capturedBuffers.get(buffer);
        if (meta) meta.target = target;
      }
      return originalBindBuffer(target, buffer);
    };

    const originalBufferData = gl.bufferData.bind(gl);
    gl.bufferData = function(target, data, usage) {
      // Find which buffer is currently bound
      const boundBuffer = gl.getParameter(
        target === gl.ARRAY_BUFFER ? gl.ARRAY_BUFFER_BINDING : gl.ELEMENT_ARRAY_BUFFER_BINDING
      );
      const meta = boundBuffer ? capturedBuffers.get(boundBuffer) : null;

      let capturedData = null;
      if (data instanceof ArrayBuffer) {
        capturedData = { type: 'ArrayBuffer', data: Array.from(new Float32Array(data)) };
      } else if (ArrayBuffer.isView(data)) {
        capturedData = { type: data.constructor.name, data: Array.from(data) };
      } else if (typeof data === 'number') {
        capturedData = { type: 'size', size: data };
      }

      window.__webglCaptured.buffers.push({
        id: meta?.id,
        target: target === gl.ARRAY_BUFFER ? 'ARRAY_BUFFER' : 'ELEMENT_ARRAY_BUFFER',
        usage: usage,
        data: capturedData,
        timestamp: Date.now(),
      });

      return originalBufferData(target, data, usage);
    };

    // ============================================
    // TEXTURE CAPTURE
    // ============================================

    const originalCreateTexture = gl.createTexture.bind(gl);
    gl.createTexture = function() {
      const texture = originalCreateTexture();
      const id = textureCounter++;
      capturedTextures.set(texture, { id });
      return texture;
    };

    const originalTexImage2D = gl.texImage2D.bind(gl);
    gl.texImage2D = function(...args) {
      // Capture texture parameters
      const boundTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
      const meta = boundTexture ? capturedTextures.get(boundTexture) : null;

      let textureData = null;
      const lastArg = args[args.length - 1];
      if (lastArg instanceof HTMLImageElement) {
        textureData = { type: 'image', src: lastArg.src };
      } else if (lastArg instanceof HTMLCanvasElement) {
        textureData = { type: 'canvas', dataUrl: lastArg.toDataURL() };
      } else if (lastArg instanceof ImageData) {
        textureData = { type: 'imageData', width: lastArg.width, height: lastArg.height };
      }

      window.__webglCaptured.textures.push({
        id: meta?.id,
        args: args.slice(0, -1).map(a => typeof a === 'number' ? a : String(a)),
        data: textureData,
        timestamp: Date.now(),
      });

      return originalTexImage2D.apply(gl, args);
    };

    const originalTexParameteri = gl.texParameteri.bind(gl);
    gl.texParameteri = function(target, pname, param) {
      const boundTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
      const meta = boundTexture ? capturedTextures.get(boundTexture) : null;

      window.__webglCaptured.stateChanges.push({
        type: 'texParameteri',
        textureId: meta?.id,
        target, pname, param,
        timestamp: Date.now(),
      });

      return originalTexParameteri(target, pname, param);
    };

    // ============================================
    // DRAW CALL CAPTURE
    // ============================================

    const originalDrawArrays = gl.drawArrays.bind(gl);
    gl.drawArrays = function(mode, first, count) {
      window.__webglCaptured.drawCalls.push({
        type: 'drawArrays',
        mode, first, count,
        timestamp: Date.now(),
      });
      return originalDrawArrays(mode, first, count);
    };

    const originalDrawElements = gl.drawElements.bind(gl);
    gl.drawElements = function(mode, count, type, offset) {
      window.__webglCaptured.drawCalls.push({
        type: 'drawElements',
        mode, count, type, offset,
        timestamp: Date.now(),
      });
      return originalDrawElements(mode, count, type, offset);
    };

    // WebGL2 instanced drawing
    if (contextType === 'webgl2') {
      if (gl.drawArraysInstanced) {
        const originalDrawArraysInstanced = gl.drawArraysInstanced.bind(gl);
        gl.drawArraysInstanced = function(mode, first, count, instanceCount) {
          window.__webglCaptured.drawCalls.push({
            type: 'drawArraysInstanced',
            mode, first, count, instanceCount,
            timestamp: Date.now(),
          });
          return originalDrawArraysInstanced(mode, first, count, instanceCount);
        };
      }

      if (gl.drawElementsInstanced) {
        const originalDrawElementsInstanced = gl.drawElementsInstanced.bind(gl);
        gl.drawElementsInstanced = function(mode, count, type, offset, instanceCount) {
          window.__webglCaptured.drawCalls.push({
            type: 'drawElementsInstanced',
            mode, count, type, offset, instanceCount,
            timestamp: Date.now(),
          });
          return originalDrawElementsInstanced(mode, count, type, offset, instanceCount);
        };
      }
    }

    // ============================================
    // STATE CAPTURE
    // ============================================

    const stateSetters = [
      'enable', 'disable', 'blendFunc', 'blendFuncSeparate',
      'depthFunc', 'depthMask', 'cullFace', 'frontFace',
      'viewport', 'scissor', 'clearColor', 'clearDepth',
      'lineWidth', 'polygonOffset',
    ];

    stateSetters.forEach(fn => {
      if (gl[fn]) {
        const original = gl[fn].bind(gl);
        gl[fn] = function(...args) {
          window.__webglCaptured.stateChanges.push({
            type: fn,
            args: args,
            timestamp: Date.now(),
          });
          return original(...args);
        };
      }
    });

    const originalClear = gl.clear.bind(gl);
    gl.clear = function(mask) {
      window.__webglCaptured.drawCalls.push({
        type: 'clear',
        mask,
        timestamp: Date.now(),
      });
      return originalClear(mask);
    };

    return gl;
  }

  // Hook getContext to intercept WebGL context creation
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, options) {
    const ctx = originalGetContext.apply(this, arguments);
    if ((type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') && ctx) {
      wrapWebGLContext(ctx, type === 'webgl2' ? 'webgl2' : 'webgl');
    }
    return ctx;
  };

  console.log('[WebGL Extractor] Installed');
})();
`;
  },

  async extractData(page) {
    return await page.evaluate(() => window.__webglCaptured || {
      shaders: [],
      programs: [],
      uniforms: [],
      buffers: [],
      textures: [],
      drawCalls: [],
      stateChanges: [],
    });
  },

  generateReplayCode(data) {
    if (!data.shaders.length && !data.drawCalls.length) {
      return null;
    }

    const lines = [];
    lines.push('// WebGL Replay Code');
    lines.push('export function initWebGL(canvas) {');
    lines.push('  const gl = canvas.getContext("webgl") || canvas.getContext("webgl2");');
    lines.push('  if (!gl) return null;');
    lines.push('');

    // Generate shader code
    const vertexShaders = data.shaders.filter(s => s.type === 'vertex');
    const fragmentShaders = data.shaders.filter(s => s.type === 'fragment');

    if (vertexShaders.length || fragmentShaders.length) {
      lines.push('  // Shaders');
      vertexShaders.forEach((s, i) => {
        lines.push(`  const vertexShaderSource${i} = \`${s.source.replace(/`/g, '\\`')}\`;`);
      });
      fragmentShaders.forEach((s, i) => {
        lines.push(`  const fragmentShaderSource${i} = \`${s.source.replace(/`/g, '\\`')}\`;`);
      });
      lines.push('');
    }

    // Generate state setup
    if (data.stateChanges.length) {
      lines.push('  // State setup');
      const uniqueStates = new Map();
      data.stateChanges.forEach(s => {
        const key = `${s.type}-${JSON.stringify(s.args)}`;
        uniqueStates.set(key, s);
      });
      uniqueStates.forEach(s => {
        if (s.type !== 'texParameteri') {
          lines.push(`  gl.${s.type}(${s.args.join(', ')});`);
        }
      });
      lines.push('');
    }

    lines.push('  return gl;');
    lines.push('}');

    return lines.join('\n');
  },
};

export default webglExtractor;
