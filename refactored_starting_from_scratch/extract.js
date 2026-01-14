#!/usr/bin/env node
/**
 * Visual Cloner - Single Entry Point
 *
 * Usage:
 *   node extract.js <url>                     # Extract website
 *   node extract.js <url> --output ./my-dir   # Custom output
 *   node extract.js <url> --debug             # Debug logging
 *   node extract.js <url> --verbose           # Detailed phase metrics
 *   node extract.js <url> --headless false    # Show browser
 *
 * Commands:
 *   node extract.js serve <dir>               # Serve extraction
 *   node extract.js --help                    # Show help
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { Pipeline } from './core/pipeline.js';
import { ExtractionState } from './core/state.js';
import { Logger } from './core/logger.js';

import { InitPhase } from './phases/01-init.js';
import { CapturePhase } from './phases/02-capture.js';
import { TriggerPhase } from './phases/03-trigger.js';
import { DiscoverPhase } from './phases/04-discover.js';
import { AssemblePhase } from './phases/06-assemble.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
function parseArgs(args) {
  const result = {
    url: null,
    command: null,
    output: null,
    debug: false,
    verbose: false,
    headless: true,
    timeout: 60000,
    phase: null,
    dryRun: false,
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

    if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
      continue;
    }

    if (arg === '--dry-run') {
      result.dryRun = true;
      continue;
    }

    if (arg === '--output' || arg === '-o') {
      result.output = args[++i];
      continue;
    }

    if (arg === '--headless') {
      result.headless = args[++i] !== 'false';
      continue;
    }

    if (arg === '--timeout') {
      result.timeout = parseInt(args[++i], 10);
      continue;
    }

    if (arg.startsWith('--phase=')) {
      result.phase = arg.split('=')[1];
      continue;
    }

    if (arg === '--phase') {
      result.phase = args[++i];
      continue;
    }

    if (arg === 'serve') {
      result.command = 'serve';
      result.target = args[++i];
      continue;
    }

    // If starts with http, it's a URL
    if (arg.startsWith('http://') || arg.startsWith('https://')) {
      result.url = arg;
      continue;
    }

    // Otherwise might be a URL without protocol
    if (!arg.startsWith('-') && !result.url) {
      result.url = `https://${arg}`;
    }
  }

  return result;
}

function printUsage() {
  console.log(`
Visual Cloner - Extract any webapp to run locally

USAGE:
  node extract.js <url> [options]

EXAMPLES:
  node extract.js https://www.photopea.com
  node extract.js https://example.com --output ./my-output
  node extract.js https://example.com --debug --headless false
  node extract.js https://example.com --dry-run
  node extract.js https://example.com --phase=capture
  node extract.js https://example.com --phase=discover

OPTIONS:
  --output, -o <dir>    Output directory (default: ./output/<domain>-<timestamp>)
  --debug, -d           Enable debug logging
  --verbose, -v         Show detailed phase actions and metrics
  --dry-run             Show what would be done without actually doing it
  --headless <bool>     Run browser headless (default: true)
  --timeout <ms>        Page load timeout (default: 60000)
  --phase <name>        Run single phase in isolation (init, capture, trigger, discover, assemble)
                        For phases needing prior context, loads from checkpoint
  --help, -h            Show this help

COMMANDS:
  serve <dir>           Start local server for extraction

PHASE ISOLATION:
  Run a single phase for debugging or re-execution:
    --phase=init        Initialize browser and page
    --phase=capture     Capture network responses (needs init)
    --phase=trigger     Trigger dynamic content (needs capture)
    --phase=discover    Discover resources in page (needs capture)
    --phase=assemble    Assemble final output (needs all prior)

OUTPUT:
  After extraction, run the local server:
    cd <output-dir>
    node serve.js
    # Open http://localhost:3333
`);
}

async function runServe(dir) {
  const servePath = path.join(dir, 'serve.js');
  try {
    await fs.access(servePath);
    console.log(`Starting server from ${dir}...`);
    const { spawn } = await import('child_process');
    spawn('node', [servePath], { stdio: 'inherit' });
  } catch (e) {
    console.error(`Error: No serve.js found in ${dir}`);
    console.error('Make sure this is an extraction output directory.');
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Handle serve command
  if (args.command === 'serve') {
    if (!args.target) {
      console.error('Error: Please specify extraction directory');
      console.error('Usage: node extract.js serve <dir>');
      process.exit(1);
    }
    return runServe(args.target);
  }

  // Validate URL
  if (!args.url) {
    printUsage();
    process.exit(1);
  }

  // Validate phase if specified
  const validPhases = ['init', 'capture', 'trigger', 'discover', 'assemble'];
  if (args.phase && !validPhases.includes(args.phase)) {
    console.error(`Error: Invalid phase '${args.phase}'`);
    console.error(`Valid phases: ${validPhases.join(', ')}`);
    process.exit(1);
  }

  // Create logger
  const logger = new Logger({
    level: args.debug ? 'debug' : 'info',
    dryRun: args.dryRun
  });

  // Print header
  console.log('');
  console.log('='.repeat(50));
  console.log(`  VISUAL CLONER${args.dryRun ? ' [DRY RUN MODE]' : ''}`);
  console.log('='.repeat(50));
  console.log('');
  if (args.dryRun) {
    console.log('  NOTE: Dry run mode - no files will be written, minimal network requests');
    console.log('');
  }
  logger.info(`Target: ${args.url}`);
  if (args.phase) {
    logger.info(`Mode: Single phase (${args.phase})`);
  }

  // Generate output directory
  const domain = new URL(args.url).hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = args.output || path.join(__dirname, 'output', `${domain}-${timestamp}`);

  // Create output directory (unless dry run)
  if (!args.dryRun) {
    await fs.mkdir(outputDir, { recursive: true });
  }
  logger.info(`Output: ${outputDir}`);

  // Initialize state
  const state = new ExtractionState();
  state.init(args.url, outputDir);

  // Load checkpoint if running single phase (except init)
  if (args.phase && args.phase !== 'init') {
    const checkpointLoaded = await state.loadCheckpoint(outputDir);
    if (!checkpointLoaded) {
      console.error('');
      console.error(`Error: No checkpoint found in ${outputDir}`);
      console.error('');
      console.error('Phase isolation requires a checkpoint from prior phases.');
      console.error('Either run the full extraction first, or run phases in sequence:');
      console.error(`  node extract.js ${args.url} --phase=init`);
      console.error(`  node extract.js ${args.url} --phase=capture --output ${outputDir}`);
      console.error('');
      process.exit(1);
    }
    logger.info('Loaded checkpoint from prior phases');
  }

  // Build pipeline
  const config = {
    headless: args.headless,
    timeout: args.timeout,
    debug: args.debug,
    verbose: args.verbose,
    port: 3333,
    dryRun: args.dryRun,
  };

  const pipeline = new Pipeline(config);

  // If single phase mode, only add that phase
  if (args.phase) {
    const phaseMap = {
      'init': InitPhase,
      'capture': CapturePhase,
      'trigger': TriggerPhase,
      'discover': DiscoverPhase,
      'assemble': AssemblePhase,
    };
    const PhaseClass = phaseMap[args.phase];
    pipeline.addPhase(new PhaseClass(config));
    logger.info(`Running only: ${args.phase}`);
  } else {
    // Full pipeline
    pipeline.addPhase(new InitPhase(config));
    pipeline.addPhase(new CapturePhase(config));
    pipeline.addPhase(new TriggerPhase(config));
    pipeline.addPhase(new DiscoverPhase(config));
    pipeline.addPhase(new AssemblePhase(config));
  }

  // Execute pipeline
  try {
    await pipeline.execute(state, logger);

    // Get final result
    const result = state.getFinalResult();

    // Close browser
    if (state.context.browser) {
      await state.context.browser.close();
    }

    // Print summary
    logger.summary(args.dryRun ? 'DRY RUN COMPLETE' : 'EXTRACTION COMPLETE', {
      'URL': result.url,
      'Resources': result.resourceCount,
      'Total Size': `${(result.byType ? Object.values(result.byType).reduce((a, b) => a + b, 0) : result.resourceCount)} files`,
      'JavaScript': result.byType?.js || 0,
      'CSS': result.byType?.css || 0,
      'Images': result.byType?.image || 0,
      'Time': `${(result.totalTime / 1000).toFixed(1)}s`,
    });

    if (args.dryRun) {
      console.log('');
      console.log('  DRY RUN SUMMARY:');
      console.log('  - No files were written');
      console.log('  - Browser was launched but pages were not navigated');
      console.log('  - Resource discovery was simulated');
      console.log('  - To perform actual extraction, run without --dry-run');
      console.log('');
    } else {
      console.log('  To run locally:');
      console.log(`    cd ${outputDir}`);
      console.log('    node serve.js');
      console.log('    # Open http://localhost:3333');
      console.log('');
    }

  } catch (error) {
    // Close browser on error
    if (state.context.browser) {
      await state.context.browser.close();
    }

    // Save checkpoint with error (unless dry run)
    if (!args.dryRun) {
      await state.saveCheckpoint(outputDir);
    }

    // Print error
    console.error('');
    console.error('='.repeat(50));
    console.error('  EXTRACTION FAILED');
    console.error('='.repeat(50));
    console.error('');
    console.error(`  Phase: ${error.phaseName || 'unknown'}`);
    console.error(`  Error: ${error.message}`);
    console.error('');
    console.error(`  Checkpoint saved: ${outputDir}/.checkpoint.json`);
    console.error('');

    if (args.debug) {
      console.error('Stack trace:');
      console.error(error.stack);
    }

    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
