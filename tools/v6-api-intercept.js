#!/usr/bin/env node
/**
 * V6 API INTERCEPT - Capture dangerous API calls WITHOUT executing them
 *
 * For actions like "Delete Account", "Cancel Subscription", etc:
 * 1. Intercept ALL API requests
 * 2. Block destructive ones (DELETE, dangerous POST)
 * 3. Log what WOULD have been sent
 * 4. Still capture the client-side code
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const allResources = new Map();
const blockedRequests = [];
const capturedApiCalls = [];

// Dangerous patterns to block
const dangerousPatterns = [
  // Account destruction
  /delete.*account/i,
  /remove.*account/i,
  /close.*account/i,
  /deactivate/i,
  /terminate/i,

  // Subscription/billing
  /cancel.*subscription/i,
  /delete.*payment/i,
  /remove.*card/i,

  // Data destruction
  /delete.*all/i,
  /clear.*all/i,
  /purge/i,
  /wipe/i,
  /erase/i,

  // Irreversible actions
  /permanently/i,
  /irreversible/i,
];

// Methods that can be destructive
const dangerousMethods = ['DELETE', 'POST', 'PUT', 'PATCH'];

function isDangerous(url, method, postData) {
  // DELETE method is always potentially dangerous
  if (method === 'DELETE') return true;

  // Check URL patterns
  if (dangerousPatterns.some(p => p.test(url))) return true;

  // Check POST body for dangerous keywords
  if (postData && dangerousPatterns.some(p => p.test(postData))) return true;

  return false;
}

async function main() {
  const url = process.argv[2] || 'https://example.com';
  const origin = new URL(url).origin;
  const domain = new URL(url).hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = path.join(__dirname, '..', 'output', `${domain}-api-intercept-${timestamp}`);

  await fs.mkdir(outputDir, { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 API INTERCEPT - Safe Dangerous Action Capture');
  console.log('='.repeat(60));
  console.log('URL:', url);
  console.log('\nThis will BLOCK dangerous API calls while capturing the code.\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // INTERCEPT ALL REQUESTS
  await page.route('**/*', async (route, request) => {
    const reqUrl = request.url();
    const method = request.method();
    const postData = request.postData();

    // Check if this is a dangerous request
    if (dangerousMethods.includes(method) && isDangerous(reqUrl, method, postData)) {
      // BLOCK the request but log it
      blockedRequests.push({
        url: reqUrl,
        method,
        postData: postData?.substring(0, 500),
        headers: request.headers(),
        timestamp: new Date().toISOString(),
        reason: 'Matched dangerous pattern'
      });

      console.log(`\n  🛑 BLOCKED: ${method} ${reqUrl.substring(0, 60)}`);
      if (postData) {
        console.log(`     Body: ${postData.substring(0, 100)}...`);
      }

      // Return a fake success response so the UI doesn't break
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Request blocked by extractor',
          _blocked: true
        })
      });
      return;
    }

    // Log all API calls (for documentation)
    if (dangerousMethods.includes(method) || reqUrl.includes('/api/')) {
      capturedApiCalls.push({
        url: reqUrl,
        method,
        postData: postData?.substring(0, 500),
        timestamp: new Date().toISOString()
      });
    }

    // Allow the request to continue
    await route.continue();
  });

  // Capture responses
  page.on('response', async response => {
    const resUrl = response.url();
    if (resUrl.startsWith('data:') || resUrl.startsWith('blob:')) return;
    if (allResources.has(resUrl)) return;

    try {
      const body = await response.body();
      allResources.set(resUrl, {
        url: resUrl,
        contentType: response.headers()['content-type'] || '',
        body,
        size: body.length
      });
    } catch (e) {}
  });

  // Auto-handle confirmation dialogs
  page.on('dialog', async dialog => {
    console.log(`\n  💬 DIALOG: ${dialog.message().substring(0, 80)}`);
    await dialog.dismiss(); // Always cancel
  });

  try {
    console.log('[1/3] Loading page...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    console.log(`  Resources: ${allResources.size}`);

    console.log('\n[2/3] Interactive exploration...');
    console.log('\n' + '='.repeat(50));
    console.log('SAFE TO CLICK ANYTHING');
    console.log('='.repeat(50));
    console.log('\nDangerous API calls will be BLOCKED, not executed.');
    console.log('You can safely:');
    console.log('  • Click "Delete Account"');
    console.log('  • Click "Cancel Subscription"');
    console.log('  • Click "Clear All Data"');
    console.log('\nThe dialogs will open (code captured) but');
    console.log('the actual API request will be blocked.');
    console.log('\nPress Ctrl+C when done exploring.\n');

    // Keep running until user stops
    await new Promise((resolve) => {
      process.on('SIGINT', resolve);
      // Also allow closing browser to end
      page.on('close', resolve);
    });

  } catch (e) {
    console.log('\nCapture ended.');
  }

  console.log('\n[3/3] Saving results...');

  // Save everything
  await fs.writeFile(
    path.join(outputDir, 'blocked-requests.json'),
    JSON.stringify(blockedRequests, null, 2)
  );

  await fs.writeFile(
    path.join(outputDir, 'all-api-calls.json'),
    JSON.stringify(capturedApiCalls, null, 2)
  );

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('API INTERCEPT COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nResources captured: ${allResources.size}`);
  console.log(`API calls logged: ${capturedApiCalls.length}`);
  console.log(`Dangerous requests BLOCKED: ${blockedRequests.length}`);

  if (blockedRequests.length > 0) {
    console.log('\n🛑 BLOCKED REQUESTS (would have been destructive):');
    blockedRequests.forEach(req => {
      console.log(`  ${req.method} ${req.url.substring(0, 60)}`);
    });
  }

  console.log(`\nOutput: ${outputDir}`);
  console.log('  blocked-requests.json  - What was blocked');
  console.log('  all-api-calls.json     - All API activity');

  await browser.close();
}

main().catch(console.error);
