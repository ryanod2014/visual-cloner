#!/usr/bin/env node
/**
 * V6 EXHAUSTIVE EXTRACTOR
 *
 * Captures EVERYTHING by:
 * 1. Intercepting ALL network requests (JS, CSS, WASM, workers, fonts, images)
 * 2. Clicking every clickable element to trigger lazy loads
 * 3. Opening every menu, dialog, dropdown
 * 4. Triggering keyboard shortcuts
 * 5. User-guided mode for manual interaction capture
 * 6. Multiple passes to catch conditional loads
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWPORT = { width: 1440, height: 900 };

// Track everything
const allResources = new Map();
const allRequests = [];
const clickedElements = new Set();
const openedMenus = new Set();

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
      status: response.status()
    });

    // Log interesting resources
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (['.wasm', '.js', '.mjs'].includes(ext) || contentType.includes('javascript') || contentType.includes('wasm')) {
      console.log(`  [CAPTURED] ${ext || contentType.split('/')[1]} - ${url.substring(0, 80)}...`);
    }
  } catch (e) {
    // Can't read some responses
  }
}

async function findAllClickables(page) {
  return await page.evaluate(() => {
    const clickables = [];
    const seen = new Set();

    // Find all potentially clickable elements
    const selectors = [
      'button',
      'a',
      '[role="button"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[role="option"]',
      '[onclick]',
      '[ng-click]',
      '[data-action]',
      '[class*="btn"]',
      '[class*="button"]',
      '[class*="click"]',
      '[class*="menu"]',
      '[class*="dropdown"]',
      '[class*="toggle"]',
      '[class*="expand"]',
      '[class*="tab"]',
      '[class*="tool"]',
      'input[type="file"]',
      'input[type="button"]',
      'input[type="submit"]',
      'select',
      '[tabindex]',
      'summary',
      'details',
    ];

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const id = el.id || el.className || el.tagName + rect.x + rect.y;
          if (!seen.has(id)) {
            seen.add(id);
            clickables.push({
              selector: el.id ? `#${el.id}` :
                       el.className ? `.${el.className.split(' ')[0]}` :
                       el.tagName.toLowerCase(),
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
              text: el.textContent?.substring(0, 30) || '',
              tag: el.tagName
            });
          }
        }
      });
    });

    return clickables;
  });
}

async function findAllMenuItems(page) {
  return await page.evaluate(() => {
    const items = [];

    // Common menu item selectors
    const menuSelectors = [
      '[role="menuitem"]',
      '[role="option"]',
      '[class*="menu-item"]',
      '[class*="menuitem"]',
      '[class*="dropdown-item"]',
      'li[class*="menu"]',
      '.menu li',
      '.dropdown li',
    ];

    menuSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.y > 0 && rect.y < window.innerHeight) {
          items.push({
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
            text: el.textContent?.substring(0, 30) || ''
          });
        }
      });
    });

    return items;
  });
}

async function triggerKeyboardShortcuts(page) {
  console.log('\n  [KEYBOARD] Triggering common shortcuts...');

  const shortcuts = [
    // File operations
    { key: 'n', modifiers: ['Control'] },      // New
    { key: 'o', modifiers: ['Control'] },      // Open
    { key: 's', modifiers: ['Control'] },      // Save
    { key: 'z', modifiers: ['Control'] },      // Undo
    { key: 'y', modifiers: ['Control'] },      // Redo
    { key: 'a', modifiers: ['Control'] },      // Select all
    { key: 'c', modifiers: ['Control'] },      // Copy
    { key: 'v', modifiers: ['Control'] },      // Paste

    // View
    { key: '+', modifiers: ['Control'] },      // Zoom in
    { key: '-', modifiers: ['Control'] },      // Zoom out
    { key: '0', modifiers: ['Control'] },      // Reset zoom

    // Tools (common in editors)
    { key: 'v', modifiers: [] },               // Selection
    { key: 'b', modifiers: [] },               // Brush
    { key: 'e', modifiers: [] },               // Eraser
    { key: 't', modifiers: [] },               // Text
    { key: 'g', modifiers: [] },               // Gradient
    { key: 'm', modifiers: [] },               // Marquee
    { key: 'l', modifiers: [] },               // Lasso
    { key: 'w', modifiers: [] },               // Wand
    { key: 'c', modifiers: [] },               // Crop
    { key: 'i', modifiers: [] },               // Eyedropper
    { key: 'p', modifiers: [] },               // Pen
    { key: 'u', modifiers: [] },               // Shape
    { key: 'h', modifiers: [] },               // Hand
    { key: 'r', modifiers: [] },               // Rectangle

    // Function keys
    { key: 'F1', modifiers: [] },              // Help
    { key: 'F5', modifiers: [] },              // Refresh
    { key: 'F11', modifiers: [] },             // Fullscreen
    { key: 'F12', modifiers: [] },             // Dev tools

    // Escape for closing dialogs
    { key: 'Escape', modifiers: [] },
  ];

  for (const shortcut of shortcuts) {
    try {
      if (shortcut.modifiers.includes('Control')) {
        await page.keyboard.down('Control');
      }
      if (shortcut.modifiers.includes('Shift')) {
        await page.keyboard.down('Shift');
      }
      if (shortcut.modifiers.includes('Alt')) {
        await page.keyboard.down('Alt');
      }

      await page.keyboard.press(shortcut.key);

      if (shortcut.modifiers.includes('Alt')) {
        await page.keyboard.up('Alt');
      }
      if (shortcut.modifiers.includes('Shift')) {
        await page.keyboard.up('Shift');
      }
      if (shortcut.modifiers.includes('Control')) {
        await page.keyboard.up('Control');
      }

      await page.waitForTimeout(300);
    } catch (e) {
      // Some shortcuts may cause navigation or errors
    }
  }

  // Close any dialogs that opened
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

async function clickAllElements(page, maxClicks = 100) {
  console.log('\n  [CLICKING] Finding clickable elements...');

  let clickCount = 0;
  let lastResourceCount = allResources.size;

  for (let pass = 0; pass < 3 && clickCount < maxClicks; pass++) {
    console.log(`    Pass ${pass + 1}...`);

    const clickables = await findAllClickables(page);
    console.log(`    Found ${clickables.length} clickable elements`);

    for (const el of clickables) {
      if (clickCount >= maxClicks) break;

      const elId = `${el.x}-${el.y}`;
      if (clickedElements.has(elId)) continue;
      clickedElements.add(elId);

      try {
        // Click the element
        await page.mouse.click(el.x, el.y);
        clickCount++;
        await page.waitForTimeout(500);

        // Check if a menu opened and click its items too
        const menuItems = await findAllMenuItems(page);
        if (menuItems.length > 0) {
          console.log(`      Menu opened with ${menuItems.length} items`);
          for (const item of menuItems.slice(0, 10)) {
            try {
              await page.mouse.click(item.x, item.y);
              await page.waitForTimeout(300);
            } catch (e) {}
          }
        }

        // Close any dialogs
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

      } catch (e) {
        // Element may have moved or been removed
      }
    }

    // Check if we got new resources
    if (allResources.size > lastResourceCount) {
      console.log(`    Got ${allResources.size - lastResourceCount} new resources`);
      lastResourceCount = allResources.size;
    }
  }

  console.log(`    Clicked ${clickCount} elements total`);
}

async function openAllMenus(page) {
  console.log('\n  [MENUS] Opening all menus...');

  // Find menu bars and click each item
  const menuBars = await page.evaluate(() => {
    const menus = [];

    // Common menu bar selectors
    const selectors = [
      '[role="menubar"] > *',
      '.menu-bar > *',
      '.menubar > *',
      '#menu > *',
      'nav > ul > li',
      'header nav > *',
    ];

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          menus.push({
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
            text: el.textContent?.substring(0, 20) || ''
          });
        }
      });
    });

    return menus;
  });

  console.log(`    Found ${menuBars.length} menu items`);

  for (const menu of menuBars) {
    try {
      console.log(`    Opening: ${menu.text}`);
      await page.mouse.click(menu.x, menu.y);
      await page.waitForTimeout(800);

      // Click submenu items
      const subItems = await findAllMenuItems(page);
      for (const item of subItems.slice(0, 15)) {
        try {
          await page.mouse.click(item.x, item.y);
          await page.waitForTimeout(400);
          await page.keyboard.press('Escape');
        } catch (e) {}
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } catch (e) {}
  }
}

async function userGuidedCapture(page) {
  console.log('\n' + '='.repeat(60));
  console.log('USER-GUIDED CAPTURE MODE');
  console.log('='.repeat(60));
  console.log('\nInteract with the app in the browser window.');
  console.log('Every action you take will be captured.');
  console.log('Use ALL features you want to work offline:');
  console.log('  - Open files');
  console.log('  - Use tools');
  console.log('  - Apply filters');
  console.log('  - Export');
  console.log('  - Open settings/preferences');
  console.log('\nPress ENTER when done capturing...\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  await new Promise(resolve => {
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  const url = process.argv[2] || 'https://www.photopea.com';
  const mode = process.argv[3] || 'auto'; // 'auto', 'manual', 'both'
  const baseUrl = new URL(url);
  const origin = baseUrl.origin;

  const domain = baseUrl.hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = path.join(__dirname, '..', 'output', `${domain}-exhaustive-${timestamp}`);

  await fs.mkdir(path.join(outputDir, 'cache'), { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 EXHAUSTIVE EXTRACTOR');
  console.log('='.repeat(60));
  console.log('URL:', url);
  console.log('Mode:', mode);
  console.log('Output:', outputDir);
  console.log('');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  // Intercept ALL requests
  page.on('response', captureResource);

  // Also track request URLs for debugging
  page.on('request', request => {
    allRequests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType()
    });
  });

  try {
    // PHASE 1: Initial page load
    console.log('[PHASE 1] Initial page load...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);
    console.log(`  Captured ${allResources.size} resources`);

    // PHASE 2: Automated interaction
    if (mode === 'auto' || mode === 'both') {
      console.log('\n[PHASE 2] Automated interaction...');

      // Click "Start" or "Launch" buttons to open main app
      const launchButtons = await page.$$('text=/start|launch|open|begin|enter/i');
      for (const btn of launchButtons) {
        try {
          await btn.click();
          await page.waitForTimeout(5000);
        } catch (e) {}
      }

      console.log(`  Resources after launch: ${allResources.size}`);

      // Open all menus
      await openAllMenus(page);
      console.log(`  Resources after menus: ${allResources.size}`);

      // Trigger keyboard shortcuts
      await triggerKeyboardShortcuts(page);
      console.log(`  Resources after shortcuts: ${allResources.size}`);

      // Click various elements
      await clickAllElements(page, 150);
      console.log(`  Resources after clicking: ${allResources.size}`);
    }

    // PHASE 3: User-guided capture
    if (mode === 'manual' || mode === 'both') {
      console.log('\n[PHASE 3] User-guided capture...');
      await userGuidedCapture(page);
      console.log(`  Resources after user interaction: ${allResources.size}`);
    }

    // PHASE 4: Final wait for any pending loads
    console.log('\n[PHASE 4] Final capture...');
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle');

    // Get final HTML
    const finalHtml = await page.content();

    // PHASE 5: Save everything
    console.log('\n[PHASE 5] Saving captured resources...');

    const urlMap = {};
    let jsCount = 0, cssCount = 0, wasmCount = 0, imgCount = 0, fontCount = 0, otherCount = 0;
    let totalSize = 0;

    for (const [resUrl, res] of allResources) {
      const urlObj = new URL(resUrl);
      const safePath = urlObj.pathname.replace(/[^a-zA-Z0-9.-]/g, '_') || 'index';
      const fullPath = path.join(outputDir, 'cache', safePath);

      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, res.body);

      urlMap[resUrl] = {
        localFile: safePath,
        contentType: res.contentType,
        size: res.size
      };

      totalSize += res.size;

      // Categorize
      const ct = res.contentType.toLowerCase();
      const ext = path.extname(urlObj.pathname).toLowerCase();
      if (ct.includes('javascript') || ext === '.js' || ext === '.mjs') jsCount++;
      else if (ct.includes('css') || ext === '.css') cssCount++;
      else if (ct.includes('wasm') || ext === '.wasm') wasmCount++;
      else if (ct.includes('image') || ['.png', '.jpg', '.gif', '.svg', '.webp', '.ico'].includes(ext)) imgCount++;
      else if (ct.includes('font') || ['.woff', '.woff2', '.ttf', '.otf'].includes(ext)) fontCount++;
      else otherCount++;
    }

    await fs.writeFile(path.join(outputDir, 'url-map.json'), JSON.stringify(urlMap, null, 2));
    await fs.writeFile(path.join(outputDir, 'original.html'), finalHtml);
    await fs.writeFile(path.join(outputDir, 'all-requests.json'), JSON.stringify(allRequests, null, 2));

    console.log('\n  Summary:');
    console.log(`    JavaScript: ${jsCount} files`);
    console.log(`    CSS: ${cssCount} files`);
    console.log(`    WebAssembly: ${wasmCount} files`);
    console.log(`    Images: ${imgCount} files`);
    console.log(`    Fonts: ${fontCount} files`);
    console.log(`    Other: ${otherCount} files`);
    console.log(`    Total: ${allResources.size} files (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);

    // Create the proxy server
    console.log('\n[PHASE 6] Creating proxy server...');

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
const originalHtml = fs.readFileSync(path.join(__dirname, 'original.html'), 'utf8');

console.log('Loaded', Object.keys(urlMap).length, 'cached resources');

// Build lookup
const pathLookup = {};
for (const [fullUrl, info] of Object.entries(urlMap)) {
  try {
    const urlObj = new URL(fullUrl);
    pathLookup[urlObj.pathname] = info;
    pathLookup[urlObj.pathname + urlObj.search] = info;
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
    res.writeHead(proxyRes.statusCode || 200, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    proxyRes.pipe(res);
  }).on('error', (e) => {
    console.error('[PROXY ERROR]', targetUrl.substring(0, 60), e.message);
    res.writeHead(500);
    res.end('Proxy error');
  });
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    });
    res.end();
    return;
  }

  const reqPath = req.url.split('?')[0];
  const reqFull = req.url;

  // Serve index for root
  if (reqPath === '/' || reqPath === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
    res.end(originalHtml);
    return;
  }

  // Check cache (try with and without query string)
  const cached = pathLookup[reqFull] || pathLookup[reqPath];
  if (cached) {
    const filePath = path.join(__dirname, 'cache', cached.localFile);
    if (fs.existsSync(filePath)) {
      console.log('[CACHE]', reqPath.substring(0, 50));
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
  console.log('[PROXY]', reqPath.substring(0, 50));
  proxyRequest(targetUrl, res);

}).listen(PORT, () => {
  console.log('');
  console.log('EXHAUSTIVE PROXY SERVER');
  console.log('=======================');
  console.log('http://localhost:' + PORT);
  console.log('');
  console.log('Cached:', Object.keys(urlMap).length, 'resources');
  console.log('Origin:', TARGET_ORIGIN);
  console.log('');
});
`;

    await fs.writeFile(path.join(outputDir, 'serve.js'), serverScript);
    await page.screenshot({ path: path.join(outputDir, 'screenshot.png'), fullPage: true });

    console.log('\n' + '='.repeat(60));
    console.log('EXHAUSTIVE EXTRACTION COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nCaptured ${allResources.size} resources (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`\nTo run:`);
    console.log(`  cd ${outputDir}`);
    console.log(`  node serve.js`);
    console.log(`  Open http://localhost:3333`);

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
