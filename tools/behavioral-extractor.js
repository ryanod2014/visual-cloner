#!/usr/bin/env node
/**
 * Behavioral Extractor
 *
 * Actually CLICKS every interactive element on the source site and records:
 * 1. What DOM/CSS changes occurred
 * 2. What the interaction PATTERN is (radio, toggle, action, opens-panel, etc.)
 * 3. What state transitions happen
 *
 * This solves the problem of extracting APPEARANCE but missing BEHAVIOR.
 *
 * Usage: node behavioral-extractor.js <url> [output-dir]
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'https://excalidraw.com';
const outputDir = process.argv[3] || './output/behavioral-extract';

// ============================================================
// PHASE 1: DISCOVER ALL INTERACTIVE ELEMENTS
// ============================================================
async function discoverInteractiveElements(page) {
  console.log('\n[Phase 1] Discovering interactive elements...');

  return await page.evaluate(() => {
    const elements = [];

    document.querySelectorAll('*').forEach((el, index) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      // Skip invisible/tiny elements
      if (rect.width < 5 || rect.height < 5) return;
      if (style.display === 'none' || style.visibility === 'hidden') return;
      if (parseFloat(style.opacity) === 0) return;

      // Determine if interactive
      const isButton = el.matches('button, [role="button"]');
      const isLink = el.matches('a[href], [role="link"]');
      const isInput = el.matches('input, select, textarea');
      const isClickable = style.cursor === 'pointer';
      const hasTabIndex = el.tabIndex >= 0;
      const hasAriaRole = el.hasAttribute('role');

      const isInteractive = isButton || isLink || isInput || isClickable || hasTabIndex;

      if (!isInteractive) return;

      // Generate a reliable selector
      const generateSelector = (element) => {
        if (element.id) return `#${element.id}`;

        const title = element.getAttribute('title');
        if (title) return `[title="${title.replace(/"/g, '\\"')}"]`;

        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel) return `[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;

        const dataTestId = element.getAttribute('data-testid');
        if (dataTestId) return `[data-testid="${dataTestId}"]`;

        // Use class + position as fallback
        const className = element.className?.split?.(' ')?.[0];
        if (className && typeof className === 'string') {
          const siblings = document.querySelectorAll(`.${className}`);
          if (siblings.length === 1) return `.${className}`;
          const idx = Array.from(siblings).indexOf(element);
          return `.${className}:nth-of-type(${idx + 1})`;
        }

        return null;
      };

      const selector = generateSelector(el);
      if (!selector) return;

      elements.push({
        index,
        selector,
        tag: el.tagName.toLowerCase(),
        bounds: {
          x: Math.round(rect.x + rect.width / 2),  // Center point for clicking
          y: Math.round(rect.y + rect.height / 2),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        attributes: {
          id: el.id,
          className: el.className,
          title: el.getAttribute('title'),
          ariaLabel: el.getAttribute('aria-label'),
          ariaRole: el.getAttribute('role'),
          ariaSelected: el.getAttribute('aria-selected'),
          ariaExpanded: el.getAttribute('aria-expanded'),
          ariaPressed: el.getAttribute('aria-pressed'),
          dataTestId: el.getAttribute('data-testid'),
          type: el.getAttribute('type'),
          text: el.textContent?.trim().slice(0, 30)
        },
        flags: {
          isButton,
          isLink,
          isInput,
          isClickable,
          hasTabIndex,
          hasAriaRole
        },
        parent: {
          id: el.parentElement?.id,
          className: el.parentElement?.className?.split?.(' ')?.[0],
          tag: el.parentElement?.tagName?.toLowerCase()
        }
      });
    });

    return elements;
  });
}

// ============================================================
// PHASE 2: CAPTURE STATE SNAPSHOT
// ============================================================
async function captureState(page) {
  return await page.evaluate(() => {
    const state = {
      // Selected elements (various patterns)
      selected: [],
      expanded: [],
      pressed: [],
      checked: [],

      // Visual state
      elementsWithClass: {},

      // DOM structure changes
      visibleModals: [],
      visiblePopups: [],

      // URL
      url: window.location.href,

      // Canvas state (if applicable)
      canvasDataUrl: null
    };

    // Capture selected elements
    document.querySelectorAll('[aria-selected="true"], .selected, .active, .tool-selected, .option-selected, .color-selected').forEach(el => {
      const selector = el.id ? `#${el.id}` :
                       el.getAttribute('title') ? `[title="${el.getAttribute('title')}"]` :
                       el.getAttribute('aria-label') ? `[aria-label="${el.getAttribute('aria-label')}"]` :
                       el.className?.split?.(' ')?.[0] ? `.${el.className.split(' ')[0]}` : null;
      if (selector) state.selected.push(selector);
    });

    // Capture expanded elements
    document.querySelectorAll('[aria-expanded="true"]').forEach(el => {
      const selector = el.id ? `#${el.id}` : el.className?.split?.(' ')?.[0] ? `.${el.className.split(' ')[0]}` : null;
      if (selector) state.expanded.push(selector);
    });

    // Capture pressed elements
    document.querySelectorAll('[aria-pressed="true"]').forEach(el => {
      const selector = el.id ? `#${el.id}` : el.className?.split?.(' ')?.[0] ? `.${el.className.split(' ')[0]}` : null;
      if (selector) state.pressed.push(selector);
    });

    // Capture modals/popups
    document.querySelectorAll('[role="dialog"]:not([hidden]), .modal:not([hidden]), [role="menu"]:not([hidden])').forEach(el => {
      state.visibleModals.push(el.className || el.id || 'unknown');
    });

    // Capture elements with specific classes
    ['selected', 'active', 'tool-selected', 'option-selected', 'color-selected', 'expanded', 'open', 'visible'].forEach(cls => {
      const elements = document.querySelectorAll(`.${cls}`);
      if (elements.length > 0) {
        state.elementsWithClass[cls] = Array.from(elements).map(el =>
          el.id ? `#${el.id}` : el.getAttribute('title') || el.className?.split?.(' ')?.[0]
        ).filter(Boolean);
      }
    });

    return state;
  });
}

// ============================================================
// PHASE 3: CLICK AND RECORD BEHAVIOR
// ============================================================
async function extractBehavior(page, element) {
  const behavior = {
    element: element.selector,
    attributes: element.attributes,
    clicked: false,
    error: null,
    pattern: null,
    changes: {}
  };

  try {
    // Capture before state
    const beforeState = await captureState(page);
    const beforeScreenshot = await page.screenshot({ type: 'png' });

    // Click the element
    await page.click(element.selector, { timeout: 2000 });
    behavior.clicked = true;

    // Wait for any animations/state changes
    await page.waitForTimeout(300);

    // Capture after state
    const afterState = await captureState(page);

    // Analyze changes
    const newSelected = afterState.selected.filter(s => !beforeState.selected.includes(s));
    const deselected = beforeState.selected.filter(s => !afterState.selected.includes(s));
    const newModals = afterState.visibleModals.filter(m => !beforeState.visibleModals.includes(m));
    const closedModals = beforeState.visibleModals.filter(m => !afterState.visibleModals.includes(m));
    const newExpanded = afterState.expanded.filter(e => !beforeState.expanded.includes(e));
    const collapsed = beforeState.expanded.filter(e => !afterState.expanded.includes(e));

    behavior.changes = {
      selected: { added: newSelected, removed: deselected },
      modals: { opened: newModals, closed: closedModals },
      expanded: { added: newExpanded, removed: collapsed },
      urlChanged: beforeState.url !== afterState.url,
      newUrl: afterState.url !== beforeState.url ? afterState.url : null
    };

    // CLASSIFY THE INTERACTION PATTERN
    behavior.pattern = classifyPattern(behavior.changes, element, {
      beforeState,
      afterState
    });

    // Reset state if possible (click somewhere neutral or press Escape)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

  } catch (e) {
    behavior.error = e.message;
  }

  return behavior;
}

function classifyPattern(changes, element, states) {
  // RADIO BUTTON PATTERN: One thing selected, another deselected
  if (changes.selected.added.length > 0 && changes.selected.removed.length > 0) {
    return {
      type: 'radio',
      description: 'Mutually exclusive selection - clicking selects this, deselects others',
      group: findGroupName(element, changes.selected.removed),
      implementation: `
// Radio button pattern
const handleClick = () => {
  // Deselect siblings: ${JSON.stringify(changes.selected.removed)}
  // Select this: ${JSON.stringify(changes.selected.added)}
  setState(prevState => ({
    ...prevState,
    [groupKey]: newValue
  }));
};`
    };
  }

  // TOGGLE PATTERN: Element toggles its own state
  if (changes.selected.added.length === 1 && changes.selected.removed.length === 0 &&
      changes.selected.added[0].includes(element.selector?.split('[')[1]?.split(']')[0] || element.attributes.title)) {
    return {
      type: 'toggle',
      description: 'Toggles own selected state on/off',
      implementation: `
// Toggle pattern
const handleClick = () => {
  setSelected(prev => !prev);
};`
    };
  }

  // OPENS MODAL/PANEL PATTERN
  if (changes.modals.opened.length > 0) {
    return {
      type: 'opens_modal',
      description: 'Opens a modal or panel',
      modal: changes.modals.opened[0],
      implementation: `
// Opens modal pattern
const handleClick = () => {
  setShowModal(true);
};`
    };
  }

  // EXPANDS/COLLAPSES PATTERN
  if (changes.expanded.added.length > 0 || changes.expanded.removed.length > 0) {
    return {
      type: 'toggle_expand',
      description: 'Expands or collapses a section',
      implementation: `
// Expand/collapse pattern
const handleClick = () => {
  setExpanded(prev => !prev);
};`
    };
  }

  // NAVIGATION PATTERN
  if (changes.urlChanged) {
    return {
      type: 'navigation',
      description: 'Navigates to a different URL/route',
      destination: changes.newUrl,
      implementation: `
// Navigation pattern
const handleClick = () => {
  navigate('${changes.newUrl}');
};`
    };
  }

  // ACTION PATTERN (no visible state change, probably triggers something)
  if (element.attributes.title || element.attributes.ariaLabel) {
    return {
      type: 'action',
      description: `Triggers action: ${element.attributes.title || element.attributes.ariaLabel}`,
      implementation: `
// Action pattern
const handleClick = () => {
  // Execute action: ${element.attributes.title || element.attributes.ariaLabel}
  performAction();
};`
    };
  }

  return {
    type: 'unknown',
    description: 'Interaction pattern not detected',
    changes
  };
}

function findGroupName(element, deselected) {
  // Try to infer group name from parent or deselected elements
  if (element.parent?.className) {
    return element.parent.className;
  }
  if (deselected.length > 0) {
    // Look for common parent
    const common = deselected[0].split('-')[0];
    return common;
  }
  return 'unknown-group';
}

// ============================================================
// PHASE 4: GROUP DETECTION (RADIO GROUPS)
// ============================================================
function detectGroups(elements, behaviors) {
  console.log('\n[Phase 4] Detecting interaction groups...');

  const groups = [];
  const processedElements = new Set();

  // Find radio groups by looking at elements that deselect each other
  for (const behavior of behaviors) {
    if (behavior.pattern?.type !== 'radio') continue;
    if (processedElements.has(behavior.element)) continue;

    const groupMembers = [behavior.element];
    const deselected = behavior.changes.selected.removed;

    // Find all elements that are part of this radio group
    for (const other of behaviors) {
      if (other.element === behavior.element) continue;
      if (deselected.some(d => other.element.includes(d) || d.includes(other.attributes?.title || ''))) {
        groupMembers.push(other.element);
        processedElements.add(other.element);
      }
    }

    if (groupMembers.length > 1) {
      groups.push({
        type: 'radio_group',
        name: behavior.pattern.group || `group-${groups.length}`,
        members: groupMembers,
        stateKey: inferStateKey(behavior)
      });
    }

    processedElements.add(behavior.element);
  }

  // Find groups by parent (elements with same parent that are all clickable)
  const byParent = {};
  for (const el of elements) {
    const parentKey = el.parent.id || el.parent.className || 'root';
    if (!byParent[parentKey]) byParent[parentKey] = [];
    byParent[parentKey].push(el);
  }

  for (const [parentKey, siblings] of Object.entries(byParent)) {
    if (siblings.length >= 2 && siblings.length <= 20) {
      const allHaveTitles = siblings.every(s => s.attributes.title || s.attributes.ariaLabel);
      const allClickable = siblings.every(s => s.flags.isClickable || s.flags.isButton);

      if (allClickable && allHaveTitles && !groups.some(g => g.members.some(m => siblings.some(s => s.selector === m)))) {
        groups.push({
          type: 'likely_radio_group',
          name: parentKey,
          members: siblings.map(s => s.selector),
          labels: siblings.map(s => s.attributes.title || s.attributes.ariaLabel),
          stateKey: inferStateKeyFromLabels(siblings)
        });
      }
    }
  }

  console.log(`   Found ${groups.length} interaction groups`);
  return groups;
}

function inferStateKey(behavior) {
  const title = behavior.attributes?.title?.toLowerCase() || '';
  const label = behavior.attributes?.ariaLabel?.toLowerCase() || '';
  const text = title || label;

  if (text.includes('rectangle') || text.includes('ellipse') || text.includes('line') || text.includes('draw') || text.includes('text') || text.includes('arrow')) {
    return 'selectedTool';
  }
  if (text.includes('thin') || text.includes('bold') || text.includes('extra')) {
    return 'strokeWidth';
  }
  if (text.includes('solid') || text.includes('dashed') || text.includes('dotted')) {
    return 'strokeStyle';
  }
  if (text.includes('architect') || text.includes('artist') || text.includes('cartoon')) {
    return 'sloppiness';
  }
  if (text.includes('sharp') || text.includes('round')) {
    return 'edges';
  }
  return 'unknownState';
}

function inferStateKeyFromLabels(siblings) {
  const labels = siblings.map(s => (s.attributes.title || s.attributes.ariaLabel || '').toLowerCase());

  if (labels.some(l => l.includes('rectangle') || l.includes('ellipse'))) return 'selectedTool';
  if (labels.some(l => l.includes('thin') || l.includes('bold'))) return 'strokeWidth';
  if (labels.some(l => l.includes('solid') || l.includes('dashed'))) return 'strokeStyle';
  if (labels.some(l => l.includes('architect') || l.includes('artist'))) return 'sloppiness';
  if (labels.some(l => l.includes('sharp') || l.includes('round'))) return 'edges';

  return 'unknownState';
}

// ============================================================
// PHASE 5: GENERATE FIXES
// ============================================================
function generateFixes(behaviors, groups) {
  console.log('\n[Phase 5] Generating behavioral fixes...');

  const fixes = [];

  // Fix 1: Radio group mutual exclusivity
  for (const group of groups.filter(g => g.type === 'radio_group' || g.type === 'likely_radio_group')) {
    fixes.push({
      issue: `Radio group "${group.name}" - only one should be selected at a time`,
      stateKey: group.stateKey,
      members: group.members,
      fix: `
// Ensure mutual exclusivity for ${group.name}
// State: const [${group.stateKey}, set${capitalize(group.stateKey)}] = useState(defaultValue);

// Each button should:
// 1. Set state to its value
// 2. CSS selection class applied via: className={\`\${${group.stateKey} === 'thisValue' ? 'option-selected' : ''}\`}

// The class should ONLY be applied when state matches - no manual class toggling needed
`
    });
  }

  // Fix 2: Tool-specific behaviors
  const toolBehaviors = behaviors.filter(b =>
    b.attributes?.title?.toLowerCase().includes('text') ||
    b.attributes?.title?.toLowerCase().includes('eraser')
  );

  for (const tool of toolBehaviors) {
    if (tool.attributes?.title?.toLowerCase().includes('text')) {
      fixes.push({
        issue: 'Text tool should enable inline editing, not open modal',
        element: tool.element,
        fix: `
// Text tool: Click canvas → place cursor → type inline
// NOT: Click canvas → open modal

const handleCanvasClick = (e) => {
  if (selectedTool === 'text') {
    // Create inline text input at click position
    setTextEditing({
      active: true,
      x: e.clientX,
      y: e.clientY,
      value: ''
    });
    // Do NOT open a modal
  }
};

// Render inline text input overlay (not modal):
{textEditing.active && (
  <input
    type="text"
    autoFocus
    style={{
      position: 'absolute',
      left: textEditing.x,
      top: textEditing.y,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontSize: '20px'
    }}
    value={textEditing.value}
    onChange={(e) => setTextEditing(prev => ({...prev, value: e.target.value}))}
    onBlur={() => {
      // Create text shape and end editing
      if (textEditing.value) {
        addShape({ type: 'text', x: textEditing.x, y: textEditing.y, text: textEditing.value });
      }
      setTextEditing({ active: false });
    }}
  />
)}
`
      });
    }

    if (tool.attributes?.title?.toLowerCase().includes('eraser')) {
      fixes.push({
        issue: 'Eraser should delete shapes under cursor',
        element: tool.element,
        fix: `
// Eraser tool: Click/drag over shapes → delete them

const handleCanvasMouseDown = (e) => {
  if (selectedTool === 'eraser') {
    const point = getCanvasPoint(e);
    eraseShapesAtPoint(point);
  }
};

const handleCanvasMouseMove = (e) => {
  if (selectedTool === 'eraser' && isMouseDown) {
    const point = getCanvasPoint(e);
    eraseShapesAtPoint(point);
  }
};

const eraseShapesAtPoint = (point) => {
  setShapes(prev => prev.filter(shape => {
    // Check if point is inside shape bounds
    const inBounds = (
      point.x >= shape.x &&
      point.x <= shape.x + shape.width &&
      point.y >= shape.y &&
      point.y <= shape.y + shape.height
    );
    return !inBounds; // Keep shapes NOT under eraser
  }));
};
`
      });
    }
  }

  console.log(`   Generated ${fixes.length} behavioral fixes`);
  return fixes;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('Behavioral Extractor');
  console.log('Extracting HOW elements behave, not just WHAT they look like');
  console.log('='.repeat(60));
  console.log(`URL: ${url}`);
  console.log(`Output: ${outputDir}`);

  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  console.log('\nNavigating to page...');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  // Phase 1: Discover elements
  const elements = await discoverInteractiveElements(page);
  console.log(`   Found ${elements.length} interactive elements`);

  // Phase 2 & 3: Extract behavior by clicking each element
  console.log('\n[Phase 2-3] Clicking elements and recording behavior...');
  const behaviors = [];

  // Limit to most important elements (tools, options, etc.)
  const priorityElements = elements.filter(el =>
    el.attributes.title ||
    el.attributes.ariaLabel ||
    el.flags.isButton
  ).slice(0, 100); // Limit for speed

  console.log(`   Testing ${priorityElements.length} priority elements...`);

  for (let i = 0; i < priorityElements.length; i++) {
    const el = priorityElements[i];
    process.stdout.write(`\r   Progress: ${i + 1}/${priorityElements.length} - ${el.attributes.title || el.selector.slice(0, 30)}...`);

    const behavior = await extractBehavior(page, el);
    behaviors.push(behavior);

    // Brief pause between clicks
    await page.waitForTimeout(100);
  }
  console.log('\n');

  // Phase 4: Detect groups
  const groups = detectGroups(elements, behaviors);

  // Phase 5: Generate fixes
  const fixes = generateFixes(behaviors, groups);

  await browser.close();

  // Save results
  const manifest = {
    meta: {
      source: url,
      extractedAt: new Date().toISOString(),
      elementsDiscovered: elements.length,
      elementsTested: behaviors.length,
      groupsDetected: groups.length,
      fixesGenerated: fixes.length
    },
    elements: elements.slice(0, 50), // Summary
    behaviors: behaviors.filter(b => b.pattern?.type !== 'unknown'),
    groups,
    fixes
  };

  fs.writeFileSync(
    path.join(outputDir, 'behavioral-manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  // Generate fixes file
  let fixesContent = `/**
 * Behavioral Fixes for ${url}
 * Generated: ${new Date().toISOString()}
 *
 * These fixes address interaction patterns that were missed:
 */

