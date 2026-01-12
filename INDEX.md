# Visual Cloner - Documentation Index

## Start Here

New to the system? Start with these documents in order:

1. **[V7-QUICK-START.md](./V7-QUICK-START.md)** 🚀 **← START HERE**
   - One command to extract any webapp
   - Clear guide: SPA vs multi-page
   - 95% of webapps = one command!
   - Real-world examples

2. **[THREE-PIPELINES.md](./THREE-PIPELINES.md)** 🎯
   - Overview of ALL pipelines (V7, Behavioral, V8, Complete)
   - When to use each pipeline
   - Complete workflow examples
   - **Includes 100% completeness pipeline** ⭐

3. **[V7-V8-QUICK-REFERENCE.md](./V7-V8-QUICK-REFERENCE.md)** ⚡
   - 5-minute read
   - Clear comparison of V7 vs V8
   - When to use each tool
   - Example commands

3. **[SYSTEM-OVERVIEW.md](./SYSTEM-OVERVIEW.md)** 📖
   - Complete architecture guide
   - Detailed comparison tables
   - Real-world examples
   - Full workflow documentation

4. **[V7-EXTRACTOR.md](./V7-EXTRACTOR.md)** 🔧
   - V7 technical documentation
   - All 5 extraction phases
   - Backend mapping details
   - Validation system

4.5. **[V7-CRAWLER.md](./V7-CRAWLER.md)** 🕷️ **NEW - MULTI-PAGE EXTRACTION**
   - Intelligent multi-page webapp extraction
   - Auto-discovers all site pages
   - Smart classification (app vs content)
   - Resource deduplication
   - Multi-subdomain support

5. **[capture-system/COMPLETE-PIPELINE.md](./capture-system/COMPLETE-PIPELINE.md)** 🎉 **100% COMPLETENESS**
   - 4-step complete extraction pipeline
   - Static analysis + parameter discovery + I/O capture
   - Mathematical proof of 100% completeness
   - For specialized apps (image editors, canvas apps)

6. **[README.md](./README.md)** 🎨
   - Project overview
   - V3 shader extraction features
   - Quick start guide

---

## Quick Answers

### "What extracts resources from websites?"
**V7 Extractor** (single page) or **V7 Crawler** (multi-page) - Runs first, gets all files including WebGL, lazy-loads, and backend docs.

### "How do I extract a multi-page webapp?"
**V7 Crawler** - Automatically discovers all pages, classifies app vs content zones, and extracts with deduplication. See [V7-CRAWLER.md](./V7-CRAWLER.md).

### "What beautifies the JavaScript?"
**V8 Enhancer** - Runs second (optional), makes code readable with formatting and variable naming.

### "Which do I need to clone a webapp?"
**V7 Extractor (single page) or V7 Crawler (multi-page) is required.** V8 is optional (only if you need readable code).

### "Where's the backend documentation?"
V7 generates **BACKEND-BLUEPRINT.md** with complete API contract and implementation guide.

### "Does anything do variable renaming?"
**Yes, V8.** Phase 4 renames variables (a, b, c → userData, isActive, handleClick).

### "Does anything do beautifying/formatting?"
**Yes, V8.** Phase 3 uses Prettier to format code properly.

### "How do I achieve 100% completeness?"
**Use the Complete Pipeline** (for specialized apps like image editors):
1. V7 extraction (gets source code)
2. Static analysis (discovers ALL operations from source)
3. Parameter discovery (finds parameter signatures)
4. Universal capture (captures I/O for all variations)

Result: Mathematical proof of 100% completeness. See [COMPLETE-PIPELINE.md](./capture-system/COMPLETE-PIPELINE.md).

### "What's the difference between Behavioral and Complete pipelines?"
**Behavioral Pipeline** (~60-85% completeness):
- For general webapps (CRUD, dashboards)
- Clicks elements ONCE
- Records UI state changes
- Generates action mappings

