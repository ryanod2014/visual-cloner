#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

const c = (color, text) => `${colors[color]}${text}${colors.reset}`;

// Symbols
const CHECK = c('green', '✓');
const CROSS = c('red', '✗');
const WARNING = c('yellow', '⚠️');
const INFO = c('blue', 'ℹ️');

/**
 * Get all files recursively in a directory
 */
function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push({
        path: filePath,
        relativePath: path.relative(dir, filePath),
        size: stat.size
      });
    }
  }

  return fileList;
}

/**
 * Calculate MD5 hash of a file
 */
function getFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format number with commas
 */
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Find the largest JS file (likely the main bundle)
 */
function findMainJsBundle(files) {
  const jsFiles = files.filter(f => f.relativePath.endsWith('.js'));
  if (jsFiles.length === 0) return null;

  // Sort by size descending
  jsFiles.sort((a, b) => b.size - a.size);
  return jsFiles[0];
}

/**
 * Search for patterns in a file
 */
function searchPatterns(filePath, patterns) {
  const content = fs.readFileSync(filePath, 'utf8');
  const results = {};

  for (const [name, pattern] of Object.entries(patterns)) {
    if (typeof pattern === 'string') {
      results[name] = content.includes(pattern);
    } else {
      results[name] = pattern.test(content);
    }
  }

  return results;
}

/**
 * Load and parse URL map
 */
