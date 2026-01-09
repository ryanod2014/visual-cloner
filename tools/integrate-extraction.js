#!/usr/bin/env node
/**
 * V6 Extraction Integration Tool
 *
 * Integrates V5.1 extraction data with visual clone output to produce
 * a complete reconstruction with all captured behaviors.
 *
 * Usage:
 *   node tools/integrate-extraction.js \
 *     --html output/site-123/assembled.html \
 *     --extraction output/site-123/extraction-results.json \
 *     --output output/site-123/integrated/
 *
 * Or with positional args:
 *   node tools/integrate-extraction.js <html-file> <extraction-file> [output-dir]
 */

import fs from 'fs/promises';
import path from 'path';
import { runIntegration, getCombinedStats } from './pipeline/integrators/index.js';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    html: null,
    extraction: null,
    output: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--html' || args[i] === '-h') {
      options.html = args[++i];
    } else if (args[i] === '--extraction' || args[i] === '-e') {
      options.extraction = args[++i];
    } else if (args[i] === '--output' || args[i] === '-o') {
      options.output = args[++i];
    } else if (!options.html) {
      options.html = args[i];
    } else if (!options.extraction) {
      options.extraction = args[i];
    } else if (!options.output) {
      options.output = args[i];
    }
  }

  return options;
}

function printUsage() {
  console.log(`
V6 Extraction Integration Tool

Usage:
  node tools/integrate-extraction.js --html <html-file> --extraction <json-file> [--output <dir>]

Arguments:
  --html, -h        Path to assembled.html (from /clone)
  --extraction, -e  Path to extraction-results.json (from V5.1 extraction)
  --output, -o      Output directory (default: same as html file + /integrated/)

Examples:
  node tools/integrate-extraction.js \\
    --html output/excalidraw.com/assembled.html \\
    --extraction output/v5-extraction-test/extraction-results.json \\
    --output output/excalidraw.com/integrated/

  # With positional args
  node tools/integrate-extraction.js assembled.html extraction-results.json ./integrated/

Output Files:
  integrated.html   - Complete HTML with all behaviors wired
  integrated.css    - Combined extracted CSS (variables, animations, breakpoints)
  integrated.js     - Combined event wiring code
  mock-server.js    - Express server for API mocking
  service-worker.js - Service worker for offline caching
  stats.json        - Integration statistics
`);
}

async function main() {
  const options = parseArgs();

  // Validate inputs
  if (!options.html || !options.extraction) {
    printUsage();
    process.exit(1);
  }

  // Set default output dir
  if (!options.output) {
    options.output = path.join(path.dirname(options.html), 'integrated');
  }

  console.log('='.repeat(60));
  console.log('V6 EXTRACTION INTEGRATION');
  console.log('='.repeat(60));
  console.log(`HTML Input:    ${options.html}`);
  console.log(`Extraction:    ${options.extraction}`);
  console.log(`Output Dir:    ${options.output}`);
  console.log('');

  try {
    // Read input files
    console.log('[Loading] Reading input files...');

    let htmlContent;
    try {
      htmlContent = await fs.readFile(options.html, 'utf-8');
      console.log(`  ✓ HTML: ${htmlContent.length.toLocaleString()} bytes`);
    } catch (err) {
      // If HTML doesn't exist, create a basic template
      console.log(`  ⚠ HTML file not found, creating basic template`);
      htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>V6 Integrated Clone</title>
</head>
<body>
  <div id="app">
    <!-- Visual clone content would go here -->
    <p>No visual clone provided. Integration contains extracted behaviors only.</p>
  </div>
</body>
</html>`;
    }

    const extractionContent = await fs.readFile(options.extraction, 'utf-8');
    const extractionData = JSON.parse(extractionContent);
    console.log(`  ✓ Extraction: ${extractionContent.length.toLocaleString()} bytes`);

    // Show extraction stats before integration
    console.log('\n[Stats] Extraction data summary:');
    const stats = getCombinedStats(extractionData);
    console.log(`  CSS Variables: ${stats.css.variables.root + stats.css.variables.scoped}`);
    console.log(`  Event Listeners: ${stats.events.eventListeners}`);
    console.log(`  Breakpoints: ${stats.responsive.breakpointsDetected}`);
    console.log(`  SVG Elements: ${stats.svg.svgElements}`);
    console.log(`  Canvas Operations: ${stats.canvas.canvas2d.operations}`);
    console.log(`  API Requests: ${stats.api.fetchRequests + stats.api.xhrRequests}`);

    // Run integration
    console.log('');
    const result = await runIntegration({
      htmlContent,
      extractionData,
    });

    // Create output directory
    await fs.mkdir(options.output, { recursive: true });

    // Write output files
    console.log('\n[Saving] Writing output files...');

    await fs.writeFile(
      path.join(options.output, 'integrated.html'),
      result.html
    );
    console.log(`  ✓ integrated.html (${result.html.length.toLocaleString()} bytes)`);

    if (result.css) {
      await fs.writeFile(
        path.join(options.output, 'integrated.css'),
        result.css
      );
      console.log(`  ✓ integrated.css (${result.css.length.toLocaleString()} bytes)`);
    }

    if (result.js) {
      await fs.writeFile(
        path.join(options.output, 'integrated.js'),
        result.js
      );
      console.log(`  ✓ integrated.js (${result.js.length.toLocaleString()} bytes)`);
    }

    if (result.mockServer) {
      await fs.writeFile(
        path.join(options.output, 'mock-server.js'),
        result.mockServer
      );
      console.log(`  ✓ mock-server.js (${result.mockServer.length.toLocaleString()} bytes)`);
    }

    if (result.serviceWorker) {
      await fs.writeFile(
        path.join(options.output, 'service-worker.js'),
        result.serviceWorker
      );
      console.log(`  ✓ service-worker.js (${result.serviceWorker.length.toLocaleString()} bytes)`);
    }

    // Save stats
    await fs.writeFile(
      path.join(options.output, 'stats.json'),
      JSON.stringify(result.stats, null, 2)
    );
    console.log('  ✓ stats.json');

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('INTEGRATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nOutput: ${options.output}`);
    console.log('\nTo view the integrated clone:');
    console.log(`  open ${path.join(options.output, 'integrated.html')}`);

    if (result.mockServer) {
      console.log('\nTo run the mock API server:');
      console.log(`  cd ${options.output} && npm init -y && npm i express cors ws`);
      console.log(`  node mock-server.js`);
    }

  } catch (err) {
    console.error('\n[ERROR]', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
