#!/usr/bin/env node
/**
 * FIXED: Serve patched r9.js for the CORRECT path
 */

import http from 'http';
import fs from 'fs';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const OUTPUT_DIR = '/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/output/photopea.com-complete-1767957633072';
const CACHE_DIR = path.join(OUTPUT_DIR, 'cache');
const PORT = 3344;

console.log('Applying DOUBLE PATCH to r9.js...\n');
const r9Path = path.join(CACHE_DIR, 'r9.js');
let r9Content = readFileSync(r9Path, 'utf-8');

// PATCH 1: J.adQ() returns 1
const startPattern = /J\.adQ\s*=\s*function\s*\(\s*\)\s*\{/;
const startMatch = r9Content.match(startPattern);

if (startMatch) {
  const startIndex = startMatch.index + startMatch[0].length;
  let braceCount = 1;
  let endIndex = startIndex;

  while (braceCount > 0 && endIndex < r9Content.length) {
    if (r9Content[endIndex] === '{') braceCount++;
    if (r9Content[endIndex] === '}') braceCount--;
    endIndex++;
  }

  while (endIndex < r9Content.length && r9Content[endIndex] !== ';') {
    endIndex++;
  }
  endIndex++;

  const replacement = 'J.adQ=function(){return 1;};';
  console.log('PATCH 1: J.adQ() → always return 1');

  r9Content = r9Content.substring(0, startMatch.index) +
              replacement +
              r9Content.substring(endIndex);
} else {
  console.log('❌ Could not find J.adQ function');
  process.exit(1);
}

// PATCH 2: Disable line that sets ak6=true
const ak6Pattern = /if\s*\(\s*\$\s*==\s*0\s*\)\s*this\.ak6\s*=\s*!\s*0\s*;/g;
const ak6Matches = r9Content.match(ak6Pattern);

if (ak6Matches && ak6Matches.length > 0) {
  console.log(`PATCH 2: Found ${ak6Matches.length} instances of "if($==0)this.ak6=!0;"`);
  r9Content = r9Content.replace(ak6Pattern, 'if($==0)this.ak6=!1;');
  console.log('         → Changed to "if($==0)this.ak6=!1;" (keep enabled)');
} else {
  const alt = /this\.ak6\s*=\s*!\s*0/g;
  const altMatches = r9Content.match(alt);
  if (altMatches) {
    console.log(`PATCH 2: Found ${altMatches.length} instances of "this.ak6=!0"`);
    console.log('         → Replacing ALL with "this.ak6=!1"');
    r9Content = r9Content.replace(alt, 'this.ak6=!1');
  }
}

console.log('\n✅ Patches applied');
console.log('  File size:', (r9Content.length / 1024 / 1024).toFixed(2), 'MB\n');

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

  if (reqPath === '/' || reqPath === '/index.html') {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(indexHtml);
  }

  // CRITICAL FIX: Serve patched r9.js for the ACTUAL path the browser requests!
  if (reqPath === '/code/pp/pp1767826327.js') {
    console.log('  [PATCHED] Serving double-patched r9.js');
    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(r9Content);
  }

  // Also handle /cache/r9.js just in case
  if (reqPath === '/cache/r9.js') {
    console.log('  [PATCHED] Serving double-patched r9.js (cache path)');
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

  res.writeHead(404);
  res.end('Not captured');
}).listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('FIXED DOUBLE PATCHED SERVER');
  console.log('='.repeat(60));
  console.log('\nPatch 1: J.adQ() returns 1');
  console.log('Patch 2: ak6 never set to true');
  console.log('FIX: Patches served at /code/pp/pp1767826327.js');
  console.log('\nServer: http://localhost:' + PORT);
  console.log('\nThis WILL work now!\n');
});
