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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);

export class AssemblePhase extends Phase {
  constructor(config = {}) {
    super('assemble', 'Generate output directory and serve.js');
    this.config = config;
  }

  async execute(context) {
    const { outputDir, resources, html, url, detection, patchReport } = context;

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

    // Build URL map and save resources (NO patching - let runtime handle it)
    this.logger.info('Saving resources...');
    const urlMap = {};
    let i = 0;
    let savedSize = 0;

    for (const [resUrl, data] of resources) {
      // Generate filename based on content type
      const ext = this.getExtension(data.contentType, resUrl);
      const filename = `r${i}${ext}`;
      i++;

      // Save file WITHOUT any patching
      const filePath = path.join(outputDir, 'resources', filename);
      await fs.writeFile(filePath, data.body);
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
    this.trackAction(`Saved ${i} resources`);

    // Save URL map
    this.logger.info('Saving url-map.json...');
    await fs.writeFile(
      path.join(outputDir, 'url-map.json'),
      JSON.stringify(urlMap, null, 2)
    );
    this.trackCreated();

    // Save HTML WITHOUT patching (runtime scripts will be injected by server)
    this.logger.info('Saving index.html...');
    await fs.writeFile(path.join(outputDir, 'index.html'), html);
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
      enableProxy: this.config.proxy !== false,
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

    this.logger.info('Assembly complete');
    this.logger.info('Runtime mocking enabled - origin spoofing handled at runtime');
    this.trackAction('Assembly complete');

    return {
      resourceCount: i,
      totalSize: savedSize,
      urlMapPath: path.join(outputDir, 'url-map.json'),
      servePath: path.join(outputDir, 'serve.js'),
      manifestPath: path.join(outputDir, 'manifest.json'),
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
}

export default AssemblePhase;
