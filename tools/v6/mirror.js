#!/usr/bin/env node
/**
 * V6 Mirror - Extract and serve with proper module resolution
 * 
 * Instead of concatenating JS, we:
 * 1. Download ALL resources (HTML, JS, CSS, fonts, images)
 * 2. Rewrite URLs to point to local copies
 * 3. Serve via local HTTP server
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import https from 'https';

const VIEWPORT = { width: 1440, height: 900 };

async function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = require('fs').createWriteStream(outputPath);
    client.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadFile(res.headers.location, outputPath).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (e) => { reject(e); });
  });
}

async function main() {
  const url = process.argv[2] || 'https://excalidraw.com';
  const baseUrl = new URL(url);
  
  const domain = baseUrl.hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = './output/' + domain + '-v6-mirror-' + timestamp;
  
  await fs.mkdir(outputDir + '/assets', { recursive: true });
  
  console.log('='.repeat(60));
  console.log('V6 MIRROR - Full Resource Extraction');
  console.log('='.repeat(60));
  console.log('URL:', url);
  console.log('Output:', outputDir);
  console.log('');
  
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: VIEWPORT });
  
  const resources = new Map();
  
  // Intercept ALL responses
  page.on('response', async (response) => {
    const resUrl = response.url();
    const contentType = response.headers()['content-type'] || '';
    
    // Skip data URLs and blob URLs
    if (resUrl.startsWith('data:') || resUrl.startsWith('blob:')) return;
    
    try {
      const body = await response.body();
      resources.set(resUrl, {
        url: resUrl,
        contentType,
        body,
        size: body.length
      });
    } catch (e) {
      // Some responses can't be read (streaming, etc.)
    }
  });
  
  try {
    console.log('[1/4] Navigating and capturing resources...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(3000);

    // Scroll to trigger lazy content
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < pageHeight; y += 500) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(100);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(2000);

    console.log('  Captured', resources.size, 'resources');
    
    // Categorize resources
    const htmlResources = [];
    const jsResources = [];
    const cssResources = [];
    const fontResources = [];
    const imageResources = [];
    const otherResources = [];
    
    for (const [resUrl, res] of resources) {
      const ct = res.contentType.toLowerCase();
      if (ct.includes('html')) htmlResources.push(res);
      else if (ct.includes('javascript')) jsResources.push(res);
      else if (ct.includes('css')) cssResources.push(res);
      else if (ct.includes('font') || resUrl.includes('.woff')) fontResources.push(res);
      else if (ct.includes('image') || ct.includes('svg')) imageResources.push(res);
      else otherResources.push(res);
    }
    
    console.log('  - HTML:', htmlResources.length);
    console.log('  - JS:', jsResources.length, '(' + (jsResources.reduce((a,r) => a + r.size, 0) / 1024 / 1024).toFixed(2) + ' MB)');
    console.log('  - CSS:', cssResources.length);
    console.log('  - Fonts:', fontResources.length);
    console.log('  - Images:', imageResources.length);
    
    // Save all resources
    console.log('\n[2/4] Saving resources...');
    
    const urlToLocal = new Map();
    
    // Save JS files
    for (let i = 0; i < jsResources.length; i++) {
      const res = jsResources[i];
      const filename = 'assets/script-' + i + '.js';
      await fs.writeFile(outputDir + '/' + filename, res.body);
      urlToLocal.set(res.url, filename);
    }
    
    // Save CSS files
    for (let i = 0; i < cssResources.length; i++) {
      const res = cssResources[i];
      const filename = 'assets/style-' + i + '.css';
      await fs.writeFile(outputDir + '/' + filename, res.body);
      urlToLocal.set(res.url, filename);
    }
    
    // Save fonts
    for (let i = 0; i < fontResources.length; i++) {
      const res = fontResources[i];
      const ext = res.url.includes('.woff2') ? '.woff2' : res.url.includes('.woff') ? '.woff' : '.font';
      const filename = 'assets/font-' + i + ext;
      await fs.writeFile(outputDir + '/' + filename, res.body);
      urlToLocal.set(res.url, filename);
    }
    
    // Save images
    for (let i = 0; i < imageResources.length; i++) {
      const res = imageResources[i];
      let ext = '.png';
      if (res.contentType.includes('svg')) ext = '.svg';
      else if (res.contentType.includes('jpeg') || res.contentType.includes('jpg')) ext = '.jpg';
      else if (res.contentType.includes('gif')) ext = '.gif';
      else if (res.contentType.includes('webp')) ext = '.webp';
      const filename = 'assets/image-' + i + ext;
      await fs.writeFile(outputDir + '/' + filename, res.body);
      urlToLocal.set(res.url, filename);
    }
    
    console.log('  Saved', urlToLocal.size, 'files');
    
    // Get the page HTML and rewrite URLs
    console.log('\n[3/4] Rewriting HTML with local URLs...');
    
    let html = await page.content();
    
    // Rewrite script src URLs
    for (const [originalUrl, localPath] of urlToLocal) {
      // Handle both absolute and relative URLs
      const patterns = [
        originalUrl,
        originalUrl.replace(baseUrl.origin, ''),
        new URL(originalUrl).pathname
      ];
      
      for (const pattern of patterns) {
        if (pattern && html.includes(pattern)) {
          html = html.split(pattern).join(localPath);
        }
      }
    }
    
    // Add base tag for relative URLs that weren't rewritten
    if (!html.includes('<base')) {
      html = html.replace('<head>', '<head>\n  <base href="' + baseUrl.origin + '/">');
    }
    
    await fs.writeFile(outputDir + '/index.html', html);
    
    // Create a simple server script
    console.log('\n[4/4] Creating server...');
    
    const serverScript = `#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3333;
const DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  let filePath = path.join(DIR, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found: ' + req.url);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('Server running at http://localhost:' + PORT);
  console.log('Open this URL in your browser!');
});
`;
    
    await fs.writeFile(outputDir + '/serve.js', serverScript);
    
    // Save URL mapping for debugging
    await fs.writeFile(outputDir + '/url-map.json', JSON.stringify(
      Object.fromEntries(urlToLocal),
      null, 2
    ));
    
    console.log('\n' + '='.repeat(60));
    console.log('MIRROR COMPLETE');
    console.log('='.repeat(60));
    console.log('\nTo run:');
    console.log('  cd ' + outputDir);
    console.log('  node serve.js');
    console.log('  Open http://localhost:3333');
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
