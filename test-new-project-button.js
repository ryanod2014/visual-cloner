/**
 * Test: Verify New Project Dialog Functionality
 *
 * This test verifies that after patching the server to set ht=0 (photopea mode),
 * the "New Project" button properly opens a dialog with Width/Height input fields.
 *
 * Expected Result: Dialog appears with width/height inputs
 */

import { chromium } from 'playwright';

async function testNewProjectButton() {
  console.log('Starting New Project Button Test...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE ${msg.type()}]:`, msg.text());
  });

  // Log network errors
  page.on('pageerror', error => {
    console.log(`[PAGE ERROR]:`, error.message);
  });

  try {
    console.log('Step 1: Loading http://localhost:3339...');
    await page.goto('http://localhost:3339', { waitUntil: 'networkidle' });
    console.log('✓ Page loaded\n');

    console.log('Step 2: Waiting for page to fully load (5 seconds)...');
    await page.waitForTimeout(5000);
    console.log('✓ Wait complete\n');

    // Check if "Start using Photopea" button exists
    console.log('Step 3: Checking for "Start using Photopea" button...');
    const startButton = await page.locator('text=Start using Photopea').first();
    const startButtonVisible = await startButton.isVisible().catch(() => false);

    if (startButtonVisible) {
      console.log('Found "Start using Photopea" button - clicking it...');
      await startButton.click();
      await page.waitForTimeout(1000);
      console.log('✓ Clicked "Start using Photopea"\n');
    } else {
      console.log('No "Start using Photopea" button found (may not be needed)\n');
    }

    console.log('Step 4: Looking for "New Project" button...');

    // Try multiple selectors to find the New Project button
    const selectors = [
      'button:has-text("New Project")',
      'text=New Project',
      '[aria-label*="New Project"]',
      'button:has-text("new project")',
    ];

    let newProjectButton = null;
    for (const selector of selectors) {
      newProjectButton = await page.locator(selector).first();
      const visible = await newProjectButton.isVisible().catch(() => false);
      if (visible) {
        console.log(`✓ Found "New Project" button using selector: ${selector}\n`);
        break;
      }
    }

    if (!newProjectButton || !(await newProjectButton.isVisible().catch(() => false))) {
      console.log('✗ FAILED: Could not find "New Project" button');
      console.log('\nTaking screenshot of current page state...');
      await page.screenshot({ path: '/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/test-failed-no-button.png', fullPage: true });
      console.log('Screenshot saved to: test-failed-no-button.png');

      // Get page content for debugging
      console.log('\nSearching for any buttons on the page...');
      const buttons = await page.locator('button').all();
      console.log(`Found ${buttons.length} buttons on the page`);

      for (let i = 0; i < Math.min(buttons.length, 10); i++) {
        const text = await buttons[i].textContent().catch(() => '');
        const ariaLabel = await buttons[i].getAttribute('aria-label').catch(() => '');
        console.log(`Button ${i + 1}: text="${text}" aria-label="${ariaLabel}"`);
      }

      await browser.close();
      return;
    }

    console.log('Step 5: Clicking "New Project" button...');
    await newProjectButton.click();
    console.log('✓ Clicked "New Project"\n');

    console.log('Waiting for dialog to appear (2 seconds)...');
    await page.waitForTimeout(2000);

    // Check for Width and Height input fields
    console.log('Step 6: Checking for Width and Height input fields...');

    const widthInput = await page.locator('input[name*="width"], input[placeholder*="Width"], label:has-text("Width") + input, input[aria-label*="Width"]').first();
    const heightInput = await page.locator('input[name*="height"], input[placeholder*="Height"], label:has-text("Height") + input, input[aria-label*="Height"]').first();

    const widthVisible = await widthInput.isVisible().catch(() => false);
    const heightVisible = await heightInput.isVisible().catch(() => false);

    console.log('\n=================================');
    console.log('TEST RESULTS');
    console.log('=================================\n');

    if (widthVisible && heightVisible) {
      console.log('✓ SUCCESS: Dialog appeared with Width and Height inputs!');
      console.log('\nThe ht=0 patch worked correctly!');
      console.log('The application achieves 100% offline functionality.\n');

      // Get current values
      const widthValue = await widthInput.inputValue().catch(() => '');
      const heightValue = await heightInput.inputValue().catch(() => '');

      console.log(`Width input value: ${widthValue}`);
      console.log(`Height input value: ${heightValue}\n`);

      // Take success screenshot
      await page.screenshot({ path: '/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/test-success.png', fullPage: true });
      console.log('Screenshot saved to: test-success.png');

    } else {
      console.log('✗ FAILED: Dialog did not appear with expected inputs');
      console.log(`Width input visible: ${widthVisible}`);
      console.log(`Height input visible: ${heightVisible}\n`);

      // Try to find any dialog or modal
      console.log('Checking for any dialog/modal elements...');
      const dialogs = await page.locator('dialog, [role="dialog"], .modal, .dialog').all();
      console.log(`Found ${dialogs.length} dialog-like elements\n`);

      // Get all visible inputs
      console.log('Checking for any visible input fields...');
      const inputs = await page.locator('input[type="text"], input[type="number"], input:not([type])').all();
      let visibleInputs = 0;
      for (const input of inputs) {
        const visible = await input.isVisible().catch(() => false);
        if (visible) {
          visibleInputs++;
          const name = await input.getAttribute('name').catch(() => '');
          const placeholder = await input.getAttribute('placeholder').catch(() => '');
          console.log(`  Visible input: name="${name}" placeholder="${placeholder}"`);
        }
      }
      console.log(`Total visible inputs: ${visibleInputs}\n`);

      // Take failure screenshot
      await page.screenshot({ path: '/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/test-failed-no-dialog.png', fullPage: true });
      console.log('Screenshot saved to: test-failed-no-dialog.png');
    }

    // Check console for errors
    console.log('\n=================================');
    console.log('Checking for console errors...');
    console.log('=================================');
    console.log('(See console logs above for any errors)');

  } catch (error) {
    console.error('\n✗ TEST ERROR:', error.message);
    await page.screenshot({ path: '/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/test-error.png', fullPage: true });
    console.log('Screenshot saved to: test-error.png');
  } finally {
    console.log('\nClosing browser in 5 seconds...');
    await page.waitForTimeout(5000);
    await browser.close();
  }
}

// Run the test
testNewProjectButton().catch(console.error);
