#!/usr/bin/env node
/**
 * Safe Extraction Monitor
 * Shows all network requests so you can verify no write operations
 */

import { chromium } from 'playwright';

async function safeMonitor(url) {
  console.log('🔍 SAFE EXTRACTION MONITOR\n');
  console.log('This will:');
  console.log('✅ Load the page');
  console.log('✅ Monitor all network requests');
  console.log('✅ Show you exactly what requests are made');
  console.log('❌ NOT click anything');
  console.log('❌ NOT submit any forms\n');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Track all requests
  const requests = {
    safe: [],      // GET requests
    potentially_unsafe: []  // POST, PUT, DELETE, PATCH
  };

  page.on('request', request => {
    const method = request.method();
    const url = request.url();

    if (method === 'GET' || method === 'HEAD') {
      requests.safe.push({ method, url });
      console.log(`✅ ${method} ${url}`);
    } else {
      requests.potentially_unsafe.push({ method, url });
      console.log(`⚠️  ${method} ${url}`);
    }
  });

  // Load page
  console.log(`\nLoading ${url}...\n`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  // Wait a bit to see any delayed requests
  console.log('\nWaiting 10 seconds to capture any delayed requests...\n');
  await page.waitForTimeout(10000);

  await browser.close();

  // Report
  console.log('\n' + '='.repeat(60));
  console.log('SAFETY REPORT');
  console.log('='.repeat(60));
  console.log(`\n✅ Safe requests (GET): ${requests.safe.length}`);
  console.log(`⚠️  Potentially unsafe requests (POST/PUT/DELETE): ${requests.potentially_unsafe.length}\n`);

  if (requests.potentially_unsafe.length > 0) {
    console.log('⚠️  WRITE OPERATIONS DETECTED:');
    requests.potentially_unsafe.forEach(req => {
      console.log(`   ${req.method} ${req.url}`);
    });
    console.log('\nThese requests modified or could modify data.');
    console.log('Review them to understand what changed.\n');
  } else {
    console.log('✅ NO WRITE OPERATIONS - Page load was read-only!\n');
  }

  return requests;
}

// CLI
const url = process.argv[2];
if (!url) {
  console.log('Usage: node safe-extract.js <url>');
  process.exit(1);
}

await safeMonitor(url);
