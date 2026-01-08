#!/usr/bin/env node
/**
 * Template Generator
 * Generates reusable template files from a clone
 *
 * Usage: node generate-template.js <clone-dir>
 *
 * Input files expected:
 *   - extracted-css.css
 *   - shaders.json
 *   - animations.json
 *
 * Output files:
 *   - template/template.json   (design spec)
 *   - template/template.css    (CSS with tokens)
 *   - template/template.js     (shader + animations)
 *   - template/example.html    (usage example)
 */

import fs from 'fs';
import path from 'path';

// ============================================
// CSS VARIABLE EXTRACTION
// ============================================

function extractDesignTokens(cssContent) {
  const tokens = {
    colors: { primary: {}, accent: {}, neutral: {}, background: {} },
    typography: { fontFamily: {}, fontWeight: {}, fontSize: {}, lineHeight: {} },
    spacing: {},
    borderRadius: {},
    shadows: {},
    transitions: {}
  };

  // Extract CSS variables from :root or html selector
  const rootMatch = cssContent.match(/:root\s*\{([^}]+)\}/s) ||
                    cssContent.match(/html\s*\{([^}]+)\}/s) ||
                    cssContent.match(/\.[\w-]+\s*\{([^}]*--[\w-]+:[^}]+)\}/s);

  if (rootMatch) {
    const vars = rootMatch[1].matchAll(/--([^:]+):\s*([^;]+);/g);
    for (const [, name, value] of vars) {
      categorizeToken(tokens, name.trim(), value.trim());
    }
  }

  // Extract colors from common patterns
  const colorPatterns = [
    /color:\s*(#[a-fA-F0-9]{3,8}|rgb[a]?\([^)]+\))/gi,
    /background(?:-color)?:\s*(#[a-fA-F0-9]{3,8}|rgb[a]?\([^)]+\))/gi,
    /border(?:-color)?:\s*[^;]*(#[a-fA-F0-9]{3,8})/gi
  ];

  const foundColors = new Set();
  for (const pattern of colorPatterns) {
    const matches = cssContent.matchAll(pattern);
    for (const match of matches) {
      const color = match[1];
      if (color && !color.includes('var(')) {
        foundColors.add(color);
      }
    }
  }

  // Extract font families
  const fontMatches = cssContent.matchAll(/font-family:\s*([^;]+);/gi);
  const fonts = new Set();
  for (const match of fontMatches) {
    const font = match[1].trim();
    if (!font.includes('var(')) {
      fonts.add(font);
    }
  }
  if (fonts.size > 0) {
    const fontArr = [...fonts];
    if (fontArr[0]) tokens.typography.fontFamily.primary = fontArr[0];
    if (fontArr[1]) tokens.typography.fontFamily.secondary = fontArr[1];
  }

  // Extract font sizes
  const sizeMatches = cssContent.matchAll(/font-size:\s*(\d+(?:\.\d+)?(?:px|rem|em))/gi);
  const sizes = new Set();
  for (const match of sizeMatches) {
    sizes.add(match[1]);
  }
  const sortedSizes = [...sizes].sort((a, b) => parseFloat(a) - parseFloat(b));
  const sizeNames = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', 'hero'];
  sortedSizes.forEach((size, i) => {
    if (i < sizeNames.length) {
      tokens.typography.fontSize[sizeNames[i]] = size;
    }
  });

  return tokens;
}

function categorizeToken(tokens, name, value) {
  const nameLower = name.toLowerCase();

  if (nameLower.includes('color') || nameLower.includes('bg')) {
    if (nameLower.includes('primary')) {
      tokens.colors.primary[name] = value;
    } else if (nameLower.includes('accent') || nameLower.includes('secondary')) {
      tokens.colors.accent[name] = value;
    } else {
      tokens.colors.neutral[name] = value;
    }
  } else if (nameLower.includes('font')) {
    if (nameLower.includes('family')) {
      tokens.typography.fontFamily[name] = value;
    } else if (nameLower.includes('weight')) {
      tokens.typography.fontWeight[name] = value;
    } else if (nameLower.includes('size')) {
      tokens.typography.fontSize[name] = value;
    }
  } else if (nameLower.includes('space') || nameLower.includes('gap') || nameLower.includes('padding') || nameLower.includes('margin')) {
    tokens.spacing[name] = value;
  } else if (nameLower.includes('radius')) {
    tokens.borderRadius[name] = value;
  } else if (nameLower.includes('shadow')) {
    tokens.shadows[name] = value;
  } else if (nameLower.includes('transition') || nameLower.includes('duration')) {
    tokens.transitions[name] = value;
  }
}

// ============================================
// SHADER PROCESSING
// ============================================

function processShaders(shadersJson) {
  if (!shadersJson || !shadersJson.shaders || shadersJson.shaders.length === 0) {
    return null;
  }

  // Find vertex and fragment shader pair
  const vertexShader = shadersJson.shaders.find(s => s.type === 'vertex');
  const fragmentShader = shadersJson.shaders.find(s => s.type === 'fragment');

  if (!vertexShader || !fragmentShader) {
    return null;
  }

  // Extract uniform names from shader source
  const uniformPattern = /uniform\s+\w+\s+(\w+)/g;
  const uniforms = new Set();

  for (const match of vertexShader.source.matchAll(uniformPattern)) {
    uniforms.add(match[1]);
  }
  for (const match of fragmentShader.source.matchAll(uniformPattern)) {
    uniforms.add(match[1]);
  }

  return {
    type: 'webgl',
    canvasClass: vertexShader.canvasClass || 'gradient-canvas',
    vertexShader: vertexShader.source,
    fragmentShader: fragmentShader.source,
    uniforms: [...uniforms],
    defaultValues: shadersJson.uniforms || {}
  };
}

// ============================================
// ANIMATION PROCESSING
// ============================================

function processAnimations(animationsJson) {
  const result = {
    css: {},
    js: {}
  };

  if (!animationsJson) return result;

  // Process CSS animations
  if (animationsJson.cssAnimations) {
    for (const anim of animationsJson.cssAnimations) {
      if (anim.name && anim.keyframes) {
        result.css[anim.name] = {
          keyframes: anim.keyframes,
          usage: `animation: ${anim.name} ${anim.duration || '0.6s'} ${anim.easing || 'ease'} forwards;`
        };
      }
    }
  }

  // Add common animations if not found
  const commonAnimations = {
    fadeIn: {
      keyframes: '@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }',
      usage: 'animation: fadeIn 0.6s ease forwards;'
    },
    slideUp: {
      keyframes: '@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }',
      usage: 'animation: slideUp 0.6s ease forwards;'
    },
    slideInRight: {
      keyframes: '@keyframes slideInRight { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }',
      usage: 'animation: slideInRight 0.6s ease forwards;'
    }
  };

  result.css = { ...commonAnimations, ...result.css };

  // Add JS animation helpers
  result.js = {
    scrollReveal: {
      description: 'Reveal elements as they scroll into view',
      trigger: 'intersection',
      properties: ['opacity', 'transform'],
      duration: 600
    },
    numberCounter: {
      description: 'Animate numbers counting up',
      trigger: 'intersection',
      duration: 2000
    }
  };

  return result;
}

// ============================================
// TEMPLATE FILE GENERATORS
// ============================================

function generateTemplateJSON(siteName, tokens, shader, animations) {
  return {
    name: siteName,
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    description: `Design system extracted from ${siteName}`,

    designTokens: tokens,

    gradientShader: shader,

    animations: animations,

    components: {
      button: {
        primary: {
          background: 'var(--color-primary, #635bff)',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '9999px',
          fontWeight: 600
        },
        secondary: {
          background: 'transparent',
          color: 'var(--color-primary, #635bff)',
          border: '1px solid currentColor',
          padding: '12px 20px',
          borderRadius: '9999px'
        }
      },
      card: {
        default: {
          background: '#ffffff',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }
      }
    },

    layout: {
      container: { maxWidth: '1200px', padding: '0 24px' },
      breakpoints: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px' }
    },

    files: {
      css: 'template.css',
      js: 'template.js'
    }
  };
}

function generateTemplateCSS(siteName, tokens) {
  let css = `/**
 * ${siteName} Template - Design System CSS
 * Auto-generated from clone
 */

/* ============================================
   CSS VARIABLES (Design Tokens)
   ============================================ */

:root {
`;

  // Add color variables
  const addVars = (obj, prefix = '') => {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object') {
        addVars(value, prefix + key + '-');
      } else {
        css += `  --${prefix}${key}: ${value};\n`;
      }
    }
  };

  addVars(tokens.colors, 'color-');
  addVars(tokens.typography.fontSize, 'font-size-');
  addVars(tokens.spacing, 'space-');
  addVars(tokens.borderRadius, 'radius-');

  css += `}

/* ============================================
   BASE STYLES
   ============================================ */

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
}

body {
  font-family: ${tokens.typography.fontFamily.primary || "'Helvetica Neue', Arial, sans-serif"};
  line-height: 1.5;
  color: #1a1a1a;
}

/* ============================================
   TYPOGRAPHY
   ============================================ */

.headline-hero { font-size: var(--font-size-hero, 64px); font-weight: 700; line-height: 1.1; }
.headline-xl { font-size: var(--font-size-5xl, 48px); font-weight: 700; }
.headline-lg { font-size: var(--font-size-4xl, 36px); font-weight: 700; }
.headline-md { font-size: var(--font-size-3xl, 28px); font-weight: 600; }
.text-lg { font-size: var(--font-size-lg, 18px); line-height: 1.6; }
.text-base { font-size: var(--font-size-base, 16px); }
.text-sm { font-size: var(--font-size-sm, 14px); }

/* ============================================
   LAYOUT
   ============================================ */

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}

.section { padding: 80px 0; }

.grid { display: grid; gap: 24px; }
.grid-2 { grid-template-columns: repeat(2, 1fr); }
.grid-3 { grid-template-columns: repeat(3, 1fr); }
.grid-4 { grid-template-columns: repeat(4, 1fr); }

.flex { display: flex; }
.flex-center { display: flex; align-items: center; justify-content: center; }
.flex-between { display: flex; align-items: center; justify-content: space-between; }

/* ============================================
   HERO
   ============================================ */

.hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.hero__gradient {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.hero__gradient canvas {
  width: 100%;
  height: 100%;
}

.hero__content {
  position: relative;
  z-index: 1;
  text-align: center;
  max-width: 800px;
  padding: 32px;
}

/* ============================================
   BUTTONS
   ============================================ */

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  border-radius: 9999px;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary {
  background: var(--color-primary, #635bff);
  color: #fff;
}

.btn-primary:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.btn-secondary {
  background: transparent;
  color: var(--color-primary, #635bff);
  border: 1px solid currentColor;
}

/* ============================================
   CARDS
   ============================================ */

.card {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transition: all 0.2s ease;
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
}

/* ============================================
   ANIMATIONS
   ============================================ */

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

[data-animate] { opacity: 0; }
[data-animate].visible { animation: var(--animation, fadeIn) 0.6s ease forwards; }
[data-animate="slideUp"].visible { --animation: slideUp; }

/* ============================================
   UTILITIES
   ============================================ */

.text-center { text-align: center; }
.text-white { color: #fff; }
.text-muted { color: #666; }
.bg-dark { background: #0a0a0a; }
.bg-white { background: #fff; }
.mt-sm { margin-top: 8px; }
.mt-md { margin-top: 16px; }
.mt-lg { margin-top: 24px; }
.mb-sm { margin-bottom: 8px; }
.mb-md { margin-bottom: 16px; }
.mb-lg { margin-bottom: 24px; }

/* ============================================
   RESPONSIVE
   ============================================ */

@media (max-width: 768px) {
  .headline-hero { font-size: 40px; }
  .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
  .section { padding: 60px 0; }
}
`;

  return css;
}

