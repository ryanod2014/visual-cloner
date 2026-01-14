/**
 * WebGL Shader Runtime Template
 *
 * A standalone JavaScript file that initializes WebGL shaders from captured data.
 * This file is injected into extracted pages and only activates if the original
 * WebGL implementation fails to render.
 *
 * Template Variables:
 *   {{SHADER_DATA}} - Will be replaced with actual shader JSON data
 *
 * Features:
 *   - Non-invasive: Only initializes if original WebGL fails
 *   - Self-contained: No external dependencies
 *   - Canvas detection: Checks if canvas is already animating
 *   - Delayed activation: Waits for page load + 2 seconds
 *   - Full WebGL setup: Complete shader compilation and rendering
 */
(function() {
  'use strict';

  // SHADER_DATA will be replaced with actual shader JSON at injection time
  const SHADER_DATA = {{SHADER_DATA}};

  /**
   * Check if a canvas element is actively rendering/animating
   * Returns true if the canvas appears to have working WebGL rendering
   */
  function isCanvasAnimating(canvas) {
    if (!canvas) return false;

    // Check if canvas has a WebGL context
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
    if (!gl) return false;

    // Check if canvas has non-zero dimensions
    if (canvas.width === 0 || canvas.height === 0) return false;

    // Check if canvas has any pixel data (not blank)
    try {
      const pixels = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      // If all pixels are 0 (black/transparent), likely not rendering
      const hasContent = pixels.some(p => p !== 0);

      if (hasContent) {
        // Additional check: sample a few more pixels to be sure
        const sampleSize = 10;
        const samples = new Uint8Array(sampleSize * 4);
        gl.readPixels(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          sampleSize,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          samples
        );

        // Count non-zero values
        let nonZeroCount = 0;
        for (let i = 0; i < samples.length; i++) {
          if (samples[i] !== 0) nonZeroCount++;
        }

        // If more than 25% of sampled pixels have data, assume it's rendering
        return nonZeroCount > (samples.length * 0.25);
      }
    } catch (e) {
      // If we can't read pixels, assume it might be working
      console.log('[Shader Runtime] Cannot read canvas pixels:', e.message);
      return false;
    }

    return false;
  }

  /**
   * Create and compile a WebGL shader
   */
  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      console.error('[Shader Runtime] Shader compilation error:', error);
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * Parse uniform declarations from shader source code
   */
  function parseUniforms(source) {
    const uniforms = [];
    const regex = /uniform\s+(float|int|vec2|vec3|vec4|mat3|mat4|sampler2D)\s+(\w+)/g;
    let match;

    while ((match = regex.exec(source)) !== null) {
      uniforms.push({
        type: match[1],
        name: match[2]
      });
    }

    return uniforms;
  }

  /**
   * Initialize WebGL with captured shader data
   */
  function initializeWebGL(canvas, shaderData) {
    console.log('[Shader Runtime] Initializing WebGL...');

    // Validate shader data
    if (!shaderData || !shaderData.shaders || shaderData.shaders.length === 0) {
      console.error('[Shader Runtime] No shader data provided');
      return false;
    }

    // Find vertex and fragment shaders
    const vertexShader = shaderData.shaders.find(s => s.type === 'vertex');
    const fragmentShader = shaderData.shaders.find(s => s.type === 'fragment');

    if (!vertexShader || !fragmentShader) {
      console.error('[Shader Runtime] Missing shader pair (need both vertex and fragment)');
      return false;
    }

    console.log('[Shader Runtime] Found vertex shader:', vertexShader.source.length, 'chars');
    console.log('[Shader Runtime] Found fragment shader:', fragmentShader.source.length, 'chars');

    // Create WebGL context
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
    if (!gl) {
      console.error('[Shader Runtime] Failed to get WebGL context');
      return false;
    }

    // Compile shaders
    const vs = createShader(gl, gl.VERTEX_SHADER, vertexShader.source);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentShader.source);

    if (!vs || !fs) {
      console.error('[Shader Runtime] Failed to compile shaders');
      return false;
    }

    // Create and link program
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      console.error('[Shader Runtime] Program linking error:', error);
      return false;
    }

    console.log('[Shader Runtime] Shaders compiled and linked successfully');

    // Create mesh grid (high-density for smooth gradients)
    const density = 100;
    const positions = [];
    const uvs = [];
    const uvNorms = [];
    const indices = [];

    // Generate vertices
    for (let y = 0; y <= density; y++) {
      for (let x = 0; x <= density; x++) {
        const u = x / density;
        const v = y / density;

        // Position (centered on canvas)
        positions.push(
          (u - 0.5) * canvas.width,
          (v - 0.5) * canvas.height,
          0
        );

        // UV coordinates (0-1)
        uvs.push(u, v);

        // UV normalized (-1 to 1)
        uvNorms.push(u * 2 - 1, v * 2 - 1);
      }
    }

    // Generate triangle indices
    for (let y = 0; y < density; y++) {
      for (let x = 0; x < density; x++) {
        const i = y * (density + 1) + x;
        // Two triangles per quad
        indices.push(
          i, i + 1, i + density + 1,
          i + 1, i + density + 2, i + density + 1
        );
      }
    }

    // Create buffers
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);

    const uvNormBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvNormBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvNorms), gl.STATIC_DRAW);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    // Get attribute locations
    const posLoc = gl.getAttribLocation(program, 'position');
    const uvLoc = gl.getAttribLocation(program, 'uv');
    const uvNormLoc = gl.getAttribLocation(program, 'uvNorm');

    // Parse and get all uniform locations
    const vUniforms = parseUniforms(vertexShader.source);
    const fUniforms = parseUniforms(fragmentShader.source);
    const allUniforms = [...vUniforms, ...fUniforms];
    const uniqueUniformNames = [...new Set(allUniforms.map(u => u.name))];

    const uniforms = {};
    uniqueUniformNames.forEach(name => {
      uniforms[name] = gl.getUniformLocation(program, name);
    });

    console.log('[Shader Runtime] Found', uniqueUniformNames.length, 'unique uniforms');

    // Handle canvas resize
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    window.addEventListener('resize', resize);
    resize();

    // Render loop
    const startTime = performance.now();

    function render() {
      const time = (performance.now() - startTime) / 1000;

      // Clear canvas
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);

      // Set standard uniforms
      if (uniforms.u_time) gl.uniform1f(uniforms.u_time, time);
      if (uniforms.time) gl.uniform1f(uniforms.time, time);
      if (uniforms.resolution) gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      if (uniforms.u_resolution) gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
      if (uniforms.aspectRatio) gl.uniform1f(uniforms.aspectRatio, canvas.width / canvas.height);

      // Matrix uniforms (identity matrices)
      if (uniforms.projectionMatrix) {
        const identityMatrix = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
        gl.uniformMatrix4fv(uniforms.projectionMatrix, false, identityMatrix);
      }
      if (uniforms.modelViewMatrix) {
        const identityMatrix = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
        gl.uniformMatrix4fv(uniforms.modelViewMatrix, false, identityMatrix);
      }

      // Stripe-specific gradient uniforms
      if (uniforms.u_shadow_power) gl.uniform1f(uniforms.u_shadow_power, 0.25);
      if (uniforms.u_darken_top) gl.uniform1f(uniforms.u_darken_top, 1.0);
      if (uniforms.u_active_colors) gl.uniform4f(uniforms.u_active_colors, 1.0, 1.0, 1.0, 1.0);
      if (uniforms.u_baseColor) gl.uniform3f(uniforms.u_baseColor, 0.0, 0.15, 0.4);

      // u_global struct (global noise settings)
      const globalNoiseFreq = gl.getUniformLocation(program, 'u_global.noiseFreq');
      const globalNoiseSpeed = gl.getUniformLocation(program, 'u_global.noiseSpeed');
      if (globalNoiseFreq) gl.uniform2f(globalNoiseFreq, 0.003, 0.003);
      if (globalNoiseSpeed) gl.uniform1f(globalNoiseSpeed, 0.5);

      // u_vertDeform struct (vertex deformation)
      const vdIncline = gl.getUniformLocation(program, 'u_vertDeform.incline');
      const vdOffsetTop = gl.getUniformLocation(program, 'u_vertDeform.offsetTop');
      const vdOffsetBottom = gl.getUniformLocation(program, 'u_vertDeform.offsetBottom');
      const vdNoiseFreq = gl.getUniformLocation(program, 'u_vertDeform.noiseFreq');
      const vdNoiseAmp = gl.getUniformLocation(program, 'u_vertDeform.noiseAmp');
      const vdNoiseSpeed = gl.getUniformLocation(program, 'u_vertDeform.noiseSpeed');
      const vdNoiseFlow = gl.getUniformLocation(program, 'u_vertDeform.noiseFlow');
      const vdNoiseSeed = gl.getUniformLocation(program, 'u_vertDeform.noiseSeed');

      if (vdIncline) gl.uniform1f(vdIncline, 0.5);
      if (vdOffsetTop) gl.uniform1f(vdOffsetTop, 0.5);
      if (vdOffsetBottom) gl.uniform1f(vdOffsetBottom, 0.0);
      if (vdNoiseFreq) gl.uniform2f(vdNoiseFreq, 0.002, 0.002);
      if (vdNoiseAmp) gl.uniform1f(vdNoiseAmp, 400.0);
      if (vdNoiseSpeed) gl.uniform1f(vdNoiseSpeed, 0.5);
      if (vdNoiseFlow) gl.uniform1f(vdNoiseFlow, 0.2);
      if (vdNoiseSeed) gl.uniform1f(vdNoiseSeed, 10.0);

      // u_waveLayers array (color wave layers - 3 layers for gradient)
      for (let i = 0; i < 3; i++) {
        const color = gl.getUniformLocation(program, `u_waveLayers[${i}].color`);
        const noiseFreq = gl.getUniformLocation(program, `u_waveLayers[${i}].noiseFreq`);
        const noiseSpeed = gl.getUniformLocation(program, `u_waveLayers[${i}].noiseSpeed`);
        const noiseFlow = gl.getUniformLocation(program, `u_waveLayers[${i}].noiseFlow`);
        const noiseSeed = gl.getUniformLocation(program, `u_waveLayers[${i}].noiseSeed`);
        const noiseFloor = gl.getUniformLocation(program, `u_waveLayers[${i}].noiseFloor`);
        const noiseCeil = gl.getUniformLocation(program, `u_waveLayers[${i}].noiseCeil`);

        // Stripe-style gradient colors (purple-blue spectrum)
        const colors = [
          [0.4, 0.2, 0.7],  // Purple
          [0.2, 0.4, 0.8],  // Blue
          [0.6, 0.3, 0.8]   // Magenta
        ];

        if (color) gl.uniform3f(color, ...colors[i]);
        if (noiseFreq) gl.uniform2f(noiseFreq, 0.003, 0.003);
        if (noiseSpeed) gl.uniform1f(noiseSpeed, 0.3 + i * 0.1);
        if (noiseFlow) gl.uniform1f(noiseFlow, 0.1 + i * 0.05);
        if (noiseSeed) gl.uniform1f(noiseSeed, 10.0 + i * 5.0);
        if (noiseFloor) gl.uniform1f(noiseFloor, 0.1);
        if (noiseCeil) gl.uniform1f(noiseCeil, 0.6 + i * 0.1);
      }

      // Bind vertex attributes
      if (posLoc >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
      }

      if (uvLoc >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
        gl.enableVertexAttribArray(uvLoc);
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
      }

      if (uvNormLoc >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, uvNormBuffer);
        gl.enableVertexAttribArray(uvNormLoc);
        gl.vertexAttribPointer(uvNormLoc, 2, gl.FLOAT, false, 0, 0);
      }

      // Draw the mesh
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);

      // Continue animation loop
      requestAnimationFrame(render);
    }

    // Start rendering
    render();
    console.log('[Shader Runtime] WebGL rendering started');
    return true;
  }

  /**
   * Attempt to initialize the shader runtime
   * Only proceeds if canvas exists and original WebGL is not working
   */
  function attemptInitialization() {
    console.log('[Shader Runtime] Checking for canvas...');

    // Find canvas element
    const canvas = document.querySelector('.Gradient__canvas') ||
                   document.querySelector('canvas[data-gradient]') ||
                   document.querySelector('canvas');

    if (!canvas) {
      console.log('[Shader Runtime] No canvas element found');
      return;
    }

    console.log('[Shader Runtime] Canvas found:', canvas.className || 'unnamed');

    // Check if original WebGL is already working
    if (isCanvasAnimating(canvas)) {
      console.log('[Shader Runtime] Original WebGL is working, skipping initialization');
      return;
    }

    console.log('[Shader Runtime] Original WebGL not detected, initializing extracted shaders');

    // Initialize WebGL with captured shader data
    const success = initializeWebGL(canvas, SHADER_DATA);

    if (success) {
      console.log('[Shader Runtime] Successfully initialized extracted shaders');
    } else {
      console.error('[Shader Runtime] Failed to initialize extracted shaders');
    }
  }

  /**
   * Wait for page to load, then attempt initialization after delay
   * The delay allows original scripts to initialize first
   */
  if (document.readyState === 'complete') {
    // Page already loaded, wait 2 seconds then try
    setTimeout(attemptInitialization, 2000);
  } else {
    // Wait for page load, then wait additional 2 seconds
    window.addEventListener('load', function() {
      setTimeout(attemptInitialization, 2000);
    });
  }

  console.log('[Shader Runtime] Template loaded, waiting for initialization...');
})();
