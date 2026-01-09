import { chromium } from 'playwright';

/**
 * Check if the main Photopea scripts are loading correctly
 */

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

const scriptLoads = {
  succeeded: [],
  failed: [],
};

// Monitor all script loads
page.on('response', response => {
  const url = response.url();
  const status = response.status();

  if (url.includes('.js')) {
    if (status >= 200 && status < 300) {
      scriptLoads.succeeded.push(url);
    } else {
      scriptLoads.failed.push({ url, status });
    }
  }
});

console.log('Loading offline Photopea...');
await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

console.log('\n=== Script Loading Results ===');
console.log(`Succeeded: ${scriptLoads.succeeded.length}`);
console.log(`Failed: ${scriptLoads.failed.length}`);

if (scriptLoads.failed.length > 0) {
  console.log('\n❌ Failed script loads:');
  scriptLoads.failed.forEach(fail => {
    console.log(`  ${fail.status}: ${fail.url}`);
  });
}

// Check which key scripts loaded
const keyScripts = [
  'pp1767826327.js',
  'DBS1764527275.js',
  'ext1767565813.js',
  'r9.js',
];

console.log('\n=== Key Scripts ===');
keyScripts.forEach(script => {
  const loaded = scriptLoads.succeeded.some(url => url.includes(script));
  console.log(`${loaded ? '✅' : '❌'} ${script}`);
});

// Check if main app object exists
const appCheck = await page.evaluate(() => {
  const checks = {
    hasWindow: typeof window !== 'undefined',
    windowKeys: Object.keys(window).length,
    hasDocument: typeof document !== 'undefined',
    bodyChildren: document.body?.children.length,
  };

  // Look for common Photopea globals
  const globals = ['J', 'fj', 'gA', 'iW', 'bh', 'lo'];
  checks.globals = {};
  globals.forEach(g => {
    checks.globals[g] = typeof window[g] !== 'undefined';
  });

  return checks;
});

console.log('\n=== App Initialization Check ===');
console.log('Window keys:', appCheck.windowKeys);
console.log('Body children:', appCheck.bodyChildren);
console.log('\nGlobal objects:');
Object.entries(appCheck.globals).forEach(([name, exists]) => {
  console.log(`  ${exists ? '✅' : '❌'} ${name}`);
});

// Try to click Start button
console.log('\n=== Testing Start Button ===');
try {
  await page.click('text=/start using photopea/i', { timeout: 5000 });
  console.log('✅ Start button clicked');
  await page.waitForTimeout(2000);
} catch (e) {
  console.log('❌ Start button not found or not clickable');
}

// Check for New Project button
const newProjectCheck = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('*'));
  const newProjectButtons = buttons.filter(el => {
    const text = (el.textContent || '').toLowerCase();
    return text.includes('new project') && el.children.length === 0;
  });

  return {
    found: newProjectButtons.length > 0,
    count: newProjectButtons.length,
    visible: newProjectButtons.some(btn => btn.offsetParent !== null),
  };
});

console.log('\n=== New Project Button ===');
console.log('Found:', newProjectCheck.found);
console.log('Count:', newProjectCheck.count);
console.log('Visible:', newProjectCheck.visible);

console.log('\n\nBrowser staying open for inspection...');
console.log('Check the browser console for any errors!');
await new Promise(() => {});
