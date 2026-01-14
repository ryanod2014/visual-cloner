# I/O Data Capture Tools

This directory contains tools for capturing input/output data from JavaScript functions.

## Universal Format

All tools capture the same simple format with different data structures:

```json
{
  "function": "functionName",
  "input": <data>,
  "output": <data>
}
```

**Examples:**
- Numbers: `{"input": [2, 3], "output": 5}`
- Pixels: `{"input": {"pixels": [255,0,0,255]}, "output": {"pixels": [0,255,255,255]}}`
- Audio: `{"input": {"samples": [0.5,0.3]}, "output": {"samples": [0.5,0.4]}}`

---

## Tools Overview

| Tool | Discovery | Execution | Environment | Best For |
|------|-----------|-----------|-------------|----------|
| **capture-bulletproof.js** | ✅ Automatic (AST) | ✅ Executes | ❌ Node.js only | Numbers, strings, arrays |
| **capture-full.js** | ❌ Manual list | ✅ Executes | ✅ Real browser | Pixels, Canvas, ImageData |

---

## 1. capture-bulletproof.js

**Purpose**: Automatically discover and capture I/O for ALL functions in JavaScript code

### How It Works

```
JavaScript Source Code
         ↓
    [AST Parser]
         ↓
   Find ALL functions ────────────────┐
         ↓                            │
   Extract ALL literals               │ DISCOVERY
         ↓                            │
   Extract ALL call sites ────────────┘
         ↓
   Generate input combinations ───────┐
         ↓                            │
   Execute in Node.js sandbox         │ EXECUTION
         ↓                            │
   Capture I/O pairs ─────────────────┘
         ↓
   Save JSON files
```

### What It Discovers

- **ALL functions** via AST parsing (no manual list needed)
- **ALL valid inputs** from:
  - Literal values in code (strings, numbers)
  - Function call sites with actual arguments
  - Type inference from parameter names

### Output Format

```json
{
  "function": "add",
  "params": ["a", "b"],
  "isConstructor": false,
  "callSiteCount": 5,
  "results": [
    {"input": [2, 3], "output": 5, "error": null},
    {"input": [10, 20], "output": 30, "error": null},
    {"input": ["hello", "world"], "output": "helloworld", "error": null}
  ]
}
```

### Limitations

**Cannot capture:**
- ❌ Canvas operations (no Canvas API in Node.js)
- ❌ ImageData operations (no browser APIs)
- ❌ DOM operations (no document/window)
- ❌ WebGL operations (no GPU context)

**Error example:**
```json
{
  "input": [[255,0,0,255], 100, 100, 5],
  "output": null,
  "error": "Canvas is not defined"
}
```

### Usage

```bash
node capture-bulletproof.js
```

**Output location:** `captured-io/bulletproof/`

---

## 2. capture-full.js

**Purpose**: Execute image operations in real browser and capture pixel transformations

### How It Works

```
Manual Operation List (126 ops)
         ↓
   [Parallel Browsers] ───────────────┐
         ↓                            │
   Open Photopea.com                  │
         ↓                            │ SETUP
   Load test image (100x100)          │
         ↓                            │
   Capture BEFORE pixels ─────────────┘
         ↓
   Execute operation (e.g. blur) ─────┐
         ↓                            │ EXECUTION
   Capture AFTER pixels               │
         ↓                            │
   Save I/O pair ──────────────────────┘
         ↓
   Repeat for all operations
```

### What It Captures

**Manually curated list of 126 operations:**
- Gaussian Blur (8 variations)
- Brightness/Contrast (11 variations)
- Levels (6 variations)
- Curves (5 variations)
- Hue/Saturation (10 variations)
- Posterize (8 variations)
- Threshold (9 variations)
- Motion Blur (6 variations)
- Sharpen (2 variations)
- Unsharp Mask (7 variations)
- High Pass (7 variations)
- Stylize (3 variations)
- Noise (7 variations)
- Median (4 variations)
- Maximum/Minimum (8 variations)
- Exposure (7 variations)
- Vibrance (7 variations)
- Color Balance (6 variations)
- And more...

### Output Format

```json
{
  "operation": "GaussianBlur_5",
  "params": {"radius": 5},
  "script": "app.activeDocument.activeLayer.applyGaussianBlur(5)",
  "input": {
    "width": 100,
    "height": 100,
    "pixels": [128, 128, 128, 255, 128, 128, 128, 255, ...]
  },
  "output": {
    "width": 100,
    "height": 100,
    "pixels": [126, 126, 126, 255, 127, 127, 127, 255, ...]
  }
}
```

Each operation includes:
- 40,000 RGBA values for input (100×100×4)
- 40,000 RGBA values for output (100×100×4)
- Complete before/after pixel transformation

