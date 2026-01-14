/**
 * Nuxt.js Chunk Discoverer
 *
 * Parses Nuxt build manifest to find chunk URLs.
 * Fetches /_nuxt/builds/latest.json for build ID, then build manifest.
 */

import { BaseDiscoverer } from './base.js';

export class NuxtDiscoverer extends BaseDiscoverer {
  bundler = 'nuxt';

  async discover(resources, origin, page) {
    const discovered = new Set();
    const jsContent = this.getJsContent(resources);

    // Strategy 1: Fetch builds/latest.json and follow to manifest
    const fromLatest = await this.fetchFromLatest(origin, page);
    fromLatest.forEach(url => discovered.add(url));

    // Strategy 2: Parse __NUXT__ data
    const fromNuxtData = this.parseNuxtData(jsContent, origin);
    fromNuxtData.forEach(url => discovered.add(url));

    // Strategy 3: Parse payload manifests
    const fromPayload = await this.fetchPayloadManifest(origin, page);
    fromPayload.forEach(url => discovered.add(url));

    // Strategy 4: Extract from _nuxt folder patterns
    const fromPatterns = this.parseNuxtPatterns(resources, jsContent, origin);
    fromPatterns.forEach(url => discovered.add(url));

    // Strategy 5: Parse route chunks
    const fromRoutes = this.parseRouteChunks(jsContent, origin);
    fromRoutes.forEach(url => discovered.add(url));

    return this.filterChunkUrls(discovered, origin);
  }

