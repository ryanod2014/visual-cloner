#!/usr/bin/env node
/**
 * JavaScript Beautifier Pipeline
 *
 * Universal deobfuscation and beautification system.
 * 14-step pipeline: decode → simplify → clean → inline → normalize → rename → format
 *
 * Usage:
 *   node beautify.js input.js output.js [--quality fast|balanced|best] [--verbose]
 *
 * Quality levels:
 *   fast     - Static + AST analysis only (free, ~90% readable)
 *   balanced - Static + AST + LLM with Haiku (~$0.015, ~95% readable)
 *   best     - Static + AST + LLM with Sonnet (~$0.05, ~98% readable)
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
  node beautify.js <input.js> [output.js] [options]

Options:
  --quality <level>  Quality level: fast, balanced, or best (default: fast)
  --verbose, -v      Show detailed progress

Quality Levels:
  fast      Static + AST analysis only (free, ~90% readable)
  balanced  Static + AST + LLM with Haiku (~$0.015, ~95% readable)
  best      Static + AST + LLM with Sonnet (~$0.05, ~98% readable)

Examples:
  node beautify.js obfuscated.js clean.js
  node beautify.js obfuscated.js clean.js --quality balanced
  node beautify.js obfuscated.js --quality best --verbose
`);
  process.exit(1);
}

const libDir = __dirname;
const tempDir = '/tmp/beautify-' + Date.now();

// Ensure temp directory exists
fs.mkdirSync(tempDir, { recursive: true });

function log(msg) {
  if (verbose) console.log(msg);
}

function runTool(toolName, input, output, extraArgs = '') {
  const toolPath = path.join(libDir, toolName);
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
        l.includes('renamed') || l.includes('Inlined') || l.includes('Simplified') ||
        l.includes('Total:') || l.includes('Size:') || l.includes('Found')
      );
      lines.slice(0, 3).forEach(l => console.log(`    ${l.trim()}`));
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
let currentFile = path.join(tempDir, '00-input.js');
fs.copyFileSync(inputFile, currentFile);

const steps = [];
let stepNum = 1;

function runStep(name, toolName, extraArgs = '') {
  console.log(`Step ${stepNum}: ${name}...`);
  const nextFile = path.join(tempDir, `${String(stepNum).padStart(2, '0')}-${toolName.replace('.js', '')}.js`);
  if (runTool(toolName, currentFile, nextFile, extraArgs)) {
    if (fs.existsSync(nextFile) && fs.statSync(nextFile).size > 0) {
      currentFile = nextFile;
      steps.push(toolName.replace('.js', ''));
    }
  }
  stepNum++;
}

// =====================================================
// PHASE 1: String Deobfuscation
// =====================================================

runStep('Detecting and decoding string arrays', 'decode-strings.js');
runStep('Simplifying string concatenations', 'simplify-strings.js');

// =====================================================
// PHASE 2: Dead Code Removal
// =====================================================

runStep('Removing dead code', 'remove-dead-code.js');

// =====================================================
// PHASE 3: Control Flow Deobfuscation
// =====================================================

runStep('Inlining wrapper functions', 'inline-wrappers.js');
runStep('Removing opaque predicates', 'remove-opaque.js');

// =====================================================
// PHASE 4: Normalization
// =====================================================

runStep('Normalizing property access', 'normalize-properties.js');
runStep('Normalizing literals', 'normalize-literals.js');
runStep('Inlining constants', 'inline-constants.js');

// =====================================================
// PHASE 5: Renaming
// =====================================================

runStep('Renaming variables (static analysis)', 'semantic-rename.js');
runStep('Renaming functions (pattern analysis)', 'rename-functions.js');
runStep('Type inference rename (minified code)', 'type-inference-rename.js');
runStep('Removing dead references', 'remove-dead-refs.js');

// Fix syntax issues for AST parsing
console.log(`Step ${stepNum}: Fixing syntax issues...`);
let nextFile = path.join(tempDir, `${String(stepNum).padStart(2, '0')}-syntax-fixed.js`);
try {
  let code = fs.readFileSync(currentFile, 'utf8');
  code = code.replace(/\?\.\./g, '?.');
  fs.writeFileSync(nextFile, code);
  currentFile = nextFile;
  steps.push('syntax-fix');
} catch (err) {
  log(`  [ERROR] Syntax fix: ${err.message}`);
}
stepNum++;

runStep('AST-based variable rename', 'ast-rename.js');
runStep('Fixing destructure names', 'fix-destructure-names.js');

// =====================================================
// PHASE 6: LLM Enhancement (if quality >= balanced)
// =====================================================

if (quality === 'balanced' || quality === 'best') {
  const model = quality === 'best' ? 'sonnet' : 'haiku';
  if (process.env.ANTHROPIC_API_KEY) {
    runStep(`LLM variable rename (${model})`, 'llm-rename.js', `--model ${model}`);
  } else {
    console.log(`Step ${stepNum}: LLM variable rename (${model})...`);
    console.log('  [SKIP] ANTHROPIC_API_KEY not set');
    stepNum++;
  }
}

// =====================================================
// PHASE 7: Final Formatting
// =====================================================

console.log(`Step ${stepNum}: Formatting with Prettier...`);
nextFile = path.join(tempDir, `${String(stepNum).padStart(2, '0')}-formatted.js`);
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
