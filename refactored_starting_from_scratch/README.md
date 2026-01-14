# Visual Cloner

Extract and serve any web application locally with pixel-perfect accuracy.

## Overview

Visual Cloner is a complete web application extraction system that captures, patches, and serves modern web apps locally. It handles everything from static assets to dynamic chunks, WebGL shaders, and runtime patches.

## 3-Step Architecture

Visual Cloner uses a clean separation of concerns with three distinct steps:

### 1. EXTRACT - Pure Capture

```bash
node extract.js <url>
```

**Purpose:** Pure capture with zero modifications

**What it does:**
- Launches browser and navigates to target URL
- Intercepts all network traffic
- Triggers UI states to discover lazy-loaded resources
- Saves raw files exactly as downloaded
- Creates manifest and resource map

**Phases:**
1. **Init** - Launch browser, prepare output directory
2. **Capture** - Navigate to URL, intercept network responses
3. **Trigger** - Interact with UI to load dynamic resources
4. **Discover** - Find webpack chunks, service workers, manifests
5. **Assemble** - Build URL map and save files

**Output:** `output/<domain>-<timestamp>/`

```
output/photopea.com-1768344565488/
├── index.html              # Main HTML file
├── url-map.json            # URL to local file mapping
├── resources/              # All captured resources
│   ├── r1.js
│   ├── r2.css
│   ├── r3.wasm
│   └── ...
└── .checkpoint.json        # Extraction metadata
```

**Key feature:** All files are saved in their original, unmodified state.

---

### 2. PATCH - Post-Extraction Fixes

```bash
node patch.js <output-folder>
```

**Purpose:** Apply runtime fixes without re-extracting

**What it does:**
- Scans captured JavaScript files
- Applies domain bypass patches
- Fixes feature flag checks
- Removes license restrictions
- Can be re-run multiple times
- Modular patcher system

**Why separate:**
- No need to re-extract when adding new patches
- Faster iteration on patch development
- Clear separation: capture vs. modification
- Can patch old extractions with new rules

**Example:**
```bash
# Extract once
node extract.js https://photopea.com

# Patch multiple times as needed
node patch.js output/photopea.com-1768344565488
node patch.js output/photopea.com-1768344565488  # Run again with updated patches
```

**Available Patchers:**

Located in `plugins/patchers/`:

1. **domain-bypass.js** - Generic domain/license checks
   - Hostname validation bypass
   - Origin checks
   - Online/offline detection

2. **photopea.js** - Photopea-specific patches
   - License manager bypass
   - Premium feature unlocking
   - Domain restrictions

3. **origin-spoof.js** - Origin header manipulation
   - CORS bypass
   - Referer spoofing

---

### 3. SERVE - Local Development Server

```bash
cd output/<domain>-<timestamp>
node serve.js
```

**Purpose:** Simple file server with no logic

**What it does:**
- Serves patched files from extraction folder
- Maps URLs to local files using `url-map.json`
- Handles CORS headers
- SPA routing fallback
- Static asset caching

**Features:**
- No patching logic (just serves already-patched files)
- Automatic MIME type detection
- Console logging for missing resources
- Hot reload friendly

**Access:** Opens at `http://localhost:3333`

---

## Quick Start

```bash
# 1. Extract a website
node extract.js https://www.photopea.com

# 2. Patch the extraction (now integrated into extract.js)
# Patches are automatically applied during extraction

# 3. Serve locally
cd output/photopea.com-<timestamp>
node serve.js

# 4. Open in browser
open http://localhost:3333
```

---

## Directory Structure

```
visual-cloner/
├── extract.js                 # Main entry point
├── package.json               # Dependencies
├── README.md                  # This file
│
├── core/                      # Core pipeline system
│   ├── pipeline.js            # Phase orchestration
│   ├── state.js               # Extraction state management
│   ├── logger.js              # Structured logging
│   └── errors.js              # Error handling
│
├── phases/                    # Extraction phases (1-6)
│   ├── 01-init.js             # Browser launch
│   ├── 02-capture.js          # Network interception
│   ├── 03-trigger.js          # UI state triggering
│   ├── 04-discover.js         # Resource discovery
│   ├── 05-patch.js            # Apply patches (integrated)
│   └── 06-assemble.js         # File assembly
│
├── plugins/                   # Extensible plugin system
│   ├── patchers/              # Code modification plugins
│   │   ├── interface.js       # Base patcher class
│   │   ├── domain-bypass.js   # Generic domain checks
│   │   ├── photopea.js        # App-specific patches
│   │   └── origin-spoof.js    # Origin manipulation
│   │
│   └── triggers/              # UI interaction plugins
│       ├── interface.js       # Base trigger class
│       ├── keyboard.js        # Keyboard events
│       ├── menu.js            # Menu interactions
│       └── viewport.js        # Scroll/resize
│
├── runtime/                   # Browser injection scripts
│   ├── network-interceptor.js # Request interception
│   ├── indexeddb-mock.js      # Storage mocking
│   └── runtime-mock.js        # Runtime overrides
│
└── output/                    # Extraction outputs
    └── <domain>-<timestamp>/
        ├── index.html
        ├── serve.js           # Generated server
        ├── url-map.json       # URL mappings
        └── resources/         # All assets
```

