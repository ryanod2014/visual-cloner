#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

/**
 * Post-Processing Tool: Enable Shader Support
 *
 * Adds WebGL shader rendering to already-extracted pages.
 * Reads shader data from shaders.json and injects a runtime renderer.
 *
 * Usage:
 *   node tools/enable-shaders.js <extraction-dir>
 *
 * Example:
 *   node tools/enable-shaders.js output/stripe/stripe.com-1768261639764
 *
 * Features:
 *   - Non-destructive (backs up original HTML)
 *   - Reversible (can restore from backup)
 *   - Idempotent (won't double-inject)
 *   - Validates shader data structure
 */

// CLI validation
const arg = process.argv[2];

if (!arg || arg === '--help' || arg === '-h') {
  console.log('Enable Shader Support - Post-processing tool for V7 extractions\n');
  console.log('Usage: node tools/enable-shaders.js <extraction-dir>');
  console.log('\nArguments:');
  console.log('  <extraction-dir>    Path to V7 extraction directory');
  console.log('\nExample:');
  console.log('  node tools/enable-shaders.js output/stripe/stripe.com-1768261639764');
  console.log('\nDescription:');
  console.log('  Reads shaders.json from extraction directory and injects a WebGL');
  console.log('  runtime renderer into index.html. Creates backup before modification.');
  console.log('\nOptions:');
  console.log('  --help, -h    Show this help message\n');
  process.exit(arg ? 0 : 1);
}

const extractionDir = path.resolve(arg);

console.log('🎨 Enabling shader support...');
console.log(`   Extraction: ${extractionDir}\n`);

// Step 1: Validate extraction directory
if (!fs.existsSync(extractionDir)) {
  console.error(`❌ Extraction directory not found: ${extractionDir}`);
  process.exit(1);
}

if (!fs.statSync(extractionDir).isDirectory()) {
  console.error(`❌ Path is not a directory: ${extractionDir}`);
  process.exit(1);
}

// Step 2: Check for shaders.json
const shadersPath = path.join(extractionDir, 'shaders.json');
if (!fs.existsSync(shadersPath)) {
  console.error(`❌ shaders.json not found in extraction directory`);
  console.error(`   Expected: ${shadersPath}`);
  console.error('\n💡 Make sure you ran V7 extraction with shader capture enabled.');
  process.exit(1);
}

// Step 3: Load and validate shader data
let shaderData;
try {
  shaderData = JSON.parse(fs.readFileSync(shadersPath, 'utf8'));
} catch (err) {
  console.error(`❌ Failed to parse shaders.json: ${err.message}`);
  process.exit(1);
}

if (!shaderData.shaders || !Array.isArray(shaderData.shaders)) {
  console.error(`❌ Invalid shaders.json structure (missing shaders array)`);
  process.exit(1);
}

if (shaderData.shaders.length === 0) {
  console.log('ℹ️  No shaders found in shaders.json - nothing to inject');
  console.log('   The page may not use WebGL shaders.\n');
  process.exit(0);
}

console.log(`   Found ${shaderData.shaders.length} shaders`);

// Step 4: Find vertex and fragment shader pair
const vertexShader = shaderData.shaders.find(s => s.type === 'vertex');
const fragmentShader = shaderData.shaders.find(s => s.type === 'fragment');

if (!vertexShader || !fragmentShader) {
  console.error(`❌ Missing shader pair (need both vertex and fragment)`);
  console.error(`   Found: ${shaderData.shaders.map(s => s.type).join(', ')}`);
  console.error('\n💡 Shader runtime requires at least one vertex and one fragment shader.');
  process.exit(1);
}

console.log(`   Vertex shader: ${vertexShader.source.length} chars`);
console.log(`   Fragment shader: ${fragmentShader.source.length} chars\n`);

// Step 5: Load index.html
const htmlPath = path.join(extractionDir, 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.error(`❌ index.html not found in extraction directory`);
  console.error(`   Expected: ${htmlPath}`);
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');

// Step 6: Check if already enabled
const SHADER_MARKER = '<!-- SHADER-RUNTIME-INJECTED -->';
if (html.includes(SHADER_MARKER)) {
  console.log('ℹ️  Shader support already enabled - skipping injection');
  console.log('   (Found shader runtime marker in HTML)\n');
  console.log('💡 To re-inject, restore from backup first:');
  console.log(`   cp ${htmlPath}.original ${htmlPath}`);
  console.log(`   node tools/enable-shaders.js ${extractionDir}\n`);
  process.exit(0);
}

// Step 7: Parse uniforms from shader sources
const parseUniforms = (source) => {
  const uniforms = [];
  const regex = /uniform\s+(float|int|bool|vec2|vec3|vec4|mat3|mat4|sampler2D|sampler2DArray)\s+(\w+)/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    uniforms.push({ type: match[1], name: match[2] });
  }
  return uniforms;
};

const vUniforms = parseUniforms(vertexShader.source);
const fUniforms = parseUniforms(fragmentShader.source);

