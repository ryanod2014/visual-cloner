/**
 * Next.js Chunk Discoverer
 *
 * Parses Next.js buildManifest to find chunk URLs.
 * Fetches /_next/static/{buildId}/_buildManifest.js
 */

import { BaseDiscoverer } from './base.js';

export class NextjsDiscoverer extends BaseDiscoverer {
  bundler = 'nextjs';

  async discover(resources, origin, page) {
    const discovered = new Set();
    const jsContent = this.getJsContent(resources);

    // Strategy 1: Find and parse build manifest
    const buildId = this.extractBuildId(jsContent, resources);
    if (buildId) {
      const manifestUrls = await this.fetchBuildManifest(buildId, origin, page);
      manifestUrls.forEach(url => discovered.add(url));
    }

    // Strategy 2: Parse __BUILD_MANIFEST from captured resources
    const fromCaptured = this.parseCapturedManifest(jsContent, origin);
    fromCaptured.forEach(url => discovered.add(url));

    // Strategy 3: Extract from _ssgManifest
    const fromSsg = this.parseSsgManifest(jsContent, origin);
    fromSsg.forEach(url => discovered.add(url));

    // Strategy 4: Parse route chunks from HTML/JS
    const fromRoutes = this.parseRouteChunks(jsContent, origin);
    fromRoutes.forEach(url => discovered.add(url));

    // Strategy 5: Look for page chunk patterns
    const fromPages = this.parsePageChunks(resources, origin);
    fromPages.forEach(url => discovered.add(url));

    return this.filterChunkUrls(discovered, origin);
  }

  /**
   * Extract Next.js build ID from content or resources
   * @param {string} content - JS content
   * @param {Map} resources - Resources map
   * @returns {string|null}
   */
  extractBuildId(content, resources) {
    // From _next URLs in resources
    for (const url of resources.keys()) {
      const match = url.match(/_next\/static\/([^/]+)\//);
      if (match && match[1] !== 'chunks' && match[1] !== 'css') {
        return match[1];
      }
    }

    // From __NEXT_DATA__
    const nextDataPattern = /"buildId"\s*:\s*"([^"]+)"/;
    const match = nextDataPattern.exec(content);
    if (match) {
      return match[1];
    }

    // From script src attributes
    const scriptSrcPattern = /_next\/static\/([a-zA-Z0-9_-]+)\/(?:_buildManifest|_ssgManifest)/;
    const srcMatch = scriptSrcPattern.exec(content);
    if (srcMatch) {
      return srcMatch[1];
    }

