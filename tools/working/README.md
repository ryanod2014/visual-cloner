# Working Tools

This directory contains the verified, production-ready tools for the visual cloner system.

## Organization

```
working/
├── README.md                    # This file
└── capture-io-data/             # I/O data capture tools
    ├── README.md                # Complete capture system docs
    ├── capture-bulletproof.js   # Automatic discovery + execution
    └── capture-full.js          # Browser-based pixel capture
```

---

## I/O Data Capture Tools

**Location:** `capture-io-data/`

Tools for automatically capturing input/output data from JavaScript functions.

### Universal Format

All tools capture the same simple format:

```json
{
  "function": "functionName",
  "input": <data>,
  "output": <data>
}
```

Different data structures for different domains:
- **Numbers**: `{"input": [2, 3], "output": 5}`
- **Pixels**: `{"input": {"pixels": [255,0,0,255]}, "output": {"pixels": [0,255,255,255]}}`
- **Audio**: `{"input": {"samples": [0.5,0.3]}, "output": {"samples": [0.5,0.4]}}`

### Tools

| Tool | Discovery | Execution | Best For |
|------|-----------|-----------|----------|
| **capture-bulletproof.js** | ✅ Automatic (AST) | Node.js sandbox | Numbers, strings, arrays |
| **capture-full.js** | Manual list (126 ops) | ✅ Real browser | Pixels, Canvas operations |

**See `capture-io-data/README.md` for complete documentation.**

### Key Insight

- **capture-bulletproof.js** discovers ALL functions automatically but can't execute browser APIs
- **capture-full.js** executes successfully in browser but uses manual operation list
- **Ideal solution**: Use bulletproof to discover → feed to capture-full to execute

### Current Coverage

| Data Type | Status | Output Size |
|-----------|--------|-------------|
| Numbers/Strings/Arrays | ✅ Working | ~1 MB |
| Pixel arrays (RGBA) | ✅ Working | 131 MB |
| Audio samples | ❓ Not implemented | - |
| 3D vertices | ❓ Not implemented | - |

---

## Future Tools

As new working tools are verified, they'll be added here with full documentation.
