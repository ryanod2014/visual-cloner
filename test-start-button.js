import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => {
  if (msg.type() === 'error') {
    console.log('[ERROR]', msg.text().slice(0, 150));
  }
});

console.log('Loading offline version...');
await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Screenshot before clicking start
await page.screenshot({ path: '/tmp/before-start.png' });
console.log('Before screenshot: /tmp/before-start.png');

// Click Start using Photopea
console.log('Clicking "Start using Photopea"...');
try {
  await page.click('text=/start using photopea/i', { timeout: 5000 });
  console.log('Clicked!');
} catch (e) {
  console.log('Click failed:', e.message);
}

await page.waitForTimeout(3000);

// Screenshot after
await page.screenshot({ path: '/tmp/after-start.png' });
console.log('After screenshot: /tmp/after-start.png');

// Check what's visible now
const state = await page.evaluate(() => {
  return {
    hasNewProject: document.body.innerHTML.includes('New Project'),
    hasOpenFromComputer: document.body.innerHTML.includes('Open From Computer'),
    hasFileMenu: document.body.innerHTML.includes('>File<'),
    hasEditMenu: document.body.innerHTML.includes('>Edit<'),
    bodyClasses: document.body.className,
    title: document.title,
  };
});
console.log('State after start:', state);

// If app loaded, try clicking New Project
if (state.hasNewProject) {
  console.log('\nApp loaded! Trying to click "New Project"...');

  await page.click('text=/new project/i');
  await page.waitForTimeout(2000);

  await page.screenshot({ path: '/tmp/after-new-project.png' });
  console.log('After New Project: /tmp/after-new-project.png');

  const dialogState = await page.evaluate(() => {
    return {
      hasWidth: document.body.innerHTML.includes('Width'),
      hasCreate: document.body.innerHTML.includes('Create'),
      windowCount: document.querySelectorAll('.window').length,
    };
  });
  console.log('Dialog state:', dialogState);
}

console.log('\nBrowser staying open...');
await new Promise(() => {});
