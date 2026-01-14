/**
 * CDP Fetch Domain Capture (PRIMARY method)
 *
 * Uses Chrome DevTools Protocol Fetch domain to intercept network responses.
 * This is more reliable than the Network domain for capturing response bodies.
 *
 * Key implementation details:
 * - Uses Fetch domain (NOT Network domain) for better reliability
 * - Always wraps operations in try-catch
 * - MUST call Fetch.continueRequest or the page will hang
 * - Handles base64 encoded bodies for binary content
 * - Handles 10MB cache eviction errors with graceful fallback
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

export class CDPCapture {
  /**
   * @param {import('playwright').Page} page - Playwright page instance
   */
  constructor(page) {
    this.page = page;
    /** @type {Map<string, CapturedResource>} */
    this.resources = new Map();
    this.client = null;
    this.isCapturing = false;
    this.requestHandler = null;
  }

  /**
   * Start capturing network responses via CDP Fetch domain
   */
  async start() {
    if (this.isCapturing) {
      return;
    }

    try {
      // Create CDP session from Playwright page
      this.client = await this.page.context().newCDPSession(this.page);

      // Enable Fetch domain with pattern matching all URLs at Response stage
      await this.client.send('Fetch.enable', {
        patterns: [
          { urlPattern: '*', requestStage: 'Response' }
        ]
      });

      // Create the request paused handler
      this.requestHandler = async (params) => {
        await this._handleRequestPaused(params);
      };

      // Listen for Fetch.requestPaused events
      this.client.on('Fetch.requestPaused', this.requestHandler);

      this.isCapturing = true;
    } catch (error) {
      // Clean up on error
      await this._cleanup();
      throw new Error(`CDPCapture: Failed to start: ${error.message}`);
    }
  }

  /**
   * Handle paused request - extract body and continue
   * @param {Object} params - CDP Fetch.requestPaused event params
   * @private
   */
  async _handleRequestPaused(params) {
    const { requestId, request, responseStatusCode, responseHeaders } = params;
    const url = request.url;

    try {
      // Skip data URLs and blob URLs
      if (url.startsWith('data:') || url.startsWith('blob:')) {
        await this._continueRequest(requestId);
        return;
      }

      // Get content type from response headers
      const contentType = this._getContentType(responseHeaders);

      // Try to get response body
      let body = null;
      let size = 0;

      try {
        const bodyResult = await this.client.send('Fetch.getResponseBody', { requestId });

        if (bodyResult && bodyResult.body) {
          // Handle base64 encoded bodies (binary content)
          if (bodyResult.base64Encoded) {
            body = Buffer.from(bodyResult.body, 'base64');
          } else {
            body = Buffer.from(bodyResult.body, 'utf-8');
          }
          size = body.length;

          // Skip if body exceeds maximum size
          if (size > MAX_BODY_SIZE) {
            body = null;
            this.resources.set(url, {
              url,
              body: null,
              contentType,
              size,
              status: responseStatusCode || 200,
              error: `Body exceeds ${MAX_BODY_SIZE} bytes limit`
            });
          }
        }
      } catch (bodyError) {
        // Handle common errors:
        // - "No resource with given identifier found" - resource was evicted from cache
        // - "Request body is not available" - streaming response
        // - Network errors
        const errorMessage = bodyError.message || 'Unknown error';

        // Still record the resource even if we couldn't get the body
        if (!this.resources.has(url)) {
          this.resources.set(url, {
            url,
            body: null,
            contentType,
            size: 0,
            status: responseStatusCode || 0,
            error: errorMessage
          });
        }
      }

      // Store successful capture
      if (body !== null && !this.resources.has(url)) {
        this.resources.set(url, {
          url,
          body,
          contentType,
          size,
          status: responseStatusCode || 200
        });
      }

    } catch (error) {
      // Log but don't crash on errors
      // Error handling is best-effort
    } finally {
      // CRITICAL: Always continue the request or the page will hang
      await this._continueRequest(requestId);
    }
  }

  /**
   * Continue a paused request - MUST be called to prevent page hang
   * @param {string} requestId - Request ID from Fetch.requestPaused
   * @private
   */
  async _continueRequest(requestId) {
    try {
      await this.client.send('Fetch.continueRequest', { requestId });
    } catch (error) {
      // Request may have already been handled or cancelled
      // This is expected in some cases, so we silently continue
    }
  }

  /**
   * Extract Content-Type from response headers
   * @param {Array<{name: string, value: string}>} headers - Response headers
   * @returns {string} - Content type or empty string
   * @private
   */
  _getContentType(headers) {
    if (!headers || !Array.isArray(headers)) {
      return '';
    }

    const contentTypeHeader = headers.find(
      h => h.name.toLowerCase() === 'content-type'
    );

    return contentTypeHeader ? contentTypeHeader.value : '';
  }

  /**
   * Stop capturing and return collected resources
   * @returns {Promise<Map<string, CapturedResource>>} - Map of URL to captured resource
   */
  async stop() {
    if (!this.isCapturing) {
      return this.resources;
    }

    await this._cleanup();
    return this.resources;
  }

  /**
   * Clean up CDP session and listeners
   * @private
   */
  async _cleanup() {
    this.isCapturing = false;

    try {
      // Remove event listener
      if (this.client && this.requestHandler) {
        this.client.off('Fetch.requestPaused', this.requestHandler);
      }

      // Disable Fetch domain
      if (this.client) {
        try {
          await this.client.send('Fetch.disable');
        } catch (e) {
          // May already be disabled
        }

        // Detach CDP session
        try {
          await this.client.detach();
        } catch (e) {
          // May already be detached
        }
      }
    } catch (error) {
      // Best effort cleanup
    } finally {
      this.client = null;
      this.requestHandler = null;
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
