/**
 * I/O Capture Module
 * Records inputs, outputs, and diffs for each action
 */

const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');

// WeakMap to store page-specific capture state
const pageState = new WeakMap();

/**
 * Initialize capture infrastructure on a page
 * @param {Object} page - Playwright page object
 * @returns {Function} Cleanup function
 */
function setupCapture(page) {
  const state = {
    consoleMessages: [],
    networkRequests: [],
    listeners: []
  };

  // Console message collection
  const consoleHandler = (msg) => {
    state.consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      timestamp: Date.now()
    });
  };
  page.on('console', consoleHandler);
  state.listeners.push(['console', consoleHandler]);

  // Network request collection
  const requestHandler = (request) => {
    state.networkRequests.push({
      url: request.url(),
      method: request.method(),
      type: request.resourceType(),
      timestamp: Date.now(),
      status: null
    });
  };
  page.on('request', requestHandler);
  state.listeners.push(['request', requestHandler]);

  // Track response status
  const responseHandler = (response) => {
    const req = state.networkRequests.find(
      r => r.url === response.url() && r.status === null
    );
    if (req) {
      req.status = response.status();
    }
  };
  page.on('response', responseHandler);
  state.listeners.push(['response', responseHandler]);

  pageState.set(page, state);

  // Return cleanup function
  return () => {
    for (const [event, handler] of state.listeners) {
      page.off(event, handler);
    }
    pageState.delete(page);
  };
}

/**
 * Capture visual state of the page
 * @param {Object} page - Playwright page object
 * @param {Object} options - Capture options
 * @returns {Object} Visual state
 */
async function captureVisualState(page, options = {}) {
  const { screenshot = false, selectors = ['body', 'header', 'main', 'footer', 'nav', 'button', 'input', 'form'] } = options;

  const viewport = page.viewportSize() || { width: 1280, height: 720 };

  // Capture screenshot if requested
  let screenshotBuffer = null;
  if (screenshot) {
    screenshotBuffer = await page.screenshot({ type: 'png' });
  }

  // Extract computed styles for key elements
  const computedStyles = await page.evaluate((sels) => {
    const styles = {};
    for (const sel of sels) {
      const elements = document.querySelectorAll(sel);
      elements.forEach((el, idx) => {
        const key = elements.length > 1 ? `${sel}:nth-of-type(${idx + 1})` : sel;
        const computed = window.getComputedStyle(el);
        styles[key] = {
          display: computed.display,
          visibility: computed.visibility,
          opacity: computed.opacity,
          backgroundColor: computed.backgroundColor,
          color: computed.color,
          fontSize: computed.fontSize,
          position: computed.position,
          width: computed.width,
          height: computed.height
        };
      });
    }
    return styles;
  }, selectors);

  // Extract visible text
  const visibleText = await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const style = window.getComputedStyle(node.parentElement);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
          return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      }
    );
    const texts = [];
    while (walker.nextNode()) {
      texts.push(walker.currentNode.textContent.trim());
    }
    return texts.join(' ').substring(0, 5000);
  });

  return {
    screenshot: screenshotBuffer,
    viewport,
    computedStyles,
    visibleText
  };
}

/**
 * Capture network requests since last call
 * @param {Object} page - Playwright page object
 * @returns {Array} Network requests
 */
async function captureNetworkState(page) {
  const state = pageState.get(page);
  if (!state) return [];

  const requests = [...state.networkRequests];
  state.networkRequests = []; // Clear buffer
  return requests;
}

/**
 * Capture console messages since last call
 * @param {Object} page - Playwright page object
 * @returns {Array} Console messages
 */
async function captureConsoleState(page) {
  const state = pageState.get(page);
  if (!state) return [];

  const messages = [...state.consoleMessages];
  state.consoleMessages = []; // Clear buffer
  return messages;
}

/**
 * Capture DOM structure for diffing
 * @param {Object} page - Playwright page object
 * @returns {Object} DOM structure
 */
async function captureDomState(page) {
  return page.evaluate(() => {
    const extractStructure = (el, depth = 0) => {
      if (depth > 10 || !el) return null;

      const result = {
        tag: el.tagName?.toLowerCase(),
        id: el.id || null,
        classes: el.className ? el.className.split(' ').filter(Boolean) : [],
        children: []
      };

      if (el.children) {
        for (const child of el.children) {
          const childResult = extractStructure(child, depth + 1);
          if (childResult) result.children.push(childResult);
        }
      }
      return result;
    };

    return extractStructure(document.body);
  });
}

/**
 * Compare two screenshots and return diff metrics
 * @param {Buffer} before - Before screenshot
 * @param {Buffer} after - After screenshot
 * @returns {Object} Diff metrics
 */
async function captureScreenshotDiff(before, after) {
  if (!before || !after) return null;

  try {
    const img1 = PNG.sync.read(before);
    const img2 = PNG.sync.read(after);

    if (img1.width !== img2.width || img1.height !== img2.height) {
      return {
        changedPixels: -1,
        percentChanged: 100,
        diffImage: null,
        error: 'Image dimensions differ'
      };
    }

    const { width, height } = img1;
    const diff = new PNG({ width, height });

    const changedPixels = pixelmatch(
      img1.data,
      img2.data,
      diff.data,
      width,
      height,
      { threshold: 0.1 }
    );

    const totalPixels = width * height;
    const percentChanged = (changedPixels / totalPixels) * 100;

    return {
      changedPixels,
      percentChanged: Math.round(percentChanged * 100) / 100,
      diffImage: PNG.sync.write(diff)
    };
  } catch (error) {
    return {
      changedPixels: -1,
      percentChanged: 0,
      diffImage: null,
      error: error.message
    };
  }
}