---

## Command Reference

### Extract Command

```bash
node extract.js <url> [options]
```

**Arguments:**
- `<url>` - Target URL (with or without https://)

**Options:**
- `--output, -o <dir>` - Custom output directory
- `--debug, -d` - Enable debug logging
- `--headless <bool>` - Run browser headless (default: true)
- `--timeout <ms>` - Page load timeout (default: 60000)
- `--help, -h` - Show help

**Examples:**

```bash
# Basic extraction
node extract.js https://www.photopea.com

# Custom output directory
node extract.js https://example.com --output ./my-clone

# Debug mode with visible browser
node extract.js https://example.com --debug --headless false

# Extended timeout for slow sites
node extract.js https://example.com --timeout 120000
```

### Serve Command

```bash
# From extraction directory
cd output/<domain>-<timestamp>
node serve.js

# Or use extract.js helper
node extract.js serve output/<domain>-<timestamp>
```

---

## Adding New Patchers

Patchers are modular plugins that modify captured code. Here's how to add a new one:

### 1. Create Patcher File

Create `plugins/patchers/my-patcher.js`:

```javascript
import { IPatcher, PatchResult } from './interface.js';

// Define patterns to search/replace
const PATTERNS = [
  {
    name: 'my-pattern',
    description: 'What this pattern fixes',
    pattern: /someRegex/g,
    replace: 'replacement',
  },
];

// Quick detection (avoid full regex on every file)
const QUICK_PATTERNS = [
  /quickCheck/,
  /anotherQuickCheck/,
];

export class MyPatcher extends IPatcher {
  constructor() {
    super('my-patcher', 'Description of what this patches');
  }

  shouldApply(content, filename) {
    // Fast pre-check
    if (!filename.endsWith('.js')) return false;
    return QUICK_PATTERNS.some(p => p.test(content));
  }

  apply(content) {
    const patches = [];
    let modified = content;

    for (const pattern of PATTERNS) {
      const matches = modified.match(pattern.pattern);
      if (matches && matches.length > 0) {
        const count = matches.length;

        // Apply replacement
        if (typeof pattern.replace === 'function') {
          modified = modified.replace(pattern.pattern, pattern.replace);
        } else {
          modified = modified.replace(pattern.pattern, pattern.replace);
        }

        // Record what was patched
        patches.push(new PatchResult(
          pattern.name,
          count,
          matches.slice(0, 2).map(m => m.slice(0, 80)) // Examples
        ));
      }
    }

    return { content: modified, patches };
  }

  getPatterns() {
    return PATTERNS.map(p => ({
      name: p.name,
      description: p.description
    }));
  }
}

export default MyPatcher;
```

### 2. Register Patcher

Edit `phases/05-patch.js`:

```javascript
import { MyPatcher } from '../plugins/patchers/my-patcher.js';

export class PatchPhase extends Phase {
  constructor(config = {}) {
    super('patch', 'Apply patches');
    this.patchers = [
      new MyPatcher(),           // Add your patcher
      new PhotopeaPatcher(),
      new DomainBypassPatcher(),
    ];
  }
  // ...
}
```

### 3. Test Your Patcher

```bash
# Extract with debug mode
node extract.js https://target.com --debug

# Check output for patch logs
# Look for: "Applied X patches to Y files"
```

### Patcher Best Practices

1. **Use Quick Patterns:** Pre-filter files before expensive regex
2. **Be Specific:** Target exact patterns to avoid false positives
3. **Capture Examples:** Save matched text for debugging
4. **Test Incrementally:** Start with one pattern, add more
5. **Document Patterns:** Explain what each pattern fixes

---

## Troubleshooting

### Extraction Issues

#### "Page load timeout"
```bash
# Increase timeout for slow sites
node extract.js <url> --timeout 120000
```

#### "Missing resources in served app"
```bash
# Run in non-headless mode to see what's happening
node extract.js <url> --headless false --debug

# Check for lazy-loaded resources
# Manually interact with UI during extraction
```

#### "Browser crashes or hangs"
```bash
# Close other browser instances
# Reduce concurrent operations
# Check system resources
```

### Patching Issues

#### "App still checks domain"
```bash
# Run with debug to see what's being patched
node extract.js <url> --debug

# Look for unpatched patterns in console
# Add new pattern to domain-bypass.js or create custom patcher
```

#### "Patches breaking functionality"
```bash
# Check patch logs for false positives
# Make patterns more specific
# Test without patches first
```

### Serving Issues

#### "404 errors on some resources"
```bash
# Check url-map.json for missing entries
# Re-run extraction with --debug
# Manually trigger UI states during extraction
```

#### "CORS errors in browser console"
```bash
# Server automatically adds CORS headers
# If still failing, check browser extensions
# Try incognito mode
```

#### "App shows blank page"
```bash
# Check browser console for errors
# Verify all JS files were patched
# Check index.html was saved correctly
```

### Common Patterns to Patch

```javascript
// 1. Hostname checks
window.location.hostname === 'expected.com'
→ true

// 2. Origin validation
window.location.origin !== 'https://expected.com'
→ false

// 3. Feature flags
if (isPremium()) { ... }
→ if (true) { ... }

// 4. License checks
var licensed = checkLicense()
→ var licensed = true

// 5. Domain ternary
var x = domain.includes('valid') ? 1 : 0
→ var x = 1
```

---

## Example Workflows

### Basic Workflow

```bash
# 1. Extract
node extract.js https://www.photopea.com

# 2. Serve
cd output/photopea.com-1768344565488
node serve.js

# 3. Test
open http://localhost:3333
```

### Debug Workflow

```bash
# 1. Extract with full logging
node extract.js https://example.com --debug --headless false

# 2. Review logs
# - Check which resources were captured
# - Verify patches were applied
# - Note any errors

# 3. Test specific features
# - Open served app
# - Check browser console
# - Test functionality

# 4. Add custom patches if needed
# - Edit plugins/patchers/
# - Re-run extraction
```

### Development Workflow

```bash
# 1. Extract once
node extract.js https://target.com

# 2. Iterate on patches
# - Edit patcher files
# - No need to re-extract
# - Just modify saved files manually or re-run patch phase

# 3. Test changes
cd output/target.com-<timestamp>
node serve.js

# 4. Verify in browser
open http://localhost:3333
```

### Production Workflow

```bash
# 1. Extract with custom output
node extract.js https://app.com --output ./production/app-clone

# 2. Verify completeness
cd production/app-clone
ls -la resources/  # Check file count
cat url-map.json   # Verify mappings

# 3. Deploy
# - Copy to production server
# - Run serve.js behind nginx/apache
# - Configure SSL/domain

# 4. Monitor
# - Check server logs for 404s
# - Update patches as needed
```

---

## Advanced Topics

### Custom Triggers

Create custom UI interaction triggers in `plugins/triggers/`:

```javascript
import { ITrigger } from './interface.js';

export class MyTrigger extends ITrigger {
  constructor() {
    super('my-trigger', 'Custom interaction');
  }

  async execute(page, logger) {
    // Click buttons, scroll, type, etc.
    await page.click('.my-button');
    await page.waitForSelector('.loaded');
  }
}
```

### Runtime Injection

Inject custom JavaScript before page load:

```javascript
// runtime/my-injection.js
(function() {
  // Override APIs
  window.fetch = new Proxy(window.fetch, {
    apply(target, thisArg, args) {
      console.log('Fetch:', args[0]);
      return Reflect.apply(target, thisArg, args);
    }
  });
})();
```

### State Management

Access extraction state during phases:

```javascript
export class MyPhase extends Phase {
  async execute(context) {
    const { url, outputDir, resources, browser, page } = context;

    // Access captured resources
    for (const [url, resource] of resources) {
      // Process each resource
    }

    return { myData: 'result' };
  }
}
```

---

## Architecture Deep Dive

### Phase Pipeline

Each extraction runs through 6 phases sequentially:

```
Init → Capture → Trigger → Discover → Patch → Assemble
```

**Phase Interface:**
```javascript
class Phase {
  constructor(name, description) {}
  async execute(context) {}
  async cleanup() {}
}
```

**Execution Flow:**
1. Pipeline creates shared context (state)
2. Each phase receives context
3. Phase modifies context (adds resources, etc.)
4. Next phase sees updated context
5. Final phase assembles output

### State Management

`ExtractionState` tracks everything:

```javascript
{
  url: 'https://target.com',
  domain: 'target.com',
  outputDir: '/path/to/output',
  resources: Map<url, resource>,
  context: {
    browser: BrowserInstance,
    page: PageInstance
  },
  metadata: {
    startTime: timestamp,
    phase: 'current-phase'
  }
}
```

### Resource Storage

Resources are stored with full metadata:

```javascript
{
  url: 'https://example.com/app.js',
  contentType: 'application/javascript',
  body: Buffer,
  size: 12345,
  localFile: 'resources/r1.js',
  patched: true,
  originalSize: 12000
}
```

---

## Performance Tips

### Faster Extraction

1. **Skip unnecessary resources:**
   ```javascript
   // In 02-capture.js
   if (url.includes('analytics')) return;
   if (url.includes('tracking')) return;
   ```

2. **Parallel resource saving:**
   - Assemble phase saves files in parallel
   - Uses Promise.all() for I/O

3. **Headless mode:**
   ```bash
   node extract.js <url> --headless true
   ```

### Smaller Output

1. **Skip source maps:**
   - Don't capture .map files
   - Reduces size by 50%+

2. **Compress resources:**
   ```bash
   # After extraction
   cd output/<dir>/resources
   gzip *.js *.css
   ```

3. **Deduplicate:**
   - Some apps load same resource multiple times
   - Pipeline automatically deduplicates by URL

---

## Project Goals

1. **Zero modification during capture** - Extract raw, patch later
2. **Modular patchers** - Easy to add app-specific fixes
3. **Reproducible** - Same input = same output
4. **Fast iteration** - No re-extraction for patch changes
5. **Complete capture** - All resources, all states

---

## Contributing

### Adding Support for New Apps

1. Extract the app
2. Test served version
3. Note missing features/broken functionality
4. Create app-specific patcher
5. Document patterns

### Improving Patchers

1. Run extraction with `--debug`
2. Check browser console for errors
3. Find problematic code patterns
4. Add to existing patcher or create new one
5. Test and verify

---

## Technical Details

### Supported Resource Types

- **Code:** JS, CSS, HTML, JSON, WASM
- **Images:** PNG, JPG, WebP, SVG, GIF
- **Fonts:** WOFF, WOFF2, TTF, OTF
- **Media:** MP3, MP4, WebM
- **Data:** JSON, XML, text

### Browser Automation

- Uses Playwright for automation
- Chromium engine by default
- Full network interception
- Respects rate limits

### Patch Safety

- Original files preserved in .checkpoint.json
- Patches are reversible
- Pattern matching is conservative
- Examples logged for verification

---

## License

MIT

---

## Credits

Built with:
- [Playwright](https://playwright.dev/) - Browser automation
- Node.js - Runtime environment

---

## FAQ

**Q: Why separate extraction and patching?**
A: Allows iterating on patches without re-downloading everything. Extract once, patch many times.

**Q: Can I extract authenticated apps?**
A: Yes, but you'll need to handle login manually or automate it in the Init phase.

**Q: Does this work with React/Vue/Angular?**
A: Yes, framework-agnostic. Captures rendered output and all loaded resources.

**Q: What about dynamic imports?**
A: Discover phase finds webpack manifests and loads chunks. Trigger phase exercises UI to load lazy components.

**Q: Can I extract SPAs?**
A: Yes, serve.js includes SPA routing fallback.

**Q: What about WebSockets?**
A: Not yet supported. Runtime mocking needed for websocket-dependent apps.

**Q: Can this extract mobile apps?**
A: Only web apps. For mobile, you'd need different tools (APK decompilers, etc.)

**Q: Is this legal?**
A: Depends on terms of service and intended use. For personal research/development, generally OK. For redistribution, check licenses.

---

## Changelog

### v1.0.0 (Current)
- Initial 3-step architecture (extract → patch → serve)
- Modular patcher system
- 6-phase extraction pipeline
- Photopea support
- Generic domain bypass
- Network interception
- Trigger plugins
- State management
- Checkpoint/resume support
