# Real Photopea vs Offline Version: Initialization Comparison

## Summary

**Critical Finding**: The offline version loads all scripts successfully but **does not create the global objects `J`, `fj`, and `gA`** that are expected by the application. This is the root cause of initialization failure.

## Script Loading Analysis

### Both Versions Load These Scripts:

1. **ext1767565813.js** (735KB) - Extensions/utilities
2. **DBS1764527275.js** (1.1MB) - Database/storage layer
3. **pp1767826327.js** (2.5MB) - Main Photopea engine

### Loading Confirmation:

```
Offline (localhost:3333):
✓ http://localhost:3333/code/ext/ext1767565813.js - 752KB loaded
✓ http://localhost:3333/code/dbs/DBS1764527275.js - 1.17MB loaded
✓ http://localhost:3333/code/pp/pp1767826327.js - 2.59MB loaded
```

All scripts successfully loaded with proper sizes and content.

## The Core Problem: Globals Not Created

### Expected Globals (from real site):
- `window.J` - Main application object
- `window.fj` - UI framework/window manager
- `window.gA` - Graphics/rendering engine

### Actual Result (offline):
```javascript
{
  hasJ: false,    // ✗ Missing
  hasFj: false,   // ✗ Missing
  hasGA: false,   // ✗ Missing

  // Instead, these exist:
  allShortGlobals: ["0","1","2",...,"cap","ls","ppp","ICC","FFT","LNG","aax","sas"]
}
```

## Why Globals Aren't Created

### Script Structure Analysis

The main script (pp1767826327.js) is wrapped in an IIFE:

```javascript
(function(){
  var ht=window.location.hostname.endsWith("jampea.com")?2:
         window.location.hostname=="www.vectorpea.com")?1:0;

  // ... 18,327 lines of code ...

  // Last line:
  document.body.appendChild(new fj().$)
})()
```

### The `ht` Variable (Host Type):

- `ht == 0` = photopea.com (full editor mode)
- `ht == 1` = vectorpea.com (vector mode)
- `ht == 2` = jampea.com (audio mode)

For `localhost`, `ht` is set to `0`, which is correct.

### The Problem:

1. **Scope Isolation**: All objects (`J`, `fj`, `gA`) are created **inside** the IIFE
2. **No Global Export**: The script never assigns these to `window`
3. **Self-Contained Execution**: The script runs, creates `fj`, and appends it to DOM, but doesn't expose the API

### Evidence from Console:

```
[LOG] adding @ http://localhost:3333/?test=1:355
[LOG] Extra parameter Spcn @ http://localhost:3333/code/pp/pp1767826327.js:11828
[LOG] 0 @ http://localhost:3333/code/pp/pp1767826327.js:238
[ERROR] TypeError: Cannot read properties of undefined (reading 'Rq')
    at fj.a3M (http://localhost:3333/code/pp/pp1767826327.js:...)
```

The script DOES run (`adding` log), but then fails because `fj` is trying to access something (`.Rq`) that doesn't exist.

## Key Differences

### Real Site (https://www.photopea.com):
- Cannot access due to network timeout
- Would need to test from a different network/location

### Offline Version (localhost:3333):
1. **URL Detection**:
   - Real site checks: `location.hostname == "www.photopea.com"`
   - Offline has: `location.hostname == "localhost"`

2. **CDN URLs**:
   - Real site loads from: `https://vecpea.com/code/pp/...`
   - Offline loads from: `http://localhost:3333/code/pp/...`

3. **Domain Checks Throughout Code**:
   ```javascript
   // Line 11:
   if(q.indexOf("photopea.com")!=-1||
      q.indexOf("vectorpea.com")!=-1||
      q.indexOf("jampea.com")!=-1) return"/"+z;
   ```

   Many conditional features based on domain detection.

## Root Cause

The application uses **multiple domain checks** that fail for `localhost`:

1. **Hostname checks** - Direct string comparisons
2. **URL pathname checks** - Looking for specific domains in referrer
3. **Feature flags** - Conditional initialization based on domain
4. **Environment detection** - Different behavior for different hosts

When these checks fail, certain initialization paths are skipped, preventing the global API objects from being properly exposed.

## Why The UI Still Appears

The DOM manipulation still works:
```javascript
document.body.appendChild(new fj().$)
```

The `fj` class creates and mounts the UI, so the visual editor appears. However, without the global API objects, interactive features fail.

## Solution Needed

To fix the offline version, we need to either:

1. **Patch the hostname checks** - Make the script think it's running on photopea.com
2. **Force global export** - Modify the script to explicitly assign globals
3. **Proxy approach** - Intercept domain checks and return expected values

The most robust approach would be option #3: proxy/intercept the domain detection functions before they're used.

## Technical Details

### Files in Cache:
- `r7.js` = ext1767565813.js (735KB)
- `r8.js` = DBS1764527275.js (1.1MB)
- `r9.js` = pp1767826327.js (2.5MB)

### Server Configuration:
The server (`/tmp/serve-patched.js`) already rewrites URLs:
```javascript
indexHtml = indexHtml.replace(/https:\/\/(www\.)?vecpea\.com/g, '');
indexHtml = indexHtml.replace(/https:\/\/(www\.)?photopea\.com/g, '');
```

But this doesn't affect the JavaScript runtime checks inside the scripts.

### Network Requests:
All critical scripts return 200 OK with full content. The issue is NOT with loading, but with the JavaScript execution environment.

## Next Steps

1. **Inject hostname override** before scripts load
2. **Patch domain detection functions** in the main script
3. **Test if bypassing checks allows global creation**

The file upload patch already exists. What's needed is an **initialization patch** that makes the script believe it's running on the real domain.
