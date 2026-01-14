/**
 * Webpack Chunk Discoverer
 *
 * Parses webpack manifest to find chunk URLs.
 * Looks for __webpack_require__.u function and chunk mappings.
 */

import { BaseDiscoverer } from './base.js';

export class WebpackDiscoverer extends BaseDiscoverer {
  bundler = 'webpack';

  async discover(resources, origin, page) {
    const discovered = new Set();
    const jsContent = this.getJsContent(resources);

    // Strategy 1: Parse __webpack_require__.u function
    const fromChunkLoader = this.parseChunkLoaderFunction(jsContent, origin);
    fromChunkLoader.forEach(url => discovered.add(url));

    // Strategy 2: Parse chunk ID to hash mappings
    const fromMappings = this.parseChunkMappings(jsContent, origin);
    fromMappings.forEach(url => discovered.add(url));

    // Strategy 3: Find __webpack_require__.e calls for chunk IDs
    const fromRequireCalls = this.parseRequireCalls(jsContent, origin);
    fromRequireCalls.forEach(url => discovered.add(url));

    // Strategy 4: Parse jsonp chunk loading
    const fromJsonp = this.parseJsonpChunks(jsContent, origin);
    fromJsonp.forEach(url => discovered.add(url));

    // Strategy 5: Look for explicit chunk URL arrays
    const fromArrays = this.parseChunkArrays(jsContent, origin);
    fromArrays.forEach(url => discovered.add(url));

    return this.filterChunkUrls(discovered, origin);
  }

  /**
   * Parse __webpack_require__.u function for chunk URL template
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseChunkLoaderFunction(content, origin) {
    const urls = new Set();

    // Pattern: __webpack_require__.u = function(chunkId) { return "..." + {0:"hash1",1:"hash2"}[chunkId] + ".js" }
    const uFunctionPattern = /__webpack_require__\.u\s*=\s*function\s*\([^)]*\)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;

    let match;
    while ((match = uFunctionPattern.exec(content)) !== null) {
      const funcBody = match[1];

      // Extract the chunk mapping object
      const mappingPattern = /\{([0-9]+\s*:\s*"[^"]+"\s*,?\s*)+\}/g;
      let mappingMatch;

      while ((mappingMatch = mappingPattern.exec(funcBody)) !== null) {
        const mappings = this.parseChunkMappingObject(mappingMatch[0]);

        // Extract the URL template parts
        const templateParts = this.extractUrlTemplate(funcBody);

        for (const [chunkId, hash] of Object.entries(mappings)) {
          const url = this.buildChunkUrl(templateParts, chunkId, hash, origin);
          if (url) urls.add(url);
        }
      }
    }

    return urls;
  }

  /**
   * Parse chunk mapping objects like {0:"abc123",1:"def456"}
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseChunkMappings(content, origin) {
    const urls = new Set();

    // Look for chunk hash mappings
    // Pattern: {0:"hash",1:"hash",...} or {"chunkName":"hash",...}
    const mappingPatterns = [
      // Numeric chunk IDs
      /\{(?:\s*\d+\s*:\s*"[a-f0-9]+"\s*,?\s*)+\}/gi,
      // String chunk names
      /\{(?:\s*"[^"]+"\s*:\s*"[a-f0-9]+"\s*,?\s*)+\}/gi
    ];

    for (const pattern of mappingPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const mappings = this.parseChunkMappingObject(match[0]);

        // Try to find associated path prefix
        const pathPrefix = this.findPathPrefix(content, match.index);

        for (const [id, hash] of Object.entries(mappings)) {
          // Common webpack chunk URL patterns
          const chunkPatterns = [
            `${pathPrefix}${id}.${hash}.js`,
            `${pathPrefix}${hash}.js`,
            `${pathPrefix}chunk-${id}.${hash}.js`,
            `${pathPrefix}${id}-${hash}.js`
          ];

          for (const chunkPath of chunkPatterns) {
            const url = this.resolveUrl(chunkPath, origin);
            if (url) urls.add(url);
          }
        }
      }
    }

    return urls;
  }

  /**
   * Parse __webpack_require__.e calls to find chunk IDs
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseRequireCalls(content, origin) {
    const urls = new Set();
    const chunkIds = new Set();

    // Pattern: __webpack_require__.e(chunkId) or .e(123) or .e("chunkName")
    const requirePatterns = [
      /__webpack_require__\.e\s*\(\s*(\d+)\s*\)/g,
      /__webpack_require__\.e\s*\(\s*"([^"]+)"\s*\)/g,
      /\.e\s*\(\s*(\d+)\s*\)/g
    ];

    for (const pattern of requirePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        chunkIds.add(match[1]);
      }
    }

    // Try to build URLs for discovered chunk IDs
    const pathPrefix = this.findMainPathPrefix(content);

    for (const chunkId of chunkIds) {
      // Try common patterns
      const patterns = [
        `${pathPrefix}${chunkId}.js`,
        `${pathPrefix}chunk-${chunkId}.js`,
        `${pathPrefix}${chunkId}.chunk.js`
      ];

      for (const path of patterns) {
        const url = this.resolveUrl(path, origin);
        if (url) urls.add(url);
      }
    }

    return urls;
  }

  /**
   * Parse webpackJsonp or similar chunk loading mechanisms
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseJsonpChunks(content, origin) {
    const urls = new Set();

    // Pattern: webpackJsonp or push([[chunkId], {...}])
    const jsonpPattern = /(?:webpackJsonp|self\["webpackChunk[^"]*"\])\s*\.push\s*\(\s*\[\s*\[([^\]]+)\]/g;

    let match;
    while ((match = jsonpPattern.exec(content)) !== null) {
      const chunkList = match[1];
      const ids = chunkList.split(',').map(s => s.trim().replace(/["']/g, ''));

      const pathPrefix = this.findMainPathPrefix(content);

      for (const id of ids) {
        if (id) {
          const url = this.resolveUrl(`${pathPrefix}${id}.js`, origin);
          if (url) urls.add(url);
        }
      }
    }

    return urls;
  }

  /**
   * Parse explicit chunk URL arrays
   * @param {string} content - JS content
   * @param {string} origin - Origin URL
   * @returns {Set<string>}
   */
  parseChunkArrays(content, origin) {
    const urls = new Set();

    // Pattern: ["path/chunk1.js","path/chunk2.js"]
    const arrayPattern = /\[\s*(?:"[^"]*\.(?:js|css)"(?:\s*,\s*)?)+\]/g;

    let match;
    while ((match = arrayPattern.exec(content)) !== null) {
      const stringPattern = /"([^"]+\.(?:js|css))"/g;
      let stringMatch;

      while ((stringMatch = stringPattern.exec(match[0])) !== null) {
        const url = this.resolveUrl(stringMatch[1], origin);
        if (url) urls.add(url);
      }
    }

