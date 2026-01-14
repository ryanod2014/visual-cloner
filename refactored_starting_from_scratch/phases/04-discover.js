/**
 * Phase 04: Discover
 * Find and fetch lazy-loaded chunks via manifest parsing and brute force
 */

import { Phase } from '../core/pipeline.js';

export class DiscoverPhase extends Phase {
  constructor(config = {}) {
    super('discover', 'Discover and fetch lazy-loaded chunks');
    this.config = config;
    this.attemptedUrls = new Set();
  }

  async execute(context) {
    const { page, url, resources } = context;
    const origin = new URL(url).origin;

    const initialCount = resources.size;
    this.logger.info(`Starting with ${initialCount} resources`);

    if (this.config.dryRun) {
      this.logger.info('Would extract chunk URLs from webpack manifests and HTML');
      this.logger.info('Would learn patterns from existing resources');
      this.logger.info('Would generate brute-force chunk URLs');
      this.logger.info('Would fetch all discovered chunk URLs in batches');

      const simulatedManifest = 50;
      const simulatedLearned = 100;
      const simulatedBrute = 200;
      const simulatedFetched = 30;

      this.logger.info(`Would find ${simulatedManifest} URLs from manifests`);
      this.logger.info(`Would generate ${simulatedLearned} URLs from learned patterns`);
      this.logger.info(`Would generate ${simulatedBrute} brute-force URLs`);
      this.logger.info(`Would fetch and discover ${simulatedFetched} new resources`);

      return {
        initialCount,
        manifestUrls: simulatedManifest,
        learnedUrls: simulatedLearned,
        bruteForceUrls: simulatedBrute,
        fetched: simulatedFetched,
        finalCount: initialCount + simulatedFetched,
        dryRun: true,
      };
    }

    // Mark existing URLs as attempted
    for (const resUrl of resources.keys()) {
      this.attemptedUrls.add(resUrl);
    }

    // Phase 1: Extract chunk URLs from webpack manifests and HTML
    const manifestChunks = await this.extractChunkManifest(page, origin, resources);
    this.logger.info(`Found ${manifestChunks.size} URLs from manifests`);

    // Phase 2: Learn patterns from existing resources
    const learnedChunks = this.learnPatternsFromResources(origin, resources);
    this.logger.info(`Generated ${learnedChunks.size} URLs from learned patterns`);

    // Phase 3: Generate brute-force chunk URLs
    const bruteChunks = this.bruteForceChunks(origin);
    this.logger.info(`Generated ${bruteChunks.size} brute-force URLs`);

    // Combine all chunk URLs
    const allChunks = new Set([...manifestChunks, ...learnedChunks, ...bruteChunks]);
    this.logger.info(`Total: ${allChunks.size} potential chunk URLs`);

    // Phase 4: Fetch all discovered chunks
    const fetched = await this.fetchAllChunks(page, allChunks, resources);

    const finalCount = resources.size;
    this.logger.info(`Discovery complete: ${finalCount - initialCount} new resources`);

    return {
      initialCount,
      manifestUrls: manifestChunks.size,
      learnedUrls: learnedChunks.size,
      bruteForceUrls: bruteChunks.size,
      fetched,
      finalCount,
    };
  }

