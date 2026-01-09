# V5 Perfect Extraction Architecture

## Goal

**Zero-approximation cloning**: Extract and recreate web applications with 100% fidelity. No guessing, no inference, no templates - only observed facts.

## Core Principle

> We don't need to understand the code. We need to observe and replicate effects.

Instead of inferring behavior from attributes (`aria-label="Rectangle"` → guess it sets tool), we:
1. Click the element
2. Record exactly what changed
3. Generate code that produces those exact changes

---

## Complete Web Application Anatomy

A web application consists of these layers - ALL must be extracted for perfect cloning:

### Layer 1: Visual Structure (Static)
| Component | What to Extract | Priority |
|-----------|-----------------|----------|
| DOM Tree | Elements, hierarchy, attributes, text content | CRITICAL |
| Computed Styles | All CSS properties per element | CRITICAL |
| Layout/Position | getBoundingClientRect for every element | CRITICAL |
| Fonts | @font-face rules, font files (woff2/woff/ttf), fallback stacks | HIGH |
| Images | img src, background-image, srcset, picture sources | HIGH |
| SVGs | Inline SVG markup, referenced SVG files, path data | HIGH |
| Icons | Icon fonts (character codes), SVG icons, image sprites | HIGH |
| Colors | All color values including CSS variables | HIGH |
| Gradients | linear-gradient, radial-gradient, conic-gradient definitions | MEDIUM |
| Shadows | box-shadow, text-shadow, drop-shadow filter values | MEDIUM |
| Borders | border-*, border-radius, border-image | MEDIUM |
| Backgrounds | background-image, background-position, background-size | MEDIUM |

### Layer 2: Visual States (Dynamic)
| State | CSS/Attribute | How to Capture |
|-------|---------------|----------------|
| Hover | :hover | Physically hover element, capture computed styles |
| Focus | :focus, :focus-visible, :focus-within | Tab to element, capture styles |
| Active | :active | Mouse down, capture styles |
| Visited | :visited | Check link history (limited by browser) |
| Disabled | :disabled, [disabled] | Find disabled elements, capture styles |
| Checked | :checked | Toggle checkbox/radio, capture styles |
| Selected | .selected, [aria-selected] | Click to select, capture styles |
| Expanded | [aria-expanded] | Toggle expansion, capture styles |
| Invalid | :invalid, .error | Trigger validation, capture error styles |
| Placeholder | ::placeholder | Capture placeholder styles |
| Empty | :empty | Capture empty state styles |
| First/Last | :first-child, :last-child | Already in static styles |

### Layer 3: Pseudo-Elements
| Pseudo | How to Capture |
|--------|----------------|
| ::before | getComputedStyle(el, '::before') |
| ::after | getComputedStyle(el, '::after') |
| ::selection | Programmatically select text, capture styles |
| ::placeholder | Capture on empty input |
| ::marker | Capture on list items |
| ::first-line | Capture on text blocks |
| ::first-letter | Capture on text blocks |
| ::backdrop | Capture on dialogs/fullscreen |

### Layer 4: Animations & Transitions
| Type | What to Extract |
|------|-----------------|
| CSS Transitions | transition-property, duration, timing, delay per element |
| CSS Animations | @keyframes definitions, animation-* properties |
| CSS Transforms | Static transform values, animated transforms |
| Scroll Animations | scroll-timeline, view-timeline, @scroll-timeline |
| JS Animations | requestAnimationFrame patterns, Web Animations API |
| GSAP | Timeline definitions, tween parameters |
| anime.js | Animation configurations |
| Framer Motion | Motion component props |
| Lottie | JSON animation data |
| Spring Physics | Spring configs (stiffness, damping, mass) |

### Layer 5: Canvas & Graphics
| Type | What to Extract |
|------|-----------------|
| Canvas 2D | All context method calls (fillRect, drawImage, etc.) |
| Canvas State | transform, globalAlpha, globalCompositeOperation |
| Canvas Paths | beginPath, moveTo, lineTo, arc, bezierCurveTo |
| WebGL | Shaders, uniforms, buffers, textures, draw calls |
| WebGL State | enable/disable, blend functions, depth settings |
| WebGL2 | Additional features (UBOs, transform feedback) |
| OffscreenCanvas | Worker-based rendering |

### Layer 6: Interaction Handlers (COMPLETE EVENT LIST)

