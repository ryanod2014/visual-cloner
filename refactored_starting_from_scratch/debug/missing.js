/**
 * Missing Resources Finder
 *
 * Compares resources between online and offline modes to find
 * what's missing and suggest causes and fixes.
 *
 * Usage:
 *   const analysis = findMissing(onlineResources, offlineResources);
 *   console.log(analysis.missing);
 *   console.log(analysis.suggestions);
 */

/**
 * Resource type categories
 */
const RESOURCE_TYPES = {
  js: {
    extensions: ['.js', '.mjs', '.cjs'],
    contentTypes: ['javascript', 'ecmascript'],
    label: 'JavaScript',
  },
  css: {
    extensions: ['.css'],
    contentTypes: ['text/css'],
    label: 'Stylesheets',
  },
  image: {
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.avif'],
    contentTypes: ['image/'],
    label: 'Images',
  },
  font: {
    extensions: ['.woff', '.woff2', '.ttf', '.otf', '.eot'],
    contentTypes: ['font/', 'application/font'],
    label: 'Fonts',
  },
  wasm: {
    extensions: ['.wasm'],
    contentTypes: ['application/wasm'],
    label: 'WebAssembly',
  },
  json: {
    extensions: ['.json'],
    contentTypes: ['application/json'],
    label: 'JSON Data',
  },
  html: {
    extensions: ['.html', '.htm'],
    contentTypes: ['text/html'],
    label: 'HTML',
  },
  media: {
    extensions: ['.mp3', '.mp4', '.webm', '.ogg', '.wav'],
    contentTypes: ['audio/', 'video/'],
    label: 'Media',
  },
  other: {
    extensions: [],
    contentTypes: [],
    label: 'Other',
  },
};

/**
 * Common causes for missing resources
 */
const FAILURE_CAUSES = {
  cors: {
    label: 'CORS Restriction',
    description: 'Resource blocked due to Cross-Origin Resource Sharing policy',
    symptoms: ['Access-Control-Allow-Origin', 'cross-origin', 'CORS'],
    suggestions: [
      'Use a CORS proxy during extraction',
      'Fetch resources server-side with Node.js fetch',
      'Configure server to allow cross-origin requests',
    ],
  },
  auth: {
    label: 'Authentication Required',
    description: 'Resource requires authentication to access',
    symptoms: ['401', '403', 'unauthorized', 'forbidden', 'token', 'auth', 'login'],
    suggestions: [
      'Include authentication cookies during extraction',
      'Pass API tokens in request headers',
      'Extract from an authenticated session',
    ],
  },
  dynamic: {
    label: 'Dynamic URL',
    description: 'URL contains dynamic parts (timestamps, hashes) that change',
    symptoms: ['timestamp', 'hash', 'token', 'v=', 't=', 'cache', 'nonce'],
    suggestions: [
      'Use URL pattern matching instead of exact URLs',
      'Extract URL patterns and regenerate at serve time',
      'Intercept and mock dynamic API responses',
    ],
  },
  cdn: {
    label: 'CDN/External Dependency',
    description: 'Resource hosted on external CDN that may not be accessible offline',
    symptoms: ['cdn', 'cloudflare', 'cloudfront', 'akamai', 'fastly', 'unpkg', 'jsdelivr'],
    suggestions: [
      'Download and bundle CDN resources locally',
      'Use a CDN mirror or cache',
      'Rewrite URLs to point to local copies',
    ],
  },
  service_worker: {
    label: 'Service Worker Controlled',
    description: 'Resource fetched via service worker which may not be captured',
    symptoms: ['sw.js', 'service-worker', 'workbox', 'precache'],
    suggestions: [
      'Disable service worker during extraction',
      'Extract service worker cache manifest',
      'Intercept at network level before service worker',
    ],
  },
  lazy: {
    label: 'Lazy/On-Demand Loading',
    description: 'Resource loaded dynamically on user interaction',
    symptoms: ['lazy', 'chunk', 'split', 'dynamic', 'import('],
    suggestions: [
      'Trigger all lazy loading paths during extraction',
      'Analyze webpack/vite chunk manifests',
      'Simulate user interactions to load all chunks',
    ],
  },
  api: {
    label: 'API Response',
    description: 'Resource is an API response that varies or requires specific state',
    symptoms: ['/api/', '/graphql', 'query', 'mutation', '.json?'],
    suggestions: [
      'Mock API responses with static data',
      'Capture API responses during extraction',
      'Use a request interceptor to serve cached responses',
    ],
  },
  websocket: {
    label: 'WebSocket Data',
    description: 'Data transferred via WebSocket cannot be captured as static resource',
    symptoms: ['ws://', 'wss://', 'socket', 'websocket'],
    suggestions: [
      'Record WebSocket messages and replay them',
      'Mock WebSocket connection in offline mode',
      'Convert WebSocket data to static API responses',
    ],
  },
};

