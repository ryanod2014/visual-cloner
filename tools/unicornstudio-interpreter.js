/**
 * UnicornStudio Interpreter
 *
 * Renders UnicornStudio JSON format with editable parameters.
 * Supports: beam, blur, noise, diffuse, replicate, gradient effects
 */

export class UnicornStudioInterpreter {
  constructor(canvas, config = {}) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2');
    if (!this.gl) throw new Error('WebGL2 not supported');

    this.config = {
      dpi: config.dpi || 1.5,
      fps: config.fps || 60,
      ...config
    };

    this.layers = [];
    this.programs = new Map();
    this.framebuffers = [];
    this.textures = [];
    this.startTime = Date.now();
    this.mousePos = [0.5, 0.5];
    this.animating = true;

    // Editable parameters (will be injected into shaders)
    this.params = {
      // Beam/glow colors
      beamColor: [0.27, 0.60, 1.0],
      ringColor: [0.0, 0.51, 0.97],

      // Glow settings
      innerGlowThickness: 0.02,
      outerGlowThickness: 0.08,

      // Ring settings
      ringScale: 2.238,
      ringWidth: 0.5,

      // Blur
      blurAmount: 0.47,

      // Noise
      noiseAmount: 0.1,
      noiseScale: 12.0,
      noiseSpeed: 0.37,

      // Animation
      speed: 1.0,
    };

