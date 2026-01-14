#!/usr/bin/env node

/**
 * Apply patches to Photopea r8.js to enable localhost execution
 *
 * Fixes:
 * 1. Domain validation (jZ.ms, dP.prototype.aF, U.alp)
 * 2. IndexedDB null reference errors (bM.ou)
 * 3. Missing IDB transaction methods
 */

const fs = require('fs');
const path = require('path');

const targetFile = process.argv[2] || '/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/refactored_starting_from_scratch/output/photopea.com-1768352137402/resources/r8.js';

if (!fs.existsSync(targetFile)) {
  console.error(`Error: File not found: ${targetFile}`);
  process.exit(1);
}

console.log(`Reading ${targetFile}...`);
let code = fs.readFileSync(targetFile, 'utf8');
const originalLength = code.length;
let patchCount = 0;

// Patch 1: Force jZ.ms() to return true (domain check)
console.log('\n[Patch 1] Forcing jZ.ms() to return true...');
const patch1Before = code.length;
code = code.replace(
  /jZ\.ms=function\(\)\{var z=U\.RW\[aK\.By\]\[aK\.atR\];if\(z==null\)z=\[U\.RW\[aK\.Sd\]\[aK\.vj\]\];for\(var v=0;v<z\.length;v\+\+\)\{if\(z\[v\]\.indexOf\(aK\.D_\("UUPSDm@ID"\)\)!=-1\)return!0;if\(z\[v\]\.indexOf\(aK\.D_\("U\^JSHR@>Ea4=8"\)\)!=-1\)return!0;if\(z\[v\]\.indexOf\(aK\.D_\("U\^JSHRj=FA"\)\)!=-1\)return!0\}return!1\}/,
  'jZ.ms=function(){return!0}'
);
if (code.length !== patch1Before) {
  patchCount++;
  console.log('  ✓ Patched jZ.ms()');
} else {
  console.log('  ✗ Pattern not found or already patched');
}

// Patch 2: Force dP.prototype.aF() to return true (license check)
console.log('\n[Patch 2] Forcing dP.prototype.aF() to return true...');
const patch2Before = code.length;
code = code.replace(
  /dP\.prototype\.aF=function\(\)\{if\(jZ\.ms\(\)\)return!0;return 4<U\.RW\[aK\.By\]\[aK\.AE\]\[aK\.aPi\]\(aK\.D_\("\)\\$!\}y"\)\)\}/,
  'dP.prototype.aF=function(){return!0}'
);
if (code.length !== patch2Before) {
  patchCount++;
  console.log('  ✓ Patched dP.prototype.aF()');
} else {
  console.log('  ✗ Pattern not found or already patched');
}

// Patch 3: Force U.alp() to return 1 (domain validation)
console.log('\n[Patch 3] Forcing U.alp() to return 1...');
const patch3Before = code.length;
code = code.replace(
  /U\.alp=function\(\)\{var z=U\.Zk\(\);if\(z==""\)return 0;if\(z!=U\.D_\("_TXZRPB;d7@;"\)&&z!=aK\.D_\("eQLZRRM\?8a4=8"\)&&z!=aK\.D_\("YMVVHAj=FA"\)\)\{var q=U\.RW\[aK\.By\]\[aK\.AE\],e=q\.indexOf\(String\.fromCharCode\(35\)\),B;if\(e==-1\)return 0;try\{B=JSON\.parse\(U\.RW\[aK\.adR\]\(q\.slice\(e\+1\)\)\)\}catch\(dp\)\{return 0\}var J=B\[U\.D_\("bQ\[ODL<E<M"\)\];if\(J==null\|\|J\.length<<2!=64\)return 0;var _=aK\.PC\(\),I=parseInt\(J\.slice\(3\*4\)\.split\(""\)\.reverse\(\)\.join\(""\),16\)<<16;if\(I<_\|\|J!=aK\.agu\(I,z\)\)return 0;return 2\}return 1\}/,
  'U.alp=function(){return 1}'
);
if (code.length !== patch3Before) {
  patchCount++;
  console.log('  ✓ Patched U.alp()');
} else {
  console.log('  ✗ Pattern not found or already patched');
}

// Patch 4: Initialize bM.ou to empty object instead of null
console.log('\n[Patch 4] Initializing bM.ou to {} instead of null...');
const patch4Before = code.length;
code = code.replace(
  /(bM:\{id:"ts"\+Math\.round\(Math\.random\(\)\*16777215\),adj:!1,aye:!1,kw:\{\},rT:\{\},ou:)null/,
  '$1{}'
);
if (code.length !== patch4Before) {
  patchCount++;
  console.log('  ✓ Patched bM.ou initialization');
} else {
  console.log('  ✗ Pattern not found or already patched');
}

// Patch 5: Mock IndexedDB transaction methods
console.log('\n[Patch 5] Adding IndexedDB transaction mocks...');
const patch5Before = code.length;
code = code.replace(
  /(bM:\{id:"ts"\+Math\.round\(Math\.random\(\)\*16777215\),adj:!1,aye:!1,kw:\{\},rT:\{\},ou:\{\}\},adF:0,a9s:null,tt:null,a0o:null,aC:null\})(;)/,
  '$1;if(this.i.bM.ou&&typeof this.i.bM.ou.transaction!=="function"){this.i.bM.ou.transaction=function(){return{objectStore:function(){return{put:function(){return{onerror:function(){}}},delete:function(){return{onerror:function(){}}},get:function(){return{onsuccess:function(){}}},getAllKeys:function(){return{onsuccess:function(){}}}}}}}}}$2'
);
if (code.length !== patch5Before) {
  patchCount++;
  console.log('  ✓ Added IDB transaction mocks');
} else {
  console.log('  ✗ Pattern not found or already patched');
}

// Write patched file
if (patchCount > 0) {
  const backupFile = targetFile + '.backup';
  if (!fs.existsSync(backupFile)) {
    console.log(`\nCreating backup: ${backupFile}`);
    fs.writeFileSync(backupFile, fs.readFileSync(targetFile));
  }

  console.log(`\nWriting patched file (${code.length} bytes, ${code.length - originalLength} diff)...`);
  fs.writeFileSync(targetFile, code);
  console.log(`\n✓ Successfully applied ${patchCount} patches!`);
  console.log('\nNext steps:');
  console.log('1. Open the app in your browser');
  console.log('2. Check browser console for errors');
  console.log('3. Test core functionality');
} else {
  console.log('\n✗ No patches applied. File may already be patched or patterns have changed.');
  process.exit(1);
}
