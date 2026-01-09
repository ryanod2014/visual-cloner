#!/usr/bin/env node
/**
 * V6 BOUNDARY MAPPER
 *
 * Maps EVERY point where frontend touches backend:
 * 1. All API endpoints called (REST, GraphQL)
 * 2. WebSocket connections
 * 3. Server-sent events
 * 4. Form submissions
 * 5. External service calls (analytics, CDN, auth)
 * 6. Dynamic resource loads
 *
 * Output: A complete map of what CAN'T work offline
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Categorized request tracking
const boundaries = {
  // Static resources (can be cached)
  static: {
    js: [],
    css: [],
    images: [],
    fonts: [],
    wasm: [],
    other: []
  },

  // API calls (need backend)
  api: {
    rest: [],      // REST endpoints
    graphql: [],   // GraphQL queries
    rpc: [],       // JSON-RPC calls
  },

  // Real-time (can't be cached)
  realtime: {
    websocket: [],  // WebSocket connections
    sse: [],        // Server-sent events
    polling: [],    // Long-polling requests
  },

  // External services (third-party)
  external: {
    analytics: [],  // Google Analytics, Mixpanel, etc.
    auth: [],       // OAuth, Auth0, etc.
    cdn: [],        // CDN resources
    payment: [],    // Stripe, PayPal, etc.
    storage: [],    // S3, Firebase, etc.
    other: []
  },

  // Form submissions
  forms: [],

  // Unknown/uncategorized
  unknown: []
};

// Pattern matchers
const patterns = {
  analytics: [
    /google-analytics/i, /analytics/i, /gtag/i, /ga\.js/i,
    /mixpanel/i, /segment/i, /amplitude/i, /hotjar/i,
    /fullstory/i, /heap/i, /pendo/i, /intercom/i
  ],
  auth: [
    /auth0/i, /oauth/i, /login/i, /signin/i, /signup/i,
    /cognito/i, /firebase.*auth/i, /clerk/i, /supabase.*auth/i
  ],
  payment: [
    /stripe/i, /paypal/i, /braintree/i, /square/i, /checkout/i
  ],
  storage: [
    /s3\.amazonaws/i, /cloudinary/i, /firebase.*storage/i,
    /supabase.*storage/i, /uploadthing/i
  ],
  cdn: [
    /cloudflare/i, /fastly/i, /akamai/i, /cloudfront/i,
    /jsdelivr/i, /unpkg/i, /cdnjs/i, /esm\.sh/i
  ],
  graphql: [
    /graphql/i, /\/gql/i
  ],
  api: [
    /\/api\//i, /\/v[0-9]+\//i, /\/rest\//i, /\.json$/i
  ]
};

function categorizeUrl(url, method, contentType, requestBody) {
  const urlLower = url.toLowerCase();
  const urlObj = new URL(url);

  // Check for GraphQL
  if (patterns.graphql.some(p => p.test(url)) ||
      (requestBody && requestBody.includes('"query"'))) {
    return { category: 'api', subcategory: 'graphql' };
  }

  // Check external services
  for (const [service, servicePatterns] of Object.entries(patterns)) {
    if (service === 'graphql' || service === 'api') continue;
    if (servicePatterns.some(p => p.test(url))) {
      return { category: 'external', subcategory: service };
    }
  }

  // Check content type for static resources
  if (contentType) {
    if (contentType.includes('javascript')) return { category: 'static', subcategory: 'js' };
    if (contentType.includes('css')) return { category: 'static', subcategory: 'css' };
    if (contentType.includes('image')) return { category: 'static', subcategory: 'images' };
    if (contentType.includes('font')) return { category: 'static', subcategory: 'fonts' };
    if (contentType.includes('wasm')) return { category: 'static', subcategory: 'wasm' };
    if (contentType.includes('html') && method === 'GET') return { category: 'static', subcategory: 'other' };
  }

  // Check file extension
  const ext = path.extname(urlObj.pathname).toLowerCase();
  if (['.js', '.mjs'].includes(ext)) return { category: 'static', subcategory: 'js' };
  if (['.css'].includes(ext)) return { category: 'static', subcategory: 'css' };
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'].includes(ext)) return { category: 'static', subcategory: 'images' };
  if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) return { category: 'static', subcategory: 'fonts' };
  if (['.wasm'].includes(ext)) return { category: 'static', subcategory: 'wasm' };

  // API patterns
  if (patterns.api.some(p => p.test(url))) {
    return { category: 'api', subcategory: 'rest' };
  }

  // POST/PUT/DELETE are usually API calls
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    return { category: 'api', subcategory: 'rest' };
  }

  // JSON response is usually API
  if (contentType && contentType.includes('json')) {
    return { category: 'api', subcategory: 'rest' };
  }

  return { category: 'unknown', subcategory: null };
}

async function main() {
  const url = process.argv[2] || 'https://www.photopea.com';
  const baseUrl = new URL(url);
  const origin = baseUrl.origin;

  const domain = baseUrl.hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = path.join(__dirname, '..', 'output', `${domain}-boundary-map-${timestamp}`);

  await fs.mkdir(outputDir, { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 BOUNDARY MAPPER');
  console.log('='.repeat(60));
  console.log('URL:', url);
  console.log('Output:', outputDir);
  console.log('');
  console.log('Mapping all frontend-backend boundaries...');
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Inject interceptors
  await page.addInitScript(() => {
    // Track WebSocket
    const OrigWS = window.WebSocket;
    window.__websockets = [];
    window.WebSocket = function(url, protocols) {
      window.__websockets.push({
        url,
        protocols,
        time: new Date().toISOString(),
        type: 'websocket'
      });
      console.log('[BOUNDARY] WebSocket:', url);
      return new OrigWS(url, protocols);
    };
    window.WebSocket.prototype = OrigWS.prototype;

    // Track EventSource (SSE)
    const OrigES = window.EventSource;
    window.__eventsources = [];
    if (OrigES) {
      window.EventSource = function(url, config) {
        window.__eventsources.push({
          url,
          config,
          time: new Date().toISOString(),
          type: 'sse'
        });
        console.log('[BOUNDARY] SSE:', url);
        return new OrigES(url, config);
      };
      window.EventSource.prototype = OrigES.prototype;
    }

    // Track form submissions
    window.__formSubmissions = [];
    document.addEventListener('submit', (e) => {
      const form = e.target;
      window.__formSubmissions.push({
        action: form.action,
        method: form.method,
        time: new Date().toISOString(),
        type: 'form'
      });
      console.log('[BOUNDARY] Form:', form.action);
    }, true);

    // Track fetch
    const origFetch = window.fetch;
    window.__fetchCalls = [];
    window.fetch = async function(input, init) {
      const url = typeof input === 'string' ? input : input.url;
      const method = init?.method || 'GET';
      window.__fetchCalls.push({
        url,
        method,
        time: new Date().toISOString(),
        hasBody: !!init?.body
      });
      return origFetch.apply(this, arguments);
    };

    // Track XHR
    const OrigXHR = window.XMLHttpRequest;
    window.__xhrCalls = [];
    window.XMLHttpRequest = function() {
      const xhr = new OrigXHR();
      const origOpen = xhr.open;
      const origSend = xhr.send;
      let xhrInfo = {};

      xhr.open = function(method, url) {
        xhrInfo = { method, url, time: new Date().toISOString() };
        return origOpen.apply(this, arguments);
      };

      xhr.send = function(body) {
        xhrInfo.hasBody = !!body;
        window.__xhrCalls.push(xhrInfo);
        return origSend.apply(this, arguments);
      };

      return xhr;
    };
  });

  // Track all network requests
  const allRequests = [];

  page.on('request', request => {
    allRequests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      postData: request.postData()?.substring(0, 500),
      headers: request.headers()
    });
  });

  page.on('response', async response => {
    const request = response.request();
    const url = request.url();

    if (url.startsWith('data:') || url.startsWith('blob:')) return;

    const contentType = response.headers()['content-type'] || '';
    const method = request.method();
    const postData = request.postData();

    const { category, subcategory } = categorizeUrl(url, method, contentType, postData);

    const entry = {
      url,
      method,
      status: response.status(),
      contentType: contentType.split(';')[0],
      size: parseInt(response.headers()['content-length'] || '0'),
      time: new Date().toISOString(),
      isExternal: !url.startsWith(origin)
    };

    if (subcategory) {
      boundaries[category][subcategory].push(entry);
    } else if (category === 'unknown') {
      boundaries.unknown.push(entry);
    }
  });

  try {
    console.log('[1/4] Initial page load...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    console.log('[2/4] Launching app (if needed)...');
    // Click launch/start buttons
    const launchBtns = await page.$$('text=/start|launch|open|enter/i');
    for (const btn of launchBtns.slice(0, 2)) {
      try {
        await btn.click();
        await page.waitForTimeout(5000);
      } catch (e) {}
    }

    console.log('[3/4] User interaction phase...');
    console.log('\n' + '='.repeat(50));
    console.log('INTERACT WITH THE APP');
    console.log('='.repeat(50));
    console.log('\nUse ALL features to discover backend boundaries:');
    console.log('  • Open/import files');
    console.log('  • Save/export files');
    console.log('  • User account features');
    console.log('  • Collaboration features');
    console.log('  • Cloud storage');
    console.log('  • Any feature that might hit a server');
    console.log('\nWatch the console for [BOUNDARY] messages.');
    console.log('\nPress ENTER when done exploring...\n');

    await new Promise(resolve => rl.once('line', resolve));

    console.log('[4/4] Collecting boundary data...');

    // Get injected data
    const injectedData = await page.evaluate(() => ({
      websockets: window.__websockets || [],
      eventsources: window.__eventsources || [],
      formSubmissions: window.__formSubmissions || [],
      fetchCalls: window.__fetchCalls || [],
      xhrCalls: window.__xhrCalls || []
    }));

    // Add to boundaries
    boundaries.realtime.websocket = injectedData.websockets;
    boundaries.realtime.sse = injectedData.eventsources;
    boundaries.forms = injectedData.formSubmissions;

    // Generate report
    console.log('\n' + '='.repeat(60));
    console.log('BOUNDARY MAP REPORT');
    console.log('='.repeat(60));

    // Count totals
    const staticCount = Object.values(boundaries.static).flat().length;
    const apiCount = Object.values(boundaries.api).flat().length;
    const realtimeCount = Object.values(boundaries.realtime).flat().length;
    const externalCount = Object.values(boundaries.external).flat().length;

    console.log('\n📊 SUMMARY');
    console.log('─'.repeat(40));
    console.log(`✅ STATIC (cacheable):     ${staticCount} resources`);
    console.log(`⚠️  API (needs backend):    ${apiCount} endpoints`);
    console.log(`🔴 REALTIME (can't cache): ${realtimeCount} connections`);
    console.log(`🌐 EXTERNAL (third-party): ${externalCount} services`);
    console.log(`❓ UNKNOWN:                ${boundaries.unknown.length} requests`);

    console.log('\n\n📡 API ENDPOINTS (need backend)');
    console.log('─'.repeat(40));

    if (boundaries.api.rest.length > 0) {
      console.log('\nREST APIs:');
      const uniqueRest = [...new Set(boundaries.api.rest.map(r => `${r.method} ${new URL(r.url).pathname}`))];
      uniqueRest.forEach(r => console.log(`  • ${r}`));
    }

    if (boundaries.api.graphql.length > 0) {
      console.log('\nGraphQL Endpoints:');
      const uniqueGql = [...new Set(boundaries.api.graphql.map(r => new URL(r.url).pathname))];
      uniqueGql.forEach(r => console.log(`  • ${r}`));
    }

    console.log('\n\n🔴 REALTIME CONNECTIONS (cannot work offline)');
    console.log('─'.repeat(40));

    if (boundaries.realtime.websocket.length > 0) {
      console.log('\nWebSockets:');
      boundaries.realtime.websocket.forEach(ws => console.log(`  • ${ws.url}`));
    } else {
      console.log('\n  No WebSocket connections detected');
    }

    if (boundaries.realtime.sse.length > 0) {
      console.log('\nServer-Sent Events:');
      boundaries.realtime.sse.forEach(sse => console.log(`  • ${sse.url}`));
    }

    console.log('\n\n🌐 EXTERNAL SERVICES');
    console.log('─'.repeat(40));

    for (const [service, items] of Object.entries(boundaries.external)) {
      if (items.length > 0) {
        console.log(`\n${service.toUpperCase()}:`);
        const uniqueUrls = [...new Set(items.map(i => new URL(i.url).hostname))];
        uniqueUrls.forEach(h => console.log(`  • ${h}`));
      }
    }

    console.log('\n\n📝 FORM SUBMISSIONS');
    console.log('─'.repeat(40));
    if (boundaries.forms.length > 0) {
      boundaries.forms.forEach(f => console.log(`  • ${f.method} ${f.action}`));
    } else {
      console.log('  No form submissions detected');
    }

    // Create detailed JSON report
    const report = {
      summary: {
        url,
        scannedAt: new Date().toISOString(),
        totals: {
          static: staticCount,
          api: apiCount,
          realtime: realtimeCount,
          external: externalCount,
          unknown: boundaries.unknown.length
        }
      },

      canWorkOffline: {
        description: 'These features should work offline',
        resources: boundaries.static
      },

      needsBackend: {
        description: 'These features require backend and will NOT work offline',
        endpoints: boundaries.api,
        forms: boundaries.forms
      },

      cannotCache: {
        description: 'Real-time features that cannot be cached',
        connections: boundaries.realtime
      },

      thirdParty: {
        description: 'External services - may or may not work',
        services: boundaries.external
      },

      unknown: {
        description: 'Requests that could not be categorized',
        requests: boundaries.unknown
      },

      allRequests: allRequests
    };

    await fs.writeFile(
      path.join(outputDir, 'boundary-report.json'),
      JSON.stringify(report, null, 2)
    );

    // Create markdown report
    let markdown = `# Boundary Map Report

## ${url}
Scanned: ${new Date().toISOString()}

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Static Resources | ${staticCount} | ✅ Can cache |
| API Endpoints | ${apiCount} | ⚠️ Needs backend |
| Real-time | ${realtimeCount} | 🔴 Cannot cache |
| External Services | ${externalCount} | 🌐 Third-party |
| Unknown | ${boundaries.unknown.length} | ❓ Review needed |

## What Will Work Offline

These static resources can be cached and will work without a server:

- **JavaScript**: ${boundaries.static.js.length} files
- **CSS**: ${boundaries.static.css.length} files
- **Images**: ${boundaries.static.images.length} files
- **Fonts**: ${boundaries.static.fonts.length} files
- **WASM**: ${boundaries.static.wasm.length} files

## What Needs Backend

### REST API Endpoints
${boundaries.api.rest.length > 0 ?
  [...new Set(boundaries.api.rest.map(r => `- \`${r.method} ${new URL(r.url).pathname}\``))].join('\n') :
  '- None detected'}

### GraphQL Endpoints
${boundaries.api.graphql.length > 0 ?
  [...new Set(boundaries.api.graphql.map(r => `- \`${new URL(r.url).pathname}\``))].join('\n') :
  '- None detected'}

## Real-time (Cannot Work Offline)

### WebSocket Connections
${boundaries.realtime.websocket.length > 0 ?
  boundaries.realtime.websocket.map(ws => `- \`${ws.url}\``).join('\n') :
  '- None detected'}

### Server-Sent Events
${boundaries.realtime.sse.length > 0 ?
  boundaries.realtime.sse.map(sse => `- \`${sse.url}\``).join('\n') :
  '- None detected'}

## External Services

${Object.entries(boundaries.external)
  .filter(([_, items]) => items.length > 0)
  .map(([service, items]) => {
    const hosts = [...new Set(items.map(i => new URL(i.url).hostname))];
    return `### ${service.charAt(0).toUpperCase() + service.slice(1)}\n${hosts.map(h => `- ${h}`).join('\n')}`;
  }).join('\n\n') || '- No external services detected'}

## Recommendations

1. **For full offline support**: Mock the API endpoints listed above
2. **For real-time features**: These cannot work offline - consider graceful degradation
3. **For external services**: Analytics can be disabled, auth needs special handling
`;

    await fs.writeFile(path.join(outputDir, 'BOUNDARY-REPORT.md'), markdown);

    console.log('\n\n' + '='.repeat(60));
    console.log('REPORT SAVED');
    console.log('='.repeat(60));
    console.log(`\n${outputDir}/`);
    console.log('  ├── boundary-report.json  (detailed data)');
    console.log('  └── BOUNDARY-REPORT.md    (readable report)');

  } finally {
    rl.close();
    await browser.close();
  }
}

main().catch(console.error);
