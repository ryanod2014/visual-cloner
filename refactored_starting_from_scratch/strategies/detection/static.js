import { BaseDetector } from './base.js';

/**
 * Static Site Detector
 *
 * Fallback detector for static/vanilla HTML sites.
 * Always returns a low confidence result when no bundler is detected.
 * This ensures the detection system always has a result to work with.
 */
export class StaticDetector extends BaseDetector {
  name = 'static';

  // Indicators of a truly static site
  static STATIC_INDICATORS = [
    // No complex JS patterns
    'text/html',
    // Traditional static file references
    '.html',
    '.htm'
  ];

  // Patterns that suggest manual/non-bundled code
  static VANILLA_PATTERNS = [
    'document.getElementById',
    'document.querySelector',
    'addEventListener',
    'jQuery',
    '$.ready',
    'DOMContentLoaded'
  ];

  canDetect(page, html) {
    // Static detector can always attempt detection
    // It serves as the fallback when no bundler is found
    return true;
  }

  async detect(page, html) {
    const result = {
      bundler: this.name,
      version: null,
      confidence: 0.1,  // Always low base confidence
      metadata: {
        isVanillaJS: false,
        hasJQuery: false,
        hasExternalScripts: false,
        hasInlineScripts: false,
        hasExternalStyles: false,
        hasInlineStyles: false,
        scriptCount: 0,
        stylesheetCount: 0
      }
    };

    // Count scripts
    const scriptTags = (html.match(/<script[^>]*>/g) || []);
    result.metadata.scriptCount = scriptTags.length;

    // Check for inline vs external scripts
    result.metadata.hasInlineScripts = html.includes('<script>') ||
                                        html.includes('<script type="text/javascript">');
    result.metadata.hasExternalScripts = scriptTags.some(tag =>
      tag.includes('src=') && !tag.includes('type="module"')
    );

    // Count stylesheets
    const linkTags = (html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/g) || []);
    result.metadata.stylesheetCount = linkTags.length;

    // Check for inline styles
    result.metadata.hasInlineStyles = html.includes('<style>') ||
                                       html.includes('<style type="text/css">');
    result.metadata.hasExternalStyles = linkTags.length > 0;

    // Check for vanilla JS patterns
    const vanillaMatches = this.findPatterns(html, StaticDetector.VANILLA_PATTERNS);
    if (vanillaMatches.length > 0) {
      result.metadata.isVanillaJS = true;
      result.metadata.vanillaPatterns = vanillaMatches;
    }

    // Check for jQuery
    if (html.includes('jquery') || html.includes('jQuery') || html.includes('$.')) {
      result.metadata.hasJQuery = true;

      // Try to extract jQuery version
      const jqueryVersionMatch = html.match(/jquery[.-]?(\d+\.\d+\.\d+)/i);
      if (jqueryVersionMatch) {
        result.metadata.jQueryVersion = jqueryVersionMatch[1];
      }
    }

    // Check page context for additional info
    const pageInfo = await this.safeEvaluate(page, () => {
      return {
        hasJQuery: typeof jQuery !== 'undefined' || typeof $ !== 'undefined',
        jQueryVersion: typeof jQuery !== 'undefined' ? jQuery.fn?.jquery : null
      };
    });

    if (pageInfo) {
      if (pageInfo.hasJQuery) {
        result.metadata.hasJQuery = true;
        if (pageInfo.jQueryVersion) {
          result.metadata.jQueryVersion = pageInfo.jQueryVersion;
        }
      }
    }

    // Adjust confidence based on findings
    // More static indicators = higher confidence this is truly static
    if (!result.metadata.hasExternalScripts && result.metadata.scriptCount <= 2) {
      result.confidence = Math.min(result.confidence + 0.1, 0.3);
    }

    if (result.metadata.isVanillaJS && !html.includes('webpack') &&
        !html.includes('__NEXT') && !html.includes('_nuxt')) {
      result.confidence = Math.min(result.confidence + 0.15, 0.4);
    }

    // If jQuery is the only significant JS, increase confidence
    if (result.metadata.hasJQuery && result.metadata.scriptCount <= 3) {
      result.confidence = Math.min(result.confidence + 0.1, 0.4);
      result.metadata.framework = 'jquery';
    }

    return result;
  }
}
