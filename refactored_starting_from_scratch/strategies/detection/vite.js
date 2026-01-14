import { BaseDetector } from './base.js';

/**
 * Vite Detector
 *
 * Detects Vite bundler by looking for:
 * - /@vite/ HMR client paths
 * - import.meta usage patterns
 * - .vite/manifest.json references
 * - Modern ESM module patterns
 */
export class ViteDetector extends BaseDetector {
  name = 'vite';

  // Core Vite indicators
  static PATTERNS = [
    '/@vite/',
    '@vite/client',
    '.vite/manifest.json',
    '__vite_ssr_',
    'vite/modulepreload-polyfill',
    'import.meta.hot',
    'import.meta.env'
  ];

  // ESM-specific patterns that suggest Vite
  static ESM_PATTERNS = [
    'type="module"',
    'crossorigin',
    'modulepreload'
  ];

  // Vite-specific file patterns
  static FILE_PATTERNS = [
    /\/assets\/[a-zA-Z0-9_-]+\.[a-f0-9]+\.js/,
    /\/assets\/[a-zA-Z0-9_-]+\.[a-f0-9]+\.css/,
    /\/@fs\//,
    /\/@id\//
  ];

  canDetect(page, html) {
    // Quick check for Vite-specific patterns
    if (html.includes('@vite') || html.includes('.vite/')) {
      return true;
    }

    // Check for ESM module patterns with Vite-like asset naming
    if (html.includes('type="module"') && html.includes('/assets/')) {
      return true;
    }

    return false;
  }

  async detect(page, html) {
    const result = {
      bundler: this.name,
      version: null,
      confidence: 0,
      metadata: {
        patterns: [],
        isDevMode: false,
        hasManifest: false,
        assetPattern: null,
        framework: null,  // Could be vue, react, svelte, etc.
        usesLegacyPlugin: false
      }
    };

    // Check for Vite patterns
    const foundPatterns = this.findPatterns(html, ViteDetector.PATTERNS);
    result.metadata.patterns = foundPatterns;

    // Check for ESM patterns
    const esmPatterns = this.findPatterns(html, ViteDetector.ESM_PATTERNS);

    // If explicit Vite patterns found, high confidence
    if (foundPatterns.length > 0) {
      result.confidence = Math.min(0.5 + (foundPatterns.length * 0.15), 0.95);
    }

    // Check for Vite dev mode indicators
    if (html.includes('/@vite/client') || html.includes('import.meta.hot')) {
      result.metadata.isDevMode = true;
      result.confidence = Math.min(result.confidence + 0.2, 0.98);
    }

    // Check for Vite production patterns
    const filePatternMatches = this.findRegexMatches(html, ViteDetector.FILE_PATTERNS);
    if (filePatternMatches.length > 0) {
      result.metadata.assetPattern = 'vite-hash';
      if (result.confidence < 0.5) {
        result.confidence = 0.5;
      }
      result.confidence = Math.min(result.confidence + 0.15, 0.9);
    }

    // Check page context
    const pageInfo = await this.safeEvaluate(page, () => {
      const info = {
        hasViteClient: false,
        hasImportMeta: typeof import.meta !== 'undefined',
        env: null
      };

      // Check for Vite HMR
      if (typeof __vite_plugin_react_preamble_installed__ !== 'undefined') {
        info.hasViteReact = true;
      }

      // Check for import.meta.env (Vite specific)
      try {
        if (import.meta && import.meta.env) {
          info.env = {
            MODE: import.meta.env.MODE,
            DEV: import.meta.env.DEV,
            PROD: import.meta.env.PROD
          };
        }
      } catch (e) {
        // import.meta might not be available
      }

      return info;
    });

    if (pageInfo) {
      if (pageInfo.env) {
        result.metadata.env = pageInfo.env;
        result.metadata.isDevMode = pageInfo.env.DEV === true;
        result.confidence = Math.min(result.confidence + 0.2, 0.98);
      }
      if (pageInfo.hasViteReact) {
        result.metadata.framework = 'react';
      }
    }

    // Detect framework from common patterns
    if (html.includes('data-v-')) {
      result.metadata.framework = 'vue';
    } else if (html.includes('data-reactroot') || html.includes('__reactFiber')) {
      result.metadata.framework = 'react';
    } else if (html.includes('svelte')) {
      result.metadata.framework = 'svelte';
    }

    // Check for legacy browser support plugin
    if (html.includes('vite/legacy') || html.includes('System.register')) {
      result.metadata.usesLegacyPlugin = true;
    }

    // Check for modulepreload (Vite production optimization)
    if (html.includes('modulepreload')) {
      result.metadata.hasModulePreload = true;
    }

    // Only return result if we have some confidence
    if (result.confidence === 0 && esmPatterns.length >= 2) {
      // Weak signal: just ESM patterns without Vite-specific markers
      result.confidence = 0.2;
    }

    return result;
  }
}
