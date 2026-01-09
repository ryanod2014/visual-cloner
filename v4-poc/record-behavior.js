/**
 * Behavior Recording Orchestrator
 *
 * Uses Playwright to:
 * 1. Inject the universal recorder into any page
 * 2. Execute test scenarios (manual or automated)
 * 3. Extract and save the recorded behavior
 *
 * Usage:
 *   node v4-poc/record-behavior.js <url> [--manual] [--duration=30000]
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { RECORDER_INJECTION_SCRIPT, ARCHITECTURE_DETECTION_SCRIPT } from './universal-recorder.js';

const OUTPUT_DIR = 'output/behavior-recordings';

async function recordBehavior(url, options = {}) {
  const {
    manual = false,
    duration = 30000,
    scenarios = null,
    headless = false
  } = options;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  UNIVERSAL BEHAVIOR RECORDER');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Target: ${url}`);
  console.log(`Mode: ${manual ? 'Manual (interact with the page)' : 'Automated'}`);
  console.log(`Duration: ${duration}ms`);
  console.log('');

  // Create output directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const domain = new URL(url).hostname.replace(/\./g, '-');
  const outputPath = `${OUTPUT_DIR}/${domain}-${timestamp}`;
  fs.mkdirSync(outputPath, { recursive: true });

  // Launch browser
  const browser = await chromium.launch({
    headless,
    args: ['--window-size=1920,1080']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  // Inject recorder BEFORE page loads
  await page.addInitScript(RECORDER_INJECTION_SCRIPT);

  console.log('[1/5] Navigating to page...');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  console.log('      Page loaded');

  // Wait a moment for any initial animations/loading
  await page.waitForTimeout(2000);

  // Detect architecture
  console.log('[2/5] Detecting app architecture...');
  const architecture = await page.evaluate(ARCHITECTURE_DETECTION_SCRIPT);
  console.log(`      Frameworks: ${architecture.frameworks.join(', ') || 'none detected'}`);
  console.log(`      Rendering: ${architecture.rendering.join(', ')}`);
  console.log(`      State Management: ${architecture.stateManagement.join(', ') || 'none detected'}`);

  // Take initial screenshot
  await page.screenshot({ path: `${outputPath}/initial-state.png` });

  // Execute recording
  if (manual) {
    console.log('[3/5] MANUAL MODE - Interact with the page in the browser');
    console.log('      The browser will stay open for you to interact.');
    console.log(`      Recording will stop after ${duration / 1000} seconds.`);
    console.log('      Press Ctrl+C to stop early.');
    console.log('');

    // Periodic state snapshots during manual interaction
    const snapshotInterval = setInterval(async () => {
      try {
        await page.evaluate(() => {
          window.__RECORDER__?.captureStateSnapshot('periodic');
        });
      } catch (e) {}
    }, 5000);

    // Wait for duration
    await page.waitForTimeout(duration);
    clearInterval(snapshotInterval);

  } else if (scenarios) {
    console.log(`[3/5] Running ${scenarios.length} test scenarios...`);

    for (const scenario of scenarios) {
      console.log(`      Scenario: ${scenario.name}`);

      // Capture state before
      await page.evaluate((name) => {
        window.__RECORDER__?.captureStateSnapshot('before-' + name);
      }, scenario.name);

      // Execute actions
      for (const action of scenario.actions) {
        await executeAction(page, action);
        await page.waitForTimeout(100); // Brief pause between actions
      }

      // Capture state after
      await page.evaluate((name) => {
        window.__RECORDER__?.captureStateSnapshot('after-' + name);
      }, scenario.name);

      await page.waitForTimeout(500); // Pause between scenarios
    }

  } else {
    console.log('[3/5] Running default exploration...');
    await runDefaultExploration(page);
  }

  // Capture final state
  console.log('[4/5] Capturing final state...');
  await page.evaluate(() => {
    window.__RECORDER__?.captureStateSnapshot('final');
  });
  await page.screenshot({ path: `${outputPath}/final-state.png` });

  // Extract recording
  console.log('[5/5] Extracting recorded behavior...');
  const recording = await page.evaluate(() => {
    return window.__RECORDER__?.getRecording();
  });

  if (!recording) {
    console.error('ERROR: Failed to get recording from page');
    await browser.close();
    return null;
  }

  // Save recording
  const recordingFile = `${outputPath}/recording.json`;
  fs.writeFileSync(recordingFile, JSON.stringify(recording, null, 2));

  // Save architecture info
  fs.writeFileSync(`${outputPath}/architecture.json`, JSON.stringify(architecture, null, 2));

  // Generate summary
  const summary = generateSummary(recording, architecture);
  fs.writeFileSync(`${outputPath}/summary.json`, JSON.stringify(summary, null, 2));
  fs.writeFileSync(`${outputPath}/summary.txt`, formatSummary(summary));

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RECORDING COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Output: ${outputPath}/`);
  console.log('');
  console.log('Files:');
  console.log(`  recording.json     - Full behavior log (${recording.log.length} entries)`);
  console.log(`  architecture.json  - Detected app architecture`);
  console.log(`  summary.json       - Recording summary`);
  console.log(`  summary.txt        - Human-readable summary`);
  console.log(`  initial-state.png  - Screenshot before recording`);
  console.log(`  final-state.png    - Screenshot after recording`);
  console.log('');

  await browser.close();

  return {
    outputPath,
    recording,
    architecture,
    summary
  };
}

/**
 * Execute a single action on the page
 */
