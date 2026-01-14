#!/usr/bin/env node

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

class BrowserDebugger {
  constructor(target, options = {}) {
    this.target = target;
    this.waitTime = options.waitTime || 10000;
    this.startTime = Date.now();

    // Event collectors
    this.consoleMessages = [];
    this.networkRequests = [];
    this.timeline = [];

    // Statistics
    this.stats = {
      errors: 0,
      warnings: 0,
      logs: 0,
      failedRequests: 0,
    };

    this.firstError = null;
  }

  formatTime(timestamp) {
    const elapsed = timestamp - this.startTime;
    return (elapsed / 1000).toFixed(2) + 's';
  }

  formatConsoleType(type) {
    const typeMap = {
      log: { color: colors.gray, label: 'LOG' },
      info: { color: colors.blue, label: 'INFO' },
      warn: { color: colors.yellow, label: 'WARN' },
      warning: { color: colors.yellow, label: 'WARN' },
      error: { color: colors.red, label: 'ERROR' },
      debug: { color: colors.magenta, label: 'DEBUG' },
    };

    const config = typeMap[type] || { color: colors.white, label: type.toUpperCase() };
    return `${config.color}${config.label}${colors.reset}`;
  }

  async resolveUrl(target) {
    // If it's already a URL, use it
    if (target.startsWith('http://') || target.startsWith('https://')) {
      return target;
    }

    // Otherwise, treat it as a local path
    const targetPath = resolve(process.cwd(), target);

    // Check if it's a directory with index.html
    let htmlPath = targetPath;
    if (existsSync(targetPath) && !targetPath.endsWith('.html')) {
      htmlPath = join(targetPath, 'index.html');
    }

    if (!existsSync(htmlPath)) {
      throw new Error(`File not found: ${htmlPath}`);
    }

    return 'file://' + htmlPath;
  }

  setupConsoleListener(page) {
    page.on('console', async (msg) => {
      const timestamp = Date.now();
      const type = msg.type();
      const text = msg.text();

      // Get stack trace for errors
      let stack = null;
      if (type === 'error') {
        const args = msg.args();
        if (args.length > 0) {
          try {
            const errorObj = await args[0].jsonValue();
            if (errorObj && errorObj.stack) {
              stack = errorObj.stack;
            }
          } catch (e) {
            // Ignore if we can't get the stack
          }
        }
      }

      const entry = {
        timestamp,
        type,
        text,
        stack,
        location: msg.location(),
      };

      this.consoleMessages.push(entry);

      // Update stats
      if (type === 'error') {
        this.stats.errors++;
        if (!this.firstError) {
          this.firstError = entry;
        }
      } else if (type === 'warning' || type === 'warn') {
        this.stats.warnings++;
      } else if (type === 'log' || type === 'info') {
        this.stats.logs++;
      }

      // Print in real-time
      const timeStr = colors.dim + '[' + this.formatTime(timestamp) + ']' + colors.reset;
      const typeStr = this.formatConsoleType(type);
      console.log(`${timeStr} ${typeStr} ${text}`);

      if (stack) {
        const stackLines = stack.split('\n').slice(0, 3);
        stackLines.forEach(line => {
          console.log(`${colors.dim}    ${line}${colors.reset}`);
        });
      }
    });
  }

