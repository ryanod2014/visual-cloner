#!/usr/bin/env node
/**
 * Auto-run boundary mapper (no manual interaction needed)
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const boundaries = {
  static: { js: [], css: [], images: [], fonts: [], wasm: [], other: [] },
  api: { rest: [], graphql: [], rpc: [] },
  realtime: { websocket: [], sse: [], polling: [] },
  external: { analytics: [], auth: [], cdn: [], payment: [], storage: [], other: [] },
  forms: [],
  unknown: []
};

const patterns = {
  analytics: [/google-analytics/i, /analytics/i, /gtag/i, /mixpanel/i, /segment/i, /amplitude/i, /hotjar/i, /sentry/i],
  auth: [/auth0/i, /oauth/i, /login/i, /signin/i, /cognito/i, /firebase.*auth/i],
  payment: [/stripe/i, /paypal/i, /braintree/i],
  storage: [/s3\.amazonaws/i, /cloudinary/i, /firebase.*storage/i, /digitaloceanspaces/i],
  cdn: [/cloudflare/i, /fastly/i, /jsdelivr/i, /unpkg/i, /cdnjs/i, /esm\.sh/i, /fonts\.googleapis/i, /fonts\.gstatic/i],
  graphql: [/graphql/i, /\/gql/i],
  api: [/\/api\//i, /\/v[0-9]+\//i]
};

function categorizeUrl(url, method, contentType, postData) {
  const urlObj = new URL(url);

  if (patterns.graphql.some(p => p.test(url)) || (postData && postData.includes('"query"'))) {
    return { category: 'api', subcategory: 'graphql' };
  }

  for (const [service, servicePatterns] of Object.entries(patterns)) {
    if (service === 'graphql' || service === 'api') continue;
    if (servicePatterns.some(p => p.test(url))) {
      return { category: 'external', subcategory: service };
    }
  }

  if (contentType) {
    if (contentType.includes('javascript')) return { category: 'static', subcategory: 'js' };
    if (contentType.includes('css')) return { category: 'static', subcategory: 'css' };
    if (contentType.includes('image')) return { category: 'static', subcategory: 'images' };
    if (contentType.includes('font')) return { category: 'static', subcategory: 'fonts' };
    if (contentType.includes('wasm')) return { category: 'static', subcategory: 'wasm' };
  }

  const ext = path.extname(urlObj.pathname).toLowerCase();
  if (['.js', '.mjs'].includes(ext)) return { category: 'static', subcategory: 'js' };
  if (['.css'].includes(ext)) return { category: 'static', subcategory: 'css' };
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.mp4', '.webm'].includes(ext)) return { category: 'static', subcategory: 'images' };
  if (['.woff', '.woff2', '.ttf', '.otf'].includes(ext)) return { category: 'static', subcategory: 'fonts' };
  if (['.wasm'].includes(ext)) return { category: 'static', subcategory: 'wasm' };
  if (['.zip', '.html', '.htm'].includes(ext)) return { category: 'static', subcategory: 'other' };

  if (patterns.api.some(p => p.test(url))) return { category: 'api', subcategory: 'rest' };
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) return { category: 'api', subcategory: 'rest' };
  if (contentType && contentType.includes('json') && !url.includes('manifest')) return { category: 'api', subcategory: 'rest' };

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
  console.log('V6 BOUNDARY MAPPER (Auto Mode)');
  console.log('='.repeat(60));
  console.log('URL:', url);
  console.log('');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Inject interceptors
  await page.addInitScript(() => {
    const OrigWS = window.WebSocket;
    window.__websockets = [];
    window.WebSocket = function(url, protocols) {
      window.__websockets.push({ url, protocols, time: Date.now() });
      return new OrigWS(url, protocols);
    };
    window.WebSocket.prototype = OrigWS.prototype;

    if (window.EventSource) {
      const OrigES = window.EventSource;
      window.__eventsources = [];
      window.EventSource = function(url, config) {
        window.__eventsources.push({ url, config, time: Date.now() });
        return new OrigES(url, config);
      };
      window.EventSource.prototype = OrigES.prototype;
    }
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
      isExternal: !url.startsWith(origin)
    };

    if (subcategory) {
      boundaries[category][subcategory].push(entry);
    } else if (category === 'unknown') {
      boundaries.unknown.push(entry);
    }
  });

  try {
    console.log('[1/5] Loading page...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    console.log('[2/5] Launching app...');
    try {
      await page.click('text=/start using photopea/i', { timeout: 5000 });
      await page.waitForTimeout(8000);
    } catch (e) {
      console.log('  No launch button found or already in app');
    }

    console.log('[3/5] Opening menus...');
    // Click through main menus
    const menuItems = ['File', 'Edit', 'Image', 'Layer', 'Select', 'Filter', 'View', 'Window', 'More'];
    for (const menu of menuItems) {
      try {
        await page.click(`text="${menu}"`, { timeout: 1000 });
        await page.waitForTimeout(500);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } catch (e) {}
    }

    console.log('[4/5] Testing features...');
    // Try some keyboard shortcuts that might load features
    const shortcuts = ['n', 'o', 's', 'z', 'b', 'e', 't', 'g', 'm', 'l', 'w', 'c', 'i'];
    for (const key of shortcuts) {
      try {
        await page.keyboard.press(key);
        await page.waitForTimeout(300);
      } catch (e) {}
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);

    console.log('[5/5] Collecting data...');

    const injectedData = await page.evaluate(() => ({
      websockets: window.__websockets || [],
      eventsources: window.__eventsources || []
    }));

    boundaries.realtime.websocket = injectedData.websockets;
    boundaries.realtime.sse = injectedData.eventsources;

    // Generate report
    const staticCount = Object.values(boundaries.static).flat().length;
    const apiCount = Object.values(boundaries.api).flat().length;
    const realtimeCount = Object.values(boundaries.realtime).flat().length;
    const externalCount = Object.values(boundaries.external).flat().length;

    console.log('\n' + '='.repeat(60));
    console.log('BOUNDARY MAP RESULTS');
    console.log('='.repeat(60));

    console.log('\n📊 SUMMARY');
    console.log('─'.repeat(40));
    console.log(`✅ STATIC (cacheable):     ${staticCount} resources`);
    console.log(`⚠️  API (needs backend):    ${apiCount} endpoints`);
    console.log(`🔴 REALTIME (can't cache): ${realtimeCount} connections`);
    console.log(`🌐 EXTERNAL (third-party): ${externalCount} services`);
    console.log(`❓ UNKNOWN:                ${boundaries.unknown.length} requests`);

    console.log('\n\n📦 STATIC RESOURCES (will work offline)');
    console.log('─'.repeat(40));
    console.log(`  JavaScript: ${boundaries.static.js.length} files`);
    console.log(`  CSS:        ${boundaries.static.css.length} files`);
    console.log(`  Images:     ${boundaries.static.images.length} files`);
    console.log(`  Fonts:      ${boundaries.static.fonts.length} files`);
    console.log(`  WASM:       ${boundaries.static.wasm.length} files`);
    console.log(`  Other:      ${boundaries.static.other.length} files`);

    console.log('\n\n📡 API ENDPOINTS (need backend)');
    console.log('─'.repeat(40));
    if (boundaries.api.rest.length > 0) {
      console.log('\nREST:');
      const uniqueRest = [...new Set(boundaries.api.rest.map(r => `  ${r.method} ${new URL(r.url).pathname}`))];
      uniqueRest.slice(0, 10).forEach(r => console.log(r));
      if (uniqueRest.length > 10) console.log(`  ... and ${uniqueRest.length - 10} more`);
    } else {
      console.log('  None detected');
    }

    if (boundaries.api.graphql.length > 0) {
      console.log('\nGraphQL:');
      boundaries.api.graphql.forEach(r => console.log(`  ${new URL(r.url).pathname}`));
    }

    console.log('\n\n🔴 REALTIME (cannot work offline)');
    console.log('─'.repeat(40));
    if (boundaries.realtime.websocket.length > 0) {
      console.log('\nWebSockets:');
      boundaries.realtime.websocket.forEach(ws => console.log(`  ${ws.url}`));
    } else {
      console.log('  No WebSocket connections');
    }
    if (boundaries.realtime.sse.length > 0) {
      console.log('\nServer-Sent Events:');
      boundaries.realtime.sse.forEach(sse => console.log(`  ${sse.url}`));
    } else {
      console.log('  No SSE connections');
    }

    console.log('\n\n🌐 EXTERNAL SERVICES');
    console.log('─'.repeat(40));
    for (const [service, items] of Object.entries(boundaries.external)) {
      if (items.length > 0) {
        const hosts = [...new Set(items.map(i => new URL(i.url).hostname))];
        console.log(`\n${service.toUpperCase()}: ${hosts.join(', ')}`);
      }
    }

    // Save report
    await fs.writeFile(
      path.join(outputDir, 'boundary-report.json'),
      JSON.stringify({ boundaries, summary: { staticCount, apiCount, realtimeCount, externalCount } }, null, 2)
    );

    console.log('\n\n' + '='.repeat(60));
    console.log('WHAT THIS MEANS');
    console.log('='.repeat(60));
    console.log('\n✅ WILL WORK OFFLINE:');
    console.log('   Core UI, tools, menus, basic editing');
    console.log('\n⚠️  MAY NOT WORK OFFLINE:');
    if (apiCount > 0) console.log('   API-dependent features (cloud save, templates, etc.)');
    if (realtimeCount > 0) console.log('   Real-time collaboration');
    if (boundaries.external.auth.length > 0) console.log('   User authentication');
    if (boundaries.external.analytics.length > 0) console.log('   Analytics (can be ignored)');

    console.log('\n\nReport saved to:', outputDir);

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
