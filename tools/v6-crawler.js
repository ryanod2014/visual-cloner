#!/usr/bin/env node
/**
 * V6 Crawler - Full webapp extraction with all routes
 *
 * 1. Crawls all internal links
 * 2. Captures resources from each page
 * 3. Links work between pages (local navigation)
 * 4. Serves complete webapp via proxy
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWPORT = { width: 1440, height: 900 };
const MAX_PAGES = 50; // Safety limit

async function main() {
  const startUrl = process.argv[2] || 'https://excalidraw.com';
  const maxPages = parseInt(process.argv[3]) || MAX_PAGES;
  const baseUrl = new URL(startUrl);
  const origin = baseUrl.origin;

  const domain = baseUrl.hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = path.join(__dirname, '..', 'output', `${domain}-v6-crawl-${timestamp}`);

  await fs.mkdir(path.join(outputDir, 'cache'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'pages'), { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 CRAWLER - Full Webapp Extraction');
  console.log('='.repeat(60));
  console.log('Start URL:', startUrl);
  console.log('Max pages:', maxPages);
  console.log('Output:', outputDir);
  console.log('');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: VIEWPORT });

  // Track visited URLs and discovered links
  const visited = new Set();
  const toVisit = [startUrl];
  const pageHtmlMap = {}; // path -> html content
  const allResources = new Map(); // url -> resource data
  const allLinks = new Set(); // all discovered internal links

  // Resource interceptor
  const captureResources = (page) => {
    page.on('response', async (response) => {
      const resUrl = response.url();
      const contentType = response.headers()['content-type'] || '';

      if (resUrl.startsWith('data:') || resUrl.startsWith('blob:')) return;
      if (allResources.has(resUrl)) return; // Already captured

      try {
        const body = await response.body();
        allResources.set(resUrl, {
          url: resUrl,
          contentType,
          body,
          size: body.length
        });
      } catch (e) {
        // Some responses can't be read
      }
    });
  };

  try {
    console.log('[1/5] Crawling pages...\n');

    while (toVisit.length > 0 && visited.size < maxPages) {
      const url = toVisit.shift();

      // Normalize URL
      const urlObj = new URL(url, origin);
      const normalizedUrl = urlObj.origin + urlObj.pathname;

      // Skip if already visited or external
      if (visited.has(normalizedUrl)) continue;
      if (!normalizedUrl.startsWith(origin)) continue;

      // Skip non-page resources
      const ext = path.extname(urlObj.pathname).toLowerCase();
      if (['.js', '.css', '.png', '.jpg', '.gif', '.svg', '.woff', '.woff2', '.ico', '.json'].includes(ext)) {
        continue;
      }

      visited.add(normalizedUrl);
      const pageNum = visited.size;
      console.log(`  [${pageNum}/${maxPages}] ${urlObj.pathname || '/'}`);

      const page = await context.newPage();
      captureResources(page);

      try {
        await page.goto(normalizedUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Get page HTML
        const html = await page.content();
        const pagePath = urlObj.pathname || '/';
        pageHtmlMap[pagePath] = html;

        // Discover links on this page
        const links = await page.evaluate((origin) => {
          const anchors = Array.from(document.querySelectorAll('a[href]'));
          return anchors
            .map(a => {
              try {
                const href = a.getAttribute('href');
                if (!href) return null;
                if (href.startsWith('#')) return null;
                if (href.startsWith('javascript:')) return null;
                if (href.startsWith('mailto:')) return null;
                if (href.startsWith('tel:')) return null;

                // Resolve relative URLs
                const resolved = new URL(href, window.location.href);
                if (resolved.origin === origin) {
                  return resolved.origin + resolved.pathname;
                }
                return null;
              } catch (e) {
                return null;
              }
            })
            .filter(Boolean);
        }, origin);

        // Add new links to queue
        for (const link of links) {
          allLinks.add(link);
          if (!visited.has(link) && !toVisit.includes(link)) {
            toVisit.push(link);
          }
        }

        // Also look for client-side routes (React Router, etc.)
        const routerLinks = await page.evaluate(() => {
          // Common patterns for SPA routes
          const routes = [];

          // React Router links
          document.querySelectorAll('[data-href], [to]').forEach(el => {
            const to = el.getAttribute('data-href') || el.getAttribute('to');
            if (to && to.startsWith('/')) routes.push(to);
          });

          // Next.js links
          document.querySelectorAll('a[href^="/"]').forEach(el => {
            routes.push(el.getAttribute('href'));
          });

          return routes;
        });

        for (const route of routerLinks) {
          const fullUrl = origin + route;
          if (!visited.has(fullUrl) && !toVisit.includes(fullUrl)) {
            toVisit.push(fullUrl);
          }
        }

      } catch (e) {
        console.log(`    ⚠ Error: ${e.message.substring(0, 50)}`);
      } finally {
        await page.close();
      }
    }

    console.log(`\n  Crawled ${visited.size} pages`);
    console.log(`  Found ${allLinks.size} internal links`);
    console.log(`  Captured ${allResources.size} resources`);

    // Categorize resources
    console.log('\n[2/5] Processing resources...');

    let jsSize = 0, cssSize = 0, fontCount = 0, imageCount = 0;
    for (const [resUrl, res] of allResources) {
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

    // Save resources
    console.log('\n[3/5] Caching resources...');

    const urlMap = {};

    for (const [resUrl, res] of allResources) {
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
    console.log('  Cached', Object.keys(urlMap).length, 'resource files');

    // Save page HTML files
    console.log('\n[4/5] Saving page HTML...');

    const pageMap = {};
    for (const [pagePath, html] of Object.entries(pageHtmlMap)) {
      const safeName = pagePath === '/' ? 'index' : pagePath.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = safeName + '.html';
      await fs.writeFile(path.join(outputDir, 'pages', filename), html);
      pageMap[pagePath] = filename;
    }

    await fs.writeFile(path.join(outputDir, 'page-map.json'), JSON.stringify(pageMap, null, 2));
    console.log('  Saved', Object.keys(pageMap).length, 'page HTML files');

    // Create the multi-page proxy server
    console.log('\n[5/5] Creating multi-page proxy server...');

    const serverScript = `#!/usr/bin/env node
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3333;
const TARGET_ORIGIN = '${origin}';

// Load maps
const urlMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'url-map.json'), 'utf8'));
const pageMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'page-map.json'), 'utf8'));

console.log('Loaded', Object.keys(urlMap).length, 'cached resources');
console.log('Loaded', Object.keys(pageMap).length, 'pages:');
Object.keys(pageMap).forEach(p => console.log('  -', p));

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
  client.get(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': '*/*',
      'Referer': TARGET_ORIGIN
    }
  }, (proxyRes) => {
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

  // Check if this is a known page route
  const pagePath = reqPath === '/' ? '/' : reqPath;
  if (pageMap[pagePath]) {
    const htmlFile = path.join(__dirname, 'pages', pageMap[pagePath]);
    if (fs.existsSync(htmlFile)) {
      console.log('[PAGE]', pagePath);
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(htmlFile).pipe(res);
      return;
    }
  }

  // Serve index.html for root and unknown routes (SPA fallback)
  if (reqPath === '/' || reqPath === '/index.html' || (!pathLookup[reqPath] && !reqPath.includes('.'))) {
    const indexPath = pageMap['/'] ? path.join(__dirname, 'pages', pageMap['/']) : null;
    if (indexPath && fs.existsSync(indexPath)) {
      console.log('[SPA]', reqPath, '-> index');
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(indexPath).pipe(res);
      return;
    }
  }

  // Check if we have this resource cached
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
  const targetUrl = TARGET_ORIGIN + req.url;
  console.log('[PROXY]', reqPath);
  proxyRequest(targetUrl, res);

}).listen(PORT, () => {
  console.log('');
  console.log('='.repeat(50));
  console.log('Multi-page proxy server running at http://localhost:' + PORT);
  console.log('='.repeat(50));
  console.log('');
  console.log('Target origin:', TARGET_ORIGIN);
  console.log('Cached resources:', Object.keys(urlMap).length);
  console.log('Captured pages:', Object.keys(pageMap).length);
  console.log('');
  console.log('All internal links will work!');
  console.log('');
});
`;

    await fs.writeFile(path.join(outputDir, 'serve.js'), serverScript);

    // Save crawl metadata
    await fs.writeFile(path.join(outputDir, 'crawl-info.json'), JSON.stringify({
      startUrl,
      origin,
      crawledAt: new Date().toISOString(),
      pagesVisited: visited.size,
      linksFound: allLinks.size,
      resourcesCaptured: allResources.size,
      pages: Array.from(visited),
      links: Array.from(allLinks)
    }, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('FULL CRAWL COMPLETE');
    console.log('='.repeat(60));
    console.log('\nCaptured:');
    console.log('  -', visited.size, 'pages');
    console.log('  -', allResources.size, 'resources');
    console.log('  -', (jsSize / 1024 / 1024).toFixed(2), 'MB JavaScript');
    console.log('\nTo run:');
    console.log('  cd', outputDir);
    console.log('  node serve.js');
    console.log('  Open http://localhost:3333');
    console.log('\nAll page links work locally!');

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
