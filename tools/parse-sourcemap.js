#!/usr/bin/env node
import fs from 'fs';

const data = fs.readFileSync('/tmp/excalidraw-sourcemap.map', 'utf8');
const map = JSON.parse(data);

console.log('Source files:', map.sources?.length || 0);
console.log('Has sourcesContent:', map.sourcesContent ? 'YES' : 'NO');
console.log('');
console.log('First 50 source files:');
(map.sources || []).slice(0, 50).forEach(f => console.log('  ' + f));
