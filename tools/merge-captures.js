#!/usr/bin/env node
/**
 * Merge all I/O captures into a unified dataset
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CAPTURE_DIRS = [
  path.join(__dirname, '..', 'captured-io'),          // Global APIs (12)
  path.join(__dirname, '..', 'captured-io', 'internal'),     // Internal (41)
  path.join(__dirname, '..', 'captured-io', 'from-callsites'), // Call sites (74)
  path.join(__dirname, '..', 'captured-io', 'enhanced'),     // Enhanced (89)
  path.join(__dirname, '..', 'captured-io', 'bulletproof'),  // Bulletproof (90)
  path.join(__dirname, '..', 'captured-io', 'real-objects'), // Real objects (11)
  path.join(__dirname, '..', 'captured-io', 'instrumented'), // Instrumented (367)
];

const OUTPUT_DIR = path.join(__dirname, '..', 'captured-io', 'merged');

function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Merge All I/O Captures                              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const merged = {};
  const sources = {};

  for (const dir of CAPTURE_DIRS) {
    if (!fs.existsSync(dir)) {
      console.log(`  Skipping (not found): ${dir}`);
      continue;
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== '_all.json');
    const dirName = path.basename(dir);

    console.log(`\n=== ${dirName} ===`);
    console.log(`  Files: ${files.length}`);

    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        const funcName = data.function || path.basename(file, '.json');

        // Check if we have successful results
        const successes = data.results?.filter(r => !r.error) || [];
        if (successes.length === 0) continue;

        // Prefer capture with more successful results
        if (!merged[funcName] || successes.length > (merged[funcName].results?.filter(r => !r.error)?.length || 0)) {
          merged[funcName] = {
            ...data,
            source: dirName,
          };
          sources[funcName] = dirName;
        }
      } catch (e) {
        // Skip invalid files
      }
    }
  }

  // Also check _all.json files for any missing functions
  for (const dir of CAPTURE_DIRS) {
    const allFile = path.join(dir, '_all.json');
    if (!fs.existsSync(allFile)) continue;

    try {
      const allData = JSON.parse(fs.readFileSync(allFile, 'utf8'));
      const dirName = path.basename(dir);

      for (const [funcName, data] of Object.entries(allData)) {
        const successes = data.results?.filter(r => !r.error) || [];
        if (successes.length === 0) continue;

        if (!merged[funcName] || successes.length > (merged[funcName].results?.filter(r => !r.error)?.length || 0)) {
          merged[funcName] = {
            ...data,
            source: dirName,
          };
          sources[funcName] = dirName;
        }
      }
    } catch (e) {
      // Skip
    }
  }

  // Save merged
  const mergedPath = path.join(OUTPUT_DIR, '_all.json');
  fs.writeFileSync(mergedPath, JSON.stringify(merged, null, 2));

  // Save individual files
  for (const [name, data] of Object.entries(merged)) {
    fs.writeFileSync(path.join(OUTPUT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
  }

  // Summary by source
  const bySource = {};
  for (const [name, source] of Object.entries(sources)) {
    if (!bySource[source]) bySource[source] = [];
    bySource[source].push(name);
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total unique functions captured: ${Object.keys(merged).length}`);
  console.log('\nBy source:');
  for (const [source, funcs] of Object.entries(bySource)) {
    console.log(`  ${source}: ${funcs.length}`);
  }

  // List functions by category
  const constructors = [];
  const regularFuncs = [];

  for (const [name, data] of Object.entries(merged)) {
    if (data.isConstructor) {
      constructors.push(name);
    } else {
      regularFuncs.push(name);
    }
  }

  console.log(`\nConstructors captured: ${constructors.length}`);
  console.log(`Regular functions captured: ${regularFuncs.length}`);

  // Show sample of captured functions
  console.log('\n=== Sample Constructors ===');
  constructors.slice(0, 10).forEach(name => {
    const data = merged[name];
    console.log(`  ${name}(${data.params?.join(', ') || ''})`);
  });

  console.log('\n=== Sample Regular Functions ===');
  regularFuncs.slice(0, 10).forEach(name => {
    const data = merged[name];
    console.log(`  ${name}(${data.params?.join(', ') || ''})`);
  });

  console.log(`\nOutput: ${OUTPUT_DIR}`);
}

main();
