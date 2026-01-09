#!/usr/bin/env node
/**
 * Behavioral Extractor V2
 *
 * Clicks every interactive element and:
 * 1. Detects if it's FRONTEND (no network) or BACKEND (API call)
 * 2. For FRONTEND: Extracts opened content (modals, dropdowns, panels)
 * 3. For BACKEND: Documents the endpoint and captures loading/success UI
 *
 * Output:
 * - frontend-behaviors.json: Full UI content to clone
 * - backend-requirements.json: API endpoints to implement later
 *
 * Usage: node behavioral-extractor-v2.js <url> [output-dir]
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'https://excalidraw.com';
const outputDir = process.argv[3] || './output/behavioral-v2';

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('============================================================');
  console.log('Behavioral Extractor V2');
  console.log('Detecting Frontend vs Backend behaviors');
  console.log('============================================================');
  console.log(`URL: ${url}`);
  console.log(`Output: ${outputDir}`);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'content'), { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'screenshots'), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // Results
  const frontendBehaviors = [];
  const backendRequirements = [];
  const extractedContent = {};

  console.log('\nNavigating to page...');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  // Dismiss any welcome modals
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Phase 1: Discover interactive elements
  const elements = await discoverInteractiveElements(page);
  console.log(`   Found ${elements.length} interactive elements`);

  // Phase 2: Test each element
  console.log('\n[Phase 2] Testing elements for frontend/backend behavior...');

  // Prioritize buttons with titles/labels
  const priorityElements = elements
    .filter(el => el.attributes.title || el.attributes.ariaLabel || el.flags.isButton)
    .slice(0, 40); // Test more elements

  for (let i = 0; i < priorityElements.length; i++) {
    const element = priorityElements[i];
    const label = element.attributes.title || element.attributes.ariaLabel || element.attributes.text?.slice(0, 30) || element.selector.slice(0, 30);
    process.stdout.write(`   [${i + 1}/${priorityElements.length}] ${label}...`);

    try {
      const result = await testElement(page, element, outputDir, i);

      if (result.isBackend) {
        backendRequirements.push(result);
        console.log(' [BACKEND]');
      } else if (result.frontendContent) {
        frontendBehaviors.push(result);
        extractedContent[result.contentId] = result.frontendContent;
        console.log(' [FRONTEND - content extracted]');
      } else {
        frontendBehaviors.push(result);
        console.log(' [FRONTEND]');
      }

      // Reset page state
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

    } catch (e) {
      console.log(` [ERROR: ${e.message}]`);
    }
  }

  // Save results
  console.log('\n[Phase 3] Saving results...');

  fs.writeFileSync(
    path.join(outputDir, 'frontend-behaviors.json'),
    JSON.stringify({ behaviors: frontendBehaviors, content: extractedContent }, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, 'backend-requirements.json'),
    JSON.stringify({ requirements: backendRequirements }, null, 2)
  );

  // Generate summary
  const summary = generateSummary(frontendBehaviors, backendRequirements);
  fs.writeFileSync(path.join(outputDir, 'summary.md'), summary);

  console.log('\n============================================================');
  console.log('EXTRACTION COMPLETE');
  console.log('============================================================');
  console.log(`Frontend behaviors: ${frontendBehaviors.length}`);
  console.log(`Backend requirements: ${backendRequirements.length}`);
  console.log(`\nOutput files:`);
  console.log(`   ${outputDir}/frontend-behaviors.json`);
  console.log(`   ${outputDir}/backend-requirements.json`);
  console.log(`   ${outputDir}/summary.md`);
  console.log(`   ${outputDir}/content/ (extracted HTML)`);

  await browser.close();
}

// ============================================================
// DISCOVER INTERACTIVE ELEMENTS
// ============================================================
async function discoverInteractiveElements(page) {
  console.log('\n[Phase 1] Discovering interactive elements...');

  return await page.evaluate(() => {
    const elements = [];

    document.querySelectorAll('*').forEach((el, index) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      if (rect.width < 5 || rect.height < 5) return;
      if (style.display === 'none' || style.visibility === 'hidden') return;
      if (parseFloat(style.opacity) === 0) return;

      const isButton = el.matches('button, [role="button"]');
      const isLink = el.matches('a[href], [role="link"]');
      const isInput = el.matches('input, select, textarea');
      const isClickable = style.cursor === 'pointer';
      const hasTabIndex = el.tabIndex >= 0;

      if (!isButton && !isLink && !isInput && !isClickable && !hasTabIndex) return;

      // Generate selector
      let selector = null;
      if (el.id) selector = `#${el.id}`;
      else if (el.getAttribute('data-testid')) selector = `[data-testid="${el.getAttribute('data-testid')}"]`;
      else if (el.getAttribute('aria-label')) selector = `[aria-label="${el.getAttribute('aria-label')}"]`;
      else if (el.getAttribute('title')) selector = `[title="${el.getAttribute('title')}"]`;
      else if (el.className && typeof el.className === 'string') {
        const mainClass = el.className.split(' ')[0];
        if (mainClass) selector = `.${mainClass}`;
      }

      if (!selector) return;

      elements.push({
        index,
        selector,
        tag: el.tagName.toLowerCase(),
        bounds: { x: rect.x + rect.width/2, y: rect.y + rect.height/2, width: rect.width, height: rect.height },
        attributes: {
          id: el.id,
          className: el.className,
          title: el.getAttribute('title'),
          ariaLabel: el.getAttribute('aria-label'),
          ariaExpanded: el.getAttribute('aria-expanded'),
          dataTestId: el.getAttribute('data-testid'),
          type: el.type,
          text: el.textContent?.trim()?.slice(0, 50)
        },
        flags: { isButton, isLink, isInput, isClickable, hasTabIndex }
      });
    });

    return elements;
  });
}

// ============================================================
// TEST ELEMENT - Detect Frontend vs Backend
// ============================================================
async function testElement(page, element, outputDir, index) {
  const result = {
    element: element.selector,
    label: element.attributes.title || element.attributes.ariaLabel || element.attributes.text?.slice(0, 30),
    isBackend: false,
    pattern: null,
    frontendContent: null,
    contentId: null,
    networkRequests: [],
    uiChanges: {}
  };

  // Set up network interception
  const networkRequests = [];
  const requestHandler = (request) => {
    const type = request.resourceType();
    const reqUrl = request.url();

    // Only track API calls, not static assets
    if ((type === 'fetch' || type === 'xhr') &&
        !reqUrl.includes('.js') &&
        !reqUrl.includes('.css') &&
        !reqUrl.includes('.png') &&
        !reqUrl.includes('.svg') &&
        !reqUrl.includes('analytics') &&
        !reqUrl.includes('tracking')) {
      networkRequests.push({
        url: reqUrl,
        method: request.method(),
        postData: request.postData()
      });
    }
  };

  page.on('request', requestHandler);

  try {
    // Capture before state
    const beforeState = await captureUIState(page);

    // Click the element
    await page.click(element.selector, { timeout: 2000 });

    // Wait for network activity and UI changes
    await page.waitForTimeout(500);

    // Capture after state
    const afterState = await captureUIState(page);

    // Remove listener
    page.off('request', requestHandler);

    // Analyze results
    result.networkRequests = networkRequests;
    result.isBackend = networkRequests.length > 0;

    // Detect UI changes
    const newModals = afterState.modals.filter(m => !beforeState.modals.includes(m));
    const newDropdowns = afterState.dropdowns.filter(d => !beforeState.dropdowns.includes(d));
    const newPanels = afterState.panels.filter(p => !beforeState.panels.includes(p));

    result.uiChanges = {
      modalsOpened: newModals,
      dropdownsOpened: newDropdowns,
      panelsOpened: newPanels,
      selectedChanged: afterState.selected !== beforeState.selected
    };

    // Classify pattern
    if (result.isBackend) {
      // BACKEND: Document the API requirement
      result.pattern = 'backend_action';
      result.endpoint = networkRequests[0]?.url;
      result.method = networkRequests[0]?.method;
      result.payload = networkRequests[0]?.postData;

      // Capture the success UI (what appears after API call)
      await page.waitForTimeout(1000); // Wait for response
      result.successUI = await extractOpenedContent(page);

      // Save screenshot
      const screenshotPath = path.join(outputDir, 'screenshots', `backend-${index}.png`);
      await page.screenshot({ path: screenshotPath });
      result.screenshotPath = screenshotPath;

    } else if (newModals.length > 0 || newDropdowns.length > 0 || newPanels.length > 0) {
      // FRONTEND: Extract the opened content
      result.pattern = 'opens_ui';
      result.contentId = `content-${index}`;
      result.frontendContent = await extractOpenedContent(page);

      // Save the HTML content
      if (result.frontendContent?.html) {
        fs.writeFileSync(
          path.join(outputDir, 'content', `${result.contentId}.html`),
          result.frontendContent.html
        );
      }

      // Save screenshot
      const screenshotPath = path.join(outputDir, 'screenshots', `frontend-${index}.png`);
      await page.screenshot({ path: screenshotPath });
      result.screenshotPath = screenshotPath;

    } else {
      // Simple frontend action (toggle, selection, etc.)
      result.pattern = classifySimplePattern(beforeState, afterState, element);
    }

  } catch (e) {
    page.off('request', requestHandler);
    result.error = e.message;
  }

  return result;
}

// ============================================================
// CAPTURE UI STATE
// ============================================================
async function captureUIState(page) {
  return await page.evaluate(() => {
    const state = {
      modals: [],
      dropdowns: [],
      panels: [],
      selected: [],
      expanded: []
    };

    // Capture open modals
    document.querySelectorAll('[role="dialog"], .modal, .Modal, [class*="modal"], [class*="Modal"]').forEach(el => {
      if (el.offsetParent !== null) { // Is visible
        state.modals.push(el.className || el.id || 'modal');
      }
    });

    // Capture open dropdowns/menus
    document.querySelectorAll('[role="menu"], [role="listbox"], .dropdown-menu, [class*="dropdown"], [class*="Dropdown"], [aria-expanded="true"]').forEach(el => {
      if (el.offsetParent !== null) {
        state.dropdowns.push(el.className || el.id || 'dropdown');
      }
    });

    // Capture panels/popovers
    document.querySelectorAll('[role="tooltip"], .popover, .panel, [class*="popover"], [class*="Popover"], [class*="panel"], [class*="Panel"]').forEach(el => {
      if (el.offsetParent !== null) {
        state.panels.push(el.className || el.id || 'panel');
      }
    });

    // Capture selected elements
    document.querySelectorAll('[aria-selected="true"], .selected, .active, [class*="selected"], [class*="active"]').forEach(el => {
      const id = el.id || el.getAttribute('title') || el.className?.split?.(' ')?.[0];
      if (id) state.selected.push(id);
    });

    // Capture expanded elements
    document.querySelectorAll('[aria-expanded="true"]').forEach(el => {
      const id = el.id || el.getAttribute('title') || el.className?.split?.(' ')?.[0];
      if (id) state.expanded.push(id);
    });

    return state;
  });
}

// ============================================================
// EXTRACT OPENED CONTENT (Modal, Dropdown, Panel)
// ============================================================
async function extractOpenedContent(page) {
  return await page.evaluate(() => {
    // Priority order: Look for containers, not child elements
    const selectors = [
      // High priority - actual container elements
      '[role="dialog"]',
      '[role="menu"]:not([role="menu"] [role="menu"])', // Top-level menu only
      '.Modal:not(.Modal .Modal)',
      '.modal:not(.modal .modal)',
      '.dropdown-menu:not(.dropdown-menu .dropdown-menu)',
      '.dropdown-menu-container',
      '.popover:not(.popover .popover)',
      '.Popover__content',
      '.color-picker-container',
      '.HelpDialog',
      '.ShareDialog',
      // Lower priority
      '[class*="Dialog"]:not([class*="Dialog"] [class*="Dialog"])',
      '[class*="Panel"]:not([class*="Panel"] [class*="Panel"])',
    ];

    let target = null;

    // Find the first matching container that's visible and has content
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          // Must be visible
          if (el.offsetParent === null) continue;
          // Must have reasonable size (not just an icon)
          const rect = el.getBoundingClientRect();
          if (rect.width < 50 || rect.height < 50) continue;
          // Must have some content (buttons, text, etc)
          if (el.querySelectorAll('button, a, input, [role="menuitem"]').length > 0 ||
              el.textContent.trim().length > 20) {
            target = el;
            break;
          }
        }
        if (target) break;
      } catch (e) {
        // Invalid selector, skip
      }
    }

    if (!target) return null;

    const rect = target.getBoundingClientRect();

    // Get all interactive elements inside
    const interactiveElements = [...target.querySelectorAll('button, a, input, select, [role="button"], [role="menuitem"], [role="option"]')].map(el => ({
      tag: el.tagName.toLowerCase(),
      text: el.textContent?.trim()?.slice(0, 50),
      title: el.getAttribute('title'),
      ariaLabel: el.getAttribute('aria-label'),
      type: el.type,
      value: el.value,
      className: typeof el.className === 'string' ? el.className : ''
    }));

    // Get computed styles for the container
    const styles = getComputedStyle(target);

    return {
      html: target.outerHTML,
      className: typeof target.className === 'string' ? target.className : '',
      id: target.id,
      role: target.getAttribute('role'),
      bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      interactiveElements,
      interactiveCount: interactiveElements.length,
      textContent: target.textContent?.trim()?.slice(0, 500),
      styles: {
        position: styles.position,
        zIndex: styles.zIndex,
        background: styles.background,
        borderRadius: styles.borderRadius,
        boxShadow: styles.boxShadow
      }
    };
  });
}

// ============================================================
// CLASSIFY SIMPLE PATTERNS
// ============================================================
function classifySimplePattern(beforeState, afterState, element) {
  // Selection changed
  const selectedBefore = new Set(beforeState.selected);
  const selectedAfter = new Set(afterState.selected);

  const newlySelected = [...selectedAfter].filter(x => !selectedBefore.has(x));
  const deselected = [...selectedBefore].filter(x => !selectedAfter.has(x));

  if (newlySelected.length > 0 && deselected.length > 0) {
    return 'radio'; // Mutual exclusion
  }
  if (newlySelected.length > 0 || deselected.length > 0) {
    return 'toggle'; // Toggle selection
  }

  // Expansion changed
  const expandedBefore = new Set(beforeState.expanded);
  const expandedAfter = new Set(afterState.expanded);

  if (expandedBefore.size !== expandedAfter.size) {
    return 'expand_collapse';
  }

  return 'action'; // Generic action
}

// ============================================================
// GENERATE SUMMARY
// ============================================================
function generateSummary(frontendBehaviors, backendRequirements) {
  let summary = `# Behavioral Extraction Summary\n\n`;
  summary += `Generated: ${new Date().toISOString()}\n\n`;

  summary += `## Frontend Behaviors (${frontendBehaviors.length})\n\n`;
  summary += `These can be fully cloned - no backend needed.\n\n`;

  const byPattern = {};
  frontendBehaviors.forEach(b => {
    const pattern = b.pattern || 'unknown';
    if (!byPattern[pattern]) byPattern[pattern] = [];
    byPattern[pattern].push(b);
  });

  for (const [pattern, behaviors] of Object.entries(byPattern)) {
    summary += `### ${pattern} (${behaviors.length})\n\n`;
    behaviors.forEach(b => {
      summary += `- **${b.label || b.element}**`;
      if (b.contentId) summary += ` → extracted content: ${b.contentId}.html`;
      summary += `\n`;
    });
    summary += `\n`;
  }

  summary += `---\n\n`;
  summary += `## Backend Requirements (${backendRequirements.length})\n\n`;
  summary += `These need API implementation. Clone shows mock UI.\n\n`;

  backendRequirements.forEach(b => {
    summary += `### ${b.label || b.element}\n\n`;
    summary += `- **Endpoint**: \`${b.method} ${b.endpoint}\`\n`;
    if (b.payload) summary += `- **Payload**: \`${b.payload}\`\n`;
    summary += `- **Screenshot**: ${b.screenshotPath}\n`;
    summary += `- **Mock Strategy**: Show success UI with placeholder data\n`;
    summary += `\n`;
  });

  return summary;
}

// Run
main().catch(console.error);
