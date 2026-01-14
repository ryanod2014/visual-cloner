import { BaseDetector } from './base.js';

/**
 * Webpack Detector
 *
 * Detects webpack bundler by looking for:
 * - __webpack_require__ function
 * - webpackJsonp array
 * - webpackChunk* arrays
 * - Webpack runtime patterns
 */
export class WebpackDetector extends BaseDetector {
  name = 'webpack';

  // Patterns that indicate webpack presence
  static PATTERNS = [
    '__webpack_require__',
    'webpackJsonp',
    'webpackChunk',
    '__webpack_modules__',
    '__webpack_exports__',
    'webpack/runtime'
  ];

  // Regex patterns for version extraction
  static VERSION_PATTERNS = [
    /webpack\/(\d+\.\d+\.\d+)/,
    /"webpack":"(\d+\.\d+\.\d+)"/,
    /webpack@(\d+\.\d+\.\d+)/
  ];

  // Chunk naming patterns (webpack specific)
  static CHUNK_PATTERNS = [
    /[a-f0-9]{8,}\.js/,  // Hash-based chunk names
    /chunk\.[a-f0-9]+\.js/,
    /\d+\.[a-f0-9]+\.js/  // Numeric chunk IDs
  ];

  canDetect(page, html) {
    return WebpackDetector.PATTERNS.some(pattern => html.includes(pattern));
  }

  async detect(page, html) {
    const result = {
      bundler: this.name,
      version: null,
      confidence: 0,
      metadata: {
        patterns: [],
        chunkFormat: null,
        hasSourceMaps: false,
        runtimeChunks: []
      }
    };

    // Check for webpack patterns in HTML/inline scripts
    const foundPatterns = this.findPatterns(html, WebpackDetector.PATTERNS);
    result.metadata.patterns = foundPatterns;

    if (foundPatterns.length === 0) {
      return result;
    }

    // Base confidence from pattern matches
    result.confidence = Math.min(0.3 + (foundPatterns.length * 0.15), 0.9);

    // Try to extract version from page context
    const pageInfo = await this.safeEvaluate(page, () => {
      const info = {
        hasWebpackRequire: typeof __webpack_require__ !== 'undefined',
        hasWebpackModules: typeof __webpack_modules__ !== 'undefined',
        jsonpArrayName: null,
        version: null
      };

      // Check for webpackJsonp variants
      if (typeof webpackJsonp !== 'undefined') {
        info.jsonpArrayName = 'webpackJsonp';
      }

      // Check for webpackChunk* arrays (webpack 5+)
      for (const key of Object.keys(window)) {
        if (key.startsWith('webpackChunk')) {
          info.jsonpArrayName = key;
          break;
        }
      }

      return info;
    });

    if (pageInfo) {
      if (pageInfo.hasWebpackRequire || pageInfo.hasWebpackModules) {
        result.confidence = Math.min(result.confidence + 0.2, 0.95);
      }

      if (pageInfo.jsonpArrayName) {
        result.metadata.jsonpArrayName = pageInfo.jsonpArrayName;
        // webpackChunk indicates webpack 5+
        if (pageInfo.jsonpArrayName.startsWith('webpackChunk')) {
          result.metadata.webpackMajorVersion = 5;
        } else if (pageInfo.jsonpArrayName === 'webpackJsonp') {
          result.metadata.webpackMajorVersion = 4;
        }
      }
    }

    // Try to extract exact version from HTML
    for (const pattern of WebpackDetector.VERSION_PATTERNS) {
      const match = html.match(pattern);
      if (match) {
        result.version = match[1];
        result.confidence = Math.min(result.confidence + 0.1, 0.98);
        break;
      }
    }

    // Check for source maps
    if (html.includes('sourceMappingURL') || html.includes('.map')) {
      result.metadata.hasSourceMaps = true;
    }

    // Detect chunk format for discovery phase
    if (html.includes('webpackChunk')) {
      result.metadata.chunkFormat = 'webpack5';
    } else if (html.includes('webpackJsonp')) {
      result.metadata.chunkFormat = 'webpack4';
    }

    return result;
  }
}
