/**
 * Vite Chunk Discoverer
 *
 * Parses Vite manifest.json to find chunk URLs.
 * Follows imports and dynamicImports arrays.
 */

import { BaseDiscoverer } from './base.js';

export class ViteDiscoverer extends BaseDiscoverer {
  bundler = 'vite';

  async discover(resources, origin, page) {
    const discovered = new Set();
    const jsContent = this.getJsContent(resources);

    // Strategy 1: Fetch and parse /.vite/manifest.json
    const fromManifest = await this.fetchViteManifest(origin, page);
    fromManifest.forEach(url => discovered.add(url));

    // Strategy 2: Look for manifest in dist folder
    const fromDistManifest = await this.fetchDistManifest(origin, page);
    fromDistManifest.forEach(url => discovered.add(url));

    // Strategy 3: Parse dynamic imports from JS content
    const fromDynamicImports = this.parseDynamicImports(jsContent, origin);
    fromDynamicImports.forEach(url => discovered.add(url));

    // Strategy 4: Parse module preload hints
    const fromPreloads = this.parseModulePreloads(jsContent, resources, origin);
    fromPreloads.forEach(url => discovered.add(url));

    // Strategy 5: Extract chunk patterns from existing resources
    const fromPatterns = this.extractChunkPatterns(resources, origin);
    fromPatterns.forEach(url => discovered.add(url));

    return this.filterChunkUrls(discovered, origin);
  }

  /**
   * Fetch and parse /.vite/manifest.json
   * @param {string} origin - Origin URL
   * @param {Object} page - Playwright page
   * @returns {Promise<Set<string>>}
   */
  async fetchViteManifest(origin, page) {
    const urls = new Set();
    const manifestPaths = [
      '/.vite/manifest.json',
      '/manifest.json',
      '/dist/.vite/manifest.json'
    ];

    for (const manifestPath of manifestPaths) {
      try {
        const manifestUrl = `${origin}${manifestPath}`;
        const content = await page.evaluate(async (url) => {
          try {
            const res = await fetch(url);
            if (res.ok) {
              return await res.text();
            }
          } catch {}
          return null;
        }, manifestUrl);

        if (content) {
          const parsed = this.parseManifestJson(content, origin);
          parsed.forEach(url => urls.add(url));
          break; // Found manifest, no need to try other paths
        }
      } catch {
        continue;
      }
    }

    return urls;
  }

  /**
   * Fetch manifest from dist folder
   * @param {string} origin - Origin URL
   * @param {Object} page - Playwright page
   * @returns {Promise<Set<string>>}
   */
  async fetchDistManifest(origin, page) {
    const urls = new Set();

    // Try common dist folder paths
    const distPaths = [
      '/dist/manifest.json',
      '/build/manifest.json',
      '/assets/manifest.json'
    ];

    for (const path of distPaths) {
      try {
        const manifestUrl = `${origin}${path}`;
        const content = await page.evaluate(async (url) => {
          try {
            const res = await fetch(url);
            if (res.ok) {
              return await res.text();
            }
          } catch {}
          return null;
        }, manifestUrl);

        if (content) {
          const parsed = this.parseManifestJson(content, origin);
          parsed.forEach(url => urls.add(url));
          break;
        }
      } catch {
        continue;
      }
    }

    return urls;
  }

