#!/usr/bin/env node
/**
 * Test: Patch J.adQ to bypass domain check
 * This should make "New Project" button work offline
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';

const CACHE_DIR = '/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/output/photopea.com-complete-1767957633072/cache';

async function patchJavaScript() {
  console.log('Reading r9.js...');
  const r9Path = path.join(CACHE_DIR, 'r9.js');
  let code = await fs.readFile(r9Path, 'utf-8');

  console.log('  Size:', (code.length / 1024 / 1024).toFixed(2), 'MB');

  // Find J.adQ function
  const adqPattern = /(J\.adQ\s*=\s*function\s*\(\s*\)\s*\{)([\s\S]*?)(\};)/;
  const match = code.match(adqPattern);

  if (!match) {
    console.log('❌ Could not find J.adQ function');
    return null;
  }

  console.log('✅ Found J.adQ function');
  console.log('  Original body length:', match[2].length, 'chars');

  // Replace with patched version
  const patched = code.replace(
    adqPattern,
    '$1return 1;$3'  // Just return 1 (valid domain)
  );

  console.log('✅ Patched J.adQ to always return 1');

  // Save patched version
  const patchedPath = path.join(CACHE_DIR, 'r9-patched.js');
  await fs.writeFile(patchedPath, patched);
  console.log('✅ Saved to', patchedPath);

  return patchedPath;
}

async function testPatched() {
  console.log('\n[Testing patched version with browser...]');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Intercept and replace r9.js with patched version
  await page.route('**/cache/r9.js', async route => {
    const patched = readFileSync(path.join(CACHE_DIR, 'r9-patched.js'));
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: patched
    });
  });

  console.log('Loading http://localhost:3333/?test=1 with patched r9.js...');
  await page.goto('http://localhost:3333/?test=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  // Check if ak6 flag is set
  const ak6Status = await page.evaluate(() => {
    // Try to access the fj instance through the page
    // We need to find the global that contains the app state
    for (let key of Object.keys(window)) {
      if (window[key] && typeof window[key] === 'object' && window[key].C && 'ak6' in window[key].C) {
        return {
          found: true,
          ak6: window[key].C.ak6
        };
      }
    }
    return { found: false };
  });

  console.log('\n=== ak6 Status ===');
  if (ak6Status.found) {
    console.log('ak6 flag:', ak6Status.ak6);
    if (ak6Status.ak6) {
      console.log('❌ Features are DISABLED (patch may not have worked)');
    } else {
      console.log('✅ Features are ENABLED');
    }
  } else {
    console.log('⚠️  Could not find ak6 flag (may be in closure)');
  }

  // Try clicking New Project
  console.log('\n=== Testing New Project Button ===');
  try {
    await page.click('text=/new project/i', { timeout: 5000 });
    console.log('✅ Clicked "New Project" button');
    await page.waitForTimeout(2000);

    // Check for dialog
    const hasDialog = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="text"], input[type="number"]');
      for (const input of inputs) {
        if (input.offsetParent !== null) {
          const label = input.previousSibling?.textContent ||
                       input.parentElement?.textContent || '';
          if (label.toLowerCase().includes('width') ||
              label.toLowerCase().includes('height')) {
            return true;
          }
        }
      }
      return false;
    });

    if (hasDialog) {
      console.log('✅✅✅ SUCCESS! Dialog appeared!');
      console.log('\n🎉 PATCH WORKS! Photopea is now fully functional offline!');
    } else {
      console.log('❌ Dialog did not appear');

      // Check console for errors
      const logs = await page.evaluate(() => {
        return window.__lastError || 'No errors captured';
      });
      console.log('Console:', logs);
    }
  } catch (e) {
    console.log('❌ Error:', e.message);
  }

  console.log('\n\nBrowser staying open for manual testing...');
  await new Promise(() => {});
}

// Run the test
(async () => {
  await patchJavaScript();
  await testPatched();
})();
