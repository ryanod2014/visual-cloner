# Complete Web App I/O Capture Checklist

> **Every possible thing we need to capture for clean room recreation**

---

## 1. VISUAL / UI

### 1.1 DOM Structure
- [ ] All HTML elements and hierarchy
- [ ] Element attributes (id, class, data-*, etc.)
- [ ] Text content
- [ ] Shadow DOM content
- [ ] Template elements
- [ ] Slot content
- [ ] Custom elements / Web Components

### 1.2 CSS Styles
- [ ] All CSS rules (inline, internal, external)
- [ ] Computed styles for every element
- [ ] CSS custom properties (--variables)
- [ ] CSS inheritance chain
- [ ] Specificity hierarchy
- [ ] !important declarations

### 1.3 CSS Pseudo-States
- [ ] :hover styles
- [ ] :focus styles
- [ ] :active styles
- [ ] :visited styles
- [ ] :checked styles
- [ ] :disabled styles
- [ ] :enabled styles
- [ ] :valid / :invalid styles
- [ ] :required / :optional styles
- [ ] :placeholder-shown styles
- [ ] :focus-within styles
- [ ] :focus-visible styles
- [ ] :empty styles
- [ ] :first-child / :last-child styles
- [ ] :nth-child() styles
- [ ] ::before / ::after content
- [ ] ::placeholder styles
- [ ] ::selection styles
- [ ] ::marker styles
- [ ] ::first-letter / ::first-line styles

### 1.4 CSS Animations & Transitions
- [ ] @keyframes definitions
- [ ] animation properties (duration, timing, delay, iteration)
- [ ] transition properties
- [ ] transform values at each state
- [ ] animation-play-state behavior

### 1.5 Responsive Design
- [ ] @media query breakpoints
- [ ] Mobile layout
- [ ] Tablet layout
- [ ] Desktop layout
- [ ] Print stylesheet
- [ ] @container queries
- [ ] Orientation-specific styles
- [ ] prefers-color-scheme (dark/light mode)
- [ ] prefers-reduced-motion styles
- [ ] prefers-contrast styles

### 1.6 Typography
- [ ] Font families used
- [ ] Font weights
- [ ] Font sizes
- [ ] Line heights
- [ ] Letter spacing
- [ ] Word spacing
- [ ] Text transforms
- [ ] Font feature settings
- [ ] Variable font axes
- [ ] @font-face definitions
- [ ] Font loading behavior

### 1.7 Colors
- [ ] All color values (hex, rgb, hsl, etc.)
- [ ] Gradients (linear, radial, conic)
- [ ] Color profiles
- [ ] Transparency/opacity values
- [ ] Mix-blend-mode values
- [ ] Filter effects

### 1.8 Layout
- [ ] Flexbox configurations
- [ ] Grid configurations
- [ ] Positioning (static, relative, absolute, fixed, sticky)
- [ ] Z-index stacking order
- [ ] Float behavior
- [ ] Clear behavior
- [ ] Overflow handling
- [ ] Scroll snap points
- [ ] Aspect ratios

### 1.9 Visual Assets
- [ ] Images (all formats: jpg, png, gif, webp, avif, svg)
- [ ] Image srcset (responsive images)
- [ ] Background images
- [ ] Favicons
- [ ] App icons
- [ ] SVG graphics (inline and external)
- [ ] Icon fonts
- [ ] CSS sprites
- [ ] Data URIs
- [ ] Cursors (custom)

---

## 2. INTERACTIVITY

### 2.1 Mouse Events
- [ ] click handlers
- [ ] dblclick handlers
- [ ] mousedown handlers
- [ ] mouseup handlers
- [ ] mousemove handlers
- [ ] mouseenter handlers
- [ ] mouseleave handlers
- [ ] mouseover handlers
- [ ] mouseout handlers
- [ ] contextmenu (right-click) handlers
- [ ] wheel / scroll handlers

