/**
 * URL Mapping Router
 * Creates routing logic for serving extracted content
 */

/**
 * MIME type mapping by file extension
 */
export const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
  '.map': 'application/json',

  // Images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',

  // Fonts
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',

  // Audio/Video
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',

  // Documents
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',

  // Text
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

/**
 * Get content type from file extension
 * @param {string} filename - File name or path
 * @returns {string} Content type
 */
export function getContentType(filename) {
  const ext = getExtension(filename);
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Get file extension (lowercase)
 * @param {string} filename - File name or path
 * @returns {string} Extension with dot (e.g., '.js')
 */
export function getExtension(filename) {
  const match = filename.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : '';
}

/**
 * Create a router lookup from URL map
 * @param {Object} urlMap - URL to local file mapping
 * @returns {Object} Router with lookup methods
 */
export function createRouter(urlMap) {
  // Build efficient lookup tables
  const exactLookup = new Map();      // Full URL with query
  const pathLookup = new Map();       // Path only (no query)
  const prefixLookup = new Map();     // Path prefixes for directory matching

  for (const [fullUrl, info] of Object.entries(urlMap)) {
    try {
      const urlObj = new URL(fullUrl);
      const pathWithQuery = urlObj.pathname + urlObj.search;
      const pathOnly = urlObj.pathname;

      // Store exact match (full path with query)
      if (!exactLookup.has(pathWithQuery)) {
        exactLookup.set(pathWithQuery, { ...info, originalUrl: fullUrl });
      }

      // Store path-only match
      if (!pathLookup.has(pathOnly)) {
        pathLookup.set(pathOnly, { ...info, originalUrl: fullUrl });
      }

      // Build prefix lookup for directory-style matching
      const pathParts = pathOnly.split('/').filter(Boolean);
      let prefix = '';
      for (const part of pathParts) {
        prefix += '/' + part;
        if (!prefixLookup.has(prefix)) {
          prefixLookup.set(prefix, []);
        }
        prefixLookup.get(prefix).push({ ...info, originalUrl: fullUrl });
      }
    } catch (e) {
      // Invalid URL, skip
      console.warn(`[Router] Invalid URL in map: ${fullUrl}`);
    }
  }

  return {
    /**
     * Look up a request path in the URL map
     * @param {string} requestPath - Request path (may include query string)
     * @returns {Object|null} Matched entry or null
     */
    lookup(requestPath) {
      // Try exact match first (with query string)
      if (exactLookup.has(requestPath)) {
        return exactLookup.get(requestPath);
      }

      // Try path without query string
      const pathOnly = requestPath.split('?')[0];
      if (pathLookup.has(pathOnly)) {
        return pathLookup.get(pathOnly);
      }

      return null;
    },

    /**
     * Find all matches for a path prefix
     * @param {string} prefix - Path prefix to match
     * @returns {Array} Array of matching entries
     */
    findByPrefix(prefix) {
      const normalized = prefix.replace(/\/$/, ''); // Remove trailing slash
      return prefixLookup.get(normalized) || [];
    },

    /**
     * Check if a path exists in the router
     * @param {string} requestPath - Request path
     * @returns {boolean} True if path exists
     */
    has(requestPath) {
      return this.lookup(requestPath) !== null;
    },

    /**
     * Get all registered paths
     * @returns {Array<string>} Array of paths
     */
    getPaths() {
      return Array.from(pathLookup.keys());
    },

    /**
     * Get router statistics
     * @returns {Object} Statistics
     */
    getStats() {
      return {
        exactMatches: exactLookup.size,
        pathMatches: pathLookup.size,
        prefixCount: prefixLookup.size,
        totalEntries: Object.keys(urlMap).length
      };
    }
  };
}

/**
 * Create Express-compatible router middleware
 * (For use when Express is available)
 * @param {Object} urlMap - URL to local file mapping
 * @param {Object} options - Router options
 * @returns {Function} Express middleware function
 */
export function createExpressRouter(urlMap, options = {}) {
  const router = createRouter(urlMap);
  const baseDir = options.baseDir || '.';

  return function routerMiddleware(req, res, next) {
    const match = router.lookup(req.url);

    if (match) {
      const localPath = `${baseDir}/${match.localFile}`;
      const contentType = match.contentType || getContentType(match.localFile);

      // Set headers
      res.set('Content-Type', contentType);
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', options.cacheControl || 'public, max-age=31536000');

      // Send file
      res.sendFile(localPath, { root: process.cwd() }, (err) => {
        if (err) {
          next(err);
        }
      });
    } else {
      next();
    }
  };
}

/**
 * Generate router code for inclusion in serve.js template
 * @returns {string} Router code as string
 */
export function generateRouterCode() {
  return `
// =============================================================================
// URL ROUTER
// =============================================================================

const MIME_TYPES = ${JSON.stringify(MIME_TYPES, null, 2)};

function getContentType(filename) {
  const match = filename.match(/\\.[^.]+$/);
  const ext = match ? match[0].toLowerCase() : '';
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function createRouter(urlMap) {
  const exactLookup = new Map();
  const pathLookup = new Map();

  for (const [fullUrl, info] of Object.entries(urlMap)) {
    try {
      const urlObj = new URL(fullUrl);
      const pathWithQuery = urlObj.pathname + urlObj.search;
      const pathOnly = urlObj.pathname;

      if (!exactLookup.has(pathWithQuery)) {
        exactLookup.set(pathWithQuery, { ...info, originalUrl: fullUrl });
      }

      if (!pathLookup.has(pathOnly)) {
        pathLookup.set(pathOnly, { ...info, originalUrl: fullUrl });
      }
    } catch (e) {
      // Invalid URL, skip
    }
  }

  return {
    lookup(requestPath) {
      if (exactLookup.has(requestPath)) {
        return exactLookup.get(requestPath);
      }

      const pathOnly = requestPath.split('?')[0];
      if (pathLookup.has(pathOnly)) {
        return pathLookup.get(pathOnly);
      }

      return null;
    },

    has(requestPath) {
      return this.lookup(requestPath) !== null;
    }
  };
}
`;
}

export default {
  MIME_TYPES,
  getContentType,
  getExtension,
  createRouter,
  createExpressRouter,
  generateRouterCode
};
