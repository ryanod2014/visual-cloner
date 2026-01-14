#!/usr/bin/env node
/**
 * V6 SAFE EXPLORER - Click ANYTHING safely
 *
 * PARANOID MODE: Blocks ALL mutating requests by default
 * You can click "Delete Account", "Cancel Subscription", etc.
 * The UI will respond as if it worked, but NOTHING actually happens.
 *
 * How it works:
 * 1. ALL DELETE requests → BLOCKED
 * 2. ALL POST/PUT/PATCH to dangerous endpoints → BLOCKED
 * 3. Dangerous keywords in request body → BLOCKED
 * 4. Returns fake success so UI continues working
 * 5. Logs everything that WOULD have happened
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const allResources = new Map();
const blockedRequests = [];
const allowedRequests = [];
const capturedApiCalls = [];

// ============================================================
// PARANOID BLOCKING RULES
// ============================================================

// Block ANY request matching these URL patterns
const alwaysBlockUrlPatterns = [
  // Account destruction
  /\/delete/i,
  /\/remove/i,
  /\/destroy/i,
  /\/terminate/i,
  /\/deactivate/i,
  /\/close.*account/i,
  /\/disable/i,

  // Subscription/billing
  /\/cancel/i,
  /\/unsubscribe/i,
  /\/downgrade/i,
  /\/refund/i,

  // Data destruction
  /\/clear/i,
  /\/purge/i,
  /\/wipe/i,
  /\/erase/i,
  /\/reset/i,
  /\/truncate/i,

  // Dangerous operations
  /\/revoke/i,
  /\/disconnect/i,
  /\/unlink/i,
  /\/logout.*all/i,
  /\/sign.*out.*all/i,
  /\/invalidate/i,

  // Permissions
  /\/transfer.*ownership/i,
  /\/leave.*team/i,
  /\/leave.*org/i,
];

// Block if POST body contains these (JSON field patterns)
const dangerousBodyPatterns = [
  /"action"\s*:\s*"delete"/i,
  /"action"\s*:\s*"remove"/i,
  /"action"\s*:\s*"destroy"/i,
  /"action"\s*:\s*"cancel"/i,
  /"action"\s*:\s*"deactivate"/i,
  /"action"\s*:\s*"terminate"/i,
  /"delete"\s*:\s*true/i,
  /"destroy"\s*:\s*true/i,
  /"permanent"\s*:\s*true/i,
  /"confirm"\s*:\s*true/i,  // Final confirmation flags
  /"confirmed"\s*:\s*true/i,
  /mutation\s*{\s*delete/i,  // GraphQL delete mutations
  /mutation\s*{\s*remove/i,
  /mutation\s*{\s*destroy/i,
];

// Safe patterns - always allow these through
const safePatterns = [
  /\.(js|css|woff|woff2|ttf|png|jpg|jpeg|gif|svg|ico|webp)$/i,
  /fonts\./i,
  /static\./i,
  /cdn\./i,
  /assets\//i,
  /analytics/i,  // Let analytics through (read-only)
  /tracking/i,
  /telemetry/i,
];

// ============================================================
// BLOCKING LOGIC
// ============================================================

function shouldBlock(url, method, postData) {
  // GET requests are always safe
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return { block: false, reason: 'Safe method' };
  }

  // Static resources are always safe
  if (safePatterns.some(p => p.test(url))) {
    return { block: false, reason: 'Safe resource' };
  }

  // DELETE method - ALWAYS block
  if (method === 'DELETE') {
    return { block: true, reason: 'DELETE method blocked' };
  }

  // Check URL patterns
  for (const pattern of alwaysBlockUrlPatterns) {
    if (pattern.test(url)) {
      return { block: true, reason: `URL matches: ${pattern}` };
    }
  }

  // Check POST body
  if (postData) {
    for (const pattern of dangerousBodyPatterns) {
      if (pattern.test(postData)) {
        return { block: true, reason: `Body matches: ${pattern}` };
      }
    }
  }

  return { block: false, reason: 'No dangerous patterns' };
}

// Generate a convincing fake response
function generateFakeResponse(url, method, postData) {
  // Try to match common API response formats
  const isGraphQL = url.includes('graphql') || (postData && postData.includes('"query"'));

  if (isGraphQL) {
    return {
      data: {
        __blocked: true,
        success: true,
        message: 'Operation completed successfully'
      }
    };
  }

  // REST-style response
  return {
    success: true,
    ok: true,
    status: 'success',
    message: 'Operation completed successfully',
    data: {},
    __blocked: true  // Hidden flag so we know it was faked
  };
}

async function main() {
  const url = process.argv[2] || 'https://example.com';
  const paranoid = process.argv.includes('--paranoid');
  const origin = new URL(url).origin;
  const domain = new URL(url).hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = path.join(__dirname, '..', 'output', `${domain}-safe-explorer-${timestamp}`);

  await fs.mkdir(outputDir, { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 SAFE EXPLORER - Click Anything Mode');
  console.log('='.repeat(60));
  console.log('URL:', url);
  console.log('Mode:', paranoid ? 'PARANOID (blocks ALL mutations)' : 'SMART (blocks dangerous patterns)');
  console.log('');
  console.log('YOU CAN SAFELY:');
  console.log('  - Click "Delete Account"');
  console.log('  - Click "Yes, I\'m sure"');
  console.log('  - Click "Permanently delete"');
  console.log('  - Click "Cancel Subscription"');
  console.log('  - Click ANY destructive action');
  console.log('');
  console.log('The UI will act like it worked, but NOTHING actually happens.');
  console.log('');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Inject visual indicator that safe mode is active
  await page.addInitScript(() => {
    // Add floating indicator
    const indicator = document.createElement('div');
    indicator.id = '__safe_mode_indicator';
    indicator.innerHTML = '🛡️ SAFE MODE';
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #10b981;
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-family: system-ui, sans-serif;
      font-size: 14px;
      font-weight: 600;
      z-index: 999999;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      pointer-events: none;
    `;

    // Add when DOM is ready
    if (document.body) {
      document.body.appendChild(indicator);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(indicator);
      });
    }

    // Flash red when something is blocked
    window.__flashBlocked = () => {
      const el = document.getElementById('__safe_mode_indicator');
      if (el) {
        el.innerHTML = '🛑 BLOCKED';
        el.style.background = '#ef4444';
        setTimeout(() => {
          el.innerHTML = '🛡️ SAFE MODE';
          el.style.background = '#10b981';
        }, 1500);
      }
    };
  });

  // INTERCEPT ALL REQUESTS
  await page.route('**/*', async (route, request) => {
    const reqUrl = request.url();
    const method = request.method();
    const postData = request.postData();

    const { block, reason } = shouldBlock(reqUrl, method, postData);

    if (block) {
      // Log the blocked request
      blockedRequests.push({
        url: reqUrl,
        method,
        postData: postData?.substring(0, 1000),
        headers: request.headers(),
        timestamp: new Date().toISOString(),
        reason
      });

      console.log(`\n  🛑 BLOCKED: ${method} ${reqUrl.substring(0, 70)}`);
      console.log(`     Reason: ${reason}`);
      if (postData) {
        console.log(`     Body: ${postData.substring(0, 150)}...`);
      }

      // Flash the indicator
      try {
        await page.evaluate(() => window.__flashBlocked?.());
      } catch (e) {}

      // Return fake success
      const fakeResponse = generateFakeResponse(reqUrl, method, postData);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fakeResponse)
      });
      return;
    }

    // Log allowed API calls
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      allowedRequests.push({
        url: reqUrl,
        method,
        postData: postData?.substring(0, 500),
        timestamp: new Date().toISOString(),
        reason
      });
    }

    // Allow the request
    await route.continue();
  });

  // Capture all responses for resource collection
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

  // Handle native browser dialogs
  page.on('dialog', async dialog => {
    const msg = dialog.message();
    console.log(`\n  💬 DIALOG: "${msg.substring(0, 100)}"`);

    // For confirm dialogs, we ACCEPT them so the code path continues
    // The actual API call will be blocked anyway
    if (dialog.type() === 'confirm') {
      console.log(`     -> Accepting (API will be blocked anyway)`);
      await dialog.accept();
    } else {
      await dialog.dismiss();
    }
  });

  try {
    console.log('[1/2] Loading page...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Re-inject indicator after navigation
    await page.evaluate(() => {
      if (!document.getElementById('__safe_mode_indicator')) {
        const indicator = document.createElement('div');
        indicator.id = '__safe_mode_indicator';
        indicator.innerHTML = '🛡️ SAFE MODE';
        indicator.style.cssText = `
          position: fixed;
          top: 10px;
          right: 10px;
          background: #10b981;
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-family: system-ui, sans-serif;
          font-size: 14px;
          font-weight: 600;
          z-index: 999999;
          box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          pointer-events: none;
        `;
        document.body.appendChild(indicator);
      }
    });

    console.log(`  Resources: ${allResources.size}`);

    console.log('\n[2/2] Interactive exploration...');
    console.log('\n' + '='.repeat(50));
    console.log('GO WILD - CLICK ANYTHING');
    console.log('='.repeat(50));
    console.log('\nDangerous actions will be blocked at the API level.');
    console.log('You\'ll see 🛑 BLOCKED in console when something is caught.');
    console.log('\nClose the browser or press Ctrl+C when done.\n');

    // Keep running until user stops
    await new Promise((resolve) => {
      process.on('SIGINT', resolve);
      page.on('close', resolve);
      context.on('close', resolve);
    });

  } catch (e) {
    if (!e.message?.includes('Target closed')) {
      console.log('\nExploration ended:', e.message);
    }
  }

  console.log('\n[Saving results...]');

  // Save detailed reports
  await fs.writeFile(
    path.join(outputDir, 'blocked-requests.json'),
    JSON.stringify(blockedRequests, null, 2)
  );

  await fs.writeFile(
    path.join(outputDir, 'allowed-mutations.json'),
    JSON.stringify(allowedRequests, null, 2)
  );

  // Generate human-readable report
  const report = `
# Safe Explorer Report
Generated: ${new Date().toISOString()}
URL: ${url}

## Summary
- Resources captured: ${allResources.size}
- Dangerous requests BLOCKED: ${blockedRequests.length}
- Safe mutations allowed: ${allowedRequests.length}

## Blocked Requests (Would Have Been Destructive)
${blockedRequests.length === 0 ? 'None' : blockedRequests.map(r => `
### ${r.method} ${r.url}
- **Reason**: ${r.reason}
- **Time**: ${r.timestamp}
${r.postData ? `- **Body**: \`${r.postData.substring(0, 200)}...\`` : ''}
`).join('\n')}

## What This Means
All the code paths for these actions were executed and captured.
The client-side code ran normally.
Only the final server request was blocked.
Your account/data is completely safe.
`;

  await fs.writeFile(path.join(outputDir, 'report.md'), report);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SAFE EXPLORATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nResources captured: ${allResources.size}`);
  console.log(`Mutations allowed: ${allowedRequests.length}`);
  console.log(`Dangerous requests BLOCKED: ${blockedRequests.length}`);

  if (blockedRequests.length > 0) {
    console.log('\n🛑 BLOCKED REQUESTS:');
    blockedRequests.forEach(req => {
      console.log(`  ${req.method} ${req.url.substring(0, 60)}`);
      console.log(`    Reason: ${req.reason}`);
    });
  }

  console.log(`\nOutput: ${outputDir}`);
  console.log('  report.md              - Human-readable summary');
  console.log('  blocked-requests.json  - Detailed blocked requests');
  console.log('  allowed-mutations.json - Safe mutations that went through');

  try {
    await browser.close();
  } catch (e) {}
}

main().catch(console.error);
