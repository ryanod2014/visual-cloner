#!/usr/bin/env node
/**
 * Standalone Patching Script
 *
 * Apply patches to extracted resources independently of extraction.
 *
 * Usage:
 *   node patch.js <output-dir>
 *   node patch.js ./output/photopea.com-123456/
 *
 * This script:
 * 1. Reads extracted resources from output folder
 * 2. Applies all patches from plugins/patchers/
 * 3. Saves patched files back to resources/
 * 4. Updates manifest with patch statistics
 * 5. Can be run multiple times safely
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Import all patchers
import { getAllPatchers } from './plugins/patchers/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function logInfo(msg) {
  log(`  ${msg}`, colors.cyan);
}

function logSuccess(msg) {
  log(`  ${msg}`, colors.green);
}

function logWarning(msg) {
  log(`  ${msg}`, colors.yellow);
}

function logError(msg) {
  log(`  ${msg}`, colors.red);
}

function logDebug(msg) {
  if (process.argv.includes('--debug') || process.argv.includes('-d')) {
    log(`  ${msg}`, colors.dim);
  }
}

function printUsage() {
  console.log(`
${colors.bright}Standalone Patching Script${colors.reset}

${colors.bright}USAGE:${colors.reset}
  node patch.js <output-dir> [options]

${colors.bright}EXAMPLES:${colors.reset}
  node patch.js ./output/photopea.com-123456/
  node patch.js ./output/example.com-123456/ --debug
  node patch.js ./output/photopea.com-123456/ --dry-run

${colors.bright}OPTIONS:${colors.reset}
  --debug, -d       Enable debug logging
  --dry-run         Show what would be patched without modifying files
  --backup          Create .bak files before patching
  --help, -h        Show this help

${colors.bright}WORKFLOW:${colors.reset}
  # Extract (pure capture)
  node extract.js https://photopea.com

  # Patch (separate step)
  node patch.js ./output/photopea.com-123456/

  # Serve
  cd ./output/photopea.com-123456/
  node serve.js
`);
}

async function parseArgs(args) {
  const result = {
    outputDir: null,
    debug: false,
    dryRun: false,
    backup: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--debug' || arg === '-d') {
      result.debug = true;
      continue;
    }

    if (arg === '--dry-run') {
      result.dryRun = true;
      continue;
    }

    if (arg === '--backup') {
      result.backup = true;
      continue;
    }

    // First non-flag arg is the output directory
    if (!arg.startsWith('-') && !result.outputDir) {
      result.outputDir = arg;
    }
  }

  return result;
}

/**
 * Validate that the directory is a valid extraction output
 */