**Complete Pipeline** (100% completeness):
- For specialized apps (image editors, canvas apps)
- Uses source code analysis
- Tests ALL parameter variations
- Captures complete I/O examples
- Mathematical proof of completeness

---

## Tool Reference

### V7 Extractor Tools
- `v7-extractor.js` - Main orchestrator (5 phases)
- `v7-analyzer.js` - Feature discovery
- `v7-test-generator.js` - Test file creation
- `v7-trigger.js` - Feature triggering
- `v7-backend-mapper.js` - Backend documentation
- `v7-validator.js` - Completeness validation

### V8 Enhancer Tools
- `v8-enhance.py` - Main CLI (6 phases)

### Complete Pipeline Tools (100% Completeness) ⭐
- `analyze-photopea-source.js` - Static analysis (discover operations from source)
- `discover-parameters.js` - Parameter discovery (find signatures)
- `universal-capture-v5-complete.js` - I/O capture (all variations)
- `universal-capture-v4.js` - Legacy universal capture

**Location:** `capture-system/` directory

### Behavioral Pipeline Tools
- `behavioral-extractor.js` - Standalone behavior recorder
- `pipeline/run-pipeline.js` - Full 5-phase orchestrator
- `pipeline/step3.0-state-extraction.js` - State registry builder
- `pipeline/step2-classify-behaviors.js` - Behavior classifier
- `pipeline/step5.2-wire-behaviors.js` - Code generator

### Other Tools
- `clone-v3-with-shaders.js` - V3 shader extraction
- `generate-template.js` - Template generation

---

## Common Workflows

### Clone a Client-Side App (like Photopea)
```bash
# 1. Extract with V7
node tools/v7-extractor.js output/photopea https://photopea.com http://localhost:3344

# Result: Fully functional clone + "No backend needed" message
# Deploy immediately! ✅

# 2. (Optional) Beautify with V8
python tools/v8-enhance.py output/photopea/resources/

# Result: Same clone, but code is now readable
```

### Clone an App With Backend
```bash
# 1. Extract with V7
node tools/v7-extractor.js output/app https://app.com http://localhost:3000

# Result: Frontend + BACKEND-BLUEPRINT.md with API specs

# 2. Read BACKEND-BLUEPRINT.md
# - See all API endpoints
# - Get implementation options
# - Follow code examples

# 3. Implement backend (choose one):
# - Mock API (2-4 hours)
# - Proxy to original
# - Custom backend (2-5 days)

# 4. (Optional) Beautify with V8
python tools/v8-enhance.py output/app/resources/

# 5. Deploy frontend + backend ✅
```

### Complete Extraction (100% Completeness) - Image Editors, Canvas Apps
```bash
# 1. Extract source code with V7
node tools/v7-extractor.js output/photopea https://photopea.com http://localhost:3344
# Result: JavaScript source code in output/photopea/resources/app.js

# 2. Discover ALL operations via static analysis
cd capture-system
node analyze-photopea-source.js ../output/photopea/resources/app.js
# Result: operations-catalog.json (47 operations discovered from source)

# 3. Discover parameter signatures dynamically
node discover-parameters.js ../output/photopea/resources/operations-catalog.json
# Result: operations-catalog-with-params.json (+ parameter signatures)

# 4. Capture I/O for ALL variations
node universal-capture-v5-complete.js ../output/photopea/resources/operations-catalog-with-params.json
# Result: complete-io-catalog.json (~1,316 I/O examples)

# 5. (Optional) Beautify with V8
cd ..
python tools/v8-enhance.py output/photopea/resources/

# Result: 100% complete catalog with mathematical proof ✅
# - 47/47 operations (from source code analysis)
# - All parameter signatures discovered
# - All variations tested
# - Complete I/O examples
```

---

## Report Files

