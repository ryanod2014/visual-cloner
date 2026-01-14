#!/usr/bin/env node
/**
 * Serve existing extraction with the NEW lm=1 patch
 */

import http from 'http';
import fs from 'fs/promises';
import { existsSync, createReadStream, readFileSync } from 'fs';
import path from 'path';

const OUTPUT_DIR = '/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/output/photopea.com-clean-1768283773209';
const PORT = 3333;

async function main() {
  const urlMap = JSON.parse(readFileSync(path.join(OUTPUT_DIR, 'url-map.json'), 'utf-8'));

  const lookup = {};
  for (const [u, info] of Object.entries(urlMap)) {
    try {
      const p = new URL(u).pathname;
      lookup[p] = info;
      lookup[p.split('?')[0]] = info;
    } catch (e) {}
  }

  // Find and patch main Photopea JS
  let patchedR9 = null;
  const ppJsEntry = Object.entries(urlMap).find(([url]) => url.includes('/code/pp/pp'));
  if (ppJsEntry) {
    const [ppUrl, ppInfo] = ppJsEntry;
    const ppPath = new URL(ppUrl).pathname;
    let r9Content = readFileSync(path.join(OUTPUT_DIR, 'cache', ppInfo.localFile), 'utf-8');

    console.log('\nApplying patches...');
    console.log('  File:', ppInfo.localFile);
    console.log('  Path:', ppPath);
    console.log('  Size:', (r9Content.length / 1024 / 1024).toFixed(2), 'MB');

    // NEW PATTERN (2025+): Replace all lm==0 checks with lm==99 (always false)
    // This keeps Photopea mode but bypasses all feature restrictions
    const lm0Count = (r9Content.match(/lm==0/g) || []).length;
    if (lm0Count > 0) {
      r9Content = r9Content.replace(/lm==0/g, 'lm==99');
      console.log('  PATCH (new): Replaced ' + lm0Count + ' instances of lm==0 -> lm==99');
    }

    // Also patch lm!=0 to lm!=99 (always true) for feature enabling
    const lmNot0Count = (r9Content.match(/lm!=0/g) || []).length;
    if (lmNot0Count > 0) {
      r9Content = r9Content.replace(/lm!=0/g, 'lm!=99');
      console.log('  PATCH (new): Replaced ' + lmNot0Count + ' instances of lm!=0 -> lm!=99');
    }

    // OLD PATTERN: J.adQ() function (for backwards compat)
    const startPattern = /J\.adQ\s*=\s*function\s*\(\s*\)\s*\{/;
    const startMatch = r9Content.match(startPattern);
    if (startMatch) {
      const startIndex = startMatch.index + startMatch[0].length;
      let braceCount = 1, endIndex = startIndex;
      while (braceCount > 0 && endIndex < r9Content.length) {
        if (r9Content[endIndex] === '{') braceCount++;
        if (r9Content[endIndex] === '}') braceCount--;
        endIndex++;
      }
      while (endIndex < r9Content.length && r9Content[endIndex] !== ';') endIndex++;
      endIndex++;
      r9Content = r9Content.substring(0, startMatch.index) + 'J.adQ=function(){return 1;};' + r9Content.substring(endIndex);
      console.log('  PATCH (old): J.adQ() -> return 1');
    }

    patchedR9 = { content: r9Content, path: ppPath };
  }

  const indexHtml = readFileSync(path.join(OUTPUT_DIR, 'index.html'));

  http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' });
      return res.end();
    }

    const reqPath = req.url.split('?')[0];

    if (reqPath === '/' || reqPath === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
      return res.end(indexHtml);
    }

    // Serve patched JS
    if (patchedR9 && reqPath === patchedR9.path) {
      console.log('  [PATCHED] ' + reqPath);
      res.writeHead(200, { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' });
      return res.end(patchedR9.content);
    }

    const cached = lookup[req.url] || lookup[reqPath];
    if (cached && existsSync(path.join(OUTPUT_DIR, 'cache', cached.localFile))) {
      res.writeHead(200, { 'Content-Type': cached.contentType || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      return createReadStream(path.join(OUTPUT_DIR, 'cache', cached.localFile)).pipe(res);
    }

    console.log('  [MISS] ' + req.url);
    res.writeHead(404);
    res.end('Not captured');
  }).listen(PORT, () => {
    console.log('');
    console.log('='.repeat(60));
    console.log('SERVER READY (with NEW lm=1 patch)');
    console.log('='.repeat(60));
    console.log('\nCached:', Object.keys(urlMap).length, 'resources');
    console.log('Server: http://localhost:' + PORT);
    console.log('\nOpen in browser to test!');
  });
}

main().catch(console.error);
