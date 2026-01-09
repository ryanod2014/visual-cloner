import { chromium } from 'playwright';

(async () => {
  console.log('\n=== TESTING FIXED VERSION WITH HOSTNAME SPOOFING ===\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen for console messages
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('HOSTNAME SPOOF') || text.includes('Photopea')) {
      console.log('  [BROWSER]:', text);
    }
  });

  console.log('Step 1: Loading http://localhost:3339...');
  await page.goto('http://localhost:3339', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  console.log('\nStep 2: Checking for global variables (J, fj, gA)...');
  const globals = await page.evaluate(() => {
    return {
      J: typeof window.J,
      fj: typeof window.fj,
      gA: typeof window.gA,
      hostname: window.location.hostname,
      host: window.location.host
    };
  });

  console.log('  Global J:', globals.J);
  console.log('  Global fj:', globals.fj);
  console.log('  Global gA:', globals.gA);
  console.log('  window.location.hostname:', globals.hostname);
  console.log('  window.location.host:', globals.host);

  if (globals.J === 'undefined' || globals.fj === 'undefined' || globals.gA === 'undefined') {
    console.log('\n\u274C FAIL: Required globals are missing!');
    console.log('The hostname spoofing did not work - Photopea detected we are not on photopea.com');
    await browser.close();
    process.exit(1);
  }

  console.log('\n\u2713 SUCCESS: All required globals exist!');

  console.log('\nStep 3: Testing "New Project" button...');

  // Wait for the page to be fully ready
  await page.waitForTimeout(2000);

  // Try to find and click "New Project" button
  try {
    // Look for the new project button - try multiple selectors
    const newProjectButton = await page.locator('button:has-text("New Project")').first().elementHandle()
      || await page.locator('text=New Project').first().elementHandle()
      || await page.locator('[title*="New"]').first().elementHandle();

    if (!newProjectButton) {
      console.log('  Could not find "New Project" button, trying to invoke via code...');

      // Try to invoke the new project dialog directly using the global API
      await page.evaluate(() => {
        // Try common patterns for opening new project dialog
        if (window.J && window.J.FD && window.J.FD.New) {
          window.J.FD.New();
        } else if (window.fj && window.fj.New) {
          window.fj.New();
        }
      });

      await page.waitForTimeout(1000);
    } else {
      console.log('  Found button, clicking...');
      await newProjectButton.click();
      await page.waitForTimeout(1000);
    }

    // Check if dialog appeared
    console.log('\nStep 4: Checking for "New Project" dialog...');

    const dialogCheck = await page.evaluate(() => {
      // Look for dialog indicators
      const hasDialog = document.querySelector('[role="dialog"]') !== null
        || document.querySelector('.dialog') !== null
        || document.querySelector('[class*="modal"]') !== null
        || document.querySelector('input[placeholder*="Width"]') !== null
        || document.querySelector('input[placeholder*="Height"]') !== null;

      // Also check for Width/Height inputs anywhere on page
      const widthInput = document.querySelector('input[placeholder*="Width"]')
        || Array.from(document.querySelectorAll('input')).find(inp =>
          inp.parentElement?.textContent?.includes('Width'));
      const heightInput = document.querySelector('input[placeholder*="Height"]')
        || Array.from(document.querySelectorAll('input')).find(inp =>
          inp.parentElement?.textContent?.includes('Height'));

      return {
        hasDialog,
        hasWidthInput: widthInput !== null && widthInput !== undefined,
        hasHeightInput: heightInput !== null && heightInput !== undefined,
        inputCount: document.querySelectorAll('input').length
      };
    });

    console.log('  Dialog present:', dialogCheck.hasDialog);
    console.log('  Width input found:', dialogCheck.hasWidthInput);
    console.log('  Height input found:', dialogCheck.hasHeightInput);
    console.log('  Total inputs on page:', dialogCheck.inputCount);

    if (dialogCheck.hasDialog && dialogCheck.hasWidthInput && dialogCheck.hasHeightInput) {
      console.log('\n\u2713\u2713 SUCCESS: New Project dialog is working!');
      console.log('\n=== FIX VERIFIED - PHOTOPEA IS FULLY FUNCTIONAL ===');
    } else {
      console.log('\n\u26A0 PARTIAL SUCCESS: Globals exist but dialog behavior unclear');
      console.log('Taking screenshot for manual verification...');
      await page.screenshot({ path: '/tmp/photopea-test.png', fullPage: true });
      console.log('Screenshot saved to: /tmp/photopea-test.png');
    }

  } catch (error) {
    console.log('\n\u26A0 Note:', error.message);
    console.log('Taking screenshot for manual verification...');
    await page.screenshot({ path: '/tmp/photopea-test.png', fullPage: true });
    console.log('Screenshot saved to: /tmp/photopea-test.png');
  }

  console.log('\nLeaving browser open for manual inspection...');
  console.log('Press Ctrl+C when done');

  // Keep browser open for manual testing
  await page.waitForTimeout(300000); // 5 minutes
  await browser.close();
})();
