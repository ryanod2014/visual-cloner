#!/usr/bin/env node
/**
 * V7 Chunk Discovery
 * Discovers lazy-loaded chunks through manifest parsing and brute force
 *
 * Two-phase discovery:
 * 1. Manifest parsing - Extract chunk URLs from webpack manifests, dynamic imports
 * 2. Brute force - Try common chunk patterns (0.js through 500.js)
 */

import fs from 'fs';
import path from 'path';

/**
 * Extract chunk URLs from JavaScript content
 * @param {string} content - JavaScript file content
 * @param {string} origin - Base origin URL (e.g., https://example.com)
 * @param {string} basePath - Base path for relative URLs (e.g., /js/)
 * @returns {Set<string>} - Set of discovered chunk URLs
 */
export function extractChunkUrls(content, origin, basePath = '/') {
  const urls = new Set();

  // Pattern 1: Webpack chunk manifest {0:"abc123",1:"def456"}
  const webpackManifests = content.match(/\{(?:\d+:"[a-f0-9A-Z_-]+",?\s*)+\}/g) || [];
  for (const manifest of webpackManifests) {
    const matches = manifest.matchAll(/(\d+):"([a-f0-9A-Z_-]+)"/g);
    for (const [, id, hash] of matches) {
      // Try multiple patterns
      urls.add(`${origin}${basePath}${id}.${hash}.js`);
      urls.add(`${origin}${basePath}${hash}.js`);
      urls.add(`${origin}${basePath}${id}.js`);
      urls.add(`${origin}${basePath}chunk-${id}.${hash}.js`);
    }
  }

  // Pattern 2: Vite/Rollup chunk patterns {id: "hash"}
  const viteManifests = content.match(/\{(?:["']\w+["']:\s*["'][a-f0-9A-Z_-]+["'],?\s*)+\}/g) || [];
  for (const manifest of viteManifests) {
    const matches = manifest.matchAll(/["'](\w+)["']:\s*["']([a-f0-9A-Z_-]+)["']/g);
    for (const [, name, hash] of matches) {
      if (name.length < 30 && hash.length < 30) {
        urls.add(`${origin}${basePath}${name}.${hash}.js`);
        urls.add(`${origin}${basePath}${name}-${hash}.js`);
      }
    }
  }

  // Pattern 3: Dynamic imports - import('./chunk.js')
  const dynamicImports = content.matchAll(/import\s*\(\s*["']([^"']+\.js)["']\s*\)/g);
  for (const [, importPath] of dynamicImports) {
    if (importPath.startsWith('http')) {
      urls.add(importPath);
    } else if (importPath.startsWith('/')) {
      urls.add(`${origin}${importPath}`);
    } else if (!importPath.includes(' ') && importPath.length < 100) {
      urls.add(`${origin}${basePath}${importPath}`);
    }
  }

  // Pattern 4: Quoted JS filenames that look like chunks
  const quotedChunks = content.matchAll(/["']([^"']*?(?:\d+|chunk|vendor|async|lazy|common)[^"']*?\.js)["']/gi);
  for (const [, chunkPath] of quotedChunks) {
    if (chunkPath.startsWith('http')) {
      urls.add(chunkPath);
    } else if (chunkPath.startsWith('/')) {
      urls.add(`${origin}${chunkPath}`);
    } else if (!chunkPath.includes(' ') && chunkPath.length < 100 && !chunkPath.includes('://')) {
      urls.add(`${origin}${basePath}${chunkPath}`);
    }
  }

  // Pattern 5: WASM files
  const wasmFiles = content.matchAll(/["']([^"']+\.wasm)["']/gi);
  for (const [, wasmPath] of wasmFiles) {
    if (wasmPath.startsWith('http')) {
      urls.add(wasmPath);
    } else if (wasmPath.startsWith('/')) {
      urls.add(`${origin}${wasmPath}`);
    } else {
      urls.add(`${origin}${basePath}${wasmPath}`);
      urls.add(`${origin}/${wasmPath}`);
    }
  }

  // Pattern 6: CSS chunks
  const cssChunks = content.matchAll(/["']([^"']+\.css)["']/gi);
  for (const [, cssPath] of cssChunks) {
    if (cssPath.startsWith('http')) {
      urls.add(cssPath);
    } else if (cssPath.startsWith('/')) {
      urls.add(`${origin}${cssPath}`);
    } else if (!cssPath.includes(' ') && cssPath.length < 100) {
      urls.add(`${origin}${basePath}${cssPath}`);
    }
  }

  // Pattern 7: Worker files
  const workerFiles = content.matchAll(/new\s+Worker\s*\(\s*["']([^"']+)["']/gi);
  for (const [, workerPath] of workerFiles) {
    if (workerPath.startsWith('http')) {
      urls.add(workerPath);
    } else if (workerPath.startsWith('/')) {
      urls.add(`${origin}${workerPath}`);
    } else {
      urls.add(`${origin}${basePath}${workerPath}`);
    }
  }

  return urls;
}

/**
 * Generate brute force chunk URLs
 * @param {string} origin - Base origin URL
 * @param {number} maxChunk - Maximum chunk number to try (default 500)
 * @returns {Set<string>} - Set of URLs to try
 */
export function generateBruteForceUrls(origin, maxChunk = 500) {
  const urls = new Set();

  const basePaths = [
    '/',
    '/js/',
    '/code/',
    '/assets/',
    '/chunks/',
    '/dist/',
    '/static/',
    '/build/',
    '/bundle/',
    '/lib/',
    '/cache/',
  ];

  const patterns = [
    i => `${i}.js`,
    i => `chunk-${i}.js`,
    i => `${i}.chunk.js`,
    i => `vendor-${i}.js`,
    i => `main-${i}.js`,
    i => `async-${i}.js`,
    i => `common-${i}.js`,
    i => `shared-${i}.js`,
    i => `lazy-${i}.js`,
    i => `${i}.bundle.js`,
  ];

  for (const basePath of basePaths) {
    for (let i = 0; i <= maxChunk; i++) {
      for (const pattern of patterns) {
        urls.add(`${origin}${basePath}${pattern(i)}`);
      }
    }
  }

  return urls;
}

/**
 * Fetch chunks in batches, tracking successes and failures
 * @param {Object} page - Playwright page object
 * @param {Set<string>} urls - URLs to fetch
 * @param {Set<string>} alreadyCaptured - URLs already captured
 * @param {number} batchSize - Parallel fetch batch size
 * @param {Function} onProgress - Progress callback
 * @returns {Map<string, Object>} - Map of URL -> {contentType, body}
 */
export async function fetchChunks(page, urls, alreadyCaptured = new Set(), batchSize = 30, onProgress = null) {
  const results = new Map();
  const toFetch = [...urls].filter(url => !alreadyCaptured.has(url));

  let fetched = 0;
  let found = 0;

  for (let i = 0; i < toFetch.length; i += batchSize) {
    const batch = toFetch.slice(i, i + batchSize);

    const batchResults = await Promise.all(batch.map(async (url) => {
      try {
        const response = await page.evaluate(async (u) => {
          try {
            const res = await fetch(u, { method: 'GET', cache: 'no-store' });
            if (!res.ok) return null;

            const contentType = res.headers.get('content-type') || '';
            const buffer = await res.arrayBuffer();

            return {
              contentType,
              data: Array.from(new Uint8Array(buffer)),
              size: buffer.byteLength,
            };
          } catch (e) {
            return null;
          }
        }, url);

        if (response) {
          return {
            url,
            contentType: response.contentType,
            body: Buffer.from(response.data),
            size: response.size,
          };
        }
      } catch (e) {
        // Silently ignore network errors
      }
      return null;
    }));

    for (const result of batchResults) {
      if (result) {
        results.set(result.url, result);
        found++;
      }
    }

    fetched += batch.length;

    if (onProgress) {
      onProgress({
        fetched,
        total: toFetch.length,
        found,
      });
    }
  }

  return results;
}

/**
 * Discover all chunks for a page
 * @param {Object} page - Playwright page object
 * @param {string} origin - Base origin URL
 * @param {Map<string, Object>} capturedResources - Already captured resources
 * @param {Object} options
 * @returns {Map<string, Object>} - Newly discovered chunks
 */
export async function discoverChunks(page, origin, capturedResources, options = {}) {
  const {
    bruteForce = true,
    maxBruteForce = 500,
    batchSize = 30,
    onProgress = null,
  } = options;

  console.log('[chunk-discovery] Phase 1: Manifest parsing...');

  // Phase 1: Extract from captured JS files
  const manifestUrls = new Set();

  for (const [url, resource] of capturedResources) {
    if (resource.contentType?.includes('javascript')) {
      try {
        const content = resource.body.toString('utf-8');
        const scriptUrl = new URL(url);
        const basePath = scriptUrl.pathname.substring(0, scriptUrl.pathname.lastIndexOf('/') + 1) || '/';

        const extracted = extractChunkUrls(content, origin, basePath);
        for (const u of extracted) {
          manifestUrls.add(u);
        }
      } catch (e) {
        // Skip invalid content
      }
    }
  }

  console.log(`[chunk-discovery] Found ${manifestUrls.size} URLs from manifests`);

  // Fetch manifest-discovered chunks
  const alreadyCaptured = new Set(capturedResources.keys());
  let results = await fetchChunks(page, manifestUrls, alreadyCaptured, batchSize, (p) => {
    if (p.fetched % 100 === 0 || p.fetched === p.total) {
      console.log(`[chunk-discovery] Manifest: ${p.fetched}/${p.total} tried, ${p.found} found`);
    }
  });

  console.log(`[chunk-discovery] Manifest phase: ${results.size} new chunks`);

  // Phase 2: Brute force (if enabled)
  if (bruteForce) {
    console.log(`[chunk-discovery] Phase 2: Brute force (0-${maxBruteForce})...`);

    const bruteUrls = generateBruteForceUrls(origin, maxBruteForce);

    // Add manifest results to already captured
    for (const url of results.keys()) {
      alreadyCaptured.add(url);
    }

    const bruteResults = await fetchChunks(page, bruteUrls, alreadyCaptured, batchSize, (p) => {
      if (p.fetched % 500 === 0 || p.fetched === p.total) {
        console.log(`[chunk-discovery] Brute force: ${p.fetched}/${p.total} tried, ${p.found} found`);
      }
    });

    console.log(`[chunk-discovery] Brute force phase: ${bruteResults.size} new chunks`);

    // Merge results
    for (const [url, resource] of bruteResults) {
      results.set(url, resource);
    }
  }

  console.log(`[chunk-discovery] Total discovered: ${results.size} chunks`);

  return results;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Chunk Discovery Module');
  console.log('');
  console.log('This module is designed to be imported and used within the V7 extractor.');
  console.log('');
  console.log('Exported functions:');
  console.log('  - extractChunkUrls(content, origin, basePath)');
  console.log('  - generateBruteForceUrls(origin, maxChunk)');
  console.log('  - fetchChunks(page, urls, alreadyCaptured, batchSize, onProgress)');
  console.log('  - discoverChunks(page, origin, capturedResources, options)');
}