#### Mouse Events
| Event | What to Capture |
|-------|-----------------|
| click | Handler, DOM changes, state mutations |
| dblclick | Handler, behavior |
| mousedown/mouseup | Press/release handlers |
| mousemove | Movement tracking, throttling |
| mouseenter/mouseleave | Hover effects (don't bubble) |
| mouseover/mouseout | Hover effects (bubble) |
| contextmenu | Right-click menu content |
| wheel | Scroll/zoom behavior |

#### Pointer Events (unified mouse/touch/pen)
| Event | What to Capture |
|-------|-----------------|
| pointerdown/pointerup | Unified press/release |
| pointermove | Movement with pressure/tilt |
| pointerenter/pointerleave | Hover (pen/touch) |
| pointercancel | Interrupted interaction |
| gotpointercapture/lostpointercapture | Capture state |

#### Touch Events
| Event | What to Capture |
|-------|-----------------|
| touchstart/touchend | Touch begin/end |
| touchmove | Swipe, pan, pinch detection |
| touchcancel | Interrupted touch |
| gesturestart/gesturechange/gestureend | Multi-touch gestures (Safari) |

#### Keyboard Events
| Event | What to Capture |
|-------|-----------------|
| keydown/keyup | Key handlers, shortcuts |
| keypress | Character input (deprecated) |
| beforeinput | Input intent before change |
| input | Value change after keystroke |

#### Focus Events
| Event | What to Capture |
|-------|-----------------|
| focus/blur | Focus gain/loss (don't bubble) |
| focusin/focusout | Focus gain/loss (bubble) |

#### Form Events
| Event | What to Capture |
|-------|-----------------|
| submit | Form submission handler |
| reset | Form reset handler |
| change | Value commit (blur) |
| input | Value change (immediate) |
| invalid | Validation failure |
| formdata | FormData construction |

#### Drag Events
| Event | What to Capture |
|-------|-----------------|
| dragstart/dragend | Drag begin/end |
| drag | During drag |
| dragenter/dragleave | Enter/leave drop zone |
| dragover | Over drop zone |
| drop | Drop handler |

#### Clipboard Events
| Event | What to Capture |
|-------|-----------------|
| copy/cut/paste | Clipboard operations |
| beforecopy/beforecut/beforepaste | Pre-operation hooks |

#### Selection Events
| Event | What to Capture |
|-------|-----------------|
| select | Text selection |
| selectionchange | Selection modification |

#### Media Events (video/audio)
| Event | What to Capture |
|-------|-----------------|
| play/pause/ended | Playback state |
| timeupdate | Progress tracking |
| volumechange | Volume handlers |
| seeking/seeked | Seek operations |
| loadeddata/loadedmetadata | Media loaded |
| canplay/canplaythrough | Buffered enough |
| waiting/stalled | Buffering |
| error | Media error handling |
| ratechange | Speed change |

#### Animation Events
| Event | What to Capture |
|-------|-----------------|
| animationstart/animationend | CSS animation lifecycle |
| animationiteration | Loop iteration |
| animationcancel | Cancelled animation |
| transitionstart/transitionend | CSS transition lifecycle |
| transitionrun/transitioncancel | Transition state |

#### Document/Window Events
| Event | What to Capture |
|-------|-----------------|
| load/DOMContentLoaded | Page load handlers |
| beforeunload/unload | Page leave handlers |
| resize | Responsive handlers |
| scroll/scrollend | Scroll handlers |
| visibilitychange | Tab visibility |
| pagehide/pageshow | BFCache navigation |
| online/offline | Network status |
| hashchange/popstate | History navigation |
| beforeprint/afterprint | Print handlers |
| error | Global error handler |
| unhandledrejection | Promise rejection |

#### Canvas Events
| Event | What to Capture |
|-------|-----------------|
| webglcontextlost | Context loss handling |
| webglcontextrestored | Context restoration |

#### Fullscreen/PiP Events
| Event | What to Capture |
|-------|-----------------|
| fullscreenchange | Fullscreen toggle |
| fullscreenerror | Fullscreen failure |
| enterpictureinpicture | PiP enter |
| leavepictureinpicture | PiP exit |

#### Device Events
| Event | What to Capture |
|-------|-----------------|
| devicemotion | Accelerometer data |
| deviceorientation | Gyroscope data |
| gamepadconnected/disconnected | Controller input |

#### Speech Events
| Event | What to Capture |
|-------|-----------------|
| SpeechRecognition events | Voice input |
| SpeechSynthesis events | Text-to-speech |

#### WebRTC Events
| Event | What to Capture |
|-------|-----------------|
| RTCPeerConnection events | Video/audio calls |
| track/negotiationneeded | Stream handling |

#### Web Component Events
| Event | What to Capture |
|-------|-----------------|
| connectedCallback | Element attached |
| disconnectedCallback | Element removed |
| attributeChangedCallback | Attribute mutation |
| slotchange | Slot content change |

### Layer 7: Application State
| State Type | How to Extract |
|------------|----------------|
| React State | Hook into useState, useReducer, component state |
| Redux | Store state, actions, reducers |
| MobX | Observable state |
| Zustand | Store state |
| Context | Context values |
| URL State | Query params, hash, pathname |
| Form State | Input values, touched fields, validation errors |
| UI State | Modal open, dropdown expanded, tab selected |
| Auth State | User info, tokens (redacted) |
| Theme State | Current theme, CSS variable values |

### Layer 8: Network & Data
| Type | What to Extract |
|------|-----------------|
| Fetch Calls | URL, method, headers, body, response |
| XHR Calls | Same as fetch |
| WebSocket | Connection URL, message patterns |
| SSE | Event source URL, event types |
| GraphQL | Queries, mutations, variables |
| REST Patterns | Endpoint structure, data shapes |
| Static Data | Hardcoded JSON, arrays, objects |
| localStorage | Keys, values, access patterns |
| sessionStorage | Keys, values |
| IndexedDB | Database structure, stored data |
| Cookies | Names, values (non-sensitive) |

### Layer 9: Responsive Design
| Aspect | What to Extract |
|--------|-----------------|
| Media Queries | All @media rules with breakpoints |
| Container Queries | @container rules |
| Viewport Units | vw, vh, vmin, vmax, dvh, svh, lvh |
| Fluid Typography | clamp(), min(), max() for font-size |
| Responsive Images | srcset, sizes, picture element |
| Grid Layouts | Grid template definitions per breakpoint |
| Flex Layouts | Flex properties, wrap behavior |
| Aspect Ratios | aspect-ratio property |
| Object Fit | object-fit, object-position |
| Subgrid | grid-template: subgrid |

### Layer 9.5: Modern CSS Features
| Feature | What to Extract |
|---------|-----------------|
| CSS Variables | Custom properties, calc() with vars |
| Cascade Layers | @layer rules and order |
| CSS Nesting | Native nested selectors |
| :has() Selector | Parent selectors |
| :is()/:where() | Selector lists |
| :not() | Negation selectors |
| Logical Properties | inline/block vs left/right/top/bottom |
| Color Functions | color-mix(), oklch(), lab(), lch() |
| Color Spaces | display-p3, rec2020 |
| Gradients | conic-gradient, repeating-* |
| Masking | mask-image, clip-path |
| Blend Modes | mix-blend-mode, background-blend-mode |
| Filters | filter, backdrop-filter |
| Scroll Snap | scroll-snap-type, scroll-snap-align |
| Scroll Behavior | scroll-behavior: smooth |
| Scroll Timeline | animation-timeline: scroll() |
| View Timeline | animation-timeline: view() |
| Anchor Positioning | anchor(), anchor-name |
| Popover API | popover attribute, ::backdrop |
| Dialog Element | dialog::backdrop |
| Details/Summary | Native accordion |
| Accent Color | accent-color for form controls |
| Color Scheme | color-scheme: light dark |
| Forced Colors | @media (forced-colors) |
| Prefers Reduced Motion | @media (prefers-reduced-motion) |
| Prefers Color Scheme | @media (prefers-color-scheme) |
| Prefers Contrast | @media (prefers-contrast) |
| CSS Houdini | Paint/Layout/Animation worklets |
| @scope | Scoped styles |
| @starting-style | Entry animations |
| @property | Registered custom properties |
| text-wrap: balance | Balanced text wrapping |
| initial-letter | Drop caps |
| font-palette | Color fonts |
| @font-feature-values | OpenType features |
| hanging-punctuation | Typography |
| text-decoration-skip-ink | Link underlines |
| overscroll-behavior | Scroll chaining |
| contain | Layout/paint/size containment |
| content-visibility | Rendering optimization |

### Layer 10: UI Patterns (Component Behaviors)
| Pattern | What to Extract |
|---------|-----------------|
| Modal/Dialog | Trigger, content, backdrop, close behavior, focus trap |
| Dropdown Menu | Trigger, menu items, positioning, keyboard nav |
| Tooltip | Trigger type, content, positioning, delay |
| Popover | Trigger, content, positioning, arrow |
| Toast/Notification | Trigger, content, duration, position, dismiss |
| Tab Panel | Tab list, panels, keyboard nav, active state |
| Accordion | Headers, panels, expand/collapse, animation |
| Carousel/Slider | Slides, navigation, auto-play, indicators |
| Infinite Scroll | Trigger threshold, loading state, data append |
| Virtual List | Item height, visible range, buffer |
| Drag & Drop | Draggables, droppables, drag preview |
| Resize Handle | Resize directions, min/max constraints |
| Split Pane | Splitter position, resize behavior |
| Tree View | Expandable nodes, selection, keyboard nav |
| Data Table | Columns, sorting, filtering, pagination |
| Date Picker | Calendar display, selection, range |
| Color Picker | Color formats, swatches, gradients |
| File Upload | Drop zone, preview, progress |
| Rich Text Editor | Toolbar, formatting, content |
| Code Editor | Syntax highlighting, line numbers, autocomplete |

### Layer 11: Accessibility
| Aspect | What to Extract |
|--------|-----------------|
| ARIA Roles | role attributes on all elements |
| ARIA Labels | aria-label, aria-labelledby |
| ARIA Descriptions | aria-describedby |
| ARIA States | aria-expanded, aria-selected, aria-pressed, etc. |
| ARIA Properties | aria-haspopup, aria-controls, aria-owns |
| Tab Order | tabindex values, natural tab order |
| Focus Management | Focus traps, focus restoration |
| Screen Reader Text | .sr-only, visually hidden content |
| Live Regions | aria-live, aria-atomic |
| Keyboard Shortcuts | accesskey, custom shortcuts |
| Skip Links | Skip to main content links |
| Landmarks | header, nav, main, footer roles |

### Layer 12: Browser APIs Used

#### Observers
| API | What to Extract |
|-----|-----------------|
| Intersection Observer | Observed elements, thresholds, callbacks |
| Resize Observer | Observed elements, callbacks |
| Mutation Observer | Observed nodes, config, callbacks |
| Performance Observer | Entry types, callbacks |
| Reporting Observer | Report types, callbacks |

#### Navigation & History
| API | What to Extract |
|-----|-----------------|
| History API | pushState/replaceState usage |
| Navigation API | navigate events, transitions |
| View Transitions | Transition names, animations |

#### Storage & State
| API | What to Extract |
|-----|-----------------|
| localStorage | Keys, values, events |
| sessionStorage | Keys, values |
| IndexedDB | Databases, object stores, indexes |
| Cache API | Cache names, strategies |
| CookieStore | Cookie values (non-sensitive) |
| Storage Buckets | Partitioned storage |

#### Media & Graphics
| API | What to Extract |
|-----|-----------------|
| Web Audio | Audio graph, nodes, connections |
| MediaStream | getUserMedia, tracks |
| Screen Capture | getDisplayMedia usage |
| Media Session | Now playing metadata |
| Picture-in-Picture | PiP state |
| WebCodecs | Encoding/decoding configs |

#### Communication
| API | What to Extract |
|-----|-----------------|
| WebSocket | Connection URL, message patterns |
| WebRTC | Peer connections, tracks |
| Broadcast Channel | Channel names, message patterns |
| MessageChannel | Port communication |
| Server-Sent Events | Event source URLs |
| WebTransport | Streams, datagrams |

#### Background & Workers
| API | What to Extract |
|-----|-----------------|
| Service Worker | Routes, caching, push handlers |
| Web Workers | Worker scripts, messages |
| Shared Workers | Shared state |
| Worklets | Paint, animation, audio worklets |
| Background Sync | Sync tags |
| Background Fetch | Fetch progress |
| Periodic Sync | Sync periods |

#### Input & Interaction
| API | What to Extract |
|-----|-----------------|
| Clipboard API | Read/write operations |
| Drag and Drop API | DataTransfer usage |
| File API | File reading patterns |
| File System Access | File/directory handles |
| Keyboard API | Keyboard lock, layouts |
| Pointer Lock | Lock usage |
| Gamepad API | Gamepad state |
| Web MIDI | MIDI device access |

#### Device & Sensors
| API | What to Extract |
|-----|-----------------|
| Geolocation | Position requests |
| DeviceOrientation | Orientation data |
| DeviceMotion | Motion data |
| Ambient Light Sensor | Light levels |
| Battery Status | Battery info |
| Network Information | Connection type |
| Screen Orientation | Orientation lock |

#### Permissions & Security
| API | What to Extract |
|-----|-----------------|
| Permissions API | Permission queries |
| Credential Management | Credential usage |
| Web Authentication | WebAuthn flows |
| Trusted Types | Type policies |

#### PWA & Platform
| API | What to Extract |
|-----|-----------------|
| Notifications | Notification content |
| Push API | Subscription, messages |
| Badging API | Badge values |
| Share API | Share targets |
| Web Share Target | Received shares |
| Window Controls Overlay | Title bar customization |
| Launch Handler | Launch modes |
| Protocol Handler | Custom protocols |

#### XR (VR/AR)
| API | What to Extract |
|-----|-----------------|
| WebXR | Session modes, reference spaces |
| WebXR Layers | Layer configurations |
| WebXR Hit Test | Hit test sources |

#### Experimental/Emerging
| API | What to Extract |
|-----|-----------------|
| Web Neural Network | Model execution |
| Compute Pressure | System load |
| Idle Detection | User activity |
| Content Index | Indexed content |
| Contact Picker | Selected contacts |
| EyeDropper | Color sampling |

### Layer 13: Third-Party Integrations
| Integration | What to Extract |
|-------------|-----------------|
| Analytics | Event tracking calls (for mocking) |
| Chat Widgets | Widget configuration |
| Maps | Map container, markers, overlays |
| Video Players | Player config, video sources |
| Social Embeds | Embed URLs, dimensions |
| Payment Forms | Form structure (not credentials) |
| reCAPTCHA | Widget configuration |
| OAuth Flows | Provider buttons, redirect patterns |

### Layer 14: Performance Patterns
| Pattern | What to Extract |
|---------|-----------------|
| Lazy Loading | Lazy-loaded images, components |
| Code Splitting | Dynamic import boundaries |
| Skeleton Screens | Skeleton component structure |
| Loading States | Spinner/loader components |
| Error Boundaries | Error UI components |
| Suspense | Fallback components |
| Prefetching | Prefetch link hints |

### Layer 15: JavaScript Runtime Behaviors
| Behavior | What to Extract |
|----------|-----------------|
| setTimeout/setInterval | Timer patterns, delays, cleanup |
| requestAnimationFrame | Animation loops, frame timing |
| requestIdleCallback | Idle work scheduling |
| queueMicrotask | Microtask scheduling |
| Promises | Async patterns, chaining |
| async/await | Async function patterns |
| Generators | Generator functions, yield |
| Proxy objects | Proxy traps, handler patterns |
| eval/Function | Dynamic code execution |
| Error handling | try/catch patterns, error types |

### Layer 16: Data Types & Encoding
| Type | What to Extract |
|------|-----------------|
| JSON | Parse/stringify patterns |
| Blob/File | Blob URLs, file reading |
| ArrayBuffer | Binary data handling |
| TypedArrays | Int8Array, Float32Array, etc. |
| DataView | Binary data views |
| TextEncoder/Decoder | String encoding |
| atob/btoa | Base64 encoding |
| Streams | ReadableStream, WritableStream |
| Compression | CompressionStream/DecompressionStream |

### Layer 17: Crypto & Security
| Feature | What to Extract |
|---------|-----------------|
| SubtleCrypto | Encrypt, decrypt, sign, verify |
| getRandomValues | Random number generation |
| randomUUID | UUID generation |
| Trusted Types | DOM XSS policies |
| CSP | Content Security Policy rules |
| CORS | Cross-origin patterns |
| Sandboxing | iframe sandbox attributes |

### Layer 18: Internationalization
| Feature | What to Extract |
|---------|-----------------|
| Intl.DateTimeFormat | Date/time formatting |
| Intl.NumberFormat | Number/currency formatting |
| Intl.Collator | String comparison |
| Intl.PluralRules | Pluralization |
| Intl.RelativeTimeFormat | "2 days ago" formatting |
| Intl.ListFormat | List formatting |
| Intl.Segmenter | Text segmentation |
| Text direction | dir="rtl", writing-mode |
| Language tags | lang attributes |

### Layer 19: Document & Parsing
| Feature | What to Extract |
|---------|-----------------|
| DOMParser | HTML/XML parsing |
| XMLSerializer | DOM to string |
| Range/Selection | Text selection API |
| TreeWalker | DOM traversal |
| XPath | document.evaluate |
| Template element | Template content |
| Shadow DOM | Open/closed shadow roots |
| Declarative Shadow DOM | shadowrootmode attribute |
| Slot elements | Named slots, slotchange |

### Layer 20: SVG Specifics
| Feature | What to Extract |
|---------|-----------------|
| SMIL animations | SVG native animations |
| SVG filters | feGaussianBlur, feColorMatrix, etc. |
| SVG masks | mask, clip-path in SVG |
| SVG patterns | Pattern definitions |
| SVG gradients | linearGradient, radialGradient |
| SVG symbols | symbol, use elements |
| SVG foreignObject | HTML inside SVG |
| SVG text | Text paths, tspan |
| Path commands | M, L, C, Q, A, Z commands |

### Layer 21: Audio Graph
| Feature | What to Extract |
|---------|-----------------|
| AudioContext | Context state, sample rate |
| Audio nodes | Oscillator, Gain, Filter, etc. |
| Audio connections | Node graph structure |
| Audio parameters | AudioParam automation |
| Audio worklets | Custom audio processing |
| Analyser node | Frequency/waveform data |
| Spatialization | Panner, listener position |

### Layer 22: Video Specifics
| Feature | What to Extract |
|---------|-----------------|
| Media Source Extensions | MSE buffering |
| Encrypted Media | DRM handling |
| Video textures | WebGL video input |
| requestVideoFrameCallback | Frame-accurate video |
| WebVTT | Subtitles, captions |
| Video tracks | Audio/video/text tracks |
| Poster frames | Poster image |

### Layer 23: WebAssembly
| Feature | What to Extract |
|---------|-----------------|
| WASM modules | Module loading, instantiation |
| WASM memory | Memory size, growth |
| WASM imports/exports | Function bindings |
| WASM SIMD | Vector operations |
| WASM threads | SharedArrayBuffer |

### Layer 24: Resource Loading
| Feature | What to Extract |
|---------|-----------------|
| dns-prefetch | DNS hints |
| preconnect | Connection hints |
| prefetch | Resource prefetch |
| preload | Critical resource loading |
| prerender | Speculation Rules |
| modulepreload | ES module preload |
| fetchpriority | Priority hints |
| loading="lazy" | Native lazy loading |

### Layer 25: Print & Media
| Feature | What to Extract |
|---------|-----------------|
| @media print | Print stylesheets |
| @page | Page size, margins |
| page-break-* | Page break controls |
| orphans/widows | Pagination control |
| Print dialogs | beforeprint/afterprint |

### Layer 26: URL & Routing
| Feature | What to Extract |
|---------|-----------------|
| URL parsing | URL API usage |
| URLSearchParams | Query string handling |
| URLPattern | Route matching (new API) |
| Hash routing | hashchange patterns |
| History routing | pushState patterns |
| Base URL | <base> element |
| Relative URLs | Resolution patterns |

### Layer 27: Error Handling
| Feature | What to Extract |
|---------|-----------------|
| window.onerror | Global error handler |
| unhandledrejection | Promise rejection handler |
| Error types | Custom error classes |
| Error boundaries | React/framework error UI |
| reportError() | Error reporting |
| console methods | log, warn, error patterns |

### Layer 28: Timing & Event Loop
| Feature | What to Extract |
|---------|-----------------|
| Macrotasks | setTimeout, setInterval timing |
| Microtasks | Promise, queueMicrotask timing |
| Animation frames | rAF timing |
| Idle callbacks | rIC timing |
| Long tasks | Performance long task entries |
| Task attribution | Scheduler API |

### Layer 29: iframe & Embedding
| Feature | What to Extract |
|---------|-----------------|
| iframe sandbox | Sandbox attribute flags |
| iframe allow | Permissions policy |
| postMessage | Cross-frame communication |
| srcdoc | Inline frame content |
| Cross-origin | CORS restrictions |
| loading="lazy" | Lazy iframe loading |

### Layer 30: Native Integrations
| Feature | What to Extract |
|---------|-----------------|
| mailto: links | Email composition |
| tel: links | Phone dialing |
| sms: links | SMS composition |
| geo: links | Map opening |
| Custom schemes | App deep links |
| intent: URLs | Android intents |
| App Clips/Instant | App preview |

### Layer 31: Accessibility (Extended)
| Feature | What to Extract |
|---------|-----------------|
| Live regions | aria-live, aria-atomic |
| ARIA relationships | aria-owns, aria-controls |
| ARIA states | aria-busy, aria-current |
| Focus indicators | :focus-visible styles |
| Skip links | Hidden navigation |
| Reading order | DOM order vs visual |
| Touch targets | Minimum tap size |
| Motion sensitivity | prefers-reduced-motion |
| Color blindness | Color-only information |
| High contrast | forced-colors mode |

### Layer 32: Testing Attributes
| Feature | What to Extract |
|---------|-----------------|
| data-testid | Test selectors |
| data-cy | Cypress selectors |
| data-* attributes | Custom data attributes |
| Synthetic events | Programmatic events |

### Layer 33: Temporal & Time
| Feature | What to Extract |
|---------|-----------------|
| Date handling | Date parsing, formatting |
| Timezone | Timezone-aware dates |
| Temporal API | New date/time API |
| Relative time | "2 hours ago" patterns |
| Countdown/Timer | Live time displays |

### Layer 34: State Machines & Patterns
| Pattern | What to Extract |
|---------|-----------------|
| Finite state machines | XState, robot, etc. |
| Command pattern | Undo/redo stacks |
| Observer pattern | Event emitters |
| Pub/sub | Event buses |
| Singleton | Global instances |
| Factory | Component factories |

### Layer 35: Progressive Enhancement
| Feature | What to Extract |
|---------|-----------------|
| Feature detection | Modernizr-style checks |
| Polyfills | Loaded polyfills |
| Fallbacks | No-JS fallbacks |
| Graceful degradation | Fallback UI |
| @supports | CSS feature queries |

---

## Exhaustive State Exploration (CRITICAL MISSING PIECE)

The current approach is **shallow** - it captures what's visible or happens naturally. True "perfect extraction" requires **exhaustive exploration** of all possible states.

### Current Approach (Shallow)
```
Passive: Record what happens when user does X
Active:  Click each button once, record result
```

### Required Approach (Exhaustive)
```
Explore: Find EVERY possible state by trying EVERY possible action sequence
         until no new states are discovered
```

### The State Explosion Problem

| Depth | Actions | Possible Paths |
|-------|---------|----------------|
| 1 | 50 buttons | 50 states |
| 2 | 50 × 50 | 2,500 states |
| 3 | 50 × 50 × 50 | 125,000 states |
| N | 50^N | Exponential |

With 50 interactive elements, exploring just 3 actions deep = 125,000 possible paths.

### State Machine Extraction

To exhaustively extract behavior, we need:

```
┌─────────────────────────────────────────────────────────────────┐
│                 EXHAUSTIVE STATE EXPLORER                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. STATE IDENTIFICATION                                         │
│     - Hash the DOM structure                                     │
│     - Hash computed styles of key elements                       │
│     - Hash application state (React, Redux, URL, etc.)           │
│     - Hash visible text content                                  │
│     → Unique state fingerprint                                   │
│                                                                  │
│  2. ACTION ENUMERATION                                           │
│     - Find all clickable elements                                │
│     - Find all hoverable elements                                │
│     - Find all focusable elements                                │
│     - Find all typeable inputs                                   │
│     - Find all keyboard shortcuts                                │
│     - Find all scrollable regions                                │
│     - Find all draggable elements                                │
│     → List of possible actions from current state                │
│                                                                  │
│  3. EXPLORATION ALGORITHM                                        │
│     - Start at initial state S0                                  │
│     - Queue = [S0]                                               │
│     - Visited = {}                                               │
│     - While Queue not empty:                                     │
│         - S = Queue.pop()                                        │
│         - If S in Visited: continue                              │
│         - Visited.add(S)                                         │
│         - For each action A possible in S:                       │
│             - S' = perform(A) and capture new state              │
│             - Record transition: S --A--> S'                     │
│             - If S' not in Visited: Queue.push(S')               │
│             - Reset to S (reload or undo)                        │
│                                                                  │
│  4. TRANSITION RECORDING                                         │
│     For each transition S --A--> S':                             │
│     - DOM diff (elements added/removed/changed)                  │
│     - Style diff (CSS changes)                                   │
│     - State diff (app state changes)                             │
│     - Network requests triggered                                 │
│     - Console output                                             │
│                                                                  │
│  5. TERMINATION CONDITIONS                                       │
│     - No new states discovered for N iterations                  │
│     - Maximum depth reached                                      │
│     - Maximum time elapsed                                       │
│     - Maximum states explored                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation: Exhaustive Explorer

```javascript
class ExhaustiveStateExplorer {
  constructor(page) {
    this.page = page;
    this.visited = new Map(); // stateHash -> stateData
    this.transitions = [];    // { from, action, to, diff }
    this.queue = [];
  }

  // Generate unique hash for current state
  async getStateHash() {
    return await this.page.evaluate(() => {
      const domHash = hashDOM(document.body);
      const styleHash = hashStyles(document.querySelectorAll('*'));
      const urlHash = location.href;
      const storageHash = JSON.stringify(localStorage);

      // Try to get React/app state
      let appState = '';
      try {
        appState = JSON.stringify(window.__REDUX_STATE__ ||
                                  window.__APP_STATE__ ||
                                  getReactState());
      } catch(e) {}

      return hash(domHash + styleHash + urlHash + storageHash + appState);
    });
  }

  // Get all possible actions from current state
  async getAvailableActions() {
    return await this.page.evaluate(() => {
      const actions = [];

      // Clickable elements
      document.querySelectorAll('button, a, [role="button"], [onclick], [tabindex="0"]')
        .forEach(el => {
          if (isVisible(el) && isEnabled(el)) {
            actions.push({ type: 'click', selector: getSelector(el) });
          }
        });

      // Hoverable elements (with :hover styles)
      document.querySelectorAll('*').forEach(el => {
        if (hasHoverStyles(el)) {
          actions.push({ type: 'hover', selector: getSelector(el) });
        }
      });

      // Input elements
      document.querySelectorAll('input, textarea, [contenteditable]')
        .forEach(el => {
          actions.push({ type: 'type', selector: getSelector(el), value: 'test' });
        });

      // Keyboard shortcuts (from event listeners)
      window.__capturedKeyboardShortcuts?.forEach(shortcut => {
        actions.push({ type: 'keyboard', keys: shortcut });
      });

      // Select elements
      document.querySelectorAll('select').forEach(el => {
        [...el.options].forEach((opt, i) => {
          actions.push({ type: 'select', selector: getSelector(el), index: i });
        });
      });

      // Checkboxes/radios
      document.querySelectorAll('input[type="checkbox"], input[type="radio"]')
        .forEach(el => {
          actions.push({ type: 'toggle', selector: getSelector(el) });
        });

      return actions;
    });
  }

  // Perform action and return new state
  async performAction(action) {
    const before = await this.captureFullState();

    switch (action.type) {
      case 'click':
        await this.page.click(action.selector);
        break;
      case 'hover':
        await this.page.hover(action.selector);
        break;
      case 'type':
        await this.page.fill(action.selector, action.value);
        break;
      case 'keyboard':
        await this.page.keyboard.press(action.keys);
        break;
      case 'select':
        await this.page.selectOption(action.selector, { index: action.index });
        break;
      case 'toggle':
        await this.page.click(action.selector);
        break;
    }

    await this.page.waitForTimeout(300); // Let effects settle

    const after = await this.captureFullState();
    const diff = computeDiff(before, after);

    return { stateHash: await this.getStateHash(), diff };
  }

  // Main exploration loop
  async explore(maxDepth = 5, maxStates = 1000) {
    const initialHash = await this.getStateHash();
    const initialState = await this.captureFullState();

    this.visited.set(initialHash, { state: initialState, depth: 0 });
    this.queue.push({ hash: initialHash, depth: 0, path: [] });

    while (this.queue.length > 0 && this.visited.size < maxStates) {
      const { hash: currentHash, depth, path } = this.queue.shift();

      if (depth >= maxDepth) continue;

      // Restore to this state
      await this.restoreState(path);

      // Get all possible actions
      const actions = await this.getAvailableActions();

      for (const action of actions) {
        // Perform action
        const { stateHash: newHash, diff } = await this.performAction(action);

        // Record transition
        this.transitions.push({
          from: currentHash,
          action,
          to: newHash,
          diff
        });

        // If new state, add to queue
        if (!this.visited.has(newHash)) {
          const newState = await this.captureFullState();
          this.visited.set(newHash, { state: newState, depth: depth + 1 });
          this.queue.push({
            hash: newHash,
            depth: depth + 1,
            path: [...path, action]
          });

          console.log(`Discovered state #${this.visited.size} at depth ${depth + 1}`);
        }

        // Reset to current state for next action
        await this.restoreState(path);
      }
    }

    return {
      states: this.visited,
      transitions: this.transitions
    };
  }

  // Restore to a state by replaying actions from initial
  async restoreState(actionPath) {
    await this.page.reload();
    await this.page.waitForLoadState('networkidle');

    for (const action of actionPath) {
      await this.performAction(action);
    }
  }
}
```

### Optimization Strategies

| Strategy | Description |
|----------|-------------|
| **State Pruning** | Skip states that are "similar enough" to visited states |
| **Action Prioritization** | Try likely-impactful actions first (buttons before hovers) |
| **Partial State Hashing** | Only hash visible/relevant parts of state |
| **Checkpoint/Restore** | Use browser snapshots instead of full reload |
| **Parallel Exploration** | Multiple browser instances exploring different branches |
| **Guided Exploration** | Use heuristics to guide toward unexplored areas |
| **Incremental Exploration** | Save progress, resume later |

### Exploration Modes

| Mode | Depth | Actions | Use Case |
|------|-------|---------|----------|
| **Quick** | 2 | Click only | Fast overview |
| **Standard** | 3 | Click, hover, type | Most apps |
| **Deep** | 5 | All actions | Complex apps |
| **Exhaustive** | ∞ | All actions | Until no new states |

### What This Enables

With exhaustive exploration, we can:

1. **Discover hidden states** - States only reachable via specific action sequences
2. **Find all UI variations** - Every modal, dropdown, error state
3. **Map the state machine** - Complete graph of states and transitions
4. **Generate comprehensive tests** - Test every reachable state
5. **Perfect recreation** - Because we've seen EVERY state

### New Extractors Needed

| Extractor | Purpose |
|-----------|---------|
| `state-hasher.js` | Generate unique state fingerprints |
| `action-enumerator.js` | Find all possible actions |
| `state-explorer.js` | BFS/DFS state exploration |
| `transition-recorder.js` | Record state→state diffs |
| `state-graph-builder.js` | Build state machine graph |
| `checkpoint-manager.js` | Save/restore browser state |

---

## Verification of Complete Coverage (HOW TO KNOW YOU DIDN'T MISS ANYTHING)

The fundamental question: **How do you PROVE you've explored everything?**

### The Hard Truth

You can **never mathematically prove** 100% coverage because:
- Halting problem - can't prove all paths terminate
- Infinite input space - infinite possible typed inputs
- Time-dependent states - states that only appear at certain times
- Random states - non-deterministic behavior

But you CAN get **practical certainty** through multiple coverage metrics.

### Coverage Metrics Framework

```
┌─────────────────────────────────────────────────────────────────┐
│                    COVERAGE VERIFICATION                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STATIC ANALYSIS          DYNAMIC EXPLORATION       COMPARISON  │
│  (What COULD exist)       (What we FOUND)          (Gap = 0?)   │
│                                                                  │
│  ┌─────────────────┐      ┌─────────────────┐     ┌──────────┐ │
│  │ Parse HTML      │      │ Elements visited│     │ Missing  │ │
│  │ → All elements  │  vs  │ during explore  │  =  │ elements │ │
│  └─────────────────┘      └─────────────────┘     └──────────┘ │
│                                                                  │
│  ┌─────────────────┐      ┌─────────────────┐     ┌──────────┐ │
│  │ Parse CSS       │      │ Selectors that  │     │ Untriggered│
│  │ → All selectors │  vs  │ matched/triggered│ =  │ selectors│ │
│  └─────────────────┘      └─────────────────┘     └──────────┘ │
│                                                                  │
│  ┌─────────────────┐      ┌─────────────────┐     ┌──────────┐ │
│  │ Intercept       │      │ Listeners that  │     │ Unfired  │ │
│  │ → All listeners │  vs  │ actually fired  │  =  │ listeners│ │
│  └─────────────────┘      └─────────────────┘     └──────────┘ │
│                                                                  │
│  ┌─────────────────┐      ┌─────────────────┐     ┌──────────┐ │
│  │ Parse routes    │      │ URLs visited    │     │ Unvisited│ │
│  │ → All routes    │  vs  │ during explore  │  =  │ routes   │ │
│  └─────────────────┘      └─────────────────┘     └──────────┘ │
│                                                                  │
│  COVERAGE COMPLETE WHEN ALL GAPS = 0                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1. Element Coverage

**Static:** Parse DOM to find all elements
**Dynamic:** Track which elements were interacted with
**Verify:** Every element that CAN be interacted with WAS interacted with

```javascript
class ElementCoverageTracker {
  constructor() {
    this.allElements = new Set();      // From static analysis
    this.visitedElements = new Set();  // From dynamic exploration
    this.interactedElements = new Set(); // Actually clicked/hovered/etc
  }

  // Run BEFORE exploration
  async staticAnalysis(page) {
    this.allElements = await page.evaluate(() => {
      const elements = new Set();
      document.querySelectorAll('*').forEach(el => {
        elements.add({
          selector: getUniqueSelector(el),
          tag: el.tagName,
          interactive: isInteractive(el),
          visible: isVisible(el),
          hasListeners: getEventListeners(el).length > 0
        });
      });
      return elements;
    });
  }

  // Track during exploration
  trackInteraction(selector, actionType) {
    this.interactedElements.add({ selector, actionType });
  }

  // Verify coverage
  getCoverage() {
    const interactiveElements = [...this.allElements]
      .filter(el => el.interactive && el.visible);

    const covered = interactiveElements.filter(el =>
      this.interactedElements.has(el.selector)
    );

    return {
      total: interactiveElements.length,
      covered: covered.length,
      percentage: (covered.length / interactiveElements.length * 100).toFixed(1),
      missing: interactiveElements.filter(el =>
        !this.interactedElements.has(el.selector)
      )
    };
  }
}
```

### 2. Event Listener Coverage

**Static:** Intercept ALL addEventListener calls
**Dynamic:** Track which listeners actually fired
**Verify:** Every registered listener was triggered at least once

```javascript
class ListenerCoverageTracker {
  // Injection script - captures ALL listener registrations
  static getInjectionScript() {
    return `
(function() {
  window.__allListeners = [];
  window.__firedListeners = new Set();

  const original = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, handler, options) {
    const id = Math.random().toString(36);
    const selector = this instanceof Element ? getUniqueSelector(this) :
                     this === window ? 'window' :
                     this === document ? 'document' : 'unknown';

    window.__allListeners.push({
      id,
      selector,
      type,
      registered: Date.now()
    });

    // Wrap handler to track when it fires
    const wrappedHandler = function(...args) {
      window.__firedListeners.add(id);
      return handler.apply(this, args);
    };

    return original.call(this, type, wrappedHandler, options);
  };
})();
`;
  }

  async getCoverage(page) {
    return await page.evaluate(() => {
      const all = window.__allListeners;
      const fired = window.__firedListeners;

      return {
        total: all.length,
        fired: fired.size,
        percentage: (fired.size / all.length * 100).toFixed(1),
        unfired: all.filter(l => !fired.has(l.id))
      };
    });
  }
}
```

### 3. CSS Selector Coverage

**Static:** Parse all stylesheets for all selectors
**Dynamic:** Track which selectors matched elements in explored states
**Verify:** Every CSS selector was exercised

```javascript
class CSSSelectorCoverageTracker {
  async staticAnalysis(page) {
    return await page.evaluate(() => {
      const selectors = new Set();

      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText) {
              // Split compound selectors
              rule.selectorText.split(',').forEach(s => {
                selectors.add(s.trim());
              });
            }
          }
        } catch(e) {} // Cross-origin sheets
      }

      return {
        all: [...selectors],
        hover: [...selectors].filter(s => s.includes(':hover')),
        focus: [...selectors].filter(s => s.includes(':focus')),
        active: [...selectors].filter(s => s.includes(':active')),
        other: [...selectors].filter(s =>
          !s.includes(':hover') && !s.includes(':focus') && !s.includes(':active')
        )
      };
    });
  }

  async checkSelectorMatches(page, selectors) {
    return await page.evaluate((sels) => {
      const matched = [];
      const unmatched = [];

      for (const selector of sels) {
        try {
          // Remove pseudo-classes for matching
          const baseSelector = selector
            .replace(/:hover/g, '')
            .replace(/:focus/g, '')
            .replace(/:active/g, '')
            .replace(/:visited/g, '')
            .replace(/::before/g, '')
            .replace(/::after/g, '')
            .trim();

          if (baseSelector && document.querySelector(baseSelector)) {
            matched.push(selector);
          } else {
            unmatched.push(selector);
          }
        } catch(e) {
          unmatched.push(selector);
        }
      }

      return { matched, unmatched };
    }, selectors);
  }
}
```

### 4. Route/URL Coverage

**Static:** Find all routes from:
- `<a href>` tags
- Router configuration (React Router, Vue Router, etc.)
- pushState/replaceState calls
- Hash changes

**Dynamic:** Track all URLs visited
**Verify:** Every discoverable route was visited

```javascript
class RouteCoverageTracker {
  static getInjectionScript() {
    return `
(function() {
  window.__allRoutes = new Set();
  window.__visitedRoutes = new Set();

  // Track current URL
  window.__visitedRoutes.add(location.href);

  // Intercept pushState
  const originalPushState = history.pushState;
  history.pushState = function(...args) {
    window.__visitedRoutes.add(args[2] || location.href);
    return originalPushState.apply(this, args);
  };

  // Intercept replaceState
  const originalReplaceState = history.replaceState;
  history.replaceState = function(...args) {
    window.__visitedRoutes.add(args[2] || location.href);
    return originalReplaceState.apply(this, args);
  };

  // Track hashchange
  window.addEventListener('hashchange', () => {
    window.__visitedRoutes.add(location.href);
  });

  // Track popstate
  window.addEventListener('popstate', () => {
    window.__visitedRoutes.add(location.href);
  });

  // Find all href values
  window.__findAllRoutes = function() {
    document.querySelectorAll('a[href]').forEach(a => {
      try {
        const url = new URL(a.href, location.origin);
        if (url.origin === location.origin) {
          window.__allRoutes.add(url.pathname + url.search + url.hash);
        }
      } catch(e) {}
    });

    // Try to find React Router routes
    try {
      const routes = window.__REACT_ROUTER_ROUTES__ ||
                     window.__ROUTES__ ||
                     document.querySelector('[data-routes]')?.dataset.routes;
      if (routes) {
        JSON.parse(routes).forEach(r => window.__allRoutes.add(r.path));
      }
    } catch(e) {}

    return [...window.__allRoutes];
  };
})();
`;
  }

  async getCoverage(page) {
    return await page.evaluate(() => {
      const all = window.__findAllRoutes();
      const visited = [...window.__visitedRoutes];

      const normalizeUrl = url => {
        try {
          const u = new URL(url, location.origin);
          return u.pathname + u.search + u.hash;
        } catch(e) {
          return url;
        }
      };

      const visitedNormalized = new Set(visited.map(normalizeUrl));

      return {
        total: all.length,
        visited: visitedNormalized.size,
        percentage: all.length ? (visitedNormalized.size / all.length * 100).toFixed(1) : '100',
        unvisited: all.filter(r => !visitedNormalized.has(normalizeUrl(r)))
      };
    });
  }
}
```

### 5. State Convergence Detection

**The key insight:** If you keep exploring and stop finding new states, you've likely covered everything.

```javascript
class ConvergenceDetector {
  constructor(options = {}) {
    this.statesPerRound = [];
    this.convergenceThreshold = options.threshold || 10; // Rounds with no new states
    this.minRounds = options.minRounds || 20;
  }

  recordRound(newStatesFound) {
    this.statesPerRound.push(newStatesFound);
  }

  hasConverged() {
    if (this.statesPerRound.length < this.minRounds) return false;

    // Check if last N rounds found 0 new states
    const recent = this.statesPerRound.slice(-this.convergenceThreshold);
    return recent.every(count => count === 0);
  }

  getConvergenceStats() {
    const total = this.statesPerRound.reduce((a, b) => a + b, 0);
    const rounds = this.statesPerRound.length;

    return {
      totalStatesFound: total,
      totalRounds: rounds,
      converged: this.hasConverged(),
      roundsSinceNewState: this.getRoundsSinceNewState(),
      convergenceRate: this.getConvergenceRate()
    };
  }

  getRoundsSinceNewState() {
    for (let i = this.statesPerRound.length - 1; i >= 0; i--) {
      if (this.statesPerRound[i] > 0) {
        return this.statesPerRound.length - 1 - i;
      }
    }
    return this.statesPerRound.length;
  }

  getConvergenceRate() {
    // Calculate rate of new state discovery over time
    // Should approach 0 as we converge
    if (this.statesPerRound.length < 5) return null;

    const recent = this.statesPerRound.slice(-5);
    const earlier = this.statesPerRound.slice(-10, -5);

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.length ?
      earlier.reduce((a, b) => a + b, 0) / earlier.length : recentAvg;

    return earlierAvg > 0 ? recentAvg / earlierAvg : 0;
  }
}
```

### 6. Combined Coverage Report

```javascript
class CompleteCoverageReport {
  constructor(page) {
    this.page = page;
    this.elementTracker = new ElementCoverageTracker();
    this.listenerTracker = new ListenerCoverageTracker();
    this.selectorTracker = new CSSSelectorCoverageTracker();
    this.routeTracker = new RouteCoverageTracker();
    this.convergence = new ConvergenceDetector();
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      coverage: {},
      gaps: [],
      confidence: 0
    };

    // Element coverage
    const elementCoverage = this.elementTracker.getCoverage();
    report.coverage.elements = elementCoverage;
    if (elementCoverage.missing.length > 0) {
      report.gaps.push({
        type: 'elements',
        count: elementCoverage.missing.length,
        items: elementCoverage.missing.slice(0, 10) // First 10
      });
    }

    // Listener coverage
    const listenerCoverage = await this.listenerTracker.getCoverage(this.page);
    report.coverage.listeners = listenerCoverage;
    if (listenerCoverage.unfired.length > 0) {
      report.gaps.push({
        type: 'listeners',
        count: listenerCoverage.unfired.length,
        items: listenerCoverage.unfired.slice(0, 10)
      });
    }

    // Route coverage
    const routeCoverage = await this.routeTracker.getCoverage(this.page);
    report.coverage.routes = routeCoverage;
    if (routeCoverage.unvisited.length > 0) {
      report.gaps.push({
        type: 'routes',
        count: routeCoverage.unvisited.length,
        items: routeCoverage.unvisited
      });
    }

    // Convergence
    report.coverage.convergence = this.convergence.getConvergenceStats();

    // Calculate overall confidence
    const scores = [
      parseFloat(elementCoverage.percentage) || 0,
      parseFloat(listenerCoverage.percentage) || 0,
      parseFloat(routeCoverage.percentage) || 0,
      report.coverage.convergence.converged ? 100 : 50
    ];
    report.confidence = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);

    // Determine completeness
    report.isComplete = report.gaps.length === 0 &&
                        report.coverage.convergence.converged;

    return report;
  }

  printReport(report) {
    console.log('\n' + '='.repeat(60));
    console.log('COVERAGE VERIFICATION REPORT');
    console.log('='.repeat(60));

    console.log(`\nElement Coverage:  ${report.coverage.elements.percentage}%`);
    console.log(`Listener Coverage: ${report.coverage.listeners.percentage}%`);
    console.log(`Route Coverage:    ${report.coverage.routes.percentage}%`);
    console.log(`State Converged:   ${report.coverage.convergence.converged ? 'YES' : 'NO'}`);

    console.log(`\nOverall Confidence: ${report.confidence}%`);
    console.log(`Exploration Complete: ${report.isComplete ? 'YES ✓' : 'NO - GAPS FOUND'}`);

    if (report.gaps.length > 0) {
      console.log('\n⚠️  GAPS DETECTED:');
      report.gaps.forEach(gap => {
        console.log(`   - ${gap.count} ${gap.type} not covered`);
      });
    }

    console.log('='.repeat(60) + '\n');
  }
}
```

### The Complete Exploration Algorithm

```javascript
async function exhaustiveExploration(page, url) {
  // 1. Setup coverage tracking
  await page.addInitScript(ListenerCoverageTracker.getInjectionScript());
  await page.addInitScript(RouteCoverageTracker.getInjectionScript());

  // 2. Navigate
  await page.goto(url);
  await page.waitForLoadState('networkidle');

  // 3. Static analysis FIRST
  const coverageReport = new CompleteCoverageReport(page);
  await coverageReport.elementTracker.staticAnalysis(page);
  const cssSelectors = await coverageReport.selectorTracker.staticAnalysis(page);

  // 4. Create explorer
  const explorer = new ExhaustiveStateExplorer(page);

  // 5. Explore with convergence detection
  let round = 0;
  while (true) {
    round++;
    console.log(`\n--- Exploration Round ${round} ---`);

    const beforeStates = explorer.visited.size;

    // Explore one round (try all actions from current states)
    await explorer.exploreOneRound();

    const newStates = explorer.visited.size - beforeStates;
    coverageReport.convergence.recordRound(newStates);

    console.log(`New states found: ${newStates}`);
    console.log(`Total states: ${explorer.visited.size}`);

    // Check coverage
    const report = await coverageReport.generateReport();

    // Stop conditions
    if (report.isComplete) {
      console.log('\n✓ EXPLORATION COMPLETE - Full coverage achieved');
      break;
    }

    if (coverageReport.convergence.hasConverged() && report.gaps.length === 0) {
      console.log('\n✓ EXPLORATION COMPLETE - Converged with no gaps');
      break;
    }

    if (round > 100) {
      console.log('\n⚠ MAX ROUNDS REACHED - May have gaps');
      break;
    }

    // If we have gaps, specifically target them
    if (report.gaps.length > 0) {
      console.log(`\nTargeting ${report.gaps.length} coverage gaps...`);
      await targetGaps(page, explorer, report.gaps);
    }
  }

  // 6. Final report
  const finalReport = await coverageReport.generateReport();
  coverageReport.printReport(finalReport);

  return {
    states: explorer.visited,
    transitions: explorer.transitions,
    coverage: finalReport
  };
}

// Specifically target unexplored areas
async function targetGaps(page, explorer, gaps) {
  for (const gap of gaps) {
    if (gap.type === 'elements') {
      // Try to interact with missing elements
      for (const el of gap.items) {
        try {
          await explorer.performAction({ type: 'click', selector: el.selector });
        } catch(e) {}
      }
    }

    if (gap.type === 'routes') {
      // Navigate to unvisited routes
      for (const route of gap.items) {
        try {
          await page.goto(new URL(route, page.url()).href);
          await page.waitForLoadState('networkidle');
          await explorer.exploreCurrentState();
        } catch(e) {}
      }
    }

    if (gap.type === 'listeners') {
      // Try to trigger unfired listeners
      for (const listener of gap.items) {
        try {
          if (listener.type === 'click') {
            await page.click(listener.selector);
          } else if (listener.type === 'mouseover' || listener.type === 'mouseenter') {
            await page.hover(listener.selector);
          } else if (listener.type === 'focus') {
            await page.focus(listener.selector);
          } else if (listener.type === 'keydown' || listener.type === 'keyup') {
            await page.focus(listener.selector);
            await page.keyboard.press('Enter');
          }
        } catch(e) {}
      }
    }
  }
}
```

### Coverage Completeness Checklist

Before declaring extraction complete, verify:

| Check | Method | Target |
|-------|--------|--------|
| All elements interacted | Element coverage tracker | 100% of interactive |
| All listeners fired | Listener coverage tracker | 100% |
| All CSS selectors matched | Selector coverage tracker | 100% |
| All routes visited | Route coverage tracker | 100% |
| All :hover styles captured | Hover each hoverable | 100% |
| All :focus styles captured | Focus each focusable | 100% |
| All :active styles captured | Click each clickable | 100% |
| State exploration converged | Convergence detector | 10+ rounds, 0 new |
| No coverage gaps | Gap analysis | 0 gaps |

### Output: Completeness Certificate

```json
{
  "extractionId": "abc123",
  "url": "https://example.com",
  "timestamp": "2024-01-08T12:00:00Z",
  "completeness": {
    "isComplete": true,
    "confidence": 98.5,
    "coverage": {
      "elements": { "total": 150, "covered": 150, "percentage": "100.0" },
      "listeners": { "total": 87, "fired": 87, "percentage": "100.0" },
      "routes": { "total": 12, "visited": 12, "percentage": "100.0" },
      "states": { "total": 234, "converged": true, "roundsToConverge": 45 }
    },
    "gaps": [],
    "verification": {
      "allInteractiveElementsTested": true,
      "allEventListenersFired": true,
      "allRoutesVisited": true,
      "stateSpaceConverged": true
    }
  }
}
```

---

## What CANNOT Be Extracted (Fundamental Limitations)

Some behaviors are **impossible** to perfectly clone:

### Server-Dependent
| Limitation | Why |
|------------|-----|
| Server-side logic | Business logic runs on server, we only see responses |
| Database queries | We can mock responses but not replicate DB |
| Authentication | Can't clone real auth, only UI |
| Rate limiting | Server-enforced limits |
| Session state | Server-managed sessions |

### Third-Party Services
| Limitation | Why |
|------------|-----|
| Payment processing | Stripe/PayPal are real services |
| Auth providers | OAuth/SSO with real identity |
| Analytics | Data goes to real services |
| Maps | Google Maps API requires key |
| CDN content | May be geo-restricted or auth-required |

### Non-Deterministic
| Limitation | Why |
|------------|-----|
| True randomness | crypto.getRandomValues is random |
| Race conditions | Timing-dependent behavior |
| Network timing | Latency varies |
| A/B tests | Server decides variant |
| Personalization | User-specific content |

### Real-Time
| Limitation | Why |
|------------|-----|
| Live WebSocket data | Real-time server push |
| Server-Sent Events | Continuous updates |
| WebRTC calls | Real peer connections |
| Live video/audio | Streaming from servers |
| Stock tickers/prices | Real-time external data |

### Environmental
| Limitation | Why |
|------------|-----|
| Geolocation | Real GPS coordinates |
| Device sensors | Real accelerometer/gyro data |
| Camera/microphone | Real media streams |
| Current time | Date.now() changes |
| Timezone | User's actual timezone |

### Hardware-Specific
| Limitation | Why |
|------------|-----|
| GPU rendering | Different GPUs render differently |
| Font rendering | OS-specific font smoothing |
| Subpixel rendering | Display-specific |
| Color profiles | Monitor calibration |
| Touch vs mouse | Different input precision |

### Browser-Specific
| Limitation | Why |
|------------|-----|
| Browser bugs | Behavior from bugs can't be intentionally replicated |
| Vendor prefixes | Browser-specific features |
| Extension effects | User extensions modify pages |
| Privacy settings | Cookie/tracking blocks |

### Legal/Ethical
| Limitation | Why |
|------------|-----|
| DRM content | Encrypted media |
| Copyrighted assets | Can't legally copy |
| Private user data | Should not be extracted |
| API keys/secrets | Should not be exposed |

### Workarounds

| Limitation | Workaround |
|------------|------------|
| Server responses | Record and mock with MSW or similar |
| Real-time data | Capture sample data, replay |
| Auth | Mock auth UI with fake user |
| Payments | Mock payment UI with success flow |
| Time-dependent | Fix time with fake timers |
| Geolocation | Mock with fixed coordinates |
| Randomness | Seed PRNG for determinism |

---

## Extraction Categories

### Category A: Passive Recording (Intercept Before Page Load)
Scripts injected via `page.addInitScript()` that intercept operations as they happen.

| Extractor | Status | Captures | Injection Point |
|-----------|--------|----------|-----------------|
| `webgl-extractor.js` | ✅ Done | Shaders, uniforms, buffers, textures, draw calls | Pre-nav |
| `canvas-2d-extractor.js` | 🔴 TODO | fillRect, drawImage, paths, transforms, compositing | Pre-nav |
| `css-animation-extractor.js` | ✅ Done | @keyframes, animation properties | Pre-nav |
| `css-transition-extractor.js` | ✅ Done | Transition events, before/after values | Pre-nav |
| `css-variables-extractor.js` | ✅ Done | Custom CSS properties | Post-load |
| `svg-extractor.js` | ✅ Done | SVG path/attribute mutations | Pre-nav |
| `scroll-intersection-extractor.js` | ✅ Done | Scroll-linked effects, intersection callbacks | Pre-nav |
| `animation-libs-extractor.js` | ✅ Done | GSAP, anime.js, Framer Motion, Lottie | Pre-nav |
| `event-listener-extractor.js` | 🔴 TODO | All addEventListener calls, handler source | Pre-nav |
| `network-recorder.js` | 🔴 TODO | fetch, XHR, WebSocket, SSE calls | Pre-nav |
| `storage-extractor.js` | 🔴 TODO | localStorage, sessionStorage, IndexedDB, cookies | Pre-nav |
| `history-extractor.js` | 🔴 TODO | pushState, replaceState, navigation | Pre-nav |
| `observer-extractor.js` | 🔴 TODO | Intersection/Resize/Mutation Observer usage | Pre-nav |
| `timer-extractor.js` | 🔴 TODO | setTimeout, setInterval, requestAnimationFrame | Pre-nav |
| `react-state-extractor.js` | 🔴 TODO | React state, props, hooks, context | Pre-nav |
| `clipboard-extractor.js` | 🔴 TODO | Copy/paste handlers and data | Pre-nav |

### Category B: Active Probing (Systematic Interaction)
Scripts that interact with elements to capture all possible states.

| Extractor | Status | Captures | Method |
|-----------|--------|----------|--------|
| `multi-state-style-extractor.js` | 🔴 TODO | :hover, :focus, :active, .selected styles | Hover/focus/click each element |
| `behavioral-recorder.js` | 🔴 TODO | DOM/style diffs per interaction | Click, record before/after |
| `keyboard-behavior-extractor.js` | 🔴 TODO | Keyboard shortcuts, key handlers | Press each key combo |
| `form-behavior-extractor.js` | 🔴 TODO | Validation, submission, error states | Fill/submit forms |
| `modal-extractor.js` | 🔴 TODO | Modal triggers, content, close behavior | Open each modal |
| `dropdown-extractor.js` | 🔴 TODO | Menu triggers, items, keyboard nav | Open each dropdown |
| `tooltip-extractor.js` | 🔴 TODO | Trigger, content, positioning, delay | Hover each tooltip trigger |
| `tab-panel-extractor.js` | 🔴 TODO | Tab switching, panel content, keyboard | Click each tab |
| `accordion-extractor.js` | 🔴 TODO | Expand/collapse, animation | Toggle each section |
| `carousel-extractor.js` | 🔴 TODO | Slides, nav, autoplay, indicators | Navigate carousel |
| `drag-drop-extractor.js` | 🔴 TODO | Draggables, droppables, feedback | Perform drag operations |
| `context-menu-extractor.js` | 🔴 TODO | Right-click menu content | Right-click elements |
| `responsive-extractor.js` | 🔴 TODO | Styles at each breakpoint | Resize viewport |

### Category C: Static Analysis (Post-Load Extraction)
One-time extraction after page is fully loaded.

| Extractor | Status | Captures | Method |
|-----------|--------|----------|--------|
| `dom-extractor.js` | ✅ Done | Full DOM tree, attributes, computed styles | page.evaluate |
| `stylesheet-extractor.js` | 🔴 TODO | All CSS rules including pseudo-selectors | document.styleSheets |
| `pseudo-element-extractor.js` | 🔴 TODO | ::before, ::after, ::placeholder content/styles | getComputedStyle(el, '::before') |
| `font-extractor.js` | 🔴 TODO | @font-face rules, font file URLs | document.fonts, styleSheets |
| `image-extractor.js` | 🔴 TODO | All image URLs (img, bg, srcset, picture) | DOM scan + computed styles |
| `icon-extractor.js` | 🔴 TODO | Icon fonts, SVG icons, image sprites | DOM scan + font analysis |
| `gradient-extractor.js` | 🔴 TODO | All gradient definitions | Computed style parsing |
| `shadow-extractor.js` | 🔴 TODO | box-shadow, text-shadow, filter shadows | Computed styles |
| `z-index-extractor.js` | 🔴 TODO | Stacking context, z-index values | DOM traversal |
| `media-query-extractor.js` | 🔴 TODO | All @media rules with full styles | styleSheets parsing |
| `container-query-extractor.js` | 🔴 TODO | @container rules | styleSheets parsing |
| `accessibility-extractor.js` | 🔴 TODO | ARIA attributes, roles, tab order | DOM scan |
| `seo-extractor.js` | 🔴 TODO | meta tags, structured data, OG tags | head parsing |

### Category D: Asset Collection
Download and bundle external resources.

| Extractor | Status | Captures | Method |
|-----------|--------|----------|--------|
| `font-file-collector.js` | 🔴 TODO | woff2, woff, ttf, otf files | Download from URLs |
| `image-collector.js` | 🔴 TODO | jpg, png, webp, avif, svg files | Download from URLs |
| `video-collector.js` | 🔴 TODO | mp4, webm files | Download from URLs |
| `audio-collector.js` | 🔴 TODO | mp3, wav, ogg files | Download from URLs |
| `script-collector.js` | 🔴 TODO | External JS files | Download from URLs |
| `style-collector.js` | 🔴 TODO | External CSS files | Download from URLs |

### Category E: Design System Extraction (from V3)
Extract reusable design patterns and tokens.

| Extractor | Status | Captures | Method |
|-----------|--------|----------|--------|
| `design-token-extractor.js` | ✅ Done (V3) | Colors, typography, spacing, shadows, border-radius | CSS variable analysis |
| `color-palette-extractor.js` | 🔴 TODO | Primary, accent, neutral, semantic colors | Color analysis + naming |
| `typography-scale-extractor.js` | 🔴 TODO | Font sizes, weights, line heights, families | CSS font prop analysis |
| `spacing-scale-extractor.js` | 🔴 TODO | Margin/padding values, gap values | CSS spacing analysis |
| `component-pattern-extractor.js` | 🔴 TODO | Button, card, input, nav patterns | DOM structure analysis |
| `hover-state-capture.js` | ✅ Done (V3) | :hover style differences | Compare default vs hover |

### Category F: Shader & Graphics Pipeline (from V3)
Extract and optimize WebGL/Canvas graphics.

| Extractor | Status | Captures | Method |
|-----------|--------|----------|--------|
| `shader-pair-extractor.js` | ✅ Done (V3) | Vertex + fragment shader pairs | WebGL interception |
| `uniform-value-extractor.js` | ✅ Done (V3) | Uniform names and values | getUniformLocation hook |
| `shader-fusion-optimizer.js` | ✅ Done (V3) | Multi-pass → single-pass optimization | AST analysis |
| `unicorn-interpreter.js` | ✅ Done (V3) | UnicornStudio JSON → WebGL | Custom interpreter |
| `three-js-extractor.js` | 🔴 TODO | Three.js scene, materials, geometries | THREE namespace hook |
| `pixi-extractor.js` | 🔴 TODO | PixiJS sprite, filters, containers | PIXI namespace hook |
| `lottie-extractor.js` | 🔴 TODO | Lottie animation JSON, playback state | lottie-web hook |

### Category G: Template Generation (from V3)
Generate reusable templates from extraction.

| Generator | Status | Output | Input |
|-----------|--------|--------|-------|
| `template-generator.js` | ✅ Done (V3) | template.json, template.css, template.js | Extracted data |
| `component-generator.js` | 🔴 TODO | React/Vue/Svelte components | DOM + behavior data |
| `storybook-generator.js` | 🔴 TODO | Storybook stories for components | Component patterns |
| `figma-generator.js` | 🔴 TODO | Figma plugin JSON | Design tokens + layout |

---

## Script Injection Architecture

### Injection Timing

```
┌─────────────────────────────────────────────────────────────────┐
│                     INJECTION TIMELINE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  page.addInitScript()     page.goto()      page.waitForLoad()  │
│         │                     │                   │             │
│         ▼                     ▼                   ▼             │
│  ┌──────────────┐      ┌──────────────┐    ┌──────────────┐    │
│  │  BEFORE DOM  │      │  DOM READY   │    │  FULLY LOADED│    │
│  │              │      │              │    │              │    │
│  │ • Prototype  │      │ • DOM tree   │    │ • All assets │    │
│  │   patches    │      │   analysis   │    │   loaded     │    │
│  │ • Event      │      │ • Initial    │    │ • Animations │    │
│  │   intercepts │      │   styles     │    │   started    │    │
│  │ • WebGL hook │      │              │    │              │    │
│  └──────────────┘      └──────────────┘    └──────────────┘    │
│                                                                 │
│  ════════════════════════════════════════════════════════════  │
│                                                                 │
│                     ACTIVE PROBING PHASE                        │
│                            │                                    │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  For each interactive element:                            │  │
│  │    1. Capture default state                               │  │
│  │    2. Hover → capture hover state                         │  │
│  │    3. Focus → capture focus state                         │  │
│  │    4. Click → capture result + DOM diff                   │  │
│  │    5. Reset to default state                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Injection Script Categories

#### 1. Pre-Navigation Injections (page.addInitScript)
Must be injected BEFORE page loads to intercept from the start.

```javascript
// These MUST run before any page JS executes
await page.addInitScript(getCombinedInjectionScript());
```

**Scripts:**
- `webgl-extractor.js` - Intercept WebGL context creation
- `event-listener-extractor.js` - Intercept addEventListener
- `react-state-extractor.js` - Hook React before it initializes
- `animation-libs-extractor.js` - Intercept GSAP/anime.js
- `network-recorder.js` - Intercept fetch/XMLHttpRequest

#### 2. Post-Load Injections (page.evaluate)
Run after DOM is ready to analyze existing state.

```javascript
// Run after page.waitForLoadState('networkidle')
await page.evaluate(postLoadExtractionScript);
```

**Scripts:**
- `dom-extractor.js` - Capture full DOM tree
- `stylesheet-extractor.js` - Extract all CSS rules
- `css-variables-extractor.js` - Capture CSS custom properties
- `font-extractor.js` - Extract font definitions
- `asset-extractor.js` - Inventory all assets

#### 3. Active Probing Scripts (orchestrated by Node.js)
Systematically interact with elements.

```javascript
// Controlled from Node.js, not just injected
for (const element of interactiveElements) {
  await captureAllStates(page, element);
  await recordClickBehavior(page, element);
}
```

**Scripts:**
- `multi-state-style-extractor.js` - Probe hover/focus/active states
- `behavioral-recorder.js` - Record DOM diffs per interaction

---

## Existing Extractor Implementations (Reference)

### webgl-extractor.js (COMPLETE)

**Location:** `tools/pipeline/extractors/webgl-extractor.js`

**Purpose:** Captures ALL WebGL operations by intercepting prototype methods before page loads.

**Injection Script:**
```javascript
(function() {
  if (window.__webglExtractorInstalled) return;
  window.__webglExtractorInstalled = true;

  window.__webglCaptured = {
    shaders: [],
    programs: [],
    uniforms: [],
    buffers: [],
    textures: [],
    drawCalls: [],
    stateChanges: [],
    framebuffers: [],
    renderbuffers: [],
  };

  const capturedPrograms = new WeakMap();
  const capturedShaders = new WeakMap();
  const capturedBuffers = new WeakMap();
  const capturedTextures = new WeakMap();
  let programCounter = 0;
  let shaderCounter = 0;
  let bufferCounter = 0;
  let textureCounter = 0;

  function wrapWebGLContext(gl, contextType) {
    if (gl.__captured) return gl;
    gl.__captured = true;
    gl.__contextType = contextType;

    // ============================================
    // SHADER CAPTURE
    // ============================================

    const originalCreateShader = gl.createShader.bind(gl);
    gl.createShader = function(type) {
      const shader = originalCreateShader(type);
      const id = shaderCounter++;
      capturedShaders.set(shader, { id, type, source: null });
      return shader;
    };

    const originalShaderSource = gl.shaderSource.bind(gl);
    gl.shaderSource = function(shader, source) {
      const meta = capturedShaders.get(shader);
      if (meta) {
        meta.source = source;
        window.__webglCaptured.shaders.push({
          id: meta.id,
          type: meta.type === gl.VERTEX_SHADER ? 'vertex' : 'fragment',
          source: source,
          timestamp: Date.now(),
        });
      }
      return originalShaderSource(shader, source);
    };

    // ============================================
    // PROGRAM CAPTURE
    // ============================================

    const originalCreateProgram = gl.createProgram.bind(gl);
    gl.createProgram = function() {
      const program = originalCreateProgram();
      const id = programCounter++;
      capturedPrograms.set(program, { id, shaders: [], linked: false });
      return program;
    };

    const originalAttachShader = gl.attachShader.bind(gl);
    gl.attachShader = function(program, shader) {
      const progMeta = capturedPrograms.get(program);
      const shaderMeta = capturedShaders.get(shader);
      if (progMeta && shaderMeta) {
        progMeta.shaders.push(shaderMeta.id);
      }
      return originalAttachShader(program, shader);
    };

    const originalLinkProgram = gl.linkProgram.bind(gl);
    gl.linkProgram = function(program) {
      const result = originalLinkProgram(program);
      const progMeta = capturedPrograms.get(program);
      if (progMeta) {
        progMeta.linked = true;
        window.__webglCaptured.programs.push({
          id: progMeta.id,
          shaders: progMeta.shaders,
          timestamp: Date.now(),
        });
      }
      return result;
    };

    // ============================================
    // UNIFORM CAPTURE
    // ============================================

    const uniformLocations = new WeakMap();

    const originalGetUniformLocation = gl.getUniformLocation.bind(gl);
    gl.getUniformLocation = function(program, name) {
      const loc = originalGetUniformLocation(program, name);
      if (loc) {
        uniformLocations.set(loc, { program: capturedPrograms.get(program)?.id, name });
      }
      return loc;
    };

    // Wrap all uniform setters
    const uniformSetters = [
      'uniform1f', 'uniform2f', 'uniform3f', 'uniform4f',
      'uniform1i', 'uniform2i', 'uniform3i', 'uniform4i',
      'uniform1fv', 'uniform2fv', 'uniform3fv', 'uniform4fv',
      'uniform1iv', 'uniform2iv', 'uniform3iv', 'uniform4iv',
      'uniformMatrix2fv', 'uniformMatrix3fv', 'uniformMatrix4fv',
    ];

    uniformSetters.forEach(setter => {
      if (gl[setter]) {
        const original = gl[setter].bind(gl);
        gl[setter] = function(location, ...args) {
          const locMeta = uniformLocations.get(location);
          if (locMeta) {
            window.__webglCaptured.uniforms.push({
              program: locMeta.program,
              name: locMeta.name,
              setter: setter,
              values: args.map(a => a instanceof Float32Array || a instanceof Int32Array ? Array.from(a) : a),
              timestamp: Date.now(),
            });
          }
          return original(location, ...args);
        };
      }
    });

    // ============================================
    // BUFFER CAPTURE
    // ============================================

    const originalCreateBuffer = gl.createBuffer.bind(gl);
    gl.createBuffer = function() {
      const buffer = originalCreateBuffer();
      const id = bufferCounter++;
      capturedBuffers.set(buffer, { id, data: null, target: null });
      return buffer;
    };

    const originalBindBuffer = gl.bindBuffer.bind(gl);
    gl.bindBuffer = function(target, buffer) {
      if (buffer) {
        const meta = capturedBuffers.get(buffer);
        if (meta) meta.target = target;
      }
      return originalBindBuffer(target, buffer);
    };

    const originalBufferData = gl.bufferData.bind(gl);
    gl.bufferData = function(target, data, usage) {
      const boundBuffer = gl.getParameter(
        target === gl.ARRAY_BUFFER ? gl.ARRAY_BUFFER_BINDING : gl.ELEMENT_ARRAY_BUFFER_BINDING
      );
      const meta = boundBuffer ? capturedBuffers.get(boundBuffer) : null;

      let capturedData = null;
      if (data instanceof ArrayBuffer) {
        capturedData = { type: 'ArrayBuffer', data: Array.from(new Float32Array(data)) };
      } else if (ArrayBuffer.isView(data)) {
        capturedData = { type: data.constructor.name, data: Array.from(data) };
      } else if (typeof data === 'number') {
        capturedData = { type: 'size', size: data };
      }

      window.__webglCaptured.buffers.push({
        id: meta?.id,
        target: target === gl.ARRAY_BUFFER ? 'ARRAY_BUFFER' : 'ELEMENT_ARRAY_BUFFER',
        usage: usage,
        data: capturedData,
        timestamp: Date.now(),
      });

      return originalBufferData(target, data, usage);
    };

    // ============================================
    // TEXTURE CAPTURE
    // ============================================

    const originalCreateTexture = gl.createTexture.bind(gl);
    gl.createTexture = function() {
      const texture = originalCreateTexture();
      const id = textureCounter++;
      capturedTextures.set(texture, { id });
      return texture;
    };

    const originalTexImage2D = gl.texImage2D.bind(gl);
    gl.texImage2D = function(...args) {
      const boundTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
      const meta = boundTexture ? capturedTextures.get(boundTexture) : null;

      let textureData = null;
      const lastArg = args[args.length - 1];
      if (lastArg instanceof HTMLImageElement) {
        textureData = { type: 'image', src: lastArg.src };
      } else if (lastArg instanceof HTMLCanvasElement) {
        textureData = { type: 'canvas', dataUrl: lastArg.toDataURL() };
      } else if (lastArg instanceof ImageData) {
        textureData = { type: 'imageData', width: lastArg.width, height: lastArg.height };
      }

      window.__webglCaptured.textures.push({
        id: meta?.id,
        args: args.slice(0, -1).map(a => typeof a === 'number' ? a : String(a)),
        data: textureData,
        timestamp: Date.now(),
      });

      return originalTexImage2D.apply(gl, args);
    };

    // ============================================
    // DRAW CALL CAPTURE
    // ============================================

    const originalDrawArrays = gl.drawArrays.bind(gl);
    gl.drawArrays = function(mode, first, count) {
      window.__webglCaptured.drawCalls.push({
        type: 'drawArrays',
        mode, first, count,
        timestamp: Date.now(),
      });
      return originalDrawArrays(mode, first, count);
    };

    const originalDrawElements = gl.drawElements.bind(gl);
    gl.drawElements = function(mode, count, type, offset) {
      window.__webglCaptured.drawCalls.push({
        type: 'drawElements',
        mode, count, type, offset,
        timestamp: Date.now(),
      });
      return originalDrawElements(mode, count, type, offset);
    };

    // ============================================
    // STATE CAPTURE
    // ============================================

    const stateSetters = [
      'enable', 'disable', 'blendFunc', 'blendFuncSeparate',
      'depthFunc', 'depthMask', 'cullFace', 'frontFace',
      'viewport', 'scissor', 'clearColor', 'clearDepth',
      'lineWidth', 'polygonOffset',
    ];

    stateSetters.forEach(fn => {
      if (gl[fn]) {
        const original = gl[fn].bind(gl);
        gl[fn] = function(...args) {
          window.__webglCaptured.stateChanges.push({
            type: fn,
            args: args,
            timestamp: Date.now(),
          });
          return original(...args);
        };
      }
    });

    return gl;
  }

  // Hook getContext to intercept WebGL context creation
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, options) {
    const ctx = originalGetContext.apply(this, arguments);
    if ((type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') && ctx) {
      wrapWebGLContext(ctx, type === 'webgl2' ? 'webgl2' : 'webgl');
    }
    return ctx;
  };

  console.log('[WebGL Extractor] Installed');
})();
```

**Output Schema:**
```json
{
  "shaders": [
    { "id": 0, "type": "vertex", "source": "attribute vec4 a_position;...", "timestamp": 1704728400000 },
    { "id": 1, "type": "fragment", "source": "precision mediump float;...", "timestamp": 1704728400001 }
  ],
  "programs": [
    { "id": 0, "shaders": [0, 1], "timestamp": 1704728400002 }
  ],
  "uniforms": [
    { "program": 0, "name": "u_resolution", "setter": "uniform2f", "values": [1920, 1080], "timestamp": 1704728400003 }
  ],
  "buffers": [
    { "id": 0, "target": "ARRAY_BUFFER", "usage": 35044, "data": { "type": "Float32Array", "data": [...] }, "timestamp": 1704728400004 }
  ],
  "textures": [
    { "id": 0, "args": [...], "data": { "type": "image", "src": "..." }, "timestamp": 1704728400005 }
  ],
  "drawCalls": [
    { "type": "drawArrays", "mode": 4, "first": 0, "count": 6, "timestamp": 1704728400006 }
  ],
  "stateChanges": [
    { "type": "enable", "args": [3042], "timestamp": 1704728400007 },
    { "type": "blendFunc", "args": [770, 771], "timestamp": 1704728400008 }
  ]
}
```

**Key Technique:** Intercept `HTMLCanvasElement.prototype.getContext` BEFORE page loads, then wrap all WebGL methods to record operations.

---

## New Extractor Specifications

### 1. event-listener-extractor.js

**Purpose:** Capture all event listeners attached to elements.

**Injection Timing:** Pre-navigation (addInitScript)

**Implementation:**
```javascript
export const eventListenerExtractor = {
  name: 'event-listener',

  getInjectionScript() {
    return `
(function() {
  if (window.__eventListenerExtractorInstalled) return;
  window.__eventListenerExtractorInstalled = true;

  window.__eventListenersCaptured = {
    listeners: [],
    elements: new WeakMap(),
  };

  const listenerRegistry = [];

  // Intercept addEventListener
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    const target = this;

    // Get selector if it's a DOM element
    let selector = null;
    if (target instanceof Element) {
      selector = getUniqueSelector(target);
    } else if (target === window) {
      selector = 'window';
    } else if (target === document) {
      selector = 'document';
    }

    // Capture listener info
    const listenerInfo = {
      selector,
      type,
      listenerSource: listener.toString().slice(0, 500), // First 500 chars
      listenerName: listener.name || 'anonymous',
      options: typeof options === 'object' ? options : { capture: !!options },
      timestamp: Date.now(),
      stackTrace: new Error().stack,
    };

    listenerRegistry.push(listenerInfo);

    // Track per-element
    if (target instanceof Element) {
      let elementListeners = window.__eventListenersCaptured.elements.get(target);
      if (!elementListeners) {
        elementListeners = [];
        window.__eventListenersCaptured.elements.set(target, elementListeners);
      }
      elementListeners.push(listenerInfo);
    }

    return originalAddEventListener.call(this, type, listener, options);
  };

  // Intercept removeEventListener
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.removeEventListener = function(type, listener, options) {
    // Mark as removed in registry
    // ... implementation
    return originalRemoveEventListener.call(this, type, listener, options);
  };

  // Capture inline event handlers (onclick, onmouseover, etc.)
  const originalSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    if (name.startsWith('on')) {
      const eventType = name.slice(2);
      listenerRegistry.push({
        selector: getUniqueSelector(this),
        type: eventType,
        listenerSource: value,
        listenerName: 'inline-' + name,
        options: {},
        timestamp: Date.now(),
        inline: true,
      });
    }
    return originalSetAttribute.call(this, name, value);
  };

  // Snapshot function
  window.__captureEventListeners = function() {
    window.__eventListenersCaptured.listeners = listenerRegistry;
    return window.__eventListenersCaptured;
  };

  function getUniqueSelector(el) {
    // ... same as other extractors
  }

  console.log('[Event Listener Extractor] Installed');
})();
`;
  },

  async extractData(page) {
    return await page.evaluate(() => {
      if (window.__captureEventListeners) {
        return window.__captureEventListeners();
      }
      return { listeners: [] };
    });
  },

  generateReplayCode(data) {
    // Generate addEventListener calls from captured data
  }
};
```

**Output Schema:**
```json
{
  "listeners": [
    {
      "selector": "button.tool-rectangle",
      "type": "click",
      "listenerSource": "function() { setSelectedTool('rectangle'); }",
      "listenerName": "anonymous",
      "options": { "capture": false },
      "timestamp": 1704728400000,
      "stackTrace": "Error\n    at addEventListener..."
    }
  ]
}
```

---

### 2. multi-state-style-extractor.js

**Purpose:** Capture element styles in ALL visual states (default, hover, focus, active, selected, disabled).

**Injection Timing:** Post-load, with active probing from Node.js

**Implementation:**
```javascript
export const multiStateStyleExtractor = {
  name: 'multi-state-style',

  getInjectionScript() {
    return `
(function() {
  if (window.__multiStateStyleExtractorInstalled) return;
  window.__multiStateStyleExtractorInstalled = true;

  window.__multiStateStylesCaptured = {
    elements: {},
  };

  // Properties to capture for each state
  const STYLE_PROPERTIES = [
    'backgroundColor', 'color', 'borderColor', 'borderWidth', 'borderStyle',
    'boxShadow', 'opacity', 'transform', 'filter',
    'outline', 'outlineColor', 'outlineWidth', 'outlineOffset',
    'textDecoration', 'fontWeight',
    'cursor', 'pointerEvents',
    'width', 'height', 'padding', 'margin',
  ];

  function captureStyles(el) {
    const computed = getComputedStyle(el);
    const styles = {};
    STYLE_PROPERTIES.forEach(prop => {
      styles[prop] = computed[prop];
    });
    return styles;
  }

  // Called from Node.js to capture element in current state
  window.__captureElementState = function(selector, stateName) {
    const el = document.querySelector(selector);
    if (!el) return null;

    if (!window.__multiStateStylesCaptured.elements[selector]) {
      window.__multiStateStylesCaptured.elements[selector] = { states: {} };
    }

    window.__multiStateStylesCaptured.elements[selector].states[stateName] = captureStyles(el);
    return window.__multiStateStylesCaptured.elements[selector].states[stateName];
  };

  // Diff two states to find what actually changes
  window.__diffStates = function(state1, state2) {
    const diff = {};
    for (const prop of STYLE_PROPERTIES) {
      if (state1[prop] !== state2[prop]) {
        diff[prop] = { from: state1[prop], to: state2[prop] };
      }
    }
    return diff;
  };

  console.log('[Multi-State Style Extractor] Installed');
})();
`;
  },

  // This extractor requires active probing from Node.js
  async probeElement(page, selector) {
    const states = {};

    // 1. Default state
    states.default = await page.evaluate(
      (sel) => window.__captureElementState(sel, 'default'),
      selector
    );

    // 2. Hover state
    await page.hover(selector);
    await page.waitForTimeout(150); // Allow transitions
    states.hover = await page.evaluate(
      (sel) => window.__captureElementState(sel, 'hover'),
      selector
    );

    // 3. Focus state
    await page.focus(selector);
    await page.waitForTimeout(50);
    states.focus = await page.evaluate(
      (sel) => window.__captureElementState(sel, 'focus'),
      selector
    );

    // 4. Active state (mouse down)
    await page.mouse.down();
    await page.waitForTimeout(50);
    states.active = await page.evaluate(
      (sel) => window.__captureElementState(sel, 'active'),
      selector
    );
    await page.mouse.up();

    // 5. Selected state (if clicking toggles selection)
    // Capture after click
    states.selected = await page.evaluate(
      (sel) => window.__captureElementState(sel, 'selected'),
      selector
    );

    // Move mouse away to reset hover
    await page.mouse.move(0, 0);

    // Compute diffs
    const diffs = {
      hoverDiff: await page.evaluate(
        (s1, s2) => window.__diffStates(s1, s2),
        states.default, states.hover
      ),
      focusDiff: await page.evaluate(
        (s1, s2) => window.__diffStates(s1, s2),
        states.default, states.focus
      ),
      activeDiff: await page.evaluate(
        (s1, s2) => window.__diffStates(s1, s2),
        states.default, states.active
      ),
      selectedDiff: await page.evaluate(
        (s1, s2) => window.__diffStates(s1, s2),
        states.default, states.selected
      ),
    };

    return { selector, states, diffs };
  },

  async extractData(page) {
    return await page.evaluate(() => window.__multiStateStylesCaptured);
  },

  generateReplayCode(data) {
    // Generate CSS with :hover, :focus, :active, .selected rules
  }
};
```

**Output Schema:**
```json
{
  "elements": {
    "button.tool-rectangle": {
      "states": {
        "default": { "backgroundColor": "rgb(246, 246, 249)", ... },
        "hover": { "backgroundColor": "rgb(236, 236, 239)", ... },
        "focus": { "backgroundColor": "rgb(246, 246, 249)", "outline": "2px solid blue", ... },
        "active": { "backgroundColor": "rgb(226, 226, 229)", ... },
        "selected": { "backgroundColor": "rgb(224, 223, 255)", ... }
      },
      "diffs": {
        "hoverDiff": { "backgroundColor": { "from": "rgb(246, 246, 249)", "to": "rgb(236, 236, 239)" } },
        "selectedDiff": { "backgroundColor": { "from": "rgb(246, 246, 249)", "to": "rgb(224, 223, 255)" } }
      }
    }
  }
}
```

---

### 3. behavioral-recorder.js

**Purpose:** Record exactly what changes in the DOM/styles when an element is interacted with.

**Injection Timing:** Post-load, with active probing from Node.js

**Implementation:**
```javascript
export const behavioralRecorder = {
  name: 'behavioral-recorder',

  getInjectionScript() {
    return `
(function() {
  if (window.__behavioralRecorderInstalled) return;
  window.__behavioralRecorderInstalled = true;

  window.__behaviorsCaptured = {
    interactions: [],
  };

  // Capture full page state
  window.__capturePageState = function() {
    const state = {
      elements: {},
      timestamp: Date.now(),
    };

    document.querySelectorAll('*').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      const selector = getUniqueSelector(el);
      const computed = getComputedStyle(el);

      state.elements[selector] = {
        tag: el.tagName.toLowerCase(),
        classes: [...el.classList],
        attributes: {},
        visibleText: el.innerText?.slice(0, 100),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        styles: {
          display: computed.display,
          visibility: computed.visibility,
          opacity: computed.opacity,
          backgroundColor: computed.backgroundColor,
          color: computed.color,
          transform: computed.transform,
        },
      };

      // Capture key attributes
      ['id', 'class', 'aria-selected', 'aria-pressed', 'aria-expanded', 'disabled', 'checked'].forEach(attr => {
        if (el.hasAttribute(attr)) {
          state.elements[selector].attributes[attr] = el.getAttribute(attr);
        }
      });
    });

    return state;
  };

  // Diff two states
  window.__diffPageStates = function(before, after) {
    const diff = {
      added: [],
      removed: [],
      modified: [],
    };

    // Find added elements
    for (const selector of Object.keys(after.elements)) {
      if (!before.elements[selector]) {
        diff.added.push({ selector, element: after.elements[selector] });
      }
    }

    // Find removed elements
    for (const selector of Object.keys(before.elements)) {
      if (!after.elements[selector]) {
        diff.removed.push({ selector, element: before.elements[selector] });
      }
    }

    // Find modified elements
    for (const selector of Object.keys(before.elements)) {
      if (after.elements[selector]) {
        const beforeEl = before.elements[selector];
        const afterEl = after.elements[selector];

        const changes = {};

        // Check classes
        const addedClasses = afterEl.classes.filter(c => !beforeEl.classes.includes(c));
        const removedClasses = beforeEl.classes.filter(c => !afterEl.classes.includes(c));
        if (addedClasses.length || removedClasses.length) {
          changes.classes = { added: addedClasses, removed: removedClasses };
        }

        // Check attributes
        for (const attr of Object.keys(afterEl.attributes)) {
          if (beforeEl.attributes[attr] !== afterEl.attributes[attr]) {
            if (!changes.attributes) changes.attributes = {};
            changes.attributes[attr] = { from: beforeEl.attributes[attr], to: afterEl.attributes[attr] };
          }
        }

        // Check styles
        for (const prop of Object.keys(afterEl.styles)) {
          if (beforeEl.styles[prop] !== afterEl.styles[prop]) {
            if (!changes.styles) changes.styles = {};
            changes.styles[prop] = { from: beforeEl.styles[prop], to: afterEl.styles[prop] };
          }
        }

        // Check visibility
        if (beforeEl.styles.display !== afterEl.styles.display ||
            beforeEl.styles.visibility !== afterEl.styles.visibility ||
            beforeEl.styles.opacity !== afterEl.styles.opacity) {
          const wasVisible = beforeEl.styles.display !== 'none' &&
                            beforeEl.styles.visibility !== 'hidden' &&
                            beforeEl.styles.opacity !== '0';
          const isVisible = afterEl.styles.display !== 'none' &&
                           afterEl.styles.visibility !== 'hidden' &&
                           afterEl.styles.opacity !== '0';
          if (wasVisible !== isVisible) {
            changes.visibility = { from: wasVisible, to: isVisible };
          }
        }

        if (Object.keys(changes).length > 0) {
          diff.modified.push({ selector, changes });
        }
      }
    }

    return diff;
  };

  function getUniqueSelector(el) {
    // ... implementation
  }

  console.log('[Behavioral Recorder] Installed');
})();
`;
  },

  // Record a single interaction
  async recordInteraction(page, selector, action) {
    // Capture before state
    const before = await page.evaluate(() => window.__capturePageState());

    // Perform action
    if (action === 'click') {
      await page.click(selector);
    } else if (action === 'hover') {
      await page.hover(selector);
    } else if (action === 'focus') {
      await page.focus(selector);
    }

    // Wait for effects to settle
    await page.waitForTimeout(300);

    // Capture after state
    const after = await page.evaluate(() => window.__capturePageState());

    // Compute diff
    const diff = await page.evaluate(
      (b, a) => window.__diffPageStates(b, a),
      before, after
    );

    return {
      selector,
      action,
      timestamp: Date.now(),
      diff,
    };
  },

  generateReplayCode(data) {
    // Generate onClick handlers that replicate the observed diffs
  }
};
```

**Output Schema:**
```json
{
  "interactions": [
    {
      "selector": "button.tool-rectangle",
      "action": "click",
      "timestamp": 1704728400000,
      "diff": {
        "added": [],
        "removed": [],
        "modified": [
          {
            "selector": "button.tool-rectangle",
            "changes": {
              "classes": { "added": ["ToolIcon--selected"], "removed": [] }
            }
          },
          {
            "selector": "button.tool-selection",
            "changes": {
              "classes": { "added": [], "removed": ["ToolIcon--selected"] }
            }
          },
          {
            "selector": ".properties-panel",
            "changes": {
              "visibility": { "from": false, "to": true }
            }
          }
        ]
      }
    }
  ]
}
```

---

### 4. stylesheet-extractor.js

**Purpose:** Extract all CSS rules including pseudo-selectors (:hover, :focus, etc.) and media queries.

**Injection Timing:** Post-load

**Implementation:**
```javascript
export const stylesheetExtractor = {
  name: 'stylesheet',

  getInjectionScript() {
    return `
(function() {
  if (window.__stylesheetExtractorInstalled) return;
  window.__stylesheetExtractorInstalled = true;

  window.__stylesheetsCaptured = {
    rules: [],
    keyframes: {},
    fontFaces: [],
    mediaQueries: [],
  };

  window.__captureStylesheets = function() {
    const captured = {
      rules: [],
      keyframes: {},
      fontFaces: [],
      mediaQueries: [],
    };

    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        for (const rule of rules) {
          if (rule instanceof CSSStyleRule) {
            captured.rules.push({
              selector: rule.selectorText,
              cssText: rule.style.cssText,
              specificity: calculateSpecificity(rule.selectorText),
            });
          } else if (rule instanceof CSSKeyframesRule) {
            captured.keyframes[rule.name] = rule.cssText;
          } else if (rule instanceof CSSFontFaceRule) {
            captured.fontFaces.push(rule.cssText);
          } else if (rule instanceof CSSMediaRule) {
            const mediaRules = [];
            for (const subRule of rule.cssRules) {
              if (subRule instanceof CSSStyleRule) {
                mediaRules.push({
                  selector: subRule.selectorText,
                  cssText: subRule.style.cssText,
                });
              }
            }
            captured.mediaQueries.push({
              condition: rule.conditionText,
              rules: mediaRules,
            });
          }
        }
      } catch (e) {
        // Cross-origin stylesheets can't be read
        console.log('[Stylesheet Extractor] Skipping cross-origin sheet:', sheet.href);
      }
    }

    window.__stylesheetsCaptured = captured;
    return captured;
  };

  function calculateSpecificity(selector) {
    // ... CSS specificity calculation
    return { ids: 0, classes: 0, elements: 0 };
  }

  console.log('[Stylesheet Extractor] Installed');
})();
`;
  },

  async extractData(page) {
    return await page.evaluate(() => {
      if (window.__captureStylesheets) {
        return window.__captureStylesheets();
      }
      return window.__stylesheetsCaptured;
    });
  },

  generateReplayCode(data) {
    // Generate complete CSS file from captured rules
  }
};
```

---

### 5. react-state-extractor.js

**Purpose:** Extract React component state, props, and hooks.

**Injection Timing:** Pre-navigation (must hook before React initializes)

**Implementation:**
```javascript
export const reactStateExtractor = {
  name: 'react-state',

  getInjectionScript() {
    return `
(function() {
  if (window.__reactStateExtractorInstalled) return;
  window.__reactStateExtractorInstalled = true;

  window.__reactStateCaptured = {
    components: [],
    stateChanges: [],
    hooks: [],
  };

  // Wait for React DevTools hook
  const checkForReact = setInterval(() => {
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      clearInterval(checkForReact);
      hookIntoReact();
    }
  }, 100);

  function hookIntoReact() {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;

    // Hook into inject function to catch React roots
    const originalInject = hook.inject;
    hook.inject = function(renderer) {
      console.log('[React State Extractor] React renderer detected');

      // Hook into setState
      // This is complex and renderer-version specific
      // ...

      return originalInject.apply(this, arguments);
    };
  }

  // Alternative: Hook into React.useState/useReducer before React loads
  let originalCreateElement;
  Object.defineProperty(window, 'React', {
    configurable: true,
    set(react) {
      if (react && react.createElement && !originalCreateElement) {
        originalCreateElement = react.createElement;

        // We can intercept createElement calls
        // But getting state requires deeper hooks
      }
      Object.defineProperty(window, 'React', {
        value: react,
        writable: true,
        configurable: true
      });
    },
    get() {
      return undefined;
    }
  });

  console.log('[React State Extractor] Installed (waiting for React)');
})();
`;
  },

  async extractData(page) {
    // Use React DevTools protocol if available
    return await page.evaluate(() => {
      // Try to extract component tree via DevTools
      // This is best-effort as it depends on React version
      return window.__reactStateCaptured;
    });
  }
};
```

---

## Extraction Pipeline

### Phase 1: Pre-Navigation Setup

```javascript
async function setupExtraction(page) {
  // Inject all pre-navigation scripts
  const preNavScript = [
    eventListenerExtractor.getInjectionScript(),
    webglExtractor.getInjectionScript(),
    cssTransitionExtractor.getInjectionScript(),
    cssAnimationExtractor.getInjectionScript(),
    animationLibsExtractor.getInjectionScript(),
    reactStateExtractor.getInjectionScript(),
    networkRecorder.getInjectionScript(),
  ].join('\n');

  await page.addInitScript(preNavScript);
}
```

### Phase 2: Navigate and Wait

```javascript
async function navigateAndWait(page, url) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // Allow animations to start
}
```

### Phase 3: Post-Load Static Extraction

```javascript
async function extractStaticData(page) {
  // Inject post-load scripts
  await page.evaluate(stylesheetExtractor.getInjectionScript());
  await page.evaluate(multiStateStyleExtractor.getInjectionScript());
  await page.evaluate(behavioralRecorder.getInjectionScript());

  // Extract static data
  const staticData = {
    dom: await domExtractor.extractData(page),
    stylesheets: await stylesheetExtractor.extractData(page),
    cssVariables: await cssVariablesExtractor.extractData(page),
    eventListeners: await eventListenerExtractor.extractData(page),
  };

  return staticData;
}
```

### Phase 4: Active Probing

```javascript
async function probeInteractiveElements(page) {
  // Get all interactive elements
  const interactiveSelectors = await page.evaluate(() => {
    const selectors = [];
    document.querySelectorAll('button, a, input, [role="button"], [onclick], [tabindex="0"]').forEach(el => {
      selectors.push(getUniqueSelector(el));
    });
    return selectors;
  });

  const probedData = {
    multiStateStyles: [],
    behaviors: [],
  };

  for (const selector of interactiveSelectors) {
    console.log(`Probing: ${selector}`);

    // Capture multi-state styles
    const styles = await multiStateStyleExtractor.probeElement(page, selector);
    probedData.multiStateStyles.push(styles);

    // Record click behavior
    const behavior = await behavioralRecorder.recordInteraction(page, selector, 'click');
    probedData.behaviors.push(behavior);

    // Reset page state (reload or undo)
    await resetPageState(page);
  }

  return probedData;
}