### 2.2 Keyboard Events
- [ ] keydown handlers
- [ ] keyup handlers
- [ ] keypress handlers (deprecated but used)
- [ ] All keyboard shortcuts (with modifiers)
- [ ] Single key shortcuts
- [ ] Ctrl+key combinations
- [ ] Alt+key combinations
- [ ] Shift+key combinations
- [ ] Meta/Cmd+key combinations
- [ ] Multi-modifier combinations (Ctrl+Shift+key)
- [ ] Function key handlers (F1-F12)
- [ ] Arrow key handlers
- [ ] Enter/Escape/Tab handlers
- [ ] Numpad handlers

### 2.3 Touch Events
- [ ] touchstart handlers
- [ ] touchmove handlers
- [ ] touchend handlers
- [ ] touchcancel handlers
- [ ] Gesture recognition (pinch, rotate, swipe)
- [ ] Multi-touch handling
- [ ] Touch vs mouse differentiation

### 2.4 Pointer Events
- [ ] pointerdown handlers
- [ ] pointermove handlers
- [ ] pointerup handlers
- [ ] pointercancel handlers
- [ ] pointerenter / pointerleave handlers
- [ ] Pointer capture behavior

### 2.5 Drag and Drop
- [ ] dragstart handlers
- [ ] drag handlers
- [ ] dragenter handlers
- [ ] dragover handlers
- [ ] dragleave handlers
- [ ] drop handlers
- [ ] dragend handlers
- [ ] Drag preview/ghost image
- [ ] Drop zone indicators
- [ ] File drop handling

### 2.6 Focus Events
- [ ] focus handlers
- [ ] blur handlers
- [ ] focusin handlers
- [ ] focusout handlers
- [ ] Tab order (tabindex)
- [ ] Focus trap behavior
- [ ] Focus restoration

### 2.7 Clipboard Events
- [ ] copy handlers
- [ ] cut handlers
- [ ] paste handlers
- [ ] Clipboard API usage
- [ ] Copy formatting behavior

### 2.8 Selection Events
- [ ] select handlers
- [ ] selectstart handlers
- [ ] selectionchange handlers

---

## 3. FORMS & INPUTS

### 3.1 Input Types
- [ ] text inputs
- [ ] password inputs
- [ ] email inputs
- [ ] tel inputs
- [ ] url inputs
- [ ] number inputs (min, max, step)
- [ ] range inputs (sliders)
- [ ] date inputs
- [ ] time inputs
- [ ] datetime-local inputs
- [ ] month inputs
- [ ] week inputs
- [ ] color inputs
- [ ] file inputs (accept types, multiple)
- [ ] hidden inputs
- [ ] search inputs

### 3.2 Other Form Elements
- [ ] textarea (rows, cols, resize)
- [ ] select dropdowns (single)
- [ ] select multiple
- [ ] optgroup structures
- [ ] datalist / autocomplete options
- [ ] checkbox inputs
- [ ] radio button groups
- [ ] button types (submit, reset, button)
- [ ] output elements
- [ ] progress elements
- [ ] meter elements

### 3.3 Form Behavior
- [ ] form submit handlers
- [ ] form reset handlers
- [ ] formdata event handlers
- [ ] input event handlers
- [ ] change event handlers
- [ ] invalid event handlers
- [ ] Validation constraints (required, pattern, min, max, etc.)
- [ ] Custom validation messages
- [ ] Validation timing (on blur, on submit, real-time)
- [ ] Form serialization format
- [ ] Form encoding type
- [ ] Autocomplete behavior

### 3.4 Rich Inputs
- [ ] contenteditable regions
- [ ] Rich text editors (formatting commands)
- [ ] Code editors (syntax highlighting, line numbers)
- [ ] Markdown editors
- [ ] WYSIWYG behavior
- [ ] Input masks (phone, credit card, etc.)
- [ ] Auto-formatting behavior

---

## 4. NAVIGATION & ROUTING

