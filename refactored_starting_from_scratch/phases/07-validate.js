/**
 * Phase 07: Validate
 * Completeness check phase
 *
 * Validates the extraction by:
 * - Starting a local server
 * - Loading the extracted version in browser
 * - Comparing console errors
 * - Checking for missing resources
 * - Generating DEBUG.md if issues found
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { Phase } from '../core/pipeline.js';

export class ValidatePhase extends Phase {
  constructor(config = {}) {
    super('validate', 'Validate extraction completeness');
    this.config = config;
    this.serverProcess = null;
  }

  async execute(context) {
    const { outputDir, page, browser, url } = context;

    if (this.config.dryRun) {
      this.logger.info('Would start local server on extracted output');
      this.logger.info('Would load extracted version in browser');
      this.logger.info('Would compare console errors with original');
      this.logger.info('Would check for missing resources (404s)');
      this.logger.info('Would generate DEBUG.md if issues found');

      return {
        valid: true,
        errors: [],
        warnings: [],
        missingResources: [],
        debugReportPath: null,
        dryRun: true,
      };
    }

    // Skip validation if explicitly disabled
    if (this.config.skipValidation) {
      this.logger.info('Validation skipped (--skip-validation flag)');
      return {
        valid: true,
        skipped: true,
        errors: [],
        warnings: [],
        missingResources: [],
      };
    }

    const port = this.config.port || 3333;
    const serverUrl = `http://localhost:${port}`;

    this.logger.info('Starting validation...');
    this.trackAction('Starting validation');

    // Start local server
    let serverStarted = false;
    try {
      serverStarted = await this.startServer(outputDir, port);
    } catch (error) {
      this.logger.warn(`Failed to start server: ${error.message}`);
      this.trackWarning();
    }

    if (!serverStarted) {
      this.logger.warn('Server failed to start, skipping validation');
      return {
        valid: false,
        errors: ['Server failed to start'],
        warnings: [],
        missingResources: [],
        debugReportPath: null,
      };
    }

    this.trackAction('Local server started');

    // Collect errors and warnings
    const errors = [];
    const warnings = [];
    const missingResources = [];
    const consoleMessages = [];

    // Create a new page for validation to avoid interfering with extraction
    let validationPage;
    try {
      const browserContext = context.browserContext;
      validationPage = await browserContext.newPage();

      // Collect console messages
      validationPage.on('console', (msg) => {
        const text = msg.text();
        const type = msg.type();

        consoleMessages.push({ type, text });

        if (type === 'error') {
          // Filter out known harmless errors
          if (!this.isHarmlessError(text)) {
            errors.push(text);
          }
        } else if (type === 'warning') {
          warnings.push(text);
        }
      });

      // Collect failed requests (404s)
      validationPage.on('requestfailed', (request) => {
        const failure = request.failure();
        const reqUrl = request.url();

        if (reqUrl.startsWith(serverUrl)) {
          missingResources.push({
            url: reqUrl,
            error: failure?.errorText || 'Failed',
          });
        }
      });

      // Track response status codes
      validationPage.on('response', (response) => {
        const status = response.status();
        const resUrl = response.url();

        if (status === 404 && resUrl.startsWith(serverUrl)) {
          missingResources.push({
            url: resUrl,
            error: '404 Not Found',
          });
        }
      });

      // Navigate to extracted site
      this.logger.info(`Loading extracted site at ${serverUrl}...`);
      try {
        await validationPage.goto(serverUrl, {
          waitUntil: 'networkidle',
          timeout: 30000,
        });
        this.trackAction('Loaded extracted site');
      } catch (error) {
        if (error.message.includes('timeout')) {
          this.logger.warn('Page load timeout (may be expected for complex apps)');
          this.trackWarning();
        } else {
          throw error;
        }
      }

      // Wait for app to initialize
      this.logger.info('Waiting for app initialization...');
      await validationPage.waitForTimeout(5000);

      // Check server status
      const statusResponse = await fetch(`${serverUrl}/__status__`);
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        this.logger.info(`Server status: ${status.hits} hits, ${status.misses} misses`);

        if (status.misses > 0) {
          warnings.push(`${status.misses} resources were proxied from original server`);
        }
      }

      this.trackProcessed();

    } catch (error) {
      this.logger.error(`Validation failed: ${error.message}`);
      errors.push(`Validation error: ${error.message}`);
      this.trackError();
    } finally {
      // Close validation page
      if (validationPage) {
        await validationPage.close().catch(() => {});
      }

      // Stop server
      await this.stopServer();
    }

    // Determine if validation passed
    const criticalErrors = errors.filter(e => !this.isNonCritical(e));
    const valid = criticalErrors.length === 0 && missingResources.length < 5;

    // Generate debug report if issues found
    let debugReportPath = null;
    if (!valid || errors.length > 0 || missingResources.length > 0) {
      debugReportPath = await this.generateDebugReport(outputDir, {
        url,
        errors,
        warnings,
        missingResources,
        consoleMessages,
        valid,
      });
      this.trackCreated();
    }

    // Log summary
    this.logger.info(`\n--- Validation Complete ---`);
    this.logger.info(`  Valid:            ${valid ? 'YES' : 'NO'}`);
    this.logger.info(`  Errors:           ${errors.length}`);
    this.logger.info(`  Warnings:         ${warnings.length}`);
    this.logger.info(`  Missing resources: ${missingResources.length}`);

    if (debugReportPath) {
      this.logger.info(`  Debug report:     ${debugReportPath}`);
    }

    this.trackAction(valid ? 'Validation passed' : 'Validation failed');

    return {
      valid,
      errors,
      warnings,
      missingResources,
      debugReportPath,
    };
  }

  /**
   * Start local server
   */
  async startServer(outputDir, port) {
    return new Promise((resolve, reject) => {
      // Get absolute path for the output directory
      const absoluteOutputDir = path.resolve(outputDir);
      const servePath = path.join(absoluteOutputDir, 'serve.js');

      this.logger.info(`Starting server from ${servePath}...`);

      // Find project's node_modules for express
      // Go up from output/<site>/ to project root
      const projectRoot = path.resolve(absoluteOutputDir, '..', '..');
      const nodeModulesPath = path.resolve(projectRoot, 'node_modules');

      this.serverProcess = spawn('node', ['serve.js'], {
        cwd: absoluteOutputDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PORT: port.toString(),
          NODE_PATH: nodeModulesPath,
        },
      });

      let started = false;

      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        this.logger.debug(`[SERVER] ${output.trim()}`);

        if (output.includes('localhost:') && !started) {
          started = true;
          // Give server a moment to be fully ready
          setTimeout(() => resolve(true), 1000);
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        const errorOutput = data.toString().trim();
        this.logger.warn(`[SERVER STDERR] ${errorOutput}`);
      });

      this.serverProcess.on('error', (error) => {
        if (!started) {
          reject(error);
        }
      });

      this.serverProcess.on('exit', (code) => {
        if (!started && code !== 0) {
          reject(new Error(`Server exited with code ${code}`));
        }
      });

      // Timeout for server start
      setTimeout(() => {
        if (!started) {
          this.serverProcess.kill();
          reject(new Error('Server start timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Stop local server
   */
  async stopServer() {
    if (this.serverProcess) {
      this.logger.debug('Stopping server...');
      this.serverProcess.kill('SIGTERM');

      // Wait for process to exit
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.serverProcess.kill('SIGKILL');
          resolve();
        }, 5000);

        this.serverProcess.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.serverProcess = null;
    }
  }

  /**
   * Check if an error is harmless (expected in extracted context)
   */
  isHarmlessError(text) {
    const harmlessPatterns = [
      /Failed to load resource.*favicon/i,
      /favicon\.ico/i,
      /robots\.txt/i,
      /sitemap\.xml/i,
      /analytics/i,
      /tracking/i,
      /gtag/i,
      /google-analytics/i,
      /facebook/i,
      /twitter/i,
      /adsense/i,
      /hotjar/i,
      /intercom/i,
      /segment/i,
    ];

    return harmlessPatterns.some(p => p.test(text));
  }

  /**
   * Check if an error is non-critical
   */
  isNonCritical(text) {
    const nonCriticalPatterns = [
      /CORS/i,
      /cross-origin/i,
      /third-party/i,
      /analytics/i,
      /tracking/i,
    ];

    return nonCriticalPatterns.some(p => p.test(text));
  }

  /**
   * Generate debug report
   */
  async generateDebugReport(outputDir, data) {
    const reportPath = path.join(outputDir, 'DEBUG.md');

    const sections = [];

    sections.push('# Extraction Debug Report');
    sections.push('');
    sections.push(`Generated: ${new Date().toISOString()}`);
    sections.push(`Original URL: ${data.url}`);
    sections.push(`Status: ${data.valid ? 'VALID' : 'ISSUES FOUND'}`);
    sections.push('');

    if (data.errors.length > 0) {
      sections.push('## Errors');
      sections.push('');
      for (const error of data.errors) {
        sections.push(`- ${error}`);
      }
      sections.push('');
    }

    if (data.warnings.length > 0) {
      sections.push('## Warnings');
      sections.push('');
      for (const warning of data.warnings) {
        sections.push(`- ${warning}`);
      }
      sections.push('');
    }

    if (data.missingResources.length > 0) {
      sections.push('## Missing Resources');
      sections.push('');
      for (const resource of data.missingResources) {
        sections.push(`- ${resource.url}`);
        sections.push(`  - Error: ${resource.error}`);
      }
      sections.push('');
    }

    if (data.consoleMessages.length > 0) {
      sections.push('## Console Messages');
      sections.push('');
      sections.push('```');
      for (const msg of data.consoleMessages.slice(0, 50)) {
        sections.push(`[${msg.type.toUpperCase()}] ${msg.text.slice(0, 200)}`);
      }
      if (data.consoleMessages.length > 50) {
        sections.push(`... and ${data.consoleMessages.length - 50} more messages`);
      }
      sections.push('```');
      sections.push('');
    }

    sections.push('## Troubleshooting');
    sections.push('');
    sections.push('1. Check if all required resources were captured');
    sections.push('2. Verify that runtime mocks are being loaded');
    sections.push('3. Check for domain-specific code that needs patching');
    sections.push('4. Try running with `--proxy` to fill missing resources');
    sections.push('');

    await fs.writeFile(reportPath, sections.join('\n'));

    return reportPath;
  }

  /**
   * Cleanup on phase completion
   */
  async cleanup() {
    await this.stopServer();
  }
}

export default ValidatePhase;
