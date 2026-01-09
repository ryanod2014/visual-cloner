import { chromium } from 'playwright';

async function test() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Collect all network requests
  const requests = [];
  page.on('request', req => {
    if (req.url().includes('localhost')) {
      console.log(`[REQUEST] ${req.method()} ${req.url()}`);
      requests.push(req.url());
    }
  });

  page.on('response', async resp => {
    if (resp.url().includes('localhost')) {
      console.log(`[RESPONSE] ${resp.status()} ${resp.url()}`);
    }
  });

  page.on('console', msg => console.log(`[CONSOLE ${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.log(`[ERROR]:`, err.message));

  console.log('Loading http://localhost:3339...\n');
  await page.goto('http://localhost:3339');

  console.log('\n Waiting 3 seconds...\n');
  await page.waitForTimeout(3000);

  console.log('\nLooking for "Start using Photopea" button...');
  const button = await page.locator('button:has-text("Start using Photopea")').first();
  if (await button.isVisible()) {
    console.log('Found button, clicking...\n');
    await button.click();

    console.log('Waiting 5 seconds after click...\n');
    await page.waitForTimeout(5000);

    console.log('\n=== SUMMARY OF REQUESTS ===');
    console.log(`Total requests to localhost: ${requests.length}`);

    const byPort = {};
    requests.forEach(url => {
      const match = url.match(/localhost:(\d+)/);
      if (match) {
        const port = match[1];
        byPort[port] = (byPort[port] || 0) + 1;
      }
    });

    console.log('Requests by port:', byPort);
  }

  console.log('\nClosing in 3 seconds...');
  await page.waitForTimeout(3000);
  await browser.close();
}

test().catch(console.error);
