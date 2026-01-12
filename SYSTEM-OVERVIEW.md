# Visual Cloner System Architecture

## Overview

The Visual Cloner system consists of **two distinct pipelines**:

1. **V7 Extractor** - Resource extraction and backend mapping
2. **V8 Enhancer** - Code beautification and variable naming

**They are completely separate tools with different purposes.**

---

## Quick Reference

| Question | Answer |
|----------|--------|
| What extracts resources from websites? | **V7 Extractor / V7 Crawler** |
| What captures WebGL shaders? | **V7 Extractor / V7 Crawler** |
| What discovers lazy-loaded files? | **V7 Extractor / V7 Crawler** |
| What maps backend APIs? | **V7 Extractor / V7 Crawler** |
| **What extracts multi-page webapps?** | **V7 Crawler** (new!) |
| **What auto-discovers all site pages?** | **V7 Crawler** (new!) |
| What beautifies JavaScript? | **V8 Enhancer** |
| What renames variables (a, b, c → meaningful names)? | **V8 Enhancer** |
| Which runs first? | **V7 Extractor/Crawler** (always) |
| Which is optional? | **V8 Enhancer** (optional post-processing) |

---

## V7 Extractor - Complete Webapp Extraction

**Purpose:** Extract ALL resources from any webapp, including lazy-loaded content and backend dependencies

### What V7 Does

```
┌─────────────────────────────────────────────────────────────┐
│  V7 EXTRACTOR - 5 PHASE PIPELINE                            │
└─────────────────────────────────────────────────────────────┘

Phase 1: ANALYZE
  • Discovers file formats (PNG, HEIC, JXL, PSD, etc.)
  • Finds lazy-loaded resources (decoders, workers)
  • Detects API endpoints
  • Maps WebSocket connections
  • Extracts keyboard shortcuts
  • Identifies event handlers

Phase 2: GENERATE TEST FILES
  • Creates test.png, test.heic, test.jxl, etc.
  • Generates minimal valid files for ALL discovered formats

Phase 3: TRIGGER FEATURES
  • Opens each test file to trigger lazy loading
  • Clicks UI elements
  • Simulates keyboard shortcuts
  • Monitors network requests
  • Captures ALL loaded resources

Phase 4: MAP BACKEND
  • Documents API endpoints (method, URL, body, headers)
  • Maps WebSocket connections
  • Identifies authentication mechanisms
  • Lists external services
  • Extracts data structures
  • Documents storage usage
  • Generates BACKEND-BLUEPRINT.md engineer guide

Phase 5: VALIDATE
  • Compares online vs offline functionality
  • Calculates completeness score (0-100)
  • Lists missing resources
  • Provides actionable recommendations
```

### V7 Output

```
output/photopea.com-complete-1767957633072/
├── index.html                     # Main HTML
├── resources/                     # Raw extracted code (V7)
│   ├── launchpad.js               # Minified JavaScript (original)
│   ├── libheif.wasm               # Lazy-loaded HEIC decoder
│   ├── jxl_dec.js                 # Lazy-loaded JXL decoder
│   └── ...
├── resources-beautified/          # Beautified code (V8 - created if V8 is run)
│   ├── launchpad.js               # Beautified with readable variable names
│   └── ...
├── images/                        # All images
├── fonts/                         # All fonts
├── manifest.json                  # Extraction manifest
├── screenshot.png                 # Page screenshot
└── test-files/                    # Generated test files

v7-reports/
├── v7-analysis-report.json       # Feature discovery
├── v7-trigger-report.json        # Testing results
├── v7-backend-report.json        # Backend analysis (JSON)
├── BACKEND-BLUEPRINT.md          # ⭐ Engineer implementation guide
├── v7-validation-report.json     # Completeness validation
└── V7-EXTRACTION-REPORT.md       # Executive summary
```

**Note:** `resources-beautified/` is only created if you run V8 Enhancer. V7 preserves raw extraction in `resources/`.

### BACKEND-BLUEPRINT.md Structure

**For apps WITH backend:**

