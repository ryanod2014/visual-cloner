import { BaseDetector } from './base.js';

/**
 * Next.js Detector
 *
 * Detects Next.js framework by looking for:
 * - /_next/static/ asset paths
 * - __NEXT_DATA__ script tag
 * - __BUILD_MANIFEST variable
 * - _buildManifest.js file references
 */
export class NextJsDetector extends BaseDetector {
  name = 'nextjs';

  // Core Next.js indicators
  static PATTERNS = [
    '/_next/static/',
    '__NEXT_DATA__',
    '__BUILD_MANIFEST',
    '_buildManifest.js',
    '_ssgManifest.js',
    'next/dist/',
    'nextjs'
  ];

  // Regex patterns for extracting build info
  static BUILD_ID_PATTERN = /\/_next\/static\/([a-zA-Z0-9_-]+)\//;
  static VERSION_PATTERN = /"next":"(\d+\.\d+\.\d+)"/;
  static DATA_SCRIPT_PATTERN = /<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/;

  canDetect(page, html) {
    return html.includes('/_next/') || html.includes('__NEXT_DATA__');
  }

  async detect(page, html) {
    const result = {
      bundler: this.name,
      version: null,
      confidence: 0,
      metadata: {
        buildId: null,
        hasAppRouter: false,
        hasPagesRouter: false,
        isStatic: false,
        assetPrefix: null,
        runtimeConfig: null,
        patterns: []
      }
    };

    // Check for Next.js patterns
    const foundPatterns = this.findPatterns(html, NextJsDetector.PATTERNS);
    result.metadata.patterns = foundPatterns;

    if (foundPatterns.length === 0) {
      return result;
    }

    // Base confidence from pattern detection
    result.confidence = Math.min(0.4 + (foundPatterns.length * 0.1), 0.85);

    // Extract build ID from asset paths
    const buildIdMatch = html.match(NextJsDetector.BUILD_ID_PATTERN);
    if (buildIdMatch) {
      result.metadata.buildId = buildIdMatch[1];
      result.confidence = Math.min(result.confidence + 0.1, 0.95);
    }

    // Extract __NEXT_DATA__ for rich metadata
    const nextDataMatch = html.match(NextJsDetector.DATA_SCRIPT_PATTERN);
    if (nextDataMatch) {
      result.confidence = Math.min(result.confidence + 0.15, 0.98);
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        result.metadata.buildId = result.metadata.buildId || nextData.buildId;
        result.metadata.isStatic = nextData.isFallback === false && !nextData.gssp;
        result.metadata.assetPrefix = nextData.assetPrefix || null;

        // Check for runtime config
        if (nextData.runtimeConfig) {
          result.metadata.runtimeConfig = nextData.runtimeConfig;
        }

        // Detect router type from page structure
        if (nextData.page) {
          result.metadata.hasPagesRouter = true;
        }
      } catch (e) {
        // JSON parse failed, continue with other detection
      }
    }

    // Check page context for additional info
    const pageInfo = await this.safeEvaluate(page, () => {
      const info = {
        hasNext: typeof __NEXT_DATA__ !== 'undefined',
        hasBuildManifest: typeof __BUILD_MANIFEST !== 'undefined',
        hasSSGManifest: typeof __SSG_MANIFEST !== 'undefined',
        version: null
      };

      // Try to get version from __NEXT_DATA__
      if (typeof __NEXT_DATA__ !== 'undefined' && __NEXT_DATA__.nextExport !== undefined) {
        info.isExport = __NEXT_DATA__.nextExport;
      }

      return info;
    });

    if (pageInfo) {
      if (pageInfo.hasNext) {
        result.confidence = Math.min(result.confidence + 0.1, 0.98);
      }
      if (pageInfo.hasBuildManifest) {
        result.metadata.hasBuildManifest = true;
      }
      if (pageInfo.hasSSGManifest) {
        result.metadata.hasSSGManifest = true;
        result.metadata.isStatic = true;
      }
    }

    // Detect App Router (Next.js 13+)
    if (html.includes('_rsc') || html.includes('__next_f')) {
      result.metadata.hasAppRouter = true;
      result.metadata.nextMajorVersion = 13;
    }

    // Extract version if available
    const versionMatch = html.match(NextJsDetector.VERSION_PATTERN);
    if (versionMatch) {
      result.version = versionMatch[1];
    }

    return result;
  }
}
