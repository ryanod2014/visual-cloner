/**
 * Origin Spoof Patcher
 * Universal patcher that replaces window.location property access with __extractedOrigin__
 * This allows extracted apps to think they're running on the original domain
 */

import { IPatcher, PatchResult } from './interface.js';

export class OriginSpoofPatcher extends IPatcher {
  constructor(originalUrl) {
    super('origin-spoof', 'Universal origin spoofing for domain checks');

    // Parse the original URL
    const url = new URL(originalUrl);
    this.originalOrigin = {
      hostname: url.hostname,
      host: url.host,
      origin: url.origin,
      protocol: url.protocol,
      href: originalUrl
    };
  }

  shouldApply(content, filename) {
    // Apply to JS and HTML files
    if (!filename.endsWith('.js') && !filename.endsWith('.html')) {
      return false;
    }

    // Check if content contains any location patterns
    const locationPatterns = [
      'window.location.hostname',
      'window.location.host',
      'window.location.origin',
      'window.location.protocol',
      'window.location.href',
      'document.location.hostname',
      'document.location.host',
      'document.location.origin',
      'document.location.protocol',
      'document.location.href',
      'self.location.hostname',
      'self.location.host',
      'location.hostname',
      'location.host',
      'location.origin',
      'location.protocol'
    ];

    return locationPatterns.some(pattern => content.includes(pattern));
  }

