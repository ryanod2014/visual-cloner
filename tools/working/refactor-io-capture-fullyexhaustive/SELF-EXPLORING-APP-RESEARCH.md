# Self-Exploring / Self-Testing Web Applications Research

## Executive Summary

The goal: **Make the app be its own explorer, not external BFS.**

This research explores techniques where a web application can explore itself, leveraging the insight that the app **KNOWS its own state space**.

---

## 1. Injecting Code to Trigger ALL Event Handlers

### The Core Problem
There is **no native DOM API** to enumerate event listeners added via `addEventListener`. The DOM Level 3 specification defines `eventListenerList`, but no browser actually implements it.

### Solution A: Chrome DevTools Protocol (CDP) - `DOMDebugger.getEventListeners`

**This is the most powerful approach for programmatic access.**

```javascript
// Using Puppeteer with CDP
const client = await page.target().createCDPSession();

// Get all elements
const nodes = await page.$$('*');

for (const node of nodes) {
  const { listeners } = await client.send('DOMDebugger.getEventListeners', {
    objectId: node._remoteObject.objectId
  });

  // listeners contains: type, handler, useCapture, passive, once
  for (const listener of listeners) {
    console.log(`Event: ${listener.type} on element`);
    // Can invoke listener.handler programmatically
  }
}
```

**Key CDP Methods:**
- `DOMDebugger.getEventListeners(objectId)` - Returns all listeners for an object
- `Runtime.callFunctionOn` - Can invoke the handler function directly
- `DOM.getDocument` + `DOM.querySelectorAll` - Get all elements

**Limitations:**
- Handler property is optional in response
- Requires CDP session (Puppeteer/Playwright)

### Solution B: Monkey-Patching `addEventListener`

**Intercept all event registrations at the source:**

```javascript
// Inject BEFORE app loads
(function() {
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const eventRegistry = new Map();

  window.__EVENT_REGISTRY__ = eventRegistry;

  EventTarget.prototype.addEventListener = function(type, handler, options) {
    // Store in registry
    if (!eventRegistry.has(this)) {
      eventRegistry.set(this, []);
    }
    eventRegistry.get(this).push({ type, handler, options });

    // Call original
    return originalAddEventListener.call(this, type, handler, options);
  };

  // Also patch removeEventListener to track removals
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.removeEventListener = function(type, handler, options) {
    // Update registry...
    return originalRemoveEventListener.call(this, type, handler, options);
  };
})();

// Later: Enumerate and invoke all handlers
function triggerAllHandlers() {
  for (const [element, handlers] of window.__EVENT_REGISTRY__) {
    for (const { type, handler } of handlers) {
      const event = new Event(type, { bubbles: true });
      handler.call(element, event);
    }
  }
}
```

**Advantages:**
- Works in any browser
- Captures handlers as they're registered
- Can invoke handlers directly without dispatching events

**Limitations:**
- Must inject BEFORE app initializes
- Doesn't capture handlers added before injection
- Shadow DOM listeners may be isolated

### Solution C: React/Vue/Angular Framework Introspection

**React Fiber Tree Access:**
```javascript
// Access React's internal fiber tree
const fiberRoot = [...window.__REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots(1)][0];
const rootFiber = fiberRoot.current;

function walkFiberTree(fiber, callback) {
  callback(fiber);
  if (fiber.child) walkFiberTree(fiber.child, callback);
  if (fiber.sibling) walkFiberTree(fiber.sibling, callback);
}

walkFiberTree(rootFiber, (fiber) => {
  // fiber.memoizedProps contains all props including onClick, onChange, etc.
  const props = fiber.memoizedProps;
  if (props) {
    Object.keys(props).filter(k => k.startsWith('on')).forEach(eventProp => {
      console.log(`Found handler: ${eventProp}`);
      // Can invoke: props[eventProp](syntheticEvent)
    });
  }
});
```

**Vue Component Access:**
```javascript
// Vue 3
const vm = app._instance;
// Access component props via $props
// Access events via $attrs (fallthrough attributes)
```

---

## 2. Property-Based Testing (QuickCheck-style) for Web Apps

### YES, it exists! Key Libraries:

