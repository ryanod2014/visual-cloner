# Extraction Limitations: What We Can't Capture

A brutally honest assessment of fundamental limitations and potential gaps.

---

## TIER 1: FUNDAMENTALLY IMPOSSIBLE (No amount of engineering fixes this)

### 1. Server-Side Logic
```
❌ CANNOT EXTRACT:
- API business logic (validation, calculations, rules)
- Database queries and schemas
- Authentication/authorization rules
- Server-side rendering logic
- Rate limiting and throttling rules
- Backend state machines
- Cron jobs / scheduled tasks
- Email/SMS sending logic
```

**Why:** We only see the client. The server is a black box.

**Workaround:** Mock API responses based on observed request/response pairs, but logic is lost.

---

### 2. Credentials & Secrets
```
❌ CANNOT EXTRACT:
- API keys (even if in client, shouldn't clone)
- OAuth tokens
- Session secrets
- Encryption keys
- Private certificates
```

**Why:** Security. Even if visible, cloning them is wrong/illegal.

**Workaround:** Placeholder values, require user to provide their own.

---

### 3. Real-Time External Data
```
❌ CANNOT EXTRACT:
- Live stock prices
- Real-time chat messages from other users
- Live sports scores
- Current weather
- Server push notifications content
- WebSocket data from server
```

**Why:** This data doesn't exist until runtime, comes from external sources.

**Workaround:** Capture snapshot, mock with static data.

---

### 4. User-Specific Personalization
```
❌ CANNOT EXTRACT:
- Recommendation algorithms
- A/B test variants we're not in
- User preference-based layouts
- Machine learning model outputs
- Personalized content feeds
```

**Why:** We only see ONE user's view. Other variants are invisible.

**Workaround:** Document that clone represents one variant only.

---

### 5. Third-Party Service Integrations
```
❌ CANNOT EXTRACT:
- Payment processing (Stripe checkout flow internals)
- Social login (actual OAuth with Google/Facebook)
- Analytics tracking logic (what events mean)
- Map tile data (Google Maps, Mapbox)
- Video streaming (YouTube embeds, actual video)
- Ad network behavior
```

**Why:** These are external services with their own logic.

**Workaround:** Mock the integration points, use placeholder iframes.

---

## TIER 2: THEORETICALLY POSSIBLE BUT NOT CURRENTLY IMPLEMENTED

### 6. Keyboard Shortcuts (Global)
```
⚠️ PARTIALLY CAPTURED:
- Element-focused keyboard events ✓
- Global document/window keyboard shortcuts ?
- Multi-key sequences (Ctrl+Shift+P) ?
- Vim-style command sequences ?
```

**Gap:** We test Enter/Space/Arrows on focused elements, but don't systematically try all key combinations globally.

**Fix Required:**
```javascript
// Need to add to robust-state-explorer.js
const GLOBAL_SHORTCUTS = [
  'Escape', 'Enter', 'Space', 'Tab',
  'Control+k', 'Control+p', 'Control+/', 'Control+Shift+p',
  'Meta+k', 'Meta+p', // Mac
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  '/', '?', 'g g', 'g h', // Vim-style
];

async function testGlobalShortcuts(page) {
  for (const shortcut of GLOBAL_SHORTCUTS) {
    const before = await getStateHash(page);
    await page.keyboard.press(shortcut);
    const after = await getStateHash(page);
    if (before !== after) {
      // Found a global shortcut that does something!
    }
  }
}
```

---

### 7. Touch Gestures
```
⚠️ NOT CAPTURED:
- Pinch to zoom
- Two-finger scroll
- Swipe gestures
- Long press
- Multi-touch interactions
- Touch-specific event handlers
```

**Gap:** Playwright can simulate touch, but we don't systematically try gestures.

**Fix Required:**
```javascript
// Add touch gesture testing
async function testTouchGestures(page, element) {
  // Swipe
  await page.touchscreen.tap(x, y);
  await page.touchscreen.swipe(x1, y1, x2, y2);

  // Long press
  await page.touchscreen.tap(x, y, { delay: 1000 });

  // Pinch (requires multi-touch simulation)
}
```

---

### 8. Web Workers / Service Workers
```
⚠️ NOT CAPTURED:
- Web Worker scripts and logic
- Service Worker caching strategies
- Background sync behavior
- Push notification handlers
- Offline behavior
```

**Gap:** We don't intercept Worker creation or inject into Workers.

**Fix Required:**
```javascript
// Intercept Worker creation
const originalWorker = window.Worker;
window.Worker = function(url, options) {
  console.log('[Captured] Web Worker:', url);
  // Fetch and store the worker script
  capturedWorkers.push({ url, script: fetchSync(url) });
  return new originalWorker(url, options);
};
```

---

### 9. Clipboard Operations
```
⚠️ NOT CAPTURED:
- Copy behavior (what gets copied)
- Paste handling (what happens on paste)
- Cut behavior
- Clipboard format handling (text, HTML, images)
```

