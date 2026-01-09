# Comprehensive Extractor Architecture

## Overview

This document defines the architecture for capturing ALL visual and behavioral elements from web applications. The goal is **exact capture** - no inference, no templates, no approximations.

## Capture Coverage Matrix

| Category | What | How | Status |
|----------|------|-----|--------|
| Canvas 2D | All context methods/properties | Prototype interception | Existing |
| WebGL/WebGL2 | Shaders, uniforms, buffers, textures, draw calls | Prototype interception | **TODO** |
| CSS Animations | @keyframes rules, animation properties | StyleSheet API | **TODO** |
| CSS Transitions | Property changes over time | getComputedStyle sampling | **TODO** |
| CSS Variables | Custom property values | getComputedStyle | **TODO** |
| SVG | Path changes, attribute mutations | MutationObserver | **TODO** |
| DOM Mutations | Element add/remove/change | MutationObserver | Existing |
| Scroll Effects | Scroll-linked animations | Scroll event tracking | **TODO** |
| Intersection Observer | Visibility-triggered effects | Callback interception | **TODO** |
| Animation Libraries | GSAP, anime.js, Framer Motion | Library detection | **TODO** |
| RAF Callbacks | requestAnimationFrame calls | Wrapper + stack traces | Existing |

## Extractor Interface

Each extractor must implement:

```javascript
{
  name: 'extractor-name',

  // Injection script to run in browser context
  getInjectionScript(): string,

  // Extract captured data from window object
  extractData(page): Promise<CapturedData>,

  // Generate replay code from captured data
  generateReplayCode(data): string,
}
```

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Browser Context                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   WebGL     │  │    CSS      │  │    SVG      │     │
│  │  Extractor  │  │  Extractor  │  │  Extractor  │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │             │
│         └────────────────┼────────────────┘             │
│                          ▼                              │
│              window.__extractorData                     │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Node.js Context                        │
│                                                          │
│    page.evaluate(() => window.__extractorData)          │
│                          │                               │
│                          ▼                               │
│              Unified Capture Pipeline                    │
│                          │                               │
│                          ▼                               │
│              generated-behaviors.js                      │
└─────────────────────────────────────────────────────────┘
```

## Extractor Files

```
extractors/
  index.js              # Extractor registry and orchestrator
  webgl-extractor.js    # WebGL/WebGL2 complete capture
  css-animation.js      # @keyframes and animation props
  css-transition.js     # Transition tracking
  css-variables.js      # Custom property extraction
  svg-extractor.js      # SVG manipulation capture
  scroll-extractor.js   # Scroll-linked effects
  intersection.js       # IntersectionObserver callbacks
  animation-libs.js     # GSAP, anime.js, Framer Motion
```

## Integration Point

All extractors integrate into `step5.1-behavior-capture.js` via:

```javascript
import { getAllExtractors, injectAllExtractors } from './extractors/index.js';

// In Playwright:
await page.addInitScript(injectAllExtractors());

// After interactions:
const allCapturedData = await page.evaluate(() => window.__extractorData);
```
