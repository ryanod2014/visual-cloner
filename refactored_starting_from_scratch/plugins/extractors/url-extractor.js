/**
 * Universal URL Extractor
 *
 * TRULY GENERIC - learns patterns from captured resources, no hardcoding.
 *
 * Core insight: Every URL follows the pattern BASE + VALUE + EXTENSION
 * We learn ALL three from captured resources and extracted strings,
 * then try ALL reasonable combinations.
 *
 * Works for ANY resource type: fonts, images, locales, shaders, configs, etc.
 */

// All file extensions we care about (comprehensive list)
const ALL_EXTENSIONS = new Set([
  // Scripts & styles
  'js', 'mjs', 'cjs', 'css', 'scss', 'less', 'map',
  // Binary/compiled
  'wasm', 'zip', 'gz', 'tar', 'bin', 'dat', 'pak',
  // Fonts
  'otf', 'ttf', 'woff', 'woff2', 'eot',
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tiff', 'avif', 'cur',
  // Data
  'json', 'xml', 'csv', 'txt', 'yaml', 'yml', 'toml', 'ini', 'cfg',
  // Web
  'html', 'htm', 'xhtml',
  // Media
  'mp3', 'mp4', 'wav', 'ogg', 'webm', 'avi', 'mov', 'm4a', 'flac',
  // 3D/Graphics
  'glsl', 'vert', 'frag', 'shader', 'obj', 'mtl', 'gltf', 'glb',
  // Documents
  'pdf',
  // Localization
  'po', 'pot', 'mo',
]);

export class UniversalURLExtractor {
  constructor(logger) {
    this.logger = logger || console;
    this.stats = {
      stringsExtracted: 0,
      basePaths: 0,
      values: 0,
      extensions: 0,
      directUrls: 0,
      expandedUrls: 0,
      totalUrls: 0,
    };
  }

  /**
   * Main extraction - learns patterns from captured resources, extracts from code
   */
  extractAll(resources, origin) {
    // STEP 1: Discover ALL origins used by the app (CDNs, etc.)
    const discoveredOrigins = this.discoverOrigins(resources);
    this.logger.info?.(`Discovered ${discoveredOrigins.size} origins: ${[...discoveredOrigins].join(', ')}`);

    // STEP 2: Learn patterns from ALL captured resources (all origins)
    const learned = this.learnFromCaptured(resources, discoveredOrigins);

    this.logger.info?.(`Learned from captured: ${learned.basePaths.size} base paths, ${learned.extensions.size} extensions`);

    // STEP 3: Extract all strings from JS code
    const extracted = this.extractFromCode(resources);

    this.logger.info?.(`Extracted from code: ${extracted.strings.size} strings`);

    // STEP 4: Classify extracted strings
    const classified = this.classifyStrings(extracted.strings, origin);

    this.logger.info?.(`Classified: ${classified.directUrls.size} direct URLs, ${classified.values.size} potential values`);

    // STEP 5: Merge learned and extracted
    const allBasePaths = new Set([...learned.basePaths, ...classified.basePaths]);
    const allExtensions = new Set([...learned.extensions, ...classified.extensions]);
    const allValues = classified.values;

    this.stats.basePaths = allBasePaths.size;
    this.stats.values = allValues.size;
    this.stats.extensions = allExtensions.size;

    // STEP 6: Generate all URL combinations for ALL discovered origins
    const expandedUrls = this.expandCombinations(allBasePaths, allValues, allExtensions, discoveredOrigins);

    // STEP 7: Combine direct URLs with expanded
    const allUrls = new Set([...classified.directUrls, ...expandedUrls]);

    this.stats.directUrls = classified.directUrls.size;
    this.stats.expandedUrls = expandedUrls.size;
    this.stats.totalUrls = allUrls.size;

    this.logStats();
    return allUrls;
  }

