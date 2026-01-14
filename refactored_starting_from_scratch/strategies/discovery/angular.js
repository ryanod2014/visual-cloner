/**
 * Angular Chunk Discoverer
 *
 * Parses Angular chunks by looking for common patterns.
 * Looks for main.*.js, polyfills.*.js, runtime.*.js patterns.
 */

import { BaseDiscoverer } from './base.js';

export class AngularDiscoverer extends BaseDiscoverer {
  bundler = 'angular';

  async discover(resources, origin, page) {
    const discovered = new Set();
    const jsContent = this.getJsContent(resources);

    // Strategy 1: Parse stats.json if available
    const fromStats = await this.fetchStatsJson(origin, page);
    fromStats.forEach(url => discovered.add(url));

    // Strategy 2: Extract lazy-loaded modules
    const fromLazyModules = this.parseLazyModules(jsContent, origin);
    fromLazyModules.forEach(url => discovered.add(url));

    // Strategy 3: Parse Angular chunk patterns from resources
    const fromPatterns = this.parseAngularPatterns(resources, origin);
    fromPatterns.forEach(url => discovered.add(url));

    // Strategy 4: Extract from runtime chunk
    const fromRuntime = this.parseRuntimeChunk(jsContent, origin);
    fromRuntime.forEach(url => discovered.add(url));

    // Strategy 5: Derive numbered chunks from existing patterns
    const fromNumbered = await this.deriveNumberedChunks(resources, origin, page);
    fromNumbered.forEach(url => discovered.add(url));

    return this.filterChunkUrls(discovered, origin);
  }

  /**
   * Fetch and parse stats.json
   * @param {string} origin - Origin URL
   * @param {Object} page - Playwright page
   * @returns {Promise<Set<string>>}
   */
  async fetchStatsJson(origin, page) {
    const urls = new Set();
    const statsPaths = [
      '/stats.json',
      '/assets/stats.json',
      '/browser/stats.json'
    ];

    for (const path of statsPaths) {
      try {
        const statsUrl = `${origin}${path}`;
        const content = await page.evaluate(async (url) => {
          try {
            const res = await fetch(url);
            if (res.ok) return await res.text();
          } catch {}
          return null;
        }, statsUrl);

        if (content) {
          const stats = JSON.parse(content);
          this.extractFromStats(stats, urls, origin);
          break;
        }
      } catch {
        continue;
      }
    }

    return urls;
  }

  /**
   * Extract chunk URLs from stats.json
   * @param {Object} stats - Stats object
   * @param {Set<string>} urls - Set to add URLs to
   * @param {string} origin - Origin URL
   */
  extractFromStats(stats, urls, origin) {
    // Extract from assets
    if (Array.isArray(stats.assets)) {
      for (const asset of stats.assets) {
        if (asset.name && (asset.name.endsWith('.js') || asset.name.endsWith('.css'))) {
          const url = this.resolveUrl(`/${asset.name}`, origin);
          if (url) urls.add(url);
        }
      }
    }

    // Extract from chunks
    if (Array.isArray(stats.chunks)) {
      for (const chunk of stats.chunks) {
        if (Array.isArray(chunk.files)) {
          for (const file of chunk.files) {
            if (file.endsWith('.js') || file.endsWith('.css')) {
              const url = this.resolveUrl(`/${file}`, origin);
              if (url) urls.add(url);
            }
          }
        }
      }
    }

    // Extract from namedChunks
    if (stats.namedChunks) {
      for (const chunk of Object.values(stats.namedChunks)) {
        if (Array.isArray(chunk)) {
          for (const file of chunk) {
            const url = this.resolveUrl(`/${file}`, origin);
            if (url) urls.add(url);
          }
        }
      }
    }
  }

