#!/usr/bin/env node
/**
 * V7 Unified Extractor
 * Single command for both single-page and multi-page extraction
 *
 * Usage:
 *   node v7-extract.js <url> <output-dir>              # Single page (SPA)
 *   node v7-extract.js <url> <output-dir> --crawl      # Multi-page (auto-discover)
 *
 * Examples:
 *   # Single-page app (most webapps)
 *   node v7-extract.js https://app.example.com output/app
 *
 *   # Multi-page site (marketing + blog)
 *   node v7-extract.js https://example.com output/site --crawl
 *
 * Flags:
 *   --crawl              Enable crawler mode (auto-discovers all pages)
 *   --max-pages <num>    Maximum pages to crawl (default: 200)
 *   --max-depth <num>    Maximum crawl depth (default: 4)
 *   --sample-size <num>  Content zone sample size (default: 5)
 */

import { V7Crawler } from './crawler.js';
import { writeServeJs } from './serve-generator.js';
import { bypassDomainChecks } from './domain-bypass.js';
import { discoverChunks } from './chunk-discovery.js';
import { exhaustFeatures } from './exhaust.js';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function extractSinglePage(url, outputDir, options = {}) {
  const { exhaust = false } = options;

  console.log('╔════════════════════════════════════════╗');
  console.log('║   V7 EXTRACTOR - SINGLE PAGE MODE     ║');
  console.log('╚════════════════════════════════════════╝\n');

  console.log('Configuration:');
  console.log(`  URL:     ${url}`);
  console.log(`  Output:  ${outputDir}`);
  console.log(`  Mode:    Single-page extraction`);
  console.log(`  Exhaust: ${exhaust ? 'enabled' : 'disabled'}\n`);

  const timestamp = Date.now();
  const domain = new URL(url).hostname.replace('www.', '');
  const extractionDir = path.join(outputDir, `${domain}-${timestamp}`);

  fs.mkdirSync(extractionDir, { recursive: true });
  fs.mkdirSync(path.join(extractionDir, 'resources'), { recursive: true });

  console.log(`📁 Output directory: ${extractionDir}\n`);
  console.log('🌐 Launching browser...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    bypassCSP: true  // Bypass Content Security Policy
  });
  const page = await context.newPage();

  // Disable cache to capture all resources
  const client = await context.newCDPSession(page);
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });

  // === DISABLE SERVICE WORKERS (prevents reload loops) ===
  await page.addInitScript(() => {
    // Disable service worker registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register = () => Promise.reject(new Error('SW disabled for offline extraction'));

      // Unregister any existing service workers
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => reg.unregister());
      }).catch(() => {});
    }

    // Ensure navigator.onLine returns true
    Object.defineProperty(navigator, 'onLine', { value: true, writable: false });
  });

  // === CAPTURE WEBGL SHADERS (from V3) ===
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
          const canvas = window.__glContextToCanvas.get(this);
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

  // Set up resource capture
  const resources = new Map();

  let totalResponses = 0;
  let matchedResponses = 0;

  page.on('response', async (response) => {
    totalResponses++;
    const resUrl = response.url();
    const status = response.status();
    const contentType = response.headers()['content-type'] || '';
    console.log(`  [${status}] ${contentType.slice(0, 30).padEnd(30)} ${resUrl.slice(0, 80)}`);

    if (status === 200 && !resUrl.includes('data:') && !resUrl.startsWith('blob:')) {
      try {
        // Capture all useful resource types for offline serving
        const isUseful = (
          contentType.includes('javascript') ||
          contentType.includes('css') ||
          contentType.includes('wasm') ||
          contentType.includes('json') ||
          contentType.includes('font') ||
          contentType.includes('image') ||
          contentType.includes('audio') ||
          contentType.includes('video') ||
          contentType.includes('octet-stream') ||
          contentType.includes('zip') ||
          resUrl.match(/\.(js|css|wasm|json|woff2?|ttf|otf|eot|png|jpg|jpeg|gif|webp|svg|ico|mp3|mp4|webm|zip|pdf)$/)
        );

        if (isUseful) {
          matchedResponses++;
          const body = await response.body();
          resources.set(resUrl, { url: resUrl, contentType, body, size: body.length });
        }
      } catch (err) {
        console.log(`  ⚠️ Error capturing ${resUrl.slice(0, 60)}...: ${err.message}`);
      }
    }
  });

  // Navigate and extract
  console.log('📄 Loading page...\n');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  console.log(`  After initial load: ${resources.size} resources`);

  // Try to click "Start" button if present (common for app launchers)
  try {
    const startBtn = await page.$('text=/start using|launch|open app|get started/i');
    if (startBtn) {
      console.log('  🖱️ Found launch button, clicking...');
      await startBtn.click();
      await page.waitForTimeout(8000);  // Wait for app to load
      console.log(`  After app launch: ${resources.size} resources`);
    }
  } catch (e) {}

  // Wait for any additional network activity
  try {
    await page.waitForLoadState('networkidle', { timeout: 30000 });
  } catch (err) {}

  // === FEATURE EXHAUSTION (if enabled) ===
  if (exhaust) {
    console.log('\n🔄 Running feature exhaustion...\n');
    try {
      const exhaustStats = await exhaustFeatures(page, {
        keyboard: true,
        menus: true,
        dialogs: true,
        resize: true,
        scroll: true,
        onProgress: (msg) => console.log(`  ${msg}`),
      });

      // Wait for lazy-loaded resources
      await page.waitForTimeout(3000);
      try {
        await page.waitForLoadState('networkidle', { timeout: 15000 });
      } catch (e) {}

      console.log(`\n✅ Exhaustion complete: ${exhaustStats.keyboardTriggers} keyboard, ${exhaustStats.menuClicks} menu, ${exhaustStats.dialogTriggers} dialogs`);
      console.log(`   Resources after exhaustion: ${resources.size}\n`);
    } catch (err) {
      console.log(`⚠️ Exhaustion error: ${err.message}\n`);
    }
  }

  console.log(`📊 Total responses: ${totalResponses}, Matched: ${matchedResponses}`);
  console.log(`✅ Captured ${resources.size} resources\n`);

  // === EXTRACT SHADER DATA ===
  console.log('🎨 Extracting WebGL shaders...\n');
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

      // Check for exact ID match
      if (shader.canvasId && visibleCanvasIds.has(shader.canvasId)) {
        return true;
      }

      // For class names, check if shader's class is a token in any visible canvas's classes
      // (e.g., "Gradient__canvas" should match "Gradient__canvas isLoaded")
      if (shader.canvasClass) {
        const shaderClasses = shader.canvasClass.split(/\s+/);
        for (const visibleId of visibleCanvasIds) {
          const visibleClasses = visibleId.split(/\s+/);
          // Check if all shader classes are present in the visible canvas classes
          if (shaderClasses.every(sc => visibleClasses.includes(sc))) {
            return true;
          }
        }
      }

      return false;
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

    // Check for Three.js
    const threeJs = window.THREE ? { version: window.THREE.REVISION } : null;

    // Get canvas info
    const canvases = Array.from(canvasMap.values());
    const visibleCanvases = canvases.filter(c => c.isVisible);

    return {
      shaders,
      uniforms,
      canvases,
      visibleCanvases,
      allShadersCount: allShaders.length,
      filteredShadersCount: shaders.length,
      hasWebGL: shaders.length > 0,
      threeJs
    };
  });

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

  // Save shaders.json if any shaders were captured
  if (shaderData.shaders.length > 0) {
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
    fs.writeFileSync(path.join(extractionDir, 'shaders.json'), JSON.stringify(shadersOutput, null, 2));
    console.log(`✅ Captured ${shaderData.shaders.length} WebGL shaders`);
    console.log(`   Visible canvases: ${shaderData.visibleCanvases.length}/${shaderData.canvases.length}`);
    console.log(`   Uniforms: ${shaderData.uniforms.length}`);
    if (shaderData.threeJs) {
      console.log(`   Three.js: r${shaderData.threeJs.version}`);
    }
  } else {
    console.log(`ℹ️  No WebGL shaders detected (${shaderData.canvases.length} canvas elements found)`);
  }

  // === DISCOVER LAZY-LOADED CHUNKS ===
  console.log('\n🔍 Discovering lazy-loaded chunks...\n');
  const baseOrigin = new URL(url).origin;

  try {
    const discoveredChunks = await discoverChunks(page, baseOrigin, resources, {
      bruteForce: true,
      maxBruteForce: 500,
      batchSize: 30,
    });

    // Merge discovered chunks into resources
    for (const [chunkUrl, chunk] of discoveredChunks) {
      if (!resources.has(chunkUrl)) {
        resources.set(chunkUrl, chunk);
      }
    }

    console.log(`✅ Total resources after chunk discovery: ${resources.size}\n`);
  } catch (err) {
    console.log(`⚠️ Chunk discovery error: ${err.message}\n`);
  }

  // Save HTML and screenshot
  console.log('💾 Saving page...\n');
  let html = await page.content();
  await page.screenshot({ path: path.join(extractionDir, 'screenshot.png'), fullPage: false });

  // Save resources and build URL mapping
  console.log(`💾 Saving ${resources.size} resources...\n`);
  let savedCount = 0;
  const urlToLocalPath = new Map();

  for (const [resUrl, resource] of resources) {
    try {
      const urlObj = new URL(resUrl);
      let filename = path.basename(urlObj.pathname) || 'index.html';

      // Ensure filename has extension
      if (!path.extname(filename)) {
        if (resource.contentType.includes('javascript')) filename += '.js';
        else if (resource.contentType.includes('css')) filename += '.css';
        else if (resource.contentType.includes('wasm')) filename += '.wasm';
        else if (resource.contentType.includes('json')) filename += '.json';
      }

      // Handle duplicates
      let filepath = path.join(extractionDir, 'resources', filename);
      let counter = 1;
      while (fs.existsSync(filepath)) {
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        filename = `${base}-${counter}${ext}`;
        filepath = path.join(extractionDir, 'resources', filename);
        counter++;
      }

      fs.writeFileSync(filepath, resource.body);
      savedCount++;

      // Track local path for URL mapping
      const localPath = `resources/${filename}`;
      urlToLocalPath.set(resUrl, localPath);
      resource.localPath = localPath;

      if (savedCount % 50 === 0) {
        console.log(`  ... ${savedCount} files saved`);
      }
    } catch (err) {}
  }

  console.log(`\n✅ Saved ${savedCount} resource files\n`);

  // === URL REWRITING IN HTML ===
  console.log('🔗 Rewriting URLs in HTML...\n');
  let urlsRewritten = 0;

  for (const [originalUrl, localPath] of urlToLocalPath) {
    try {
      const urlObj = new URL(originalUrl);

      // Try multiple patterns
      const patterns = [
        originalUrl,                    // Full URL
        urlObj.pathname,                // Just pathname
        urlObj.pathname + urlObj.search, // Pathname with query
        originalUrl.replace(baseOrigin, ''), // Remove origin
      ];

      for (const pattern of patterns) {
        if (pattern && html.includes(pattern)) {
          html = html.split(pattern).join(localPath);
          urlsRewritten++;
          break;
        }
      }
    } catch (e) {}
  }

  // Add base tag for unmapped relative URLs
  if (!html.includes('<base')) {
    html = html.replace('<head>', `<head>\n  <base href="${baseOrigin}/">`);
  }

  console.log(`✅ Rewrote ${urlsRewritten} URLs in HTML\n`);

  // Save rewritten HTML
  fs.writeFileSync(path.join(extractionDir, 'index.html'), html);

  // === DOMAIN BYPASS ===
  console.log('🔓 Applying domain bypass patches...\n');
  try {
    const bypassResults = await bypassDomainChecks(path.join(extractionDir, 'resources'));
    if (bypassResults.totalPatched > 0) {
      console.log(`✅ Applied ${bypassResults.totalPatched} domain bypass patches\n`);
    } else {
      console.log('ℹ️  No domain checks found to bypass\n');
    }
  } catch (err) {
    console.log(`⚠️ Domain bypass error: ${err.message}\n`);
  }

  // Create manifest with localPath
  const manifest = {
    url: url,
    timestamp: new Date().toISOString(),
    mode: 'single-page',
    resourceCount: resources.size,
    savedCount,
    resources: Array.from(resources.values()).map(r => ({
      url: r.url,
      contentType: r.contentType,
      size: r.size,
      localPath: r.localPath || null,
    }))
  };

  fs.writeFileSync(path.join(extractionDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // === GENERATE SERVE.JS ===
  console.log('🖥️  Generating serve.js...\n');
  try {
    await writeServeJs(extractionDir, manifest, 3333);
    console.log('✅ serve.js created\n');
  } catch (err) {
    console.log(`⚠️ serve.js generation error: ${err.message}\n`);
  }

  await browser.close();

  console.log('════════════════════════════════════════════════════════════');
  console.log('EXTRACTION COMPLETE');
  console.log('════════════════════════════════════════════════════════════\n');
  console.log(`📁 Output: ${extractionDir}`);
  console.log(`📊 Captured: ${savedCount} resources`);
  console.log(`🔗 URLs rewritten: ${urlsRewritten}`);
  console.log(`\n🚀 To run offline:\n`);
  console.log(`   cd ${extractionDir}`);
  console.log(`   node serve.js`);
  console.log(`   # Then open http://localhost:3333\n`);
  console.log(`💡 TIP: If this site has multiple pages (marketing site, blog, docs),`);
  console.log(`   use --crawl to discover and extract all pages:\n`);
  console.log(`   node tools/v7/extract.js ${url} ${outputDir} --crawl\n`);

  return extractionDir;
}

async function main() {
  const url = process.argv[2];
  const outputDir = process.argv[3];
  const args = process.argv.slice(4);

  if (!url || !outputDir) {
    console.error('Usage: node v7-extract.js <url> <output-dir> [options]');
    console.error('');
    console.error('Examples:');
    console.error('  # Single-page app (most webapps - DEFAULT)');
    console.error('  node v7-extract.js https://app.example.com output/app');
    console.error('');
    console.error('  # Multi-page site (auto-discovers all pages)');
    console.error('  node v7-extract.js https://example.com output/site --crawl');
    console.error('');
    console.error('Options:');
    console.error('  --crawl              Enable multi-page crawler');
    console.error('  --exhaust            Trigger all features to capture lazy resources');
    console.error('  --max-pages <num>    Max pages to crawl (default: 200)');
    console.error('  --max-depth <num>    Max crawl depth (default: 4)');
    console.error('  --sample-size <num>  Content sample size (default: 5)');
    console.error('');
    console.error('When to use --crawl:');
    console.error('  ✅ Marketing site with blog (example.com/blog)');
    console.error('  ✅ Documentation site (docs.example.com)');
    console.error('  ✅ Multi-page traditional site');
    console.error('  ❌ Single-page app (React/Vue/Angular)');
    console.error('  ❌ Dashboard/admin panel (client-side routing)');
    console.error('');
    process.exit(1);
  }

  // Check for --crawl flag
  const crawlMode = args.includes('--crawl');

  if (crawlMode) {
    // Multi-page crawler mode
    const config = { startUrl: url, outputDir };

    // Parse additional options
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--max-pages') config.maxPages = parseInt(args[i + 1]);
      if (args[i] === '--max-depth') config.maxDepth = parseInt(args[i + 1]);
      if (args[i] === '--sample-size') config.sampleSize = parseInt(args[i + 1]);
    }

    const crawler = new V7Crawler(config);
    await crawler.crawl();

  } else {
    // Single-page extraction mode
    const exhaustMode = args.includes('--exhaust');
    await extractSinglePage(url, outputDir, { exhaust: exhaustMode });
  }
}

main().catch(err => {
  console.error('❌ Extraction failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
