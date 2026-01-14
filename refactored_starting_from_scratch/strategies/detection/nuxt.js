import { BaseDetector } from './base.js';

/**
 * Nuxt.js Detector
 *
 * Detects Nuxt.js framework by looking for:
 * - /_nuxt/ asset paths
 * - __NUXT__ global variable
 * - Nuxt-specific meta tags
 * - nuxt.config patterns
 */
export class NuxtDetector extends BaseDetector {
  name = 'nuxt';

  // Core Nuxt indicators
  static PATTERNS = [
    '/_nuxt/',
    '__NUXT__',
    '__NUXT_ASYNC_DATA__',
    'nuxt-link',
    'nuxt-page',
    'data-n-head',
    'data-server-rendered',
    'nuxt/dist/'
  ];

  // Nuxt 3 specific patterns
  static NUXT3_PATTERNS = [
    '__NUXT_RUNTIME_CONFIG__',
    'nuxt/dist/head',
    '_payload.json',
    'useHead',
    'useFetch'
  ];

  // Regex patterns
  static BUILD_PATTERN = /\/_nuxt\/([a-f0-9]+)\./;
  static VERSION_PATTERN = /"nuxt(?:@|":"|js":"|\/)(\d+\.\d+\.\d+)/;

  canDetect(page, html) {
    return html.includes('/_nuxt/') || html.includes('__NUXT__');
  }

  async detect(page, html) {
    const result = {
      bundler: this.name,
      version: null,
      confidence: 0,
      metadata: {
        patterns: [],
        isNuxt3: false,
        isSSR: false,
        isStatic: false,
        buildId: null,
        mode: null
      }
    };

    // Check for Nuxt patterns
    const foundPatterns = this.findPatterns(html, NuxtDetector.PATTERNS);
    result.metadata.patterns = foundPatterns;

    if (foundPatterns.length === 0) {
      return result;
    }

    // Base confidence from pattern detection
    result.confidence = Math.min(0.5 + (foundPatterns.length * 0.1), 0.85);

    // Check for Nuxt 3 specific patterns
    const nuxt3Patterns = this.findPatterns(html, NuxtDetector.NUXT3_PATTERNS);
    if (nuxt3Patterns.length > 0) {
      result.metadata.isNuxt3 = true;
      result.metadata.nuxtMajorVersion = 3;
      result.confidence = Math.min(result.confidence + 0.1, 0.95);
    }

    // Check for SSR indicators
    if (html.includes('data-server-rendered="true"') || html.includes('data-n-head-ssr')) {
      result.metadata.isSSR = true;
    }

    // Extract build ID from asset paths
    const buildMatch = html.match(NuxtDetector.BUILD_PATTERN);
    if (buildMatch) {
      result.metadata.buildId = buildMatch[1];
    }

    // Check page context for __NUXT__ data
    const pageInfo = await this.safeEvaluate(page, () => {
      const info = {
        hasNuxt: typeof __NUXT__ !== 'undefined',
        nuxtState: null,
        config: null
      };

      if (typeof __NUXT__ !== 'undefined') {
        info.nuxtState = {
          hasError: __NUXT__.err !== undefined,
          hasData: __NUXT__.data !== undefined || __NUXT__.state !== undefined,
          hasServerRendered: __NUXT__.serverRendered === true
        };

        // Try to get config (Nuxt 3)
        if (__NUXT__.config) {
          info.config = {
            app: __NUXT__.config.app || null
          };
        }
      }

      // Check for Nuxt 3 runtime config
      if (typeof __NUXT_RUNTIME_CONFIG__ !== 'undefined') {
        info.hasRuntimeConfig = true;
      }

      return info;
    });

    if (pageInfo) {
      if (pageInfo.hasNuxt) {
        result.confidence = Math.min(result.confidence + 0.15, 0.98);

        if (pageInfo.nuxtState) {
          result.metadata.isSSR = pageInfo.nuxtState.hasServerRendered;
          result.metadata.hasState = pageInfo.nuxtState.hasData;
        }

        if (pageInfo.config) {
          result.metadata.config = pageInfo.config;
        }
      }

      if (pageInfo.hasRuntimeConfig) {
        result.metadata.isNuxt3 = true;
        result.metadata.nuxtMajorVersion = 3;
      }
    }

    // Detect generation mode
    if (html.includes('nuxt-generate') || html.includes('nuxt generate')) {
      result.metadata.isStatic = true;
      result.metadata.mode = 'static';
    } else if (result.metadata.isSSR) {
      result.metadata.mode = 'ssr';
    } else {
      result.metadata.mode = 'spa';
    }

    // Extract version
    const versionMatch = html.match(NuxtDetector.VERSION_PATTERN);
    if (versionMatch) {
      result.version = versionMatch[1];
      const majorVersion = parseInt(result.version.split('.')[0], 10);
      result.metadata.nuxtMajorVersion = majorVersion;
      result.metadata.isNuxt3 = majorVersion >= 3;
    }

    return result;
  }
}
