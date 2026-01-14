#!/usr/bin/env node
/**
 * Extract Internal Functions from Photopea Bundle
 *
 * 1. Fetch the main JS bundle
 * 2. Parse and extract all function definitions
 * 3. Identify image-processing functions (pixel operations)
 * 4. Output as testable modules
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.join(__dirname, '..', 'extracted-functions');

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Extract Internal Functions from Photopea            ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Track all JS files loaded
  const jsFiles = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.endsWith('.js') && url.includes('photopea.com')) {
      try {
        const content = await response.text();
        jsFiles.push({ url, size: content.length, content });
        console.log(`  Captured: ${url.split('/').pop()} (${(content.length/1024/1024).toFixed(2)} MB)`);
      } catch (e) {}
    }
  });

  console.log('Loading Photopea and capturing JS bundles...\n');
  await page.goto('https://www.photopea.com/', { timeout: 60000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.evaluate(() => { if (typeof addPP === 'function') addPP(); });
  await page.waitForTimeout(15000);

  await browser.close();

  console.log(`\nCaptured ${jsFiles.length} JS files\n`);

  // Find the main bundle (largest file)
  const mainBundle = jsFiles.sort((a, b) => b.size - a.size)[0];
  if (!mainBundle) {
    console.error('No JS bundle found!');
    process.exit(1);
  }

  console.log(`Main bundle: ${mainBundle.url.split('/').pop()}`);
  console.log(`Size: ${(mainBundle.size / 1024 / 1024).toFixed(2)} MB\n`);

  // Save raw bundle
  const bundlePath = path.join(OUTPUT_DIR, 'photopea-bundle.js');
  fs.writeFileSync(bundlePath, mainBundle.content);
  console.log(`Saved: ${bundlePath}\n`);

  // Extract function signatures using regex (fast, no AST parsing needed)
  console.log('Extracting function signatures...\n');

  const code = mainBundle.content;

  // Find all function patterns
  const patterns = [
    // function name(params) { ... }
    /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)\)/g,
    // var name = function(params) { ... }
    /(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*function\s*\(([^)]*)\)/g,
    // name: function(params) { ... }
    /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*function\s*\(([^)]*)\)/g,
    // arrow functions: var name = (params) => ...
    /(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*\(([^)]*)\)\s*=>/g,
  ];

  const functions = new Map();

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const name = match[1];
      const params = match[2].trim();
      const pos = match.index;

      // Skip very short names (minified) or duplicates
      if (name.length < 3) continue;
      if (functions.has(name)) continue;

      // Get a snippet of the function body
      const bodyStart = code.indexOf('{', pos);
      if (bodyStart === -1) continue;

      // Find matching closing brace (simple heuristic)
      let depth = 1;
      let bodyEnd = bodyStart + 1;
      while (depth > 0 && bodyEnd < code.length && bodyEnd < bodyStart + 10000) {
        if (code[bodyEnd] === '{') depth++;
        if (code[bodyEnd] === '}') depth--;
        bodyEnd++;
      }

      const body = code.slice(bodyStart, bodyEnd);
      const bodyLength = body.length;

      // Analyze function characteristics
      const hasTypedArray = /Uint8Array|Float32Array|Float64Array|Int32Array|ArrayBuffer/.test(body);
      const hasPixelOps = /\[\s*\w+\s*\+\s*[0-3]\s*\]|\[\s*[ijxy]\s*\*/.test(body); // array[i+0], array[i*4]
      const hasMathOps = /Math\.(sin|cos|sqrt|pow|abs|min|max|floor|ceil|round)/.test(body);
      const hasColorOps = /[rgba]\s*[=<>]|alpha|opacity|blend|gamma|hue|saturation|brightness/i.test(body);
      const hasImageOps = /width|height|pixel|image|canvas|bitmap|buffer/i.test(body);
      const hasLoop = /for\s*\(|while\s*\(/.test(body);

      // Score how likely this is an image processing function
      let score = 0;
      if (hasTypedArray) score += 3;
      if (hasPixelOps) score += 3;
      if (hasMathOps) score += 2;
      if (hasColorOps) score += 2;
      if (hasImageOps) score += 1;
      if (hasLoop && bodyLength > 100) score += 1;

      functions.set(name, {
        name,
        params,
        bodyLength,
        score,
        hasTypedArray,
        hasPixelOps,
        hasMathOps,
        hasColorOps,
        hasImageOps,
        position: pos
      });
    }
  }

  console.log(`Found ${functions.size} named functions\n`);

  // Sort by score (most likely image processing first)
  const sorted = [...functions.values()].sort((a, b) => b.score - a.score);

  // Filter to likely image processing functions
  const imageProcessing = sorted.filter(f => f.score >= 4);
  const mathFunctions = sorted.filter(f => f.hasMathOps && f.score >= 2 && f.score < 4);

  console.log('='.repeat(60));
  console.log('IMAGE PROCESSING FUNCTIONS (score >= 4)');
  console.log('='.repeat(60));
  console.log(`Found: ${imageProcessing.length}\n`);

  for (const fn of imageProcessing.slice(0, 50)) {
    console.log(`  ${fn.name}(${fn.params}) - score: ${fn.score}, ${fn.bodyLength} chars`);
    if (fn.hasTypedArray) process.stdout.write('    [TypedArray]');
    if (fn.hasPixelOps) process.stdout.write(' [PixelOps]');
    if (fn.hasColorOps) process.stdout.write(' [Color]');
    console.log();
  }

  console.log('\n' + '='.repeat(60));
  console.log('MATH UTILITY FUNCTIONS');
  console.log('='.repeat(60));
  console.log(`Found: ${mathFunctions.length}\n`);

  for (const fn of mathFunctions.slice(0, 30)) {
    console.log(`  ${fn.name}(${fn.params}) - ${fn.bodyLength} chars`);
  }

  // Save results
  const summary = {
    bundleSize: mainBundle.size,
    totalFunctions: functions.size,
    imageProcessingFunctions: imageProcessing.length,
    mathFunctions: mathFunctions.length,
    topImageProcessing: imageProcessing.slice(0, 100),
    topMathFunctions: mathFunctions.slice(0, 50)
  };

  const summaryPath = path.join(OUTPUT_DIR, 'function-analysis.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\nSaved analysis: ${summaryPath}`);

  // Extract actual function code for top candidates
  console.log('\nExtracting top function implementations...');

  const extractedFunctions = [];
  for (const fn of imageProcessing.slice(0, 20)) {
    const pos = fn.position;
    // Find function start
    let start = pos;
    while (start > 0 && code[start - 1] !== '\n' && code[start - 1] !== ';') start--;

    // Find function end
    const bodyStart = code.indexOf('{', pos);
    let depth = 1;
    let end = bodyStart + 1;
    while (depth > 0 && end < code.length) {
      if (code[end] === '{') depth++;
      if (code[end] === '}') depth--;
      end++;
    }

    const funcCode = code.slice(start, end).trim();
    extractedFunctions.push({
      name: fn.name,
      params: fn.params,
      score: fn.score,
      code: funcCode.slice(0, 5000) // Limit size
    });
  }

  const extractedPath = path.join(OUTPUT_DIR, 'extracted-functions.json');
  fs.writeFileSync(extractedPath, JSON.stringify(extractedFunctions, null, 2));
  console.log(`Saved ${extractedFunctions.length} function implementations: ${extractedPath}`);

  console.log('\nDone!');
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
