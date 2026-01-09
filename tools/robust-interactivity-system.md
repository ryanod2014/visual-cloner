# Robust Interactivity System

## The Problem
When cloning interactive apps, we miss elements because:
1. Many elements lack semantic attributes (title, aria-label)
2. Manual mapping is error-prone
3. No automated verification

## Solution: 3-Phase Approach

### Phase 1: Exhaustive Element Discovery
```
For EVERY clickable element:
1. Record position (x, y, width, height)
2. Record visual appearance (screenshot crop)
3. Record any semantic info (title, aria, text)
4. Record parent context (what panel is it in?)
5. Assign unique ID
```

### Phase 2: Behavioral Extraction (from source site)
```
For EVERY discovered element:
1. Click it on the SOURCE site
2. Record what changed:
   - DOM changes
   - CSS changes
   - Canvas changes
   - Network requests
   - Console logs
3. Store before/after state
4. Infer the element's PURPOSE
```

### Phase 3: Binding Generation + Verification
```
For EVERY element:
1. Generate appropriate binding based on behavior
2. Apply to clone
3. VERIFY by clicking on clone
4. Compare clone behavior to source behavior
5. Flag any mismatches
```

## Implementation

### Step 1: Element Discovery Script
```javascript
async function discoverAllInteractive(page) {
  return await page.evaluate(() => {
    const elements = [];

    // Find ALL potentially interactive elements
    const selectors = [
      'button', 'a', 'input', 'select', 'textarea',
      '[role="button"]', '[role="link"]', '[role="checkbox"]',
      '[role="radio"]', '[role="tab"]', '[role="menuitem"]',
      '[tabindex]', '[onclick]', '[cursor="pointer"]'
    ];

    document.querySelectorAll('*').forEach((el, index) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      // Check if interactive
      const isInteractive = (
        selectors.some(s => el.matches(s)) ||
        style.cursor === 'pointer' ||
        el.onclick !== null
      );

      if (isInteractive && rect.width > 0 && rect.height > 0) {
        elements.push({
          id: `el-${index}`,
          tag: el.tagName.toLowerCase(),
          position: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          semantic: {
            title: el.title,
            ariaLabel: el.getAttribute('aria-label'),
            role: el.getAttribute('role'),
            text: el.textContent?.trim().slice(0, 50)
          },
          context: {
            parentId: el.parentElement?.id,
            parentClass: el.parentElement?.className,
            nearbyText: getNearbyText(el)
          },
          visual: {
            backgroundColor: style.backgroundColor,
            hasSvg: el.querySelector('svg') !== null,
            hasImg: el.querySelector('img') !== null
          }
        });
      }
    });

    return elements;
  });
}
```

### Step 2: Behavioral Extraction Script
```javascript
async function extractBehavior(page, elementId) {
  // Get initial state
  const before = await captureState(page);

  // Click the element
  await page.click(`#${elementId}`);
  await page.waitForTimeout(500);

  // Get after state
  const after = await captureState(page);

  // Compute diff
  return {
    elementId,
    stateChanges: diffStates(before, after),
    inferredAction: inferAction(before, after)
  };
}

async function captureState(page) {
  return await page.evaluate(() => ({
    // Capture all stateful elements
    selectedButtons: [...document.querySelectorAll('.selected, .active, [aria-selected="true"]')]
      .map(el => el.className),
    inputValues: [...document.querySelectorAll('input, select')]
      .map(el => ({ id: el.id, value: el.value })),
    visiblePanels: [...document.querySelectorAll('[style*="display"], [hidden]')]
      .map(el => ({ id: el.id, visible: el.style.display !== 'none' })),
    canvasData: document.querySelector('canvas')?.toDataURL().slice(0, 100)
  }));
}
```

### Step 3: Verification Script
```javascript
async function verifyAllBindings(sourcePage, clonePage, elements) {
  const results = [];

  for (const element of elements) {
    // Click on source
    const sourceBefore = await captureState(sourcePage);
    await sourcePage.click(`#${element.id}`);
    const sourceAfter = await captureState(sourcePage);

    // Click on clone
    const cloneBefore = await captureState(clonePage);
    await clonePage.click(`#${element.id}`);
    const cloneAfter = await captureState(clonePage);

    // Compare behaviors
    const match = compareBehaviors(
      diffStates(sourceBefore, sourceAfter),
      diffStates(cloneBefore, cloneAfter)
    );

    results.push({
      elementId: element.id,
      match,
      sourceBehavior: diffStates(sourceBefore, sourceAfter),
      cloneBehavior: diffStates(cloneBefore, cloneAfter)
    });
  }

  return results;
}
```

## Output: Verification Report
```
Element Binding Verification Report
===================================

✅ PASS: 47 elements behave correctly
⚠️ PARTIAL: 12 elements have similar but not identical behavior
❌ FAIL: 100 elements have no binding or wrong behavior

Failed Elements:
- el-10: No onClick handler (source opens menu)
- el-113: No binding (source toggles sidebar)
- el-114: No binding (source opens settings)
...

Recommended Actions:
1. Add menu handler for el-10
2. Add sidebar toggle for el-113
3. Add settings modal for el-114
```

## Key Insight

The only way to ensure NOTHING is missed is to:
1. **Discover** every interactive element automatically
2. **Test** every element on the source site to see what it does
3. **Verify** that the clone does the same thing
4. **Report** any gaps

Manual mapping will ALWAYS miss things. Automated behavioral extraction + verification is the only robust solution.
