#!/usr/bin/env node
/**
 * V7 Feature Analyzer
 * Discovers all features by analyzing extracted code
 */

import fs from 'fs';
import path from 'path';

export class V7Analyzer {
  constructor(extractedDir) {
    this.extractedDir = extractedDir;
    this.code = null;
  }

  /**
   * Load all extracted JavaScript for analysis
   */
  loadCode() {
    const jsFiles = this.findJSFiles(this.extractedDir);
    this.code = jsFiles.map(file => {
      return {
        path: file,
        content: fs.readFileSync(file, 'utf-8')
      };
    }).reduce((acc, file) => acc + '\n' + file.content, '');

    console.log(`Loaded ${jsFiles.length} JavaScript files for analysis`);
    return this.code;
  }

  /**
   * Discover all features from code
   */
  discover() {
    if (!this.code) this.loadCode();

    console.log('\n=== DISCOVERING FEATURES ===\n');

    return {
      fileFormats: this.discoverFileFormats(),
      lazyLoads: this.discoverLazyLoads(),
      apiEndpoints: this.discoverAPIEndpoints(),
      workers: this.discoverWorkers(),
      iframes: this.discoverIframes(),
      shortcuts: this.discoverShortcuts(),
      eventHandlers: this.discoverEventHandlers()
    };
  }

