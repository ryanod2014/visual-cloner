#!/usr/bin/env node
/**
 * Cookie Verification Test
 * Quick test to verify cookies work for authentication
 */

import { chromium } from 'playwright';
import fs from 'fs';

async function testCookies(url, cookiesPath) {
  console.log('🧪 COOKIE VERIFICATION TEST\n');

  // Load cookies
  console.log(`📂 Loading cookies from: ${cookiesPath}`);
  let cookies;
  try {
    const cookiesData = fs.readFileSync(cookiesPath, 'utf-8');
    cookies = JSON.parse(cookiesData);
    console.log(`✅ Loaded ${cookies.length} cookies\n`);
  } catch (err) {
    console.error(`❌ Error loading cookies: ${err.message}`);
    process.exit(1);
  }

  // Launch browser
  console.log('🌐 Launching browser...\n');
  const browser = await chromium.launch({
    headless: false,  // Show browser so you can see
    slowMo: 100
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  // Add cookies
  await context.addCookies(cookies);
  console.log('✅ Cookies injected\n');

  const page = await context.newPage();

  // Navigate
  console.log(`📍 Navigating to: ${url}\n`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for page to load
  console.log('⏳ Waiting 10 seconds...\n');
  await page.waitForTimeout(10000);

  // Check current URL
  const currentUrl = page.url();
  console.log(`📍 Current URL: ${currentUrl}\n`);

  // Check for login indicators
  const isLoginPage = currentUrl.includes('login') || currentUrl.includes('signin');

  if (isLoginPage) {
    console.log('❌ AUTHENTICATION FAILED');
    console.log('   Still on login page. Cookies are invalid or expired.\n');
  } else {
    console.log('✅ AUTHENTICATION SUCCESS!');
    console.log('   Logged in successfully!\n');
  }

  // Check page title
  const title = await page.title();
  console.log(`📄 Page title: ${title}\n`);

  // Take screenshot for verification
  await page.screenshot({ path: 'cookie-test-screenshot.png' });
  console.log('📸 Screenshot saved: cookie-test-screenshot.png\n');

  // Check for common authenticated elements
  const hasPasswordField = await page.locator('input[type="password"]').count() > 0;
  const hasEmailField = await page.locator('input[type="email"]').count() > 0;

  console.log('🔍 Page Analysis:');
  console.log(`   - Password field found: ${hasPasswordField ? '❌ YES (bad - suggests login page)' : '✅ NO (good)'}`);
  console.log(`   - Email field found: ${hasEmailField ? '⚠️  YES' : '✅ NO'}`);

  console.log('\n💡 RECOMMENDATION:');
  if (isLoginPage || hasPasswordField) {
    console.log('   ❌ Cookies not working. Try:');
    console.log('   1. Export fresh cookies again (they may have expired)');
    console.log('   2. Make sure you\'re logged in when exporting');
    console.log('   3. Use the auto-login method instead\n');
  } else {
    console.log('   ✅ Cookies working! Ready to run full extraction.\n');
  }

  // Keep browser open so you can see
  console.log('🖥️  Browser will stay open for 30 seconds so you can verify...\n');
  await page.waitForTimeout(30000);

  await browser.close();
}

// CLI
const url = process.argv[2] || 'https://app.gohighlevel.com';
const cookiesPath = process.argv[3] || 'ghl-cookies.json';

try {
  await testCookies(url, cookiesPath);
} catch (err) {
  console.error('\n❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
}
