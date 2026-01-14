import fs from 'fs';
import path from 'path';

/**
 * V7 WebGL Shader Renderer Injector
 *
 * Injects a custom WebGL shader renderer into extracted pages.
 * Uses shaders captured during V7 extraction (from shaders.json).
 *
 * Usage:
 *   node tools/inject-shader-renderer.js <extraction-dir>
 *
 * Example:
 *   node tools/inject-shader-renderer.js output/stripe-final/stripe.com-1768261075132
 */

if (process.argv.length < 3) {
  console.log('Usage: node tools/inject-shader-renderer.js <extraction-dir>');
  console.log('Example: node tools/inject-shader-renderer.js output/stripe/stripe.com-123456');
  process.exit(1);
}

const extractionDir = process.argv[2];

// Check if extraction directory exists
if (!fs.existsSync(extractionDir)) {
  console.error(`❌ Extraction directory not found: ${extractionDir}`);
  process.exit(1);
}

// Read shaders.json
const shadersPath = path.join(extractionDir, 'shaders.json');
if (!fs.existsSync(shadersPath)) {
  console.error(`❌ shaders.json not found in ${extractionDir}`);
  console.error('   Make sure you ran V7 extraction first.');
  process.exit(1);
}

const shaderData = JSON.parse(fs.readFileSync(shadersPath, 'utf8'));

if (shaderData.shaders.length === 0) {
  console.log('ℹ️  No shaders found in shaders.json - nothing to inject');
  process.exit(0);
}

// Find vertex and fragment shaders
const vertexShader = shaderData.shaders.find(s => s.type === 'vertex');
const fragmentShader = shaderData.shaders.find(s => s.type === 'fragment');

if (!vertexShader || !fragmentShader) {
  console.error(`❌ Missing shader pair (need both vertex and fragment)`);
  console.error(`   Found: ${shaderData.shaders.map(s => s.type).join(', ')}`);
  process.exit(1);
}

console.log(`🎨 Injecting WebGL shader renderer...`);
console.log(`   Vertex shader: ${vertexShader.source.length} chars`);
console.log(`   Fragment shader: ${fragmentShader.source.length} chars\n`);

// Read index.html
const htmlPath = path.join(extractionDir, 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.error(`❌ index.html not found in ${extractionDir}`);
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');

// Check if already injected
if (html.includes('V7 Extracted WebGL Shader Renderer')) {
  console.log('ℹ️  Shader renderer already injected - skipping');
  process.exit(0);
}

// Parse uniforms from shaders
const parseUniforms = (source) => {
  const uniforms = [];
  const regex = /uniform\s+(float|int|vec2|vec3|vec4|mat3|mat4|sampler2D)\s+(\w+)/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    uniforms.push({ type: match[1], name: match[2] });
  }
  return uniforms;
};

const vUniforms = parseUniforms(vertexShader.source);
const fUniforms = parseUniforms(fragmentShader.source);
const allUniforms = [...vUniforms, ...fUniforms];
const uniqueUniformNames = [...new Set(allUniforms.map(u => u.name))];

console.log(`📊 Found ${uniqueUniformNames.length} unique uniforms`);

// Generate shader renderer script
const shaderRendererScript = `
<script>
// V7 Extracted WebGL Shader Renderer
(function() {
  const canvas = document.querySelector('.Gradient__canvas') || document.querySelector('canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
  if (!gl) return;

  const vertexSource = ${JSON.stringify(vertexShader.source)};
  const fragmentSource = ${JSON.stringify(fragmentShader.source)};

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  const vs = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vs || !fs) return;

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program error:', gl.getProgramInfoLog(program));
    return;
  }

  // Create mesh grid
  const density = 100;
  const positions = [], uvs = [], uvNorms = [], indices = [];

  for (let y = 0; y <= density; y++) {
    for (let x = 0; x <= density; x++) {
      const u = x / density, v = y / density;
      positions.push((u - 0.5) * canvas.width, (v - 0.5) * canvas.height, 0);
      uvs.push(u, v);
      uvNorms.push(u * 2 - 1, v * 2 - 1);
    }
  }

  for (let y = 0; y < density; y++) {
    for (let x = 0; x < density; x++) {
      const i = y * (density + 1) + x;
      indices.push(i, i + 1, i + density + 1, i + 1, i + density + 2, i + density + 1);
    }
  }

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

  // Get locations
  const posLoc = gl.getAttribLocation(program, 'position');
  const uvLoc = gl.getAttribLocation(program, 'uv');
  const uvNormLoc = gl.getAttribLocation(program, 'uvNorm');

  // Get all uniform locations dynamically
  const uniforms = {};
  const uniformNames = ${JSON.stringify(uniqueUniformNames)};
  uniformNames.forEach(name => {
    uniforms[name] = gl.getUniformLocation(program, name);
  });

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  const start = performance.now();
  function render() {
    const time = (performance.now() - start) / 1000;

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);

    // Set uniforms (Stripe-style gradient defaults)
    if (uniforms.u_time) gl.uniform1f(uniforms.u_time, time);
    if (uniforms.time) gl.uniform1f(uniforms.time, time);
    if (uniforms.resolution) gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    if (uniforms.u_resolution) gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
    if (uniforms.aspectRatio) gl.uniform1f(uniforms.aspectRatio, canvas.width / canvas.height);

    // Matrix uniforms
    if (uniforms.projectionMatrix) {
      const pm = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
      gl.uniformMatrix4fv(uniforms.projectionMatrix, false, pm);
    }
    if (uniforms.modelViewMatrix) {
      const mvm = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
      gl.uniformMatrix4fv(uniforms.modelViewMatrix, false, mvm);
    }

    // Stripe-specific uniforms
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

    // u_waveLayers array (color wave layers)
    for (let i = 0; i < 3; i++) {
      const color = gl.getUniformLocation(program, \`u_waveLayers[\${i}].color\`);
      const noiseFreq = gl.getUniformLocation(program, \`u_waveLayers[\${i}].noiseFreq\`);
      const noiseSpeed = gl.getUniformLocation(program, \`u_waveLayers[\${i}].noiseSpeed\`);
      const noiseFlow = gl.getUniformLocation(program, \`u_waveLayers[\${i}].noiseFlow\`);
      const noiseSeed = gl.getUniformLocation(program, \`u_waveLayers[\${i}].noiseSeed\`);
      const noiseFloor = gl.getUniformLocation(program, \`u_waveLayers[\${i}].noiseFloor\`);
      const noiseCeil = gl.getUniformLocation(program, \`u_waveLayers[\${i}].noiseCeil\`);

      // Different colors for each layer (purple-ish gradient)
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

    // Bind attributes
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

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);

    requestAnimationFrame(render);
  }
  render();
})();
</script>`;

// Inject before closing </body>
html = html.replace('</body>', shaderRendererScript + '\n</body>');

// Back up original HTML
const backupPath = htmlPath + '.backup';
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, fs.readFileSync(htmlPath));
  console.log(`💾 Backed up original to index.html.backup`);
}

// Save modified HTML
fs.writeFileSync(htmlPath, html);

console.log(`✅ Injected WebGL shader renderer`);
console.log(`   Output: ${htmlPath}`);
console.log(`\n💡 TIP: Serve the extraction directory and test:`);
console.log(`   cd ${extractionDir} && python3 -m http.server 8080`);
