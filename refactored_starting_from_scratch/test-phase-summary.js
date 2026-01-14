#!/usr/bin/env node
/**
 * Test Phase Summary System
 *
 * This demonstrates the phase summary tracking without running a full extraction.
 */

import { ExtractionState } from './core/state.js';
import { Pipeline, Phase } from './core/pipeline.js';
import { Logger } from './core/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create a test phase that demonstrates all tracking features
class TestPhase extends Phase {
  constructor(config = {}) {
    super('test', 'Test phase with metrics tracking');
    this.config = config;
  }

  async execute(context) {
    // Simulate various actions with tracking
    this.trackAction('Starting test phase');

    // Simulate processing items
    for (let i = 0; i < 10; i++) {
      this.trackProcessed();
      await new Promise(resolve => setTimeout(resolve, 100));

      if (i % 3 === 0) {
        this.trackCreated();
        this.trackAction(`Created item ${i + 1}`);
      }

      if (i === 5) {
        this.trackWarning();
        this.logger.warn('Example warning occurred');
      }
    }

    // Simulate some modifications
    this.trackModified(3);
    this.trackAction('Modified 3 existing items');

    this.trackAction('Test phase complete');

    return {
      itemsProcessed: 10,
      itemsCreated: 4,
      itemsModified: 3,
      warnings: 1,
    };
  }
}

// Another test phase
class SecondTestPhase extends Phase {
  constructor(config = {}) {
    super('second', 'Second test phase');
    this.config = config;
  }

  async execute(context) {
    this.trackAction('Processing second phase');

    for (let i = 0; i < 5; i++) {
      this.trackProcessed();
      this.trackCreated();
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    this.trackAction('Completed successfully');

    return {
      success: true,
    };
  }
}

async function runTest() {
  console.log('');
  console.log('='.repeat(50));
  console.log('  PHASE SUMMARY SYSTEM TEST');
  console.log('='.repeat(50));
  console.log('');

  // Create test output directory
  const outputDir = path.join(__dirname, 'test-output');
  await fs.mkdir(outputDir, { recursive: true });

  // Initialize state
  const state = new ExtractionState();
  state.init('https://test-example.com', outputDir);

  // Create logger (verbose mode to see actions)
  const logger = new Logger({ level: 'info' });

  // Build pipeline
  const config = { verbose: true };
  const pipeline = new Pipeline(config);
  pipeline.addPhase(new TestPhase(config));
  pipeline.addPhase(new SecondTestPhase(config));

  // Execute
  try {
    await pipeline.execute(state, logger);

    // Print final summary
    console.log('');
    console.log('='.repeat(50));
    console.log('  TEST COMPLETE');
    console.log('='.repeat(50));
    console.log('');
    console.log(`Phase summary saved to: ${outputDir}/phase-summary.json`);
    console.log('');

    // Read and display the summary
    const summaryPath = path.join(outputDir, 'phase-summary.json');
    const summary = JSON.parse(await fs.readFile(summaryPath, 'utf-8'));

    console.log('Summary contents:');
    console.log(JSON.stringify(summary, null, 2));
    console.log('');

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
