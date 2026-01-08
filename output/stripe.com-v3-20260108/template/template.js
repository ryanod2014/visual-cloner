/**
 * Stripe Template - JavaScript Module
 * Includes: Gradient Shader, Scroll Animations, Number Counter
 */

// ============================================
// GRADIENT SHADER
// ============================================

class GradientShader {
  constructor(canvas, config = {}) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
    if (!this.gl) throw new Error('WebGL not supported');

    // Default config (Stripe colors)
    this.config = {
      baseColor: [0.6627, 0.3765, 0.9333],
      wave0Color: [1.0, 0.2, 0.2392],
      wave1Color: [0.5647, 0.8784, 1.0],
      wave2Color: [1.0, 0.7961, 0.3412],
      wave0Active: true,
      wave1Active: true,
      wave2Active: true,
      speed: 1.0,
      flow: 1.0,
      freqX: 1.0,
      freqY: 1.0,
      amplitude: 320,
      shadow: 6,
      darkenTop: true,
      ...config
    };

    this.init();
  }

  init() {
    const gl = this.gl;

    // Vertex Shader
    const vertexSource = `
      precision highp float;
      attribute vec4 position;
      attribute vec2 uv;
      attribute vec2 uvNorm;
      uniform mat4 projectionMatrix;
      uniform mat4 modelViewMatrix;
      uniform vec2 resolution;
      uniform float u_time;
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
        vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
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
        float tilt = resolution.y / 2.0 * uvNorm.y;
        float incline = resolution.x * uvNorm.x / 2.0 * u_vertDeform_incline;
        float offset = resolution.x / 2.0 * u_vertDeform_incline * mix(u_vertDeform_offsetBottom, u_vertDeform_offsetTop, uv.y);
        float noise = snoise(vec3(noiseCoord.x * u_vertDeform_noiseFreq.x + time * u_vertDeform_noiseFlow, noiseCoord.y * u_vertDeform_noiseFreq.y, time * u_vertDeform_noiseSpeed + u_vertDeform_noiseSeed)) * u_vertDeform_noiseAmp;
        noise *= 1.0 - pow(abs(uvNorm.y), 2.0);
        noise = max(0.0, noise);
        vec3 pos = vec3(position.x, position.y + tilt + incline + noise - offset, position.z);
        v_color = u_baseColor;
        if (u_active_colors[1] == 1.0) {
          float n = smoothstep(u_waveLayers_0_noiseFloor, u_waveLayers_0_noiseCeil, snoise(vec3(noiseCoord.x * u_waveLayers_0_noiseFreq.x + time * u_waveLayers_0_noiseFlow, noiseCoord.y * u_waveLayers_0_noiseFreq.y, time * u_waveLayers_0_noiseSpeed + u_waveLayers_0_noiseSeed)) / 2.0 + 0.5);
          v_color = blendNormal(v_color, u_waveLayers_0_color, pow(n, 4.0));
        }
        if (u_active_colors[2] == 1.0) {
          float n = smoothstep(u_waveLayers_1_noiseFloor, u_waveLayers_1_noiseCeil, snoise(vec3(noiseCoord.x * u_waveLayers_1_noiseFreq.x + time * u_waveLayers_1_noiseFlow, noiseCoord.y * u_waveLayers_1_noiseFreq.y, time * u_waveLayers_1_noiseSpeed + u_waveLayers_1_noiseSeed)) / 2.0 + 0.5);
          v_color = blendNormal(v_color, u_waveLayers_1_color, pow(n, 4.0));
        }
        if (u_active_colors[3] == 1.0) {
          float n = smoothstep(u_waveLayers_2_noiseFloor, u_waveLayers_2_noiseCeil, snoise(vec3(noiseCoord.x * u_waveLayers_2_noiseFreq.x + time * u_waveLayers_2_noiseFlow, noiseCoord.y * u_waveLayers_2_noiseFreq.y, time * u_waveLayers_2_noiseSpeed + u_waveLayers_2_noiseSeed)) / 2.0 + 0.5);
          v_color = blendNormal(v_color, u_waveLayers_2_color, pow(n, 4.0));
        }
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `;

    // Fragment Shader
    const fragmentSource = `
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
    `;

    // Compile shaders
    const vs = this.createShader(gl.VERTEX_SHADER, vertexSource);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    // Create geometry
    this.density = 100;
    this.createGeometry();
    this.getLocations();
    this.resize();

    window.addEventListener('resize', () => this.resize());
    this.start = performance.now();
    this.render();
  }

  createShader(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    return shader;
  }

  createGeometry() {
    const gl = this.gl;
    const density = this.density;

    this.positions = [];
    this.uvs = [];
    this.uvNorms = [];
    this.indices = [];

    for (let y = 0; y <= density; y++) {
      for (let x = 0; x <= density; x++) {
        const u = x / density;
        const v = y / density;
        this.positions.push((u - 0.5) * this.canvas.width, (v - 0.5) * this.canvas.height, 0);
        this.uvs.push(u, v);
        this.uvNorms.push(u * 2 - 1, v * 2 - 1);
      }
    }

    for (let y = 0; y < density; y++) {
      for (let x = 0; x < density; x++) {
        const i = y * (density + 1) + x;
        this.indices.push(i, i + 1, i + density + 1);
        this.indices.push(i + 1, i + density + 2, i + density + 1);
      }
    }

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.positions), gl.STATIC_DRAW);

    this.uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.uvs), gl.STATIC_DRAW);

    this.uvNormBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvNormBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.uvNorms), gl.STATIC_DRAW);

    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.indices), gl.STATIC_DRAW);
  }

  getLocations() {
    const gl = this.gl;
    this.posLoc = gl.getAttribLocation(this.program, 'position');
    this.uvLoc = gl.getAttribLocation(this.program, 'uv');
    this.uvNormLoc = gl.getAttribLocation(this.program, 'uvNorm');

    const uniformNames = [
      'projectionMatrix', 'modelViewMatrix', 'resolution', 'u_time',
      'u_shadow_power', 'u_darken_top', 'u_active_colors',
      'u_global_noiseFreq', 'u_global_noiseSpeed',
      'u_vertDeform_incline', 'u_vertDeform_offsetTop', 'u_vertDeform_offsetBottom',
      'u_vertDeform_noiseFreq', 'u_vertDeform_noiseAmp', 'u_vertDeform_noiseSpeed',
      'u_vertDeform_noiseFlow', 'u_vertDeform_noiseSeed', 'u_baseColor',
      'u_waveLayers_0_color', 'u_waveLayers_0_noiseFreq', 'u_waveLayers_0_noiseSpeed',
      'u_waveLayers_0_noiseFlow', 'u_waveLayers_0_noiseSeed', 'u_waveLayers_0_noiseFloor',
      'u_waveLayers_0_noiseCeil', 'u_waveLayers_1_color', 'u_waveLayers_1_noiseFreq',
      'u_waveLayers_1_noiseSpeed', 'u_waveLayers_1_noiseFlow', 'u_waveLayers_1_noiseSeed',
      'u_waveLayers_1_noiseFloor', 'u_waveLayers_1_noiseCeil', 'u_waveLayers_2_color',
      'u_waveLayers_2_noiseFreq', 'u_waveLayers_2_noiseSpeed', 'u_waveLayers_2_noiseFlow',
      'u_waveLayers_2_noiseSeed', 'u_waveLayers_2_noiseFloor', 'u_waveLayers_2_noiseCeil'
    ];

    this.uniforms = {};
    uniformNames.forEach(name => {
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    });
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // Rebuild positions
    this.positions = [];
    for (let y = 0; y <= this.density; y++) {
      for (let x = 0; x <= this.density; x++) {
        const u = x / this.density;
        const v = y / this.density;
        this.positions.push((u - 0.5) * this.canvas.width, (v - 0.5) * this.canvas.height, 0);
      }
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(this.positions), this.gl.STATIC_DRAW);
  }

  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  render = () => {
    const gl = this.gl;
    const config = this.config;
    const time = performance.now() - this.start;
    const w = this.canvas.width, h = this.canvas.height;

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);

    const proj = new Float32Array([2/w,0,0,0, 0,2/h,0,0, 0,0,-0.001,0, 0,0,0,1]);
    const model = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

    gl.uniformMatrix4fv(this.uniforms.projectionMatrix, false, proj);
    gl.uniformMatrix4fv(this.uniforms.modelViewMatrix, false, model);
    gl.uniform2f(this.uniforms.resolution, w, h);
    gl.uniform1f(this.uniforms.u_time, time * config.speed);
    gl.uniform1f(this.uniforms.u_shadow_power, config.shadow);
    gl.uniform1f(this.uniforms.u_darken_top, config.darkenTop ? 1 : 0);
    gl.uniform4f(this.uniforms.u_active_colors, 1, config.wave0Active ? 1 : 0, config.wave1Active ? 1 : 0, config.wave2Active ? 1 : 0);

    gl.uniform2f(this.uniforms.u_global_noiseFreq, 0.00014 * config.freqX, 0.00029 * config.freqY);
    gl.uniform1f(this.uniforms.u_global_noiseSpeed, 0.000005);

    gl.uniform1f(this.uniforms.u_vertDeform_incline, 0);
    gl.uniform1f(this.uniforms.u_vertDeform_offsetTop, -0.5);
    gl.uniform1f(this.uniforms.u_vertDeform_offsetBottom, -0.5);
    gl.uniform2f(this.uniforms.u_vertDeform_noiseFreq, 3 * config.freqX, 4 * config.freqY);
    gl.uniform1f(this.uniforms.u_vertDeform_noiseAmp, config.amplitude);
    gl.uniform1f(this.uniforms.u_vertDeform_noiseSpeed, 10 * config.speed);
    gl.uniform1f(this.uniforms.u_vertDeform_noiseFlow, 3 * config.flow);
    gl.uniform1f(this.uniforms.u_vertDeform_noiseSeed, 5);

    gl.uniform3fv(this.uniforms.u_baseColor, config.baseColor);

    gl.uniform3fv(this.uniforms.u_waveLayers_0_color, config.wave0Color);
    gl.uniform2f(this.uniforms.u_waveLayers_0_noiseFreq, 2.25 * config.freqX, 3.25 * config.freqY);
    gl.uniform1f(this.uniforms.u_waveLayers_0_noiseSpeed, 11.3 * config.speed);
    gl.uniform1f(this.uniforms.u_waveLayers_0_noiseFlow, 6.8 * config.flow);
    gl.uniform1f(this.uniforms.u_waveLayers_0_noiseSeed, 15);
    gl.uniform1f(this.uniforms.u_waveLayers_0_noiseFloor, 0.1);
    gl.uniform1f(this.uniforms.u_waveLayers_0_noiseCeil, 0.7);

    gl.uniform3fv(this.uniforms.u_waveLayers_1_color, config.wave1Color);
    gl.uniform2f(this.uniforms.u_waveLayers_1_noiseFreq, 2.5 * config.freqX, 3.5 * config.freqY);
    gl.uniform1f(this.uniforms.u_waveLayers_1_noiseSpeed, 11.6 * config.speed);
    gl.uniform1f(this.uniforms.u_waveLayers_1_noiseFlow, 7.1 * config.flow);
    gl.uniform1f(this.uniforms.u_waveLayers_1_noiseSeed, 25);
    gl.uniform1f(this.uniforms.u_waveLayers_1_noiseFloor, 0.1);
    gl.uniform1f(this.uniforms.u_waveLayers_1_noiseCeil, 0.77);

    gl.uniform3fv(this.uniforms.u_waveLayers_2_color, config.wave2Color);
    gl.uniform2f(this.uniforms.u_waveLayers_2_noiseFreq, 2.75 * config.freqX, 3.75 * config.freqY);
    gl.uniform1f(this.uniforms.u_waveLayers_2_noiseSpeed, 11.9 * config.speed);
    gl.uniform1f(this.uniforms.u_waveLayers_2_noiseFlow, 7.4 * config.flow);
    gl.uniform1f(this.uniforms.u_waveLayers_2_noiseSeed, 35);
    gl.uniform1f(this.uniforms.u_waveLayers_2_noiseFloor, 0.1);
    gl.uniform1f(this.uniforms.u_waveLayers_2_noiseCeil, 0.84);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.posLoc);
    gl.vertexAttribPointer(this.posLoc, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.enableVertexAttribArray(this.uvLoc);
    gl.vertexAttribPointer(this.uvLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvNormBuffer);
    gl.enableVertexAttribArray(this.uvNormLoc);
    gl.vertexAttribPointer(this.uvNormLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_SHORT, 0);

    requestAnimationFrame(this.render);
  }
}


