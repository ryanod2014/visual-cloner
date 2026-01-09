#!/usr/bin/env node
/**
 * V4 Hybrid Extractor
 *
 * Combines V3's static extraction quality with V4's interactive detection:
 * 1. Extract actual CSS from source page stylesheets
 * 2. Download actual fonts using Playwright request API
 * 3. Capture WebGL/canvas effects with shader hooks
 * 4. Extract @keyframes animations from CSS
 * 5. Validation phase with screenshot comparison
 *
 * Usage: node v4-hybrid-extractor.js <url> [output-dir]
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'https://excalidraw.com';
const outputDir = process.argv[3] || `/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/output/v4-hybrid-${Date.now()}`;

// ============================================================
// PHASE 1: CSS EXTRACTION
// ============================================================
async function extractActualCSS(page) {
  console.log('\n[Phase 1] Extracting actual CSS from stylesheets...');

  const cssData = await page.evaluate(() => {
    const result = {
      cssRules: [],
      cssVariables: {},
      fontFaces: [],
      externalSheets: [],
      inlineStyles: []
    };

    // Extract CSS variables from :root
    const rootStyle = getComputedStyle(document.documentElement);
    const cssVarRegex = /^--/;
    for (const prop of rootStyle) {
      if (cssVarRegex.test(prop)) {
        result.cssVariables[prop] = rootStyle.getPropertyValue(prop).trim();
      }
    }

    // Extract from all stylesheets
    for (const sheet of document.styleSheets) {
      try {
        if (sheet.href) {
          result.externalSheets.push(sheet.href);
        }

        for (const rule of sheet.cssRules) {
          result.cssRules.push(rule.cssText);

          // Capture @font-face specifically
          if (rule instanceof CSSFontFaceRule) {
            result.fontFaces.push({
              cssText: rule.cssText,
              family: rule.style.fontFamily?.replace(/["']/g, ''),
              src: rule.style.src,
              weight: rule.style.fontWeight || 'normal',
              style: rule.style.fontStyle || 'normal'
            });
          }
        }
      } catch (e) {
        // Cross-origin stylesheet
        if (sheet.href) {
          result.externalSheets.push({ href: sheet.href, error: 'cross-origin' });
        }
      }
    }

    // Extract inline styles from <style> tags
    document.querySelectorAll('style').forEach((style, i) => {
      result.inlineStyles.push({
        index: i,
        content: style.textContent
      });
    });

    return result;
  });

  console.log(`   CSS Rules: ${cssData.cssRules.length}`);
  console.log(`   CSS Variables: ${Object.keys(cssData.cssVariables).length}`);
  console.log(`   Font Faces: ${cssData.fontFaces.length}`);
  console.log(`   External Sheets: ${cssData.externalSheets.length}`);

  return cssData;
}

// ============================================================
// PHASE 2: FONT DOWNLOADING
// ============================================================
async function downloadFonts(page, fontFaces) {
  console.log('\n[Phase 2] Downloading fonts via Playwright request API...');

  const fontMap = new Map();
  const fontUrls = new Set();

  // Extract font URLs from @font-face src
  for (const font of fontFaces) {
    if (font.src) {
      const urls = font.src.match(/url\(['"]?([^'")\s]+)['"]?\)/g) || [];
      for (const urlMatch of urls) {
        const cleanUrl = urlMatch.replace(/url\(['"]?|['"]?\)/g, '');
        if (cleanUrl && !cleanUrl.startsWith('data:')) {
          fontUrls.add(cleanUrl);
        }
      }
    }
  }

  console.log(`   Found ${fontUrls.size} font URLs to download`);

  let downloaded = 0;
  let failed = 0;

  for (const fontUrl of fontUrls) {
    try {
      // Use Playwright's request API to bypass CORS
      const response = await page.request.get(fontUrl, { timeout: 15000 });

      if (response.ok()) {
        const buffer = await response.body();
        const contentType = response.headers()['content-type'] || 'font/woff2';
        const base64 = `data:${contentType};base64,${buffer.toString('base64')}`;
        fontMap.set(fontUrl, {
          base64,
          size: buffer.length,
          type: contentType
        });
        downloaded++;
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
    }
  }

  console.log(`   Downloaded: ${downloaded} fonts`);
  console.log(`   Failed: ${failed} fonts`);

  return fontMap;
}

// ============================================================
// PHASE 3: WEBGL SHADER EXTRACTION
// ============================================================
async function setupShaderCapture(context) {
  console.log('\n[Phase 3] Setting up WebGL shader capture hooks...');

  // This MUST be called before page.goto()
  await context.addInitScript(() => {
    window.__capturedShaders = [];
    window.__capturedUniforms = [];
    window.__glContexts = new WeakMap();

    // Track canvas -> GL context mapping
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(contextType, ...args) {
      const ctx = originalGetContext.call(this, contextType, ...args);
      if (ctx && (contextType === 'webgl' || contextType === 'webgl2' || contextType === 'experimental-webgl')) {
        window.__glContexts.set(ctx, this);
      }
      return ctx;
    };

    // Hook WebGLRenderingContext.shaderSource
    const originalShaderSource = WebGLRenderingContext.prototype.shaderSource;
    WebGLRenderingContext.prototype.shaderSource = function(shader, source) {
      try {
        const type = this.getShaderParameter(shader, this.SHADER_TYPE);
        const canvas = window.__glContexts.get(this);
        window.__capturedShaders.push({
          type: type === this.VERTEX_SHADER ? 'vertex' : 'fragment',
          source: source,
          timestamp: Date.now(),
          context: 'webgl',
          canvasId: canvas?.id || null,
          canvasClass: canvas?.className || null
        });
      } catch (e) {}
      return originalShaderSource.call(this, shader, source);
    };

    // Hook WebGL2RenderingContext.shaderSource
    if (window.WebGL2RenderingContext) {
      const originalShaderSource2 = WebGL2RenderingContext.prototype.shaderSource;
      WebGL2RenderingContext.prototype.shaderSource = function(shader, source) {
        try {
          const type = this.getShaderParameter(shader, this.SHADER_TYPE);
          const canvas = window.__glContexts.get(this);
          window.__capturedShaders.push({
            type: type === this.VERTEX_SHADER ? 'vertex' : 'fragment',
            source: source,
            timestamp: Date.now(),
            context: 'webgl2',
            canvasId: canvas?.id || null,
            canvasClass: canvas?.className || null
          });
        } catch (e) {}
        return originalShaderSource2.call(this, shader, source);
      };
    }

    // Track uniform names
    const originalGetUniformLocation = WebGLRenderingContext.prototype.getUniformLocation;
    WebGLRenderingContext.prototype.getUniformLocation = function(program, name) {
      const location = originalGetUniformLocation.call(this, program, name);
      if (location) {
        window.__capturedUniforms.push({ name, timestamp: Date.now() });
      }
      return location;
    };

    if (window.WebGL2RenderingContext) {
      const originalGetUniformLocation2 = WebGL2RenderingContext.prototype.getUniformLocation;
      WebGL2RenderingContext.prototype.getUniformLocation = function(program, name) {
        const location = originalGetUniformLocation2.call(this, program, name);
        if (location) {
          window.__capturedUniforms.push({ name, timestamp: Date.now() });
        }
        return location;
      };
    }
  });

  console.log('   Shader hooks injected (will capture on page load)');
}

async function extractCapturedShaders(page) {
  const shaderData = await page.evaluate(() => {
    const shaders = window.__capturedShaders || [];
    const uniforms = window.__capturedUniforms || [];

    // Get canvas info
    const canvases = Array.from(document.querySelectorAll('canvas')).map(c => {
      const rect = c.getBoundingClientRect();
      const style = getComputedStyle(c);
      return {
        id: c.id,
        className: c.className,
        width: c.width,
        height: c.height,
        displayWidth: rect.width,
        displayHeight: rect.height,
        isVisible: rect.width > 10 && rect.height > 10 &&
                   style.display !== 'none' &&
                   style.visibility !== 'hidden'
      };
    });

    // Check for Three.js
    const threeJs = window.THREE ? { version: window.THREE.REVISION } : null;

    return { shaders, uniforms, canvases, threeJs };
  });

  console.log(`   Shaders captured: ${shaderData.shaders.length}`);
  console.log(`   Uniforms tracked: ${shaderData.uniforms.length}`);
  console.log(`   Canvases found: ${shaderData.canvases.length}`);
  console.log(`   Three.js: ${shaderData.threeJs ? `Yes (r${shaderData.threeJs.version})` : 'No'}`);

  // Parse uniforms from shader source
  shaderData.shaders = shaderData.shaders.map(shader => {
    const uniforms = [];
    const regex = /uniform\s+(float|int|vec2|vec3|vec4|mat3|mat4|sampler2D)\s+(\w+)/g;
    let match;
    while ((match = regex.exec(shader.source)) !== null) {
      uniforms.push({ type: match[1], name: match[2] });
    }
    return { ...shader, parsedUniforms: uniforms };
  });

  return shaderData;
}

// ============================================================
// PHASE 4: CSS ANIMATION EXTRACTION
// ============================================================
async function extractAnimations(page) {
  console.log('\n[Phase 4] Extracting CSS animations and transitions...');

  const animationData = await page.evaluate(() => {
    const result = {
      keyframes: [],
      animatedElements: [],
      transitionElements: [],
      jsAnimationCandidates: []
    };

    // Extract @keyframes rules
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSKeyframesRule) {
            // Extract all keyframe steps
            const steps = [];
            for (const keyframe of rule.cssRules) {
              steps.push({
                keyText: keyframe.keyText,
                cssText: keyframe.cssText,
                style: keyframe.style.cssText
              });
            }
            result.keyframes.push({
              name: rule.name,
              cssText: rule.cssText,
              steps
            });
          }
        }
      } catch (e) {}
    }

    // Find elements with CSS animations
    document.querySelectorAll('*').forEach(el => {
      const style = getComputedStyle(el);
      const className = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');

      // CSS animations
      if (style.animationName && style.animationName !== 'none') {
        result.animatedElements.push({
          tag: el.tagName.toLowerCase(),
          className: className.split(' ')[0],
          animationName: style.animationName,
          animationDuration: style.animationDuration,
          animationTimingFunction: style.animationTimingFunction,
          animationIterationCount: style.animationIterationCount,
          animationDelay: style.animationDelay
        });
      }

      // Transitions
      if (style.transition && style.transition !== 'all 0s ease 0s' && style.transition !== 'none') {
        result.transitionElements.push({
          tag: el.tagName.toLowerCase(),
          className: className.split(' ')[0],
          transition: style.transition
        });
      }

      // JS animation candidates (elements with opacity 0 or transform that suggests animation)
      const opacity = parseFloat(style.opacity);
      const transform = style.transform;
      const hasTransition = style.transition && style.transition !== 'none';

      if (hasTransition && (opacity === 0 ||
          (transform !== 'none' && (transform.includes('scale(0') || transform.includes('translate'))))) {
        result.jsAnimationCandidates.push({
          tag: el.tagName.toLowerCase(),
          className: className.split(' ')[0],
          initialState: {
            opacity: style.opacity,
            transform: style.transform
          },
          transition: style.transition,
          suggestedFix: 'Convert to CSS @keyframes animation'
        });
      }
    });

    return result;
  });

  console.log(`   @keyframes rules: ${animationData.keyframes.length}`);
  console.log(`   Animated elements: ${animationData.animatedElements.length}`);
  console.log(`   Transition elements: ${animationData.transitionElements.length}`);
  console.log(`   JS animation candidates: ${animationData.jsAnimationCandidates.length}`);

  // Generate CSS for JS animation candidates
  animationData.generatedKeyframes = animationData.jsAnimationCandidates.map((candidate, i) => {
    const name = `auto-animate-${i}`;
    const initial = candidate.initialState;

    return {
      name,
      selector: `.${candidate.className}`,
      keyframes: `@keyframes ${name} {
  0% {
    opacity: ${initial.opacity};
    transform: ${initial.transform};
  }
  100% {
    opacity: 1;
    transform: none;
  }
}`,
      usage: `animation: ${name} 0.6s ease forwards;`
    };
  });

  return animationData;
}

// ============================================================
// PHASE 5: VALIDATION WITH SCREENSHOTS
// ============================================================
async function validateWithScreenshots(page, outputDir, originalUrl) {
  console.log('\n[Phase 5] Taking validation screenshots...');

  // Ensure output directory exists
  fs.mkdirSync(path.join(outputDir, 'validation'), { recursive: true });

  // Take original screenshot
  await page.screenshot({
    path: path.join(outputDir, 'validation', 'original-fullpage.png'),
    fullPage: true
  });
  console.log('   Original screenshot saved');

  // Take viewport screenshot
  await page.screenshot({
    path: path.join(outputDir, 'validation', 'original-viewport.png')
  });
  console.log('   Original viewport screenshot saved');

  // Get page dimensions for comparison metadata
  const dimensions = await page.evaluate(() => ({
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    page: {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight
    }
  }));

  return {
    originalScreenshots: {
      fullpage: 'validation/original-fullpage.png',
      viewport: 'validation/original-viewport.png'
    },
    dimensions,
    timestamp: new Date().toISOString()
  };
}

async function compareCloneToOriginal(page, clonePath, outputDir) {
  // Navigate to clone
  await page.goto(`file://${clonePath}`);
  await page.waitForTimeout(2000);

  // Take clone screenshots
  await page.screenshot({
    path: path.join(outputDir, 'validation', 'clone-fullpage.png'),
    fullPage: true
  });
  await page.screenshot({
    path: path.join(outputDir, 'validation', 'clone-viewport.png')
  });

  console.log('   Clone screenshots saved');
  console.log('   Compare: validation/original-*.png vs validation/clone-*.png');
}

// ============================================================
// ASSET EXTRACTION
// ============================================================
async function extractAssets(page) {
  console.log('\n[Bonus] Extracting images and SVGs...');

  const assets = await page.evaluate(() => {
    const result = { images: [], svgs: [], backgroundImages: [] };

    // Images
    document.querySelectorAll('img').forEach(img => {
      if (img.src && !img.src.startsWith('data:')) {
        result.images.push({
          src: img.src,
          alt: img.alt,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height
        });
      }
    });

    // Inline SVGs
    document.querySelectorAll('svg').forEach((svg, i) => {
      result.svgs.push({
        index: i,
        outerHTML: svg.outerHTML,
        width: svg.getAttribute('width'),
        height: svg.getAttribute('height'),
        viewBox: svg.getAttribute('viewBox')
      });
    });

    // Background images
    document.querySelectorAll('*').forEach(el => {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none' && bg.includes('url(')) {
        const urls = bg.match(/url\(['"]?([^'")\s]+)['"]?\)/g) || [];
        urls.forEach(url => {
          const cleanUrl = url.replace(/url\(['"]?|['"]?\)/g, '');
          if (!result.backgroundImages.includes(cleanUrl) && !cleanUrl.startsWith('data:')) {
            result.backgroundImages.push(cleanUrl);
          }
        });
      }
    });

    return result;
  });

  console.log(`   Images: ${assets.images.length}`);
  console.log(`   Inline SVGs: ${assets.svgs.length}`);
  console.log(`   Background images: ${assets.backgroundImages.length}`);

  return assets;
}

async function downloadImages(page, images) {
  console.log('\n[Bonus] Downloading images...');

  const imageMap = new Map();
  let downloaded = 0;
  let failed = 0;

  const uniqueUrls = [...new Set(images.map(img => img.src))];

  for (const imgUrl of uniqueUrls) {
    try {
      const response = await page.request.get(imgUrl, { timeout: 10000 });
      if (response.ok()) {
        const buffer = await response.body();
        const contentType = response.headers()['content-type'] || 'image/png';
        imageMap.set(imgUrl, `data:${contentType};base64,${buffer.toString('base64')}`);
        downloaded++;
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
    }
  }

  console.log(`   Downloaded: ${downloaded} images`);
  console.log(`   Failed: ${failed} images`);

  return imageMap;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('V4 Hybrid Extractor');
  console.log('Combining V3 static quality + V4 interactive detection');
  console.log('='.repeat(60));
  console.log(`URL: ${url}`);
  console.log(`Output: ${outputDir}`);

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  // PHASE 3 MUST BE FIRST: Setup shader hooks BEFORE navigation
  await setupShaderCapture(context);

  const page = await context.newPage();

  console.log('\nNavigating to page...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for WebGL to initialize
  await page.waitForTimeout(3000);

  // Scroll to trigger lazy loading
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < pageHeight; y += 500) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);

  // Run all extraction phases
  const cssData = await extractActualCSS(page);
  const fontMap = await downloadFonts(page, cssData.fontFaces);
  const shaderData = await extractCapturedShaders(page);
  const animationData = await extractAnimations(page);
  const validationData = await validateWithScreenshots(page, outputDir, url);
  const assets = await extractAssets(page);
  const imageMap = await downloadImages(page, assets.images);

  await browser.close();

  // ============================================================
  // SAVE ALL EXTRACTED DATA
  // ============================================================
  console.log('\n[Saving] Writing extracted data...');

  // 1. CSS data
  fs.writeFileSync(
    path.join(outputDir, 'extracted-css.css'),
    cssData.cssRules.join('\n')
  );
  fs.writeFileSync(
    path.join(outputDir, 'css-variables.json'),
    JSON.stringify(cssData.cssVariables, null, 2)
  );

  // 2. Font data (with base64 embedded)
  const fontData = {
    fontFaces: cssData.fontFaces,
    downloaded: Object.fromEntries(fontMap)
  };
  fs.writeFileSync(
    path.join(outputDir, 'fonts.json'),
    JSON.stringify(fontData, null, 2)
  );

  // Generate font-face CSS with embedded fonts
  let embeddedFontCSS = '/* Embedded Fonts */\n';
  for (const font of cssData.fontFaces) {
    if (font.src) {
      let newSrc = font.src;
      for (const [originalUrl, data] of fontMap) {
        if (font.src.includes(originalUrl)) {
          newSrc = newSrc.replace(originalUrl, data.base64);
        }
      }
      embeddedFontCSS += `@font-face {
  font-family: "${font.family}";
  src: ${newSrc};
  font-weight: ${font.weight};
  font-style: ${font.style};
}\n`;
    }
  }
  fs.writeFileSync(path.join(outputDir, 'embedded-fonts.css'), embeddedFontCSS);

  // 3. Shader data
  fs.writeFileSync(
    path.join(outputDir, 'shaders.json'),
    JSON.stringify({
      meta: {
        source: url,
        extractedAt: new Date().toISOString()
      },
      ...shaderData
    }, null, 2)
  );

  // Generate shader demo if shaders found
  if (shaderData.shaders.length >= 2) {
    const vertex = shaderData.shaders.find(s => s.type === 'vertex');
    const fragment = shaderData.shaders.find(s => s.type === 'fragment');
    if (vertex && fragment) {
      const shaderDemo = `<!DOCTYPE html>
<html>
<head>
  <title>Extracted Shaders</title>
  <style>
    * { margin: 0; padding: 0; }
    canvas { width: 100vw; height: 100vh; display: block; }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <script>
    const canvas = document.getElementById('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

    const vertexSource = ${JSON.stringify(vertex.source)};
    const fragmentSource = ${JSON.stringify(fragment.source)};

    function createShader(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    }

    const vs = createShader(gl.VERTEX_SHADER, vertexSource);
    const fs = createShader(gl.FRAGMENT_SHADER, fragmentSource);

    if (vs && fs) {
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      // Basic fullscreen quad
      const positions = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

      const posLoc = gl.getAttribLocation(program, 'position');
      const timeLoc = gl.getUniformLocation(program, 'time');
      const widthLoc = gl.getUniformLocation(program, 'width');
      const heightLoc = gl.getUniformLocation(program, 'height');

      function resize() {
        canvas.width = window.innerWidth * devicePixelRatio;
        canvas.height = window.innerHeight * devicePixelRatio;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
      resize();
      window.addEventListener('resize', resize);

      const start = performance.now();
      function render() {
        gl.useProgram(program);
        if (timeLoc) gl.uniform1f(timeLoc, (performance.now() - start) / 1000);
        if (widthLoc) gl.uniform1f(widthLoc, canvas.width);
        if (heightLoc) gl.uniform1f(heightLoc, canvas.height);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        requestAnimationFrame(render);
      }
      render();
    }
  </script>
</body>
</html>`;
      fs.writeFileSync(path.join(outputDir, 'shader-demo.html'), shaderDemo);
      console.log('   Generated shader-demo.html');
    }
  }

  // 4. Animation data
  fs.writeFileSync(
    path.join(outputDir, 'animations.json'),
    JSON.stringify({
      meta: {
        source: url,
        extractedAt: new Date().toISOString()
      },
      ...animationData
    }, null, 2)
  );

  // Generate animation CSS
  let animationCSS = '/* Extracted Animations */\n\n';
  for (const kf of animationData.keyframes) {
    animationCSS += kf.cssText + '\n\n';
  }
  animationCSS += '\n/* Generated animations for JS candidates */\n\n';
  for (const gen of animationData.generatedKeyframes) {
    animationCSS += gen.keyframes + '\n\n';
  }
  fs.writeFileSync(path.join(outputDir, 'animations.css'), animationCSS);

  // 5. Validation data
  fs.writeFileSync(
    path.join(outputDir, 'validation', 'metadata.json'),
    JSON.stringify(validationData, null, 2)
  );

  // 6. Assets
  fs.writeFileSync(
    path.join(outputDir, 'assets.json'),
    JSON.stringify({
      images: assets.images,
      svgs: assets.svgs.length,
      backgroundImages: assets.backgroundImages,
      downloadedImages: Object.fromEntries(imageMap)
    }, null, 2)
  );

  // Save SVGs
  fs.mkdirSync(path.join(outputDir, 'svgs'), { recursive: true });
  assets.svgs.forEach((svg, i) => {
    fs.writeFileSync(
      path.join(outputDir, 'svgs', `svg-${i}.svg`),
      svg.outerHTML
    );
  });

  // ============================================================
  // GENERATE COMBINED OUTPUT
  // ============================================================

  // Create design tokens summary
  const designTokens = {
    colors: {},
    typography: {},
    spacing: {},
    animation: {}
  };

  // Extract colors from CSS variables
  for (const [name, value] of Object.entries(cssData.cssVariables)) {
    if (name.includes('color') || value.match(/^#|^rgb|^hsl/)) {
      designTokens.colors[name] = value;
    } else if (name.includes('font') || name.includes('size')) {
      designTokens.typography[name] = value;
    } else if (name.includes('space') || name.includes('gap') || name.includes('padding')) {
      designTokens.spacing[name] = value;
    }
  }

  // Add animation tokens
  designTokens.animation = {
    keyframes: animationData.keyframes.map(k => k.name),
    transitionCount: animationData.transitionElements.length
  };

  fs.writeFileSync(
    path.join(outputDir, 'design-tokens.json'),
    JSON.stringify(designTokens, null, 2)
  );

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('EXTRACTION COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nSource: ${url}`);
  console.log(`Output: ${outputDir}/`);
  console.log('\nFiles:');
  console.log('  extracted-css.css      - All CSS rules');
  console.log('  css-variables.json     - CSS custom properties');
  console.log('  embedded-fonts.css     - Fonts with base64 embedded');
  console.log('  fonts.json             - Font face data');
  console.log('  shaders.json           - WebGL shaders');
  if (shaderData.shaders.length >= 2) {
    console.log('  shader-demo.html       - Standalone shader demo');
  }
  console.log('  animations.json        - Animation data');
  console.log('  animations.css         - Keyframes CSS');
  console.log('  assets.json            - Images and SVGs');
  console.log('  design-tokens.json     - Extracted design tokens');
  console.log('  validation/            - Screenshots for comparison');
  console.log('  svgs/                  - Extracted SVG files');

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`CSS Rules:        ${cssData.cssRules.length}`);
  console.log(`CSS Variables:    ${Object.keys(cssData.cssVariables).length}`);
  console.log(`Fonts Downloaded: ${fontMap.size}`);
  console.log(`Shaders Captured: ${shaderData.shaders.length}`);
  console.log(`Keyframes:        ${animationData.keyframes.length}`);
  console.log(`SVGs Extracted:   ${assets.svgs.length}`);
  console.log(`Images:           ${imageMap.size}`);
  console.log('\n');
}

main().catch(console.error);