function generateTemplateJS(siteName, shader) {
  let js = `/**
 * ${siteName} Template - JavaScript Module
 * Auto-generated from clone
 */

`;

  // Add shader class if shader data exists
  if (shader && shader.vertexShader) {
    js += `// ============================================
// GRADIENT SHADER
// ============================================

class GradientShader {
  constructor(canvas, config = {}) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
    if (!this.gl) throw new Error('WebGL not supported');

    this.config = {
      baseColor: [0.5, 0.3, 0.9],
      waveColors: [[1, 0.2, 0.4], [0.3, 0.8, 1], [1, 0.8, 0.3]],
      speed: 1.0,
      ...config
    };

    this.init();
  }

  init() {
    const gl = this.gl;

    // Vertex shader
    const vertexSource = \`${shader.vertexShader.replace(/`/g, '\\`')}\`;

    // Fragment shader
    const fragmentSource = \`${shader.fragmentShader.replace(/`/g, '\\`')}\`;

    // Compile shaders
    const vs = this.createShader(gl.VERTEX_SHADER, vertexSource);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);

    if (!vs || !fs) {
      console.error('Shader compilation failed');
      return;
    }

    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('Program link failed:', gl.getProgramInfoLog(this.program));
      return;
    }

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
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader error:', this.gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  createGeometry() {
    const gl = this.gl;
    this.density = 100;
    this.positions = [];
    this.uvs = [];
    this.uvNorms = [];
    this.indices = [];

    for (let y = 0; y <= this.density; y++) {
      for (let x = 0; x <= this.density; x++) {
        const u = x / this.density;
        const v = y / this.density;
        this.positions.push((u - 0.5) * this.canvas.width, (v - 0.5) * this.canvas.height, 0);
        this.uvs.push(u, v);
        this.uvNorms.push(u * 2 - 1, v * 2 - 1);
      }
    }

    for (let y = 0; y < this.density; y++) {
      for (let x = 0; x < this.density; x++) {
        const i = y * (this.density + 1) + x;
        this.indices.push(i, i + 1, i + this.density + 1);
        this.indices.push(i + 1, i + this.density + 2, i + this.density + 1);
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

    // Get uniform locations
    this.uniforms = {};
    const uniformNames = ${JSON.stringify(shader.uniforms || [])};
    uniformNames.forEach(name => {
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    });
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

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

  render = () => {
    const gl = this.gl;
    const time = performance.now() - this.start;
    const w = this.canvas.width, h = this.canvas.height;

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);

    // Set uniforms (customize based on extracted values)
    if (this.uniforms.resolution) gl.uniform2f(this.uniforms.resolution, w, h);
    if (this.uniforms.u_time) gl.uniform1f(this.uniforms.u_time, time * this.config.speed);

    // Bind attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    if (this.posLoc >= 0) {
      gl.enableVertexAttribArray(this.posLoc);
      gl.vertexAttribPointer(this.posLoc, 3, gl.FLOAT, false, 0, 0);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    if (this.uvLoc >= 0) {
      gl.enableVertexAttribArray(this.uvLoc);
      gl.vertexAttribPointer(this.uvLoc, 2, gl.FLOAT, false, 0, 0);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvNormBuffer);
    if (this.uvNormLoc >= 0) {
      gl.enableVertexAttribArray(this.uvNormLoc);
      gl.vertexAttribPointer(this.uvNormLoc, 2, gl.FLOAT, false, 0, 0);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_SHORT, 0);

    requestAnimationFrame(this.render);
  }
}

`;
  }

  // Add scroll animations
  js += `// ============================================
// SCROLL ANIMATIONS
// ============================================

class ScrollAnimations {
  constructor(options = {}) {
    this.threshold = options.threshold || 0.2;
    this.observer = new IntersectionObserver(
      (entries) => this.handleIntersection(entries),
      { threshold: this.threshold }
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
        const delay = entry.target.dataset.delay || 0;
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, parseFloat(delay) * 1000);
        this.observer.unobserve(entry.target);
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
    this.prefix = element.dataset.prefix || '';
    this.suffix = element.dataset.suffix || '';
    this.decimals = parseInt(element.dataset.decimals) || 0;
  }

  start() {
    const startTime = performance.now();
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / this.duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = this.target * eased;
      this.element.textContent = this.prefix + current.toFixed(this.decimals) + this.suffix;
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }
}

// ============================================
// AUTO-INIT
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Init gradient shader
  document.querySelectorAll('[data-gradient], .gradient-canvas').forEach(canvas => {
    if (typeof GradientShader !== 'undefined') {
      new GradientShader(canvas, window.GRADIENT_CONFIG || {});
    }
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

// Exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ${shader ? 'GradientShader, ' : ''}ScrollAnimations, NumberCounter };
}
if (typeof window !== 'undefined') {
  window.Template = { ${shader ? 'GradientShader, ' : ''}ScrollAnimations, NumberCounter };
}
`;

  return js;
}

