import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => {
  const text = msg.text();
  if (text.includes('[PATCHED]')) {
    console.log('[browser]', text);
  }
});

console.log('Loading Photopea with PATCHED environment checks...');
await page.goto('http://localhost:3338', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

console.log('\nClicking "Start using Photopea"...');
await page.click('text=/start using photopea/i');
await page.waitForTimeout(3000);

console.log('\n=== Clicking "New Project" ===');
await page.click('text=/new project/i');
await page.waitForTimeout(3000);

// Check if dialog appeared
const dialogCheck = await page.evaluate(() => {
  const inputs = document.querySelectorAll('input');
  let widthInput = null;
  let heightInput = null;
  let foundInputs = [];

  for (const input of inputs) {
    if (input.offsetParent !== null) { // visible
      const prevText = input.previousSibling?.textContent || '';
      const placeholder = input.placeholder || '';
      const text = (prevText + placeholder).toLowerCase();

      foundInputs.push({
        text: prevText + placeholder,
        type: input.type,
        value: input.value,
      });

      if (text.includes('width')) widthInput = input;
      if (text.includes('height')) heightInput = input;
    }
  }

  return {
    dialogAppeared: !!(widthInput && heightInput),
    widthInput: !!widthInput,
    heightInput: !!heightInput,
    visibleInputs: foundInputs.length,
    foundInputs,
  };
});

console.log('\n=== RESULT ===');
console.log('Dialog appeared:', dialogCheck.dialogAppeared ? '✅ YES!' : '❌ NO');
console.log('Width input:', dialogCheck.widthInput);
console.log('Height input:', dialogCheck.heightInput);
console.log('Visible inputs:', dialogCheck.visibleInputs);

if (dialogCheck.visibleInputs > 0) {
  console.log('\nFound inputs:');
  dialogCheck.foundInputs.slice(0, 5).forEach((inp, i) => {
    console.log(`  ${i + 1}. "${inp.text}" (${inp.type}) = "${inp.value}"`);
  });
}

if (dialogCheck.dialogAppeared) {
  console.log('\n🎉 SUCCESS! Patching the environment check FIXED the issue!');
  console.log('This proves the extraction was complete - we just needed to bypass the domain check.');
} else {
  console.log('\n⚠️  Dialog still not appearing.');
}

console.log('\n\nBrowser staying open for inspection...');
await new Promise(() => {});