async function validateOutputDir(outputDir) {
  try {
    // Check that directory exists
    const stats = await fs.stat(outputDir);
    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory');
    }

    // Check for required files
    const resourcesDir = path.join(outputDir, 'resources');
    const urlMapPath = path.join(outputDir, 'url-map.json');

    await fs.access(resourcesDir);
    await fs.access(urlMapPath);

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Load URL map to find resource files
 */
async function loadUrlMap(outputDir) {
  const urlMapPath = path.join(outputDir, 'url-map.json');
  const data = await fs.readFile(urlMapPath, 'utf-8');
  return JSON.parse(data);
}

/**
 * Load manifest
 */
async function loadManifest(outputDir) {
  const manifestPath = path.join(outputDir, 'manifest.json');
  try {
    const data = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

/**
 * Save manifest
 */
async function saveManifest(outputDir, manifest) {
  const manifestPath = path.join(outputDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * Extract filename from URL
 */
function getFilename(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    return pathname.split('/').pop() || 'index.html';
  } catch {
    return url.split('/').pop() || 'unknown';
  }
}

/**
 * Check if content is text-based and patchable
 */
function isTextContent(contentType, localFile) {
  if (!contentType && !localFile.endsWith('.js')) {
    return false;
  }

  const isText = !contentType ||
                 contentType.includes('javascript') ||
                 contentType.includes('text/') ||
                 contentType.includes('application/');

  return isText;
}

/**
 * Apply all patches to a single resource
 */
function applyPatches(content, filename, patchers) {
  let modified = content;
  let wasPatched = false;
  const filePatches = [];

  for (const patcher of patchers) {
    if (!patcher.shouldApply(modified, filename)) {
      continue;
    }

    logDebug(`Applying ${patcher.name} to ${filename}`);

    const result = patcher.apply(modified);

    if (result.patches.length > 0) {
      modified = result.content;
      wasPatched = true;

      for (const patch of result.patches) {
        filePatches.push({
          patcher: patcher.name,
          pattern: patch.name,
          count: patch.count,
          examples: patch.examples,
        });
      }
    }
  }

  return {
    content: modified,
    wasPatched,
    patches: filePatches,
  };
}

/**
 * Main patching function
 */
async function patchResources(outputDir, options) {
  const startTime = Date.now();

  log('');
  log('='.repeat(60), colors.bright);
  log('  STANDALONE PATCHER', colors.bright);
  log('='.repeat(60), colors.bright);
  log('');

  // Validate directory
  logInfo(`Validating output directory: ${outputDir}`);
  const isValid = await validateOutputDir(outputDir);
  if (!isValid) {
    logError('Invalid extraction directory!');
    logError('Directory must contain:');
    logError('  - resources/ folder');
    logError('  - url-map.json file');
    console.log('');
    console.log('Did you run extract.js first?');
    process.exit(1);
  }
  logSuccess('Directory validated');

  // Load URL map
  logInfo('Loading url-map.json...');
  const urlMap = await loadUrlMap(outputDir);
  const resourceCount = Object.keys(urlMap).length;
  logSuccess(`Loaded ${resourceCount} resource mappings`);

  // Load manifest
  const manifest = await loadManifest(outputDir);

  // Initialize patchers
  logInfo('Initializing patchers...');
  const patchers = getAllPatchers();
  logSuccess(`Loaded ${patchers.length} patchers:`);
  for (const patcher of patchers) {
    logInfo(`  - ${patcher.name}: ${patcher.description}`);
  }

  // Process each resource
  log('');
  logInfo('Processing resources...');
  let processedCount = 0;
  let patchedCount = 0;
  let totalPatches = 0;
  const patchReport = [];

  for (const [url, resource] of Object.entries(urlMap)) {
    const { localFile, contentType } = resource;
    const filename = getFilename(url);

    // Only patch text content
    if (!isTextContent(contentType, localFile)) {
      continue;
    }

    processedCount++;

    // Read file
    const filePath = path.join(outputDir, localFile);
    let content;
    try {
      const buffer = await fs.readFile(filePath);
      content = buffer.toString('utf-8');
    } catch (error) {
      logWarning(`Failed to read ${localFile}: ${error.message}`);
      continue;
    }

    // Apply patches
    const result = applyPatches(content, filename, patchers);

    if (result.wasPatched) {
      patchedCount++;
      const patchCount = result.patches.reduce((sum, p) => sum + p.count, 0);
      totalPatches += patchCount;

      // Log what was patched
      logSuccess(`${filename}:`);
      for (const p of result.patches) {
        logInfo(`  ${p.patcher}/${p.pattern}: ${p.count} replacement(s)`);
        if (options.debug && p.examples.length > 0) {
          for (const example of p.examples.slice(0, 2)) {
            logDebug(`    Example: ${example}`);
          }
        }
      }

      // Add to report
      patchReport.push({
        file: filename,
        url: url,
        localFile: localFile,
        patches: result.patches,
      });

      // Save patched file (unless dry-run)
      if (!options.dryRun) {
        // Backup if requested
        if (options.backup) {
          const backupPath = `${filePath}.bak`;
          await fs.copyFile(filePath, backupPath);
          logDebug(`  Created backup: ${backupPath}`);
        }

        // Write patched content
        await fs.writeFile(filePath, result.content, 'utf-8');
      }
    }

    // Progress
    if (processedCount % 50 === 0) {
      logDebug(`Processed ${processedCount} files...`);
    }
  }

  // Save patch report
  if (!options.dryRun && patchReport.length > 0) {
    const reportPath = path.join(outputDir, 'patch-report.json');
    await fs.writeFile(reportPath, JSON.stringify(patchReport, null, 2));
    logInfo(`Saved patch report: ${reportPath}`);
  }

  // Update manifest
  if (!options.dryRun && manifest) {
    manifest.patchCount = totalPatches;
    manifest.patchedFiles = patchedCount;
    manifest.lastPatched = new Date().toISOString();
    await saveManifest(outputDir, manifest);
    logInfo('Updated manifest.json');
  }

  // Print summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  log('');
  log('='.repeat(60), colors.bright);
  log('  PATCHING COMPLETE', colors.bright);
  log('='.repeat(60), colors.bright);
  log('');
  logInfo(`Processed: ${processedCount} text files`);
  logSuccess(`Patched: ${patchedCount} files`);
  logSuccess(`Total patches: ${totalPatches}`);
  logInfo(`Duration: ${duration}s`);

  if (options.dryRun) {
    log('');
    logWarning('DRY RUN - No files were modified');
  }

  if (patchedCount > 0 && !options.dryRun) {
    log('');
    logInfo('Files have been patched in place.');
    logInfo('To serve the patched application:');
    console.log('');
    console.log(`  cd ${outputDir}`);
    console.log('  node serve.js');
    console.log('  # Open http://localhost:3333');
  } else if (patchedCount === 0) {
    log('');
    logInfo('No patches were needed for these files.');
  }

  log('');
}

/**
 * Main entry point
 */
async function main() {
  const options = await parseArgs(process.argv.slice(2));

  if (!options.outputDir) {
    printUsage();
    process.exit(1);
  }

  // Resolve to absolute path
  const outputDir = path.resolve(options.outputDir);

  try {
    await patchResources(outputDir, options);
  } catch (error) {
    log('');
    logError('PATCHING FAILED');
    logError(`Error: ${error.message}`);

    if (options.debug) {
      console.log('');
      console.error(error.stack);
    }

    log('');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
