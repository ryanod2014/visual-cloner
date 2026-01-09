/**
 * Comprehensive UI Interactivity Extractor
 *
 * Extracts ALL interactive behaviors from a source site:
 * 1. Every clickable element
 * 2. Every hover state
 * 3. Every keyboard shortcut
 * 4. Every state change
 * 5. Element relationships/groups
 *
 * Usage: node extract-all-interactivity.js <url>
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ============================================================
// STAGE 1: Static Element Discovery
// ============================================================
async function discoverElements(page) {
  console.log('Stage 1: Discovering all elements...');

  return await page.evaluate(() => {
    const elements = [];

    document.querySelectorAll('*').forEach((el, index) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      // Skip invisible/tiny elements
      if (rect.width < 1 || rect.height < 1) return;
      if (style.display === 'none' || style.visibility === 'hidden') return;

      // Determine if interactive
      const isButton = el.matches('button, [role="button"]');
      const isLink = el.matches('a, [role="link"]');
      const isInput = el.matches('input, select, textarea');
      const isClickable = style.cursor === 'pointer';
      const hasHandler = el.onclick !== null;
      const isFocusable = el.tabIndex >= 0;

      const isInteractive = isButton || isLink || isInput || isClickable || hasHandler || isFocusable;

      if (!isInteractive) return;

      elements.push({
        id: el.id || el.className?.split(' ')[0] || `el-${index}`,
        index,
        tag: el.tagName.toLowerCase(),

        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },

        semantic: {
          id: el.id,
          className: el.className,
          title: el.title,
          ariaLabel: el.getAttribute('aria-label'),
          ariaRole: el.getAttribute('role'),
          ariaSelected: el.getAttribute('aria-selected'),
          ariaExpanded: el.getAttribute('aria-expanded'),
          ariaDisabled: el.getAttribute('aria-disabled'),
          ariaControls: el.getAttribute('aria-controls'),
          text: el.textContent?.trim().slice(0, 50),
          type: el.getAttribute('type'),
          name: el.getAttribute('name'),
          value: el.value,
        },

        visual: {
          cursor: style.cursor,
          backgroundColor: style.backgroundColor,
          color: style.color,
          borderColor: style.borderColor,
          boxShadow: style.boxShadow,
          opacity: style.opacity,
        },

        flags: {
          isButton,
          isLink,
          isInput,
          isClickable,
          hasHandler,
          isFocusable,
          isDisabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
          hasSvgChild: el.querySelector('svg') !== null,
        },

        parent: {
          id: el.parentElement?.id,
          className: el.parentElement?.className?.split(' ')[0],
          tag: el.parentElement?.tagName?.toLowerCase(),
        },

        siblingCount: el.parentElement?.children.length - 1,
      });
    });

    return elements;
  });
}

// ============================================================
// STAGE 2: Hover State Detection
// ============================================================
async function detectHoverStates(page, elements) {
  console.log('Stage 2: Detecting hover states...');

  const hoverStates = {};

  for (const el of elements.slice(0, 100)) { // Limit for speed
    try {
      // Get element selector
      const selector = el.semantic.id ? `#${el.semantic.id}` :
                       el.semantic.className ? `.${el.semantic.className.split(' ')[0]}` :
                       `[data-index="${el.index}"]`;

      // Capture before
      const before = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const style = getComputedStyle(el);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
          boxShadow: style.boxShadow,
          transform: style.transform,
          opacity: style.opacity,
        };
      }, selector);

      if (!before) continue;

      // Hover
      await page.hover(selector).catch(() => {});
      await page.waitForTimeout(150);

      // Capture after
      const after = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const style = getComputedStyle(el);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
          boxShadow: style.boxShadow,
          transform: style.transform,
          opacity: style.opacity,
        };
      }, selector);

      // Check for changes
      if (after && JSON.stringify(before) !== JSON.stringify(after)) {
        hoverStates[el.id] = {
          before,
          after,
          changes: Object.keys(before).filter(k => before[k] !== after[k])
        };
      }

      // Move away
      await page.mouse.move(0, 0);

    } catch (e) {
      // Skip elements that can't be hovered
    }
  }

  console.log(`  Found ${Object.keys(hoverStates).length} elements with hover states`);
  return hoverStates;
}

// ============================================================
// STAGE 3: Click Behavior Detection
// ============================================================
async function detectClickBehaviors(page, elements) {
  console.log('Stage 3: Detecting click behaviors...');

  const behaviors = {};
  const clickableElements = elements.filter(e => e.flags.isClickable || e.flags.isButton);

  console.log(`  Testing ${clickableElements.length} clickable elements...`);

  // Capture initial state
  const captureState = async () => {
    return await page.evaluate(() => {
      const state = {
        selectedElements: [],
        expandedElements: [],
        visibleModals: [],
        url: window.location.href,
      };

      document.querySelectorAll('[aria-selected="true"], .selected, .active, .tool-selected, .option-selected, .color-selected').forEach(el => {
        state.selectedElements.push(el.className || el.id);
      });

      document.querySelectorAll('[aria-expanded="true"]').forEach(el => {
        state.expandedElements.push(el.className || el.id);
      });

      document.querySelectorAll('[role="dialog"]:not([hidden]), .modal:not([hidden])').forEach(el => {
        state.visibleModals.push(el.className || el.id);
      });

      return state;
    });
  };

  for (const el of clickableElements.slice(0, 50)) { // Limit for speed
    try {
      const selector = el.semantic.title ? `[title="${el.semantic.title}"]` :
                       el.semantic.ariaLabel ? `[aria-label="${el.semantic.ariaLabel}"]` :
                       el.semantic.id ? `#${el.semantic.id}` :
                       `.${el.id}`;

      const before = await captureState();

      await page.click(selector, { timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(200);

      const after = await captureState();

      // Analyze change
      const behavior = {
        selector,
        changes: []
      };

      // Check selection changes
      const newSelected = after.selectedElements.filter(e => !before.selectedElements.includes(e));
      const unselected = before.selectedElements.filter(e => !after.selectedElements.includes(e));

      if (newSelected.length > 0 || unselected.length > 0) {
        behavior.type = 'selection';
        behavior.changes.push({ newSelected, unselected });
      }

      // Check modal changes
      if (after.visibleModals.length > before.visibleModals.length) {
        behavior.type = 'opens_modal';
        behavior.changes.push({ modal: after.visibleModals.find(m => !before.visibleModals.includes(m)) });
      }

      // Check expansion changes
      if (after.expandedElements.length !== before.expandedElements.length) {
        behavior.type = 'toggle_expand';
      }

      if (behavior.changes.length > 0 || behavior.type) {
        behaviors[el.id] = behavior;
      }

    } catch (e) {
      // Skip
    }
  }

  console.log(`  Found ${Object.keys(behaviors).length} elements with click behaviors`);
  return behaviors;
}

// ============================================================
// STAGE 4: Keyboard Shortcut Detection
// ============================================================
async function detectKeyboardShortcuts(page) {
  console.log('Stage 4: Detecting keyboard shortcuts...');

  const shortcuts = [];

  // Common keys to test
  const keysToTest = [
    ...'vrdoalpte0123456789h'.split(''),
    { key: 'z', modifiers: ['Meta'] },
    { key: 'z', modifiers: ['Meta', 'Shift'] },
    { key: 'Escape', modifiers: [] },
    { key: '+', modifiers: ['Meta'] },
    { key: '-', modifiers: ['Meta'] },
  ];

  const captureState = async () => {
    return await page.evaluate(() => ({
      selected: [...document.querySelectorAll('.selected, .active, [aria-selected="true"]')]
        .map(el => el.className).join(','),
      modals: document.querySelectorAll('[role="dialog"]:not([hidden])').length,
    }));
  };

  for (const keySpec of keysToTest) {
    const key = typeof keySpec === 'string' ? keySpec : keySpec.key;
    const mods = typeof keySpec === 'string' ? [] : keySpec.modifiers;

    try {
      const before = await captureState();

      for (const mod of mods) {
        await page.keyboard.down(mod);
      }
      await page.keyboard.press(key);
      for (const mod of mods) {
        await page.keyboard.up(mod);
      }

      await page.waitForTimeout(100);

      const after = await captureState();

      if (JSON.stringify(before) !== JSON.stringify(after)) {
        shortcuts.push({
          key,
          modifiers: mods,
          effect: { before, after }
        });
      }

    } catch (e) {
      // Skip
    }
  }

  console.log(`  Found ${shortcuts.length} keyboard shortcuts`);
  return shortcuts;
}

// ============================================================
// STAGE 5: Group Detection
// ============================================================
function detectGroups(elements, behaviors) {
  console.log('Stage 5: Detecting element groups...');

  const groups = [];

  // Group by parent
  const byParent = {};
  elements.forEach(el => {
    const parentKey = el.parent.className || el.parent.id || 'root';
    if (!byParent[parentKey]) byParent[parentKey] = [];
    byParent[parentKey].push(el);
  });

  // Find radio-like groups (same parent, similar behavior)
  for (const [parentKey, siblings] of Object.entries(byParent)) {
    if (siblings.length >= 2 && siblings.length <= 20) {
      const allClickable = siblings.every(s => s.flags.isClickable || s.flags.isButton);
      const allHaveTitles = siblings.every(s => s.semantic.title || s.semantic.ariaLabel);

      if (allClickable && allHaveTitles) {
        groups.push({
          type: 'radio_group',
          parent: parentKey,
          elements: siblings.map(s => s.id),
          labels: siblings.map(s => s.semantic.title || s.semantic.ariaLabel)
        });
      }
    }
  }

  console.log(`  Found ${groups.length} element groups`);
  return groups;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const url = process.argv[2];

  if (!url) {
    console.log('Usage: node extract-all-interactivity.js <url>');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Comprehensive UI Interactivity Extractor`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Source: ${url}\n`);

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  console.log('Loading page...');
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Run extraction stages
  const elements = await discoverElements(page);
  console.log(`  Found ${elements.length} interactive elements\n`);

  const hoverStates = await detectHoverStates(page, elements);
  const clickBehaviors = await detectClickBehaviors(page, elements);
  const keyboardShortcuts = await detectKeyboardShortcuts(page);
  const groups = detectGroups(elements, clickBehaviors);

  await browser.close();

  // Generate manifest
  const manifest = {
    meta: {
      source: url,
      extractedAt: new Date().toISOString(),
      totalElements: elements.length,
      withHoverStates: Object.keys(hoverStates).length,
      withClickBehaviors: Object.keys(clickBehaviors).length,
      keyboardShortcuts: keyboardShortcuts.length,
      groups: groups.length,
    },
    elements: elements.reduce((acc, el) => {
      acc[el.id] = {
        ...el,
        hover: hoverStates[el.id],
        click: clickBehaviors[el.id],
      };
      return acc;
    }, {}),
    hoverStates,
    clickBehaviors,
    keyboardShortcuts,
    groups,
  };

  // Save
  const outputDir = path.join(__dirname, '..', 'output', 'extracted');
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, 'comprehensive-manifest.json');
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

  console.log(`\n${'='.repeat(60)}`);
  console.log('EXTRACTION COMPLETE');
  console.log(`${'='.repeat(60)}`);
  console.log(`Total interactive elements: ${elements.length}`);
  console.log(`Elements with hover states: ${Object.keys(hoverStates).length}`);
  console.log(`Elements with click behaviors: ${Object.keys(clickBehaviors).length}`);
  console.log(`Keyboard shortcuts: ${keyboardShortcuts.length}`);
  console.log(`Element groups: ${groups.length}`);
  console.log(`\nManifest saved to: ${outputPath}`);
}

main().catch(console.error);