#### fast-check (Recommended)
```javascript
import fc from 'fast-check';

// Test that a form handles any input
fc.assert(
  fc.property(
    fc.string(),           // Generate random strings
    fc.integer(),          // Generate random integers
    async (name, age) => {
      await page.fill('#name', name);
      await page.fill('#age', String(age));
      await page.click('#submit');

      // Property: Form should never crash
      const hasError = await page.$('.crash-error');
      return hasError === null;
    }
  )
);

// Generate random UI actions
const uiAction = fc.oneof(
  fc.constant({ type: 'click', selector: 'button' }),
  fc.record({ type: fc.constant('type'), text: fc.string() }),
  fc.constant({ type: 'scroll', direction: 'down' })
);

fc.assert(
  fc.property(fc.array(uiAction), async (actions) => {
    for (const action of actions) {
      await executeAction(action);
    }
    // Property: No JS errors should occur
    const errors = await page.evaluate(() => window.__errors__);
    return errors.length === 0;
  })
);
```

#### Other Libraries:
- **JSVerify** - Earlier QuickCheck port, simpler API
- **proptest** - TypeScript-focused, rose tree shrinking

### Key Insight for Self-Exploration:
Property-based testing can **generate sequences of valid UI actions** and verify invariants hold. Combined with event handler enumeration, you can:
1. Extract all possible actions from the app
2. Generate random sequences of those specific actions
3. Shrink failing sequences to minimal reproduction

---

## 3. Fuzz Testing for 100% Coverage

### Coverage-Guided Fuzzing Approach

**The key is feedback-based fuzzing** - use code coverage to guide input generation:

```javascript
// Conceptual approach using instrumentation
async function coverageGuidedFuzz(page) {
  await page.coverage.startJSCoverage();

  const corpus = []; // Interesting inputs that increased coverage
  let totalCoverage = new Set();

  while (true) {
    // Generate mutated input from corpus (or random if empty)
    const input = mutateInput(corpus);

    // Execute input
    await executeInput(page, input);

    // Collect coverage
    const coverage = await page.coverage.stopJSCoverage();
    await page.coverage.startJSCoverage();

    // Check if new coverage achieved
    const newRanges = extractNewCoverage(coverage, totalCoverage);
    if (newRanges.length > 0) {
      corpus.push(input); // This input is interesting!
      newRanges.forEach(r => totalCoverage.add(r));
    }
  }
}
```

### Tools for Web App Fuzzing:

1. **gremlins.js** - Chaos monkey for web apps
2. **Playwright/Puppeteer Coverage API** - Track JS coverage
3. **AFL-style approaches** adapted for JavaScript

### Path to 100% Coverage:

1. **Instrument code** - Track branch/statement coverage
2. **Enumerate all handlers** - Know what CAN be triggered
3. **Generate inputs** that hit uncovered code
4. **Use constraint solving** to generate inputs for specific branches

### Concolic Testing (Concrete + Symbolic)

**Academic tools that aim for complete coverage:**

- **Jalangi** - Symbolic execution for JavaScript
- **ExpoSE** - Built on Jalangi, supports regex
- **SymJS** - Modified Rhino engine for symbolic execution

Example research approach:
```
1. Execute concretely while tracking path constraints
2. Negate constraints to explore alternate paths
3. Use SMT solver (Z3) to find inputs for each path
4. Achieve systematic path coverage
```

---

## 4. Extract Event Handler Registry and Invoke Each

### Complete Solution: Self-Instrumenting App