  apply(content) {
    const patches = [];
    let modified = content;

    // Check if this is HTML content
    if (content.includes('<script')) {
      // HTML file - patch only script contents inside <script> tags
      modified = content.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, scriptContent) => {
        const patchResult = this.applyReplacements(scriptContent);
        // Accumulate patches from each script block
        patches.push(...patchResult.patches);
        return `<script${attrs}>${patchResult.content}</script>`;
      });
    } else {
      // JS file - patch everything
      const patchResult = this.applyReplacements(content);
      modified = patchResult.content;
      patches.push(...patchResult.patches);
    }

    return { content: modified, patches };
  }

  /**
   * Apply all location replacements to the given content
   * Returns { content, patches } where patches is an array of PatchResult objects
   */
  applyReplacements(content) {
    const patches = [];
    let modified = content;

    // PATCH 1: window.location.hostname
    const hostnameResult = this.replacePattern(
      modified,
      /window\.location\.hostname/g,
      'window.__extractedOrigin__.hostname'
    );
    if (hostnameResult.count > 0) {
      modified = hostnameResult.content;
      patches.push(new PatchResult(
        'window.location.hostname',
        hostnameResult.count,
        ['window.location.hostname -> window.__extractedOrigin__.hostname']
      ));
    }

    // PATCH 2: window.location.host
    const hostResult = this.replacePattern(
      modified,
      /window\.location\.host(?!name)/g, // Negative lookahead to avoid matching hostname
      'window.__extractedOrigin__.host'
    );
    if (hostResult.count > 0) {
      modified = hostResult.content;
      patches.push(new PatchResult(
        'window.location.host',
        hostResult.count,
        ['window.location.host -> window.__extractedOrigin__.host']
      ));
    }

    // PATCH 3: window.location.origin
    const originResult = this.replacePattern(
      modified,
      /window\.location\.origin/g,
      'window.__extractedOrigin__.origin'
    );
    if (originResult.count > 0) {
      modified = originResult.content;
      patches.push(new PatchResult(
        'window.location.origin',
        originResult.count,
        ['window.location.origin -> window.__extractedOrigin__.origin']
      ));
    }

    // PATCH 4: window.location.protocol
    const protocolResult = this.replacePattern(
      modified,
      /window\.location\.protocol/g,
      'window.__extractedOrigin__.protocol'
    );
    if (protocolResult.count > 0) {
      modified = protocolResult.content;
      patches.push(new PatchResult(
        'window.location.protocol',
        protocolResult.count,
        ['window.location.protocol -> window.__extractedOrigin__.protocol']
      ));
    }

    // PATCH 5: window.location.href (only for reads, not assignments)
    const hrefReadResult = this.patchLocationHref(modified);
    if (hrefReadResult.count > 0) {
      modified = hrefReadResult.content;
      patches.push(new PatchResult(
        'window.location.href (reads)',
        hrefReadResult.count,
        hrefReadResult.examples
      ));
    }

    // PATCH 6: document.location.hostname
    const docHostnameResult = this.replacePattern(
      modified,
      /document\.location\.hostname/g,
      'window.__extractedOrigin__.hostname'
    );
    if (docHostnameResult.count > 0) {
      modified = docHostnameResult.content;
      patches.push(new PatchResult(
        'document.location.hostname',
        docHostnameResult.count,
        ['document.location.hostname -> window.__extractedOrigin__.hostname']
      ));
    }

    // PATCH 7: document.location.host
    const docHostResult = this.replacePattern(
      modified,
      /document\.location\.host(?!name)/g,
      'window.__extractedOrigin__.host'
    );
    if (docHostResult.count > 0) {
      modified = docHostResult.content;
      patches.push(new PatchResult(
        'document.location.host',
        docHostResult.count,
        ['document.location.host -> window.__extractedOrigin__.host']
      ));
    }

    // PATCH 8: document.location.origin
    const docOriginResult = this.replacePattern(
      modified,
      /document\.location\.origin/g,
      'window.__extractedOrigin__.origin'
    );
    if (docOriginResult.count > 0) {
      modified = docOriginResult.content;
      patches.push(new PatchResult(
        'document.location.origin',
        docOriginResult.count,
        ['document.location.origin -> window.__extractedOrigin__.origin']
      ));
    }

    // PATCH 9: document.location.protocol
    const docProtocolResult = this.replacePattern(
      modified,
      /document\.location\.protocol/g,
      'window.__extractedOrigin__.protocol'
    );
    if (docProtocolResult.count > 0) {
      modified = docProtocolResult.content;
      patches.push(new PatchResult(
        'document.location.protocol',
        docProtocolResult.count,
        ['document.location.protocol -> window.__extractedOrigin__.protocol']
      ));
    }

    // PATCH 10: document.location.href (only for reads, not assignments)
    const docHrefReadResult = this.patchDocumentLocationHref(modified);
    if (docHrefReadResult.count > 0) {
      modified = docHrefReadResult.content;
      patches.push(new PatchResult(
        'document.location.href (reads)',
        docHrefReadResult.count,
        docHrefReadResult.examples
      ));
    }

    // PATCH 11: self.location.hostname
    const selfHostnameResult = this.replacePattern(
      modified,
      /self\.location\.hostname/g,
      'window.__extractedOrigin__.hostname'
    );
    if (selfHostnameResult.count > 0) {
      modified = selfHostnameResult.content;
      patches.push(new PatchResult(
        'self.location.hostname',
        selfHostnameResult.count,
        ['self.location.hostname -> window.__extractedOrigin__.hostname']
      ));
    }

    // PATCH 12: self.location.host
    const selfHostResult = this.replacePattern(
      modified,
      /self\.location\.host(?!name)/g,
      'window.__extractedOrigin__.host'
    );
    if (selfHostResult.count > 0) {
      modified = selfHostResult.content;
      patches.push(new PatchResult(
        'self.location.host',
        selfHostResult.count,
        ['self.location.host -> window.__extractedOrigin__.host']
      ));
    }

    // PATCH 13: location.hostname (without window prefix)
    const bareHostnameResult = this.replacePattern(
      modified,
      /(?<!window\.)(?<![.\w])location\.hostname/g,
      'window.__extractedOrigin__.hostname'
    );
    if (bareHostnameResult.count > 0) {
      modified = bareHostnameResult.content;
      patches.push(new PatchResult(
        'location.hostname',
        bareHostnameResult.count,
        ['location.hostname -> window.__extractedOrigin__.hostname']
      ));
    }

    // PATCH 14: location.host (without window prefix)
    const bareHostResult = this.replacePattern(
      modified,
      /(?<!window\.)(?<![.\w])location\.host(?!name)/g,
      'window.__extractedOrigin__.host'
    );
    if (bareHostResult.count > 0) {
      modified = bareHostResult.content;
      patches.push(new PatchResult(
        'location.host',
        bareHostResult.count,
        ['location.host -> window.__extractedOrigin__.host']
      ));
    }

    // PATCH 15: location.origin (without window prefix)
    const bareOriginResult = this.replacePattern(
      modified,
      /(?<!window\.)(?<![.\w])location\.origin/g,
      'window.__extractedOrigin__.origin'
    );
    if (bareOriginResult.count > 0) {
      modified = bareOriginResult.content;
      patches.push(new PatchResult(
        'location.origin',
        bareOriginResult.count,
        ['location.origin -> window.__extractedOrigin__.origin']
      ));
    }

    // PATCH 16: location.protocol (without window prefix)
    const bareProtocolResult = this.replacePattern(
      modified,
      /(?<!window\.)(?<![.\w])location\.protocol/g,
      'window.__extractedOrigin__.protocol'
    );
    if (bareProtocolResult.count > 0) {
      modified = bareProtocolResult.content;
      patches.push(new PatchResult(
        'location.protocol',
        bareProtocolResult.count,
        ['location.protocol -> window.__extractedOrigin__.protocol']
      ));
    }

    return { content: modified, patches };
  }

  /**
   * Replace a pattern and count occurrences
   */
  replacePattern(content, pattern, replacement) {
    const matches = content.match(pattern);
    const count = matches ? matches.length : 0;
    const modified = content.replace(pattern, replacement);
    return { content: modified, count };
  }

  /**
   * Patch location.href - only replace when reading, not assigning
   * We look for patterns like:
   * - if (window.location.href === "...")
   * - const url = window.location.href
   * - return window.location.href
   *
   * But NOT:
   * - window.location.href = "..."
   * - location.href = "..."
   */
  patchLocationHref(content) {
    let modified = content;
    let count = 0;
    const examples = [];

    // Pattern for window.location.href that's NOT followed by assignment
    // This is tricky because we need to avoid = but allow ==, ===, !=, !==
    const hrefReadPattern = /window\.location\.href(?!\s*=(?!=))/g;
    const matches = content.match(hrefReadPattern);

    if (matches && matches.length > 0) {
      // For each match, we need to ensure it's not an assignment
      // The negative lookahead (?!\s*=(?!=)) ensures we don't match "href = " but do match "href ==" or "href ==="
      modified = modified.replace(hrefReadPattern, 'window.__extractedOrigin__.href');
      count = matches.length;
      examples.push('window.location.href (reads) -> window.__extractedOrigin__.href');
    }

    // Also handle bare location.href
    const bareHrefReadPattern = /(?<!window\.)(?<![.\w])location\.href(?!\s*=(?!=))/g;
    const bareMatches = modified.match(bareHrefReadPattern);

    if (bareMatches && bareMatches.length > 0) {
      modified = modified.replace(bareHrefReadPattern, 'window.__extractedOrigin__.href');
      count += bareMatches.length;
      examples.push('location.href (reads) -> window.__extractedOrigin__.href');
    }

    return { content: modified, count, examples };
  }

  /**
   * Patch document.location.href - only replace when reading, not assigning
   */
  patchDocumentLocationHref(content) {
    let modified = content;
    let count = 0;
    const examples = [];

    // Pattern for document.location.href that's NOT followed by assignment
    const hrefReadPattern = /document\.location\.href(?!\s*=(?!=))/g;
    const matches = content.match(hrefReadPattern);

    if (matches && matches.length > 0) {
      modified = modified.replace(hrefReadPattern, 'window.__extractedOrigin__.href');
      count = matches.length;
      examples.push('document.location.href (reads) -> window.__extractedOrigin__.href');
    }

    return { content: modified, count, examples };
  }

  /**
   * Generate the injection script that defines __extractedOrigin__
   * This should be injected into the HTML <head> as early as possible
   */
  generateInjectionScript() {
    return `<script>
window.__extractedOrigin__ = {
  hostname: ${JSON.stringify(this.originalOrigin.hostname)},
  host: ${JSON.stringify(this.originalOrigin.host)},
  origin: ${JSON.stringify(this.originalOrigin.origin)},
  protocol: ${JSON.stringify(this.originalOrigin.protocol)},
  href: ${JSON.stringify(this.originalOrigin.href)}
};
</script>`;
  }

  getPatterns() {
    return [
      {
        name: 'window.location.hostname',
        description: 'Replace with __extractedOrigin__.hostname'
      },
      {
        name: 'window.location.host',
        description: 'Replace with __extractedOrigin__.host'
      },
      {
        name: 'window.location.origin',
        description: 'Replace with __extractedOrigin__.origin'
      },
      {
        name: 'window.location.protocol',
        description: 'Replace with __extractedOrigin__.protocol'
      },
      {
        name: 'window.location.href (reads)',
        description: 'Replace reads (not assignments) with __extractedOrigin__.href'
      },
      {
        name: 'document.location.hostname',
        description: 'Replace with __extractedOrigin__.hostname'
      },
      {
        name: 'document.location.host',
        description: 'Replace with __extractedOrigin__.host'
      },
      {
        name: 'document.location.origin',
        description: 'Replace with __extractedOrigin__.origin'
      },
      {
        name: 'document.location.protocol',
        description: 'Replace with __extractedOrigin__.protocol'
      },
      {
        name: 'document.location.href (reads)',
        description: 'Replace reads (not assignments) with __extractedOrigin__.href'
      },
      {
        name: 'self.location.hostname',
        description: 'Replace with __extractedOrigin__.hostname'
      },
      {
        name: 'self.location.host',
        description: 'Replace with __extractedOrigin__.host'
      },
      {
        name: 'location.* (bare)',
        description: 'Replace bare location.* references with window.__extractedOrigin__.*'
      }
    ];
  }
}

export default OriginSpoofPatcher;
