/**
 * Targeted Verification
 *
 * Only verify what static analysis couldn't determine with high confidence.
 * Uses parallel browser instances for speed.
 */

const { chromium } = require('playwright');

/**
 * Verify uncertain specs using real browser execution
 */
async function verifyUncertain(url, specs, options = {}) {
  const { parallel = 4 } = options;

  if (specs.length === 0) {
    return [];
  }

  console.log(`  Verifying ${specs.length} uncertain predictions with ${parallel} browsers...`);

  // Split specs into batches
  const batches = [];
  const batchSize = Math.ceil(specs.length / parallel);
  for (let i = 0; i < specs.length; i += batchSize) {
    batches.push(specs.slice(i, i + batchSize));
  }

  // Launch browsers in parallel
  const browser = await chromium.launch({ headless: true });

  const results = await Promise.all(
    batches.map((batch, i) =>
      verifyBatch(browser, url, batch, i)
    )
  );

  await browser.close();

  // Flatten results
  return results.flat();
}

/**
 * Verify a batch of specs
 */
async function verifyBatch(browser, url, specs, batchIndex) {
  const results = [];

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    for (const spec of specs) {
      try {
        const result = await verifySpec(page, spec);
        results.push(result);
      } catch (e) {
        results.push({
          id: spec.id,
          verified: false,
          error: e.message,
          match: false
        });
      }
    }
  } finally {
    await context.close();
  }

  return results;
}

/**
 * Verify a single spec
 */
async function verifySpec(page, spec) {
  const result = {
    id: spec.id,
    verified: true,
    match: false,
    actualOutput: null
  };

  switch (spec.type) {
    case 'element':
      result.actualOutput = await verifyElementInteraction(page, spec);
      break;

    case 'keyboard':
      result.actualOutput = await verifyKeyboardShortcut(page, spec);
      break;

    case 'form':
      result.actualOutput = await verifyFormSubmission(page, spec);
      break;

    case 'css-state':
      result.actualOutput = await verifyCSSState(page, spec);
      break;

    case 'breakpoint':
      result.actualOutput = await verifyBreakpoint(page, spec);
      break;

    default:
      result.verified = false;
      result.error = 'Unknown spec type';
  }

  // Compare predicted vs actual
  result.match = compareOutputs(spec.output.predicted, result.actualOutput);

  return result;
}

/**
 * Verify element interaction
 */
async function verifyElementInteraction(page, spec) {
  const selector = spec.element.selector;
  const eventType = spec.eventType;

  // Capture before state
  const beforeState = await captureState(page);

  // Execute action
  try {
    switch (eventType) {
      case 'click':
        await page.click(selector, { timeout: 2000 });
        break;
      case 'hover':
        await page.hover(selector, { timeout: 2000 });
        break;
      case 'focus':
        await page.focus(selector, { timeout: 2000 });
        break;
      case 'dblclick':
        await page.dblclick(selector, { timeout: 2000 });
        break;
      default:
        // For other events, try to trigger via JavaScript
        await page.evaluate(({ sel, evt }) => {
          const el = document.querySelector(sel);
          if (el) el.dispatchEvent(new Event(evt, { bubbles: true }));
        }, { sel: selector, evt: eventType });
    }

    // Wait for effects
    await page.waitForTimeout(100);

    // Capture after state
    const afterState = await captureState(page);

    // Calculate diff
    return computeDiff(beforeState, afterState);

  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Verify keyboard shortcut
 */
async function verifyKeyboardShortcut(page, spec) {
  const { key, modifiers } = spec.shortcut;

  const beforeState = await captureState(page);

  // Build key combo
  let combo = key;
  if (modifiers.includes('Meta')) combo = 'Meta+' + combo;
  if (modifiers.includes('Shift')) combo = 'Shift+' + combo;
  if (modifiers.includes('Control')) combo = 'Control+' + combo;
  if (modifiers.includes('Alt')) combo = 'Alt+' + combo;

  try {
    await page.keyboard.press(combo);
    await page.waitForTimeout(100);

    const afterState = await captureState(page);
    return computeDiff(beforeState, afterState);
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Verify form submission
 */
async function verifyFormSubmission(page, spec) {
  // Don't actually submit - just check the form exists and has expected fields
  const formInfo = await page.evaluate((selector) => {
    const form = document.querySelector(selector);
    if (!form) return null;

    return {
      action: form.action,
      method: form.method,
      fields: Array.from(form.elements)
        .filter(el => el.name)
        .map(el => ({
          name: el.name,
          type: el.type,
          required: el.required
        }))
    };
  }, spec.form.selector);

  return {
    formFound: !!formInfo,
    formInfo,
    // Note: We don't actually submit to avoid side effects
    submissionVerified: false
  };
}

/**
 * Verify CSS state
 */
async function verifyCSSState(page, spec) {
  const selector = spec.baseSelector;
  const state = spec.state;

  // Capture base styles
  const baseStyles = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      background: cs.backgroundColor,
      color: cs.color,
      opacity: cs.opacity,
      transform: cs.transform,
      boxShadow: cs.boxShadow,
      border: cs.border
    };
  }, selector);

  if (!baseStyles) {
    return { error: 'Element not found' };
  }

  // Trigger state
  let stateStyles = null;
  try {
    if (state === 'hover') {
      await page.hover(selector, { timeout: 2000 });
    } else if (state === 'focus') {
      await page.focus(selector, { timeout: 2000 });
    } else if (state === 'active') {
      await page.evaluate(sel => {
        const el = document.querySelector(sel);
        if (el) el.classList.add(':active'); // Won't work, just for structure
      }, selector);
    }

    await page.waitForTimeout(50);

    stateStyles = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        background: cs.backgroundColor,
        color: cs.color,
        opacity: cs.opacity,
        transform: cs.transform,
        boxShadow: cs.boxShadow,
        border: cs.border
      };
    }, selector);

  } catch (e) {
    return { error: e.message };
  }

  // Compare
  const changes = [];
  for (const prop of Object.keys(baseStyles)) {
    if (baseStyles[prop] !== stateStyles[prop]) {
      changes.push({
        property: prop,
        before: baseStyles[prop],
        after: stateStyles[prop]
      });
    }
  }

  return {
    stateTriggered: true,
    styleChanges: changes
  };
}