/**
 * Compute differences between two states
 * @param {Object} before - Before state
 * @param {Object} after - After state
 * @returns {Object} Computed diff
 */
function computeDiff(before, after) {
  const domChanges = computeDomDiff(before.dom, after.dom);
  const styleChanges = computeStyleDiff(before.styles, after.styles);

  const hasChanges = domChanges.added.length > 0 ||
    domChanges.removed.length > 0 ||
    domChanges.modified.length > 0 ||
    styleChanges.length > 0;

  const summaryParts = [];
  if (domChanges.added.length) summaryParts.push(`${domChanges.added.length} elements added`);
  if (domChanges.removed.length) summaryParts.push(`${domChanges.removed.length} elements removed`);
  if (domChanges.modified.length) summaryParts.push(`${domChanges.modified.length} elements modified`);
  if (styleChanges.length) summaryParts.push(`${styleChanges.length} style changes`);

  return {
    hasChanges,
    domChanges,
    styleChanges,
    pixelDiff: null, // Set externally if screenshots captured
    summary: summaryParts.length ? summaryParts.join(', ') : 'No changes detected'
  };
}

/**
 * Compute DOM diff between two structures
 */
function computeDomDiff(before, after) {
  const result = { added: [], removed: [], modified: [] };

  const beforeMap = flattenDom(before, '');
  const afterMap = flattenDom(after, '');

  for (const [selector, node] of Object.entries(afterMap)) {
    if (!beforeMap[selector]) {
      result.added.push(selector);
    } else if (JSON.stringify(beforeMap[selector]) !== JSON.stringify(node)) {
      result.modified.push(selector);
    }
  }

  for (const selector of Object.keys(beforeMap)) {
    if (!afterMap[selector]) {
      result.removed.push(selector);
    }
  }

  return result;
}

/**
 * Flatten DOM structure to selector map
 */
function flattenDom(node, path) {
  if (!node || !node.tag) return {};

  const selector = path ? `${path} > ${node.tag}` : node.tag;
  const uniqueSelector = node.id ? `${selector}#${node.id}` : selector;

  const result = {
    [uniqueSelector]: { tag: node.tag, id: node.id, classes: node.classes }
  };

  if (node.children) {
    node.children.forEach((child, idx) => {
      Object.assign(result, flattenDom(child, `${uniqueSelector}:nth-child(${idx + 1})`));
    });
  }

  return result;
}

/**
 * Compute style diff between two style maps
 */
function computeStyleDiff(before, after) {
  const changes = [];
  const allSelectors = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

  for (const selector of allSelectors) {
    const beforeStyles = before?.[selector] || {};
    const afterStyles = after?.[selector] || {};

    for (const prop of Object.keys({ ...beforeStyles, ...afterStyles })) {
      if (beforeStyles[prop] !== afterStyles[prop]) {
        changes.push({
          selector,
          property: prop,
          before: beforeStyles[prop] || '(none)',
          after: afterStyles[prop] || '(none)'
        });
      }
    }
  }

  return changes;
}

/**
 * Main capture function - records before/after state around an action
 * @param {Object} page - Playwright page object
 * @param {Object} action - Action being performed
 * @param {Function} executeFn - Async function to execute
 * @returns {Object} Captured I/O data
 */
async function captureIO(page, action, executeFn) {
  const timestamp = new Date().toISOString();
  const startTime = Date.now();

  // Capture before state
  const beforeVisual = await captureVisualState(page, { screenshot: action.captureScreenshots });
  const beforeDom = await captureDomState(page);
  const beforeConsole = await captureConsoleState(page);
  const beforeNetwork = await captureNetworkState(page);

  // Execute the action
  let success = true;
  let error = null;

  try {
    await executeFn();
  } catch (err) {
    success = false;
    error = err.message;
  }

  // Small delay to allow DOM to settle
  await page.waitForTimeout(50);

  // Capture after state
  const afterVisual = await captureVisualState(page, { screenshot: action.captureScreenshots });
  const afterDom = await captureDomState(page);
  const afterConsole = await captureConsoleState(page);
  const afterNetwork = await captureNetworkState(page);

  // Compute diff
  const diff = computeDiff(
    { dom: beforeDom, styles: beforeVisual.computedStyles },
    { dom: afterDom, styles: afterVisual.computedStyles }
  );

  // Add pixel diff if screenshots captured
  if (beforeVisual.screenshot && afterVisual.screenshot) {
    diff.pixelDiff = await captureScreenshotDiff(beforeVisual.screenshot, afterVisual.screenshot);
  }

  const duration = Date.now() - startTime;

  return {
    action,
    timestamp,
    duration,
    success,
    error,
    before: {
      screenshot: beforeVisual.screenshot,
      dom: beforeDom,
      styles: beforeVisual.computedStyles,
      console: beforeConsole,
      network: beforeNetwork
    },
    after: {
      screenshot: afterVisual.screenshot,
      dom: afterDom,
      styles: afterVisual.computedStyles,
      console: afterConsole,
      network: afterNetwork
    },
    diff
  };
}

module.exports = {
  setupCapture,
  captureIO,
  captureVisualState,
  captureNetworkState,
  captureConsoleState,
  computeDiff,
  captureScreenshotDiff
};