**Gap:** We don't test Ctrl+C/V or intercept clipboard API.

**Fix Required:**
```javascript
// Intercept clipboard
const originalWriteText = navigator.clipboard.writeText;
navigator.clipboard.writeText = async function(text) {
  capturedClipboard.push({ action: 'write', text, timestamp: Date.now() });
  return originalWriteText.call(this, text);
};

// Test copy/paste
await page.keyboard.press('Control+c');
await page.keyboard.press('Control+v');
```

---

### 10. Drag & Drop (Complex)
```
⚠️ PARTIALLY CAPTURED:
- Simple drag-drop between two elements ✓
- Drag to reorder lists ?
- Drag with custom drag images ?
- Drag to external (file system) ✗
- Drag from external (file upload) ✗
```

**Gap:** We do basic drag-drop but not systematic list reordering or complex drag sequences.

**Fix Required:**
```javascript
// Test drag reordering
const listItems = await page.$$('[draggable="true"]');
for (let i = 0; i < listItems.length; i++) {
  for (let j = 0; j < listItems.length; j++) {
    if (i !== j) {
      await dragAndDrop(listItems[i], listItems[j]);
      // Record state change
    }
  }
}
```

---

### 11. Context Menus (Right-Click)
```
⚠️ PARTIALLY CAPTURED:
- Elements with oncontextmenu ✓ (we detect)
- Actually triggering and exploring menu ?
- Custom context menu options ?
```

**Gap:** We detect contextmenu handlers but don't systematically right-click everything and explore the menus.

**Fix Required:**
```javascript
// Already in robust-state-explorer, but need to actually explore the menu
actions.push({ action: 'rightclick', priority: 2 });

// After right-click, find and click menu items
const contextMenu = await page.$('[role="menu"], .context-menu, .dropdown-menu');
if (contextMenu) {
  const menuItems = await contextMenu.$$('[role="menuitem"], li');
  // Test each menu item
}
```

---

### 12. Print/PDF Styles
```
⚠️ NOT CAPTURED:
- @media print styles
- Print-specific layouts
- Page break rules
- PDF generation logic
```

**Gap:** We don't emulate print media or test print stylesheets.

**Fix Required:**
```javascript
// Emulate print
await page.emulateMedia({ media: 'print' });
await captureStyles(); // Capture print-specific styles
await page.emulateMedia({ media: 'screen' }); // Restore
```

---

### 13. Browser Storage Behaviors
```
⚠️ PARTIALLY CAPTURED:
- localStorage/sessionStorage values ✓
- IndexedDB data structure ?
- Cookie values ✓
- Cache API contents ?
- Storage event handlers ?
```

**Gap:** We capture storage values but not the full IndexedDB schema or storage event handlers.

**Fix Required:**
```javascript
// Capture IndexedDB schema
const databases = await indexedDB.databases();
for (const db of databases) {
  const connection = await openDB(db.name);
  capturedIndexedDB.push({
    name: db.name,
    version: db.version,
    objectStores: connection.objectStoreNames,
  });
}

// Test storage events
window.addEventListener('storage', (e) => {
  capturedStorageEvents.push(e);
});
```

---

### 14. Viewport/Resize Behaviors
```
⚠️ PARTIALLY CAPTURED:
- Media query breakpoints ✓ (from CSS)
- Actual resize behavior ?
- Orientation change behavior ?
- Dynamic viewport units (dvh, svh) ?
```

**Gap:** We capture media queries but don't actually resize and test each breakpoint.

**Fix Required:**
```javascript
// Test each breakpoint
const breakpoints = [320, 480, 768, 1024, 1280, 1920];
for (const width of breakpoints) {
  await page.setViewportSize({ width, height: 800 });
  await captureState(); // Capture at this breakpoint
}
```

---

### 15. Network Condition Behaviors
```
⚠️ NOT CAPTURED:
- Offline behavior
- Slow network behavior
- Network error handling UI
- Retry logic visualization
```

**Gap:** We don't test with network throttling or offline mode.

**Fix Required:**
```javascript
// Test offline
await page.context().setOffline(true);
await captureState(); // What does the UI show offline?
await page.context().setOffline(false);

// Test slow network
await page.context().route('**/*', route => {
  setTimeout(() => route.continue(), 2000); // 2s delay
});
```

---

## TIER 3: EXPONENTIAL COMPLEXITY (Theoretically possible, practically infeasible)

### 16. Full State Combination Explosion
```
⚠️ INCOMPLETE BY DESIGN:
- If there are 10 toggles, there are 2^10 = 1024 combinations
- If there are 20 elements with 3 states each, 3^20 = 3.5 billion combinations
- Sequence-dependent states multiply further
```

**Reality:** We use BFS with limits (maxStates, maxDepth). We will NOT explore all combinations.

**What We Miss:**
- Rare state combinations that reveal hidden features
- Specific sequences that trigger bugs/features
- Easter eggs requiring exact input sequences

**Mitigation:**
- Prioritize high-value actions (buttons > hovers)
- Use coverage metrics to identify gaps
- Allow targeted exploration of specific paths

