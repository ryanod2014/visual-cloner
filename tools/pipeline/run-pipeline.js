#!/usr/bin/env node
/**
 * Pipeline Runner V2
 *
 * Executes all pipeline steps sequentially for complete webapp extraction.
 *
 * Usage: node run-pipeline.js <url> <output-dir> [app-jsx-path]
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.argv[2];
const outputDir = process.argv[3] || './pipeline-output';
const appJsxPath = process.argv[4];

if (!url) {
  console.log('Usage: node run-pipeline.js <url> <output-dir> [app-jsx-path]');
  console.log('');
  console.log('Pipeline Steps:');
  console.log('');
  console.log('  PHASE 1: DISCOVERY');
  console.log('    1.0  Discover surface elements');
  console.log('    1.1  Deep discovery (hidden elements in dropdowns/modals)');
  console.log('');
  console.log('  PHASE 2: BEHAVIOR MAPPING');
  console.log('    2.0  Classify surface behaviors');
  console.log('    2.1  Deep behavior mapping (what each hidden element does)');
  console.log('');
  console.log('  PHASE 3: STATE EXTRACTION');
  console.log('    3.0  Extract state registry and action map');
  console.log('    3.1  Extract UI content (dropdowns, modals)');
  console.log('');
  console.log('  PHASE 4: CODE GENERATION');
  console.log('    4.0  Generate React components');
  console.log('    5.0  Wire triggers (requires app-jsx-path)');
  console.log('');
  process.exit(1);
}

const steps = [
  // Phase 1: Discovery
  { name: 'Step 1.0: Discover Surface Elements', script: 'step1-discover-elements.js', args: [url, outputDir] },
  { name: 'Step 2.0: Classify Surface Behaviors', script: 'step2-classify-behaviors.js', args: [outputDir] },
  { name: 'Step 1.1: Deep Discovery', script: 'step1.1-deep-discovery.js', args: [outputDir] },

  // Phase 2: Behavior Mapping
  { name: 'Step 2.1: Deep Behavior Mapping', script: 'step2.1-deep-behavior-mapping.js', args: [outputDir] },

  // Phase 3: State & Content Extraction
  { name: 'Step 3.0: State Extraction', script: 'step3.0-state-extraction.js', args: [outputDir] },
  { name: 'Step 3.1: Visual Feedback Map', script: 'step3.1-visual-feedback-map.js', args: [outputDir] },
  { name: 'Step 3.2: Extract UI Content', script: 'step3-extract-ui-content.js', args: [outputDir] },

  // Phase 4: Code Generation
  { name: 'Step 4.0: Generate Components', script: 'step4-generate-components.js', args: [outputDir] },

  // Phase 5: Behavior Capture & Wiring
  { name: 'Step 5.1: Behavior Capture', script: 'step5.1-behavior-capture.js', args: [outputDir] },
];

if (appJsxPath) {
  steps.push({ name: 'Step 5.0: Wire Triggers', script: 'step5-wire-triggers.js', args: [outputDir, appJsxPath] });
  steps.push({ name: 'Step 5.2: Wire Behaviors', script: 'step5.2-wire-behaviors.js', args: [outputDir, appJsxPath] });
}

async function runStep(step) {
  return new Promise((resolve, reject) => {
    console.log('\n' + '='.repeat(60));
    console.log(`Running: ${step.name}`);
    console.log('='.repeat(60) + '\n');

    const scriptPath = path.join(__dirname, step.script);
    const proc = spawn('node', [scriptPath, ...step.args], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${step.name} failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('BEHAVIORAL PIPELINE');
  console.log('='.repeat(60));
  console.log(`URL: ${url}`);
  console.log(`Output: ${outputDir}`);
  if (appJsxPath) {
    console.log(`App.jsx: ${appJsxPath}`);
  }
  console.log(`Steps to run: ${steps.length}`);

  const startTime = Date.now();

  for (const step of steps) {
    try {
      await runStep(step);
    } catch (err) {
      console.error(`\nPIPELINE FAILED: ${err.message}`);
      process.exit(1);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log('PIPELINE COMPLETE');
  console.log('='.repeat(60));
  console.log(`Time: ${elapsed}s`);
  console.log(`Output: ${outputDir}`);
}

main();
