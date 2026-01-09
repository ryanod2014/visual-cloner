import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Click start
await page.click('text=/start using photopea/i');
await page.waitForTimeout(2000);

// Click New Project
await page.click('text=/new project/i');
await page.waitForTimeout(1000);

// Find the Width element and check its visibility
const widthInfo = await page.evaluate(() => {
  const allElements = [...document.querySelectorAll('*')];
  const widthElements = allElements.filter(el =>
    el.textContent?.includes('Width') &&
    !el.textContent?.includes('max-width')
  );

  return widthElements.slice(0, 5).map(el => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    // Find parent chain
    let parent = el.parentElement;
    const parents = [];
    while (parent && parents.length < 5) {
      const pRect = parent.getBoundingClientRect();
      const pStyle = window.getComputedStyle(parent);
      parents.push({
        tag: parent.tagName,
        class: parent.className?.slice(0, 30),
        display: pStyle.display,
        visibility: pStyle.visibility,
        opacity: pStyle.opacity,
        position: pStyle.position,
        rect: { x: pRect.x, y: pRect.y, w: pRect.width, h: pRect.height },
      });
      parent = parent.parentElement;
    }

    return {
      tag: el.tagName,
      class: el.className?.slice(0, 30),
      text: el.textContent?.slice(0, 30),
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      position: style.position,
      zIndex: style.zIndex,
      parents,
    };
  });
});

console.log('Width elements found:', widthInfo.length);
widthInfo.forEach((el, i) => {
  console.log(`\n--- Element ${i} ---`);
  console.log(`Tag: ${el.tag}, Class: ${el.class}`);
  console.log(`Text: ${el.text}`);
  console.log(`Rect: x=${el.rect.x}, y=${el.rect.y}, w=${el.rect.w}, h=${el.rect.h}`);
  console.log(`Display: ${el.display}, Visibility: ${el.visibility}, Opacity: ${el.opacity}`);
  console.log(`Position: ${el.position}, Z-Index: ${el.zIndex}`);
  console.log('Parent chain:');
  el.parents.forEach((p, j) => {
    console.log(`  ${j}: ${p.tag}.${p.class} - display:${p.display} vis:${p.visibility} pos:${p.position}`);
    console.log(`     rect: x=${p.rect.x}, y=${p.rect.y}, w=${p.rect.w}, h=${p.rect.h}`);
  });
});

// Check for any .window elements
const windowElements = await page.evaluate(() => {
  const windows = document.querySelectorAll('.window, [class*="window"], [class*="dialog"], [class*="popup"]');
  return [...windows].map(w => ({
    class: w.className,
    display: window.getComputedStyle(w).display,
    rect: w.getBoundingClientRect(),
  }));
});
console.log('\n\nWindow/dialog elements:', windowElements);

await new Promise(() => {});
