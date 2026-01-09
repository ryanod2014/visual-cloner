# V4 Full Webapp Extractor - Specification

**Version:** 0.1 (Draft)
**Status:** Planning
**Last Updated:** 2024-01-08

---

## Table of Contents

1. [Overview](#overview)
2. [Goals & Non-Goals](#goals--non-goals)
3. [Architecture](#architecture)
4. [Core Architectural Principles](#core-architectural-principles)
5. [Phase Specifications](#phase-specifications)
6. [Data Structures](#data-structures)
7. [Injection System](#injection-system)
8. [Token Extraction](#token-extraction)
9. [Open Issues](#open-issues)
10. [Implementation Plan](#implementation-plan)

---

## Overview

### What This Is

A system to **completely extract and tokenize** any web application, enabling:
- Full UI state capture (every unique screen/state)
- API schema extraction (endpoints, request/response shapes)
- Design token extraction (colors, typography, spacing)
- Component token extraction (reusable UI patterns)
- Functionality token extraction (what each element does)
- Business logic extraction (validation rules, workflows, permissions)

### Why

Given the extracted tokens, you can:
1. **Rebuild the backend** using the API spec as a contract
2. **Restyle the frontend** by swapping design tokens
3. **Understand any webapp** completely without source code access

### How It's Different From V3

| Aspect | V3 (Current) | V4 (This Spec) |
|--------|--------------|----------------|
| Scope | Single page snapshot | Entire webapp, all states |
| Interactions | None captured | All interactions mapped |
| API | Not captured | Full schema extraction |
| Dangerous actions | N/A | Safe capture via injection |
| Output | Static HTML | Tokenized, rebuildable |
| Data vs UI | Not distinguished | Smart deduplication |

---

## Goals & Non-Goals

### Goals

- [ ] Extract 100% of unique UI states
- [ ] Capture all API endpoints and schemas
- [ ] Safe exploration of dangerous actions (delete, purchase, etc.)
- [ ] Smart deduplication (don't capture every data record, just unique UI patterns)
- [ ] Design tokens for restyling
- [ ] Component tokens for rebuilding
- [ ] API tokens for backend recreation
- [ ] Works on SPAs (React, Vue, etc.) and traditional sites
- [ ] Handles auth-protected content (user provides cookies)
- [ ] Captures responsive variants (mobile, tablet, desktop)
- [ ] Captures theme variants (light/dark mode)

### Non-Goals (V4)

- [ ] Automatic login (user provides auth cookies)
- [ ] CAPTCHA solving
- [ ] Native mobile app extraction
- [ ] Real-time collaborative features (e.g., multiplayer cursors)
- [ ] Streaming content (video/audio playback states)
- [ ] Infinite data pagination (cap at representative sample)

---

## Architecture

### High-Level Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   INPUT                                                                  │
│   ├── URL: https://app.example.com                                      │
│   ├── Auth Cookies (optional): session=abc123                           │
│   └── Config: viewports, themes, max-depth                              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: DISCOVERY                                                      │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Route     │  │ Interaction │  │   Safety    │  │    Auth     │    │
│  │  Crawler    │  │  Scanner    │  │ Classifier  │  │  Detector   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                          │
│  Output: route-map.json, interaction-map.json, auth-requirements.json   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: EXPLORATION                                                    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    INJECTION LAYER                               │    │
│  │  ├── Network Interceptor (record APIs, block dangerous)         │    │
│  │  ├── Form Interceptor (capture submissions, mock results)       │    │
│  │  ├── Navigation Interceptor (track route changes)               │    │
│  │  └── Click Interceptor (for dangerous buttons)                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │    BFS      │  │    State    │  │    State    │  │ Transition  │    │
│  │  Explorer   │  │   Hasher    │  │   Queue     │  │  Recorder   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                          │
│  Output: state-graph.json, api-recordings.json                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: CAPTURE                                                        │
│                                                                          │
│  For each unique state:                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │    HTML     │  │    CSS      │  │ Screenshot  │  │   Assets    │    │
│  │  Capturer   │  │  Extractor  │  │   Taker     │  │  Collector  │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                          │
│  Output: ui-states/, screenshots/, assets/                              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: TOKENIZE                                                       │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Design    │  │  Component  │  │     API     │  │  Business   │    │
│  │   Tokens    │  │   Tokens    │  │   Tokens    │  │   Logic     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                          │
│  Output: design-tokens/, component-tokens/, api-tokens/, logic-tokens/  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PHASE 5: ASSEMBLE                                                       │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Clone     │  │  Mock API   │  │    Docs     │  │  Manifest   │    │
│  │  Builder    │  │  Generator  │  │  Generator  │  │  Generator  │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                          │
│  Output: clone/, mock-server/, docs/, manifest.json                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   OUTPUT                                                                 │
│   ├── /ui-states/          (all unique HTML states)                     │
│   ├── /design-tokens/      (colors, typography, spacing)                │
│   ├── /component-tokens/   (button, card, form patterns)                │
│   ├── /api-tokens/         (endpoints, schemas, relationships)          │
│   ├── /logic-tokens/       (validation, permissions, workflows)         │
│   ├── /assets/             (images, fonts, shaders)                     │
│   ├── /clone/              (browsable static clone)                     │
│   ├── /mock-server/        (Express server with recorded responses)     │
│   └── manifest.json        (summary and stats)                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Agent Orchestration

```
┌─────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR AGENT                         │
│                                                                 │
│  Responsibilities:                                              │
│  ├── Coordinate phase execution                                │
│  ├── Manage browser contexts                                   │
│  ├── Track progress                                            │
│  ├── Handle errors/retries                                     │
│  └── Assemble final output                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
         │           │           │           │           │
         ▼           ▼           ▼           ▼           ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
    │Discovery│ │Explorer │ │Explorer │ │Explorer │ │Tokenizer│
    │ Agent   │ │ Agent 1 │ │ Agent 2 │ │ Agent 3 │ │ Agent   │
    └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
                     │           │           │
                     ▼           ▼           ▼
              [Parallel exploration of different routes]
```

---

## Core Architectural Principles

These architectural decisions make the system simpler, more robust, less likely to miss states, and have fewer roadblocks.

### Principle 1: Universal Event Interception

**Problem:** Multiple specialized interceptors (network, forms, navigation) are fragile and may miss interactions.

**Solution:** One unified injection that intercepts EVERYTHING at the source.

```javascript
const universalInterceptor = `
(function() {
  window.__V4__ = { events: [], enabled: true };

  // ==========================================
  // INTERCEPT ALL EVENT LISTENERS
  // ==========================================
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    // Now we know EXACTLY which elements have handlers
    window.__V4__.events.push({
      type: 'listener_added',
      eventType: type,
      target: describeElement(this),
      timestamp: Date.now()
    });

    // Wrap the listener to observe when it fires
    const wrappedListener = function(event) {
      window.__V4__.events.push({
        type: 'listener_fired',
        eventType: type,
        target: describeElement(event.currentTarget),
        timestamp: Date.now()
      });
      return listener.apply(this, arguments);
    };

    return originalAddEventListener.call(this, type, wrappedListener, options);
  };

  // ==========================================
  // INTERCEPT ALL TIMERS
  // ==========================================
  const originalSetTimeout = window.setTimeout;
  const originalSetInterval = window.setInterval;

  window.setTimeout = function(fn, delay) {
    window.__V4__.events.push({
      type: 'timer_scheduled',
      timerType: 'timeout',
      delay,
      timestamp: Date.now()
    });
    return originalSetTimeout.apply(this, arguments);
  };

  window.setInterval = function(fn, delay) {
    window.__V4__.events.push({
      type: 'timer_scheduled',
      timerType: 'interval',
      delay,
      timestamp: Date.now()
    });
    return originalSetInterval.apply(this, arguments);
  };

  // ==========================================
  // INTERCEPT ALL STORAGE
  // ==========================================
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  Storage.prototype.setItem = function(key, value) {
    window.__V4__.events.push({
      type: 'storage_write',
      storageType: this === localStorage ? 'local' : 'session',
      key,
      valuePreview: String(value).slice(0, 500),
      timestamp: Date.now()
    });
    return originalSetItem.apply(this, arguments);
  };

  Storage.prototype.removeItem = function(key) {
    window.__V4__.events.push({
      type: 'storage_delete',
      storageType: this === localStorage ? 'local' : 'session',
      key,
      timestamp: Date.now()
    });
    return originalRemoveItem.apply(this, arguments);
  };

  // ==========================================
  // INTERCEPT COOKIE CHANGES
  // ==========================================
  let cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  Object.defineProperty(document, 'cookie', {
    get() { return cookieDescriptor.get.call(document); },
    set(value) {
      window.__V4__.events.push({
        type: 'cookie_write',
        value: value.split(';')[0], // Just the key=value part
        timestamp: Date.now()
      });
      return cookieDescriptor.set.call(document, value);
    }
  });

  // Helper function
  function describeElement(el) {
    if (!el || !el.tagName) return { type: 'non-element', constructor: el?.constructor?.name };
    return {
      tag: el.tagName,
      id: el.id,
      classes: el.className,
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      text: el.textContent?.slice(0, 50)
    };
  }

  console.log('[V4] Universal interceptor initialized');
})();
`;
```

**Why this is better:**
- **No guessing** about what's interactive - we KNOW which elements have handlers
- **No missing interactions** - we see every event listener registration
- **Visibility into app behavior** - timers, storage, cookies - everything
- **Single injection** instead of many specialized ones

---

### Principle 2: Action Replay System (Deterministic State Navigation)

**Problem:** Trying to navigate to states via URLs or re-clicking is unreliable.

**Solution:** Record precise action sequences, replay to reach any state deterministically.

```javascript
const actionReplaySystem = {
  // Each action is recorded with enough detail to replay exactly
  actionLog: [
    { id: 'a1', action: 'navigate', url: 'https://app.com/dashboard', timestamp: 1000 },
    { id: 'a2', action: 'waitForSelector', selector: '[data-loaded="true"]', timestamp: 1500 },
    { id: 'a3', action: 'click', target: { role: 'button', name: 'Settings' }, timestamp: 2000 },
    { id: 'a4', action: 'waitForSelector', selector: '[role="dialog"]', timestamp: 2100 },
    { id: 'a5', action: 'click', target: { role: 'tab', name: 'Security' }, timestamp: 2500 },
    { id: 'a6', action: 'type', target: { role: 'textbox', name: 'Current Password' }, text: '****', timestamp: 3000 }
  ],

  // States reference which actions led to them
  states: {
    'state_abc123': {
      reachedVia: ['a1', 'a2', 'a3', 'a4'],
      hash: 'abc123',
      url: '/dashboard',
      screenshot: 'screenshots/abc123.png'
    }
  },

  // Replay to reach ANY discovered state
  async replayToState(page, stateId) {
    const state = this.states[stateId];
    const actions = state.reachedVia.map(id => this.actionLog.find(a => a.id === id));

    for (const action of actions) {
      await this.executeAction(page, action);
    }

    // Verify we reached the right state
    const currentHash = await this.hashState(page);
    if (currentHash !== state.hash) {
      throw new Error(`State mismatch: expected ${state.hash}, got ${currentHash}`);
    }
  },

  // Fork from any state to explore new branches
  async forkFromState(page, stateId, newAction) {
    await this.replayToState(page, stateId);
    await this.executeAction(page, newAction);

    // Record the new action
    const actionId = this.recordAction(newAction);

    // Capture new state
    const newHash = await this.hashState(page);
    const newStateId = `state_${newHash}`;

    if (!this.states[newStateId]) {
      this.states[newStateId] = {
        reachedVia: [...this.states[stateId].reachedVia, actionId],
        hash: newHash,
        url: page.url()
      };
    }

    return newStateId;
  },

  async executeAction(page, action) {
    switch (action.action) {
      case 'navigate':
        await page.goto(action.url);
        break;
      case 'click':
        const el = await this.findElement(page, action.target);
        await el.click();
        break;
      case 'type':
        const input = await this.findElement(page, action.target);
        await input.fill(action.text);
        break;
      case 'waitForSelector':
        await page.waitForSelector(action.selector);
        break;
      case 'waitForTimeout':
        await page.waitForTimeout(action.duration);
        break;
    }
  },

  // Find element using robust multi-strategy identification
  async findElement(page, target) {
    // Try strategies in order of reliability
    if (target.role && target.name) {
      try {
        return await page.getByRole(target.role, { name: target.name });
      } catch {}
    }
    if (target.testId) {
      try {
        return await page.getByTestId(target.testId);
      } catch {}
    }
    if (target.text) {
      try {
        return await page.getByText(target.text);
      } catch {}
    }
    if (target.selector) {
      return await page.locator(target.selector);
    }
    throw new Error(`Could not find element: ${JSON.stringify(target)}`);
  }
};
```

**Why this is better:**
- **Deterministic** - can always reach any state reliably
- **Debuggable** - can see exactly what sequence led to any state
- **Forkable** - can branch exploration from any point without re-exploring
- **Resumable** - crashed? Replay from last checkpoint
- **Parallelizable** - multiple contexts can replay to different branch points independently

---

### Principle 3: Framework-Aware Hooks

**Problem:** Treating everything as generic DOM loses semantic understanding.

**Solution:** Detect what framework the app uses and hook into its internals.

```javascript
const frameworkHooks = {
  detect() {
    // React
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) return 'react';
    // Vue 2
    if (window.__VUE__) return 'vue2';
    // Vue 3
    if (window.__VUE_DEVTOOLS_GLOBAL_HOOK__) return 'vue3';
    // Angular
    if (window.ng || window.getAllAngularRootElements) return 'angular';
    // Svelte
    if (window.__SVELTE_HMR) return 'svelte';
    // Next.js
    if (window.__NEXT_DATA__) return 'nextjs';
    // Nuxt
    if (window.__NUXT__) return 'nuxt';

    return 'unknown';
  },

  hooks: {
    react: {
      inject() {
        const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (!hook) return false;

        // Store original
        const originalOnCommitFiberRoot = hook.onCommitFiberRoot;

        // Hook into React's commit cycle
        hook.onCommitFiberRoot = function(rendererID, root, priorityLevel) {
          // We now see EVERY React re-render
          window.__V4__.events.push({
            type: 'react_commit',
            rendererID,
            timestamp: Date.now(),
            // Extract component tree structure
            components: extractFiberTree(root.current)
          });

          if (originalOnCommitFiberRoot) {
            return originalOnCommitFiberRoot.apply(this, arguments);
          }
        };

        return true;
      },

      getComponentTree(root) {
        function extractFiber(fiber, depth = 0) {
          if (!fiber || depth > 50) return null;

          const info = {
            type: typeof fiber.type === 'function' ? fiber.type.name : fiber.type,
            props: sanitizeProps(fiber.memoizedProps),
            state: fiber.memoizedState ? 'has_state' : null,
            key: fiber.key
          };

          // Get children
          const children = [];
          let child = fiber.child;
          while (child) {
            const extracted = extractFiber(child, depth + 1);
            if (extracted) children.push(extracted);
            child = child.sibling;
          }

          if (children.length > 0) {
            info.children = children;
          }

          return info;
        }

        return extractFiber(root);
      }
    },

    redux: {
      inject() {
        // Check for Redux DevTools
        const devTools = window.__REDUX_DEVTOOLS_EXTENSION__;
        if (!devTools) return false;

        // Try to find the store
        const store = window.store || window.__REDUX_STORE__;
        if (store && store.subscribe) {
          let prevState = store.getState();

          store.subscribe(() => {
            const newState = store.getState();

            window.__V4__.events.push({
              type: 'redux_update',
              diff: computeStateDiff(prevState, newState),
              timestamp: Date.now()
            });

            prevState = newState;
          });

          return true;
        }

        return false;
      }
    },

    vue3: {
      inject() {
        const hook = window.__VUE_DEVTOOLS_GLOBAL_HOOK__;
        if (!hook) return false;

        hook.on('component:updated', (app, uid, parentUid, component) => {
          window.__V4__.events.push({
            type: 'vue_update',
            componentName: component.type?.name || 'Anonymous',
            uid,
            timestamp: Date.now()
          });
        });

        return true;
      }
    }
  },

  // Auto-detect and inject appropriate hooks
  async autoInject() {
    const framework = this.detect();
    const results = { framework, hooks: [] };

    if (this.hooks[framework]) {
      const success = this.hooks[framework].inject();
      if (success) results.hooks.push(framework);
    }

    // Always try Redux (can be used with any framework)
    if (this.hooks.redux.inject()) {
      results.hooks.push('redux');
    }

    return results;
  }
};
```

**Why this is better:**
- **Semantic understanding** - we know component names, not just DOM nodes
- **State visibility** - see actual React/Vue state, not just rendered output
- **Better component extraction** - can identify reusable components by their framework definition
- **Smarter exploration** - understand which components are stateful

---

### Principle 4: Robust Element Identification

**Problem:** CSS selectors break when classes change, when elements move, when dynamic content shifts.

**Solution:** Multi-strategy identification with automatic fallbacks.

```javascript
const robustElementIdentifier = {
  // Generate robust identifier for any element
  identify(el) {
    return {
      // Strategy 1: Accessibility (most stable across refactors)
      role: el.getAttribute('role') || this.inferRole(el),
      name: this.getAccessibleName(el),

      // Strategy 2: Test IDs (if dev team uses them)
      testId: el.getAttribute('data-testid') ||
              el.getAttribute('data-test') ||
              el.getAttribute('data-cy') ||
              el.getAttribute('data-test-id'),

      // Strategy 3: Semantic position (human-readable)
      position: this.getSemanticPosition(el),

      // Strategy 4: Text content (for unique text)
      text: el.textContent?.trim().slice(0, 100),
      textHash: this.hashText(el.textContent?.trim()),

      // Strategy 5: Structural path (fallback)
      xpath: this.getMinimalXPath(el),

      // Strategy 6: Visual position (last resort)
      bounds: el.getBoundingClientRect()
    };
  },

  // Infer ARIA role from element type
  inferRole(el) {
    const roleMap = {
      'BUTTON': 'button',
      'A': 'link',
      'INPUT[type=text]': 'textbox',
      'INPUT[type=checkbox]': 'checkbox',
      'INPUT[type=radio]': 'radio',
      'SELECT': 'combobox',
      'TEXTAREA': 'textbox',
      'IMG': 'img',
      'NAV': 'navigation',
      'MAIN': 'main',
      'HEADER': 'banner',
      'FOOTER': 'contentinfo',
      'ASIDE': 'complementary',
      'FORM': 'form',
      'TABLE': 'table',
      'UL': 'list',
      'OL': 'list',
      'LI': 'listitem'
    };

    const key = el.type ? `${el.tagName}[type=${el.type}]` : el.tagName;
    return roleMap[key] || roleMap[el.tagName] || null;
  },

  // Get accessible name following ARIA spec
  getAccessibleName(el) {
    // 1. aria-label
    if (el.getAttribute('aria-label')) {
      return el.getAttribute('aria-label');
    }

    // 2. aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labels = labelledBy.split(' ')
        .map(id => document.getElementById(id)?.textContent)
        .filter(Boolean);
      if (labels.length) return labels.join(' ');
    }

    // 3. Label element (for form controls)
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) return label.textContent.trim();
    }

    // 4. Button/link text content
    if (['BUTTON', 'A'].includes(el.tagName)) {
      return el.textContent.trim().slice(0, 100);
    }

    // 5. Input placeholder or value
    if (el.placeholder) return el.placeholder;

    // 6. Title attribute
    if (el.title) return el.title;

    // 7. Alt text for images
    if (el.alt) return el.alt;

    return null;
  },

  // Get semantic position: "3rd button in header navigation"
  getSemanticPosition(el) {
    const landmark = this.findNearestLandmark(el);
    const siblings = this.getSimilarSiblings(el);
    const index = siblings.indexOf(el);

    return {
      landmark: landmark ? {
        role: landmark.getAttribute('role') || this.inferRole(landmark),
        label: landmark.getAttribute('aria-label')
      } : null,
      elementType: el.tagName.toLowerCase(),
      index: index + 1,
      total: siblings.length,
      description: this.buildPositionDescription(el, landmark, index, siblings.length)
    };
  },

  buildPositionDescription(el, landmark, index, total) {
    const ordinal = ['1st', '2nd', '3rd'][index] || `${index + 1}th`;
    const type = el.tagName.toLowerCase();
    const landmarkName = landmark?.getAttribute('aria-label') ||
                         landmark?.getAttribute('role') ||
                         'page';

    if (total === 1) {
      return `${type} in ${landmarkName}`;
    }
    return `${ordinal} ${type} in ${landmarkName} (of ${total})`;
  },

  findNearestLandmark(el) {
    const landmarks = ['banner', 'navigation', 'main', 'complementary',
                       'contentinfo', 'form', 'region', 'search'];
    let current = el.parentElement;

    while (current) {
      const role = current.getAttribute('role') || this.inferRole(current);
      if (landmarks.includes(role)) {
        return current;
      }
      current = current.parentElement;
    }

    return null;
  },

  getSimilarSiblings(el) {
    const parent = el.parentElement;
    if (!parent) return [el];

    return Array.from(parent.children).filter(sibling =>
      sibling.tagName === el.tagName &&
      this.inferRole(sibling) === this.inferRole(el)
    );
  },

  // Generate minimal unique XPath
  getMinimalXPath(el) {
    const parts = [];
    let current = el;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.tagName.toLowerCase();

      // Try to make it unique with ID
      if (current.id) {
        return `//${selector}[@id="${current.id}"]` +
               (parts.length ? '/' + parts.reverse().join('/') : '');
      }

      // Add index if there are siblings with same tag
      const siblings = current.parentElement ?
        Array.from(current.parentElement.children).filter(s => s.tagName === current.tagName) :
        [current];

      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `[${index}]`;
      }

      parts.push(selector);
      current = current.parentElement;
    }

    return '/' + parts.reverse().join('/');
  },

  // Find element using best available strategy
  async find(page, identifier) {
    const strategies = [
      // 1. Role + Name (most reliable)
      async () => {
        if (identifier.role && identifier.name) {
          const el = page.getByRole(identifier.role, { name: identifier.name });
          if (await el.count() === 1) return el;
        }
        return null;
      },

      // 2. Test ID
      async () => {
        if (identifier.testId) {
          const el = page.getByTestId(identifier.testId);
          if (await el.count() === 1) return el;
        }
        return null;
      },

      // 3. Exact text
      async () => {
        if (identifier.text && identifier.text.length < 50) {
          const el = page.getByText(identifier.text, { exact: true });
          if (await el.count() === 1) return el;
        }
        return null;
      },

      // 4. XPath
      async () => {
        if (identifier.xpath) {
          const el = page.locator(`xpath=${identifier.xpath}`);
          if (await el.count() === 1) return el;
        }
        return null;
      },

      // 5. Position-based (last resort)
      async () => {
        if (identifier.bounds) {
          const { x, y, width, height } = identifier.bounds;
          const centerX = x + width / 2;
          const centerY = y + height / 2;

          // Find element at position
          const el = await page.evaluateHandle(
            ([cx, cy]) => document.elementFromPoint(cx, cy),
            [centerX, centerY]
          );
          return el;
        }
        return null;
      }
    ];

    for (const strategy of strategies) {
      try {
        const result = await strategy();
        if (result) {
          // Verify it's visible
          if (await result.isVisible()) {
            return result;
          }
        }
      } catch (e) {
        // Strategy failed, try next
      }
    }

    throw new Error(`Could not find element: ${JSON.stringify(identifier)}`);
  }
};
```

**Why this is better:**
- **Survives refactors** - role/name rarely changes even when CSS does
- **Multiple fallbacks** - if one strategy fails, try another
- **Human-readable** - "click the Submit button" not "click #btn-23fa"
- **Test-friendly** - generated selectors work for automated testing too

---

### Principle 5: Hierarchical State Hashing

**Problem:** Hashing entire page produces one hash - can't tell WHAT changed.

**Solution:** Hash regions hierarchically to identify which parts changed.

```javascript
const hierarchicalHasher = {
  // Hash page by regions
  async hash(page) {
    return page.evaluate(() => {
      const hasher = {
        hashRegion(el, depth = 0) {
          if (!el || depth > 10) return null;

          // Hash this element's structure
          const selfHash = this.hashElement(el);

          // Identify semantic regions
          const regions = {};
          const regionSelectors = {
            header: 'header, [role="banner"]',
            nav: 'nav, [role="navigation"]',
            main: 'main, [role="main"]',
            aside: 'aside, [role="complementary"]',
            footer: 'footer, [role="contentinfo"]',
            modals: '[role="dialog"]:not([hidden])',
            forms: 'form'
          };

          for (const [name, selector] of Object.entries(regionSelectors)) {
            const found = el.querySelectorAll(selector);
            if (found.length > 0) {
              regions[name] = Array.from(found).map(r =>
                this.hashRegion(r, depth + 1)
              );
            }
          }

          return {
            self: selfHash,
            regions,
            combined: this.combineHashes(selfHash, regions)
          };
        },

        hashElement(el) {
          // Hash structure, not content
          return JSON.stringify({
            tag: el.tagName,
            role: el.getAttribute('role'),
            childCount: el.children.length,
            // Include structural classes only
            classes: Array.from(el.classList)
              .filter(c => !c.match(/^(mt-|mb-|p-|m-|text-|bg-|w-|h-|hover:|focus:)/))
              .sort()
              .join(' ')
          });
        },

        combineHashes(...parts) {
          const str = JSON.stringify(parts);
          // Simple hash function
          let hash = 0;
          for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
          }
          return hash.toString(36);
        }
      };

      return hasher.hashRegion(document.body);
    });
  },

  // Compare two hierarchical hashes
  diff(hash1, hash2) {
    const changes = [];

    // Check each region
    const allRegions = new Set([
      ...Object.keys(hash1?.regions || {}),
      ...Object.keys(hash2?.regions || {})
    ]);

    for (const region of allRegions) {
      const r1 = hash1?.regions?.[region];
      const r2 = hash2?.regions?.[region];

      if (!r1 && r2) {
        changes.push({ region, change: 'added' });
      } else if (r1 && !r2) {
        changes.push({ region, change: 'removed' });
      } else if (JSON.stringify(r1) !== JSON.stringify(r2)) {
        changes.push({ region, change: 'modified', before: r1, after: r2 });
      }
    }

    return {
      identical: changes.length === 0,
      changes,
      summary: changes.map(c => `${c.region}: ${c.change}`).join(', ')
    };
  },

  // Determine if two states are "same page, different content" vs "different page"
  classifyDifference(hash1, hash2) {
    const diff = this.diff(hash1, hash2);

    if (diff.identical) {
      return { type: 'identical' };
    }

    // Only modal changed = same page, modal opened/closed
    if (diff.changes.length === 1 && diff.changes[0].region === 'modals') {
      return { type: 'modal_change', change: diff.changes[0].change };
    }

    // Only main changed = same page layout, different content
    if (diff.changes.length === 1 && diff.changes[0].region === 'main') {
      return { type: 'content_change' };
    }

    // Nav/header/footer changed = probably different page type
    const structuralRegions = ['header', 'nav', 'footer'];
    const hasStructuralChange = diff.changes.some(c =>
      structuralRegions.includes(c.region)
    );

    if (hasStructuralChange) {
      return { type: 'page_change', changes: diff.changes };
    }

    return { type: 'partial_change', changes: diff.changes };
  }
};
```

**Why this is better:**
- **Know WHAT changed** - "modal opened" vs "something changed somewhere"
- **Smarter deduplication** - same main + different modal = modal variant, not new page
- **Efficient comparison** - can skip unchanged regions
- **Better state classification** - understand the nature of transitions

---

### Principle 6: Proactive State Prediction

**Problem:** BFS exploration only finds states we stumble upon.

**Solution:** Predict likely states from UI patterns and actively seek them.

```javascript
const statePrediction = {
  // Rules that predict states from UI patterns
  rules: [
    {
      name: 'delete_confirmation',
      detect: (el) => /delete|remove|destroy/i.test(el.textContent + el.ariaLabel),
      predict: {
        type: 'modal',
        content: 'confirmation_dialog',
        hasCancel: true,
        hasConfirm: true
      },
      priority: 'critical' // Must capture this
    },
    {
      name: 'dropdown_menu',
      detect: (el) => el.matches('[aria-haspopup="menu"], [aria-haspopup="listbox"]'),
      predict: {
        type: 'dropdown',
        options: 'enumerate_on_open'
      },
      priority: 'high'
    },
    {
      name: 'tabs',
      detect: (el) => el.matches('[role="tab"]'),
      predict: {
        type: 'tab_panels',
        count: 'count_siblings'
      },
      priority: 'high'
    },
    {
      name: 'accordion',
      detect: (el) => el.matches('[aria-expanded]'),
      predict: {
        type: 'toggle',
        states: ['expanded', 'collapsed']
      },
      priority: 'medium'
    },
    {
      name: 'pagination',
      detect: (el) => el.matches('[aria-label*="page"], .pagination, nav[aria-label*="pagination"]'),
      predict: {
        type: 'pagination',
        pages: 'detect_from_element'
      },
      priority: 'medium'
    },
    {
      name: 'form_validation',
      detect: (el) => el.matches('form'),
      predict: {
        type: 'form_states',
        states: ['empty', 'partial', 'valid', 'invalid', 'submitting', 'success', 'error']
      },
      priority: 'high'
    },
    {
      name: 'sort_options',
      detect: (el) => /sort|order by/i.test(el.textContent),
      predict: {
        type: 'sort_variants',
        options: 'enumerate_options'
      },
      priority: 'medium'
    },
    {
      name: 'filter_controls',
      detect: (el) => /filter/i.test(el.textContent) || el.matches('[data-filter]'),
      predict: {
        type: 'filter_combinations',
        strategy: 'use_form_observer'
      },
      priority: 'medium'
    },
    {
      name: 'date_picker',
      detect: (el) => el.matches('input[type="date"], [data-datepicker], .datepicker'),
      predict: {
        type: 'calendar',
        states: ['closed', 'open', 'month_view', 'year_view']
      },
      priority: 'medium'
    },
    {
      name: 'search_autocomplete',
      detect: (el) => el.matches('input[type="search"], [role="searchbox"], [aria-autocomplete]'),
      predict: {
        type: 'autocomplete',
        states: ['empty', 'typing', 'suggestions', 'no_results']
      },
      priority: 'medium'
    },
    {
      name: 'toast_notification',
      detect: (el) => el.matches('[role="alert"], [role="status"], .toast, .notification'),
      predict: {
        type: 'notification',
        transient: true,
        variants: ['success', 'error', 'warning', 'info']
      },
      priority: 'low'
    }
  ],

  // Scan page and predict what states exist
  async predict(page) {
    const predictions = [];

    for (const rule of this.rules) {
      const elements = await page.$$eval('*', (els, ruleName) => {
        // Find elements matching this rule
        return els
          .filter(el => {
            // Re-implement detect logic in browser context
            // (Would be passed the actual detect function)
            return true; // Simplified
          })
          .map(el => ({
            selector: generateSelector(el),
            text: el.textContent?.slice(0, 50),
            ariaLabel: el.getAttribute('aria-label')
          }));
      }, rule.name);

      for (const element of elements) {
        predictions.push({
          rule: rule.name,
          element,
          predicted: rule.predict,
          priority: rule.priority
        });
      }
    }

    // Sort by priority
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    predictions.sort((a, b) =>
      priorityOrder[b.priority] - priorityOrder[a.priority]
    );

    return predictions;
  },

  // Actively seek predicted states
  async seekPredictedStates(page, predictions) {
    const discovered = [];

    for (const pred of predictions) {
      try {
        const states = await this.seekState(page, pred);
        discovered.push(...states);
      } catch (e) {
        console.warn(`Failed to seek ${pred.rule}:`, e.message);
      }
    }

    return discovered;
  },

  async seekState(page, prediction) {
    const states = [];

    switch (prediction.predicted.type) {
      case 'modal':
        // Click to open modal
        await page.click(prediction.element.selector);
        await page.waitForSelector('[role="dialog"]', { timeout: 2000 });
        states.push(await captureState(page, `${prediction.rule}_open`));

        // Close modal
        const closeBtn = page.locator('[role="dialog"] button:has-text("Cancel"), [role="dialog"] [aria-label="Close"]').first();
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
          states.push(await captureState(page, `${prediction.rule}_closed`));
        }
        break;

      case 'tab_panels':
        // Click each tab
        const tabs = await page.$$('[role="tab"]');
        for (let i = 0; i < tabs.length; i++) {
          await tabs[i].click();
          await page.waitForTimeout(200);
          states.push(await captureState(page, `tab_${i}`));
        }
        break;

      case 'toggle':
        // Get current state and toggle
        const isExpanded = await page.getAttribute(prediction.element.selector, 'aria-expanded');
        await page.click(prediction.element.selector);
        await page.waitForTimeout(200);
        states.push(await captureState(page, `toggle_${isExpanded === 'true' ? 'collapsed' : 'expanded'}`));
        break;

      case 'form_states':
        // Use form observer to explore form states
        states.push(...await exploreFormStates(page, prediction.element.selector));
        break;
    }

    return states;
  }
};
```

**Why this is better:**
- **Don't miss obvious states** - if there's a delete button, we WILL capture the confirmation
- **Prioritized exploration** - critical states first
- **Faster coverage** - go straight for valuable states instead of random clicking
- **Domain knowledge** - rules encode common UI patterns

---

### Principle 7: Bidirectional State Graph with Reversibility

**Problem:** Only tracking forward transitions makes it hard to navigate back.

**Solution:** Track reverse paths and mutation safety for each transition.

```javascript
const bidirectionalStateGraph = {
  states: new Map(),
  transitions: [],
  reverseIndex: new Map(), // toState → [transitions that lead here]

  addTransition(from, action, to, metadata = {}) {
    const transition = {
      id: crypto.randomUUID(),
      from,
      to,
      action,

      // Track reversibility
      reversible: this.classifyReversibility(action, metadata),
      reverseAction: this.inferReverseAction(action, from),

      // Track side effects
      apiCalls: metadata.apiCalls || [],
      stateChanges: metadata.stateChanges || [],
      hasMutation: metadata.apiCalls?.some(c =>
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.method)
      ),

      timestamp: Date.now()
    };

    this.transitions.push(transition);

    // Index by destination for reverse lookups
    if (!this.reverseIndex.has(to)) {
      this.reverseIndex.set(to, []);
    }
    this.reverseIndex.get(to).push(transition);

    return transition;
  },

  classifyReversibility(action, metadata) {
    // Navigation is always reversible
    if (action.type === 'navigate' || action.type === 'click_link') {
      return { reversible: true, method: 'back_navigation' };
    }

    // Modal open/close
    if (action.type === 'open_modal') {
      return { reversible: true, method: 'close_modal' };
    }

    // Expand/collapse
    if (action.type === 'toggle') {
      return { reversible: true, method: 'toggle_again' };
    }

    // Tab switches
    if (action.type === 'switch_tab') {
      return { reversible: true, method: 'switch_tab_back' };
    }

    // Data mutations
    if (metadata.apiCalls?.some(c => c.method === 'DELETE')) {
      return { reversible: false, reason: 'delete_operation' };
    }

    if (metadata.apiCalls?.some(c => c.method === 'POST')) {
      return { reversible: false, reason: 'create_operation' };
    }

    if (metadata.apiCalls?.some(c => ['PUT', 'PATCH'].includes(c.method))) {
      return { reversible: 'partial', reason: 'update_operation' };
    }

    return { reversible: true, method: 'navigate_back' };
  },

  inferReverseAction(action, fromState) {
    switch (action.type) {
      case 'navigate':
      case 'click_link':
        return { type: 'navigate', url: fromState.url };

      case 'open_modal':
        return { type: 'close_modal', target: action.modalId };

      case 'toggle':
        return { type: 'toggle', target: action.target };

      case 'switch_tab':
        return { type: 'switch_tab', target: action.previousTab };

      default:
        return { type: 'replay_to', state: fromState.id };
    }
  },

  // Find path BACK from state B to state A
  findPathBack(from, to, options = {}) {
    const { preferReversible = true, maxDepth = 20 } = options;

    const queue = [{ state: from, path: [], depth: 0 }];
    const visited = new Set([from]);

    while (queue.length > 0) {
      const { state, path, depth } = queue.shift();

      if (depth > maxDepth) continue;
      if (state === to) return { found: true, path };

      // Get all transitions that lead TO this state
      const incomingTransitions = this.reverseIndex.get(state) || [];

      // Sort by preference (reversible first)
      if (preferReversible) {
        incomingTransitions.sort((a, b) => {
          if (a.reversible?.reversible && !b.reversible?.reversible) return -1;
          if (!a.reversible?.reversible && b.reversible?.reversible) return 1;
          return 0;
        });
      }

      for (const t of incomingTransitions) {
        if (!visited.has(t.from)) {
          visited.add(t.from);
          queue.push({
            state: t.from,
            path: [...path, t.reverseAction || { type: 'replay_to', state: t.from }],
            depth: depth + 1
          });
        }
      }
    }

    return { found: false, reason: 'no_path' };
  },

  // Get all states reachable from a given state
  getReachableStates(fromState) {
    const reachable = new Set();
    const queue = [fromState];

    while (queue.length > 0) {
      const current = queue.shift();

      const outgoing = this.transitions.filter(t => t.from === current);
      for (const t of outgoing) {
        if (!reachable.has(t.to)) {
          reachable.add(t.to);
          queue.push(t.to);
        }
      }
    }

    return reachable;
  },

  // Find states that are "safe" to explore from (can return to main flow)
  getSafeExplorationPoints(mainFlowStates) {
    return Array.from(this.states.keys()).filter(state => {
      // Can we get back to any main flow state?
      for (const mainState of mainFlowStates) {
        const pathBack = this.findPathBack(state, mainState);
        if (pathBack.found) {
          // Check if path is safe (all reversible)
          const allReversible = pathBack.path.every(action =>
            action.type !== 'replay_to' // replay is always possible
          );
          if (allReversible) return true;
        }
      }
      return false;
    });
  },

  // Identify the "main flow" through the app
  findMainFlow() {
    // Main flow = most common path from start to various endpoints
    // Uses transition frequency and reversibility

    const startState = this.transitions[0]?.from;
    if (!startState) return [];

    // Count how many times each state is visited
    const visitCounts = new Map();
    for (const t of this.transitions) {
      visitCounts.set(t.to, (visitCounts.get(t.to) || 0) + 1);
    }

    // BFS to find highest-frequency path
    const mainFlow = [startState];
    let current = startState;
    const visited = new Set([current]);

    while (true) {
      const outgoing = this.transitions
        .filter(t => t.from === current && !visited.has(t.to))
        .sort((a, b) => (visitCounts.get(b.to) || 0) - (visitCounts.get(a.to) || 0));

      if (outgoing.length === 0) break;

      const next = outgoing[0].to;
      visited.add(next);
      mainFlow.push(next);
      current = next;
    }

    return mainFlow;
  }
};
```

**Why this is better:**
- **Know how to get back** - never get stuck in dead-end states
- **Safe exploration** - explore risky branches knowing we can return
- **Understand app flow** - identify main paths vs edge cases
- **Better test generation** - tests can setup AND teardown properly

---

### Principle 8: Content-Addressed Asset Storage

**Problem:** Saving assets per-state duplicates shared resources.

**Solution:** Content-hash everything, store once, reference by hash.

```javascript
const contentAddressedStorage = {
  assets: new Map(), // hash → { content, metadata }
  references: new Map(), // stateId → [{ url, hash }]

  async store(content, metadata = {}) {
    // Compute content hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', content);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Store if new
    if (!this.assets.has(hash)) {
      this.assets.set(hash, {
        content,
        metadata,
        size: content.byteLength || content.length,
        mimeType: metadata.mimeType || this.guessMimeType(metadata.url),
        firstSeen: Date.now(),
        refCount: 0
      });
    }

    // Increment reference count
    this.assets.get(hash).refCount++;

    return hash;
  },

  async storeFromUrl(url, stateId) {
    // Check if we already have this URL
    const existing = this.findByUrl(url);
    if (existing) {
      this.addReference(stateId, url, existing);
      return existing;
    }

    // Fetch and store
    try {
      const response = await fetch(url);
      const content = await response.arrayBuffer();

      const hash = await this.store(content, {
        url,
        mimeType: response.headers.get('content-type'),
        originalSize: response.headers.get('content-length')
      });

      this.addReference(stateId, url, hash);
      return hash;
    } catch (e) {
      console.warn(`Failed to fetch asset: ${url}`, e.message);
      return null;
    }
  },

  addReference(stateId, url, hash) {
    if (!this.references.has(stateId)) {
      this.references.set(stateId, []);
    }
    this.references.get(stateId).push({ url, hash });
  },

  findByUrl(url) {
    for (const refs of this.references.values()) {
      const found = refs.find(r => r.url === url);
      if (found) return found.hash;
    }
    return null;
  },

  guessMimeType(url) {
    if (!url) return 'application/octet-stream';
    const ext = url.split('.').pop()?.toLowerCase();
    const mimeTypes = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'webp': 'image/webp',
      'woff': 'font/woff',
      'woff2': 'font/woff2',
      'ttf': 'font/ttf',
      'eot': 'application/vnd.ms-fontobject',
      'css': 'text/css',
      'js': 'application/javascript',
      'json': 'application/json'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  },

  // Get storage statistics
  getStats() {
    let totalStored = 0;
    let totalReferenced = 0;

    for (const asset of this.assets.values()) {
      totalStored += asset.size;
      totalReferenced += asset.size * asset.refCount;
    }

    return {
      uniqueAssets: this.assets.size,
      totalStates: this.references.size,
      storedSize: totalStored,
      wouldBeSize: totalReferenced,
      savings: totalReferenced - totalStored,
      savingsPercent: totalReferenced > 0
        ? ((totalReferenced - totalStored) / totalReferenced * 100).toFixed(1) + '%'
        : '0%',

      // Breakdown by type
      byType: this.getBreakdownByType()
    };
  },

  getBreakdownByType() {
    const byType = {};

    for (const asset of this.assets.values()) {
      const type = asset.mimeType.split('/')[0];
      if (!byType[type]) {
        byType[type] = { count: 0, size: 0 };
      }
      byType[type].count++;
      byType[type].size += asset.size;
    }

    return byType;
  },

  // Export assets to filesystem
  async exportToDirectory(dir) {
    const manifest = {
      assets: {},
      references: {}
    };

    // Write each unique asset
    for (const [hash, asset] of this.assets) {
      const ext = asset.mimeType.split('/')[1] || 'bin';
      const filename = `${hash.slice(0, 16)}.${ext}`;

      await writeFile(`${dir}/assets/${filename}`, asset.content);

      manifest.assets[hash] = {
        filename,
        mimeType: asset.mimeType,
        size: asset.size,
        refCount: asset.refCount
      };
    }

    // Write references per state
    for (const [stateId, refs] of this.references) {
      manifest.references[stateId] = refs.map(r => ({
        url: r.url,
        hash: r.hash,
        localPath: manifest.assets[r.hash]?.filename
      }));
    }

    await writeFile(`${dir}/asset-manifest.json`, JSON.stringify(manifest, null, 2));

    return manifest;
  }
};
```

**Why this is better:**
- **Massive storage savings** - typical sites reuse 80%+ of assets across pages
- **Faster captures** - skip already-captured assets
- **Integrity verification** - hash ensures content hasn't changed
- **Deduplication insights** - see which assets are shared most

---

### Principle 9: Self-Healing Error Recovery

**Problem:** Errors cause extraction to fail completely.

**Solution:** Detect, recover, retry, and continue with graceful degradation.

```javascript
const errorRecovery = {
  errorLog: [],
  recoveryAttempts: new Map(),

  strategies: {
    // Element not found - try alternatives
    element_not_found: async (error, context, page) => {
      const { identifier, maxRetries = 3 } = context;

      // Strategy 1: Wait and retry (element may be loading)
      await page.waitForTimeout(1000);
      try {
        const el = await robustElementIdentifier.find(page, identifier);
        if (el) return { action: 'retry_succeeded', element: el };
      } catch {}

      // Strategy 2: Try alternative strategies from identifier
      if (identifier.alternatives) {
        for (const alt of identifier.alternatives) {
          try {
            const el = await page.locator(alt).first();
            if (await el.isVisible()) {
              return { action: 'use_alternative', element: el, usedStrategy: alt };
            }
          } catch {}
        }
      }

      // Strategy 3: Find similar elements
      const similar = await page.$$eval('*', (els, original) => {
        return els
          .filter(el => el.tagName === original.tag && el.textContent?.includes(original.text?.slice(0, 20)))
          .map(el => ({ selector: generateSelector(el), text: el.textContent?.slice(0, 50) }))
          .slice(0, 5);
      }, identifier);

      if (similar.length > 0) {
        return { action: 'found_similar', candidates: similar, needsUserConfirmation: true };
      }

      // Strategy 4: Skip and continue
      return { action: 'skip', reason: 'element_not_recoverable' };
    },

    // Navigation timeout - check for redirects or slow loading
    navigation_timeout: async (error, context, page) => {
      const { expectedUrl, timeout } = context;

      // Check if we ended up somewhere else (redirect)
      const currentUrl = page.url();
      if (currentUrl !== expectedUrl && !currentUrl.includes('error') && !currentUrl.includes('404')) {
        return { action: 'accept_redirect', newUrl: currentUrl };
      }

      // Check if page is partially loaded
      const hasContent = await page.evaluate(() =>
        document.body?.children.length > 0
      );

      if (hasContent) {
        // Page loaded but slowly
        await page.waitForLoadState('domcontentloaded');
        return { action: 'continue_partial', note: 'page loaded slowly' };
      }

      // Total failure - maybe network issue
      return { action: 'retry_with_backoff', delay: 5000 };
    },

    // API error - handle based on status code
    api_error: async (error, context, page) => {
      const { status, url } = error;

      // 401/403: Auth expired
      if ([401, 403].includes(status)) {
        return {
          action: 'pause',
          reason: 'auth_expired',
          needsUserAction: true,
          message: 'Authentication expired. Please provide new cookies.'
        };
      }

      // 429: Rate limited
      if (status === 429) {
        const retryAfter = parseInt(error.headers?.['retry-after']) || 60;
        return {
          action: 'wait_and_retry',
          delay: retryAfter * 1000,
          reason: 'rate_limited'
        };
      }

      // 404: Resource not found (might be expected)
      if (status === 404) {
        return { action: 'skip', reason: 'resource_not_found' };
      }

      // 5xx: Server error - retry with backoff
      if (status >= 500) {
        const retryCount = context.retryCount || 0;
        if (retryCount < 3) {
          return {
            action: 'retry_with_backoff',
            delay: Math.pow(2, retryCount) * 1000,
            newRetryCount: retryCount + 1
          };
        }
        return { action: 'skip', reason: 'server_error_persistent' };
      }

      return { action: 'log_and_continue' };
    },

    // JavaScript error on page
    page_error: async (error, context, page) => {
      // Log but continue - many sites have JS errors that don't affect extraction
      console.warn('Page JS error:', error.message);

      // Check if page is still functional
      const isResponsive = await page.evaluate(() => {
        try {
          return document.body.querySelector('*') !== null;
        } catch {
          return false;
        }
      }).catch(() => false);

      if (isResponsive) {
        return { action: 'continue', note: 'page_error_non_fatal' };
      }

      // Page is broken - try refresh
      await page.reload();
      return { action: 'retry_after_reload' };
    },

    // Browser crashed
    browser_crash: async (error, context) => {
      // Restart browser
      const newBrowser = await playwright.chromium.launch();
      const newContext = await newBrowser.newContext();
      const newPage = await newContext.newPage();

      // Restore cookies
      if (context.cookies) {
        await newContext.addCookies(context.cookies);
      }

      // Load last checkpoint
      const checkpoint = await loadLastCheckpoint();

      return {
        action: 'resume_from_checkpoint',
        checkpoint,
        newPage,
        newContext
      };
    },

    // Network disconnect
    network_error: async (error, context, page) => {
      // Wait for network to come back
      let attempts = 0;
      while (attempts < 10) {
        try {
          await page.goto('about:blank');
          await page.goto(context.url);
          return { action: 'recovered', attempts };
        } catch {
          attempts++;
          await new Promise(r => setTimeout(r, 5000));
        }
      }

      return { action: 'pause', reason: 'network_unavailable', needsUserAction: true };
    }
  },

  // Main error handler
  async handle(error, context, page) {
    const errorType = this.classifyError(error);
    const strategy = this.strategies[errorType];

    // Log error
    this.errorLog.push({
      type: errorType,
      error: error.message,
      context,
      timestamp: Date.now()
    });

    if (strategy) {
      try {
        const result = await strategy(error, context, page);

        // Log resolution
        this.errorLog[this.errorLog.length - 1].resolution = result;

        return result;
      } catch (recoveryError) {
        // Recovery itself failed
        return {
          action: 'skip',
          reason: 'recovery_failed',
          originalError: error.message,
          recoveryError: recoveryError.message
        };
      }
    }

    // Unknown error type - log and continue
    return { action: 'log_and_continue' };
  },

  classifyError(error) {
    const message = error.message?.toLowerCase() || '';

    if (message.includes('element') && (message.includes('not found') || message.includes('no element'))) {
      return 'element_not_found';
    }
    if (message.includes('timeout') && message.includes('navigation')) {
      return 'navigation_timeout';
    }
    if (error.status && error.status >= 400) {
      return 'api_error';
    }
    if (message.includes('crashed') || message.includes('disconnected')) {
      return 'browser_crash';
    }
    if (message.includes('net::') || message.includes('network')) {
      return 'network_error';
    }
    if (error.name === 'Error' && error.stack?.includes('evaluate')) {
      return 'page_error';
    }

    return 'unknown';
  },

  // Get error summary
  getSummary() {
    const byType = {};
    const byResolution = {};

    for (const entry of this.errorLog) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;

      const resolution = entry.resolution?.action || 'unhandled';
      byResolution[resolution] = (byResolution[resolution] || 0) + 1;
    }

    return {
      total: this.errorLog.length,
      byType,
      byResolution,
      fatalErrors: this.errorLog.filter(e =>
        e.resolution?.action === 'pause' ||
        e.resolution?.needsUserAction
      ).length
    };
  }
};
```

**Why this is better:**
- **Extractions actually complete** - doesn't give up on first error
- **Handles real-world issues** - rate limits, auth expiry, slow pages
- **Checkpointing** - crash → resume from checkpoint, not restart
- **Self-healing** - tries multiple recovery strategies automatically
- **Visibility** - error log helps debug issues

---

### Principle 10: Parallel Exploration with Coordination

**Problem:** Single browser, sequential exploration is slow.

**Solution:** Multiple browsers exploring in parallel with shared state coordination.

```javascript
const parallelExplorer = {
  workers: [],
  coordinator: {
    visitedHashes: new Set(),
    pendingStates: [],
    transitions: [],
    assets: contentAddressedStorage,
    lock: null // AsyncLock instance
  },

  async start(url, options = {}) {
    const { numWorkers = 4, cookies = [] } = options;

    // Initialize coordinator lock
    this.coordinator.lock = new AsyncLock();

    // Spawn worker browsers
    for (let i = 0; i < numWorkers; i++) {
      const browser = await playwright.chromium.launch();
      const context = await browser.newContext();

      // Apply cookies
      if (cookies.length > 0) {
        await context.addCookies(cookies);
      }

      this.workers.push({
        id: i,
        browser,
        context,
        page: await context.newPage(),
        status: 'idle',
        currentTask: null,
        statesDiscovered: 0,
        errors: 0
      });
    }

    // Add initial state to queue
    const firstWorker = this.workers[0];
    await firstWorker.page.goto(url);
    const initialState = await this.captureState(firstWorker.page);

    this.coordinator.visitedHashes.add(initialState.hash);
    this.coordinator.pendingStates.push(initialState);

    // Start coordination loop
    await this.coordinationLoop();

    return this.getResults();
  },

  async coordinationLoop() {
    while (this.hasPendingWork() || this.hasActiveWorkers()) {
      // Assign work to idle workers
      const idleWorkers = this.workers.filter(w => w.status === 'idle');

      for (const worker of idleWorkers) {
        const state = await this.getNextState();
        if (state) {
          worker.status = 'working';
          worker.currentTask = state;

          // Don't await - let it run in parallel
          this.exploreState(worker, state).catch(err => {
            console.error(`Worker ${worker.id} error:`, err.message);
            worker.errors++;
            worker.status = 'idle';
          });
        }
      }

      // Small delay to prevent busy-waiting
      await new Promise(r => setTimeout(r, 100));

      // Log progress periodically
      if (Date.now() % 5000 < 100) {
        this.logProgress();
      }
    }
  },

  hasPendingWork() {
    return this.coordinator.pendingStates.length > 0;
  },

  hasActiveWorkers() {
    return this.workers.some(w => w.status === 'working');
  },

  async getNextState() {
    return this.coordinator.lock.acquire('queue', () => {
      if (this.coordinator.pendingStates.length === 0) return null;

      // Prioritize states with more potential interactions
      this.coordinator.pendingStates.sort((a, b) =>
        (b.interactions?.length || 0) - (a.interactions?.length || 0)
      );

      return this.coordinator.pendingStates.shift();
    });
  },

  async exploreState(worker, state) {
    try {
      // Replay to reach this state
      await actionReplaySystem.replayToState(worker.page, state.id);

      // Get all interactions available from this state
      const interactions = await this.getInteractions(worker.page);

      // Explore each interaction
      for (const interaction of interactions) {
        // Check if this transition was already explored
        const transitionKey = `${state.hash}:${JSON.stringify(interaction)}`;

        const shouldExplore = await this.coordinator.lock.acquire('visited', () => {
          if (this.coordinator.visitedTransitions?.has(transitionKey)) {
            return false;
          }
          this.coordinator.visitedTransitions = this.coordinator.visitedTransitions || new Set();
          this.coordinator.visitedTransitions.add(transitionKey);
          return true;
        });

        if (!shouldExplore) continue;

        // Execute interaction
        const result = await this.executeInteraction(worker.page, interaction);

        // Hash new state
        const newHash = await hierarchicalHasher.hash(worker.page);

        // Record transition and potentially new state
        await this.coordinator.lock.acquire('states', async () => {
          // Record transition
          this.coordinator.transitions.push({
            from: state.hash,
            action: interaction,
            to: newHash,
            apiCalls: result.apiCalls
          });

          // Check if new state
          if (!this.coordinator.visitedHashes.has(newHash)) {
            this.coordinator.visitedHashes.add(newHash);

            // Capture full state
            const newState = await this.captureState(worker.page);

            // Add to queue
            this.coordinator.pendingStates.push({
              ...newState,
              replayActions: [...state.replayActions, interaction],
              discoveredBy: worker.id
            });

            worker.statesDiscovered++;
          }
        });

        // Navigate back to original state for next interaction
        await actionReplaySystem.replayToState(worker.page, state.id);
      }
    } finally {
      worker.status = 'idle';
      worker.currentTask = null;
    }
  },

  async captureState(page) {
    const hash = await hierarchicalHasher.hash(page);

    return {
      id: `state_${hash}`,
      hash,
      url: page.url(),
      timestamp: Date.now(),
      html: await page.content(),
      screenshot: await page.screenshot({ type: 'png' }),
      interactions: await this.getInteractions(page)
    };
  },

  async getInteractions(page) {
    // Use universal interceptor to know what's interactive
    return page.evaluate(() => {
      const interactive = [];

      // Get all elements with click handlers
      const withHandlers = window.__V4__?.events
        ?.filter(e => e.type === 'listener_added' && e.eventType === 'click')
        ?.map(e => e.target) || [];

      // Also get semantic interactive elements
      const selectors = 'a, button, [role="button"], [role="link"], [role="tab"], input, select, textarea';
      document.querySelectorAll(selectors).forEach(el => {
        if (el.offsetParent !== null) { // Visible
          interactive.push(robustElementIdentifier.identify(el));
        }
      });

      return interactive;
    });
  },

  logProgress() {
    const active = this.workers.filter(w => w.status === 'working').length;
    const total = this.coordinator.visitedHashes.size;
    const pending = this.coordinator.pendingStates.length;
    const transitions = this.coordinator.transitions.length;

    console.log(`[Progress] States: ${total} | Pending: ${pending} | Transitions: ${transitions} | Active workers: ${active}/${this.workers.length}`);
  },

  getResults() {
    return {
      states: this.coordinator.visitedHashes.size,
      transitions: this.coordinator.transitions,
      workerStats: this.workers.map(w => ({
        id: w.id,
        statesDiscovered: w.statesDiscovered,
        errors: w.errors
      })),
      totalErrors: this.workers.reduce((sum, w) => sum + w.errors, 0)
    };
  },

  async shutdown() {
    for (const worker of this.workers) {
      await worker.browser.close();
    }
  }
};
```

**Why this is better:**
- **4x+ faster** - multiple browsers working simultaneously
- **No duplicate work** - shared visited set prevents re-exploration
- **Coordinated** - workers don't step on each other
- **Efficient** - idle workers get new work immediately
- **Scalable** - can add more workers for larger apps

---

### Summary: Impact Matrix

| Principle | Complexity Reduction | Robustness | Coverage | Speed |
|-----------|---------------------|------------|----------|-------|
| 1. Universal Event Interception | ⬤⬤⬤ | ⬤⬤⬤ | ⬤⬤⬤ | ⬤ |
| 2. Action Replay System | ⬤⬤ | ⬤⬤⬤ | ⬤⬤ | ⬤⬤ |
| 3. Framework-Aware Hooks | ⬤⬤ | ⬤⬤ | ⬤⬤⬤ | ⬤ |
| 4. Robust Element ID | ⬤⬤ | ⬤⬤⬤ | ⬤ | ⬤ |
| 5. Hierarchical Hashing | ⬤⬤⬤ | ⬤⬤ | ⬤⬤ | ⬤⬤ |
| 6. Proactive State Prediction | ⬤ | ⬤ | ⬤⬤⬤ | ⬤⬤ |
| 7. Bidirectional State Graph | ⬤⬤ | ⬤⬤⬤ | ⬤⬤ | ⬤ |
| 8. Content-Addressed Storage | ⬤⬤ | ⬤⬤ | ⬤ | ⬤⬤⬤ |
| 9. Self-Healing Error Recovery | ⬤ | ⬤⬤⬤ | ⬤⬤ | ⬤ |
| 10. Parallel Exploration | ⬤ | ⬤ | ⬤ | ⬤⬤⬤ |

**Top 5 Must-Have Principles:**

1. **Universal Event Interception** - Foundation for knowing what's interactive
2. **Action Replay System** - Foundation for deterministic state navigation
3. **Self-Healing Error Recovery** - Required for real-world extractions to complete
4. **Proactive State Prediction** - Ensures critical states aren't missed
5. **Parallel Exploration** - Makes large app extraction practical

---

## Phase Specifications

### Phase 1: Discovery

#### 1.1 Route Crawler

**Input:** Base URL, auth cookies
**Output:** List of all routes

```javascript
const routeCrawler = {
  // Sources to find routes
  sources: [
    // 1. HTML links
    'a[href]',
    'area[href]',
    '[data-href]',

    // 2. JS bundle analysis (regex patterns)
    /(?:path|to|href):\s*['"`]([^'"`]+)['"`]/g,
    /(?:push|replace)\(['"`]([^'"`]+)['"`]\)/g,
    /(?:Route|Link).*?(?:path|to)=['"`]([^'"`]+)['"`]/g,

    // 3. Sitemap
    '/sitemap.xml',
    '/sitemap-index.xml',

    // 4. Robots.txt
    '/robots.txt'
  ],

  // Route normalization
  normalizeRoute(url) {
    // /users/123 → /users/:id
    // /posts/hello-world → /posts/:slug
    return url
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-f0-9-]{36}/gi, '/:uuid')
      .replace(/\/[a-f0-9]{24}/gi, '/:objectId');
  }
};
```

#### 1.2 Interaction Scanner

**Input:** Page DOM
**Output:** List of all interactive elements with metadata

```javascript
const interactionScanner = {
  // Element types to scan
  selectors: {
    buttons: 'button, [role="button"], input[type="submit"], input[type="button"]',
    links: 'a[href], [role="link"]',
    tabs: '[role="tab"], [data-tab], .tab',
    accordions: '[aria-expanded], details, .accordion',
    dropdowns: 'select, [role="listbox"], [role="combobox"], [data-dropdown]',
    modals: '[data-modal], [data-dialog], [aria-haspopup="dialog"]',
    forms: 'form',
    inputs: 'input, textarea, select',
    toggles: 'input[type="checkbox"], input[type="radio"], [role="switch"]',
    sliders: 'input[type="range"], [role="slider"]',
    menus: '[role="menu"], [role="menubar"]',
    tooltips: '[data-tooltip], [title], [aria-describedby]'
  },

  // Metadata to extract per element
  extractMetadata(element) {
    return {
      selector: generateUniqueSelector(element),
      tag: element.tagName,
      type: element.type,
      text: element.textContent?.trim().slice(0, 100),
      ariaLabel: element.getAttribute('aria-label'),
      ariaExpanded: element.getAttribute('aria-expanded'),
      ariaHaspopup: element.getAttribute('aria-haspopup'),
      href: element.href,
      formAction: element.form?.action,
      formMethod: element.form?.method,
      disabled: element.disabled,
      hidden: element.hidden || element.offsetParent === null,
      classes: element.className,
      dataAttributes: extractDataAttributes(element)
    };
  }
};
```

#### 1.3 Safety Classifier

**Input:** Interaction element
**Output:** Safety classification

```javascript
const safetyClassifier = {
  classifications: {
    SAFE: 'safe',                    // Can click freely
    NAVIGATION: 'navigation',        // Changes route
    STATE_CHANGE: 'state_change',    // Opens modal, expands accordion
    FORM_SUBMIT: 'form_submit',      // Submits data
    MUTATION: 'mutation',            // Changes data (edit, update)
    DANGEROUS: 'dangerous',          // Delete, cancel, revoke
    PAYMENT: 'payment',              // Purchase, checkout
    AUTH: 'auth'                     // Login, logout, signup
  },

  // Pattern matching
  patterns: {
    dangerous: [
      /delete/i, /remove/i, /destroy/i, /cancel/i,
      /revoke/i, /terminate/i, /end/i, /close account/i,
      /permanently/i, /irreversible/i
    ],
    payment: [
      /pay/i, /purchase/i, /buy/i, /checkout/i,
      /subscribe/i, /upgrade/i, /order/i, /charge/i
    ],
    auth: [
      /log\s*out/i, /sign\s*out/i, /log\s*in/i, /sign\s*in/i,
      /sign\s*up/i, /register/i
    ],
    mutation: [
      /save/i, /update/i, /edit/i, /change/i,
      /submit/i, /send/i, /post/i, /create/i
    ]
  },

  classify(element, metadata) {
    const text = (metadata.text + ' ' + metadata.ariaLabel + ' ' + metadata.classes).toLowerCase();

    // Check patterns in priority order
    if (this.patterns.dangerous.some(p => p.test(text))) {
      return { classification: 'DANGEROUS', confidence: 0.9, reason: 'matches dangerous pattern' };
    }
    if (this.patterns.payment.some(p => p.test(text))) {
      return { classification: 'PAYMENT', confidence: 0.9, reason: 'matches payment pattern' };
    }
    if (this.patterns.auth.some(p => p.test(text))) {
      return { classification: 'AUTH', confidence: 0.9, reason: 'matches auth pattern' };
    }
    if (metadata.formAction || metadata.formMethod === 'POST') {
      return { classification: 'FORM_SUBMIT', confidence: 0.8, reason: 'form submission' };
    }
    if (this.patterns.mutation.some(p => p.test(text))) {
      return { classification: 'MUTATION', confidence: 0.7, reason: 'matches mutation pattern' };
    }
    if (metadata.href && !metadata.href.startsWith('#')) {
      return { classification: 'NAVIGATION', confidence: 0.9, reason: 'has href' };
    }
    if (metadata.ariaExpanded !== null || metadata.ariaHaspopup) {
      return { classification: 'STATE_CHANGE', confidence: 0.8, reason: 'aria state control' };
    }

    return { classification: 'SAFE', confidence: 0.6, reason: 'no dangerous signals' };
  }
};
```

---

### Phase 2: Exploration

#### 2.1 State Hasher

**Purpose:** Determine if two page states are the same UI (ignoring data differences)

```javascript
const stateHasher = {
  // Generate hash of UI structure (not content)
  hash(page) {
    const structure = await page.evaluate(() => {
      function getStructure(el, depth = 0) {
        if (depth > 15) return null; // Prevent infinite recursion

        return {
          tag: el.tagName,
          // Include structural classes, not utility classes
          classes: Array.from(el.classList)
            .filter(c => !c.match(/^(mt-|mb-|p-|m-|text-|bg-|w-|h-)/))
            .sort()
            .join(' '),
          role: el.getAttribute('role'),
          type: el.getAttribute('type'),
          // Count children, don't enumerate (avoids data-based differences)
          childCount: el.children.length,
          // Include structure of first few children as sample
          childSample: Array.from(el.children)
            .slice(0, 3)
            .map(c => getStructure(c, depth + 1))
        };
      }

      return getStructure(document.body);
    });

    return crypto.createHash('md5')
      .update(JSON.stringify(structure))
      .digest('hex');
  },

  // Additional signals that indicate same UI
  getUISignature(page) {
    return page.evaluate(() => ({
      // Route pattern (normalized)
      route: location.pathname.replace(/\/\d+/g, '/:id'),

      // Visible modals
      modals: [...document.querySelectorAll('[role="dialog"]:not([hidden])')].length,

      // Active tabs
      activeTab: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,

      // Expanded accordions
      expandedCount: document.querySelectorAll('[aria-expanded="true"]').length,

      // Form state (has errors, is submitting, etc.)
      hasErrors: document.querySelectorAll('[aria-invalid="true"], .error').length > 0,

      // Main content area structure
      mainStructure: document.querySelector('main, [role="main"], .main')?.children.length
    }));
  }
};
```

#### 2.2 BFS Explorer

**Purpose:** Systematically explore all reachable states

```javascript
const bfsExplorer = {
  async explore(startUrl, config) {
    const visited = new Map();      // hash → state
    const transitions = [];          // all recorded transitions
    const queue = [];                // states to explore

    // Initialize with start state
    const startState = await this.captureState(startUrl);
    queue.push(startState);
    visited.set(startState.hash, startState);

    while (queue.length > 0) {
      const currentState = queue.shift();

      // Get all interactions available from this state
      const interactions = await this.getInteractions(currentState);

      for (const interaction of interactions) {
        // Skip if already explored this transition
        const transitionKey = `${currentState.hash}:${interaction.selector}`;
        if (this.exploredTransitions.has(transitionKey)) continue;
        this.exploredTransitions.add(transitionKey);

        // Handle based on safety classification
        const result = await this.executeInteraction(currentState, interaction);

        if (result.newState) {
          const hash = result.newState.hash;

          // Record transition
          transitions.push({
            from: currentState.hash,
            action: interaction,
            to: hash,
            apiCalls: result.apiCalls
          });

          // Add to queue if new
          if (!visited.has(hash)) {
            visited.set(hash, result.newState);
            queue.push(result.newState);
          }
        }
      }
    }

    return { states: visited, transitions };
  },

  async executeInteraction(state, interaction) {
    const page = await this.getPage(state);

    switch (interaction.safety.classification) {
      case 'SAFE':
      case 'STATE_CHANGE':
        return this.executeSafe(page, interaction);

      case 'NAVIGATION':
        return this.executeNavigation(page, interaction);

      case 'MUTATION':
      case 'FORM_SUBMIT':
        return this.executeMutation(page, interaction);

      case 'DANGEROUS':
      case 'PAYMENT':
        return this.executeDangerous(page, interaction);

      case 'AUTH':
        return this.executeAuth(page, interaction);
    }
  }
};
```

---

### Phase 3: Capture

#### 3.1 State Capturer

```javascript
const stateCapturer = {
  async capture(page, stateId) {
    return {
      id: stateId,
      url: page.url(),
      timestamp: Date.now(),

      // HTML capture
      html: await page.content(),

      // Computed styles for all elements
      styles: await this.extractComputedStyles(page),

      // Screenshot
      screenshot: await page.screenshot({ fullPage: true }),

      // Viewport info
      viewport: await page.viewportSize(),

      // DOM metrics
      metrics: await this.extractMetrics(page),

      // Active element
      focusedElement: await page.evaluate(() =>
        document.activeElement?.tagName
      ),

      // Scroll positions
      scrollPositions: await this.extractScrollPositions(page),

      // Animation states
      animations: await this.extractAnimations(page)
    };
  },

  async extractComputedStyles(page) {
    return page.evaluate(() => {
      const styles = [];
      const elements = document.querySelectorAll('*');

      elements.forEach(el => {
        const computed = getComputedStyle(el);
        const selector = generateSelector(el);

        styles.push({
          selector,
          // Only capture non-default styles
          styles: extractNonDefaultStyles(computed)
        });
      });

      return styles;
    });
  }
};
```

---

### Phase 4: Tokenize

#### 4.1 Design Token Extractor

```javascript
const designTokenExtractor = {
  async extract(capturedStates) {
    const tokens = {
      colors: new Map(),
      typography: new Map(),
      spacing: new Map(),
      shadows: new Map(),
      borders: new Map(),
      radii: new Map(),
      transitions: new Map(),
      zIndices: new Map()
    };

    for (const state of capturedStates) {
      // Extract from computed styles
      for (const { styles } of state.styles) {
        // Colors
        this.extractColors(styles, tokens.colors);

        // Typography
        this.extractTypography(styles, tokens.typography);

        // Spacing
        this.extractSpacing(styles, tokens.spacing);

        // etc.
      }
    }

    return this.normalizeTokens(tokens);
  },

  extractColors(styles, colorMap) {
    const colorProps = ['color', 'background-color', 'border-color', 'fill', 'stroke'];

    for (const prop of colorProps) {
      if (styles[prop] && styles[prop] !== 'transparent' && styles[prop] !== 'inherit') {
        const normalized = normalizeColor(styles[prop]);
        const existing = colorMap.get(normalized);

        if (existing) {
          existing.usageCount++;
          existing.usedIn.add(prop);
        } else {
          colorMap.set(normalized, {
            value: normalized,
            usageCount: 1,
            usedIn: new Set([prop])
          });
        }
      }
    }
  },

  normalizeTokens(tokens) {
    // Convert to semantic names based on usage
    return {
      colors: {
        primary: this.inferPrimaryColor(tokens.colors),
        secondary: this.inferSecondaryColor(tokens.colors),
        background: this.inferBackgroundColor(tokens.colors),
        text: this.inferTextColor(tokens.colors),
        // ... all color values with semantic names
        raw: Object.fromEntries(tokens.colors)
      },
      // ... other token types
    };
  }
};
```

#### 4.2 Component Token Extractor

```javascript
const componentTokenExtractor = {
  // Known component patterns to detect
  patterns: {
    button: {
      selectors: ['button', '[role="button"]', '.btn', '[class*="button"]'],
      variants: ['primary', 'secondary', 'outline', 'ghost', 'destructive'],
      sizes: ['sm', 'md', 'lg', 'xl']
    },
    input: {
      selectors: ['input', 'textarea', '[role="textbox"]'],
      variants: ['default', 'error', 'success', 'disabled']
    },
    card: {
      selectors: ['[class*="card"]', 'article', '.panel'],
      variants: ['default', 'elevated', 'outlined']
    },
    // ... more patterns
  },

  async extract(capturedStates) {
    const components = {};

    for (const [name, pattern] of Object.entries(this.patterns)) {
      components[name] = await this.extractComponent(capturedStates, pattern);
    }

    return components;
  },

  async extractComponent(states, pattern) {
    const instances = [];

    for (const state of states) {
      const elements = await this.findElements(state, pattern.selectors);

      for (const el of elements) {
        instances.push({
          html: el.outerHTML,
          styles: getComputedStyles(el),
          variant: this.detectVariant(el, pattern.variants),
          size: this.detectSize(el, pattern.sizes)
        });
      }
    }

    // Cluster similar instances
    const clusters = this.clusterInstances(instances);

    // Generate token for each cluster (variant)
    return clusters.map(cluster => ({
      variant: cluster.variant,
      baseStyles: cluster.commonStyles,
      html: cluster.representativeHtml
    }));
  }
};
```

#### 4.3 API Token Extractor

```javascript
const apiTokenExtractor = {
  async extract(apiRecordings) {
    const endpoints = new Map();
    const schemas = new Map();
    const relationships = [];

    for (const recording of apiRecordings) {
      const { request, response } = recording;

      // Normalize endpoint
      const endpoint = this.normalizeEndpoint(request.url, request.method);

      // Extract/merge schema
      if (!endpoints.has(endpoint.key)) {
        endpoints.set(endpoint.key, {
          method: request.method,
          path: endpoint.path,
          pathParams: endpoint.params,
          queryParams: new Set(),
          requestSchema: null,
          responseSchema: null,
          examples: []
        });
      }

      const ep = endpoints.get(endpoint.key);

      // Merge query params
      for (const param of Object.keys(request.query || {})) {
        ep.queryParams.add(param);
      }

      // Infer request schema
      if (request.body) {
        ep.requestSchema = this.mergeSchema(
          ep.requestSchema,
          this.inferSchema(request.body)
        );
      }

      // Infer response schema
      if (response.body) {
        ep.responseSchema = this.mergeSchema(
          ep.responseSchema,
          this.inferSchema(response.body)
        );

        // Extract model schemas from response
        this.extractModels(response.body, schemas);
      }

      // Store example
      ep.examples.push({ request, response });
    }

    // Infer relationships from data patterns
    this.inferRelationships(schemas, relationships);

    return {
      endpoints: Object.fromEntries(endpoints),
      schemas: Object.fromEntries(schemas),
      relationships
    };
  },

  inferSchema(data, path = '') {
    if (data === null) return { type: 'null' };
    if (Array.isArray(data)) {
      return {
        type: 'array',
        items: data.length > 0 ? this.inferSchema(data[0], path + '[]') : { type: 'unknown' }
      };
    }
    if (typeof data === 'object') {
      const properties = {};
      for (const [key, value] of Object.entries(data)) {
        properties[key] = this.inferSchema(value, path + '.' + key);
      }
      return { type: 'object', properties };
    }
    if (typeof data === 'string') {
      // Detect special string types
      if (/^\d{4}-\d{2}-\d{2}/.test(data)) return { type: 'string', format: 'datetime' };
      if (/^[a-f0-9-]{36}$/i.test(data)) return { type: 'string', format: 'uuid' };
      if (/^[a-f0-9]{24}$/i.test(data)) return { type: 'string', format: 'objectId' };
      if (/@/.test(data)) return { type: 'string', format: 'email' };
      return { type: 'string' };
    }
    if (typeof data === 'number') {
      return { type: Number.isInteger(data) ? 'integer' : 'number' };
    }
    if (typeof data === 'boolean') {
      return { type: 'boolean' };
    }
    return { type: 'unknown' };
  }
};
```

---

## Claude Analysis Pipeline

### Overview: Programmatic vs Claude

The V4 extractor separates **programmatic extraction** (fast, cheap, deterministic) from **Claude analysis** (smart, semantic understanding).

```
┌─────────────────────────────────────────────────────────────────┐
│                     EXTRACTION FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STAGE 1: EXTRACT (Programmatic - No Claude)                     │
│  ════════════════════════════════════════════                    │
│  Tool: Node.js + Playwright                                      │
│  Time: ~1-5 minutes per app                                      │
│  Cost: ~$0 (just compute)                                        │
│                                                                  │
│  What it does:                                                   │
│  ├── Navigate pages (Playwright)                                 │
│  ├── Click interactions (Playwright)                             │
│  ├── Capture HTML/CSS (DOM read)                                 │
│  ├── Take screenshots (Playwright)                               │
│  ├── Intercept network (Playwright)                              │
│  ├── Hash states (computation)                                   │
│  ├── Store assets (file write)                                   │
│  └── Record actions (data structure)                             │
│                                                                  │
│  Outputs:                                                        │
│  ├── /states/           (HTML + screenshots per state)           │
│  ├── /api-recordings/   (request/response pairs)                 │
│  ├── /assets/           (images, fonts, deduplicated)            │
│  ├── /actions/          (replay log)                             │
│  └── state-graph.json   (transitions)                            │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STAGE 2: ANALYZE (Claude - Chunked)                             │
│  ═══════════════════════════════════                             │
│  Tool: Claude API (parallel calls)                               │
│  Time: ~3-10 minutes per app                                     │
│  Cost: ~$1-5 depending on size                                   │
│                                                                  │
│  What it does:                                                   │
│  ├── Understand components (what IS this?)                       │
│  ├── Name tokens semantically (what should we CALL it?)          │
│  ├── Document APIs (what does this endpoint DO?)                 │
│  ├── Extract business rules (what LOGIC does this imply?)        │
│  └── Verify quality (did we capture correctly?)                  │
│                                                                  │
│  Key principle: CHUNKED ANALYSIS                                 │
│  └── Analyze sections → pages → routes → app (not all at once)   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STAGE 3: BUILD (Programmatic - No Claude)                       │
│  ═════════════════════════════════════════                       │
│  Tool: Code generation templates                                 │
│                                                                  │
│  Outputs:                                                        │
│  ├── /clone/            (static browsable site)                  │
│  ├── /mock-server/      (Express API from recordings)            │
│  └── /template/         (rebuildable with different tokens)      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Why Chunked Analysis?

**Problem:** Feeding Claude an entire app at once causes:
- Context overflow
- Confused, inconsistent output
- High cost
- Slow processing

**Solution:** Map-reduce pattern - analyze pieces independently, then merge.

```
┌─────────────────────────────────────────────────────────────────┐
│  WRONG: Feed Claude everything at once                           │
│                                                                  │
│  claude.analyze({                                                │
│    states: [500 HTML files],                                     │
│    apis: [200 endpoints],                                        │
│    assets: [1000 images]                                         │
│  })                                                              │
│  → Context overflow, confused output, expensive, slow            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  RIGHT: Analyze pieces independently, then merge                 │
│                                                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│  │Section 1│ │Section 2│ │Section 3│ │Section N│  (PARALLEL)   │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘               │
│       ▼           ▼           ▼           ▼                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│  │Analysis │ │Analysis │ │Analysis │ │Analysis │               │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘               │
│       └───────────┴───────────┴───────────┘                      │
│                       │                                          │
│                       ▼                                          │
│               ┌───────────────┐                                  │
│               │  MERGE/ROLLUP │  (One final Claude call)         │
│               └───────────────┘                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Analysis Levels

#### Level 1: Section Analysis (Smallest Unit)

**Input:** Single section HTML (~50-200 lines) + cropped screenshot
**Parallelizable:** Yes
**Typical count:** ~50 unique sections

```javascript
const sectionAnalysis = {
  async analyze(section) {
    return claude.analyze(`
      Analyze this UI section:

      HTML:
      ${section.html}

      Screenshot: [attached cropped image]

      Questions:
      1. What component type is this? (header, nav, card, form, table, hero, footer, etc.)
      2. What is its purpose?
      3. What interactive elements does it contain?
      4. What design tokens would you extract?
         - Colors (list hex values)
         - Spacing (list px values)
         - Typography (list font sizes/weights)

      Respond as JSON:
      {
        "componentType": "string",
        "purpose": "string",
        "interactiveElements": [{ "type": "string", "text": "string", "action": "string" }],
        "tokens": {
          "colors": ["#hex", ...],
          "spacing": ["Npx", ...],
          "typography": ["size/weight", ...]
        }
      }
    `);
  },

  // Example output:
  exampleOutput: {
    "componentType": "pricing-card",
    "purpose": "Display subscription tier with features and CTA",
    "interactiveElements": [
      { "type": "button", "text": "Get Started", "action": "navigate to signup" }
    ],
    "tokens": {
      "colors": ["#3b82f6", "#ffffff", "#1f2937"],
      "spacing": ["24px", "16px", "8px"],
      "typography": ["24px/bold", "16px/medium", "14px/regular"]
    }
  }
};
```

#### Level 2: Page Analysis (Group of Sections)

**Input:** Section analysis summaries for one page
**Parallelizable:** Yes
**Typical count:** ~25 unique pages

```javascript
const pageAnalysis = {
  async analyze(page, sectionAnalyses) {
    const pageSections = page.sectionIds.map(id =>
      sectionAnalyses.find(s => s.id === id)?.summary
    );

    return claude.analyze(`
      These sections were found on the same page:

      URL: ${page.url}
      Title: ${page.title}

      Sections:
      ${JSON.stringify(pageSections, null, 2)}

      Questions:
      1. What is this page's purpose?
      2. How do the sections relate to each other?
      3. What user flow does this page support?
      4. What page type is this? (landing, dashboard, detail, list, form, settings, etc.)

      Respond as JSON:
      {
        "pageType": "string",
        "purpose": "string",
        "sections": ["section-type", ...],
        "userFlow": "string describing the user journey on this page"
      }
    `);
  },

  // Example output:
  exampleOutput: {
    "pageType": "pricing-page",
    "purpose": "Display pricing tiers and convert visitors to customers",
    "sections": ["header", "hero", "pricing-cards", "feature-comparison", "faq", "cta", "footer"],
    "userFlow": "Compare plans → Review features → Select tier → Click CTA → Navigate to signup"
  }
};
```

#### Level 3: Route Pattern Analysis (Group of Similar Pages)

**Input:** Page analyses for pages matching same route pattern
**Parallelizable:** Yes
**Typical count:** ~10 route patterns

```javascript
const routePatternAnalysis = {
  async analyze(pattern, pageAnalyses) {
    const matchingPages = pageAnalyses
      .filter(p => matchesPattern(p.url, pattern))
      .map(p => p.summary);

    return claude.analyze(`
      These pages share the route pattern: ${pattern}
      (e.g., /leads/123, /leads/456, /leads/789 all match /leads/:id)

      Page analyses:
      ${JSON.stringify(matchingPages, null, 2)}

      Questions:
      1. What entity does this route represent?
      2. What fields/properties does it display?
      3. What actions are available?
      4. What's the data schema implied?
      5. What relationships to other entities exist?

      Respond as JSON:
      {
        "entity": "string (e.g., Lead, User, Order)",
        "schema": {
          "fieldName": "fieldType",
          ...
        },
        "actions": ["action1", "action2", ...],
        "relationships": [
          { "entity": "string", "type": "hasMany|belongsTo|hasOne" }
        ]
      }
    `);
  },

  // Example output:
  exampleOutput: {
    "entity": "Lead",
    "schema": {
      "id": "string (uuid)",
      "name": "string",
      "email": "string (email)",
      "status": "enum (new, contacted, qualified, lost)",
      "value": "number (currency)",
      "assignedTo": "string (User.id)",
      "createdAt": "string (datetime)",
      "updatedAt": "string (datetime)"
    },
    "actions": ["edit", "delete", "convert-to-customer", "add-note", "assign"],
    "relationships": [
      { "entity": "User", "type": "belongsTo", "field": "assignedTo" },
      { "entity": "Note", "type": "hasMany" },
      { "entity": "Activity", "type": "hasMany" }
    ]
  }
};
```

#### Level 4: API Endpoint Analysis

**Input:** Request/response examples for one endpoint
**Parallelizable:** Yes
**Typical count:** ~30 endpoints

```javascript
const apiAnalysis = {
  async analyze(endpoint) {
    return claude.analyze(`
      Analyze this API endpoint:

      Method: ${endpoint.method}
      Path: ${endpoint.path}

      Request examples:
      ${JSON.stringify(endpoint.examples.slice(0, 3), null, 2)}

      Questions:
      1. What does this endpoint do?
      2. What entity does it operate on?
      3. What are the request parameters?
      4. What does the response contain?
      5. What errors might it return?

      Respond as JSON:
      {
        "purpose": "string",
        "entity": "string",
        "operation": "create|read|update|delete|list|search|action",
        "requestParams": {
          "path": { "paramName": "type" },
          "query": { "paramName": "type" },
          "body": { "fieldName": "type" }
        },
        "responseSchema": { "fieldName": "type" },
        "possibleErrors": ["error description", ...]
      }
    `);
  },

  // Example output:
  exampleOutput: {
    "purpose": "Retrieve a single lead by ID",
    "entity": "Lead",
    "operation": "read",
    "requestParams": {
      "path": { "id": "string (uuid)" },
      "query": { "include": "string (comma-separated relations)" },
      "body": null
    },
    "responseSchema": {
      "id": "string",
      "name": "string",
      "email": "string",
      "status": "string",
      "assignedTo": "User object (if included)",
      "notes": "Note[] (if included)"
    },
    "possibleErrors": [
      "404: Lead not found",
      "403: Not authorized to view this lead"
    ]
  }
};
```

#### Level 5: App-Wide Merge (Final Aggregation)

**Input:** All summaries from previous levels
**Parallelizable:** No (single call)
**Count:** 1

```javascript
const appMergeAnalysis = {
  async analyze(allAnalyses) {
    return claude.analyze(`
      App extraction complete. Merge all analyses into unified understanding.

      Summary:
      - Pages analyzed: ${allAnalyses.pages.length}
      - Route patterns: ${allAnalyses.routes.length}
      - Unique components: ${allAnalyses.components.length}
      - API endpoints: ${allAnalyses.apis.length}

      Route patterns:
      ${allAnalyses.routes.map(r => `- ${r.pattern}: ${r.entity}`).join('\n')}

      Entities discovered:
      ${allAnalyses.routes.map(r => JSON.stringify(r.schema)).join('\n')}

      Unique components:
      ${allAnalyses.components.map(c => `- ${c.componentType}: ${c.purpose}`).join('\n')}

      All colors found:
      ${JSON.stringify([...new Set(allAnalyses.tokens.colors)])}

      Questions:
      1. What kind of app is this? (CRM, e-commerce, dashboard, SaaS, etc.)
      2. What are the main modules/features?
      3. What's the entity relationship model?
      4. Give semantic names to the design tokens.

      Respond as JSON:
      {
        "appType": "string",
        "description": "string (2-3 sentences)",
        "modules": [
          { "name": "string", "purpose": "string", "routes": ["pattern", ...] }
        ],
        "entityRelationships": {
          "entities": ["Entity1", "Entity2", ...],
          "relationships": [
            { "from": "Entity1", "to": "Entity2", "type": "hasMany|belongsTo", "via": "fieldName" }
          ]
        },
        "designTokens": {
          "colors": {
            "primary": "#hex",
            "secondary": "#hex",
            "background": "#hex",
            "text": "#hex",
            "error": "#hex",
            "success": "#hex"
          },
          "spacing": {
            "xs": "Npx",
            "sm": "Npx",
            "md": "Npx",
            "lg": "Npx",
            "xl": "Npx"
          }
        }
      }
    `);
  }
};
```

### Deduplication Before Analysis

**Critical optimization:** Don't analyze the same component 100 times.

```javascript
const deduplicator = {
  // Hash each section's structure (not content)
  hashSection(section) {
    return crypto.createHash('md5')
      .update(JSON.stringify({
        tagStructure: this.getTagStructure(section.html),
        classPatterns: this.getClassPatterns(section.html),
        childCount: section.childCount
      }))
      .digest('hex');
  },

  // Deduplicate sections before analysis
  async deduplicateSections(allSections) {
    const uniqueSections = new Map();

    for (const section of allSections) {
      const hash = this.hashSection(section);

      if (!uniqueSections.has(hash)) {
        uniqueSections.set(hash, {
          html: section.html,
          screenshot: section.screenshot,
          hash,
          occurrences: []
        });
      }

      uniqueSections.get(hash).occurrences.push({
        stateId: section.stateId,
        url: section.url,
        position: section.position
      });
    }

    console.log(`Deduplicated: ${allSections.length} sections → ${uniqueSections.size} unique`);
    // e.g., "Deduplicated: 2000 sections → 47 unique"

    return Array.from(uniqueSections.values());
  }
};
```

### Full Analysis Pipeline Implementation

```javascript
const claudeAnalysisPipeline = {
  async run(extractionOutput) {
    console.log('Starting Claude analysis pipeline...');

    // Step 1: Deduplicate sections
    const uniqueSections = await deduplicator.deduplicateSections(
      extractionOutput.allSections
    );
    console.log(`Analyzing ${uniqueSections.length} unique sections...`);

    // Step 2: Level 1 - Section analysis (parallel)
    const sectionAnalyses = await Promise.all(
      uniqueSections.map(section =>
        sectionAnalysis.analyze(section)
      )
    );
    console.log(`Section analysis complete: ${sectionAnalyses.length} components identified`);

    // Step 3: Level 2 - Page analysis (parallel)
    const pageAnalyses = await Promise.all(
      extractionOutput.uniquePages.map(page =>
        pageAnalysis.analyze(page, sectionAnalyses)
      )
    );
    console.log(`Page analysis complete: ${pageAnalyses.length} pages understood`);

    // Step 4: Level 3 - Route pattern analysis (parallel)
    const routePatterns = this.extractRoutePatterns(pageAnalyses);
    const routeAnalyses = await Promise.all(
      routePatterns.map(pattern =>
        routePatternAnalysis.analyze(pattern, pageAnalyses)
      )
    );
    console.log(`Route analysis complete: ${routeAnalyses.length} entities discovered`);

    // Step 5: Level 4 - API analysis (parallel)
    const apiAnalyses = await Promise.all(
      extractionOutput.apiEndpoints.map(endpoint =>
        apiAnalysis.analyze(endpoint)
      )
    );
    console.log(`API analysis complete: ${apiAnalyses.length} endpoints documented`);

    // Step 6: Level 5 - App merge (single call)
    const appAnalysis = await appMergeAnalysis.analyze({
      components: sectionAnalyses,
      pages: pageAnalyses,
      routes: routeAnalyses,
      apis: apiAnalyses,
      tokens: this.collectAllTokens(sectionAnalyses)
    });
    console.log('App merge complete!');

    return {
      sections: sectionAnalyses,
      pages: pageAnalyses,
      routes: routeAnalyses,
      apis: apiAnalyses,
      app: appAnalysis
    };
  },

  extractRoutePatterns(pageAnalyses) {
    const patterns = new Set();
    for (const page of pageAnalyses) {
      const pattern = page.url
        .replace(/\/\d+/g, '/:id')
        .replace(/\/[a-f0-9-]{36}/gi, '/:uuid')
        .replace(/\/[a-f0-9]{24}/gi, '/:objectId');
      patterns.add(pattern);
    }
    return Array.from(patterns);
  },

  collectAllTokens(sectionAnalyses) {
    const tokens = { colors: [], spacing: [], typography: [] };
    for (const section of sectionAnalyses) {
      if (section.tokens) {
        tokens.colors.push(...(section.tokens.colors || []));
        tokens.spacing.push(...(section.tokens.spacing || []));
        tokens.typography.push(...(section.tokens.typography || []));
      }
    }
    return {
      colors: [...new Set(tokens.colors)],
      spacing: [...new Set(tokens.spacing)],
      typography: [...new Set(tokens.typography)]
    };
  }
};
```

### Cost & Performance Analysis

```
┌─────────────────────────────────────────────────────────────────┐
│  EXAMPLE: CRM App (HubSpot-style)                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Extraction output:                                              │
│  ├── States captured: 500                                        │
│  ├── Total sections: 2,000                                       │
│  ├── API recordings: 150 calls                                   │
│  └── Assets: 300 images/fonts                                    │
│                                                                  │
│  After deduplication:                                            │
│  ├── Unique sections: 47                                         │
│  ├── Unique pages: 23                                            │
│  ├── Route patterns: 8                                           │
│  └── API endpoints: 35                                           │
│                                                                  │
│  Claude calls:                                                   │
│  ├── Level 1 (sections): 47 calls   ~$0.50                       │
│  ├── Level 2 (pages): 23 calls      ~$0.25                       │
│  ├── Level 3 (routes): 8 calls      ~$0.10                       │
│  ├── Level 4 (APIs): 35 calls       ~$0.40                       │
│  ├── Level 5 (merge): 1 call        ~$0.20                       │
│  └── TOTAL: 114 calls               ~$1.45                       │
│                                                                  │
│  Time (with parallelization):                                    │
│  ├── Level 1: ~30 sec (parallel)                                 │
│  ├── Level 2: ~20 sec (parallel)                                 │
│  ├── Level 3: ~10 sec (parallel)                                 │
│  ├── Level 4: ~25 sec (parallel)                                 │
│  ├── Level 5: ~10 sec                                            │
│  └── TOTAL: ~2 minutes                                           │
│                                                                  │
│  WITHOUT chunking (analyzing everything at once):                │
│  ├── Would need: 1 massive call with 2000 sections               │
│  ├── Context overflow: Would fail                                │
│  ├── If it worked: ~$20-50, ~30 minutes, poor quality            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Summary: What Claude Analyzes

| Level | Unit | Input Size | Claude's Job |
|-------|------|------------|--------------|
| 1 | Section | ~100 lines HTML | "What IS this component?" |
| 2 | Page | Section summaries | "How do these relate?" |
| 3 | Route | Page summaries | "What entity is this?" |
| 4 | API | 2-3 examples | "What does this do?" |
| 5 | App | All summaries | "Name tokens, document app" |

**Key insight:** Claude only sees summaries at higher levels, never raw data. Each call is small, focused, and parallelizable.

---

## Injection System

### Core Injection Script

```javascript
const injectionScript = `
(function() {
  // Store for captured data
  window.__V4_CAPTURE__ = {
    apiCalls: [],
    formSubmissions: [],
    navigations: [],
    dangerousActions: [],
    errors: []
  };

  // ============================================
  // NETWORK INTERCEPTOR
  // ============================================

  const originalFetch = window.fetch;
  window.fetch = async function(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const urlStr = url.toString();

    const record = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      url: urlStr,
      method,
      headers: options.headers,
      body: options.body,
      type: 'fetch'
    };

    // Check if dangerous
    const isDangerous = ${JSON.stringify(dangerousPatterns)}.some(p =>
      new RegExp(p, 'i').test(urlStr) || new RegExp(p, 'i').test(options.body || '')
    );

    if (isDangerous || ['DELETE'].includes(method)) {
      record.intercepted = true;
      record.reason = 'dangerous_' + method.toLowerCase();
      window.__V4_CAPTURE__.dangerousActions.push(record);

      // Return mock success
      return new Response(JSON.stringify({ success: true, mocked: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Execute real request
    try {
      const response = await originalFetch(url, options);
      const clone = response.clone();

      // Record response
      record.status = response.status;
      record.responseHeaders = Object.fromEntries(response.headers);
      record.responseBody = await clone.text().catch(() => null);

      window.__V4_CAPTURE__.apiCalls.push(record);
      return response;
    } catch (error) {
      record.error = error.message;
      window.__V4_CAPTURE__.errors.push(record);
      throw error;
    }
  };

  // Also intercept XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__v4_method = method;
    this.__v4_url = url;
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const xhr = this;
    const record = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      url: xhr.__v4_url,
      method: xhr.__v4_method,
      body,
      type: 'xhr'
    };

    xhr.addEventListener('load', function() {
      record.status = xhr.status;
      record.responseBody = xhr.responseText;
      window.__V4_CAPTURE__.apiCalls.push(record);
    });

    return originalXHRSend.apply(this, arguments);
  };

  // ============================================
  // FORM INTERCEPTOR
  // ============================================

  const originalSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function() {
    const form = this;
    const formData = new FormData(form);

    const record = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      action: form.action,
      method: form.method,
      data: Object.fromEntries(formData)
    };

    // Check if dangerous
    const isDangerous = ${JSON.stringify(dangerousPatterns)}.some(p =>
      new RegExp(p, 'i').test(form.action) ||
      new RegExp(p, 'i').test(form.className)
    );

    if (isDangerous) {
      record.intercepted = true;
      window.__V4_CAPTURE__.dangerousActions.push(record);

      // Simulate success
      form.dispatchEvent(new Event('submit-success'));
      return;
    }

    window.__V4_CAPTURE__.formSubmissions.push(record);
    return originalSubmit.call(this);
  };

  // ============================================
  // NAVIGATION INTERCEPTOR
  // ============================================

  // Intercept pushState/replaceState
  const originalPushState = history.pushState;
  history.pushState = function() {
    window.__V4_CAPTURE__.navigations.push({
      type: 'pushState',
      url: arguments[2],
      timestamp: Date.now()
    });
    return originalPushState.apply(this, arguments);
  };

  // Intercept link clicks
  document.addEventListener('click', function(e) {
    const link = e.target.closest('a[href]');
    if (link && !link.href.startsWith('javascript:')) {
      window.__V4_CAPTURE__.navigations.push({
        type: 'link_click',
        url: link.href,
        text: link.textContent.trim(),
        timestamp: Date.now()
      });
    }
  }, true);

  // ============================================
  // WEBGL INTERCEPTOR
  // ============================================

  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type) {
    const ctx = originalGetContext.apply(this, arguments);

    if (type === 'webgl' || type === 'webgl2') {
      window.__V4_CAPTURE__.webgl = window.__V4_CAPTURE__.webgl || [];

      // Intercept shader source
      const origShaderSource = ctx.shaderSource;
      ctx.shaderSource = function(shader, source) {
        window.__V4_CAPTURE__.webgl.push({
          type: 'shader',
          shaderType: shader.type,
          source
        });
        return origShaderSource.apply(this, arguments);
      };
    }

    return ctx;
  };

  console.log('[V4] Injection layer initialized');
})();
`;
```

### Form Dependency Observer

**Purpose:** Detect which form field combinations actually produce UI changes, avoiding combinatorial explosion.

Instead of testing all field combinations (which would be O(V₁ × V₂ × ... × Vₙ) = exponential), we inject live observers that tell us exactly when and what changes occur.

```javascript
const formObserverScript = `
(function() {
  window.__V4_FORM_OBSERVER__ = {
    changes: [],

    init() {
      // 1. Watch ALL DOM mutations
      this.mutationObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          this.changes.push({
            type: 'dom',
            target: this.describeElement(m.target),
            mutation: m.type, // 'childList', 'attributes', 'characterData'
            added: m.addedNodes.length,
            removed: m.removedNodes.length,
            attribute: m.attributeName,
            oldValue: m.oldValue,
            timestamp: Date.now()
          });
        }
      });

      this.mutationObserver.observe(document.body, {
        childList: true,
        attributes: true,
        characterData: true,
        subtree: true,
        attributeOldValue: true
      });

      // 2. Intercept all event dispatches
      const originalDispatch = EventTarget.prototype.dispatchEvent;
      EventTarget.prototype.dispatchEvent = function(event) {
        window.__V4_FORM_OBSERVER__.changes.push({
          type: 'event',
          eventType: event.type,
          target: window.__V4_FORM_OBSERVER__.describeElement(this),
          timestamp: Date.now()
        });
        return originalDispatch.call(this, event);
      };

      // 3. Watch for programmatic value changes on inputs
      this.watchInputs();

      // 4. Intercept fetch/XHR (field change triggers API call?)
      this.interceptNetwork();
    },

    watchInputs() {
      // Proxy all input value setters to detect JS-driven value changes
      const inputs = document.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        const descriptor = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype, 'value'
        ) || Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype, 'value'
        );

        if (descriptor) {
          Object.defineProperty(input, 'value', {
            get() { return descriptor.get.call(this); },
            set(v) {
              window.__V4_FORM_OBSERVER__.changes.push({
                type: 'valueChange',
                target: input.name || input.id,
                newValue: v,
                programmatic: true,
                timestamp: Date.now()
              });
              return descriptor.set.call(this, v);
            }
          });
        }
      });
    },

    interceptNetwork() {
      const originalFetch = window.fetch;
      window.fetch = async (url, options) => {
        this.changes.push({
          type: 'network',
          url: url.toString(),
          method: options?.method || 'GET',
          timestamp: Date.now()
        });
        return originalFetch(url, options);
      };
    },

    // Clear and return changes since last check
    flush() {
      const changes = this.changes;
      this.changes = [];
      return changes;
    },

    describeElement(el) {
      if (!el || !el.tagName) return null;
      return {
        tag: el.tagName,
        id: el.id,
        name: el.name,
        classes: el.className,
        path: this.getPath(el)
      };
    },

    getPath(el) {
      const parts = [];
      while (el && el.tagName) {
        parts.unshift(el.tagName + (el.id ? '#' + el.id : ''));
        el = el.parentElement;
      }
      return parts.join(' > ');
    }
  };

  window.__V4_FORM_OBSERVER__.init();
  console.log('[V4] Form observer initialized');
})();
`;
```

#### Dependency Discovery Algorithm

Using the form observer, we can reactively detect which field changes affect other fields:

```javascript
const formDependencyDiscovery = {
  async discoverDependencies(page, form) {
    const dependencies = [];
    const fields = await this.getFormFields(page, form);

    for (const field of fields) {
      for (const value of this.getPossibleValues(field)) {
        // Clear the change buffer
        await page.evaluate(() => window.__V4_FORM_OBSERVER__.flush());

        // Change the field value
        await this.setFieldValue(page, field, value);
        await page.waitForTimeout(100); // Let JS handlers execute

        // Check what changed as a result
        const changes = await page.evaluate(() =>
          window.__V4_FORM_OBSERVER__.flush()
        );

        // Filter out noise (the field we just changed)
        const meaningfulChanges = changes.filter(c =>
          c.target?.name !== field.name &&
          c.type !== 'event' // Ignore generic events
        );

        if (meaningfulChanges.length > 0) {
          dependencies.push({
            trigger: { field: field.name, value },
            caused: meaningfulChanges,
            changeTypes: this.classifyChanges(meaningfulChanges)
          });
        }
      }

      // Reset field to original value
      await this.resetField(page, field);
    }

    return dependencies;
  },

  classifyChanges(changes) {
    const types = new Set();
    for (const c of changes) {
      if (c.type === 'dom' && c.mutation === 'childList') {
        types.add(c.added > 0 ? 'field_shown' : 'field_hidden');
      }
      if (c.type === 'dom' && c.attribute === 'disabled') {
        types.add('field_enabled_disabled');
      }
      if (c.type === 'dom' && c.attribute === 'class') {
        types.add('validation_state');
      }
      if (c.type === 'valueChange') {
        types.add('value_auto_filled');
      }
      if (c.type === 'network') {
        types.add('api_call_triggered');
      }
    }
    return Array.from(types);
  }
};
```

#### Smart Combination Testing

Only test combinations where dependencies exist:

```javascript
const smartCombinationTester = {
  async testRelevantCombinations(page, form, dependencies) {
    const states = [];

    // Build dependency chains: A → B → C (cascading dropdowns, etc.)
    const chains = this.buildDependencyChains(dependencies);

    for (const chain of chains) {
      // Walk the chain, testing each level
      for (let depth = 0; depth < chain.length; depth++) {
        const field = chain[depth];

        for (const value of this.getPossibleValues(field)) {
          await this.setFieldValue(page, field, value);

          // Capture state after this triggers downstream changes
          await page.waitForTimeout(100);
          const state = await this.captureFormState(page, form);

          if (this.isNewUIState(state, states)) {
            states.push(state);
          }
        }
      }
    }

    return states;
  },

  buildDependencyChains(dependencies) {
    // Group dependencies to find chains like Country → State → City
    const graph = new Map();

    for (const dep of dependencies) {
      const triggerField = dep.trigger.field;
      const affectedFields = dep.caused
        .filter(c => c.target?.name)
        .map(c => c.target.name);

      if (!graph.has(triggerField)) {
        graph.set(triggerField, new Set());
      }
      affectedFields.forEach(f => graph.get(triggerField).add(f));
    }

    // Find chains by following the graph
    const chains = [];
    const visited = new Set();

    for (const [start, targets] of graph) {
      if (visited.has(start)) continue;

      const chain = [start];
      visited.add(start);

      let current = start;
      while (graph.has(current)) {
        const next = Array.from(graph.get(current))[0];
        if (!next || visited.has(next)) break;
        chain.push(next);
        visited.add(next);
        current = next;
      }

      if (chain.length > 1) {
        chains.push(chain);
      }
    }

    return chains;
  }
};
```

#### Complexity Analysis

| Approach | 10 fields × 5 options each |
|----------|---------------------------|
| Naive (all combinations) | 5¹⁰ = **9,765,625 tests** |
| Dependency-aware | ~**150 tests** |

Breakdown:
- Discovery phase: 10 fields × 5 options = 50 observations
- Dependency testing: Usually 5-20 actual dependencies × 5 options = 25-100 tests
- Total: **~150 tests** instead of millions

#### What the Observer Catches

| Change Type | What It Detects |
|-------------|-----------------|
| `dom.childList` | Fields appearing/disappearing |
| `dom.attributes` | Classes changing (disabled, error states) |
| `valueChange` | JS auto-filling another field |
| `network` | Field change triggers API call (address lookup, validation) |
| `event` | Custom events being dispatched |

#### Example Output

```javascript
{
  trigger: { field: 'country', value: 'US' },
  caused: [
    { type: 'dom', mutation: 'childList', target: { id: 'state-container' }, added: 1 },
    { type: 'dom', mutation: 'attributes', target: { id: 'state-select' }, attribute: 'disabled' },
    { type: 'network', url: '/api/states?country=US', method: 'GET' }
  ],
  changeTypes: ['field_shown', 'field_enabled_disabled', 'api_call_triggered']
}
```

This tells us: "When country changes to US, the state dropdown becomes visible and enabled, and an API call fetches available states."

#### Safety Limits

Even with smart detection, we enforce practical limits:

```javascript
const FORM_EXPLORATION_LIMITS = {
  maxFieldsToExplore: 50,           // Skip forms with 50+ fields
  maxOptionsPerField: 20,           // Sample large dropdowns (200 countries → test 5)
  maxDependencyChainDepth: 4,       // A → B → C → D max
  maxTotalStates: 500,              // Hard cap on states per form
  maxTestTime: 60000,               // 60 second timeout per form
  sampleStrategy: 'representative'  // first, last, middle, + any that trigger deps
};
```

---

## Data Structures

### State Graph

```typescript
interface StateGraph {
  states: Map<string, State>;
  transitions: Transition[];
  metadata: {
    startState: string;
    totalStates: number;
    totalTransitions: number;
    maxDepth: number;
  };
}

interface State {
  id: string;                    // Hash of UI structure
  url: string;                   // URL at this state
  route: string;                 // Normalized route pattern
  html: string;                  // Full HTML
  screenshot: string;            // Path to screenshot
  viewport: { width: number; height: number };
  timestamp: number;

  // UI characteristics
  modals: ModalState[];
  activeTab: string | null;
  expandedAccordions: string[];
  formState: FormState;
  scrollPosition: { x: number; y: number };

  // Available interactions from this state
  interactions: Interaction[];

  // API calls made to reach this state
  apiCalls: APICall[];
}

interface Transition {
  id: string;
  from: string;                  // State ID
  to: string;                    // State ID
  action: Interaction;
  apiCalls: APICall[];
  timestamp: number;
}

interface Interaction {
  id: string;
  selector: string;
  type: 'click' | 'hover' | 'focus' | 'input' | 'scroll';
  element: {
    tag: string;
    text: string;
    classes: string;
    ariaLabel: string;
  };
  safety: {
    classification: SafetyClass;
    confidence: number;
    reason: string;
  };
}

type SafetyClass =
  | 'SAFE'
  | 'NAVIGATION'
  | 'STATE_CHANGE'
  | 'FORM_SUBMIT'
  | 'MUTATION'
  | 'DANGEROUS'
  | 'PAYMENT'
  | 'AUTH';
```

### Token Schemas

```typescript
interface DesignTokens {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: {
      primary: string;
      secondary: string;
      muted: string;
    };
    border: string;
    error: string;
    warning: string;
    success: string;
    info: string;
    // Raw extracted values
    raw: Record<string, ColorToken>;
  };

  typography: {
    fontFamilies: {
      heading: string;
      body: string;
      mono: string;
    };
    fontSizes: Record<string, string>;    // xs, sm, md, lg, xl, 2xl...
    fontWeights: Record<string, number>;  // light, normal, medium, bold...
    lineHeights: Record<string, string>;
    letterSpacings: Record<string, string>;
  };

  spacing: Record<string, string>;        // 0, 1, 2, 4, 8, 16, 24, 32...

  radii: Record<string, string>;          // none, sm, md, lg, full

  shadows: Record<string, string>;        // sm, md, lg, xl

  borders: {
    widths: Record<string, string>;
    styles: string[];
  };

  transitions: {
    durations: Record<string, string>;    // fast, normal, slow
    easings: Record<string, string>;      // ease, ease-in, ease-out...
  };

  breakpoints: Record<string, string>;    // sm, md, lg, xl, 2xl

  zIndices: Record<string, number>;       // base, dropdown, modal, toast...
}

interface ComponentTokens {
  [componentName: string]: {
    variants: {
      [variantName: string]: {
        baseStyles: CSSProperties;
        states: {
          hover?: CSSProperties;
          focus?: CSSProperties;
          active?: CSSProperties;
          disabled?: CSSProperties;
        };
      };
    };
    sizes?: {
      [sizeName: string]: {
        styles: CSSProperties;
      };
    };
    html: string;  // Representative HTML structure
  };
}

interface APITokens {
  baseUrl: string;
  auth: {
    type: 'bearer' | 'cookie' | 'api-key' | 'none';
    headerName?: string;
    cookieName?: string;
  };

  endpoints: {
    [key: string]: {
      method: string;
      path: string;
      pathParams: string[];
      queryParams: string[];
      requestSchema: JSONSchema;
      responseSchema: JSONSchema;
      examples: Array<{
        request: any;
        response: any;
      }>;
    };
  };

  schemas: {
    [modelName: string]: JSONSchema;
  };

  relationships: Array<{
    from: string;
    to: string;
    type: 'hasOne' | 'hasMany' | 'belongsTo' | 'manyToMany';
    foreignKey: string;
  }>;
}
```

---

## Open Issues

### Critical (Must Solve Before Building)

#### ISSUE-001: State Hash Stability
**Problem:** Need to verify that UI structure hashing produces stable, deterministic hashes for identical visual states while correctly differentiating truly different states.

**Questions:**
- Does the current hashing approach handle dynamic content (timestamps, IDs) correctly?
- How do we handle CSS animations mid-state?
- What about lazy-loaded content that might not be present yet?

**Proposed Validation:**
- Build isolated hash test suite
- Run against 10 real sites
- Verify: same page = same hash, different pages = different hash
- Measure false positive/negative rates

**Status:** 🔴 Not Started

---

#### ISSUE-002: Data vs UI Deduplication
**Problem:** How do we distinguish between "same UI with different data" (don't duplicate) vs "same route with different UI state" (do capture)?

**Example:**
- `/leads/123` and `/leads/456` - same UI structure, different data → capture ONE
- `/leads?view=list` and `/leads?view=grid` - same route, different UI → capture BOTH
- `/leads/123` and `/leads/123?edit=true` - same ID, different UI state → capture BOTH

**Questions:**
- Is DOM structure hash sufficient?
- Do we need semantic understanding of what constitutes "data" vs "UI"?
- How do we handle lists with different item counts?

**Proposed Solution:**
- Hash DOM structure, ignoring text content inside "data containers"
- Define "data containers" as elements with dynamic IDs or inside list items
- Compare route pattern + structure hash together

**Status:** 🔴 Not Started

---

#### ISSUE-003: Iframe and Shadow DOM Handling
**Problem:** Many webapps use iframes (payment forms, embeds) and Shadow DOM (web components). Current approach doesn't handle these.

**Questions:**
- Can we access cross-origin iframe content? (Probably not)
- How do we capture Shadow DOM content?
- How do we handle dynamically created iframes?

**Proposed Solution:**
- Same-origin iframes: Inject and capture normally
- Cross-origin iframes: Capture outer frame only, note as "external"
- Shadow DOM: Use `element.shadowRoot` with `mode: open`, skip `mode: closed`

**Status:** 🔴 Not Started

---

#### ISSUE-004: Form Input Variations
**Problem:** Forms can have many states based on input values, validation errors, etc. How do we capture meaningful variations without infinite possibilities?

**Examples:**
- Empty form vs filled form
- Valid input vs invalid input
- Different select/radio/checkbox combinations
- **Combinations**: Country → State → City cascading dropdowns

**Questions:**
- Do we need to capture every validation error message?
- How do we know which input combinations produce different UI?
- Should we use predefined test values or detect field types?
- **How do we handle field combinations without exponential explosion?**

**Solution:** Use injection-based Form Dependency Observer (see [Form Dependency Observer](#form-dependency-observer))

Instead of testing all combinations (O(V₁ × V₂ × ... × Vₙ) = exponential), we:

1. **Inject live observers** (MutationObserver, event interceptors, value proxies, network interceptors)
2. **Change each field** and observe what else changes
3. **Build dependency graph** from observed changes
4. **Only test combinations along dependency chains**

**Result:** 10 fields × 5 options = ~150 tests instead of 9,765,625

**Key detection capabilities:**
- DOM mutations (fields appearing/disappearing)
- Attribute changes (disabled states, validation classes)
- Programmatic value changes (JS auto-filling fields)
- Network calls (API validation, cascading data fetches)

**Also captures:**
- Capture: empty, valid filled, each type of validation error
- Use intelligent test data based on field type (email → test@test.com, phone → 555-0100)
- Detect validation by checking for error classes/aria-invalid after blur

**Status:** 🟢 Solved (see Form Dependency Observer section)

---

### High Priority (Should Solve Before Building)

#### ISSUE-005: Session/Cookie Expiration During Long Crawls
**Problem:** Auth cookies may expire during lengthy extraction (hours for large apps).

**Proposed Solution:**
- Monitor for auth failures (401/403 responses, login redirects)
- Pause and prompt user to refresh cookies
- Or implement cookie refresh if refresh token available

**Status:** 🟡 Needs Design

---

#### ISSUE-006: Rate Limiting and Bot Detection
**Problem:** Aggressive crawling may trigger rate limits or bot detection.

**Proposed Solution:**
- Configurable delays between requests
- Random human-like timing variations
- Respect Retry-After headers
- Option to use proxies for distributed crawling

**Status:** 🟡 Needs Design

---

#### ISSUE-007: Dynamic Content Loading
**Problem:** Content loaded via infinite scroll, "load more" buttons, or intersection observers.

**Questions:**
- How do we detect that more content is available?
- When do we stop scrolling/loading?
- How do we capture the loading states themselves?

**Proposed Solution:**
- Detect scroll handlers and "load more" buttons
- Scroll/click until content stops changing (with max limit)
- Capture loading states by intercepting before content loads

**Status:** 🟡 Needs Design

---

#### ISSUE-008: WebSocket Real-Time Content
**Problem:** Some apps use WebSocket for real-time updates (chat, notifications, live data).

**Questions:**
- Do we need to capture WebSocket message schemas?
- How do we capture UI states that only appear via WebSocket pushes?
- Can we replay WebSocket messages?

**Proposed Solution:**
- Intercept WebSocket connections
- Record message schemas and examples
- For real-time UI: capture initial state, note that updates come via WS

**Status:** 🟡 Needs Design

---

### Medium Priority (Can Solve During Building)

#### ISSUE-009: Multi-Window/Popup Handling
**Problem:** Some actions open new windows/tabs (OAuth, payment, previews).

**Status:** 🟡 Needs Design

---

#### ISSUE-010: File Upload/Download States
**Problem:** File inputs, drag-drop zones, download progress states.

**Status:** 🟡 Needs Design

---

#### ISSUE-011: Date/Time Picker Variations
**Problem:** Calendar pickers have many states (different months, selected dates, time ranges).

**Status:** 🟡 Needs Design

---

#### ISSUE-012: Rich Text Editor States
**Problem:** WYSIWYG editors have complex toolbars, formatting states, etc.

**Status:** 🟡 Needs Design

---

### Low Priority (Can Defer to V5)

#### ISSUE-013: PWA/Service Worker Handling
**Status:** ⚪ Deferred

---

#### ISSUE-014: GraphQL Subscription Extraction
**Status:** ⚪ Deferred

---

#### ISSUE-015: CSS-in-JS Runtime Styles
**Status:** ⚪ Deferred

---

#### ISSUE-016: Micro-Frontend Detection
**Status:** ⚪ Deferred

---

#### ISSUE-017: Multi-Role User Extraction
**Status:** 🔴 Critical - Needs Design

**Problem:** Many webapps have multiple user roles (admin, manager, regular user, guest, etc.) with different:
- Navigation items visible
- Pages/routes accessible
- Actions available (edit vs view-only)
- Data visible (own data vs all data)
- UI components shown (admin panels, settings)

A complete extraction must capture ALL role-specific views.

**Examples:**
- **SaaS Dashboard:** Admin sees billing, user management, audit logs; User sees only their data
- **E-commerce:** Admin sees inventory, orders from all users; Customer sees only their orders
- **CMS:** Editor can publish, Author can only draft, Viewer is read-only
- **Multi-tenant:** Org admin vs team member vs guest

**Proposed Solution - Role-Aware Extraction:**

```javascript
// Configuration: User provides credentials/tokens per role
const ROLE_CONFIG = {
  roles: [
    {
      name: 'admin',
      description: 'Full access administrator',
      auth: {
        type: 'cookie',
        cookies: [{ name: 'session', value: 'admin_session_token_xxx' }]
      }
    },
    {
      name: 'manager',
      description: 'Team manager with limited admin',
      auth: {
        type: 'cookie',
        cookies: [{ name: 'session', value: 'manager_session_token_xxx' }]
      }
    },
    {
      name: 'user',
      description: 'Regular authenticated user',
      auth: {
        type: 'cookie',
        cookies: [{ name: 'session', value: 'user_session_token_xxx' }]
      }
    },
    {
      name: 'guest',
      description: 'Unauthenticated visitor',
      auth: { type: 'none' }
    }
  ],

  // Optional: Role discovery hints
  roleIndicators: {
    urlPatterns: ['/admin', '/dashboard', '/settings', '/manage'],
    navSelectors: ['[data-role]', '.admin-nav', '.user-nav'],
    apiEndpoints: ['/api/me', '/api/user/permissions']
  }
};
```

**Role Extraction Flow:**

```
┌─────────────────────────────────────────────────────────────────┐
│  MULTI-ROLE EXTRACTION                                          │
│                                                                 │
│  For each role in config:                                       │
│    1. Create fresh browser context                              │
│    2. Apply role's auth (cookies/tokens)                        │
│    3. Run full state extraction                                 │
│    4. Tag all states with role: "admin", "user", etc.           │
│    5. Capture role-specific:                                    │
│       - Navigation items                                        │
│       - Available routes                                        │
│       - API endpoints accessible                                │
│       - Actions enabled/disabled                                │
│                                                                 │
│  After all roles extracted:                                     │
│    - Diff states between roles                                  │
│    - Identify role-exclusive UI                                 │
│    - Map permissions to UI elements                             │
│    - Generate role-based component variants                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Output Structure:**

```javascript
// role-map.json
{
  "roles": {
    "admin": {
      "routes": ["/", "/admin", "/admin/users", "/admin/billing", "/settings"],
      "states": ["state_001", "state_002", "state_015", "state_016", ...],
      "exclusiveStates": ["state_015", "state_016"],  // Only admin sees these
      "actions": ["delete_user", "change_billing", "view_audit_log"],
      "navItems": ["Dashboard", "Users", "Billing", "Settings", "Audit Log"]
    },
    "user": {
      "routes": ["/", "/dashboard", "/profile", "/settings"],
      "states": ["state_001", "state_003", "state_004", ...],
      "exclusiveStates": [],  // User sees subset of admin
      "actions": ["edit_profile", "change_password"],
      "navItems": ["Dashboard", "Profile", "Settings"]
    },
    "guest": {
      "routes": ["/", "/login", "/signup", "/pricing"],
      "states": ["state_020", "state_021", "state_022"],
      "exclusiveStates": ["state_020"],  // Landing page before login
      "actions": ["login", "signup"],
      "navItems": ["Home", "Pricing", "Login", "Sign Up"]
    }
  },

  "permissions": {
    "delete_user": { "roles": ["admin"], "ui": "button.delete-user" },
    "edit_profile": { "roles": ["admin", "user"], "ui": "button.edit-profile" },
    "view_billing": { "roles": ["admin"], "ui": "nav-item.billing" }
  },

  "roleDiffs": {
    "admin_vs_user": {
      "additionalRoutes": ["/admin", "/admin/users", "/admin/billing"],
      "additionalNavItems": ["Users", "Billing", "Audit Log"],
      "additionalActions": ["delete_user", "change_billing", "view_audit_log"]
    }
  }
}
```

**Role Discovery (Automatic):**

If user doesn't provide role configs, attempt auto-discovery:

```javascript
async function discoverRoles(page) {
  // 1. Check /api/me or /api/user for role field
  const userResponse = await interceptApiCall(page, '/api/me');
  if (userResponse?.role) {
    console.log(`Current role: ${userResponse.role}`);
  }

  // 2. Look for role indicators in DOM
  const roleElements = await page.$$eval('[data-role], [data-permission]', els =>
    els.map(el => ({
      role: el.dataset.role,
      permission: el.dataset.permission
    }))
  );

  // 3. Check localStorage/sessionStorage for role info
  const storageRole = await page.evaluate(() => {
    return localStorage.getItem('userRole') ||
           sessionStorage.getItem('role') ||
           JSON.parse(localStorage.getItem('user') || '{}').role;
  });

  // 4. Analyze navigation for role-specific sections
  const navItems = await page.$$eval('nav a, [role="navigation"] a', links =>
    links.map(a => ({ text: a.textContent, href: a.href }))
  );
  const adminIndicators = navItems.filter(item =>
    /admin|manage|users|billing|settings/i.test(item.text + item.href)
  );

  return {
    detectedRole: userResponse?.role || storageRole,
    adminIndicators,
    suggestedRoles: inferRolesFromUI(navItems, roleElements)
  };
}
```

**Implementation Requirements:**
- [ ] Role config schema and validation
- [ ] Per-role browser context management
- [ ] State tagging with role metadata
- [ ] Role diff algorithm (what's exclusive to each role)
- [ ] Permission-to-UI mapping
- [ ] Auto-discovery for common patterns (JWT claims, localStorage, API responses)
- [ ] Output: role-map.json with full role breakdown

**Edge Cases:**
- Roles with overlapping permissions
- Dynamic permissions (feature flags per user)
- Multi-tenant with org-level roles
- Temporary elevated permissions (sudo mode)
- SSO with external role provider

---

#### ISSUE-018: Business Logic & Functionality Extraction
**Status:** 🔴 Critical - Core Feature Gap

**Problem:** Current extraction only captures the visual shell of applications. We extract:
- ✅ DOM elements and positions
- ✅ CSS styles
- ✅ SVG icons
- ✅ Visual state transitions (modals, panels)

But we do NOT extract the actual functionality:
- ❌ Canvas drawing logic (how shapes are drawn)
- ❌ State management internals (Redux, Zustand, React state)
- ❌ Event handlers (what happens on mousedown/mousemove/mouseup)
- ❌ Business logic (validation, calculations, transformations)
- ❌ Data structures (shape objects, undo stack, clipboard)
- ❌ Keyboard shortcut implementations
- ❌ Collision detection, hit testing
- ❌ Rendering algorithms

**Example - Excalidraw "Draw Rectangle" Flow:**
```
User clicks Rectangle tool → selectedTool state changes
User mousedown on canvas →
  - Records start position
  - Creates shape object: { type: 'rectangle', x, y, width: 0, height: 0, id: uuid() }
User drags mouse →
  - Updates shape dimensions on every mousemove
  - Calls rough.js library to render sketchy rectangle
  - Redraws entire canvas (or dirty region)
User mouseup →
  - Finalizes shape
  - Adds to elements array
  - Pushes to undo stack
  - Triggers auto-save/persistence
```

This logic lives in JavaScript, not in the DOM. We cannot see it by inspecting elements.

**Proposed Solution - Multi-Layer Extraction:**

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: Visual (CURRENT)                                      │
│  ├── DOM elements and positions                                 │
│  ├── CSS styles                                                 │
│  └── Static screenshots per state                               │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 2: Behavioral (NEW)                                      │
│  ├── User interaction recordings (click, drag, keypress)        │
│  ├── State snapshots before/after each action                   │
│  ├── Canvas operation sequences                                 │
│  └── Event-to-effect mappings                                   │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 3: Source Code (NEW)                                     │
│  ├── JavaScript bundle download & analysis                      │
│  ├── Source map reconstruction                                  │
│  ├── AST parsing for function signatures                        │
│  └── Deobfuscation when needed                                  │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 4: Synthesis (NEW)                                       │
│  ├── LLM analyzes extracted data                                │
│  ├── Generates equivalent implementation                        │
│  └── Iteratively tests and refines                              │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation: Behavioral Recording**

```javascript
// Inject instrumentation before page load
await page.evaluateOnNewDocument(() => {
  window.__behaviorLog = [];

  // 1. Record all canvas operations
  const wrapCanvas = (ctx) => {
    const methods = ['fillRect', 'strokeRect', 'beginPath', 'moveTo',
                     'lineTo', 'arc', 'fill', 'stroke', 'clearRect',
                     'bezierCurveTo', 'quadraticCurveTo', 'rect',
                     'save', 'restore', 'translate', 'rotate', 'scale'];
    methods.forEach(method => {
      const original = ctx[method]?.bind(ctx);
      if (original) {
        ctx[method] = (...args) => {
          window.__behaviorLog.push({
            type: 'canvas',
            method,
            args: JSON.parse(JSON.stringify(args)),
            timestamp: Date.now()
          });
          return original(...args);
        };
      }
    });
  };

  // Hook getContext to wrap 2d contexts
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    const ctx = originalGetContext.apply(this, [type, ...args]);
    if (type === '2d' && ctx && !ctx.__wrapped) {
      wrapCanvas(ctx);
      ctx.__wrapped = true;
    }
    return ctx;
  };

  // 2. Record all user events
  ['mousedown', 'mousemove', 'mouseup', 'click', 'dblclick',
   'keydown', 'keyup', 'wheel', 'touchstart', 'touchmove', 'touchend'
  ].forEach(event => {
    document.addEventListener(event, (e) => {
      window.__behaviorLog.push({
        type: 'event',
        event: event,
        target: e.target.tagName,
        targetId: e.target.id,
        targetClass: e.target.className,
        x: e.clientX,
        y: e.clientY,
        key: e.key,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        timestamp: Date.now()
      });
    }, true);
  });

  // 3. Record React state changes (if React)
  const originalSetState = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  // ... hook into React DevTools protocol

  // 4. Record localStorage/sessionStorage changes
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    window.__behaviorLog.push({
      type: 'storage',
      action: 'setItem',
      key,
      value: value.substring(0, 1000), // Truncate large values
      timestamp: Date.now()
    });
    return originalSetItem.apply(this, [key, value]);
  };
});
```

**Implementation: Canvas State Extraction**

```javascript
// After user performs an action, extract canvas state
async function extractCanvasState(page) {
  return await page.evaluate(() => {
    const canvases = document.querySelectorAll('canvas');
    return Array.from(canvases).map((canvas, idx) => ({
      id: canvas.id || `canvas-${idx}`,
      width: canvas.width,
      height: canvas.height,
      // Get image data for comparison
      dataUrl: canvas.toDataURL('image/png'),
      // Try to access app state if exposed
      appState: window.__EXCALIDRAW_STATE__ ||
                window.__APP_STATE__ ||
                window.store?.getState?.()
    }));
  });
}
```

**Implementation: Source Code Analysis**

```javascript
async function extractSourceCode(page) {
  // 1. Get all script URLs
  const scripts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script[src]'))
      .map(s => s.src)
      .filter(src => !src.includes('analytics') && !src.includes('gtag'));
  });

  // 2. Download and analyze each
  const sources = {};
  for (const url of scripts) {
    const response = await fetch(url);
    const code = await response.text();

    // Try to find source map
    const sourceMapMatch = code.match(/\/\/# sourceMappingURL=(.+)/);
    if (sourceMapMatch) {
      const mapUrl = new URL(sourceMapMatch[1], url).href;
      const sourceMap = await fetch(mapUrl).then(r => r.json()).catch(() => null);
      if (sourceMap) {
        sources[url] = {
          code,
          sourceMap,
          originalFiles: sourceMap.sources,
          // Reconstruct original source from source map
          original: reconstructFromSourceMap(sourceMap)
        };
        continue;
      }
    }

    // No source map - beautify and analyze
    sources[url] = {
      code: beautify(code),
      analysis: analyzeAST(code)
    };
  }

  return {
    sources,
    stateManagement: detectStateManagement(sources), // Redux, Zustand, etc.
    frameworks: detectFrameworks(sources),           // React, Vue, etc.
    libraries: detectLibraries(sources)              // rough.js, d3, etc.
  };
}
```

**Implementation: LLM-Assisted Code Generation**

```javascript
async function generateFunctionalCode(extractedData) {
  const { visual, behavior, source } = extractedData;

  // 1. Identify features from behavior log
  const features = analyzeFeatures(behavior);
  // e.g., { 'draw-rectangle': { events: [...], canvasOps: [...], stateChanges: [...] } }

  // 2. For each feature, generate implementation
  const implementations = {};

  for (const [featureName, featureData] of Object.entries(features)) {
    const prompt = `
Generate a React implementation for: ${featureName}

Observed behavior:
- User events: ${JSON.stringify(featureData.events.slice(0, 20))}
- Canvas operations: ${JSON.stringify(featureData.canvasOps.slice(0, 50))}
- State before: ${JSON.stringify(featureData.stateBefore)}
- State after: ${JSON.stringify(featureData.stateAfter)}

Relevant source code snippets:
${featureData.relevantSource}

Requirements:
- Use canvas 2D API for rendering
- Match the visual style exactly
- Handle all observed event types
- Maintain undo/redo capability

Generate complete, working TypeScript code.
`;

    implementations[featureName] = await llm.generate(prompt);
  }

  // 3. Assemble into complete app
  return assembleApp(visual, implementations);
}
```

**Validation: Behavioral Comparison**

```javascript
async function validateFunctionalClone(original, clone) {
  const testCases = [
    { name: 'draw-rectangle', actions: [
      { type: 'click', selector: '[aria-label="Rectangle"]' },
      { type: 'mousedown', x: 100, y: 100 },
      { type: 'mousemove', x: 200, y: 150 },
      { type: 'mouseup', x: 200, y: 150 }
    ]},
    { name: 'undo', actions: [
      { type: 'keyboard', key: 'z', ctrlKey: true }
    ]},
    // ... more test cases
  ];

  for (const test of testCases) {
    // Run on original
    const originalResult = await runTestCase(original, test);

    // Run on clone
    const cloneResult = await runTestCase(clone, test);

    // Compare results
    const diff = compareResults(originalResult, cloneResult);
    if (diff.significant) {
      console.log(`MISMATCH in ${test.name}:`, diff);
    }
  }
}
```

**Implementation Phases:**

1. **Phase A: Behavioral Recording** (3-5 days)
   - [ ] Canvas operation interception
   - [ ] User event recording
   - [ ] State snapshot capture
   - [ ] Behavior log export

2. **Phase B: Source Analysis** (2-3 days)
   - [ ] Script URL collection
   - [ ] Source map reconstruction
   - [ ] AST parsing basics
   - [ ] Framework detection

3. **Phase C: Feature Identification** (3-5 days)
   - [ ] Event-to-effect correlation
   - [ ] Feature boundary detection
   - [ ] State change grouping
   - [ ] Naming heuristics

4. **Phase D: Code Generation** (5-7 days)
   - [ ] LLM prompt engineering
   - [ ] Code assembly
   - [ ] Iterative refinement
   - [ ] Test validation

**Output Files:**

```
output/<app>/
  behavior/
    events.json          # All recorded user events
    canvas-ops.json      # All canvas drawing operations
    state-snapshots/     # App state at key moments
    features.json        # Identified features with data

  source/
    bundles/             # Downloaded JS files
    source-maps/         # Reconstructed source maps
    analysis.json        # AST analysis results

  generated/
    src/
      features/
        DrawRectangle.tsx
        Selection.tsx
        Undo.tsx
        ...
      state/
        store.ts
        actions.ts
      App.tsx
    package.json
```

**Limitations & Considerations:**

- **Copyright:** Generated code mimics functionality but doesn't copy source verbatim
- **Complexity:** Very complex apps may need manual refinement
- **External APIs:** Backend APIs need separate extraction/mocking
- **Performance:** May not match original performance characteristics
- **Edge Cases:** Unusual interactions may be missed without explicit testing

---

## Implementation Plan

### Phase 0: Proof of Concept (1-2 days)
**Goal:** Validate core algorithms work

- [ ] Build state hasher - test on 5 real sites
- [ ] Build safety classifier - test accuracy
- [ ] Build basic injection script - verify network interception works
- [ ] Manual test of dangerous action interception

**Success Criteria:**
- State hasher produces stable hashes
- Safety classifier has <10% false positive rate
- Can capture "Delete" button flow without actually deleting

---

### Phase 1: Discovery Agent (2-3 days)
**Goal:** Build route and interaction discovery

- [ ] Route crawler (HTML + JS bundle analysis)
- [ ] Interaction scanner (all interactive elements)
- [ ] Safety classifier (classify each interaction)
- [ ] Output route-map.json and interaction-map.json

**Success Criteria:**
- Discovers >95% of routes on test sites
- Correctly identifies all interactive elements
- Classifies dangerous actions with >90% accuracy

---

### Phase 2: Exploration Engine (3-5 days)
**Goal:** BFS exploration with injection

- [ ] Browser context management (fresh context per branch)
- [ ] BFS explorer with state queue
- [ ] Full injection script (network, forms, navigation, WebGL)
- [ ] State hash and deduplication
- [ ] Transition recording
- [ ] Output state-graph.json

**Success Criteria:**
- Explores all reachable states from start URL
- Correctly deduplicates data variations
- Captures dangerous action flows safely
- Records all API calls

---

### Phase 3: Capture System (2-3 days)
**Goal:** Full state capture

- [ ] HTML capturer (full document)
- [ ] CSS extractor (computed styles)
- [ ] Screenshot taker (full page)
- [ ] Asset collector (images, fonts, etc.)
- [ ] Output ui-states/ and assets/

**Success Criteria:**
- Captured HTML renders correctly standalone
- All assets localized
- Screenshots match live site

---

### Phase 4: Tokenizer (3-4 days)
**Goal:** Extract all token types

- [ ] Design token extractor (colors, typography, spacing)
- [ ] Component token extractor (button, card, form patterns)
- [ ] API token extractor (endpoints, schemas, relationships)
- [ ] Business logic extractor (validation rules, permissions)
- [ ] Output all *-tokens/ folders

**Success Criteria:**
- Design tokens cover >95% of visual styles
- Component tokens identify main UI patterns
- API tokens create accurate backend spec

---

### Phase 5: Assembler (2-3 days)
**Goal:** Generate final output

- [ ] Clone builder (static site with state switcher)
- [ ] Mock API generator (Express server from recordings)
- [ ] Documentation generator
- [ ] Manifest generator
- [ ] Output clone/, mock-server/, docs/

**Success Criteria:**
- Clone is browsable with all states accessible
- Mock API serves recorded responses
- Manifest accurately summarizes extraction

---

### Phase 6: Orchestrator Integration (2-3 days)
**Goal:** Coordinate agents

- [ ] Orchestrator agent that coordinates phases
- [ ] Progress tracking and resumability
- [ ] Error handling and retries
- [ ] Parallel exploration (multiple browser contexts)
- [ ] CLI interface

**Success Criteria:**
- Can extract complete webapp in single command
- Handles errors gracefully
- Can resume interrupted extractions

---

### Total Estimated Time: 15-23 days

---

## Appendix

### Test Sites for Validation

1. **Simple SPA:** TodoMVC (React version)
2. **Medium Complexity:** Cal.com (scheduling app)
3. **Complex SPA:** Linear.app (project management)
4. **Dashboard:** Vercel Dashboard
5. **E-commerce:** Shopify storefront
6. **CRM-like:** HubSpot free CRM
7. **Forms-heavy:** Typeform builder
8. **Real-time:** Discord web app

### Related Prior Art

- Playwright codegen
- Cypress Studio
- Chrome DevTools Recorder
- Puppeteer-recorder
- WebPageTest
- Archive.org Wayback Machine

### References

- [Web Components spec](https://developer.mozilla.org/en-US/docs/Web/Web_Components)
- [Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM)
- [Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
