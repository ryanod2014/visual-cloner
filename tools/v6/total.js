#!/usr/bin/env node
/**
 * V6 TOTAL EXTRACTION - Captures EVERYTHING possible
 *
 * Additional captures beyond exhaustive:
 * 1. WebAssembly modules
 * 2. Web Workers & Service Workers
 * 3. WebSocket URLs (can't replay but captures the endpoints)
 * 4. IndexedDB structure
 * 5. LocalStorage/SessionStorage
 * 6. Canvas/WebGL shaders
 * 7. All viewport sizes (mobile resources)
 * 8. Scroll-triggered lazy loads
 * 9. Hover-triggered loads
 * 10. Time-delayed resources (wait longer)
 * 11. Error handler resources
 * 12. Source maps for debugging
 * 13. API responses (cached for replay)
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Capture stores
const allResources = new Map();
const apiResponses = new Map();
const webSockets = [];
const workers = [];
const storageData = { localStorage: {}, sessionStorage: {}, indexedDB: {} };
const sourceMapUrls = [];

async function captureResource(response) {
  const url = response.url();
  if (url.startsWith('data:') || url.startsWith('blob:')) return;
  if (allResources.has(url)) return;

  try {
    const contentType = response.headers()['content-type'] || '';
    const body = await response.body();

    allResources.set(url, {
      url,
      contentType,
      body,
      size: body.length,
      status: response.status(),
      headers: response.headers()
    });

    // Track source maps
    if (url.endsWith('.map') || contentType.includes('sourcemap')) {
      sourceMapUrls.push(url);
    }

    // Track API responses (JSON)
    if (contentType.includes('json') && !url.includes('manifest')) {
      try {
        const jsonData = JSON.parse(body.toString());
        apiResponses.set(url, jsonData);
      } catch (e) {}
    }

    // Log special resources
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (['.wasm'].includes(ext) || contentType.includes('wasm')) {
      console.log(`  [WASM] ${url.substring(0, 80)}`);
    } else if (['.js', '.mjs'].includes(ext) && body.length > 100000) {
      console.log(`  [BIG JS] ${(body.length/1024).toFixed(0)}KB - ${url.substring(0, 60)}`);
    }
  } catch (e) {}
}

async function injectCaptureScripts(page) {
  // Inject before page loads to capture everything
  await page.addInitScript(() => {
    // Capture WebSocket connections
    const OriginalWebSocket = window.WebSocket;
    window.__capturedWebSockets = [];
    window.WebSocket = function(url, protocols) {
      window.__capturedWebSockets.push({ url, protocols, time: Date.now() });
      return new OriginalWebSocket(url, protocols);
    };
    window.WebSocket.prototype = OriginalWebSocket.prototype;

    // Capture Worker creation
    const OriginalWorker = window.Worker;
    window.__capturedWorkers = [];
    window.Worker = function(url, options) {
      window.__capturedWorkers.push({ url: url.toString(), options, time: Date.now() });
      return new OriginalWorker(url, options);
    };
    window.Worker.prototype = OriginalWorker.prototype;

    // Capture SharedWorker
    if (window.SharedWorker) {
      const OriginalSharedWorker = window.SharedWorker;
      window.SharedWorker = function(url, options) {
        window.__capturedWorkers.push({ url: url.toString(), options, shared: true, time: Date.now() });
        return new OriginalSharedWorker(url, options);
      };
      window.SharedWorker.prototype = OriginalSharedWorker.prototype;
    }

    // Capture dynamic imports
    window.__dynamicImports = [];
    const originalImport = window.Function.prototype.constructor;
    // Can't fully intercept import() but we track what we can

    // Capture fetch requests for API mocking
    const originalFetch = window.fetch;
    window.__fetchRequests = [];
    window.fetch = async function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      window.__fetchRequests.push({ url, time: Date.now() });
      return originalFetch.apply(this, args);
    };

    // Capture XHR
    const originalXHR = window.XMLHttpRequest;
    window.__xhrRequests = [];
    window.XMLHttpRequest = function() {
      const xhr = new originalXHR();
      const originalOpen = xhr.open;
      xhr.open = function(method, url) {
        window.__xhrRequests.push({ method, url, time: Date.now() });
        return originalOpen.apply(this, arguments);
      };
      return xhr;
    };
  });
}

async function captureStorage(page) {
  return await page.evaluate(() => {
    const data = {
      localStorage: {},
      sessionStorage: {},
      cookies: document.cookie,
      indexedDBNames: []
    };

    // LocalStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      data.localStorage[key] = localStorage.getItem(key);
    }

    // SessionStorage
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      data.sessionStorage[key] = sessionStorage.getItem(key);
    }

    // IndexedDB database names (can't easily dump contents)
    if (window.indexedDB && window.indexedDB.databases) {
      // This is async, handled separately
    }

    return data;
  });
}

async function captureServiceWorker(page) {
  const swRegistrations = await page.evaluate(async () => {
    if (!navigator.serviceWorker) return [];
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations.map(r => ({
      scope: r.scope,
      scriptURL: r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL
    }));
  });
  return swRegistrations;
}

async function scrollFullPage(page) {
  console.log('  [SCROLL] Scrolling to trigger lazy loads...');

  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);
    });
  });

  await page.waitForTimeout(2000);
}

async function hoverAllElements(page) {
  console.log('  [HOVER] Hovering elements to trigger loads...');

  const hoverTargets = await page.evaluate(() => {
    const targets = [];
    const elements = document.querySelectorAll('*');

    elements.forEach(el => {
      const style = window.getComputedStyle(el);
      // Elements that might have hover effects
      if (style.cursor === 'pointer' ||
          el.matches(':hover') ||
          el.matches('[class*="hover"]') ||
          el.matches('[class*="tooltip"]') ||
          el.matches('[title]')) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight) {
          targets.push({ x: rect.x + rect.width/2, y: rect.y + rect.height/2 });
        }
      }
    });

    return targets.slice(0, 100); // Limit to 100
  });

  for (const target of hoverTargets) {
    try {
      await page.mouse.move(target.x, target.y);
      await page.waitForTimeout(200);
    } catch (e) {}
  }
}

async function triggerErrors(page) {
  console.log('  [ERRORS] Triggering error handlers...');

  // Try to trigger 404 error handlers
  await page.evaluate(() => {
    // Trigger image error
    const img = new Image();
    img.src = '/nonexistent-image-12345.png';

    // Trigger script error
    const script = document.createElement('script');
    script.src = '/nonexistent-script-12345.js';
    document.head.appendChild(script);
  });

  await page.waitForTimeout(1000);
}

async function captureMultipleViewports(context, url) {
  console.log('  [VIEWPORTS] Capturing mobile resources...');

  const viewports = [
    { width: 375, height: 812, name: 'iPhone X' },
    { width: 768, height: 1024, name: 'iPad' },
    { width: 1920, height: 1080, name: 'Desktop' }
  ];

  for (const vp of viewports) {
    const page = await context.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });
    page.on('response', captureResource);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
      console.log(`    ${vp.name}: captured`);
    } catch (e) {
      console.log(`    ${vp.name}: error`);
    }

    await page.close();
  }
}

async function fetchSourceMaps(page) {
  console.log('  [SOURCEMAPS] Fetching source maps...');

  // Find source map references in JS files
  for (const [url, resource] of allResources) {
    if (resource.contentType?.includes('javascript')) {
      const content = resource.body.toString();
      const match = content.match(/\/\/# sourceMappingURL=(.+)/);
      if (match) {
        const mapUrl = match[1].startsWith('http') ? match[1] : new URL(match[1], url).href;
        if (!allResources.has(mapUrl)) {
          try {
            const response = await page.goto(mapUrl, { waitUntil: 'load', timeout: 10000 });
            if (response) await captureResource(response);
            await page.goBack();
          } catch (e) {}
        }
      }
    }
  }
}

async function waitForDelayedLoads(page, seconds = 30) {
  console.log(`  [WAIT] Waiting ${seconds}s for delayed loads...`);

  const startCount = allResources.size;

  for (let i = 0; i < seconds; i += 5) {
    await page.waitForTimeout(5000);
    const newCount = allResources.size;
    if (newCount > startCount) {
      console.log(`    +${newCount - startCount} resources at ${i+5}s`);
    }
  }
}

async function userGuidedCapture(page, rl) {
  console.log('\n' + '='.repeat(60));
  console.log('USER-GUIDED CAPTURE - USE ALL FEATURES');
  console.log('='.repeat(60));
  console.log('\n▶ Import a file (drag & drop or File > Open)');
  console.log('▶ Use every tool (brush, selection, text, etc.)');
  console.log('▶ Apply filters (Filter menu)');
  console.log('▶ Use adjustments (Image > Adjustments)');
  console.log('▶ Try export (File > Export)');
  console.log('▶ Open preferences/settings');
  console.log('▶ Try any feature you want to work offline');
  console.log('\nPress ENTER when done...\n');

  await new Promise(resolve => rl.once('line', resolve));
}

async function main() {
  const url = process.argv[2] || 'https://www.photopea.com';
  const baseUrl = new URL(url);
  const origin = baseUrl.origin;

  const domain = baseUrl.hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = path.join(__dirname, '..', 'output', `${domain}-total-${timestamp}`);

  await fs.mkdir(path.join(outputDir, 'cache'), { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 TOTAL EXTRACTION');
  console.log('='.repeat(60));
  console.log('URL:', url);
  console.log('Output:', outputDir);
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // Accept all permissions
    permissions: ['clipboard-read', 'clipboard-write'],
  });

  const page = await context.newPage();

  // Inject capture scripts BEFORE navigation
  await injectCaptureScripts(page);

  // Capture all responses
  page.on('response', captureResource);

  try {
    // PHASE 1: Initial load
    console.log('[1/10] Initial page load...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    console.log(`  Captured: ${allResources.size} resources`);

    // PHASE 2: Launch main app
    console.log('\n[2/10] Launching app...');
    const launchSelectors = [
      'text=/start|launch|open|enter|begin/i',
      'button:has-text("Start")',
      'a:has-text("Start")',
      '[class*="start"]',
      '[class*="launch"]'
    ];
    for (const sel of launchSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          await page.waitForTimeout(5000);
          break;
        }
      } catch (e) {}
    }
    console.log(`  Captured: ${allResources.size} resources`);

    // PHASE 3: Scroll for lazy loads
    console.log('\n[3/10] Scroll capture...');
    await scrollFullPage(page);
    console.log(`  Captured: ${allResources.size} resources`);

    // PHASE 4: Hover triggers
    console.log('\n[4/10] Hover capture...');
    await hoverAllElements(page);
    console.log(`  Captured: ${allResources.size} resources`);

    // PHASE 5: Multiple viewports
    console.log('\n[5/10] Viewport capture...');
    await captureMultipleViewports(context, url);
    console.log(`  Captured: ${allResources.size} resources`);

    // PHASE 6: Capture storage
    console.log('\n[6/10] Storage capture...');
    const storage = await captureStorage(page);
    const swData = await captureServiceWorker(page);
    const injectedData = await page.evaluate(() => ({
      webSockets: window.__capturedWebSockets || [],
      workers: window.__capturedWorkers || [],
      fetchRequests: window.__fetchRequests || [],
      xhrRequests: window.__xhrRequests || []
    }));
    console.log(`  LocalStorage keys: ${Object.keys(storage.localStorage).length}`);
    console.log(`  WebSockets: ${injectedData.webSockets.length}`);
    console.log(`  Workers: ${injectedData.workers.length}`);
    console.log(`  Service Workers: ${swData.length}`);

    // PHASE 7: Error handlers
    console.log('\n[7/10] Error handler capture...');
    await triggerErrors(page);
    console.log(`  Captured: ${allResources.size} resources`);

    // PHASE 8: Wait for delayed loads
    console.log('\n[8/10] Delayed load capture...');
    await waitForDelayedLoads(page, 15);
    console.log(`  Captured: ${allResources.size} resources`);

    // PHASE 9: User-guided capture
    console.log('\n[9/10] User-guided capture...');
    await userGuidedCapture(page, rl);
    console.log(`  Captured: ${allResources.size} resources`);

    // PHASE 10: Source maps
    console.log('\n[10/10] Source map capture...');
    await fetchSourceMaps(page);
    console.log(`  Captured: ${allResources.size} resources`);

    // Final HTML
    const finalHtml = await page.content();

    // Save everything
    console.log('\n[SAVING] Writing files...');

    const urlMap = {};
    let stats = { js: 0, css: 0, wasm: 0, img: 0, font: 0, json: 0, other: 0 };
    let totalSize = 0;

    for (const [resUrl, res] of allResources) {
      const urlObj = new URL(resUrl);
      const safePath = urlObj.pathname.replace(/[^a-zA-Z0-9.-]/g, '_') || 'index';
      const fullPath = path.join(outputDir, 'cache', safePath);

      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, res.body);

      urlMap[resUrl] = {
        localFile: safePath,
        contentType: res.contentType,
        size: res.size
      };

      totalSize += res.size;

      const ct = res.contentType?.toLowerCase() || '';
      const ext = path.extname(urlObj.pathname).toLowerCase();
      if (ct.includes('javascript') || ['.js', '.mjs'].includes(ext)) stats.js++;
      else if (ct.includes('css') || ext === '.css') stats.css++;
      else if (ct.includes('wasm') || ext === '.wasm') stats.wasm++;
      else if (ct.includes('image')) stats.img++;
      else if (ct.includes('font') || ['.woff', '.woff2', '.ttf'].includes(ext)) stats.font++;
      else if (ct.includes('json')) stats.json++;
      else stats.other++;
    }

    await fs.writeFile(path.join(outputDir, 'url-map.json'), JSON.stringify(urlMap, null, 2));
    await fs.writeFile(path.join(outputDir, 'original.html'), finalHtml);
    await fs.writeFile(path.join(outputDir, 'storage.json'), JSON.stringify(storage, null, 2));
    await fs.writeFile(path.join(outputDir, 'api-responses.json'), JSON.stringify(Object.fromEntries(apiResponses), null, 2));
    await fs.writeFile(path.join(outputDir, 'service-workers.json'), JSON.stringify(swData, null, 2));
    await fs.writeFile(path.join(outputDir, 'captured-connections.json'), JSON.stringify(injectedData, null, 2));

    // Create proxy server with API mocking
    const serverScript = `#!/usr/bin/env node
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3333;
const TARGET_ORIGIN = '${origin}';

const urlMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'url-map.json'), 'utf8'));
const apiResponses = JSON.parse(fs.readFileSync(path.join(__dirname, 'api-responses.json'), 'utf8'));
const storage = JSON.parse(fs.readFileSync(path.join(__dirname, 'storage.json'), 'utf8'));
const originalHtml = fs.readFileSync(path.join(__dirname, 'original.html'), 'utf8');

// Inject storage restoration script
const storageScript = \`<script>
Object.entries(\${JSON.stringify(storage.localStorage)}).forEach(([k,v]) => localStorage.setItem(k,v));
Object.entries(\${JSON.stringify(storage.sessionStorage)}).forEach(([k,v]) => sessionStorage.setItem(k,v));
</script>\`;
const htmlWithStorage = originalHtml.replace('</head>', storageScript + '</head>');

console.log('TOTAL EXTRACTION PROXY');
console.log('======================');
console.log('Resources:', Object.keys(urlMap).length);
console.log('API responses:', Object.keys(apiResponses).length);
console.log('LocalStorage keys:', Object.keys(storage.localStorage).length);
console.log('');

const pathLookup = {};
for (const [fullUrl, info] of Object.entries(urlMap)) {
  try {
    const urlObj = new URL(fullUrl);
    pathLookup[urlObj.pathname] = info;
    pathLookup[urlObj.pathname + urlObj.search] = info;
  } catch (e) {}
}

// API response lookup
const apiLookup = {};
for (const [fullUrl, data] of Object.entries(apiResponses)) {
  try {
    const urlObj = new URL(fullUrl);
    apiLookup[urlObj.pathname] = data;
  } catch (e) {}
}

function proxyRequest(targetUrl, res) {
  const client = targetUrl.startsWith('https') ? https : http;
  client.get(targetUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*', 'Referer': TARGET_ORIGIN }
  }, (proxyRes) => {
    if (proxyRes.statusCode === 301 || proxyRes.statusCode === 302) {
      const loc = proxyRes.headers.location;
      if (loc) { proxyRequest(loc.startsWith('http') ? loc : TARGET_ORIGIN + loc, res); return; }
    }
    res.writeHead(proxyRes.statusCode || 200, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    proxyRes.pipe(res);
  }).on('error', () => { res.writeHead(500); res.end('Proxy error'); });
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' });
    res.end();
    return;
  }

  const reqPath = req.url.split('?')[0];

  // Serve index
  if (reqPath === '/' || reqPath === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
    res.end(htmlWithStorage);
    return;
  }

  // Check for cached API response
  if (apiLookup[reqPath]) {
    console.log('[API MOCK]', reqPath);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(apiLookup[reqPath]));
    return;
  }

  // Check cache
  const cached = pathLookup[req.url] || pathLookup[reqPath];
  if (cached) {
    const filePath = path.join(__dirname, 'cache', cached.localFile);
    if (fs.existsSync(filePath)) {
      console.log('[CACHE]', reqPath.substring(0, 50));
      res.writeHead(200, { 'Content-Type': cached.contentType || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // Proxy
  console.log('[PROXY]', reqPath.substring(0, 50));
  proxyRequest(TARGET_ORIGIN + req.url, res);

}).listen(PORT, () => console.log('\\nhttp://localhost:' + PORT + '\\n'));
`;

    await fs.writeFile(path.join(outputDir, 'serve.js'), serverScript);
    await page.screenshot({ path: path.join(outputDir, 'screenshot.png') });

    console.log('\n' + '='.repeat(60));
    console.log('TOTAL EXTRACTION COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nResources: ${allResources.size} (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`  JS: ${stats.js}, CSS: ${stats.css}, WASM: ${stats.wasm}`);
    console.log(`  Images: ${stats.img}, Fonts: ${stats.font}, JSON: ${stats.json}`);
    console.log(`\nStorage: ${Object.keys(storage.localStorage).length} localStorage keys`);
    console.log(`API Responses: ${apiResponses.size} cached`);
    console.log(`\nTo run:`);
    console.log(`  cd ${outputDir}`);
    console.log(`  node serve.js`);

  } finally {
    rl.close();
    await browser.close();
  }
}

main().catch(console.error);