---

### 17. Timing-Dependent Behaviors
```
⚠️ MAY MISS:
- Features that appear after 30 seconds of inactivity
- Debounced handlers (only fire after typing stops)
- Throttled scroll handlers (only fire every 100ms)
- Delayed tooltips (appear after 2s hover)
- Session timeout warnings
- Idle detection triggers
```

**Gap:** We use fixed settle times (300-500ms). Longer delays are missed.

**Fix Required:**
```javascript
// Try longer waits on some elements
const LONG_WAIT_ELEMENTS = ['[data-tooltip]', '[title]', '.help-icon'];
for (const selector of LONG_WAIT_ELEMENTS) {
  await page.hover(selector);
  await page.waitForTimeout(3000); // Wait 3 seconds
  // Check if tooltip appeared
}
```

---

### 18. Cross-Tab/Window Communication
```
⚠️ NOT CAPTURED:
- BroadcastChannel messages
- SharedWorker state
- postMessage between windows
- localStorage sync between tabs
- Multi-window app states (e.g., detached video player)
```

**Gap:** We operate in a single tab. Multi-tab behaviors are invisible.

**Fix Required (Complex):**
```javascript
// Would need to open multiple pages
const page2 = await context.newPage();
await page2.goto(url);
// Test cross-tab interactions
```

---

## TIER 4: DOMAIN-SPECIFIC GAPS

### 19. Canvas/WebGL Rendering Logic
```
⚠️ CAPTURED BUT NOT UNDERSTOOD:
- We capture draw calls, shaders, uniforms ✓
- We DON'T understand the logic that decides WHAT to draw
- Procedural generation algorithms
- Physics simulations
- Game logic
```

**Reality:** We can replay recorded draw calls but can't generate NEW content the way the original does.

---

### 20. Audio/Video Processing
```
⚠️ NOT CAPTURED:
- Web Audio API graphs (filters, effects)
- Audio synthesis logic
- Video processing (filters, effects)
- Real-time audio visualization logic
```

**Gap:** We'd need to intercept AudioContext, MediaStream, etc.

---

### 21. WebRTC
```
⚠️ NOT CAPTURED:
- Peer connection logic
- Video/audio stream handling
- Screen sharing
- Data channel communication
```

**Why:** Requires real peers, can't be cloned meaningfully.

---

## SUMMARY: COVERAGE REALITY CHECK

| Category | Captured | Notes |
|----------|----------|-------|
| DOM Structure | 99% | Shadow DOM included |
| CSS Styles | 95% | All pseudo-classes/elements |
| CSS Animations | 95% | Keyframes, transitions |
| Event Listeners | 90% | Sources captured, not all logic |
| WebGL/Canvas | 85% | Draw calls, not generation logic |
| Interactive States | 80% | Limited by combinatorial explosion |
| Keyboard Shortcuts | 50% | Only element-focused |
| Touch Gestures | 20% | Basic tap only |
| Network Behavior | 30% | Request/response pairs |
| Worker Scripts | 0% | Not intercepted |
| Server Logic | 0% | Impossible |

---

## RECOMMENDATIONS FOR MAXIMUM COVERAGE

### 1. Pre-Exploration Checklist
```markdown
Before running extraction, manually identify:
- [ ] Known keyboard shortcuts (check docs)
- [ ] Known gesture controls
- [ ] Login-gated content (provide test credentials)
- [ ] Admin-only views (if applicable)
- [ ] All URL routes (sitemap)
```

### 2. Run Multiple Passes
```javascript
// Pass 1: Desktop viewport
await runCompleteExtraction(page, { viewport: { width: 1920, height: 1080 } });

// Pass 2: Mobile viewport
await runCompleteExtraction(page, { viewport: { width: 375, height: 812 } });

// Pass 3: Tablet viewport
await runCompleteExtraction(page, { viewport: { width: 768, height: 1024 } });
```

### 3. Targeted Exploration for Known Features
```javascript
// If you know there's a keyboard shortcut
await page.keyboard.press('Control+k');
await captureState();

// If you know there's a swipe gesture
await page.touchscreen.swipe(startX, startY, endX, endY);
await captureState();
```

### 4. Manual Verification Pass
After automated extraction, manually check:
- Help/documentation pages (often list hidden features)
- Keyboard shortcut modals
- Mobile-specific features
- Admin panels
- Error states (trigger 404, 500, etc.)

---

## THE HONEST TRUTH

**What we CAN do:** Extract ~80-90% of visible UI behavior automatically.

**What we CAN'T do:**
- Clone server-side logic
- Discover every possible state combination
- Capture features we don't know exist
- Clone third-party integrations

**The clone will be:** A static/semi-functional replica that looks identical but lacks:
- Real backend functionality
- Real-time data
- Full interactivity depth
- Authentication flows

**Best used for:**
- Visual reference / design systems
- Prototyping
- Learning how sites are built
- UI testing baselines
- Offline viewing