async function executeAction(page, action) {
  switch (action.type) {
    case 'click':
      if (action.selector) {
        await page.click(action.selector);
      } else if (action.x !== undefined && action.y !== undefined) {
        await page.mouse.click(action.x, action.y);
      }
      break;

    case 'dblclick':
      if (action.selector) {
        await page.dblclick(action.selector);
      } else if (action.x !== undefined) {
        await page.mouse.dblclick(action.x, action.y);
      }
      break;

    case 'mousedown':
      await page.mouse.move(action.x, action.y);
      await page.mouse.down();
      break;

    case 'mousemove':
      await page.mouse.move(action.x, action.y);
      break;

    case 'mouseup':
      await page.mouse.up();
      break;

    case 'drag':
      await page.mouse.move(action.startX, action.startY);
      await page.mouse.down();
      await page.mouse.move(action.endX, action.endY, { steps: 10 });
      await page.mouse.up();
      break;

    case 'type':
      if (action.selector) {
        await page.fill(action.selector, action.text);
      } else {
        await page.keyboard.type(action.text);
      }
      break;

    case 'press':
    case 'key':
      await page.keyboard.press(action.key);
      break;

    case 'keyboard':
      // Complex keyboard action with modifiers
      if (action.modifiers?.ctrl) await page.keyboard.down('Control');
      if (action.modifiers?.shift) await page.keyboard.down('Shift');
      if (action.modifiers?.alt) await page.keyboard.down('Alt');
      if (action.modifiers?.meta) await page.keyboard.down('Meta');

      await page.keyboard.press(action.key);

      if (action.modifiers?.meta) await page.keyboard.up('Meta');
      if (action.modifiers?.alt) await page.keyboard.up('Alt');
      if (action.modifiers?.shift) await page.keyboard.up('Shift');
      if (action.modifiers?.ctrl) await page.keyboard.up('Control');
      break;

    case 'scroll':
      await page.mouse.wheel(action.deltaX || 0, action.deltaY || 0);
      break;

    case 'wait':
      await page.waitForTimeout(action.duration || 1000);
      break;

    case 'screenshot':
      await page.screenshot({ path: action.path });
      break;

    default:
      console.warn(`Unknown action type: ${action.type}`);
  }
}

/**
 * Run default exploration for apps without specific scenarios
 */
