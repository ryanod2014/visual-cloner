/**
 * Phase 03: Discover
 *
 * EXHAUSTIVE resource discovery through static analysis.
 *
 * Philosophy: Every URL a webapp can request MUST be in the code somewhere.
 * We extract EVERY string, classify them, expand templates, and try EVERYTHING.
 * 404s are cheap. Missing resources break the app.
 *
 * Process:
 * 1. Use detection results to select appropriate discovery strategy
 * 2. Extract ALL strings from ALL JS/CSS/HTML files
 * 3. Classify strings as URLs, paths, components
 * 4. Expand all template combinations
 * 5. Fetch everything that could be a URL (batch, parallel)
 * 6. RECURSE - analyze newly fetched resources
 * 7. Repeat until NOTHING NEW is discovered (saturation)
 */

import { Phase } from '../core/pipeline.js';

export class DiscoverPhase extends Phase {
  constructor(config = {}) {
    super('discover', 'Exhaustive resource discovery');
    this.config = {
      maxIterations: config.maxIterations || 10,     // Max recursion depth
      batchSize: config.batchSize || 50,             // Concurrent fetches
      timeout: config.timeout || 5000,               // Fetch timeout (ms)
      ...config
    };
    this.attemptedUrls = new Set();
  }

  async execute(context) {
    const { page, url, resources, detection } = context;
    const origin = new URL(url).origin;

    const initialCount = resources.size;
    this.logger.info(`Starting discovery with ${initialCount} captured resources`);

    if (this.config.dryRun) {
      this.logger.info('Would use detection results to select discovery strategy');
      this.logger.info('Would extract URLs from all JS/CSS/HTML files');
      this.logger.info('Would expand template patterns');
      this.logger.info('Would fetch discovered URLs in parallel batches');
      this.logger.info('Would loop until saturation (no new URLs found)');

      return {
        initialCount,
        finalCount: initialCount + 50,
        newResources: 50,
        iterations: 3,
        urlsAttempted: 200,
        dryRun: true,
      };
    }

    // Mark existing URLs as attempted
    for (const resUrl of resources.keys()) {
      this.attemptedUrls.add(resUrl);
    }

    // Log detection info if available
    if (detection && detection.bundler !== 'unknown') {
      this.logger.info(`Using ${detection.bundler} discovery strategy`);
      this.trackAction(`Strategy: ${detection.bundler}`);
    }

    // RECURSIVE SATURATION LOOP
    // Keep discovering and fetching until nothing new is found
    let iteration = 0;
    let totalNewResources = 0;

    while (iteration < this.config.maxIterations) {
      iteration++;
      this.logger.info(`\n--- Discovery iteration ${iteration} ---`);

      // Step 1: Extract URLs from ALL current resources
      const discoveredUrls = this.extractAllUrls(resources, origin, detection);

      // Step 2: Filter to only URLs we haven't tried
      const urlsToTry = [...discoveredUrls].filter(u => !this.attemptedUrls.has(u));
      this.logger.info(`New URLs to try: ${urlsToTry.length}`);

      if (urlsToTry.length === 0) {
        this.logger.info(`Saturation reached - no new URLs to discover`);
        this.trackAction('Saturation reached');
        break;
      }

      // Step 3: Fetch all new URLs
      const newResources = await this.fetchAllUrls(urlsToTry, resources);
      totalNewResources += newResources;

      this.logger.info(`Fetched ${newResources} new resources this iteration`);
      this.trackProcessed(urlsToTry.length);

      // If we didn't find anything new, we're done
      if (newResources === 0) {
        this.logger.info(`No new resources found - discovery complete`);
        this.trackAction('Discovery complete');
        break;
      }

      this.trackCreated(newResources);
    }

    const finalCount = resources.size;

    this.logger.info(`\n--- Discovery Complete ---`);
    this.logger.info(`  Iterations:        ${iteration}`);
    this.logger.info(`  Initial resources: ${initialCount}`);
    this.logger.info(`  New resources:     ${totalNewResources}`);
    this.logger.info(`  Final count:       ${finalCount}`);
    this.logger.info(`  URLs attempted:    ${this.attemptedUrls.size}`);

    this.trackAction(`Discovered ${totalNewResources} new resources`);

    return {
      initialCount,
      finalCount,
      newResources: totalNewResources,
      iterations: iteration,
      urlsAttempted: this.attemptedUrls.size,
    };
  }

