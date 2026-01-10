#!/usr/bin/env node
/**
 * V7 Exhaustive Trigger
 * Automatically triggers all discovered features to capture lazy-loaded resources
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

export class V7Trigger {
  constructor(url, features, testFiles) {
    this.url = url;
    this.features = features;
    this.testFiles = testFiles;
    this.capturedResources = new Set();
    this.failedRequests = [];
    this.browser = null;
    this.page = null;
  }

  /**
   * Initialize browser and monitoring
   */
  async init() {
    console.log('\n=== INITIALIZING BROWSER ===\n');

    this.browser = await chromium.launch({ headless: false });
    this.page = await this.browser.newPage();

    // Monitor all network requests
    this.page.on('request', request => {
      this.capturedResources.add(request.url());
    });

    this.page.on('requestfailed', request => {
      this.failedRequests.push({
        url: request.url(),
        error: request.failure().errorText,
        timestamp: new Date().toISOString()
      });
      console.log(`  ⚠️  Failed: ${request.url()}`);
    });

    // Load the page
    console.log(`Loading ${this.url}...`);
    await this.page.goto(this.url, { waitUntil: 'networkidle' });
    console.log('Page loaded\n');
  }

  /**
   * Trigger all features exhaustively
   */
  async triggerAll() {
    console.log('=== TRIGGERING ALL FEATURES ===\n');

    const results = {
      fileFormats: await this.triggerFileFormats(),
      lazyLoads: await this.triggerLazyLoads(),
      workers: await this.triggerWorkers(),
      shortcuts: await this.triggerShortcuts(),
      uiElements: await this.triggerUIElements()
    };

    return results;
  }

  /**
   * Test all file formats
   */
  async triggerFileFormats() {
    console.log('Triggering file formats...');
    const results = [];

    for (const testFile of this.testFiles) {
      try {
        console.log(`  Testing ${testFile.format}...`);

        const beforeCount = this.capturedResources.size;

        // Create file handle for drag-drop simulation
        const fileBuffer = fs.readFileSync(testFile.path);

        await this.page.evaluate(async ({ filename, buffer, mimeType }) => {
          // Convert buffer to Blob
          const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
          const file = new File([blob], filename, { type: mimeType });

          // Create and dispatch drop event
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);

          const dropEvent = new DragEvent('drop', {
            dataTransfer: dataTransfer,
            bubbles: true,
            cancelable: true
          });

          document.body.dispatchEvent(dropEvent);
        }, {
          filename: testFile.filename,
          buffer: Array.from(fileBuffer),
          mimeType: testFile.mimeType
        });

        // Wait for any lazy loading
        await this.page.waitForTimeout(3000);

        const afterCount = this.capturedResources.size;
        const newResources = afterCount - beforeCount;

        results.push({
          format: testFile.format,
          triggered: true,
          newResources: newResources
        });

        console.log(`    ✅ ${testFile.format} → ${newResources} new resources`);

      } catch (err) {
        results.push({
          format: testFile.format,
          triggered: false,
          error: err.message
        });
        console.log(`    ⚠️  ${testFile.format} → Failed: ${err.message}`);
      }
    }

    console.log(`\nTested ${results.length} formats\n`);
    return results;
  }

  /**
   * Trigger lazy-loaded resources
   */
  async triggerLazyLoads() {
    console.log('Triggering lazy-loaded resources...');
    const results = [];

    for (const resource of this.features.lazyLoads) {
      try {
        // Check if resource is already loaded
        if (Array.from(this.capturedResources).some(url => url.includes(resource))) {
          console.log(`  ✅ ${resource} (already loaded)`);
          results.push({ resource, triggered: false, reason: 'already_loaded' });
          continue;
        }

        // Try to trigger dynamic import
        const triggered = await this.page.evaluate(async (res) => {
          try {
            // Attempt dynamic import
            if (res.endsWith('.js')) {
              await import(res);
              return true;
            }
            // Attempt fetch
            else if (res.endsWith('.wasm') || res.endsWith('.data')) {
              await fetch(res);
              return true;
            }
          } catch (err) {
            return false;
          }
        }, resource);

        results.push({ resource, triggered });
        console.log(`  ${triggered ? '✅' : '⚠️ '} ${resource}`);

      } catch (err) {
        results.push({ resource, triggered: false, error: err.message });
        console.log(`  ⚠️  ${resource} → ${err.message}`);
      }
    }

    console.log(`\nTriggered ${results.length} lazy-loaded resources\n`);
    return results;
  }

  /**
   * Trigger workers
   */
  async triggerWorkers() {
    console.log('Triggering Web Workers...');
    const results = [];

    for (const workerPath of this.features.workers) {
      try {
        const triggered = await this.page.evaluate((path) => {
          try {
            new Worker(path);
            return true;
          } catch (err) {
            return false;
          }
        }, workerPath);

        results.push({ worker: workerPath, triggered });
        console.log(`  ${triggered ? '✅' : '⚠️ '} ${workerPath}`);

      } catch (err) {
        results.push({ worker: workerPath, triggered: false, error: err.message });
      }
    }

    console.log(`\nTriggered ${results.length} workers\n`);
    return results;
  }

  /**
   * Trigger keyboard shortcuts
   */
  async triggerShortcuts() {
    console.log('Triggering keyboard shortcuts...');
    const results = [];

    for (const shortcut of this.features.shortcuts) {
      try {
        // Extract keyCode from "keyCode:67" format
        const keyCode = parseInt(shortcut.split(':')[1]);

        await this.page.keyboard.press(String.fromCharCode(keyCode));
        await this.page.waitForTimeout(200);

        results.push({ shortcut, triggered: true });
        console.log(`  ✅ ${shortcut}`);

      } catch (err) {
        results.push({ shortcut, triggered: false, error: err.message });
      }
    }

    console.log(`\nTriggered ${results.length} shortcuts\n`);
    return results;
  }

  /**
   * Trigger UI elements (menus, dialogs, etc.)
   */
  async triggerUIElements() {
    console.log('Triggering UI elements...');
    const results = {
      menus: 0,
      buttons: 0,
      dialogs: 0
    };

    try {
      // Get all clickable elements
      const clickables = await this.page.evaluate(() => {
        const elements = [];

        // Find all buttons
        document.querySelectorAll('button').forEach(btn => {
          if (btn.offsetParent !== null) { // visible
            elements.push({
              type: 'button',
              selector: btn.className || btn.id || 'button',
              text: btn.textContent.trim().substring(0, 30)
            });
          }
        });

        // Find menu items
        document.querySelectorAll('[role="menuitem"], .menu-item, .dropdown-item').forEach(item => {
          if (item.offsetParent !== null) {
            elements.push({
              type: 'menu',
              selector: item.className,
              text: item.textContent.trim().substring(0, 30)
            });
          }
        });

        return elements;
      });

      console.log(`  Found ${clickables.length} clickable elements`);

      // Click each element (with rate limiting)
      for (let i = 0; i < Math.min(clickables.length, 50); i++) {
        const el = clickables[i];
        try {
          if (el.type === 'button') {
            results.buttons++;
          } else if (el.type === 'menu') {
            results.menus++;
          }

          // Don't actually click to avoid disrupting the page
          // Just log what we found
          console.log(`  Found ${el.type}: ${el.text}`);

        } catch (err) {
          // Ignore click errors
        }
      }

    } catch (err) {
      console.log(`  ⚠️  Error exploring UI: ${err.message}`);
    }

    console.log(`\nFound ${results.buttons} buttons, ${results.menus} menu items\n`);
    return results;
  }

  /**
   * Generate trigger report
   */
  generateReport(results) {
    const report = {
      timestamp: new Date().toISOString(),
      url: this.url,
      summary: {
        totalResourcesCaptured: this.capturedResources.size,
        failedRequests: this.failedRequests.length,
        fileFormatsTested: results.fileFormats.length,
        lazyLoadsTriggered: results.lazyLoads.filter(r => r.triggered).length,
        workersTriggered: results.workers.filter(w => w.triggered).length,
        shortcutsTriggered: results.shortcuts.filter(s => s.triggered).length
      },
      results: results,
      capturedResources: Array.from(this.capturedResources).sort(),
      failedRequests: this.failedRequests
    };

    return report;
  }

  /**
   * Cleanup
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2] || 'http://localhost:3344/?test=1';
  const analysisPath = process.argv[3] || 'v7-analysis-report.json';
  const manifestPath = process.argv[4] || 'test-files/manifest.json';

  console.log('V7 Exhaustive Trigger');
  console.log('=====================\n');
  console.log('URL:', url);

  // Load analysis and test files
  const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  // Initialize trigger
  const trigger = new V7Trigger(url, analysis.features, manifest.files);
  await trigger.init();

  // Run exhaustive triggering
  const results = await trigger.triggerAll();

  // Generate report
  const report = trigger.generateReport(results);
  const reportPath = 'v7-trigger-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('=== SUMMARY ===');
  console.log(report.summary);
  console.log(`\nReport saved to: ${reportPath}`);
  console.log(`\nFailed requests: ${report.failedRequests.length}`);
  if (report.failedRequests.length > 0) {
    console.log('\nMissing resources:');
    report.failedRequests.forEach(req => {
      console.log(`  - ${req.url}`);
    });
  }

  await trigger.close();
}