function generateExampleHTML(siteName) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Template Example - ${siteName} Style</title>
  <link rel="stylesheet" href="template.css">
  <script>
    // Customize gradient colors (optional)
    window.GRADIENT_CONFIG = {
      speed: 1.0
    };
  </script>
</head>
<body>

  <!-- HERO -->
  <section class="hero bg-dark">
    <div class="hero__gradient">
      <canvas class="gradient-canvas" data-gradient></canvas>
    </div>
    <div class="hero__content text-white">
      <h1 class="headline-hero">Your Headline Here</h1>
      <p class="text-lg mt-md" style="opacity: 0.8;">
        Your subheadline text goes here. Make it compelling.
      </p>
      <div class="flex-center mt-lg" style="gap: 16px;">
        <a href="#" class="btn btn-primary">Get Started</a>
        <a href="#" class="btn btn-secondary" style="color: #fff; border-color: #fff;">Learn More</a>
      </div>
    </div>
  </section>

  <!-- FEATURES -->
  <section class="section">
    <div class="container">
      <div class="text-center mb-lg" data-animate="slideUp">
        <h2 class="headline-lg">Features</h2>
        <p class="text-muted mt-sm">Everything you need</p>
      </div>
      <div class="grid grid-3">
        <div class="card" data-animate="slideUp" data-delay="0.1">
          <h3 class="headline-md">Feature One</h3>
          <p class="text-muted mt-sm">Description of the first feature.</p>
        </div>
        <div class="card" data-animate="slideUp" data-delay="0.2">
          <h3 class="headline-md">Feature Two</h3>
          <p class="text-muted mt-sm">Description of the second feature.</p>
        </div>
        <div class="card" data-animate="slideUp" data-delay="0.3">
          <h3 class="headline-md">Feature Three</h3>
          <p class="text-muted mt-sm">Description of the third feature.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- STATS -->
  <section class="section bg-dark text-white">
    <div class="container">
      <div class="grid grid-4 text-center">
        <div>
          <div class="headline-xl" data-counter data-target="99" data-suffix="%">0</div>
          <p class="text-muted mt-sm">Uptime</p>
        </div>
        <div>
          <div class="headline-xl" data-counter data-target="10000" data-suffix="+">0</div>
          <p class="text-muted mt-sm">Users</p>
        </div>
        <div>
          <div class="headline-xl" data-counter data-target="50" data-suffix="M">0</div>
          <p class="text-muted mt-sm">Requests</p>
        </div>
        <div>
          <div class="headline-xl" data-counter data-target="24" data-suffix="/7">0</div>
          <p class="text-muted mt-sm">Support</p>
        </div>
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="section text-center">
    <div class="container" data-animate="slideUp">
      <h2 class="headline-lg">Ready to get started?</h2>
      <p class="text-muted mt-sm mb-lg">Join thousands of happy users.</p>
      <a href="#" class="btn btn-primary">Start Free Trial</a>
    </div>
  </section>

  <script src="template.js"></script>