async function resetPageState(page) {
  // Option 1: Reload page (slow but reliable)
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Option 2: Use history back (if no side effects)
  // await page.goBack();

  // Option 3: Undo action if possible
  // await page.keyboard.press('Control+Z');
}
```

### Phase 5: Extract Passive Recordings

```javascript
async function extractPassiveRecordings(page) {
  return {
    webgl: await webglExtractor.extractData(page),
    cssAnimations: await cssAnimationExtractor.extractData(page),
    cssTransitions: await cssTransitionExtractor.extractData(page),
    svg: await svgExtractor.extractData(page),
    scrollEffects: await scrollIntersectionExtractor.extractData(page),
    animationLibs: await animationLibsExtractor.extractData(page),
  };
}
```

### Phase 6: Combine and Output

```javascript
async function fullExtraction(url) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Phase 1
  await setupExtraction(page);

  // Phase 2
  await navigateAndWait(page, url);

  // Phase 3
  const staticData = await extractStaticData(page);

  // Phase 4
  const probedData = await probeInteractiveElements(page);

  // Phase 5
  const passiveData = await extractPassiveRecordings(page);

  // Combine
  const fullExtraction = {
    url,
    timestamp: new Date().toISOString(),
    viewport: page.viewportSize(),
    static: staticData,
    probed: probedData,
    passive: passiveData,
  };

  await browser.close();
  return fullExtraction;
}
```

---

## Generation Pipeline

### Input: Full Extraction Data

### Output: Complete React Application

```
extraction-data.json
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│                    GENERATOR PIPELINE                      │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  1. CSS Generator                                         │
│     ├── Base styles from static extraction                │
│     ├── :hover/:focus/:active from multi-state styles     │
│     ├── .selected class from behavioral recording         │
│     ├── Transitions from css-transition data              │
│     └── @keyframes from css-animation data                │
│                                                           │
│  2. JSX Generator                                         │
│     ├── Element tree from DOM extraction                  │
│     ├── Conditional classes from behavioral recording     │
│     │   (e.g., ${selectedTool === 'x' ? 'selected' : ''}) │
│     ├── onClick handlers from behavioral diffs            │
│     └── SVGs from svg extraction                          │
│                                                           │
│  3. State Generator                                       │
│     ├── useState hooks from behavioral analysis           │
│     │   (infer state variables from observed toggles)     │
│     └── Initial values from default state                 │
│                                                           │
│  4. WebGL/Canvas Generator                                │
│     ├── Shaders from webgl extraction                     │
│     ├── Uniforms and buffers                              │
│     └── Render loop from draw calls                       │
│                                                           │
│  5. Animation Generator                                   │
│     ├── CSS animations from css-animation data            │
│     ├── JS animations from animation-libs data            │
│     └── Scroll effects from scroll-intersection data      │
│                                                           │
└───────────────────────────────────────────────────────────┘
        │
        ▼