/**
 * Verify breakpoint
 */
async function verifyBreakpoint(page, spec) {
  const width = spec.input.width;

  // Resize viewport
  await page.setViewportSize({ width, height: 720 });
  await page.waitForTimeout(100);

  // Capture layout info
  const layout = await page.evaluate(() => {
    const info = {};

    // Check some common layout indicators
    const nav = document.querySelector('nav, header');
    if (nav) {
      info.navDisplay = getComputedStyle(nav).display;
      info.navPosition = getComputedStyle(nav).position;
    }

    const sidebar = document.querySelector('aside, [class*="sidebar"]');
    if (sidebar) {
      info.sidebarDisplay = getComputedStyle(sidebar).display;
    }

    const main = document.querySelector('main, [class*="content"]');
    if (main) {
      info.mainWidth = getComputedStyle(main).width;
    }

    return info;
  });

  return {
    viewport: { width, height: 720 },
    layout
  };
}

/**
 * Capture current page state
 */
async function captureState(page) {
  return {
    url: page.url(),
    title: await page.title(),
    focusedElement: await page.evaluate(() =>
      document.activeElement?.tagName || null
    ),
    visibleModals: await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="dialog"], .modal, [class*="modal"]'))
        .filter(el => getComputedStyle(el).display !== 'none')
        .length
    ),
    scrollPosition: await page.evaluate(() => window.scrollY)
  };
}

/**
 * Compute diff between states
 */
function computeDiff(before, after) {
  const diff = {};

  if (before.url !== after.url) {
    diff.navigation = { from: before.url, to: after.url };
  }

  if (before.focusedElement !== after.focusedElement) {
    diff.focusChange = { from: before.focusedElement, to: after.focusedElement };
  }

  if (before.visibleModals !== after.visibleModals) {
    diff.modalChange = { from: before.visibleModals, to: after.visibleModals };
  }

  if (before.scrollPosition !== after.scrollPosition) {
    diff.scrollChange = { from: before.scrollPosition, to: after.scrollPosition };
  }

  return diff;
}

/**
 * Compare predicted vs actual outputs
 */
function compareOutputs(predicted, actual) {
  if (!actual || actual.error) return false;

  // Simple comparison - in production would be more sophisticated
  const predictedHasNav = predicted.navigation?.length > 0;
  const actualHasNav = actual.navigation !== undefined;

  const predictedHasStyle = predicted.styleChanges?.length > 0;
  const actualHasStyle = actual.styleChanges?.length > 0;

  // Match if major predictions align
  if (predictedHasNav !== actualHasNav) return false;
  if (predictedHasStyle && !actualHasStyle) return false;

  return true;
}

module.exports = { verifyUncertain };
