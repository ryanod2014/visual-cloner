# Extraction Completeness Methodology

## The HEIC Lesson: Why Initial Extraction Isn't Enough

**Problem:** V6 captured 3,951 files perfectly, but HEIC still failed offline.

**Why:** Lazy-loaded resources (~7 MB of decoders) only appear when you trigger specific features.

**This teaches us:** **Extraction must EXERCISE all features, not just load the initial page.**

---

## The Three Types of Resources

### 1. Static Resources (Always Captured) ✅
```
- Initial HTML
- CSS stylesheets
- Main JavaScript bundles
- Images, fonts, icons shown on first load
- Preloaded assets
```

**Captured by:** Basic page load
**Example:** Photopea's r9.js, all UI icons

### 2. Lazy-Loaded Resources (Often Missed) ⚠️
```
- Format decoders loaded on-demand
- Feature modules loaded when first used
- Dynamic imports (import())
- Resources loaded by specific user actions
- Code-split bundles
```

**Captured by:** Triggering that specific feature
**Example:** HEIC decoder (only loads when opening HEIC file)

### 3. Dynamic/Generated Resources (Can't Pre-Capture) ❌
```
- Real-time API responses
- User-specific data
- Session-based content
- Dynamically generated images/files
```

**Can't extract:** Must mock, proxy, or recreate
**Example:** User's saved projects, analytics data

---

## Ensuring Completeness: The Exhaustive Approach

### Phase 1: Initial Capture (V6 Baseline)
```javascript
// Capture everything loaded on first page visit
await page.goto(url);
await page.waitForNetworkIdle();
// Result: ~80% of static resources
```

### Phase 2: Feature Triggering (V7 Enhancement)
```javascript
// Systematically trigger ALL features
const features = [
  // File operations
  'Open file dialogs',
  'Test all file formats (PNG, JPG, HEIC, JXL, PSD, etc.)',
  'Save/export in all formats',

  // Tools
  'Click every toolbar button',
  'Open every menu',
  'Trigger every dialog',

  // Settings
  'Change preferences',
  'Switch themes',
  'Enable/disable features',

  // Advanced
  'Keyboard shortcuts',
  'Right-click menus',
  'Drag operations',
  'Paste operations'
];

for (const feature of features) {
  await triggerFeature(feature);
  await captureNewResources();
}
```

### Phase 3: Network Monitoring
```javascript
// Track EVERY network request during feature testing
page.on('request', request => {
  trackRequest(request.url());
});

page.on('requestfailed', request => {
  logMissingResource(request.url());
});
```

### Phase 4: Completeness Validation
```javascript
// Test offline and compare
const onlineResources = await captureOnlineRequests();
const offlineResources = await testOfflineRequests();

const missing = onlineResources.filter(r => !offlineResources.includes(r));
// Missing resources indicate incomplete extraction
```

---

## Photopea-Specific Missing Resources

### What V6 Missed

**HEIC/JXL/AVIF Decoders** (~7.1 MB):
```
/code/ext_formats/
├── formatsLoader.html    (5.8 KB)  - Loader iframe
├── libheif.js           (140 KB)   - HEIC decoder
├── libheif.wasm         (858 KB)   - HEIC WASM
├── jxl_dec.js          (1.1 MB)   - JXL decoder
├── jxl_enc.js          (1.8 MB)   - JXL encoder
└── avif_enc.js         (3.4 MB)   - AVIF encoder
```

**Why missed:** Only loaded when opening HEIC/JXL files
**How to catch:** Open test files in all supported formats during extraction

### Other Potentially Missing Resources

**Check for:**
1. **Font files** - Loaded when specific fonts used
2. **Plugin modules** - Loaded for advanced features
3. **Worker scripts** - Background processing
4. **WASM modules** - Performance-critical decoders
5. **External libraries** - CDN resources for specific features
6. **Locale files** - Translation files for other languages
7. **Theme assets** - Additional UI themes
8. **Tutorial/help content** - First-time user guides

---

## V7 Extractor Design: Exhaustive Capture

### Architecture

