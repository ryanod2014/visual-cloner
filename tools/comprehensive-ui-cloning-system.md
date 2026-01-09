# Comprehensive UI Cloning System
## Goal: 100% Accurate Interactive Clone - Miss Nothing

---

## Part 1: The Problem with Current Approaches

### What We Miss:
1. **Interaction Types**: Only handling clicks, missing hover/focus/keyboard/drag
2. **State Dependencies**: Button A only works after selecting B
3. **Visual Micro-interactions**: Hover colors, focus rings, transitions
4. **Element Relationships**: Radio groups, tab panels, accordion sections
5. **Dynamic Elements**: Elements that appear/disappear based on state
6. **Keyboard Shortcuts**: Hotkeys mapped to actions
7. **Cursor States**: Different cursors for different tools
8. **Disabled States**: When and why elements become disabled
9. **Loading States**: Spinners, progress indicators
10. **Error States**: Validation messages, error highlights

---

## Part 2: Comprehensive Element Classification

### Layer 1: Interaction Type Detection
```
For each element, detect ALL possible interactions:

POINTER INTERACTIONS:
├── click (single)
├── double-click
├── right-click (context menu)
├── hover (mouseenter/mouseleave)
├── drag-start/drag/drag-end
├── long-press
└── pointer-move (for drawing, sliders)

KEYBOARD INTERACTIONS:
├── focus/blur
├── keydown/keyup (for shortcuts)
├── input (for text fields)
└── submit (for forms)

TOUCH INTERACTIONS:
├── tap
├── swipe
├── pinch/zoom
└── multi-touch
```

### Layer 2: Element Role Classification
```
CONTROL TYPES:
├── TOGGLE: Click alternates between 2 states (on/off)
├── RADIO: Click selects this, deselects siblings
├── CHECKBOX: Click toggles independent of siblings
├── BUTTON: Click triggers one-time action
├── TRIGGER: Click opens/closes related content
├── SLIDER: Drag changes numeric value
├── INPUT: Type changes text value
├── COLOR: Click opens picker, selection changes color
└── MENU: Click opens list of options

CONTAINER TYPES:
├── PANEL: Contains controls, can open/close
├── MODAL: Overlays content, has close trigger
├── DROPDOWN: Opens below trigger, closes on outside click
├── TAB_GROUP: Shows one panel at a time
├── ACCORDION: Expands one or multiple sections
└── CANVAS: Drawing/interaction surface
```

### Layer 3: State Dependencies
```
DEPENDENCY TYPES:
├── ENABLES: Element A enables element B when active
├── DISABLES: Element A disables element B when active
├── SHOWS: Element A shows element B when active
├── HIDES: Element A hides element B when active
├── REQUIRES: Element B only works if A is in state X
├── UPDATES: Element A changes value of element B
└── TRIGGERS: Element A causes animation/transition on B
```

---

## Part 3: Extraction Pipeline

### Stage 1: Static Analysis
```javascript
// Extract everything we can WITHOUT clicking
async function staticAnalysis(page) {
  return await page.evaluate(() => {
    const elements = [];

    document.querySelectorAll('*').forEach((el, index) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      // Skip invisible/tiny elements
      if (rect.width < 1 || rect.height < 1) return;
      if (style.display === 'none' || style.visibility === 'hidden') return;

      const element = {
        id: `el-${index}`,
        tag: el.tagName.toLowerCase(),

        // Position & Size
        bounds: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },

        // Semantic Info
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
          dataAttributes: Object.fromEntries(
            [...el.attributes].filter(a => a.name.startsWith('data-'))
              .map(a => [a.name, a.value])
          ),
          textContent: el.textContent?.trim().slice(0, 100),
        },

        // Visual State
        visual: {
          cursor: style.cursor,
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          opacity: style.opacity,
          transform: style.transform,
          transition: style.transition,
          boxShadow: style.boxShadow,
          outline: style.outline,
        },

        // Interaction Hints
        hints: {
          isClickable: style.cursor === 'pointer' || el.onclick !== null,
          isFocusable: el.tabIndex >= 0 || ['button','a','input','select','textarea'].includes(el.tagName.toLowerCase()),
          isDraggable: el.draggable || style.cursor.includes('grab'),
          isDisabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
          hasHoverStyle: false, // Will detect in Stage 2
        },

        // Relationships
        relationships: {
          parentId: el.parentElement?.id || el.parentElement?.className?.split(' ')[0],
          childCount: el.children.length,
          siblingCount: el.parentElement?.children.length - 1,
          containsSvg: el.querySelector('svg') !== null,
          containsInput: el.querySelector('input') !== null,
        }
      };

      elements.push(element);
    });

    return elements;
  });
}
```