### V7 Reports
- `v7-analysis-report.json` - All discovered features
- `v7-trigger-report.json` - Testing results
- `v7-backend-report.json` - Backend dependencies (JSON)
- `BACKEND-BLUEPRINT.md` - Engineer implementation guide (Markdown)
- `v7-validation-report.json` - Completeness score
- `V7-EXTRACTION-REPORT.md` - Executive summary

### V8 Reports
- `v8-report.json` - Enhancement results
  - Obfuscation detection
  - Formatting stats
  - Variable renaming counts
  - Documentation stats
  - Validation results

---

## Key Concepts

### V7 = Extraction
- **Extracts:** HTML, CSS, JS, WASM, images, fonts, WebGL shaders
- **Discovers:** File formats, lazy loads, APIs, WebSockets
- **Documents:** Backend dependencies, API contracts
- **Validates:** Online vs offline, completeness score
- **Required:** Always

### V8 = Beautification
- **Beautifies:** JavaScript formatting (Prettier)
- **Renames:** Variables (a, b, c → meaningful names)
- **Documents:** JSDoc comments
- **Validates:** Syntax correctness
- **Required:** Optional (only if you need readable code)

### The Workflow
```
V7 Extraction → (Optional V8 Beautification) → Backend Implementation → Deploy
```

---

## Feature Matrix

| Feature | V7 | V8 | Notes |
|---------|----|----|-------|
| Extract HTML/CSS/JS | ✅ | ❌ | V7 only |
| Extract WebGL shaders | ✅ | ❌ | V7 only |
| Capture lazy-loaded files | ✅ | ❌ | V7 only |
| Map backend APIs | ✅ | ❌ | V7 only |
| Generate backend docs | ✅ | ❌ | V7 only |
| Validate completeness | ✅ | ❌ | V7 only |
| Beautify JavaScript | ❌ | ✅ | V8 only |
| Rename variables | ❌ | ✅ | V8 only |
| Add JSDoc comments | ❌ | ✅ | V8 only |

---

## Documentation by Topic

### Architecture & Overview
- [SYSTEM-OVERVIEW.md](./SYSTEM-OVERVIEW.md) - Complete system documentation
- [V7-V8-QUICK-REFERENCE.md](./V7-V8-QUICK-REFERENCE.md) - Quick comparison

### Extraction (V7)
- [V7-EXTRACTOR.md](./V7-EXTRACTOR.md) - Full V7 documentation
- [EXTRACTION-COMPLETENESS.md](./EXTRACTION-COMPLETENESS.md) - Validation details

### Beautification (V8)
- [tools/v8-enhance.py](./tools/v8-enhance.py) - Tool documentation (in docstring)

### Other Features
- [README.md](./README.md) - V3 shader extraction
- [CLAUDE.md](./CLAUDE.md) - Claude Code integration
- [QUICK-START.md](./QUICK-START.md) - Quick start guide

### Implementation
- `BACKEND-BLUEPRINT.md` (generated) - Backend implementation guide
- `V7-EXTRACTION-REPORT.md` (generated) - Extraction results

---

## Quick Command Reference

```bash
# V7: Extract webapp
node tools/v7-extractor.js <output-dir> <online-url> <offline-url>

# V8: Beautify JavaScript
python tools/v8-enhance.py <input-file-or-dir>

# V3: Clone with shaders
node tools/clone-v3-with-shaders.js <url>

# Generate template from clone
node tools/generate-template.js <clone-dir>
```

---

## Getting Help

1. **Quick questions?** See [V7-V8-QUICK-REFERENCE.md](./V7-V8-QUICK-REFERENCE.md)
2. **Architecture questions?** See [SYSTEM-OVERVIEW.md](./SYSTEM-OVERVIEW.md)
3. **V7 technical details?** See [V7-EXTRACTOR.md](./V7-EXTRACTOR.md)
4. **V8 options?** Run `python tools/v8-enhance.py --help`

---

## Remember

**V7 = Gets the files** (extraction)
**V8 = Makes them pretty** (beautification)

V7 always runs first. V8 is optional.

Happy cloning! 🎉
