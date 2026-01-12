#!/usr/bin/env node
/**
 * Merge Programmatic Discovery with Manual Curation
 *
 * Combines:
 * - Programmatic discovery (100% completeness)
 * - Manual curation (semantic understanding, domain knowledge)
 *
 * Best of both worlds!
 *
 * Usage:
 *   node merge-with-curation.js \
 *     operations-catalog-with-params.json \
 *     manual-curation.json \
 *     output-enhanced.json
 */

import fs from 'fs';
import path from 'path';

const programmaticPath = process.argv[2];
const manualPath = process.argv[3];
const outputPath = process.argv[4] || 'operations-enhanced.json';

if (!programmaticPath || !manualPath) {
  console.error('Usage: node merge-with-curation.js <programmatic.json> <manual.json> [output.json]');
  console.error('');
  console.error('Example:');
  console.error('  node merge-with-curation.js \\');
  console.error('    operations-catalog-with-params.json \\');
  console.error('    manual-curation.json \\');
  console.error('    operations-enhanced.json');
  process.exit(1);
}

console.log('='.repeat(80));
console.log('MERGE PROGRAMMATIC + MANUAL CURATION');
console.log('='.repeat(80));
console.log(`Programmatic: ${programmaticPath}`);
console.log(`Manual:       ${manualPath}`);
console.log(`Output:       ${outputPath}`);
console.log('');

// Load both sources
const programmatic = JSON.parse(fs.readFileSync(programmaticPath, 'utf-8'));
const manual = JSON.parse(fs.readFileSync(manualPath, 'utf-8'));

const enhanced = {
  meta: {
    ...programmatic.meta,
    enhancedAt: new Date().toISOString(),
    sources: {
      programmatic: programmaticPath,
      manual: manualPath
    }
  },
  operations: {}
};

let enhancedCount = 0;
let programmaticOnlyCount = 0;
let manualOnlyCount = 0;

// Merge operations
const allOperationNames = new Set([
  ...Object.keys(programmatic.operations || {}),
  ...Object.keys(manual.operations || {})
]);

for (const opName of allOperationNames) {
  const progOp = programmatic.operations?.[opName];
  const manualOp = manual.operations?.[opName];

  if (progOp && manualOp) {
    // Both exist - merge them
    enhanced.operations[opName] = {
      // Start with programmatic (complete)
      ...progOp,

      // Add manual enhancements
      ...(manualOp._MANUAL_FIELDS || {}),

      // Merge parameters
      parameters: {
        ...progOp.parameters,

        // Enhance each parameter
        ...(Object.keys(progOp.parameters?.ranges || {}).reduce((acc, paramKey) => {
          const progParam = progOp.parameters.ranges[paramKey];
          const manualParam = manualOp.parameters?.[paramKey]?._MANUAL_ENHANCEMENT;

          acc[paramKey] = {
            // Programmatic discovery (technical)
            ...progParam,

            // Manual enhancement (semantic)
            ...(manualParam || {})
          };

          return acc;
        }, {}))
      },

      // Add examples
      examples: manualOp._EXAMPLES || {},

      // Mark as enhanced
      _enhanced: true,
      _sources: {
        programmatic: true,
        manual: true
      }
    };

    enhancedCount++;

  } else if (progOp && !manualOp) {
    // Only programmatic - include but mark for manual review
    enhanced.operations[opName] = {
      ...progOp,
      _needsManualReview: true,
      _sources: {
        programmatic: true,
        manual: false
      }
    };

    programmaticOnlyCount++;

  } else if (!progOp && manualOp) {
    // Only manual - might be deprecated or typo
    enhanced.operations[opName] = {
      ...manualOp,
      _warning: 'Not found in programmatic discovery - may be deprecated or incorrect name',
      _sources: {
        programmatic: false,
        manual: true
      }
    };

    manualOnlyCount++;
  }
}

// Save enhanced catalog
fs.writeFileSync(outputPath, JSON.stringify(enhanced, null, 2));

console.log('='.repeat(80));
console.log('MERGE COMPLETE');
console.log('='.repeat(80));
console.log('');
console.log('Statistics:');
console.log(`  Total operations:        ${allOperationNames.size}`);
console.log(`  Enhanced (both sources): ${enhancedCount} ✅`);
console.log(`  Programmatic only:       ${programmaticOnlyCount} ⚠️  (needs manual curation)`);
console.log(`  Manual only:             ${manualOnlyCount} ⚠️  (not found in source)`);
console.log('');
console.log(`Saved: ${outputPath}`);
console.log('');

// Print operations needing manual review
if (programmaticOnlyCount > 0) {
  console.log('='.repeat(80));
  console.log('OPERATIONS NEEDING MANUAL CURATION');
  console.log('='.repeat(80));
  console.log('');

  for (const [name, op] of Object.entries(enhanced.operations)) {
    if (op._needsManualReview) {
      console.log(`  ${name}`);
      console.log(`    Category: ${op.category || 'unknown'}`);
      console.log(`    Parameters: ${op.parameters?.parameterCount || 0}`);
      console.log('');
    }
  }

  console.log(`Please add semantic information for these ${programmaticOnlyCount} operations`);
  console.log('to manual-curation.json');
  console.log('');
}

// Print warnings for manual-only operations
if (manualOnlyCount > 0) {
  console.log('='.repeat(80));
  console.log('WARNINGS - OPERATIONS IN MANUAL BUT NOT IN SOURCE');
  console.log('='.repeat(80));
  console.log('');

  for (const [name, op] of Object.entries(enhanced.operations)) {
    if (op._sources?.manual && !op._sources?.programmatic) {
      console.log(`  ${name}`);
      console.log(`    ${op._warning}`);
      console.log('');
    }
  }

  console.log('These operations may be:');
  console.log('  - Deprecated (removed in newer version)');
  console.log('  - Typos in manual curation file');
  console.log('  - Named differently in source code');
  console.log('');
}

console.log('='.repeat(80));
console.log('NEXT STEPS');
console.log('='.repeat(80));
console.log('');
console.log('1. Review operations needing manual curation');
console.log('2. Add semantic information to manual-curation.json');
console.log('3. Re-run this merge script');
console.log('4. Use enhanced catalog for universal capture');
console.log('');
console.log(`   node universal-capture-v5-complete.js ${outputPath}`);
console.log('');
