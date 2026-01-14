#!/usr/bin/env node
/**
 * Capture Session from Running Chrome
 * Connects to your already-running Chrome via CDP
 */

import { chromium } from 'playwright';
import fs from 'fs';

async function captureFromRunningChrome() {
  console.log('🔌 CONNECTING TO RUNNING CHROME\n');
  console.log('═'.repeat(60) + '\n');

  try {
    // Connect to existing Chrome instance
    console.log('🔍 Looking for Chrome on port 9222...\n');

    const browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('✅ Connected to Chrome!\n');

    // Get all contexts (windows)
    const contexts = browser.contexts();
    console.log(`📱 Found ${contexts.length} browser contexts\n`);

    // Use the default context
    const context = contexts[0];
    const pages = context.pages();

    console.log(`📄 Found ${pages.length} open tabs\n`);

    // Find the GoHighLevel tab
    let ghlPage = null;
    for (const page of pages) {
      const url = page.url();
      if (url.includes('gohighlevel.com')) {
        ghlPage = page;
        console.log(`✅ Found GoHighLevel tab: ${url}\n`);
        break;
      }
    }

    if (!ghlPage) {
      console.log('⚠️  No GoHighLevel tab found. Looking at all tabs:\n');
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const url = page.url();
        const title = await page.title();
        console.log(`   ${i + 1}. ${title}`);
        console.log(`      ${url}\n`);
      }

      // Ask which tab to use
      console.log('Which tab number should I use? (Enter number, or open GoHighLevel and press ENTER): ');

      const answer = await new Promise(resolve => {
        process.stdin.once('data', data => {
          resolve(data.toString().trim());
        });
      });

      if (answer && !isNaN(answer)) {
        const tabNum = parseInt(answer) - 1;
        if (tabNum >= 0 && tabNum < pages.length) {
          ghlPage = pages[tabNum];
          console.log(`\n✅ Using tab ${tabNum + 1}\n`);
        }
      } else {
        // Refresh page list
        const newPages = context.pages();
        for (const page of newPages) {
          const url = page.url();
          if (url.includes('gohighlevel.com')) {
            ghlPage = page;
            console.log(`\n✅ Found GoHighLevel tab: ${url}\n`);
            break;
          }
        }
      }
    }

    if (!ghlPage) {
      console.error('❌ Could not find GoHighLevel tab. Please open it and try again.\n');
      await browser.close();
      process.exit(1);
    }

    // Bring tab to front
    await ghlPage.bringToFront();
    console.log('📍 Switched to GoHighLevel tab\n');

    // Check if logged in
    const currentUrl = ghlPage.url();
    console.log(`Current URL: ${currentUrl}\n`);

    const hasPasswordField = await ghlPage.locator('input[type="password"]').count() > 0;

    if (hasPasswordField || currentUrl.includes('login')) {
      console.log('⚠️  Looks like you\'re not logged in.\n');
      console.log('Please log in to GoHighLevel in the Chrome tab, then press ENTER...\n');

      await new Promise(resolve => {
        process.stdin.once('data', () => {
          resolve();
        });
      });

      console.log('\n✅ Continuing...\n');
      await ghlPage.waitForTimeout(2000);
    } else {
      console.log('✅ You appear to be logged in!\n');
    }

    // Capture everything
    console.log('📸 Capturing session data...\n');

    // Get cookies
    const cookies = await context.cookies();
    console.log(`   ✅ Captured ${cookies.length} cookies`);

    // Get localStorage
    const localStorage = await ghlPage.evaluate(() => {
      const data = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        data[key] = window.localStorage.getItem(key);
      }
      return data;
    });
    console.log(`   ✅ Captured ${Object.keys(localStorage).length} localStorage items`);

    // Get sessionStorage
    const sessionStorage = await ghlPage.evaluate(() => {
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
      url: ghlPage.url(),
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

    console.log('═'.repeat(60));
    console.log('\n✅ SUCCESS!\n');
    console.log('Next step: Run the extraction:');
    console.log('  node tools/v7-with-session.js https://app.gohighlevel.com ghl-session.json\n');

    await browser.close();

  } catch (err) {
    if (err.message.includes('ECONNREFUSED') || err.message.includes('connect')) {
      console.error('❌ Could not connect to Chrome.\n');
      console.error('Make sure Chrome is running with remote debugging:');
      console.error('  bash start-chrome-debug.sh\n');
    } else {
      console.error('❌ Error:', err.message);
      console.error(err.stack);
    }
    process.exit(1);
  }
}

try {
  await captureFromRunningChrome();
} catch (err) {
  console.error('\n❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
}
