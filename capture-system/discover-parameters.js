#!/usr/bin/env node
/**
 * Parameter Discovery - Find parameter signatures for ALL operations
 *
 * Input:  operations-catalog.json (from static analysis)
 * Output: operations-with-params.json (with parameter signatures)
 *
 * Strategy:
 * 1. For each operation, test with different parameter patterns
 * 2. Observe which patterns work vs error
 * 3. Extract parameter types, ranges, defaults from behavior
 *
 * Usage:
 *   node discover-parameters.js operations-catalog.json
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const catalogPath = process.argv[2];

if (!catalogPath || !fs.existsSync(catalogPath)) {
  console.error('Usage: node discover-parameters.js <operations-catalog.json>');
  process.exit(1);
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));

console.log('='.repeat(80));
console.log('PARAMETER DISCOVERY');
console.log('='.repeat(80));
console.log(`Operations: ${Object.keys(catalog.operations).length}`);
console.log('');

// Test patterns for parameter discovery
const TEST_PATTERNS = [
  // No parameters
  { pattern: [], description: 'No parameters' },

  // Single parameter (number)
  { pattern: [0], description: 'Single number: 0' },
  { pattern: [1], description: 'Single number: 1' },
  { pattern: [10], description: 'Single number: 10' },
  { pattern: [100], description: 'Single number: 100' },
  { pattern: [-1], description: 'Single number: negative' },
  { pattern: [0.5], description: 'Single number: decimal' },

  // Two parameters
  { pattern: [0, 0], description: 'Two numbers: 0, 0' },
  { pattern: [10, 10], description: 'Two numbers: 10, 10' },
  { pattern: [10, 50], description: 'Two numbers: different' },

  // Three parameters
  { pattern: [10, 10, 10], description: 'Three numbers' },

  // Boolean
  { pattern: [true], description: 'Boolean: true' },
  { pattern: [false], description: 'Boolean: false' },

  // Object
  { pattern: [{ x: 10, y: 10 }], description: 'Object with x, y' },
  { pattern: [{ amount: 50 }], description: 'Object with amount' },

  // String
  { pattern: ['test'], description: 'String' },

  // Mixed
  { pattern: [10, true], description: 'Number + Boolean' },
  { pattern: [10, { x: 5 }], description: 'Number + Object' },
];

async function discoverParametersForOperation(page, operationName) {
  console.log(`\n[${operationName}] Discovering parameters...`);

  const results = [];

  for (const test of TEST_PATTERNS) {
    try {
      // Load a test image
      await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(0, 0, 100, 100);
      });

      await page.waitForTimeout(100);

      // Capture before state
      const before = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        return canvas.toDataURL();
      });

      // Try the operation with this parameter pattern
      const command = [operationName, ...test.pattern];

      const result = await page.evaluate((cmd) => {
        try {
          const iframe = document.getElementById('app');
          iframe.contentWindow.postMessage(cmd, '*');
          return { success: true, error: null };
        } catch (e) {
          return { success: false, error: e.message };
        }
      }, command);

      await page.waitForTimeout(300);

      // Capture after state
      const after = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        return canvas.toDataURL();
      });

      const changed = before !== after;

      results.push({
        pattern: test.pattern,
        description: test.description,
        success: result.success,
        error: result.error,
        causedChange: changed
      });

      const status = result.success ? (changed ? '✅ WORKS + CHANGES' : '⚠️  WORKS (no change)') : '❌ ERROR';
      console.log(`  ${test.description.padEnd(30)} → ${status}`);

    } catch (e) {
      console.log(`  ${test.description.padEnd(30)} → ❌ ${e.message}`);
    }
  }

  return analyzeResults(results);
}

function analyzeResults(results) {
  // Find which patterns worked
  const working = results.filter(r => r.success && r.causedChange);

  if (working.length === 0) {
    return {
      parameterCount: 0,
      parameterTypes: [],
      ranges: {},
      discovered: true
    };
  }

  // Infer parameter signature from working patterns
  const signatures = working.map(r => r.pattern);

  // Find most common length
  const lengths = signatures.map(s => s.length);
  const mostCommonLength = lengths.sort((a, b) =>
    lengths.filter(l => l === a).length - lengths.filter(l => l === b).length
  ).pop();

  // Infer types
  const types = [];
  for (let i = 0; i < mostCommonLength; i++) {
    const values = signatures.filter(s => s.length > i).map(s => s[i]);
    const typeSet = new Set(values.map(v => typeof v));
    types.push(Array.from(typeSet)[0] || 'unknown');
  }

  // Infer ranges for numeric parameters
  const ranges = {};
  for (let i = 0; i < mostCommonLength; i++) {
    if (types[i] === 'number') {
      const numericValues = working
        .filter(r => r.pattern.length > i && typeof r.pattern[i] === 'number')
        .map(r => r.pattern[i]);

      if (numericValues.length > 0) {
        ranges[`param${i}`] = {
          type: 'number',
          tested: numericValues,
          min: Math.min(...numericValues),
          max: Math.max(...numericValues),
          // Common values that worked
          workingValues: numericValues
        };
      }
    }
  }

  return {
    parameterCount: mostCommonLength,
    parameterTypes: types,
    ranges,
    workingPatterns: working.map(r => r.pattern),
    discovered: true
  };
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Load Photopea
  await page.goto('https://www.photopea.com', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Discover parameters for each operation
  for (const [opName, opData] of Object.entries(catalog.operations)) {
    const params = await discoverParametersForOperation(page, opName);

    catalog.operations[opName].parameters = params;
  }

  await browser.close();

  // Save enhanced catalog
  const outputPath = catalogPath.replace('.json', '-with-params.json');
  fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2));

  console.log('\n' + '='.repeat(80));
  console.log('PARAMETER DISCOVERY COMPLETE');
  console.log('='.repeat(80));
  console.log(`Saved: ${outputPath}`);
  console.log('');

  // Summary
  const withParams = Object.values(catalog.operations).filter(op => op.parameters.parameterCount > 0);
  console.log(`Operations with parameters: ${withParams.length}`);
  console.log(`Operations without parameters: ${Object.keys(catalog.operations).length - withParams.length}`);
}

main().catch(console.error);
