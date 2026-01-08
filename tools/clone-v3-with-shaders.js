#!/usr/bin/env node
/**
 * Clone V3 with WebGL Shader Extraction
 * Full source extraction approach with shader interception
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { generateTemplate } from './generate-template.js';

const url = process.argv[2] || 'https://vercel.com';
const domain = new URL(url).hostname.replace('www.', '');
const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
const outputDir = `/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/output/${domain}-v3-${timestamp}`;

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Clone V3 with Shader Extraction`);
  console.log(`URL: ${url}`);
  console.log(`Output: ${outputDir}`);
  console.log('='.repeat(60));

  // Create output directories
  fs.mkdirSync(`${outputDir}/assets/fonts`, { recursive: true });
  fs.mkdirSync(`${outputDir}/assets/images`, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // === PHASE 0: Inject Shader Hooks BEFORE Navigation ===
  console.log('\n[Phase 0] Setting up shader interception...');

  await page.addInitScript(() => {
    window.__capturedShaders = [];
    window.__capturedUniforms = [];
    window.__glContextToCanvas = new WeakMap();

    // Track canvas -> GL context mapping
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(contextType, ...args) {
      const ctx = originalGetContext.call(this, contextType, ...args);
      if (ctx && (contextType === 'webgl' || contextType === 'webgl2' || contextType === 'experimental-webgl')) {
        window.__glContextToCanvas.set(ctx, this);
      }
      return ctx;
    };

    // Helper to check if canvas is visible
    const isCanvasVisible = (canvas) => {
      if (!canvas) return false;
      const rect = canvas.getBoundingClientRect();
      const style = getComputedStyle(canvas);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        parseFloat(style.opacity) > 0
      );
    };

    // Hook WebGLRenderingContext.shaderSource
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
          // We'll check visibility later when extraction runs
          _glContext: this
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
          const canvas = window.__glContextToCanvas.get(this);
          window.__capturedShaders.push({
            type: type === this.VERTEX_SHADER ? 'vertex' : 'fragment',
            source: source,
            timestamp: Date.now(),
            context: 'webgl2',
            canvasId: canvas?.id || null,
            canvasClass: canvas?.className || null,
            _glContext: this
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
        const canvas = window.__glContextToCanvas.get(this);
        window.__capturedUniforms.push({
          name,
          timestamp: Date.now(),
          canvasId: canvas?.id || null
        });
      }
      return location;
    };

    if (window.WebGL2RenderingContext) {
      const originalGetUniformLocation2 = WebGL2RenderingContext.prototype.getUniformLocation;
      WebGL2RenderingContext.prototype.getUniformLocation = function(program, name) {
        const location = originalGetUniformLocation2.call(this, program, name);
        if (location) {
          const canvas = window.__glContextToCanvas.get(this);
          window.__capturedUniforms.push({
            name,
            timestamp: Date.now(),
            canvasId: canvas?.id || null
          });
        }
        return location;
      };
    }
  });

  // === Navigate ===
  console.log('[Phase 0] Navigating to page...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for WebGL to initialize
  console.log('[Phase 0] Waiting for WebGL initialization...');
  await page.waitForTimeout(5000);

  // Scroll to trigger lazy loading
  console.log('[Phase 0] Triggering lazy content...');
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < pageHeight; y += 500) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);

  // Take reference screenshot
  console.log('[Phase 0] Taking reference screenshot...');
  await page.screenshot({ path: `${outputDir}/reference.png`, fullPage: true });

  // === PHASE 1: Extract Source ===
  console.log('\n[Phase 1] Extracting source...');

  // 1.1 Extract HTML
  const { html, doctype, title, htmlAttrs } = await page.evaluate(() => {
    // Extract all attributes from the <html> element
    const htmlElement = document.documentElement;
    const attrs = [];
    for (const attr of htmlElement.attributes) {
      // Skip style attribute as we'll handle CSS separately
      if (attr.name !== 'style') {
        attrs.push(`${attr.name}="${attr.value.replace(/"/g, '&quot;')}"`);
      }
    }
    return {
      html: htmlElement.outerHTML,
      doctype: document.doctype ? `<!DOCTYPE ${document.doctype.name}>` : '<!DOCTYPE html>',
      title: document.title,
      htmlAttrs: attrs.join(' ')
    };
  });
  fs.writeFileSync(`${outputDir}/raw-source.html`, doctype + '\n' + html);
  console.log(`   HTML extracted: ${(html.length / 1024).toFixed(1)}KB`);

  // 1.2 Extract CSS
  const cssData = await page.evaluate(() => {
    const allCSS = [];
    const fontFaces = [];
    const externalSheets = [];

    for (const sheet of document.styleSheets) {
      try {
        if (sheet.href) {
          externalSheets.push(sheet.href);
        }
        for (const rule of sheet.cssRules) {
          allCSS.push(rule.cssText);
          if (rule instanceof CSSFontFaceRule) {
            fontFaces.push({
              cssText: rule.cssText,
              family: rule.style.fontFamily,
              src: rule.style.src
            });
          }
        }
      } catch (e) {
        if (sheet.href) {
          externalSheets.push({ href: sheet.href, error: 'cross-origin' });
        }
      }
    }

    return { cssRules: allCSS, fontFaces, externalSheets, totalRules: allCSS.length };
  });
  fs.writeFileSync(`${outputDir}/extracted-css.css`, cssData.cssRules.join('\n'));
  console.log(`   CSS extracted: ${cssData.totalRules} rules`);
  console.log(`   Font faces: ${cssData.fontFaces.length}`);

  // 1.3 Extract Assets
  const assets = await page.evaluate(() => {
    const result = { images: [], svgs: [], backgroundImages: [], fonts: [] };

    // Images
    document.querySelectorAll('img').forEach(img => {
      if (img.src) {
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
        height: svg.getAttribute('height')
      });
    });

    // Background images
    document.querySelectorAll('*').forEach(el => {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none' && bg.includes('url(')) {
        const urls = bg.match(/url\(['"]?([^'")\s]+)['"]?\)/g);
        if (urls) {
          urls.forEach(url => {
            const cleanUrl = url.replace(/url\(['"]?|['"]?\)/g, '');
            if (!result.backgroundImages.includes(cleanUrl)) {
              result.backgroundImages.push(cleanUrl);
            }
          });
        }
      }
    });

    return result;
  });
  console.log(`   Images: ${assets.images.length}`);
  console.log(`   SVGs: ${assets.svgs.length}`);
  console.log(`   Background images: ${assets.backgroundImages.length}`);

  // === PHASE 2: Download and Embed Images (using Playwright request to bypass CORS) ===
  console.log('\n[Phase 2] Downloading images...');

  const imageMap = new Map(); // originalUrl -> base64
  let downloadedCount = 0;
  let failedCount = 0;

  // Get unique image URLs
  const uniqueUrls = [...new Set(assets.images.map(img => img.src).filter(src => src && !src.startsWith('data:')))];

  for (const imgUrl of uniqueUrls) {
    try {
      // Use Playwright's request API to bypass CORS
      const response = await page.request.get(imgUrl, {
        timeout: 10000
      });

      if (response.ok()) {
        const buffer = await response.body();
        const contentType = response.headers()['content-type'] || 'image/png';
        const base64 = `data:${contentType};base64,${buffer.toString('base64')}`;
        imageMap.set(imgUrl, base64);
        downloadedCount++;
      } else {
        failedCount++;
      }
    } catch (e) {
      failedCount++;
    }
  }

  console.log(`   Downloaded: ${downloadedCount} images`);
  console.log(`   Failed: ${failedCount} images`);

  // === PHASE 7: Extract Shaders (VISIBLE ONLY) ===
  console.log('\n[Phase 7] Extracting WebGL shaders (visible canvases only)...');

  const shaderData = await page.evaluate(() => {
    const allShaders = window.__capturedShaders || [];
    const allUniforms = window.__capturedUniforms || [];

    // Get all canvases and check visibility
    const canvasMap = new Map();
    document.querySelectorAll('canvas').forEach(canvas => {
      const rect = canvas.getBoundingClientRect();
      const style = getComputedStyle(canvas);
      const isVisible = (
        rect.width > 10 &&  // Minimum size to be considered visible
        rect.height > 10 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        parseFloat(style.opacity) > 0
      );

      const key = canvas.id || canvas.className || `canvas-${canvasMap.size}`;
      canvasMap.set(key, {
        id: canvas.id,
        className: canvas.className,
        width: canvas.width,
        height: canvas.height,
        displayWidth: rect.width,
        displayHeight: rect.height,
        isVisible,
        hasWebGL: !!canvas.getContext('webgl2') || !!canvas.getContext('webgl')
      });
    });

    // Get list of visible canvas identifiers
    const visibleCanvasIds = new Set();
    canvasMap.forEach((info, key) => {
      if (info.isVisible) {
        if (info.id) visibleCanvasIds.add(info.id);
        if (info.className) visibleCanvasIds.add(info.className);
      }
    });

    // Filter shaders to only those from visible canvases
    const visibleShaders = allShaders.filter(shader => {
      // If no canvas tracking, include it (might be from an offscreen context)
      if (!shader.canvasId && !shader.canvasClass) {
        // Check if there are ANY visible canvases - if so, might belong to them
        return Array.from(canvasMap.values()).some(c => c.isVisible);
      }
      return visibleCanvasIds.has(shader.canvasId) || visibleCanvasIds.has(shader.canvasClass);
    });

    // Filter uniforms similarly
    const visibleUniforms = allUniforms.filter(uniform => {
      if (!uniform.canvasId) return visibleCanvasIds.size > 0;
      return visibleCanvasIds.has(uniform.canvasId);
    });

    // Clean up internal references before returning
    const shaders = visibleShaders.map(s => ({
      type: s.type,
      source: s.source,
      timestamp: s.timestamp,
      context: s.context,
      canvasId: s.canvasId,
      canvasClass: s.canvasClass
    }));

    const uniforms = visibleUniforms.map(u => ({
      name: u.name,
      timestamp: u.timestamp
    }));

    // Check for inline shader scripts
    const inlineShaders = [];
    document.querySelectorAll('script[type*="shader"], script[type*="glsl"]').forEach(script => {
      inlineShaders.push({
        type: script.type,
        id: script.id,
        content: script.textContent
      });
    });

    // Check for Three.js
    const threeJs = window.THREE ? { version: window.THREE.REVISION } : null;

    // Get canvas info
    const canvases = Array.from(canvasMap.values());
    const visibleCanvases = canvases.filter(c => c.isVisible);

    return {
      shaders,
      uniforms,
      inlineShaders,
      threeJs,
      canvases,
      visibleCanvases,
      allShadersCount: allShaders.length,
      filteredShadersCount: shaders.length,
      hasWebGL: shaders.length > 0 || inlineShaders.length > 0
    };
  });

  console.log(`   Total canvases: ${shaderData.canvases.length}`);
  console.log(`   Visible canvases: ${shaderData.visibleCanvases.length}`);
  console.log(`   Shaders compiled: ${shaderData.allShadersCount}`);
  console.log(`   Shaders from visible canvases: ${shaderData.filteredShadersCount}`);
  console.log(`   Uniforms captured: ${shaderData.uniforms.length}`);
  console.log(`   Three.js: ${shaderData.threeJs ? `Yes (r${shaderData.threeJs.version})` : 'No'}`);

  if (shaderData.allShadersCount > 0 && shaderData.filteredShadersCount === 0) {
    console.log(`   ⚠️  All ${shaderData.allShadersCount} shaders filtered out (no visible canvases)`);
  }

  // Parse uniforms from shader source
  const parseUniforms = (source) => {
    const uniforms = [];
    const regex = /uniform\s+(float|int|vec2|vec3|vec4|mat3|mat4|sampler2D)\s+(\w+)/g;
    let match;
    while ((match = regex.exec(source)) !== null) {
      uniforms.push({ type: match[1], name: match[2] });
    }
    return uniforms;
  };

  // Enhance shader data with parsed uniforms
  const shadersWithUniforms = shaderData.shaders.map(shader => ({
    ...shader,
    parsedUniforms: parseUniforms(shader.source)
  }));

  // Save shaders.json
  const shadersOutput = {
    meta: {
      source: url,
      extractedAt: new Date().toISOString(),
      context: shaderData.shaders[0]?.context || 'none',
      threeJs: shaderData.threeJs
    },
    shaders: shadersWithUniforms,
    uniforms: [...new Set(shaderData.uniforms.map(u => u.name))],
    canvases: shaderData.canvases
  };
  fs.writeFileSync(`${outputDir}/shaders.json`, JSON.stringify(shadersOutput, null, 2));

  if (shaderData.shaders.length > 0) {
    console.log('\n   Shader Details:');
    shaderData.shaders.forEach((s, i) => {
      const preview = s.source.replace(/\s+/g, ' ').substring(0, 80);
      console.log(`     [${i}] ${s.type} (${s.context}): ${preview}...`);
    });

    const uniqueUniforms = [...new Set(shaderData.uniforms.map(u => u.name))];
    console.log(`\n   Unique Uniforms: ${uniqueUniforms.join(', ')}`);
  }

  // === PHASE 8: Extract CSS Animations ===
  console.log('\n[Phase 8] Extracting CSS animations...');

  const animationData = await page.evaluate(() => {
    const keyframes = [];
    const animations = [];
    const transitions = [];

    // Get @keyframes rules
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSKeyframesRule) {
            keyframes.push({
              name: rule.name,
              cssText: rule.cssText
            });
          }
        }
      } catch (e) {}
    }

    // Get animated elements
    document.querySelectorAll('*').forEach(el => {
      const style = getComputedStyle(el);
      const className = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');

      if (style.animationName && style.animationName !== 'none') {
        animations.push({
          selector: el.tagName + (className ? '.' + className.split(' ')[0] : ''),
          animationName: style.animationName,
          animationDuration: style.animationDuration,
          animationTimingFunction: style.animationTimingFunction,
          animationIterationCount: style.animationIterationCount
        });
      }

      if (style.transition && style.transition !== 'all 0s ease 0s' && style.transition !== 'none') {
        transitions.push({
          selector: el.tagName + (className ? '.' + className.split(' ')[0] : ''),
          transition: style.transition,
          opacity: style.opacity,
          transform: style.transform
        });
      }
    });

    return { keyframes, animations, transitions };
  });

  console.log(`   @keyframes rules: ${animationData.keyframes.length}`);
  console.log(`   Animated elements: ${animationData.animations.length}`);
  console.log(`   Elements with transitions: ${animationData.transitions.length}`);

  // Save animations.json
  fs.writeFileSync(`${outputDir}/animations.json`, JSON.stringify({
    meta: { source: url, extractedAt: new Date().toISOString() },
    ...animationData
  }, null, 2));

  // === PHASE 3: Clean HTML ===
  console.log('\n[Phase 3] Cleaning HTML...');

  const cleanedHTML = await page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true);

    // Remove scripts
    clone.querySelectorAll('script').forEach(el => el.remove());
    clone.querySelectorAll('noscript').forEach(el => el.remove());

    // Remove event handlers
    clone.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
      });
    });

    // Remove tracking
    clone.querySelectorAll('img[width="1"], img[height="1"]').forEach(el => el.remove());
    clone.querySelectorAll('link[rel="preload"][as="script"], link[rel="modulepreload"]').forEach(el => el.remove());

    return clone.outerHTML;
  });
  console.log(`   Cleaned HTML: ${(cleanedHTML.length / 1024).toFixed(1)}KB`);

  // === PHASE 4: Assemble ===
  console.log('\n[Phase 4] Assembling clone...');

  // Replace image URLs with base64 in the cleaned HTML
  let processedHTML = cleanedHTML;
  for (const [originalUrl, base64] of imageMap) {
    // Escape special regex characters in URL
    const escapedUrl = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(src=["'])${escapedUrl}(["'])`, 'g');
    processedHTML = processedHTML.replace(regex, `$1${base64}$2`);
  }
  console.log(`   Replaced ${imageMap.size} image URLs with base64`);

  // Build final HTML - preserve original <html> attributes (like class="MktRoot" for Stripe)
  const finalHTML = `<!DOCTYPE html>
<html ${htmlAttrs || 'lang="en"'}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clone of ${title}</title>
  <style>
/* === EXTRACTED CSS === */
${cssData.cssRules.join('\n')}
  </style>