    return null;
  }

  /**
   * Fetch and parse _buildManifest.js
   * @param {string} buildId - Build ID
   * @param {string} origin - Origin URL
   * @param {Object} page - Playwright page
   * @returns {Promise<Set<string>>}
   */
  async fetchBuildManifest(buildId, origin, page) {
    const urls = new Set();
    const manifestUrl = `${origin}/_next/static/${buildId}/_buildManifest.js`;

    try {
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
        const chunks = this.parseBuildManifestContent(content, origin, buildId);
        chunks.forEach(url => urls.add(url));
      }
    } catch {
      // Manifest fetch failed, continue with other strategies
    }

    return urls;
  }

  /**
   * Parse _buildManifest.js content
   * @param {string} content - Manifest content
   * @param {string} origin - Origin URL
   * @param {string} buildId - Build ID
   * @returns {Set<string>}
   */
  parseBuildManifestContent(content, origin, buildId) {
    const urls = new Set();

    // Pattern: self.__BUILD_MANIFEST = {...}
    // The manifest contains route to chunk mappings

    // Extract all chunk paths
    const chunkPattern = /"([^"]+\.js)"/g;
    let match;

    while ((match = chunkPattern.exec(content)) !== null) {
      const chunkPath = match[1];

      // Build full URL
      let fullPath;
      if (chunkPath.startsWith('static/')) {
        fullPath = `/_next/${chunkPath}`;
      } else if (!chunkPath.startsWith('/')) {
        fullPath = `/_next/static/chunks/${chunkPath}`;
      } else {
        fullPath = chunkPath;
      }

      const url = this.resolveUrl(fullPath, origin);
      if (url) urls.add(url);
    }

    // Also extract CSS chunks
    const cssPattern = /"([^"]+\.css)"/g;
    while ((match = cssPattern.exec(content)) !== null) {
      const cssPath = match[1];
      let fullPath;

      if (cssPath.startsWith('static/')) {
        fullPath = `/_next/${cssPath}`;
      } else if (!cssPath.startsWith('/')) {
        fullPath = `/_next/static/css/${cssPath}`;
      } else {
        fullPath = cssPath;
      }

      const url = this.resolveUrl(fullPath, origin);
      if (url) urls.add(url);
    }

    return urls;
  }

  /**
   * Parse captured __BUILD_MANIFEST from resources
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseCapturedManifest(content, origin) {
    const urls = new Set();

    // Look for __BUILD_MANIFEST assignment
    const manifestPattern = /self\.__BUILD_MANIFEST\s*=\s*(\{[\s\S]*?\});/g;
    const funcPattern = /self\.__BUILD_MANIFEST_CB\s*&&\s*self\.__BUILD_MANIFEST_CB\s*\(\)/;

    // Find manifest object
    let match;
    while ((match = manifestPattern.exec(content)) !== null) {
      const manifestStr = match[1];

      // Extract all string values that look like chunk paths
      const pathPattern = /"([^"]*(?:chunks|pages|css)[^"]*\.(?:js|css))"/g;
      let pathMatch;

      while ((pathMatch = pathPattern.exec(manifestStr)) !== null) {
        const path = pathMatch[1];
        const url = this.resolveUrl(`/_next/static/${path}`, origin);
        if (url) urls.add(url);
      }
    }

    return urls;
  }

  /**
   * Parse _ssgManifest for static page chunks
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseSsgManifest(content, origin) {
    const urls = new Set();

    // Pattern: self.__SSG_MANIFEST=new Set([...])
    const ssgPattern = /self\.__SSG_MANIFEST\s*=\s*new\s+Set\s*\(\s*\[([^\]]*)\]/g;

    let match;
    while ((match = ssgPattern.exec(content)) !== null) {
      const listStr = match[1];

      // Extract paths
      const pathPattern = /"([^"]+)"/g;
      let pathMatch;

      while ((pathMatch = pathPattern.exec(listStr)) !== null) {
        const pagePath = pathMatch[1];
        // SSG manifest contains page routes, not chunk paths
        // But we can derive chunk paths from them
        const chunkPath = this.pageRouteToChunkPath(pagePath);
        const url = this.resolveUrl(chunkPath, origin);
        if (url) urls.add(url);
      }
    }

    return urls;
  }

  /**
   * Parse route-specific chunks from content
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseRouteChunks(content, origin) {
    const urls = new Set();

    // Pattern: route patterns with associated chunks
    // e.g., "/dashboard": ["static/chunks/pages/dashboard-abc123.js"]
    const routePattern = /"(\/[^"]*)":\s*\[([^\]]*)\]/g;

    let match;
    while ((match = routePattern.exec(content)) !== null) {
      const chunkList = match[2];

      const pathPattern = /"([^"]+\.js)"/g;
      let pathMatch;

      while ((pathMatch = pathPattern.exec(chunkList)) !== null) {
        const chunkPath = pathMatch[1];
        const fullPath = chunkPath.startsWith('static/')
          ? `/_next/${chunkPath}`
          : `/_next/static/chunks/${chunkPath}`;

        const url = this.resolveUrl(fullPath, origin);
        if (url) urls.add(url);
      }
    }

    return urls;
  }

  /**
   * Parse page chunks from resource URLs
   * @param {Map} resources - Resources map
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parsePageChunks(resources, origin) {
    const urls = new Set();
    const pageChunkPattern = /_next\/static\/chunks\/pages\//;
    const appChunkPattern = /_next\/static\/chunks\/app\//;

    // Extract patterns from existing resources
    for (const url of resources.keys()) {
      if (pageChunkPattern.test(url) || appChunkPattern.test(url)) {
        // Extract the pattern and look for related chunks
        const pathMatch = url.match(/_next\/static\/chunks\/(pages|app)\/([^-]+)/);
        if (pathMatch) {
          // We found a chunk, add patterns for related chunks
          urls.add(url);
        }
      }
    }

    return urls;
  }

  /**
   * Convert page route to potential chunk path
   * @param {string} route - Page route
   * @returns {string}
   */
  pageRouteToChunkPath(route) {
    // Convert /dashboard to /_next/static/chunks/pages/dashboard.js (approximately)
    const pageName = route === '/' ? 'index' : route.replace(/^\//, '').replace(/\//g, '-');
    return `/_next/static/chunks/pages/${pageName}.js`;
  }

  /**
   * Override chunk-like URL check for Next.js specific patterns
   * @param {string} pathname - URL pathname
   * @returns {boolean}
   */
  isChunkLikeUrl(pathname) {
    // Next.js specific patterns
    const nextPatterns = [
      /_next\/static\//,
      /\.js$/,
      /\.css$/
    ];

    return nextPatterns.some(p => p.test(pathname));
  }
}