```javascript
class V7ExhaustiveExtractor {
  async extract(url) {
    // Phase 1: Initial capture (V6 baseline)
    const initial = await this.captureInitialLoad(url);

    // Phase 2: Feature discovery
    const features = await this.discoverFeatures(url);

    // Phase 3: Exhaustive triggering
    const additional = await this.triggerAllFeatures(features);

    // Phase 4: Validation
    await this.validateCompleteness(initial + additional);

    // Phase 5: Apply patches
    return this.applyProtectionPatches();
  }

  async triggerAllFeatures(features) {
    const resources = [];

    // File format testing
    for (const format of ALL_FILE_FORMATS) {
      await this.openTestFile(format);
      resources.push(...this.captureNewRequests());
    }

    // UI exploration
    await this.clickAllButtons();
    await this.openAllMenus();
    await this.openAllDialogs();

    // Keyboard shortcuts
    await this.triggerAllShortcuts();

    // Settings/preferences
    await this.changeAllSettings();

    return resources;
  }
}
```

### Test File Library

Create test files for ALL formats:
```
test-files/
├── test.png
├── test.jpg
├── test.heic      ← Triggers HEIC decoder
├── test.jxl       ← Triggers JXL decoder
├── test.avif
├── test.webp
├── test.psd
├── test.xcf
├── test.sketch
├── test.tiff
├── test.cr2       ← Triggers RAW decoder
├── test.svg
├── test.pdf
└── ... all supported formats
```

During extraction:
```javascript
for (const testFile of testFiles) {
  await page.evaluate((file) => {
    // Simulate file drop
    const blob = await fetch(file).then(r => r.blob());
    const event = new DragEvent('drop', {
      dataTransfer: { files: [new File([blob], testFile.name)] }
    });
    document.body.dispatchEvent(event);
  }, testFile);

  // Wait for decoder to load
  await page.waitForTimeout(2000);

  // Capture any new network requests
  captureNewResources();
}
```

---

## Detection Strategies

### Strategy 1: Code Analysis

Search extracted code for lazy-loading patterns:

```javascript
// Dynamic imports
import('module')

// Conditional script loading
const script = document.createElement('script');
script.src = '...';

// Iframe loading
iframe.src = '...';

// Fetch calls
fetch('resource.wasm')

// Worker creation
new Worker('worker.js')
```

**Implementation:**
```bash
# Search for lazy-loading patterns
grep -r "import(" extracted/
grep -r "createElement('script')" extracted/
grep -r "createElement('iframe')" extracted/
grep -r "new Worker" extracted/
grep -r "fetch(" extracted/
```

### Strategy 2: Network Monitoring

Monitor ALL requests during exhaustive testing:

```javascript
const requestedResources = new Set();
const missingResources = new Set();

page.on('request', request => {
  requestedResources.add(request.url());
});

page.on('requestfailed', request => {
  if (request.failure().errorText === 'net::ERR_NAME_NOT_RESOLVED') {
    missingResources.add(request.url());
  }
});

// After testing all features
console.log('Total requests:', requestedResources.size);
console.log('Missing resources:', missingResources);
```

### Strategy 3: Comparison Testing

Test online vs offline systematically:

```javascript
async function findMissingResources() {
  // Test online
  const onlineRequests = await testAllFeatures('https://photopea.com');

  // Test offline
  const offlineRequests = await testAllFeatures('http://localhost:3344');

  // Find 404s offline that worked online
  const missing = onlineRequests.filter(url => {
    return offlineRequests.some(r => r.url === url && r.status === 404);
  });

  return missing;
}
```

---

## Automated Completeness Validation

### Validation Script

```javascript
#!/usr/bin/env node
/**
 * Validates extraction completeness by testing all features
 */

const features = [
  {
    name: 'HEIC Support',
    test: async (page) => {
      await page.evaluate(() => {
        const blob = new Blob([heicTestData], {type: 'image/heic'});
        const file = new File([blob], 'test.heic');
        // Trigger file open
      });

      // Check if decoder loaded
      const loaded = await page.evaluate(() => {
        return document.querySelector('iframe[src*="formatsLoader"]') !== null;
      });

      return {pass: loaded, message: loaded ? 'HEIC decoder loaded' : 'HEIC decoder missing'};
    }
  },

  {
    name: 'JXL Support',
    test: async (page) => { /* similar */ }
  },

  // ... test all features
];

for (const feature of features) {
  const result = await feature.test(page);
  console.log(`${feature.name}: ${result.pass ? '✅' : '❌'} ${result.message}`);
}
```

### Checklist

**File Format Support:**
- [ ] PNG, JPG, GIF, WebP
- [ ] HEIC, HEIF (iPhone photos)
- [ ] JXL (JPEG XL)
- [ ] AVIF
- [ ] PSD, XCF, SKETCH
- [ ] TIFF, RAW (CR2, NEF, ARW, DNG, etc.)
- [ ] SVG, PDF, AI, EPS
- [ ] All formats listed in app

