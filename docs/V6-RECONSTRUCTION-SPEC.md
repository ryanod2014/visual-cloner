# V6 Reconstruction Integration Spec

## Problem Statement

We have sophisticated V5.1 extractors that capture:
- CSS Variables (937 items from Excalidraw test)
- Event Listeners (217 captured)
- Viewport Breakpoints (16 detected)
- SVG Elements (31 captured)
- Animations/@keyframes
- Transitions
- Canvas 2D operations
- WebGL shaders
- Keyboard shortcuts
- Touch gestures
- API traffic
- Device differences (desktop vs mobile)
- Worker scripts

**BUT** the `/clone` skill produces visual HTML/CSS that ignores ALL of this data.

The extractors each have `generateReplayCode(data)` methods that produce usable code,
but this code is saved to files and never integrated into the final output.

## Solution: V6 Reconstruction Integrator

A new tool that bridges extraction and reconstruction by injecting all captured
behaviors into the cloned HTML output.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    V6 RECONSTRUCTION FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   /clone     │     │  V5.1        │     │  V6          │    │
│  │   skill      │────▶│  Extractors  │────▶│  Integrator  │    │
│  │              │     │              │     │              │    │
│  │ assembled.   │     │ extraction-  │     │ final.html   │    │
│  │ html         │     │ results.json │     │ (complete)   │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Input Files

1. `assembled.html` - Visual clone from /clone skill
2. `extraction-results.json` - Full V5.1 extraction data

## Output Files

1. `integrated.html` - Complete reconstruction with all behaviors
2. `integrated.css` - Combined styles (variables, animations, breakpoints)
3. `integrated.js` - All wired behaviors (events, shortcuts, gestures)
4. `mock-server.js` - API mock server (if API traffic captured)

## Integration Steps

### Step 1: CSS Variables Injection
```css
/* Inject into <style> or create new <style id="extracted-variables"> */
:root {
  --color-primary: #6965db;
  --spacing-md: 16px;
  /* ... all 937 variables from extraction */
}
```

### Step 2: Animations/Keyframes Injection
```css
/* Inject captured @keyframes */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Apply to elements that had animations */
.animated-element {
  animation: fadeIn 0.3s ease;
}
```

### Step 3: Transitions Injection
```css
/* Apply captured transition styles */
.button {
  transition: background-color 0.2s ease, transform 0.1s ease;
}
```

### Step 4: Responsive Breakpoints
```css
/* Inject detected breakpoints as media queries */
@media (max-width: 768px) {
  /* Mobile-specific styles from device comparison */
}

@media (min-width: 1024px) {
  /* Desktop-specific styles */
}

/* All 16 detected breakpoints with layout changes */
```

### Step 5: Event Listener Wiring
```javascript
// Wire captured event listeners
document.addEventListener('DOMContentLoaded', () => {
  // From extraction: 217 event listeners

  // Example: Click handlers
  document.querySelector('[data-testid="toolbar-hand"]')
    ?.addEventListener('click', handleToolSelect);

  // Example: Keyboard handlers
  document.addEventListener('keydown', handleKeyboardShortcut);

  // Example: Scroll handlers
  window.addEventListener('scroll', handleScroll, { passive: true });
});
```

### Step 6: Keyboard Shortcuts
```javascript
// Wire detected keyboard shortcuts
const shortcuts = {
  'v': () => selectTool('selection'),
  'h': () => selectTool('hand'),
  'r': () => selectTool('rectangle'),
  // ... all detected shortcuts
};

document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (shortcuts[key] && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    shortcuts[key]();
  }
});
```

### Step 7: Touch Gesture Handlers
```javascript
// Wire detected touch gestures
let touchStartX, touchStartY;

element.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
});

element.addEventListener('touchmove', (e) => {
  // Handle pinch, swipe, etc. based on captured gestures
});
```

### Step 8: SVG Element Injection
```html
<!-- Replace placeholder SVGs with captured exact SVGs -->
<svg viewBox="0 0 24 24" class="icon-menu">
  <!-- Exact SVG content from extraction -->
  <path d="M3 12h18M3 6h18M3 18h18"/>
</svg>
```

