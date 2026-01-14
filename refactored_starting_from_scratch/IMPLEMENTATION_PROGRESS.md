# Implementation Progress Tracker

## Goal
Build a generic, modular extraction system that works across ANY webapp (not just Photopea).

## Status: IN PROGRESS

---

## Phase 1: Core Infrastructure

| File | Status | Agent | Notes |
|------|--------|-------|-------|
| `core/index.js` | ⏳ PENDING | - | Re-exports |
| `core/pipeline.js` | ⏳ PENDING | - | Phase orchestrator |
| `core/state.js` | ⏳ PENDING | - | Checkpoint/resume |
| `core/logger.js` | ⏳ PENDING | - | Structured logging |
| `core/errors.js` | ⏳ PENDING | - | Custom error types |
| `core/config.js` | ⏳ PENDING | - | Configuration |

## Phase 2: Utility Functions

| File | Status | Agent | Notes |
|------|--------|-------|-------|
| `utils/index.js` | ⏳ PENDING | - | Re-exports |
| `utils/url.js` | ⏳ PENDING | - | URL manipulation |
| `utils/file.js` | ⏳ PENDING | - | File system helpers |
| `utils/async.js` | ⏳ PENDING | - | Async utilities |
| `utils/hash.js` | ⏳ PENDING | - | Content hashing |

## Phase 3: Detection Strategies

| File | Status | Agent | Notes |
|------|--------|-------|-------|
| `strategies/detection/index.js` | ⏳ PENDING | - | Orchestrator |
| `strategies/detection/base.js` | ⏳ PENDING | - | Base class |
| `strategies/detection/webpack.js` | ⏳ PENDING | - | Webpack detection |
| `strategies/detection/nextjs.js` | ⏳ PENDING | - | Next.js detection |
| `strategies/detection/vite.js` | ⏳ PENDING | - | Vite detection |
| `strategies/detection/nuxt.js` | ⏳ PENDING | - | Nuxt detection |
| `strategies/detection/remix.js` | ⏳ PENDING | - | Remix detection |
| `strategies/detection/angular.js` | ⏳ PENDING | - | Angular detection |
| `strategies/detection/parcel.js` | ⏳ PENDING | - | Parcel detection |
| `strategies/detection/static.js` | ⏳ PENDING | - | Static fallback |

## Phase 4: Capture Strategies

| File | Status | Agent | Notes |
|------|--------|-------|-------|
| `strategies/capture/index.js` | ⏳ PENDING | - | Orchestrator |
| `strategies/capture/cdp.js` | ⏳ PENDING | - | CDP Fetch domain |
| `strategies/capture/playwright.js` | ⏳ PENDING | - | Playwright fallback |

## Phase 5: Discovery Strategies

| File | Status | Agent | Notes |
|------|--------|-------|-------|
| `strategies/discovery/index.js` | ⏳ PENDING | - | Orchestrator |
| `strategies/discovery/base.js` | ⏳ PENDING | - | Base class |
| `strategies/discovery/webpack.js` | ⏳ PENDING | - | Parse __webpack_require__.u |
| `strategies/discovery/nextjs.js` | ⏳ PENDING | - | Parse _buildManifest.js |
| `strategies/discovery/vite.js` | ⏳ PENDING | - | Parse manifest.json |
| `strategies/discovery/nuxt.js` | ⏳ PENDING | - | Parse builds/latest.json |
| `strategies/discovery/remix.js` | ⏳ PENDING | - | Parse __remixManifest |
| `strategies/discovery/angular.js` | ⏳ PENDING | - | Parse stats.json |
| `strategies/discovery/fallback.js` | ⏳ PENDING | - | String extraction + brute force |

## Phase 6: Trigger Strategies

| File | Status | Agent | Notes |
|------|--------|-------|-------|
| `strategies/triggers/index.js` | ⏳ PENDING | - | Orchestrator |
| `strategies/triggers/base.js` | ⏳ PENDING | - | Base class |
| `strategies/triggers/scroll.js` | ⏳ PENDING | - | Scroll to bottom |
| `strategies/triggers/click.js` | ⏳ PENDING | - | Click interactive |
| `strategies/triggers/viewport.js` | ⏳ PENDING | - | Resize viewport |
| `strategies/triggers/keyboard.js` | ⏳ PENDING | - | Test shortcuts |
| `strategies/triggers/navigation.js` | ⏳ PENDING | - | Navigate routes |

## Phase 7: Patcher Strategies

| File | Status | Agent | Notes |
|------|--------|-------|-------|
| `strategies/patchers/index.js` | ⏳ PENDING | - | Orchestrator |
| `strategies/patchers/base.js` | ⏳ PENDING | - | Base class |
| `strategies/patchers/domain-check.js` | ⏳ PENDING | - | window.location patterns |
| `strategies/patchers/license-check.js` | ⏳ PENDING | - | License bypass |
| `strategies/patchers/analytics.js` | ⏳ PENDING | - | Remove tracking |

## Phase 8: Pipeline Phases

