#!/usr/bin/env node
/**
 * JavaScript Beautifier Pipeline
 *
 * Universal deobfuscation and beautification system.
 * 12-step pipeline: decode → simplify → clean → normalize → rename → format
 *
 * Usage:
 *   node beautify.cjs input.js output.js [--quality fast|balanced|best] [--verbose]
 *
 * Quality levels:
 *   fast     - Static + AST analysis only (free, ~85% readable)
 *   balanced - Static + AST + LLM with Haiku (~$0.015, ~90% readable)
 *   best     - Static + AST + LLM with Sonnet (~$0.05, ~95% readable)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse arguments
const args = process.argv.slice(2);
const inputFile = args.find(a => !a.startsWith('--'));
const outputFile = args.find((a, i) => !a.startsWith('--') && i > args.indexOf(inputFile));
const quality = args.find(a => a.startsWith('--quality='))?.split('=')[1] ||
                (args.includes('--quality') ? args[args.indexOf('--quality') + 1] : 'fast');
const verbose = args.includes('--verbose') || args.includes('-v');

if (!inputFile) {
  console.log(`
JavaScript Beautifier Pipeline
==============================

Usage:
  node beautify.cjs <input.js> [output.js] [options]

Options:
  --quality <level>  Quality level: fast, balanced, or best (default: fast)
  --verbose, -v      Show detailed progress

Quality Levels:
  fast      Static + AST analysis only (free, ~85% readable)
  balanced  Static + AST + LLM with Haiku (~$0.015, ~90% readable)
  best      Static + AST + LLM with Sonnet (~$0.05, ~95% readable)

Examples:
  node beautify.cjs obfuscated.js clean.js
  node beautify.cjs obfuscated.js clean.js --quality balanced
  node beautify.cjs obfuscated.js --quality best --verbose
`);
  process.exit(1);
}

const toolsDir = __dirname;
const tempDir = '/tmp/beautify-' + Date.now();

// Ensure temp directory exists
fs.mkdirSync(tempDir, { recursive: true });

function log(msg) {
  if (verbose) console.log(msg);
}

function runTool(toolName, input, output, extraArgs = '') {
  const toolPath = path.join(toolsDir, toolName);
  if (!fs.existsSync(toolPath)) {
    log(`  [SKIP] ${toolName} not found`);
    return false;
  }

  try {
    const cmd = `node "${toolPath}" "${input}" "${output}" ${extraArgs} 2>&1`;
    const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    if (verbose) {
      // Extract key stats from output
      const lines = result.split('\n').filter(l =>
        l.includes('removed') || l.includes('replaced') || l.includes('converted') ||
        l.includes('renamed') || l.includes('Total:') || l.includes('Size:')
      );
      lines.forEach(l => console.log(`    ${l.trim()}`));
    }
    return true;
  } catch (err) {
    log(`  [ERROR] ${toolName}: ${err.message}`);
    return false;
  }
}

console.log(`
╔═══════════════════════════════════════════════════════════╗
║           JavaScript Beautifier Pipeline                  ║
╚═══════════════════════════════════════════════════════════╝
`);

console.log(`Input:   ${inputFile}`);
console.log(`Output:  ${outputFile || '(stdout)'}`);
console.log(`Quality: ${quality}`);
console.log('');

const originalSize = fs.statSync(inputFile).size;
console.log(`Original size: ${originalSize.toLocaleString()} bytes`);
console.log('');

// Copy input to temp
let currentFile = path.join(tempDir, '0-input.js');
fs.copyFileSync(inputFile, currentFile);

const steps = [];

// Step 1: Decode strings (if obfuscated)
console.log('Step 1: Detecting and decoding string arrays...');
let nextFile = path.join(tempDir, '1-decoded.js');
if (runTool('decode-strings-v3.cjs', currentFile, nextFile)) {
  if (fs.existsSync(nextFile) && fs.statSync(nextFile).size > 0) {
    currentFile = nextFile;
    steps.push('decode-strings');
  }
}

// Step 2: Simplify string concatenations
console.log('Step 2: Simplifying string concatenations...');
nextFile = path.join(tempDir, '2-simplified.js');
if (runTool('simplify-strings.cjs', currentFile, nextFile)) {
  if (fs.existsSync(nextFile) && fs.statSync(nextFile).size > 0) {
    currentFile = nextFile;
    steps.push('simplify-strings');
  }
}

// Step 3: Remove dead code (obfuscator artifacts)
console.log('Step 3: Removing dead code...');
nextFile = path.join(tempDir, '3-cleaned.js');
if (runTool('remove-dead-code.cjs', currentFile, nextFile)) {
  if (fs.existsSync(nextFile) && fs.statSync(nextFile).size > 0) {
    currentFile = nextFile;
    steps.push('remove-dead-code');
  }
}

// Step 4: Normalize properties (bracket to dot)
console.log('Step 4: Normalizing property access...');
nextFile = path.join(tempDir, '4-properties.js');
if (runTool('normalize-properties.cjs', currentFile, nextFile)) {
  if (fs.existsSync(nextFile) && fs.statSync(nextFile).size > 0) {
    currentFile = nextFile;
    steps.push('normalize-properties');
  }
}

// Step 5: Semantic variable rename (static)
console.log('Step 5: Renaming variables (static analysis)...');
nextFile = path.join(tempDir, '5-vars.js');
if (runTool('semantic-rename.cjs', currentFile, nextFile)) {
  if (fs.existsSync(nextFile) && fs.statSync(nextFile).size > 0) {
    currentFile = nextFile;
    steps.push('semantic-rename');
  }
}

// Step 6: Normalize literals
console.log('Step 6: Normalizing literals...');
nextFile = path.join(tempDir, '6-literals.js');
if (runTool('normalize-literals.cjs', currentFile, nextFile)) {
  if (fs.existsSync(nextFile) && fs.statSync(nextFile).size > 0) {
    currentFile = nextFile;
    steps.push('normalize-literals');
  }
}

// Step 7: Rename functions (static pattern matching)
console.log('Step 7: Renaming functions (pattern analysis)...');
nextFile = path.join(tempDir, '7-functions.js');
if (runTool('rename-functions.cjs', currentFile, nextFile)) {
  if (fs.existsSync(nextFile) && fs.statSync(nextFile).size > 0) {
    currentFile = nextFile;
    steps.push('rename-functions');
  }
}

// Step 8: Remove dead references
console.log('Step 8: Removing dead references...');
nextFile = path.join(tempDir, '8-no-dead-refs.js');
if (runTool('remove-dead-refs.cjs', currentFile, nextFile)) {
  if (fs.existsSync(nextFile) && fs.statSync(nextFile).size > 0) {
    currentFile = nextFile;
    steps.push('remove-dead-refs');
  }
}

// Step 9: Fix syntax issues for AST parsing
console.log('Step 9: Fixing syntax issues...');
nextFile = path.join(tempDir, '9-syntax-fixed.js');
try {
  // Fix common deobfuscation artifacts: ?.. → ?.
  let code = fs.readFileSync(currentFile, 'utf8');
  const originalLen = code.length;
  code = code.replace(/\?\.\./g, '?.');
  if (code.length !== originalLen) {
    log(`    Fixed ${(originalLen - code.length) / 1} syntax issues`);
  }
  fs.writeFileSync(nextFile, code);
  currentFile = nextFile;
  steps.push('syntax-fix');
} catch (err) {
  log(`  [ERROR] Syntax fix: ${err.message}`);
}

// Step 10: AST-based rename (IIFE params, constants)
console.log('Step 10: AST-based variable rename...');
nextFile = path.join(tempDir, '10-ast.js');
if (runTool('ast-rename.cjs', currentFile, nextFile)) {
  if (fs.existsSync(nextFile) && fs.statSync(nextFile).size > 0) {
    currentFile = nextFile;
    steps.push('ast-rename');
  }
}

// Step 11: LLM rename (if quality >= balanced)
if (quality === 'balanced' || quality === 'best') {
  const model = quality === 'best' ? 'sonnet' : 'haiku';
  console.log(`Step 11: LLM variable rename (${model})...`);
  nextFile = path.join(tempDir, '11-llm.js');

  // Check if API key is available
  if (process.env.ANTHROPIC_API_KEY) {
    if (runTool('llm-rename.cjs', currentFile, nextFile, `--model ${model}`)) {
      if (fs.existsSync(nextFile) && fs.statSync(nextFile).size > 0) {
        currentFile = nextFile;
        steps.push(`llm-rename-${model}`);
      }
    }
  } else {
    console.log('  [SKIP] ANTHROPIC_API_KEY not set - skipping LLM rename');
  }
}

// Step 12: Format with Prettier (if available)
console.log('Step 12: Formatting with Prettier...');
nextFile = path.join(tempDir, '12-formatted.js');
try {
  execSync(`npx prettier --parser babel "${currentFile}" > "${nextFile}" 2>/dev/null`, { encoding: 'utf8' });
  if (fs.existsSync(nextFile) && fs.statSync(nextFile).size > 0) {
    currentFile = nextFile;
    steps.push('prettier');
  }
} catch (err) {
  log('  [SKIP] Prettier formatting failed (syntax issues)');
}

// Final output
const finalCode = fs.readFileSync(currentFile, 'utf8');
const finalSize = finalCode.length;

if (outputFile) {
  fs.writeFileSync(outputFile, finalCode);
  console.log(`\nOutput written to: ${outputFile}`);
} else {
  process.stdout.write(finalCode);
}

// Cleanup temp directory
try {
  fs.rmSync(tempDir, { recursive: true });
} catch (e) {}

// Summary
console.log(`
╔═══════════════════════════════════════════════════════════╗
║                        Summary                            ║
╚═══════════════════════════════════════════════════════════╝

Steps completed: ${steps.length}
  ${steps.map((s, i) => `${i + 1}. ${s}`).join('\n  ')}

Size: ${originalSize.toLocaleString()} → ${finalSize.toLocaleString()} bytes (${((1 - finalSize/originalSize) * 100).toFixed(1)}% reduction)
`);
