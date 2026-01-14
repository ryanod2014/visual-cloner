#!/usr/bin/env node
/**
 * Generic Web App Extractor
 *
 * Usage:
 *   node extract.js <url>                    # Basic extraction
 *   node extract.js <url> --phase=03         # Start from specific phase
 *   node extract.js <url> --no-triggers      # Skip trigger phase
 *   node extract.js <url> --debug            # Verbose debug output
 *   node extract.js serve <output-dir>       # Serve extracted app
 *   node extract.js validate <output-dir>    # Validate extraction
 */

import { Pipeline } from './core/index.js';
import { parseArgs } from 'util';
import { existsSync } from 'fs';
import { resolve } from 'path';
import express from 'express';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

const c = (color, text) => `${colors[color]}${text}${colors.reset}`;

// Help message
const HELP = `
${c('cyan', c('bold', 'Generic Web App Extractor'))}

${c('yellow', 'Usage:')}
  node extract.js <url>                    Extract a web app
  node extract.js serve <output-dir>       Serve extracted app locally
  node extract.js validate <output-dir>    Validate extraction completeness

${c('yellow', 'Options:')}
  --phase=<num>      Start from specific phase (e.g., --phase=03)
  --no-triggers      Skip the trigger discovery phase
  --no-patch         Skip the patching phase
  --debug            Enable verbose debug output
  --output=<dir>     Custom output directory (default: ./output/<domain>)
  --help, -h         Show this help message

${c('yellow', 'Examples:')}
  node extract.js https://example.com
  node extract.js https://app.example.com --phase=03 --debug
  node extract.js https://example.com --output=./my-extraction
  node extract.js serve ./output/example.com
  node extract.js validate ./output/example.com

${c('yellow', 'Phases:')}
  01  Initial page load capture
  02  Asset discovery and download
  03  Trigger interaction capture
  04  Patching and finalization

${c('dim', 'Press Ctrl+C during extraction to save checkpoint and exit gracefully.')}
`;

// Parse command line arguments
function parseCliArgs() {
  const args = process.argv.slice(2);

  // Check for help flag first
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  // Check for subcommands
  const command = args[0];
  if (command === 'serve') {
    return { command: 'serve', dir: args[1] };
  }
  if (command === 'validate') {
    return { command: 'validate', dir: args[1] };
  }

  // Parse extraction options
  const options = {
    command: 'extract',
    url: null,
    phase: null,
    noTriggers: false,
    noPatch: false,
    debug: false,
    output: null,
  };

  for (const arg of args) {
    if (arg.startsWith('--phase=')) {
      options.phase = arg.split('=')[1];
    } else if (arg === '--no-triggers') {
      options.noTriggers = true;
    } else if (arg === '--no-patch') {
      options.noPatch = true;
    } else if (arg === '--debug') {
      options.debug = true;
    } else if (arg.startsWith('--output=')) {
      options.output = arg.split('=')[1];
    } else if (!arg.startsWith('--') && !options.url) {
      options.url = arg;
    }
  }

  return options;
}

// Serve extracted app locally
async function serveExtractedApp(dir) {
  const resolvedDir = resolve(dir);

  if (!existsSync(resolvedDir)) {
    console.error(c('red', `Error: Directory not found: ${resolvedDir}`));
    process.exit(1);
  }

  const app = express();
  const port = 3000;

  // Serve static files
  app.use(express.static(resolvedDir));

  // Fallback to index.html for SPA routing
  app.get('*', (req, res) => {
    const indexPath = resolve(resolvedDir, 'index.html');
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Not found');
    }
  });

  app.listen(port, () => {
    console.log(c('green', `\nServing extracted app from: ${resolvedDir}`));
    console.log(c('cyan', `\nOpen in browser: http://localhost:${port}`));
    console.log(c('dim', '\nPress Ctrl+C to stop the server.\n'));
  });
}

// Validate extraction
async function validateExtraction(dir) {
  const resolvedDir = resolve(dir);

  if (!existsSync(resolvedDir)) {
    console.error(c('red', `Error: Directory not found: ${resolvedDir}`));
    process.exit(1);
  }

  console.log(c('cyan', `\nValidating extraction: ${resolvedDir}\n`));

  const checks = [
    { name: 'index.html exists', path: 'index.html' },
    { name: 'manifest.json exists', path: 'manifest.json' },
    { name: 'assets directory exists', path: 'assets' },
  ];

  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    const fullPath = resolve(resolvedDir, check.path);
    if (existsSync(fullPath)) {
      console.log(c('green', `  [PASS] ${check.name}`));
      passed++;
    } else {
      console.log(c('red', `  [FAIL] ${check.name}`));
      failed++;
    }
  }

  console.log('');
  if (failed === 0) {
    console.log(c('green', `All ${passed} checks passed!`));
    process.exit(0);
  } else {
    console.log(c('yellow', `${passed} passed, ${failed} failed`));
    process.exit(1);
  }
}

