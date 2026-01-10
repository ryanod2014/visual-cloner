# Discovering Unknown Unknowns: Exhaustive Feature Discovery

## The Problem

**Known unknowns:** "I know HEIC exists but don't know if it works"
**Unknown unknowns:** "I don't even know feature X exists, so I can't test it"

**The challenge:** How do we ensure completeness when we don't know what to test?

---

## The Solution: Automated Discovery + Exhaustive Execution

### Strategy 1: Code Analysis (What CAN Happen)

**Discover all possible features by analyzing the code itself:**

```javascript
async function discoverFeatures(extractedCode) {
  const features = {
    fileFormats: [],
    menuItems: [],
    tools: [],
    shortcuts: [],
    dialogs: [],
    apiEndpoints: [],
    lazyLoads: []
  };

  // 1. Find all file format handlers
  // Look for: format detection, decoder functions, file extensions
  features.fileFormats = extractFileFormats(code);

  // 2. Find all menu definitions
  // Look for: menu arrays, button definitions, command handlers
  features.menuItems = extractMenuStructure(code);

  // 3. Find all lazy-loading
  // Look for: import(), createElement('script'), fetch(), new Worker()
  features.lazyLoads = extractLazyLoading(code);

  // 4. Find all keyboard shortcuts
  // Look for: keydown/keyup listeners, keyboard maps
  features.shortcuts = extractKeyboardShortcuts(code);

  // 5. Find all API endpoints
  // Look for: fetch() calls, XMLHttpRequest, WebSocket connections
  features.apiEndpoints = extractAPIEndpoints(code);

  return features;
}
```

#### Example: Discovering File Formats

```javascript
function extractFileFormats(code) {
  const formats = new Set();

  // Pattern 1: File extension checks
  const extRegex = /\.(jpg|png|heic|psd|svg|webp|tiff|cr2|nef|arw)\b/gi;
  const extMatches = code.match(extRegex);
  extMatches.forEach(ext => formats.add(ext.slice(1)));

  // Pattern 2: MIME type checks
  const mimeRegex = /['"]image\/(jpeg|png|webp|heic|avif|jxl)['"]/gi;
  const mimeMatches = code.match(mimeRegex);

  // Pattern 3: Magic byte detection
  // Look for: if(bytes[0]==0xFF && bytes[1]==0xD8) format="jpg"
  const magicRegex = /format\s*=\s*['"](\w+)['"]/gi;
  const magicMatches = code.matchAll(magicRegex);

  // Pattern 4: Decoder mapping
  // Look for: {PNG: decoder1, HEIC: decoder2, JXL: decoder3}
  const decoderRegex = /\{[^}]*?(PNG|JPG|HEIC|JXL|AVIF|PSD|XCF):\s*\w+/gi;
  const decoderMatches = code.matchAll(decoderRegex);

  return Array.from(formats);
}

// Result for Photopea:
// ['png', 'jpg', 'gif', 'webp', 'heic', 'jxl', 'avif', 'psd', 'xcf',
//  'sketch', 'svg', 'pdf', 'ai', 'eps', 'tiff', 'raw', 'cr2', 'nef', ...]
```

#### Example: Discovering Menu Structure

```javascript
function extractMenuStructure(code) {
  const menus = [];

  // Pattern 1: Array of menu items
  // Look for: ["File", "Edit", "Image", "Layer"]
  const menuArrayRegex = /\[['"]File['"],\s*['"]Edit['"],\s*['"]Image['"]/gi;

  // Pattern 2: Menu command mappings
  // Look for: {"file.new": handler, "file.open": handler}
  const commandRegex = /['"](\w+\.[\w.]+)['"]\s*:\s*function/gi;
  const commands = code.matchAll(commandRegex);

  // Pattern 3: Event listener registrations
  // Look for: addEventListener('click', handlerFor_X)
  const handlerRegex = /handler(?:For|_)(\w+)/gi;

  // Pattern 4: Button/tool definitions
  // Look for: {id: "brush", name: "Brush Tool", ...}
  const toolRegex = /\{\s*id:\s*['"](\w+)['"]/gi;

  return menus;
}
```

#### Example: Discovering Lazy-Loaded Resources