// Combine and deduplicate uniforms by name
const uniformMap = new Map();
[...vUniforms, ...fUniforms].forEach(u => {
  if (!uniformMap.has(u.name)) {
    uniformMap.set(u.name, u);
  }
});

const uniqueUniforms = Array.from(uniformMap.values());
console.log(`   Parsed ${uniqueUniforms.length} unique uniforms\n`);

// Step 8: Generate shader runtime script
const shaderRuntimeScript = `
${SHADER_MARKER}
<script>
/**
 * WebGL Shader Runtime
 * Auto-generated by tools/enable-shaders.js
 *
 * Renders shaders extracted from the original page.
 * This script recreates the WebGL rendering pipeline using
 * the captured vertex and fragment shaders.
 */
(function initShaderRuntime() {
  'use strict';

  // Configuration
  const SHADER_DATA = ${JSON.stringify({ vertexShader, fragmentShader, meta: shaderData.meta }, null, 2)};
  const CANVAS_SELECTORS = [
    '.Gradient__canvas',
    'canvas[class*="gradient"]',
    'canvas[class*="shader"]',
    'canvas'
  ];

  // Find target canvas
  let canvas = null;
  for (const selector of CANVAS_SELECTORS) {
    canvas = document.querySelector(selector);
    if (canvas) break;
  }

  if (!canvas) {
    console.warn('[Shader Runtime] No canvas element found');
    return;
  }

  console.log('[Shader Runtime] Found canvas:', canvas);

  // Get WebGL context (prefer WebGL2 if available)
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) {
    console.error('[Shader Runtime] WebGL not available');
    return;
  }

  const isWebGL2 = gl instanceof WebGL2RenderingContext;
  console.log('[Shader Runtime] Using', isWebGL2 ? 'WebGL2' : 'WebGL1');

  // Compile shader
  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      console.error('[Shader Runtime] Compilation error:', info);
      console.error('Source:', source.split('\\n').map((line, i) => \`\${i + 1}: \${line}\`).join('\\n'));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  // Create shader program
  const vertexShader = compileShader(gl.VERTEX_SHADER, SHADER_DATA.vertexShader.source);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, SHADER_DATA.fragmentShader.source);

  if (!vertexShader || !fragmentShader) {
    console.error('[Shader Runtime] Failed to compile shaders');
    return;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    console.error('[Shader Runtime] Program link error:', info);
    return;
  }

  console.log('[Shader Runtime] Shader program compiled successfully');

  // Create mesh geometry (dense grid for smooth animation)
  const MESH_DENSITY = 100;
  const positions = [];
  const uvs = [];
  const uvNorms = [];
  const indices = [];
  const rndIds = [];

  for (let y = 0; y <= MESH_DENSITY; y++) {
    for (let x = 0; x <= MESH_DENSITY; x++) {
      const u = x / MESH_DENSITY;
      const v = y / MESH_DENSITY;

      // Position (centered around origin)
      positions.push((u - 0.5) * canvas.width, (v - 0.5) * canvas.height, 0);

      // UV coordinates
      uvs.push(u, v);

      // Normalized UV (-1 to 1)
      uvNorms.push(u * 2 - 1, v * 2 - 1);

      // Random ID for per-vertex randomization
      rndIds.push(Math.random());
    }
  }

  // Generate triangle indices
  for (let y = 0; y < MESH_DENSITY; y++) {
    for (let x = 0; x < MESH_DENSITY; x++) {
      const i = y * (MESH_DENSITY + 1) + x;
      // Two triangles per quad
      indices.push(i, i + 1, i + MESH_DENSITY + 1);
      indices.push(i + 1, i + MESH_DENSITY + 2, i + MESH_DENSITY + 1);
    }
  }

  // Create and populate buffers
  function createBuffer(data, type = gl.ARRAY_BUFFER) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(type, buffer);
    const arrayType = type === gl.ELEMENT_ARRAY_BUFFER ? Uint16Array : Float32Array;
    gl.bufferData(type, new arrayType(data), gl.STATIC_DRAW);
    return buffer;
  }

  const positionBuffer = createBuffer(positions);
  const uvBuffer = createBuffer(uvs);
  const uvNormBuffer = createBuffer(uvNorms);
  const rndIdBuffer = createBuffer(rndIds);
  const indexBuffer = createBuffer(indices, gl.ELEMENT_ARRAY_BUFFER);

  // Get attribute and uniform locations
  const attributes = {
    position: gl.getAttribLocation(program, 'position'),
    uv: gl.getAttribLocation(program, 'uv'),
    uvNorm: gl.getAttribLocation(program, 'uvNorm'),
    rndId: gl.getAttribLocation(program, 'rndId')
  };

  const uniformNames = ${JSON.stringify(uniqueUniforms.map(u => u.name))};
  const uniforms = {};
  uniformNames.forEach(name => {
    uniforms[name] = gl.getUniformLocation(program, name);
  });

  console.log('[Shader Runtime] Attributes:', attributes);
  console.log('[Shader Runtime] Uniforms:', Object.keys(uniforms).filter(k => uniforms[k] !== null));

  // Handle canvas resizing
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth * dpr;
    const displayHeight = canvas.clientHeight * dpr;

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
      console.log('[Shader Runtime] Resized to', canvas.width, 'x', canvas.height);
    }
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Animation state
  const state = {
    startTime: performance.now(),
    dragging: false,
    dragStartTime: 0,
    dragDuration: 0
  };

  // Mouse/touch interaction
  canvas.addEventListener('pointerdown', () => {
    state.dragging = true;
    state.dragStartTime = performance.now();
  });

  canvas.addEventListener('pointerup', () => {
    state.dragging = false;
  });

  canvas.addEventListener('pointerleave', () => {
    state.dragging = false;
  });

  // Render loop
  function render() {
    const now = performance.now();
    const time = now - state.startTime;

    // Update drag duration
    if (state.dragging) {
      state.dragDuration = now - state.dragStartTime;
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);

    // Set common uniforms
    if (uniforms.u_time) gl.uniform1f(uniforms.u_time, time);
    if (uniforms.time) gl.uniform1f(uniforms.time, time * 0.001);
    if (uniforms.u_drag_time) gl.uniform1f(uniforms.u_drag_time, state.dragDuration);
    if (uniforms.u_dragging) gl.uniform1i(uniforms.u_dragging, state.dragging ? 1 : 0);

    if (uniforms.u_resolution) gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
    if (uniforms.resolution) gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);

    // Color uniforms (Stripe-style defaults)
    if (uniforms.u_r) gl.uniform1f(uniforms.u_r, 0.4);
    if (uniforms.u_g) gl.uniform1f(uniforms.u_g, 0.2);
    if (uniforms.u_b) gl.uniform1f(uniforms.u_b, 0.7);
    if (uniforms.u_opacity_factor) gl.uniform1f(uniforms.u_opacity_factor, 0.8);
    if (uniforms.u_z_offset_factor) gl.uniform1f(uniforms.u_z_offset_factor, 0.0);

    // Matrix uniforms (identity matrices)
    if (uniforms.projectionMatrix) {
      gl.uniformMatrix4fv(uniforms.projectionMatrix, false, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    }
    if (uniforms.modelViewMatrix) {
      gl.uniformMatrix4fv(uniforms.modelViewMatrix, false, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    }
    if (uniforms.modelMatrix) {
      gl.uniformMatrix4fv(uniforms.modelMatrix, false, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    }
    if (uniforms.viewMatrix) {
      gl.uniformMatrix4fv(uniforms.viewMatrix, false, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    }
    if (uniforms.normalMatrix) {
      gl.uniformMatrix3fv(uniforms.normalMatrix, false, [1,0,0, 0,1,0, 0,0,1]);
    }

    // Camera uniforms
    if (uniforms.cameraPosition) gl.uniform3f(uniforms.cameraPosition, 0, 0, 5);
    if (uniforms.isOrthographic) gl.uniform1i(uniforms.isOrthographic, 0);

    // Bind vertex attributes
    function bindAttribute(name, buffer, size) {
      const location = attributes[name];
      if (location >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
      }
    }

    bindAttribute('position', positionBuffer, 3);
    bindAttribute('uv', uvBuffer, 2);
    bindAttribute('uvNorm', uvNormBuffer, 2);
    bindAttribute('rndId', rndIdBuffer, 1);

    // Draw
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);

    requestAnimationFrame(render);
  }

  console.log('[Shader Runtime] Starting render loop');
  render();
})();
</script>
`;

// Step 9: Backup original HTML
const backupPath = htmlPath + '.original';
if (!fs.existsSync(backupPath)) {
  console.log(`   Backing up index.html → index.html.original`);
  fs.writeFileSync(backupPath, html);
} else {
  console.log(`   Backup already exists: index.html.original`);
}

// Step 10: Inject shader runtime
if (html.includes('</body>')) {
  html = html.replace('</body>', shaderRuntimeScript + '\n</body>');
} else if (html.includes('</html>')) {
  html = html.replace('</html>', shaderRuntimeScript + '\n</html>');
} else {
  // No closing tag found - append to end
  html += shaderRuntimeScript;
}

// Step 11: Save modified HTML
console.log(`   Injecting shader-runtime.js`);
fs.writeFileSync(htmlPath, html);

console.log('\n✅ Shader support enabled');
console.log(`   Modified: ${htmlPath}`);
console.log(`   Backup: ${backupPath}\n`);

console.log('💡 Test the shader rendering:');
console.log(`   cd ${extractionDir}`);
console.log(`   python3 -m http.server 8080`);
console.log(`   open http://localhost:8080\n`);

console.log('💡 To revert changes:');
console.log(`   cp ${backupPath} ${htmlPath}\n`);
