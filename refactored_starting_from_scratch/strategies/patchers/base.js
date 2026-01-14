/**
 * Base Patcher Class
 *
 * Abstract base class for all resource patchers.
 * Patchers modify JavaScript content to bypass various checks.
 */

export class BasePatcher {
  name = 'base';

  /**
   * Determine if this patcher should be applied to the resource
   * @param {string} url - Resource URL
   * @param {string} content - Resource content
   * @param {string} contentType - MIME type of the resource
   * @returns {boolean} - True if this patcher should process the resource
   */
  shouldPatch(url, content, contentType) {
    return false;
  }

  /**
   * Apply patches to the content
   * @param {string} content - Original content
   * @param {string} url - Resource URL (for context)
   * @returns {{ content: string, patches: Array<{ pattern: string, replacement: string, count: number }> }}
   */
  patch(content, url) {
    return { content, patches: [] };
  }

  /**
   * Check if content is JavaScript
   * @param {string} contentType - MIME type
   * @returns {boolean}
   */
  isJavaScript(contentType) {
    if (!contentType) return false;
    const jsTypes = [
      'application/javascript',
      'application/x-javascript',
      'text/javascript',
      'application/ecmascript',
      'text/ecmascript'
    ];
    return jsTypes.some(type => contentType.toLowerCase().includes(type));
  }

  /**
   * Helper to count and replace patterns
   * @param {string} content - Content to patch
   * @param {RegExp} pattern - Pattern to find
   * @param {string|Function} replacement - Replacement string or function
   * @param {string} description - Human-readable description of the patch
   * @returns {{ content: string, patch: { pattern: string, replacement: string, count: number } | null }}
   */
  replacePattern(content, pattern, replacement, description) {
    let count = 0;
    const patched = content.replace(pattern, (...args) => {
      count++;
      if (typeof replacement === 'function') {
        return replacement(...args);
      }
      return replacement;
    });

    if (count > 0) {
      return {
        content: patched,
        patch: {
          pattern: description,
          replacement: typeof replacement === 'string' ? replacement : '[function]',
          count
        }
      };
    }

    return { content, patch: null };
  }
}