  setupNetworkListener(page) {
    page.on('response', async (response) => {
      const timestamp = Date.now();
      const request = response.request();
      const url = request.url();
      const status = response.status();
      const method = request.method();

      const entry = {
        timestamp,
        url,
        status,
        method,
        failed: status >= 400,
      };

      this.networkRequests.push(entry);

      if (status >= 400) {
        this.stats.failedRequests++;
      }

      // Print network requests in real-time
      const timeStr = colors.dim + '[' + this.formatTime(timestamp) + ']' + colors.reset;
      const statusColor = status >= 400 ? colors.red : (status >= 300 ? colors.yellow : colors.green);
      const statusStr = `${statusColor}${status}${colors.reset}`;
      const failedMark = status >= 400 ? ` ${colors.red}❌${colors.reset}` : '';

      // Shorten URL for display
      let displayUrl = url;
      try {
        const urlObj = new URL(url);
        displayUrl = urlObj.pathname + urlObj.search;
      } catch (e) {
        // Keep original if URL parsing fails
      }

      console.log(`${timeStr} ${colors.cyan}[NET]${colors.reset} ${method} ${displayUrl} → ${statusStr}${failedMark}`);
    });

    page.on('requestfailed', (request) => {
      const timestamp = Date.now();
      const url = request.url();
      const failure = request.failure();

      const entry = {
        timestamp,
        url,
        status: 0,
        method: request.method(),
        failed: true,
        error: failure ? failure.errorText : 'Unknown error',
      };

      this.networkRequests.push(entry);
      this.stats.failedRequests++;

      const timeStr = colors.dim + '[' + this.formatTime(timestamp) + ']' + colors.reset;
      let displayUrl = url;
      try {
        const urlObj = new URL(url);
        displayUrl = urlObj.pathname + urlObj.search;
      } catch (e) {
        // Keep original
      }

      console.log(`${timeStr} ${colors.cyan}[NET]${colors.reset} ${request.method()} ${displayUrl} → ${colors.red}FAILED${colors.reset} (${entry.error})`);
    });
  }

  addTimelineEvent(description) {
    this.timeline.push({
      timestamp: Date.now(),
      description,
    });
  }

  printReport() {
    console.log('\n');
    console.log(colors.bright + '══════════════════════════════════════' + colors.reset);
    console.log(colors.bright + 'BROWSER DEBUG REPORT' + colors.reset);
    console.log(colors.bright + '══════════════════════════════════════' + colors.reset);
    console.log('');

    // First Error
    if (this.firstError) {
      console.log(colors.bright + colors.red + 'FIRST ERROR:' + colors.reset);
      console.log(`  [${this.formatTime(this.firstError.timestamp)}] ${this.firstError.text}`);

      if (this.firstError.stack) {
        const stackLines = this.firstError.stack.split('\n').slice(0, 3);
        stackLines.forEach(line => {
          console.log(`    ${colors.dim}${line}${colors.reset}`);
        });
      } else if (this.firstError.location && this.firstError.location.url) {
        console.log(`    ${colors.dim}at ${this.firstError.location.url}:${this.firstError.location.lineNumber}${colors.reset}`);
      }
      console.log('');
    }

    // Failed Network Requests
    const failedRequests = this.networkRequests.filter(req => req.failed);
    if (failedRequests.length > 0) {
      console.log(colors.bright + colors.red + 'FAILED NETWORK REQUESTS:' + colors.reset);

      // Group by URL to avoid duplicates
      const uniqueFailed = new Map();
      failedRequests.forEach(req => {
        let displayUrl = req.url;
        try {
          const urlObj = new URL(req.url);
          displayUrl = urlObj.pathname;
        } catch (e) {
          // Keep original
        }

        if (!uniqueFailed.has(displayUrl)) {
          uniqueFailed.set(displayUrl, req);
        }
      });

      uniqueFailed.forEach((req, url) => {
        const statusInfo = req.status > 0 ? `(${req.status})` : req.error ? `(${req.error})` : '';
        console.log(`  ${url} ${statusInfo}`);
      });
      console.log('');
    }

    // Statistics
    console.log(colors.bright + 'SUMMARY:' + colors.reset);
    console.log(`  WARNINGS: ${colors.yellow}${this.stats.warnings}${colors.reset}`);
    console.log(`  ERRORS: ${colors.red}${this.stats.errors}${colors.reset}`);
    console.log(`  FAILED REQUESTS: ${colors.red}${this.stats.failedRequests}${colors.reset}`);
    console.log(`  TOTAL LOGS: ${this.stats.logs}`);
    console.log('');

    // Timeline
    if (this.timeline.length > 0) {
      console.log(colors.bright + 'TIMELINE:' + colors.reset);
      this.timeline.forEach(event => {
        const marker = event.description.includes('ERROR') ?
          ` ${colors.red}← Investigate this${colors.reset}` : '';
        console.log(`  ${this.formatTime(event.timestamp)} - ${event.description}${marker}`);
      });
      console.log('');
    }

    // Diagnosis
    if (this.firstError) {
      console.log(colors.bright + colors.yellow + 'DIAGNOSIS:' + colors.reset);
      console.log(`  The first error occurred at ${this.formatTime(this.firstError.timestamp)}.`);
      console.log(`  This is likely the root cause of subsequent issues.`);
      console.log('');
    }

    console.log(colors.bright + '══════════════════════════════════════' + colors.reset);
  }

