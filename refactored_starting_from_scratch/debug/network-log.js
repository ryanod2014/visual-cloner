/**
 * Network Logger - Request/Response Tracking
 *
 * Attaches to a Playwright page and logs all network activity with timing.
 * Useful for identifying slow or failed requests during extraction.
 *
 * Usage:
 *   const logger = createNetworkLogger(page);
 *   // ... do extraction ...
 *   const log = logger.getLog();
 *   logger.exportJSON('network-log.json');
 */

import fs from 'fs/promises';

/**
 * Network request entry structure
 * @typedef {Object} NetworkEntry
 * @property {string} url - Request URL
 * @property {string} method - HTTP method
 * @property {string} resourceType - Resource type (script, stylesheet, etc.)
 * @property {number} startTime - Request start timestamp
 * @property {number} endTime - Response received timestamp
 * @property {number} duration - Total request duration in ms
 * @property {number} status - HTTP status code
 * @property {string} statusText - HTTP status text
 * @property {boolean} success - Whether request was successful (2xx)
 * @property {boolean} failed - Whether request failed completely
 * @property {string} failureReason - Reason for failure if failed
 * @property {number} size - Response size in bytes
 * @property {string} contentType - Response content type
 * @property {Object} headers - Response headers
 */

/**
 * Create a network logger attached to a Playwright page
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {Object} options - Logger options
 * @param {boolean} options.captureHeaders - Capture response headers (default: false)
 * @param {boolean} options.verbose - Log requests as they happen (default: false)
 * @param {Function} options.onRequest - Callback when request starts
 * @param {Function} options.onResponse - Callback when response received
 * @param {Function} options.onFailed - Callback when request fails
 * @returns {NetworkLogger} Logger instance
 */
export function createNetworkLogger(page, options = {}) {
  return new NetworkLogger(page, options);
}

/**
 * Network logger class
 */
export class NetworkLogger {
  constructor(page, options = {}) {
    this.page = page;
    this.options = {
      captureHeaders: options.captureHeaders || false,
      verbose: options.verbose || false,
      onRequest: options.onRequest || null,
      onResponse: options.onResponse || null,
      onFailed: options.onFailed || null,
    };

    /** @type {Map<string, NetworkEntry>} */
    this.entries = new Map();

    /** @type {NetworkEntry[]} */
    this.log = [];

    this.startTime = Date.now();
    this.attached = false;

    // Bind handlers
    this._onRequest = this._handleRequest.bind(this);
    this._onResponse = this._handleResponse.bind(this);
    this._onFailed = this._handleFailed.bind(this);
  }

  /**
   * Start logging network requests
   */
  attach() {
    if (this.attached) return this;

    this.page.on('request', this._onRequest);
    this.page.on('response', this._onResponse);
    this.page.on('requestfailed', this._onFailed);
    this.attached = true;

    return this;
  }

  /**
   * Stop logging network requests
   */
  detach() {
    if (!this.attached) return this;

    this.page.off('request', this._onRequest);
    this.page.off('response', this._onResponse);
    this.page.off('requestfailed', this._onFailed);
    this.attached = false;

    return this;
  }

  /**
   * Handle request start
   * @private
   */
  _handleRequest(request) {
    const url = request.url();

    // Skip data URLs
    if (url.startsWith('data:') || url.startsWith('blob:')) return;

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      method: request.method(),
      resourceType: request.resourceType(),
      startTime: Date.now(),
      endTime: null,
      duration: null,
      status: null,
      statusText: null,
      success: false,
      failed: false,
      failureReason: null,
      size: 0,
      contentType: null,
      headers: null,
      postData: request.postData() ? '[POST DATA]' : null,
    };

    this.entries.set(url, entry);

    if (this.options.verbose) {
      console.log(`[NET] --> ${entry.method} ${this._truncateUrl(url)}`);
    }