```javascript
// SELF_EXPLORER.js - Inject into app
class SelfExplorer {
  constructor() {
    this.handlers = new Map();
    this.states = [];
    this.transitions = [];

    this.interceptEventListeners();
    this.interceptFrameworkHandlers();
  }

  interceptEventListeners() {
    const self = this;
    const original = EventTarget.prototype.addEventListener;

    EventTarget.prototype.addEventListener = function(type, handler, options) {
      self.registerHandler(this, type, handler);
      return original.call(this, type, handler, options);
    };
  }

  interceptFrameworkHandlers() {
    // React: Hook into __REACT_DEVTOOLS_GLOBAL_HOOK__
    // Vue: Hook into app._instance
    // Angular: Use ng.probe
  }

  registerHandler(element, type, handler) {
    const key = this.getElementKey(element);
    if (!this.handlers.has(key)) {
      this.handlers.set(key, []);
    }
    this.handlers.get(key).push({ element, type, handler });
  }

  getElementKey(element) {
    // Generate unique key for element
    return element.tagName + '#' + element.id + '.' + element.className;
  }

  // THE MAGIC: Systematically invoke ALL handlers
  async exploreAllHandlers() {
    for (const [key, handlers] of this.handlers) {
      for (const { element, type, handler } of handlers) {
        const beforeState = this.captureState();

        try {
          // Invoke handler directly
          const event = this.createEvent(type);
          await handler.call(element, event);

          const afterState = this.captureState();
          this.transitions.push({
            from: beforeState,
            action: { element: key, event: type },
            to: afterState
          });
        } catch (e) {
          console.error(`Handler failed: ${key} ${type}`, e);
        }
      }
    }
  }

  createEvent(type) {
    const eventConstructors = {
      'click': MouseEvent,
      'input': InputEvent,
      'change': Event,
      'submit': SubmitEvent,
      'keydown': KeyboardEvent,
      // ... etc
    };
    const Constructor = eventConstructors[type] || Event;
    return new Constructor(type, { bubbles: true, cancelable: true });
  }

  captureState() {
    return {
      url: window.location.href,
      dom: document.body.innerHTML.substring(0, 1000),
      localStorage: JSON.stringify(localStorage),
      timestamp: Date.now()
    };
  }

  // Build state machine from exploration
  buildStateMachine() {
    return {
      states: this.states,
      transitions: this.transitions
    };
  }
}

// Usage
const explorer = new SelfExplorer();
// Wait for app to initialize
setTimeout(async () => {
  await explorer.exploreAllHandlers();
  const stateMachine = explorer.buildStateMachine();
  console.log('Discovered state machine:', stateMachine);
}, 2000);
```

---

## 5. Self-Driving UI Testing Frameworks

### Current State-of-the-Art (2025)

#### Open Source:
- **Midscene.js** - AI-driven UI testing
- **Magnitude** - Autonomous AI agents for testing
- **TestDriver.ai** - AI agents for test planning/execution
- **Hercules (TestZeus)** - Open-source autonomous UI/API testing

#### Commercial:
- **Functionize** - Agentic AI that builds, runs, self-heals tests
- **Appvance** - AI-driven autonomous testing
- **Qyrus** - Autonomous AI test orchestration
- **Autonoma AI** - No-code E2E with self-healing

### Key Capabilities:
1. **Self-Healing** - Adapt to UI changes automatically
2. **AI Test Generation** - Create tests from natural language
3. **Predictive Analysis** - Predict failures before they occur
4. **Visual AI** - Selector-less interaction via visual recognition

### For Self-Exploration Specifically:

**Crawljax** - The academic gold standard for state-space exploration:
```java
// Crawljax automatically:
// 1. Identifies clickable elements
// 2. Executes them
// 3. Detects DOM state changes
// 4. Builds state-flow graph
```

**Limitations of current tools:**
- State explosion problem
- Require manual configuration
- Don't leverage app's internal knowledge

---

## 6. How Chrome Achieves Complete Coverage

### Chromium Testing Architecture

**Multiple test types work together:**

1. **Unit Tests (gtest)** - Isolated C++ component testing
2. **Browser Tests** - Full browser integration tests
3. **Web Tests** - Blink rendering engine tests
4. **Instrumentation Tests** - Android-specific
5. **Fuzzer Tests** - Security/stability via AFL-style fuzzing

### Code Coverage Infrastructure

