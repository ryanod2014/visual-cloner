#!/usr/bin/env node
/**
 * Automated drag/drop comparison: Online vs Offline
 * Tests what works online and compares to offline behavior
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const TEST_IMAGE_PATH = '/tmp/test-image.png';

// Create a simple test image
const createTestImage = () => {
  // 1x1 red pixel PNG
  const pngData = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64'
  );
  fs.writeFileSync(TEST_IMAGE_PATH, pngData);
  console.log('✅ Created test image:', TEST_IMAGE_PATH);
};

async function testDragDrop(url, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${label}`);
  console.log(`URL: ${url}`);
  console.log('='.repeat(60));

  const browser = await puppeteer.launch({
    headless: false,
    devtools: false
  });

  const page = await browser.newPage();

  // Collect console messages
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location()
    });
  });

  // Collect errors
  const errors = [];
  page.on('pageerror', error => {
    errors.push({
      message: error.message,
      stack: error.stack
    });
  });

  // Monitor network requests
  const failedRequests = [];
  page.on('requestfailed', request => {
    failedRequests.push({
      url: request.url(),
      failure: request.failure()
    });
  });

  console.log('Loading page...');
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

  console.log('Waiting for initialization (15 seconds)...');
  await page.waitForTimeout(15000);

  // Inject monitoring code
  console.log('Injecting drag/drop monitors...');
  await page.evaluate(() => {
    window.dragDropEvents = [];
    window.dragDropErrors = [];

    const events = ['drag', 'dragstart', 'dragenter', 'dragover', 'dragleave', 'drop', 'dragend'];

    events.forEach(eventName => {
      document.addEventListener(eventName, (e) => {
        window.dragDropEvents.push({
          type: eventName,
          target: e.target.tagName + (e.target.id ? '#' + e.target.id : ''),
          files: e.dataTransfer?.files?.length || 0,
          types: Array.from(e.dataTransfer?.types || []),
          defaultPrevented: e.defaultPrevented,
          timestamp: Date.now()
        });
      }, true);
    });

    // Catch any errors during drag/drop
    window.addEventListener('error', (e) => {
      window.dragDropErrors.push({
        message: e.message,
        filename: e.filename,
        lineno: e.lineno
      });
    });

    console.log('Drag/drop monitor installed');
  });

  // Get initial document count (to detect if image loads)
  const initialDocCount = await page.evaluate(() => {
    return window.app?.YF?.length || 0;
  });

  console.log(`Initial document count: ${initialDocCount}`);

  // Simulate drag and drop
  console.log('Simulating drag and drop...');

  try {
    // Find the main canvas or body
    const dropTarget = await page.$('body');

    // Create a file input and trigger it
    const fileInput = await page.evaluateHandle(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.style.display = 'none';
      document.body.appendChild(input);
      return input;
    });

    // Upload the test image
    await fileInput.uploadFile(TEST_IMAGE_PATH);

    // Try to trigger change event
    await page.evaluate((input) => {
      const event = new Event('change', { bubbles: true });
      input.dispatchEvent(event);
    }, fileInput);

    console.log('File input triggered');

    // Also try DataTransfer simulation
    await page.evaluate((imagePath) => {
      // Try to simulate a drop event
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer()
      });

      // Try to dispatch on body
      document.body.dispatchEvent(dropEvent);

      // Try to dispatch on main app element
      const appElement = document.querySelector('.app') || document.querySelector('[class*="app"]');
      if (appElement) {
        appElement.dispatchEvent(dropEvent);
      }
    }, TEST_IMAGE_PATH);

    console.log('Drop event dispatched');

  } catch (err) {
    console.error('Error during drag/drop simulation:', err.message);
  }

  // Wait for any reactions
  await page.waitForTimeout(3000);

  // Check if document count changed (image loaded)
  const finalDocCount = await page.evaluate(() => {
    return window.app?.YF?.length || 0;
  });

  console.log(`Final document count: ${finalDocCount}`);

  // Collect results
  const dragDropEvents = await page.evaluate(() => window.dragDropEvents);
  const dragDropErrors = await page.evaluate(() => window.dragDropErrors);

  // Check for file-related globals
  const fileHandling = await page.evaluate(() => {
    return {
      hasFileReader: typeof FileReader !== 'undefined',
      hasFile: typeof File !== 'undefined',
      hasBlob: typeof Blob !== 'undefined',
      hasDataTransfer: typeof DataTransfer !== 'undefined',
      hasShowOpenFilePicker: typeof window.showOpenFilePicker !== 'undefined',
      hasApp: typeof window.app !== 'undefined',
      hasCh: typeof window.app?.dR !== 'undefined',
      canAccessFileInput: !!document.querySelector('input[type="file"]')
    };
  });

  // Try File → Open menu
  console.log('Testing File → Open...');
  let fileMenuWorks = false;
  try {
    // Try to click File menu
    await page.click('text/File', { timeout: 2000 });
    await page.waitForTimeout(500);
    fileMenuWorks = true;
    console.log('✅ File menu opened');
  } catch (err) {
    console.log('❌ Could not open File menu:', err.message);
  }

  await browser.close();

  // Return results
  return {
    label,
    url,
    initialDocCount,
    finalDocCount,
    imageLoaded: finalDocCount > initialDocCount,
    dragDropEvents,
    dragDropErrors,
    consoleLogs: consoleLogs.slice(-20), // Last 20 logs
    errors,
    failedRequests,
    fileHandling,
    fileMenuWorks
  };
}

async function main() {
  console.log('🔍 Automated Drag/Drop Comparison Test');
  console.log('==========================================\n');

  createTestImage();

  // Test online first
  const onlineResults = await testDragDrop('https://www.photopea.com', 'ONLINE Photopea');

  console.log('\n\n⏳ Waiting 5 seconds before offline test...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Test offline
  const offlineResults = await testDragDrop('http://localhost:3344/?test=1', 'OFFLINE Photopea');

  // Compare results
  console.log('\n\n' + '='.repeat(60));
  console.log('COMPARISON RESULTS');
  console.log('='.repeat(60));

  console.log('\n📊 Image Loading:');
  console.log(`  Online:  ${onlineResults.imageLoaded ? '✅ Image loaded' : '❌ No image'} (docs: ${onlineResults.initialDocCount} → ${onlineResults.finalDocCount})`);
  console.log(`  Offline: ${offlineResults.imageLoaded ? '✅ Image loaded' : '❌ No image'} (docs: ${offlineResults.initialDocCount} → ${offlineResults.finalDocCount})`);

  console.log('\n📊 Drag/Drop Events:');
  console.log(`  Online:  ${onlineResults.dragDropEvents.length} events`);
  console.log(`  Offline: ${offlineResults.dragDropEvents.length} events`);

  if (onlineResults.dragDropEvents.length > 0) {
    console.log('\n  Online events:', onlineResults.dragDropEvents.map(e => e.type).join(', '));
  }
  if (offlineResults.dragDropEvents.length > 0) {
    console.log('  Offline events:', offlineResults.dragDropEvents.map(e => e.type).join(', '));
  }

  console.log('\n📊 Errors:');
  console.log(`  Online:  ${onlineResults.errors.length} errors, ${onlineResults.dragDropErrors.length} drag/drop errors`);
  console.log(`  Offline: ${offlineResults.errors.length} errors, ${offlineResults.dragDropErrors.length} drag/drop errors`);

  if (offlineResults.errors.length > 0) {
    console.log('\n  Offline errors:');
    offlineResults.errors.forEach(err => console.log(`    - ${err.message}`));
  }

  console.log('\n📊 File API Support:');
  console.log('  Online:');
  Object.entries(onlineResults.fileHandling).forEach(([key, val]) => {
    console.log(`    ${key}: ${val ? '✅' : '❌'}`);
  });
  console.log('  Offline:');
  Object.entries(offlineResults.fileHandling).forEach(([key, val]) => {
    console.log(`    ${key}: ${val ? '✅' : '❌'}`);
  });

  console.log('\n📊 File Menu:');
  console.log(`  Online:  ${onlineResults.fileMenuWorks ? '✅ Works' : '❌ Failed'}`);
  console.log(`  Offline: ${offlineResults.fileMenuWorks ? '✅ Works' : '❌ Failed'}`);

  console.log('\n📊 Failed Network Requests (Offline):');
  if (offlineResults.failedRequests.length === 0) {
    console.log('  ✅ No failed requests');
  } else {
    offlineResults.failedRequests.slice(0, 5).forEach(req => {
      console.log(`  ❌ ${req.url}`);
      console.log(`     ${req.failure?.errorText || 'Unknown error'}`);
    });
  }

  // Save detailed results
  const report = {
    timestamp: new Date().toISOString(),
    online: onlineResults,
    offline: offlineResults,
    comparison: {
      imageLoadedOnline: onlineResults.imageLoaded,
      imageLoadedOffline: offlineResults.imageLoaded,
      bothWork: onlineResults.imageLoaded && offlineResults.imageLoaded,
      onlineWorksOfflineFails: onlineResults.imageLoaded && !offlineResults.imageLoaded,
      neitherWorks: !onlineResults.imageLoaded && !offlineResults.imageLoaded
    }
  };

  fs.writeFileSync('dragdrop-test-report.json', JSON.stringify(report, null, 2));
  console.log('\n✅ Detailed report saved to: dragdrop-test-report.json');

  // Conclusion
  console.log('\n' + '='.repeat(60));
  console.log('CONCLUSION');
  console.log('='.repeat(60));

  if (report.comparison.bothWork) {
    console.log('✅ Drag/drop works BOTH online and offline!');
    console.log('   No additional patches needed.');
  } else if (report.comparison.onlineWorksOfflineFails) {
    console.log('⚠️  Drag/drop works ONLINE but FAILS offline!');
    console.log('   → Need to find and patch additional environment protection');
    console.log('   → Check dragdrop-test-report.json for error details');
  } else if (report.comparison.neitherWorks) {
    console.log('ℹ️  Drag/drop does NOT work in either version');
    console.log('   → May require specific user interaction we didn\'t simulate');
    console.log('   → Or feature works differently than expected');
  } else {
    console.log('🤔 Unexpected result - offline works but online doesn\'t?');
    console.log('   → Check dragdrop-test-report.json for details');
  }

  console.log('\n');
}

main().catch(console.error);
