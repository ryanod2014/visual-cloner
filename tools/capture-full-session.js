#!/usr/bin/env node
/**
 * Capture Full Session
 * Captures cookies + localStorage + sessionStorage
 */

import { chromium } from 'playwright';
import fs from 'fs';

async function captureSession() {
  console.log('💾 FULL SESSION CAPTURE\n');
  console.log('═'.repeat(60) + '\n');

  console.log('This will capture:');
  console.log('  - All cookies');
  console.log('  - localStorage');
  console.log('  - sessionStorage\n');

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

  // Navigate
  console.log('📍 Navigating to GoHighLevel...\n');
  await page.goto('https://app.gohighlevel.com', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  await page.waitForTimeout(3000);

  // Check if on login page
  const hasPasswordField = await page.locator('input[type="password"]').count() > 0;

  if (hasPasswordField) {
    console.log('🔐 Please log in now in the browser window.\n');
    console.log('When you see your dashboard, press ENTER here to continue...\n');

    // Wait for user to press enter
    await new Promise(resolve => {
      process.stdin.once('data', () => {
        resolve();
      });
    });

    console.log('\n✅ Continuing...\n');
    await page.waitForTimeout(3000);
  } else {
    console.log('✅ Already logged in!\n');
  }

  // Capture everything
  console.log('📸 Capturing session data...\n');

  // Get cookies
  const cookies = await context.cookies();
  console.log(`   ✅ Captured ${cookies.length} cookies`);

  // Get localStorage
  const localStorage = await page.evaluate(() => {
    const data = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      data[key] = window.localStorage.getItem(key);
    }
    return data;
  });
  console.log(`   ✅ Captured ${Object.keys(localStorage).length} localStorage items`);

  // Get sessionStorage
  const sessionStorage = await page.evaluate(() => {
    const data = {};
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      data[key] = window.sessionStorage.getItem(key);
    }
    return data;
  });
  console.log(`   ✅ Captured ${Object.keys(sessionStorage).length} sessionStorage items\n`);

  // Format cookies for Playwright
  const formattedCookies = cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.expires,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite === 'None' ? 'None' :
              c.sameSite === 'Strict' ? 'Strict' : 'Lax'
  }));

  // Save session bundle
  const sessionBundle = {
    captured: new Date().toISOString(),
    url: page.url(),
    cookies: formattedCookies,
    localStorage,
    sessionStorage
  };

  fs.writeFileSync(
    'ghl-session.json',
    JSON.stringify(sessionBundle, null, 2)
  );

  console.log('💾 SAVED SESSION BUNDLE\n');
  console.log('   File: ghl-session.json');
  console.log(`   Cookies: ${formattedCookies.length}`);
  console.log(`   localStorage keys: ${Object.keys(localStorage).length}`);
  console.log(`   sessionStorage keys: ${Object.keys(sessionStorage).length}\n`);

  console.log('✅ You can now use this session bundle for extraction!\n');

  await browser.close();
}

try {
  await captureSession();
} catch (err) {
  console.error('\n❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
}