  async run() {
    console.log(colors.bright + '\nBrowser Debug Session Starting...' + colors.reset);
    console.log(colors.dim + `Target: ${this.target}` + colors.reset);
    console.log(colors.dim + `Wait time: ${this.waitTime}ms` + colors.reset);
    console.log('');

    let browser;
    try {
      // Resolve the target URL
      const url = await this.resolveUrl(this.target);
      console.log(colors.dim + `Loading: ${url}` + colors.reset);
      console.log('');

      // Launch browser
      browser = await chromium.launch({
        headless: true,
        args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
      });

      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      });

      const page = await context.newPage();

      // Setup listeners
      this.setupConsoleListener(page);
      this.setupNetworkListener(page);

      // Add timeline event for page load
      this.addTimelineEvent('Page load started');

      // Navigate to the page
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000,
      }).catch(err => {
        console.log(colors.yellow + `Warning: Navigation timeout or error: ${err.message}` + colors.reset);
      });

      this.addTimelineEvent('Initial page load complete');

      // Check for main JS loaded
      const scripts = await page.$$('script[src]');
      if (scripts.length > 0) {
        this.addTimelineEvent(`${scripts.length} script(s) discovered`);
      }

      // Wait for stabilization
      console.log(colors.dim + `\nWaiting ${this.waitTime}ms for page to stabilize...` + colors.reset);
      await page.waitForTimeout(this.waitTime);

      // Check if first error occurred
      if (this.firstError) {
        this.addTimelineEvent(`FIRST ERROR at ${this.formatTime(this.firstError.timestamp)}`);
      }

      // Try to detect UI elements
      const bodyText = await page.textContent('body').catch(() => '');
      if (bodyText.length > 0) {
        this.addTimelineEvent('UI rendered (page has content)');
      }

      this.addTimelineEvent('Debug session complete');

      // Print report
      this.printReport();

      await browser.close();

      // Exit with error code if errors were found
      if (this.stats.errors > 0) {
        process.exit(1);
      }

    } catch (error) {
      console.error(colors.red + '\nDebug session failed:' + colors.reset);
      console.error(error);

      if (browser) {
        await browser.close();
      }

      process.exit(1);
    }
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.bright}Browser Console Error Collector${colors.reset}

${colors.bright}Usage:${colors.reset}
  node debug-browser.js <target> [options]

${colors.bright}Arguments:${colors.reset}
  target              Path to extraction directory or URL
                      Examples:
                        ./output/photopea.com-123456/
                        http://localhost:3333
                        https://example.com

${colors.bright}Options:${colors.reset}
  --wait <ms>         Wait time in milliseconds (default: 10000)
  --help, -h          Show this help message

${colors.bright}Examples:${colors.reset}
  node debug-browser.js ./output/photopea.com-123456/
  node debug-browser.js http://localhost:3333 --wait 15000
  node debug-browser.js https://www.photopea.com

${colors.bright}Features:${colors.reset}
  - Captures ALL console output (logs, warnings, errors) in order
  - Tracks network requests and failures
  - Identifies the FIRST error (usually the root cause)
  - Provides timeline of key events
  - Real-time output with timestamps
  - Summary report with diagnosis
`);
    process.exit(0);
  }

  const target = args[0];
  const options = {};

  // Parse options
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--wait' && args[i + 1]) {
      options.waitTime = parseInt(args[i + 1], 10);
      i++;
    }
  }

  const debugSession = new BrowserDebugger(target, options);
  await debugSession.run();
}

main().catch(error => {
  console.error(colors.red + 'Fatal error:' + colors.reset, error);
  process.exit(1);
});
