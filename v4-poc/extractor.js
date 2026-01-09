/**
 * V4 Full Webapp Extractor - Proof of Concept
 * Tests core extraction capabilities on Excalidraw
 */

import { chromium } from 'playwright';
import crypto from 'crypto';
import fs from 'fs';

// ============================================
// CORE: State Hashing & Capture
// ============================================

/**
 * Generate content hash from DOM snapshot
 * Uses hierarchical hashing for deduplication
 */
function hashState(snapshot) {
  // Hash the accessibility tree structure
  const content = JSON.stringify(snapshot, null, 0);
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Capture current page state
 */
async function captureState(page, stateId) {
  // Get DOM structure as snapshot
  const snapshot = await page.evaluate(() => {
    function serializeNode(node, depth = 0) {
      if (node.nodeType !== 1 || depth > 10) return null;
      const computed = window.getComputedStyle(node);
      const obj = {
        tag: node.tagName,
        id: node.id || undefined,
        class: node.className?.toString?.() || undefined,
        role: node.getAttribute('role') || undefined,
        text: node.childNodes.length === 1 && node.childNodes[0].nodeType === 3
          ? node.textContent?.slice(0, 50) : undefined,
        visible: computed.display !== 'none' && computed.visibility !== 'hidden',
        children: []
      };
      for (const child of node.children) {
        const serialized = serializeNode(child, depth + 1);
        if (serialized) obj.children.push(serialized);
      }
      return obj;
    }
    return serializeNode(document.body);
  });

  const url = page.url();
  const title = await page.title();

  // Capture screenshot
  const screenshot = await page.screenshot({ type: 'png' });

  // Capture computed styles for key elements
  const styles = await page.evaluate(() => {
    const elements = document.querySelectorAll('button, input, [role="radio"], [role="checkbox"], [role="slider"]');
    const styleMap = {};
    elements.forEach((el, i) => {
      const computed = window.getComputedStyle(el);
      styleMap[`el_${i}`] = {
        backgroundColor: computed.backgroundColor,
        color: computed.color,
        border: computed.border,
        opacity: computed.opacity,
        transform: computed.transform,
      };
    });
    return styleMap;
  });

  return {
    id: stateId,
    hash: hashState(snapshot),
    url,
    title,
    snapshot,
    styles,
    screenshot: screenshot.toString('base64'),
    timestamp: Date.now(),
  };
}

// ============================================
// CORE: Universal Event Interception
// ============================================

const EVENT_INTERCEPTOR_SCRIPT = `
window.__V4_INTERCEPTOR__ = {
  events: [],
  originalAddEventListener: EventTarget.prototype.addEventListener,

  init() {
    const self = this;

    // Intercept all event listeners
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      // Record that this element has this event type
      if (this instanceof Element) {
        self.events.push({
          type,
          target: self.getElementPath(this),
          timestamp: Date.now()
        });
      }
      return self.originalAddEventListener.call(this, type, listener, options);
    };

    // Track existing interactive elements
    this.scanInteractiveElements();

    console.log('[V4] Event interceptor initialized');
  },

  getElementPath(el) {
    if (!el || el === document.body) return 'body';
    const parts = [];
    while (el && el !== document.body) {
      let selector = el.tagName.toLowerCase();
      if (el.id) selector += '#' + el.id;
      else if (el.className && typeof el.className === 'string') {
        selector += '.' + el.className.split(' ').filter(c => c).join('.');
      }
      parts.unshift(selector);
      el = el.parentElement;
    }
    return parts.join(' > ');
  },

  scanInteractiveElements() {
    const interactive = document.querySelectorAll(
      'button, a, input, select, textarea, [role="button"], [role="link"], ' +
      '[role="checkbox"], [role="radio"], [role="slider"], [role="tab"], ' +
      '[role="menuitem"], [role="option"], [tabindex], [onclick]'
    );

    return Array.from(interactive).map(el => ({
      tag: el.tagName,
      role: el.getAttribute('role'),
      text: el.textContent?.slice(0, 50),
      path: this.getElementPath(el),
      ariaLabel: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
    }));
  },

  getInteractiveElements() {
    return this.scanInteractiveElements();
  },

  flush() {
    const events = [...this.events];
    this.events = [];
    return events;
  }
};

window.__V4_INTERCEPTOR__.init();
`;

// ============================================
// CORE: Action Recording
// ============================================

const ACTION_RECORDER_SCRIPT = `
window.__V4_RECORDER__ = {
  actions: [],

  init() {
    // Record clicks
    document.addEventListener('click', (e) => {
      this.actions.push({
        type: 'click',
        target: window.__V4_INTERCEPTOR__.getElementPath(e.target),
        x: e.clientX,
        y: e.clientY,
        timestamp: Date.now()
      });
    }, true);

    // Record key presses
    document.addEventListener('keydown', (e) => {
      this.actions.push({
        type: 'keydown',
        key: e.key,
        code: e.code,
        modifiers: {
          ctrl: e.ctrlKey,
          alt: e.altKey,
          shift: e.shiftKey,
          meta: e.metaKey
        },
        timestamp: Date.now()
      });
    }, true);

    // Record input changes
    document.addEventListener('input', (e) => {
      this.actions.push({
        type: 'input',
        target: window.__V4_INTERCEPTOR__.getElementPath(e.target),
        value: e.target.value?.slice(0, 100),
        timestamp: Date.now()
      });
    }, true);

    console.log('[V4] Action recorder initialized');
  },

  getActions() {
    return [...this.actions];
  },

  flush() {
    const actions = [...this.actions];
    this.actions = [];
    return actions;
  }
};

window.__V4_RECORDER__.init();
`;

// ============================================
// CORE: State Explorer
// ============================================

class StateExplorer {
  constructor(page) {
    this.page = page;
    this.states = new Map(); // hash -> state
    this.transitions = []; // {from, to, action}
    this.actionQueue = [];
    this.visited = new Set();
  }

  async init() {
    // Inject interceptors
    await this.page.addInitScript(EVENT_INTERCEPTOR_SCRIPT);
    await this.page.addInitScript(ACTION_RECORDER_SCRIPT);

    // Also run on current page
    await this.page.evaluate(EVENT_INTERCEPTOR_SCRIPT);
    await this.page.evaluate(ACTION_RECORDER_SCRIPT);
  }

  async captureCurrentState() {
    const stateId = `state_${this.states.size}`;
    const state = await captureState(this.page, stateId);

    if (!this.states.has(state.hash)) {
      this.states.set(state.hash, state);
      console.log(`[V4] New state captured: ${state.hash} (${this.states.size} total)`);
      return { isNew: true, state };
    }

    return { isNew: false, state: this.states.get(state.hash) };
  }

  async discoverInteractiveElements() {
    return await this.page.evaluate(() => {
      return window.__V4_INTERCEPTOR__.getInteractiveElements();
    });
  }

  async exploreState(maxDepth = 3, currentDepth = 0) {
    if (currentDepth >= maxDepth) return;

    const { state } = await this.captureCurrentState();

    if (this.visited.has(state.hash)) {
      console.log(`[V4] Already visited state ${state.hash}, skipping`);
      return;
    }
    this.visited.add(state.hash);

    // Find all interactive elements
    const elements = await this.discoverInteractiveElements();
    console.log(`[V4] Found ${elements.length} interactive elements in state ${state.hash}`);

    // Try clicking each button/radio/checkbox
    for (const el of elements) {
      if (!['BUTTON', 'INPUT'].includes(el.tag) &&
          !['button', 'radio', 'checkbox', 'tab', 'menuitem'].includes(el.role)) {
        continue;
      }

      const beforeHash = state.hash;

      try {
        // Try to find and click the element
        let selector;
        if (el.ariaLabel) {
          selector = `[aria-label="${el.ariaLabel}"]`;
        } else if (el.title) {
          selector = `[title="${el.title}"]`;
        } else if (el.text && el.text.trim()) {
          selector = `text=${el.text.trim().slice(0, 30)}`;
        } else {
          continue;
        }

        console.log(`[V4] Clicking: ${selector}`);

        await this.page.click(selector, { timeout: 2000 }).catch(() => {});
        await this.page.waitForTimeout(300);

        const { isNew, state: newState } = await this.captureCurrentState();

        if (isNew) {
          this.transitions.push({
            from: beforeHash,
            to: newState.hash,
            action: { type: 'click', selector }
          });

          // Recursively explore new state
          await this.exploreState(maxDepth, currentDepth + 1);

          // Try to go back (press Escape or click elsewhere)
          await this.page.keyboard.press('Escape');
          await this.page.waitForTimeout(200);
        }
      } catch (err) {
        // Element not found or not clickable
      }
    }
  }

  getResults() {
    return {
      states: Array.from(this.states.values()).map(s => ({
        id: s.id,
        hash: s.hash,
        url: s.url,
        title: s.title,
        timestamp: s.timestamp,
        // Omit screenshot to keep JSON small
        snapshotSummary: {
          totalNodes: JSON.stringify(s.snapshot).length,
        }
      })),
      transitions: this.transitions,
      totalUniqueStates: this.states.size,
      totalTransitions: this.transitions.length,
    };
  }

  async saveScreenshots(outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });

    for (const [hash, state] of this.states) {
      const filename = `${outputDir}/${state.id}_${hash}.png`;
      fs.writeFileSync(filename, Buffer.from(state.screenshot, 'base64'));
      console.log(`[V4] Saved screenshot: ${filename}`);
    }
  }
}