</head>
${processedHTML.replace(/<html[^>]*>/, '').replace(/<\/html>/, '')}
</html>`;

  fs.writeFileSync(`${outputDir}/index.html`, finalHTML);
  console.log(`   Output: ${outputDir}/index.html`);

  // === Generate shader demo if shaders found ===
  if (shaderData.shaders.length > 0) {
    console.log('\n[Bonus] Generating shader demo...');

    const vertexShader = shaderData.shaders.find(s => s.type === 'vertex');
    const fragmentShader = shaderData.shaders.find(s => s.type === 'fragment');

    if (vertexShader && fragmentShader) {
      const demoHTML = `<!DOCTYPE html>
<html>
<head>
  <title>Extracted Shader - ${domain}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; }
    canvas { width: 100vw; height: 100vh; display: block; }
    .info { position: fixed; top: 20px; left: 20px; color: white; background: rgba(0,0,0,0.7); padding: 15px; border-radius: 8px; font-family: system-ui; }
  </style>
</head>
<body>
  <div class="info">
    <h3>Extracted from ${domain}</h3>
    <p>Shaders: ${shaderData.shaders.length} | Uniforms: ${shaderData.uniforms.length}</p>
  </div>
  <canvas id="canvas"></canvas>
  <script>
    const canvas = document.getElementById('canvas');
    const gl = canvas.getContext('webgl2');

    const vertexSource = ${JSON.stringify(vertexShader.source)};
    const fragmentSource = ${JSON.stringify(fragmentShader.source)};

    function createShader(gl, type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    }

    const vs = createShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    const posLoc = gl.getAttribLocation(program, 'position');
    const uvLoc = gl.getAttribLocation(program, 'uv');
    const timeLoc = gl.getUniformLocation(program, 'time');
    const widthLoc = gl.getUniformLocation(program, 'width');
    const heightLoc = gl.getUniformLocation(program, 'height');

    const positions = new Float32Array([-1,-1,0,1, 1,-1,0,1, -1,1,0,1, 1,1,0,1]);
    const uvs = new Float32Array([0,0, 1,0, 0,1, 1,1]);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);

    function resize() {
      canvas.width = window.innerWidth * devicePixelRatio;
      canvas.height = window.innerHeight * devicePixelRatio;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize);
    resize();

    const start = performance.now();
    function render() {
      const time = (performance.now() - start) / 1000;
      gl.clearColor(0,0,0,1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);

      gl.uniform1f(timeLoc, time);
      gl.uniform1f(widthLoc, canvas.width);
      gl.uniform1f(heightLoc, canvas.height);

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 4, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      requestAnimationFrame(render);
    }
    render();
  </script>