    this._setupCanvas();
    this._setupMouseTracking();
  }

  _setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr * this.config.dpi;
    this.canvas.height = rect.height * dpr * this.config.dpi;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  _setupMouseTracking() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mousePos = [
        e.clientX / rect.width,
        1 - (e.clientY / rect.height)
      ];
    });
  }

  /**
   * Load UnicornStudio JSON data
   */
  async load(data) {
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }

    this.projectData = data;
    this.layers = data.history || [];

    // Extract editable parameters from shaders
    this._extractParameters();

    // Compile all shaders
    await this._compileShaders();

    // Setup framebuffers for multi-pass rendering
    this._setupFramebuffers();

    return this;
  }

  /**
   * Extract editable parameters from shader code
   */
  _extractParameters() {
    for (const layer of this.layers) {
      if (!layer.compiledFragmentShaders) continue;

      for (const shader of layer.compiledFragmentShaders) {
        // Extract beam colors
        const beamColorMatch = shader.match(/vec3\(([\d.]+),\s*([\d.]+),\s*([\d.]+)\)\s*;\s*}\s*vec3\s+getBeam/);
        if (beamColorMatch) {
          // Found in drawViewportEdges
        }

        // Extract glow thickness
        const glowMatch = shader.match(/glowThickness\s*=\s*([\d.]+)/);
        if (glowMatch) {
          const thickness = parseFloat(glowMatch[1]);
          if (thickness < 0.05) {
            this.params.innerGlowThickness = thickness;
          } else {
            this.params.outerGlowThickness = thickness;
          }
        }

        // Extract ring scale
        const ringScaleMatch = shader.match(/drawExpandingRings\(uv,\s*pos,\s*([\d.]+)/);
        if (ringScaleMatch) {
          this.params.ringScale = parseFloat(ringScaleMatch[1]);
        }

        // Extract blur amount
        const blurMatch = shader.match(/\(([\d.]+)\s*\*\s*amt\)\s*\*\s*ease/);
        if (blurMatch) {
          this.params.blurAmount = parseFloat(blurMatch[1]);
        }
      }
    }
  }

  /**
   * Inject parameters into shader source
   */
  _injectParameters(shaderSource) {
    let modified = shaderSource;

    // Inject beam color
    const beamColorStr = `vec3(${this.params.beamColor[0].toFixed(4)}, ${this.params.beamColor[1].toFixed(4)}, ${this.params.beamColor[2].toFixed(4)})`;
    modified = modified.replace(
      /vec3\(0\.27058823529411763,\s*0\.6039215686274509,\s*1\)/g,
      beamColorStr
    );

    // Inject ring color
    const ringColorStr = `vec3(${this.params.ringColor[0].toFixed(4)}, ${this.params.ringColor[1].toFixed(4)}, ${this.params.ringColor[2].toFixed(4)})`;
    modified = modified.replace(
      /vec3\(0,\s*0\.5058823529411764,\s*0\.9686274509803922\)/g,
      ringColorStr
    );

    // Inject glow thickness (inner ~0.02, outer ~0.08)
    modified = modified.replace(
      /glowThickness\s*=\s*0\.0200\s*\*/g,
      `glowThickness = ${this.params.innerGlowThickness.toFixed(4)} *`
    );
    modified = modified.replace(
      /glowThickness\s*=\s*0\.0800\s*\*/g,
      `glowThickness = ${this.params.outerGlowThickness.toFixed(4)} *`
    );

    // Inject ring scale
    modified = modified.replace(
      /drawExpandingRings\(uv,\s*pos,\s*2\.2380/g,
      `drawExpandingRings(uv, pos, ${this.params.ringScale.toFixed(4)}`
    );

    // Inject blur amount
    modified = modified.replace(
      /\(0\.4700\s*\*\s*amt\)/g,
      `(${this.params.blurAmount.toFixed(4)} * amt)`
    );

    return modified;
  }

  /**
   * Compile shaders for all layers
   */
  async _compileShaders() {
    const gl = this.gl;

    for (const layer of this.layers) {
      if (!layer.compiledFragmentShaders || !layer.compiledVertexShaders) continue;
      if (!layer.visible) continue;

      const programs = [];

      for (let i = 0; i < layer.compiledFragmentShaders.length; i++) {
        const fragSource = this._injectParameters(layer.compiledFragmentShaders[i]);
        const vertSource = layer.compiledVertexShaders[Math.min(i, layer.compiledVertexShaders.length - 1)];

        const program = this._createProgram(vertSource, fragSource);
        if (program) {
          programs.push({
            program,
            uniforms: this._getUniformLocations(program)
          });
        }
      }

      this.programs.set(layer.id, programs);
    }
  }

  _createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      console.error('Source:', source.substring(0, 500));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  _createProgram(vertSource, fragSource) {
    const gl = this.gl;
    const vertShader = this._createShader(gl.VERTEX_SHADER, vertSource);
    const fragShader = this._createShader(gl.FRAGMENT_SHADER, fragSource);

    if (!vertShader || !fragShader) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    return program;
  }

  _getUniformLocations(program) {
    const gl = this.gl;
    return {
      uTime: gl.getUniformLocation(program, 'uTime'),
      uMousePos: gl.getUniformLocation(program, 'uMousePos'),
      uResolution: gl.getUniformLocation(program, 'uResolution'),
      uTexture: gl.getUniformLocation(program, 'uTexture'),
      uBgTexture: gl.getUniformLocation(program, 'uBgTexture'),
      uSampleBg: gl.getUniformLocation(program, 'uSampleBg'),
      uMVMatrix: gl.getUniformLocation(program, 'uMVMatrix'),
      uPMatrix: gl.getUniformLocation(program, 'uPMatrix'),
      uTextureMatrix: gl.getUniformLocation(program, 'uTextureMatrix'),
      uPos: gl.getUniformLocation(program, 'uPos'),
    };
  }

  _setupFramebuffers() {
    const gl = this.gl;

    // Create framebuffers for ping-pong rendering
    for (let i = 0; i < 4; i++) {
      const fb = gl.createFramebuffer();
      const tex = gl.createTexture();

      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

      this.framebuffers.push(fb);
      this.textures.push(tex);
    }

    // Create fullscreen quad
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 0, 0, 0,
       1, -1, 0, 1, 0,
      -1,  1, 0, 0, 1,
       1,  1, 0, 1, 1,
    ]), gl.STATIC_DRAW);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Update parameter and recompile affected shaders
   */
  setParam(name, value) {
    if (this.params[name] !== undefined) {
      this.params[name] = value;
      // Recompile shaders with new parameters
      this._compileShaders();
    }
  }

  /**
   * Get current parameters
   */
  getParams() {
    return { ...this.params };
  }

  /**
   * Start animation loop
   */
  start() {
    this.animating = true;
    this._render();
  }

  /**
   * Stop animation
   */
  stop() {
    this.animating = false;
  }

  /**
   * Main render function
   */
  _render() {
    if (!this.animating) return;

    const gl = this.gl;
    const time = ((Date.now() - this.startTime) / 1000) * this.params.speed;

    // Clear
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    let currentFB = 0;
    let currentTexture = null;

    // Render each visible layer
    for (const layer of this.layers) {
      if (!layer.visible) continue;

      const programs = this.programs.get(layer.id);
      if (!programs || programs.length === 0) continue;

      // Render each pass for this layer
      for (let passIdx = 0; passIdx < programs.length; passIdx++) {
        const { program, uniforms } = programs[passIdx];
        const isLastPass = passIdx === programs.length - 1;
        const isLastLayer = layer === this.layers[this.layers.length - 1];

        // Bind framebuffer (or screen for final pass)
        if (isLastPass && isLastLayer) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        } else {
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[currentFB]);
        }

        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.useProgram(program);

        // Set uniforms
        if (uniforms.uTime) gl.uniform1f(uniforms.uTime, time);
        if (uniforms.uMousePos) gl.uniform2fv(uniforms.uMousePos, this.mousePos);
        if (uniforms.uResolution) gl.uniform2f(uniforms.uResolution, this.canvas.width, this.canvas.height);
        if (uniforms.uPos) gl.uniform2f(uniforms.uPos, 0.5, 0.5);
        if (uniforms.uSampleBg) gl.uniform1i(uniforms.uSampleBg, currentTexture ? 1 : 0);

        // Bind previous texture
        if (currentTexture && uniforms.uTexture) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, currentTexture);
          gl.uniform1i(uniforms.uTexture, 0);
        }

        // Set matrix uniforms (identity for fullscreen quad)
        if (uniforms.uMVMatrix) {
          gl.uniformMatrix4fv(uniforms.uMVMatrix, false, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
        }
        if (uniforms.uPMatrix) {
          gl.uniformMatrix4fv(uniforms.uPMatrix, false, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
        }
        if (uniforms.uTextureMatrix) {
          gl.uniformMatrix4fv(uniforms.uTextureMatrix, false, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
        }

        // Draw fullscreen quad
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);

        const posLoc = gl.getAttribLocation(program, 'aVertexPosition');
        const texLoc = gl.getAttribLocation(program, 'aTextureCoord');

        if (posLoc >= 0) {
          gl.enableVertexAttribArray(posLoc);
          gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 20, 0);
        }
        if (texLoc >= 0) {
          gl.enableVertexAttribArray(texLoc);
          gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 20, 12);
        }

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Swap framebuffers
        if (!isLastPass || !isLastLayer) {
          currentTexture = this.textures[currentFB];
          currentFB = (currentFB + 1) % this.framebuffers.length;
        }
      }
    }

    requestAnimationFrame(() => this._render());
  }

  /**
   * Export current configuration
   */
  exportConfig() {
    return {
      params: { ...this.params },
      projectId: this.projectData?.id,
      version: this.projectData?.version
    };
  }
}

export default UnicornStudioInterpreter;
