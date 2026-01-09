#!/usr/bin/env node
/**
 * V6 ULTIMATE EXTRACTOR - Truly exhaustive capture
 *
 * Beyond v6-total, this adds:
 * 1. All event types (drag, touch, right-click, etc.)
 * 2. All file format handlers (drop each type)
 * 3. All browser permissions
 * 4. Print/fullscreen/resize handlers
 * 5. Clipboard operations
 * 6. All keyboard combinations
 * 7. Canvas/WebGL operations
 * 8. Audio context
 * 9. Every possible code path trigger
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const allResources = new Map();
const allTriggers = [];

async function captureResource(response) {
  const url = response.url();
  if (url.startsWith('data:') || url.startsWith('blob:')) return;
  if (allResources.has(url)) return;

  try {
    const contentType = response.headers()['content-type'] || '';
    const body = await response.body();
    allResources.set(url, { url, contentType, body, size: body.length });

    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (['.wasm', '.js', '.mjs'].includes(ext) || contentType.includes('wasm')) {
      console.log(`  [+] ${ext || 'js'} ${(body.length/1024).toFixed(0)}KB - ${url.substring(0, 60)}`);
    }
  } catch (e) {}
}

async function triggerAllEvents(page) {
  console.log('\n  [EVENTS] Triggering all event types...');

  await page.evaluate(() => {
    const events = [
      // Mouse events
      'click', 'dblclick', 'mousedown', 'mouseup', 'mousemove',
      'mouseenter', 'mouseleave', 'mouseover', 'mouseout', 'contextmenu',
      // Touch events
      'touchstart', 'touchend', 'touchmove', 'touchcancel',
      // Drag events
      'drag', 'dragstart', 'dragend', 'dragenter', 'dragleave', 'dragover', 'drop',
      // Keyboard events
      'keydown', 'keyup', 'keypress',
      // Focus events
      'focus', 'blur', 'focusin', 'focusout',
      // Form events
      'input', 'change', 'submit', 'reset',
      // Clipboard events
      'copy', 'cut', 'paste',
      // Window events
      'resize', 'scroll', 'load', 'unload', 'beforeunload',
      // Visibility
      'visibilitychange',
      // Pointer events
      'pointerdown', 'pointerup', 'pointermove', 'pointerenter', 'pointerleave',
      // Wheel
      'wheel',
      // Animation
      'animationstart', 'animationend', 'animationiteration',
      'transitionstart', 'transitionend',
    ];

    events.forEach(eventType => {
      try {
        const event = new Event(eventType, { bubbles: true, cancelable: true });
        document.dispatchEvent(event);
        document.body.dispatchEvent(event);
      } catch (e) {}
    });
  });

  await page.waitForTimeout(1000);
}

async function triggerRightClick(page) {
  console.log('  [RIGHT-CLICK] Triggering context menus...');

  // Right click on canvas
  const canvas = await page.$('canvas');
  if (canvas) {
    await canvas.click({ button: 'right' });
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
  }

  // Right click on various elements
  const elements = await page.$$('div, button, img');
  for (const el of elements.slice(0, 10)) {
    try {
      await el.click({ button: 'right' });
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape');
    } catch (e) {}
  }
}

async function triggerDragDrop(page) {
  console.log('  [DRAG] Triggering drag operations...');

  await page.evaluate(() => {
    // Simulate drag events on body
    const dragEvents = ['dragenter', 'dragover', 'dragleave', 'drop'];
    dragEvents.forEach(eventType => {
      const event = new DragEvent(eventType, {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer()
      });
      document.body.dispatchEvent(event);
    });
  });

  await page.waitForTimeout(500);
}

async function triggerClipboard(page) {
  console.log('  [CLIPBOARD] Triggering clipboard operations...');

  // Select all and copy
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+x');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
}

async function triggerAllKeyboardCombos(page) {
  console.log('  [KEYBOARD] Triggering all keyboard combinations...');

  // All letters
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');

  // Plain letters (tool shortcuts)
  for (const key of letters) {
    await page.keyboard.press(key);
    await page.waitForTimeout(100);
  }

  // Ctrl + letters
  for (const key of letters) {
    await page.keyboard.press(`Control+${key}`);
    await page.waitForTimeout(100);
  }

  // Ctrl + Shift + letters
  for (const key of letters.slice(0, 10)) {
    await page.keyboard.press(`Control+Shift+${key}`);
    await page.waitForTimeout(100);
  }

  // Alt + letters
  for (const key of letters.slice(0, 10)) {
    await page.keyboard.press(`Alt+${key}`);
    await page.waitForTimeout(100);
  }

  // Function keys
  for (let i = 1; i <= 12; i++) {
    await page.keyboard.press(`F${i}`);
    await page.waitForTimeout(100);
  }

  // Numbers
  for (let i = 0; i <= 9; i++) {
    await page.keyboard.press(`${i}`);
    await page.waitForTimeout(50);
    await page.keyboard.press(`Control+${i}`);
    await page.waitForTimeout(50);
  }

  // Special keys
  const specialKeys = [
    'Escape', 'Tab', 'Space', 'Enter', 'Backspace', 'Delete',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown',
    'Insert', 'PrintScreen',
    'BracketLeft', 'BracketRight', 'Backslash', 'Slash',
    'Comma', 'Period', 'Semicolon', 'Quote',
    'Minus', 'Equal', 'Backquote'
  ];

  for (const key of specialKeys) {
    try {
      await page.keyboard.press(key);
      await page.waitForTimeout(50);
    } catch (e) {}
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

async function triggerResize(page) {
  console.log('  [RESIZE] Triggering window resize...');

  const sizes = [
    { width: 800, height: 600 },
    { width: 1920, height: 1080 },
    { width: 375, height: 812 },  // iPhone
    { width: 1440, height: 900 }, // Back to normal
  ];

  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.waitForTimeout(500);
  }
}

async function triggerFullscreen(page) {
  console.log('  [FULLSCREEN] Triggering fullscreen...');

  try {
    await page.keyboard.press('F11');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } catch (e) {}
}

async function triggerPrint(page) {
  console.log('  [PRINT] Triggering print dialog...');

  try {
    await page.keyboard.press('Control+p');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
  } catch (e) {}
}

async function triggerZoom(page) {
  console.log('  [ZOOM] Triggering zoom levels...');

  // Zoom in/out
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Control+=');
    await page.waitForTimeout(200);
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Control+-');
    await page.waitForTimeout(200);
  }
  await page.keyboard.press('Control+0'); // Reset
  await page.waitForTimeout(500);
}

async function triggerUndo(page) {
  console.log('  [HISTORY] Triggering undo/redo...');

  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
  }
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(200);
  }
}

async function openAllDialogs(page) {
  console.log('  [DIALOGS] Opening all dialogs...');

  // Common dialog triggers
  const dialogTriggers = [
    { keys: 'Control+n', name: 'New' },
    { keys: 'Control+o', name: 'Open' },
    { keys: 'Control+s', name: 'Save' },
    { keys: 'Control+Shift+s', name: 'Save As' },
    { keys: 'Control+Shift+e', name: 'Export' },
    { keys: 'Control+p', name: 'Print' },
    { keys: 'Control+,', name: 'Settings' },
    { keys: 'F1', name: 'Help' },
    { keys: 'Control+k', name: 'Preferences' },
  ];

  for (const trigger of dialogTriggers) {
    try {
      await page.keyboard.press(trigger.keys);
      await page.waitForTimeout(800);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } catch (e) {}
  }
}

async function clickAllMenusDeep(page) {
  console.log('  [MENUS] Deep menu exploration...');

  // Find menu bar items
  const menuBar = await page.$$('div[class*="menu"] > div, [role="menubar"] > *, nav > ul > li');

  for (const menuItem of menuBar.slice(0, 15)) {
    try {
      await menuItem.click();
      await page.waitForTimeout(500);

      // Click submenu items
      const subItems = await page.$$('[role="menuitem"], [class*="menu-item"], [class*="dropdown"] li');
      for (const subItem of subItems.slice(0, 20)) {
        try {
          const text = await subItem.textContent();
          // Skip dangerous items
          if (text && !text.match(/delete|remove|close|quit|exit/i)) {
            await subItem.click();
            await page.waitForTimeout(400);
            await page.keyboard.press('Escape');
          }
        } catch (e) {}
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } catch (e) {}
  }
}

async function triggerCanvasOperations(page) {
  console.log('  [CANVAS] Triggering canvas operations...');

  const canvas = await page.$('canvas');
  if (!canvas) return;

  const box = await canvas.boundingBox();
  if (!box) return;

  // Drawing operations
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  // Draw lines
  await page.mouse.move(centerX - 100, centerY - 100);
  await page.mouse.down();
  await page.mouse.move(centerX + 100, centerY + 100, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Draw circle motion
  for (let i = 0; i < 360; i += 30) {
    const x = centerX + Math.cos(i * Math.PI / 180) * 50;
    const y = centerY + Math.sin(i * Math.PI / 180) * 50;
    await page.mouse.move(x, y);
    await page.waitForTimeout(50);
  }

  // Double click
  await page.mouse.dblclick(centerX, centerY);
  await page.waitForTimeout(300);
}

async function simulateFileTypes(page) {
  console.log('  [FILES] Simulating file type detection...');

  // This triggers file type handlers by simulating drag with different MIME types
  await page.evaluate(() => {
    const mimeTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'image/vnd.adobe.photoshop', // PSD
      'application/pdf',
      'image/tiff',
      'application/postscript', // AI
      'application/x-sketch', // Sketch
    ];

    mimeTypes.forEach(mimeType => {
      const dataTransfer = new DataTransfer();
      const file = new File([''], 'test', { type: mimeType });
      dataTransfer.items.add(file);

      const dragEvent = new DragEvent('dragenter', {
        bubbles: true,
        dataTransfer
      });
      document.body.dispatchEvent(dragEvent);

      const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        dataTransfer
      });
      document.body.dispatchEvent(dragOverEvent);
    });
  });

  await page.waitForTimeout(1000);
}

async function main() {
  const url = process.argv[2] || 'https://www.photopea.com';
  const baseUrl = new URL(url);
  const origin = baseUrl.origin;

  const domain = baseUrl.hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = path.join(__dirname, '..', 'output', `${domain}-ultimate-${timestamp}`);

  await fs.mkdir(path.join(outputDir, 'cache'), { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 ULTIMATE EXTRACTOR');
  console.log('='.repeat(60));
  console.log('URL:', url);
  console.log('Output:', outputDir);
  console.log('\nThis will trigger EVERY possible code path.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write', 'geolocation', 'notifications'],
  });
  const page = await context.newPage();

  page.on('response', captureResource);

  try {
    console.log('[PHASE 1] Initial load...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    console.log(`  Resources: ${allResources.size}`);

    console.log('\n[PHASE 2] Launch app...');
    try {
      await page.click('text=/start using photopea/i', { timeout: 5000 });
      await page.waitForTimeout(8000);
    } catch (e) {}
    console.log(`  Resources: ${allResources.size}`);

    console.log('\n[PHASE 3] Automated triggers...');

    await triggerAllEvents(page);
    console.log(`  Resources: ${allResources.size}`);

    await triggerAllKeyboardCombos(page);
    console.log(`  Resources: ${allResources.size}`);

    await triggerRightClick(page);
    console.log(`  Resources: ${allResources.size}`);

    await triggerDragDrop(page);
    console.log(`  Resources: ${allResources.size}`);

    await triggerClipboard(page);
    console.log(`  Resources: ${allResources.size}`);

    await openAllDialogs(page);
    console.log(`  Resources: ${allResources.size}`);

    await clickAllMenusDeep(page);
    console.log(`  Resources: ${allResources.size}`);

    await triggerCanvasOperations(page);
    console.log(`  Resources: ${allResources.size}`);

    await triggerZoom(page);
    console.log(`  Resources: ${allResources.size}`);

    await triggerResize(page);
    console.log(`  Resources: ${allResources.size}`);

    await triggerUndo(page);
    console.log(`  Resources: ${allResources.size}`);

    await simulateFileTypes(page);
    console.log(`  Resources: ${allResources.size}`);

    console.log('\n[PHASE 4] User interaction...');
    console.log('\n' + '='.repeat(50));
    console.log('YOUR TURN - Use features we might have missed:');
    console.log('='.repeat(50));
    console.log('\n• DROP IN ACTUAL FILES (JPG, PNG, PSD)');
    console.log('• Use filters (Filter > Blur, Sharpen, etc.)');
    console.log('• Use adjustments (Image > Adjustments)');
    console.log('• Try different tools');
    console.log('• Export to different formats');
    console.log('\nPress ENTER when done...\n');

    await new Promise(resolve => rl.once('line', resolve));

    console.log('\n[PHASE 5] Final capture...');
    await page.waitForTimeout(3000);
    console.log(`  Final resources: ${allResources.size}`);

    // Get HTML
    const finalHtml = await page.content();

    // Save everything
    console.log('\n[PHASE 6] Saving...');

    const urlMap = {};
    let stats = { js: 0, css: 0, wasm: 0, img: 0, font: 0, other: 0 };
    let totalSize = 0;

    for (const [resUrl, res] of allResources) {
      const urlObj = new URL(resUrl);
      const safePath = urlObj.pathname.replace(/[^a-zA-Z0-9.-]/g, '_') || 'index';
      await fs.mkdir(path.dirname(path.join(outputDir, 'cache', safePath)), { recursive: true });
      await fs.writeFile(path.join(outputDir, 'cache', safePath), res.body);

      urlMap[resUrl] = { localFile: safePath, contentType: res.contentType, size: res.size };
      totalSize += res.size;

      const ct = res.contentType?.toLowerCase() || '';
      const ext = path.extname(urlObj.pathname).toLowerCase();
      if (ct.includes('javascript') || ['.js', '.mjs'].includes(ext)) stats.js++;
      else if (ct.includes('css')) stats.css++;
      else if (ct.includes('wasm') || ext === '.wasm') stats.wasm++;
      else if (ct.includes('image')) stats.img++;
      else if (ct.includes('font')) stats.font++;
      else stats.other++;
    }

    await fs.writeFile(path.join(outputDir, 'url-map.json'), JSON.stringify(urlMap, null, 2));
    await fs.writeFile(path.join(outputDir, 'original.html'), finalHtml);

    // Create server
    const serverScript = `#!/usr/bin/env node
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3333;
const TARGET = '${origin}';

const urlMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'url-map.json'), 'utf8'));
const html = fs.readFileSync(path.join(__dirname, 'original.html'), 'utf8');

const lookup = {};
for (const [url, info] of Object.entries(urlMap)) {
  try { lookup[new URL(url).pathname] = info; } catch(e) {}
}

console.log('ULTIMATE EXTRACTION SERVER');
console.log('Resources:', Object.keys(urlMap).length);
console.log('http://localhost:' + PORT);

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' });
    return res.end();
  }

  const p = req.url.split('?')[0];

  if (p === '/' || p === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
    return res.end(html);
  }

  const cached = lookup[p] || lookup[req.url];
  if (cached && fs.existsSync(path.join(__dirname, 'cache', cached.localFile))) {
    console.log('[CACHE]', p.substring(0, 50));
    res.writeHead(200, { 'Content-Type': cached.contentType || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    return fs.createReadStream(path.join(__dirname, 'cache', cached.localFile)).pipe(res);
  }

  console.log('[PROXY]', p.substring(0, 50));
  const client = TARGET.startsWith('https') ? https : http;
  client.get(TARGET + req.url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, pr => {
    res.writeHead(pr.statusCode, { 'Content-Type': pr.headers['content-type'] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    pr.pipe(res);
  }).on('error', () => { res.writeHead(500); res.end('Error'); });
}).listen(PORT);
`;

    await fs.writeFile(path.join(outputDir, 'serve.js'), serverScript);
    await page.screenshot({ path: path.join(outputDir, 'screenshot.png') });

    console.log('\n' + '='.repeat(60));
    console.log('ULTIMATE EXTRACTION COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nResources: ${allResources.size} (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`  JS: ${stats.js}, CSS: ${stats.css}, WASM: ${stats.wasm}`);
    console.log(`  Images: ${stats.img}, Fonts: ${stats.font}, Other: ${stats.other}`);
    console.log(`\nTo run:\n  cd ${outputDir}\n  node serve.js`);

  } finally {
    rl.close();
    await browser.close();
  }
}

main().catch(console.error);
