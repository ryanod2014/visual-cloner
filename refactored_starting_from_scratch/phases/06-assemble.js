/**
 * Phase 06: Assemble
 * Generate output directory with serve.js
 *
 * Creates the final output:
 * - Creates output directory structure
 * - Writes all resources to files
 * - Generates url-map.json
 * - Generates manifest.json
 * - Generates serve.js using server/template.js
 * - Rewrites index.html
 * - Copies runtime scripts
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Phase } from '../core/pipeline.js';
import { generateServeTemplate, generatePackageJson } from '../server/index.js';
import { generateShaderReplayScript, canReplayShaders } from '../utils/shader-replay-generator.js';
import { getAllPatchers } from '../plugins/patchers/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);

export class AssemblePhase extends Phase {
  constructor(config = {}) {
    super('assemble', 'Generate output directory and serve.js');
    this.config = config;
  }

  async execute(context) {
    const { outputDir, resources, html, url, detection, patchReport, webglData } = context;

    if (this.config.dryRun) {
      this.logger.info('Would create output directories (resources/, __runtime__/)');
      this.logger.info(`Would save ${resources.size} resources to resources/ directory`);
      this.logger.info('Would generate url-map.json mapping original URLs to local files');
      this.logger.info('Would save index.html with original page content');
      this.logger.info('Would copy runtime scripts (runtime-mock.js, indexeddb-mock.js, network-interceptor.js)');
      this.logger.info('Would generate serve.js for local development server');
      this.logger.info('Would save manifest.json with extraction metadata');
      this.logger.info('Would save patch-report.json with patching information');

      // Calculate what would be saved
      let totalSize = 0;
      for (const [, data] of resources) {
        totalSize += data.size || 0;
      }

      this.logger.info(`Total size to write: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      this.logger.info(`Output directory: ${outputDir}`);

      return {
        resourceCount: resources.size,
        totalSize,
        urlMapPath: path.join(outputDir, 'url-map.json'),
        servePath: path.join(outputDir, 'serve.js'),
        manifestPath: path.join(outputDir, 'manifest.json'),
        dryRun: true,
      };
    }

    // Create directories
    this.logger.info('Creating output directories...');
    await fs.mkdir(path.join(outputDir, 'resources'), { recursive: true });
    await fs.mkdir(path.join(outputDir, '__runtime__'), { recursive: true });
    this.trackCreated(2);
    this.trackAction('Created output directories');

    // Load patchers for JS files
    const patchers = getAllPatchers();
    this.logger.info(`Loaded ${patchers.length} patchers: ${patchers.map(p => p.name).join(', ')}`);
    let totalPatchesApplied = 0;

    // Get original hostname for universal hostname substitution
    // This makes domain checks pass without site-specific patches
    let originalHostname = 'localhost';
    let originalOrigin = 'http://localhost';
    try {
      const urlObj = new URL(url);
      originalHostname = urlObj.hostname;
      originalOrigin = urlObj.origin;
    } catch (e) {
      this.logger.warn(`Could not parse original URL: ${url}`);
    }

    // Build URL map and save resources with ORIGINAL FILENAMES
    // This preserves ES module import paths so relative imports work
    this.logger.info('Saving resources with original filenames...');
    const urlMap = {};
    let i = 0;
    let savedSize = 0;
    const usedFilenames = new Set();

    for (const [resUrl, data] of resources) {
      // Extract original filename from URL to preserve import paths
      let filename;
      try {
        const urlObj = new URL(resUrl);
        const urlPath = urlObj.pathname;
        filename = path.basename(urlPath);

        // Sanitize filename: remove query string artifacts and invalid chars
        filename = filename.split('?')[0].split('#')[0];
        filename = filename.replace(/[<>:"/\\|?*;=&%]/g, '_');

        // If filename is too long (tracking pixels, etc), use hash-based name
        // Check this BEFORE other processing to avoid ENAMETOOLONG errors
        if (filename.length > 100) {
          const ext = this.getExtension(data.contentType, resUrl) || '';
          const hash = this.simpleHash(resUrl);
          filename = `resource-${hash}${ext}`;
        }

        // If no filename or just extension, generate one
        if (!filename || filename.startsWith('.') || filename.length < 2) {
          const ext = this.getExtension(data.contentType, resUrl);
          filename = `resource-${i}${ext}`;
        }

        // Handle filename collisions by adding a suffix
        let uniqueFilename = filename;
        let collisionCount = 1;
        while (usedFilenames.has(uniqueFilename)) {
          const ext = path.extname(filename);
          const base = path.basename(filename, ext);
          uniqueFilename = `${base}-${collisionCount}${ext}`;
          collisionCount++;
        }
        filename = uniqueFilename;
        usedFilenames.add(filename);
      } catch (e) {
        // Fallback for invalid URLs
        const ext = this.getExtension(data.contentType, resUrl);
        filename = `resource-${i}${ext}`;
        usedFilenames.add(filename);
      }
      i++;

      // Apply patches to JS files before saving
      const filePath = path.join(outputDir, 'resources', filename);
      let contentToWrite = data.body;

      if (filename.endsWith('.js') || data.contentType?.includes('javascript')) {
        let content = data.body.toString('utf-8');
        let filePatched = false;

        // UNIVERSAL HOSTNAME SUBSTITUTION
        // Replace window.location.hostname with the actual hostname string
        // This makes domain checks pass without knowing variable names
        const hostnamePatterns = [
          // Direct hostname access: window.location.hostname
          { pattern: /window\.location\.hostname/g, replacement: `"${originalHostname}"` },
          // Also handle location.hostname (without window prefix)
          { pattern: /(?<!\w)location\.hostname(?!\w)/g, replacement: `"${originalHostname}"` },
          // Handle origin checks
          { pattern: /window\.location\.origin/g, replacement: `"${originalOrigin}"` },
          { pattern: /(?<!\w)location\.origin(?!\w)/g, replacement: `"${originalOrigin}"` },
          // Handle host (hostname:port)
          { pattern: /window\.location\.host(?!name)/g, replacement: `"${originalHostname}"` },
          { pattern: /(?<!\w)location\.host(?!name)(?!\w)/g, replacement: `"${originalHostname}"` },
        ];

        let hostnameSubstitutions = 0;
        for (const { pattern, replacement } of hostnamePatterns) {
          const matches = content.match(pattern);
          if (matches) {
            content = content.replace(pattern, replacement);
            hostnameSubstitutions += matches.length;
          }
        }

        if (hostnameSubstitutions > 0) {
          filePatched = true;
          totalPatchesApplied += hostnameSubstitutions;
          this.logger.info(`[HOSTNAME] ${filename} - ${hostnameSubstitutions} hostname substitutions`);
        }

        // Apply other patchers
        for (const patcher of patchers) {
          if (patcher.shouldApply(content, filename)) {
            const result = patcher.apply(content);
            if (result.patches.length > 0) {
              content = result.content;
              filePatched = true;
              const patchCount = result.patches.reduce((sum, p) => sum + p.count, 0);
              totalPatchesApplied += patchCount;
              this.logger.info(`[PATCHED] ${filename} - ${patcher.name}: ${patchCount} patches`);
            }
          }
        }

        if (filePatched) {
          contentToWrite = Buffer.from(content, 'utf-8');
        }
      }

      await fs.writeFile(filePath, contentToWrite);
      savedSize += data.size;
      this.trackCreated();

      // Add to URL map
      urlMap[resUrl] = {
        localFile: `resources/${filename}`,
        contentType: data.contentType,
        size: data.size,
        source: data.source || 'unknown',
      };

      // Progress
      if (i % 100 === 0) {
        this.logger.progress(i, resources.size, `${(savedSize / 1024 / 1024).toFixed(1)} MB`);
      }
    }

    this.logger.info(`Saved ${i} resources (${(savedSize / 1024 / 1024).toFixed(2)} MB)`);
    if (totalPatchesApplied > 0) {
      this.logger.info(`Applied ${totalPatchesApplied} patches to JS files`);
    }
    this.trackAction(`Saved ${i} resources`);

    // Save URL map
    this.logger.info('Saving url-map.json...');
    await fs.writeFile(
      path.join(outputDir, 'url-map.json'),
      JSON.stringify(urlMap, null, 2)
    );
    this.trackCreated();

    // Rewrite URLs in HTML to use local paths
    // This makes all external resources load from our local server
    this.logger.info('Rewriting URLs in HTML to use local paths...');
    let finalHtml = html;
    let urlsRewritten = 0;
    let urlsSkipped = 0;

    // Build a set of files that actually exist
    const existingFiles = new Set();
    for (const info of Object.values(urlMap)) {
      existingFiles.add(info.localFile);
    }

    // Sort URLs by length (longest first) to avoid partial replacements
    // e.g., replace "https://example.com/foo/bar.js" before "https://example.com/foo"
    const sortedUrls = Object.keys(urlMap).sort((a, b) => b.length - a.length);

    for (const originalUrl of sortedUrls) {
      const info = urlMap[originalUrl];
      const localPath = '/' + info.localFile;

      // Only rewrite if the file actually exists in our captured resources
      if (!existingFiles.has(info.localFile)) {
        urlsSkipped++;
        continue;
      }

      // Count occurrences before replacement
      const regex = new RegExp(this.escapeRegExp(originalUrl), 'g');
      const matches = finalHtml.match(regex);
      if (matches) {
        urlsRewritten += matches.length;
        finalHtml = finalHtml.replace(regex, localPath);
      }
    }

    this.logger.info(`Rewrote ${urlsRewritten} URL references to local paths (skipped ${urlsSkipped} missing)`);
    this.trackAction(`Rewrote ${urlsRewritten} URLs`);

    // UNIVERSAL: Remove external script tags
    // Scripts from external domains are not needed for offline operation
    // This prevents ad scripts, analytics, etc. from even trying to load
    const targetHostname = new URL(url).hostname;
    let externalScriptsRemoved = 0;

    // Match script tags with src attribute pointing to external domains
    const scriptTagRegex = /<script[^>]+src\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/script>/gi;
    finalHtml = finalHtml.replace(scriptTagRegex, (match, src) => {
      try {
        const srcUrl = new URL(src, url);
        const srcHostname = srcUrl.hostname;

        // Keep scripts from the same domain or localhost
        if (srcHostname === targetHostname ||
            srcHostname === 'localhost' ||
            srcHostname === '127.0.0.1' ||
            src.startsWith('/') ||
            src.startsWith('./') ||
            src.startsWith('../') ||
            !src.includes('://')) {
          return match; // Keep it
        }

        // Remove external scripts
        externalScriptsRemoved++;
        return `<!-- REMOVED: external script from ${srcHostname} -->`;
      } catch (e) {
        return match; // Keep if we can't parse
      }
    });

    // Also handle self-closing script tags
    const selfClosingScriptRegex = /<script[^>]+src\s*=\s*["']([^"']+)["'][^>]*\/>/gi;
    finalHtml = finalHtml.replace(selfClosingScriptRegex, (match, src) => {
      try {
        const srcUrl = new URL(src, url);
        const srcHostname = srcUrl.hostname;

        if (srcHostname === targetHostname ||
            srcHostname === 'localhost' ||
            srcHostname === '127.0.0.1' ||
            src.startsWith('/') ||
            src.startsWith('./') ||
            src.startsWith('../') ||
            !src.includes('://')) {
          return match;
        }

        externalScriptsRemoved++;
        return `<!-- REMOVED: external script from ${srcHostname} -->`;
      } catch (e) {
        return match;
      }
    });

    if (externalScriptsRemoved > 0) {
      this.logger.info(`Removed ${externalScriptsRemoved} external script tags (universal offline mode)`);
    }

    // Also remove external iframes (often used for ads)
    let externalIframesRemoved = 0;
    const iframeRegex = /<iframe[^>]+src\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/iframe>/gi;
    finalHtml = finalHtml.replace(iframeRegex, (match, src) => {
      try {
        if (src.startsWith('//') || src.startsWith('http://') || src.startsWith('https://')) {
          const srcUrl = new URL(src.startsWith('//') ? 'https:' + src : src);
          if (srcUrl.hostname !== targetHostname) {
            externalIframesRemoved++;
            return `<!-- REMOVED: external iframe from ${srcUrl.hostname} -->`;
          }
        }
        return match;
      } catch (e) {
        return match;
      }
    });

    if (externalIframesRemoved > 0) {
      this.logger.info(`Removed ${externalIframesRemoved} external iframes`);
    }

    // Optional: Inject shader replay as fallback if original code fails
    // Only inject if explicitly enabled via config
    let shaderReplayInjected = false;
    if (this.config.shaderReplayFallback && webglData && canReplayShaders(webglData)) {
      this.logger.info('Generating shader replay fallback...');
      const shaderReplayScript = generateShaderReplayScript(webglData, {
        canvasSelectors: ['.Gradient__canvas', 'canvas[class*="gradient"]', 'canvas[class*="Gradient"]', 'canvas'],
        delayMs: 2000,  // Wait for original code to potentially initialize
        checkOriginal: true,  // Only activate if original WebGL not detected
      });

      if (shaderReplayScript) {
        if (finalHtml.includes('</body>')) {
          finalHtml = finalHtml.replace('</body>', shaderReplayScript + '\n</body>');
        } else if (finalHtml.includes('</html>')) {
          finalHtml = finalHtml.replace('</html>', shaderReplayScript + '\n</html>');
        } else {
          finalHtml += shaderReplayScript;
        }
        shaderReplayInjected = true;
        this.logger.info('Shader replay fallback injected');
      }
    }

    // VIEWPORT BASELINE CSS
    // Ensures SPA apps can fill the viewport properly with percentage heights
    // Injected at start of <head> so app CSS can override if needed
    const viewportCSS = `<style id="viewport-baseline">
/* Viewport baseline - ensures app fills screen */
html { height: 100%; }
body { height: 100%; margin: 0; }
</style>`;

    if (finalHtml.includes('<head>')) {
      finalHtml = finalHtml.replace('<head>', `<head>\n${viewportCSS}`);
      this.logger.info('Injected viewport baseline CSS');
      this.trackAction('Injected viewport baseline CSS');
    } else if (finalHtml.includes('<HEAD>')) {
      finalHtml = finalHtml.replace('<HEAD>', `<HEAD>\n${viewportCSS}`);
      this.logger.info('Injected viewport baseline CSS');
      this.trackAction('Injected viewport baseline CSS');
    }

    this.logger.info('Saving index.html...');
    await fs.writeFile(path.join(outputDir, 'index.html'), finalHtml);
    this.trackCreated();

    // Copy runtime scripts to output directory
    this.logger.info('Copying runtime scripts...');
    const runtimeDir = path.join(PROJECT_ROOT, 'runtime');
    const runtimeFiles = [
      'runtime-mock.js',
      'indexeddb-mock.js',
      'network-interceptor.js',
    ];

    let copiedRuntimeFiles = 0;
    for (const file of runtimeFiles) {
      const srcPath = path.join(runtimeDir, file);
      const destPath = path.join(outputDir, '__runtime__', file);

      try {
        await fs.copyFile(srcPath, destPath);
        copiedRuntimeFiles++;
        this.trackCreated();
        this.logger.debug(`Copied runtime: ${file}`);
      } catch (err) {
        // If runtime file doesn't exist, create a stub
        this.logger.warn(`Runtime file not found: ${file}, creating stub`);
        await fs.writeFile(destPath, `// Runtime stub: ${file}\nconsole.log('Runtime: ${file} loaded');`);
        copiedRuntimeFiles++;
        this.trackCreated();
        this.trackWarning();
      }
    }

    this.logger.info(`Copied ${copiedRuntimeFiles} runtime scripts`);

    // Generate serve.js
    this.logger.info('Generating serve.js...');
    const serverCode = generateServeTemplate({
      port: this.config.port || 3333,
      enableProxy: this.config.proxy === true,  // Proxy OFF by default
      enableCors: true,
    });
    await fs.writeFile(path.join(outputDir, 'serve.js'), serverCode);
    this.trackCreated();

    // Generate package.json (ensures CommonJS mode for serve.js)
    this.logger.info('Generating package.json...');
    await fs.writeFile(path.join(outputDir, 'package.json'), generatePackageJson());
    this.trackCreated();

    // Parse original URL for metadata
    const parsedUrl = new URL(url);

    // Save manifest with original URL metadata
    this.logger.info('Saving manifest.json...');
    const manifest = {
      version: '1.0',
      extractedAt: new Date().toISOString(),
      url,
      originalUrl: {
        full: url,
        origin: parsedUrl.origin,
        protocol: parsedUrl.protocol,
        host: parsedUrl.host,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        pathname: parsedUrl.pathname,
      },
      detection: detection ? {
        bundler: detection.bundler,
        version: detection.version,
        confidence: detection.confidence,
      } : null,
      resourceCount: i,
      totalSize: savedSize,
      resourcesBySource: this.countBySource(resources),
      runtimeMocks: {
        enabled: true,
        files: runtimeFiles,
        injectionMethod: 'server-side',
      },
      patchingEnabled: patchReport && patchReport.totalPatches > 0,
      urlRewriting: {
        enabled: true,
        urlsRewritten: urlsRewritten,
        preservedFilenames: true,
      },
      shaderReplay: shaderReplayInjected ? {
        enabled: true,
        shaderCount: webglData?.shaders?.length || 0,
        injectionMethod: 'html-script',
        mode: 'fallback',
      } : {
        enabled: false,
        reason: 'Original code should run with local URLs',
      },
    };

    await fs.writeFile(
      path.join(outputDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    this.trackCreated();

    // Save patch report if available
    if (patchReport) {
      this.logger.info('Saving patch-report.json...');
      await fs.writeFile(
        path.join(outputDir, 'patch-report.json'),
        JSON.stringify(patchReport, null, 2)
      );
      this.trackCreated();
    }

    // Save WebGL shader data if captured
    if (webglData && webglData.shaders && webglData.shaders.length > 0) {
      this.logger.info('Saving shaders.json...');
      const shadersOutput = {
        meta: {
          extractedAt: new Date().toISOString(),
          sourceUrl: url,
          ...webglData.meta,
        },
        shaders: webglData.shaders,
        uniforms: webglData.uniforms,
        uniformValues: webglData.uniformValues || {},  // Captured uniform values!
        canvases: webglData.canvases,
      };
      await fs.writeFile(
        path.join(outputDir, 'shaders.json'),
        JSON.stringify(shadersOutput, null, 2)
      );
      this.trackCreated();
      this.logger.info(`Saved ${webglData.shaders.length} shaders to shaders.json`);
      this.trackAction(`Saved ${webglData.shaders.length} WebGL shaders`);
    } else {
      this.logger.debug('No WebGL shaders to save');
    }

    this.logger.info('Assembly complete');
    this.logger.info('Runtime mocking enabled - origin spoofing handled at runtime');
    this.trackAction('Assembly complete');

    return {
      resourceCount: i,
      totalSize: savedSize,
      urlMapPath: path.join(outputDir, 'url-map.json'),
      servePath: path.join(outputDir, 'serve.js'),
      manifestPath: path.join(outputDir, 'manifest.json'),
      shadersPath: webglData?.shaders?.length > 0 ? path.join(outputDir, 'shaders.json') : null,
      shaderCount: webglData?.shaders?.length || 0,
      shaderReplayInjected,
      urlsRewritten,
    };
  }

  /**
   * Count resources by source
   */
  countBySource(resources) {
    const counts = {};
    for (const [, data] of resources) {
      const source = data.source || 'unknown';
      counts[source] = (counts[source] || 0) + 1;
    }
    return counts;
  }

  /**
   * Get file extension from content type or URL
   */
  getExtension(contentType, url) {
    const ct = contentType || '';

    if (ct.includes('javascript')) return '.js';
    if (ct.includes('css')) return '.css';
    if (ct.includes('html')) return '.html';
    if (ct.includes('json')) return '.json';
    if (ct.includes('wasm')) return '.wasm';
    if (ct.includes('image/png')) return '.png';
    if (ct.includes('image/jpeg')) return '.jpg';
    if (ct.includes('image/gif')) return '.gif';
    if (ct.includes('image/webp')) return '.webp';
    if (ct.includes('image/svg')) return '.svg';
    if (ct.includes('font/woff2')) return '.woff2';
    if (ct.includes('font/woff')) return '.woff';
    if (ct.includes('font/ttf')) return '.ttf';
    if (ct.includes('audio/mpeg')) return '.mp3';
    if (ct.includes('audio/ogg')) return '.ogg';
    if (ct.includes('video/mp4')) return '.mp4';
    if (ct.includes('video/webm')) return '.webm';

    // Try from URL
    try {
      const urlExt = path.extname(new URL(url).pathname);
      if (urlExt && urlExt.length <= 5) return urlExt;
    } catch (e) {
      // Invalid URL
    }

    return '';
  }

  /**
   * Escape special regex characters in a string
   */
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Generate a simple hash for a string (for filename deduplication)
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }
}

export default AssemblePhase;
