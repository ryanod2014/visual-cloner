/**
 * Content Hashing Utilities
 * Functions for generating hashes of content for deduplication and caching
 */

import { createHash } from 'crypto';

/**
 * Generate a SHA256 hash of content
 * @param {Buffer|string} content - The content to hash
 * @returns {string} - The full SHA256 hash as a hex string
 */
export function hashContent(content) {
  // Handle null/undefined
  if (content === null || content === undefined) {
    // Return hash of empty string for consistency
    return createHash('sha256').update('').digest('hex');
  }

  // Convert string to Buffer if needed
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content));

  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Generate a short hash (first 8 characters) of content
 * Useful for filenames and quick comparisons
 * @param {Buffer|string} content - The content to hash
 * @returns {string} - The first 8 characters of the SHA256 hash
 */
export function shortHash(content) {
  return hashContent(content).slice(0, 8);
}

/**
 * Generate a hash of multiple content pieces combined
 * Useful for creating composite keys
 * @param {...(Buffer|string)} contents - The content pieces to hash together
 * @returns {string} - The combined SHA256 hash
 */
export function hashMultiple(...contents) {
  const hash = createHash('sha256');

  for (const content of contents) {
    if (content !== null && content !== undefined) {
      const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content));
      hash.update(buffer);
      // Add separator between contents to prevent collisions
      hash.update('\x00');
    }
  }

  return hash.digest('hex');
}

/**
 * Create a content-addressable filename
 * @param {Buffer|string} content - The content to hash
 * @param {string} [extension=''] - Optional file extension (including dot)
 * @returns {string} - Filename in format: <short-hash><extension>
 */
export function contentFilename(content, extension = '') {
  const hash = shortHash(content);
  return `${hash}${extension}`;
}

/**
 * Check if two content pieces are identical by comparing hashes
 * @param {Buffer|string} content1 - First content
 * @param {Buffer|string} content2 - Second content
 * @returns {boolean} - True if contents are identical
 */
export function contentEquals(content1, content2) {
  return hashContent(content1) === hashContent(content2);
}

/**
 * Generate a hash suitable for use as a cache key
 * Combines URL and optional version/params
 * @param {string} url - The URL
 * @param {Object} [options={}] - Additional options to include in key
 * @returns {string} - Cache key hash
 */
export function cacheKey(url, options = {}) {
  const parts = [url];

  // Add sorted options to ensure consistent keys
  if (options && typeof options === 'object') {
    const sortedKeys = Object.keys(options).sort();
    for (const key of sortedKeys) {
      parts.push(`${key}=${options[key]}`);
    }
  }

  return hashContent(parts.join('|'));
}

export default {
  hashContent,
  shortHash,
  hashMultiple,
  contentFilename,
  contentEquals,
  cacheKey,
};