  /**
   * Discover all unique origins in captured resources
   * Filters out ad networks and tracking domains
   */
  discoverOrigins(resources) {
    const allOrigins = new Set();
    for (const [url] of resources) {
      try {
        const urlObj = new URL(url);
        allOrigins.add(urlObj.origin);
      } catch (e) {
        // Skip invalid URLs
      }
    }

    // Filter out ad/tracking origins - keep only ones that might have app resources
    const adDomainPatterns = [
      'doubleclick', 'googlesyndication', 'googleads', 'googletagmanager',
      'pubmatic', 'rubiconproject', 'criteo', 'adsystem', 'adnxs', 'openx',
      'casalemedia', 'tapad', 'demdex', 'bidswitch', 'ad.gt', 'adform',
      '33across', 'sharethrough', 'smartadserver', 'indexww', 'media.net',
      'gumgum', 'agkn', 'taboola', 'amazon-adsystem', 'linkedin.com',
      'confiant', 'doubleverify', 'prebid', '360yield', 'azerion',
      'rtbhouse', 'teads.tv', 'contextweb', 'seedtag', 'jwplayer',
      'safeframe', 'cloudflare', 'ampproject', 'createjs', 'temu.com',
      'yellowblue', 'hadron', 'intentiq', 'adkernel', 'uniconsent',
      'cognitivlabs', 'alcmpn', 'semasio', 'rlcdn', 'liadm', 'lijit',
      'smaato', 'serverbid', 'bttrack', 'targeting.unruly', 'minutemedia',
      'jwpcdn', 'a-mo.net', 'amxrtb', '1rx.io', 'cootlogix', 'bfmio'
    ];

    const appOrigins = new Set();
    for (const origin of allOrigins) {
      const domain = origin.toLowerCase();
      const isAd = adDomainPatterns.some(pattern => domain.includes(pattern));
      if (!isAd) {
        appOrigins.add(origin);
      }
    }

    this.logger.info?.(`Filtered ${allOrigins.size} origins to ${appOrigins.size} app origins`);
    return appOrigins;
  }

  /**
   * Learn URL patterns from already-captured resources (ALL origins)
   */
  learnFromCaptured(resources, discoveredOrigins) {
    const basePaths = new Set();
    const extensions = new Set();
    const filePatterns = new Map(); // extension -> Set of directory paths

    let processed = 0;
    let skippedParseError = 0;

    this.logger.info?.(`Learning from ${resources.size} captured resources across ${discoveredOrigins.size} origins`);

    for (const [url] of resources) {
      try {
        const urlObj = new URL(url);
        processed++;

        const pathname = urlObj.pathname;
        const lastSlash = pathname.lastIndexOf('/');
        const lastDot = pathname.lastIndexOf('.');

        // Extract base path (directory)
        if (lastSlash > 0) {
          const basePath = pathname.substring(0, lastSlash + 1);
          basePaths.add(basePath);

          // Also add parent directories
          const parts = basePath.split('/').filter(p => p);
          for (let i = 1; i <= parts.length; i++) {
            basePaths.add('/' + parts.slice(0, i).join('/') + '/');
          }
        }

        // Extract extension
        if (lastDot > lastSlash && lastDot < pathname.length - 1) {
          const ext = pathname.substring(lastDot + 1).toLowerCase();
          if (ext.length <= 10 && /^[a-z0-9]+$/.test(ext)) {
            extensions.add(ext);

            // Track which directories contain which file types
            if (lastSlash > 0) {
              const dir = pathname.substring(0, lastSlash + 1);
              if (!filePatterns.has(ext)) {
                filePatterns.set(ext, new Set());
              }
              filePatterns.get(ext).add(dir);
            }
          }
        }
      } catch (e) {
        skippedParseError++;
        // Skip invalid URLs
      }
    }

    // Always include root
    basePaths.add('/');

    this.logger.info?.(`  Processed: ${processed}, skipped (parse error): ${skippedParseError}`);
    this.logger.info?.(`  Found ${basePaths.size} base paths, ${extensions.size} extensions`);
    if (basePaths.size > 0 && basePaths.size <= 30) {
      this.logger.info?.(`  Sample base paths: ${[...basePaths].slice(0, 10).join(', ')}`);
    }
    if (extensions.size > 0 && extensions.size <= 30) {
      this.logger.info?.(`  Extensions: ${[...extensions].join(', ')}`);
    }

    return { basePaths, extensions, filePatterns };
  }

