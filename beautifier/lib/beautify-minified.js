#!/usr/bin/env node
/**
 * Beautify Minified Code
 *
 * Specialized pipeline for minified (NOT obfuscated) JavaScript.
 * Uses type inference for variable naming - no LLM needed for basic recovery.
 *
 * Usage:
 *   node beautify-minified.js input.js output.js [--verbose]
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const args = process.argv.slice(2);
const inputFile = args.find(a => !a.startsWith('--'));
const outputFile = args.find((a, i) => !a.startsWith('--') && i > args.indexOf(inputFile)) || inputFile.replace('.js', '.beautified.js');
const verbose = args.includes('--verbose') || args.includes('-v');

if (!inputFile) {
  console.log(`
Beautify Minified Code
======================

Usage:
  node beautify-minified.js <input.js> [output.js] [--verbose]

This pipeline is optimized for MINIFIED code (not obfuscated).
For obfuscated code, use beautify.js instead.

Steps:
  1. Format with Prettier
  2. Type inference rename (FREE - no API calls)
  3. Final format
`);
  process.exit(1);
}

const libDir = __dirname;
const tempDir = '/tmp/beautify-minified-' + Date.now();
fs.mkdirSync(tempDir, { recursive: true });

function log(msg) {
  if (verbose) console.log(msg);
}

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║         Beautify Minified Code Pipeline                   ║');
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('');
console.log(`Input:  ${inputFile}`);
console.log(`Output: ${outputFile}`);
console.log('');

const originalSize = fs.statSync(inputFile).size;
console.log(`Original size: ${originalSize.toLocaleString()} bytes`);
console.log('');

let currentFile = inputFile;
let stepNum = 1;
const steps = [];

// Step 1: Format with Prettier
console.log(`Step ${stepNum}: Formatting with Prettier...`);
const formatted1 = path.join(tempDir, '01-formatted.js');
try {
  execSync(`npx prettier --parser babel "${currentFile}" > "${formatted1}" 2>/dev/null`, {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024, // 100MB buffer
  });
  if (fs.existsSync(formatted1) && fs.statSync(formatted1).size > 0) {
    currentFile = formatted1;
    steps.push('prettier-1');
    log('  ✓ Formatted');
  }
} catch (err) {
  log(`  [WARN] Prettier failed, continuing with original`);
}
stepNum++;

// Step 2: Type inference rename
console.log(`Step ${stepNum}: Type inference rename...`);
const typed = path.join(tempDir, '02-typed.js');
try {
  const result = spawnSync('node', [
    '--max-old-space-size=4096',
    path.join(libDir, 'type-inference-rename.js'),
    currentFile,
    typed,
  ], {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
    timeout: 300000, // 5 minutes
  });

  if (result.stdout) {
    // Extract stats
    const match = result.stdout.match(/Total variables renamed: (\d+)/);
    if (match) {
      console.log(`  Variables renamed: ${parseInt(match[1]).toLocaleString()}`);
    }
  }

  if (fs.existsSync(typed) && fs.statSync(typed).size > 0) {
    currentFile = typed;
    steps.push('type-inference');
    log('  ✓ Type inference complete');
  } else if (result.stderr) {
    log(`  [WARN] ${result.stderr.slice(0, 200)}`);
  }
} catch (err) {
  log(`  [WARN] Type inference failed: ${err.message}`);
}
stepNum++;

// Step 3: Inline constants
console.log(`Step ${stepNum}: Inlining constants...`);
const inlined = path.join(tempDir, '03-inlined.js');
try {
  const result = spawnSync('node', [
    '--max-old-space-size=4096',
    path.join(libDir, 'inline-constants.js'),
    currentFile,
    inlined,
  ], {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
    timeout: 300000,
  });

  if (result.stdout) {
    const match = result.stdout.match(/Inlined (\d+) constant/);
    if (match) {
      console.log(`  Constants inlined: ${parseInt(match[1]).toLocaleString()}`);
    }
  }

  if (fs.existsSync(inlined) && fs.statSync(inlined).size > 0) {
    currentFile = inlined;
    steps.push('inline-constants');
    log('  ✓ Constants inlined');
  }
} catch (err) {
  log(`  [WARN] Constant inlining failed: ${err.message}`);
}
stepNum++;

// Step 4: Final format with Prettier
console.log(`Step ${stepNum}: Final formatting...`);
const formatted2 = path.join(tempDir, '04-final.js');
try {
  execSync(`npx prettier --parser babel "${currentFile}" > "${formatted2}" 2>/dev/null`, {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });
  if (fs.existsSync(formatted2) && fs.statSync(formatted2).size > 0) {
    currentFile = formatted2;
    steps.push('prettier-2');
    log('  ✓ Final format complete');
  }
} catch (err) {
  log(`  [WARN] Final format failed`);
}
stepNum++;

// Copy to output
fs.copyFileSync(currentFile, outputFile);
const finalSize = fs.statSync(outputFile).size;

console.log('');
console.log(`Output written to: ${outputFile}`);
console.log('');
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║                        Summary                            ║');
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('');
console.log(`Steps completed: ${steps.length}`);
steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
console.log('');

const reduction = ((originalSize - finalSize) / originalSize * 100).toFixed(1);
console.log(`Size: ${originalSize.toLocaleString()} → ${finalSize.toLocaleString()} bytes (${reduction}% ${finalSize < originalSize ? 'reduction' : 'increase due to formatting'})`);

// Cleanup
try {
  fs.rmSync(tempDir, { recursive: true });
} catch (e) {}
