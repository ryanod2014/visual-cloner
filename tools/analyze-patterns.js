#!/usr/bin/env node
/**
 * Analyze class/constructor patterns in extracted code
 */

import fs from 'fs';

const code = fs.readFileSync('/Users/ryanodonnell/projects/style_extractor_prototype/clean-room-cloner/extracted/photopea-v5-extracted.js', 'utf8');

// Find all class-like constructors (functions that use 'this.')
const constructorPattern = /export\s+function\s+(\w+)\s*\(([^)]*)\)\s*\{[\s\S]*?this\.\w+\s*=/g;
const constructors = [];
let match;
while ((match = constructorPattern.exec(code)) !== null) {
  constructors.push({ name: match[1], params: match[2] });
}

console.log('=== CONSTRUCTORS (classes) ===');
constructors.slice(0, 30).forEach(c => console.log(`  ${c.name}(${c.params})`));
console.log(`Total: ${constructors.length}\n`);

// Find 'new ClassName' patterns
const newPattern = /new\s+(\w+)\s*\(([^)]*)\)/g;
const newCalls = {};
while ((match = newPattern.exec(code)) !== null) {
  const name = match[1];
  if (!newCalls[name]) newCalls[name] = [];
  const args = match[2].slice(0, 80);
  if (!newCalls[name].includes(args)) newCalls[name].push(args);
}

console.log('=== NEW EXPRESSIONS (instantiations) ===');
Object.entries(newCalls)
  .filter(([name]) => !['Uint8Array', 'Float32Array', 'Int32Array', 'ArrayBuffer', 'DataView', 'Map', 'Set', 'Error', 'RegExp'].includes(name))
  .slice(0, 30)
  .forEach(([name, args]) => {
    console.log(`  ${name}:`);
    args.slice(0, 3).forEach(a => console.log(`    new ${name}(${a})`));
  });

// Find simple utility functions (no 'this')
const simpleFuncPattern = /export\s+(?:const\s+)?(\w+)\s*=?\s*function\s*\(([^)]*)\)\s*\{/g;
const simpleFuncs = [];
while ((match = simpleFuncPattern.exec(code)) !== null) {
  const name = match[1];
  // Check if function body uses 'this'
  const start = match.index;
  const end = code.indexOf('\nexport', start + 1);
  const body = code.slice(start, end > start ? end : start + 1000);
  if (!body.includes('this.')) {
    simpleFuncs.push({ name, params: match[2] });
  }
}

console.log(`\n=== SIMPLE FUNCTIONS (no 'this') ===`);
console.log(`Count: ${simpleFuncs.length}`);
simpleFuncs.slice(0, 20).forEach(f => console.log(`  ${f.name}(${f.params})`));
