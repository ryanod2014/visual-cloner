#!/usr/bin/env node
/**
 * V6 STATE CAPTURE - Complete Offline with Initialization State
 *
 * Enhancement: Captures the initialized application state after full load
 * - Global objects and variables
 * - localStorage and sessionStorage
 * - Any initialization data
 *
 * Then injects this state before scripts run offline to achieve 100% functionality
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
  const basePaths = ['/', '/code/', '/js/', '/assets/', '/static/'];

  for (const base of basePaths) {
    for (let i = 0; i < 100; i++) {
      chunkUrls.add(origin + base + i + '.js');
      chunkUrls.add(origin + base + 'chunk-' + i + '.js');
      chunkUrls.add(origin + base + i + '.chunk.js');
    }
  }

  console.log('  Generated ' + chunkUrls.size + ' brute-force URLs');
  return chunkUrls;
}

async function fetchAllChunks(page, chunkUrls) {
  console.log('\n[PHASE 4] Fetching potential chunks...');

  const chunks = Array.from(chunkUrls);
  let found = 0;

  for (const chunkUrl of chunks) {
    if (attemptedUrls.has(chunkUrl)) continue;
    attemptedUrls.add(chunkUrl);

    try {
      const body = await page.evaluate(async (url) => {
        const res = await fetch(url);
        if (!res.ok) return null;
        return res.arrayBuffer();
      }, chunkUrl);

      if (body) found++;
    } catch (e) {}
  }

  console.log('  Found ' + found + ' valid chunks');
}

async function exhaustFeatures(page) {
  console.log('\n[PHASE 5] Exhausting UI features...');

  try {
    await page.evaluate(() => {
      const clicks = [...document.querySelectorAll('button, [role="button"], a')]
        .filter(el => el.offsetParent !== null).slice(0, 10);
      for (const el of clicks) el.click();
    });
    await page.waitForTimeout(1000);
  } catch (e) {}
}

/**
 * NEW: Capture complete application state after initialization
 */
