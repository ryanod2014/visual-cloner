#!/usr/bin/env node

/**
 * Verify all patches have been applied correctly
 */

const fs = require('fs');
const path = require('path');

const targetFile = process.argv[2] || '/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/refactored_starting_from_scratch/output/photopea.com-1768352137402/resources/r8.js';

if (!fs.existsSync(targetFile)) {
  console.error(`Error: File not found: ${targetFile}`);
  process.exit(1);
}

console.log('Photopea Patch Verification');
console.log('='.repeat(60));
console.log(`\nChecking: ${path.basename(targetFile)}`);

const code = fs.readFileSync(targetFile, 'utf8');

const checks = [
  {
    name: 'Patch 1: jZ.ms() domain check',
    pattern: /jZ\.ms=function\(\)\{return!0\}/,
    success: 'Domain validation bypassed ✓',
    failure: 'Domain check NOT patched ✗'
  },
  {
    name: 'Patch 2: dP.prototype.aF() license check',
    pattern: /dP\.prototype\.aF=function\(\)\{return!0\}/,
    success: 'License validation bypassed ✓',
    failure: 'License check NOT patched ✗'
  },
  {
    name: 'Patch 3: U.alp() returns 1',
    pattern: /U\.alp=function\(\)\{return 1\}/,
    success: 'Domain validator returns valid ✓',
    failure: 'Domain validator NOT patched ✗'
  },
  {
    name: 'Patch 4: bM.ou initialized to {}',
    pattern: /bM:\{id:"ts"\+Math\.round\(Math\.random\(\)\*16777215\),adj:!1,aye:!1,kw:\{\},rT:\{\},ou:\{\}\}/,
    success: 'IndexedDB null reference fixed ✓',
    failure: 'bM.ou initialization NOT patched ✗'
  },
  {
    name: 'Patch 5: IDB transaction mocks',
    pattern: /if\(this\.i\.bM\.ou&&typeof this\.i\.bM\.ou\.transaction!==/,
    success: 'IndexedDB transaction mocks added ✓',
    failure: 'IDB mocks NOT added ✗'
  }
];

let allPassed = true;
let passedCount = 0;

console.log('\nPatch Status:\n');

checks.forEach((check, index) => {
  const passed = check.pattern.test(code);
  const status = passed ? check.success : check.failure;
  console.log(`[${index + 1}] ${check.name}`);
  console.log(`    ${status}`);

  if (passed) {
    passedCount++;
  } else {
    allPassed = false;
  }
});

console.log('\n' + '='.repeat(60));
console.log(`\nResults: ${passedCount}/${checks.length} patches verified`);

if (allPassed) {
  console.log('\n✓ All patches applied successfully!');
  console.log('\nYou can now:');
  console.log('1. Serve the files with a local web server');
  console.log('2. Open in browser (e.g., http://localhost:3000)');
  console.log('3. Test all functionality');
  process.exit(0);
} else {
  console.log('\n✗ Some patches are missing!');
  console.log('\nTo fix:');
  console.log('  node apply-patches.cjs       # For patches 4-5');
  console.log('  node apply-domain-patches.cjs # For patches 1-3');
  process.exit(1);
}
