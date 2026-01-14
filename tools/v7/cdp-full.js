#!/usr/bin/env node
import { chromium } from 'playwright';
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
    return new URL(mapUrl, jsUrl).href;
  } catch (err) {
    console.log(`  Warning: Could not resolve source map URL: ${mapUrl}`);
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
      console.log(`  Warning: Failed to download source map: ${mapUrl} (${response.status()})`);
      return null;
    }
  } catch (err) {
    console.log(`  Warning: Error downloading source map: ${mapUrl} - ${err.message}`);
    return null;
  }
}

async function extractViaCDP(targetUrl, outputDir = 'output') {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   V7 CDP FULL EXTRACTOR                ║');
  console.log('╚════════════════════════════════════════╝\n');

  const timestamp = Date.now();
  const domain = new URL(targetUrl).hostname.replace('www.', '');
  const extractionDir = path.join(outputDir, `${domain}-${timestamp}`);

  fs.mkdirSync(extractionDir, { recursive: true });
  fs.mkdirSync(path.join(extractionDir, 'resources'), { recursive: true });

  console.log(`📁 Output directory: ${extractionDir}\n`);
  console.log('🔌 Connecting to Chrome on port 9222...\n');
  
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();

  let page = pages.find(p => p.url().includes('gohighlevel.com'));
  if (!page) page = pages[0];

  console.log(`📍 Found tab: ${page.url()}\n`);

  // Set up network listeners BEFORE reload
  const resources = new Map();
  
  page.on('response', async (response) => {
    const url = response.url();
    const status = response.status();

    if (status === 200 && !url.includes('data:')) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('javascript') || contentType.includes('css') || 
            contentType.includes('html') || url.endsWith('.js') || url.endsWith('.css')) {
          const body = await response.body();
          resources.set(url, { url, contentType, body, size: body.length });
        }
      } catch (err) {}
    }
  });

  // Reload page to capture all resources
  console.log('🔄 Reloading page to capture resources...\n');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  
  console.log('⏳ Waiting for resources (40s)...\n');
  await page.waitForTimeout(40000);

  try {
    await page.waitForLoadState('networkidle', { timeout: 30000 });
  } catch (err) {}

  console.log(`✅ Captured ${resources.size} resources\n`);

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

  // Save HTML and screenshot
  console.log('📸 Saving page state...\n');
  const html = await page.content();
  fs.writeFileSync(path.join(extractionDir, 'index.html'), html);
  await page.screenshot({ path: path.join(extractionDir, 'screenshot.png') });

  // Save resources
  console.log(`💾 Saving ${resources.size} resources (including ${sourceMaps.size} source maps)...\n`);
  let savedCount = 0;
  
  for (const [url, resource] of resources) {
    try {
      const urlObj = new URL(url);
      let filename = path.basename(urlObj.pathname) || 'index.html';
      
      // Handle duplicates
      let filepath = path.join(extractionDir, 'resources', filename);
      let counter = 1;
      while (fs.existsSync(filepath)) {
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        filename = `${base}-${counter}${ext}`;
        filepath = path.join(extractionDir, 'resources', filename);
        counter++;
      }
      
      fs.writeFileSync(filepath, resource.body);
      savedCount++;
      
      if (savedCount % 50 === 0) {
        console.log(`  ... ${savedCount} files saved`);
      }
    } catch (err) {}
  }

  console.log(`\n✅ Saved ${savedCount} resource files\n`);

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
    }))
  };

  fs.writeFileSync(path.join(extractionDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('════════════════════════════════════════════════════════════');
  console.log('EXTRACTION COMPLETE');
  console.log('════════════════════════════════════════════════════════════\n');
  console.log(`📁 Output: ${extractionDir}`);
  console.log(`📊 Captured: ${savedCount} resources`);
  console.log(`🗺️  Source maps: ${sourceMaps.size}\n`);

  await browser.close();
}

const url = process.argv[2] || 'https://app.gohighlevel.com/agency_dashboard';
extractViaCDP(url).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
