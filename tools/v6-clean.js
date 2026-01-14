#!/usr/bin/env node
/**
 * V6 CLEAN - Resource Capture WITHOUT DOM Modification
 * Captures Photopea with correct patching (keeps Photopea mode, bypasses restrictions)
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

  const scriptSrcs = await page.evaluate(() => {
    return [...document.querySelectorAll('script[src]')].map(s => s.src);
  });

  console.log('  Found ' + scriptSrcs.length + ' script tags');

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

      // Webpack chunk manifest
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

      // Quoted chunk filenames
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

      // WASM files
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

async function main() {
  const url = process.argv[2] || 'https://www.photopea.com';
  const origin = new URL(url).origin;
  const domain = new URL(url).hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = path.join(__dirname, '..', 'output', domain + '-clean-' + timestamp);

  await fs.mkdir(path.join(outputDir, 'cache'), { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 CLEAN - Resource Capture (Photopea Mode)');
  console.log('='.repeat(60));
  console.log('URL:', url);
  console.log('Output:', outputDir);
  console.log('');

  const browser = await chromium.launch({ headless: false, args: ['--disable-web-security'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
  const page = await context.newPage();

  // Capture all network responses
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

  let originalHtml = '';

  try {
    console.log('\n[PHASE 1] Loading page...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    console.log('  Initial: ' + allResources.size + ' resources');

    // SAVE THE ORIGINAL LANDING PAGE HTML BEFORE ANY CLICKS
    originalHtml = await page.content();
    console.log('  Saved original HTML (' + originalHtml.length + ' bytes)');

    // Click to load JS bundles (needed for resource capture)
    console.log('\n[PHASE 2] Loading app (clicking Start)...');
    try {
      const btn = await page.$('text=/start using photopea/i');
      if (btn) {
        await btn.click();
        await page.waitForTimeout(8000);
        console.log('  After app load: ' + allResources.size + ' resources');
      }
    } catch (e) {}

    const manifestChunks = await extractChunkManifest(page, origin);
    const bruteChunks = await bruteForceChunks(origin);
    const allChunks = new Set([...manifestChunks, ...bruteChunks]);

    await fetchAllChunks(page, allChunks);
    console.log('  Total: ' + allResources.size + ' resources');

    console.log('\n[PHASE 5] Final wait for any pending loads...');
    await page.waitForTimeout(2000);
    console.log('  Final: ' + allResources.size + ' resources');

  } catch (e) {
    console.log('Error:', e.message);
  }

  // Use the ORIGINAL landing page HTML (saved before clicking)
  console.log('\n[SAVING...]');

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
  await fs.writeFile(path.join(outputDir, 'index.html'), originalHtml);
  await browser.close();

  console.log('\nSaved ' + allResources.size + ' resources (' + (totalSize/1024/1024).toFixed(2) + ' MB)');
  console.log('Output: ' + outputDir);

  // Start server with CORRECT patching (lm==99 to bypass restrictions, keep Photopea mode)
  console.log('\n[Starting server with patches...]');

  const PORT = 3333;
  const lookup = {};
  for (const [u, info] of Object.entries(urlMap)) {
    try {
      const p = new URL(u).pathname;
      lookup[p] = info;
      lookup[p.split('?')[0]] = info;
    } catch (e) {}
  }

  // Find and patch main Photopea code
  let patchedR9 = null;
  const ppJsEntry = Object.entries(urlMap).find(([url]) => url.includes('/code/pp/pp'));
  if (ppJsEntry) {
    const [ppUrl, ppInfo] = ppJsEntry;
    const ppPath = new URL(ppUrl).pathname;
    let r9Content = readFileSync(path.join(outputDir, 'cache', ppInfo.localFile), 'utf-8');
    let patchCount = 0;

    // CORRECT PATCH: Replace lm==0 with lm==99 (always false)
    // This keeps Photopea mode but bypasses all feature restrictions
    const lm0Count = (r9Content.match(/lm==0/g) || []).length;
    if (lm0Count > 0) {
      r9Content = r9Content.replace(/lm==0/g, 'lm==99');
      console.log('  PATCH: Replaced ' + lm0Count + ' instances of lm==0 -> lm==99');
      patchCount += lm0Count;
    }

    // Also patch lm!=0 to lm!=99 (always true)
    const lmNot0Count = (r9Content.match(/lm!=0/g) || []).length;
    if (lmNot0Count > 0) {
      r9Content = r9Content.replace(/lm!=0/g, 'lm!=99');
      console.log('  PATCH: Replaced ' + lmNot0Count + ' instances of lm!=0 -> lm!=99');
      patchCount += lmNot0Count;
    }

    // OLD PATTERN fallback: J.adQ() function
    const startPattern = /J\.adQ\s*=\s*function\s*\(\s*\)\s*\{/;
    const startMatch = r9Content.match(startPattern);
    if (startMatch) {
      const startIndex = startMatch.index + startMatch[0].length;
      let braceCount = 1, endIndex = startIndex;
      while (braceCount > 0 && endIndex < r9Content.length) {
        if (r9Content[endIndex] === '{') braceCount++;
        if (r9Content[endIndex] === '}') braceCount--;
        endIndex++;
      }
      while (endIndex < r9Content.length && r9Content[endIndex] !== ';') endIndex++;
      endIndex++;
      r9Content = r9Content.substring(0, startMatch.index) + 'J.adQ=function(){return 1;};' + r9Content.substring(endIndex);
      console.log('  PATCH (old): J.adQ() -> return 1');
      patchCount++;
    }

    // OLD PATTERN fallback: ak6 flag
    const ak6Pattern = /if\s*\(\s*\$\s*==\s*0\s*\)\s*this\.ak6\s*=\s*!\s*0\s*;/g;
    if (ak6Pattern.test(r9Content)) {
      r9Content = r9Content.replace(ak6Pattern, 'if($==0)this.ak6=!1;');
      console.log('  PATCH (old): ak6 -> always false');
      patchCount++;
    }

    if (patchCount === 0) {
      console.log('  WARNING: No patch patterns matched!');
    }

    patchedR9 = { content: r9Content, path: ppPath };
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

    // Serve patched JS
    if (patchedR9 && reqPath === patchedR9.path) {
      console.log('  [PATCHED] ' + reqPath);
      res.writeHead(200, { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' });
      return res.end(patchedR9.content);
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
    console.log('SERVER READY (Photopea with bypassed restrictions)');
    console.log('='.repeat(60));
    console.log('\nCached: ' + allResources.size + ' resources');
    console.log('Server: http://localhost:' + PORT);
    console.log('\nOpen in browser to test!');
  });
}

main().catch(console.error);