// ============================================
// SCROLL ANIMATIONS
// ============================================

class ScrollAnimations {
  constructor(options = {}) {
    this.threshold = options.threshold || 0.2;
    this.rootMargin = options.rootMargin || '0px';

    this.observer = new IntersectionObserver(
      (entries) => this.handleIntersection(entries),
      { threshold: this.threshold, rootMargin: this.rootMargin }
    );

    this.init();
  }

  init() {
    document.querySelectorAll('[data-animate]').forEach(el => {
      this.observer.observe(el);
    });
  }

  handleIntersection(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const delay = el.dataset.delay || 0;

        setTimeout(() => {
          el.classList.add('visible');
        }, parseFloat(delay) * 1000);

        // Stop observing once animated
        this.observer.unobserve(el);
      }
    });
  }
}


// ============================================
// NUMBER COUNTER
// ============================================

class NumberCounter {
  constructor(element, options = {}) {
    this.element = element;
    this.target = parseFloat(element.dataset.target || element.textContent);
    this.duration = options.duration || 2000;
    this.prefix = options.prefix || element.dataset.prefix || '';
    this.suffix = options.suffix || element.dataset.suffix || '';
    this.decimals = options.decimals || parseInt(element.dataset.decimals) || 0;
  }

  start() {
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / this.duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = this.target * eased;

      this.element.textContent = this.prefix + current.toFixed(this.decimals) + this.suffix;

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }
}


// ============================================
// AUTO-INIT
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Init gradient shader on any .Gradient__canvas
  document.querySelectorAll('.Gradient__canvas').forEach(canvas => {
    const config = window.GRADIENT_CONFIG || {};
    new GradientShader(canvas, config);
  });

  // Init scroll animations
  new ScrollAnimations();

  // Init number counters
  document.querySelectorAll('[data-counter]').forEach(el => {
    const counter = new NumberCounter(el);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          counter.start();
          observer.unobserve(el);
        }
      });
    });
    observer.observe(el);
  });
});


// ============================================
// EXPORTS
// ============================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GradientShader, ScrollAnimations, NumberCounter };
}

if (typeof window !== 'undefined') {
  window.StripeTemplate = { GradientShader, ScrollAnimations, NumberCounter };
}
