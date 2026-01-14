#!/usr/bin/env node
/**
 * Find Missing Cookies
 * Compare browser cookies vs exported cookies to find what's missing
 */

import { chromium } from 'playwright';
import fs from 'fs';

async function findMissingCookies() {
  console.log('🔍 FINDING MISSING COOKIES\n');
  console.log('═'.repeat(60) + '\n');

  console.log('This tool will:');
  console.log('1. Open Chrome and wait for you to login manually');
  console.log('2. Capture ALL cookies from the browser');
  console.log('3. Compare with your exported cookies');
  console.log('4. Show which cookies are missing\n');

  console.log('Press Ctrl+C if you want to cancel...\n');

  // Load exported cookies
  let exportedCookies;
  try {
    const cookiesData = fs.readFileSync('ghl-cookies.json', 'utf-8');
    exportedCookies = JSON.parse(cookiesData);
    console.log(`📋 Exported cookies file: ${exportedCookies.length} cookies\n`);
  } catch (err) {
    console.error(`❌ Error loading ghl-cookies.json: ${err.message}`);
    process.exit(1);
  }

  // Launch browser
  console.log('🌐 Launching browser...\n');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  // Navigate to GoHighLevel
  console.log('📍 Navigating to GoHighLevel...\n');
  await page.goto('https://app.gohighlevel.com', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  await page.waitForTimeout(3000);

  // Check if on login page
  const hasPasswordField = await page.locator('input[type="password"]').count() > 0;

  if (hasPasswordField) {
    console.log('🔐 LOGIN PAGE DETECTED\n');
    console.log('─'.repeat(60));
    console.log('⏸  Please log in now in the browser window.');
    console.log('   I\'ll automatically detect when you\'re done.');
    console.log('─'.repeat(60) + '\n');

    // Auto-detect when login completes
    let loginComplete = false;
    let checkCount = 0;
    const maxChecks = 180; // 3 minutes max

    while (!loginComplete && checkCount < maxChecks) {
      await page.waitForTimeout(1000);
      checkCount++;

      // Check if still on login page
      const stillOnLogin = await page.locator('input[type="password"]').count() > 0;

      if (!stillOnLogin) {
        loginComplete = true;
        console.log('✅ Login detected!\n');
      } else if (checkCount % 10 === 0) {
        console.log(`   Still waiting... (${checkCount}s)`);
      }
    }

    if (!loginComplete) {
      console.log('\n⏱️  Timeout reached. Continuing anyway...\n');
    }

    // Wait for page to stabilize
    await page.waitForTimeout(5000);
  } else {
    console.log('✅ Already logged in!\n');
    await page.waitForTimeout(3000);
  }

  // Get ALL cookies from browser
  console.log('📋 Capturing cookies from browser...\n');
  const browserCookies = await context.cookies();

  console.log(`✅ Captured ${browserCookies.length} cookies from browser\n`);

  // Compare
  console.log('═'.repeat(60));
  console.log('\n🔍 COMPARISON\n');

  const exportedNames = new Set(exportedCookies.map(c => c.name));
  const browserNames = new Set(browserCookies.map(c => c.name));

  // Find cookies in browser but NOT in export
  const missingFromExport = browserCookies.filter(c => !exportedNames.has(c.name));

  // Find cookies in export but NOT in browser
  const missingFromBrowser = exportedCookies.filter(c => !browserNames.has(c.name));

  console.log(`Exported file: ${exportedCookies.length} cookies`);
  console.log(`Live browser:  ${browserCookies.length} cookies\n`);

  if (missingFromExport.length > 0) {
    console.log(`⚠️  ${missingFromExport.length} cookies in BROWSER but NOT in exported file:\n`);
    for (const cookie of missingFromExport) {
      console.log(`   - ${cookie.name}`);
      console.log(`     Domain: ${cookie.domain}`);
      console.log(`     HttpOnly: ${cookie.httpOnly}`);
      console.log(`     Secure: ${cookie.secure}`);
      console.log(`     Value: ${cookie.value.substring(0, 50)}...`);
      console.log('');
    }

    console.log('💡 These cookies might be needed for authentication!\n');
  } else {
    console.log('✅ All browser cookies are in your exported file\n');
  }

  if (missingFromBrowser.length > 0) {
    console.log(`ℹ️  ${missingFromBrowser.length} cookies in EXPORT but NOT in browser:\n`);
    for (const cookie of missingFromBrowser) {
      console.log(`   - ${cookie.name}`);
    }
    console.log('');
  }

  // Save the complete browser cookies
  console.log('═'.repeat(60));
  console.log('\n💾 SAVING COMPLETE COOKIE SET\n');

  // Convert browser cookies to export format
  const completeCookies = browserCookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.expires,
    expirationDate: c.expires,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite === 'None' ? 'None' :
              c.sameSite === 'Strict' ? 'Strict' : 'Lax',
    session: false,
    storeId: null,
    hostOnly: false
  }));

  fs.writeFileSync(
    'ghl-cookies-complete.json',
    JSON.stringify(completeCookies, null, 2)
  );

  console.log('✅ Saved complete cookie set to: ghl-cookies-complete.json');
  console.log(`   Contains ${completeCookies.length} cookies\n`);

  console.log('═'.repeat(60));
  console.log('\n💡 NEXT STEPS:\n');
  console.log('Use the complete cookie file for extraction:');
  console.log('  node tools/v7-with-cookies.js https://app.gohighlevel.com ghl-cookies-complete.json\n');

  console.log('🖥️  Keeping browser open for 10 seconds...\n');
  await page.waitForTimeout(10000);

  await browser.close();
}

try {
  await findMissingCookies();
} catch (err) {
  console.error('\n❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
}
