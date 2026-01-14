/**
 * Playwright Response Capture (FALLBACK method)
 *
 * Uses Playwright's built-in response event listener to capture resources.
 * This is simpler but less reliable than CDP Fetch domain.
 * Use as fallback when CDP capture fails or is not available.
 *
 * Key implementation details:
 * - Uses page.on('response', ...) to listen for responses
 * - response.body() to get content
 * - Handles binary content as Buffer
 * - Graceful error handling - logs but doesn't crash
 */

/**
 * @typedef {Object} CapturedResource
 * @property {string} url - Resource URL
 * @property {Buffer} body - Resource body as Buffer
 * @property {string} contentType - Content-Type header
 * @property {number} size - Size in bytes
 * @property {number} status - HTTP status code
 * @property {string} [error] - Error message if capture failed
 */

const MAX_BODY_SIZE = 50 * 1024 * 1024; // 50MB limit

export class PlaywrightCapture {
  /**
   * @param {import('playwright').Page} page - Playwright page instance
   */
  constructor(page) {
    this.page = page;
    /** @type {Map<string, CapturedResource>} */
    this.resources = new Map();
    this.responseHandler = null;
    this.isCapturing = false;
  }

  /**
   * Start capturing network responses via Playwright response event
   */
  async start() {
    if (this.isCapturing) {
      return;
    }

    // Create the response handler
    this.responseHandler = async (response) => {
      await this._handleResponse(response);
    };

    // Register the event listener
    this.page.on('response', this.responseHandler);
    this.isCapturing = true;
  }

  /**
   * Handle a response event
   * @param {import('playwright').Response} response - Playwright response object
   * @private
   */
  async _handleResponse(response) {
    const url = response.url();

    try {
      // Skip data URLs and blob URLs
      if (url.startsWith('data:') || url.startsWith('blob:')) {
        return;
      }

      // Skip if we already have this resource
      if (this.resources.has(url)) {
        return;
      }

      const status = response.status();
      const contentType = response.headers()['content-type'] || '';

      // Skip failed requests (4xx/5xx) but record them
      if (status >= 400) {
        this.resources.set(url, {
          url,
          body: null,
          contentType,
          size: 0,
          status,
          error: `HTTP ${status}`
        });
        return;
      }

      // Skip redirects - they don't have bodies
      if (status >= 300 && status < 400) {
        return;
      }

      // Try to get the response body
      let body = null;
      let size = 0;

      try {
        // response.body() returns a Buffer
        body = await response.body();
        size = body.length;

        // Skip if body exceeds maximum size
        if (size > MAX_BODY_SIZE) {
          this.resources.set(url, {
            url,
            body: null,
            contentType,
            size,
            status,
            error: `Body exceeds ${MAX_BODY_SIZE} bytes limit`
          });
          return;
        }
      } catch (bodyError) {
        // Body may not be available for various reasons:
        // - Response was consumed elsewhere
        // - Streaming response
        // - Network error
        const errorMessage = bodyError.message || 'Failed to get body';

        this.resources.set(url, {
          url,
          body: null,
          contentType,
          size: 0,
          status,
          error: errorMessage
        });
        return;
      }

      // Store successful capture
      this.resources.set(url, {
        url,
        body,
        contentType,
        size,
        status
      });

    } catch (error) {
      // Log but don't crash on errors
      // Silently record the failure
      if (!this.resources.has(url)) {
        this.resources.set(url, {
          url,
          body: null,
          contentType: '',
          size: 0,
          status: 0,
          error: error.message || 'Unknown error'
        });
      }
    }
  }

  /**
   * Stop capturing and return collected resources
   * @returns {Promise<Map<string, CapturedResource>>} - Map of URL to captured resource
   */
  async stop() {
    if (!this.isCapturing) {
      return this.resources;
    }

    this._cleanup();
    return this.resources;
  }

  /**
   * Clean up event listener
   * @private
   */
  _cleanup() {
    this.isCapturing = false;

    // Remove event listener
    if (this.responseHandler) {
      this.page.off('response', this.responseHandler);
      this.responseHandler = null;
    }
  }

  /**
   * Get statistics about captured resources
   * @returns {Object} - Capture statistics
   */
  getStats() {
    let totalSize = 0;
    let successCount = 0;
    let errorCount = 0;
    const byContentType = {};

    for (const resource of this.resources.values()) {
      totalSize += resource.size || 0;

      if (resource.error) {
        errorCount++;
      } else {
        successCount++;
      }

      // Group by content type
      const type = this._normalizeContentType(resource.contentType);
      byContentType[type] = (byContentType[type] || 0) + 1;
    }

    return {
      totalResources: this.resources.size,
      successCount,
      errorCount,
      totalSize,
      byContentType
    };
  }

  /**
   * Normalize content type for grouping
   * @param {string} contentType - Raw content type
   * @returns {string} - Normalized type
   * @private
   */
  _normalizeContentType(contentType) {
    if (!contentType) return 'unknown';

    const type = contentType.split(';')[0].trim().toLowerCase();

    if (type.includes('javascript')) return 'javascript';
    if (type.includes('css')) return 'css';
    if (type.includes('html')) return 'html';
    if (type.includes('json')) return 'json';
    if (type.includes('image')) return 'image';
    if (type.includes('font') || type.includes('woff') || type.includes('ttf')) return 'font';
    if (type.includes('wasm')) return 'wasm';

    return type || 'unknown';
  }
}
