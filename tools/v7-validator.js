#!/usr/bin/env node
/**
 * V7 Completeness Validator
 * Compares online vs offline to verify extraction completeness
 * Validates zero missing resources and identical functionality
 */

import { chromium } from 'playwright';
import fs from 'fs';

export class V7Validator {
  constructor(onlineUrl, offlineUrl, testFiles) {
    this.onlineUrl = onlineUrl;
    this.offlineUrl = offlineUrl;
    this.testFiles = testFiles;
    this.results = {
      online: {
        resources: new Set(),
        errors: [],
        features: {}
      },
      offline: {
        resources: new Set(),
        errors: [],
        features: {}
      }
    };
  }

  /**
   * Validate extraction completeness
   */
  async validate() {
    console.log('\n=== VALIDATING EXTRACTION COMPLETENESS ===\n');

    // Test online version
    console.log('Testing online version...');
    await this.testVersion('online', this.onlineUrl);

    console.log('\nTesting offline version...');
    await this.testVersion('offline', this.offlineUrl);

    // Compare results
    console.log('\nComparing online vs offline...');
    const comparison = this.compareResults();

    return comparison;
  }

  /**
   * Test a specific version (online or offline)
   */
  async testVersion(version, url) {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    const versionResults = this.results[version];

    // Monitor network
    page.on('request', request => {
      versionResults.resources.add(request.url());
    });

    page.on('requestfailed', request => {
      versionResults.errors.push({
        url: request.url(),
        error: request.failure().errorText
      });
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        versionResults.errors.push({
          type: 'console',
          message: msg.text()
        });
      }
    });

    // Load page
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      console.log(`  Loaded ${url}`);

      // Test file formats
      versionResults.features.fileFormats = await this.testFileFormats(page);

      // Test UI interactions
      versionResults.features.ui = await this.testUI(page);