/**
 * Classify a URL into a resource type
 * @param {string} url - Resource URL
 * @param {string} contentType - Content-Type header
 * @returns {string} Resource type key
 */
export function classifyResource(url, contentType = '') {
  const urlLower = url.toLowerCase();
  const ctLower = contentType.toLowerCase();

  for (const [type, config] of Object.entries(RESOURCE_TYPES)) {
    if (type === 'other') continue;

    // Check extensions
    for (const ext of config.extensions) {
      if (urlLower.includes(ext)) return type;
    }

    // Check content types
    for (const ct of config.contentTypes) {
      if (ctLower.includes(ct)) return type;
    }
  }

  return 'other';
}

/**
 * Analyze a URL to suggest why it might be missing
 * @param {string} url - Resource URL
 * @param {Object} resourceData - Resource metadata if available
 * @returns {Object[]} Array of possible causes
 */
export function analyzeCause(url, resourceData = {}) {
  const causes = [];
  const urlLower = url.toLowerCase();

  for (const [causeKey, cause] of Object.entries(FAILURE_CAUSES)) {
    let matchScore = 0;

    // Check URL against symptoms
    for (const symptom of cause.symptoms) {
      if (urlLower.includes(symptom.toLowerCase())) {
        matchScore++;
      }
    }

    // Check error message if available
    if (resourceData.error) {
      const errorLower = resourceData.error.toLowerCase();
      for (const symptom of cause.symptoms) {
        if (errorLower.includes(symptom.toLowerCase())) {
          matchScore += 2; // Higher weight for error match
        }
      }
    }

    if (matchScore > 0) {
      causes.push({
        cause: causeKey,
        label: cause.label,
        description: cause.description,
        confidence: Math.min(matchScore / cause.symptoms.length, 1),
        suggestions: cause.suggestions,
      });
    }
  }

  // Sort by confidence
  causes.sort((a, b) => b.confidence - a.confidence);

  // If no specific cause found, add generic suggestion
  if (causes.length === 0) {
    causes.push({
      cause: 'unknown',
      label: 'Unknown Cause',
      description: 'Unable to determine why this resource is missing',
      confidence: 0,
      suggestions: [
        'Check if resource URL is correct',
        'Verify resource exists on server',
        'Check browser console for errors when loading resource',
        'Ensure resource is included in extraction triggers',
      ],
    });
  }

  return causes;
}

/**
 * Find missing resources between online and offline captures
 * @param {Map|Object} onlineResources - Resources captured online
 * @param {Map|Object} offlineResources - Resources loaded offline
 * @param {Object} options - Comparison options
 * @returns {Object} Analysis results
 */
