/**
 * Remix Chunk Discoverer
 *
 * Parses Remix manifest to find chunk URLs.
 * Extracts from window.__remixManifest in HTML.
 */

import { BaseDiscoverer } from './base.js';

export class RemixDiscoverer extends BaseDiscoverer {
  bundler = 'remix';

  async discover(resources, origin, page) {
    const discovered = new Set();
    const jsContent = this.getJsContent(resources);

    // Strategy 1: Parse __remixManifest from HTML/JS
    const fromManifest = this.parseRemixManifest(jsContent, resources, origin);
    fromManifest.forEach(url => discovered.add(url));

    // Strategy 2: Fetch manifest.json if available
    const fromFetch = await this.fetchRemixManifest(origin, page);
    fromFetch.forEach(url => discovered.add(url));

    // Strategy 3: Parse route modules
    const fromRoutes = this.parseRouteModules(jsContent, origin);
    fromRoutes.forEach(url => discovered.add(url));

    // Strategy 4: Parse asset manifest
    const fromAssets = this.parseAssetManifest(jsContent, origin);
    fromAssets.forEach(url => discovered.add(url));

    // Strategy 5: Extract from /build/ patterns
    const fromBuild = this.parseBuildPatterns(resources, jsContent, origin);
    fromBuild.forEach(url => discovered.add(url));

    return this.filterChunkUrls(discovered, origin);
  }

  /**
   * Parse window.__remixManifest from content
   * @param {string} content - JS content
   * @param {Map} resources - Resources map
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseRemixManifest(content, resources, origin) {
    const urls = new Set();

    // Check HTML resources for __remixManifest
    for (const [url, data] of resources) {
      if (url.endsWith('.html') || url === origin || url === origin + '/') {
        const htmlContent = data.content || '';
        const manifestUrls = this.extractManifestFromHtml(htmlContent, origin);
        manifestUrls.forEach(u => urls.add(u));
      }
    }

    // Also check JS content
    const manifestUrls = this.extractManifestFromJs(content, origin);
    manifestUrls.forEach(u => urls.add(u));

    return urls;
  }

  /**
   * Extract __remixManifest from HTML
   * @param {string} html - HTML content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  extractManifestFromHtml(html, origin) {
    const urls = new Set();

    // Pattern: window.__remixManifest = {...}
    const manifestPattern = /window\.__remixManifest\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|$)/;
    const match = manifestPattern.exec(html);

    if (match) {
      try {
        // Try to parse as JSON (may need cleanup)
        let jsonStr = match[1];
        // Remove trailing semicolon if present
        jsonStr = jsonStr.replace(/;?\s*$/, '');

        const manifest = JSON.parse(jsonStr);
        this.extractFromManifestObject(manifest, urls, origin);
      } catch {
        // JSON parse failed, use regex extraction
        this.extractManifestUrlsViaRegex(match[1], urls, origin);
      }
    }

    return urls;
  }

  /**
   * Extract manifest data from JS content
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  extractManifestFromJs(content, origin) {
    const urls = new Set();

    // Pattern: __remixManifest={...}
    const patterns = [
      /__remixManifest\s*=\s*(\{[^;]+\})/,
      /window\.__remixManifest\s*=\s*(\{[^;]+\})/,
      /"manifest"\s*:\s*(\{[\s\S]*?\})\s*[,}]/
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(content);
      if (match) {
        this.extractManifestUrlsViaRegex(match[1], urls, origin);
      }
    }

    return urls;
  }

  /**
   * Extract URLs from manifest object
   * @param {Object} manifest - Manifest object
   * @param {Set<string>} urls - Set to add URLs to
   * @param {string} origin - Origin URL
   */
  extractFromManifestObject(manifest, urls, origin) {
    // Extract entry module
    if (manifest.entry && manifest.entry.module) {
      const url = this.resolveUrl(manifest.entry.module, origin);
      if (url) urls.add(url);

      // Entry imports
      if (Array.isArray(manifest.entry.imports)) {
        for (const imp of manifest.entry.imports) {
          const url = this.resolveUrl(imp, origin);
          if (url) urls.add(url);
        }
      }
    }

    // Extract route modules
    if (manifest.routes) {
      for (const route of Object.values(manifest.routes)) {
        if (!route) continue;

        // Route module
        if (route.module) {
          const url = this.resolveUrl(route.module, origin);
          if (url) urls.add(url);
        }

        // Route imports
        if (Array.isArray(route.imports)) {
          for (const imp of route.imports) {
            const url = this.resolveUrl(imp, origin);
            if (url) urls.add(url);
          }
        }

        // Route CSS
        if (Array.isArray(route.css)) {
          for (const css of route.css) {
            const url = this.resolveUrl(css, origin);
            if (url) urls.add(url);
          }
        }
      }
    }

    // Extract assets
    if (manifest.assets) {
      for (const asset of Object.values(manifest.assets)) {
        if (typeof asset === 'string') {
          const url = this.resolveUrl(asset, origin);
          if (url) urls.add(url);
        }
      }
    }

    // Extract version hash for additional paths
    if (manifest.version) {
      urls.add(this.resolveUrl(`/build/manifest-${manifest.version}.js`, origin));
    }
  }