    return urls;
  }

  /**
   * Parse a chunk mapping object string into key-value pairs
   * @param {string} objStr - Object string like {0:"hash",1:"hash"}
   * @returns {Object}
   */
  parseChunkMappingObject(objStr) {
    const mappings = {};

    // Parse numeric keys: 0:"hash"
    const numericPattern = /(\d+)\s*:\s*"([^"]+)"/g;
    let match;

    while ((match = numericPattern.exec(objStr)) !== null) {
      mappings[match[1]] = match[2];
    }

    // Parse string keys: "name":"hash"
    const stringPattern = /"([^"]+)"\s*:\s*"([^"]+)"/g;
    while ((match = stringPattern.exec(objStr)) !== null) {
      mappings[match[1]] = match[2];
    }

    return mappings;
  }

  /**
   * Extract URL template parts from chunk loader function
   * @param {string} funcBody - Function body
   * @returns {Object} Template parts
   */
  extractUrlTemplate(funcBody) {
    const parts = {
      prefix: '',
      suffix: '.js'
    };

    // Look for string concatenation pattern
    // return "static/js/" + ... + ".chunk.js"
    const returnPattern = /return\s*"([^"]*)"[^"]*"([^"]*)"/;
    const match = returnPattern.exec(funcBody);

    if (match) {
      parts.prefix = match[1];
      parts.suffix = match[2];
    }

    return parts;
  }

  /**
   * Build chunk URL from template parts
   * @param {Object} template - Template parts
   * @param {string} chunkId - Chunk ID
   * @param {string} hash - Chunk hash
   * @param {string} origin - Origin URL
   * @returns {string|null}
   */
  buildChunkUrl(template, chunkId, hash, origin) {
    const path = `${template.prefix}${chunkId}.${hash}${template.suffix}`;
    return this.resolveUrl(path, origin);
  }

  /**
   * Find path prefix near a chunk mapping in content
   * @param {string} content - JS content
   * @param {number} position - Position of mapping in content
   * @returns {string}
   */
  findPathPrefix(content, position) {
    // Look for path strings before the mapping
    const searchStart = Math.max(0, position - 500);
    const searchContent = content.substring(searchStart, position);

    // Common path patterns
    const pathPatterns = [
      /"(static\/(?:js|chunks)\/[^"]*?)"/,
      /"(_next\/static\/chunks\/[^"]*?)"/,
      /"(dist\/[^"]*?)"/,
      /"(assets\/[^"]*?)"/,
      /"(js\/[^"]*?)"/
    ];

    for (const pattern of pathPatterns) {
      const match = pattern.exec(searchContent);
      if (match) {
        return match[1];
      }
    }

    return 'static/js/';
  }

  /**
   * Find main path prefix used in the bundle
   * @param {string} content - JS content
   * @returns {string}
   */
  findMainPathPrefix(content) {
    // Look for publicPath or similar configuration
    const publicPathPattern = /__webpack_require__\.p\s*=\s*"([^"]*)"/;
    const match = publicPathPattern.exec(content);

    if (match) {
      return match[1];
    }

    // Try to find common patterns
    const pathPatterns = [
      /["'](\/static\/js\/)/,
      /["'](\/static\/chunks\/)/,
      /["'](\/assets\/)/,
      /["'](\/dist\/)/,
      /["'](\/js\/)/
    ];

    for (const pattern of pathPatterns) {
      const match = pattern.exec(content);
      if (match) {
        return match[1];
      }
    }

    return '/static/js/';
  }
}
