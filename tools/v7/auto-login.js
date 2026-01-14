#!/usr/bin/env node
/**
 * V7 Extractor with Auto-Detecting Login
 * Opens browser, waits for you to login, automatically detects when done
 */

import { chromium } from 'playwright';
import { V7Analyzer } from './analyzer.js';
import { V7TestGenerator } from './test-generator.js';
import { V7BackendMapper } from './backend-mapper.js';
import fs from 'fs';
import path from 'path';

async function extractWithAutoLogin(url, outputDir = 'output') {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   V7 AUTO-LOGIN EXTRACTOR              ║');
  console.log('╚════════════════════════════════════════╝\n');

  const timestamp = Date.now();
  const domain = new URL(url).hostname.replace('www.', '');
  const extractionDir = path.join(outputDir, `${domain}-${timestamp}`);

  // Create directories
  fs.mkdirSync(extractionDir, { recursive: true });
  fs.mkdirSync(path.join(extractionDir, 'resources'), { recursive: true });

  console.log(`📁 Output directory: ${extractionDir}\n`);

  // Launch browser
  console.log('🌐 Launching browser...\n');
  const browser = await chromium.launch({
    headless: false,  // Show browser so user can login
    slowMo: 50
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

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
        // Ignore errors
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
  await page.waitForTimeout(3000);

  // Check if we're on a login page
  const loginDetected = await page.evaluate(() => {
    const text = document.body.textContent.toLowerCase();
    const hasLoginForm = document.querySelector('input[type="password"]') !== null;
    const hasLoginText = text.includes('login') || text.includes('sign in');
    return hasLoginForm || hasLoginText;
  });

  if (loginDetected) {
    console.log('🔐 LOGIN DETECTED\n');
    console.log('─'.repeat(60));
    console.log('⏸  Please log in to the application in the browser window.');
    console.log('─'.repeat(60));
    console.log('\n👀 Watching for login completion...\n');

    // Auto-detect when login is complete
    let loginComplete = false;
    let checkCount = 0;
    const maxChecks = 120; // 2 minutes max wait

    while (!loginComplete && checkCount < maxChecks) {
      await page.waitForTimeout(1000);
      checkCount++;

      // Check if we're still on login page
      const stillOnLogin = await page.evaluate(() => {
        const hasPasswordField = document.querySelector('input[type="password"]') !== null;
        const text = document.body.textContent.toLowerCase();
        const hasLoginText = text.includes('sign in') || text.includes('log in');

        // If password field is gone AND login text is gone, likely logged in
        return hasPasswordField || (hasLoginText && text.length < 5000);
      });

      if (!stillOnLogin) {
        loginComplete = true;
        console.log('✅ Login detected! Continuing extraction...\n');
      } else if (checkCount % 10 === 0) {
        console.log(`   Still waiting... (${checkCount}s elapsed)`);
      }
    }

    if (!loginComplete) {
      console.log('⚠️  Login timeout reached. Continuing anyway...\n');
    }

    // Wait for page to stabilize after login
    await page.waitForTimeout(5000);

    // Wait for network to settle
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {
      console.log('⚠️  Network still active, continuing anyway...');
    });
  } else {
    console.log('✅ No login detected, continuing...\n');
  }

  // Capture initial state
  console.log('📸 Capturing page state...\n');

  const html = await page.content();
  fs.writeFileSync(path.join(extractionDir, 'index.html'), html);
  console.log('  ✅ Saved index.html');

  // Take a screenshot
  await page.screenshot({
    path: path.join(extractionDir, 'screenshot.png'),
    fullPage: false
  });
  console.log('  ✅ Saved screenshot.png');

  // Wait for any lazy loads
  console.log('\n⏳ Waiting for lazy-loaded resources (10s)...\n');
  await page.waitForTimeout(10000);

  // Save all captured resources
  console.log(`💾 Saving ${resources.size} resources...\n`);

  let savedCount = 0;
  for (const [url, resource] of resources) {
    try {
      // Create filename from URL
      const urlObj = new URL(url);
      let filename = urlObj.pathname.split('/').filter(p => p).join('_');
      if (!filename) filename = 'root';
      if (!filename.includes('.')) filename += '.js';

      // Limit filename length
      if (filename.length > 200) {
        filename = filename.substring(0, 200);
      }

      const filepath = path.join(extractionDir, 'resources', filename);
      fs.writeFileSync(filepath, resource.body);

      savedCount++;
      if (savedCount % 50 === 0) {
        console.log(`  ... ${savedCount} files saved`);
      }
    } catch (err) {
      console.log(`  ⚠️  Error saving ${url}: ${err.message}`);
    }
  }

  console.log(`\n  ✅ Saved ${savedCount} resource files\n`);

  // Create resource manifest
  const manifest = {
    url: url,
    timestamp: new Date().toISOString(),
    resourceCount: resources.size,
    resources: Array.from(resources.values()).map(r => ({
      url: r.url,
      contentType: r.contentType,
      size: r.size
    })),
    failedRequests: failedRequests.map(r => ({
      url: r.url,
      error: r.error
    }))
  };

  fs.writeFileSync(
    path.join(extractionDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log('✅ Extraction complete!');
  console.log(`📁 Output: ${extractionDir}`);
  console.log(`📊 Captured: ${resources.size} resources`);
  console.log(`⚠️  Failed: ${failedRequests.length} requests\n`);

  // Run V7 analysis on extracted code
  console.log('═'.repeat(60));
  console.log('RUNNING V7 ANALYSIS');
  console.log('═'.repeat(60) + '\n');

  try {
    // Analyze
    const analyzer = new V7Analyzer(path.join(extractionDir, 'resources'));
    const features = analyzer.discover();
    const analysisReport = analyzer.generateReport(features);

    fs.writeFileSync(
      path.join(extractionDir, 'v7-analysis.json'),
      JSON.stringify(analysisReport, null, 2)
    );

    console.log('✅ Feature analysis complete\n');

    // Generate test files
    const generator = new V7TestGenerator(path.join(extractionDir, 'test-files'));
    const testFiles = await generator.generate(features.fileFormats);
    generator.generateManifest();

    console.log('✅ Test files generated\n');

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

    console.log('✅ Backend documentation generated\n');

    console.log('═'.repeat(60));
    console.log('FINAL SUMMARY');
    console.log('═'.repeat(60));
    console.log(`\n📁 Extraction directory: ${extractionDir}`);
    console.log(`\n📊 Features Discovered:`);
    console.log(`   - File formats: ${features.fileFormats.length}`);
    console.log(`   - Lazy loads: ${features.lazyLoads.length}`);
    console.log(`   - API endpoints: ${features.apiEndpoints.length}`);
    console.log(`   - Workers: ${features.workers.length}`);
    console.log(`   - Event handlers: ${features.eventHandlers.length}`);

    console.log(`\n📋 Backend Dependencies:`);
    console.log(`   - Has backend: ${backendDoc.summary.hasBackendDependencies ? '✅ YES' : '❌ NO'}`);
    if (backendDoc.summary.hasBackendDependencies) {
      console.log(`   - API endpoints: ${backendDoc.summary.totalAPIEndpoints}`);
      console.log(`   - WebSockets: ${backendDoc.summary.totalWebSockets}`);
      console.log(`   - Requires auth: ${backendDoc.summary.requiresAuthentication ? '✅ YES' : '❌ NO'}`);
    }

    console.log(`\n📄 Generated Files:`);
    console.log(`   - index.html`);
    console.log(`   - screenshot.png`);
    console.log(`   - resources/ (${savedCount} files)`);
    console.log(`   - v7-analysis.json`);
    console.log(`   - BACKEND-BLUEPRINT.md`);
    console.log(`   - v7-backend.json`);
    console.log(`   - test-files/ (${testFiles.length} files)`);
    console.log(`   - manifest.json`);

    await browser.close();

    return {
      extractionDir,
      features,
      backendDoc,
      resourceCount: resources.size,
      failedCount: failedRequests.length
    };
  } catch (err) {
    console.error('\n❌ Analysis error:', err.message);
    await browser.close();
    throw err;
  }
}

// CLI
const url = process.argv[2];

if (!url) {
  console.log('Usage: node v7-auto-login.js <url>');
  console.log('Example: node v7-auto-login.js https://app.gohighlevel.com');
  process.exit(1);
}

try {
  await extractWithAutoLogin(url);
  console.log('\n✅ All done!\n');
} catch (err) {
  console.error('\n❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
}