```markdown
# Backend Dependencies Blueprint

## Summary
- Backend dependencies: ✅ YES
- API endpoints: 24
- WebSocket connections: 3
- Authentication: JWT

## Required Work

### 1. Implement API Backend (HIGH Priority, High Complexity)
**Options:**
- Mock: json-server with static data (2-4 hours)
- Proxy: nginx reverse proxy to original API
- Custom: Express.js with PostgreSQL (2-3 days)

**Endpoints:**
| Method | URL | Request Body | Response |
|--------|-----|--------------|----------|
| POST | /api/projects | `{ name, description }` | `{ id, ...project }` |
| GET | /api/projects | - | `[{ id, name, ... }]` |

### 2. Implement WebSocket Server (HIGH Priority, Medium Complexity)
**Connections:** 3
- /ws/notifications
- /ws/live-updates
- /ws/collaboration

**Code Example:**
\`\`\`javascript
import { WebSocketServer } from 'ws';
const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    ws.send(JSON.stringify({ type: 'response' }));
  });
});
\`\`\`
```

**For apps WITHOUT backend (like Photopea):**

```markdown
# Backend Dependencies Blueprint

## Summary
- Backend dependencies: ❌ NO

## Overview
This is a fully client-side application with NO backend dependencies.

**This app is fully functional offline with no additional work required.** 🎉
```

### Running V7

```bash
# Complete V7 extraction workflow
node tools/v7-extractor.js \
  output/photopea.com-complete-1767957633072 \
  https://www.photopea.com \
  http://localhost:3344/?test=1

# Output:
# ✅ Discovered 18 file formats
# ✅ Generated 18 test files
# ✅ Captured 3,987 resources
# ✅ No backend dependencies detected
# ✅ Completeness: 92/100
# ⚠️  Found 6 missing resources
```

### V7 Key Features

✅ **Automatic feature discovery** - No manual enumeration needed
✅ **Lazy-load capture** - Triggers features to capture deferred resources
✅ **WebGL extraction** - Captures shaders, textures, uniforms
✅ **Backend documentation** - Complete API contract with examples
✅ **Validation** - Compares online vs offline, gives completeness score
✅ **Engineer blueprint** - Ready-to-implement guide with code examples

---

## V7 Crawler - Intelligent Multi-Page Extraction

**Purpose:** Automatically discover and extract all pages from a multi-page webapp

### What V7 Crawler Does

```
┌─────────────────────────────────────────────────────────────┐
│  V7 CRAWLER - 4 PHASE PIPELINE                              │
└─────────────────────────────────────────────────────────────┘

Phase 1: DISCOVER
  • Crawls entire site (breadth-first)
  • Discovers all linked pages
  • Respects scope (same domain + subdomains)
  • Follows links up to max depth
  • Example: Discovers 127 pages across app.example.com

Phase 2: CLASSIFY
  • Classifies pages as "app" or "content"
  • Heuristics:
    - Too many siblings (>20) = content zone
    - URL patterns (/blog/, /help/) = content
    - Deep nesting = content
    - App patterns (/dashboard, /admin) = app
  • Example: /blog (247 pages) = content, /dashboard (12 pages) = app

Phase 3: EXTRACT
  • Exhaustively extracts ALL app pages
  • Samples 5 representative pages from content zones
  • Monitors and deduplicates resources
  • Example: Extracts 40 app pages + 10 content samples

Phase 4: SAVE
  • Saves pages/ directory (HTML + screenshots)
  • Saves resources/ directory (deduplicated)
  • Generates manifest.json + sitemap.json
```

### V7 Crawler Output

```
output/app/
├── pages/                    # All extracted pages
│   ├── dashboard.html
│   ├── dashboard.png
│   ├── settings.html
│   ├── settings.png
│   ├── blog_post-1.html     # Sampled content
│   └── ...
├── resources/                # Shared resources (DEDUPLICATED)
│   ├── app.bundle.js         # Used by all pages - extracted once!
│   ├── vendor.chunk.js
│   └── styles.css
├── resources-beautified/     # If V8 is run
│   └── app.bundle.js
├── manifest.json             # Extraction metadata
└── sitemap.json              # Site structure

manifest.json:
{
  "discovery": {
    "totalDiscovered": 247,
    "totalExtracted": 40,
    "zones": {
      "app": [
        { "path": "/dashboard", "pageCount": 12 }
      ],
      "content": [
        {
          "path": "/blog",
          "pageCount": 247,
          "sampled": 5,
          "reason": "Too many siblings"
        }
      ]
    }
  }
}
```

