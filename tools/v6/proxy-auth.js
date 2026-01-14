#!/usr/bin/env node
/**
 * V6 Proxy with Auth Support
 *
 * Features:
 * 1. Use existing browser profile (with logged-in session)
 * 2. Capture and forward cookies
 * 3. Handle CSRF tokens
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
  const useProfile = process.argv.includes('--profile');
  const baseUrl = new URL(url);

  const domain = baseUrl.hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = path.join(__dirname, '..', 'output', `${domain}-v6-auth-${timestamp}`);

  await fs.mkdir(path.join(outputDir, 'cache'), { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 PROXY WITH AUTH SUPPORT');
  console.log('='.repeat(60));
  console.log('URL:', url);
  console.log('Output:', outputDir);
  console.log('Using browser profile:', useProfile);
  console.log('');

  let browser;
  let context;

  if (useProfile) {
    // Launch with persistent context (uses your actual Chrome profile)
    const userDataDir = process.env.CHROME_USER_DATA ||
      path.join(process.env.HOME, 'Library/Application Support/Google/Chrome');

    console.log('Using Chrome profile from:', userDataDir);

    // Note: Can't use persistent context with chromium, need to use channel
    browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: VIEWPORT,
      channel: 'chrome', // Use actual Chrome
    });
    context = browser;
  } else {
    // Normal launch - will need manual login
    browser = await chromium.launch({ headless: false });
    context = await browser.newContext({ viewport: VIEWPORT });
  }

  const page = await context.newPage();

  // Store captured cookies
  let capturedCookies = [];

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
    console.log('[1/4] Navigating (login if needed)...');

    // If not using profile, user may need to login manually
    if (!useProfile) {
      console.log('');
      console.log('  If the site requires login:');
      console.log('  1. Log in manually in the browser window');
      console.log('  2. Navigate to the page you want to capture');
      console.log('  3. Press Enter in this terminal when ready');
      console.log('');
    }

    await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });

    if (!useProfile) {
      // Wait for user to potentially login
      console.log('Page loaded. Press Enter when ready to capture...');
      await new Promise(resolve => {
        process.stdin.once('data', resolve);
      });

      // Re-navigate to ensure we capture everything after login
      console.log('Re-capturing after potential login...');
      resources.clear();
      await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
    }

    await page.waitForTimeout(3000);

    // Capture cookies
    capturedCookies = await context.cookies();
    console.log('  Captured', capturedCookies.length, 'cookies');
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

    // Save all resources
    console.log('\n[2/4] Caching resources...');

    const urlMap = {};

    for (const [resUrl, res] of resources) {
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

    // Save cookies for later use
    await fs.writeFile(path.join(outputDir, 'cookies.json'), JSON.stringify(capturedCookies, null, 2));
    console.log('  Cached', Object.keys(urlMap).length, 'files');

    // Get the original HTML
    const originalHtml = await page.content();
    await fs.writeFile(path.join(outputDir, 'original.html'), originalHtml);

    // Create the proxy server script with cookie support
    console.log('\n[3/4] Creating auth-aware proxy server...');

    const serverScript = `#!/usr/bin/env node
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3333;
const TARGET_ORIGIN = '${baseUrl.origin}';

// Load URL map and cookies
const urlMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'url-map.json'), 'utf8'));
const cookies = JSON.parse(fs.readFileSync(path.join(__dirname, 'cookies.json'), 'utf8'));
const originalHtml = fs.readFileSync(path.join(__dirname, 'original.html'), 'utf8');

// Format cookies for HTTP header
const cookieHeader = cookies
  .filter(c => c.domain.includes('${baseUrl.hostname.replace('www.', '')}'))
  .map(c => c.name + '=' + c.value)
  .join('; ');

console.log('Loaded', cookies.length, 'cookies');
console.log('Cookie header length:', cookieHeader.length);

// Build lookup by pathname
const pathLookup = {};
for (const [fullUrl, info] of Object.entries(urlMap)) {
  try {
    const urlObj = new URL(fullUrl);
    pathLookup[urlObj.pathname] = info;
    pathLookup[fullUrl] = info;
  } catch (e) {}
}

function proxyRequest(targetUrl, res) {
  const client = targetUrl.startsWith('https') ? https : http;
  const urlObj = new URL(targetUrl);

  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port || (targetUrl.startsWith('https') ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': '*/*',
      'Referer': TARGET_ORIGIN,
      'Cookie': cookieHeader, // Forward cookies for auth
      'Origin': TARGET_ORIGIN,
    }
  };

  client.request(options, (proxyRes) => {
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Credentials': 'true'
    });
    proxyRes.pipe(res);
  }).on('error', (e) => {
    console.error('Proxy error:', targetUrl, e.message);
    res.writeHead(500);
    res.end('Proxy error');
  }).end();
}

http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Credentials': 'true'
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

  // Proxy to origin with cookies
  const targetUrl = TARGET_ORIGIN + req.url;
  console.log('[PROXY]', reqPath, '->', targetUrl);
  proxyRequest(targetUrl, res);

}).listen(PORT, () => {
  console.log('');
  console.log('Auth-aware proxy server running at http://localhost:' + PORT);
  console.log('Target origin:', TARGET_ORIGIN);
  console.log('');
  console.log('Cached resources:', Object.keys(urlMap).length);
  console.log('Cookies for domain:', cookies.filter(c => c.domain.includes('${baseUrl.hostname.replace('www.', '')}')).length);
  console.log('');
  console.log('Open http://localhost:' + PORT + ' in your browser');
  console.log('');
});
`;

    await fs.writeFile(path.join(outputDir, 'serve.js'), serverScript);

    // Screenshot for reference
    await page.screenshot({ path: path.join(outputDir, 'reference.png'), fullPage: true });

    console.log('\n[4/4] Done!');
    console.log('\n' + '='.repeat(60));
    console.log('AUTH PROXY CLONE COMPLETE');
    console.log('='.repeat(60));
    console.log('\nTo run:');
    console.log('  cd', outputDir);
    console.log('  node serve.js');
    console.log('  Open http://localhost:3333');
    console.log('\nFeatures:');
    console.log('  - Cached resources served locally');
    console.log('  - API calls proxied with your auth cookies');
    console.log('  - Should work with logged-in sessions');

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
