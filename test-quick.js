import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  page.on('console', msg => console.log('[BROWSER]:', msg.text()));

  await page.goto('http://localhost:3339', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  const check = await page.evaluate(() => {
    return {
      J: typeof window.J,
      fj: typeof window.fj,
      gA: typeof window.gA,
      keys: Object.keys(window).filter(k => k.length <= 2).slice(0, 20)
    };
  });

  console.log('Globals:', check);
  console.log('Short window keys:', check.keys);

  await page.waitForTimeout(300000);
  await browser.close();
})();
