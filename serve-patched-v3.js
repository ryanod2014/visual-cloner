#!/usr/bin/env node
/**
 * Serve Photopea with patched J.adQ function (v3 - with request logging)
 */

import http from 'http';
import fs from 'fs';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const OUTPUT_DIR = '/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/output/photopea.com-complete-1767957633072';
const CACHE_DIR = path.join(OUTPUT_DIR, 'cache');
const PORT = 3342;

// Patch r9.js on startup
console.log('Patching r9.js...');
const r9Path = path.join(CACHE_DIR, 'r9.js');
let r9Content = readFileSync(r9Path, 'utf-8');

// Find and extract J.adQ function with proper brace counting
const startPattern = /J\.adQ\s*=\s*function\s*\(\s*\)\s*\{/;
const startMatch = r9Content.match(startPattern);

if (startMatch) {
  const startIndex = startMatch.index + startMatch[0].length;
  let braceCount = 1;
  let endIndex = startIndex;

  // Count braces to find matching closing brace
  while (braceCount > 0 && endIndex < r9Content.length) {
    if (r9Content[endIndex] === '{') braceCount++;
    if (r9Content[endIndex] === '}') braceCount--;
    endIndex++;
  }

  // Find the semicolon after the closing brace
  while (endIndex < r9Content.length && r9Content[endIndex] !== ';') {
    endIndex++;
  }
  endIndex++; // Include the semicolon

  const replacement = 'J.adQ=function(){return 1;};';

  console.log('✅ Found J.adQ function (', (endIndex - startMatch.index), 'chars)');

  r9Content = r9Content.substring(0, startMatch.index) +
              replacement +
              r9Content.substring(endIndex);

  console.log('✅ Patched to:', replacement);
  console.log('  Patched file size:', (r9Content.length / 1024 / 1024).toFixed(2), 'MB');
} else {
  console.log('❌ Could not find J.adQ function');
  process.exit(1);
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

let requestCount = 0;

http.createServer((req, res) => {
  requestCount++;
  const reqId = requestCount;

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*'
    });
    return res.end();
  }

  const reqPath = req.url.split('?')[0];

  // Log all requests
  console.log(`[${reqId}] ${req.method} ${req.url}`);

  // Serve index
  if (reqPath === '/' || reqPath === '/index.html') {
    console.log(`  → index.html (${indexHtml.length} bytes)`);
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(indexHtml);
  }

  // Serve PATCHED r9.js
  if (reqPath === '/cache/r9.js') {
    console.log(`  → PATCHED r9.js (${r9Content.length} bytes)`);
    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(r9Content);
  }

  // Serve other cached resources
  const cached = lookup[req.url] || lookup[reqPath];
  if (cached && existsSync(path.join(CACHE_DIR, cached.localFile))) {
    const filePath = path.join(CACHE_DIR, cached.localFile);
    const size = fs.statSync(filePath).size;
    console.log(`  → ${cached.localFile} (${size} bytes, ${cached.contentType})`);
    res.writeHead(200, {
      'Content-Type': cached.contentType || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    return fs.createReadStream(filePath).pipe(res);
  }

  console.log(`  → 404 NOT FOUND`);
  res.writeHead(404);
  res.end('Not captured');
}).listen(PORT, () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('PATCHED PHOTOPEA SERVER (V3 - WITH REQUEST LOGGING)');
  console.log('='.repeat(60));
  console.log('\nServer: http://localhost:' + PORT);
  console.log('\nAll requests will be logged below:\n');
});
