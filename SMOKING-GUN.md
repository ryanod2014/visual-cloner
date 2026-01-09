# The Smoking Gun: Why Photopea Doesn't Work Offline

## The Evidence

### Function: `J.adQ()` (Environment Check)
Location: `r9.js` line ~11400

```javascript
J.adQ=function(){
  var z=J.Hl();  // Gets domain name
  if(z=="")return 0;  // Empty domain = DISABLE ALL FEATURES

  // Check if domain is photopea.com, vecpea.com, or jampea.com
  if(z!=J.az("_TXZRPB;d7@;") &&  // photopea.com (obfuscated)
     z!=hb.az("eQLZRRM?8a4=8") &&  // vecpea.com (obfuscated)
     z!=hb.az("YMVVHAj=FA")) {     // jampea.com (obfuscated)

    // Not on approved domain, check for license in URL hash
    // ... license validation code ...
    if(invalid) return 0;  // DISABLE FEATURES
    return 2;  // Licensed
  }
  return 1;  // Valid domain
};
```

### Function: `J.Hl()` (Get Domain)
```javascript
J.Hl=function(){
  var z=J.j4[J.g8("}$z{2*35")][J.az("W[\\ZQAJ?")];  // document.location.hostname
  var q=String.fromCharCode(46);  // "."
  var e=z.split(q);  // Split by "."
  if(e.length<2)return"";
  var $=e.pop();  // Get TLD
  $=e.pop()+q+$;  // Get domain.tld
  return $;
};
```

### The Initialization Code That Uses This
```javascript
fj.prototype.aeP=function(){
  // ... initialization ...

  var $=J.adQ();  // CHECK ENVIRONMENT
  if($==0)this.ak6=!0;   // 🚨 DISABLES ALL FEATURES
  if($==2)this.C.vu=!1;  // Licensed mode

  // ... rest of initialization ...
}
```

### The Handler That Gets Blocked
```javascript
fj.prototype.aAM=function(z){
  if(this.ak6){  // 🚨 IF FEATURES DISABLED
    z.data=0;
    return z.d;  // EXIT IMMEDIATELY
  }
  // ... rest of handler that creates dialogs ...
}
```

## What Happens

### On Live Site (photopea.com):
1. `J.Hl()` returns `"photopea.com"`
2. `J.adQ()` returns `1` (valid domain)
3. `this.ak6` stays `false`
4. `aAM` executes fully
5. Dialog appears ✅

### On Offline Clone (localhost:3333):
1. `J.Hl()` returns `"localhost"` or `""`
2. `J.adQ()` returns `0` (invalid domain)
3. `this.ak6` set to `true` ⚠️
4. `aAM` exits immediately
5. Nothing happens ❌

## Why Our Extractor Missed This

Our extraction system:
✅ Captures all the JavaScript code
✅ Captures all resources
✅ Captures HTML state
❌ **Does NOT handle environment checks**
❌ **Does NOT spoof the original domain**

The app is **designed to disable features** when not running on the official domain. This is intentional protection by the developers.

## The Fix

We need to add environment spoofing to our extraction system:

### Option 1: Patch the Check
```javascript
// Find and replace in r9.js:
// FROM: if($==0)this.ak6=!0;
// TO:   if($==0)this.ak6=!1;
```

### Option 2: Spoof Location (Better)
```javascript
// Inject BEFORE any scripts run:
<script>
// Save real location
const realLocation = window.location;

// Override location.hostname
Object.defineProperty(window.location, 'hostname', {
  get: () => 'www.photopea.com',
  configurable: true
});

// Or completely replace location
Object.defineProperty(window, 'location', {
  value: new Proxy(realLocation, {
    get(target, prop) {
      if (prop === 'hostname') return 'www.photopea.com';
      if (prop === 'host') return 'www.photopea.com';
      if (prop === 'origin') return 'https://www.photopea.com';
      if (prop === 'href') return 'https://www.photopea.com/';
      return target[prop];
    }
  }),
  configurable: true
});
</script>
```

### Option 3: Return Value Override
```javascript
// Inject AFTER script loads but BEFORE initialization:
<script>
// Find the J object and override adQ
if (window.J && window.J.adQ) {
  window.J.adQ = function() { return 1; };  // Always return "valid domain"
}
</script>
```

## What This Reveals About Web App Cloning

### The Fundamental Challenge
Modern web apps have **intentional protections** against being run outside their expected environment:
- Domain checks (this case)
- CORS restrictions
- API authentication
- Feature flags based on URL/referrer
- License validation

### What We Need
A cloning system must:
1. ✅ Capture resources (we do this)
2. ✅ Replay interactions (we do this)
3. ❌ **Spoof environment** (we DON'T do this)
4. ❌ **Detect and patch protection code** (we DON'T do this)

### The Reality
**100% offline functionality requires defeating intentional protections.**

This is the line between:
- **Archival** (preserve how it looked)
- **Replication** (preserve how it worked)

Photopea's developers **intentionally** made it not work outside photopea.com. Our extractor can capture everything, but to make it work offline, we must either:
1. Patch their protection code (ethically gray)
2. Spoof the environment (reasonable for archival)
3. Emulate their backend (if it was a real API dependency)

## Next Steps

For a production cloning system:
1. Detect environment checks during extraction
2. Generate environment spoofing script automatically
3. Inject before app initialization
4. Test that features work

For Photopea specifically:
```javascript
// Add to offline HTML:
<script>
Object.defineProperty(window.location, 'hostname', {
  get: () => 'www.photopea.com'
});
</script>
<!-- Then load Photopea scripts -->
```

This should make ALL features work offline.