</body>
</html>`;

      fs.writeFileSync(`${outputDir}/shader-demo.html`, demoHTML);
      console.log(`   Shader demo: ${outputDir}/shader-demo.html`);
    }
  }

  // === PHASE 5: Validate ===
  console.log('\n[Phase 5] Validating...');

  // Navigate to clone
  await page.goto(`file://${outputDir}/index.html`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${outputDir}/clone-screenshot.png`, fullPage: true });
  console.log(`   Clone screenshot saved`);

  await browser.close();

  // === PHASE 6: Generate Template ===
  console.log('\n[Phase 6] Generating template...');
  try {
    await generateTemplate(outputDir);
    console.log('   Template generated successfully');
  } catch (err) {
    console.log(`   Template generation failed: ${err.message}`);
  }

  // === Summary ===
  console.log('\n' + '='.repeat(60));
  console.log('CLONE COMPLETE (V3 with Shaders)');
  console.log('='.repeat(60));
  console.log(`\nOriginal: ${url}`);
  console.log(`Output:   ${outputDir}/`);
  console.log('\nFiles:');
  console.log('  index.html        - Self-contained clone');
  console.log('  raw-source.html   - Original HTML');
  console.log('  extracted-css.css - All CSS rules');
  console.log('  shaders.json      - WebGL shaders');
  console.log('  animations.json   - CSS animations');
  console.log('  reference.png     - Original screenshot');
  console.log('  clone-screenshot.png - Clone screenshot');
  if (shaderData.shaders.length > 0) {
    console.log('  shader-demo.html  - Standalone shader demo');
  }
  console.log('  template/         - Reusable template files');
  console.log('    template.json   - Design specification');
  console.log('    template.css    - CSS with design tokens');
  console.log('    template.js     - Shader + animations');
  console.log('    example.html    - Usage example');
  console.log('\n');

  // Open the clone
  const { exec } = await import('child_process');
  exec(`open "${outputDir}/index.html"`);
}

main().catch(console.error);
