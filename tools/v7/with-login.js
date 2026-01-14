#!/usr/bin/env node
/**
 * V7 Extractor with Manual Login Support
 * Pauses for manual login, then continues extraction
 */

import { chromium } from 'playwright';
import { V7Analyzer } from './analyzer.js';
import { V7TestGenerator } from './test-generator.js';
import { V7BackendMapper } from './backend-mapper.js';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function extractWithLogin(url, outputDir = 'output') {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   V7 EXTRACTOR WITH LOGIN              ║');
  console.log('╚════════════════════════════════════════╝\n');

  const timestamp = Date.now();
  const domain = new URL(url).hostname.replace('www.', '');
  const extractionDir = path.join(outputDir, `${domain}-${timestamp}`);

  // Create directories
  fs.mkdirSync(extractionDir, { recursive: true });
  fs.mkdirSync(path.join(extractionDir, 'resources'), { recursive: true });

  console.log(`Output directory: ${extractionDir}\n`);

  // Launch browser
  console.log('🌐 Launching browser...\n');
  const browser = await chromium.launch({
    headless: false,  // Show browser so user can login
    slowMo: 50        // Slight delay to make it easier to see
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Track all network requests
  const resources = new Map();
  const failedRequests = [];

  page.on('response', async (response) => {
    const url = response.url();
    const status = response.status();

    if (status === 200 && !url.includes('data:')) {
      try {
        const contentType = response.headers()['content-type'] || '';

        // Save important resources
        if (contentType.includes('javascript') ||
            contentType.includes('css') ||
            contentType.includes('html') ||
            contentType.includes('json') ||
            url.endsWith('.js') ||
            url.endsWith('.css') ||
            url.endsWith('.html')) {

          const body = await response.body();
          resources.set(url, {
            url,
            contentType,
            body,
            size: body.length
          });
        }
      } catch (err) {
        // Ignore errors (some requests can't be captured)
      }
    }
  });

  page.on('requestfailed', request => {
    failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText
    });
  });

  // Navigate to the site
  console.log(`📍 Navigating to: ${url}\n`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait a bit for initial load
  await page.waitForTimeout(2000);

  // Check if we're on a login page
  const loginDetected = await page.evaluate(() => {
    const text = document.body.textContent.toLowerCase();
    return text.includes('login') ||
           text.includes('sign in') ||
           text.includes('email') && text.includes('password');
  });

  if (loginDetected) {
    console.log('🔐 LOGIN REQUIRED\n');
    console.log('─'.repeat(60));
    console.log('Please log in to the application in the browser window.');
    console.log('After logging in successfully, return here and press ENTER.');
    console.log('─'.repeat(60));
    console.log('\n⏸  Waiting for you to log in...\n');

    await askQuestion('Press ENTER after you have logged in: ');

    // Wait for navigation after login
    console.log('\n✅ Continuing extraction...\n');
    await page.waitForTimeout(3000);

    // Wait for network to settle after login
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {
      console.log('⚠️  Network still active, continuing anyway...');
    });
  } else {
    console.log('✅ No login detected, continuing...\n');
  }

  // Capture initial state
  console.log('📸 Capturing initial page state...\n');

  const html = await page.content();
  fs.writeFileSync(path.join(extractionDir, 'index.html'), html);
  console.log('  ✅ Saved index.html');

  // Wait for any lazy loads
  await page.waitForTimeout(5000);

  // Save all captured resources
  console.log(`\n💾 Saving ${resources.size} resources...\n`);

  for (const [url, resource] of resources) {
    try {
      // Create filename from URL
      const urlObj = new URL(url);
      let filename = urlObj.pathname.split('/').filter(p => p).join('_');
      if (!filename) filename = 'root';
      if (!filename.includes('.')) filename += '.js';

      const filepath = path.join(extractionDir, 'resources', filename);
      fs.writeFileSync(filepath, resource.body);

      console.log(`  ✅ ${filename} (${(resource.size / 1024).toFixed(2)} KB)`);
    } catch (err) {
      console.log(`  ⚠️  Error saving ${url}: ${err.message}`);
    }
  }

  // Create resource manifest
  const manifest = {
    url: url,
    timestamp: new Date().toISOString(),
    resources: Array.from(resources.values()).map(r => ({
      url: r.url,
      contentType: r.contentType,
      size: r.size
    })),
    failedRequests: failedRequests
  };

  fs.writeFileSync(
    path.join(extractionDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`\n✅ Extraction complete!`);
  console.log(`📁 Output: ${extractionDir}`);
  console.log(`📊 Captured: ${resources.size} resources`);
  console.log(`⚠️  Failed: ${failedRequests.length} requests\n`);

  // Run V7 analysis on extracted code
  console.log('═'.repeat(60));
  console.log('RUNNING V7 ANALYSIS');
  console.log('═'.repeat(60) + '\n');

  // Analyze
  const analyzer = new V7Analyzer(path.join(extractionDir, 'resources'));
  const features = analyzer.discover();
  const analysisReport = analyzer.generateReport(features);

  fs.writeFileSync(
    path.join(extractionDir, 'v7-analysis.json'),
    JSON.stringify(analysisReport, null, 2)
  );

  // Generate test files
  const generator = new V7TestGenerator(path.join(extractionDir, 'test-files'));
  const testFiles = await generator.generate(features.fileFormats);
  generator.generateManifest();

  // Backend mapping
  const mapper = new V7BackendMapper(path.join(extractionDir, 'resources'));
  const dependencies = mapper.mapBackend();
  const backendDoc = mapper.generateDocumentation(dependencies);

  const backendMarkdown = mapper.generateMarkdown(backendDoc);
  fs.writeFileSync(
    path.join(extractionDir, 'BACKEND-BLUEPRINT.md'),
    backendMarkdown
  );

  fs.writeFileSync(
    path.join(extractionDir, 'v7-backend.json'),
    JSON.stringify(backendDoc, null, 2)
  );

  console.log('\n═'.repeat(60));
  console.log('FINAL SUMMARY');
  console.log('═'.repeat(60));
  console.log(`\n📁 Extraction directory: ${extractionDir}`);
  console.log(`\n📊 Features Discovered:`);
  console.log(`   - File formats: ${features.fileFormats.length}`);
  console.log(`   - Lazy loads: ${features.lazyLoads.length}`);
  console.log(`   - API endpoints: ${features.apiEndpoints.length}`);
  console.log(`   - Event handlers: ${features.eventHandlers.length}`);

  console.log(`\n📋 Backend Dependencies:`);
  console.log(`   - Has backend: ${backendDoc.summary.hasBackendDependencies ? 'YES' : 'NO'}`);
  if (backendDoc.summary.hasBackendDependencies) {
    console.log(`   - API endpoints: ${backendDoc.summary.totalAPIEndpoints}`);
    console.log(`   - WebSockets: ${backendDoc.summary.totalWebSockets}`);
    console.log(`   - Requires auth: ${backendDoc.summary.requiresAuthentication ? 'YES' : 'NO'}`);
  }

  console.log(`\n📄 Generated Files:`);
  console.log(`   - index.html`);
  console.log(`   - resources/ (${resources.size} files)`);
  console.log(`   - v7-analysis.json`);
  console.log(`   - BACKEND-BLUEPRINT.md`);
  console.log(`   - test-files/ (${testFiles.length} files)`);

  await browser.close();
  rl.close();

  return {
    extractionDir,
    features,
    backendDoc,
    resourceCount: resources.size,
    failedCount: failedRequests.length
  };
}

// CLI
const url = process.argv[2];

if (!url) {
  console.log('Usage: node v7-with-login.js <url>');
  console.log('Example: node v7-with-login.js https://app.gohighlevel.com');
  process.exit(1);
}

try {
  await extractWithLogin(url);
  console.log('\n✅ All done!\n');
} catch (err) {
  console.error('\n❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
}
