#!/usr/bin/env node
/**
 * Simple test server for the Photopea complete clone
 * Tests offline functionality without state capture
 */

import http from 'http';
import fs from 'fs';
import { createReadStream, existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const outputDir = process.argv[2] || path.join(process.cwd(), 'output', 'photopea.com-complete-1767957633072');
const PORT = 3340;

if (!existsSync(outputDir)) {
  console.log('Error: Output directory not found:', outputDir);
  process.exit(1);
}

// Load url-map.json
const urlMapPath = path.join(outputDir, 'url-map.json');
const urlMap = JSON.parse(readFileSync(urlMapPath, 'utf8'));

// Load index.html
const indexPath = path.join(outputDir, 'index.html');
const indexHtml = readFileSync(indexPath, 'utf8');

console.log('Loaded', Object.keys(urlMap).length, 'resources');

// Create lookup by path
const lookup = {};
for (const [url, meta] of Object.entries(urlMap)) {
  const urlObj = new URL(url);
  lookup[urlObj.pathname] = meta;
  lookup[url] = meta;
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*'
    });
    return res.end();
  }

  const reqPath = req.url.split('?')[0].split('#')[0];

  // Serve index
  if (reqPath === '/' || reqPath === '/index.html') {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(indexHtml);
  }

  // Try to find in cache
  let cached = lookup[req.url] || lookup[reqPath];

  // Try with full URLs
  if (!cached) {
    cached = lookup['https://www.photopea.com' + reqPath] ||
             lookup['https://vecpea.com' + reqPath];
  }

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
  console.log('PHOTOPEA OFFLINE TEST SERVER');
  console.log('='.repeat(60));
  console.log('\nCached: ' + Object.keys(urlMap).length + ' resources');
  console.log('Server: http://localhost:' + PORT);
  console.log('\nTest URLs:');
  console.log('  http://localhost:' + PORT + '/?test=1');
  console.log('  http://localhost:' + PORT + '/#data');
  console.log('\n[MISS] messages show uncaptured resources.');
  console.log('Press Ctrl+C to stop');
});