// Run extraction
async function runExtraction(options) {
  if (!options.url) {
    console.error(c('red', 'Error: URL is required'));
    console.log(c('dim', 'Run with --help for usage information'));
    process.exit(1);
  }

  // Validate URL
  let url;
  try {
    url = new URL(options.url);
  } catch (e) {
    console.error(c('red', `Error: Invalid URL: ${options.url}`));
    process.exit(1);
  }

  console.log(c('cyan', c('bold', '\n  Web App Extractor\n')));
  console.log(c('white', `  Target: ${c('bold', url.href)}`));
  if (options.phase) {
    console.log(c('white', `  Starting from phase: ${c('bold', options.phase)}`));
  }
  if (options.noTriggers) {
    console.log(c('yellow', '  Triggers: skipped'));
  }
  if (options.noPatch) {
    console.log(c('yellow', '  Patching: skipped'));
  }
  if (options.debug) {
    console.log(c('magenta', '  Debug mode: enabled'));
  }
  console.log('');

  // Build pipeline configuration
  const pipelineConfig = {
    url: url.href,
    outputDir: options.output || `./output/${url.hostname}`,
    debug: options.debug,
    skipTriggers: options.noTriggers,
    skipPatch: options.noPatch,
    startPhase: options.phase,
  };

  // Track if we're shutting down
  let isShuttingDown = false;
  let pipeline = null;

  // Handle Ctrl+C gracefully
  const handleShutdown = async (signal) => {
    if (isShuttingDown) {
      console.log(c('red', '\nForce quitting...'));
      process.exit(1);
    }

    isShuttingDown = true;
    console.log(c('yellow', `\n\nReceived ${signal}. Saving checkpoint...`));

    if (pipeline) {
      try {
        await pipeline.saveCheckpoint();
        console.log(c('green', 'Checkpoint saved. You can resume with --phase option.'));
      } catch (e) {
        console.error(c('red', `Failed to save checkpoint: ${e.message}`));
      }
    }

    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // Run the pipeline
  const startTime = Date.now();

  try {
    pipeline = new Pipeline(pipelineConfig);

    // Progress callback
    pipeline.on('progress', (phase, message) => {
      const prefix = c('blue', `[${phase}]`);
      console.log(`${prefix} ${message}`);
    });

    pipeline.on('phase:start', (phase) => {
      console.log(c('cyan', `\n>> Starting phase ${phase.id}: ${phase.name}`));
    });

    pipeline.on('phase:complete', (phase) => {
      console.log(c('green', `[OK] Phase ${phase.id} complete`));
    });

    pipeline.on('warning', (message) => {
      console.log(c('yellow', `[WARN] ${message}`));
    });

    if (options.debug) {
      pipeline.on('debug', (message) => {
        console.log(c('dim', `  [debug] ${message}`));
      });
    }

    // Execute extraction
    const result = await pipeline.run();

    // Show summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(c('green', '\n' + '='.repeat(50)));
    console.log(c('green', c('bold', '  Extraction Complete!')));
    console.log(c('green', '='.repeat(50)));
    console.log('');
    console.log(`  ${c('white', 'Output:')} ${result.outputDir}`);
    console.log(`  ${c('white', 'Duration:')} ${duration}s`);
    console.log(`  ${c('white', 'Assets:')} ${result.assetCount || 'N/A'}`);
    console.log(`  ${c('white', 'Pages:')} ${result.pageCount || 'N/A'}`);
    console.log('');
    console.log(c('dim', `  To serve: node extract.js serve ${result.outputDir}`));
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error(c('red', `\n[ERROR] Extraction failed: ${error.message}`));

    if (options.debug) {
      console.error(c('dim', error.stack));
    }

    // Try to save checkpoint on error
    if (pipeline) {
      try {
        await pipeline.saveCheckpoint();
        console.log(c('yellow', '\nCheckpoint saved. You may be able to resume.'));
      } catch (e) {
        // Ignore checkpoint save errors
      }
    }

    process.exit(1);
  }
}

// Main entry point
async function main() {
  const options = parseCliArgs();

  switch (options.command) {
    case 'serve':
      if (!options.dir) {
        console.error(c('red', 'Error: Directory required for serve command'));
        console.log(c('dim', 'Usage: node extract.js serve <output-dir>'));
        process.exit(1);
      }
      await serveExtractedApp(options.dir);
      break;

    case 'validate':
      if (!options.dir) {
        console.error(c('red', 'Error: Directory required for validate command'));
        console.log(c('dim', 'Usage: node extract.js validate <output-dir>'));
        process.exit(1);
      }
      await validateExtraction(options.dir);
      break;

    case 'extract':
    default:
      await runExtraction(options);
      break;
  }
}

main().catch((error) => {
  console.error(c('red', `Fatal error: ${error.message}`));
  process.exit(1);
});
