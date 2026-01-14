/**
 * Base Discoverer Class
 *
 * Abstract base class for chunk URL discovery strategies.
 * Each bundler-specific discoverer extends this class.
 */

export class BaseDiscoverer {
  bundler = 'base';

  /**
   * Check if this discoverer can handle the detected bundler
   * @param {Object} detection - Detection result with bundler property
   * @returns {boolean}
   */
  canDiscover(detection) {
    return detection.bundler === this.bundler;
  }

  /**
   * Discover chunk URLs from resources
   * @param {Map} resources - Map of URL to resource data
   * @param {string} origin - Origin URL for resolving relative paths
   * @param {Object} page - Playwright page for additional fetching
   * @returns {Promise<Set<string>>} Set of discovered URLs
   */
  async discover(resources, origin, page) {
    return new Set();
  }

  /**
   * Resolve a relative or absolute URL against the origin
   * @param {string} url - URL to resolve
   * @param {string} origin - Base origin
   * @returns {string|null} Resolved URL or null if invalid
   */
  resolveUrl(url, origin) {
    try {
      // Skip data URLs, blob URLs, and invalid patterns
      if (!url || typeof url !== 'string') return null;
      if (url.startsWith('data:')) return null;
      if (url.startsWith('blob:')) return null;
      if (url.startsWith('javascript:')) return null;
      if (url.includes('{{') || url.includes('<%')) return null; // Template strings
      if (url.length < 3 || url.length > 500) return null;

      // Handle protocol-relative URLs
      if (url.startsWith('//')) {
        const originUrl = new URL(origin);
        url = originUrl.protocol + url;
      }

      // Resolve relative URLs
      const resolved = new URL(url, origin);

      // Only allow http/https
      if (!['http:', 'https:'].includes(resolved.protocol)) return null;

      return resolved.href;
    } catch {
      return null;
    }
  }

  /**
   * Filter URLs to only include valid chunk-like resources
   * @param {Set<string>} urls - Set of URLs to filter
   * @param {string} origin - Origin for same-origin check
   * @returns {Set<string>} Filtered URLs
   */
  filterChunkUrls(urls, origin) {
    const filtered = new Set();
    const originUrl = new URL(origin);

    for (const url of urls) {
      try {
        const parsed = new URL(url);

        // Only same origin or CDN patterns
        const isSameOrigin = parsed.origin === originUrl.origin;
        const isCdn = this.isCdnUrl(parsed);

        if (!isSameOrigin && !isCdn) continue;

        // Must look like a chunk file
        if (this.isChunkLikeUrl(parsed.pathname)) {
          filtered.add(url);
        }
      } catch {
        continue;
      }
    }

    return filtered;
  }

  /**
   * Check if URL looks like a CDN
   * @param {URL} parsed - Parsed URL
   * @returns {boolean}
   */
  isCdnUrl(parsed) {
    const cdnPatterns = [
      'cdn', 'static', 'assets', 'cloudfront',
      'cloudflare', 'fastly', 'akamai', 'unpkg',
      'jsdelivr', 'cdnjs'
    ];
    return cdnPatterns.some(p => parsed.hostname.includes(p));
  }

  /**
   * Check if pathname looks like a chunk file
   * @param {string} pathname - URL pathname
   * @returns {boolean}
   */
  isChunkLikeUrl(pathname) {
    // Common chunk patterns
    const chunkPatterns = [
      /\.js$/i,
      /\.mjs$/i,
      /\.css$/i,
      /chunk/i,
      /bundle/i,
      /vendor/i,
      /common/i,
      /runtime/i,
      /polyfill/i,
      /main\./i,
      /app\./i,
      /index\./i,
      /_next\//,
      /_nuxt\//,
      /\.chunk\./,
      /\.[a-f0-9]{8,}\./i  // Hash in filename
    ];

    return chunkPatterns.some(p => p.test(pathname));
  }

  /**
   * Get all JS content from resources
   * @param {Map} resources - Map of URL to resource data
   * @returns {string} Combined JS content
   */
  getJsContent(resources) {
    let content = '';
    for (const [url, data] of resources) {
      if (url.endsWith('.js') || url.endsWith('.mjs') ||
          (data.contentType && data.contentType.includes('javascript'))) {
        content += (data.content || '') + '\n';
      }
    }
    return content;
  }

  /**
   * Batch fetch URLs with concurrency limit
   * @param {Array<string>} urls - URLs to fetch
   * @param {Object} page - Playwright page
   * @param {number} concurrency - Max concurrent requests
   * @returns {Promise<Set<string>>} Set of URLs that returned 200
   */
  async batchFetch(urls, page, concurrency = 10) {
    const valid = new Set();
    const chunks = [];

    for (let i = 0; i < urls.length; i += concurrency) {
      chunks.push(urls.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map(async url => {
          try {
            const response = await page.evaluate(async (fetchUrl) => {
              const res = await fetch(fetchUrl, { method: 'HEAD' });
              return { url: fetchUrl, ok: res.ok, status: res.status };
            }, url);
            return response;
          } catch {
            return { url, ok: false };
          }
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.ok) {
          valid.add(result.value.url);
        }
      }
    }

    return valid;
  }
}