  /**
   * Extract all strings from JavaScript code
   */
  extractFromCode(resources) {
    const strings = new Set();

    for (const [url, data] of resources) {
      // Process JS files
      if (!this.isJavaScript(url, data)) continue;

      try {
        const content = data.body.toString('utf-8');
        if (content.length < 50) continue;

        // Extract all string literals
        const extracted = this.extractAllStrings(content);
        extracted.forEach(s => strings.add(s));
      } catch (e) {
        // Skip binary/invalid
      }
    }

    this.stats.stringsExtracted = strings.size;
    return { strings };
  }

  /**
   * Extract ALL string literals from code
   */
  extractAllStrings(code) {
    const strings = new Set();

    // Single-quoted strings
    const singleQuoted = code.match(/'([^'\\]|\\.){1,500}'/g) || [];
    for (const s of singleQuoted) {
      const inner = this.cleanString(s.slice(1, -1));
      if (inner && !this.isGarbage(inner)) {
        strings.add(inner);
      }
    }

    // Double-quoted strings
    const doubleQuoted = code.match(/"([^"\\]|\\.){1,500}"/g) || [];
    for (const s of doubleQuoted) {
      const inner = this.cleanString(s.slice(1, -1));
      if (inner && !this.isGarbage(inner)) {
        strings.add(inner);
      }
    }

    // Template literals (static parts only)
    const templates = code.match(/`([^`\\]|\\.){1,500}`/g) || [];
    for (const s of templates) {
      const inner = s.slice(1, -1);
      const parts = inner.split(/\$\{[^}]*\}/);
      for (const part of parts) {
        const cleaned = this.cleanString(part);
        if (cleaned && !this.isGarbage(cleaned)) {
          strings.add(cleaned);
        }
      }
    }

    return strings;
  }

  /**
   * Classify strings into URLs, base paths, values, extensions
   */
  classifyStrings(strings, origin) {
    const directUrls = new Set();
    const basePaths = new Set();
    const values = new Set();
    const extensions = new Set();

    for (const str of strings) {
      if (!str || str.length > 500) continue;

      // Full URLs
      if (str.match(/^https?:\/\//)) {
        if (this.hasResourceExtension(str)) {
          directUrls.add(str);
        }
        continue;
      }

      // Protocol-relative
      if (str.startsWith('//') && str.length > 3) {
        if (this.hasResourceExtension(str)) {
          directUrls.add('https:' + str);
        }
        continue;
      }

      // Absolute paths with extension
      if (str.startsWith('/') && this.hasResourceExtension(str)) {
        directUrls.add(origin + str);
        // Also learn the base path
        const lastSlash = str.lastIndexOf('/');
        if (lastSlash > 0) {
          basePaths.add(str.substring(0, lastSlash + 1));
        }
        continue;
      }

      // Relative paths with extension
      if (this.hasResourceExtension(str) && !str.includes(' ')) {
        if (str.includes('/')) {
          directUrls.add(origin + '/' + str);
          const lastSlash = str.lastIndexOf('/');
          if (lastSlash > 0) {
            basePaths.add('/' + str.substring(0, lastSlash + 1));
          }
        } else {
          // Just a filename - it's a value
          values.add(str);
        }
        continue;
      }

      // Directory paths (end with /)
      if (str.endsWith('/') && str.length > 1 && !str.includes(' ')) {
        basePaths.add(str.startsWith('/') ? str : '/' + str);
        continue;
      }

      // Path-like strings with slashes
      if (str.includes('/') && !str.includes(' ') && str.length < 100) {
        const lastSlash = str.lastIndexOf('/');
        basePaths.add('/' + str.substring(0, lastSlash + 1));
        // The part after the last slash could be a value
        const filename = str.substring(lastSlash + 1);
        if (filename && this.isValidValue(filename)) {
          values.add(filename);
        }
        continue;
      }

      // Potential values (identifiers, names, hashes)
      if (this.isValidValue(str)) {
        values.add(str);

        // Extract extension if present
        const dotIndex = str.lastIndexOf('.');
        if (dotIndex > 0 && dotIndex < str.length - 1) {
          const ext = str.substring(dotIndex + 1).toLowerCase();
          if (ALL_EXTENSIONS.has(ext)) {
            extensions.add(ext);
            // Also add the name without extension as a value
            values.add(str.substring(0, dotIndex));
          }
        }
      }
    }

    return { directUrls, basePaths, values, extensions };
  }

  /**
   * Generate URL combinations from base paths, values, and extensions
   * SMART: Focus on numbered chunks and direct URLs, limit expansion
   */
  expandCombinations(basePaths, values, extensions, discoveredOrigins) {
    const urls = new Set();

    const origins = [...discoveredOrigins].slice(0, 10);  // Limit to top 10 origins
    const bases = [...basePaths].slice(0, 30);
    const vals = [...values].slice(0, 200);
    const exts = [...extensions];

    // Add common extensions if we didn't learn many
    if (exts.length < 5) {
      ['js', 'css', 'json', 'png', 'jpg', 'svg', 'woff2', 'otf', 'wasm'].forEach(e => {
        if (!exts.includes(e)) exts.push(e);
      });
    }

    this.logger.info?.(`Expanding: ${origins.length} origins × ${bases.length} bases × ${vals.length} values × ${exts.length} extensions`);

    // STRATEGY 1: Numbered chunks - THE MOST IMPORTANT for Webpack/bundled apps
    // This finds 0.js through 999.js and assets/0.js through assets/999.js
    for (const origin of origins) {
      const chunkBases = [
        '/',                    // root: /0.js
        '/assets/',             // webpack common
        '/static/js/',          // create-react-app
        '/chunks/',             // next.js
        '/code/',               // some apps
        '/_next/static/chunks/', // next.js
        '/build/',              // vite
      ];

      for (const base of chunkBases) {
        for (let i = 0; i <= 999; i++) {
          const url = this.buildUrl(origin, base, i + '.js');
          if (url) urls.add(url);
        }
      }
    }

    // STRATEGY 2: Values that already have extensions (high confidence)
    for (const origin of origins) {
      for (const val of vals) {
        if (this.hasResourceExtension(val)) {
          for (const base of bases.slice(0, 10)) {
            const url = this.buildUrl(origin, base, val);
            if (url) urls.add(url);
          }
        }
      }
    }

    // STRATEGY 3: Limited extension combinations for clean-looking values
    const cleanValues = vals.filter(v =>
      !this.hasResourceExtension(v) &&
      v.length >= 2 && v.length <= 50 &&
      v.match(/^[a-zA-Z][a-zA-Z0-9_-]*$/)  // Starts with letter, alphanumeric
    ).slice(0, 100);

    for (const origin of origins.slice(0, 3)) {  // Only top 3 origins
      for (const base of bases.slice(0, 10)) {
        for (const val of cleanValues) {
          for (const ext of ['js', 'css', 'json', 'wasm']) {  // Only most common
            const url = this.buildUrl(origin, base, val + '.' + ext);
            if (url) urls.add(url);
          }
        }
      }
    }

    // STRATEGY 4: Hash-like values (webpack chunk hashes)
    const hashValues = vals.filter(v => v.match(/^[a-f0-9]{6,32}$/i)).slice(0, 50);
    for (const origin of origins.slice(0, 3)) {
      for (const base of bases.slice(0, 5)) {
        for (const hash of hashValues) {
          const jsUrl = this.buildUrl(origin, base, hash + '.js');
          const cssUrl = this.buildUrl(origin, base, hash + '.css');
          if (jsUrl) urls.add(jsUrl);
          if (cssUrl) urls.add(cssUrl);
        }
      }
    }

    return urls;
  }

  /**
   * Build a URL from parts
   */
  buildUrl(origin, base, file) {
    if (!file) return null;

    // Sanity check - file shouldn't look like a domain
    if (file.match(/^[a-z]+\.[a-z]+\.[a-z]+/i)) return null;  // e.g., "ads.yieldmo.com"
    if (file.includes('.com') || file.includes('.net') || file.includes('.org')) return null;

    let path = base;
    if (!path.startsWith('/')) path = '/' + path;
    if (!path.endsWith('/')) path += '/';
    path += file;

    // Clean up double slashes
    path = path.replace(/\/+/g, '/');

    try {
      return new URL(path, origin).href;
    } catch (e) {
      return null;
    }
  }

  /**
   * Check if string has a resource file extension
   */
  hasResourceExtension(str) {
    const match = str.match(/\.([a-zA-Z0-9]{1,10})$/);
    if (!match) return false;
    return ALL_EXTENSIONS.has(match[1].toLowerCase());
  }

  /**
   * Check if string could be a valid URL value/identifier
   */
  isValidValue(str) {
    if (!str || str.length < 1 || str.length > 200) return false;
    if (str.includes(' ') || str.includes('\n')) return false;

    // Must have some alphanumeric content
    if (!str.match(/[a-zA-Z0-9]/)) return false;

    // Allow: alphanumeric, hyphens, underscores, dots, some special chars
    if (!str.match(/^[a-zA-Z0-9_\-./+@]+$/)) return false;

    // Filter out things that are clearly not filenames/identifiers
    if (str.startsWith('.') || str.startsWith('-') || str.startsWith('+')) return false;
    if (str.includes('..') || str.includes('//')) return false;
    if (str.includes('://')) return false;

    // Must start with alphanumeric
    if (!str.match(/^[a-zA-Z0-9]/)) return false;

    return true;
  }

  /**
   * Check if string is garbage (code, HTML, etc.)
   */
  isGarbage(str) {
    if (!str) return true;

    // HTML/XML
    if (str.includes('<') || str.includes('>')) return true;

    // CSS rules
    if (str.includes('{') && str.includes(':') && str.includes('}')) return true;

    // CSS url() fragments - these aren't standalone strings
    if (str.startsWith('url(') || str.includes('url(http')) return true;

    // JS code patterns
    if (str.includes('function') && str.includes('(')) return true;
    if (str.includes('return ') || str.includes('var ') || str.includes('const ')) return true;
    if (str.includes('=>')) return true;

    // Encoded junk
    if (str.includes('%22%3E') || str.includes('\\x')) return true;

    // Regex patterns
    if (str.includes(')?\\') || str.includes(']+') || str.includes('(?:')) return true;

    // URL scheme fragments (partial URLs)
    if (str.startsWith('://') || str.startsWith('http:/') && !str.startsWith('http://')) return true;
    if (str.startsWith('https:/') && !str.startsWith('https://')) return true;

    // Template placeholders
    if (str.includes('+r+') || str.includes('+t+') || str.includes('+n+')) return true;

    // Very long strings without structure
    if (str.length > 100 && !str.includes('/') && !str.includes('.')) return true;

    // Alphabet/character test strings
    if (str.match(/abcdef.*xyz/i)) return true;
    if (str.match(/^[a-zA-Z0-9]{60,}$/)) return true;

    return false;
  }

  /**
   * Clean/unescape a string
   */
  cleanString(str) {
    if (!str) return null;
    try {
      return str
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\')
        .trim();
    } catch (e) {
      return str;
    }
  }

  /**
   * Check if content is JavaScript
   */
  isJavaScript(url, data) {
    if (url.endsWith('.js') || url.endsWith('.mjs')) return true;
    if (data.contentType?.includes('javascript')) return true;
    return false;
  }

  /**
   * Log extraction statistics
   */
  logStats() {
    this.logger.info?.(`═══════════════════════════════════════════`);
    this.logger.info?.(`  Universal URL Extractor`);
    this.logger.info?.(`═══════════════════════════════════════════`);
    this.logger.info?.(`  Strings extracted:    ${this.stats.stringsExtracted.toLocaleString()}`);
    this.logger.info?.(`  Base paths learned:   ${this.stats.basePaths.toLocaleString()}`);
    this.logger.info?.(`  Values found:         ${this.stats.values.toLocaleString()}`);
    this.logger.info?.(`  Extensions:           ${this.stats.extensions.toLocaleString()}`);
    this.logger.info?.(`  ─────────────────────────────────────────`);
    this.logger.info?.(`  Direct URLs:          ${this.stats.directUrls.toLocaleString()}`);
    this.logger.info?.(`  Expanded URLs:        ${this.stats.expandedUrls.toLocaleString()}`);
    this.logger.info?.(`  ─────────────────────────────────────────`);
    this.logger.info?.(`  TOTAL URLs:           ${this.stats.totalUrls.toLocaleString()}`);
    this.logger.info?.(`═══════════════════════════════════════════`);
  }
}

export default UniversalURLExtractor;
