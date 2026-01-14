#!/usr/bin/env node
/**
 * V6 AUTO-EXHAUST - Fully automated feature exhaustion
 *
 * Strategy:
 * 1. Load page and capture initial resources
 * 2. Find ALL chunk URLs from webpack manifest / script tags
 * 3. Pre-fetch every chunk regardless of lazy-loading
 * 4. Exhaust all keyboard shortcuts
 * 5. Click through UI systematically
 * 6. Start proxy server when done
 */

import { chromium } from 'playwright';
import http from 'http';
import https from 'https';
import fs from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const allResources = new Map();
const fetchedUrls = new Set();

// All keyboard shortcuts to try
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const NUMBERS = '0123456789'.split('');
const FKEYS = ['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'];
const SPECIAL = ['Escape','Enter','Space','Tab','Backspace','Delete','Home','End','PageUp','PageDown'];

async function prefetchAllChunks(page, origin) {
  console.log('\n[2/6] Finding and pre-fetching ALL code chunks...');

  // Method 1: Find chunk URLs in already-loaded scripts
  const chunkUrls = await page.evaluate((origin) => {
    const urls = new Set();

    // Look for webpack chunk patterns in all scripts
    const scripts = document.querySelectorAll('script[src]');
    scripts.forEach(s => {
      const src = s.getAttribute('src');
      if (src) urls.add(new URL(src, origin).href);
    });

    // Look for preload/prefetch links
    document.querySelectorAll('link[rel="preload"], link[rel="prefetch"], link[rel="modulepreload"]').forEach(link => {
      const href = link.getAttribute('href');
      if (href) urls.add(new URL(href, origin).href);
    });

    // Search for chunk patterns in inline scripts
    const inlineScripts = document.querySelectorAll('script:not([src])');
    inlineScripts.forEach(script => {
      const content = script.textContent || '';
      // Match webpack chunk patterns like "chunk-abc123.js" or "vendors~main.js"
      const matches = content.match(/["']([^"']*?(?:chunk|vendor|main|app|index|runtime)[^"']*?\.(?:js|mjs|wasm))["']/gi) || [];
      matches.forEach(m => {
        const cleaned = m.replace(/["']/g, '');
        try {
          urls.add(new URL(cleaned, origin).href);
        } catch (e) {}
      });

      // Match dynamic import patterns
      const dynamicMatches = content.match(/["']\.\/([^"']+?)\.js["']/g) || [];
      dynamicMatches.forEach(m => {
        const cleaned = m.replace(/["']/g, '').replace('./', '/');
        try {
          urls.add(new URL(cleaned, origin).href);
        } catch (e) {}
      });
    });

    return [...urls];
  }, origin);

  console.log(`  Found ${chunkUrls.length} script URLs in page`);

  // Method 2: Fetch main JS and find all chunk references
  const mainScripts = await page.evaluate(() => {
    return [...document.querySelectorAll('script[src]')]
      .map(s => s.src)
      .filter(src => src.includes('.js'));
  });

  for (const scriptUrl of mainScripts.slice(0, 5)) { // Check first 5 main scripts
    try {
      const response = await page.evaluate(async (url) => {
        const res = await fetch(url);
        return res.text();
      }, scriptUrl);

      // Find webpack chunk mapping patterns
      // Pattern: {"chunk-name": "chunk-hash"} or [id]: "hash"
      const chunkPatterns = [
        /"([a-f0-9]{8,})\.js"/gi,  // hash.js
        /"(chunk-[^"]+\.js)"/gi,   // chunk-xxx.js
        /"([^"]+\.chunk\.js)"/gi,  // xxx.chunk.js
        /"(vendors?[~-][^"]+\.js)"/gi, // vendors~xxx.js
        /["'](\d+\.js)["']/gi,     // 123.js (numbered chunks)
        /["']([^"']+\.wasm)["']/gi, // WASM files
      ];

      for (const pattern of chunkPatterns) {
        const matches = response.match(pattern) || [];
        matches.forEach(m => {
          const cleaned = m.replace(/["']/g, '');
          try {
            // Try relative to script URL
            const baseUrl = new URL(scriptUrl).origin + new URL(scriptUrl).pathname.replace(/\/[^/]+$/, '/');
            chunkUrls.push(new URL(cleaned, baseUrl).href);
          } catch (e) {}
        });
      }
    } catch (e) {}
  }

  // Dedupe and fetch all chunks
  const uniqueChunks = [...new Set(chunkUrls)].filter(u => !fetchedUrls.has(u));
  console.log(`  Total unique chunks to fetch: ${uniqueChunks.length}`);

  let fetched = 0;
  for (const chunkUrl of uniqueChunks) {
    if (fetchedUrls.has(chunkUrl)) continue;
    fetchedUrls.add(chunkUrl);

    try {
      await page.evaluate(async (url) => {
        await fetch(url).catch(() => {});
      }, chunkUrl);
      fetched++;
      if (fetched % 20 === 0) {
        console.log(`    Fetched ${fetched}/${uniqueChunks.length} chunks...`);
      }
    } catch (e) {}
  }

  console.log(`  Pre-fetched ${fetched} chunks`);
}

async function exhaustKeyboardShortcuts(page) {
  console.log('\n[3/6] Exhausting keyboard shortcuts...');

  let triggered = 0;
  const beforeCount = allResources.size;

  // Single keys
  console.log('  Single keys (a-z, 0-9)...');
  for (const key of [...LETTERS, ...NUMBERS]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(50);
    triggered++;
  }

  // Escape any dialogs
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Ctrl + keys
  console.log('  Ctrl+key combinations...');
  for (const key of LETTERS) {
    // Skip dangerous ones
    if (['w', 'q', 'n'].includes(key)) continue;
    await page.keyboard.press(`Control+${key}`);
    await page.waitForTimeout(50);
    triggered++;
  }
  await page.keyboard.press('Escape');

  // Ctrl+Shift + keys
  console.log('  Ctrl+Shift+key combinations...');
  for (const key of LETTERS) {
    await page.keyboard.press(`Control+Shift+${key}`);
    await page.waitForTimeout(50);
    triggered++;
  }
  await page.keyboard.press('Escape');

  // Alt + keys
  console.log('  Alt+key combinations...');
  for (const key of LETTERS) {
    await page.keyboard.press(`Alt+${key}`);
    await page.waitForTimeout(50);
    triggered++;
  }
  await page.keyboard.press('Escape');

  // Function keys
  console.log('  Function keys (F1-F12)...');
  for (const key of FKEYS) {
    try {
      await page.keyboard.press(key);
      await page.waitForTimeout(50);
      triggered++;
    } catch (e) {}
  }
  await page.keyboard.press('Escape');

  // Shift + Function keys
  console.log('  Shift+Function keys...');
  for (const key of FKEYS) {
    try {
      await page.keyboard.press(`Shift+${key}`);
      await page.waitForTimeout(50);
      triggered++;
    } catch (e) {}
  }
  await page.keyboard.press('Escape');

  const newResources = allResources.size - beforeCount;
  console.log(`  Triggered ${triggered} shortcuts, loaded ${newResources} new resources`);
}

async function clickThroughMenus(page) {
  console.log('\n[4/6] Clicking through menus...');

  const beforeCount = allResources.size;

  // Photopea menu bar is at the top - click across it
  const menuY = 12; // Menu bar height
  const menuPositions = [
    { x: 30, name: 'File' },
    { x: 80, name: 'Edit' },
    { x: 140, name: 'Image' },
    { x: 200, name: 'Layer' },
    { x: 260, name: 'Select' },
    { x: 320, name: 'Filter' },
    { x: 370, name: 'View' },
    { x: 430, name: 'Window' },
    { x: 490, name: 'More' },
  ];

  for (const menu of menuPositions) {
    console.log(`  Opening ${menu.name} menu...`);
    try {
      await page.mouse.click(menu.x, menuY);
      await page.waitForTimeout(500);

      // Click through submenu items (move down the menu)
      for (let y = 50; y < 400; y += 25) {
        await page.mouse.move(menu.x + 50, y);
        await page.waitForTimeout(100);

        // Check for submenu arrows (hover to open)
        await page.mouse.move(menu.x + 150, y);
        await page.waitForTimeout(100);
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    } catch (e) {}
  }

  const newResources = allResources.size - beforeCount;
  console.log(`  Loaded ${newResources} new resources from menus`);
}

async function clickThroughTools(page) {
  console.log('\n[5/6] Clicking through toolbar...');

  const beforeCount = allResources.size;

  // Photopea toolbar is on the left side
  const toolbarX = 25;

  // Click down the toolbar
  for (let y = 60; y < 600; y += 30) {
    try {
      // Normal click
      await page.mouse.click(toolbarX, y);
      await page.waitForTimeout(200);

      // Long press for tool options
      await page.mouse.move(toolbarX, y);
      await page.mouse.down();
      await page.waitForTimeout(500);
      await page.mouse.up();
      await page.waitForTimeout(200);

      await page.keyboard.press('Escape');
    } catch (e) {}
  }

  const newResources = allResources.size - beforeCount;
  console.log(`  Loaded ${newResources} new resources from toolbar`);
}

async function triggerFileDialogs(page) {
  console.log('\n[6/6] Triggering file dialogs and features...');

  const beforeCount = allResources.size;

  // These keyboard shortcuts open dialogs that load code
  const dialogShortcuts = [
    { keys: 'Control+o', name: 'Open', escape: true },
    { keys: 'Control+n', name: 'New', escape: true },
    { keys: 'Control+Shift+s', name: 'Save As', escape: true },
    { keys: 'Control+Shift+Alt+s', name: 'Export', escape: true },
    { keys: 'Control+u', name: 'Hue/Saturation', escape: true },
    { keys: 'Control+l', name: 'Levels', escape: true },
    { keys: 'Control+m', name: 'Curves', escape: true },
    { keys: 'Control+b', name: 'Color Balance', escape: true },
    { keys: 'Control+Shift+u', name: 'Desaturate', escape: false },
    { keys: 'Control+i', name: 'Invert', escape: false },
    { keys: 'Control+t', name: 'Transform', escape: true },
    { keys: 'Control+Shift+x', name: 'Liquify', escape: true },
  ];

  for (const shortcut of dialogShortcuts) {
    try {
      console.log(`  ${shortcut.name}...`);
      await page.keyboard.press(shortcut.keys);
      await page.waitForTimeout(800);
      if (shortcut.escape) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
    } catch (e) {}
  }

  const newResources = allResources.size - beforeCount;
  console.log(`  Loaded ${newResources} new resources from dialogs`);
}

async function main() {
  const url = process.argv[2] || 'https://www.photopea.com';
  const baseUrl = new URL(url);
  const origin = baseUrl.origin;
  const domain = baseUrl.hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = path.join(__dirname, '..', 'output', `${domain}-auto-${timestamp}`);

  await fs.mkdir(path.join(outputDir, 'cache'), { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 AUTO-EXHAUST - Fully Automated Capture');
  console.log('='.repeat(60));
  console.log('URL:', url);
  console.log('\nThis will automatically:');
  console.log('  1. Load the app');
  console.log('  2. Pre-fetch ALL code chunks');
  console.log('  3. Trigger every keyboard shortcut');
  console.log('  4. Click through all menus');
  console.log('  5. Click through all tools');
  console.log('  6. Open all dialogs');
  console.log('');

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-web-security']
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
      allResources.set(resUrl, {
        url: resUrl,
        contentType: response.headers()['content-type'] || '',
        body,
        size: body.length
      });
    } catch (e) {}
  });

  // Auto-dismiss dialogs
  page.on('dialog', async dialog => {
    await dialog.dismiss();
  });

  try {
    // Phase 1: Load
    console.log('\n[1/6] Loading page...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    console.log(`  Initial resources: ${allResources.size}`);

    // Launch Photopea app
    try {
      const startButton = await page.$('text=/start using photopea/i');
      if (startButton) {
        console.log('  Launching app...');
        await startButton.click();
        await page.waitForTimeout(8000);
        console.log(`  After launch: ${allResources.size} resources`);
      }
    } catch (e) {}

    // Phase 2: Pre-fetch chunks
    await prefetchAllChunks(page, origin);
    console.log(`  Total resources: ${allResources.size}`);

    // Phase 3: Keyboard shortcuts
    await exhaustKeyboardShortcuts(page);
    console.log(`  Total resources: ${allResources.size}`);

    // Phase 4: Menus
    await clickThroughMenus(page);
    console.log(`  Total resources: ${allResources.size}`);

    // Phase 5: Tools
    await clickThroughTools(page);
    console.log(`  Total resources: ${allResources.size}`);

    // Phase 6: Dialogs
    await triggerFileDialogs(page);
    console.log(`  Total resources: ${allResources.size}`);

    // Final wait for any pending loads
    console.log('\n[Waiting for pending loads...]');
    await page.waitForTimeout(3000);
    console.log(`  Final resources: ${allResources.size}`);

  } catch (e) {
    console.log('Error during capture:', e.message);
  }

  // Save resources
  console.log('\n[Saving resources...]');

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

  await browser.close();

  // Start proxy server
  console.log('\n[Starting proxy server...]');

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
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Allow-Headers': '*'
      });
      return res.end();
    }

    const reqPath = req.url.split('?')[0];
    const cached = lookup[req.url] || lookup[reqPath];

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
    const client = origin.startsWith('https') ? https : http;
    const proxyReq = client.get(origin + req.url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity' }
    }, proxyRes => {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      });
      proxyRes.pipe(res);
    });
    proxyReq.on('error', () => { res.writeHead(500); res.end('Error'); });
  });

  server.listen(PORT, () => {
    console.log('');
    console.log('='.repeat(60));
    console.log('AUTO-EXHAUST COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nCached: ${allResources.size} resources (${(totalSize/1024/1024).toFixed(2)} MB)`);
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`\nMissing resources will be proxied from: ${origin}`);
    console.log('\nPress Ctrl+C to stop.');
  });
}

main().catch(console.error);