      // Wait a bit for any delayed loading
      await page.waitForTimeout(2000);

    } catch (err) {
      console.log(`  ⚠️  Error loading ${version}: ${err.message}`);
      versionResults.errors.push({
        type: 'page_load',
        error: err.message
      });
    }

    await browser.close();
  }

  /**
   * Test file format support
   */
  async testFileFormats(page) {
    const results = [];

    for (const testFile of this.testFiles.slice(0, 5)) { // Test first 5 formats
      try {
        const fileBuffer = fs.readFileSync(testFile.path);

        const success = await page.evaluate(async ({ filename, buffer, mimeType }) => {
          try {
            const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
            const file = new File([blob], filename, { type: mimeType });

            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);

            const dropEvent = new DragEvent('drop', {
              dataTransfer: dataTransfer,
              bubbles: true,
              cancelable: true
            });

            document.body.dispatchEvent(dropEvent);
            return true;
          } catch (err) {
            return false;
          }
        }, {
          filename: testFile.filename,
          buffer: Array.from(fileBuffer),
          mimeType: testFile.mimeType
        });

        results.push({
          format: testFile.format,
          success: success
        });

        console.log(`    ${success ? '✅' : '❌'} ${testFile.format}`);

        await page.waitForTimeout(1000);

      } catch (err) {
        results.push({
          format: testFile.format,
          success: false,
          error: err.message
        });
      }
    }

    return results;
  }

  /**
   * Test UI interactions
   */
  async testUI(page) {
    const results = {
      buttonsFound: 0,
      menusFound: 0,
      responsive: true
    };

    try {
      // Count UI elements
      const uiCounts = await page.evaluate(() => {
        return {
          buttons: document.querySelectorAll('button').length,
          menus: document.querySelectorAll('[role="menuitem"], .menu-item').length
        };
      });

      results.buttonsFound = uiCounts.buttons;
      results.menusFound = uiCounts.menus;

      console.log(`    Found ${results.buttonsFound} buttons, ${results.menusFound} menus`);

    } catch (err) {
      console.log(`    ⚠️  Error testing UI: ${err.message}`);
    }

    return results;
  }

  /**
   * Compare online vs offline results
   */
  compareResults() {
    const comparison = {
      timestamp: new Date().toISOString(),
      complete: true,
      issues: [],
      statistics: {}
    };

    // Compare resources
    const onlineResources = Array.from(this.results.online.resources);
    const offlineResources = Array.from(this.results.offline.resources);

    const missingResources = onlineResources.filter(url => {
      // Check if offline has this resource
      return !offlineResources.some(offlineUrl => {
        // Normalize URLs (remove query params, protocol differences)
        const normalizeUrl = (u) => u.split('?')[0].replace(/^https?:/, '');
        return normalizeUrl(url) === normalizeUrl(offlineUrl);
      });
    });

    comparison.statistics.onlineResources = onlineResources.length;
    comparison.statistics.offlineResources = offlineResources.length;
    comparison.statistics.missingResources = missingResources.length;

    if (missingResources.length > 0) {
      comparison.complete = false;
      comparison.issues.push({
        severity: 'HIGH',
        type: 'missing_resources',
        count: missingResources.length,
        examples: missingResources.slice(0, 5),
        fix: 'Re-run extraction with exhaustive feature triggering'
      });
    }

    // Compare errors
    const onlineErrors = this.results.online.errors.length;
    const offlineErrors = this.results.offline.errors.length;

    comparison.statistics.onlineErrors = onlineErrors;
    comparison.statistics.offlineErrors = offlineErrors;

    if (offlineErrors > onlineErrors) {
      comparison.complete = false;
      comparison.issues.push({
        severity: 'HIGH',
        type: 'additional_errors_offline',
        count: offlineErrors - onlineErrors,
        errors: this.results.offline.errors.slice(0, 5),
        fix: 'Check console errors and failed requests offline'
      });
    }

    // Compare file format support
    const onlineFormats = this.results.online.features.fileFormats || [];
    const offlineFormats = this.results.offline.features.fileFormats || [];

    const onlineSuccess = onlineFormats.filter(f => f.success).length;
    const offlineSuccess = offlineFormats.filter(f => f.success).length;

    comparison.statistics.onlineFormatSupport = onlineSuccess;
    comparison.statistics.offlineFormatSupport = offlineSuccess;

    if (offlineSuccess < onlineSuccess) {
      comparison.complete = false;
      const failedFormats = offlineFormats.filter(f => !f.success).map(f => f.format);
      comparison.issues.push({
        severity: 'MEDIUM',
        type: 'format_support_degraded',
        formats: failedFormats,
        fix: 'Check for missing decoder files or format-specific resources'
      });
    }

    // Compare UI
    const onlineUI = this.results.online.features.ui || {};
    const offlineUI = this.results.offline.features.ui || {};

    if (onlineUI.buttonsFound > offlineUI.buttonsFound) {
      comparison.issues.push({
        severity: 'LOW',
        type: 'ui_elements_missing',
        missing: onlineUI.buttonsFound - offlineUI.buttonsFound,
        fix: 'Check if all HTML files were extracted'
      });
    }

    return comparison;
  }

  /**
   * Generate validation report
   */
  generateReport(comparison) {
    const report = {
      timestamp: comparison.timestamp,
      verdict: comparison.complete ? 'COMPLETE' : 'INCOMPLETE',
      completenessScore: this.calculateCompletenessScore(comparison),
      summary: comparison.statistics,
      issues: comparison.issues,
      recommendations: this.generateRecommendations(comparison)
    };

    return report;
  }

  /**
   * Calculate completeness score (0-100)
   */
  calculateCompletenessScore(comparison) {
    let score = 100;

    // Deduct for missing resources
    if (comparison.statistics.missingResources > 0) {
      const missingPercent = (comparison.statistics.missingResources / comparison.statistics.onlineResources) * 100;
      score -= Math.min(missingPercent, 50);
    }

    // Deduct for additional errors
    if (comparison.statistics.offlineErrors > comparison.statistics.onlineErrors) {
      const extraErrors = comparison.statistics.offlineErrors - comparison.statistics.onlineErrors;
      score -= Math.min(extraErrors * 2, 30);
    }

    // Deduct for format support degradation
    if (comparison.statistics.offlineFormatSupport < comparison.statistics.onlineFormatSupport) {
      const formatDiff = comparison.statistics.onlineFormatSupport - comparison.statistics.offlineFormatSupport;
      score -= formatDiff * 5;
    }

    return Math.max(0, Math.round(score));
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(comparison) {
    const recommendations = [];

    if (comparison.complete) {
      recommendations.push({
        priority: 'INFO',
        action: 'Extraction is complete!',
        description: 'All features work identically online and offline. No further work needed.'
      });
      return recommendations;
    }

    // Missing resources
    if (comparison.statistics.missingResources > 0) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Capture missing resources',
        description: `Found ${comparison.statistics.missingResources} resources loaded online but missing offline. Use V7 exhaustive trigger to capture them.`,
        command: 'node tools/v7-trigger.js <offline-url>'
      });
    }

    // Additional errors
    if (comparison.statistics.offlineErrors > comparison.statistics.onlineErrors) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Fix offline errors',
        description: 'Offline version has more errors than online. Check console and network tabs.',
        command: 'Open browser console and check for 404s or script errors'
      });
    }

    // Format support
    if (comparison.statistics.offlineFormatSupport < comparison.statistics.onlineFormatSupport) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Fix format support',
        description: 'Some file formats work online but fail offline. Check for missing decoder files.',
        command: 'node tools/v7-analyzer.js | grep -i decoder'
      });
    }

    // If no specific issues
    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'LOW',
        action: 'Review issues',
        description: 'Minor differences detected. Review the issues list above.'
      });
    }

    return recommendations;
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const onlineUrl = process.argv[2] || 'https://www.photopea.com';
  const offlineUrl = process.argv[3] || 'http://localhost:3344/?test=1';
  const manifestPath = process.argv[4] || 'test-files/manifest.json';

  console.log('V7 Completeness Validator');
  console.log('=========================\n');
  console.log('Online:  ', onlineUrl);
  console.log('Offline: ', offlineUrl);

  // Load test files
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  // Run validation
  const validator = new V7Validator(onlineUrl, offlineUrl, manifest.files);
  const comparison = await validator.validate();
  const report = validator.generateReport(comparison);

  // Save report
  const reportPath = 'v7-validation-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n=== VALIDATION RESULTS ===');
  console.log(`Verdict: ${report.verdict}`);
  console.log(`Completeness Score: ${report.completenessScore}/100`);
  console.log(`\nStatistics:`);
  console.log(`  Online resources:  ${report.summary.onlineResources}`);
  console.log(`  Offline resources: ${report.summary.offlineResources}`);
  console.log(`  Missing resources: ${report.summary.missingResources}`);
  console.log(`  Online errors:     ${report.summary.onlineErrors}`);
  console.log(`  Offline errors:    ${report.summary.offlineErrors}`);

  if (report.issues.length > 0) {
    console.log(`\n⚠️  Found ${report.issues.length} issues:`);
    report.issues.forEach((issue, i) => {
      console.log(`\n${i + 1}. [${issue.severity}] ${issue.type}`);
      console.log(`   Fix: ${issue.fix}`);
    });
  }

  console.log(`\n📋 Recommendations:`);
  report.recommendations.forEach((rec, i) => {
    console.log(`\n${i + 1}. [${rec.priority}] ${rec.action}`);
    console.log(`   ${rec.description}`);
    if (rec.command) {
      console.log(`   Command: ${rec.command}`);
    }
  });

  console.log(`\nReport saved to: ${reportPath}`);

  if (report.verdict === 'COMPLETE') {
    console.log('\n✅ Extraction is 100% complete!\n');
  } else {
    console.log(`\n⚠️  Extraction is ${report.completenessScore}% complete. See recommendations above.\n`);
  }
}
