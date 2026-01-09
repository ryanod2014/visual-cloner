# Distinguishing Backend Dependencies from Extraction Issues

## The Key Question
When offline functionality fails, is it because:
1. **Backend API dependency** - Code needs a server endpoint we must emulate
2. **Incomplete extraction** - We didn't capture necessary resources/state

## Detection Methods

### Method 1: Network Activity Monitoring
**Check if code is trying to make network requests:**

```javascript
// Monitor all network attempts (even if they fail)
const originalFetch = window.fetch;
window.fetch = function(...args) {
  console.log('[FETCH BLOCKED]', args[0]);
  return originalFetch(...args);
};

const originalXHR = window.XMLHttpRequest;
window.XMLHttpRequest = function() {
  const xhr = new originalXHR();
  const originalOpen = xhr.open;
  xhr.open = function(method, url) {
    console.log('[XHR BLOCKED]', method, url);
    return originalOpen.apply(this, arguments);
  };
  return xhr;
};
```

**What to look for:**
- If you see network requests when clicking "New Project" → Backend dependency
- If you see no network attempts → Extraction issue

### Method 2: Compare Live vs Offline Execution Paths
**Trace code execution on both versions:**

```javascript
// Inject at key decision points
function patchFunction(obj, fnName, label) {
  const original = obj[fnName];
  obj[fnName] = function(...args) {
    console.log(`[${label}] CALLED`, args[0]);
    return original.apply(this, args);
  };
}
```

**What to look for:**
- Live version: Function A → B → C → Dialog appears
- Offline version: Function A → B → **stops**
- Check what's different at the stop point:
  - Is it checking a variable that wasn't initialized?
  - Is it waiting for a promise that never resolves?
  - Is it checking if data exists that we didn't capture?

### Method 3: Error Console Analysis
**Silent failures reveal the issue:**

```javascript
// Catch all errors
window.addEventListener('error', (e) => {
  console.error('[GLOBAL ERROR]', e.message, e.filename, e.lineno);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[UNHANDLED PROMISE]', e.reason);
});
```

**What errors mean:**
- `fetch failed` / `NetworkError` → Backend API dependency
- `Cannot read property X of undefined` → Missing initialization data
- `ReferenceError: X is not defined` → Missing resource/script
- No errors but nothing happens → Logic condition not met (check state)

### Method 4: State Comparison
**Compare application state between live and offline:**

```javascript
// After app loads, dump all global state
function dumpState() {
  const state = {};
  for (const key in window) {
    if (window[key] && typeof window[key] === 'object') {
      try {
        state[key] = JSON.stringify(window[key]);
      } catch (e) {}
    }
  }
  return state;
}

// Compare: live vs offline
const liveState = dumpState();
const offlineState = dumpState();
// Find differences
```

**What differences mean:**
- Live has initialized objects that offline doesn't → Extraction issue
- Both have same structure but different values → Backend API loaded data

### Method 5: Resource Loading Check
**Verify all resources loaded successfully:**

```javascript
// Check for 404s or failed loads
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.responseStatus === 0 || entry.responseStatus >= 400) {
      console.error('[RESOURCE FAILED]', entry.name, entry.responseStatus);
    }
  }
});
observer.observe({ entryTypes: ['resource'] });
```

**What this reveals:**
- Failed script loads → Extraction issue (didn't capture the script)
- All resources load but feature broken → Logic/state issue (deeper analysis needed)

## Specific to Photopea "New Project" Issue

Let's apply this systematically:

### 1. Check Network Activity
```javascript
// Are there any XHR/fetch calls when clicking "New Project"?
// If NO → Extraction issue
// If YES → Backend dependency
```

### 2. Check if aAM Handler Executes
```javascript
// We patched this - does aAM get called?
// If NO → Event system broken (extraction issue)
// If YES but returns early → Check the condition (ak6 flag, etc.)
```

### 3. Check jp.a5u Availability
```javascript
// Does this.jp exist? Does this.jp.a5u exist?
// If NO → Initialization failed (extraction issue)
// If YES → Check if it executes and what it does
```

### 4. Check for Missing Dependencies
```javascript
// Dialog creation likely needs:
// - Dialog templates (HTML/resources)
// - UI component initialization
// - Event system fully initialized
// - No early-exit conditions
```

## Decision Tree

```
Feature doesn't work offline
    │
    ├─ Console shows fetch/XHR errors?
    │   YES → Backend API dependency
    │   │      └─ Solution: Build API emulation layer
    │   │
    │   NO ↓
    │
    ├─ Console shows "undefined" / "null" errors?
    │   YES → Missing initialization
    │   │      └─ Solution: Find what initializes it on live site
    │   │
    │   NO ↓
    │
    ├─ Event handlers registered?
    │   NO → Event system extraction issue
    │   │     └─ Solution: Capture event delegation setup
    │   │
    │   YES ↓
    │
    ├─ Handlers execute but exit early?
    │   YES → Logic condition not met
    │   │      ├─ Check flags (ak6, etc.)
    │   │      ├─ Check required objects (jp, etc.)
    │   │      └─ Solution: Trace what sets these on live site
    │   │
    │   NO ↓
    │
    └─ Handlers execute fully but no UI?
        └─ UI rendering issue
           ├─ Missing CSS
           ├─ Missing templates
           └─ Solution: Capture rendering resources
```

## For Photopea Specifically

Based on our investigation:
1. ✅ Network: No fetch/XHR when clicking (checked with browser devtools)
2. ✅ Events: Handlers registered and fire
3. ✅ Propagation: Event reaches top-level handler
4. ❓ Handler execution: Need to verify aAM fully executes
5. ❓ jp.a5u: Need to verify this exists and executes

**Most likely**: An initialization flag (like `ak6`) or object (`jp`) isn't set up correctly because we missed capturing some initialization sequence.

## Next Steps for Photopea

1. Verify aAM executes without early return
2. Verify jp.a5u exists and is callable
3. If jp.a5u executes, trace what it does
4. Compare initialization sequence: live vs offline