**UI Features:**
- [ ] All menus open and work
- [ ] All toolbar buttons functional
- [ ] All dialogs can be opened
- [ ] All preferences can be changed
- [ ] All keyboard shortcuts work

**Advanced Features:**
- [ ] Drag & drop all file types
- [ ] Paste from clipboard
- [ ] Save/export in all formats
- [ ] Undo/redo
- [ ] Filters/effects
- [ ] Layers/masks

**Performance:**
- [ ] No console errors
- [ ] No 404 requests
- [ ] No missing fonts/images
- [ ] Reasonable load times

---

## Best Practices

### 1. Test with Real Files

Don't just test with code - use actual files:
```
✅ GOOD: Drop actual test.heic file
❌ BAD: Just check if drop event fires
```

### 2. Monitor Network Continuously

Keep network tab open during ALL testing:
```javascript
// Log every request
page.on('request', r => console.log('REQ:', r.url()));
page.on('response', r => console.log('RES:', r.status(), r.url()));
page.on('requestfailed', r => console.log('FAIL:', r.url()));
```

### 3. Compare Online vs Offline

The definitive test:
```
If it works online but fails offline → missing resource
If it fails both → not a resource issue
```

### 4. Document What's Missing

Create a checklist:
```markdown
## Missing Resources Found

- [ ] /code/ext_formats/libheif.wasm - HEIC decoder (858 KB)
- [ ] /fonts/roboto-bold.woff2 - Bold font (45 KB)
- [ ] /workers/thumbnail.js - Thumbnail generator (12 KB)
```

### 5. Automate the Process

Build it into your extractor:
```javascript
// V7 extractor with automatic completeness validation
const result = await extract(url);

if (!result.complete) {
  console.warn('Missing resources:', result.missing);
  console.warn('Trigger these features:', result.untriggered);
}
```

---

## Common Pitfalls

### Pitfall 1: Only Testing Happy Path

```
❌ BAD: Open app, see it works, done
✅ GOOD: Test EVERY feature systematically
```

### Pitfall 2: Assuming Initial Load = Complete

```
❌ BAD: Page loaded → extraction complete
✅ GOOD: Page loaded → trigger all features → capture lazy-loaded resources
```

### Pitfall 3: Not Testing Edge Cases

```
❌ BAD: Test common formats (PNG, JPG)
✅ GOOD: Test ALL formats including rare ones (HEIC, JXL, CR2)
```

### Pitfall 4: Ignoring Console Errors

```
❌ BAD: App seems to work, ignore console
✅ GOOD: Zero errors = complete extraction
```

### Pitfall 5: Not Comparing to Online

```
❌ BAD: Assume offline works if no obvious errors
✅ GOOD: Systematically compare online vs offline behavior
```

---

## Implementation Roadmap

### Phase 1: Fix Photopea (✅ DONE)
- [x] Download HEIC decoder files
- [x] Update server to serve ext_formats
- [x] Test HEIC files load correctly

### Phase 2: Build V7 Extractor
- [ ] Implement feature discovery
- [ ] Create test file library for all formats
- [ ] Build automated feature triggering
- [ ] Add completeness validation

### Phase 3: Generalize
- [ ] Create extractor framework for any webapp
- [ ] Build feature detection system
- [ ] Automate comparison testing
- [ ] Generate completeness reports

---

## Success Metrics

**Extraction is complete when:**

1. ✅ **All features work offline identically to online**
2. ✅ **Zero 404 errors in network tab**
3. ✅ **Zero console errors**
4. ✅ **All file formats supported**
5. ✅ **All tools/menus/dialogs functional**
6. ✅ **Performance matches online version**

**Red flags indicating incompleteness:**

1. ❌ Some features work, others don't
2. ❌ 404 errors for resources
3. ❌ Console errors about missing modules
4. ❌ Specific file formats fail
5. ❌ Tools/features silently fail

---

## Conclusion

**The HEIC lesson:** Initial page load ≠ complete extraction.

**The solution:** Systematically trigger ALL features during extraction to capture lazy-loaded resources.

**For any app:**
1. Extract initial load (V6)
2. Discover all features
3. Trigger each feature
4. Capture lazy-loaded resources
5. Validate completeness
6. Apply protection patches

**Result:** Truly complete offline clone with ALL functionality.

---

**Generated:** 2026-01-09
**HEIC Fix:** ✅ Complete (7.1 MB of decoders added)
**V7 Extractor:** 📋 Roadmap defined