  /**
   * Fetch builds/latest.json and follow to build manifest
   * @param {string} origin - Origin URL
   * @param {Object} page - Playwright page
   * @returns {Promise<Set<string>>}
   */
  async fetchFromLatest(origin, page) {
    const urls = new Set();

    try {
      // Fetch latest.json to get build ID
      const latestUrl = `${origin}/_nuxt/builds/latest.json`;
      const latestContent = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url);
          if (res.ok) return await res.text();
        } catch {}
        return null;
      }, latestUrl);

      if (latestContent) {
        const latest = JSON.parse(latestContent);
        const buildId = latest.id || latest.buildId;

        if (buildId) {
          // Fetch build manifest
          const manifestUrl = `${origin}/_nuxt/builds/${buildId}/manifest.json`;
          const manifestContent = await page.evaluate(async (url) => {
            try {
              const res = await fetch(url);
              if (res.ok) return await res.text();
            } catch {}
            return null;
          }, manifestUrl);

          if (manifestContent) {
            const manifest = JSON.parse(manifestContent);
            const chunks = this.parseBuildManifest(manifest, origin);
            chunks.forEach(url => urls.add(url));
          }
        }
      }
    } catch {
      // Failed to fetch latest.json, continue with other strategies
    }

    return urls;
  }

  /**
   * Parse Nuxt build manifest
   * @param {Object} manifest - Build manifest object
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseBuildManifest(manifest, origin) {
    const urls = new Set();

    // Extract assets
    if (manifest.assets) {
      for (const asset of Object.values(manifest.assets)) {
        if (typeof asset === 'string') {
          const url = this.resolveUrl(`/_nuxt/${asset}`, origin);
          if (url) urls.add(url);
        } else if (asset && asset.file) {
          const url = this.resolveUrl(`/_nuxt/${asset.file}`, origin);
          if (url) urls.add(url);
        }
      }
    }

    // Extract chunks
    if (manifest.chunks) {
      for (const chunk of Object.values(manifest.chunks)) {
        if (typeof chunk === 'string') {
          const url = this.resolveUrl(`/_nuxt/${chunk}`, origin);
          if (url) urls.add(url);
        } else if (Array.isArray(chunk)) {
          for (const file of chunk) {
            const url = this.resolveUrl(`/_nuxt/${file}`, origin);
            if (url) urls.add(url);
          }
        }
      }
    }

    // Extract routes
    if (manifest.routes) {
      this.extractRoutesFromManifest(manifest.routes, urls, origin);
    }

    return urls;
  }

  /**
   * Extract chunk URLs from route definitions
   * @param {Object} routes - Routes object
   * @param {Set<string>} urls - Set to add URLs to
   * @param {string} origin - Origin URL
   */
  extractRoutesFromManifest(routes, urls, origin) {
    for (const route of Object.values(routes)) {
      if (!route) continue;

      // Direct file reference
      if (route.file) {
        const url = this.resolveUrl(`/_nuxt/${route.file}`, origin);
        if (url) urls.add(url);
      }

      // Component files
      if (route.component) {
        const url = this.resolveUrl(`/_nuxt/${route.component}`, origin);
        if (url) urls.add(url);
      }

      // Children routes
      if (route.children) {
        this.extractRoutesFromManifest(route.children, urls, origin);
      }

      // Imports array
      if (Array.isArray(route.imports)) {
        for (const imp of route.imports) {
          const url = this.resolveUrl(`/_nuxt/${imp}`, origin);
          if (url) urls.add(url);
        }
      }
    }
  }

  /**
   * Parse __NUXT__ data from content
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseNuxtData(content, origin) {
    const urls = new Set();

    // Pattern: window.__NUXT__ = {...} or __NUXT_DATA__
    const nuxtDataPatterns = [
      /window\.__NUXT__\s*=\s*(\{[\s\S]*?\});/,
      /__NUXT__\s*=\s*(\{[\s\S]*?\});/,
      /window\.__NUXT_DATA__\s*=\s*(\[[\s\S]*?\]);/
    ];

    for (const pattern of nuxtDataPatterns) {
      const match = pattern.exec(content);
      if (match) {
        // Extract chunk paths from the data
        const chunkPattern = /"(_nuxt\/[^"]+\.(?:js|css))"/g;
        let chunkMatch;

        while ((chunkMatch = chunkPattern.exec(match[1])) !== null) {
          const url = this.resolveUrl(`/${chunkMatch[1]}`, origin);
          if (url) urls.add(url);
        }
      }
    }

    // Also look for explicit chunk arrays
    const chunkArrayPattern = /\["([^"]+\.js)"(?:,\s*"([^"]+\.js)")*\]/g;
    let arrayMatch;

    while ((arrayMatch = chunkArrayPattern.exec(content)) !== null) {
      const fullMatch = arrayMatch[0];
      const pathPattern = /"([^"]+\.js)"/g;
      let pathMatch;

      while ((pathMatch = pathPattern.exec(fullMatch)) !== null) {
        if (pathMatch[1].includes('_nuxt') || !pathMatch[1].includes('/')) {
          const path = pathMatch[1].startsWith('_nuxt')
            ? `/${pathMatch[1]}`
            : `/_nuxt/${pathMatch[1]}`;
          const url = this.resolveUrl(path, origin);
          if (url) urls.add(url);
        }
      }
    }

    return urls;
  }

  /**
   * Fetch payload manifest
   * @param {string} origin - Origin URL
   * @param {Object} page - Playwright page
   * @returns {Promise<Set<string>>}
   */
  async fetchPayloadManifest(origin, page) {
    const urls = new Set();
    const payloadPaths = [
      '/_payload.json',
      '/_nuxt/payload.json',
      '/_nuxt/manifest.json'
    ];

    for (const path of payloadPaths) {
      try {
        const payloadUrl = `${origin}${path}`;
        const content = await page.evaluate(async (url) => {
          try {
            const res = await fetch(url);
            if (res.ok) return await res.text();
          } catch {}
          return null;
        }, payloadUrl);

        if (content) {
          try {
            const payload = JSON.parse(content);
            this.extractFromPayload(payload, urls, origin);
          } catch {
            // Not valid JSON, try regex extraction
            const filePattern = /"([^"]+\.(?:js|css))"/g;
            let match;
            while ((match = filePattern.exec(content)) !== null) {
              const url = this.resolveUrl(`/_nuxt/${match[1]}`, origin);
              if (url) urls.add(url);
            }
          }
        }
      } catch {
        continue;
      }
    }

    return urls;
  }

  /**
   * Extract URLs from payload object
   * @param {Object} payload - Payload object
   * @param {Set<string>} urls - Set to add URLs to
   * @param {string} origin - Origin URL
   */
  extractFromPayload(payload, urls, origin) {
    if (!payload || typeof payload !== 'object') return;

    // Recursively search for file paths
    const searchObject = (obj) => {
      if (!obj || typeof obj !== 'object') return;

      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          if (value.endsWith('.js') || value.endsWith('.css')) {
            const path = value.startsWith('/') ? value : `/_nuxt/${value}`;
            const url = this.resolveUrl(path, origin);
            if (url) urls.add(url);
          }
        } else if (typeof value === 'object') {
          searchObject(value);
        }
      }
    };

    searchObject(payload);
  }

  /**
   * Parse _nuxt folder patterns from resources and content
   * @param {Map} resources - Resources map
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseNuxtPatterns(resources, content, origin) {
    const urls = new Set();

    // Extract from existing resources
    for (const url of resources.keys()) {
      if (url.includes('/_nuxt/')) {
        urls.add(url);
      }
    }

    // Look for _nuxt paths in content
    const nuxtPathPattern = /_nuxt\/([a-zA-Z0-9_.-]+\.(?:js|css|mjs))/g;
    let match;

    while ((match = nuxtPathPattern.exec(content)) !== null) {
      const url = this.resolveUrl(`/_nuxt/${match[1]}`, origin);
      if (url) urls.add(url);
    }

    return urls;
  }

  /**
   * Parse route-specific chunks
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseRouteChunks(content, origin) {
    const urls = new Set();

    // Pattern: route definitions with component paths
    const routePattern = /component:\s*\(\)\s*=>\s*import\s*\(\s*["']([^"']+)["']\s*\)/g;

    let match;
    while ((match = routePattern.exec(content)) !== null) {
      const componentPath = match[1];
      // Nuxt dynamic imports are typically relative to _nuxt
      const url = this.resolveUrl(`/_nuxt/${componentPath}`, origin);
      if (url) urls.add(url);
    }

    // Also look for explicit chunk references
    const chunkRefPattern = /chunk:\s*["']([^"']+)["']/g;
    while ((match = chunkRefPattern.exec(content)) !== null) {
      const url = this.resolveUrl(`/_nuxt/${match[1]}`, origin);
      if (url) urls.add(url);
    }

    return urls;
  }

  /**
   * Override chunk-like URL check for Nuxt specific patterns
   * @param {string} pathname - URL pathname
   * @returns {boolean}
   */
  isChunkLikeUrl(pathname) {
    // Nuxt specific patterns
    const nuxtPatterns = [
      /_nuxt\//,
      /\.js$/,
      /\.css$/,
      /\.mjs$/
    ];

    return nuxtPatterns.some(p => p.test(pathname));
  }
}