// ============================================
// MAIN: Run extraction on Excalidraw
// ============================================

async function main() {
  console.log('=== V4 Full Webapp Extractor - POC ===\n');
  console.log('Target: https://excalidraw.com\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const explorer = new StateExplorer(page);
  await explorer.init();

  // Navigate to Excalidraw
  console.log('[V4] Navigating to Excalidraw...');
  await page.goto('https://excalidraw.com', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Dismiss welcome screen
  console.log('[V4] Dismissing welcome screen...');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Click on a tool to clear welcome
  await page.click('[title*="Rectangle"]').catch(() => {});
  await page.waitForTimeout(500);

  // Capture initial state
  console.log('[V4] Capturing initial state...');
  await explorer.captureCurrentState();

  // Discover interactive elements
  const elements = await explorer.discoverInteractiveElements();
  console.log(`\n[V4] Found ${elements.length} interactive elements:\n`);

  // Group by type
  const byRole = {};
  for (const el of elements) {
    const key = el.role || el.tag;
    byRole[key] = (byRole[key] || 0) + 1;
  }
  console.log('Interactive element types:');
  for (const [type, count] of Object.entries(byRole).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  // Explore states (limited depth for POC)
  console.log('\n[V4] Exploring UI states...\n');
  await explorer.exploreState(2);

  // Get results
  const results = explorer.getResults();

  console.log('\n=== EXTRACTION RESULTS ===\n');
  console.log(`Total unique states: ${results.totalUniqueStates}`);
  console.log(`Total transitions: ${results.totalTransitions}`);

  console.log('\nStates discovered:');
  for (const state of results.states) {
    console.log(`  - ${state.id} (${state.hash})`);
  }

  console.log('\nTransitions:');
  for (const t of results.transitions) {
    console.log(`  ${t.from} -> ${t.to} via ${t.action.type}: ${t.action.selector}`);
  }

  // Save results
  const outputDir = 'output/v4-poc-excalidraw';
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(`${outputDir}/results.json`, JSON.stringify(results, null, 2));
  console.log(`\n[V4] Results saved to ${outputDir}/results.json`);

  // Save screenshots
  await explorer.saveScreenshots(`${outputDir}/screenshots`);

  // Keep browser open for inspection
  console.log('\n[V4] Extraction complete. Browser left open for inspection.');
  console.log('Press Ctrl+C to exit.\n');

  // Wait indefinitely
  await new Promise(() => {});
}

main().catch(console.error);
