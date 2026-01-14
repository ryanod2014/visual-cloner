import { BaseDetector } from './base.js';

/**
 * Parcel Detector
 *
 * Detects Parcel bundler by looking for:
 * - Parcel-specific HMR patterns
 * - Parcel manifest patterns
 * - Characteristic bundle naming conventions
 */
export class ParcelDetector extends BaseDetector {
  name = 'parcel';

  // Core Parcel indicators
  static PATTERNS = [
    'parcelRequire',
    '__parcel__',
    'parcel-bundler',
    'parcel-hmr',
    '.parcel-cache',
    'parcel/lib/builtins'
  ];

  // Parcel 2 specific patterns
  static PARCEL2_PATTERNS = [
    '@parcel/runtime',
    '@parcel/transformer',
    'parcel-manifest',
    '__parcel__import__'
  ];

  // Parcel bundle naming patterns
  static BUNDLE_PATTERNS = [
    /src\.[a-f0-9]+\.js/,
    /src\.[a-f0-9]+\.css/,
    /index\.[a-f0-9]+\.js/,
    /[a-zA-Z0-9]+\.[a-f0-9]{8}\.js/
  ];

  // Parcel HMR patterns
  static HMR_PATTERNS = [
    /module\.hot/,
    /parcel.*hot/i,
    /hmr-runtime/
  ];

  canDetect(page, html) {
    return html.includes('parcelRequire') ||
           html.includes('__parcel__') ||
           html.includes('@parcel/');
  }

  async detect(page, html) {
    const result = {
      bundler: this.name,
      version: null,
      confidence: 0,
      metadata: {
        patterns: [],
        isParcel2: false,
        isDevMode: false,
        bundleFormat: null,
        hasSourceMaps: false
      }
    };

    // Check for Parcel patterns
    const foundPatterns = this.findPatterns(html, ParcelDetector.PATTERNS);
    result.metadata.patterns = foundPatterns;

    if (foundPatterns.length === 0) {
      // Check for Parcel 2 patterns
      const parcel2Patterns = this.findPatterns(html, ParcelDetector.PARCEL2_PATTERNS);
      if (parcel2Patterns.length === 0) {
        return result;
      }
      result.metadata.patterns = parcel2Patterns;
      result.metadata.isParcel2 = true;
    }

    // Base confidence from pattern detection
    result.confidence = Math.min(0.4 + (result.metadata.patterns.length * 0.15), 0.85);

    // Strong indicator: parcelRequire
    if (html.includes('parcelRequire')) {
      result.confidence = Math.min(result.confidence + 0.2, 0.95);
    }

    // Check for Parcel 2 specific patterns
    const parcel2Found = this.findPatterns(html, ParcelDetector.PARCEL2_PATTERNS);
    if (parcel2Found.length > 0) {
      result.metadata.isParcel2 = true;
      result.metadata.parcelMajorVersion = 2;
    }

    // Check bundle patterns
    const bundleMatches = this.findRegexMatches(html, ParcelDetector.BUNDLE_PATTERNS);
    if (bundleMatches.length > 0) {
      result.metadata.bundleFormat = result.metadata.isParcel2 ? 'parcel2' : 'parcel1';
      result.confidence = Math.min(result.confidence + 0.1, 0.9);
    }

    // Check page context
    const pageInfo = await this.safeEvaluate(page, () => {
      const info = {
        hasParcelRequire: typeof parcelRequire !== 'undefined',
        hasParcelCache: false,
        hasHMR: false
      };

      // Check for parcelRequire function
      if (typeof parcelRequire === 'function') {
        info.hasParcelRequire = true;
      }

      // Check for Parcel's module cache
      if (typeof parcelRequire !== 'undefined' && parcelRequire.cache) {
        info.hasParcelCache = true;
        info.cacheSize = Object.keys(parcelRequire.cache).length;
      }

      // Check for HMR
      if (typeof module !== 'undefined' && module.hot) {
        info.hasHMR = true;
      }

      return info;
    });

    if (pageInfo) {
      if (pageInfo.hasParcelRequire) {
        result.confidence = Math.min(result.confidence + 0.15, 0.98);
      }

      if (pageInfo.hasParcelCache) {
        result.metadata.moduleCount = pageInfo.cacheSize;
      }

      if (pageInfo.hasHMR) {
        result.metadata.isDevMode = true;
      }
    }

    // Check for source maps
    if (html.includes('sourceMappingURL') || html.includes('.map')) {
      result.metadata.hasSourceMaps = true;
    }

    // Check for development mode indicators
    if (html.includes('parcel-hmr') || html.includes('localhost:')) {
      result.metadata.isDevMode = true;
    }

    // Try to determine Parcel version
    if (result.metadata.isParcel2) {
      // Parcel 2 has different patterns
      const versionMatch = html.match(/"@parcel\/[^"]+":"(\d+\.\d+\.\d+)"/);
      if (versionMatch) {
        result.version = versionMatch[1];
      }
    } else {
      // Parcel 1 version detection
      const versionMatch = html.match(/"parcel-bundler":"(\d+\.\d+\.\d+)"/);
      if (versionMatch) {
        result.version = versionMatch[1];
      }
    }

    return result;
  }
}
