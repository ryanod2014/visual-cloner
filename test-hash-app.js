import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Track console messages
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      args: msg.args()
    });
  });

  // Track page errors
  page.on('pageerror', error => {
    console.log('❌ Page Error:', error.message);
  });

  console.log('\n=== Testing #app Hash ===\n');
  console.log('Loading: http://localhost:3333/#app');

  try {
    await page.goto('http://localhost:3333/#app', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    console.log('\n--- Waiting 5 seconds ---\n');
    await page.waitForTimeout(5000);

    // Check console for errors
    console.log('=== Console Messages ===');
    const errors = consoleMessages.filter(msg => msg.type === 'error');
    if (errors.length === 0) {
      console.log('No console errors detected!');
    } else {
      console.log(`Found ${errors.length} console error(s):`);
      for (const error of errors) {
        console.log(`\n❌ ${error.text}`);
      }
    }

    // Check if globals exist
    const globals = await page.evaluate(() => ({
      J: typeof window.J,
      fj: typeof window.fj,
      gA: typeof window.gA,
      locStor: typeof window.locStor,
      showCap: typeof window.showCap
    }));

    console.log('\n=== Globals ===');
    console.log('window.J:', globals.J);
    console.log('window.fj:', globals.fj);
    console.log('window.gA:', globals.gA);
    console.log('window.locStor:', globals.locStor);
    console.log('window.showCap:', globals.showCap);

    // Keep browser open
    console.log('\n--- Browser will stay open for 30 seconds ---');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('Error during test:', error.message);
  } finally {
    await browser.close();
  }
})();