  /**
   * Extract chunk URLs from webpack manifests in loaded scripts
   */
  async extractChunkManifest(page, origin, resources) {
    const chunkUrls = new Set();

    // First, parse HTML for initial script/link tags
    for (const [url, data] of resources) {
      if (data.contentType?.includes('html')) {
        try {
          const html = data.body.toString('utf-8');

          // Extract all src/href attributes pointing to JS/CSS/WASM files
          const srcMatches = html.matchAll(/(src|href)=["']([^"']+\.(js|css|wasm|zip))["']/gi);
          for (const match of srcMatches) {
            let assetPath = match[2];
            if (assetPath.startsWith('http')) {
              chunkUrls.add(assetPath);
            } else if (assetPath.startsWith('/')) {
              chunkUrls.add(origin + assetPath);
            } else if (assetPath.startsWith('//')) {
              chunkUrls.add('https:' + assetPath);
            } else {
              chunkUrls.add(origin + '/' + assetPath);
            }
          }

          // Extract paths from inline JavaScript (e.g., var fls = ["code/ext/..."])
          const inlineArrays = html.matchAll(/\[\s*["']([^"']+\.(js|css|wasm|zip))["'](?:\s*,\s*["']([^"']+\.(js|css|wasm|zip))["'])*\s*\]/gi);
          for (const match of inlineArrays) {
            const arrayStr = match[0];
            const paths = arrayStr.match(/["']([^"']+\.(js|css|wasm|zip))["']/gi) || [];
            for (const pathMatch of paths) {
              let assetPath = pathMatch.replace(/["']/g, '');
              if (assetPath.startsWith('http')) {
                chunkUrls.add(assetPath);
              } else if (assetPath.startsWith('/')) {
                chunkUrls.add(origin + assetPath);
              } else {
                chunkUrls.add(origin + '/' + assetPath);
              }
            }
          }
        } catch (e) {
          this.logger.debug(`Error parsing HTML: ${e.message}`);
        }
      }
    }

    // Get script content from captured resources
    const jsResources = [];
    for (const [url, data] of resources) {
      if (data.contentType?.includes('javascript')) {
        jsResources.push({ url, content: data.body.toString('utf-8') });
      }
    }

    this.logger.info(`Analyzing ${jsResources.length} JavaScript files...`);

    for (const { url: scriptUrl, content } of jsResources) {
      if (!content || content.length < 100) continue;

      try {
        const scriptPath = new URL(scriptUrl).pathname;
        const basePath = scriptPath.substring(0, scriptPath.lastIndexOf('/') + 1);

        // Pattern 1: Webpack chunk manifest {0:"abc123",1:"def456"}
        const webpackManifests = content.match(/\{(?:\d+:"[a-f0-9]+",?)+\}/g) || [];
        for (const manifest of webpackManifests) {
          const matches = manifest.match(/(\d+):"([a-f0-9]+)"/g) || [];
          for (const m of matches) {
            const parts = m.match(/(\d+):"([a-f0-9]+)"/);
            if (parts) {
              const [, id, hash] = parts;
              // Try multiple URL patterns
              chunkUrls.add(origin + basePath + id + '.' + hash + '.js');
              chunkUrls.add(origin + basePath + hash + '.js');
              chunkUrls.add(origin + basePath + id + '.js');
            }
          }
        }

        // Pattern 2: Quoted chunk filenames (more comprehensive)
        const quotedChunks = content.match(/["']([^"']*?(?:\d+|chunk|vendor|main|app|bundle|ext|dbs|pp|all)[^"']*?\.(js|css|wasm|zip))["']/gi) || [];
        for (const chunk of quotedChunks) {
          const cleaned = chunk.replace(/["']/g, '');
          if (cleaned.startsWith('http')) {
            chunkUrls.add(cleaned);
          } else if (cleaned.startsWith('/')) {
            chunkUrls.add(origin + cleaned);
          } else if (cleaned.startsWith('//')) {
            chunkUrls.add('https:' + cleaned);
          } else if (!cleaned.includes(' ') && cleaned.length < 150) {
            chunkUrls.add(origin + basePath + cleaned);
            // Also try from root
            if (!basePath.startsWith('/code/') && cleaned.includes('/')) {
              chunkUrls.add(origin + '/' + cleaned);
            }
          }
        }

        // Pattern 3: WASM files
        const wasmFiles = content.match(/["']([^"']+\.wasm)["']/gi) || [];
        for (const wasm of wasmFiles) {
          const cleaned = wasm.replace(/["']/g, '');
          if (cleaned.startsWith('http')) {
            chunkUrls.add(cleaned);
          } else if (cleaned.startsWith('/')) {
            chunkUrls.add(origin + cleaned);
          } else {
            chunkUrls.add(origin + basePath + cleaned);
            chunkUrls.add(origin + '/' + cleaned);
          }
        }

        // Pattern 4: Dynamic imports - import("./chunk-123.js")
        const dynamicImports = content.match(/import\s*\(\s*["']([^"']+)["']\s*\)/g) || [];
        for (const imp of dynamicImports) {
          const match = imp.match(/["']([^"']+)["']/);
          if (match) {
            const importPath = match[1];
            if (importPath.startsWith('http')) {
              chunkUrls.add(importPath);
            } else if (importPath.startsWith('/')) {
              chunkUrls.add(origin + importPath);
            } else if (importPath.startsWith('.')) {
              // Resolve relative path
              const resolved = this.resolvePath(basePath, importPath);
              chunkUrls.add(origin + resolved);
            }
          }
        }

        // Pattern 5: Common asset path patterns (/code/, /style/, /rsrc/, /assets/)
        const assetPaths = content.match(/["']\/(code|style|rsrc|assets|static|dist|js)\/[^"']+\.(js|css|wasm|zip)["']/gi) || [];
        for (const assetPath of assetPaths) {
          const cleaned = assetPath.replace(/["']/g, '');
          chunkUrls.add(origin + cleaned);
        }

        // Pattern 6: Numbered chunks with various extensions
        const numberedChunks = content.match(/["']([^"']*\/)?(\d+)\.(js|css|wasm|chunk\.js)["']/gi) || [];
        for (const chunk of numberedChunks) {
          const cleaned = chunk.replace(/["']/g, '');
          if (cleaned.startsWith('/')) {
            chunkUrls.add(origin + cleaned);
          } else if (!cleaned.startsWith('http') && !cleaned.includes(' ')) {
            chunkUrls.add(origin + basePath + cleaned);
          }
        }

      } catch (e) {
        this.logger.debug(`Error parsing ${scriptUrl}: ${e.message}`);
      }
    }

    return chunkUrls;
  }

  /**
   * Learn URL patterns from already-loaded resources
   */
  learnPatternsFromResources(origin, resources) {
    const chunkUrls = new Set();
    const seenPaths = new Set();

    // Analyze existing resource URLs for patterns
    for (const [resUrl, data] of resources) {
      try {
        const urlObj = new URL(resUrl);

        // Only analyze URLs from the same origin
        if (urlObj.origin !== origin) continue;

        const pathname = urlObj.pathname;
        seenPaths.add(pathname);

        // Extract directory patterns
        const pathParts = pathname.split('/').filter(p => p);
        if (pathParts.length > 0) {
          const dir = '/' + pathParts.slice(0, -1).join('/') + '/';
          const filename = pathParts[pathParts.length - 1];

          // Pattern 1: Files with timestamps/hashes (e.g., ext1767565813.js -> try different numbers)
          const timestampMatch = filename.match(/^([a-z]+)(\d{10,13})(\.[a-z]+)$/i);
          if (timestampMatch) {
            const [, prefix, timestamp, ext] = timestampMatch;
            // Try current timestamp and nearby timestamps (±1 day)
            const baseTimestamp = Math.floor(Date.now() / 1000);
            for (let offset = -86400; offset <= 86400; offset += 3600) {
              const ts = baseTimestamp + offset;
              chunkUrls.add(origin + dir + prefix + ts + ext);
            }
          }

          // Pattern 2: Files with uppercase prefixes and timestamps (e.g., DBS1764527275.js)
          const upperTimestampMatch = filename.match(/^([A-Z]+)(\d{10,13})(\.[a-z]+)$/);
          if (upperTimestampMatch) {
            const [, prefix, timestamp, ext] = upperTimestampMatch;
            const baseTimestamp = Math.floor(Date.now() / 1000);
            for (let offset = -86400; offset <= 86400; offset += 3600) {
              const ts = baseTimestamp + offset;
              chunkUrls.add(origin + dir + prefix + ts + ext);
            }
          }

          // Pattern 3: Versioned files (e.g., all09.css -> try all01-all20)
          const versionMatch = filename.match(/^([a-z]+)(\d+)(\.[a-z]+)$/i);
          if (versionMatch) {
            const [, prefix, version, ext] = versionMatch;
            const versionNum = parseInt(version);
            // Try versions nearby
            for (let v = Math.max(1, versionNum - 5); v <= versionNum + 10; v++) {
              const paddedV = String(v).padStart(version.length, '0');
              chunkUrls.add(origin + dir + prefix + paddedV + ext);
            }
          }

          // Pattern 4: If we see /code/ext/, also try /code/dbs/, /code/pp/
          if (dir.includes('/code/')) {
            const subDirs = ['ext', 'dbs', 'pp', 'lib', 'main', 'app'];
            for (const subDir of subDirs) {
              const testDir = dir.replace(/\/code\/[^/]+\/$/, `/code/${subDir}/`);
              if (testDir !== dir) {
                chunkUrls.add(origin + testDir + filename);
              }
            }
          }

          // Pattern 5: If we see /style/, also try /styles/, /css/
          if (dir.includes('/style')) {
            const styleDirs = ['/style/', '/styles/', '/css/', '/assets/css/'];
            for (const styleDir of styleDirs) {
              chunkUrls.add(origin + styleDir + filename);
            }
          }

          // Pattern 6: If we see /rsrc/, try common resource paths
          if (dir.includes('/rsrc')) {
            const rsrcDirs = ['/rsrc/', '/resources/', '/assets/', '/static/'];
            for (const rsrcDir of rsrcDirs) {
              chunkUrls.add(origin + rsrcDir + filename);
            }
          }
        }
      } catch (e) {
        // Ignore invalid URLs
      }
    }

    return chunkUrls;
  }

  /**
   * Generate brute-force chunk URLs based on common webpack/vite patterns
   */
  bruteForceChunks(origin) {
    const chunkUrls = new Set();

    // Common base paths for modern bundlers
    const basePaths = [
      '/',
      '/js/',
      '/assets/',
      '/static/',
      '/chunks/',
      '/dist/',
      '/build/',
      '/_next/static/chunks/',
      '/static/js/',
    ];

    // Common naming patterns for numbered chunks (limit to 100 for efficiency)
    for (const basePath of basePaths) {
      for (let i = 0; i < 100; i++) {
        // Plain numbered chunks: 0.js, 1.js, etc.
        chunkUrls.add(origin + basePath + i + '.js');

        // Common webpack patterns: chunk.0.js, main.0.js
        chunkUrls.add(origin + basePath + 'chunk.' + i + '.js');
        chunkUrls.add(origin + basePath + 'main.' + i + '.js');

        // Vite patterns: index-{hash}.js style
        // (we can't guess hashes, but parsers will find these)
      }
    }

    // Common vendor/library chunk names
    const commonChunks = [
      'vendor', 'vendors', 'common', 'commons', 'runtime', 'polyfills',
      'main', 'app', 'bundle', 'index', 'manifest', 'webpack-runtime'
    ];

    for (const basePath of basePaths) {
      for (const chunk of commonChunks) {
        chunkUrls.add(origin + basePath + chunk + '.js');
        chunkUrls.add(origin + basePath + chunk + '.css');

        // With hash placeholder patterns (parsers will find real ones)
        for (let i = 0; i < 5; i++) {
          chunkUrls.add(origin + basePath + chunk + '.' + i + '.js');
          chunkUrls.add(origin + basePath + chunk + '.' + i + '.css');
        }
      }
    }

    return chunkUrls;
  }

  /**
   * Fetch all discovered chunk URLs
   */
  async fetchAllChunks(page, chunkUrls, resources) {
    // Filter to only URLs we haven't tried
    const toFetch = [...chunkUrls].filter(url =>
      !resources.has(url) && !this.attemptedUrls.has(url)
    );

    this.logger.info(`Fetching ${toFetch.length} URLs...`);

    let fetched = 0;
    const batchSize = 30;

    for (let i = 0; i < toFetch.length; i += batchSize) {
      const batch = toFetch.slice(i, i + batchSize);

      const results = await Promise.all(batch.map(async (url) => {
        this.attemptedUrls.add(url);
        try {
          const response = await page.evaluate(async (u) => {
            try {
              const res = await fetch(u, { method: 'GET' });
              if (!res.ok) return null;
              const buffer = await res.arrayBuffer();
              return {
                contentType: res.headers.get('content-type') || '',
                data: Array.from(new Uint8Array(buffer))
              };
            } catch {
              return null;
            }
          }, url);

          if (response && response.data.length > 0) {
            return {
              url,
              contentType: response.contentType,
              body: Buffer.from(response.data),
              size: response.data.length,
            };
          }
        } catch (e) {
          // Fetch failed, ignore
        }
        return null;
      }));

      // Add successful fetches to resources
      for (const result of results) {
        if (result) {
          resources.set(result.url, result);
          fetched++;
        }
      }

      // Progress logging
      if ((i + batchSize) % 200 === 0 || i + batchSize >= toFetch.length) {
        const progress = Math.min(i + batchSize, toFetch.length);
        this.logger.progress(progress, toFetch.length, `${fetched} found`);
      }
    }

    this.logger.info(`Fetched ${fetched} new resources`);
    return fetched;
  }

  /**
   * Resolve relative path (./foo or ../bar) against base path
   */
  resolvePath(basePath, relativePath) {
    const parts = basePath.split('/').filter(p => p);
    const relParts = relativePath.split('/');

    for (const part of relParts) {
      if (part === '.' || part === '') continue;
      if (part === '..') {
        parts.pop();
      } else {
        parts.push(part);
      }
    }

    return '/' + parts.join('/');
  }
}

export default DiscoverPhase;
