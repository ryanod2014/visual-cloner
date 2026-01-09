import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => {
  const text = msg.text();
  if (!text.includes('Attestation') && !text.includes('googletag')) {
    console.log('[browser]', text.slice(0, 150));
  }
});

await page.goto('http://localhost:3333', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Click start
try {
  await page.click('text=/start using photopea/i', { timeout: 3000 });
  await page.waitForTimeout(3000);
} catch (e) {}

// Find the tool sidebar (left panel with tool icons)
const toolInfo = await page.evaluate(() => {
  // The tools are usually SVG icons or canvas elements in the left sidebar
  const allDivs = document.querySelectorAll('div');
  const toolCandidates = [];

  allDivs.forEach(div => {
    const rect = div.getBoundingClientRect();
    // Left sidebar tools are typically: x < 50, y between 50-500, small squares
    if (rect.left < 50 && rect.top > 50 && rect.top < 500 &&
        rect.width > 15 && rect.width < 50 && rect.height > 15 && rect.height < 50) {
      toolCandidates.push({
        tag: div.tagName,
        class: div.className?.slice(0, 30),
        x: rect.left,
        y: rect.top,
        w: rect.width,
        h: rect.height,
        hasCanvas: !!div.querySelector('canvas'),
        hasSvg: !!div.querySelector('svg'),
      });
    }
  });

  return {
    count: toolCandidates.length,
    tools: toolCandidates.slice(0, 10),
  };
});

console.log('Tool candidates found:', toolInfo.count);
console.log('First few tools:', toolInfo.tools);

// Click on first tool area
if (toolInfo.tools.length > 0) {
  const tool = toolInfo.tools[0];
  console.log(`\nClicking tool at (${tool.x + tool.w/2}, ${tool.y + tool.h/2})...`);

  // Monitor what happens
  await page.evaluate(() => {
    window.__toolClickLog = [];
    document.addEventListener('click', e => {
      window.__toolClickLog.push({
        target: e.target.tagName + '.' + (e.target.className || '').slice(0, 20),
        x: e.clientX,
        y: e.clientY,
      });
    }, true);
  });

  await page.mouse.click(tool.x + tool.w/2, tool.y + tool.h/2);
  await page.waitForTimeout(1000);

  const clickLog = await page.evaluate(() => window.__toolClickLog);
  console.log('Click captured:', clickLog);

  // Check if anything changed in the UI
  await page.screenshot({ path: '/tmp/after-tool-click.png' });
  console.log('Screenshot: /tmp/after-tool-click.png');
}

// Now test on real Photopea for comparison
console.log('\n\n=== Testing REAL Photopea ===');
const page2 = await browser.newPage();
await page2.goto('https://www.photopea.com', { waitUntil: 'networkidle' });
await page2.waitForTimeout(3000);

try {
  await page2.click('text=/start using photopea/i', { timeout: 3000 });
  await page2.waitForTimeout(3000);
} catch (e) {}

const realToolInfo = await page2.evaluate(() => {
  const allDivs = document.querySelectorAll('div');
  const toolCandidates = [];

  allDivs.forEach(div => {
    const rect = div.getBoundingClientRect();
    if (rect.left < 50 && rect.top > 50 && rect.top < 500 &&
        rect.width > 15 && rect.width < 50 && rect.height > 15 && rect.height < 50) {
      toolCandidates.push({
        x: rect.left, y: rect.top, w: rect.width, h: rect.height,
        class: div.className?.slice(0, 30),
      });
    }
  });

  return toolCandidates.slice(0, 10);
});

console.log('Real Photopea tools:', realToolInfo);

if (realToolInfo.length > 0) {
  const tool = realToolInfo[0];
  console.log(`Clicking real tool at (${tool.x + tool.w/2}, ${tool.y + tool.h/2})...`);
  await page2.mouse.click(tool.x + tool.w/2, tool.y + tool.h/2);
  await page2.waitForTimeout(1000);
  await page2.screenshot({ path: '/tmp/real-after-tool-click.png' });
  console.log('Real screenshot: /tmp/real-after-tool-click.png');
}

console.log('\nCompare the two screenshots to see if tools respond differently');
await new Promise(() => {});