```javascript
function extractLazyLoading(code) {
  const lazyLoads = [];

  // Pattern 1: Dynamic imports
  const dynamicImports = code.match(/import\(['"]([^'"]+)['"]\)/g) || [];
  lazyLoads.push(...dynamicImports);

  // Pattern 2: Script creation
  const scriptRegex = /createElement\(['"]script['"]\)[\s\S]{0,200}\.src\s*=\s*['"]([^'"]+)['"]/gi;
  const scriptMatches = code.matchAll(scriptRegex);
  for (const match of scriptMatches) {
    lazyLoads.push(match[1]);
  }

  // Pattern 3: Iframe loading
  const iframeRegex = /createElement\(['"]iframe['"]\)[\s\S]{0,200}\.src\s*=\s*['"]([^'"]+)['"]/gi;
  const iframeMatches = code.matchAll(iframeRegex);
  for (const match of iframeMatches) {
    lazyLoads.push(match[1]);
  }

  // Pattern 4: Fetch calls
  const fetchRegex = /fetch\(['"]([^'"]+)['"]\)/gi;
  const fetchMatches = code.matchAll(fetchRegex);
  for (const match of fetchMatches) {
    lazyLoads.push(match[1]);
  }

  // Pattern 5: Worker creation
  const workerRegex = /new Worker\(['"]([^'"]+)['"]\)/gi;
  const workerMatches = code.matchAll(workerRegex);
  for (const match of workerMatches) {
    lazyLoads.push(match[1]);
  }

  return lazyLoads;
}

// Result for Photopea:
// ['code/ext_formats/formatsLoader.html',
//  'code/pp/worker.js',
//  'rsrc/fonts/roboto.woff2', ...]
```

---

### Strategy 2: DOM Exploration (What's Visible)

**Discover features by exploring the DOM:**

```javascript
async function exploreDOMFeatures(page) {
  const features = await page.evaluate(() => {
    const results = {
      buttons: [],
      menus: [],
      inputs: [],
      fileInputs: [],
      dragTargets: [],
      shortcuts: []
    };

    // 1. Find all clickable elements
    const clickable = document.querySelectorAll('button, [role="button"], [onclick], a');
    results.buttons = Array.from(clickable).map(el => ({
      text: el.textContent?.trim(),
      id: el.id,
      class: el.className,
      action: el.onclick?.toString() || el.getAttribute('data-action')
    }));

    // 2. Find all menus
    const menus = document.querySelectorAll('[role="menu"], [role="menubar"], nav');
    results.menus = Array.from(menus).map(menu => ({
      items: Array.from(menu.querySelectorAll('[role="menuitem"], a, button'))
        .map(item => item.textContent?.trim())
    }));

    // 3. Find all file inputs
    const fileInputs = document.querySelectorAll('input[type="file"]');
    results.fileInputs = Array.from(fileInputs).map(input => ({
      accept: input.accept,
      multiple: input.multiple,
      id: input.id
    }));

    // 4. Find elements with drag/drop listeners
    const hasDragListeners = (el) => {
      return ['ondrop', 'ondragover', 'ondragenter'].some(event => el[event] !== null);
    };
    const dragTargets = Array.from(document.querySelectorAll('*')).filter(hasDragListeners);
    results.dragTargets = dragTargets.map(el => el.tagName + (el.id ? '#' + el.id : ''));

    // 5. Check for keyboard shortcut hints
    const hints = document.querySelectorAll('[data-shortcut], kbd');
    results.shortcuts = Array.from(hints).map(el =>
      el.getAttribute('data-shortcut') || el.textContent
    );

    return results;
  });

  return features;
}
```

---

### Strategy 3: Event Simulation (What Happens When)

**Trigger every possible interaction and observe:**

```javascript
async function exhaustiveEventSimulation(page) {
  const observed = {
    networkRequests: [],
    consoleLogs: [],
    newElements: [],
    stateChanges: []
  };

  // Monitor everything
  page.on('request', req => observed.networkRequests.push(req.url()));
  page.on('console', msg => observed.consoleLogs.push(msg.text()));

  // 1. Click every clickable element
  const clickables = await page.$$('button, [role="button"], a, [onclick]');
  for (const element of clickables) {
    await element.click();
    await page.waitForTimeout(500);
    // Observe what changed
  }

  // 2. Type in every input
  const inputs = await page.$$('input, textarea');
  for (const input of inputs) {
    await input.type('test');
    await page.waitForTimeout(200);
  }

  // 3. Trigger keyboard shortcuts
  const keys = ['a', 'b', 'c', 's', 'o', 'z', 'y']; // Common shortcuts
  const modifiers = [[], ['Control'], ['Meta'], ['Shift'], ['Alt']];

  for (const key of keys) {
    for (const mods of modifiers) {
      await page.keyboard.press(key, { modifiers: mods });
      await page.waitForTimeout(100);
    }
  }

  // 4. Hover over every element
  const hoverables = await page.$$('*[title], *[data-tooltip], button, a');
  for (const element of hoverables) {
    await element.hover();
    await page.waitForTimeout(100);
  }

  // 5. Right-click everywhere
  const areas = await page.$$('canvas, img, body, [contenteditable]');
  for (const area of areas) {
    await area.click({ button: 'right' });
    await page.waitForTimeout(200);
  }

  return observed;
}
```

