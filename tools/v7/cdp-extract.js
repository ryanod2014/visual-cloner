#!/usr/bin/env node
/**
 * V7 Extractor via CDP (Chrome DevTools Protocol)
 * Connects to already-running Chrome instance
 */

import { chromium } from 'playwright';
import { V7Analyzer } from './analyzer.js';
import { V7TestGenerator } from './test-generator.js';
import { V7BackendMapper } from './backend-mapper.js';
import fs from 'fs';
import path from 'path';

/**
 * Extract sourceMappingURL from JavaScript content
 * Handles both inline comments and external file references
 * @param {string|Buffer} content - JavaScript file content
 * @returns {string|null} - The source map URL or null if not found
 */
function extractSourceMapUrl(content) {
  const text = content instanceof Buffer ? content.toString('utf8') : content;
  // Match both //# and //@ formats (//@ is deprecated but still used)
  const match = text.match(/\/\/[#@]\s*sourceMappingURL=([^\s]+)/);
  return match ? match[1] : null;
}

/**
 * Resolve source map URL relative to the JS file URL
 * @param {string} jsUrl - The URL of the JavaScript file
 * @param {string} mapUrl - The source map URL (relative or absolute)
 * @returns {string} - The resolved absolute URL
 */
function resolveSourceMapUrl(jsUrl, mapUrl) {
  // If it's already an absolute URL, return as-is
  if (mapUrl.startsWith('http://') || mapUrl.startsWith('https://')) {
    return mapUrl;
  }
  // Handle data: URLs (inline source maps) - skip these
  if (mapUrl.startsWith('data:')) {
    return null;
  }
  // Resolve relative URL against the JS file URL
  try {
    const jsUrlObj = new URL(jsUrl);
    return new URL(mapUrl, jsUrl).href;
  } catch (err) {
    console.log(`  ⚠️  Could not resolve source map URL: ${mapUrl}`);
    return null;
  }
}

/**
 * Download a source map file
 * @param {object} page - Playwright page object
 * @param {string} mapUrl - The source map URL to download
 * @returns {Promise<{url: string, body: Buffer}|null>} - The downloaded content or null
 */
async function downloadSourceMap(page, mapUrl) {
  try {
    const response = await page.context().request.get(mapUrl);
    if (response.ok()) {
      const body = await response.body();
      return { url: mapUrl, body, size: body.length };
    } else {
      console.log(`  ⚠️  Failed to download source map: ${mapUrl} (${response.status()})`);
      return null;
    }
  } catch (err) {
    console.log(`  ⚠️  Error downloading source map: ${mapUrl} - ${err.message}`);
    return null;
  }
}

async function extractViaCDP(targetUrl, outputDir = 'output') {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   V7 CDP EXTRACTOR                     ║');
  console.log('╚════════════════════════════════════════╝\n');

  const timestamp = Date.now();
  const domain = new URL(targetUrl).hostname.replace('www.', '');
  const extractionDir = path.join(outputDir, `${domain}-${timestamp}`);

  // Create directories
  fs.mkdirSync(extractionDir, { recursive: true });
  fs.mkdirSync(path.join(extractionDir, 'resources'), { recursive: true });

  console.log(`📁 Output directory: ${extractionDir}\n`);

  // Connect to running Chrome
  console.log('🔌 Connecting to Chrome on port 9222...\n');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  
  const contexts = browser.contexts();
  console.log(`   Found ${contexts.length} browser contexts\n`);
  
  const context = contexts[0];
  const pages = context.pages();
  console.log(`   Found ${pages.length} open tabs\n`);

  // Find the GoHighLevel tab
  let page = pages.find(p => p.url().includes('gohighlevel.com'));
  
  if (!page) {
    console.log('⚠️  No GoHighLevel tab found, using first tab\n');
    page = pages[0];
  }

  console.log(`📍 Using tab: ${page.url()}\n`);

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

  // Navigate to target URL if not already there
  if (!page.url().includes(targetUrl)) {
    console.log(`🔄 Navigating to: ${targetUrl}\n`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  }

  // Wait for page to settle
  console.log('⏳ Waiting for page to load (30s)...\n');
  await page.waitForTimeout(30000);

  // Check authentication
  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl.includes('signin')) {
    console.log('❌ ERROR: Still on login page\n');
  } else {
    console.log('✅ Authenticated and ready!\n');
  }

  // Capture page state
  console.log('📸 Capturing page state...\n');

  const html = await page.content();
  fs.writeFileSync(path.join(extractionDir, 'index.html'), html);
  console.log('  ✅ Saved index.html');

  await page.screenshot({ 
    path: path.join(extractionDir, 'screenshot.png'),
    fullPage: false 
  });
  console.log('  ✅ Saved screenshot.png\n');

  // Wait for lazy-loaded resources
  console.log('⏳ Waiting for lazy-loaded resources (20s)...\n');
  await page.waitForTimeout(20000);

  // Wait for network to settle
  try {
    await page.waitForLoadState('networkidle', { timeout: 30000 });
  } catch (err) {
    console.log('⚠️  Network still active, continuing...\n');
  }

  // Extract and download source maps from captured JS files
  console.log('🗺️  Scanning for source maps in JS files...\n');
  const sourceMaps = new Map();
  const sourceMapUrls = [];

  for (const [url, resource] of resources) {
    if (url.endsWith('.js') || (resource.contentType && resource.contentType.includes('javascript'))) {
      const mapUrl = extractSourceMapUrl(resource.body);
      if (mapUrl) {
        const resolvedUrl = resolveSourceMapUrl(url, mapUrl);
        if (resolvedUrl && !resources.has(resolvedUrl) && !sourceMaps.has(resolvedUrl)) {
          sourceMapUrls.push({ jsUrl: url, mapUrl: resolvedUrl });
        }
      }
    }
  }

  if (sourceMapUrls.length > 0) {
    console.log(`  Found ${sourceMapUrls.length} source map references, downloading...\n`);

    let downloadedCount = 0;
    for (const { jsUrl, mapUrl } of sourceMapUrls) {
      const mapData = await downloadSourceMap(page, mapUrl);
      if (mapData) {
        sourceMaps.set(mapUrl, {
          url: mapUrl,
          contentType: 'application/json',
          body: mapData.body,
          size: mapData.size,
          sourceJs: jsUrl
        });
        downloadedCount++;

        if (downloadedCount % 10 === 0) {
          console.log(`    ... ${downloadedCount} source maps downloaded`);
        }
      }
    }

    console.log(`  ✅ Downloaded ${downloadedCount} source maps\n`);
  } else {
    console.log('  No external source maps found in JS files\n');
  }

  // Merge source maps into resources
  for (const [url, mapData] of sourceMaps) {
    resources.set(url, mapData);
  }

  // Save resources
  console.log(`💾 Saving ${resources.size} resources (including ${sourceMaps.size} source maps)...\n`);
  
  let savedCount = 0;
  for (const [url, resource] of resources) {
    try {
      const urlObj = new URL(url);
      const filename = path.basename(urlObj.pathname) || 'index.html';
      const filepath = path.join(extractionDir, 'resources', filename);
      
      fs.writeFileSync(filepath, resource.body);
      savedCount++;
      
      if (savedCount % 100 === 0) {
        console.log(`  ... ${savedCount} files saved`);
      }
    } catch (err) {
      // Ignore save errors
    }
  }

  console.log(`\n  ✅ Saved ${savedCount} resource files\n`);
  console.log('✅ Extraction complete!\n');

  // Run analysis
  console.log('════════════════════════════════════════════════════════════');
  console.log('RUNNING V7 ANALYSIS');
  console.log('════════════════════════════════════════════════════════════\n');

  const analyzer = new V7Analyzer(extractionDir);
  const analysis = await analyzer.analyze();
  
  const testGen = new V7TestGenerator(extractionDir);
  await testGen.generate(analysis);
  
  const backendMapper = new V7BackendMapper(extractionDir);
  await backendMapper.map(analysis);

  // Create manifest
  const manifest = {
    url: targetUrl,
    timestamp: new Date().toISOString(),
    resourceCount: resources.size,
    savedCount,
    sourceMapCount: sourceMaps.size,
    resources: Array.from(resources.values()).map(r => ({
      url: r.url,
      contentType: r.contentType,
      size: r.size,
      ...(r.sourceJs && { sourceJs: r.sourceJs })
    })),
    sourceMaps: Array.from(sourceMaps.values()).map(m => ({
      url: m.url,
      size: m.size,
      sourceJs: m.sourceJs
    })),
    failedRequests
  };

  fs.writeFileSync(
    path.join(extractionDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  // Summary
  console.log('════════════════════════════════════════════════════════════');
  console.log('FINAL SUMMARY');
  console.log('════════════════════════════════════════════════════════════\n');
  console.log(`📁 Extraction directory: ${extractionDir}\n`);
  console.log('📊 Features Discovered:');
  console.log(`   - File formats: ${analysis.fileFormats.length}`);
  console.log(`   - Lazy loads: ${analysis.lazyLoads.length}`);
  console.log(`   - API endpoints: ${analysis.apiEndpoints.length}`);
  console.log(`   - Workers: ${analysis.workers.length}`);
  console.log(`   - Iframes: ${analysis.iframes.length}`);
  console.log(`   - Event handlers: ${analysis.eventTypes.length}\n`);

  const backendAnalysis = JSON.parse(fs.readFileSync(path.join(extractionDir, 'v7-backend.json')));
  console.log('📋 Backend Dependencies:');
  console.log(`   - Has backend: ${backendAnalysis.hasBackend ? '✅ YES' : '❌ NO'}`);
  console.log(`   - API endpoints: ${backendAnalysis.apiEndpoints.length}`);
  console.log(`   - WebSockets: ${backendAnalysis.websockets.length}`);
  console.log(`   - Requires auth: ${backendAnalysis.requiresAuth ? '✅ YES' : '❌ NO'}\n`);

  console.log('📄 Generated Files:');
  console.log('   - index.html');
  console.log('   - screenshot.png');
  console.log(`   - resources/ (${savedCount} files)`);
  console.log('   - manifest.json');
  console.log('   - v7-analysis.json');
  console.log('   - BACKEND-BLUEPRINT.md');
  console.log('   - v7-backend.json\n');

  console.log('📊 Statistics:');
  console.log(`   - Resources captured: ${resources.size}`);
  console.log(`   - Source maps downloaded: ${sourceMaps.size}`);
  console.log(`   - Files saved: ${savedCount}`);
  console.log(`   - Failed requests: ${failedRequests.length}\n`);

  console.log('✅ All done!\n');
  console.log('💡 Check BACKEND-BLUEPRINT.md for implementation guide\n');

  // Don't close browser - it's the user's Chrome!
  await browser.close();
}

const url = process.argv[2];
if (!url) {
  console.error('Usage: node v7-cdp-extract.js <url>');
  process.exit(1);
}

extractViaCDP(url).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