  /**
   * Extract all possible URLs from all resource types
   */
  extractAllUrls(resources, origin, detection) {
    const allUrls = new Set();

    // 1. JavaScript files
    const jsUrls = this.extractFromJS(resources, origin, detection);
    jsUrls.forEach(u => allUrls.add(u));

    // 2. CSS files - extract url() references
    const cssUrls = this.extractFromCSS(resources, origin);
    cssUrls.forEach(u => allUrls.add(u));

    // 3. HTML files - extract all resource references
    const htmlUrls = this.extractFromHTML(resources, origin);
    htmlUrls.forEach(u => allUrls.add(u));

    // 4. JSON files - could be manifests with resource lists
    const jsonUrls = this.extractFromJSON(resources, origin);
    jsonUrls.forEach(u => allUrls.add(u));

    this.logger.info(`Total discovered: ${allUrls.size} URLs`);
    return allUrls;
  }

  /**
   * Extract URLs from JavaScript files using detection-specific strategies
   */
  extractFromJS(resources, origin, detection) {
    const urls = new Set();

    for (const [url, data] of resources) {
      if (!url.endsWith('.js') && !data.contentType?.includes('javascript')) continue;

      try {
        const content = data.body.toString('utf-8');

        // Generic string extraction
        this.extractUrlStrings(content, origin).forEach(u => urls.add(u));

        // Framework-specific patterns
        if (detection?.bundler === 'webpack') {
          this.extractWebpackUrls(content, origin).forEach(u => urls.add(u));
        } else if (detection?.bundler === 'nextjs') {
          this.extractNextJsUrls(content, origin, detection.metadata).forEach(u => urls.add(u));
        }

      } catch (e) {
        // Skip binary/invalid
      }
    }

    this.logger.debug(`  JS extraction: ${urls.size} URLs`);
    return urls;
  }