function loadUrlMap(dir) {
  const urlMapPath = path.join(dir, 'url-map.json');
  if (!fs.existsSync(urlMapPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(urlMapPath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

/**
 * Compare two arrays and find differences
 */
function arrayDiff(arr1, arr2) {
  const set2 = new Set(arr2);
  return arr1.filter(item => !set2.has(item));
}

/**
 * Main diagnosis function
 */
function diagnose(workingDir, brokenDir) {
  console.log(c('bright', '\n══════════════════════════════════════════════════'));
  console.log(c('bright', '           EXTRACTION DIAGNOSIS'));
  console.log(c('bright', '══════════════════════════════════════════════════\n'));

  console.log(c('cyan', 'WORKING:'), c('dim', workingDir));
  console.log(c('magenta', 'BROKEN: '), c('dim', brokenDir));
  console.log();

  // Verify directories exist
  if (!fs.existsSync(workingDir)) {
    console.log(c('red', `Error: Working directory does not exist: ${workingDir}`));
    process.exit(1);
  }
  if (!fs.existsSync(brokenDir)) {
    console.log(c('red', `Error: Broken directory does not exist: ${brokenDir}`));
    process.exit(1);
  }

  // ========================================================================
  // FILE INVENTORY COMPARISON
  // ========================================================================
  console.log(c('bright', '─'.repeat(70)));
  console.log(c('bright', 'FILE INVENTORY'));
  console.log(c('bright', '─'.repeat(70)));

  const workingFiles = getAllFiles(workingDir);
  const brokenFiles = getAllFiles(brokenDir);

  const workingSize = workingFiles.reduce((sum, f) => sum + f.size, 0);
  const brokenSize = brokenFiles.reduce((sum, f) => sum + f.size, 0);

  console.log(`  Working: ${formatNumber(workingFiles.length)} files (${formatBytes(workingSize)})`);
  console.log(`  Broken:  ${formatNumber(brokenFiles.length)} files (${formatBytes(brokenSize)})`);

  const fileCountMatch = workingFiles.length === brokenFiles.length;
  const sizeMatch = Math.abs(workingSize - brokenSize) < 1024; // Within 1KB

  if (fileCountMatch && sizeMatch) {
    console.log(`  Status:  ${CHECK} ${c('green', 'IDENTICAL')}`);
  } else if (Math.abs(workingFiles.length - brokenFiles.length) < 10) {
    console.log(`  Status:  ${WARNING} ${c('yellow', 'SIMILAR')}`);
  } else {
    console.log(`  Status:  ${CROSS} ${c('red', 'DIFFERENT')}`);
  }

  // Find files in one but not the other
  const workingPaths = workingFiles.map(f => f.relativePath);
  const brokenPaths = brokenFiles.map(f => f.relativePath);

  const onlyInWorking = arrayDiff(workingPaths, brokenPaths);
  const onlyInBroken = arrayDiff(brokenPaths, workingPaths);

  if (onlyInWorking.length > 0 || onlyInBroken.length > 0) {
    console.log();
    if (onlyInWorking.length > 0) {
      console.log(c('yellow', `  Files only in working (${onlyInWorking.length}):`));
      onlyInWorking.slice(0, 5).forEach(f => {
        console.log(c('dim', `    - ${f}`));
      });
      if (onlyInWorking.length > 5) {
        console.log(c('dim', `    ... and ${onlyInWorking.length - 5} more`));
      }
    }

    if (onlyInBroken.length > 0) {
      console.log(c('yellow', `  Files only in broken (${onlyInBroken.length}):`));
      onlyInBroken.slice(0, 5).forEach(f => {
        console.log(c('dim', `    - ${f}`));
      });
      if (onlyInBroken.length > 5) {
        console.log(c('dim', `    ... and ${onlyInBroken.length - 5} more`));
      }
    }
  }

  console.log();

  // ========================================================================
  // MAIN JS BUNDLE COMPARISON
  // ========================================================================
  console.log(c('bright', '─'.repeat(70)));
  console.log(c('bright', 'MAIN JS BUNDLE'));
  console.log(c('bright', '─'.repeat(70)));

  const workingMainJs = findMainJsBundle(workingFiles);
  const brokenMainJs = findMainJsBundle(brokenFiles);

  if (!workingMainJs) {
    console.log(c('red', '  Error: No JS files found in working directory'));
  } else if (!brokenMainJs) {
    console.log(c('red', '  Error: No JS files found in broken directory'));
  } else {
    const workingHash = getFileHash(workingMainJs.path);
    const brokenHash = getFileHash(brokenMainJs.path);

    console.log(`  Working: ${c('cyan', workingMainJs.relativePath)} (${formatBytes(workingMainJs.size)})`);
    console.log(`           Hash: ${c('dim', workingHash)}`);
    console.log();
    console.log(`  Broken:  ${c('magenta', brokenMainJs.relativePath)} (${formatBytes(brokenMainJs.size)})`);
    console.log(`           Hash: ${c('dim', brokenHash)}`);
    console.log();

    if (workingHash === brokenHash) {
      console.log(`  Status:  ${CHECK} ${c('green', 'IDENTICAL FILES')}`);
    } else {
      console.log(`  Status:  ${CROSS} ${c('red', 'DIFFERENT FILES')}`);

      const sizeDiff = Math.abs(workingMainJs.size - brokenMainJs.size);
      const pctDiff = ((sizeDiff / workingMainJs.size) * 100).toFixed(1);
      console.log(`  Size Δ:  ${formatBytes(sizeDiff)} (${pctDiff}% difference)`);
    }
  }

  console.log();

  // ========================================================================
  // CODE PATTERN ANALYSIS
  // ========================================================================
  console.log(c('bright', '─'.repeat(70)));
  console.log(c('bright', 'CODE PATTERN ANALYSIS'));
  console.log(c('bright', '─'.repeat(70)));

  if (workingMainJs && brokenMainJs) {
    const patterns = {
      'var ht=hostname': /var\s+ht\s*=\s*hostname/,
      'var lm=0': /var\s+lm\s*=\s*0/,
      'var lm=': /var\s+lm\s*=/,
      'hostname check': /hostname/i,
      'photopea.com': 'photopea.com',
      'vectorpea.com': 'vectorpea.com',
      'vecpea.com': 'vecpea.com',
      'J.adQ=function': /J\.adQ\s*=\s*function/,
      'U.alp=function': /U\.alp\s*=\s*function/,
      'window.location': /window\.location/,
      'document.domain': /document\.domain/,
    };

    const workingPatterns = searchPatterns(workingMainJs.path, patterns);
    const brokenPatterns = searchPatterns(brokenMainJs.path, patterns);

    console.log(`  ${'Pattern'.padEnd(30)} ${'Working'.padEnd(12)} Broken`);
    console.log(`  ${'─'.repeat(30)} ${'─'.repeat(12)} ${'─'.repeat(12)}`);

    const diagnoses = [];

    for (const [pattern, _] of Object.entries(patterns)) {
      const workingFound = workingPatterns[pattern];
      const brokenFound = brokenPatterns[pattern];

      const workingStatus = workingFound ? CHECK : CROSS;
      const brokenStatus = brokenFound ? CHECK : CROSS;

      const workingText = workingFound ? c('green', 'Found') : c('red', 'Missing');
      const brokenText = brokenFound ? c('green', 'Found') : c('red', 'Missing');

      console.log(`  ${pattern.padEnd(30)} ${workingStatus} ${workingText.padEnd(20)} ${brokenStatus} ${brokenText}`);

      // Track significant differences
      if (workingFound !== brokenFound) {
        diagnoses.push({
          pattern,
          inWorking: workingFound,
          inBroken: brokenFound
        });
      }
    }

    console.log();

    // ========================================================================
    // URL MAP COMPARISON
    // ========================================================================
    console.log(c('bright', '─'.repeat(70)));
    console.log(c('bright', 'URL MAP COMPARISON'));
    console.log(c('bright', '─'.repeat(70)));

    const workingUrlMap = loadUrlMap(workingDir);
    const brokenUrlMap = loadUrlMap(brokenDir);

    if (!workingUrlMap) {
      console.log(`  Working: ${CROSS} ${c('red', 'url-map.json not found')}`);
    } else {
      console.log(`  Working: ${CHECK} ${formatNumber(Object.keys(workingUrlMap).length)} URLs mapped`);
    }

    if (!brokenUrlMap) {
      console.log(`  Broken:  ${CROSS} ${c('red', 'url-map.json not found')}`);
    } else {
      console.log(`  Broken:  ${CHECK} ${formatNumber(Object.keys(brokenUrlMap).length)} URLs mapped`);
    }

    if (workingUrlMap && brokenUrlMap) {
      const workingUrls = Object.keys(workingUrlMap);
      const brokenUrls = Object.keys(brokenUrlMap);

      const onlyInWorkingUrls = arrayDiff(workingUrls, brokenUrls);
      const onlyInBrokenUrls = arrayDiff(brokenUrls, workingUrls);

      if (workingUrls.length === brokenUrls.length && onlyInWorkingUrls.length === 0) {
        console.log(`  Status:  ${CHECK} ${c('green', 'IDENTICAL')}`);
      } else {
        console.log(`  Status:  ${WARNING} ${c('yellow', 'DIFFERENT')}`);

        if (onlyInWorkingUrls.length > 0) {
          console.log();
          console.log(c('yellow', `  URLs only in working (${onlyInWorkingUrls.length}):`));
          onlyInWorkingUrls.slice(0, 3).forEach(url => {
            console.log(c('dim', `    - ${url}`));
          });
          if (onlyInWorkingUrls.length > 3) {
            console.log(c('dim', `    ... and ${onlyInWorkingUrls.length - 3} more`));
          }
        }

        if (onlyInBrokenUrls.length > 0) {
          console.log();
          console.log(c('yellow', `  URLs only in broken (${onlyInBrokenUrls.length}):`));
          onlyInBrokenUrls.slice(0, 3).forEach(url => {
            console.log(c('dim', `    - ${url}`));
          });
          if (onlyInBrokenUrls.length > 3) {
            console.log(c('dim', `    ... and ${onlyInBrokenUrls.length - 3} more`));
          }
        }
      }
    }

    console.log();

    // ========================================================================
    // DIAGNOSIS & RECOMMENDATIONS
    // ========================================================================
    console.log(c('bright', '─'.repeat(70)));
    console.log(c('bright', 'LIKELY CAUSE'));
    console.log(c('bright', '─'.repeat(70)));

    if (workingHash === brokenHash) {
      console.log(c('green', '  ✓ The main JS bundles are IDENTICAL.'));
      console.log(c('dim', '    The issue likely lies outside the main JavaScript code.'));
    } else {
      console.log(c('red', '  ✗ Different JS bundles were captured.'));
      console.log();

      // Analyze pattern differences to provide specific diagnosis
      const hasHostnameInWorking = workingPatterns['var ht=hostname'] || workingPatterns['hostname check'];
      const hasHostnameInBroken = brokenPatterns['var ht=hostname'] || brokenPatterns['hostname check'];

      const hasStaticInWorking = workingPatterns['var lm=0'];
      const hasStaticInBroken = brokenPatterns['var lm=0'];

      if (hasHostnameInWorking && !hasHostnameInBroken && hasStaticInBroken) {
        console.log(c('yellow', '  Key Finding:'));
        console.log(c('dim', '    • Working has dynamic hostname checking (var ht=hostname)'));
        console.log(c('dim', '    • Broken has static mode value (var lm=0)'));
        console.log();
        console.log(c('dim', '    This suggests the broken extraction captured a different build,'));
        console.log(c('dim', '    possibly one intended for a different domain or environment.'));
      } else if (diagnoses.length > 0) {
        console.log(c('yellow', '  Key Differences:'));
        diagnoses.slice(0, 3).forEach(d => {
          const status = d.inWorking ? 'Present in working, missing in broken' : 'Present in broken, missing in working';
          console.log(c('dim', `    • ${d.pattern}: ${status}`));
        });
      }
    }

    console.log();
    console.log(c('bright', '─'.repeat(70)));
    console.log(c('bright', 'RECOMMENDATIONS'));
    console.log(c('bright', '─'.repeat(70)));

    if (workingHash !== brokenHash) {
      console.log(c('cyan', '  1. Check CDN behavior'));
      console.log(c('dim', '     The CDN may serve different code based on:'));
      console.log(c('dim', '     • Referrer header'));
      console.log(c('dim', '     • User-Agent string'));
      console.log(c('dim', '     • Geographic location'));
      console.log(c('dim', '     • Time of request (A/B testing)'));
      console.log();
      console.log(c('cyan', '  2. Compare request headers'));
      console.log(c('dim', '     Check if the working and broken extractions used different headers.'));
      console.log();
      console.log(c('cyan', '  3. Verify domain context'));
      console.log(c('dim', '     Ensure the extraction is requesting resources in the context of'));
      console.log(c('dim', '     the correct domain (photopea.com vs vectorpea.com).'));
      console.log();

      if (brokenPatterns['vectorpea.com'] && !workingPatterns['vectorpea.com']) {
        console.log(c('yellow', '  ⚠️  WARNING: Broken extraction may have captured Vectorpea builds!'));
      }
    } else {
      console.log(c('green', '  The extractions appear to be identical at the JS bundle level.'));
      console.log(c('dim', '  Check for differences in:'));
      console.log(c('dim', '  • HTML structure'));
      console.log(c('dim', '  • CSS files'));
      console.log(c('dim', '  • Resource loading order'));
      console.log(c('dim', '  • Runtime configuration'));
    }
  }

  console.log();
  console.log(c('bright', '══════════════════════════════════════════════════\n'));
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.log(c('red', 'Error: Expected 2 arguments'));
    console.log();
    console.log(c('bright', 'Usage:'));
    console.log(`  node diagnose.js ${c('cyan', '<working-dir>')} ${c('magenta', '<broken-dir>')}`);
    console.log();
    console.log(c('bright', 'Example:'));
    console.log(c('dim', '  node diagnose.js ../output/photopea.com-complete-1767957633072 ./output/photopea.com-1768366209046'));
    console.log();
    process.exit(1);
  }

  const [workingDir, brokenDir] = args;
  diagnose(workingDir, brokenDir);
}

module.exports = { diagnose };
