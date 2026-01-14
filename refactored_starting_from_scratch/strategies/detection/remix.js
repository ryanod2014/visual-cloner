import { BaseDetector } from './base.js';

/**
 * Remix Detector
 *
 * Detects Remix framework by looking for:
 * - __remixManifest global variable
 * - /build/ asset paths (Remix convention)
 * - Remix-specific data loading patterns
 */
export class RemixDetector extends BaseDetector {
  name = 'remix';

  // Core Remix indicators
  static PATTERNS = [
    '__remixManifest',
    '__remixContext',
    '__remixRouteModules',
    'data-remix',
    '/build/_shared/',
    '/build/entry.client',
    '/build/routes/',
    'remix-run'
  ];

  // Remix route module patterns
  static ROUTE_PATTERNS = [
    /\/build\/routes\/[a-zA-Z0-9$_-]+/,
    /route:\{id:"[^"]+"/,
    /entry\.client-[A-Z0-9]+\.js/
  ];

  // Version extraction
  static VERSION_PATTERN = /"@remix-run\/(?:react|node|cloudflare|deno)":"(\d+\.\d+\.\d+)"/;

  canDetect(page, html) {
    return html.includes('__remixManifest') ||
           html.includes('__remixContext') ||
           (html.includes('/build/') && html.includes('entry.client'));
  }

  async detect(page, html) {
    const result = {
      bundler: this.name,
      version: null,
      confidence: 0,
      metadata: {
        patterns: [],
        routes: [],
        hasManifest: false,
        runtime: null,  // node, cloudflare, deno, etc.
        buildPath: '/build/'
      }
    };

    // Check for Remix patterns
    const foundPatterns = this.findPatterns(html, RemixDetector.PATTERNS);
    result.metadata.patterns = foundPatterns;

    if (foundPatterns.length === 0) {
      return result;
    }

    // Base confidence from pattern detection
    result.confidence = Math.min(0.4 + (foundPatterns.length * 0.15), 0.9);

    // Check for __remixManifest (very strong indicator)
    if (html.includes('__remixManifest')) {
      result.confidence = Math.min(result.confidence + 0.2, 0.98);
      result.metadata.hasManifest = true;
    }

    // Check route patterns
    const routeMatches = this.findRegexMatches(html, RemixDetector.ROUTE_PATTERNS);
    if (routeMatches.length > 0) {
      result.confidence = Math.min(result.confidence + 0.1, 0.95);
    }

    // Check page context for Remix globals
    const pageInfo = await this.safeEvaluate(page, () => {
      const info = {
        hasRemixManifest: typeof __remixManifest !== 'undefined',
        hasRemixContext: typeof __remixContext !== 'undefined',
        manifest: null,
        context: null
      };

      if (typeof __remixManifest !== 'undefined') {
        info.manifest = {
          version: __remixManifest.version || null,
          routes: Object.keys(__remixManifest.routes || {}),
          entry: __remixManifest.entry || null
        };
      }

      if (typeof __remixContext !== 'undefined') {
        info.context = {
          hasRouteModules: __remixContext.routeModules !== undefined,
          hasState: __remixContext.state !== undefined
        };
      }

      return info;
    });

    if (pageInfo) {
      if (pageInfo.hasRemixManifest) {
        result.confidence = Math.min(result.confidence + 0.15, 0.98);
        result.metadata.hasManifest = true;

        if (pageInfo.manifest) {
          result.metadata.routes = pageInfo.manifest.routes || [];
          result.metadata.entry = pageInfo.manifest.entry;

          if (pageInfo.manifest.version) {
            result.metadata.manifestVersion = pageInfo.manifest.version;
          }
        }
      }

      if (pageInfo.hasRemixContext && pageInfo.context) {
        result.metadata.hasRouteModules = pageInfo.context.hasRouteModules;
        result.metadata.hasState = pageInfo.context.hasState;
      }
    }

    // Extract build path for asset discovery
    const buildPathMatch = html.match(/src="([^"]*\/build\/)/);
    if (buildPathMatch) {
      result.metadata.buildPath = buildPathMatch[1];
    }

    // Detect runtime from patterns
    if (html.includes('@remix-run/cloudflare') || html.includes('cloudflare')) {
      result.metadata.runtime = 'cloudflare';
    } else if (html.includes('@remix-run/deno')) {
      result.metadata.runtime = 'deno';
    } else {
      result.metadata.runtime = 'node';  // Default
    }

    // Extract version
    const versionMatch = html.match(RemixDetector.VERSION_PATTERN);
    if (versionMatch) {
      result.version = versionMatch[1];
    }

    // Check for Vite-based Remix (newer versions)
    if (html.includes('@remix-run/dev/dist/vite') || html.includes('remix-vite')) {
      result.metadata.usesVite = true;
    }

    return result;
  }
}
