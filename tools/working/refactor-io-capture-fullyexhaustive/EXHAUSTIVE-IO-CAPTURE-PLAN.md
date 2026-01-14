# Exhaustive I/O Capture System

## Overview
- Goal: Capture I/O data for EVERY possible interaction in a web app
- Approach: Treat app as Finite State Machine, BFS exploration
- Guarantee: Mathematical completeness via convergence detection

## Architecture
```
Phase 1: Discovery → Phase 2: BFS Exploration → Phase 3: Deep Capture
```

### Phase 1: Programmatic Discovery
- Element enumeration (querySelectorAll + visibility)
- Event listener extraction (Chrome DevTools Protocol)
- Keyboard shortcut enumeration (all key combos)
- API function discovery (window-level callables)

### Phase 2: BFS State Exploration
- State hashing (canonical DOM fingerprint)
- BFS queue with visited set
- Convergence detection (no new states for N iterations)
- Completeness proof

### Phase 3: Deep I/O Capture
- Per-action before/after capture
- Screenshot, DOM, styles, console, network
- Diff computation

## Module Structure
```
refactor-io-capture-fullyexhaustive/
├── index.js              # Main orchestrator
├── discovery/
│   ├── elements.js       # DOM element enumeration
│   ├── events.js         # Event listener extraction
│   ├── keyboard.js       # Keyboard shortcut discovery
│   └── api.js            # API function discovery
├── exploration/
│   ├── state.js          # State capture/hash/restore
│   ├── bfs.js            # BFS exploration engine
│   └── convergence.js    # Convergence detection
├── capture/
│   ├── io.js             # I/O capture per action
│   ├── diff.js           # Diff computation
│   └── serialize.js      # Serialization utilities
├── workers/
│   ├── coordinator.js    # Work queue management
│   └── worker.js         # Individual worker
└── utils/
    ├── selectors.js      # Unique selector generation
    ├── logger.js         # Debug logging
    └── config.js         # Configuration
```

## Completeness Guarantees
- All elements: querySelectorAll('*') = finite
- All events: CDP getEventListeners = browser knows all
- All states: BFS over finite graph terminates
- Convergence: No new states for 100 iterations = done

## Output Format
```
output/
├── manifest.json         # Discovery results
├── state-machine.json    # Complete FSM
├── io-specs/             # Per-transition I/O
└── coverage.json         # Completeness proof
```

## Usage
```bash
node index.js --url https://example.com --workers 4
```
