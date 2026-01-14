#!/usr/bin/env node
/**
 * Debug Wrapper for serve.js
 * Logs EVERY request and response for debugging serve-time issues
 *
 * Usage: node debug-serve.js ./output/photopea.com-123456/
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node debug-serve.js <output-directory>');
  console.error('Example: node debug-serve.js ./output/photopea.com-123456/');
  process.exit(1);
}

const outputDir = path.resolve(args[0]);
if (!fs.existsSync(outputDir)) {
  console.error(`Error: Directory not found: ${outputDir}`);
  process.exit(1);
}

// Configuration
const PORT = 3333;
const PROXY_ENABLED = true;
const LOG_LEVEL = 'debug';

// Statistics tracking
const stats = {
  startTime: Date.now(),
  totalRequests: 0,
  hits: 0,
  misses: 0,
  proxied: 0,
  requestLog: [],           // Full log of all requests
  missedRequests: {},       // Count of missed URLs
  servedFiles: {},          // Count of served files
  errorRequests: {},        // Count of errors
};

// Load manifest
const manifestPath = path.join(outputDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`Error: manifest.json not found in ${outputDir}`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const ORIGINAL_URL = manifest.url;
const originalUrlObj = new URL(ORIGINAL_URL);

// Load URL map
const urlMapPath = path.join(outputDir, 'url-map.json');
if (!fs.existsSync(urlMapPath)) {
  console.error(`Error: url-map.json not found in ${outputDir}`);
  process.exit(1);
}
const urlMap = JSON.parse(fs.readFileSync(urlMapPath, 'utf-8'));

// Build efficient lookup by pathname
const lookup = {};
for (const [fullUrl, info] of Object.entries(urlMap)) {
  try {
    const urlObj = new URL(fullUrl);
    const pathWithQuery = urlObj.pathname + urlObj.search;
    const pathOnly = urlObj.pathname;

    // Store with query params (higher priority)
    if (!lookup[pathWithQuery]) {
      lookup[pathWithQuery] = info;
    }
    // Store without query params (fallback)
    if (!lookup[pathOnly]) {
      lookup[pathOnly] = info;
    }
  } catch (e) {
    // Invalid URL, skip
  }
}

// Load and inject runtime scripts into index.html
const indexPath = path.join(outputDir, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error(`Error: index.html not found in ${outputDir}`);
  process.exit(1);
}
let indexHtml = fs.readFileSync(indexPath, 'utf-8');
indexHtml = injectRuntimeScripts(indexHtml);

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
};

// Inject runtime scripts into HTML
function injectRuntimeScripts(html) {
  const clientUrlMap = {};
  for (const [fullUrl, info] of Object.entries(urlMap)) {
    clientUrlMap[fullUrl] = info.localFile;
  }

  const injectionScript = `
  <script>
  // Runtime configuration injected by Visual Cloner
  window.__EXTRACTED_CONFIG__ = {
    originalOrigin: "${originalUrlObj.origin}",
    originalHost: "${originalUrlObj.host}",
    originalProtocol: "${originalUrlObj.protocol}",
    originalHref: "${ORIGINAL_URL}"
  };
  window.__URL_MAP__ = ${JSON.stringify(clientUrlMap)};
  </script>
  <script src="/__runtime__/runtime-mock.js"></script>
  <script src="/__runtime__/indexeddb-mock.js"></script>
  <script src="/__runtime__/network-interceptor.js"></script>
`;

  // Find <head> tag and inject as first child
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    const headTag = headMatch[0];
    const headIndex = html.indexOf(headTag);
    const insertPosition = headIndex + headTag.length;

    return html.substring(0, insertPosition) +
           '\n' + injectionScript +
           html.substring(insertPosition);
  }

  // Fallback: inject before first script tag
  const scriptMatch = html.match(/<script/i);
  if (scriptMatch) {
    const scriptIndex = html.indexOf(scriptMatch[0]);
    return html.substring(0, scriptIndex) +
           injectionScript + '\n' +
           html.substring(scriptIndex);
  }

  // Last resort: inject at start of body
  const bodyMatch = html.match(/<body[^>]*>/i);
  if (bodyMatch) {
    const bodyTag = bodyMatch[0];
    const bodyIndex = html.indexOf(bodyTag);
    const insertPosition = bodyIndex + bodyTag.length;

    return html.substring(0, insertPosition) +
           '\n' + injectionScript +
           html.substring(insertPosition);
  }

  return html;
}

// Format file size
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

// Log request details
function logRequest(method, url, type, details = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    method,
    url,
    type,
    ...details
  };

  stats.requestLog.push(entry);
  stats.totalRequests++;

  // Console output with color coding
  console.log(`\n[REQUEST] ${method} ${url}`);

  if (type === 'hit') {
    console.log(`[LOOKUP]  Checking url-map for path...`);
    console.log(`[MATCH]   Found: ${details.localFile} (${formatSize(details.size || 0)})`);
    console.log(`[SERVE]   ${details.statusCode} OK - ${details.contentType}`);

    stats.hits++;
    stats.servedFiles[details.localFile] = (stats.servedFiles[details.localFile] || 0) + 1;
  }
  else if (type === 'miss') {
    console.log(`[LOOKUP]  Not in url-map`);
    console.log(`[MISS]    ${details.statusCode} - ${details.message || 'File not found'}`);

    stats.misses++;
    stats.missedRequests[url] = (stats.missedRequests[url] || 0) + 1;
  }
  else if (type === 'proxy') {
    console.log(`[LOOKUP]  Not in url-map`);
    console.log(`[PROXY]   Fetching from origin: ${details.proxyUrl}`);
    console.log(`[SERVE]   ${details.statusCode} - ${details.contentType} (${formatSize(details.size || 0)})`);

    stats.proxied++;
    if (details.cached) {
      stats.servedFiles[details.localFile] = (stats.servedFiles[details.localFile] || 0) + 1;
    }
  }
  else if (type === 'error') {
    console.log(`[ERROR]   ${details.message}`);

    stats.errorRequests[url] = (stats.errorRequests[url] || 0) + 1;
  }
  else if (type === 'runtime') {
    console.log(`[RUNTIME] Serving: ${details.runtimeFile}`);
    console.log(`[SERVE]   ${details.statusCode} OK - ${details.contentType}`);

    stats.hits++;
  }
  else if (type === 'index') {
    console.log(`[INDEX]   Serving index.html`);
    console.log(`[SERVE]   ${details.statusCode} OK - text/html`);

    stats.hits++;
  }
  else if (type === 'status') {
    console.log(`[STATUS]  Serving /__status__ endpoint`);
    stats.hits++;
  }
}

// Proxy request to original server
function proxyRequest(url, res, reqUrl) {
  const protocol = url.startsWith('https') ? https : http;

  protocol.get(url, (proxyRes) => {
    const chunks = [];

    proxyRes.on('data', (chunk) => chunks.push(chunk));
    proxyRes.on('end', () => {
      const body = Buffer.concat(chunks);
      const contentType = proxyRes.headers['content-type'] || 'application/octet-stream';

      // Add CORS headers
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'public, max-age=31536000',
      });

      res.end(body);

      // Cache the proxied response
      const cachedFile = cacheProxiedResource(url, body, contentType);

      logRequest('GET', reqUrl, 'proxy', {
        proxyUrl: url,
        statusCode: proxyRes.statusCode,
        contentType,
        size: body.length,
        cached: !!cachedFile,
        localFile: cachedFile
      });
    });
  }).on('error', (err) => {
    logRequest('GET', reqUrl, 'error', {
      message: `Proxy error: ${err.message}`
    });

    res.writeHead(502);
    res.end('Proxy error');
  });
}

// Cache proxied resource locally
function cacheProxiedResource(url, body, contentType) {
  try {
    const urlObj = new URL(url);
    const ext = path.extname(urlObj.pathname) || getExtFromContentType(contentType);
    const filename = `proxied-${Date.now()}${ext}`;
    const localFile = `resources/${filename}`;
    const filePath = path.join(outputDir, localFile);

    // Ensure resources directory exists
    const resourcesDir = path.join(outputDir, 'resources');
    if (!fs.existsSync(resourcesDir)) {
      fs.mkdirSync(resourcesDir, { recursive: true });
    }

    fs.writeFileSync(filePath, body);

    // Update url-map
    urlMap[url] = {
      localFile,
      contentType,
      size: body.length,
      proxied: true,
    };

    // Update lookup
    lookup[urlObj.pathname + urlObj.search] = urlMap[url];
    lookup[urlObj.pathname] = urlMap[url];

    // Save updated url-map
    fs.writeFileSync(
      path.join(outputDir, 'url-map.json'),
      JSON.stringify(urlMap, null, 2)
    );

    return localFile;
  } catch (err) {
    console.error(`[CACHE] Failed to cache: ${err.message}`);
    return null;
  }
}

// Get file extension from content type
function getExtFromContentType(contentType) {
  if (!contentType) return '';

  if (contentType.includes('javascript')) return '.js';
  if (contentType.includes('css')) return '.css';
  if (contentType.includes('html')) return '.html';
  if (contentType.includes('json')) return '.json';
  if (contentType.includes('wasm')) return '.wasm';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
  if (contentType.includes('gif')) return '.gif';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('svg')) return '.svg';
  if (contentType.includes('woff2')) return '.woff2';
  if (contentType.includes('woff')) return '.woff';

  return '';
}

// Print summary statistics
function printSummary() {
  const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
  const hitRate = stats.totalRequests > 0
    ? ((stats.hits / stats.totalRequests) * 100).toFixed(1)
    : 0;
  const missRate = stats.totalRequests > 0
    ? ((stats.misses / stats.totalRequests) * 100).toFixed(1)
    : 0;

  console.log('\n');
  console.log('═'.repeat(60));
  console.log('  REQUEST SUMMARY');
  console.log('═'.repeat(60));
  console.log('');
  console.log(`  Total requests:  ${stats.totalRequests}`);
  console.log(`  Uptime:          ${uptime}s`);
  console.log('');
  console.log(`  Hits:            ${stats.hits} (${hitRate}%)`);
  console.log(`  Misses:          ${stats.misses} (${missRate}%)`);
  console.log(`  Proxied:         ${stats.proxied}`);
  console.log('');

  // Show missed requests
  const missedUrls = Object.entries(stats.missedRequests);
  if (missedUrls.length > 0) {
    console.log('  MISSED REQUESTS:');
    missedUrls
      .sort((a, b) => b[1] - a[1])  // Sort by count descending
      .slice(0, 20)  // Show top 20
      .forEach(([url, count]) => {
        console.log(`    - ${url} (${count}x)`);
      });

    if (missedUrls.length > 20) {
      console.log(`    ... and ${missedUrls.length - 20} more`);
    }
    console.log('');
  }

  // Show top served files
  const servedFiles = Object.entries(stats.servedFiles);
  if (servedFiles.length > 0) {
    console.log('  TOP SERVED FILES:');
    servedFiles
      .sort((a, b) => b[1] - a[1])  // Sort by count descending
      .slice(0, 20)  // Show top 20
      .forEach(([file, count]) => {
        console.log(`    - ${file} (${count}x)`);
      });

    if (servedFiles.length > 20) {
      console.log(`    ... and ${servedFiles.length - 20} more`);
    }
    console.log('');
  }

  // Show errors
  const errors = Object.entries(stats.errorRequests);
  if (errors.length > 0) {
    console.log('  ERROR REQUESTS:');
    errors
      .sort((a, b) => b[1] - a[1])
      .forEach(([url, count]) => {
        console.log(`    - ${url} (${count}x)`);
      });
    console.log('');
  }

  console.log('═'.repeat(60));
  console.log('');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down...\n');
  printSummary();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nShutting down...\n');
  printSummary();
  process.exit(0);
});

// Create HTTP server
http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*',
    });
    return res.end();
  }

  const reqPath = req.url.split('?')[0];

  // Status endpoint
  if (reqPath === '/__status__') {
    const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
    const status = {
      status: 'running',
      uptime,
      resourcesCount: Object.keys(urlMap).length,
      totalRequests: stats.totalRequests,
      hits: stats.hits,
      misses: stats.misses,
      proxied: stats.proxied,
      originalUrl: ORIGINAL_URL,
      proxyEnabled: PROXY_ENABLED,
    };

    logRequest('GET', req.url, 'status', {});

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(JSON.stringify(status, null, 2));
  }

  // Serve runtime scripts
  if (reqPath.startsWith('/__runtime__/')) {
    const runtimeFile = reqPath.replace('/__runtime__/', '');
    const runtimePath = path.join(outputDir, '__runtime__', runtimeFile);

    if (fs.existsSync(runtimePath)) {
      const ext = path.extname(runtimeFile);
      const contentType = MIME[ext] || 'application/javascript; charset=utf-8';

      logRequest('GET', req.url, 'runtime', {
        runtimeFile,
        statusCode: 200,
        contentType
      });

      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });

      return fs.createReadStream(runtimePath).pipe(res);
    }

    logRequest('GET', req.url, 'miss', {
      statusCode: 404,
      message: 'Runtime script not found'
    });

    res.writeHead(404);
    return res.end('Runtime script not found');
  }

  // Serve index.html for root
  if (reqPath === '/' || reqPath === '/index.html') {
    logRequest('GET', req.url, 'index', {
      statusCode: 200
    });

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*',
    });
    return res.end(indexHtml);
  }

  // Look up in URL map (try full URL with query, then path only)
  const cached = lookup[req.url] || lookup[reqPath];

  if (cached) {
    const filePath = path.join(outputDir, cached.localFile);
    if (fs.existsSync(filePath)) {
      const ext = path.extname(cached.localFile);
      const contentType = cached.contentType || MIME[ext] || 'application/octet-stream';
      const fileStats = fs.statSync(filePath);

      logRequest('GET', req.url, 'hit', {
        localFile: cached.localFile,
        statusCode: 200,
        contentType,
        size: fileStats.size
      });

      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'public, max-age=31536000',
      });

      return fs.createReadStream(filePath).pipe(res);
    }
  }

  // Try proxying to original server
  if (PROXY_ENABLED) {
    // Construct full URL for proxying
    const fullUrl = originalUrlObj.origin + req.url;
    return proxyRequest(fullUrl, res, req.url);
  }

  // SPA fallback for HTML routes
  if (!reqPath.includes('.')) {
    logRequest('GET', req.url, 'index', {
      statusCode: 200,
      message: 'SPA fallback'
    });

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*',
    });
    return res.end(indexHtml);
  }

  // 404
  logRequest('GET', req.url, 'miss', {
    statusCode: 404,
    message: 'Not found'
  });

  res.writeHead(404, {
    'Access-Control-Allow-Origin': '*',
  });
  res.end('Not found');
}).listen(PORT, () => {
  console.log('');
  console.log('═'.repeat(60));
  console.log('  DEBUG SERVER (with request logging)');
  console.log('═'.repeat(60));
  console.log('');
  console.log('  URL:          http://localhost:' + PORT);
  console.log('  Directory:    ' + outputDir);
  console.log('  Original:     ' + ORIGINAL_URL);
  console.log('  Resources:    ' + Object.keys(urlMap).length);
  console.log('  Proxy:        ' + (PROXY_ENABLED ? 'Enabled' : 'Disabled'));
  console.log('  Runtime:      http://localhost:' + PORT + '/__runtime__/');
  console.log('  Status:       http://localhost:' + PORT + '/__status__');
  console.log('');
  console.log('  Press Ctrl+C to see summary statistics');
  console.log('');
  console.log('═'.repeat(60));
  console.log('');
  console.log('Starting request logging...\n');
});
