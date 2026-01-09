# Extraction Gap Analysis: Why Photopea Functionality Doesn't Work Offline

## What We Successfully Capture ✅

1. **Static Resources** - All JS, CSS, images, fonts (3,951 files)
2. **Event Handler Registration** - 805 click handlers correctly registered
3. **Event Propagation** - Events bubble through component hierarchy
4. **Visual Appearance** - UI renders perfectly
5. **Code Execution** - JavaScript runs and handlers fire

## What We're Missing ❌

### Gap 1: Initial HTML State
**Problem**: We capture HTML at a specific moment, but state changes before that moment are lost.

```javascript
// In the live site, the HTML might start as:
<div id="app" data-initialized="false"></div>

// Then during load, JS modifies it:
document.getElementById('app').dataset.initialized = "true";

// But we capture the HTML AFTER this modification:
<div id="app" data-initialized="true"></div>

// When we serve offline, the JS runs AGAIN and might double-initialize or skip initialization
```

**Evidence in Photopea**:
- The `fj` constructor has initialization code that runs
- It checks flags like `this.ak6`, `this.awG`, `this.TF`
- These flags control whether features are enabled
- We captured the HTML after initialization, but the JS expects to initialize fresh

### Gap 2: Timing-Dependent Initialization
**Problem**: Some initialization depends on when scripts run relative to each other.

```javascript
// Script 1 (loaded first):
window.appConfig = { initialized: false };

// Script 2 (loaded second):
if (!window.appConfig.initialized) {
  setupApp();
  window.appConfig.initialized = true;
}

// Offline: If we capture HTML with both scripts in a different order,
// or if scripts are inlined/bundled differently, initialization can fail
```

**Evidence in Photopea**:
- The initialization code at line ~12800 in r9.js:
```javascript
fj.prototype.aeP=function(){
  J.j4[hb.aJv](this.ad6.bind(this), ...);
  var z=ku.bc(); // Fetches config
  if(z!=null&&z.globals!=null&&ht<2)this.aBZ(z.globals);
  else{
    this.awG=!0; // FLAG SET HERE
    var q=cN.awX();
    if(q&&q.length!=0){
      var e=q[0];
      cN.aDr(e,this.aLO)
    }
  }
}
```
- `ku.bc()` might return different data offline vs online
- This affects whether `this.awG` gets set

### Gap 3: Environment Detection
**Problem**: Apps detect if they're running in expected environment and disable features if not.

```javascript
// Common patterns:
if (location.hostname === 'www.photopea.com') {
  enableFeature();
} else {
  disableFeature(); // Runs offline
}

// Or:
if (isProduction()) {
  initializeApp();
} else {
  this.ak6 = true; // Disable premium features
}
```

**Evidence in Photopea**:
```javascript
// In fj.prototype.aAM:
if(this.ak6){z.data=0; return z.d}

// And in initialization:
var $=J.adQ();
if($==0)this.ak6=!0; // DISABLES FEATURES BASED ON ENVIRONMENT
```
- `J.adQ()` likely checks environment (domain, referrer, etc.)
- If it detects we're not on the real domain, it sets `ak6=true`
- This blocks ALL interactive features

### Gap 4: Cross-Script Communication
**Problem**: Scripts communicate via global state that's set up in a specific order.

```javascript
// Script A initializes:
window.APP = {
  components: {},
  register: function(name, component) {
    this.components[name] = component;
  }
};

// Script B tries to use it:
window.APP.register('dialog', DialogComponent);

// Offline: If Script B loads before Script A, it fails silently
```

**Evidence in Photopea**:
- The `jp` object (dialog manager) needs to be initialized
- `this.jp=new eO; this.jp.parent=this;` happens in `fj` constructor
- But `jp.a5u` (the function that creates dialogs) might depend on other initialization
- We see: `this.jp.a5u(z.data.Dm, ...)` is called but dialog doesn't appear

### Gap 5: Inline Script Execution Order
**Problem**: Our extraction might change the order of script execution.

**What happens live**:
1. HTML loads with inline `<script>window.init=true</script>`
2. External script loads: `if(window.init) setup()`
3. Everything works

**What happens offline**:
1. We might have moved inline scripts
2. Or combined them differently
3. External script runs before inline script
4. `window.init` is undefined, setup doesn't run