export function findMissing(onlineResources, offlineResources, options = {}) {
  // Convert to Maps if needed
  const online = onlineResources instanceof Map
    ? onlineResources
    : new Map(Object.entries(onlineResources));

  const offline = offlineResources instanceof Map
    ? offlineResources
    : new Map(Object.entries(offlineResources));

  // Find missing (in online but not in offline)
  const missing = [];
  const byType = {};
  const byCause = {};

  for (const [url, data] of online) {
    // Skip if found offline
    if (offline.has(url)) continue;

    // Classify resource type
    const type = classifyResource(url, data?.contentType);

    // Analyze possible cause
    const causes = analyzeCause(url, data);
    const primaryCause = causes[0]?.cause || 'unknown';

    const entry = {
      url,
      type,
      typeLabel: RESOURCE_TYPES[type]?.label || 'Unknown',
      contentType: data?.contentType || null,
      size: data?.size || 0,
      causes,
      primaryCause,
    };

    missing.push(entry);

    // Group by type
    if (!byType[type]) {
      byType[type] = [];
    }
    byType[type].push(entry);

    // Group by cause
    if (!byCause[primaryCause]) {
      byCause[primaryCause] = [];
    }
    byCause[primaryCause].push(entry);
  }

  // Find extra (in offline but not in online) - usually not a problem
  const extra = [];
  for (const [url, data] of offline) {
    if (!online.has(url)) {
      extra.push({
        url,
        type: classifyResource(url, data?.contentType),
        contentType: data?.contentType || null,
      });
    }
  }

  // Generate overall suggestions
  const suggestions = generateSuggestions(missing, byType, byCause);

  return {
    summary: {
      onlineCount: online.size,
      offlineCount: offline.size,
      missingCount: missing.length,
      extraCount: extra.length,
      matchRate: online.size > 0
        ? ((online.size - missing.length) / online.size * 100).toFixed(1) + '%'
        : '100%',
    },
    missing,
    extra,
    byType,
    byCause,
    suggestions,
  };
}

/**
 * Generate actionable suggestions based on analysis
 * @private
 */
function generateSuggestions(missing, byType, byCause) {
  const suggestions = [];

  // Most common cause
  const causeCounts = Object.entries(byCause)
    .map(([cause, items]) => ({ cause, count: items.length }))
    .sort((a, b) => b.count - a.count);

  if (causeCounts.length > 0) {
    const topCause = causeCounts[0];
    const causeInfo = FAILURE_CAUSES[topCause.cause];

    if (causeInfo && topCause.count > 1) {
      suggestions.push({
        priority: 'high',
        title: `Address ${causeInfo.label} issues (${topCause.count} resources)`,
        description: causeInfo.description,
        actions: causeInfo.suggestions,
      });
    }
  }

  // Type-specific suggestions
  if (byType.js && byType.js.length > 0) {
    suggestions.push({
      priority: 'high',
      title: `Missing JavaScript files (${byType.js.length})`,
      description: 'JavaScript files are critical for app functionality',
      actions: [
        'Check webpack/vite chunk loading configuration',
        'Ensure all dynamic imports are triggered during extraction',
        'Verify no JS files require authentication',
      ],
    });
  }

  if (byType.css && byType.css.length > 0) {
    suggestions.push({
      priority: 'medium',
      title: `Missing Stylesheets (${byType.css.length})`,
      description: 'Missing CSS will cause visual differences',
      actions: [
        'Check for @import rules in captured CSS',
        'Verify CSS URLs are properly resolved',
        'Check for CSS loaded via JavaScript',
      ],
    });
  }

  if (byType.font && byType.font.length > 0) {
    suggestions.push({
      priority: 'medium',
      title: `Missing Fonts (${byType.font.length})`,
      description: 'Missing fonts will cause text rendering differences',
      actions: [
        'Download font files from CDN if used',
        'Check for CORS restrictions on font files',
        'Ensure @font-face URLs are properly resolved',
      ],
    });
  }

  if (byType.wasm && byType.wasm.length > 0) {
    suggestions.push({
      priority: 'high',
      title: `Missing WebAssembly (${byType.wasm.length})`,
      description: 'WASM files are often critical for app functionality',
      actions: [
        'Ensure WASM files are fetched with proper Content-Type',
        'Check for CORS restrictions on WASM files',
        'Verify WASM instantiation is triggered during extraction',
      ],
    });
  }

  // If many missing, suggest broader approach
  if (missing.length > 50) {
    suggestions.push({
      priority: 'high',
      title: 'Large number of missing resources',
      description: 'Consider a more comprehensive extraction approach',
      actions: [
        'Enable deeper trigger exploration',
        'Increase wait times between actions',
        'Use CDP-level network interception',
        'Consider extracting from browser cache',
      ],
    });
  }

  return suggestions;
}

