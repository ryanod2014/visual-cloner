#!/usr/bin/env node
/**
 * V7 Complete Extractor
 * Orchestrates all V7 modules for exhaustive, complete extraction
 *
 * Workflow:
 * 1. Analyze extracted code → Discover all features
 * 2. Generate test files → Create files for all formats
 * 3. Trigger all features → Capture lazy-loaded resources
 * 4. Map backend deps → Document what needs to be built
 * 5. Validate completeness → Compare online vs offline
 */

import { V7Analyzer } from './v7-analyzer.js';
import { V7TestGenerator } from './v7-test-generator.js';
import { V7Trigger } from './v7-trigger.js';
import { V7BackendMapper } from './v7-backend-mapper.js';
import { V7Validator } from './v7-validator.js';
import fs from 'fs';
import path from 'path';

export class V7Extractor {
  constructor(config) {
    this.config = {
      extractedDir: config.extractedDir,
      offlineUrl: config.offlineUrl || 'http://localhost:3344/?test=1',
      onlineUrl: config.onlineUrl,
      outputDir: config.outputDir || 'v7-reports',
      testFilesDir: config.testFilesDir || 'test-files'
    };

    this.results = {
      analysis: null,
      testFiles: null,
      trigger: null,
      backend: null,
      validation: null
    };

    // Create output directory
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  /**
   * Run complete V7 extraction workflow
   */
  async run() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║   V7 COMPLETE EXTRACTOR                ║');
    console.log('║   Exhaustive Feature Discovery         ║');
    console.log('╚════════════════════════════════════════╝\n');

    console.log('Configuration:');
    console.log(`  Extracted: ${this.config.extractedDir}`);
    console.log(`  Offline:   ${this.config.offlineUrl}`);
    console.log(`  Online:    ${this.config.onlineUrl}`);
    console.log(`  Output:    ${this.config.outputDir}\n`);

    try {
      // Phase 1: Analyze
      await this.phase1_Analyze();

      // Phase 2: Generate test files
      await this.phase2_GenerateTests();

      // Phase 3: Trigger features
      await this.phase3_TriggerFeatures();

      // Phase 4: Map backend
      await this.phase4_MapBackend();

      // Phase 5: Validate
      await this.phase5_Validate();

      // Generate final report
      const finalReport = this.generateFinalReport();
      this.saveFinalReport(finalReport);

      return finalReport;

    } catch (err) {
      console.error('\n❌ Error during extraction:', err.message);
      console.error(err.stack);
      throw err;
    }
  }

