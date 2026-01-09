import { chromium } from 'playwright';

/**
 * Diagnostic tool to determine if offline failure is due to:
 * 1. Backend API dependency
 * 2. Incomplete extraction
 */

async function diagnoseApp(url, action, description) {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const diagnostics = {
    networkRequests: [],
    errors: [],
    unhandledPromises: [],
    stateSnapshot: null,
    resourceFailures: [],
  };

  // 1. Monitor network requests
  page.on('request', request => {
    diagnostics.networkRequests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      time: Date.now(),
    });
  });

  page.on('requestfailed', request => {
    diagnostics.resourceFailures.push({
      url: request.url(),
      failure: request.failure().errorText,
    });
  });

  // 2. Monitor errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      diagnostics.errors.push(msg.text());
    }
  });

  page.on('pageerror', error => {
    diagnostics.errors.push(error.message);
  });

  // 3. Inject error catchers
  await page.addInitScript(() => {
    window.__diagnostics = {
      networkAttempts: [],
      errors: [],
      unhandledPromises: [],
    };

    // Catch fetch
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      window.__diagnostics.networkAttempts.push({
        type: 'fetch',
        url: args[0],
        time: Date.now(),
      });
      console.log('[DIAGNOSTIC] Fetch attempt:', args[0]);
      return originalFetch(...args);
    };

    // Catch XHR
    const originalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
      const xhr = new originalXHR();
      const originalOpen = xhr.open;
      xhr.open = function(method, url) {
        window.__diagnostics.networkAttempts.push({
          type: 'xhr',
          method,
          url,
          time: Date.now(),
        });
        console.log('[DIAGNOSTIC] XHR attempt:', method, url);
        return originalOpen.apply(this, arguments);
      };
      return xhr;
    };

    // Catch errors
    window.addEventListener('error', (e) => {
      window.__diagnostics.errors.push({
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
      });
    });

    window.addEventListener('unhandledrejection', (e) => {
      window.__diagnostics.unhandledPromises.push({
        reason: e.reason?.toString(),
        promise: e.promise,
      });
    });
  });

  console.log(`\nLoading: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Take initial state snapshot
  const initialState = await page.evaluate(() => {
    const state = {
      globals: Object.keys(window).length,
      hasKey: (key) => window[key] !== undefined,
    };
    return state;
  });

  console.log(`\nInitial state: ${initialState.globals} global variables`);

  // Clear network requests before action
  diagnostics.networkRequests = [];

  const networkBeforeAction = await page.evaluate(() => window.__diagnostics.networkAttempts.length);

  console.log(`\n${description}`);
  await action(page);
  await page.waitForTimeout(2000);

  // Collect diagnostics after action
  const afterAction = await page.evaluate(() => ({
    networkAttempts: window.__diagnostics.networkAttempts,
    errors: window.__diagnostics.errors,
    unhandledPromises: window.__diagnostics.unhandledPromises,
  }));

  const networkAfterAction = afterAction.networkAttempts.length;

  // Analysis
  console.log('\n=== DIAGNOSTIC RESULTS ===\n');

  // Network requests during action
  const newNetworkRequests = diagnostics.networkRequests.filter(r =>
    r.resourceType === 'fetch' || r.resourceType === 'xhr'
  );
  const clientNetworkAttempts = afterAction.networkAttempts.slice(networkBeforeAction);

  console.log(`Network Requests: ${newNetworkRequests.length} Playwright detected`);
  console.log(`Network Attempts: ${clientNetworkAttempts.length} client-side intercepted`);

  if (clientNetworkAttempts.length > 0) {
    console.log('\n🚨 BACKEND API DEPENDENCY DETECTED');
    console.log('The action triggered network requests:');
    clientNetworkAttempts.forEach((req, i) => {
      console.log(`  ${i + 1}. ${req.type.toUpperCase()}: ${req.url}`);
    });
    console.log('\n→ Solution: Build API emulation layer for these endpoints\n');
  } else {
    console.log('✓ No network requests during action\n');
  }

  // Errors during action
  const actionErrors = afterAction.errors.slice(diagnostics.errors.length);
  console.log(`Errors: ${actionErrors.length}`);
  if (actionErrors.length > 0) {
    console.log('\n🔍 ERRORS DETECTED:');
    actionErrors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err.message || err}`);
      console.log(`     at ${err.filename}:${err.lineno}`);
    });

    // Categorize errors
    const hasUndefinedErrors = actionErrors.some(e =>
      e.message?.includes('undefined') || e.message?.includes('null')
    );
    const hasReferenceErrors = actionErrors.some(e =>
      e.message?.includes('ReferenceError')
    );
    const hasNetworkErrors = actionErrors.some(e =>
      e.message?.includes('fetch') || e.message?.includes('Network')
    );

    if (hasNetworkErrors) {
      console.log('\n🚨 BACKEND API DEPENDENCY DETECTED (via errors)');
      console.log('→ Solution: Build API emulation layer\n');
    } else if (hasUndefinedErrors || hasReferenceErrors) {
      console.log('\n⚠️  INCOMPLETE EXTRACTION DETECTED');
      console.log('→ Solution: Missing initialization or resources\n');
    }
  } else {
    console.log('✓ No errors during action\n');
  }

  // Resource failures
  console.log(`Resource Failures: ${diagnostics.resourceFailures.length}`);
  if (diagnostics.resourceFailures.length > 0) {
    console.log('\n⚠️  RESOURCE LOADING FAILURES:');
    diagnostics.resourceFailures.forEach((fail, i) => {
      console.log(`  ${i + 1}. ${fail.url}`);
      console.log(`     Error: ${fail.failure}`);
    });
    console.log('\n→ Solution: Capture missing resources during extraction\n');
  } else {
    console.log('✓ All resources loaded successfully\n');
  }

  // Unhandled promises
  console.log(`Unhandled Promises: ${afterAction.unhandledPromises.length}`);
  if (afterAction.unhandledPromises.length > 0) {
    console.log('\n🔍 PROMISE REJECTIONS:');
    afterAction.unhandledPromises.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.reason}`);
    });
    console.log();
  } else {
    console.log('✓ No unhandled promise rejections\n');
  }

  // Final diagnosis
  console.log('\n=== DIAGNOSIS ===\n');

  if (clientNetworkAttempts.length > 0) {
    console.log('PRIMARY ISSUE: Backend API Dependency');
    console.log('TYPE: The feature requires server endpoints');
    console.log('SOLUTION: Implement API emulation or capture API responses');
  } else if (diagnostics.resourceFailures.length > 0) {
    console.log('PRIMARY ISSUE: Incomplete Extraction');
    console.log('TYPE: Missing resources (scripts, CSS, assets)');
    console.log('SOLUTION: Improve extraction to capture all dependencies');
  } else if (actionErrors.length > 0) {
    console.log('PRIMARY ISSUE: Missing Initialization or State');
    console.log('TYPE: Code expects data/objects that aren\'t present');
    console.log('SOLUTION: Trace initialization sequence on live site');
  } else {
    console.log('UNCLEAR: No obvious errors detected');
    console.log('SOLUTION: Use deeper tracing (patch functions, compare states)');
  }

  console.log('\n\nBrowser staying open for manual inspection...');
  await new Promise(() => {});
}

// Test with Photopea offline version
const photopeaUrl = 'http://localhost:3333';

await diagnoseApp(
  photopeaUrl,
  async (page) => {
    // Navigate to app
    await page.click('text=/start using photopea/i');
    await page.waitForTimeout(2000);

    // Trigger the problematic action
    await page.click('text=/new project/i');
  },
  'Clicking "New Project" button'
);