/**
 * Compare two resource sets and return detailed diff
 * @param {Map} set1 - First resource set
 * @param {Map} set2 - Second resource set
 * @returns {Object} Diff results
 */
export function diffResources(set1, set2) {
  const onlyIn1 = [];
  const onlyIn2 = [];
  const inBoth = [];
  const different = [];

  for (const [url, data1] of set1) {
    if (set2.has(url)) {
      const data2 = set2.get(url);
      inBoth.push(url);

      // Check if content differs
      if (data1.size !== data2.size) {
        different.push({
          url,
          size1: data1.size,
          size2: data2.size,
          diff: data2.size - data1.size,
        });
      }
    } else {
      onlyIn1.push(url);
    }
  }

  for (const url of set2.keys()) {
    if (!set1.has(url)) {
      onlyIn2.push(url);
    }
  }

  return {
    onlyIn1,
    onlyIn2,
    inBoth,
    different,
    stats: {
      set1Count: set1.size,
      set2Count: set2.size,
      commonCount: inBoth.length,
      onlyIn1Count: onlyIn1.length,
      onlyIn2Count: onlyIn2.length,
      differentCount: different.length,
    },
  };
}

/**
 * Print missing resources analysis to console
 * @param {Object} analysis - Analysis from findMissing()
 */
export function printMissingAnalysis(analysis) {
  console.log('\n' + '='.repeat(60));
  console.log('  MISSING RESOURCES ANALYSIS');
  console.log('='.repeat(60));

  console.log('\n  Summary:');
  console.log(`    Online resources:   ${analysis.summary.onlineCount}`);
  console.log(`    Offline resources:  ${analysis.summary.offlineCount}`);
  console.log(`    Missing:            ${analysis.summary.missingCount}`);
  console.log(`    Match rate:         ${analysis.summary.matchRate}`);

  if (analysis.missing.length > 0) {
    console.log('\n  By Type:');
    for (const [type, items] of Object.entries(analysis.byType)) {
      const label = RESOURCE_TYPES[type]?.label || type;
      console.log(`    ${label.padEnd(15)} ${items.length}`);
    }

    console.log('\n  By Cause:');
    for (const [cause, items] of Object.entries(analysis.byCause)) {
      const label = FAILURE_CAUSES[cause]?.label || cause;
      console.log(`    ${label.padEnd(25)} ${items.length}`);
    }

    if (analysis.suggestions.length > 0) {
      console.log('\n  Suggestions:');
      for (const suggestion of analysis.suggestions) {
        const priority = suggestion.priority === 'high' ? '\x1b[31m[HIGH]\x1b[0m' :
          suggestion.priority === 'medium' ? '\x1b[33m[MED]\x1b[0m' : '[LOW]';
        console.log(`\n    ${priority} ${suggestion.title}`);
        console.log(`    ${suggestion.description}`);
        console.log('    Actions:');
        for (const action of suggestion.actions.slice(0, 3)) {
          console.log(`      - ${action}`);
        }
      }
    }

    console.log('\n  First 10 Missing URLs:');
    for (const item of analysis.missing.slice(0, 10)) {
      console.log(`    [${item.typeLabel}] ${item.url.slice(0, 70)}...`);
    }
    if (analysis.missing.length > 10) {
      console.log(`    ... and ${analysis.missing.length - 10} more`);
    }
  } else {
    console.log('\n  No missing resources found!');
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

export default {
  findMissing,
  diffResources,
  classifyResource,
  analyzeCause,
  printMissingAnalysis,
  RESOURCE_TYPES,
  FAILURE_CAUSES,
};
