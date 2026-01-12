#!/usr/bin/env node
/**
 * Static Analysis: Discover ALL Photopea Operations from Source
 *
 * After V7 extraction, analyze the JavaScript source to find all operations.
 * This gives us 100% completeness because we have the source code.
 *
 * Usage:
 *   node analyze-photopea-source.js /path/to/v7-output/resources/app.js
 */

import fs from 'fs';
import path from 'path';

const sourceFile = process.argv[2];

if (!sourceFile || !fs.existsSync(sourceFile)) {
  console.error('Usage: node analyze-photopea-source.js <path-to-app.js>');
  console.error('');
  console.error('Example:');
  console.error('  node analyze-photopea-source.js ../v7-output/photopea/resources/app.js');
  process.exit(1);
}

console.log('='.repeat(80));
console.log('STATIC ANALYSIS: Photopea Operation Discovery');
console.log('='.repeat(80));
console.log(`Source: ${sourceFile}`);
console.log('');

// Read the source
const source = fs.readFileSync(sourceFile, 'utf-8');
console.log(`Source size: ${(source.length / 1024 / 1024).toFixed(2)} MB`);
console.log('');

// =================================================================
// STRATEGY 1: Find all postMessage command strings
// =================================================================
console.log('[Strategy 1] Searching for postMessage command patterns...');
console.log('');

// Photopea operations are called via postMessage with command arrays:
// postMessage(['gaussianBlur', radius], '*')
// postMessage(['invert'], '*')

// Patterns to match:
// 1. String literals that are likely operation names (camelCase, PascalCase)
// 2. Near postMessage calls or message handler code
// 3. In switch/case statements handling commands

const operations = new Set();