async function runDefaultExploration(page) {
  // Find and click interactive elements
  const interactiveSelectors = [
    'button:visible',
    'a:visible',
    '[role="button"]:visible',
    'input[type="submit"]:visible',
    '[onclick]:visible'
  ];

  // Take state snapshot before exploration
  await page.evaluate(() => {
    window.__RECORDER__?.captureStateSnapshot('before-exploration');
  });

  // Find all clickable elements
  const elements = await page.evaluate(() => {
    const selectors = [
      'button', '[role="button"]', 'a[href]',
      'input[type="button"]', 'input[type="submit"]'
    ];

    const found = [];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const rect = el.getBoundingClientRect();
        // Only visible elements
        if (rect.width > 0 && rect.height > 0 &&
            rect.top >= 0 && rect.left >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.right <= window.innerWidth) {
          found.push({
            tag: el.tagName,
            text: el.textContent?.trim().substring(0, 50),
            ariaLabel: el.getAttribute('aria-label'),
            rect: {
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2
            }
          });
        }
      });
    }
    return found.slice(0, 20); // Limit to 20 elements
  });

  console.log(`      Found ${elements.length} interactive elements`);

  // Click each element (carefully)
  for (let i = 0; i < Math.min(elements.length, 10); i++) {
    const el = elements[i];
    const label = el.ariaLabel || el.text || el.tag;
    console.log(`      Clicking: ${label}`);

    try {
      await page.mouse.click(el.rect.x, el.rect.y);
      await page.waitForTimeout(500);

      // Capture state after click
      await page.evaluate((lbl) => {
        window.__RECORDER__?.captureStateSnapshot('after-click-' + lbl.substring(0, 20));
      }, label);

      // Check if a modal opened, press Escape to close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

    } catch (e) {
      console.log(`      (click failed: ${e.message})`);
    }
  }

  // Test keyboard shortcuts
  console.log('      Testing keyboard shortcuts...');
  const shortcuts = [
    { key: '1' }, { key: '2' }, { key: '3' },
    { key: 'r' }, { key: 'v' }, { key: 'h' },
    { key: 'z', modifiers: { ctrl: true } },
    { key: 'y', modifiers: { ctrl: true } }
  ];

  for (const shortcut of shortcuts) {
    try {
      if (shortcut.modifiers?.ctrl) {
        await page.keyboard.down('Control');
      }
      await page.keyboard.press(shortcut.key);
      if (shortcut.modifiers?.ctrl) {
        await page.keyboard.up('Control');
      }
      await page.waitForTimeout(200);
    } catch (e) {}
  }

  // Test canvas interactions if canvas exists
  const hasCanvas = await page.evaluate(() => document.querySelector('canvas') !== null);
  if (hasCanvas) {
    console.log('      Testing canvas interactions...');

    // Get canvas position
    const canvasRect = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const rect = canvas?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
    });

    if (canvasRect) {
      // Draw something on canvas
      const centerX = canvasRect.x + canvasRect.width / 2;
      const centerY = canvasRect.y + canvasRect.height / 2;

      await page.mouse.move(centerX - 50, centerY - 50);
      await page.mouse.down();
      await page.mouse.move(centerX + 50, centerY + 50, { steps: 10 });
      await page.mouse.up();

      await page.waitForTimeout(500);
      await page.evaluate(() => {
        window.__RECORDER__?.captureStateSnapshot('after-canvas-draw');
      });
    }
  }
}

/**
 * Generate summary of the recording
 */
function generateSummary(recording, architecture) {
  const log = recording.log;

  // Count by category
  const categoryCounts = {};
  for (const entry of log) {
    categoryCounts[entry.category] = (categoryCounts[entry.category] || 0) + 1;
  }

  // Count user events by type
  const userEventCounts = {};
  for (const entry of log.filter(e => e.category === 'user-event')) {
    userEventCounts[entry.type] = (userEventCounts[entry.type] || 0) + 1;
  }

  // Network summary
  const networkEntries = log.filter(e => e.category === 'network');
  const apiCalls = networkEntries
    .filter(e => e.type === 'fetch-request' || e.type === 'xhr-request')
    .map(e => ({
      method: e.method,
      url: e.url,
      type: e.type
    }));

  // Canvas operations
  const canvasOps = log.filter(e => e.category === 'canvas');
  const canvasDrawOps = canvasOps.filter(e => e.type === 'draw');

  // Storage changes
  const storageOps = log.filter(e => e.category === 'storage');

  // DOM mutations
  const domMutations = log.filter(e => e.category === 'dom-mutation');
  const totalDomChanges = domMutations.reduce((sum, m) =>
    sum + (m.summary?.added || 0) + (m.summary?.removed || 0), 0);

  return {
    metadata: recording.metadata,
    architecture,

    eventCounts: {
      total: log.length,
      byCategory: categoryCounts,
      userEvents: userEventCounts
    },

    network: {
      totalRequests: apiCalls.length,
      endpoints: [...new Set(apiCalls.map(a => new URL(a.url).pathname))].slice(0, 20)
    },

    canvas: {
      totalOperations: canvasOps.length,
      drawOperations: canvasDrawOps.length,
      methods: [...new Set(canvasDrawOps.map(o => o.method))]
    },

    storage: {
      changes: storageOps.length,
      keysModified: [...new Set(storageOps.map(o => o.key))]
    },

    dom: {
      mutationBatches: domMutations.length,
      totalChanges: totalDomChanges
    },

    stateSnapshots: recording.stateSnapshots.length
  };
}

