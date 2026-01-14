#!/usr/bin/env node
/**
 * V7 Extractor using Real Chrome Profile
 * Uses your actual Chrome with existing cookies/logins
 */

import { chromium } from 'playwright';
import { V7Analyzer } from './analyzer.js';
import { V7TestGenerator } from './test-generator.js';
import { V7BackendMapper } from './backend-mapper.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

async function extractWithRealChrome(url, outputDir = 'output') {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   V7 REAL CHROME EXTRACTOR             ║');
  console.log('╚════════════════════════════════════════╝\n');

  const timestamp = Date.now();
  const domain = new URL(url).hostname.replace('www.', '');
  const extractionDir = path.join(outputDir, `${domain}-${timestamp}`);

  // Create directories
  fs.mkdirSync(extractionDir, { recursive: true });
  fs.mkdirSync(path.join(extractionDir, 'resources'), { recursive: true });

  console.log(`📁 Output directory: ${extractionDir}\n`);

  // Find Chrome user data directory
  const homeDir = os.homedir();
  let userDataDir;

  if (process.platform === 'darwin') {
    // macOS
    userDataDir = path.join(homeDir, 'Library/Application Support/Google/Chrome');
  } else if (process.platform === 'win32') {
    // Windows
    userDataDir = path.join(homeDir, 'AppData/Local/Google/Chrome/User Data');
  } else {
    // Linux
    userDataDir = path.join(homeDir, '.config/google-chrome');
  }

  console.log('🌐 Launching Chrome with your profile...');
  console.log(`   Profile: ${userDataDir}\n`);

  // Launch with real Chrome profile
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome', // Use installed Chrome, not Chromium
    viewport: { width: 1920, height: 1080 },
    args: [
      '--disable-blink-features=AutomationControlled', // Hide automation
      '--disable-dev-shm-usage',
      '--disable-web-security', // Allow CORS for capturing
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  const page = browser.pages()[0] || await browser.newPage();

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
  console.log('⏳ This may take a moment if you need to login...\n');

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

  // Wait for page to fully load
  console.log('⏳ Waiting for page to load (30s)...\n');
  await page.waitForTimeout(30000);

  // Check if we need authentication
  const currentUrl = page.url();
  const needsAuth = currentUrl.includes('login') ||
                    currentUrl.includes('signin') ||
                    currentUrl.includes('auth');

  if (needsAuth) {
    console.log('🔐 Login page detected.');
    console.log('   Please log in if needed in the browser window.\n');
    console.log('⏳ Waiting 60 more seconds for login...\n');
    await page.waitForTimeout(60000);
  }

  // Wait for network to settle
  try {
    await page.waitForLoadState('networkidle', { timeout: 30000 });
  } catch (err) {
    console.log('⚠️  Network still active, continuing anyway...\n');
  }

  // Capture page state
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

  // Wait for lazy loads
  console.log('\n⏳ Waiting for lazy-loaded resources (15s)...\n');
  await page.waitForTimeout(15000);

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
        const ext = path.extname(filename);
        filename = filename.substring(0, 200 - ext.length) + ext;
      }

      const filepath = path.join(extractionDir, 'resources', filename);
      fs.writeFileSync(filepath, resource.body);

      savedCount++;
      if (savedCount % 100 === 0) {
        console.log(`  ... ${savedCount} files saved`);
      }
    } catch (err) {
      console.log(`  ⚠️  Error saving: ${err.message}`);
    }
  }

  console.log(`\n  ✅ Saved ${savedCount} resource files\n`);

  // Create manifest
  const manifest = {
    url: url,
    timestamp: new Date().toISOString(),
    resourceCount: resources.size,
    savedCount: savedCount,
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

  console.log('✅ Extraction complete!\n');

  // Run V7 analysis
  console.log('═'.repeat(60));
  console.log('RUNNING V7 ANALYSIS');
  console.log('═'.repeat(60) + '\n');

  try {
    // Analyze
    console.log('🔍 Analyzing code...\n');
    const analyzer = new V7Analyzer(path.join(extractionDir, 'resources'));
    const features = analyzer.discover();
    const analysisReport = analyzer.generateReport(features);

    fs.writeFileSync(
      path.join(extractionDir, 'v7-analysis.json'),
      JSON.stringify(analysisReport, null, 2)
    );

    console.log('✅ Feature analysis complete\n');

    // Generate test files
    console.log('📝 Generating test files...\n');
    const generator = new V7TestGenerator(path.join(extractionDir, 'test-files'));
    const testFiles = await generator.generate(features.fileFormats);
    generator.generateManifest();

    console.log('✅ Test files generated\n');

    // Backend mapping
    console.log('🔧 Mapping backend...\n');
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

    // Final summary
    console.log('═'.repeat(60));
    console.log('FINAL SUMMARY');
    console.log('═'.repeat(60));
    console.log(`\n📁 Extraction directory: ${extractionDir}`);
    console.log(`\n📊 Features Discovered:`);
    console.log(`   - File formats: ${features.fileFormats.length}`);
    console.log(`   - Lazy loads: ${features.lazyLoads.length}`);
    console.log(`   - API endpoints: ${features.apiEndpoints.length}`);
    console.log(`   - Workers: ${features.workers.length}`);
    console.log(`   - Iframes: ${features.iframes.length}`);
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
    console.log(`   - manifest.json`);
    console.log(`   - v7-analysis.json`);
    console.log(`   - BACKEND-BLUEPRINT.md`);
    console.log(`   - v7-backend.json`);
    if (testFiles.length > 0) {
      console.log(`   - test-files/ (${testFiles.length} files)`);
    }

    console.log(`\n📊 Statistics:`);
    console.log(`   - Resources captured: ${resources.size}`);
    console.log(`   - Files saved: ${savedCount}`);
    console.log(`   - Failed requests: ${failedRequests.length}`);

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
  console.log('Usage: node v7-real-chrome.js <url>');
  console.log('Example: node v7-real-chrome.js https://app.gohighlevel.com');
  console.log('\nThis uses your actual Chrome profile with existing logins.');
  process.exit(1);
}

try {
  await extractWithRealChrome(url);
  console.log('\n✅ All done!\n');
  console.log('💡 TIP: Check the BACKEND-BLUEPRINT.md for implementation guide\n');
} catch (err) {
  console.error('\n❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
}
