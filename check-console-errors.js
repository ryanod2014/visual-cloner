import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Arrays to store captured messages and errors
  const consoleMessages = [];
  const pageErrors = [];

  // Capture all console messages
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location()
    });
  });

  // Capture page errors (uncaught exceptions)
  page.on('pageerror', error => {
    pageErrors.push({
      message: error.message,
      stack: error.stack
    });
  });

  // Capture failed requests
  const failedRequests = [];
  page.on('requestfailed', request => {
    failedRequests.push({
      url: request.url(),
      failure: request.failure()
    });
  });

  console.log('Loading http://localhost:3333/#app...\n');

  try {
    await page.goto('http://localhost:3333/#app', {
      waitUntil: 'networkidle',
      timeout: 10000
    });
  } catch (e) {
    console.log(`Navigation warning: ${e.message}\n`);
  }

  // Wait 5 seconds for scripts to execute
  console.log('Waiting 5 seconds for scripts to execute...\n');
  await page.waitForTimeout(5000);

  // Check for global objects
  const globalCheck = await page.evaluate(() => {
    return {
      hasJ: typeof J !== 'undefined',
      hasJType: typeof J,
      hasFj: typeof fj !== 'undefined',
      hasFjType: typeof fj,
      hasGA: typeof gA !== 'undefined',
      hasGAType: typeof gA,
      windowKeys: Object.keys(window).slice(0, 50) // First 50 keys
    };
  });

  // Report findings
  console.log('=== CONSOLE MESSAGES ===');
  if (consoleMessages.length === 0) {
    console.log('No console messages captured.\n');
  } else {
    consoleMessages.forEach((msg, idx) => {
      console.log(`[${idx + 1}] [${msg.type.toUpperCase()}] ${msg.text}`);
      if (msg.location && msg.location.url) {
        console.log(`    Location: ${msg.location.url}:${msg.location.lineNumber}:${msg.location.columnNumber}`);
      }
    });
    console.log('');
  }

  console.log('=== PAGE ERRORS (Uncaught Exceptions) ===');
  if (pageErrors.length === 0) {
    console.log('No page errors captured.\n');
  } else {
    pageErrors.forEach((err, idx) => {
      console.log(`[${idx + 1}] ${err.message}`);
      if (err.stack) {
        console.log(`Stack: ${err.stack.substring(0, 500)}`);
      }
      console.log('');
    });
  }

  console.log('=== FAILED REQUESTS ===');
  if (failedRequests.length === 0) {
    console.log('No failed requests.\n');
  } else {
    failedRequests.forEach((req, idx) => {
      console.log(`[${idx + 1}] ${req.url}`);
      console.log(`    Failure: ${req.failure ? req.failure.errorText : 'Unknown'}`);
    });
    console.log('');
  }

  console.log('=== GLOBAL OBJECTS CHECK ===');
  console.log(`J exists: ${globalCheck.hasJ} (type: ${globalCheck.hasJType})`);
  console.log(`fj exists: ${globalCheck.hasFj} (type: ${globalCheck.hasFjType})`);
  console.log(`gA exists: ${globalCheck.hasGA} (type: ${globalCheck.hasGAType})`);
  console.log('');

  console.log('=== WINDOW KEYS (first 50) ===');
  console.log(globalCheck.windowKeys.join(', '));
  console.log('');

  console.log('=== DIAGNOSIS ===');

  // Analyze the results
  const errors = consoleMessages.filter(m => m.type === 'error');
  const warnings = consoleMessages.filter(m => m.type === 'warning');

  if (pageErrors.length > 0) {
    console.log('Most likely reason: UNCAUGHT JAVASCRIPT EXCEPTIONS');
    console.log('The scripts loaded but threw errors during execution.');
    console.log(`Found ${pageErrors.length} uncaught exception(s).`);
  } else if (errors.length > 0) {
    console.log('Most likely reason: CONSOLE ERRORS DURING EXECUTION');
    console.log('The scripts loaded but logged errors.');
    console.log(`Found ${errors.length} console error(s).`);
  } else if (failedRequests.length > 0) {
    console.log('Most likely reason: DEPENDENCY LOADING FAILURES');
    console.log('Some resources failed to load.');
    console.log(`Found ${failedRequests.length} failed request(s).`);
  } else if (!globalCheck.hasJ && !globalCheck.hasFj && !globalCheck.hasGA) {
    console.log('Most likely reason: SCRIPTS NOT EXECUTING OR WRONG SCOPE');
    console.log('Scripts loaded successfully but globals are not defined.');
    console.log('Possible causes: CSP issues, module scope, or conditional execution.');
  } else {
    console.log('Scripts appear to be working correctly.');
    console.log('All expected global objects are defined.');
  }

  await browser.close();
})();
