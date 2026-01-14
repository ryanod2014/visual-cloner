#!/usr/bin/env node
/**
 * V6 SYSTEMATIC EXTRACTOR
 *
 * Methodically explores EVERY UI element:
 * 1. Maps entire menu tree
 * 2. Clicks every menu item
 * 3. Cycles through every dropdown option
 * 4. Toggles every checkbox/toggle
 * 5. Adjusts every slider
 * 6. Explores every dialog fully
 * 7. Uses every tool with every option
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const allResources = new Map();
const exploredElements = new Set();
const menuTree = {};

async function captureResource(response) {
  const url = response.url();
  if (url.startsWith('data:') || url.startsWith('blob:')) return;
  if (allResources.has(url)) return;
  try {
    const body = await response.body();
    allResources.set(url, {
      url,
      contentType: response.headers()['content-type'] || '',
      body,
      size: body.length
    });
  } catch (e) {}
}

// Get unique identifier for an element
async function getElementId(element) {
  return await element.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const text = el.textContent?.substring(0, 30) || '';
    const tag = el.tagName;
    const className = el.className?.toString().substring(0, 30) || '';
    return `${tag}-${className}-${text}-${Math.round(rect.x)}-${Math.round(rect.y)}`;
  });
}

// Find all interactive elements in current view
async function findInteractiveElements(page) {
  return await page.evaluate(() => {
    const elements = [];
    const seen = new Set();

    const selectors = [
      'button', 'a', '[role="button"]', '[role="menuitem"]', '[role="option"]',
      '[role="tab"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
      '[role="slider"]', '[role="combobox"]', '[role="listbox"]',
      'input', 'select', 'textarea',
      '[onclick]', '[class*="btn"]', '[class*="button"]', '[class*="click"]',
      '[class*="menu"]', '[class*="dropdown"]', '[class*="option"]',
      '[class*="tool"]', '[class*="item"]', '[class*="tab"]',
      '[class*="toggle"]', '[class*="check"]', '[class*="select"]',
      '[tabindex]:not([tabindex="-1"])',
      'summary', 'details', 'label'
    ];

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 &&
            rect.top >= 0 && rect.top < window.innerHeight &&
            rect.left >= 0 && rect.left < window.innerWidth) {
          const id = `${el.tagName}-${rect.x.toFixed(0)}-${rect.y.toFixed(0)}`;
          if (!seen.has(id)) {
            seen.add(id);
            elements.push({
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
              width: rect.width,
              height: rect.height,
              tag: el.tagName,
              text: el.textContent?.trim().substring(0, 50) || '',
              type: el.getAttribute('type') || el.getAttribute('role') || 'unknown',
              id: id
            });
          }
        }
      });
    });

    return elements;
  });
}

// Find all menu items currently visible
async function findMenuItems(page) {
  return await page.evaluate(() => {
    const items = [];
    const menuSelectors = [
      '[role="menuitem"]', '[role="option"]',
      '[class*="menu-item"]', '[class*="menuitem"]',
      '[class*="dropdown-item"]', '[class*="option"]',
      'li[class*="menu"]', '.menu li', '.dropdown li',
      '[class*="MenuItem"]', '[class*="DropdownItem"]'
    ];

    menuSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.y > 0 && rect.y < window.innerHeight) {
          items.push({
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
            text: el.textContent?.trim().substring(0, 50) || '',
            hasSubmenu: el.querySelector('[class*="arrow"]') !== null ||
                       el.querySelector('[class*="submenu"]') !== null ||
                       el.getAttribute('aria-haspopup') === 'true'
          });
        }
      });
    });

    return items;
  });
}

// Explore a menu recursively
async function exploreMenu(page, menuName, depth = 0) {
  if (depth > 5) return; // Prevent infinite recursion

  const indent = '  '.repeat(depth + 2);
  const items = await findMenuItems(page);

  for (const item of items) {
    const itemId = `${menuName}-${item.text}`;
    if (exploredElements.has(itemId)) continue;
    exploredElements.add(itemId);

    // Skip dangerous items
    if (item.text.match(/delete|remove|clear all|reset|quit|exit|close/i)) {
      console.log(`${indent}[SKIP] ${item.text}`);
      continue;
    }

    console.log(`${indent}${item.text}${item.hasSubmenu ? ' ▸' : ''}`);

    try {
      const beforeCount = allResources.size;

      // Click the item
      await page.mouse.click(item.x, item.y);
      await page.waitForTimeout(500);

      // Check if new resources loaded
      if (allResources.size > beforeCount) {
        console.log(`${indent}  [+${allResources.size - beforeCount} resources]`);
      }

      // If it has submenu, explore it
      if (item.hasSubmenu) {
        await exploreMenu(page, itemId, depth + 1);
      }

      // Check if a dialog opened
      const dialog = await page.$('[role="dialog"], [class*="modal"], [class*="dialog"], [class*="popup"]');
      if (dialog) {
        await exploreDialog(page, item.text);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

    } catch (e) {}
  }
}

// Explore a dialog systematically
async function exploreDialog(page, dialogName) {
  console.log(`    [DIALOG] Exploring: ${dialogName}`);

  // Find all interactive elements in dialog
  const elements = await findInteractiveElements(page);

  for (const el of elements) {
    const elId = `dialog-${dialogName}-${el.id}`;
    if (exploredElements.has(elId)) continue;
    exploredElements.add(elId);

    try {
      if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'switch') {
        // Toggle checkboxes
        await page.mouse.click(el.x, el.y);
        await page.waitForTimeout(200);
        await page.mouse.click(el.x, el.y); // Toggle back
        await page.waitForTimeout(200);
      } else if (el.type === 'slider' || el.tag === 'INPUT' && el.type === 'range') {
        // Move sliders
        await page.mouse.click(el.x - el.width/3, el.y);
        await page.waitForTimeout(100);
        await page.mouse.click(el.x + el.width/3, el.y);
        await page.waitForTimeout(100);
      } else if (el.tag === 'SELECT' || el.type === 'combobox' || el.type === 'listbox') {
        // Cycle through select options
        await page.mouse.click(el.x, el.y);
        await page.waitForTimeout(300);
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press('ArrowDown');
          await page.waitForTimeout(100);
        }
        await page.keyboard.press('Escape');
      }
    } catch (e) {}
  }
}

// Explore all tools in toolbar
async function exploreToolbar(page) {
  console.log('\n  [TOOLBAR] Exploring all tools...');

  const tools = await page.evaluate(() => {
    const toolElements = [];
    const toolSelectors = [
      '[class*="tool"]:not([class*="toolbar"])',
      '[class*="Tool"]:not([class*="Toolbar"])',
      '[role="button"][class*="tool"]',
      '[data-tool]',
      '.toolbar button',
      '.toolbox button'
    ];

    toolSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 5 && rect.height > 5 && rect.width < 100 && rect.height < 100) {
          toolElements.push({
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
            title: el.getAttribute('title') || el.getAttribute('aria-label') || ''
          });
        }
      });
    });

    return toolElements;
  });

  console.log(`    Found ${tools.length} tool buttons`);

  for (const tool of tools) {
    const toolId = `tool-${tool.x}-${tool.y}`;
    if (exploredElements.has(toolId)) continue;
    exploredElements.add(toolId);

    try {
      const beforeCount = allResources.size;

      // Click tool
      await page.mouse.click(tool.x, tool.y);
      await page.waitForTimeout(300);

      // Long press for tool options
      await page.mouse.down();
      await page.waitForTimeout(800);
      await page.mouse.up();
      await page.waitForTimeout(300);

      // Right click for options
      await page.mouse.click(tool.x, tool.y, { button: 'right' });
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');

      if (allResources.size > beforeCount) {
        console.log(`    [+${allResources.size - beforeCount}] ${tool.title || 'tool'}`);
      }
    } catch (e) {}
  }
}

// Explore all panels/sidebars
async function explorePanels(page) {
  console.log('\n  [PANELS] Exploring all panels...');

  const panels = await page.evaluate(() => {
    const panelElements = [];
    const panelSelectors = [
      '[class*="panel"]', '[class*="Panel"]',
      '[class*="sidebar"]', '[class*="Sidebar"]',
      '[role="tabpanel"]', '[class*="tab-content"]'
    ];

    panelSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 50) {
          panelElements.push({
            x: rect.x + rect.width / 2,
            y: rect.y + 20,
            name: el.getAttribute('aria-label') || el.className.substring(0, 30)
          });
        }
      });
    });

    return panelElements;
  });

  for (const panel of panels) {
    // Find clickable items within panel
    const items = await page.evaluate((panelY) => {
      const clickables = [];
      document.querySelectorAll('*').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.y > panelY - 50 && rect.y < panelY + 200 &&
            rect.width > 10 && rect.height > 10 &&
            (el.onclick || el.getAttribute('role') === 'button' ||
             el.tagName === 'BUTTON' || el.classList.contains('clickable'))) {
          clickables.push({
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2
          });
        }
      });
      return clickables.slice(0, 20);
    }, panel.y);

    for (const item of items) {
      try {
        await page.mouse.click(item.x, item.y);
        await page.waitForTimeout(200);
      } catch (e) {}
    }
  }
}

// Cycle through all blend modes
async function exploreBlendModes(page) {
  console.log('\n  [BLEND MODES] Cycling through blend modes...');

  // Find blend mode dropdown
  const blendDropdown = await page.$('[class*="blend"], select[class*="mode"], [aria-label*="blend"]');
  if (blendDropdown) {
    await blendDropdown.click();
    await page.waitForTimeout(300);

    // Press down arrow many times to cycle through
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);
    }
    await page.keyboard.press('Escape');
  }
}

// Explore filter menu exhaustively
async function exploreFilters(page) {
  console.log('\n  [FILTERS] Exploring all filters...');

  // Click Filter menu
  try {
    await page.click('text="Filter"', { timeout: 2000 });
    await page.waitForTimeout(500);
    await exploreMenu(page, 'Filter', 0);
    await page.keyboard.press('Escape');
  } catch (e) {
    console.log('    Filter menu not found');
  }
}

// Explore adjustments
async function exploreAdjustments(page) {
  console.log('\n  [ADJUSTMENTS] Exploring adjustments...');

  try {
    await page.click('text="Image"', { timeout: 2000 });
    await page.waitForTimeout(500);

    // Look for Adjustments submenu
    const adjustmentsItem = await page.$('text="Adjustments"');
    if (adjustmentsItem) {
      await adjustmentsItem.hover();
      await page.waitForTimeout(500);
      await exploreMenu(page, 'Adjustments', 1);
    }

    await page.keyboard.press('Escape');
  } catch (e) {
    console.log('    Adjustments menu not found');
  }
}

async function main() {
  const url = process.argv[2] || 'https://www.photopea.com';
  const origin = new URL(url).origin;
  const domain = new URL(url).hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = path.join(__dirname, '..', 'output', `${domain}-systematic-${timestamp}`);

  await fs.mkdir(path.join(outputDir, 'cache'), { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 SYSTEMATIC EXTRACTOR');
  console.log('='.repeat(60));
  console.log('URL:', url);
  console.log('\nThis will methodically explore EVERY UI element.\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('response', captureResource);

  try {
    // Phase 1: Load
    console.log('[1/8] Loading page...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    console.log(`  Resources: ${allResources.size}`);

    // Phase 2: Launch app
    console.log('\n[2/8] Launching app...');
    try {
      await page.click('text=/start using photopea/i', { timeout: 5000 });
      await page.waitForTimeout(8000);
    } catch (e) {}
    console.log(`  Resources: ${allResources.size}`);

    // Phase 3: Explore all menus
    console.log('\n[3/8] Exploring all menus...');
    const menuNames = ['File', 'Edit', 'Image', 'Layer', 'Select', 'Filter', 'View', 'Window', 'More'];

    for (const menuName of menuNames) {
      try {
        console.log(`\n  [MENU] ${menuName}`);
        await page.click(`text="${menuName}"`, { timeout: 2000 });
        await page.waitForTimeout(500);
        await exploreMenu(page, menuName, 1);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } catch (e) {
        console.log(`    Menu "${menuName}" not found`);
      }
    }
    console.log(`\n  Resources after menus: ${allResources.size}`);

    // Phase 4: Explore toolbar
    console.log('\n[4/8] Exploring toolbar...');
    await exploreToolbar(page);
    console.log(`  Resources: ${allResources.size}`);

    // Phase 5: Explore panels
    console.log('\n[5/8] Exploring panels...');
    await explorePanels(page);
    console.log(`  Resources: ${allResources.size}`);

    // Phase 6: Blend modes
    console.log('\n[6/8] Exploring blend modes...');
    await exploreBlendModes(page);
    console.log(`  Resources: ${allResources.size}`);

    // Phase 7: Filters
    console.log('\n[7/8] Exploring filters...');
    await exploreFilters(page);
    console.log(`  Resources: ${allResources.size}`);

    // Phase 8: Adjustments
    console.log('\n[8/8] Exploring adjustments...');
    await exploreAdjustments(page);
    console.log(`  Resources: ${allResources.size}`);

    // Final wait
    console.log('\n[FINAL] Waiting for any pending loads...');
    await page.waitForTimeout(5000);
    console.log(`  Final resources: ${allResources.size}`);

    // Save
    console.log('\n[SAVING]...');
    const finalHtml = await page.content();

    const urlMap = {};
    let totalSize = 0;

    let fileIndex = 0;
    for (const [resUrl, res] of allResources) {
      // Simple indexed filenames to avoid any path issues
      const ext = (res.contentType || '').includes('javascript') ? '.js' :
                  (res.contentType || '').includes('css') ? '.css' :
                  (res.contentType || '').includes('html') ? '.html' :
                  (res.contentType || '').includes('json') ? '.json' :
                  (res.contentType || '').includes('wasm') ? '.wasm' :
                  (res.contentType || '').includes('image/png') ? '.png' :
                  (res.contentType || '').includes('image/jpeg') ? '.jpg' :
                  (res.contentType || '').includes('image/gif') ? '.gif' :
                  (res.contentType || '').includes('image/svg') ? '.svg' :
                  (res.contentType || '').includes('font') ? '.woff2' : '';
      const safePath = `r${fileIndex}${ext}`;
      fileIndex++;
      await fs.writeFile(path.join(outputDir, 'cache', safePath), res.body);
      urlMap[resUrl] = { localFile: safePath, contentType: res.contentType, size: res.size };
      totalSize += res.size;
    }

    await fs.writeFile(path.join(outputDir, 'url-map.json'), JSON.stringify(urlMap, null, 2));
    await fs.writeFile(path.join(outputDir, 'original.html'), finalHtml);
    await fs.writeFile(path.join(outputDir, 'explored-elements.json'), JSON.stringify([...exploredElements], null, 2));

    // Server
    const serverScript = `#!/usr/bin/env node
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3333, TARGET = '${origin}';
const urlMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'url-map.json'), 'utf8'));
const html = fs.readFileSync(path.join(__dirname, 'original.html'), 'utf8');
const lookup = {}; for (const [u, i] of Object.entries(urlMap)) { try { lookup[new URL(u).pathname] = i; } catch(e) {} }
console.log('SYSTEMATIC EXTRACTION SERVER\\nResources:', Object.keys(urlMap).length, '\\nhttp://localhost:' + PORT);
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' }); return res.end(); }
  const p = req.url.split('?')[0];
  if (p === '/' || p === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' }); return res.end(html); }
  const c = lookup[p] || lookup[req.url];
  if (c && fs.existsSync(path.join(__dirname, 'cache', c.localFile))) { res.writeHead(200, { 'Content-Type': c.contentType || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' }); return fs.createReadStream(path.join(__dirname, 'cache', c.localFile)).pipe(res); }
  const cl = TARGET.startsWith('https') ? https : http;
  cl.get(TARGET + req.url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, pr => { res.writeHead(pr.statusCode, { 'Content-Type': pr.headers['content-type'] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' }); pr.pipe(res); }).on('error', () => { res.writeHead(500); res.end('Error'); });
}).listen(PORT);`;

    await fs.writeFile(path.join(outputDir, 'serve.js'), serverScript);
    await page.screenshot({ path: path.join(outputDir, 'screenshot.png') });

    console.log('\n' + '='.repeat(60));
    console.log('SYSTEMATIC EXTRACTION COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nExplored: ${exploredElements.size} UI elements`);
    console.log(`Captured: ${allResources.size} resources (${(totalSize/1024/1024).toFixed(2)} MB)`);
    console.log(`\nTo run:\n  cd ${outputDir}\n  node serve.js`);

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
