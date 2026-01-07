# Hover State Capture Agent

## Purpose
Capture CSS :hover states from a target website by systematically hovering over interactive elements and recording style changes.

## Process

### 1. Initial Scan
```javascript
// Run via browser_evaluate to find all interactive elements
() => {
  const selectors = ['a', 'button', '[role="button"]', '[class*="card"]', '[class*="btn"]'];
  const PROPS = ['color', 'background-color', 'opacity', 'transform', 'box-shadow', 'border-color', 'text-decoration'];

  window._elements = [];

  selectors.forEach(sel => {
    document.querySelectorAll(sel).forEach((el, i) => {
      if (!el.offsetParent) return; // Skip invisible
      const rect = el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return; // Skip tiny

      const computed = window.getComputedStyle(el);
      const defaultStyles = {};
      PROPS.forEach(p => defaultStyles[p] = computed.getPropertyValue(p));

      window._elements.push({
        index: window._elements.length,
        selector: el.className?.split(' ')[0] || el.tagName.toLowerCase(),
        text: el.textContent?.substring(0, 30).trim(),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        defaultStyles
      });
    });
  });

  return window._elements.length + ' elements found';
}
```

### 2. Hover Each Element
For each element found:
1. Use `browser_hover` with coordinates from rect
2. Capture hover styles via `browser_evaluate`
3. Compare and store differences

### 3. Generate CSS
```javascript
// After hovering, generate CSS rules
() => {
  const results = [];

  window._elements.forEach((el, i) => {
    if (!el.hoverStyles) return;

    const diffs = [];
    for (const prop in el.defaultStyles) {
      if (el.defaultStyles[prop] !== el.hoverStyles[prop]) {
        diffs.push(`  ${prop}: ${el.hoverStyles[prop]};`);
      }
    }

    if (diffs.length > 0) {
      results.push({
        selector: el.selector,
        css: `.${el.selector}:hover {\n${diffs.join('\n')}\n}`
      });
    }
  });

  return results;
}
```

## Example Output

```css
/* Nav links */
.nav-link:hover {
  color: rgb(247, 248, 248);
  background-color: rgba(255, 255, 255, 0.08);
}

/* Primary button */
.btn-primary:hover {
  background-color: rgb(230, 230, 230);
  box-shadow: rgba(0, 0, 0, 0) 0px 8px 2px 0px, rgba(0, 0, 0, 0.01) 0px 5px 2px 0px;
}

/* Cards */
.card:hover {
  border-color: rgba(255, 255, 255, 0.14);
  transform: translateY(-2px);
}
```

## Captured from Linear.app

### Nav Link Hover
- Default: `color: rgba(255, 255, 255, 0.7)`
- Hover: `color: rgb(247, 248, 248); background-color: rgba(255, 255, 255, 0.08)`

### Primary Button Hover
- Default: `background-color: white`
- Hover: `background-color: rgb(230, 230, 230)` (slightly darker)

### Card Hover
- Default: `border-color: rgba(255, 255, 255, 0.07)`
- Hover: `border-color: rgba(255, 255, 255, 0.14)` (brighter border)
