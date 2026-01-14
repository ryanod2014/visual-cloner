#!/usr/bin/env node
/**
 * V7 Intelligent Crawler
 * Multi-page extraction with smart zone classification
 *
 * Discovers all pages in a webapp, classifies them (app vs content),
 * and extracts app pages exhaustively while sampling content zones.
 *
 * Usage:
 *   node v7-crawler.js <start-url> <output-dir> [options]
 *   node v7-crawler.js https://app.example.com output/app --max-pages 100
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

export class V7Crawler {
  constructor(config) {
    this.config = {
      startUrl: config.startUrl,
      outputDir: config.outputDir,
      scope: config.scope || 'same-domain',         // 'same-origin' | 'same-domain'
      maxPages: config.maxPages || 200,             // Total pages limit
      maxDepth: config.maxDepth || 4,               // Crawl depth limit
      maxSiblings: config.maxSiblings || 20,        // Sibling threshold for content detection
      sampleSize: config.sampleSize || 5,           // Pages to sample from content zones

      // Pattern-based classification
      contentPatterns: config.contentPatterns || [
        /\/blog\//i,
        /\/post\//i,
        /\/article\//i,
        /\/news\//i,
        /\/help\//i,
        /\/docs?\//i,
        /\/tutorial\//i,
        /\/guide\//i,
        /\/\d{4}\/\d{2}\/\d{2}\//,  // Date URLs (2024/01/12)
        /\/category\//i,
        /\/tag\//i,
      ],

      appPatterns: config.appPatterns || [
        /\/dashboard/i,
        /\/settings/i,
        /\/admin/i,
        /\/account/i,
        /\/profile/i,
        /\/workspace/i,
        /\/project/i,
      ],

      excludePatterns: config.excludePatterns || [
        /\.(pdf|zip|tar|gz|jpg|jpeg|png|gif|svg|ico|mp4|mp3)$/i,
        /\/api\//,
        /logout/i,
        /signout/i,
      ],
    };

    this.visited = new Set();
    this.discovered = new Map();  // url -> { depth, links, children }
    this.zones = { app: [], content: [] };
    this.sharedResources = new Map();
    this.pages = [];

    this.browser = null;
    this.context = null;
  }

  /**
   * Main crawler entry point
   */
  async crawl() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║   V7 INTELLIGENT CRAWLER               ║');
    console.log('║   Multi-Page Smart Extraction          ║');
    console.log('╚════════════════════════════════════════╝\n');

    console.log('Configuration:');
    console.log(`  Start URL:     ${this.config.startUrl}`);
    console.log(`  Scope:         ${this.config.scope}`);
    console.log(`  Max pages:     ${this.config.maxPages}`);
    console.log(`  Max depth:     ${this.config.maxDepth}`);
    console.log(`  Output:        ${this.config.outputDir}\n`);

    try {
      // Initialize browser
      await this.init();

      // Phase 1: Discover site structure
      await this.phase1_Discover();

      // Phase 2: Classify zones
      await this.phase2_Classify();

      // Phase 3: Extract pages
      await this.phase3_Extract();

      // Phase 4: Save results
      await this.phase4_Save();

      return {
        success: true,
        pagesExtracted: this.pages.length,
        resourcesDeduped: this.sharedResources.size,
      };

    } catch (err) {
      console.error('\n❌ Crawler error:', err.message);
      console.error(err.stack);
      throw err;
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }

  /**
   * Initialize browser
   */
  async init() {
    console.log('🌐 Launching browser...\n');
    this.browser = await chromium.launch({ headless: false });
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });
  }

  /**
   * Phase 1: Discover site structure (breadth-first)
   */
  async phase1_Discover() {
    console.log('═'.repeat(70));
    console.log('PHASE 1: SITE DISCOVERY');
    console.log('═'.repeat(70) + '\n');

    const queue = [{ url: this.config.startUrl, depth: 0 }];
    let discoveredCount = 0;

    while (queue.length > 0 && discoveredCount < this.config.maxPages) {
      const { url, depth } = queue.shift();

      if (this.visited.has(url) || depth > this.config.maxDepth) {
        continue;
      }

      this.visited.add(url);
      discoveredCount++;

      console.log(`[${discoveredCount}/${this.config.maxPages}] Discovering: ${this.shortenUrl(url)} (depth ${depth})`);

      // Discover links from this page
      const links = await this.discoverLinks(url);

      this.discovered.set(url, {
        url,
        depth,
        links,
        children: links.filter(link => !this.visited.has(link))
      });

      // Add unvisited in-scope links to queue
      if (depth < this.config.maxDepth) {
        for (const link of links) {
          if (!this.visited.has(link) && this.isInScope(link)) {
            queue.push({ url: link, depth: depth + 1 });
          }
        }
      }
    }

    console.log(`\n✅ Discovered ${this.discovered.size} pages\n`);
  }

  /**
   * Phase 2: Classify pages into zones (app vs content)
   */
  async phase2_Classify() {
    console.log('═'.repeat(70));
    console.log('PHASE 2: ZONE CLASSIFICATION');
    console.log('═'.repeat(70) + '\n');

    // Group pages by parent path
    const pathGroups = new Map();

    for (const [url, info] of this.discovered) {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const parentPath = segments.length > 0 ? `/${segments.slice(0, -1).join('/')}` : '/';

      if (!pathGroups.has(parentPath)) {
        pathGroups.set(parentPath, []);
      }
      pathGroups.get(parentPath).push({ url, info });
    }

    // Classify each group
    for (const [parentPath, pages] of pathGroups) {
      const classification = this.classifyZone(parentPath, pages);

      if (classification.isContent) {
        this.zones.content.push({
          path: parentPath,
          urls: pages.map(p => p.url),
          pageCount: pages.length,
          reason: classification.reason
        });
      } else {
        this.zones.app.push({
          path: parentPath,
          urls: pages.map(p => p.url),
          pageCount: pages.length
        });
      }
    }

    // Print classification results
    console.log('✅ APP ZONES (will crawl exhaustively):');
    let appPageCount = 0;
    for (const zone of this.zones.app) {
      console.log(`  ${zone.path} (${zone.pageCount} pages)`);
      appPageCount += zone.pageCount;
    }
    console.log(`  Total: ${appPageCount} pages\n`);

    console.log('⚠️  CONTENT ZONES (will sample):');
    let contentPageCount = 0;
    for (const zone of this.zones.content) {
      console.log(`  ${zone.path} (${zone.pageCount} pages) - ${zone.reason}`);
      console.log(`    → Will sample ${Math.min(this.config.sampleSize, zone.pageCount)} pages`);
      contentPageCount += zone.pageCount;
    }
    console.log(`  Total: ${contentPageCount} pages (${this.zones.content.length} zones)\n`);
  }

  /**
   * Phase 3: Extract pages
   */
  async phase3_Extract() {
    console.log('═'.repeat(70));
    console.log('PHASE 3: PAGE EXTRACTION');
    console.log('═'.repeat(70) + '\n');

    let extractedCount = 0;

    // Extract app pages exhaustively
    console.log('📱 Extracting app pages...\n');
    for (const zone of this.zones.app) {
      for (const url of zone.urls) {
        extractedCount++;
        console.log(`[${extractedCount}] Extracting: ${this.shortenUrl(url)}`);
        await this.extractPage(url, 'app');
      }
    }

    // Sample content zones
    console.log('\n📄 Sampling content zones...\n');
    for (const zone of this.zones.content) {
      const samples = this.selectSamples(zone.urls, this.config.sampleSize);
      console.log(`Sampling ${samples.length}/${zone.urls.length} from ${zone.path}`);

      for (const url of samples) {
        extractedCount++;
        console.log(`[${extractedCount}] Extracting: ${this.shortenUrl(url)}`);
        await this.extractPage(url, 'content');
      }
    }

    console.log(`\n✅ Extracted ${this.pages.length} pages\n`);
  }

  /**
   * Phase 4: Save results
   */
  async phase4_Save() {
    console.log('═'.repeat(70));
    console.log('PHASE 4: SAVING RESULTS');
    console.log('═'.repeat(70) + '\n');

    const outputDir = this.config.outputDir;
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(path.join(outputDir, 'pages'), { recursive: true });
    fs.mkdirSync(path.join(outputDir, 'resources'), { recursive: true });

    // Save pages
    console.log('💾 Saving pages...');
    for (const page of this.pages) {
      const filename = this.urlToFilename(page.url);

      // Save HTML
      fs.writeFileSync(
        path.join(outputDir, 'pages', `${filename}.html`),
        page.html
      );

      // Save screenshot
      if (page.screenshot) {
        fs.writeFileSync(
          path.join(outputDir, 'pages', `${filename}.png`),
          page.screenshot
        );
      }
    }
    console.log(`  ✅ Saved ${this.pages.length} pages\n`);

    // Save shared resources
    console.log('💾 Saving resources...');
    let savedResources = 0;
    for (const [url, resource] of this.sharedResources) {
      try {
        const filename = this.resourceToFilename(url);
        const filepath = path.join(outputDir, 'resources', filename);

        // Create subdirectory if needed
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filepath, resource.body);
        savedResources++;
      } catch (err) {
        console.log(`  ⚠️  Failed to save resource: ${url}`);
      }
    }
    console.log(`  ✅ Saved ${savedResources} resources\n`);

    // Save manifest
    const manifest = {
      timestamp: new Date().toISOString(),
      config: this.config,
      discovery: {
        totalDiscovered: this.discovered.size,
        totalExtracted: this.pages.length,
        zones: {
          app: this.zones.app.map(z => ({
            path: z.path,
            pageCount: z.pageCount
          })),
          content: this.zones.content.map(z => ({
            path: z.path,
            pageCount: z.pageCount,
            sampled: Math.min(this.config.sampleSize, z.pageCount),
            reason: z.reason
          }))
        }
      },
      pages: this.pages.map(p => ({
        url: p.url,
        type: p.type,
        filename: this.urlToFilename(p.url)
      })),
      resources: {
        total: this.sharedResources.size,
        deduplicated: true
      }
    };

    fs.writeFileSync(
      path.join(outputDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    // Save sitemap
    const sitemap = {
      app: this.zones.app,
      content: this.zones.content,
      discovered: Array.from(this.discovered.keys())
    };

    fs.writeFileSync(
      path.join(outputDir, 'sitemap.json'),
      JSON.stringify(sitemap, null, 2)
    );

    console.log('💾 Saving reports...');
    console.log(`  ✅ manifest.json`);
    console.log(`  ✅ sitemap.json\n`);

    console.log('═'.repeat(70));
    console.log('EXTRACTION COMPLETE');
    console.log('═'.repeat(70) + '\n');

    console.log('📊 Summary:');
    console.log(`  Discovered:      ${this.discovered.size} URLs`);
    console.log(`  Extracted:       ${this.pages.length} pages`);
    console.log(`  Resources:       ${this.sharedResources.size} (deduplicated)`);
    console.log(`  Output:          ${outputDir}\n`);

    console.log('📁 Output structure:');
    console.log(`  ${outputDir}/`);
    console.log(`  ├── pages/           # ${this.pages.length} HTML pages + screenshots`);
    console.log(`  ├── resources/       # ${this.sharedResources.size} shared resources`);
    console.log(`  ├── manifest.json    # Extraction manifest`);
    console.log(`  └── sitemap.json     # Site structure\n`);
  }

  /**
   * Extract a single page
   */
  async extractPage(url, type) {
    const page = await this.context.newPage();

    try {
      // Setup resource monitoring
      page.on('response', async (response) => {
        const resUrl = response.url();
        const status = response.status();

        if (status === 200 && !resUrl.includes('data:')) {
          try {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('javascript') || contentType.includes('css') ||
                contentType.includes('wasm') || resUrl.match(/\.(js|css|wasm)$/)) {

              if (!this.sharedResources.has(resUrl)) {
                const body = await response.body();
                this.sharedResources.set(resUrl, {
                  url: resUrl,
                  contentType,
                  body,
                  size: body.length
                });
              }
            }
          } catch (err) {
            // Ignore response body errors
          }
        }
      });

      // Navigate to page
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);  // Let JS execute

      // Capture page
      const html = await page.content();
      const screenshot = await page.screenshot({ fullPage: false });

      this.pages.push({
        url,
        type,
        html,
        screenshot,
        timestamp: new Date().toISOString()
      });

    } catch (err) {
      console.log(`  ⚠️  Error extracting ${url}: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  /**
   * Discover links from a URL
   */
  async discoverLinks(url) {
    const page = await this.context.newPage();
    const links = new Set();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1000);

      // Extract all <a href> links
      const hrefs = await page.$$eval('a[href]', anchors =>
        anchors
          .map(a => a.href)
          .filter(href => href && !href.startsWith('javascript:') && !href.startsWith('mailto:'))
      );

      for (const href of hrefs) {
        const normalized = this.normalizeUrl(href);
        if (normalized && this.isInScope(normalized) && !this.isExcluded(normalized)) {
          links.add(normalized);
        }
      }

    } catch (err) {
      console.log(`  ⚠️  Error discovering links from ${url}: ${err.message}`);
    } finally {
      await page.close();
    }

    return Array.from(links);
  }

  /**
   * Classify a zone as app or content
   */
  classifyZone(parentPath, pages) {
    const urls = pages.map(p => p.url);

    // HEURISTIC 1: Too many siblings = content zone
    if (urls.length > this.config.maxSiblings) {
      return { isContent: true, reason: `Too many siblings (${urls.length})` };
    }

    // HEURISTIC 2: Content patterns
    for (const pattern of this.config.contentPatterns) {
      if (pattern.test(parentPath)) {
        return { isContent: true, reason: `Matches content pattern: ${pattern}` };
      }
    }

    // HEURISTIC 3: App patterns (force app)
    for (const pattern of this.config.appPatterns) {
      if (pattern.test(parentPath)) {
        return { isContent: false };
      }
    }

    // HEURISTIC 4: URL slugs with many hyphens = blog posts
    const avgHyphens = urls.reduce((sum, url) => {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const lastSegment = segments[segments.length - 1] || '';
      return sum + (lastSegment.split('-').length - 1);
    }, 0) / urls.length;

    if (avgHyphens > 3) {
      return { isContent: true, reason: `Long slugs (avg ${avgHyphens.toFixed(1)} hyphens)` };
    }

    // HEURISTIC 5: Deep nesting = content
    const avgDepth = urls.reduce((sum, url) => {
      const parsed = new URL(url);
      return sum + parsed.pathname.split('/').filter(Boolean).length;
    }, 0) / urls.length;

    if (avgDepth > 4) {
      return { isContent: true, reason: `Deep nesting (avg depth ${avgDepth.toFixed(1)})` };
    }

    // Default to app
    return { isContent: false };
  }

  /**
   * Select representative samples from a list of URLs
   */
  selectSamples(urls, count) {
    if (urls.length <= count) {
      return urls;
    }

    const samples = [
      urls[0],                                    // First
      urls[Math.floor(urls.length / 2)],         // Middle
      urls[urls.length - 1],                     // Last
    ];

    // Add random samples
    const remaining = urls.filter(url => !samples.includes(url));
    while (samples.length < count && remaining.length > 0) {
      const idx = Math.floor(Math.random() * remaining.length);
      samples.push(remaining.splice(idx, 1)[0]);
    }

    return samples.slice(0, count);
  }

  /**
   * Check if URL is in scope
   */
  isInScope(url) {
    try {
      const start = new URL(this.config.startUrl);
      const target = new URL(url);

      if (this.config.scope === 'same-origin') {
        // Exact origin match
        return start.origin === target.origin;
      } else if (this.config.scope === 'same-domain') {
        // Allow subdomains
        const startDomain = this.getBaseDomain(start.hostname);
        const targetDomain = this.getBaseDomain(target.hostname);
        return startDomain === targetDomain;
      }

      return false;
    } catch (err) {
      return false;
    }
  }

  /**
   * Check if URL matches exclude patterns
   */
  isExcluded(url) {
    for (const pattern of this.config.excludePatterns) {
      if (pattern.test(url)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get base domain (example.com from app.example.com)
   */
  getBaseDomain(hostname) {
    const parts = hostname.split('.');
    return parts.slice(-2).join('.');
  }

  /**
   * Normalize URL (remove hash, trailing slash, sort params)
   */
  normalizeUrl(url) {
    try {
      const parsed = new URL(url);

      // Remove hash
      parsed.hash = '';

      // Remove trailing slash
      parsed.pathname = parsed.pathname.replace(/\/$/, '') || '/';

      // Sort query params
      parsed.searchParams.sort();

      return parsed.href;
    } catch (err) {
      return null;
    }
  }

  /**
   * Convert URL to safe filename
   */
  urlToFilename(url) {
    const parsed = new URL(url);
    let filename = parsed.pathname
      .replace(/^\//, '')
      .replace(/\//g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '-');

    if (!filename || filename === '') {
      filename = 'index';
    }

    return filename;
  }

  /**
   * Convert resource URL to filename
   */
  resourceToFilename(url) {
    const parsed = new URL(url);
    const pathname = parsed.pathname;

    // Keep directory structure for organization
    let filename = pathname.replace(/^\//, '');

    // Handle duplicates
    if (!filename) {
      filename = 'resource-' + Date.now();
    }

    return filename;
  }

  /**
   * Shorten URL for display
   */
  shortenUrl(url) {
    const parsed = new URL(url);
    let short = parsed.pathname;
    if (parsed.search) {
      short += '?...';
    }
    if (short.length > 60) {
      short = short.substring(0, 57) + '...';
    }
    return short;
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const startUrl = process.argv[2];
  const outputDir = process.argv[3];

  if (!startUrl || !outputDir) {
    console.error('Usage: node v7-crawler.js <start-url> <output-dir> [options]');
    console.error('');
    console.error('Example:');
    console.error('  node v7-crawler.js https://app.example.com output/app');
    console.error('  node v7-crawler.js https://example.com output/site --max-pages 100');
    process.exit(1);
  }

  // Parse options
  const args = process.argv.slice(4);
  const config = { startUrl, outputDir };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];

    if (key === 'max-pages') config.maxPages = parseInt(value);
    if (key === 'max-depth') config.maxDepth = parseInt(value);
    if (key === 'sample-size') config.sampleSize = parseInt(value);
    if (key === 'scope') config.scope = value;
  }

  const crawler = new V7Crawler(config);

  try {
    await crawler.crawl();
    console.log('✅ Crawl complete!\n');
  } catch (err) {
    console.error('❌ Crawl failed:', err.message);
    process.exit(1);
  }
}
