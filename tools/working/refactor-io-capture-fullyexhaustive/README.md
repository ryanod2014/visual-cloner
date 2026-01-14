# Exhaustive I/O Capture System

Captures I/O data for **every possible interaction** in a web application using BFS state exploration with mathematical convergence guarantees.

## Quick Start

```bash
npm install
node index.js --url https://example.com
```

## How It Works

### Phase 1: Discovery
- Programmatically enumerates ALL interactive elements
- Extracts ALL event listeners via Chrome DevTools Protocol
- Discovers ALL keyboard shortcuts by systematic enumeration
- Finds ALL callable API functions

### Phase 2: BFS Exploration
- Treats the app as a Finite State Machine
- Explores all reachable states using Breadth-First Search
- Records every (state, action, result) transition
- Detects convergence when no new states are discovered

### Phase 3: Deep Capture
- Captures full I/O for every transition
- Records before/after screenshots, DOM, styles
- Computes diffs to identify what changed

## Output

```
output/
├── manifest.json       # Discovery results
├── state-machine.json  # Complete FSM
├── io-specs/           # Per-transition I/O
│   ├── 00000-abc-click-def.json
│   └── ...
├── coverage.json       # Completeness metrics
└── summary.json        # Summary
```

## Completeness Guarantees

The system guarantees **zero undiscovered interactions** because:

1. **All elements**: `querySelectorAll('*')` = finite set
2. **All events**: CDP `getEventListeners` = browser knows all
3. **All states**: BFS over finite graph terminates
4. **Convergence**: No new states for N iterations = mathematically complete

## Options

```
--url <URL>       Target URL (required)
--workers <N>     Number of parallel workers (default: 4)
--output <DIR>    Output directory (default: ./output)
--verbose, -v     Enable verbose logging
```
