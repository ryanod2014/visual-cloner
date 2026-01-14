/**
 * Fallback Chunk Discoverer
 *
 * Uses string extraction and limited brute force when no specific
 * bundler is detected. Tries numbered chunks 0-99 with early stopping.
 */

import { BaseDiscoverer } from './base.js';

export class FallbackDiscoverer extends BaseDiscoverer {
  bundler = 'unknown';

  /**
   * Override canDiscover to always match unknown bundlers
   */
  canDiscover(detection) {
    return detection.bundler === 'unknown' || !detection.bundler;
  }

  async discover(resources, origin, page) {
    const discovered = new Set();
    const jsContent = this.getJsContent(resources);

    // Strategy 1: Extract URL-like strings from JS
    const fromStrings = this.extractUrlStrings(jsContent, origin);
    fromStrings.forEach(url => discovered.add(url));

    // Strategy 2: Extract from HTML link/script tags
    const fromHtml = this.extractFromHtml(resources, origin);
    fromHtml.forEach(url => discovered.add(url));

    // Strategy 3: Try common chunk patterns based on existing resources
    const fromPatterns = this.deriveFromPatterns(resources, origin);
    fromPatterns.forEach(url => discovered.add(url));

    // Strategy 4: Limited brute force for numbered chunks
    const fromBruteForce = await this.bruteForceChunks(resources, origin, page);
    fromBruteForce.forEach(url => discovered.add(url));

    // Strategy 5: Extract dynamic import paths
    const fromDynamicImports = this.extractDynamicImports(jsContent, origin);
    fromDynamicImports.forEach(url => discovered.add(url));

    return this.filterChunkUrls(discovered, origin);
  }