### Advantages

**Can capture:**
- ✅ Canvas operations (real browser)
- ✅ ImageData operations (real APIs)
- ✅ All image filters (Photopea running)
- ✅ Exact pixel transformations

### Usage

```bash
# Single-threaded
node capture-full.js

# Parallel (4 browsers)
PARALLEL=4 node capture-full.js
```

**Output location:** `capture-system/output/full-specs/`

**Output size:** 29 files, 131 MB total

---

## Comparison

### capture-bulletproof.js Strengths
- ✅ **Automatic discovery** - finds ALL functions without manual list
- ✅ **Exhaustive** - discovers every function in codebase
- ✅ **Fast** - no browser overhead
- ✅ **General purpose** - works on any JavaScript code

### capture-bulletproof.js Weaknesses
- ❌ **Node.js sandbox** - can't execute browser APIs
- ❌ **Fails on images** - no Canvas/ImageData support

### capture-full.js Strengths
- ✅ **Real browser** - full API support
- ✅ **Works on images** - captures pixel data successfully
- ✅ **Accurate** - uses actual Photopea implementation

### capture-full.js Weaknesses
- ❌ **Manual list** - 126 operations hardcoded
- ❌ **Not exhaustive** - might miss operations
- ❌ **Slow** - requires browser automation

---

## The Ideal Solution

**Combine both tools:**

```
1. Run capture-bulletproof.js on Photopea source
   → Discovers ALL 500+ functions (including image ops)

2. Extract image operation function names
   → Filter for: gaussianBlur, brightness, contrast, etc.

3. Auto-generate OPERATIONS list for capture-full.js
   → Replace manual 126-item list

4. Run capture-full.js with complete list
   → Capture I/O for ALL discovered operations
```

**This would be:**
- ✅ Fully automatic discovery
- ✅ Fully exhaustive execution
- ✅ Complete pixel I/O capture

---

## Current Coverage

### Data Types Captured

| Data Type | Tool | Status | Output Size |
|-----------|------|--------|-------------|
| Numbers | capture-bulletproof.js | ✅ Working | ~1 MB |
| Strings | capture-bulletproof.js | ✅ Working | ~1 MB |
| Arrays/Objects | capture-bulletproof.js | ✅ Working | ~1 MB |
| Pixel arrays (RGBA) | capture-full.js | ✅ Working | 131 MB |
| Audio samples | ❓ Not implemented | ❌ | - |
| 3D vertices | ❓ Not implemented | ❌ | - |
| WebGL shaders | ❓ Not implemented | ❌ | - |

### Function Types Captured

| Function Type | Discovery | Execution | Example |
|---------------|-----------|-----------|---------|
| Math operations | ✅ bulletproof | ✅ bulletproof | `add(2,3) → 5` |
| String operations | ✅ bulletproof | ✅ bulletproof | `upper("hi") → "HI"` |
| Array operations | ✅ bulletproof | ✅ bulletproof | `sort([3,1]) → [1,3]` |
| Image filters | ✅ bulletproof | ✅ capture-full | `blur(img,5) → blurred` |
| Canvas operations | ✅ bulletproof | ✅ capture-full | `draw(ctx) → pixels` |

---

## File Structure

```
capture-io-data/
├── README.md                    # This file
├── capture-bulletproof.js       # Automatic discovery + Node.js execution
└── capture-full.js              # Manual list + Browser execution

Output locations:
├── captured-io/bulletproof/     # bulletproof outputs
│   ├── _all.json               # All functions
│   ├── _literals.json          # All literals found
│   ├── _callsites.json         # All function calls
│   └── {functionName}.json     # Individual function I/O
│
└── capture-system/output/full-specs/  # capture-full outputs
    ├── all-operations.json            # All 126 operations
    ├── GaussianBlur.json              # 8 blur variations
    ├── BrightnessContrast.json        # 11 variations
    └── ... (29 files total)
```

---

## Next Steps

### To Achieve Full Automation

1. **Run discovery on Photopea source:**
   ```bash
   node capture-bulletproof.js
   ```

2. **Extract image operation names:**
   ```bash
   jq '.[] | select(.function | test("blur|Blur|contrast|brightness|filter|Filter")) | .function' \
      captured-io/bulletproof/_all.json > discovered-image-ops.txt
   ```

3. **Generate capture-full.js operation list:**
   - Parse discovered-image-ops.txt
   - Infer parameter ranges from call sites
   - Generate OPERATIONS array dynamically

4. **Run capture-full.js with complete list:**
   ```bash
   node capture-full.js --discovered-ops discovered-image-ops.txt
   ```

This would create a **fully automatic, fully exhaustive** I/O capture system.