| File | Status | Agent | Notes |
|------|--------|-------|-------|
| `phases/index.js` | ⏳ PENDING | - | Phase registry |
| `phases/01-detect.js` | ⏳ PENDING | - | Bundler detection |
| `phases/02-capture.js` | ⏳ PENDING | - | Network capture |
| `phases/03-discover.js` | ⏳ PENDING | - | URL discovery |
| `phases/04-trigger.js` | ⏳ PENDING | - | Lazy-load triggers |
| `phases/05-patch.js` | ⏳ PENDING | - | Domain bypass |
| `phases/06-assemble.js` | ⏳ PENDING | - | Output generation |
| `phases/07-validate.js` | ⏳ PENDING | - | Completeness check |

## Phase 9: App Plugins

| File | Status | Agent | Notes |
|------|--------|-------|-------|
| `apps/index.js` | ⏳ PENDING | - | Plugin registry |
| `apps/base.js` | ⏳ PENDING | - | Base plugin class |
| `apps/photopea.js` | ⏳ PENDING | - | Photopea overrides |
| `apps/_template.js` | ⏳ PENDING | - | Template for new apps |

## Phase 10: Server Generation

| File | Status | Agent | Notes |
|------|--------|-------|-------|
| `server/index.js` | ⏳ PENDING | - | Server generator |
| `server/template.js` | ⏳ PENDING | - | serve.js template |
| `server/router.js` | ⏳ PENDING | - | URL mapping |
| `server/mocks/index.js` | ⏳ PENDING | - | Mock registry |
| `server/mocks/api.js` | ⏳ PENDING | - | API mock |
| `server/mocks/auth.js` | ⏳ PENDING | - | Auth bypass |
| `server/mocks/analytics.js` | ⏳ PENDING | - | Analytics stub |

## Phase 11: Debug Tools

| File | Status | Agent | Notes |
|------|--------|-------|-------|
| `debug/index.js` | ⏳ PENDING | - | Debug utilities |
| `debug/reporter.js` | ⏳ PENDING | - | Generate DEBUG.md |
| `debug/missing.js` | ⏳ PENDING | - | Find missing resources |
| `debug/diff.js` | ⏳ PENDING | - | Compare online vs offline |
| `debug/network-log.js` | ⏳ PENDING | - | Request logger |

## Phase 12: Entry Point

| File | Status | Agent | Notes |
|------|--------|-------|-------|
| `extract.js` | ⏳ PENDING | - | CLI entry point |
| `package.json` | ⏳ PENDING | - | Dependencies |

---

## Validation Checklist

- [ ] All files created
- [ ] No syntax errors (npm run lint)
- [ ] Core imports work
- [ ] Detection strategies registered
- [ ] Discovery strategies registered
- [ ] Trigger strategies registered
- [ ] Patcher strategies registered
- [ ] Phases registered and ordered
- [ ] CLI runs without crash
- [ ] Extract Photopea successfully
- [ ] Extract Excalidraw successfully (different bundler)

---

## Interface Contracts

### BaseDetector
```javascript
class BaseDetector {
  name = 'base';
  canDetect(page, html) {} // Returns: boolean
  async detect(page, html) {} // Returns: { bundler, version, confidence, metadata }
}
```

### BaseDiscoverer
```javascript
class BaseDiscoverer {
  bundler = 'base';
  canDiscover(detection) {} // Returns: boolean
  async discover(resources, origin, page) {} // Returns: Set<urls>
}
```

### BaseTrigger
```javascript
class BaseTrigger {
  name = 'base';
  async trigger(page, logger) {} // Returns: number (resources loaded)
}
```

### BasePatcher
```javascript
class BasePatcher {
  name = 'base';
  shouldPatch(url, content) {} // Returns: boolean
  patch(content, url) {} // Returns: string (patched content)
}
```

### BaseAppPlugin
```javascript
class BaseAppPlugin {
  name = 'base';
  urlPattern = /example\.com/;

  matches(url) {} // Returns: boolean
  getDetector() {} // Returns: BaseDetector or null
  getDiscoverer() {} // Returns: BaseDiscoverer or null
  getTriggers() {} // Returns: BaseTrigger[]
  getPatchers() {} // Returns: BasePatcher[]
}
```

### Phase Interface
```javascript
class Phase {
  name = 'phase-name';
  description = 'What this phase does';

  async execute(context) {} // Returns: result object
}
```

### Context Object (passed through pipeline)
```javascript
{
  url: string,              // Target URL
  origin: string,           // URL origin
  config: object,           // User configuration
  browser: Browser,         // Playwright browser
  page: Page,               // Playwright page
  resources: Map,           // URL -> {body, contentType, size}
  detection: object,        // Result from detect phase
  appPlugin: BaseAppPlugin, // Matched app plugin or null
  outputDir: string,        // Output directory path
  logger: Logger,           // Logging instance
  state: State,             // Checkpoint state
}
```

---

## Last Updated
- Date: 2026-01-14
- Status: Starting implementation
