# V4 Full Webapp Extractor - Specification

**Version:** 0.1 (Draft)
**Status:** Planning
**Last Updated:** 2024-01-08

---

## Table of Contents

1. [Overview](#overview)
2. [Goals & Non-Goals](#goals--non-goals)
3. [Architecture](#architecture)
4. [Phase Specifications](#phase-specifications)
5. [Data Structures](#data-structures)
6. [Injection System](#injection-system)
7. [Token Extraction](#token-extraction)
8. [Open Issues](#open-issues)
9. [Implementation Plan](#implementation-plan)

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

**Questions:**
- Do we need to capture every validation error message?
- How do we know which input combinations produce different UI?
- Should we use predefined test values or detect field types?

**Proposed Solution:**
- Capture: empty, valid filled, each type of validation error
- Use intelligent test data based on field type (email → test@test.com, phone → 555-0100)
- Detect validation by checking for error classes/aria-invalid after blur

**Status:** 🔴 Not Started

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
