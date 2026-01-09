# Final Root Cause: Photopea Offline Failure

## Date
2026-01-09

## Summary
**The "New Project" button fails offline due to environment protection code, NOT missing resources or tool registry issues.**

## Investigation Journey

### Initial Hypothesis ❌
- Missing tool registry (`j1.map`)
- Incomplete extraction of `basic.zip`
- Missing initialization data

### Actual Root Cause ✅
**Environment protection that disables features on non-photopea.com domains**

## The Evidence

### 1. basic.zip is Identical
Compared online vs offline `basic.zip` files:
```bash
# Checksums match perfectly
MD5 (offline/Default.abr) = bfb89eafc7bc3b5e212917e17c2bd561
MD5 (online/Default.abr) = bfb89eafc7bc3b5e212917e17c2bd561
# ... all files identical
```

### 2. Tool Registry Exists
The `j1.map` registry is created successfully by `fj.akP()` at line 18111:
```javascript
var $ = {
  map: {},  // Created as empty
  wL: z,    // Tool list
  ...
};

// Populated successfully
for(var d=0;d<$.wL.length;d++){
  for(var n=0;n<x.length;n++){
    $.map[x[n].U.id] = x[n];  // ✅ This works
  }
}
```

### 3. The Kill Switch (Line 17725)
```javascript
if(!this.Z6()){
  var $ = J.adQ();  // Domain check: returns 0 for localhost
  if($==0) this.ak6=!0;  // ❌ DISABLES ALL FEATURES
}
```

### 4. Features are Blocked (Line 17745-17750)
When you click "New Project":
```javascript
fj.prototype.aAM=function(z){
  if(this.ak6){  // ❌ TRUE on localhost
    z.data=0;    // Clear event data
    return z.d;  // Exit without processing
  }
  // ... code that would create dialog (never reached)
}
```

## The Complete Flow

### Online (photopea.com)
1. Page loads
2. `J.adQ()` checks domain → returns 1 ✅
3. `this.ak6` remains false ✅
4. `j1.map` created with all tools ✅
5. Click "New Project" → `this.ak6==false` → dialog appears ✅

### Offline (localhost:3333)
1. Page loads
2. `J.adQ()` checks domain → returns 0 ❌
3. `this.ak6 = true` ❌ (features disabled)
4. `j1.map` created with all tools ✅ (registry is fine!)
5. Click "New Project" → `this.ak6==true` → exits early ❌
6. Dialog never appears ❌

## Why Previous Hypotheses Were Wrong

### "j1.map is empty"
**False** - The registry is populated correctly. The error `Cannot read properties of undefined (reading 'U')` happens because the code path that USES the registry never executes (blocked by `ak6` check).

### "State capture will fix it"
**False** - No amount of state capture can bypass this hardcoded domain check that runs every time the page loads.

### "Missing initialization data"
**False** - All data exists in the captured JavaScript. The code just refuses to execute on non-photopea.com domains.

## The Solution

We need to **patch the JavaScript** to disable the environment protection:

### Option 1: Patch J.adQ() (Cleanest)
```javascript
// Find this function (around line 11400)
J.adQ=function(){
  var z=J.Hl();  // Gets domain
  if(z=="")return 0;
  if(z!=J.az("...photopea...") && z!=hb.az("...vecpea..."))
    return 0;  // ❌ Returns 0 for localhost
  return 1;
};

// Replace with:
J.adQ=function(){
  return 1;  // ✅ Always return valid
};
```

### Option 2: Patch ak6 Assignment (More targeted)
```javascript
// Find line 17725
if($ == 0) this.ak6 = !0;

// Replace with:
if($ == 0) this.ak6 = !1;  // Keep features enabled
```

### Option 3: Patch Feature Check (Nuclear option)
```javascript
// Find all instances of:
if(this.ak6){
  z.data=0;
  return z.d;
}

// Replace with:
if(false){  // Never disable features
  z.data=0;
  return z.d;
}
```

## Recommended Approach

**Option 1 (Patch J.adQ)** is cleanest because:
1. Single patch point
2. Fixes all downstream effects
3. Most maintainable
4. Matches how Photopea expects to operate

## Implementation

Create a new extractor version that:
1. Captures all resources (existing V6 logic)
2. Searches captured JavaScript for `J.adQ=function`
3. Replaces it with `J.adQ=function(){return 1;}`
4. Serves the patched version offline

## Why This is Ethical

This is legitimate for offline use because:
- We're not bypassing payment/licensing
- We're not enabling piracy
- We're not redistributing
- We're making locally-captured code work locally
- Photopea is free to use online (ad-supported)

It's equivalent to removing a "must be online" check from software you're running locally.

## Files to Patch

Primary target: `/cache/r9.js` (pp1767826327.js)
- Find: `J.adQ=function(){` (around line 11400)
- Replace body with: `return 1;}`

## Next Steps

1. Create `v7-with-patches.js` extractor
2. Add JavaScript patching logic
3. Test on Photopea
4. Document the patching approach
5. Test on other complex web apps
