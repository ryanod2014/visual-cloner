#!/usr/bin/env node
/**
 * V7 Extractor with Full Session Restore
 * Uses cookies + localStorage + sessionStorage
 */

import { chromium } from 'playwright';
import { V7Analyzer } from './analyzer.js';
import { V7TestGenerator } from './test-generator.js';
import { V7BackendMapper } from './backend-mapper.js';
import fs from 'fs';
import path from 'path';

async function extractWithSession(url, sessionPath, outputDir = 'output') {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   V7 FULL SESSION EXTRACTOR            ║');
  console.log('╚════════════════════════════════════════╝\\n');

  const timestamp = Date.now();
  const domain = new URL(url).hostname.replace('www.', '');
  const extractionDir = path.join(outputDir, `${domain}-${timestamp}`);

  // Create directories
  fs.mkdirSync(extractionDir, { recursive: true });
  fs.mkdirSync(path.join(extractionDir, 'resources'), { recursive: true });

  console.log(`📁 Output directory: ${extractionDir}\\n`);

  // Load session bundle
  console.log(`💾 Loading session from: ${sessionPath}\\n`);
  let session;
  try {
    const sessionData = fs.readFileSync(sessionPath, 'utf-8');
    session = JSON.parse(sessionData);
    console.log(`   ✅ Cookies: ${session.cookies.length}`);
    console.log(`   ✅ localStorage: ${Object.keys(session.localStorage || {}).length} keys`);
    console.log(`   ✅ sessionStorage: ${Object.keys(session.sessionStorage || {}).length} keys\\n`);
  } catch (err) {
    console.error(`❌ Error loading session: ${err.message}`);
    process.exit(1);
  }

  // Launch browser
  console.log('🌐 Launching browser...\\n');
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  // Add cookies
  await context.addCookies(session.cookies);
  console.log('✅ Cookies restored\\n');

  const page = await context.newPage();

  // Navigate
  console.log(`📍 Navigating to: ${url}\\n`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

  // Restore localStorage
  if (session.localStorage) {
    await page.evaluate((data) => {
      for (const [key, value] of Object.entries(data)) {
        try {
          window.localStorage.setItem(key, value);
        } catch (err) {
          console.error(`Failed to set localStorage ${key}:`, err);
        }
      }
    }, session.localStorage);
    console.log('✅ localStorage restored\\n');
  }

  // Restore sessionStorage
  if (session.sessionStorage) {
    await page.evaluate((data) => {
      for (const [key, value] of Object.entries(data)) {
        try {
          window.sessionStorage.setItem(key, value);
        } catch (err) {
          console.error(`Failed to set sessionStorage ${key}:`, err);
        }
      }
    }, session.sessionStorage);
    console.log('✅ sessionStorage restored\\n');
  }

  // Reload page to apply storage
  console.log('🔄 Reloading page to apply session...\\n');
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Wait for page to load
  console.log('⏳ Waiting for page to load (30s)...\\n');
  await page.waitForTimeout(30000);

  // Check if login worked
  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl.includes('signin')) {
    console.log('⚠️  WARNING: Still on login page.\\n');
  } else {
    console.log('✅ Successfully authenticated!\\n');
  }

  // Track network requests
  const resources = new Map();
  const failedRequests = [];

  page.on('response', async (response) => {
    const url = response.url();
    const status = response.status();

    if (status === 200 && !url.includes('data:')) {
      try {
        const contentType = response.headers()['content-type'] || '';

        if (contentType.includes('javascript') ||
            contentType.includes('css') ||
            contentType.includes('html') ||
            contentType.includes('json') ||
            url.endsWith('.js') ||
            url.endsWith('.css') ||
            url.endsWith('.html')) {

          const body = await response.body();
          resources.set(url, { url, contentType, body, size: body.length });
        }
      } catch (err) {
        // Ignore
      }
    }
  });

  page.on('requestfailed', request => {
    failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText
    });
  });

  // Wait for network to settle
  try {
    await page.waitForLoadState('networkidle', { timeout: 30000 });
  } catch (err) {
    console.log('⚠️  Network still active, continuing...\\n');
  }

  // Capture page state
  console.log('📸 Capturing page state...\\n');

  const html = await page.content();
  fs.writeFileSync(path.join(extractionDir, 'index.html'), html);
  console.log('  ✅ Saved index.html');

  await page.screenshot({
    path: path.join(extractionDir, 'screenshot.png'),
    fullPage: false
  });
  console.log('  ✅ Saved screenshot.png');

  // Wait for lazy loads
  console.log('\\n⏳ Waiting for lazy-loaded resources (20s)...\\n');
  await page.waitForTimeout(20000);

  // Save resources
  console.log(`💾 Saving ${resources.size} resources...\\n`);

  let savedCount = 0;
  for (const [url, resource] of resources) {
    try {
      const urlObj = new URL(url);
      let filename = urlObj.pathname.split('/').filter(p => p).join('_');
      if (!filename) filename = 'root';
      if (!filename.includes('.')) filename += '.js';

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
      // Ignore
    }
  }

  console.log(`\\n  ✅ Saved ${savedCount} resource files\\n`);

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

  console.log('✅ Extraction complete!\\n');

  // Run V7 analysis
  console.log('═'.repeat(60));
  console.log('RUNNING V7 ANALYSIS');
  console.log('═'.repeat(60) + '\\n');

  try {
    console.log('🔍 Analyzing code...\\n');
    const analyzer = new V7Analyzer(path.join(extractionDir, 'resources'));
    const features = analyzer.discover();
    const analysisReport = analyzer.generateReport(features);

    fs.writeFileSync(
      path.join(extractionDir, 'v7-analysis.json'),
      JSON.stringify(analysisReport, null, 2)
    );

    console.log('✅ Feature analysis complete\\n');

    // Generate test files
    console.log('📝 Generating test files...\\n');
    const generator = new V7TestGenerator(path.join(extractionDir, 'test-files'));
    const testFiles = await generator.generate(features.fileFormats);
    generator.generateManifest();

    console.log('✅ Test files generated\\n');

    // Backend mapping
    console.log('🔧 Mapping backend...\\n');
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

    console.log('✅ Backend documentation generated\\n');

    // Final summary
    console.log('═'.repeat(60));
    console.log('FINAL SUMMARY');
    console.log('═'.repeat(60));
    console.log(`\\n📁 Extraction directory: ${extractionDir}`);
    console.log(`\\n📊 Features Discovered:`);
    console.log(`   - File formats: ${features.fileFormats.length}`);
    console.log(`   - Lazy loads: ${features.lazyLoads.length}`);
    console.log(`   - API endpoints: ${features.apiEndpoints.length}`);
    console.log(`   - Workers: ${features.workers.length}`);
    console.log(`   - Iframes: ${features.iframes.length}`);
    console.log(`   - Event handlers: ${features.eventHandlers.length}`);

    console.log(`\\n📋 Backend Dependencies:`);
    console.log(`   - Has backend: ${backendDoc.summary.hasBackendDependencies ? '✅ YES' : '❌ NO'}`);
    if (backendDoc.summary.hasBackendDependencies) {
      console.log(`   - API endpoints: ${backendDoc.summary.totalAPIEndpoints}`);
      console.log(`   - WebSockets: ${backendDoc.summary.totalWebSockets}`);
      console.log(`   - Requires auth: ${backendDoc.summary.requiresAuthentication ? '✅ YES' : '❌ NO'}`);
    }

    console.log(`\\n📄 Generated Files:`);
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

    console.log(`\\n📊 Statistics:`);
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
    console.error('\\n❌ Analysis error:', err.message);
    await browser.close();
    throw err;
  }
}

// CLI
const url = process.argv[2];
const sessionPath = process.argv[3] || 'ghl-session.json';

if (!url) {
  console.log('Usage: node v7-with-session.js <url> [session-file]');
  console.log('Example: node v7-with-session.js https://app.gohighlevel.com ghl-session.json');
  process.exit(1);
}

try {
  await extractWithSession(url, sessionPath);
  console.log('\\n✅ All done!\\n');
  console.log('💡 Check BACKEND-BLUEPRINT.md for implementation guide\\n');
} catch (err) {
  console.error('\\n❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
}