  /**
   * Extract manifest URLs via regex (fallback)
   * @param {string} content - Manifest content string
   * @param {Set<string>} urls - Set to add URLs to
   * @param {string} origin - Origin URL
   */
  extractManifestUrlsViaRegex(content, urls, origin) {
    // Extract module paths
    const modulePattern = /"module"\s*:\s*"([^"]+)"/g;
    let match;

    while ((match = modulePattern.exec(content)) !== null) {
      const url = this.resolveUrl(match[1], origin);
      if (url) urls.add(url);
    }

    // Extract imports arrays
    const importsPattern = /"imports"\s*:\s*\[([^\]]*)\]/g;
    while ((match = importsPattern.exec(content)) !== null) {
      const pathPattern = /"([^"]+\.js)"/g;
      let pathMatch;

      while ((pathMatch = pathPattern.exec(match[1])) !== null) {
        const url = this.resolveUrl(pathMatch[1], origin);
        if (url) urls.add(url);
      }
    }

    // Extract CSS files
    const cssPattern = /"css"\s*:\s*\[([^\]]*)\]/g;
    while ((match = cssPattern.exec(content)) !== null) {
      const pathPattern = /"([^"]+\.css)"/g;
      let pathMatch;

      while ((pathMatch = pathPattern.exec(match[1])) !== null) {
        const url = this.resolveUrl(pathMatch[1], origin);
        if (url) urls.add(url);
      }
    }

    // Generic file path extraction
    const filePattern = /"(\/build\/[^"]+\.(?:js|css))"/g;
    while ((match = filePattern.exec(content)) !== null) {
      const url = this.resolveUrl(match[1], origin);
      if (url) urls.add(url);
    }
  }

  /**
   * Fetch manifest.json from server
   * @param {string} origin - Origin URL
   * @param {Object} page - Playwright page
   * @returns {Promise<Set<string>>}
   */
  async fetchRemixManifest(origin, page) {
    const urls = new Set();
    const manifestPaths = [
      '/build/manifest.json',
      '/__manifest',
      '/build/__manifest.js'
    ];

    for (const path of manifestPaths) {
      try {
        const manifestUrl = `${origin}${path}`;
        const content = await page.evaluate(async (url) => {
          try {
            const res = await fetch(url);
            if (res.ok) return await res.text();
          } catch {}
          return null;
        }, manifestUrl);

        if (content) {
          try {
            const manifest = JSON.parse(content);
            this.extractFromManifestObject(manifest, urls, origin);
          } catch {
            this.extractManifestUrlsViaRegex(content, urls, origin);
          }
        }
      } catch {
        continue;
      }
    }

    return urls;
  }

  /**
   * Parse route modules from content
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseRouteModules(content, origin) {
    const urls = new Set();

    // Pattern: route module definitions
    const routePattern = /routes\/([^"'\s]+)["']/g;

    let match;
    while ((match = routePattern.exec(content)) !== null) {
      const routePath = match[1];
      // Try common Remix route module patterns
      const patterns = [
        `/build/routes/${routePath}`,
        `/build/routes/${routePath}.js`,
        `/build/${routePath}`
      ];

      for (const path of patterns) {
        const url = this.resolveUrl(path, origin);
        if (url) urls.add(url);
      }
    }

    return urls;
  }

  /**
   * Parse asset manifest
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseAssetManifest(content, origin) {
    const urls = new Set();

    // Pattern: asset references in Remix
    const assetPattern = /\/build\/[a-zA-Z0-9_/-]+\.[a-f0-9]+\.(?:js|css)/g;

    let match;
    while ((match = assetPattern.exec(content)) !== null) {
      const url = this.resolveUrl(match[0], origin);
      if (url) urls.add(url);
    }

    return urls;
  }

  /**
   * Parse /build/ folder patterns
   * @param {Map} resources - Resources map
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseBuildPatterns(resources, content, origin) {
    const urls = new Set();

    // Extract from existing resources
    for (const url of resources.keys()) {
      if (url.includes('/build/')) {
        urls.add(url);
      }
    }

    // Look for /build/ paths in content
    const buildPattern = /["'](\/build\/[^"']+\.(?:js|css))["']/g;
    let match;

    while ((match = buildPattern.exec(content)) !== null) {
      const url = this.resolveUrl(match[1], origin);
      if (url) urls.add(url);
    }

    return urls;
  }

  /**
   * Override chunk-like URL check for Remix specific patterns
   * @param {string} pathname - URL pathname
   * @returns {boolean}
   */
  isChunkLikeUrl(pathname) {
    // Remix specific patterns
    const remixPatterns = [
      /\/build\//,
      /\.js$/,
      /\.css$/,
      /routes\//
    ];

    return remixPatterns.some(p => p.test(pathname));
  }
}
