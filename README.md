# Visual Cloner

Extract and run any webapp locally with full offline support.

## Quick Start

```bash
# 1. Extract a website
cd refactored_starting_from_scratch
node extract.js https://photopea.com

# 2. Serve it locally
cd output/photopea.com-*/
node serve.js

# 3. Open in browser
open http://localhost:3333
```

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    EXTRACTION PIPELINE                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. CAPTURE      Browser intercepts all network requests     │
│                  → HTML, CSS, JS, WASM, images, fonts        │
│                                                              │
│  2. DISCOVER     Finds lazy-loaded chunks                    │
│                  → Webpack manifests, dynamic imports        │
│                                                              │
│  3. PATCH        Bypasses domain checks at runtime           │
│                  → License validation, hostname checks       │
│                                                              │
│  4. SERVE        Self-contained local server                 │
│                  → No external dependencies                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
visual-cloner/
├── refactored_starting_from_scratch/   # Main extraction pipeline
│   ├── extract.js                      # Entry point
│   ├── core/                           # Pipeline orchestration
│   ├── phases/                         # Extraction phases
│   ├── plugins/                        # Patchers, triggers
│   └── output/                         # Extracted sites
│
├── tools/                              # Utility scripts
├── universal-mocker/                   # API mocking system
├── .archive/                           # Old experiments (reference)
└── output/                             # Legacy extractions
```

## Extracted Site Structure

Each extraction produces a self-contained directory:

```
output/photopea.com-1234567890/
├── index.html          # Entry point
├── serve.js            # Local server with runtime patching
├── url-map.json        # URL → local file mapping
├── manifest.json       # Extraction metadata
├── resources/          # All captured files
│   ├── r0.html
│   ├── r1.js
│   └── ...
└── __runtime__/        # Runtime mocks
    ├── runtime-mock.js
    ├── network-interceptor.js
    └── indexeddb-mock.js
```

## Runtime Patching

The server applies patches at startup to bypass domain restrictions:

| Patch | Purpose |
|-------|---------|
| `lm-variable` | Force app mode (Photopea vs Vectorpea) |
| `U.alp` | App mode function override |
| `hostname-check` | Bypass domain validation |
| `license-check` | Bypass license validation |

## Supported Sites

Tested and working:
- **Photopea** - Full image editor functionality
- **Vectorpea** - Vector editing mode
- **Jampea** - Audio editing mode

## Architecture Notes

### Same Codebase, Different Apps

Photopea, Vectorpea, and Jampea share the same codebase. A single variable `lm` determines the mode:
- `lm = 0` → Photopea (image editor)
- `lm = 1` → Vectorpea (vector editor)
- `lm = 2` → Jampea (audio editor)

### Network Interception

The `network-interceptor.js` intercepts browser fetch/XHR requests to:
1. Route requests to local extracted resources
2. Fall back to network for uncaptured resources
3. Track request statistics

### Runtime Mocking

The `runtime-mock.js` provides:
- Location spoofing (makes app think it's on original domain)
- IndexedDB persistence
- Auth state mocking

## Development

```bash
# Install dependencies
npm install

# Run extraction
cd refactored_starting_from_scratch
node extract.js <url>

# Serve extracted site
cd output/<site>/
node serve.js
```

## Known Issues

1. **Browser caching** - Use hard refresh (Cmd+Shift+R) if seeing old content
2. **Some external APIs** - May need network access for auth, analytics
3. **WebGL shaders** - Some require additional extraction steps

## License

MIT
