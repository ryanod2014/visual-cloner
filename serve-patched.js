#!/usr/bin/env node
/**
 * Serve Photopea with patched J.adQ function
 */

import http from 'http';
import fs from 'fs';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const OUTPUT_DIR = '/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/output/photopea.com-complete-1767957633072';
const CACHE_DIR = path.join(OUTPUT_DIR, 'cache');
const PORT = 3340;

// Patch r9.js on startup
console.log('Patching r9.js...');
const r9Path = path.join(CACHE_DIR, 'r9.js');
let r9Content = readFileSync(r9Path, 'utf-8');

// Patch J.adQ to always return 1
const adqPattern = /(J\.adQ\s*=\s*function\s*\(\s*\)\s*\{)([\s\S]*?)(\};)/;
const match = r9Content.match(adqPattern);

if (match) {
  console.log('✅ Found J.adQ function, patching...');
  r9Content = r9Content.replace(adqPattern, '$1return 1;$3');
  console.log('✅ Patched J.adQ to always return 1 (valid domain)');
} else {
  console.log('❌ Could not find J.adQ function');
}

// Load url-map
const urlMap = JSON.parse(readFileSync(path.join(OUTPUT_DIR, 'url-map.json'), 'utf-8'));
const lookup = {};
for (const [u, info] of Object.entries(urlMap)) {
  try {
    const p = new URL(u).pathname;
    lookup[p] = info;
    lookup[p.split('?')[0]] = info;
  } catch (e) {}
}

const indexHtml = readFileSync(path.join(OUTPUT_DIR, 'index.html'));

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

  // Serve index
  if (reqPath === '/' || reqPath === '/index.html') {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(indexHtml);
  }

  // Serve PATCHED r9.js
  if (reqPath === '/cache/r9.js') {
    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(r9Content);
  }

  // Serve other cached resources
  const cached = lookup[req.url] || lookup[reqPath];
  if (cached && existsSync(path.join(CACHE_DIR, cached.localFile))) {
    res.writeHead(200, {
      'Content-Type': cached.contentType || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    return fs.createReadStream(path.join(CACHE_DIR, cached.localFile)).pipe(res);
  }

  console.log('  [MISS] ' + req.url);
  res.writeHead(404);
  res.end('Not captured');
}).listen(PORT, () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('PATCHED PHOTOPEA SERVER');
  console.log('='.repeat(60));
  console.log('\nPatch: J.adQ() always returns 1 (valid domain)');
  console.log('Effect: Disables environment protection');
  console.log('Server: http://localhost:' + PORT);
  console.log('\nLoad: http://localhost:' + PORT + '/?test=1');
  console.log('\nTry clicking "New Project" - it should work!');
});
