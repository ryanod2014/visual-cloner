#!/usr/bin/env node
/**
 * Cookie Diagnostic Tool
 * Deep dive into why cookies aren't working
 */

import { chromium } from 'playwright';
import fs from 'fs';

async function diagnoseCookies(url, cookiesPath) {
  console.log('🔬 COOKIE DIAGNOSTIC TOOL\n');
  console.log('═'.repeat(60));

  // Load cookies from file
  console.log('\n📂 STEP 1: Loading cookies from file');
  let cookiesFromFile;
  try {
    const cookiesData = fs.readFileSync(cookiesPath, 'utf-8');
    cookiesFromFile = JSON.parse(cookiesData);
    console.log(`✅ Loaded ${cookiesFromFile.length} cookies from file`);

    // Show cookie details
    console.log('\n📋 Cookies from file:');
    for (const cookie of cookiesFromFile) {
      const expires = new Date(cookie.expirationDate * 1000).toISOString();
      console.log(`   - ${cookie.name}`);
      console.log(`     Domain: ${cookie.domain}`);
      console.log(`     Expires: ${expires}`);
      console.log(`     HttpOnly: ${cookie.httpOnly}`);
      console.log(`     Secure: ${cookie.secure}`);
      console.log(`     SameSite: ${cookie.sameSite}`);
    }
  } catch (err) {
    console.error(`❌ Error loading cookies: ${err.message}`);
    process.exit(1);
  }

  // Launch browser
  console.log('\n═'.repeat(60));
  console.log('\n🌐 STEP 2: Launching browser');
  const browser = await chromium.launch({
    headless: false
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  // Check cookies BEFORE adding
  console.log('\n📋 Cookies in browser BEFORE adding:');
  let cookiesBeforeAdd = await context.cookies();
  console.log(`   Count: ${cookiesBeforeAdd.length}`);

  // Add cookies
  console.log('\n➕ STEP 3: Adding cookies to browser');
  try {
    await context.addCookies(cookiesFromFile);
    console.log('✅ Cookies added successfully');
  } catch (err) {
    console.error(`❌ Error adding cookies: ${err.message}`);
    await browser.close();
    process.exit(1);
  }

  // Check cookies AFTER adding
  console.log('\n📋 Cookies in browser AFTER adding:');
  let cookiesAfterAdd = await context.cookies();
  console.log(`   Count: ${cookiesAfterAdd.length}`);
  for (const cookie of cookiesAfterAdd) {
    console.log(`   - ${cookie.name} (${cookie.domain})`);
  }

  // Navigate
  const page = await context.newPage();
  console.log('\n═'.repeat(60));
  console.log(`\n📍 STEP 4: Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('⏳ Waiting 5 seconds...');
  await page.waitForTimeout(5000);

  // Check cookies AFTER navigation
  console.log('\n📋 Cookies in browser AFTER navigation:');
  let cookiesAfterNav = await context.cookies();
  console.log(`   Count: ${cookiesAfterNav.length}`);

  // Show which cookies were removed or added
  const beforeNames = new Set(cookiesAfterAdd.map(c => c.name));
  const afterNames = new Set(cookiesAfterNav.map(c => c.name));

  const removed = [...beforeNames].filter(name => !afterNames.has(name));
  const added = [...afterNames].filter(name => !beforeNames.has(name));

  if (removed.length > 0) {
    console.log(`\n   ⚠️  ${removed.length} cookies REMOVED after navigation:`);
    for (const name of removed) {
      console.log(`      - ${name}`);
    }
  }

  if (added.length > 0) {
    console.log(`\n   ➕ ${added.length} cookies ADDED after navigation:`);
    for (const name of added) {
      console.log(`      - ${name}`);
    }
  }

  // Check current page state
  console.log('\n═'.repeat(60));
  console.log('\n🔍 STEP 5: Page Analysis');
  const currentUrl = page.url();
  console.log(`   URL: ${currentUrl}`);

  const title = await page.title();
  console.log(`   Title: ${title || '(empty)'}`);

  // Check for auth indicators
  const hasPasswordField = await page.locator('input[type="password"]').count() > 0;
  const hasEmailField = await page.locator('input[type="email"]').count() > 0;
  const hasSignInText = await page.locator('text="Sign in"').count() > 0;

  console.log(`   Has password field: ${hasPasswordField ? '❌ YES' : '✅ NO'}`);
  console.log(`   Has email field: ${hasEmailField ? '⚠️  YES' : '✅ NO'}`);
  console.log(`   Has "Sign in" text: ${hasSignInText ? '❌ YES' : '✅ NO'}`);

  // Try to get localStorage/sessionStorage
  console.log('\n💾 Storage:');
  const localStorage = await page.evaluate(() => {
    return JSON.stringify(window.localStorage);
  });
  const sessionStorage = await page.evaluate(() => {
    return JSON.stringify(window.sessionStorage);
  });

  console.log(`   localStorage keys: ${Object.keys(JSON.parse(localStorage)).length}`);
  console.log(`   sessionStorage keys: ${Object.keys(JSON.parse(sessionStorage)).length}`);

  // Check for specific auth cookies
  console.log('\n═'.repeat(60));
  console.log('\n🔐 STEP 6: Authentication Cookie Check');

  const authCookieNames = ['m_a', 'a', '_ghl_session', 'auth_token'];
  const currentCookies = await context.cookies();

  for (const name of authCookieNames) {
    const cookie = currentCookies.find(c => c.name === name);
    if (cookie) {
      console.log(`   ✅ ${name}: present`);
      const expires = new Date(cookie.expires * 1000);
      const now = new Date();
      const timeLeft = expires - now;
      const hoursLeft = (timeLeft / 1000 / 60 / 60).toFixed(1);
      console.log(`      Expires in: ${hoursLeft} hours`);
    } else {
      console.log(`   ❌ ${name}: MISSING`);
    }
  }

  console.log('\n═'.repeat(60));
  console.log('\n💡 CONCLUSION:');

  if (hasPasswordField || hasSignInText) {
    console.log('   ❌ NOT AUTHENTICATED');
    console.log('\n   Possible reasons:');
    console.log('   1. JWT token expired (check "m_a" cookie expiry above)');
    console.log('   2. Missing httpOnly cookies that Cookie-Editor can\'t export');
    console.log('   3. GoHighLevel requires additional session cookies');
    console.log('   4. Cookie domain mismatch');
    console.log('\n   RECOMMENDATION: Use auto-login method instead');
  } else {
    console.log('   ✅ AUTHENTICATED');
  }

  console.log('\n🖥️  Keeping browser open for 30 seconds...\n');
  await page.waitForTimeout(30000);

  await browser.close();
}

// CLI
const url = process.argv[2] || 'https://app.gohighlevel.com';
const cookiesPath = process.argv[3] || 'ghl-cookies.json';

try {
  await diagnoseCookies(url, cookiesPath);
} catch (err) {
  console.error('\n❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
}