### When to Use V7 Crawler

✅ **Multi-page webapp** - Dashboard, settings, profile, admin pages
✅ **Multiple subdomains** - app.example.com, admin.example.com
✅ **Large sites** - Sites with blog/help sections
✅ **Complete coverage** - Want all app functionality

❌ **Single-page app (SPA)** - Use standard V7 instead
❌ **Single landing page** - Use standard V7 instead

### Usage

```bash
# Basic usage
node tools/v7-crawler.js https://app.example.com output/app

# With options
node tools/v7-crawler.js https://example.com output/site \
  --max-pages 200 \
  --max-depth 4 \
  --sample-size 5

# Result:
# ✅ Discovered 127 pages
# ✅ Extracted 40 app pages
# ✅ Sampled 10 content pages
# ✅ Saved 84 deduplicated resources
```

**See [V7-CRAWLER.md](./V7-CRAWLER.md) for full documentation.**

---

## V8 Enhancer - JavaScript Beautification

**Purpose:** Make extracted JavaScript readable by beautifying and renaming variables

### What V8 Does

```
┌─────────────────────────────────────────────────────────────┐
│  V8 ENHANCER - 6 PHASE PIPELINE                             │
└─────────────────────────────────────────────────────────────┘

Phase 0: ANALYSIS
  • Detect obfuscator type (terser, webpack-obfuscator, etc.)
  • Detect bundler (webpack, rollup, parcel, esbuild)
  • Check for source maps
  • Determine minification level

Phase 1: RECOVERY
  • Extract original source from source maps (if available)
  • Tool: reverse-sourcemap

Phase 2: DEOBFUSCATION
  • Unwrap webpack bundles (webcrack)
  • Decrypt strings, unflatten control flow (synchrony)
  • Unpack arrays, remove dead code (restringer)

Phase 3: FORMATTING ⭐ (BEAUTIFYING)
  • Fix indentation
  • Add proper spacing
  • Normalize quotes
  • Tool: Prettier

Phase 4: NAMING ⭐ (VARIABLE RENAMING)
  • Rename variables: a, b, c → userData, isActive, handleClick
  • Rename functions: d(), e() → fetchUser(), validateInput()
  • Heuristic-based (no AI required)

Phase 5: DOCUMENTATION
  • Add JSDoc comments
  • Document parameters and return types
  • Template-based generation

Phase 6: VALIDATION
  • Parse code with AST parser
  • Verify syntax is valid
  • Check functionality not broken
```

### V8 Transformation Example

**Input (from V7 extraction):**
```javascript
function a(b,c){return b+c}const d=a(1,2);
```

**After Phase 3 (Formatting/Beautifying):**
```javascript
function a(b, c) {
  return b + c;
}
const d = a(1, 2);
```

**After Phase 4 (Variable Naming):**
```javascript
function add(num1, num2) {
  return num1 + num2;
}
const sum = add(1, 2);
```

**After Phase 5 (Documentation):**
```javascript
/**
 * Adds two numbers together
 * @param {number} num1 - First number
 * @param {number} num2 - Second number
 * @returns {number} Sum of the two numbers
 */
function add(num1, num2) {
  return num1 + num2;
}
const sum = add(1, 2);
```

### V8 Output

```json
{
  "detection": {
    "obfuscators": ["terser"],
    "obfuscation_level": "moderate",
    "bundler": null,
    "has_source_map": true,
    "is_minified": true
  },
  "formatting": {
    "files_formatted": 1,
    "total_files": 1
  },
  "naming": {
    "variables_renamed": 19,
    "functions_renamed": 9
  },
  "documentation": {
    "functions_documented": 50
  },
  "validation": {
    "valid_files": 1,
    "invalid_files": 0
  }
}
```

### Running V8

```bash
# Run full V8 enhancement pipeline
python tools/v8-enhance.py ./output/resources/launchpad.js

# Skip specific phases
python tools/v8-enhance.py ./code.js --skip-naming
python tools/v8-enhance.py ./code.js --skip-docs

# Analysis only (detect obfuscation)
python tools/v8-enhance.py ./code.js --analyze-only

# Output:
# ✅ Formatted 1 file
# ✅ Renamed 19 variables, 9 functions
# ✅ Documented 50 functions
# ✅ Validation: PASSED
```