  /**
   * Parse lazy-loaded modules from content
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseLazyModules(content, origin) {
    const urls = new Set();

    // Pattern: loadChildren: () => import('./path/module')
    const lazyPatterns = [
      /loadChildren:\s*\(\)\s*=>\s*import\s*\(\s*["']([^"']+)["']\s*\)/g,
      /loadChildren:\s*["']([^"']+)["']/g,
      /import\s*\(\s*["']\.?\/([^"']+(?:module|routing)[^"']*)["']\s*\)/gi
    ];

    for (const pattern of lazyPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const modulePath = match[1];

        // Convert module path to chunk path
        const chunkPaths = this.modulePathToChunkPaths(modulePath);
        for (const path of chunkPaths) {
          const url = this.resolveUrl(path, origin);
          if (url) urls.add(url);
        }
      }
    }

    return urls;
  }

  /**
   * Convert module path to potential chunk paths
   * @param {string} modulePath - Module path from import
   * @returns {string[]}
   */
  modulePathToChunkPaths(modulePath) {
    const paths = [];

    // Clean up module path
    let cleaned = modulePath
      .replace(/^\.\//, '')
      .replace(/#.*$/, '')
      .replace(/\.ts$/, '')
      .replace(/\.module$/, '');

    // Generate potential chunk names
    const baseName = cleaned.split('/').pop();

    paths.push(
      `/${cleaned}.js`,
      `/${baseName}.js`,
      `/${cleaned}-module.js`,
      `/${baseName}-module.js`
    );

    return paths;
  }

  /**
   * Parse Angular-specific chunk patterns from resources
   * @param {Map} resources - Resources map
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseAngularPatterns(resources, origin) {
    const urls = new Set();

    // Common Angular chunk patterns
    const angularPatterns = [
      /main\.[a-f0-9]+\.js$/,
      /polyfills\.[a-f0-9]+\.js$/,
      /runtime\.[a-f0-9]+\.js$/,
      /vendor\.[a-f0-9]+\.js$/,
      /common\.[a-f0-9]+\.js$/,
      /styles\.[a-f0-9]+\.css$/,
      /\d+\.[a-f0-9]+\.js$/  // Numbered chunks
    ];

    // Extract patterns from existing resources
    const hashPatterns = new Set();

    for (const url of resources.keys()) {
      // Check if it matches Angular patterns
      for (const pattern of angularPatterns) {
        if (pattern.test(url)) {
          urls.add(url);

          // Extract the hash pattern
          const hashMatch = url.match(/\.([a-f0-9]{8,20})\./);
          if (hashMatch) {
            hashPatterns.add(hashMatch[1].length);
          }
        }
      }
    }

    return urls;
  }

  /**
   * Parse runtime chunk for chunk mappings
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseRuntimeChunk(content, origin) {
    const urls = new Set();

    // Look for chunk ID to filename mappings in runtime
    // Pattern: {1:"hash1",2:"hash2",...}
    const mappingPattern = /\{(?:\d+:"[a-f0-9]+",?\s*)+\}/g;

    let match;
    while ((match = mappingPattern.exec(content)) !== null) {
      const mappings = this.parseChunkMappings(match[0]);

      for (const [id, hash] of Object.entries(mappings)) {
        // Try common Angular chunk URL patterns
        const patterns = [
          `/${id}.${hash}.js`,
          `/${id}-${hash}.js`,
          `/chunk-${id}.${hash}.js`
        ];

        for (const path of patterns) {
          const url = this.resolveUrl(path, origin);
          if (url) urls.add(url);
        }
      }
    }

    // Also look for script loading patterns
    const scriptPattern = /["']([^"']*\d+\.[a-f0-9]+\.js)["']/g;
    while ((match = scriptPattern.exec(content)) !== null) {
      const url = this.resolveUrl(match[1], origin);
      if (url) urls.add(url);
    }

    return urls;
  }

  /**
   * Parse chunk mapping object
   * @param {string} objStr - Object string
   * @returns {Object}
   */
  parseChunkMappings(objStr) {
    const mappings = {};
    const pattern = /(\d+):"([a-f0-9]+)"/g;

    let match;
    while ((match = pattern.exec(objStr)) !== null) {
      mappings[match[1]] = match[2];
    }

    return mappings;
  }

  /**
   * Derive numbered chunks from existing patterns
   * @param {Map} resources - Resources map
   * @param {string} origin - Origin URL
   * @param {Object} page - Playwright page
   * @returns {Promise<Set<string>>}
   */
  async deriveNumberedChunks(resources, origin, page) {
    const urls = new Set();

    // Find existing numbered chunk pattern
    let chunkTemplate = null;

    for (const url of resources.keys()) {
      // Match pattern like /5.abc123.js
      const match = url.match(/\/(\d+)\.([a-f0-9]+)\.js$/);
      if (match) {
        chunkTemplate = {
          prefix: url.substring(0, url.lastIndexOf('/') + 1),
          hash: match[2],
          hashLength: match[2].length
        };
        break;
      }
    }

    if (!chunkTemplate) return urls;

    // Try numbered chunks 0-30 (reasonable range for Angular apps)
    const candidateUrls = [];
    for (let i = 0; i <= 30; i++) {
      const url = `${chunkTemplate.prefix}${i}.${chunkTemplate.hash}.js`;
      candidateUrls.push(url);
    }

    // Batch verify
    const valid = await this.batchFetch(candidateUrls, page, 5);
    valid.forEach(url => urls.add(url));

    return urls;
  }

  /**
   * Override chunk-like URL check for Angular specific patterns
   * @param {string} pathname - URL pathname
   * @returns {boolean}
   */
  isChunkLikeUrl(pathname) {
    // Angular specific patterns
    const angularPatterns = [
      /\.js$/,
      /\.css$/,
      /main\./,
      /polyfills?\./,
      /runtime\./,
      /vendor\./,
      /common\./,
      /styles\./,
      /\d+\.[a-f0-9]+\./
    ];

    return angularPatterns.some(p => p.test(pathname));
  }
}