### Step 9: Canvas Behavior Wiring
```javascript
// Wire captured canvas behaviors for tools
const behaviorRegistry = {
  'toolbar-laser': laserPointerBehavior,
  'toolbar-freedraw': freedrawBehavior,
  // ... all captured tool behaviors
};

canvas.addEventListener('mousemove', (e) => {
  const activeTool = getActiveTool();
  behaviorRegistry[activeTool]?.onMouseMove(canvas, e);
});
```

### Step 10: API Mock Server
```javascript
// Express server that replays captured API responses
const express = require('express');
const app = express();

// From captured fetch requests
app.get('/api/user', (req, res) => {
  res.json(/* captured response */);
});

// From captured WebSocket connections
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });
```

### Step 11: Worker Script Injection
```javascript
// Register captured service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/captured-sw.js');
}
```

### Step 12: Sticky/Scroll Elements
```css
/* Apply captured sticky behavior */
.header {
  position: sticky;
  top: 0;
  z-index: 100;
}
```

## Implementation Plan

### Phase 1: Core Integrator (tools/integrate-extraction.js)
1. Load assembled.html and extraction-results.json
2. Parse HTML into DOM (using jsdom or cheerio)
3. Inject CSS variables into <head>
4. Inject animations/transitions
5. Write integrated.html

### Phase 2: JavaScript Wiring (tools/wire-behaviors.js)
1. Generate event listener wiring code
2. Generate keyboard shortcut handlers
3. Generate touch gesture handlers
4. Generate canvas behavior registry
5. Write integrated.js

### Phase 3: Responsive Integration (tools/generate-responsive.js)
1. Parse viewport breakpoint data
2. Generate media queries with captured layout changes
3. Handle device-specific differences
4. Write to integrated.css

### Phase 4: API Mock Generation (tools/generate-mock-api.js)
1. Parse captured fetch/XHR requests
2. Generate Express routes
3. Handle WebSocket connections
4. Write mock-server.js

### Phase 5: Update /clone Skill
1. Add extraction step after visual cloning
2. Auto-run integrator after extraction
3. Output complete integrated.html

## File Structure

```
tools/
  integrate-extraction.js    # Main integrator
  pipeline/
    integrators/
      css-integrator.js      # CSS variables, animations, transitions
      event-integrator.js    # Event listeners, shortcuts, gestures
      responsive-integrator.js # Breakpoints, device differences
      svg-integrator.js      # SVG element replacement
      canvas-integrator.js   # Canvas behavior wiring
      api-integrator.js      # Mock server generation
      worker-integrator.js   # Service worker setup
    index.js                 # Combined integration runner
```

## Usage

```bash
# After running /clone and V5.1 extraction:
node tools/integrate-extraction.js \
  --html output/site-123/assembled.html \
  --extraction output/site-123/extraction-results.json \
  --output output/site-123/integrated/
```

## Success Criteria

A "complete" reconstruction should:
1. Look identical to original (visual fidelity) ✓ from /clone
2. Use exact CSS variables from original ✓ injected
3. Have working hover/focus/active states ✓ from transitions
4. Respond to same keyboard shortcuts ✓ wired
5. Handle touch gestures on mobile ✓ wired
6. Show same animations ✓ from @keyframes
7. Work at all viewport sizes ✓ from breakpoints
8. Have working interactive elements ✓ from event listeners
9. Mock API responses correctly ✓ from mock server

## Test Plan

1. Clone excalidraw.com with /clone
2. Run V5.1 extraction
3. Run V6 integrator
4. Compare:
   - Visual diff (should be identical)
   - Interaction diff (keyboard shortcuts should work)
   - Responsive diff (breakpoints should match)
   - Animation diff (transitions should fire)

## Dependencies

- cheerio or jsdom (HTML parsing)
- prettier (code formatting)
- express (mock server)
- ws (WebSocket mock)

## Notes

- Extraction must run BEFORE /clone (to capture events from page load)
- Some behaviors may conflict - integrator should detect and warn
- Generated code should be human-readable for debugging
- Consider generating React/Vue components in future version
