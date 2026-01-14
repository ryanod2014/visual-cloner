#!/usr/bin/env node
/**
 * Fetch Photopea JS bundles directly
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.join(__dirname, '..', 'extracted-functions');

// Known bundle URLs from addPP() function
const BUNDLES = [
  'https://www.photopea.com/code/ext/ext1767565813.js',
  'https://www.photopea.com/code/dbs/DBS1764527275.js',
  'https://www.photopea.com/code/pp/pp1768039294.js'
];

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching Photopea bundles...\n');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let allCode = '';

  for (const url of BUNDLES) {
    const name = url.split('/').pop();
    console.log(`Fetching ${name}...`);

    try {
      const code = await fetch(url);
      console.log(`  Size: ${(code.length / 1024 / 1024).toFixed(2)} MB`);

      fs.writeFileSync(path.join(OUTPUT_DIR, name), code);
      allCode += code + '\n';
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }

  console.log(`\nTotal code: ${(allCode.length / 1024 / 1024).toFixed(2)} MB`);

  // Analyze the code
  console.log('\nAnalyzing functions...\n');

  const functions = new Map();

  // Find function patterns
  const patterns = [
    /function\s+([a-zA-Z_$][a-zA-Z0-9_$]{2,})\s*\(([^)]*)\)/g,
    /([a-zA-Z_$][a-zA-Z0-9_$]{2,})\s*:\s*function\s*\(([^)]*)\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(allCode)) !== null) {
      const name = match[1];
      const params = match[2].trim();
      const pos = match.index;

      if (functions.has(name)) continue;

      // Get function body
      const bodyStart = allCode.indexOf('{', pos);
      if (bodyStart === -1 || bodyStart > pos + 200) continue;

      let depth = 1, end = bodyStart + 1;
      while (depth > 0 && end < allCode.length && end < bodyStart + 20000) {
        if (allCode[end] === '{') depth++;
        if (allCode[end] === '}') depth--;
        end++;
      }

      const body = allCode.slice(bodyStart, end);

      // Score for image processing likelihood
      let score = 0;
      if (/Uint8Array|Float32Array|Float64Array/.test(body)) score += 3;
      if (/\[\s*\w+\s*\+\s*[0-3]\s*\]/.test(body)) score += 3; // pixel access pattern
      if (/Math\.(sin|cos|sqrt|pow|abs|min|max)/.test(body)) score += 2;
      if (/blend|alpha|gamma|hue|saturation|brightness|contrast/i.test(body)) score += 2;
      if (/pixel|rgba|color/i.test(body)) score += 1;
      if (/for\s*\(/.test(body) && body.length > 200) score += 1;

      functions.set(name, { name, params, score, bodyLen: body.length, pos });
    }
  }

  const sorted = [...functions.values()].sort((a, b) => b.score - a.score);
  const imageProc = sorted.filter(f => f.score >= 4);

  console.log(`Total named functions: ${functions.size}`);
  console.log(`Image processing candidates: ${imageProc.length}\n`);

  console.log('TOP 30 IMAGE PROCESSING FUNCTIONS:');
  console.log('='.repeat(50));
  for (const fn of imageProc.slice(0, 30)) {
    console.log(`  ${fn.name}(${fn.params.slice(0, 30)}${fn.params.length > 30 ? '...' : ''}) [score:${fn.score}]`);
  }

  // Save analysis
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'function-analysis.json'),
    JSON.stringify({ total: functions.size, imageProc: imageProc.length, top: imageProc.slice(0, 100) }, null, 2)
  );

  console.log('\nDone!');
}

main().catch(console.error);