### V8 Key Features

✅ **100% programmatic** - No AI/LLM required
✅ **Beautifying** - Proper formatting with Prettier
✅ **Variable naming** - Heuristic-based meaningful names
✅ **Documentation** - Auto-generated JSDoc comments
✅ **Validation** - Ensures code still parses
✅ **Optional** - Run only if you need readable code

---

## V7 vs V8 - Complete Comparison

| Aspect | V7 Extractor | V8 Enhancer |
|--------|--------------|-------------|
| **Purpose** | Extract all resources from webapp | Make extracted JS readable |
| **Input** | Live website URL | JavaScript files (from V7) |
| **Output** | HTML, CSS, JS, WASM, images, fonts, BACKEND-BLUEPRINT.md | Beautified, renamed, documented JS |
| **Runs When** | **FIRST** (extraction phase) | **SECOND** (optional cleanup) |
| **Technologies** | Playwright, CDP, browser automation | AST parsing, Prettier, deobfuscation |
| **Discovers** | File formats, lazy loads, APIs, WebGL | Obfuscation type, minification |
| **Captures** | WebGL shaders, decoders, workers | Nothing (processes existing files) |
| **Beautifying** | ❌ No | ✅ **YES** (Phase 3) |
| **Variable Naming** | ❌ No | ✅ **YES** (Phase 4) |
| **Backend Mapping** | ✅ **YES** | ❌ No |
| **WebGL Extraction** | ✅ **YES** | ❌ No |
| **Lazy Load Capture** | ✅ **YES** | ❌ No |
| **Validation** | Online vs offline comparison | Syntax validation only |
| **Required** | ✅ **ALWAYS** | ⚠️ Optional (for readability) |

---

## Complete Workflow

```
STEP 1: Run V7 Extractor
─────────────────────────────────────────────────────────
node tools/v7-extractor.js <output-dir> <online-url> <offline-url>

Output:
  ✅ All resources extracted (HTML, CSS, JS, WASM, images, fonts)
  ✅ Lazy-loaded content captured
  ✅ WebGL shaders extracted
  ✅ BACKEND-BLUEPRINT.md generated
  ✅ Completeness score: 100/100

─────────────────────────────────────────────────────────
                        ↓
─────────────────────────────────────────────────────────
STEP 2: Run V8 Enhancer (OPTIONAL)
─────────────────────────────────────────────────────────
python tools/v8-enhance.py ./output/resources/

Output:
  ✅ JavaScript beautified
  ✅ Variables renamed (a, b, c → meaningful names)
  ✅ JSDoc documentation added
  ✅ Code validated

─────────────────────────────────────────────────────────
                        ↓
─────────────────────────────────────────────────────────
STEP 3: Implement Backend (if needed)
─────────────────────────────────────────────────────────
Follow BACKEND-BLUEPRINT.md guide

Options:
  • Mock API with json-server (2-4 hours)
  • Proxy to original backend
  • Build custom backend (2-5 days)

─────────────────────────────────────────────────────────
                        ↓
─────────────────────────────────────────────────────────
STEP 4: Deploy
─────────────────────────────────────────────────────────
Serve extracted files + backend (if applicable)

Result: Pixel-perfect clone with full functionality ✅
```

---

## When to Use What

### Use V7 When:
- ✅ Extracting a webapp for the first time
- ✅ Need to capture lazy-loaded resources
- ✅ Want to understand backend dependencies
- ✅ Building a clone that must work offline
- ✅ Need completeness validation

### Use V8 When:
- ✅ After V7 extraction is complete
- ✅ Need to read/modify extracted JavaScript
- ✅ Debugging webapp behavior
- ✅ Documenting codebase
- ✅ Understanding complex logic

### Skip V8 When:
- ❌ Just deploying the clone as-is
- ❌ Don't need to modify JavaScript
- ❌ Already have readable code
- ❌ Time-constrained (V8 is optional)

---

## Real-World Examples

### Example 1: Photopea (Fully Client-Side)