  /**
   * Extract URL-like strings from JS content
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  extractUrlStrings(content, origin) {
    const urls = new Set();

    // Pattern: String literals that look like JS/CSS paths
    const stringPatterns = [
      // Absolute paths starting with /
      /"(\/[a-zA-Z0-9_\-./]+\.(?:js|css|mjs))"/g,
      /'(\/[a-zA-Z0-9_\-./]+\.(?:js|css|mjs))'/g,
      /`(\/[a-zA-Z0-9_\-./]+\.(?:js|css|mjs))`/g,

      // Relative paths with common prefixes
      /"((?:\.\/|\.\.\/)?(?:assets|static|js|css|chunks|build|dist)\/[^"]+\.(?:js|css|mjs))"/g,
      /'((?:\.\/|\.\.\/)?(?:assets|static|js|css|chunks|build|dist)\/[^']+\.(?:js|css|mjs))'/g,

      // Hashed filenames
      /"([a-zA-Z0-9_-]+\.[a-f0-9]{6,}\.(?:js|css))"/g,
      /'([a-zA-Z0-9_-]+\.[a-f0-9]{6,}\.(?:js|css))'/g,

      // Chunk patterns
      /"(chunk[s]?[.\-/][^"]+\.js)"/gi,
      /"(vendor[s]?[.\-/][^"]+\.js)"/gi,
      /"(common[s]?[.\-/][^"]+\.js)"/gi
    ];

    for (const pattern of stringPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const path = match[1];

        // Skip obvious non-file patterns
        if (this.isLikelyNotFile(path)) continue;

        const url = this.resolveUrl(path, origin);
        if (url) urls.add(url);
      }
    }

    return urls;
  }

  /**
   * Check if path is likely not a file
   * @param {string} path - Path to check
   * @returns {boolean}
   */
  isLikelyNotFile(path) {
    const skipPatterns = [
      /^https?:\/\//, // Full URLs handled separately
      /\$\{/, // Template literals
      /\{\{/, // Mustache templates
      /<%/, // ERB templates
      /node_modules/,
      /\.map$/,
      /\.d\.ts$/,
      /localhost/,
      /127\.0\.0\.1/,
      /example\.com/,
      /test\./,
      /spec\./
    ];

    return skipPatterns.some(p => p.test(path));
  }

  /**
   * Extract URLs from HTML resources
   * @param {Map} resources - Resources map
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  extractFromHtml(resources, origin) {
    const urls = new Set();

    for (const [url, data] of resources) {
      const content = data.content || '';

      // Skip non-HTML
      if (!content.includes('<html') && !content.includes('<!DOCTYPE')) continue;

      // Script src attributes
      const scriptPattern = /<script[^>]+src=["']([^"']+)["']/gi;
      let match;

      while ((match = scriptPattern.exec(content)) !== null) {
        const resolved = this.resolveUrl(match[1], origin);
        if (resolved) urls.add(resolved);
      }

      // Link href attributes for CSS
      const linkPattern = /<link[^>]+href=["']([^"']+\.css[^"']*)["']/gi;
      while ((match = linkPattern.exec(content)) !== null) {
        const resolved = this.resolveUrl(match[1], origin);
        if (resolved) urls.add(resolved);
      }

      // Module preload
      const preloadPattern = /<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["']/gi;
      while ((match = preloadPattern.exec(content)) !== null) {
        const resolved = this.resolveUrl(match[1], origin);
        if (resolved) urls.add(resolved);
      }
    }

    return urls;
  }

  /**
   * Derive chunk URLs from patterns in existing resources
   * @param {Map} resources - Resources map
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  deriveFromPatterns(resources, origin) {
    const urls = new Set();
    const patterns = [];

    // Extract patterns from existing chunk-like resources
    for (const url of resources.keys()) {
      try {
        const parsed = new URL(url);
        const pathname = parsed.pathname;

        // Pattern: /path/chunkName.hash.js
        const hashMatch = pathname.match(/^(.*?)([a-zA-Z0-9_-]+)\.([a-f0-9]{6,20})\.(js|css)$/);
        if (hashMatch) {
          patterns.push({
            prefix: hashMatch[1],
            hash: hashMatch[3],
            ext: hashMatch[4]
          });
        }

        // Pattern: /path/number.hash.js
        const numberedMatch = pathname.match(/^(.*?)(\d+)\.([a-f0-9]{6,20})\.(js|css)$/);
        if (numberedMatch) {
          patterns.push({
            prefix: numberedMatch[1],
            number: parseInt(numberedMatch[2]),
            hash: numberedMatch[3],
            ext: numberedMatch[4],
            isNumbered: true
          });
        }
      } catch {
        continue;
      }
    }

    // Generate candidate URLs from patterns
    for (const pattern of patterns) {
      if (pattern.isNumbered) {
        // Try nearby numbers
        for (let i = 0; i <= Math.min(pattern.number + 10, 30); i++) {
          const path = `${pattern.prefix}${i}.${pattern.hash}.${pattern.ext}`;
          const url = this.resolveUrl(path, origin);
          if (url) urls.add(url);
        }
      }
    }

    return urls;
  }

  /**
   * Limited brute force for numbered chunks
   * @param {Map} resources - Resources map
   * @param {string} origin - Origin URL
   * @param {Object} page - Playwright page
   * @returns {Promise<Set<string>>}
   */
  async bruteForceChunks(resources, origin, page) {
    const urls = new Set();

    // Find a pattern to base brute force on
    const template = this.findChunkTemplate(resources);
    if (!template) return urls;

    // Try chunks 0-99 with early stopping
    const BATCH_SIZE = 10;
    const MAX_CHUNK = 99;
    const MIN_HIT_RATE = 0.05; // 5%

    let totalTried = 0;
    let totalHits = 0;
    let consecutiveMisses = 0;
    const MAX_CONSECUTIVE_MISSES = 20;

    for (let start = 0; start <= MAX_CHUNK; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE, MAX_CHUNK + 1);
      const candidates = [];

      for (let i = start; i < end; i++) {
        const url = this.applyTemplate(template, i);
        if (url && !resources.has(url)) {
          candidates.push(url);
        }
      }

      if (candidates.length === 0) continue;

      // Batch fetch
      const valid = await this.batchFetch(candidates, page, 5);

      totalTried += candidates.length;
      totalHits += valid.size;

      if (valid.size > 0) {
        consecutiveMisses = 0;
        valid.forEach(url => urls.add(url));
      } else {
        consecutiveMisses += candidates.length;
      }

      // Check stopping conditions
      if (consecutiveMisses >= MAX_CONSECUTIVE_MISSES) {
        break;
      }

      if (totalTried >= 30 && (totalHits / totalTried) < MIN_HIT_RATE) {
        break;
      }
    }

    return urls;
  }

  /**
   * Find a chunk template from existing resources
   * @param {Map} resources - Resources map
   * @returns {Object|null}
   */
  findChunkTemplate(resources) {
    for (const url of resources.keys()) {
      try {
        const parsed = new URL(url);
        const pathname = parsed.pathname;

        // Match numbered chunk pattern
        const match = pathname.match(/^(.*?)(\d+)(\.?[a-f0-9]*)\.(js|css)$/);
        if (match) {
          return {
            origin: parsed.origin,
            prefix: match[1],
            hashPart: match[3],
            ext: match[4]
          };
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Apply template to generate chunk URL
   * @param {Object} template - Chunk template
   * @param {number} number - Chunk number
   * @returns {string|null}
   */
  applyTemplate(template, number) {
    try {
      return `${template.origin}${template.prefix}${number}${template.hashPart}.${template.ext}`;
    } catch {
      return null;
    }
  }

  /**
   * Extract dynamic import paths
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  extractDynamicImports(content, origin) {
    const urls = new Set();

    // Pattern: import("./path")
    const importPatterns = [
      /import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
      /require\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
      /require\.ensure\s*\([^)]*["'`]([^"'`]+)["'`]/g
    ];

    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];

        // Skip non-file imports
        if (!importPath.includes('/') && !importPath.includes('.')) continue;
        if (importPath.startsWith('@')) continue; // npm packages

        // Try to resolve
        const candidates = [
          importPath,
          `${importPath}.js`,
          `${importPath}/index.js`
        ];

        for (const candidate of candidates) {
          const url = this.resolveUrl(candidate, origin);
          if (url) urls.add(url);
        }
      }
    }

    return urls;
  }

  /**
   * Override chunk-like URL check for fallback (more permissive)
   * @param {string} pathname - URL pathname
   * @returns {boolean}
   */
  isChunkLikeUrl(pathname) {
    // More permissive patterns for fallback
    const patterns = [
      /\.js$/,
      /\.mjs$/,
      /\.css$/
    ];

    return patterns.some(p => p.test(pathname));
  }
}
