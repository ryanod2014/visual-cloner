#!/usr/bin/env node
import { chromium } from 'playwright';

console.log('Finding and dismissing landing page overlay\n');

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

console.log('Loading page...');
await page.goto('http://localhost:3342/?test=1', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(5000);

// Find and remove landing page overlay
const dismissed = await page.evaluate(() => {
  // Strategy 1: Look for overlay/modal elements
  const overlays = Array.from(document.querySelectorAll('div')).filter(div => {
    const style = window.getComputedStyle(div);
    return (
      style.position === 'fixed' &&
      (style.zIndex > 1000 || div.className.includes('overlay') || div.className.includes('modal'))
    );
  });

  console.log('Found', overlays.length, 'potential overlay elements');

  if (overlays.length > 0) {
    // Try removing them
    overlays.forEach((overlay, i) => {
      console.log('Removing overlay', i, overlay.className);
      overlay.remove();
    });
    return { method: 'removed overlays', count: overlays.length };
  }

  // Strategy 2: Look for "Start using" or close buttons
  const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'));
  const startBtn = buttons.find(btn => /start.*using/i.test(btn.textContent));
  const closeBtn = buttons.find(btn => /close|dismiss|×|✕/i.test(btn.textContent));

  if (startBtn) {
    console.log('Clicking "Start using" button');
    startBtn.click();
    return { method: 'clicked start button', text: startBtn.textContent };
  }

  if (closeBtn) {
    console.log('Clicking close button');
    closeBtn.click();
    return { method: 'clicked close button', text: closeBtn.textContent };
  }

  // Strategy 3: Hide large top-level divs that might be landing pages
  const largeDivs = Array.from(document.body.children).filter(el => {
    return el.tagName === 'DIV' && el.offsetParent !== null;
  });

  if (largeDivs.length > 1) {
    // Keep only the last one (likely the actual app)
    for (let i = 0; i < largeDivs.length - 1; i++) {
      const div = largeDivs[i];
      if (div.textContent.includes('Free Online Photo Editor')) {
        console.log('Hiding landing page div');
        div.style.display = 'none';
        return { method: 'hid landing div', index: i };
      }
    }
  }

  return { method: 'none', message: 'Could not find landing page to dismiss' };
});

console.log('Dismiss result:', JSON.stringify(dismissed, null, 2));

console.log('\nWaiting 3 seconds for app to appear...');
await page.waitForTimeout(3000);

// Check if we can now see the app
const appVisible = await page.evaluate(() => {
  // Look for Photopea's actual toolbar
  const toolbars = Array.from(document.querySelectorAll('[class*="tool"], [class*="menu"], [class*="bar"]'));

  // Look for the actual Photopea menu bar (should have File, Edit, Image, Layer, etc.)
  const menuTexts = Array.from(document.querySelectorAll('*'))
    .filter(el => el.offsetParent !== null && el.textContent.length < 20)
    .map(el => el.textContent.trim())
    .filter(text => text.length > 0 && text.length < 20);

  const hasMenuBar = menuTexts.includes('File') && menuTexts.includes('Edit') && menuTexts.includes('Image');

  // Check canvases
  const canvases = Array.from(document.querySelectorAll('canvas'));
  const largeCanvases = canvases.filter(c => c.width > 100 && c.height > 100);

  return {
    hasMenuBar,
    canvasCount: canvases.length,
    largeCanvasCount: largeCanvases.length,
    toolbarCount: toolbars.length,
    sampleMenuTexts: menuTexts.slice(0, 15)
  };
});

console.log('\n=== APP VISIBILITY CHECK ===');
console.log('Has menu bar (File/Edit/Image):', appVisible.hasMenuBar);
console.log('Canvas count:', appVisible.canvasCount);
console.log('Large canvas count:', appVisible.largeCanvasCount);
console.log('Toolbar elements:', appVisible.toolbarCount);
console.log('Sample menu texts:', appVisible.sampleMenuTexts.join(', '));

if (appVisible.hasMenuBar) {
  console.log('\n✅ App is visible! Now testing File menu...');

  // Try clicking File menu
  const fileClick = await page.evaluate(() => {
    // Find File button in menu bar
    const elements = Array.from(document.querySelectorAll('*'));
    for (const el of elements) {
      if (el.textContent.trim() === 'File' && el.tagName === 'BUTTON' && el.offsetParent) {
        // Try clicking
        el.click();

        // Wait a bit and check if menu appeared
        setTimeout(() => {
          const dropdowns = Array.from(document.querySelectorAll('*'));
          for (const dd of dropdowns) {
            if (dd.offsetParent && dd.textContent.includes('New Project')) {
              console.log('✅ Menu appeared!');
            }
          }
        }, 500);

        return { clicked: true, tag: el.tagName };
      }
    }
    return { clicked: false };
  });

  console.log('File click:', fileClick);

  await page.waitForTimeout(2000);

  // Check for "New Project" in menu
  const hasNewProject = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('*'));
    return elements.some(el =>
      el.textContent === 'New Project' &&
      el.offsetParent !== null &&
      el.getBoundingClientRect().width < 200
    );
  });

  if (hasNewProject) {
    console.log('✅✅ "New Project" menu item is visible!');
    console.log('\nTry manually clicking File → New Project in the browser');
  } else {
    console.log('❌ "New Project" not visible yet');
  }
} else {
  console.log('\n❌ App still not fully visible');
}

console.log('\n\nBrowser staying open...\n');
await new Promise(() => {});