async function captureApplicationState(page) {
  console.log('\n[PHASE 7] Capturing application state...');

  const state = await page.evaluate(() => {
    const captured = {
      timestamp: Date.now(),
      url: window.location.href,
      localStorage: {},
      sessionStorage: {},
      globals: {},
      customData: {}
    };

    // Capture localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        captured.localStorage[key] = localStorage.getItem(key);
      }
    } catch (e) {}

    // Capture sessionStorage
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        captured.sessionStorage[key] = sessionStorage.getItem(key);
      }
    } catch (e) {}

    // Capture important global objects (serializable only)
    const globalKeys = Object.keys(window).filter(key => {
      // Skip standard browser APIs
      const standardApis = ['document', 'navigator', 'location', 'history', 'screen',
                           'performance', 'crypto', 'indexedDB', 'localStorage',
                           'sessionStorage', 'console', 'alert', 'confirm', 'prompt'];
      return !standardApis.includes(key) &&
             !key.startsWith('webkit') &&
             !key.startsWith('on') &&
             key.length < 50;
    });

    for (const key of globalKeys) {
      try {
        const value = window[key];
        const type = typeof value;

        // Only capture serializable primitives and simple objects
        if (type === 'string' || type === 'number' || type === 'boolean') {
          captured.globals[key] = value;
        } else if (type === 'object' && value !== null) {
          // Try to serialize - if it fails, skip it
          try {
            const serialized = JSON.parse(JSON.stringify(value));
            // Only capture if reasonably sized
            if (JSON.stringify(serialized).length < 100000) {
              captured.globals[key] = serialized;
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    // Look for app-specific config objects
    const configPatterns = ['config', 'Config', 'CONFIG', '__config', '__CONFIG',
                           'settings', 'Settings', 'appConfig', 'appState',
                           'initialState', 'INITIAL_STATE'];

    for (const pattern of configPatterns) {
      if (window[pattern] && typeof window[pattern] === 'object') {
        try {
          captured.customData[pattern] = JSON.parse(JSON.stringify(window[pattern]));
        } catch (e) {}
      }
    }

    return captured;
  });

  console.log('  Captured:');
  console.log('    - localStorage keys:', Object.keys(state.localStorage).length);
  console.log('    - sessionStorage keys:', Object.keys(state.sessionStorage).length);
  console.log('    - global variables:', Object.keys(state.globals).length);
  console.log('    - custom config objects:', Object.keys(state.customData).length);

  return state;
}

/**
 * Generate state injection script to restore app state before scripts run
 */
function generateStateInjectionScript(state) {
  return `
<script>
// State injection for offline functionality
(function() {
  console.log('[STATE INJECTION] Restoring captured application state...');

  // Restore localStorage
  const ls = ${JSON.stringify(state.localStorage)};
  for (const [key, value] of Object.entries(ls)) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }

  // Restore sessionStorage
  const ss = ${JSON.stringify(state.sessionStorage)};
  for (const [key, value] of Object.entries(ss)) {
    try {
      sessionStorage.setItem(key, value);
    } catch (e) {}
  }

  // Restore global variables
  const globals = ${JSON.stringify(state.globals)};
  for (const [key, value] of Object.entries(globals)) {
    try {
      if (!(key in window)) {
        window[key] = value;
      }
    } catch (e) {}
  }

  // Restore custom config objects
  const customData = ${JSON.stringify(state.customData)};
  for (const [key, value] of Object.entries(customData)) {
    try {
      window[key] = value;
    } catch (e) {}
  }

  console.log('[STATE INJECTION] Restored', Object.keys(ls).length, 'localStorage items,',
              Object.keys(ss).length, 'sessionStorage items,',
              Object.keys(globals).length, 'globals,',
              Object.keys(customData).length, 'config objects');
})();
</script>
`;
}

// Main extraction
(async () => {
  const url = process.argv[2] || 'https://www.photopea.com';
  if (!url.startsWith('http')) {
    console.log('Usage: node v6-state-capture.js <url>');
    process.exit(1);
  }

  const origin = new URL(url).origin;
  const domain = new URL(url).hostname;
  const outputDir = path.join(process.cwd(), 'output', domain + '-state-' + Date.now());

  await fs.mkdir(path.join(outputDir, 'cache'), { recursive: true });
  console.log('Output: ' + outputDir);

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  let appState = null;

  page.on('response', async (response) => {
    const resUrl = response.url();
    if (allResources.has(resUrl)) return;

    try {
      const body = await response.body();
      if (body.length > 0) {
        allResources.set(resUrl, {
          body,
          contentType: response.headers()['content-type'] || '',
          size: body.length,
          status: response.status()
        });
      }
    } catch (e) {}
  });

  try {
    console.log('\n[PHASE 1] Loading page...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    console.log('  Initial: ' + allResources.size + ' resources');

    // Trigger app initialization if needed
    try {
      const btn = await page.$('text=/start using photopea/i');
      if (btn) {
        await btn.click();
        console.log('  Clicked start button, waiting for initialization...');
        await page.waitForTimeout(8000);
      }
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

    // NEW: Capture application state
    appState = await captureApplicationState(page);

  } catch (e) {
    console.log('Error:', e.message);
  }

  console.log('\n[SAVING...]');
  let finalHtml = await page.content();

  // Generate and inject state restoration script
  const stateScript = appState ? generateStateInjectionScript(appState) : '';

  // Inject BEFORE any other scripts (right after <head>)
  finalHtml = finalHtml.replace(/<head>/i, '<head>' + stateScript);

  const urlMap = {};
  let totalSize = 0;
  let i = 0;

  for (const [resUrl, res] of allResources) {
    const ct = res.contentType || '';
    const ext = ct.includes('javascript') ? '.js' :
                ct.includes('css') ? '.css' :
                ct.includes('wasm') ? '.wasm' :
                ct.includes('image/png') ? '.png' :
                ct.includes('image/jpeg') ? '.jpg' :
                ct.includes('image/webp') ? '.webp' :
                ct.includes('font') ? '.woff2' : '';
    const safePath = 'r' + i + ext;
    i++;
    await fs.writeFile(path.join(outputDir, 'cache', safePath), res.body);
    urlMap[resUrl] = { localFile: safePath, contentType: res.contentType, size: res.size };
    totalSize += res.size;
  }

  await fs.writeFile(path.join(outputDir, 'url-map.json'), JSON.stringify(urlMap, null, 2));
  if (appState) {
    await fs.writeFile(path.join(outputDir, 'app-state.json'), JSON.stringify(appState, null, 2));
  }
  await fs.writeFile(path.join(outputDir, 'index.html'), finalHtml);
  await browser.close();

  console.log('\nSaved ' + allResources.size + ' resources (' + (totalSize/1024/1024).toFixed(2) + ' MB)');
  if (appState) {
    console.log('Saved application state to app-state.json');
  }

  // OFFLINE server with state injection
  console.log('\n[Starting OFFLINE server with state injection...]');

  const PORT = 3340;
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
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Allow-Headers': '*'
      });
      return res.end();
    }

    const reqPath = req.url.split('?')[0];
    if (reqPath === '/' || reqPath === '/index.html') {
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(indexHtml);
    }

    const cached = lookup[req.url] || lookup[reqPath];
    if (cached && existsSync(path.join(outputDir, 'cache', cached.localFile))) {
      res.writeHead(200, {
        'Content-Type': cached.contentType || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      });
      return createReadStream(path.join(outputDir, 'cache', cached.localFile)).pipe(res);
    }

    console.log('  [MISS] ' + req.url);
    res.writeHead(404);
    res.end('Not captured');
  }).listen(PORT, () => {
    console.log('');
    console.log('='.repeat(60));
    console.log('100% OFFLINE SERVER WITH STATE INJECTION');
    console.log('='.repeat(60));
    console.log('\nCached: ' + allResources.size + ' resources');
    console.log('State: localStorage + sessionStorage + globals restored');
    console.log('Server: http://localhost:' + PORT);
    console.log('\n[MISS] messages show uncaptured resources.');
    console.log('Try adding ?test=1 or #data to trigger script loading');
  });
})();