---

### Strategy 4: Network Traffic Analysis (What's Requested)

**Compare online network traffic with offline:**

```javascript
async function compareNetworkTraffic(url) {
  // Test online first
  const onlineRequests = await captureAllRequests(url, 'online');

  // Test offline
  const offlineRequests = await captureAllRequests(url, 'offline');

  // Find missing
  const missing = onlineRequests.filter(onlineReq => {
    const offline404 = offlineRequests.some(offReq =>
      offReq.url === onlineReq.url && offReq.status === 404
    );
    return offline404;
  });

  return {
    online: onlineRequests,
    offline: offlineRequests,
    missing: missing
  };
}

async function captureAllRequests(url, mode) {
  const page = await browser.newPage();
  const requests = [];

  page.on('response', response => {
    requests.push({
      url: response.url(),
      status: response.status(),
      type: response.request().resourceType()
    });
  });

  await page.goto(url);

  // Exhaustively trigger everything
  await triggerAllPossibleActions(page);

  return requests;
}
```

---

### Strategy 5: Fuzzing & Brute Force

**Try EVERYTHING systematically:**

```javascript
async function bruteForceFeatureDiscovery(page) {
  // 1. Try all file extensions
  const commonExtensions = [
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico',
    'heic', 'heif', 'avif', 'jxl',
    'psd', 'psb', 'xcf', 'sketch', 'fig', 'ai', 'eps', 'pdf',
    'tiff', 'tif', 'raw', 'cr2', 'nef', 'arw', 'dng', 'raf',
    'mp4', 'mov', 'webm', 'avi', 'mkv',
    'mp3', 'wav', 'ogg', 'flac',
    'zip', 'tar', 'gz', '7z', 'rar',
    // ... 200+ more formats
  ];

  const workingFormats = [];
  for (const ext of commonExtensions) {
    const testFile = createTestFile(ext);
    const result = await tryOpenFile(page, testFile);
    if (result.success) {
      workingFormats.push(ext);
    }
  }

  // 2. Try all keyboard combinations
  const keys = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
  const modifiers = [
    [],
    ['Control'],
    ['Meta'],
    ['Shift'],
    ['Alt'],
    ['Control', 'Shift'],
    ['Meta', 'Shift'],
    // ... all combinations
  ];

  const workingShortcuts = [];
  for (const key of keys) {
    for (const mods of modifiers) {
      const before = await page.evaluate(() => document.body.innerHTML);
      await page.keyboard.press(key, { modifiers: mods });
      await page.waitForTimeout(100);
      const after = await page.evaluate(() => document.body.innerHTML);

      if (before !== after) {
        workingShortcuts.push({ key, mods, effect: 'UI changed' });
      }
    }
  }

  // 3. Try all common API endpoints
  const commonPaths = [
    '/api/user', '/api/data', '/api/files', '/api/save',
    '/graphql', '/rest', '/v1/', '/v2/',
    '/upload', '/download', '/export', '/import',
    // ... 100+ common patterns
  ];

  const foundEndpoints = [];
  for (const path of commonPaths) {
    const response = await fetch(url + path);
    if (response.status !== 404) {
      foundEndpoints.push({ path, status: response.status });
    }
  }

  return { workingFormats, workingShortcuts, foundEndpoints };
}
```

---

## Complete Discovery Framework

### V7 Extractor with Unknown Unknown Discovery

```javascript
class V7ExhaustiveExtractor {
  async extract(url) {
    console.log('Phase 1: Initial Extraction');
    const initial = await this.captureInitialLoad(url);

    console.log('Phase 2: Feature Discovery (Unknown Unknowns)');
    const discovered = await this.discoverAllFeatures(url, initial.code);

    console.log('Phase 3: Exhaustive Triggering');
    const additional = await this.triggerEverything(discovered);

    console.log('Phase 4: Comparison Validation');
    const validation = await this.validateCompleteness(url);

    console.log('Phase 5: Patch Application');
    return await this.applyPatches();
  }

  async discoverAllFeatures(url, code) {
    return {
      // Static code analysis
      codeAnalysis: this.analyzeCode(code),

      // DOM exploration
      domFeatures: await this.exploreDOM(url),

      // Network observation
      networkPatterns: await this.observeNetwork(url),

      // Fuzzing
      bruteForce: await this.bruteForceDiscovery(url)
    };
  }

  async analyzeCode(code) {
    return {
      fileFormats: this.extractFileFormats(code),
      menus: this.extractMenuStructure(code),
      shortcuts: this.extractKeyboardShortcuts(code),
      lazyLoads: this.extractLazyLoading(code),
      apiEndpoints: this.extractAPIEndpoints(code),
      workers: this.extractWorkers(code),
      iframes: this.extractIframes(code)
    };
  }

  async triggerEverything(discovered) {
    const resources = [];

    // Test all discovered file formats
    for (const format of discovered.codeAnalysis.fileFormats) {
      await this.testFileFormat(format);
      resources.push(...this.captureNewResources());
    }

    // Click all discovered buttons/menus
    for (const button of discovered.domFeatures.buttons) {
      await this.clickElement(button);
      resources.push(...this.captureNewResources());
    }

    // Trigger all discovered shortcuts
    for (const shortcut of discovered.codeAnalysis.shortcuts) {
      await this.triggerShortcut(shortcut);
      resources.push(...this.captureNewResources());
    }

    // Load all discovered lazy resources
    for (const resource of discovered.codeAnalysis.lazyLoads) {
      await this.loadResource(resource);
      resources.push(resource);
    }

    return resources;
  }

  async validateCompleteness(url) {
    // Compare online vs offline
    const online = await this.testAllFeatures(url, 'online');
    const offline = await this.testAllFeatures(url, 'offline');

    return {
      complete: online.requests.length === offline.successful.length,
      missing: online.requests.filter(r => !offline.successful.includes(r)),
      errors: offline.errors
    };
  }
}
```

