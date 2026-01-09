# V6 Clone - Pixel Perfect + Working Behaviors

Complete website cloning with pixel-perfect visuals AND working behaviors.

## Usage
```
/clone-v6 https://excalidraw.com
```

## What V6 Does

1. **Pixel-Perfect Visual Clone** - Screenshot → Claude Vision → Exact HTML/CSS
2. **Extract ALL Behaviors** - Events, CSS variables, breakpoints, shortcuts
3. **Inject Behaviors** - Wire up extracted behaviors so they WORK

The result should be indistinguishable from the original.

## Process

### Phase 1: Setup & Pre-Navigation Injection

1. Create output directory: `output/<domain>-v6-<timestamp>/`

2. Navigate to URL using `mcp__playwright__browser_navigate`

3. Before analyzing, inject behavior extractors via `mcp__playwright__browser_evaluate`:
```javascript
() => {
  // Capture event listeners
  const listeners = [];
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, fn, opts) {
    listeners.push({
      target: this === window ? 'window' : this === document ? 'document' :
              this.id ? '#'+this.id : this.className ? '.'+this.className.split(' ')[0] : this.tagName,
      type,
      capture: typeof opts === 'object' ? opts.capture : !!opts
    });
    return origAdd.call(this, type, fn, opts);
  };
  window.__listeners = listeners;

  // Capture CSS variables
  window.__cssVars = {};
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText === ':root') {
          for (const prop of rule.style) {
            if (prop.startsWith('--')) {
              window.__cssVars[prop] = rule.style.getPropertyValue(prop).trim();
            }
          }
        }
      }
    } catch(e) {}
  }
}
```

### Phase 2: Analyze & Screenshot

1. Get page dimensions:
```javascript
mcp__playwright__browser_evaluate({
  code: `() => ({
    height: document.documentElement.scrollHeight,
    viewport: window.innerHeight,
    title: document.title
  })`
})
```

2. Scroll through entire page in viewport increments, taking screenshots:
```
For scrollY = 0, 800, 1600, ... until end of page:
  - Scroll to position
  - Wait 500ms for animations
  - Take screenshot: mcp__playwright__browser_take_screenshot({ filename: "section-{n}.png" })
```

3. Name sections descriptively: `00-nav-header.png`, `01-hero.png`, `02-features.png`, etc.

### Phase 3: Extract Behaviors

Run extraction via `mcp__playwright__browser_evaluate`:
```javascript
() => ({
  listeners: window.__listeners || [],
  cssVars: window.__cssVars || {},
  breakpoints: (() => {
    const bps = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSMediaRule) {
            const match = rule.conditionText.match(/(\d+)px/);
            if (match) bps.push(parseInt(match[1]));
          }
        }
      } catch(e) {}
    }
    return [...new Set(bps)].sort((a,b) => a-b);
  })(),
  colors: (() => {
    const body = getComputedStyle(document.body);
    return {
      bg: body.backgroundColor,
      text: body.color
    };
  })()
})
```

### Phase 4: Pixel-Perfect Recreation

For EACH screenshot:

1. **Read the screenshot** using Read tool
2. **Analyze what you see** - exact colors, fonts, spacing, layout
3. **Recreate EXACTLY** - match every pixel

Write HTML with:
- ALL class names prefixed with section ID
- EXACT colors from screenshot (use eyedropper, don't guess)
- EXACT spacing and layout
- CSS-only graphics (gradients, shadows, shapes)
- The extracted CSS variables in :root

### Phase 5: Inject Behaviors

Add to the assembled HTML:

1. **CSS Variables** from extraction:
```css
:root {
  --var-name: value;
  /* all extracted variables */
}
```

2. **Responsive Breakpoints**:
```css
@media (max-width: 768px) { /* mobile styles */ }
@media (max-width: 1024px) { /* tablet styles */ }
```

3. **Event Listeners** (wiring code):
```javascript
// Wire extracted event patterns
document.addEventListener('keydown', (e) => {
  // Handle keyboard shortcuts
});

document.querySelectorAll('[data-action]').forEach(el => {
  el.addEventListener('click', handleAction);
});
```

### Phase 6: Assembly

1. Combine all section HTML files in order
2. Add extracted CSS variables to <head>
3. Add behavior wiring JS before </body>
4. Save as `clone.html`

### Phase 7: Open Result

```bash
open output/<domain>-v6-<timestamp>/clone.html
```

## Key Differences from V3

| Aspect | V3 | V6 |
|--------|----|----|
| Visual | Pixel-perfect | Pixel-perfect |
| CSS Variables | ❌ Not extracted | ✅ Injected from original |
| Event Listeners | ❌ None | ✅ Patterns wired |
| Breakpoints | ❌ Guessed | ✅ Extracted from CSS |
| Keyboard Shortcuts | ❌ None | ✅ Captured and wired |
| Hover States | ✅ Captured | ✅ Captured + enhanced |

## Critical Rules

1. **NEVER guess colors** - Read them from the screenshot
2. **Use extracted CSS vars** - Don't hardcode values that have variables
3. **Match the layout EXACTLY** - Flexbox/Grid as needed
4. **Prefix ALL classes** - Avoid conflicts between sections
5. **Wire behaviors** - The clone should RESPOND like the original

## Output Structure

```
output/<domain>-v6-<timestamp>/
  screenshots/
    00-nav-header.png
    01-hero.png
    ...
  extraction.json       # Captured behaviors
  00-nav-header.html    # Individual sections
  01-hero.html
  ...
  clone.html            # Final assembled output
```
