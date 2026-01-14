/**
 * Capture input/output for each action
 */
const logger = require('../utils/logger');
const config = require('../utils/config');
const { captureState } = require('../exploration/state');
const { computeDiff } = require('./diff');

/**
 * Execute an action and capture full I/O
 */
async function executeAndCapture(page, action) {
  const result = {
    action,
    success: false,
    error: null,
    stateBefore: null,
    stateAfter: null,
    io: null
  };

  try {
    // Capture BEFORE state
    result.stateBefore = await captureState(page);
    const beforeSnapshot = await captureSnapshot(page);

    // Execute the action
    await executeAction(page, action);

    // Wait for effects to settle
    await page.waitForLoadState('networkidle', { timeout: config.networkIdleTimeout })
      .catch(() => {});  // Timeout is OK
    await page.waitForTimeout(100);  // Small buffer for animations

    // Capture AFTER state
    result.stateAfter = await captureState(page);
    const afterSnapshot = await captureSnapshot(page);

    // Compute diff
    const diff = computeDiff(beforeSnapshot, afterSnapshot);

    // Package I/O
    result.io = {
      input: {
        action,
        stateBefore: {
          hash: result.stateBefore.hash,
          url: result.stateBefore.url.href
        }
      },
      output: {
        stateAfter: {
          hash: result.stateAfter.hash,
          url: result.stateAfter.url.href
        },
        diff
      }
    };

    result.success = true;

  } catch (error) {
    result.error = error.message;
    logger.debug(`Action failed: ${action.type} - ${error.message}`);
  }

  return result;
}

/**
 * Capture a snapshot of current page state
 */
async function captureSnapshot(page) {
  return {
    timestamp: Date.now(),
    url: page.url(),
    title: await page.title(),

    // Screenshot as base64
    screenshot: await page.screenshot({
      type: 'jpeg',
      quality: config.screenshotQuality
    }).then(b => b.toString('base64')),

    // DOM content
    html: await page.content(),

    // Computed styles for key elements
    styles: await page.evaluate(() => {
      const styles = {};
      document.querySelectorAll('[id], [data-testid], button, a, input').forEach(el => {
        const selector = el.id ? `#${el.id}` : el.getAttribute('data-testid') || el.tagName;
        const cs = getComputedStyle(el);
        styles[selector] = {
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          background: cs.backgroundColor,
          color: cs.color
        };
      });
      return styles;
    }),

    // Console messages (if collected)
    console: [],

    // Network requests (if collected)
    network: []
  };
}

/**
 * Execute a single action
 */
async function executeAction(page, action) {
  const { type, selector, value, key, modifiers } = action;

  switch (type) {
    case 'click':
      await page.click(selector, { timeout: config.actionTimeout });
      break;

    case 'dblclick':
      await page.dblclick(selector, { timeout: config.actionTimeout });
      break;

    case 'rightclick':
      await page.click(selector, { button: 'right', timeout: config.actionTimeout });
      break;

    case 'hover':
      await page.hover(selector, { timeout: config.actionTimeout });
      break;

    case 'fill':
      await page.fill(selector, value, { timeout: config.actionTimeout });
      break;

    case 'select':
      await page.selectOption(selector, value, { timeout: config.actionTimeout });
      break;

    case 'check':
      await page.check(selector, { timeout: config.actionTimeout });
      break;

    case 'uncheck':
      await page.uncheck(selector, { timeout: config.actionTimeout });
      break;

    case 'keyboard':
      await page.keyboard.press(key, {
        modifiers: modifiers?.map(m => m.toLowerCase())
      });
      break;

    case 'focus':
      await page.focus(selector, { timeout: config.actionTimeout });
      break;

    case 'scroll':
      await page.evaluate((sel, dir) => {
        const el = document.querySelector(sel) || window;
        const amount = 200;
        if (dir === 'down') el.scrollBy(0, amount);
        else if (dir === 'up') el.scrollBy(0, -amount);
        else if (dir === 'right') el.scrollBy(amount, 0);
        else if (dir === 'left') el.scrollBy(-amount, 0);
      }, selector || 'body', action.direction);
      break;

    default:
      throw new Error(`Unknown action type: ${type}`);
  }
}

/**
 * Generate actions for an element
 */
function generateActionsForElement(element) {
  const actions = [];
  const { selector, tag, type: inputType, score } = element;

  // Click (most common)
  if (score >= 30) {
    actions.push({ type: 'click', selector });
  }

  // Double-click
  if (score >= 50) {
    actions.push({ type: 'dblclick', selector });
  }

  // Right-click (context menu)
  if (score >= 50) {
    actions.push({ type: 'rightclick', selector });
  }

  // Hover
  if (score >= 20) {
    actions.push({ type: 'hover', selector });
  }

  // Input-specific actions
  if (tag === 'input' || tag === 'textarea') {
    actions.push({ type: 'fill', selector, value: 'test' });
    actions.push({ type: 'fill', selector, value: '' });
    actions.push({ type: 'fill', selector, value: '12345' });
  }

  // Checkbox/radio
  if (inputType === 'checkbox' || inputType === 'radio') {
    actions.push({ type: 'check', selector });
    actions.push({ type: 'uncheck', selector });
  }

  // Select
  if (tag === 'select') {
    actions.push({ type: 'select', selector, value: { index: 0 } });
    actions.push({ type: 'select', selector, value: { index: 1 } });
  }

  return actions;
}

module.exports = {
  executeAndCapture,
  captureSnapshot,
  executeAction,
  generateActionsForElement
};
