#!/usr/bin/env node
import fs from 'fs';

const data = fs.readFileSync('/tmp/excalidraw-sourcemap.map', 'utf8');
const map = JSON.parse(data);

// Find Excalidraw-specific files
const excalidrawFiles = map.sources.filter(s =>
  s.includes('excalidraw') ||
  s.includes('element') ||
  s.includes('packages/')
).slice(0, 30);

console.log('Excalidraw source files:');
excalidrawFiles.forEach((f, i) => {
  console.log(`  ${i}: ${f}`);
});

// Extract content of a specific file
const targetFile = map.sources.findIndex(s => s.includes('packages/math/src/rectangle.ts'));
if (targetFile >= 0 && map.sourcesContent && map.sourcesContent[targetFile]) {
  console.log('\n' + '='.repeat(60));
  console.log('ORIGINAL SOURCE: packages/math/src/rectangle.ts');
  console.log('='.repeat(60));
  console.log(map.sourcesContent[targetFile]);
}
