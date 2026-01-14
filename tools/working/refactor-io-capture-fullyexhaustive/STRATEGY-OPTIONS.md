# Exhaustive I/O Capture: Strategy Options

> **Read this file** when resuming work on the I/O capture system.
> Last updated: January 2025

## The Goal

Capture I/O data for **EVERY** possible interaction in a web app so we can recreate it in a clean room. Requirements:
- Zero undiscovered/untested parts
- Fastest time possible (target: < 3 minutes)
- Works universally on any app

---

## Table of Contents

1. [The Core Problem](#the-core-problem)
2. [Approach Comparison Matrix](#approach-comparison-matrix)
3. [Detailed Strategies](#detailed-strategies)
4. [Why GPU Won't Help](#why-gpu-wont-help)
5. [The Winning Architecture](#the-winning-architecture)
6. [Implementation Status](#implementation-status)
7. [Next Steps](#next-steps)

---

## The Core Problem

### State Space Explosion

```
For a complex app (e.g., Photopea):
- UI States:        1,000+
- Actions/State:    100+
- Input Variations: 100+
- Total:            10,000,000+ test cases

At 50ms each:
- Sequential:       139 hours
- 100 parallel:     1.4 hours
- 1000 parallel:    8 minutes
- 3000 parallel:    3 minutes
```

### What Clean Room Needs

| Requirement | Description |
|-------------|-------------|
| All states | Every possible UI configuration |
| All transitions | Every action that changes state |
| All I/O mappings | Input → Output for every function |
| All error paths | What happens when things fail |

---

## Approach Comparison Matrix

| Approach | Coverage | Time | Cost | Complexity |
|----------|----------|------|------|------------|
| **BFS State Exploration** | 99%+ | Hours | $0 | Medium |
| **Static AST Extraction** | 60-80% | Seconds | $0 | Low |
| **Code Instrumentation** | 80-90% | Minutes | $0 | Medium |
| **Declarative Extraction** | 90-95%* | Seconds | $0 | Low |
| **Cloud Burst (1000 browsers)** | 99%+ | 3 min | $0.50 | High |
| **Hybrid (Static + Shallow BFS)** | 90-95% | 5-10 min | $0 | Medium |

*Only for apps with declarative UI definitions (like Photopea)

---

## Detailed Strategies

### Strategy 1: BFS State Exploration (Original Approach)

**How it works:**
- Treat app as finite state machine
- BFS traversal of all reachable states
- Capture I/O at each state transition

**Pros:**
- Guarantees complete coverage
- Discovers hidden states

**Cons:**
- Slow (hours for complex apps)
- State explosion problem

**Code:** Already implemented in `exploration/bfs.js`

---

### Strategy 2: Static AST Extraction

**How it works:**
- Parse JavaScript source with Babel/Acorn
- Extract all function definitions
- Extract all addEventListener calls
- Extract keyboard shortcut registrations

**Pros:**
- Very fast (seconds)
- No browser needed

**Cons:**
- Can't see dynamic behavior
- Misses runtime-generated code
- ~60-80% coverage

**Tools:**
- `@babel/parser` - AST parsing
- `@babel/traverse` - AST traversal
- `acorn` - Lightweight alternative

**Example pattern:**
```javascript
traverse(ast, {
  CallExpression(path) {
    if (callee.property.name === 'addEventListener') {
      // Found event listener
    }
  }
});
```

---

### Strategy 3: Code Instrumentation

**How it works:**
- Inject hooks into all browser APIs before page loads
- Capture all I/O as side effect of execution
- Trigger interactions programmatically

**What to hook:**
```javascript
// Events
EventTarget.prototype.addEventListener
EventTarget.prototype.removeEventListener

// Network
window.fetch
XMLHttpRequest.prototype.open/send

// Storage
localStorage.setItem/getItem
sessionStorage.setItem/getItem

// DOM
Element.prototype.appendChild
Element.prototype.innerHTML (setter)
```

**Pros:**
- Captures everything that executes
- Universal (works on any app)

**Cons:**
- Only captures what actually runs
- Needs to trigger all code paths

**Research:** See `CODE_INSTRUMENTATION_RESEARCH.md`

---

### Strategy 4: Declarative UI Extraction (Photopea-Specific)

**Key Discovery:** Photopea has declarative definitions we can extract directly!

**Sources:**
| Source | What We Get |
|--------|-------------|
| Photopea API docs | 61 tool IDs, 22 panel IDs, menu structure |
| Adobe Photoshop JS Reference | Complete typed I/O signatures |
| Existing manifest | 126 operations already documented |

**Why this is fast:**
- No exploration needed
- Extract definitions in milliseconds
- Parallel verification in seconds

**Limitations:**
- Only works for apps with declarative UI definitions
- Not universal

**Research:** See `photopea-io-extraction-strategy.md`

---

### Strategy 5: Cloud Burst Parallelization

**How it works:**
- Spin up 1000+ browser instances in cloud
- Distribute state exploration across them
- Collect results via Redis queue
- Tear down when done

**Architecture:**
```
Coordinator (your PC)
    │
    ▼
Redis Queue ◄──► Cloud Instances (1000+ browsers)
    │
    ▼
Merged Results
```

**Cloud Options:**
| Provider | Instance | RAM | Browsers | Cost/hr |
|----------|----------|-----|----------|---------|
| AWS | r5.4xlarge | 128GB | 100 | $1.00 |
| AWS | r5.24xlarge | 768GB | 500 | $6.00 |
| GCP | n2-highmem-64 | 512GB | 400 | $4.00 |

**Cost for 3-minute run:** ~$0.50-$1.00

**Pros:**
- Achieves exhaustive coverage
- Under 3 minutes
- Scales linearly

**Cons:**
- Cloud setup complexity
- Costs money (though cheap)
- Network coordination overhead

---

### Strategy 6: Hybrid Approach (Recommended)

**Combines multiple strategies:**

```
Phase 1: Static Extraction (30 sec)
├── AST parse → functions, events, handlers
├── CDP getEventListeners → all registered events
├── DOM scan → all interactive elements
└── Declarative extraction (if available)

Phase 2: Instrumentation + Shallow BFS (2 min)
├── Inject universal I/O hooks
├── BFS to depth 2-3 (covers 90% of real usage)
├── 100 parallel browser contexts
└── Combinatorial inputs (3-way)

Phase 3: Gap Analysis (30 sec)
├── Compare: discovered vs executed functions
├── Report coverage percentage
└── Generate targeted follow-up plan
```

**Expected coverage:** 90-95% in 3 minutes

---

## Why GPU Won't Help

### The Bottleneck

| Component | Runs On | GPU Possible? |
|-----------|---------|---------------|
| JavaScript Engine (V8) | CPU | No - complex branching |
| DOM/Layout (Blink) | CPU | No - tree traversal |
| Rendering (Skia) | GPU | Yes, but we need state not pixels |
| Network Stack | I/O | No - async operations |

### GPU vs CPU for This Problem

**GPUs excel at:** SIMD (Same Instruction, Multiple Data)
- Matrix multiplication
- Image processing
- Neural networks

**State exploration is:** MIMD (Multiple Instruction, Multiple Data)
- Each state has different valid actions
- Branching logic everywhere
- Sequential dependencies

**Conclusion:** GPU parallelization won't help. Use CPU parallelization instead (cloud burst).

---

## The Winning Architecture

### For Photopea Specifically (< 3 min)

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: STATIC EXTRACTION (10 seconds)                    │
│  • Fetch Photopea API docs → tool IDs, panel IDs           │
│  • Adobe PS JS Reference → typed I/O signatures             │
│  • AST parse source → functions, events                     │
│  • Merge with existing 126-operation manifest               │
│  Result: ~500-1000 operations with signatures               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 2: PARALLEL VERIFICATION (2 minutes)                 │
│  • Spawn 100 browser contexts (single machine, 32GB)        │
│  • Each context executes ~10 operations                     │
│  • Per operation: 50ms (execute + capture before/after)     │
│  • 1000 ops ÷ 100 parallel × 50ms = 0.5 seconds            │
│  • Add overhead (page loads): ~90 seconds                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 3: GAP DETECTION (30 seconds)                        │
│  • Compare executed vs AST-discovered functions             │
│  • Flag untested operations                                 │
│  • Generate coverage report                                 │
└─────────────────────────────────────────────────────────────┘
```

### For Universal Apps (< 3 min, 95% coverage)

```
Static Extraction → Instrumentation → Parallel Execution → Gap Report
     (30s)              (inject)           (2min)           (30s)
```

### For Universal Apps (99%+ coverage, ~$0.50)

```
Cloud Burst: 1000+ browsers across cloud instances
             Distributed BFS with Redis coordination
             ~3 minutes, ~$0.50 per run
```

---

## Implementation Status

### Completed

| File | Description | Status |
|------|-------------|--------|
| `index.js` | Main orchestrator | ✅ Done |
| `utils/config.js` | Configuration | ✅ Done |
| `utils/logger.js` | Logging | ✅ Done |
| `utils/selectors.js` | CSS selector generation | ✅ Done |
| `discovery/elements.js` | DOM element enumeration | ✅ Done |
| `discovery/events.js` | CDP event extraction | ✅ Done |
| `discovery/keyboard.js` | Shortcut enumeration | ✅ Done |
| `discovery/api.js` | Window API discovery | ✅ Done |
| `exploration/state.js` | State capture/hash | ✅ Done |
| `exploration/bfs.js` | BFS exploration | ✅ Done |
| `exploration/convergence.js` | Completion detection | ✅ Done |
| `capture/io.js` | I/O capture | ✅ Done |
| `capture/diff.js` | State diffing | ✅ Done |
| `capture/serialize.js` | JSON output | ✅ Done |

### Not Yet Implemented

| Feature | Description | Priority |
|---------|-------------|----------|
| Static AST extraction | Babel-based function extraction | High |
| Declarative extractor | Photopea API/Adobe docs parser | High |
| Cloud burst coordinator | Distributed execution | Medium |
| Code instrumentation injector | Universal I/O hooks | Medium |
| Combinatorial input generator | 3-way test generation | Medium |

---

## Next Steps

### Option A: Photopea-Optimized (Fast)

1. Build declarative extractor for Photopea API docs
2. Merge with existing 126-operation manifest
3. Parallel execution with 100 browser contexts
4. **Expected: 90-95% coverage in < 3 minutes**

### Option B: Universal Hybrid (Balanced)

1. Build AST extractor for any JavaScript
2. Build instrumentation injector
3. Shallow BFS (depth 2-3) with parallelization
4. **Expected: 90-95% coverage in 5-10 minutes**

### Option C: Cloud Burst (Complete)

1. Build Redis-based job queue
2. Build cloud instance orchestrator (AWS/GCP)
3. Distributed BFS across 1000+ browsers
4. **Expected: 99%+ coverage in < 3 minutes, ~$0.50/run**

---

## Research Documents

| File | Contents |
|------|----------|
| `EXHAUSTIVE-IO-CAPTURE-PLAN.md` | Original architecture plan |
| `CODE_INSTRUMENTATION_RESEARCH.md` | Monkey-patching strategies |
| `photopea-io-extraction-strategy.md` | Photopea-specific extraction |

---

## Key Insights

1. **Declarative > Exploration**: If an app has declarative UI definitions, extract them directly instead of exploring.

2. **Parallelization is cheap**: 1000 browsers in the cloud costs ~$0.50 for 3 minutes.

3. **GPU won't help**: Browsers are CPU-bound. Use CPU parallelization.

4. **95% is achievable in 3 min**: With smart sampling and shallow BFS.

5. **99% needs cloud burst**: For truly exhaustive coverage, need massive parallelization.

6. **Hybrid wins**: Combine static extraction + instrumentation + shallow BFS for best results.

---

## Quick Start

```bash
# Current implementation (BFS-based, slower)
cd refactor-io-capture-fullyexhaustive
npm install
node index.js --url http://localhost:3000 --verbose

# For faster results, implement Option A or B above
```

---

*Document created during strategy session. Update as implementation progresses.*
