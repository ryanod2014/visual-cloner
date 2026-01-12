#!/usr/bin/env node
/**
 * V7 Unified Extractor
 * Single command for both single-page and multi-page extraction
 *
 * Usage:
 *   node v7-extract.js <url> <output-dir>              # Single page (SPA)
 *   node v7-extract.js <url> <output-dir> --crawl      # Multi-page (auto-discover)
 *
 * Examples:
 *   # Single-page app (most webapps)
 *   node v7-extract.js https://app.example.com output/app
 *
 *   # Multi-page site (marketing + blog)
 *   node v7-extract.js https://example.com output/site --crawl
 *
 * Flags:
 *   --crawl              Enable crawler mode (auto-discovers all pages)
 *   --max-pages <num>    Maximum pages to crawl (default: 200)
 *   --max-depth <num>    Maximum crawl depth (default: 4)
 *   --sample-size <num>  Content zone sample size (default: 5)
 */

import { V7Crawler } from './v7-crawler.js';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function extractSinglePage(url, outputDir) {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   V7 EXTRACTOR - SINGLE PAGE MODE     ║');
  console.log('╚════════════════════════════════════════╝\n');

  console.log('Configuration:');
  console.log(`  URL:     ${url}`);
  console.log(`  Output:  ${outputDir}`);
  console.log(`  Mode:    Single-page extraction\n`);

  const timestamp = Date.now();
  const domain = new URL(url).hostname.replace('www.', '');
  const extractionDir = path.join(outputDir, `${domain}-${timestamp}`);

  fs.mkdirSync(extractionDir, { recursive: true });
  fs.mkdirSync(path.join(extractionDir, 'resources'), { recursive: true });

  console.log(`📁 Output directory: ${extractionDir}\n`);
  console.log('🌐 Launching browser...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Set up resource capture
  const resources = new Map();

  page.on('response', async (response) => {
    const resUrl = response.url();
    const status = response.status();

    if (status === 200 && !resUrl.includes('data:')) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('javascript') || contentType.includes('css') ||
            contentType.includes('wasm') || resUrl.match(/\.(js|css|wasm)$/)) {
          const body = await response.body();
          resources.set(resUrl, { url: resUrl, contentType, body, size: body.length });
        }
      } catch (err) {}
    }
  });

  // Navigate and extract
  console.log('📄 Loading page...\n');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);  // Let everything load

  try {
    await page.waitForLoadState('networkidle', { timeout: 30000 });
  } catch (err) {}

  console.log(`✅ Captured ${resources.size} resources\n`);

  // Save HTML and screenshot
  console.log('💾 Saving page...\n');
  const html = await page.content();
  fs.writeFileSync(path.join(extractionDir, 'index.html'), html);
  await page.screenshot({ path: path.join(extractionDir, 'screenshot.png'), fullPage: false });

  // Save resources
  console.log(`💾 Saving ${resources.size} resources...\n`);
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
    url: url,
    timestamp: new Date().toISOString(),
    mode: 'single-page',
    resourceCount: resources.size,
    savedCount,
    resources: Array.from(resources.values()).map(r => ({
      url: r.url,
      contentType: r.contentType,
      size: r.size
    }))
  };

  fs.writeFileSync(path.join(extractionDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  await browser.close();

  console.log('════════════════════════════════════════════════════════════');
  console.log('EXTRACTION COMPLETE');
  console.log('════════════════════════════════════════════════════════════\n');
  console.log(`📁 Output: ${extractionDir}`);
  console.log(`📊 Captured: ${savedCount} resources`);
  console.log(`\n💡 TIP: This was a single-page extraction.`);
  console.log(`   If this site has multiple pages (marketing site, blog, docs),`);
  console.log(`   use --crawl to discover and extract all pages:\n`);
  console.log(`   node tools/v7-extract.js ${url} ${outputDir} --crawl\n`);

  return extractionDir;
}

async function main() {
  const url = process.argv[2];
  const outputDir = process.argv[3];
  const args = process.argv.slice(4);

  if (!url || !outputDir) {
    console.error('Usage: node v7-extract.js <url> <output-dir> [options]');
    console.error('');
    console.error('Examples:');
    console.error('  # Single-page app (most webapps - DEFAULT)');
    console.error('  node v7-extract.js https://app.example.com output/app');
    console.error('');
    console.error('  # Multi-page site (auto-discovers all pages)');
    console.error('  node v7-extract.js https://example.com output/site --crawl');
    console.error('');
    console.error('Options:');
    console.error('  --crawl              Enable multi-page crawler');
    console.error('  --max-pages <num>    Max pages to crawl (default: 200)');
    console.error('  --max-depth <num>    Max crawl depth (default: 4)');
    console.error('  --sample-size <num>  Content sample size (default: 5)');
    console.error('');
    console.error('When to use --crawl:');
    console.error('  ✅ Marketing site with blog (example.com/blog)');
    console.error('  ✅ Documentation site (docs.example.com)');
    console.error('  ✅ Multi-page traditional site');
    console.error('  ❌ Single-page app (React/Vue/Angular)');
    console.error('  ❌ Dashboard/admin panel (client-side routing)');
    console.error('');
    process.exit(1);
  }

  // Check for --crawl flag
  const crawlMode = args.includes('--crawl');

  if (crawlMode) {
    // Multi-page crawler mode
    const config = { startUrl: url, outputDir };

    // Parse additional options
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--max-pages') config.maxPages = parseInt(args[i + 1]);
      if (args[i] === '--max-depth') config.maxDepth = parseInt(args[i + 1]);
      if (args[i] === '--sample-size') config.sampleSize = parseInt(args[i + 1]);
    }

    const crawler = new V7Crawler(config);
    await crawler.crawl();

  } else {
    // Single-page extraction mode
    await extractSinglePage(url, outputDir);
  }
}

main().catch(err => {
  console.error('❌ Extraction failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