</body>
</html>
`;
}

// ============================================
// MAIN
// ============================================

async function generateTemplate(cloneDir) {
  const siteName = path.basename(cloneDir).split('-v3')[0].replace(/-/g, ' ');
  const templateDir = path.join(cloneDir, 'template');

  console.log(`\nGenerating template for: ${siteName}`);
  console.log(`Output: ${templateDir}/`);

  // Create template directory
  fs.mkdirSync(templateDir, { recursive: true });

  // Read input files
  let cssContent = '';
  let shadersJson = null;
  let animationsJson = null;

  try {
    cssContent = fs.readFileSync(path.join(cloneDir, 'extracted-css.css'), 'utf8');
  } catch (e) {
    console.log('  No extracted-css.css found');
  }

  try {
    shadersJson = JSON.parse(fs.readFileSync(path.join(cloneDir, 'shaders.json'), 'utf8'));
  } catch (e) {
    console.log('  No shaders.json found');
  }

  try {
    animationsJson = JSON.parse(fs.readFileSync(path.join(cloneDir, 'animations.json'), 'utf8'));
  } catch (e) {
    console.log('  No animations.json found');
  }

  // Extract design tokens
  const tokens = extractDesignTokens(cssContent);
  console.log('  Extracted design tokens');

  // Process shaders
  const shader = processShaders(shadersJson);
  if (shader) {
    console.log('  Processed shader data');
  }

  // Process animations
  const animations = processAnimations(animationsJson);
  console.log('  Processed animations');

  // Generate files
  const templateJSON = generateTemplateJSON(siteName, tokens, shader, animations);
  fs.writeFileSync(path.join(templateDir, 'template.json'), JSON.stringify(templateJSON, null, 2));
  console.log('  Created template.json');

  const templateCSS = generateTemplateCSS(siteName, tokens);
  fs.writeFileSync(path.join(templateDir, 'template.css'), templateCSS);
  console.log('  Created template.css');

  const templateJS = generateTemplateJS(siteName, shader);
  fs.writeFileSync(path.join(templateDir, 'template.js'), templateJS);
  console.log('  Created template.js');

  const exampleHTML = generateExampleHTML(siteName);
  fs.writeFileSync(path.join(templateDir, 'example.html'), exampleHTML);
  console.log('  Created example.html');

  console.log(`\nTemplate generated successfully!`);
  console.log(`Files:`);
  console.log(`  ${templateDir}/template.json`);
  console.log(`  ${templateDir}/template.css`);
  console.log(`  ${templateDir}/template.js`);
  console.log(`  ${templateDir}/example.html`);

  return templateDir;
}

// CLI
const cloneDir = process.argv[2];
if (cloneDir) {
  generateTemplate(cloneDir).catch(console.error);
} else {
  console.log('Usage: node generate-template.js <clone-dir>');
  console.log('Example: node generate-template.js output/stripe.com-v3-20260108');
}

export { generateTemplate };