output/
  ├── src/
  │   ├── App.jsx           # Complete React component
  │   ├── App.css           # All styles with all states
  │   ├── webgl.js          # WebGL replay code
  │   └── animations.js     # Animation code
  ├── public/
  │   ├── assets/           # Extracted images, fonts
  │   └── index.html
  └── package.json
```

---

## Implementation Priority

### Phase 1: Core Extractors (Essential)
1. ✅ `webgl-extractor.js`
2. ✅ `css-transition-extractor.js`
3. ✅ `css-animation-extractor.js`
4. 🔴 `event-listener-extractor.js` - HIGH PRIORITY
5. 🔴 `multi-state-style-extractor.js` - HIGH PRIORITY
6. 🔴 `behavioral-recorder.js` - HIGH PRIORITY

### Phase 2: Enhanced Extractors
7. 🔴 `stylesheet-extractor.js` - Extract all CSS rules
8. 🔴 `font-extractor.js` - @font-face and font files
9. 🔴 `asset-extractor.js` - Images and media

### Phase 3: Framework-Specific
10. 🔴 `react-state-extractor.js` - React state/props
11. 🔴 `network-recorder.js` - API calls

### Phase 4: Generation
12. 🔴 Enhanced CSS generator with all states
13. 🔴 Enhanced JSX generator with observed behaviors
14. 🔴 State inference from behavioral patterns

---

## Success Criteria

A "perfect" extraction/recreation is achieved when:

1. **Visual Fidelity**: Clone is pixel-identical at all viewport sizes
2. **State Coverage**: All element states (hover, focus, active, selected) look identical
3. **Behavioral Match**: Clicking/hovering produces identical visual changes
4. **Animation Match**: All animations play identically
5. **WebGL Match**: Canvas/WebGL content renders identically

**Zero Guessing Verification:**
- Every CSS rule in the clone can be traced to extraction data
- Every onClick handler can be traced to observed behavioral diff
- No hardcoded values that weren't extracted

---

## Extractor Inventory Summary

### By Category

| Category | Done | TODO | Total |
|----------|------|------|-------|
| A: Passive Recording (Pre-nav injection) | 7 | 9 | 16 |
| B: Active Probing (Systematic interaction) | 0 | 13 | 13 |
| C: Static Analysis (Post-load) | 1 | 12 | 13 |
| D: Asset Collection | 0 | 6 | 6 |
| E: Design System (from V3) | 2 | 4 | 6 |
| F: Shader/Graphics (from V3) | 4 | 3 | 7 |
| G: Template Generation (from V3) | 1 | 3 | 4 |
| **TOTAL** | **15** | **50** | **65** |

### Completion Status: 23% (15/65)

### Layer Coverage Summary

| Layer | Topics Covered |
|-------|----------------|
| 1. Visual Structure | 12 components |
| 2. Visual States | 12 states |
| 3. Pseudo-Elements | 8 pseudo-elements |
| 4. Animations | 10 types |
| 5. Canvas/Graphics | 7 contexts |
| 6. Events | **~100 event types** |
| 7. Application State | 10 state types |
| 8. Network/Data | 11 data types |
| 9. Responsive | 10 features |
| 9.5. Modern CSS | 45+ features |
| 10. UI Patterns | 20 patterns |
| 11. Accessibility | 12 aspects |
| 12. Browser APIs | **70+ APIs** |
| 13. Third-Party | 8 integrations |
| 14. Performance | 7 patterns |
| 15. JS Runtime | 10 behaviors |
| 16. Data/Encoding | 9 types |
| 17. Crypto/Security | 7 features |
| 18. i18n | 9 features |
| 19. Document/Parsing | 9 features |
| 20. SVG Specifics | 9 features |
| 21. Audio Graph | 7 features |
| 22. Video Specifics | 7 features |
| 23. WebAssembly | 5 features |
| 24. Resource Loading | 8 hints |
| 25. Print/Media | 5 features |
| 26. URL/Routing | 7 features |
| 27. Error Handling | 6 features |
| 28. Timing/Event Loop | 6 features |
| 29. iframe/Embedding | 6 features |
| 30. Native Integration | 7 link types |
| 31. Accessibility (ext) | 10 features |
| 32. Testing Attributes | 4 patterns |
| 33. Temporal/Time | 5 features |
| 34. State Machines | 6 patterns |
| 35. Progressive Enhancement | 5 features |
| **TOTAL** | **35 Layers, 400+ items**

### What's Built (15 extractors)

**Passive Recording:**
1. ✅ `webgl-extractor.js` - Full WebGL capture with shaders, uniforms, buffers
2. ✅ `css-animation-extractor.js` - @keyframes and animation properties
3. ✅ `css-transition-extractor.js` - Transition events and value capture
4. ✅ `css-variables-extractor.js` - CSS custom properties
5. ✅ `svg-extractor.js` - SVG mutations via MutationObserver
6. ✅ `scroll-intersection-extractor.js` - Scroll and intersection effects
7. ✅ `animation-libs-extractor.js` - GSAP, anime.js, Framer Motion

**Static Analysis:**
8. ✅ `dom-extractor.js` - Full DOM tree with computed styles

**Design System (V3):**
9. ✅ `design-token-extractor.js` - Colors, typography, spacing tokens
10. ✅ `hover-state-capture.js` - :hover style differences

**Shader/Graphics (V3):**
11. ✅ `shader-pair-extractor.js` - Vertex + fragment shader pairs
12. ✅ `uniform-value-extractor.js` - Uniform names and runtime values
13. ✅ `shader-fusion-optimizer.js` - Multi-pass to single-pass optimization
14. ✅ `unicorn-interpreter.js` - UnicornStudio JSON to WebGL

**Template Generation (V3):**
15. ✅ `template-generator.js` - template.json, template.css, template.js

### Critical Missing (HIGH PRIORITY)

These are essential for "zero approximation" cloning:

| Extractor | Why Critical |
|-----------|--------------|
| `event-listener-extractor.js` | Know what events elements listen for |
| `multi-state-style-extractor.js` | Capture :hover/:focus/:active exactly |
| `behavioral-recorder.js` | Know exactly what clicking does |
| `canvas-2d-extractor.js` | Many sites use 2D canvas, not just WebGL |
| `pseudo-element-extractor.js` | ::before/::after content is often critical |
| `stylesheet-extractor.js` | Get ALL CSS rules including pseudo-selectors |
| `responsive-extractor.js` | Styles at each breakpoint |

### Nice to Have (MEDIUM PRIORITY)

| Extractor | Benefit |
|-----------|---------|
| `font-extractor.js` | Perfect typography |
| `image-extractor.js` | All asset URLs |
| `network-recorder.js` | Mock API responses |
| `storage-extractor.js` | Persist state correctly |
| `react-state-extractor.js` | Framework-aware cloning |

---

## File Locations

```
tools/pipeline/extractors/
├── index.js                      # Orchestrator (existing)
├── webgl-extractor.js            # ✅ WebGL capture
├── css-animation-extractor.js    # ✅ CSS animations
├── css-transition-extractor.js   # ✅ CSS transitions
├── css-variables-extractor.js    # ✅ CSS custom properties
├── svg-extractor.js              # ✅ SVG mutations
├── scroll-intersection-extractor.js # ✅ Scroll effects
├── animation-libs-extractor.js   # ✅ GSAP/anime.js
├── event-listener-extractor.js   # 🔴 TODO
├── multi-state-style-extractor.js # 🔴 TODO
├── behavioral-recorder.js        # 🔴 TODO
├── canvas-2d-extractor.js        # 🔴 TODO
├── pseudo-element-extractor.js   # 🔴 TODO
├── stylesheet-extractor.js       # 🔴 TODO
├── ... (40+ more TODO)

tools/
├── capture-hover-states.js       # ✅ V3 hover capture
├── generate-template.js          # ✅ V3 template generator
├── stripe-gradient.js            # ✅ V3 shader example
├── unicorn-fusion.js             # ✅ V3 shader optimization
├── unicornstudio-interpreter.js  # ✅ V3 UnicornStudio
```