/**
 * Format summary as human-readable text
 */
function formatSummary(summary) {
  let text = '';

  text += '═══════════════════════════════════════════════════════════════\n';
  text += '  RECORDING SUMMARY\n';
  text += '═══════════════════════════════════════════════════════════════\n\n';

  text += `URL: ${summary.metadata.url}\n`;
  text += `Duration: ${(summary.metadata.duration / 1000).toFixed(1)} seconds\n`;
  text += `Total Events: ${summary.eventCounts.total}\n\n`;

  text += '─── Architecture ───────────────────────────────────────────────\n';
  text += `Frameworks: ${summary.architecture.frameworks.join(', ') || 'none detected'}\n`;
  text += `Rendering: ${summary.architecture.rendering.join(', ')}\n`;
  text += `State Management: ${summary.architecture.stateManagement.join(', ') || 'none detected'}\n\n`;

  text += '─── Events by Category ─────────────────────────────────────────\n';
  for (const [cat, count] of Object.entries(summary.eventCounts.byCategory)) {
    text += `  ${cat}: ${count}\n`;
  }
  text += '\n';

  text += '─── User Events ────────────────────────────────────────────────\n';
  for (const [type, count] of Object.entries(summary.eventCounts.userEvents)) {
    text += `  ${type}: ${count}\n`;
  }
  text += '\n';

  if (summary.canvas.totalOperations > 0) {
    text += '─── Canvas Operations ──────────────────────────────────────────\n';
    text += `  Total: ${summary.canvas.totalOperations}\n`;
    text += `  Draw calls: ${summary.canvas.drawOperations}\n`;
    text += `  Methods used: ${summary.canvas.methods.join(', ')}\n\n`;
  }

  if (summary.network.totalRequests > 0) {
    text += '─── Network ────────────────────────────────────────────────────\n';
    text += `  Total requests: ${summary.network.totalRequests}\n`;
    text += `  Endpoints:\n`;
    for (const ep of summary.network.endpoints.slice(0, 10)) {
      text += `    ${ep}\n`;
    }
    text += '\n';
  }

  text += '─── State Snapshots ────────────────────────────────────────────\n';
  text += `  Captured: ${summary.stateSnapshots}\n\n`;

  return text;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Usage: node v4-poc/record-behavior.js <url> [options]

Options:
  --manual              Open browser for manual interaction
  --duration=<ms>       Recording duration in ms (default: 30000)
  --headless            Run in headless mode
  --help                Show this help

Examples:
  node v4-poc/record-behavior.js https://excalidraw.com --manual --duration=60000
  node v4-poc/record-behavior.js https://example.com --headless
`);
    return;
  }

  const url = args.find(a => !a.startsWith('--'));
  const manual = args.includes('--manual');
  const headless = args.includes('--headless');
  const durationArg = args.find(a => a.startsWith('--duration='));
  const duration = durationArg ? parseInt(durationArg.split('=')[1]) : 30000;

  if (!url) {
    console.error('Error: URL is required');
    process.exit(1);
  }

  try {
    await recordBehavior(url, { manual, duration, headless });
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();

export { recordBehavior, executeAction };
