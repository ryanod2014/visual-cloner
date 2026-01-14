import { BaseDetector } from './base.js';

/**
 * Angular Detector
 *
 * Detects Angular framework by looking for:
 * - ng-version attribute
 * - Angular-specific selectors and attributes
 * - main.*.js bundle pattern
 * - Angular runtime markers
 */
export class AngularDetector extends BaseDetector {
  name = 'angular';

  // Core Angular indicators
  static PATTERNS = [
    'ng-version',
    'ng-app',
    'ng-controller',
    'ng-scope',
    '_nghost',
    '_ngcontent',
    'ng-reflect',
    'angular.js',
    'angular.min.js',
    '@angular/core',
    'platformBrowserDynamic'
  ];

  // Angular-specific attribute patterns
  static ATTRIBUTE_PATTERNS = [
    /_nghost-[a-z0-9-]+/,
    /_ngcontent-[a-z0-9-]+/,
    /ng-version="(\d+\.\d+\.\d+)"/
  ];

  // Angular bundle patterns
  static BUNDLE_PATTERNS = [
    /main\.[a-f0-9]+\.js/,
    /polyfills\.[a-f0-9]+\.js/,
    /runtime\.[a-f0-9]+\.js/,
    /vendor\.[a-f0-9]+\.js/,
    /styles\.[a-f0-9]+\.css/
  ];

  canDetect(page, html) {
    return html.includes('ng-version') ||
           html.includes('_nghost') ||
           html.includes('_ngcontent') ||
           html.includes('@angular') ||
           html.includes('ng-app');
  }

  async detect(page, html) {
    const result = {
      bundler: this.name,
      version: null,
      confidence: 0,
      metadata: {
        patterns: [],
        isAngularJS: false,  // AngularJS (1.x) vs Angular (2+)
        isIvy: false,        // Angular Ivy renderer
        hasSSR: false,       // Angular Universal
        componentSelectors: []
      }
    };

    // Check for Angular patterns
    const foundPatterns = this.findPatterns(html, AngularDetector.PATTERNS);
    result.metadata.patterns = foundPatterns;

    if (foundPatterns.length === 0) {
      return result;
    }

    // Differentiate AngularJS from Angular
    if (html.includes('angular.js') || html.includes('angular.min.js') ||
        html.includes('ng-app') || html.includes('ng-controller')) {
      result.metadata.isAngularJS = true;
      result.confidence = 0.85;
    }

    // Modern Angular detection
    if (html.includes('_nghost') || html.includes('_ngcontent') ||
        html.includes('@angular')) {
      result.metadata.isAngularJS = false;
      result.confidence = Math.min(0.5 + (foundPatterns.length * 0.1), 0.9);
    }

    // Extract version from ng-version attribute
    const versionMatch = html.match(/ng-version="(\d+\.\d+\.\d+)"/);
    if (versionMatch) {
      result.version = versionMatch[1];
      result.confidence = Math.min(result.confidence + 0.15, 0.98);

      const majorVersion = parseInt(result.version.split('.')[0], 10);
      result.metadata.isAngularJS = majorVersion < 2;

      // Ivy was introduced in Angular 9
      if (majorVersion >= 9) {
        result.metadata.isIvy = true;
      }
    }

    // Check bundle patterns
    const bundleMatches = this.findRegexMatches(html, AngularDetector.BUNDLE_PATTERNS);
    if (bundleMatches.length >= 2) {
      result.confidence = Math.min(result.confidence + 0.1, 0.95);
      result.metadata.hasBundles = bundleMatches.length;
    }

    // Extract component selectors for asset discovery
    const selectorMatches = html.match(/_nghost-[a-z0-9-]+/g) || [];
    const uniqueSelectors = [...new Set(selectorMatches)];
    result.metadata.componentSelectors = uniqueSelectors.slice(0, 20);

    // Check page context for Angular
    const pageInfo = await this.safeEvaluate(page, () => {
      const info = {
        hasNgVersion: false,
        hasNgProbe: typeof ng !== 'undefined' && typeof ng.probe === 'function',
        hasNgGetComponent: typeof ng !== 'undefined' && typeof ng.getComponent === 'function',
        version: null,
        isIvy: false
      };

      // Check for ng global (Angular dev mode)
      if (typeof ng !== 'undefined') {
        info.hasNg = true;
        // Ivy detection
        if (typeof ng.getComponent === 'function') {
          info.isIvy = true;
        }
      }

      // Check for getAllAngularRootElements (Angular debugging)
      if (typeof getAllAngularRootElements === 'function') {
        info.hasRootElements = true;
      }

      // Check for AngularJS
      if (typeof angular !== 'undefined') {
        info.isAngularJS = true;
        if (angular.version) {
          info.version = angular.version.full;
        }
      }

      return info;
    });

    if (pageInfo) {
      if (pageInfo.hasNg || pageInfo.hasRootElements) {
        result.confidence = Math.min(result.confidence + 0.15, 0.98);
      }

      if (pageInfo.isIvy) {
        result.metadata.isIvy = true;
      }

      if (pageInfo.isAngularJS) {
        result.metadata.isAngularJS = true;
        if (pageInfo.version) {
          result.version = pageInfo.version;
        }
      }
    }

    // Detect Angular Universal (SSR)
    if (html.includes('ng-state') || html.includes('transfer-state') ||
        html.includes('serverApp')) {
      result.metadata.hasSSR = true;
    }

    return result;
  }
}