  /**
   * Parse Vite manifest.json content
   * @param {string} content - Manifest JSON content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseManifestJson(content, origin) {
    const urls = new Set();

    try {
      const manifest = JSON.parse(content);

      // Recursively extract all file references
      this.extractFilesFromManifest(manifest, urls, origin, new Set());
    } catch {
      // JSON parse failed, try regex extraction
      const filePattern = /"file"\s*:\s*"([^"]+)"/g;
      let match;

      while ((match = filePattern.exec(content)) !== null) {
        const url = this.resolveUrl(`/assets/${match[1]}`, origin);
        if (url) urls.add(url);
      }
    }

    return urls;
  }

  /**
   * Recursively extract files from manifest object
   * @param {Object} manifest - Manifest object or entry
   * @param {Set<string>} urls - Set to add URLs to
   * @param {string} origin - Origin URL
   * @param {Set<string>} seen - Already processed entries
   */
  extractFilesFromManifest(manifest, urls, origin, seen) {
    if (!manifest || typeof manifest !== 'object') return;

    // Process each entry in the manifest
    for (const [key, entry] of Object.entries(manifest)) {
      if (seen.has(key)) continue;
      seen.add(key);

      if (typeof entry !== 'object' || entry === null) continue;

      // Extract main file
      if (entry.file) {
        const filePath = entry.file.startsWith('/')
          ? entry.file
          : `/assets/${entry.file}`;
        const url = this.resolveUrl(filePath, origin);
        if (url) urls.add(url);
      }

      // Extract CSS files
      if (Array.isArray(entry.css)) {
        for (const cssFile of entry.css) {
          const cssPath = cssFile.startsWith('/')
            ? cssFile
            : `/assets/${cssFile}`;
          const url = this.resolveUrl(cssPath, origin);
          if (url) urls.add(url);
        }
      }

      // Follow imports (static imports)
      if (Array.isArray(entry.imports)) {
        for (const importKey of entry.imports) {
          if (manifest[importKey] && !seen.has(importKey)) {
            this.extractFilesFromManifest(
              { [importKey]: manifest[importKey] },
              urls,
              origin,
              seen
            );
          }
        }
      }

      // Follow dynamicImports
      if (Array.isArray(entry.dynamicImports)) {
        for (const importKey of entry.dynamicImports) {
          if (manifest[importKey] && !seen.has(importKey)) {
            this.extractFilesFromManifest(
              { [importKey]: manifest[importKey] },
              urls,
              origin,
              seen
            );
          }
        }
      }

      // Extract assets
      if (Array.isArray(entry.assets)) {
        for (const asset of entry.assets) {
          const assetPath = asset.startsWith('/')
            ? asset
            : `/assets/${asset}`;
          const url = this.resolveUrl(assetPath, origin);
          if (url) urls.add(url);
        }
      }
    }
  }

  /**
   * Parse dynamic imports from JS content
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseDynamicImports(content, origin) {
    const urls = new Set();

    // Pattern: import("./chunks/chunk-name.js")
    const importPatterns = [
      /import\s*\(\s*["'`]([^"'`]+\.js)["'`]\s*\)/g,
      /__vitePreload\s*\(\s*\(\)\s*=>\s*import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
      /preloadModule\s*\(\s*["'`]([^"'`]+\.js)["'`]\s*\)/g
    ];

    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];

        // Resolve relative to assets folder
        let fullPath;
        if (importPath.startsWith('./')) {
          fullPath = `/assets/${importPath.slice(2)}`;
        } else if (importPath.startsWith('/')) {
          fullPath = importPath;
        } else {
          fullPath = `/assets/${importPath}`;
        }

        const url = this.resolveUrl(fullPath, origin);
        if (url) urls.add(url);
      }
    }

    return urls;
  }

  /**
   * Parse modulepreload hints from content
   * @param {string} content - JS content
   * @param {Map} resources - Resources map
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseModulePreloads(content, resources, origin) {
    const urls = new Set();

    // Pattern: <link rel="modulepreload" href="...">
    const preloadPattern = /rel=["']modulepreload["'][^>]*href=["']([^"']+)["']/gi;

    // Also check in HTML resources
    for (const [url, data] of resources) {
      const checkContent = data.content || '';

      let match;
      while ((match = preloadPattern.exec(checkContent)) !== null) {
        const preloadUrl = this.resolveUrl(match[1], origin);
        if (preloadUrl) urls.add(preloadUrl);
      }
    }

    // Check in JS content for dynamically added preloads
    const jsPreloadPattern = /modulepreload.*?["']([^"']+\.js)["']/g;
    let match;

    while ((match = jsPreloadPattern.exec(content)) !== null) {
      const preloadUrl = this.resolveUrl(match[1], origin);
      if (preloadUrl) urls.add(preloadUrl);
    }

    return urls;
  }

  /**
   * Extract chunk patterns from existing resources
   * @param {Map} resources - Resources map
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  extractChunkPatterns(resources, origin) {
    const urls = new Set();

    // Find Vite chunk pattern from resources
    const viteChunkPattern = /\/assets\/[^/]+-[a-zA-Z0-9]+\.(?:js|css)/;
    const chunkPrefixes = new Set();

    for (const url of resources.keys()) {
      if (viteChunkPattern.test(url)) {
        // Extract the prefix pattern
        const prefixMatch = url.match(/\/assets\/([^-]+)-/);
        if (prefixMatch) {
          chunkPrefixes.add(prefixMatch[1]);
        }
        urls.add(url);
      }
    }

    return urls;
  }

  /**
   * Override chunk-like URL check for Vite specific patterns
   * @param {string} pathname - URL pathname
   * @returns {boolean}
   */
  isChunkLikeUrl(pathname) {
    // Vite specific patterns
    const vitePatterns = [
      /\/assets\//,
      /\.js$/,
      /\.css$/,
      /\.mjs$/,
      /-[a-zA-Z0-9]{8}\./  // Hash pattern
    ];

    return vitePatterns.some(p => p.test(pathname));
  }
}
