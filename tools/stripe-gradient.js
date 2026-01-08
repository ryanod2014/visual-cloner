/**
 * Stripe Gradient Shader - Extracted from stripe.com
 * Full animated WebGL gradient with exact uniform values
 */

export const stripeGradientShader = {
  vertexShader: `
    precision highp float;

    attribute vec4 position;
    attribute vec2 uv;
    attribute vec2 uvNorm;

    uniform mat4 projectionMatrix;
    uniform mat4 modelViewMatrix;
    uniform vec2 resolution;
    uniform float u_time;
    uniform float u_shadow_power;
    uniform float u_darken_top;
    uniform vec4 u_active_colors;

    uniform vec2 u_global_noiseFreq;
    uniform float u_global_noiseSpeed;

    uniform float u_vertDeform_incline;
    uniform float u_vertDeform_offsetTop;
    uniform float u_vertDeform_offsetBottom;
    uniform vec2 u_vertDeform_noiseFreq;
    uniform float u_vertDeform_noiseAmp;
    uniform float u_vertDeform_noiseSpeed;
    uniform float u_vertDeform_noiseFlow;
    uniform float u_vertDeform_noiseSeed;

    uniform vec3 u_baseColor;

    uniform vec3 u_waveLayers_0_color;
    uniform vec2 u_waveLayers_0_noiseFreq;
    uniform float u_waveLayers_0_noiseSpeed;
    uniform float u_waveLayers_0_noiseFlow;
    uniform float u_waveLayers_0_noiseSeed;
    uniform float u_waveLayers_0_noiseFloor;
    uniform float u_waveLayers_0_noiseCeil;

    uniform vec3 u_waveLayers_1_color;
    uniform vec2 u_waveLayers_1_noiseFreq;
    uniform float u_waveLayers_1_noiseSpeed;
    uniform float u_waveLayers_1_noiseFlow;
    uniform float u_waveLayers_1_noiseSeed;
    uniform float u_waveLayers_1_noiseFloor;
    uniform float u_waveLayers_1_noiseCeil;

    uniform vec3 u_waveLayers_2_color;
    uniform vec2 u_waveLayers_2_noiseFreq;
    uniform float u_waveLayers_2_noiseSpeed;
    uniform float u_waveLayers_2_noiseFlow;
    uniform float u_waveLayers_2_noiseSeed;
    uniform float u_waveLayers_2_noiseFloor;
    uniform float u_waveLayers_2_noiseCeil;

    varying vec3 v_color;

    // Simplex noise functions
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    vec3 blendNormal(vec3 base, vec3 blend, float opacity) {
      return (blend * opacity + base * (1.0 - opacity));
    }

    void main() {
      float time = u_time * u_global_noiseSpeed;
      vec2 noiseCoord = resolution * uvNorm * u_global_noiseFreq;
      vec2 st = 1.0 - uvNorm.xy;

      float tilt = resolution.y / 2.0 * uvNorm.y;
      float incline = resolution.x * uvNorm.x / 2.0 * u_vertDeform_incline;
      float offset = resolution.x / 2.0 * u_vertDeform_incline * mix(u_vertDeform_offsetBottom, u_vertDeform_offsetTop, uv.y);

      float noise = snoise(vec3(
        noiseCoord.x * u_vertDeform_noiseFreq.x + time * u_vertDeform_noiseFlow,
        noiseCoord.y * u_vertDeform_noiseFreq.y,
        time * u_vertDeform_noiseSpeed + u_vertDeform_noiseSeed
      )) * u_vertDeform_noiseAmp;

      noise *= 1.0 - pow(abs(uvNorm.y), 2.0);
      noise = max(0.0, noise);

      vec3 pos = vec3(position.x, position.y + tilt + incline + noise - offset, position.z);

      v_color = u_baseColor;

      // Wave layer 0
      if (u_active_colors[1] == 1.0) {
        float n = smoothstep(
          u_waveLayers_0_noiseFloor, u_waveLayers_0_noiseCeil,
          snoise(vec3(
            noiseCoord.x * u_waveLayers_0_noiseFreq.x + time * u_waveLayers_0_noiseFlow,
            noiseCoord.y * u_waveLayers_0_noiseFreq.y,
            time * u_waveLayers_0_noiseSpeed + u_waveLayers_0_noiseSeed
          )) / 2.0 + 0.5
        );
        v_color = blendNormal(v_color, u_waveLayers_0_color, pow(n, 4.0));
      }

      // Wave layer 1
      if (u_active_colors[2] == 1.0) {
        float n = smoothstep(
          u_waveLayers_1_noiseFloor, u_waveLayers_1_noiseCeil,
          snoise(vec3(
            noiseCoord.x * u_waveLayers_1_noiseFreq.x + time * u_waveLayers_1_noiseFlow,
            noiseCoord.y * u_waveLayers_1_noiseFreq.y,
            time * u_waveLayers_1_noiseSpeed + u_waveLayers_1_noiseSeed
          )) / 2.0 + 0.5
        );
        v_color = blendNormal(v_color, u_waveLayers_1_color, pow(n, 4.0));
      }

      // Wave layer 2
      if (u_active_colors[3] == 1.0) {
        float n = smoothstep(
          u_waveLayers_2_noiseFloor, u_waveLayers_2_noiseCeil,
          snoise(vec3(
            noiseCoord.x * u_waveLayers_2_noiseFreq.x + time * u_waveLayers_2_noiseFlow,
            noiseCoord.y * u_waveLayers_2_noiseFreq.y,
            time * u_waveLayers_2_noiseSpeed + u_waveLayers_2_noiseSeed
          )) / 2.0 + 0.5
        );
        v_color = blendNormal(v_color, u_waveLayers_2_color, pow(n, 4.0));
      }

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,

  fragmentShader: `
    precision highp float;

    uniform vec2 resolution;
    uniform float u_shadow_power;
    uniform float u_darken_top;

    varying vec3 v_color;

    void main() {
      vec3 color = v_color;
      if (u_darken_top == 1.0) {
        vec2 st = gl_FragCoord.xy / resolution.xy;
        color.g -= pow(st.y + sin(-12.0) * st.x, u_shadow_power) * 0.4;
      }
      gl_FragColor = vec4(color, 1.0);
    }
  `,

  // Default uniform values from Stripe
  uniforms: {
    u_global_noiseFreq: [0.00014, 0.00029],
    u_global_noiseSpeed: 0.000005,
    u_vertDeform_incline: 0,
    u_vertDeform_offsetTop: -0.5,
    u_vertDeform_offsetBottom: -0.5,
    u_vertDeform_noiseFreq: [3, 4],
    u_vertDeform_noiseAmp: 320,
    u_vertDeform_noiseSpeed: 10,
    u_vertDeform_noiseFlow: 3,
    u_vertDeform_noiseSeed: 5,
    u_baseColor: [0.6627, 0.3765, 0.9333], // Purple
    u_waveLayers_0_color: [1.0, 0.2, 0.2392], // Red/Pink
    u_waveLayers_0_noiseFreq: [2.25, 3.25],
    u_waveLayers_0_noiseSpeed: 11.3,
    u_waveLayers_0_noiseFlow: 6.8,
    u_waveLayers_0_noiseSeed: 15,
    u_waveLayers_0_noiseFloor: 0.1,
    u_waveLayers_0_noiseCeil: 0.7,
    u_waveLayers_1_color: [0.5647, 0.8784, 1.0], // Cyan
    u_waveLayers_1_noiseFreq: [2.5, 3.5],
    u_waveLayers_1_noiseSpeed: 11.6,
    u_waveLayers_1_noiseFlow: 7.1,
    u_waveLayers_1_noiseSeed: 25,
    u_waveLayers_1_noiseFloor: 0.1,
    u_waveLayers_1_noiseCeil: 0.77,
    u_waveLayers_2_color: [1.0, 0.7961, 0.3412], // Yellow/Orange
    u_waveLayers_2_noiseFreq: [2.75, 3.75],
    u_waveLayers_2_noiseSpeed: 11.9,
    u_waveLayers_2_noiseFlow: 7.4,
    u_waveLayers_2_noiseSeed: 35,
    u_waveLayers_2_noiseFloor: 0.1,
    u_waveLayers_2_noiseCeil: 0.84,
    u_shadow_power: 6,
    u_darken_top: 1,
    u_active_colors: [1, 1, 1, 1]
  }
};

// Generate the injectable script for the clone
export function generateGradientScript() {
  return `
<script>
(function() {
  const canvas = document.querySelector('.Gradient__canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
  if (!gl) { console.log('WebGL not supported'); return; }

  // Vertex shader
  const vertexSource = \`${stripeGradientShader.vertexShader.replace(/`/g, '\\`')}\`;

  // Fragment shader
  const fragmentSource = \`${stripeGradientShader.fragmentShader.replace(/`/g, '\\`')}\`;

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
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
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return;
  }

  // Create geometry (full-screen quad with UVs)
  const density = 100;
  const positions = [];
  const uvs = [];
  const uvNorms = [];
  const indices = [];

  for (let y = 0; y <= density; y++) {
    for (let x = 0; x <= density; x++) {
      const u = x / density;
      const v = y / density;
      positions.push((u - 0.5) * canvas.width, (v - 0.5) * canvas.height, 0);
      uvs.push(u, v);
      uvNorms.push(u * 2 - 1, v * 2 - 1);
    }
  }

  for (let y = 0; y < density; y++) {
    for (let x = 0; x < density; x++) {
      const i = y * (density + 1) + x;
      indices.push(i, i + 1, i + density + 1);
      indices.push(i + 1, i + density + 2, i + density + 1);
    }
  }

  // Create buffers
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
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

  // Get uniform locations
  const uniforms = {
    projectionMatrix: gl.getUniformLocation(program, 'projectionMatrix'),
    modelViewMatrix: gl.getUniformLocation(program, 'modelViewMatrix'),
    resolution: gl.getUniformLocation(program, 'resolution'),
    u_time: gl.getUniformLocation(program, 'u_time'),
    u_shadow_power: gl.getUniformLocation(program, 'u_shadow_power'),
    u_darken_top: gl.getUniformLocation(program, 'u_darken_top'),
    u_active_colors: gl.getUniformLocation(program, 'u_active_colors'),
    u_global_noiseFreq: gl.getUniformLocation(program, 'u_global_noiseFreq'),
    u_global_noiseSpeed: gl.getUniformLocation(program, 'u_global_noiseSpeed'),
    u_vertDeform_incline: gl.getUniformLocation(program, 'u_vertDeform_incline'),
    u_vertDeform_offsetTop: gl.getUniformLocation(program, 'u_vertDeform_offsetTop'),
    u_vertDeform_offsetBottom: gl.getUniformLocation(program, 'u_vertDeform_offsetBottom'),
    u_vertDeform_noiseFreq: gl.getUniformLocation(program, 'u_vertDeform_noiseFreq'),
    u_vertDeform_noiseAmp: gl.getUniformLocation(program, 'u_vertDeform_noiseAmp'),
    u_vertDeform_noiseSpeed: gl.getUniformLocation(program, 'u_vertDeform_noiseSpeed'),
    u_vertDeform_noiseFlow: gl.getUniformLocation(program, 'u_vertDeform_noiseFlow'),
    u_vertDeform_noiseSeed: gl.getUniformLocation(program, 'u_vertDeform_noiseSeed'),
    u_baseColor: gl.getUniformLocation(program, 'u_baseColor'),
    u_waveLayers_0_color: gl.getUniformLocation(program, 'u_waveLayers_0_color'),
    u_waveLayers_0_noiseFreq: gl.getUniformLocation(program, 'u_waveLayers_0_noiseFreq'),
    u_waveLayers_0_noiseSpeed: gl.getUniformLocation(program, 'u_waveLayers_0_noiseSpeed'),
    u_waveLayers_0_noiseFlow: gl.getUniformLocation(program, 'u_waveLayers_0_noiseFlow'),
    u_waveLayers_0_noiseSeed: gl.getUniformLocation(program, 'u_waveLayers_0_noiseSeed'),
    u_waveLayers_0_noiseFloor: gl.getUniformLocation(program, 'u_waveLayers_0_noiseFloor'),
    u_waveLayers_0_noiseCeil: gl.getUniformLocation(program, 'u_waveLayers_0_noiseCeil'),
    u_waveLayers_1_color: gl.getUniformLocation(program, 'u_waveLayers_1_color'),
    u_waveLayers_1_noiseFreq: gl.getUniformLocation(program, 'u_waveLayers_1_noiseFreq'),
    u_waveLayers_1_noiseSpeed: gl.getUniformLocation(program, 'u_waveLayers_1_noiseSpeed'),
    u_waveLayers_1_noiseFlow: gl.getUniformLocation(program, 'u_waveLayers_1_noiseFlow'),
    u_waveLayers_1_noiseSeed: gl.getUniformLocation(program, 'u_waveLayers_1_noiseSeed'),
    u_waveLayers_1_noiseFloor: gl.getUniformLocation(program, 'u_waveLayers_1_noiseFloor'),
    u_waveLayers_1_noiseCeil: gl.getUniformLocation(program, 'u_waveLayers_1_noiseCeil'),
    u_waveLayers_2_color: gl.getUniformLocation(program, 'u_waveLayers_2_color'),
    u_waveLayers_2_noiseFreq: gl.getUniformLocation(program, 'u_waveLayers_2_noiseFreq'),
    u_waveLayers_2_noiseSpeed: gl.getUniformLocation(program, 'u_waveLayers_2_noiseSpeed'),
    u_waveLayers_2_noiseFlow: gl.getUniformLocation(program, 'u_waveLayers_2_noiseFlow'),
    u_waveLayers_2_noiseSeed: gl.getUniformLocation(program, 'u_waveLayers_2_noiseSeed'),
    u_waveLayers_2_noiseFloor: gl.getUniformLocation(program, 'u_waveLayers_2_noiseFloor'),
    u_waveLayers_2_noiseCeil: gl.getUniformLocation(program, 'u_waveLayers_2_noiseCeil')
  };

  function resize() {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  const start = performance.now();

  function render() {
    const time = performance.now() - start;

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);

    // Orthographic projection
    const w = canvas.width, h = canvas.height;
    const proj = new Float32Array([
      2/w, 0, 0, 0,
      0, 2/h, 0, 0,
      0, 0, -0.001, 0,
      0, 0, 0, 1
    ]);
    const model = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

    gl.uniformMatrix4fv(uniforms.projectionMatrix, false, proj);
    gl.uniformMatrix4fv(uniforms.modelViewMatrix, false, model);
    gl.uniform2f(uniforms.resolution, w, h);
    gl.uniform1f(uniforms.u_time, time);
    gl.uniform1f(uniforms.u_shadow_power, 6);
    gl.uniform1f(uniforms.u_darken_top, 1);
    gl.uniform4f(uniforms.u_active_colors, 1, 1, 1, 1);

    // Global
    gl.uniform2f(uniforms.u_global_noiseFreq, 0.00014, 0.00029);
    gl.uniform1f(uniforms.u_global_noiseSpeed, 0.000005);

    // Vert deform
    gl.uniform1f(uniforms.u_vertDeform_incline, 0);
    gl.uniform1f(uniforms.u_vertDeform_offsetTop, -0.5);
    gl.uniform1f(uniforms.u_vertDeform_offsetBottom, -0.5);
    gl.uniform2f(uniforms.u_vertDeform_noiseFreq, 3, 4);
    gl.uniform1f(uniforms.u_vertDeform_noiseAmp, 320);
    gl.uniform1f(uniforms.u_vertDeform_noiseSpeed, 10);
    gl.uniform1f(uniforms.u_vertDeform_noiseFlow, 3);
    gl.uniform1f(uniforms.u_vertDeform_noiseSeed, 5);

    // Colors
    gl.uniform3f(uniforms.u_baseColor, 0.6627, 0.3765, 0.9333);

    // Wave layer 0 - Red/Pink
    gl.uniform3f(uniforms.u_waveLayers_0_color, 1.0, 0.2, 0.2392);
    gl.uniform2f(uniforms.u_waveLayers_0_noiseFreq, 2.25, 3.25);
    gl.uniform1f(uniforms.u_waveLayers_0_noiseSpeed, 11.3);
    gl.uniform1f(uniforms.u_waveLayers_0_noiseFlow, 6.8);
    gl.uniform1f(uniforms.u_waveLayers_0_noiseSeed, 15);
    gl.uniform1f(uniforms.u_waveLayers_0_noiseFloor, 0.1);
    gl.uniform1f(uniforms.u_waveLayers_0_noiseCeil, 0.7);

    // Wave layer 1 - Cyan
    gl.uniform3f(uniforms.u_waveLayers_1_color, 0.5647, 0.8784, 1.0);
    gl.uniform2f(uniforms.u_waveLayers_1_noiseFreq, 2.5, 3.5);
    gl.uniform1f(uniforms.u_waveLayers_1_noiseSpeed, 11.6);
    gl.uniform1f(uniforms.u_waveLayers_1_noiseFlow, 7.1);
    gl.uniform1f(uniforms.u_waveLayers_1_noiseSeed, 25);
    gl.uniform1f(uniforms.u_waveLayers_1_noiseFloor, 0.1);
    gl.uniform1f(uniforms.u_waveLayers_1_noiseCeil, 0.77);

    // Wave layer 2 - Yellow
    gl.uniform3f(uniforms.u_waveLayers_2_color, 1.0, 0.7961, 0.3412);
    gl.uniform2f(uniforms.u_waveLayers_2_noiseFreq, 2.75, 3.75);
    gl.uniform1f(uniforms.u_waveLayers_2_noiseSpeed, 11.9);
    gl.uniform1f(uniforms.u_waveLayers_2_noiseFlow, 7.4);
    gl.uniform1f(uniforms.u_waveLayers_2_noiseSeed, 35);
    gl.uniform1f(uniforms.u_waveLayers_2_noiseFloor, 0.1);
    gl.uniform1f(uniforms.u_waveLayers_2_noiseCeil, 0.84);

    // Bind position
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

    // Bind UV
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

    // Bind uvNorm
    gl.bindBuffer(gl.ARRAY_BUFFER, uvNormBuffer);
    gl.enableVertexAttribArray(uvNormLoc);
    gl.vertexAttribPointer(uvNormLoc, 2, gl.FLOAT, false, 0, 0);

    // Draw
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);

    requestAnimationFrame(render);
  }

  render();
  canvas.classList.add('isLoaded');
})();
</script>
`;
}
