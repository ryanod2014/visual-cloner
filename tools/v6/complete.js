#!/usr/bin/env node
/**
 * V6 COMPLETE - 100% Offline Capture (No Proxy)
 *
 * Strategy for COMPLETE capture:
 * 1. Extract ALL chunk URLs from webpack manifest
 * 2. Brute-force common chunk patterns (0.js, 1.js, etc.)
 * 3. Trigger every feature programmatically
 * 4. Scan for any dynamic resource patterns
 * 5. Serve completely offline - NO proxy fallback
 */

import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs/promises';
import { existsSync, createReadStream, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const allResources = new Map();
const attemptedUrls = new Set();

async function extractChunkManifest(page, origin) {
  console.log('\n[PHASE 2] Extracting chunk manifest from code...');

  const chunkUrls = new Set();

  // Get all script sources
  const scriptSrcs = await page.evaluate(() => {
    return [...document.querySelectorAll('script[src]')].map(s => s.src);
  });

  console.log('  Found ' + scriptSrcs.length + ' script tags');

  // Download and analyze each main script
  for (const scriptUrl of scriptSrcs) {
    if (attemptedUrls.has(scriptUrl)) continue;
    attemptedUrls.add(scriptUrl);

    try {
      const content = await page.evaluate(async (url) => {
        const res = await fetch(url);
        return res.text();
      }, scriptUrl);

      if (!content || content.length < 100) continue;

      const scriptPath = new URL(scriptUrl).pathname;
      const basePath = scriptPath.substring(0, scriptPath.lastIndexOf('/') + 1);

      // Pattern 1: Webpack chunk manifest {id: "hash"}
      const webpackManifest = content.match(/\{(?:\d+:"[a-f0-9]+",?)+\}/g) || [];
      for (const manifest of webpackManifest) {
        const matches = manifest.match(/(\d+):"([a-f0-9]+)"/g) || [];
        for (const m of matches) {
          const parts = m.match(/(\d+):"([a-f0-9]+)"/);
          if (parts) {
            const [, id, hash] = parts;
            chunkUrls.add(origin + basePath + id + '.' + hash + '.js');
            chunkUrls.add(origin + basePath + hash + '.js');
            chunkUrls.add(origin + basePath + id + '.js');
          }
        }
      }

      // Pattern 2: Quoted chunk filenames
      const quotedChunks = content.match(/["']([^"']*?(?:\d+|chunk|vendor|main)[^"']*?\.js)["']/gi) || [];
      for (const chunk of quotedChunks) {
        const cleaned = chunk.replace(/["']/g, '');
        if (cleaned.startsWith('http')) {
          chunkUrls.add(cleaned);
        } else if (cleaned.startsWith('/')) {
          chunkUrls.add(origin + cleaned);
        } else if (!cleaned.includes(' ') && cleaned.length < 100) {
          chunkUrls.add(origin + basePath + cleaned);
        }
      }

      // Pattern 3: WASM files
      const wasmFiles = content.match(/["']([^"']+\.wasm)["']/gi) || [];
      for (const wasm of wasmFiles) {
        const cleaned = wasm.replace(/["']/g, '');
        chunkUrls.add(origin + basePath + cleaned);
        chunkUrls.add(origin + '/' + cleaned);
      }

    } catch (e) {}
  }

  console.log('  Extracted ' + chunkUrls.size + ' potential chunk URLs');
  return chunkUrls;
}

async function bruteForceChunks(origin) {
  console.log('\n[PHASE 3] Generating brute-force chunk URLs...');

  const chunkUrls = new Set();
  const basePaths = ['/', '/code/', '/js/', '/assets/'];

  // Numbered chunks 0-500
  for (const basePath of basePaths) {
    for (let i = 0; i < 500; i++) {
      chunkUrls.add(origin + basePath + i + '.js');
    }
  }

  console.log('  Generated ' + chunkUrls.size + ' brute-force URLs');
  return chunkUrls;
}

async function fetchAllChunks(page, chunkUrls) {
  console.log('\n[PHASE 4] Fetching all discovered chunks...');

  const toFetch = [...chunkUrls].filter(url => !allResources.has(url) && !attemptedUrls.has(url));
  console.log('  ' + toFetch.length + ' URLs to fetch');

  let fetched = 0;

  const batchSize = 30;
  for (let i = 0; i < toFetch.length; i += batchSize) {
    const batch = toFetch.slice(i, i + batchSize);

    await Promise.all(batch.map(async (url) => {
      attemptedUrls.add(url);
      try {
        const response = await page.evaluate(async (u) => {
          const res = await fetch(u, { method: 'GET' });
          if (!res.ok) return null;
          const buffer = await res.arrayBuffer();
          return {
            contentType: res.headers.get('content-type') || '',
            data: Array.from(new Uint8Array(buffer))
          };
        }, url);

        if (response) {
          allResources.set(url, {
            url,
            contentType: response.contentType,
            body: Buffer.from(response.data),
            size: response.data.length
          });
          fetched++;
        }
      } catch (e) {}
    }));

    if ((i + batchSize) % 200 === 0 || i + batchSize >= toFetch.length) {
      console.log('    Progress: ' + Math.min(i + batchSize, toFetch.length) + '/' + toFetch.length + ' (' + fetched + ' found)');
    }
  }

  console.log('  Fetched ' + fetched + ' new resources');
}

async function exhaustFeatures(page) {
  console.log('\n[PHASE 5] Exhausting all features...');

  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');

  console.log('  Keyboard shortcuts...');
  for (const key of letters) {
    await page.keyboard.press(key);
    await page.waitForTimeout(20);
  }
  await page.keyboard.press('Escape');

  for (const key of letters) {
    if (['w', 'q', 'n'].includes(key)) continue;
    try { await page.keyboard.press('Control+' + key); } catch (e) {}
    await page.waitForTimeout(20);
  }
  await page.keyboard.press('Escape');

  for (const key of letters) {
    try { await page.keyboard.press('Control+Shift+' + key); } catch (e) {}
    await page.waitForTimeout(20);
  }
  await page.keyboard.press('Escape');

  console.log('  Menus...');
  const menuXs = [30, 80, 140, 200, 260, 320, 370, 430, 490];
  for (const x of menuXs) {
    try {
      await page.mouse.click(x, 12);
      await page.waitForTimeout(200);
      for (let y = 40; y < 400; y += 15) {
        await page.mouse.move(x + 80, y);
        await page.waitForTimeout(30);
      }
      await page.keyboard.press('Escape');
    } catch (e) {}
  }

  console.log('  Toolbar...');
  for (let y = 60; y < 600; y += 20) {
    try {
      await page.mouse.click(25, y);
      await page.waitForTimeout(100);
      await page.mouse.down();
      await page.waitForTimeout(300);
      await page.mouse.up();
      await page.keyboard.press('Escape');
    } catch (e) {}
  }

  console.log('  Dialogs...');
  const shortcuts = ['Control+o', 'Control+n', 'Control+Shift+s', 'Control+u', 'Control+l', 'Control+m', 'Control+b', 'Control+t', 'Control+Shift+x'];
  for (const s of shortcuts) {
    try {
      await page.keyboard.press(s);
      await page.waitForTimeout(400);
      await page.keyboard.press('Escape');
    } catch (e) {}
  }
}

async function main() {
  const url = process.argv[2] || 'https://www.photopea.com';
  const origin = new URL(url).origin;
  const domain = new URL(url).hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = path.join(__dirname, '..', 'output', domain + '-complete-' + timestamp);

  await fs.mkdir(path.join(outputDir, 'cache'), { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 COMPLETE - 100% Offline (NO PROXY)');
  console.log('='.repeat(60));
  console.log('URL:', url);
  console.log('');

  const browser = await chromium.launch({ headless: false, args: ['--disable-web-security'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
  const page = await context.newPage();

  page.on('response', async response => {
    const resUrl = response.url();
    if (resUrl.startsWith('data:') || resUrl.startsWith('blob:')) return;
    if (allResources.has(resUrl)) return;
    try {
      const body = await response.body();
      allResources.set(resUrl, { url: resUrl, contentType: response.headers()['content-type'] || '', body, size: body.length });
    } catch (e) {}
  });

  page.on('dialog', async dialog => await dialog.dismiss());

  try {
    console.log('\n[PHASE 1] Loading page...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    console.log('  Initial: ' + allResources.size + ' resources');

    try {
      const btn = await page.$('text=/start using photopea/i');
      if (btn) { await btn.click(); await page.waitForTimeout(8000); }
    } catch (e) {}
    console.log('  After launch: ' + allResources.size + ' resources');

    const manifestChunks = await extractChunkManifest(page, origin);
    const bruteChunks = await bruteForceChunks(origin);
    const allChunks = new Set([...manifestChunks, ...bruteChunks]);
    
    await fetchAllChunks(page, allChunks);
    console.log('  Total: ' + allResources.size + ' resources');

    await exhaustFeatures(page);
    console.log('  Total: ' + allResources.size + ' resources');

    console.log('\n[PHASE 6] Final collection...');
    await page.waitForTimeout(3000);
    console.log('  Final: ' + allResources.size + ' resources');

  } catch (e) {
    console.log('Error:', e.message);
  }

  console.log('\n[SAVING...]');
  const finalHtml = await page.content();
  
  const urlMap = {};
  let totalSize = 0;
  let i = 0;

  for (const [resUrl, res] of allResources) {
    const ct = res.contentType || '';
    const ext = ct.includes('javascript') ? '.js' : ct.includes('css') ? '.css' : ct.includes('wasm') ? '.wasm' : ct.includes('image/png') ? '.png' : ct.includes('image/jpeg') ? '.jpg' : ct.includes('image/webp') ? '.webp' : ct.includes('font') ? '.woff2' : '';
    const safePath = 'r' + i + ext;
    i++;
    await fs.writeFile(path.join(outputDir, 'cache', safePath), res.body);
    urlMap[resUrl] = { localFile: safePath, contentType: res.contentType, size: res.size };
    totalSize += res.size;
  }

  await fs.writeFile(path.join(outputDir, 'url-map.json'), JSON.stringify(urlMap, null, 2));
  await fs.writeFile(path.join(outputDir, 'index.html'), finalHtml);
  await browser.close();

  console.log('\nSaved ' + allResources.size + ' resources (' + (totalSize/1024/1024).toFixed(2) + ' MB)');

  // OFFLINE server - NO PROXY
  console.log('\n[Starting OFFLINE server...]');

  const PORT = 3333;
  const lookup = {};
  for (const [u, info] of Object.entries(urlMap)) {
    try {
      const p = new URL(u).pathname;
      lookup[p] = info;
      lookup[p.split('?')[0]] = info;
    } catch (e) {}
  }

  const indexHtml = readFileSync(path.join(outputDir, 'index.html'));

  http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' });
      return res.end();
    }

    const reqPath = req.url.split('?')[0];
    if (reqPath === '/' || reqPath === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
      return res.end(indexHtml);
    }

    const cached = lookup[req.url] || lookup[reqPath];
    if (cached && existsSync(path.join(outputDir, 'cache', cached.localFile))) {
      res.writeHead(200, { 'Content-Type': cached.contentType || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      return createReadStream(path.join(outputDir, 'cache', cached.localFile)).pipe(res);
    }

    console.log('  [MISS] ' + req.url);
    res.writeHead(404);
    res.end('Not captured');
  }).listen(PORT, () => {
    console.log('');
    console.log('='.repeat(60));
    console.log('100% OFFLINE SERVER (NO PROXY)');
    console.log('='.repeat(60));
    console.log('\nCached: ' + allResources.size + ' resources');
    console.log('Server: http://localhost:' + PORT);
    console.log('\n[MISS] messages show uncaptured resources.');
  });
}

main().catch(console.error);
