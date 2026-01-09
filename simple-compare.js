import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });

// Test offline
console.log('=== OFFLINE ===');
const page = await browser.newPage();

page.on('console', msg => {
  if (msg.type() === 'error') {
    console.log('[ERROR]', msg.text().slice(0, 100));
  }
});

page.on('pageerror', err => {
  console.log('[PAGE ERROR]', err.message.slice(0, 100));
});

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);

// Check if home screen is visible
const homeInfo = await page.evaluate(() => {
  const newProjectBtn = [...document.querySelectorAll('*')].find(el =>
    el.textContent?.toLowerCase().includes('new project') &&
    el.textContent.length < 50
  );
  return {
    found: !!newProjectBtn,
    tag: newProjectBtn?.tagName,
    text: newProjectBtn?.textContent?.slice(0, 30),
    visible: newProjectBtn ? window.getComputedStyle(newProjectBtn).display !== 'none' : false,
  };
});
console.log('New Project button:', homeInfo);

if (homeInfo.found) {
  // Try clicking via evaluate to catch any errors
  console.log('\nClicking New Project...');
  const clickResult = await page.evaluate(() => {
    try {
      const btn = [...document.querySelectorAll('*')].find(el =>
        el.textContent?.toLowerCase().includes('new project') &&
        el.textContent.length < 50
      );
      if (btn) {
        btn.click();
        return { clicked: true };
      }
      return { clicked: false, reason: 'button not found' };
    } catch (e) {
      return { clicked: false, error: e.message };
    }
  });
  console.log('Click result:', clickResult);

  await page.waitForTimeout(2000);

  // Check if anything changed
  const afterClick = await page.evaluate(() => {
    const dialogs = document.querySelectorAll('.window, .popup, .modal, [class*="dialog"]');
    const widthInputs = [...document.querySelectorAll('*')].filter(el =>
      el.textContent?.includes('Width')
    );
    return {
      dialogsFound: dialogs.length,
      widthTextFound: widthInputs.length,
      bodyChildren: document.body.children.length,
    };
  });
  console.log('After click:', afterClick);
}

await page.screenshot({ path: '/tmp/offline-simple.png' });
console.log('Screenshot: /tmp/offline-simple.png');

// Now test REAL
console.log('\n=== REAL ===');
const page2 = await browser.newPage();
await page2.goto('https://www.photopea.com', { waitUntil: 'networkidle' });
await page2.waitForTimeout(4000);

const realHomeInfo = await page2.evaluate(() => {
  const btn = [...document.querySelectorAll('*')].find(el =>
    el.textContent?.toLowerCase().includes('new project') &&
    el.textContent.length < 50
  );
  return { found: !!btn };
});
console.log('Real New Project button:', realHomeInfo);

if (realHomeInfo.found) {
  await page2.evaluate(() => {
    const btn = [...document.querySelectorAll('*')].find(el =>
      el.textContent?.toLowerCase().includes('new project') &&
      el.textContent.length < 50
    );
    btn?.click();
  });

  await page2.waitForTimeout(2000);

  const realAfter = await page2.evaluate(() => {
    const dialogs = document.querySelectorAll('.window, .popup, .modal');
    return {
      dialogsFound: dialogs.length,
      dialogClasses: [...dialogs].map(d => d.className).slice(0, 3),
    };
  });
  console.log('Real after click:', realAfter);
}

await page2.screenshot({ path: '/tmp/real-simple.png' });
console.log('Real screenshot: /tmp/real-simple.png');

console.log('\n\nCompare screenshots and dialog counts');
await new Promise(() => {});
