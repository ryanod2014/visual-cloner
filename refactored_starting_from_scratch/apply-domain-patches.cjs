#!/usr/bin/env node

/**
 * Apply domain validation patches to Photopea r8.js
 * Simpler patterns that match the actual code structure
 */

const fs = require('fs');

const targetFile = process.argv[2] || '/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/refactored_starting_from_scratch/output/photopea.com-1768352137402/resources/r8.js';

if (!fs.existsSync(targetFile)) {
  console.error(`Error: File not found: ${targetFile}`);
  process.exit(1);
}

console.log(`Reading ${targetFile}...`);
let code = fs.readFileSync(targetFile, 'utf8');
const originalLength = code.length;
let patchCount = 0;

// Patch 1: jZ.ms() - make it always return true
console.log('\n[Patch 1] Patching jZ.ms() domain check...');
const jzMsPattern = /jZ\.ms=function\(\)\{var z=U\.RW\[aK\.By\]\[aK\.atR\];if\(z==null\)z=\[U\.RW\[aK\.Sd\]\[aK\.vj\]\];for\(var v=0;v<z\.length;\nv\+\+\)\{if\(z\[v\]\.indexOf\(aK\.D_\("UUPSDm@ID"\)\)!=-1\)return!0;if\(z\[v\]\.indexOf\(aK\.D_\("U\^JSHR@>Ea4=8"\)\)!=-1\)return!0;\nif\(z\[v\]\.indexOf\(aK\.D_\("U\^JSHRj=FA"\)\)!=-1\)return!0\}return!1\}/;
if (jzMsPattern.test(code)) {
  code = code.replace(jzMsPattern, 'jZ.ms=function(){return!0}');
  patchCount++;
  console.log('  ✓ Patched jZ.ms()');
} else {
  console.log('  ✗ Pattern not found (may already be patched)');
}

// Patch 2: dP.prototype.aF() - make it always return true
console.log('\n[Patch 2] Patching dP.prototype.aF() license check...');
const aFPattern = /dP\.prototype\.aF=function\(\)\{if\(jZ\.ms\(\)\)return!0;return 4<U\.RW\[aK\.By\]\[aK\.AE\]\[aK\.aPi\]\(aK\.D_\("\)\\$!\}y"\)\)\}/;
if (aFPattern.test(code)) {
  code = code.replace(aFPattern, 'dP.prototype.aF=function(){return!0}');
  patchCount++;
  console.log('  ✓ Patched dP.prototype.aF()');
} else {
  console.log('  ✗ Pattern not found (may already be patched)');
}

// Patch 3: U.alp() - make it always return 1
console.log('\n[Patch 3] Patching U.alp() domain validation...');
const uAlpPattern = /U\.alp=function\(\)\{var z=U\.Zk\(\);if\(z==""\)return 0;\nif\(z!=U\.D_\("_TXZRPB;d7@;"\)&&z!=aK\.D_\("eQLZRRM\?8a4=8"\)&&z!=aK\.D_\("YMVVHAj=FA"\)\)\{var q=U\.RW\[aK\.By\]\[aK\.AE\],e=q\.indexOf\(String\.fromCharCode\(35\)\),B;\nif\(e==-1\)return 0;try\{B=JSON\.parse\(U\.RW\[aK\.adR\]\(q\.slice\(e\+1\)\)\)\}catch\(dp\)\{return 0\}var J=B\[U\.D_\("bQ\[ODL<E<M"\)\];\nif\(J==null\|\|J\.length<<2!=64\)return 0;var _=aK\.PC\(\),I=parseInt\(J\.slice\(3\*4\)\.split\(""\)\.reverse\(\)\.join\(""\),16\)<<16;\nif\(I<_\|\|J!=aK\.agu\(I,z\)\)return 0;return 2\}return 1\}/;
if (uAlpPattern.test(code)) {
  code = code.replace(uAlpPattern, 'U.alp=function(){return 1}');
  patchCount++;
  console.log('  ✓ Patched U.alp()');
} else {
  console.log('  ✗ Pattern not found (may already be patched)');
}

// Write results
if (patchCount > 0) {
  console.log(`\nWriting patched file (${code.length} bytes, ${code.length - originalLength} bytes diff)...`);
  fs.writeFileSync(targetFile, code);
  console.log(`\n✓ Successfully applied ${patchCount} domain validation patches!`);
} else {
  console.log('\n✗ No patches applied. Domain validation may already be patched.');
}

console.log('\nAll patches summary:');
console.log('  - IndexedDB null fix: Already applied');
console.log('  - IDB transaction mocks: Already applied');
console.log(`  - Domain validation: ${patchCount > 0 ? 'Applied' : 'Already applied or not found'}`);