### 4.1 URL Handling
- [ ] Base URL / routes
- [ ] Route parameters (/user/:id)
- [ ] Query parameters (?foo=bar)
- [ ] Hash fragments (#section)
- [ ] URL encoding/decoding
- [ ] pushState usage
- [ ] replaceState usage
- [ ] popstate handlers
- [ ] hashchange handlers

### 4.2 Link Behavior
- [ ] Internal navigation
- [ ] External links (target="_blank")
- [ ] Download links
- [ ] Mailto links
- [ ] Tel links
- [ ] Anchor links (smooth scroll)
- [ ] Prefetch/preload hints

### 4.3 Navigation UI
- [ ] Header navigation
- [ ] Footer navigation
- [ ] Sidebar navigation
- [ ] Breadcrumbs
- [ ] Pagination (numbered, prev/next, load more)
- [ ] Infinite scroll
- [ ] Tab navigation
- [ ] Accordion sections
- [ ] Tree navigation
- [ ] Mobile hamburger menu
- [ ] Mega menus

---

## 5. STATE MANAGEMENT

### 5.1 Client Storage
- [ ] localStorage keys and values
- [ ] sessionStorage keys and values
- [ ] Cookies (names, values, attributes)
- [ ] IndexedDB databases, stores, indices
- [ ] Cache API entries
- [ ] Web SQL (deprecated but used)

### 5.2 Application State
- [ ] Initial state shape
- [ ] State transitions
- [ ] Action types / reducers
- [ ] Computed/derived state
- [ ] State selectors
- [ ] Memoization patterns

### 5.3 URL State
- [ ] State encoded in URL
- [ ] Deep linking support
- [ ] Shareable URLs
- [ ] Bookmark behavior

---

## 6. DATA & APIS

### 6.1 Network Requests
- [ ] REST API endpoints (GET, POST, PUT, PATCH, DELETE)
- [ ] GraphQL queries
- [ ] GraphQL mutations
- [ ] GraphQL subscriptions
- [ ] Request headers
- [ ] Request body formats
- [ ] Response formats
- [ ] Status codes and meanings
- [ ] Error response formats
- [ ] Pagination patterns
- [ ] Rate limiting behavior
- [ ] Retry logic
- [ ] Timeout handling

### 6.2 Real-time Communication
- [ ] WebSocket connections
- [ ] WebSocket message formats
- [ ] Server-Sent Events
- [ ] Long polling
- [ ] WebRTC connections
- [ ] Reconnection behavior

### 6.3 Authentication
- [ ] Login flow
- [ ] Logout flow
- [ ] Token storage
- [ ] Token refresh
- [ ] Session management
- [ ] OAuth flows
- [ ] Multi-factor authentication
- [ ] Password reset flow
- [ ] Account verification

---

## 7. CANVAS / 2D GRAPHICS

### 7.1 Drawing Operations
- [ ] fillRect / strokeRect / clearRect
- [ ] fillText / strokeText
- [ ] drawImage
- [ ] putImageData / getImageData
- [ ] Path operations (beginPath, moveTo, lineTo, arc, etc.)
- [ ] fill / stroke / clip
- [ ] Bezier curves
- [ ] Quadratic curves
- [ ] Ellipses
- [ ] Rounded rectangles

### 7.2 Canvas State
- [ ] fillStyle values
- [ ] strokeStyle values
- [ ] lineWidth values
- [ ] lineCap / lineJoin
- [ ] miterLimit
- [ ] shadowBlur / shadowColor / shadowOffset
- [ ] globalAlpha
- [ ] globalCompositeOperation (BLENDING MODES!)
- [ ] font settings
- [ ] textAlign / textBaseline

### 7.3 Transformations
- [ ] translate
- [ ] rotate
- [ ] scale
- [ ] transform / setTransform
- [ ] resetTransform

### 7.4 Compositing / Blending Modes
- [ ] source-over (default)
- [ ] source-in
- [ ] source-out
- [ ] source-atop
- [ ] destination-over
- [ ] destination-in
- [ ] destination-out
- [ ] destination-atop
- [ ] lighter
- [ ] copy
- [ ] xor
- [ ] multiply
- [ ] screen
- [ ] overlay
- [ ] darken
- [ ] lighten
- [ ] color-dodge
- [ ] color-burn
- [ ] hard-light
- [ ] soft-light
- [ ] difference
- [ ] exclusion
- [ ] hue
- [ ] saturation
- [ ] color
- [ ] luminosity

### 7.5 Filters
- [ ] blur()
- [ ] brightness()
- [ ] contrast()
- [ ] drop-shadow()
- [ ] grayscale()
- [ ] hue-rotate()
- [ ] invert()
- [ ] opacity()
- [ ] saturate()
- [ ] sepia()

### 7.6 Patterns & Gradients
- [ ] createLinearGradient
- [ ] createRadialGradient
- [ ] createConicGradient
- [ ] createPattern
- [ ] Gradient color stops

---

## 8. WEBGL / 3D GRAPHICS

### 8.1 WebGL Operations
- [ ] drawArrays
- [ ] drawElements
- [ ] drawArraysInstanced
- [ ] drawElementsInstanced
- [ ] clear
- [ ] clearColor / clearDepth / clearStencil

### 8.2 Shaders
- [ ] Vertex shaders
- [ ] Fragment shaders
- [ ] Shader uniforms
- [ ] Shader attributes
- [ ] Shader program linking

### 8.3 Buffers
- [ ] Array buffers
- [ ] Element buffers
- [ ] Framebuffers
- [ ] Renderbuffers

### 8.4 Textures
- [ ] Texture loading
- [ ] Texture parameters
- [ ] Mipmaps
- [ ] Texture formats

### 8.5 State
- [ ] Viewport
- [ ] Scissor
- [ ] Blend functions
- [ ] Depth testing
- [ ] Stencil testing
- [ ] Face culling

---

## 9. MEDIA

### 9.1 Images
- [ ] Static images
- [ ] Responsive images (srcset, sizes)
- [ ] Lazy loaded images
- [ ] Image placeholders
- [ ] Blur-up loading
- [ ] Error fallbacks
- [ ] Alt text

### 9.2 Video
- [ ] Video sources (formats)
- [ ] Poster images
- [ ] Autoplay behavior
- [ ] Loop behavior
- [ ] Muted behavior
- [ ] Controls customization
- [ ] Playback rate control
- [ ] Volume control
- [ ] Seek behavior
- [ ] Fullscreen behavior
- [ ] Picture-in-picture
- [ ] Captions / subtitles (VTT)
- [ ] Quality selection
- [ ] Buffering indicators
- [ ] Error handling

### 9.3 Audio
- [ ] Audio sources (formats)
- [ ] Web Audio API usage
- [ ] AudioContext
- [ ] Audio nodes (gain, filter, analyser)
- [ ] Spatial audio
- [ ] Audio visualization

### 9.4 Embeds
- [ ] YouTube embeds
- [ ] Vimeo embeds
- [ ] iframe embeds
- [ ] Twitter/X embeds
- [ ] Instagram embeds
- [ ] Maps embeds
- [ ] Code sandboxes
- [ ] PDF viewers

---

## 10. MODALS & OVERLAYS

### 10.1 Dialogs
- [ ] Modal dialogs
- [ ] Non-modal dialogs
- [ ] Alert dialogs
- [ ] Confirm dialogs
- [ ] Prompt dialogs
- [ ] Custom dialog content
- [ ] Dialog open/close triggers
- [ ] Dialog animations
- [ ] Backdrop/overlay styling
- [ ] Focus trapping
- [ ] Escape key handling
- [ ] Click-outside handling

### 10.2 Notifications
- [ ] Toast notifications
- [ ] Snackbars
- [ ] Banners
- [ ] Inline alerts
- [ ] System notifications (Notification API)
- [ ] Notification duration
- [ ] Notification stacking
- [ ] Dismiss behavior
- [ ] Action buttons

### 10.3 Tooltips & Popovers
- [ ] Tooltip content
- [ ] Tooltip positioning
- [ ] Tooltip triggers (hover, click, focus)
- [ ] Tooltip delays
- [ ] Popover content
- [ ] Popover positioning
- [ ] Arrow/pointer styling

### 10.4 Menus
- [ ] Dropdown menus
- [ ] Context menus (right-click)
- [ ] Nested/cascading menus
- [ ] Menu item types (action, checkbox, radio, separator)
- [ ] Menu keyboard navigation
- [ ] Menu positioning

### 10.5 Other Overlays
- [ ] Lightboxes
- [ ] Image galleries
- [ ] Full-screen overlays
- [ ] Loading overlays
- [ ] Cookie consent banners
- [ ] Newsletter popups
- [ ] Onboarding tours

---

## 11. ANIMATIONS & TRANSITIONS

### 11.1 CSS Animations
- [ ] @keyframes definitions
- [ ] Animation timing functions
- [ ] Animation delays
- [ ] Animation iterations
- [ ] Animation direction
- [ ] Animation fill mode
- [ ] Animation play state

### 11.2 CSS Transitions
- [ ] Transition properties
- [ ] Transition durations
- [ ] Transition timing functions
- [ ] Transition delays
- [ ] All transitioned properties

### 11.3 JavaScript Animations
- [ ] requestAnimationFrame loops
- [ ] setInterval/setTimeout animations
- [ ] Web Animations API usage
- [ ] Animation libraries (GSAP, anime.js, etc.)
- [ ] Spring physics animations
- [ ] Scroll-driven animations

### 11.4 Page Transitions
- [ ] Route transition effects
- [ ] View Transitions API
- [ ] Shared element transitions

### 11.5 Loading States
- [ ] Skeleton screens
- [ ] Shimmer effects
- [ ] Spinner animations
- [ ] Progress bars
- [ ] Loading dots

---

## 12. ACCESSIBILITY

### 12.1 ARIA
- [ ] ARIA roles
- [ ] ARIA labels (aria-label, aria-labelledby)
- [ ] ARIA descriptions (aria-describedby)
- [ ] ARIA states (aria-expanded, aria-selected, aria-checked, etc.)
- [ ] ARIA properties (aria-haspopup, aria-controls, etc.)
- [ ] ARIA live regions

### 12.2 Keyboard Navigation
- [ ] Tab order
- [ ] Focus indicators
- [ ] Skip links
- [ ] Keyboard shortcuts documentation
- [ ] Arrow key navigation in widgets
- [ ] Enter/Space activation

### 12.3 Screen Reader Support
- [ ] Alternative text
- [ ] Visually hidden text
- [ ] Announcement behavior
- [ ] Reading order

---

## 13. BROWSER APIS

### 13.1 Storage APIs
- [ ] localStorage
- [ ] sessionStorage
- [ ] IndexedDB
- [ ] Cache API
- [ ] Cookies

### 13.2 Media APIs
- [ ] MediaDevices (camera, microphone)
- [ ] Screen Capture
- [ ] MediaRecorder
- [ ] Web Audio API
- [ ] Media Session API

### 13.3 Device APIs
- [ ] Geolocation
- [ ] DeviceOrientation
- [ ] DeviceMotion
- [ ] Vibration API
- [ ] Battery Status
- [ ] Network Information

### 13.4 Communication APIs
- [ ] Fetch API
- [ ] XMLHttpRequest
- [ ] WebSocket
- [ ] Server-Sent Events
- [ ] WebRTC
- [ ] Broadcast Channel
- [ ] postMessage

### 13.5 UI APIs
- [ ] Fullscreen API
- [ ] Pointer Lock API
- [ ] Screen Wake Lock
- [ ] Web Share API
- [ ] Clipboard API
- [ ] Notifications API
- [ ] Page Visibility API
- [ ] Resize Observer
- [ ] Intersection Observer
- [ ] Mutation Observer

### 13.6 Other APIs
- [ ] Web Workers
- [ ] Service Workers
- [ ] Shared Workers
- [ ] WebAssembly
- [ ] Payment Request API
- [ ] Credentials API
- [ ] Web Bluetooth
- [ ] Web USB
- [ ] Web Serial
- [ ] File System Access API
- [ ] Web Speech API (recognition, synthesis)
- [ ] Gamepad API

---

## 14. ERROR HANDLING

### 14.1 Error States
- [ ] 404 page
- [ ] 500 page
- [ ] Network error handling
- [ ] Timeout handling
- [ ] JavaScript error boundaries
- [ ] Fallback content
- [ ] Retry mechanisms

### 14.2 Error Messages
- [ ] Validation error messages
- [ ] API error messages
- [ ] User-friendly error text
- [ ] Error codes

---

## 15. INTERNATIONALIZATION

### 15.1 Languages
- [ ] All supported locales
- [ ] Translation strings
- [ ] Fallback language

### 15.2 Formatting
- [ ] Date formats per locale
- [ ] Time formats per locale
- [ ] Number formats per locale
- [ ] Currency formats per locale
- [ ] Pluralization rules
- [ ] List formatting

### 15.3 Layout
- [ ] RTL support
- [ ] Bi-directional text
- [ ] Text expansion handling

---

## 16. PERFORMANCE PATTERNS

### 16.1 Loading Optimization
- [ ] Lazy loading (images, components)
- [ ] Code splitting boundaries
- [ ] Dynamic imports
- [ ] Prefetch hints
- [ ] Preload hints
- [ ] Critical CSS

### 16.2 Runtime Optimization
- [ ] Virtual scrolling
- [ ] Windowing
- [ ] Debouncing patterns
- [ ] Throttling patterns
- [ ] Memoization patterns
- [ ] Web Worker offloading

---

## 17. THIRD-PARTY INTEGRATIONS

### 17.1 Analytics
- [ ] Google Analytics events
- [ ] Custom tracking events
- [ ] Page view tracking
- [ ] User identification

### 17.2 Social
- [ ] Social login providers
- [ ] Share buttons
- [ ] Social embeds
- [ ] Open Graph meta tags

### 17.3 Payments
- [ ] Payment forms
- [ ] Payment providers (Stripe, PayPal, etc.)
- [ ] Checkout flows

### 17.4 Customer Support
- [ ] Chat widgets
- [ ] Help center integration
- [ ] Feedback forms

---

## 18. SECURITY CONSIDERATIONS

### 18.1 Input Security
- [ ] XSS prevention patterns
- [ ] Input sanitization
- [ ] Output encoding

### 18.2 Request Security
- [ ] CSRF tokens
- [ ] CORS configuration
- [ ] Content Security Policy

### 18.3 Sensitive Data
- [ ] Password handling
- [ ] Token storage
- [ ] PII masking

---

## SUMMARY: What Requires Clicking vs Static Analysis

### Static Analysis Can Find:
- All DOM elements and structure
- All CSS rules and states
- All JavaScript handlers and their code
- All keyboard shortcut bindings
- All canvas/WebGL operations
- All API endpoint definitions
- All state management logic
- All ARIA attributes
- All animation definitions

### Requires Runtime (Clicking/Interaction):
- Actual API response shapes
- Dynamic coordinate calculations
- Server-side validation rules
- WebSocket message formats
- Third-party widget rendering
- Computed layout values
- Actual visual output verification

### Requires Both:
- Canvas UI hit regions (static finds handler, runtime finds coordinates)
- Animation timing (static finds definition, runtime verifies)
- Responsive layouts (static finds breakpoints, runtime verifies)