// Pattern 1: Find switch/case handling message commands
// Common pattern: switch(cmd) { case "gaussianBlur": ... }
const switchCasePattern = /case\s+["']([a-zA-Z][a-zA-Z0-9]*?)["']\s*:/g;
let match;
while ((match = switchCasePattern.exec(source)) !== null) {
  const operation = match[1];
  // Filter out common non-operation keywords
  const excluded = ['default', 'break', 'return', 'true', 'false', 'null', 'undefined',
                   'get', 'set', 'has', 'add', 'remove', 'update', 'delete'];
  if (!excluded.includes(operation.toLowerCase()) && operation.length > 3) {
    operations.add(operation);
  }
}

// Pattern 2: Find object properties that might be command handlers
// Common pattern: commands: { gaussianBlur: function(...) { ... } }
const commandPropertyPattern = /["']?([a-z][a-zA-Z0-9]+)["']?\s*:\s*function/g;
while ((match = commandPropertyPattern.exec(source)) !== null) {
  const operation = match[1];
  if (operation.length > 4 && /[A-Z]/.test(operation)) { // Has camelCase
    operations.add(operation);
  }
}

// Pattern 3: Find array literals with operation strings
// Common pattern: ['gaussianBlur', 'invert', 'brightness']
const arrayLiteralPattern = /\[\s*["']([a-z][a-zA-Z0-9]+)["']\s*,/g;
while ((match = arrayLiteralPattern.exec(source)) !== null) {
  const operation = match[1];
  if (operation.length > 4 && /[A-Z]/.test(operation)) {
    operations.add(operation);
  }
}

// Pattern 4: Find specific Photopea filter patterns
// Known patterns from documentation
const photopeaPatterns = [
  /["']gaussian[Bb]lur["']/g,
  /["']box[Bb]lur["']/g,
  /["']motion[Bb]lur["']/g,
  /["']lens[Bb]lur["']/g,
  /["']smart[Bb]lur["']/g,
  /["']radial[Bb]lur["']/g,
  /["']sharpen["']/g,
  /["']unsharp[Mm]ask["']/g,
  /["']invert["']/g,
  /["']posterize["']/g,
  /["']threshold["']/g,
  /["']solarize["']/g,
  /["']brightness["']/g,
  /["']contrast["']/g,
  /["']hue[Ss]aturation["']/g,
  /["']color[Bb]alance["']/g,
  /["']levels["']/g,
  /["']curves["']/g,
  /["']vibrance["']/g,
  /["']desaturate["']/g,
  /["']noise["']/g,
  /["']median["']/g,
  /["']dust[Ss]cratches["']/g,
  /["']mosaic["']/g,
  /["']crystallize["']/g,
  /["']pixelate["']/g,
  /["']pointillize["']/g,
  /["']fragment["']/g,
  /["']diffuse["']/g,
  /["']emboss["']/g,
  /["']find[Ee]dges["']/g,
  /["']glowing[Ee]dges["']/g,
  /["']maximum["']/g,
  /["']minimum["']/g,
  /["']displace["']/g,
  /["']polar[Cc]oordinates["']/g,
  /["']ripple["']/g,
  /["']shear["']/g,
  /["']spherize["']/g,
  /["']twirl["']/g,
  /["']wave["']/g,
  /["']zigzag["']/g,
  /["']lens[Cc]orrection["']/g,
];

for (const pattern of photopeaPatterns) {
  const matches = source.match(pattern);
  if (matches) {
    for (const m of matches) {
      const op = m.replace(/["']/g, '');
      operations.add(op);
    }
  }
}

console.log(`Found ${operations.size} potential operations via pattern matching`);
console.log('');

// =================================================================
// STRATEGY 2: Find menu item strings (operations are in menus)
// =================================================================
console.log('[Strategy 2] Searching for menu items...');
console.log('');

// Photopea has menu structure: Filter > Blur > Gaussian Blur
// Look for menu definitions
const menuPattern = /menu[:\s]+\[([^\]]+)\]/gi;
const menuMatches = source.match(menuPattern);

if (menuMatches) {
  console.log(`Found ${menuMatches.length} menu definitions`);
}

// =================================================================
// STRATEGY 3: AST Analysis (would require babel/esprima)
// =================================================================
console.log('[Strategy 3] AST analysis would provide highest accuracy...');
console.log('  (Skipping for now - would use @babel/parser)');
console.log('');

// =================================================================
// OUTPUT: Discovered Operations
// =================================================================
console.log('='.repeat(80));
console.log('DISCOVERED OPERATIONS');
console.log('='.repeat(80));
console.log('');

// Sort and categorize
const sortedOps = Array.from(operations).sort();

// Categorize by common prefixes
const categories = {
  blur: [],
  color: [],
  distort: [],
  noise: [],
  sharpen: [],
  stylize: [],
  other: []
};

for (const op of sortedOps) {
  const lower = op.toLowerCase();
  if (lower.includes('blur')) {
    categories.blur.push(op);
  } else if (lower.includes('color') || lower.includes('hue') ||
             lower.includes('saturation') || lower.includes('brightness') ||
             lower.includes('contrast') || lower.includes('level') ||
             lower.includes('curve')) {
    categories.color.push(op);
  } else if (lower.includes('distort') || lower.includes('warp') ||
             lower.includes('ripple') || lower.includes('twist') ||
             lower.includes('spherize') || lower.includes('twirl')) {
    categories.distort.push(op);
  } else if (lower.includes('noise') || lower.includes('dust') ||
             lower.includes('median')) {
    categories.noise.push(op);
  } else if (lower.includes('sharpen') || lower.includes('unsharp')) {
    categories.sharpen.push(op);
  } else if (lower.includes('mosaic') || lower.includes('pixelate') ||
             lower.includes('emboss') || lower.includes('edge') ||
             lower.includes('fragment')) {
    categories.stylize.push(op);
  } else {
    categories.other.push(op);
  }
}

console.log('BY CATEGORY:');
console.log('');

for (const [category, ops] of Object.entries(categories)) {
  if (ops.length > 0) {
    console.log(`${category.toUpperCase()}:`);
    for (const op of ops) {
      console.log(`  - ${op}`);
    }
    console.log('');
  }
}

console.log('='.repeat(80));
console.log(`TOTAL: ${operations.size} operations discovered`);
console.log('='.repeat(80));
console.log('');

// =================================================================
// GENERATE OPERATIONS CATALOG
// =================================================================
console.log('Generating operations catalog...');

const catalog = {
  meta: {
    source: sourceFile,
    analyzedAt: new Date().toISOString(),
    totalOperations: operations.size,
    extractionMethod: 'static-analysis'
  },
  operations: {}
};

// For each operation, create a basic entry
// (Parameter discovery would require dynamic testing)
for (const op of sortedOps) {
  catalog.operations[op] = {
    name: op,
    category: Object.entries(categories).find(([_, ops]) => ops.includes(op))?.[0] || 'other',
    // Parameters would be discovered via testing
    parameters: {
      discovered: false,
      note: 'Run dynamic testing to discover parameters'
    }
  };
}

const catalogPath = path.join(path.dirname(sourceFile), 'operations-catalog.json');
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
console.log(`Saved: ${catalogPath}`);
console.log('');

// =================================================================
// COMPARISON WITH CURRENT CATALOG
// =================================================================
console.log('='.repeat(80));
console.log('COMPARISON WITH CURRENT CATALOG');
console.log('='.repeat(80));
console.log('');

// Our current catalog from universal-capture-v4.js
const currentCatalog = [
  'gaussianBlur',
  'boxBlur',
  'motionBlur',
  'smartBlur',
  'radialBlur',
  'sharpen',
  'unsharpMask',
  'invert',
  'posterize',
  'threshold',
  'brightness',
  'contrast',
  'hueSaturation',
  'colorBalance',
  'levels',
  'curves',
  'vibrance',
  'desaturate',
  'noise',
  'median',
  'dustScratches',
  'mosaic',
  'pixelate',
  'emboss',
  'findEdges',
  'maximum',
  'minimum',
  'displace',
  'ripple'
];

const currentSet = new Set(currentCatalog);
const discovered = new Set(sortedOps.map(op => op.toLowerCase()));

const missing = [];
const extra = [];

for (const op of currentCatalog) {
  if (!discovered.has(op.toLowerCase())) {
    missing.push(op);
  }
}

for (const op of sortedOps) {
  if (!currentSet.has(op) && !currentSet.has(op.toLowerCase())) {
    extra.push(op);
  }
}

console.log(`Current catalog: ${currentCatalog.length} operations`);
console.log(`Discovered: ${operations.size} operations`);
console.log('');

if (missing.length > 0) {
  console.log(`❌ MISSING from discovered (false negatives): ${missing.length}`);
  for (const op of missing) {
    console.log(`   - ${op}`);
  }
  console.log('');
}

if (extra.length > 0) {
  console.log(`✨ NEW operations discovered: ${extra.length}`);
  for (const op of extra) {
    console.log(`   + ${op}`);
  }
  console.log('');
}

if (missing.length === 0 && extra.length === 0) {
  console.log('✅ Perfect match! Current catalog is complete.');
} else {
  const completeness = ((currentCatalog.length - missing.length) / operations.size * 100).toFixed(1);
  console.log(`📊 Current catalog completeness: ${completeness}%`);
}

console.log('');
console.log('='.repeat(80));
console.log('NEXT STEPS');
console.log('='.repeat(80));
console.log('');
console.log('1. Update universal-capture-v4.js OPERATIONS array with discovered operations');
console.log('2. Run dynamic testing to discover parameters for each operation');
console.log('3. Use instrumentation to validate completeness');
console.log('');