### Stage 2: Hover State Detection
```javascript
// Detect visual changes on hover
async function detectHoverStates(page, elements) {
  for (const el of elements) {
    if (!el.hints.isClickable) continue;

    // Capture before hover
    const beforeStyle = await getElementStyle(page, el.id);
    const beforeScreenshot = await screenshotElement(page, el.id);

    // Hover
    await page.hover(`#${el.id}`);
    await page.waitForTimeout(100); // Wait for transitions

    // Capture after hover
    const afterStyle = await getElementStyle(page, el.id);
    const afterScreenshot = await screenshotElement(page, el.id);

    // Move away
    await page.mouse.move(0, 0);

    // Record changes
    el.hoverState = {
      styleChanges: diffStyles(beforeStyle, afterStyle),
      visuallyChanged: !screenshotsMatch(beforeScreenshot, afterScreenshot),
      screenshot: afterScreenshot
    };
  }
}
```

### Stage 3: Click Behavior Extraction
```javascript
// Detect what happens when clicked
async function detectClickBehavior(page, elements) {
  for (const el of elements) {
    if (!el.hints.isClickable) continue;

    // Capture FULL page state before
    const beforeState = await captureFullState(page);

    // Click
    await page.click(`#${el.id}`);
    await page.waitForTimeout(300); // Wait for any animations/state changes

    // Capture FULL page state after
    const afterState = await captureFullState(page);

    // Analyze what changed
    el.clickBehavior = analyzeStateChange(beforeState, afterState);

    // Reset state for next test (reload or undo)
    await resetPageState(page);
  }
}

async function captureFullState(page) {
  return await page.evaluate(() => ({
    // All element states
    elements: [...document.querySelectorAll('*')].map(el => ({
      id: el.id || el.className,
      classes: el.className,
      style: el.getAttribute('style'),
      ariaSelected: el.getAttribute('aria-selected'),
      ariaExpanded: el.getAttribute('aria-expanded'),
      ariaHidden: el.getAttribute('aria-hidden'),
      disabled: el.disabled,
      value: el.value,
      checked: el.checked,
      display: getComputedStyle(el).display,
      visibility: getComputedStyle(el).visibility,
      opacity: getComputedStyle(el).opacity,
    })),

    // Visible modals/overlays
    modals: [...document.querySelectorAll('[role="dialog"], .modal, [class*="overlay"]')]
      .filter(el => getComputedStyle(el).display !== 'none')
      .map(el => el.className),

    // Canvas state (if exists)
    canvasData: document.querySelector('canvas')?.toDataURL()?.slice(0, 200),

    // Document state
    documentTitle: document.title,
    bodyClasses: document.body.className,

    // URL state
    url: window.location.href,
    hash: window.location.hash,
  }));
}

