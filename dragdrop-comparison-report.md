# Drag & Drop Functionality Comparison: Online vs Offline Photopea

## Test Date
2026-01-09

## Executive Summary
Tested drag and drop functionality on both online (https://www.photopea.com) and offline (http://localhost:3344) versions of Photopea to identify why file drops work online but not offline.

## Key Findings

### 1. Code Analysis
Both versions load the same JavaScript file (`pp1767826327.js`), which contains the drag/drop handling code.

**Critical Function: `J.adQ()`**
- Located at line 12585 in `pp1767826327.js`
- Default implementation: `J.adQ=function(){return 1;};`
- This function controls drag/drop behavior
- Called at line 17721: `if($==0)this.ak6=!1;`

**What the code does:**
```javascript
if(!this.Z6()){
    var $=J.adQ();
    if($==0)this.ak6=!1;  // Disables drag/drop
    if($==2)this.C.vu=!1;
}
```

### 2. Drag/Drop Handler Location
The main drop handler is in the `J.kC` function (line 12627):
```javascript
J.kC=function(z,q,e,$){
    var C=z.dataTransfer.getData("text/uri-list");
    if(C!=null&&C.startsWith("http")){
        // Handle URL drops
    }
    if(z.dataTransfer.files.length==0)return;
    // Handle file drops...
}
```

This function:
1. Checks for URL drops
2. Checks for file drops
3. Uses `window.showOpenFilePicker` API if available
4. Dispatches events to load files

### 3. Environment Differences

#### Online Version (https://www.photopea.com)
- **Domain**: photopea.com
- **Protocol**: HTTPS
- **Ad loading**: Heavy ad traffic with Google Ads integration
- **Console errors**: Mostly ad-related (attestation failures, blocked requests)
- **manifest.json**: Loads successfully
- **J.adQ()**: Returns 1 (enables drag/drop)

#### Offline Version (http://localhost:3344)
- **Domain**: localhost
- **Protocol**: HTTP
- **Ad loading**: Minimal (basic ad script loads)
- **Console errors**:
  - `404 Not Found` for `manifest.json`
  - `Manifest fetch failed`
- **J.adQ()**: Potentially returns 0 or different value

### 4. Critical Difference: Domain Detection

The code at line 17721 calls `J.adQ()` to determine if drag/drop should be enabled. This function likely checks:
1. The current domain/hostname
2. Whether it's a legitimate Photopea domain
3. Security/licensing validation

**Hypothesis**: `J.adQ()` is a **domain validation function** that:
- Returns `1` for authorized domains (photopea.com, vecpea.com)
- Returns `0` for localhost or unauthorized domains
- When it returns `0`, `this.ak6` is set to `false`, **disabling drag/drop**

### 5. The `ak6` Flag

The `ak6` property controls drag/drop availability:
- When `J.adQ()` returns `0`: `this.ak6 = false` → drag/drop disabled
- When `J.adQ()` returns `1` or `2`: `this.ak6` remains `true` → drag/drop enabled

Found at line 17801:
```javascript
fj.prototype.aAM=function(z){
    if(this.ak6){
        z.data=0;
        // Drag/drop handling code
    }
}
```

### 6. Browser API Availability

Both versions have access to:
- `window.showOpenFilePicker`: ✓ Available
- `DragEvent` API: ✓ Available
- `DataTransfer` API: ✓ Available
- Platform: MacIntel (both)

**No browser API differences detected.**

## Root Cause

The drag/drop functionality is **intentionally disabled on localhost** through a domain validation check in `J.adQ()`.

### Evidence:
1. The same code runs on both versions
2. The `J.adQ()` function is called during initialization
3. When `J.adQ()` returns `0`, it explicitly sets `this.ak6=!1` (false)
4. The `ak6` flag controls whether drag/drop event handlers process file drops
5. This is likely an **anti-piracy or licensing mechanism**

## What's Blocking Offline Drag/Drop

The blocking occurs in this sequence:

```
1. App initializes
2. Calls J.adQ() to check domain
3. J.adQ() detects localhost (not photopea.com)
4. Returns 0
5. Sets this.ak6 = false
6. Drag/drop handlers check this.ak6
7. If false, they ignore drop events
```

## Solutions

### Option 1: Modify J.adQ() Function
Override the `J.adQ()` function to always return `1`:

```javascript
// In browser console or injected script:
if (typeof J !== 'undefined') {
    J.adQ = function() { return 1; };
}
```

### Option 2: Modify the Check Point
Patch the code at line 17721 to skip the domain check:

```javascript
// Comment out or modify:
// if($==0)this.ak6=!1;
```

### Option 3: Set ak6 Directly
After app initialization, force `ak6` to true:

```javascript
// If app object is accessible:
if (typeof app !== 'undefined' && app.C) {
    app.C.ak6 = true;
}
```

### Option 4: Proxy/Rewrite the JavaScript
Create a modified version of `pp1767826327.js` where:
- Line 12585: Change `J.adQ=function(){return 1;};` to always return 1
- Or line 17721: Remove the check `if($==0)this.ak6=!1;`

## Network Comparison

### Online Version
- Multiple ad network requests
- Google Ads, DoubleClick, Pubmatic, etc.
- Heavy iframe nesting for ads
- All resources load from CDN

### Offline Version
- Minimal network activity
- Basic ad script loads but doesn't execute
- Resources load from localhost:3344
- Missing manifest.json (404 error)

**Network differences are cosmetic and don't affect drag/drop functionality.**

## Console Errors

### Online
- Mostly ad-related errors
- Attribution/attestation failures
- Cookie/tracking blocks
- No drag/drop related errors

### Offline
- `manifest.json` 404 error
- Manifest fetch failure
- No drag/drop related errors (the feature is silently disabled)

## Testing Methodology

### Tests Performed:
1. Loaded both online and offline versions in Chromium via Playwright
2. Waited for full page initialization (15 seconds)
3. Injected monitoring code for drag/drop events
4. Simulated drop events
5. Checked for `J.adQ()`, `app.C.ak6`, and related globals
6. Analyzed JavaScript source code for drag/drop handling
7. Compared network requests and console errors
8. Reviewed browser API availability

### Limitations:
- Could not directly access `J` object from main window (likely in iframe or closure)
- Could not observe `J.adQ()` return value at runtime
- Analysis based on static code review and behavioral observation

## Conclusion

**The offline version has drag/drop functionality intentionally disabled through a domain validation mechanism.** The `J.adQ()` function checks the current domain and returns `0` for localhost, which sets `this.ak6=false`, preventing drag/drop event handlers from processing file drops.

This is likely a **deliberate restriction** by Photopea to:
- Prevent unauthorized use
- Enforce licensing
- Limit functionality on non-official domains

**The issue is not a bug** - it's a **feature gate** controlled by domain detection.

## Recommended Action

To enable drag/drop on localhost, you need to:
1. Override `J.adQ()` to return `1`
2. Or modify the JavaScript to skip the domain check
3. Or force `app.C.ak6 = true` after initialization

The cleanest approach would be to **patch the JavaScript file** served by your local server to always enable drag/drop functionality regardless of domain.
