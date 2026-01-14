#!/usr/bin/env node
import fs from 'fs';

const merged = JSON.parse(fs.readFileSync('captured-io/merged/_all.json', 'utf8'));
const funcs = Object.keys(merged);

console.log('='.repeat(60));
console.log('CAPTURED I/O SUMMARY');
console.log('='.repeat(60));
console.log('Total functions with I/O pairs:', funcs.length);

// Categorize
const categories = {
  'Global APIs': [],
  'Constructors': [],
  'Math/Geometry': [],
  'Canvas/Render': [],
  'DOM Utilities': [],
  'Other': []
};

for (const name of funcs) {
  const data = merged[name];
  if (name.includes('.')) {
    categories['Global APIs'].push(name);
  } else if (data.isConstructor) {
    if (name.startsWith('MathUtils') || name === 'MathUtils') {
      categories['Math/Geometry'].push(name);
    } else if (name.startsWith('Canvas')) {
      categories['Canvas/Render'].push(name);
    } else if (name.startsWith('DOM')) {
      categories['DOM Utilities'].push(name);
    } else {
      categories['Constructors'].push(name);
    }
  } else {
    categories['Other'].push(name);
  }
}

console.log('');
for (const [cat, list] of Object.entries(categories)) {
  if (list.length > 0) {
    console.log(`${cat}: ${list.length}`);
    list.slice(0, 5).forEach(f => console.log(`  - ${f}`));
    if (list.length > 5) console.log(`  ... and ${list.length - 5} more`);
  }
}

// Count total I/O pairs
let totalPairs = 0;
for (const data of Object.values(merged)) {
  const successes = (data.results || []).filter(r => r.error === null);
  totalPairs += successes.length;
}
console.log('');
console.log('Total I/O pairs (successful):', totalPairs);