  /**
   * Phase 1: Analyze extracted code
   */
  async phase1_Analyze() {
    console.log('\n' + '═'.repeat(60));
    console.log('PHASE 1: FEATURE ANALYSIS');
    console.log('═'.repeat(60));

    const analyzer = new V7Analyzer(this.config.extractedDir);
    const features = analyzer.discover();
    const report = analyzer.generateReport(features);

    this.results.analysis = report;

    // Save analysis report
    const reportPath = path.join(this.config.outputDir, 'v7-analysis-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n✅ Analysis complete. Report saved to: ${reportPath}`);

    return report;
  }

  /**
   * Phase 2: Generate test files
   */
  async phase2_GenerateTests() {
    console.log('\n' + '═'.repeat(60));
    console.log('PHASE 2: TEST FILE GENERATION');
    console.log('═'.repeat(60));

    const formats = this.results.analysis.features.fileFormats;

    const generator = new V7TestGenerator(this.config.testFilesDir);
    const testFiles = await generator.generate(formats);
    const manifest = generator.generateManifest();

    this.results.testFiles = testFiles;

    console.log(`\n✅ Generated ${testFiles.length} test files`);

    return testFiles;
  }

  /**
   * Phase 3: Trigger all features
   */
  async phase3_TriggerFeatures() {
    console.log('\n' + '═'.repeat(60));
    console.log('PHASE 3: EXHAUSTIVE FEATURE TRIGGERING');
    console.log('═'.repeat(60));

    const trigger = new V7Trigger(
      this.config.offlineUrl,
      this.results.analysis.features,
      this.results.testFiles
    );

    await trigger.init();
    const triggerResults = await trigger.triggerAll();
    const report = trigger.generateReport(triggerResults);

    this.results.trigger = report;

    // Save trigger report
    const reportPath = path.join(this.config.outputDir, 'v7-trigger-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    await trigger.close();

    console.log(`\n✅ Triggering complete. Report saved to: ${reportPath}`);

    // Report missing resources
    if (report.failedRequests.length > 0) {
      console.log(`\n⚠️  Found ${report.failedRequests.length} missing resources:`);
      report.failedRequests.slice(0, 10).forEach(req => {
        console.log(`  - ${req.url}`);
      });

      if (report.failedRequests.length > 10) {
        console.log(`  ... and ${report.failedRequests.length - 10} more`);
      }
    }

    return report;
  }

  /**
   * Phase 4: Map backend dependencies
   */
  async phase4_MapBackend() {
    console.log('\n' + '═'.repeat(60));
    console.log('PHASE 4: BACKEND DEPENDENCY MAPPING');
    console.log('═'.repeat(60));

    const mapper = new V7BackendMapper(this.config.extractedDir);
    const dependencies = mapper.mapBackend();
    const documentation = mapper.generateDocumentation(dependencies);

    this.results.backend = documentation;

    // Save JSON report
    const jsonPath = path.join(this.config.outputDir, 'v7-backend-report.json');
    fs.writeFileSync(jsonPath, JSON.stringify(documentation, null, 2));

    // Save markdown guide
    const markdown = mapper.generateMarkdown(documentation);
    const mdPath = path.join(this.config.outputDir, 'BACKEND-BLUEPRINT.md');
    fs.writeFileSync(mdPath, markdown);

    console.log(`\n✅ Backend mapping complete`);
    console.log(`  JSON: ${jsonPath}`);
    console.log(`  Guide: ${mdPath}`);

    if (!documentation.summary.hasBackendDependencies) {
      console.log('\n  🎉 App is fully client-side! No backend work needed.');
    } else {
      console.log(`\n  ⚠️  Backend work required: ${documentation.engineerGuide.requiredWork.length} tasks`);
    }

    return documentation;
  }

  /**
   * Phase 5: Validate completeness
   */
  async phase5_Validate() {
    console.log('\n' + '═'.repeat(60));
    console.log('PHASE 5: COMPLETENESS VALIDATION');
    console.log('═'.repeat(60));

    const validator = new V7Validator(
      this.config.onlineUrl,
      this.config.offlineUrl,
      this.results.testFiles
    );

    const comparison = await validator.validate();
    const report = validator.generateReport(comparison);

    this.results.validation = report;

    // Save validation report
    const reportPath = path.join(this.config.outputDir, 'v7-validation-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`\n✅ Validation complete. Report saved to: ${reportPath}`);
    console.log(`\n  Verdict: ${report.verdict}`);
    console.log(`  Completeness Score: ${report.completenessScore}/100`);

    if (report.issues.length > 0) {
      console.log(`\n  ⚠️  Found ${report.issues.length} issues`);
    }

    return report;
  }

  /**
   * Generate final comprehensive report
   */
  generateFinalReport() {
    const report = {
      timestamp: new Date().toISOString(),
      config: this.config,
      executiveSummary: {
        extractionComplete: this.results.validation.verdict === 'COMPLETE',
        completenessScore: this.results.validation.completenessScore,
        featuresDiscovered: {
          fileFormats: this.results.analysis.features.fileFormats.length,
          lazyLoads: this.results.analysis.features.lazyLoads.length,
          apiEndpoints: this.results.analysis.features.apiEndpoints.length,
          workers: this.results.analysis.features.workers.length
        },
        testingResults: {
          formatsTested: this.results.trigger.summary.fileFormatsTested,
          resourcesCaptured: this.results.trigger.summary.totalResourcesCaptured,
          failedRequests: this.results.trigger.summary.failedRequests
        },
        backendDependencies: {
          hasBackend: this.results.backend.summary.hasBackendDependencies,
          apiEndpoints: this.results.backend.summary.totalAPIEndpoints,
          websockets: this.results.backend.summary.totalWebSockets,
          requiresAuth: this.results.backend.summary.requiresAuthentication
        },
        validationIssues: this.results.validation.issues.length
      },
      detailedResults: {
        analysis: this.results.analysis,
        trigger: this.results.trigger,
        backend: this.results.backend,
        validation: this.results.validation
      },
      nextSteps: this.generateNextSteps()
    };

    return report;
  }

  /**
   * Generate next steps based on results
   */
  generateNextSteps() {
    const steps = [];

    // Missing resources
    if (this.results.trigger.failedRequests.length > 0) {
      steps.push({
        priority: 1,
        action: 'Download missing resources',
        description: `${this.results.trigger.failedRequests.length} resources failed to load offline`,
        resources: this.results.trigger.failedRequests.map(r => r.url)
      });
    }

    // Backend work
    if (this.results.backend.summary.hasBackendDependencies) {
      steps.push({
        priority: 2,
        action: 'Implement backend services',
        description: 'App requires backend implementation',
        details: `${this.results.backend.summary.totalAPIEndpoints} endpoints, ${this.results.backend.summary.totalWebSockets} WebSockets`,
        reference: 'See BACKEND-BLUEPRINT.md for implementation guide'
      });
    }

    // Validation issues
    if (this.results.validation.issues.length > 0) {
      steps.push({
        priority: 3,
        action: 'Fix validation issues',
        description: `${this.results.validation.issues.length} issues found during validation`,
        issues: this.results.validation.issues.map(i => i.type)
      });
    }

    // All good!
    if (steps.length === 0) {
      steps.push({
        priority: 0,
        action: 'Deploy!',
        description: 'Extraction is 100% complete. App is ready for deployment.',
        celebration: '🎉'
      });
    }

    return steps;
  }

  /**
   * Save final report
   */
  saveFinalReport(report) {
    // Save JSON
    const jsonPath = path.join(this.config.outputDir, 'v7-final-report.json');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    // Generate and save markdown summary
    const markdown = this.generateMarkdownSummary(report);
    const mdPath = path.join(this.config.outputDir, 'V7-EXTRACTION-REPORT.md');
    fs.writeFileSync(mdPath, markdown);

    console.log('\n' + '═'.repeat(60));
    console.log('FINAL REPORT');
    console.log('═'.repeat(60));
    console.log(`\nJSON: ${jsonPath}`);
    console.log(`Summary: ${mdPath}\n`);

    this.printExecutiveSummary(report);
  }

  /**
   * Generate markdown summary
   */
  generateMarkdownSummary(report) {
    let md = '# V7 Extraction Report\n\n';
    md += `**Generated:** ${report.timestamp}\n\n`;

    md += '## Executive Summary\n\n';
    md += `- **Extraction Complete:** ${report.executiveSummary.extractionComplete ? '✅ YES' : '⚠️ NO'}\n`;
    md += `- **Completeness Score:** ${report.executiveSummary.completenessScore}/100\n\n`;

    md += '### Features Discovered\n\n';
    const fd = report.executiveSummary.featuresDiscovered;
    md += `- File Formats: ${fd.fileFormats}\n`;
    md += `- Lazy-Loaded Resources: ${fd.lazyLoads}\n`;
    md += `- API Endpoints: ${fd.apiEndpoints}\n`;
    md += `- Web Workers: ${fd.workers}\n\n`;

    md += '### Testing Results\n\n';
    const tr = report.executiveSummary.testingResults;
    md += `- Formats Tested: ${tr.formatsTested}\n`;
    md += `- Resources Captured: ${tr.resourcesCaptured}\n`;
    md += `- Failed Requests: ${tr.failedRequests}\n\n`;

    md += '### Backend Dependencies\n\n';
    const bd = report.executiveSummary.backendDependencies;
    md += `- Has Backend: ${bd.hasBackend ? '✅ YES' : '❌ NO'}\n`;
    if (bd.hasBackend) {
      md += `- API Endpoints: ${bd.apiEndpoints}\n`;
      md += `- WebSockets: ${bd.websockets}\n`;
      md += `- Requires Auth: ${bd.requiresAuth ? '✅ YES' : '❌ NO'}\n`;
    }
    md += '\n';

    md += '## Next Steps\n\n';
    report.nextSteps.forEach((step, i) => {
      md += `### ${i + 1}. ${step.action}\n\n`;
      md += `**Priority:** ${step.priority === 0 ? 'COMPLETE' : step.priority}\n\n`;
      md += `${step.description}\n\n`;
      if (step.reference) {
        md += `*${step.reference}*\n\n`;
      }
    });

    md += '## Detailed Reports\n\n';
    md += '- `v7-analysis-report.json` - Feature discovery results\n';
    md += '- `v7-trigger-report.json` - Exhaustive testing results\n';
    md += '- `v7-backend-report.json` - Backend dependency analysis\n';
    md += '- `BACKEND-BLUEPRINT.md` - Engineer implementation guide\n';
    md += '- `v7-validation-report.json` - Completeness validation\n';
    md += '- `v7-final-report.json` - Complete results (this report)\n\n';

    return md;
  }

  /**
   * Print executive summary to console
   */
  printExecutiveSummary(report) {
    const es = report.executiveSummary;

    console.log('EXTRACTION RESULTS');
    console.log('─'.repeat(60));
    console.log(`Complete:          ${es.extractionComplete ? '✅ YES' : '⚠️ NO'}`);
    console.log(`Completeness:      ${es.completenessScore}/100`);
    console.log();
    console.log('Features Discovered:');
    console.log(`  File formats:    ${es.featuresDiscovered.fileFormats}`);
    console.log(`  Lazy resources:  ${es.featuresDiscovered.lazyLoads}`);
    console.log(`  API endpoints:   ${es.featuresDiscovered.apiEndpoints}`);
    console.log(`  Workers:         ${es.featuresDiscovered.workers}`);
    console.log();
    console.log('Testing:');
    console.log(`  Formats tested:  ${es.testingResults.formatsTested}`);
    console.log(`  Resources:       ${es.testingResults.resourcesCaptured}`);
    console.log(`  Failed requests: ${es.testingResults.failedRequests}`);
    console.log();
    console.log('Backend:');
    console.log(`  Has backend:     ${es.backendDependencies.hasBackend ? '✅ YES' : '❌ NO'}`);
    if (es.backendDependencies.hasBackend) {
      console.log(`  API endpoints:   ${es.backendDependencies.apiEndpoints}`);
      console.log(`  WebSockets:      ${es.backendDependencies.websockets}`);
    }
    console.log();
    console.log('Next Steps:');
    report.nextSteps.forEach((step, i) => {
      console.log(`  ${i + 1}. ${step.action}`);
      console.log(`     ${step.description}`);
    });
    console.log();

    if (es.extractionComplete && !es.backendDependencies.hasBackend) {
      console.log('🎉 EXTRACTION COMPLETE! App is ready for deployment.\n');
    } else {
      console.log('⚠️  Additional work required. See next steps above.\n');
    }
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const extractedDir = process.argv[2] || 'output/photopea.com-complete-1767957633072';
  const onlineUrl = process.argv[3] || 'https://www.photopea.com';
  const offlineUrl = process.argv[4] || 'http://localhost:3344/?test=1';

  const extractor = new V7Extractor({
    extractedDir: extractedDir,
    onlineUrl: onlineUrl,
    offlineUrl: offlineUrl
  });

  try {
    await extractor.run();
  } catch (err) {
    console.error('Extraction failed:', err.message);
    process.exit(1);
  }
}