  /**
   * Discover supported file formats
   */
  discoverFileFormats() {
    console.log('Discovering file formats...');
    const formats = new Set();

    // Pattern 1: Format assignment (format="heic")
    const formatAssignments = this.code.matchAll(/\$\s*=\s*['"](\w+)['"]/g);
    for (const match of formatAssignments) {
      const format = match[1];
      if (this.isImageFormat(format)) {
        formats.add(format.toLowerCase());
      }
    }

    // Pattern 2: File extension checks (.heic, .jxl, etc.)
    const extensions = this.code.matchAll(/\.(jpg|jpeg|png|gif|bmp|webp|heic|heif|jxl|avif|psd|psb|xcf|sketch|tiff?|tif|raw|cr2|nef|arw|dng|raf|orf|rw2|svg|pdf|ai|eps)\b/gi);
    for (const match of extensions) {
      formats.add(match[1].toLowerCase());
    }

    // Pattern 3: MIME type checks
    const mimeTypes = this.code.matchAll(/['"]image\/(jpeg|png|gif|webp|heic|heif|avif|jxl|tiff|svg\+xml)['"]/gi);
    for (const match of mimeTypes) {
      formats.add(match[1].toLowerCase());
    }

    // Pattern 4: Decoder mappings (HEIC:decoder, JXL:decoder)
    const decoders = this.code.matchAll(/(\w+):\s*\w+\.\w+/g);
    for (const match of decoders) {
      const format = match[1];
      if (this.isImageFormat(format)) {
        formats.add(format.toLowerCase());
      }
    }

    const formatList = Array.from(formats).sort();
    console.log(`  Found ${formatList.length} formats:`, formatList.slice(0, 10).join(', '), '...');

    return formatList;
  }

  /**
   * Discover lazy-loaded resources
   */
  discoverLazyLoads() {
    console.log('Discovering lazy-loaded resources...');
    const resources = new Set();

    // Pattern 1: Dynamic imports
    const dynamicImports = this.code.matchAll(/import\s*\(['"]([^'"]+)['"]\)/g);
    for (const match of dynamicImports) {
      resources.add(match[1]);
    }

    // Pattern 2: Script element creation
    const scriptLoads = this.code.matchAll(/createElement\s*\(\s*['"]script['"]\s*\)[\s\S]{0,300}\.src\s*=\s*['"]([^'"]+)['"]/g);
    for (const match of scriptLoads) {
      resources.add(match[1]);
    }

    // Pattern 3: Iframe loading
    const iframeLoads = this.code.matchAll(/createElement\s*\(\s*['"]iframe['"]\s*\)[\s\S]{0,300}\.src\s*=\s*['"]([^'"]+)['"]/g);
    for (const match of iframeLoads) {
      resources.add(match[1]);
    }

    // Pattern 4: setAttribute('src', ...)
    const srcSets = this.code.matchAll(/setAttribute\s*\(\s*['"]src['"]\s*,\s*['"]([^'"]+)['"]\)/g);
    for (const match of srcSets) {
      if (match[1].includes('.js') || match[1].includes('.html') || match[1].includes('.wasm')) {
        resources.add(match[1]);
      }
    }

    // Pattern 5: fetch() calls
    const fetches = this.code.matchAll(/fetch\s*\(\s*['"]([^'"]+)['"]/g);
    for (const match of fetches) {
      if (!match[1].startsWith('http')) {
        resources.add(match[1]);
      }
    }

    const resourceList = Array.from(resources).sort();
    console.log(`  Found ${resourceList.length} lazy-loaded resources:`, resourceList.slice(0, 5).join(', '), '...');

    return resourceList;
  }

  /**
   * Discover API endpoints
   */
  discoverAPIEndpoints() {
    console.log('Discovering API endpoints...');
    const endpoints = new Set();

    // Pattern: fetch/XMLHttpRequest to endpoints
    const fetches = this.code.matchAll(/(?:fetch|XMLHttpRequest)\s*\(['"](\/api\/[^'"]+)['"]/g);
    for (const match of fetches) {
      endpoints.add(match[1]);
    }

    console.log(`  Found ${endpoints.size} API endpoints`);
    return Array.from(endpoints);
  }

  /**
   * Discover Web Workers
   */
  discoverWorkers() {
    console.log('Discovering Web Workers...');
    const workers = new Set();

    const workerPattern = this.code.matchAll(/new\s+Worker\s*\(\s*['"]([^'"]+)['"]/g);
    for (const match of workerPattern) {
      workers.add(match[1]);
    }

    console.log(`  Found ${workers.size} workers`);
    return Array.from(workers);
  }

  /**
   * Discover iframe sources
   */
  discoverIframes() {
    console.log('Discovering iframes...');
    const iframes = new Set();

    const iframePattern = this.code.matchAll(/(?:iframe|\.src)\s*=\s*['"]([^'"]+\.html)['"]/g);
    for (const match of iframePattern) {
      iframes.add(match[1]);
    }

    console.log(`  Found ${iframes.size} iframe sources`);
    return Array.from(iframes);
  }

  /**
   * Discover keyboard shortcuts
   */
  discoverShortcuts() {
    console.log('Discovering keyboard shortcuts...');
    const shortcuts = new Set();

    // Pattern: keyCode checks, key combinations
    const keyCodes = this.code.matchAll(/keyCode\s*===?\s*(\d+)/g);
    for (const match of keyCodes) {
      shortcuts.add(`keyCode:${match[1]}`);
    }

    console.log(`  Found ${shortcuts.size} keyboard shortcuts`);
    return Array.from(shortcuts);
  }

  /**
   * Discover event handlers
   */
  discoverEventHandlers() {
    console.log('Discovering event handlers...');
    const events = new Set();

    const eventPattern = this.code.matchAll(/addEventListener\s*\(\s*['"](\w+)['"]/g);
    for (const match of eventPattern) {
      events.add(match[1]);
    }

    console.log(`  Found ${events.size} event types`);
    return Array.from(events);
  }

  /**
   * Helper: Check if string looks like image format
   */
  isImageFormat(str) {
    const imageFormats = [
      'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg',
      'heic', 'heif', 'avif', 'jxl',
      'psd', 'psb', 'xcf', 'sketch',
      'tiff', 'tif', 'raw', 'cr2', 'nef', 'arw', 'dng',
      'pdf', 'ai', 'eps'
    ];

    return imageFormats.includes(str.toLowerCase());
  }

  /**
   * Helper: Find all JS files recursively
   */
  findJSFiles(dir, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        this.findJSFiles(fullPath, files);
      } else if (entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Generate report
   */
  generateReport(features) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        fileFormats: features.fileFormats.length,
        lazyLoads: features.lazyLoads.length,
        apiEndpoints: features.apiEndpoints.length,
        workers: features.workers.length,
        iframes: features.iframes.length,
        shortcuts: features.shortcuts.length,
        events: features.eventHandlers.length
      },
      features: features
    };

    return report;
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const extractedDir = process.argv[2] || 'output/photopea.com-complete-1767957633072';

  console.log('V7 Feature Analyzer');
  console.log('===================\n');
  console.log('Analyzing:', extractedDir);

  const analyzer = new V7Analyzer(extractedDir);
  const features = analyzer.discover();
  const report = analyzer.generateReport(features);

  // Save report
  const reportPath = 'v7-analysis-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n=== SUMMARY ===');
  console.log(report.summary);
  console.log(`\nReport saved to: ${reportPath}`);
}
