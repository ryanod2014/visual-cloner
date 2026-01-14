/**
 * URL Manipulation Utilities
 * Functions for resolving, normalizing, and classifying URLs
 */

/**
 * Resolve a relative URL against a base URL and origin
 * @param {string} ref - The reference URL (can be relative or absolute)
 * @param {string} base - The base URL to resolve against
 * @param {string} origin - The origin (protocol + host) for protocol-relative URLs
 * @returns {string|null} - The resolved absolute URL, or null if invalid
 */
export function resolveUrl(ref, base, origin) {
  // Handle null/undefined inputs
  if (!ref || typeof ref !== 'string') {
    return null;
  }

  // Trim whitespace
  ref = ref.trim();

  // Skip empty strings
  if (!ref) {
    return null;
  }

  // Skip non-resource URLs
  if (!isResourceUrl(ref)) {
    return null;
  }

  try {
    // Protocol-relative URLs (//example.com/path)
    if (ref.startsWith('//')) {
      const originUrl = new URL(origin || base);
      return `${originUrl.protocol}${ref}`;
    }

    // Absolute URLs - return as-is
    if (ref.startsWith('http://') || ref.startsWith('https://')) {
      return ref;
    }

    // Root-relative URLs (/path/to/resource)
    if (ref.startsWith('/')) {
      const originUrl = new URL(origin || base);
      return `${originUrl.origin}${ref}`;
    }

    // Relative URLs - resolve against base
    const baseUrl = new URL(base);
    return new URL(ref, baseUrl).href;
  } catch (error) {
    // Invalid URL
    return null;
  }
}

/**
 * Normalize a URL for comparison (removes trailing slashes, fragments, etc.)
 * @param {string} url - The URL to normalize
 * @returns {string|null} - The normalized URL, or null if invalid
 */
export function normalizeUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(url);

    // Remove fragment (hash)
    parsed.hash = '';

    // Sort query parameters for consistent comparison
    const params = new URLSearchParams(parsed.search);
    const sortedParams = new URLSearchParams([...params.entries()].sort());
    parsed.search = sortedParams.toString();

    // Get the normalized URL
    let normalized = parsed.href;

    // Remove trailing slash from pathname (except for root)
    if (parsed.pathname !== '/' && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch (error) {
    return null;
  }
}

/**
 * Determine the type of resource from its URL
 * @param {string} url - The URL to classify
 * @returns {'js'|'css'|'image'|'font'|'wasm'|'other'} - The resource type
 */
export function getUrlType(url) {
  if (!url || typeof url !== 'string') {
    return 'other';
  }

  // Extract pathname, handling both URLs and paths
  let pathname;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    pathname = url.toLowerCase();
  }

  // Remove query string and fragment for extension matching
  const pathWithoutQuery = pathname.split('?')[0].split('#')[0];

  // Get extension
  const lastDot = pathWithoutQuery.lastIndexOf('.');
  const ext = lastDot !== -1 ? pathWithoutQuery.slice(lastDot + 1) : '';

  // JavaScript files
  if (['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx'].includes(ext)) {
    return 'js';
  }

  // CSS files
  if (['css', 'scss', 'sass', 'less'].includes(ext)) {
    return 'css';
  }

  // Image files
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif', 'heic', 'heif', 'tiff', 'tif'].includes(ext)) {
    return 'image';
  }

  // Font files
  if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext)) {
    return 'font';
  }

  // WebAssembly files
  if (ext === 'wasm') {
    return 'wasm';
  }

  // Check URL patterns for common CDN/API paths
  if (pathname.includes('/api/') || pathname.includes('/graphql')) {
    return 'other';
  }

  // Default
  return 'other';
}

/**
 * Check if a URL is a fetchable resource (not a special protocol)
 * @param {string} url - The URL to check
 * @returns {boolean} - True if the URL is a fetchable resource
 */
export function isResourceUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const trimmed = url.trim().toLowerCase();

  // Non-fetchable URL schemes
  const nonResourceSchemes = [
    'data:',
    'blob:',
    'javascript:',
    'about:',
    'mailto:',
    'tel:',
    'file:',
    'chrome:',
    'chrome-extension:',
    'moz-extension:',
    'ms-browser-extension:',
    'vscode:',
  ];

  for (const scheme of nonResourceSchemes) {
    if (trimmed.startsWith(scheme)) {
      return false;
    }
  }

  return true;
}

/**
 * Extract the origin (protocol + host) from a URL
 * @param {string} url - The URL to extract origin from
 * @returns {string|null} - The origin, or null if invalid
 */
export function extractOrigin(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch (error) {
    return null;
  }
}

export default {
  resolveUrl,
  normalizeUrl,
  getUrlType,
  isResourceUrl,
  extractOrigin,
};