function analyzeStateChange(before, after) {
  const changes = {
    type: 'unknown',
    affected: [],
    details: {}
  };

  // Detect selection changes (tool/option selection)
  const beforeSelected = before.elements.filter(e => e.ariaSelected === 'true' || e.classes?.includes('selected'));
  const afterSelected = after.elements.filter(e => e.ariaSelected === 'true' || e.classes?.includes('selected'));

  if (JSON.stringify(beforeSelected) !== JSON.stringify(afterSelected)) {
    changes.type = 'selection';
    changes.details = { before: beforeSelected, after: afterSelected };
  }

  // Detect modal open
  if (after.modals.length > before.modals.length) {
    changes.type = 'modal_open';
    changes.details = { modal: after.modals.find(m => !before.modals.includes(m)) };
  }

  // Detect panel toggle
  const expandedBefore = before.elements.filter(e => e.ariaExpanded === 'true');
  const expandedAfter = after.elements.filter(e => e.ariaExpanded === 'true');
  if (JSON.stringify(expandedBefore) !== JSON.stringify(expandedAfter)) {
    changes.type = 'panel_toggle';
  }

  // Detect value change
  const valueChanges = before.elements.filter((e, i) => e.value !== after.elements[i]?.value);
  if (valueChanges.length > 0) {
    changes.type = 'value_change';
    changes.details = { changed: valueChanges };
  }

  // Detect visibility change
  const visibilityChanges = before.elements.filter((e, i) =>
    e.display !== after.elements[i]?.display ||
    e.visibility !== after.elements[i]?.visibility
  );
  if (visibilityChanges.length > 0) {
    changes.type = 'visibility_change';
    changes.affected = visibilityChanges;
  }

  return changes;
}
```

### Stage 4: Keyboard Shortcut Detection
```javascript
// Detect keyboard shortcuts
async function detectKeyboardShortcuts(page) {
  const shortcuts = [];

  // Common shortcut patterns to test
  const keyCombos = [
    // Letters
    ...'abcdefghijklmnopqrstuvwxyz'.split('').map(k => ({ key: k, mods: [] })),
    ...'0123456789'.split('').map(k => ({ key: k, mods: [] })),

    // With modifiers
    ...'abcdefghijklmnopqrstuvwxyz'.split('').map(k => ({ key: k, mods: ['Meta'] })),
    ...'abcdefghijklmnopqrstuvwxyz'.split('').map(k => ({ key: k, mods: ['Meta', 'Shift'] })),

    // Special keys
    { key: 'Escape', mods: [] },
    { key: 'Delete', mods: [] },
    { key: 'Backspace', mods: [] },
    { key: '+', mods: ['Meta'] },
    { key: '-', mods: ['Meta'] },
    { key: '0', mods: ['Meta'] },
  ];

  for (const combo of keyCombos) {
    const beforeState = await captureFullState(page);

    // Press key combo
    await page.keyboard.down(combo.mods.join('+'));
    await page.keyboard.press(combo.key);
    await page.keyboard.up(combo.mods.join('+'));
    await page.waitForTimeout(100);

    const afterState = await captureFullState(page);
    const change = analyzeStateChange(beforeState, afterState);

    if (change.type !== 'unknown') {
      shortcuts.push({
        key: combo.key,
        modifiers: combo.mods,
        effect: change
      });
    }

    await resetPageState(page);
  }

  return shortcuts;
}
```

### Stage 5: Element Grouping & Relationships
```javascript
// Detect element groups and relationships
function detectElementGroups(elements) {
  const groups = [];

  // Find radio-like groups (mutually exclusive selection)
  const selectableElements = elements.filter(e =>
    e.clickBehavior?.type === 'selection'
  );

  // Group by parent and behavior
  const byParent = groupBy(selectableElements, e => e.relationships.parentId);

  for (const [parentId, siblings] of Object.entries(byParent)) {
    if (siblings.length > 1) {
      // Check if they're mutually exclusive
      const controlsSameState = siblings.every(s =>
        s.clickBehavior?.details?.stateKey === siblings[0].clickBehavior?.details?.stateKey
      );

      if (controlsSameState) {
        groups.push({
          type: 'radio_group',
          stateKey: siblings[0].clickBehavior?.details?.stateKey,
          elements: siblings.map(s => s.id),
          parentId
        });
      }
    }
  }

  // Find toggle pairs (expand/collapse buttons)
  // Find tab groups
  // Find accordion groups
  // etc.

  return groups;
}
```

---

## Part 4: Binding Generation

### Generate React Code from Extracted Behaviors
```javascript
function generateBindings(elements, groups, shortcuts) {
  const code = {
    states: [],
    handlers: [],
    elementBindings: {},
    keyboardHandlers: []
  };

  // Generate states from groups
  for (const group of groups) {
    if (group.type === 'radio_group') {
      const defaultValue = group.elements[0]; // Or detect which is initially selected
      code.states.push({
        name: group.stateKey,
        type: 'enum',
        values: group.elements.map(e => elements.find(el => el.id === e)?.semantic?.title || e),
        default: defaultValue
      });

      // Generate bindings for each element in group
      for (const elId of group.elements) {
        const el = elements.find(e => e.id === elId);
        const value = el?.semantic?.title || elId;
        code.elementBindings[elId] = {
          onClick: `() => set${capitalize(group.stateKey)}('${value}')`,
          className: `\${${group.stateKey} === '${value}' ? 'selected' : ''}`
        };
      }
    }
  }

  // Generate keyboard handlers
  for (const shortcut of shortcuts) {
    code.keyboardHandlers.push({
      key: shortcut.key,
      modifiers: shortcut.modifiers,
      handler: generateHandlerFromEffect(shortcut.effect)
    });
  }

  return code;
}
```

---

## Part 5: Verification System

### Compare Clone to Source
```javascript
async function verifyClone(sourcePage, clonePage, elements) {
  const report = {
    passed: [],
    failed: [],
    partial: []
  };

  for (const element of elements) {
    // Test on source
    const sourceBefore = await captureFullState(sourcePage);
    await sourcePage.click(`#${element.id}`).catch(() => {});
    const sourceAfter = await captureFullState(sourcePage);
    const sourceChange = analyzeStateChange(sourceBefore, sourceAfter);

    // Test on clone
    const cloneBefore = await captureFullState(clonePage);
    await clonePage.click(`#${element.id}`).catch(() => {});
    const cloneAfter = await captureFullState(clonePage);
    const cloneChange = analyzeStateChange(cloneBefore, cloneAfter);

    // Compare
    const match = compareChanges(sourceChange, cloneChange);

    if (match === 'exact') {
      report.passed.push({ element: element.id, sourceChange, cloneChange });
    } else if (match === 'partial') {
      report.partial.push({ element: element.id, sourceChange, cloneChange, diff: getDiff(sourceChange, cloneChange) });
    } else {
      report.failed.push({ element: element.id, sourceChange, cloneChange });
    }

    // Reset both
    await resetPageState(sourcePage);
    await resetPageState(clonePage);
  }

  return report;
}
```

---

## Part 6: Output Format

### Complete Interactive Manifest
```json
{
  "meta": {
    "source": "excalidraw.com",
    "extractedAt": "2024-01-08T12:00:00Z",
    "elementCount": 226,
    "interactiveCount": 159,
    "boundCount": 159,
    "verificationScore": "98%"
  },

  "states": {
    "selectedTool": {
      "type": "enum",
      "values": ["hand", "selection", "rectangle", ...],
      "default": "rectangle",
      "controlledBy": ["el-125", "el-132", "el-138", ...],
      "affects": ["cursorStyle", "canvasInteraction"]
    }
  },

  "elements": {
    "el-125": {
      "role": "radio",
      "group": "tools",
      "value": "hand",
      "interactions": {
        "click": { "action": "setState", "state": "selectedTool", "value": "hand" },
        "hover": { "styleChange": { "backgroundColor": "#f0f0ff" } }
      },
      "keyboard": { "key": "h", "modifiers": [] },
      "visualStates": {
        "default": { "backgroundColor": "transparent" },
        "hover": { "backgroundColor": "#f0f0ff" },
        "selected": { "backgroundColor": "#e0dfff", "boxShadow": "inset 0 0 0 1px #6965db" }
      }
    }
  },

  "groups": {
    "tools": {
      "type": "radio",
      "state": "selectedTool",
      "elements": ["el-125", "el-132", ...]
    }
  },

  "keyboards": [
    { "key": "v", "modifiers": [], "action": "setState", "state": "selectedTool", "value": "selection" },
    { "key": "z", "modifiers": ["Meta"], "action": "call", "handler": "handleUndo" }
  ],

  "canvasEffects": {
    "selectedTool": {
      "cursor": { "hand": "grab", "selection": "default", "rectangle": "crosshair" }
    },
    "strokeStyle": {
      "lineDash": { "solid": [], "dashed": [12,6], "dotted": [2,4] }
    }
  }
}
```

---

## Summary: The 6-Layer Approach

```
Layer 1: DISCOVER all interactive elements
         ↓
Layer 2: CLASSIFY by interaction type & role
         ↓
Layer 3: EXTRACT behavior (click, hover, keyboard)
         ↓
Layer 4: DETECT relationships & groups
         ↓
Layer 5: GENERATE bindings + effects
         ↓
Layer 6: VERIFY against source
```

This approach ensures we capture:
- ✅ Every clickable element
- ✅ Every hover state
- ✅ Every keyboard shortcut
- ✅ Every state dependency
- ✅ Every visual micro-interaction
- ✅ Every element relationship
- ✅ Every canvas effect

And we VERIFY everything works by comparing clone behavior to source behavior.