  /**
   * Extract generic URL strings from content
   */
  extractUrlStrings(content, origin) {
    const urls = new Set();

    // Pattern 1: Quoted paths with extensions
    const pathPattern = /["'](\/?[a-zA-Z0-9_\-./]+\.(js|css|png|jpg|jpeg|gif|svg|woff2?|otf|ttf|wasm|json|webp|ico|mp3|mp4|webm))["']/gi;
    let match;
    while ((match = pathPattern.exec(content)) !== null) {
      const resolved = this.resolveUrl(match[1], origin + '/', origin);
      if (resolved) urls.add(resolved);
    }

    // Pattern 2: Absolute URLs
    const absPattern = /["'](https?:\/\/[^"'\s]+)["']/gi;
    while ((match = absPattern.exec(content)) !== null) {
      urls.add(match[1]);
    }

    // Pattern 3: Import/require paths
    const importPattern = /(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;
    while ((match = importPattern.exec(content)) !== null) {
      const resolved = this.resolveUrl(match[1], origin + '/', origin);
      if (resolved) urls.add(resolved);
    }

    return urls;
  }

  /**
   * Extract webpack-specific chunk URLs
   */
  extractWebpackUrls(content, origin) {
    const urls = new Set();

    // Chunk loading patterns
    const chunkPatterns = [
      /chunkId\s*[+:]\s*["']([^"']+)["']/g,
      /__webpack_require__\.e\s*\(\s*(\d+)\s*\)/g,
      /webpackChunk[a-zA-Z_]*\.push\s*\(\s*\[\s*\[([^\]]+)\]/g,
    ];

    for (const pattern of chunkPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        // Try common chunk URL formats
        const chunkId = match[1];
        const possibleUrls = [
          `${origin}/${chunkId}.js`,
          `${origin}/static/js/${chunkId}.js`,
          `${origin}/chunks/${chunkId}.js`,
          `${origin}/_next/static/chunks/${chunkId}.js`,
        ];
        possibleUrls.forEach(u => urls.add(u));
      }
    }

    return urls;
  }

  /**
   * Extract Next.js-specific URLs
   */
  extractNextJsUrls(content, origin, metadata) {
    const urls = new Set();
    const buildId = metadata?.buildId || '';

    // Build manifest patterns
    const manifestPattern = /_buildManifest\.js/g;
    if (manifestPattern.test(content)) {
      urls.add(`${origin}/_next/static/${buildId}/_buildManifest.js`);
      urls.add(`${origin}/_next/static/${buildId}/_ssgManifest.js`);
    }

    // Page chunk patterns
    const pagePattern = /pages\/([a-zA-Z0-9_\-/]+)/g;
    let match;
    while ((match = pagePattern.exec(content)) !== null) {
      const page = match[1];
      urls.add(`${origin}/_next/static/${buildId}/pages/${page}.js`);
      urls.add(`${origin}/_next/static/chunks/pages/${page}.js`);
    }

    return urls;
  }

  /**
   * Extract URLs from CSS files
   */
  extractFromCSS(resources, origin) {
    const urls = new Set();

    for (const [url, data] of resources) {
      if (!url.endsWith('.css') && !data.contentType?.includes('css')) continue;

      try {
        const content = data.body.toString('utf-8');

        // Pattern 1: url() references
        const urlMatches = content.matchAll(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi);
        for (const match of urlMatches) {
          const refUrl = match[1].trim();
          if (refUrl && !refUrl.startsWith('data:')) {
            const resolved = this.resolveUrl(refUrl, url, origin);
            if (resolved) urls.add(resolved);
          }
        }

        // Pattern 2: @import statements
        const importMatches = content.matchAll(/@import\s+["']([^"']+)["']/gi);
        for (const match of importMatches) {
          const resolved = this.resolveUrl(match[1], url, origin);
          if (resolved) urls.add(resolved);
        }

        // Pattern 3: src: url() in @font-face
        const fontMatches = content.matchAll(/src\s*:\s*url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi);
        for (const match of fontMatches) {
          const refUrl = match[1].trim();
          if (refUrl && !refUrl.startsWith('data:')) {
            const resolved = this.resolveUrl(refUrl, url, origin);
            if (resolved) urls.add(resolved);
          }
        }

      } catch (e) {
        // Skip binary/invalid
      }
    }

    this.logger.debug(`  CSS extraction: ${urls.size} URLs`);
    return urls;
  }

  /**
   * Extract URLs from HTML files
   */
  extractFromHTML(resources, origin) {
    const urls = new Set();

    for (const [url, data] of resources) {
      if (!url.endsWith('.html') && !url.endsWith('.htm') && !data.contentType?.includes('html')) continue;

      try {
        const content = data.body.toString('utf-8');

        // Pattern 1: src attributes
        const srcMatches = content.matchAll(/\ssrc\s*=\s*["']([^"']+)["']/gi);
        for (const match of srcMatches) {
          const resolved = this.resolveUrl(match[1], url, origin);
          if (resolved) urls.add(resolved);
        }

        // Pattern 2: href attributes
        const hrefMatches = content.matchAll(/\shref\s*=\s*["']([^"']+)["']/gi);
        for (const match of hrefMatches) {
          const refUrl = match[1];
          // Skip anchors and javascript:
          if (refUrl.startsWith('#') || refUrl.startsWith('javascript:') || refUrl.startsWith('mailto:')) continue;
          const resolved = this.resolveUrl(refUrl, url, origin);
          if (resolved) urls.add(resolved);
        }

        // Pattern 3: srcset attributes (responsive images)
        const srcsetMatches = content.matchAll(/\ssrcset\s*=\s*["']([^"']+)["']/gi);
        for (const match of srcsetMatches) {
          const entries = match[1].split(',');
          for (const entry of entries) {
            const srcUrl = entry.trim().split(/\s+/)[0];
            if (srcUrl) {
              const resolved = this.resolveUrl(srcUrl, url, origin);
              if (resolved) urls.add(resolved);
            }
          }
        }

        // Pattern 4: data-* attributes that look like URLs
        const dataMatches = content.matchAll(/\sdata-[a-z-]+\s*=\s*["']([^"']+\.[a-z]{2,5})["']/gi);
        for (const match of dataMatches) {
          const resolved = this.resolveUrl(match[1], url, origin);
          if (resolved) urls.add(resolved);
        }

        // Pattern 5: Inline script/style with URLs
        const inlineUrlMatches = content.matchAll(/["'](\/?[a-zA-Z0-9_\-./]+\.(js|css|png|jpg|svg|woff2?|otf|ttf|wasm|json))["']/gi);
        for (const match of inlineUrlMatches) {
          const resolved = this.resolveUrl(match[1], url, origin);
          if (resolved) urls.add(resolved);
        }

        // Pattern 6: Preload/prefetch links
        const preloadMatches = content.matchAll(/<link[^>]+rel\s*=\s*["'](?:preload|prefetch)["'][^>]+href\s*=\s*["']([^"']+)["']/gi);
        for (const match of preloadMatches) {
          const resolved = this.resolveUrl(match[1], url, origin);
          if (resolved) urls.add(resolved);
        }

      } catch (e) {
        // Skip binary/invalid
      }
    }

    this.logger.debug(`  HTML extraction: ${urls.size} URLs`);
    return urls;
  }

  /**
   * Extract URLs from JSON files (manifests, configs)
   */
  extractFromJSON(resources, origin) {
    const urls = new Set();

    for (const [url, data] of resources) {
      if (!url.endsWith('.json') && !data.contentType?.includes('json')) continue;

      try {
        const content = data.body.toString('utf-8');
        const json = JSON.parse(content);

        // Recursively extract strings that look like URLs
        this.extractUrlsFromObject(json, urls, origin);

      } catch (e) {
        // Skip invalid JSON
      }
    }

    this.logger.debug(`  JSON extraction: ${urls.size} URLs`);
    return urls;
  }

  /**
   * Recursively extract URL-like strings from a JSON object
   */
  extractUrlsFromObject(obj, urls, origin) {
    if (!obj) return;

    if (typeof obj === 'string') {
      // Check if it looks like a URL/path
      if (obj.match(/^https?:\/\//) || obj.match(/^\/[a-zA-Z0-9]/) || obj.match(/\.(js|css|png|jpg|svg|woff|otf|wasm|json)$/i)) {
        const resolved = this.resolveUrl(obj, origin + '/', origin);
        if (resolved) urls.add(resolved);
      }
      return;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.extractUrlsFromObject(item, urls, origin);
      }
      return;
    }

    if (typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        this.extractUrlsFromObject(obj[key], urls, origin);
      }
    }
  }

  /**
   * Resolve a URL relative to a base
   */
  resolveUrl(refUrl, baseUrl, origin) {
    if (!refUrl || typeof refUrl !== 'string') return null;

    // Skip data URLs and other non-http schemes
    if (refUrl.startsWith('data:') || refUrl.startsWith('blob:') || refUrl.startsWith('javascript:')) {
      return null;
    }

    try {
      // Already absolute
      if (refUrl.startsWith('http://') || refUrl.startsWith('https://')) {
        return refUrl;
      }

      // Protocol-relative
      if (refUrl.startsWith('//')) {
        return 'https:' + refUrl;
      }

      // Absolute path
      if (refUrl.startsWith('/')) {
        return origin + refUrl;
      }

      // Relative path - resolve against base
      const base = new URL(baseUrl, origin);
      const resolved = new URL(refUrl, base);
      return resolved.href;

    } catch (e) {
      return null;
    }
  }

  /**
   * Fetch all URLs using Node.js fetch (no CORS restrictions)
   * Adding successful ones to resources
   */
  async fetchAllUrls(urls, resources) {
    const toFetch = urls.filter(url => !this.attemptedUrls.has(url));

    if (toFetch.length === 0) return 0;

    this.logger.info(`Fetching ${toFetch.length} URLs in batches of ${this.config.batchSize}...`);

    let fetched = 0;
    let attempted = 0;

    for (let i = 0; i < toFetch.length; i += this.config.batchSize) {
      const batch = toFetch.slice(i, i + this.config.batchSize);

      const results = await Promise.all(batch.map(async (url) => {
        this.attemptedUrls.add(url);
        attempted++;

        try {
          // Use Node.js native fetch (no CORS restrictions)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

          const res = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
              'Accept': '*/*',
            },
          });

          clearTimeout(timeoutId);

          if (!res.ok) return null;

          const buffer = await res.arrayBuffer();
          const body = Buffer.from(buffer);

          if (body.length === 0) return null;

          return {
            url,
            contentType: res.headers.get('content-type') || '',
            body,
            size: body.length,
            source: 'discover',
          };
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

      // Progress logging every 200 URLs or at the end
      if (attempted % 200 === 0 || i + this.config.batchSize >= toFetch.length) {
        this.logger.progress(attempted, toFetch.length, `${fetched} found`);
      }
    }

    return fetched;
  }
}

export default DiscoverPhase;
