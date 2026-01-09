import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Track network requests
  const jsFiles = [];
  const failedRequests = [];

  page.on('response', async response => {
    if (response.url().endsWith('.js')) {
      jsFiles.push({
        url: response.url(),
        status: response.status(),
        ok: response.ok()
      });

      if (!response.ok()) {
        failedRequests.push({
          url: response.url(),
          status: response.status()
        });
      }
    }
  });

  // Track console messages
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location()
    });
  });

  console.log('\n=== Testing Query Parameter Approach ===\n');
  console.log('Loading: http://localhost:3333/?test=1');

  try {
    await page.goto('http://localhost:3333/?test=1', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    console.log('\n--- Waiting 5 seconds for scripts to load ---\n');
    await page.waitForTimeout(5000);

    // Check globals periodically
    console.log('\n--- Checking globals over time ---');
    for (let i = 0; i < 5; i++) {
      const check = await page.evaluate(() => ({
        J: typeof window.J,
        fj: typeof window.fj,
        gA: typeof window.gA
      }));
      console.log(`${i * 2}s: J=${check.J}, fj=${check.fj}, gA=${check.gA}`);

      if (check.J !== 'undefined' && check.fj !== 'undefined' && check.gA !== 'undefined') {
        console.log('✅ All globals found!');
        break;
      }

      if (i < 4) await page.waitForTimeout(2000);
    }
    console.log();

    // Check 0: Did conditional logic trigger?
    console.log('=== Check 0: Conditional Logic ===');
    const conditionalCheck = await page.evaluate(() => {
      const href = window.location.href;
      return {
        href: href,
        hasHash: href.indexOf("#") !== -1,
        hasEquals: href.indexOf("=") !== -1,
        shouldTrigger: href.indexOf("#") !== -1 || href.indexOf("=") !== -1,
        added: window.added || 'not defined',
        capDisplay: document.getElementById("cap")?.style.display || 'element not found'
      };
    });
    console.log('URL:', conditionalCheck.href);
    console.log('Contains #:', conditionalCheck.hasHash);
    console.log('Contains =:', conditionalCheck.hasEquals);
    console.log('Should trigger addPP():', conditionalCheck.shouldTrigger);
    console.log('addPP() was called (added flag):', conditionalCheck.added);
    console.log('Cap display style:', conditionalCheck.capDisplay);

    // Check 1: Did scripts load?
    console.log('=== Check 1: Script Loading ===');
    const photopeaScripts = jsFiles.filter(file =>
      file.url.includes('ext1767565813.js') ||
      file.url.includes('DBS1764527275.js') ||
      file.url.includes('pp1767826327.js')
    );
    console.log(`Total JS files loaded: ${jsFiles.length}`);
    console.log('All JS files:');
    jsFiles.forEach((file, idx) => {
      console.log(`  ${idx + 1}. ${file.url} [${file.status}]`);
    });

    if (failedRequests.length > 0) {
      console.log(`\n⚠️  Failed JS requests: ${failedRequests.length}`);
      failedRequests.forEach((file, idx) => {
        console.log(`  ${idx + 1}. ${file.url} [${file.status}]`);
      });
    }

    console.log(`\nPhotopea-related scripts: ${photopeaScripts.length}`);
    photopeaScripts.forEach((file, idx) => {
      console.log(`  ${idx + 1}. ${file.url} [${file.status}]`);
    });

    // Check 2: Do globals exist?
    console.log('\n=== Check 2: Global Variables ===');
    const globals = await page.evaluate(() => {
      // Check for all window properties
      const allGlobals = Object.keys(window).filter(key =>
        !key.startsWith('webkit') &&
        !key.startsWith('chrome') &&
        key.length < 20
      ).slice(0, 50);

      return {
        J: typeof window.J,
        fj: typeof window.fj,
        gA: typeof window.gA,
        Photopea: typeof window.Photopea,
        ku: typeof window.ku,
        locStor: typeof window.locStor,
        showCap: typeof window.showCap,
        hideCap: typeof window.hideCap,
        sampleGlobals: allGlobals
      };
    });
    console.log('window.J:', globals.J);
    console.log('window.fj:', globals.fj);
    console.log('window.gA:', globals.gA);
    console.log('window.Photopea:', globals.Photopea);
    console.log('window.ku:', globals.ku);
    console.log('window.locStor:', globals.locStor);
    console.log('window.showCap:', globals.showCap);
    console.log('window.hideCap:', globals.hideCap);
    console.log('\nSample of window globals:', globals.sampleGlobals.join(', '));

    const allGlobalsExist = globals.J !== 'undefined' &&
                           globals.fj !== 'undefined' &&
                           globals.gA !== 'undefined';
    console.log(`All required globals exist: ${allGlobalsExist}`);

    // Check 3: Console errors?
    console.log('\n=== Check 3: Console Errors ===');
    const errors = consoleMessages.filter(msg => msg.type === 'error');
    if (errors.length === 0) {
      console.log('No console errors detected!');
    } else {
      console.log(`Found ${errors.length} console error(s):`);
      errors.forEach((error, idx) => {
        console.log(`  ${idx + 1}. ${error.text}`);
        if (error.location) {
          console.log(`     Location: ${error.location.url}:${error.location.lineNumber}`);
        }
      });
    }

    // Check 4: Try clicking "New Project"
    if (allGlobalsExist && errors.length === 0) {
      console.log('\n=== Check 4: Testing "New Project" Button ===');

      // Wait a bit more to ensure UI is ready
      await page.waitForTimeout(2000);

      // Look for the New Project button
      try {
        const newProjectButton = await page.locator('text=New Project').first();
        const isVisible = await newProjectButton.isVisible({ timeout: 5000 });

        if (isVisible) {
          console.log('New Project button found and visible');
          console.log('Clicking New Project button...');
          await newProjectButton.click();

          // Wait for dialog to appear
          await page.waitForTimeout(2000);

          // Check if dialog appeared
          const dialogExists = await page.evaluate(() => {
            // Look for common dialog indicators
            const dialogs = document.querySelectorAll('[role="dialog"], .modal, .dialog');
            return dialogs.length > 0;
          });

          console.log(`Dialog appeared: ${dialogExists}`);

          if (dialogExists) {
            console.log('\n✅ SUCCESS! Dialog opened successfully!');
          } else {
            console.log('\n⚠️  Button clicked but no dialog detected');
          }
        } else {
          console.log('New Project button not visible');
        }
      } catch (err) {
        console.log(`Could not find/click New Project button: ${err.message}`);
      }
    } else {
      console.log('\n⚠️  Skipping New Project test due to errors or missing globals');
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Scripts loaded: ${photopeaScripts.length >= 3 ? '✅' : '❌'}`);
    console.log(`Globals exist: ${allGlobalsExist ? '✅' : '❌'}`);
    console.log(`No console errors: ${errors.length === 0 ? '✅' : '❌'}`);

    // Keep browser open for inspection
    console.log('\n--- Browser will stay open for 30 seconds for inspection ---');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('Error during test:', error.message);
  } finally {
    await browser.close();
  }
})();