**Evidence in Photopea**:
- The HTML has multiple inline scripts
- Our extraction might serialize them differently
- Timing of `fj` constructor vs other initializers might be off

## The Root Cause for Photopea

Looking at the `aAM` handler:
```javascript
fj.prototype.aAM=function(z){
  if(this.ak6){z.data=0; return z.d}  // EARLY EXIT
  // ... rest of handler
}
```

And the initialization:
```javascript
var $=J.adQ();
if($==0)this.ak6=!0;  // Sets flag based on environment
if($==2)this.C.vu=!1; // Disables premium features
```

**The Issue**: `J.adQ()` is an environment check. It likely:
- Checks `window.location.hostname`
- Checks `document.referrer`
- Checks for specific cookies/storage
- Validates the app is running on photopea.com

When it detects we're on `localhost:3333`, it returns `0`, which sets `ak6=true`, which **disables ALL interactive features**.

## What Our Extractor Needs to Do

### Solution 1: Environment Spoofing
```javascript
// Before any scripts run, set up environment to look like production
Object.defineProperty(window, 'location', {
  value: {
    hostname: 'www.photopea.com',
    href: 'https://www.photopea.com/',
    origin: 'https://www.photopea.com',
    // ... rest of location properties
  }
});
```

### Solution 2: Flag Patching
```javascript
// Detect and patch the environment check
// Find: if($==0)this.ak6=!0;
// Replace: if($==0)this.ak6=!1;  // Force enable
```

### Solution 3: Capture Initialization State
```javascript
// After app fully initializes on live site, capture:
const initState = {
  ak6: false,
  awG: false,
  TF: true,
  vu: true,
  // ... all initialization flags
};

// Offline, inject this state before app runs:
window.__INIT_STATE__ = initState;
```

### Solution 4: Better HTML Snapshot
```javascript
// Instead of capturing HTML after modification:
// 1. Capture ORIGINAL HTML
// 2. Capture initialization sequence as separate script
// 3. Replay initialization exactly as it happened
```

## Systematic Fix for Our Extractor

Our V6 extractor needs these additions:

### 1. Capture Pre-Initialization HTML
```javascript
// Very first thing after navigation
const originalHTML = await page.content();
```

### 2. Monitor State Changes
```javascript
await page.evaluate(() => {
  window.__stateChanges = [];

  // Monitor all property sets on important objects
  const trackObject = (obj, name) => {
    return new Proxy(obj, {
      set(target, prop, value) {
        window.__stateChanges.push({
          object: name,
          property: prop,
          value: value,
          stack: new Error().stack
        });
        target[prop] = value;
        return true;
      }
    });
  };
});
```

### 3. Detect Environment Checks
```javascript
// Find all location/referrer accesses
await page.evaluate(() => {
  const originalLocation = window.location;
  Object.defineProperty(window, 'location', {
    get() {
      console.log('[ENV CHECK] location accessed', new Error().stack);
      return originalLocation;
    }
  });
});
```

### 4. Capture Initialization Flags
```javascript
// After app loads, find all boolean flags that might control features
const initFlags = await page.evaluate(() => {
  const flags = {};
  // Search through all objects for boolean flags
  const searchObject = (obj, path = '') => {
    for (const key in obj) {
      if (typeof obj[key] === 'boolean') {
        flags[path + key] = obj[key];
      }
    }
  };
  return flags;
});
```

### 5. Create Offline Initialization Patch
```javascript
// Generate a script that sets up the offline environment
const offlinePatch = `
<script>
// Spoof environment
Object.defineProperty(window, 'location', {
  value: {
    hostname: '${originalHostname}',
    href: '${originalHref}',
    // ... complete location object
  }
});

// Restore initialization state
window.__restoreInitState = function() {
  ${Object.entries(initFlags).map(([k, v]) => `${k} = ${v};`).join('\n')}
};
</script>
`;
```

## The Fundamental Problem

**Our extractor captures WHAT exists, not HOW it got there.**

We're like taking a photograph of a house vs recording how it was built:
- We capture the finished house (HTML with scripts loaded)
- But we don't capture the construction sequence (order of initialization)
- When we "rebuild" offline, we use the same materials but different sequence
- The house looks the same but the wiring doesn't work

**What we need**: Record the SEQUENCE of initialization, not just the end state.
