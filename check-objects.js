import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => console.log('[browser]', msg.text().slice(0, 150)));

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('text=/start using photopea/i');
await page.waitForTimeout(2000);

// Check for the critical objects
const objects = await page.evaluate(() => {
  const result = {};

  // Check _ (underscore or Photopea namespace)
  result._ = {
    exists: typeof _ !== 'undefined',
    type: typeof _,
  };

  if (typeof _ !== 'undefined') {
    result._.E = typeof _.E;
    result._.m = typeof _.m;
    if (_.E) result._E_b = _.E.b;
    if (_.m) {
      result._m_eh = _.m.eh;
      result._m_pm = _.m.pm;
    }
  }

  // Check es (event class)
  result.es = {
    exists: typeof es !== 'undefined',
    type: typeof es,
  };

  // Check J (utility object)
  result.J = {
    exists: typeof J !== 'undefined',
    type: typeof J,
  };

  // Check common patterns
  result.lo = { exists: typeof lo !== 'undefined' }; // base class
  result.jI = { exists: typeof jI !== 'undefined' }; // storage/home UI

  // Try to find the home screen instance
  result.homeInstance = null;
  try {
    // The home screen buttons
    const bhoverSpans = document.querySelectorAll('.bhover');
    bhoverSpans.forEach(span => {
      if (span.textContent?.includes('New Project')) {
        // Try to access the instance via __proto__ or similar
        result.buttonFound = true;
        // Check if element has any associated data
        for (const key of Object.keys(span)) {
          if (key.startsWith('__')) {
            result.buttonDataKeys = result.buttonDataKeys || [];
            result.buttonDataKeys.push(key);
          }
        }
      }
    });
  } catch (e) {
    result.error = e.message;
  }

  return result;
});

console.log('\n=== Critical Objects Check ===');
console.log(JSON.stringify(objects, null, 2));

// Now compare with REAL Photopea
console.log('\n=== Comparing with REAL Photopea ===');
const page2 = await browser.newPage();
await page2.goto('https://www.photopea.com', { waitUntil: 'networkidle' });
await page2.waitForTimeout(2000);
await page2.click('text=/start using photopea/i');
await page2.waitForTimeout(2000);

const realObjects = await page2.evaluate(() => {
  const result = {};
  result._ = { exists: typeof _ !== 'undefined', type: typeof _ };
  if (typeof _ !== 'undefined') {
    result._.E = typeof _.E;
    result._.m = typeof _.m;
    if (_.E) result._E_b = _.E.b;
    if (_.m) {
      result._m_eh = _.m.eh;
      result._m_pm = _.m.pm;
    }
  }
  result.es = { exists: typeof es !== 'undefined', type: typeof es };
  result.J = { exists: typeof J !== 'undefined', type: typeof J };
  result.lo = { exists: typeof lo !== 'undefined' };
  result.jI = { exists: typeof jI !== 'undefined' };
  return result;
});

console.log(JSON.stringify(realObjects, null, 2));

// Key comparison
console.log('\n=== KEY DIFFERENCES ===');
console.log('_ exists: Offline=' + objects._.exists + ', Real=' + realObjects._.exists);
console.log('es exists: Offline=' + objects.es.exists + ', Real=' + realObjects.es.exists);
console.log('_.E.b: Offline=' + objects._E_b + ', Real=' + realObjects._E_b);
console.log('_.m.eh: Offline=' + objects._m_eh + ', Real=' + realObjects._m_eh);

await new Promise(() => {});