**V7 Extraction:**
```bash
node tools/v7-extractor.js \
  output/photopea.com-complete \
  https://www.photopea.com \
  http://localhost:3344
```

**V7 Result:**
- 18 file formats discovered
- 12 lazy-loaded decoders captured
- 3,987 total resources
- ❌ NO backend dependencies
- Completeness: 100/100
- **BACKEND-BLUEPRINT.md says: "Fully client-side, no backend work needed!"**

**V8 Enhancement (optional):**
```bash
python tools/v8-enhance.py output/photopea.com-complete/resources/
```

**V8 Result:**
- 1 large bundle file beautified
- 19 variables renamed
- 50 functions documented
- Now readable for debugging/learning

**Deployment:** Just serve the files. Works 100% offline. Done! ✅

---

### Example 2: Project Management App (With Backend)

**V7 Extraction:**
```bash
node tools/v7-extractor.js \
  output/projectapp.com \
  https://projectapp.com \
  http://localhost:3000
```

**V7 Result:**
- All frontend resources extracted
- ✅ 24 API endpoints discovered
- ✅ 3 WebSocket connections found
- ✅ JWT authentication detected
- ✅ Firebase integration documented
- Completeness: 95/100
- **BACKEND-BLUEPRINT.md provides:**
  - Complete API contract
  - WebSocket specs
  - Auth implementation guide
  - 2-5 day implementation estimate

**Backend Implementation (guided by blueprint):**
```bash
# Follow BACKEND-BLUEPRINT.md

# Option 1: Quick mock (2-4 hours)
npm install json-server
npx json-server --watch db.json

# Option 2: Full backend (2-3 days)
# Follow provided Express.js + PostgreSQL examples
```

**V8 Enhancement (optional):**
```bash
python tools/v8-enhance.py output/projectapp.com/resources/
```

**Deployment:** Serve frontend + backend. Fully functional clone! ✅

---

## Tool Files Reference

### V7 Extractor Tools

| File | Purpose |
|------|---------|
| `v7-extractor.js` | Main V7 orchestrator (runs all 5 phases) |
| `v7-analyzer.js` | Phase 1: Feature discovery |
| `v7-test-generator.js` | Phase 2: Test file creation |
| `v7-trigger.js` | Phase 3: Feature triggering |
| `v7-backend-mapper.js` | Phase 4: Backend documentation |
| `v7-validator.js` | Phase 5: Completeness validation |

### V8 Enhancer Tools

| File | Purpose |
|------|---------|
| `v8-enhance.py` | Main V8 CLI (runs all 6 phases) |
| `code_enhancer.py` | V8 pipeline implementation |

---

## FAQ

### Q: Do I always need to run V8 after V7?
**A:** No. V8 is optional. Only run it if you need readable JavaScript for debugging or modification.

### Q: Can V8 run without V7?
**A:** Yes. V8 can beautify any JavaScript file, not just V7 output. But for webapp cloning, always run V7 first.

### Q: Does V7 do any beautifying?
**A:** No. V7 extracts resources exactly as-is. All beautifying happens in V8.

### Q: Does V8 extract any resources?
**A:** No. V8 only processes existing JavaScript files. All extraction happens in V7.

### Q: Which is more important for cloning?
**A:** V7 is critical (extracts everything). V8 is nice-to-have (makes code readable).

### Q: How long does each take?
**A:**
- V7: 5-15 minutes (depending on webapp size)
- V8: 1-5 minutes per JavaScript file

### Q: Can I use V7 without V8?
**A:** Yes! V7 extracts a fully functional clone. V8 just makes the code prettier.

### Q: Does BACKEND-BLUEPRINT.md come from V7 or V8?
**A:** V7. V8 doesn't touch backend documentation.

---

## Summary

**V7 Extractor:**
- Extracts ALL resources from webapps
- Captures lazy-loaded content
- Documents backend dependencies
- Generates engineer implementation guide
- **ALWAYS REQUIRED**

**V8 Enhancer:**
- Beautifies JavaScript (formatting)
- Renames variables (meaningful names)
- Adds documentation (JSDoc)
- **OPTIONAL** (only if you need readable code)

**Together:** Complete webapp cloning system with beautiful, documented code! 🎉
