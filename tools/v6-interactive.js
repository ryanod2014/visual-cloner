#!/usr/bin/env node
/**
 * V6 INTERACTIVE CAPTURE
 *
 * Opens the app and lets YOU interact with it while capturing all resources.
 * Import files, use tools, apply filters - everything gets captured.
 * When done, press Ctrl+C to save and start the local server.
 */

import { chromium } from 'playwright';
import http from 'http';
import https from 'https';
import fs from 'fs/promises';
import { existsSync, createReadStream, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const allResources = new Map();
let captureCount = 0;

async function main() {
  const url = process.argv[2] || 'https://www.photopea.com';
  const baseUrl = new URL(url);
  const origin = baseUrl.origin;
  const domain = baseUrl.hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = path.join(__dirname, '..', 'output', `${domain}-interactive-${timestamp}`);

  await fs.mkdir(path.join(outputDir, 'cache'), { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 INTERACTIVE CAPTURE');
  console.log('='.repeat(60));
  console.log('URL:', url);
  console.log('');
  console.log('INSTRUCTIONS:');
  console.log('  1. Use the app normally in the browser window');
  console.log('  2. Import files, apply filters, use every feature you want');
  console.log('  3. All resources will be captured as you use them');
  console.log('  4. Press Ctrl+C when done to save & start local server');
  console.log('');

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-web-security'] // Allow cross-origin for complete capture
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    bypassCSP: true
  });
  const page = await context.newPage();

  // Capture ALL responses
  page.on('response', async response => {
    const resUrl = response.url();
    if (resUrl.startsWith('data:') || resUrl.startsWith('blob:')) return;
    if (allResources.has(resUrl)) return;

    try {
      const body = await response.body();
      const contentType = response.headers()['content-type'] || '';

      allResources.set(resUrl, {
        url: resUrl,
        contentType,
        body,
        size: body.length
      });

      captureCount++;
      if (body.length > 50000) {
        console.log(`  [+${captureCount}] ${(body.length/1024).toFixed(0)}KB - ${resUrl.substring(0, 60)}...`);
      }
    } catch (e) {}
  });

  // Status updater
  const statusInterval = setInterval(() => {
    process.stdout.write(`\r  Resources captured: ${allResources.size}    `);
  }, 1000);

  try {
    console.log('[Loading page...]');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    console.log(`  Initial resources: ${allResources.size}`);
    console.log('');
    console.log('='.repeat(60));
    console.log('NOW INTERACT WITH THE APP');
    console.log('='.repeat(60));
    console.log('');

    // Wait for user to finish (Ctrl+C or close browser)
    await new Promise((resolve) => {
      process.on('SIGINT', () => {
        clearInterval(statusInterval);
        resolve();
      });
      page.on('close', () => {
        clearInterval(statusInterval);
        resolve();
      });
      context.on('close', () => {
        clearInterval(statusInterval);
        resolve();
      });
    });

  } catch (e) {
    clearInterval(statusInterval);
    if (!e.message?.includes('Target closed')) {
      console.log('\nError:', e.message);
    }
  }

  console.log('\n\n[Saving resources...]');

  // Save all resources
  const urlMap = {};
  let totalSize = 0;
  let fileIndex = 0;

  for (const [resUrl, res] of allResources) {
    const ext = (res.contentType || '').includes('javascript') ? '.js' :
                (res.contentType || '').includes('css') ? '.css' :
                (res.contentType || '').includes('html') ? '.html' :
                (res.contentType || '').includes('json') ? '.json' :
                (res.contentType || '').includes('wasm') ? '.wasm' :
                (res.contentType || '').includes('image/png') ? '.png' :
                (res.contentType || '').includes('image/jpeg') ? '.jpg' :
                (res.contentType || '').includes('image/gif') ? '.gif' :
                (res.contentType || '').includes('image/svg') ? '.svg' :
                (res.contentType || '').includes('image/webp') ? '.webp' :
                (res.contentType || '').includes('font') ? '.woff2' : '';

    const safePath = `r${fileIndex}${ext}`;
    fileIndex++;

    await fs.writeFile(path.join(outputDir, 'cache', safePath), res.body);
    urlMap[resUrl] = { localFile: safePath, contentType: res.contentType, size: res.size };
    totalSize += res.size;
  }

  await fs.writeFile(path.join(outputDir, 'url-map.json'), JSON.stringify(urlMap, null, 2));

  console.log(`\nSaved ${allResources.size} resources (${(totalSize/1024/1024).toFixed(2)} MB)`);
  console.log(`Output: ${outputDir}`);

  await browser.close();

  // Start proxy server immediately
  console.log('\n[Starting local server...]');

  const PORT = 3333;
  const lookup = {};
  for (const [u, info] of Object.entries(urlMap)) {
    try {
      const urlObj = new URL(u);
      lookup[urlObj.pathname] = info;
      lookup[urlObj.pathname + urlObj.search] = info;
    } catch (e) {}
  }

  const server = http.createServer((req, res) => {
    // CORS
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Allow-Headers': '*'
      });
      return res.end();
    }

    const reqPath = req.url.split('?')[0];
    const fullPath = req.url;

    // Check local cache
    const cached = lookup[fullPath] || lookup[reqPath];
    if (cached) {
      const filePath = path.join(outputDir, 'cache', cached.localFile);
      if (existsSync(filePath)) {
        res.writeHead(200, {
          'Content-Type': cached.contentType || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'max-age=31536000'
        });
        return createReadStream(filePath).pipe(res);
      }
    }

    // Proxy to origin
    const targetUrl = origin + req.url;
    const client = origin.startsWith('https') ? https : http;

    const proxyReq = client.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': req.headers.accept || '*/*',
        'Accept-Encoding': 'identity'
      }
    }, proxyRes => {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', () => {
      res.writeHead(500);
      res.end('Proxy error');
    });
  });

  server.listen(PORT, () => {
    console.log('');
    console.log('='.repeat(60));
    console.log('CAPTURE COMPLETE - SERVER RUNNING');
    console.log('='.repeat(60));
    console.log(`\nResources cached: ${allResources.size}`);
    console.log(`Missing resources will be proxied from: ${origin}`);
    console.log(`\nOpen: http://localhost:${PORT}`);
    console.log('\nPress Ctrl+C to stop the server.');
  });
}

main().catch(console.error);