`;
  for (const fix of fixes) {
    fixesContent += `\n// ========================================\n`;
    fixesContent += `// ISSUE: ${fix.issue}\n`;
    fixesContent += `// Element: ${fix.element || 'Multiple'}\n`;
    fixesContent += `// ========================================\n`;
    fixesContent += fix.fix + '\n';
  }

  fs.writeFileSync(path.join(outputDir, 'behavioral-fixes.js'), fixesContent);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('BEHAVIORAL EXTRACTION COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nInteraction Patterns Detected:`);

  const patternCounts = {};
  for (const b of behaviors) {
    const type = b.pattern?.type || 'unknown';
    patternCounts[type] = (patternCounts[type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(patternCounts)) {
    console.log(`   ${type}: ${count}`);
  }

  console.log(`\nGroups Detected: ${groups.length}`);
  for (const g of groups) {
    console.log(`   ${g.name}: ${g.members.length} members (${g.stateKey})`);
  }

  console.log(`\nFixes Generated: ${fixes.length}`);
  for (const f of fixes) {
    console.log(`   - ${f.issue.slice(0, 60)}...`);
  }

  console.log(`\nOutput Files:`);
  console.log(`   ${outputDir}/behavioral-manifest.json`);
  console.log(`   ${outputDir}/behavioral-fixes.js`);
  console.log('\n');
}

main().catch(console.error);