---

## Practical Implementation

### Step-by-Step Discovery Process

```bash
# 1. Extract initial load
node v7-extractor.js extract https://photopea.com

# 2. Analyze extracted code
node v7-extractor.js analyze output/photopea-*/

# Output:
# Discovered:
# - 47 file formats
# - 156 menu items
# - 89 keyboard shortcuts
# - 12 lazy-loaded resources
# - 23 API endpoints
# - 8 worker scripts

# 3. Generate test cases
node v7-extractor.js generate-tests output/photopea-*/

# Output:
# Created:
# - test-files/ (47 files for all formats)
# - test-shortcuts.json (89 shortcuts to test)
# - test-menus.json (156 menu clicks)
# - test-scenarios.json (exhaustive test suite)

# 4. Run exhaustive extraction
node v7-extractor.js extract-exhaustive https://photopea.com

# This will:
# - Load initial page
# - Test all 47 file formats
# - Trigger all 89 shortcuts
# - Click all 156 menu items
# - Load all 12 lazy resources
# - Capture everything requested

# 5. Validate completeness
node v7-extractor.js validate output/photopea-*/

# Output:
# ✅ All 47 formats work
# ✅ All 156 menus functional
# ✅ All 89 shortcuts work
# ✅ Zero 404 errors
# ✅ Extraction 100% complete
```

---

## The Unknown Unknowns Checklist

**How to know you've found everything:**

### Code-Based Verification
- [ ] Extracted all file format handlers from code
- [ ] Found all menu/tool definitions
- [ ] Discovered all lazy-loading patterns
- [ ] Identified all dynamic imports
- [ ] Located all fetch/API calls
- [ ] Found all worker scripts
- [ ] Discovered all iframe loads

### Network-Based Verification
- [ ] Monitored all requests during exhaustive testing
- [ ] Compared online vs offline requests
- [ ] Zero 404 errors offline
- [ ] All lazy resources captured

### Feature-Based Verification
- [ ] Tested with files in ALL discovered formats
- [ ] Clicked every discovered button/menu
- [ ] Triggered every discovered shortcut
- [ ] Opened every discovered dialog
- [ ] Changed every discovered setting

### Diff-Based Verification
- [ ] Online vs offline feature comparison shows 100% match
- [ ] Online vs offline network requests show 100% match
- [ ] Online vs offline console logs match (except expected diffs)

---

## Success Criteria

**You've captured everything when:**

1. ✅ Code analysis finds no more features to test
2. ✅ Exhaustive testing finds no new resources
3. ✅ Online vs offline comparison shows no differences
4. ✅ Zero 404 errors in offline version
5. ✅ Zero console errors about missing resources
6. ✅ Every discovered feature works offline identically to online

**Red flags:**
1. ❌ New resources appear during random testing
2. ❌ 404 errors show up unexpectedly
3. ❌ Features work online but fail offline
4. ❌ Console shows "module not found" errors

---

## Conclusion

**To find unknown unknowns:**

1. **Analyze the code** - Discover what CAN exist
2. **Explore the DOM** - Discover what IS visible
3. **Trigger everything** - Discover what DOES happen
4. **Monitor traffic** - Discover what GETS requested
5. **Compare online/offline** - Discover what's MISSING

**The key:** Don't rely on human knowledge. Let the code tell you what exists, then systematically test it all.

**Result:** True extraction completeness with confidence that nothing is missing.

---

**Generated:** 2026-01-09
**Next:** Implement V7 extractor with automatic discovery
