#!/usr/bin/env node
/**
 * V6 Proxy - Extract and serve with proxying
 *
 * Instead of rewriting URLs, we:
 * 1. Download ALL resources we can capture
 * 2. Serve HTML with original URLs intact
 * 3. Proxy all requests - return local copies if we have them, otherwise proxy to origin
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWPORT = { width: 1440, height: 900 };

async function main() {
  const url = process.argv[2] || 'https://excalidraw.com';
  const baseUrl = new URL(url);

  const domain = baseUrl.hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = path.join(__dirname, '..', 'output', `${domain}-v6-proxy-${timestamp}`);

  await fs.mkdir(path.join(outputDir, 'cache'), { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 PROXY - Extract and Proxy Serve');
  console.log('='.repeat(60));
  console.log('URL:', url);
  console.log('Output:', outputDir);
  console.log('');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: VIEWPORT });

  // Store all captured resources by URL
  const resources = new Map();

  // Intercept ALL responses
  page.on('response', async (response) => {
    const resUrl = response.url();
    const contentType = response.headers()['content-type'] || '';

    // Skip data URLs and blob URLs
    if (resUrl.startsWith('data:') || resUrl.startsWith('blob:')) return;

    try {
      const body = await response.body();
      resources.set(resUrl, {
        url: resUrl,
        contentType,
        body,
        size: body.length
      });
    } catch (e) {
      // Some responses can't be read (streaming, etc.)
    }
  });

  try {
    console.log('[1/3] Navigating and capturing resources...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    console.log('  Captured', resources.size, 'resources');

    // Categorize resources
    let jsSize = 0, cssSize = 0, fontCount = 0, imageCount = 0;
    for (const [resUrl, res] of resources) {
      const ct = res.contentType.toLowerCase();
      if (ct.includes('javascript')) jsSize += res.size;
      else if (ct.includes('css')) cssSize += res.size;
      else if (ct.includes('font') || resUrl.includes('.woff')) fontCount++;
      else if (ct.includes('image')) imageCount++;
    }

    console.log('  - JS:', (jsSize / 1024 / 1024).toFixed(2), 'MB');
    console.log('  - CSS:', (cssSize / 1024).toFixed(2), 'KB');
    console.log('  - Fonts:', fontCount);
    console.log('  - Images:', imageCount);

    // Save all resources with their URL as key
    console.log('\n[2/3] Caching resources...');

    const urlMap = {};

    for (const [resUrl, res] of resources) {
      // Create a safe filename from the URL
      const urlObj = new URL(resUrl);
      const safePath = urlObj.pathname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = safePath || 'index';
      const fullPath = path.join(outputDir, 'cache', filename);

      await fs.writeFile(fullPath, res.body);
      urlMap[resUrl] = {
        localFile: filename,
        contentType: res.contentType
      };
    }

    await fs.writeFile(path.join(outputDir, 'url-map.json'), JSON.stringify(urlMap, null, 2));
    console.log('  Cached', Object.keys(urlMap).length, 'files');

    // Get the original HTML
    const originalHtml = await page.content();
    await fs.writeFile(path.join(outputDir, 'original.html'), originalHtml);

    // Create the proxy server script
    console.log('\n[3/3] Creating proxy server...');

    const serverScript = `#!/usr/bin/env node
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3333;
const TARGET_ORIGIN = '${baseUrl.origin}';

// Load URL map
const urlMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'url-map.json'), 'utf8'));
const originalHtml = fs.readFileSync(path.join(__dirname, 'original.html'), 'utf8');

// Build lookup by pathname
const pathLookup = {};
for (const [fullUrl, info] of Object.entries(urlMap)) {
  try {
    const urlObj = new URL(fullUrl);
    pathLookup[urlObj.pathname] = info;
    // Also map the full URL
    pathLookup[fullUrl] = info;
  } catch (e) {}
}

function proxyRequest(targetUrl, res) {
  const client = targetUrl.startsWith('https') ? https : http;
  client.get(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': '*/*',
      'Referer': TARGET_ORIGIN
    }
  }, (proxyRes) => {
    // Handle redirects
    if (proxyRes.statusCode === 301 || proxyRes.statusCode === 302) {
      const location = proxyRes.headers.location;
      if (location) {
        proxyRequest(location.startsWith('http') ? location : TARGET_ORIGIN + location, res);
        return;
      }
    }

    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    });
    proxyRes.pipe(res);
  }).on('error', (e) => {
    console.error('Proxy error:', targetUrl, e.message);
    res.writeHead(500);
    res.end('Proxy error');
  });
}

http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    });
    res.end();
    return;
  }

  const reqPath = req.url.split('?')[0];

  // Serve index.html for root
  if (reqPath === '/' || reqPath === '/index.html') {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(originalHtml);
    return;
  }

  // Check if we have this cached
  const cached = pathLookup[reqPath] || pathLookup[TARGET_ORIGIN + reqPath];

  if (cached) {
    const filePath = path.join(__dirname, 'cache', cached.localFile);
    if (fs.existsSync(filePath)) {
      console.log('[CACHE]', reqPath);
      res.writeHead(200, {
        'Content-Type': cached.contentType || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // Proxy to origin
  const targetUrl = TARGET_ORIGIN + reqPath;
  console.log('[PROXY]', reqPath, '->', targetUrl);
  proxyRequest(targetUrl, res);

}).listen(PORT, () => {
  console.log('');
  console.log('Proxy server running at http://localhost:' + PORT);
  console.log('Target origin:', TARGET_ORIGIN);
  console.log('');
  console.log('Cached resources:', Object.keys(urlMap).length);
  console.log('');
  console.log('Open http://localhost:' + PORT + ' in your browser');
  console.log('');
});
`;

    await fs.writeFile(path.join(outputDir, 'serve.js'), serverScript);

    // Screenshot for reference
    await page.screenshot({ path: path.join(outputDir, 'reference.png'), fullPage: true });

    console.log('\n' + '='.repeat(60));
    console.log('PROXY CLONE COMPLETE');
    console.log('='.repeat(60));
    console.log('\nTo run:');
    console.log('  cd', outputDir);
    console.log('  node serve.js');
    console.log('  Open http://localhost:3333');
    console.log('\nHow it works:');
    console.log('  - Cached resources served locally (fast, no CORS)');
    console.log('  - Missing resources proxied to origin');
    console.log('  - All JS/CSS runs as intended');

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