From [Chromium Code Coverage](https://developer.chrome.com/blog/chromium-chronicle-18):

```
1. Compile with instrumentation (clang coverage)
2. Run all test suites
3. Post-process with llvm-cov
4. Generate per-directory/component breakdown
```

**Key insight:** Chrome doesn't achieve 100% coverage from a single approach. They use:
- Comprehensive unit tests
- Integration tests
- Web platform tests
- Fuzz testing (ClusterFuzz)
- Manual testing
- Real-world usage telemetry

### Applicable Lessons:

1. **Instrument the code** - Know what's covered
2. **Multiple test strategies** - Unit, integration, fuzz
3. **Continuous measurement** - Track coverage over time
4. **Automated test generation** - Fuzz uncovered paths

---

## 7. Synthesis: The Self-Exploring App Architecture

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SELF-EXPLORING APP                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ Event Registry  │  │ State Capture   │  │ Coverage    │  │
│  │ (monkey-patch)  │  │ (DOM snapshot)  │  │ Tracking    │  │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘  │
│           │                    │                   │         │
│           └──────────┬─────────┴───────────────────┘         │
│                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              EXPLORATION ENGINE                          │ │
│  │  1. Enumerate all handlers from registry                │ │
│  │  2. For each handler:                                   │ │
│  │     a. Capture current state                            │ │
│  │     b. Generate valid inputs (property-based)           │ │
│  │     c. Invoke handler                                   │ │
│  │     d. Capture new state                                │ │
│  │     e. Record transition                                │ │
│  │  3. Repeat until coverage target met                    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                      │                                       │
│                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              OUTPUT: STATE MACHINE                       │ │
│  │  - All discovered states                                │ │
│  │  - All transitions (handler invocations)                │ │
│  │  - Coverage report                                      │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Steps

1. **Inject instrumentation BEFORE app loads:**
   ```javascript
   // Intercept addEventListener
   // Hook into framework (React/Vue/Angular)
   // Start coverage tracking
   ```

2. **Wait for app initialization, then enumerate handlers:**
   ```javascript
   // Collect all registered handlers
   // Also scan DOM for on* attributes
   // Query React fiber tree for prop handlers
   ```

3. **Systematically invoke each handler:**
   ```javascript
   // Use property-based testing to generate valid inputs
   // Invoke handler directly (not via DOM events)
   // Track state changes
   ```

4. **Coverage-guided exploration:**
   ```javascript
   // Prioritize handlers that increase coverage
   // Use concolic testing for hard-to-reach branches
   // Continue until coverage target met
   ```

5. **Output complete state machine:**
   ```javascript
   // States = unique DOM/app states
   // Transitions = handler invocations
   // Actions = what triggered each transition
   ```

---

## 8. Key Tools Summary

| Tool | Purpose | Link |
|------|---------|------|
| **Puppeteer/Playwright CDP** | Enumerate event listeners | [CDP Protocol](https://chromedevtools.github.io/devtools-protocol/tot/DOMDebugger/) |
| **fast-check** | Property-based testing | [GitHub](https://github.com/dubzzz/fast-check) |
| **gremlins.js** | Chaos monkey testing | [GitHub](https://github.com/marmelab/gremlins.js) |
| **Crawljax** | State-space exploration | [Research](https://www.researchgate.net/publication/254007517) |
| **Stryker** | Mutation testing | [GitHub](https://github.com/stryker-mutator/stryker-js) |
| **Jalangi/ExpoSE** | Concolic testing | [Research](https://link.springer.com/chapter/10.1007/978-3-031-30826-0_4) |
| **XState** | State machine modeling | [Website](https://xstate.js.org/) |

---

## 9. Recommendations

### For Your Use Case (Visual Cloning):

1. **Start with CDP `DOMDebugger.getEventListeners`** - Most powerful way to enumerate handlers
2. **Monkey-patch addEventListener** - Catch handlers as they're registered
3. **Use React DevTools hook** - Access fiber tree for React apps
4. **Combine with coverage tracking** - Know when you've explored everything
5. **Generate inputs with fast-check** - Property-based generation of valid UI actions

### The Key Insight Applied:

Instead of BFS crawling from outside:
```
External: [Browser] → clicks → [App] → observes → [Browser]
```

Do this:
```
Internal: [App + Instrumentation] → knows handlers → invokes directly → captures states
```

The app becomes its own test harness because it KNOWS:
- What handlers exist
- What inputs they expect
- What state they can affect

This is fundamentally more efficient than external exploration.

---

## Sources

- [Chrome DevTools Protocol - DOMDebugger](https://chromedevtools.github.io/devtools-protocol/tot/DOMDebugger/)
- [fast-check - Property-based testing](https://github.com/dubzzz/fast-check)
- [gremlins.js - Monkey testing](https://github.com/marmelab/gremlins.js)
- [Crawljax Research](https://www.researchgate.net/publication/254007517)
- [Chromium Testing Infrastructure](https://www.chromium.org/developers/testing/)
- [Concolic Testing of JavaScript](https://link.springer.com/chapter/10.1007/978-3-031-30826-0_4)
- [Stryker Mutation Testing](https://stryker-mutator.io/)
- [React DevTools Overview](https://github.com/facebook/react/blob/main/packages/react-devtools/OVERVIEW.md)
- [Fuzzing Book - Code Coverage](https://www.fuzzingbook.org/html/Coverage.html)
- [XState - State Machines](https://xstate.js.org/)