    if (this.options.onRequest) {
      this.options.onRequest(entry);
    }
  }

  /**
   * Handle response received
   * @private
   */
  async _handleResponse(response) {
    const url = response.url();
    const entry = this.entries.get(url);

    if (!entry) return;

    entry.endTime = Date.now();
    entry.duration = entry.endTime - entry.startTime;
    entry.status = response.status();
    entry.statusText = response.statusText();
    entry.success = entry.status >= 200 && entry.status < 300;
    entry.contentType = response.headers()['content-type'] || null;

    // Capture headers if requested
    if (this.options.captureHeaders) {
      entry.headers = response.headers();
    }

    // Try to get size
    try {
      const body = await response.body();
      entry.size = body.length;
    } catch (e) {
      // Body not available
    }

    // Move to log array
    this.log.push(entry);
    this.entries.delete(url);

    if (this.options.verbose) {
      const status = entry.success ? '\x1b[32m' : '\x1b[33m';
      console.log(`[NET] <-- ${status}${entry.status}\x1b[0m ${this._truncateUrl(url)} (${entry.duration}ms)`);
    }

    if (this.options.onResponse) {
      this.options.onResponse(entry);
    }
  }

  /**
   * Handle request failure
   * @private
   */
  _handleFailed(request) {
    const url = request.url();
    const entry = this.entries.get(url);

    if (!entry) return;

    const failure = request.failure();

    entry.endTime = Date.now();
    entry.duration = entry.endTime - entry.startTime;
    entry.failed = true;
    entry.failureReason = failure?.errorText || 'Unknown error';

    // Move to log array
    this.log.push(entry);
    this.entries.delete(url);

    if (this.options.verbose) {
      console.log(`[NET] \x1b[31mXXX\x1b[0m ${this._truncateUrl(url)} - ${entry.failureReason}`);
    }

    if (this.options.onFailed) {
      this.options.onFailed(entry);
    }
  }

  /**
   * Truncate URL for display
   * @private
   */
  _truncateUrl(url, maxLen = 80) {
    if (url.length <= maxLen) return url;
    return url.slice(0, maxLen - 3) + '...';
  }

  // ==================== Analysis Methods ====================

  /**
   * Get all logged entries
   * @returns {NetworkEntry[]}
   */
  getLog() {
    return [...this.log];
  }

  /**
   * Get failed requests
   * @returns {NetworkEntry[]}
   */
  getFailed() {
    return this.log.filter(e => e.failed || (e.status && e.status >= 400));
  }

  /**
   * Get slow requests (over threshold)
   * @param {number} thresholdMs - Duration threshold in ms (default: 1000)
   * @returns {NetworkEntry[]}
   */
  getSlow(thresholdMs = 1000) {
    return this.log
      .filter(e => e.duration && e.duration >= thresholdMs)
      .sort((a, b) => b.duration - a.duration);
  }

  /**
   * Get requests by resource type
   * @param {string} type - Resource type (script, stylesheet, image, etc.)
   * @returns {NetworkEntry[]}
   */
  getByType(type) {
    return this.log.filter(e => e.resourceType === type);
  }

  /**
   * Get requests by status code
   * @param {number} status - HTTP status code
   * @returns {NetworkEntry[]}
   */
  getByStatus(status) {
    return this.log.filter(e => e.status === status);
  }

  /**
   * Get statistics summary
   * @returns {Object}
   */
  getStats() {
    const entries = this.log;

    // Group by resource type
    const byType = {};
    for (const entry of entries) {
      const type = entry.resourceType || 'other';
      if (!byType[type]) {
        byType[type] = { count: 0, size: 0, totalTime: 0 };
      }
      byType[type].count++;
      byType[type].size += entry.size || 0;
      byType[type].totalTime += entry.duration || 0;
    }

    // Group by status
    const byStatus = {};
    for (const entry of entries) {
      const status = entry.status || (entry.failed ? 'failed' : 'pending');
      byStatus[status] = (byStatus[status] || 0) + 1;
    }

    // Calculate timing stats
    const durations = entries.filter(e => e.duration).map(e => e.duration);
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
    const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;
    const minDuration = durations.length > 0 ? Math.min(...durations) : 0;

    // Total size
    const totalSize = entries.reduce((sum, e) => sum + (e.size || 0), 0);

    return {
      totalRequests: entries.length,
      successfulRequests: entries.filter(e => e.success).length,
      failedRequests: entries.filter(e => e.failed).length,
      errorRequests: entries.filter(e => e.status && e.status >= 400).length,
      pendingRequests: this.entries.size,
      totalSize,
      totalSizeFormatted: this._formatSize(totalSize),
      timing: {
        average: Math.round(avgDuration),
        max: maxDuration,
        min: minDuration,
        total: Date.now() - this.startTime,
      },
      byType,
      byStatus,
    };
  }

  /**
   * Format bytes to human-readable
   * @private
   */
  _formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  // ==================== Export Methods ====================

  /**
   * Export log to JSON file
   * @param {string} filePath - Output file path
   * @returns {Promise<string>} Path to saved file
   */
  async exportJSON(filePath) {
    const data = {
      exportedAt: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      stats: this.getStats(),
      entries: this.log,
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return filePath;
  }

  /**
   * Export failed requests to JSON
   * @param {string} filePath - Output file path
   * @returns {Promise<string>} Path to saved file
   */
  async exportFailed(filePath) {
    const data = {
      exportedAt: new Date().toISOString(),
      failedRequests: this.getFailed(),
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return filePath;
  }

  /**
   * Print summary to console
   */
  printSummary() {
    const stats = this.getStats();

    console.log('\n' + '='.repeat(60));
    console.log('  NETWORK LOG SUMMARY');
    console.log('='.repeat(60));
    console.log(`  Total Requests:    ${stats.totalRequests}`);
    console.log(`  Successful:        ${stats.successfulRequests}`);
    console.log(`  Failed:            ${stats.failedRequests}`);
    console.log(`  Errors (4xx/5xx):  ${stats.errorRequests}`);
    console.log(`  Total Size:        ${stats.totalSizeFormatted}`);
    console.log(`  Avg Duration:      ${stats.timing.average}ms`);
    console.log(`  Max Duration:      ${stats.timing.max}ms`);
    console.log('');
    console.log('  By Type:');
    for (const [type, data] of Object.entries(stats.byType)) {
      console.log(`    ${type.padEnd(12)} ${data.count} requests, ${this._formatSize(data.size)}`);
    }
    console.log('');
    console.log('  By Status:');
    for (const [status, count] of Object.entries(stats.byStatus)) {
      console.log(`    ${String(status).padEnd(12)} ${count} requests`);
    }
    console.log('='.repeat(60) + '\n');
  }
}

export default { createNetworkLogger, NetworkLogger };
