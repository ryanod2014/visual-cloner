# Complete Webapp Extraction System - Technical Requirements

A comprehensive guide to extracting the full source code for any web application to run it locally.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Resource Types to Capture](#2-resource-types-to-capture)
3. [Network Interception](#3-network-interception)
4. [Chunk Discovery](#4-chunk-discovery)
5. [WebGL & Shader Capture](#5-webgl--shader-capture)
6. [State Triggering Methods](#6-state-triggering-methods)
7. [Authentication Handling](#7-authentication-handling)
8. [Domain Bypass & Patching](#8-domain-bypass--patching)
9. [Local Serving](#9-local-serving)
10. [Extraction Pipeline](#10-extraction-pipeline)

---

## 1. Overview

Extracting a modern web application requires capturing multiple layers:

| Layer | What to Capture | Why |
|-------|-----------------|-----|
| **Static Assets** | HTML, CSS, JS, Images, Fonts | Core UI rendering |
| **Dynamic Code** | Webpack chunks, lazy-loaded modules | Feature completeness |
| **Binary Data** | WASM, Workers, Service Workers | Performance-critical logic |
| **Graphics** | WebGL shaders, textures, uniforms | Canvas/3D rendering |
| **State** | Application state, API responses | Data-driven UI |
| **Auth** | Cookies, tokens, session data | Access gated content |

---

## 2. Resource Types to Capture

### Code & Markup
| Type | Extensions | Content-Types |
|------|------------|---------------|
| HTML | `.html` | `text/html` |
| CSS | `.css` | `text/css` |
| JavaScript | `.js`, `.mjs` | `application/javascript`, `text/javascript` |
| TypeScript | `.ts`, `.tsx` | N/A (transpiled) |
| Source Maps | `.map` | `application/json` |
| WASM | `.wasm` | `application/wasm` |
| JSON | `.json` | `application/json` |

### Media
| Type | Extensions | Content-Types |
|------|------------|---------------|
| Images | `.png`, `.jpg`, `.webp`, `.svg`, `.gif`, `.ico` | `image/*` |
| Fonts | `.woff`, `.woff2`, `.ttf`, `.otf`, `.eot` | `font/*` |
| Audio | `.mp3`, `.wav`, `.ogg` | `audio/*` |
| Video | `.mp4`, `.webm` | `video/*` |

### Professional Formats (for apps like Photopea)
| Category | Formats |
|----------|---------|
| Adobe | PSD, AI, PDF, EPS |
| Camera RAW | CR2 (Canon), NEF (Nikon), ARW (Sony), DNG, RAF, ORF |
| Open Source | XCF (GIMP), SVG |
| Modern | HEIC, AVIF, JXL (JPEG-XL) |

---

## 3. Network Interception

### Primary Method: Response Listener

```javascript
const allResources = new Map();

page.on('response', async response => {
  const url = response.url();

  // Skip non-HTTP
  if (url.startsWith('data:') || url.startsWith('blob:')) return;

  // Skip duplicates
  if (allResources.has(url)) return;

  try {
    const body = await response.body();
    allResources.set(url, {
      url,
      contentType: response.headers()['content-type'] || '',
      body,
      size: body.length
    });
  } catch (e) {
    // Response body unavailable (redirects, etc.)
  }
});
```

### Track Failed Requests

```javascript
page.on('requestfailed', request => {
  failedRequests.push({
    url: request.url(),
    error: request.failure().errorText
  });
});
```

### Request Monitoring

```javascript
page.on('request', request => {
  allRequests.push({
    url: request.url(),
    method: request.method(),
    resourceType: request.resourceType()
  });
});
```

---

## 4. Chunk Discovery

Modern apps use code-splitting. Chunks must be discovered and fetched.

### Method 1: Webpack Manifest Parsing

```javascript
// Pattern: {0:"abc123",1:"def456",...}
const webpackManifest = content.match(/\{(?:\d+:"[a-f0-9]+",?)+\}/g) || [];

for (const manifest of webpackManifest) {
  const matches = manifest.match(/(\d+):"([a-f0-9]+)"/g) || [];
  for (const m of matches) {
    const [, id, hash] = m.match(/(\d+):"([a-f0-9]+)"/);
    chunkUrls.add(origin + basePath + id + '.' + hash + '.js');
    chunkUrls.add(origin + basePath + hash + '.js');
    chunkUrls.add(origin + basePath + id + '.js');
  }
}
```

### Method 2: Quoted Filename Patterns

```javascript
const patterns = [
  /"([a-f0-9]{8,})\.js"/gi,       // hash.js
  /"(chunk-[^"]+\.js)"/gi,        // chunk-xxx.js
  /"([^"]+\.chunk\.js)"/gi,       // xxx.chunk.js
  /"(vendor[^"]*\.js)"/gi,        // vendor.js
  /"(main[^"]*\.js)"/gi,          // main.js
  /["']([^"']+\.wasm)["']/gi,     // app.wasm
];
```

### Method 3: Brute Force Discovery

```javascript
const basePaths = ['/', '/js/', '/code/', '/assets/', '/chunks/', '/dist/', '/static/'];
const patterns = ['{i}.js', 'chunk-{i}.js', '{i}.chunk.js', 'vendor-{i}.js'];

for (const basePath of basePaths) {
  for (let i = 0; i < 500; i++) {
    for (const pattern of patterns) {
      chunkUrls.add(origin + basePath + pattern.replace('{i}', i));
    }
  }
}
```

### Method 4: Preload/Prefetch Discovery

```javascript
document.querySelectorAll('link[rel="preload"], link[rel="prefetch"], link[rel="modulepreload"]')
  .forEach(link => {
    const href = link.getAttribute('href');
    if (href) chunkUrls.add(new URL(href, origin).href);
  });
```

---

## 5. WebGL & Shader Capture

For graphics-heavy apps (Photopea, Figma, etc.), intercept WebGL calls.

### Hook Shader Source

```javascript
const originalShaderSource = gl.shaderSource.bind(gl);
gl.shaderSource = function(shader, source) {
  window.__webglCaptured.shaders.push({
    type: gl.getShaderParameter(shader, gl.SHADER_TYPE) === gl.VERTEX_SHADER
      ? 'vertex' : 'fragment',
    source: source
  });
  return originalShaderSource(shader, source);
};
```

### WebGL Methods to Hook (40+)

**Drawing:** `drawArrays`, `drawElements`, `drawArraysInstanced`, `drawElementsInstanced`

**Shaders:** `createShader`, `shaderSource`, `compileShader`, `attachShader`, `linkProgram`, `useProgram`

**Textures:** `createTexture`, `bindTexture`, `texImage2D`, `texParameteri`, `generateMipmap`

**Buffers:** `createBuffer`, `bindBuffer`, `bufferData`, `bufferSubData`

**Uniforms:** `uniform1f/2f/3f/4f`, `uniform1i/2i/3i/4i`, `uniformMatrix*fv`, `getUniformLocation`

**State:** `viewport`, `enable`, `disable`, `blendFunc`, `depthFunc`, `cullFace`

**Reading:** `readPixels`, `getParameter`

### Capture Canvas Pixels

```javascript
// Method 1: WebGL readPixels
const pixels = new Uint8Array(width * height * 4);
gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

// Method 2: Canvas 2D fallback
const tempCanvas = document.createElement('canvas');
const ctx = tempCanvas.getContext('2d');
ctx.drawImage(glCanvas, 0, 0);
const imageData = ctx.getImageData(0, 0, width, height);
```

---

## 6. State Triggering Methods

Lazy-loaded resources require user interaction simulation.

### Keyboard Shortcuts

```javascript
// Single keys
const keys = ['a'-'z', 'F1'-'F12', 'Escape', 'Enter', 'Space', 'Tab'];

// Modifier combos
const combos = [
  'Control+a' to 'Control+z',
  'Control+Shift+a' to 'Control+Shift+z',
  'Alt+a' to 'Alt+z',
];

// Dialog triggers
const dialogs = [
  'Control+o',     // Open
  'Control+n',     // New
  'Control+Shift+s', // Save As
  'Control+p',     // Print/Preferences
];

for (const key of keys) {
  await page.keyboard.press(key);
  await page.waitForTimeout(100);
}
```

### Menu Clicking (Positional)

```javascript
// Horizontal menu bar
const menuX = [30, 80, 140, 200, 260, 320, 380, 440, 500, 560];
for (const x of menuX) {
  await page.mouse.click(x, 12);  // Menu bar Y
  await page.waitForTimeout(300);

  // Hover down menu items
  for (let y = 40; y < 400; y += 20) {
    await page.mouse.move(x + 50, y);
    await page.waitForTimeout(50);
  }

  await page.keyboard.press('Escape');
}

// Vertical toolbar (with long-press for sub-tools)
for (let y = 60; y < 600; y += 25) {
  await page.mouse.move(25, y);
  await page.mouse.down();
  await page.waitForTimeout(300);  // Long press
  await page.mouse.up();
  await page.keyboard.press('Escape');
}
```

### Viewport Resizing

```javascript
const viewports = [
  { width: 800, height: 600 },    // Desktop min
  { width: 1920, height: 1080 },  // Full HD
  { width: 2560, height: 1440 },  // 4K
  { width: 375, height: 812 },    // Mobile
  { width: 768, height: 1024 },   // Tablet
];

for (const vp of viewports) {
  await page.setViewportSize(vp);
  await page.waitForTimeout(300);
}
```

### Scrolling

```javascript
const height = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y < height; y += 500) {
  await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
  await page.waitForTimeout(100);
}
```

### File Drop Simulation

```javascript
await page.evaluate((format) => {
  const file = new File([new ArrayBuffer(100)], `test.${format}`, {
    type: MIME_TYPES[format]
  });

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  const dropEvent = new DragEvent('drop', {
    dataTransfer,
    bubbles: true,
    cancelable: true
  });

  document.body.dispatchEvent(dropEvent);
}, format);
```

---

## 7. Authentication Handling

### Cookie Capture & Injection

```javascript
// CAPTURE: After manual login
const cookies = await context.cookies();
fs.writeFileSync('cookies.json', JSON.stringify(cookies, null, 2));

// INJECT: Before extraction
const cookies = JSON.parse(fs.readFileSync('cookies.json', 'utf-8'));
await context.addCookies(cookies);  // BEFORE page.goto()
```

### Session Bundle (Cookies + Storage)

```javascript
// CAPTURE
const session = {
  cookies: await context.cookies(),
  localStorage: await page.evaluate(() => ({ ...localStorage })),
  sessionStorage: await page.evaluate(() => ({ ...sessionStorage }))
};

// RESTORE
await context.addCookies(session.cookies);
await page.goto(url);
await page.evaluate((data) => {
  Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
}, session.localStorage);
await page.reload();
```

### Firebase Auth Mocking

```javascript
const mockUser = {
  uid: 'mock_user_' + Date.now(),
  email: 'demo@example.com',
  emailVerified: true,
  getIdToken: () => Promise.resolve(mockToken),
  getIdTokenResult: () => Promise.resolve({
    token: mockToken,
    claims: { email_verified: true }
  })
};

const mockAuth = {
  get currentUser() { return mockUser; },
  onAuthStateChanged: (callback) => {
    setTimeout(() => callback(mockUser), 0);
    return () => {};
  }
};

window.firebase.auth = () => mockAuth;
Object.defineProperty(window, 'firebase', { writable: false });
```

### Vuex State Interception

```javascript
const authProxy = new Proxy({
  authenticated: true,
  isAuthenticated: true,
  token: 'mock_token',
  user: { id: 'mock_user', role: 'admin' }
}, {
  get: (target, prop) => {
    if (prop in target) return target[prop];
    if (String(prop).includes('auth')) return true;
    if (String(prop).includes('token')) return 'mock_' + prop;
    return true;
  }
});

Object.defineProperty(store.state, 'auth', {
  get: () => authProxy,
  configurable: true
});
```

### Router Guard Bypass

```javascript
// Clear all beforeEach guards
router.beforeHooks = [];
router.beforeResolveHooks = [];

// Patch router.push to re-clear
const originalPush = router.push.bind(router);
router.push = async function(to) {
  this.beforeHooks = [];
  return originalPush(to);
};
```

### Login Redirect Blocking

```javascript
// Block location.replace
const originalReplace = window.location.replace.bind(window.location);
window.location.replace = function(url) {
  if (url.includes('/login')) return;
  return originalReplace(url);
};

// Block Vue router
const originalPush = router.push;
router.push = function(location) {
  const path = typeof location === 'string' ? location : location.path;
  if (path?.includes('login')) return Promise.resolve();
  return originalPush.call(this, location);
};
```

---

## 8. Domain Bypass & Patching

### Pattern Library (14 Common Patterns)

```javascript
const BYPASS_PATTERNS = [
  // Hostname ternary
  {
    pattern: /var\s+(\w+)\s*=\s*window\.location\.hostname\.[a-zA-Z]+\([^)]+\)\s*\?[^;]+:\s*0/g,
    replace: (match, varName) => `var ${varName}=1`
  },

  // Hostname equals
  {
    pattern: /(?:window\.)?location\.hostname\s*===?\s*["'][^"']+["']/g,
    replace: 'true'
  },

  // Origin check
  {
    pattern: /(?:window\.)?location\.origin\s*!==?\s*["'][^"']+["']/g,
    replace: 'false'
  },

  // Navigator online
  {
    pattern: /if\s*\(\s*!navigator\.onLine\s*\)/g,
    replace: 'if(false)'
  },

  // License functions
  {
    pattern: /(\w+)\.(adQ|isDomainValid|checkLicense)\s*=\s*function[^}]+\}/g,
    replace: (match, obj, fn) => `${obj}.${fn}=function(){return 1}`
  },

  // Throw domain error
  {
    pattern: /throw\s+new\s+Error\s*\(\s*["'][^"']*domain[^"']*["']\s*\)/gi,
    replace: '/* bypassed */'
  }
];
```

### Function Body Replacement

```javascript
// Find: J.adQ=function(){...complex logic...}
// Replace: J.adQ=function(){return 1;}

const startPattern = /J\.adQ\s*=\s*function\s*\(\s*\)\s*\{/;
const match = content.match(startPattern);

if (match) {
  const startIndex = match.index + match[0].length;
  let braceCount = 1, endIndex = startIndex;

  while (braceCount > 0 && endIndex < content.length) {
    if (content[endIndex] === '{') braceCount++;
    if (content[endIndex] === '}') braceCount--;
    endIndex++;
  }

  content = content.substring(0, match.index) +
            'J.adQ=function(){return 1;};' +
            content.substring(endIndex);
}
```

### Feature Flag Mutation

```javascript
// Photopea uses: lm==0 for free mode, lm!=0 for paid features
// Replace with impossible values to bypass checks

content = content.replace(/lm==0/g, 'lm==99');  // Never true
content = content.replace(/lm!=0/g, 'lm!=99');  // Always true
```

---

## 9. Local Serving

### URL Mapping

```javascript
const urlMap = JSON.parse(fs.readFileSync('url-map.json', 'utf-8'));

// Build lookup by pathname
const lookup = {};
for (const [url, info] of Object.entries(urlMap)) {
  const pathname = new URL(url).pathname;
  lookup[pathname] = info;
  lookup[pathname.split('?')[0]] = info;  // Without query string
}
```

### HTTP Server

```javascript
http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*'
    });
    return res.end();
  }

  const reqPath = req.url.split('?')[0];

  // HTML entrypoint
  if (reqPath === '/' || reqPath === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(indexHtml);
  }

  // Patched JS (served from memory)
  if (patchedFiles[reqPath]) {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    return res.end(patchedFiles[reqPath]);
  }

  // Cached resources
  const cached = lookup[reqPath] || lookup[req.url];
  if (cached && fs.existsSync(path.join(CACHE_DIR, cached.localFile))) {
    res.writeHead(200, { 'Content-Type': cached.contentType });
    return fs.createReadStream(path.join(CACHE_DIR, cached.localFile)).pipe(res);
  }

  // SPA fallback
  if (!reqPath.includes('.')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(indexHtml);
  }

  // 404
  console.log('[MISS]', req.url);
  res.writeHead(404);
  res.end('Not captured');
}).listen(PORT);
```

### MIME Types

```javascript
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};
```

---

## 10. Extraction Pipeline

### Complete 10-Phase Process

```
PHASE 1: INITIALIZATION
├── Launch browser (headless: false for auth)
├── Configure context (viewport, userAgent, bypassCSP: true)
├── Set up response listener
└── Inject cookies/session if available

PHASE 2: PAGE LOAD
├── Navigate with waitUntil: 'networkidle'
├── Save original HTML before interactions
├── Wait for initial resources
└── Track resource count baseline

PHASE 3: AUTHENTICATION (if needed)
├── Detect login page
├── Wait for manual login (2 min timeout)
├── OR inject cookies and reload
├── Verify auth success
└── Capture post-auth cookies

PHASE 4: CHUNK DISCOVERY
├── Parse webpack manifests from loaded JS
├── Extract quoted filenames
├── Check preload/prefetch links
├── Generate brute-force URLs
└── Deduplicate and queue

PHASE 5: CHUNK FETCHING
├── Batch fetch (30 parallel)
├── Use in-page fetch() for CORS
├── Handle errors gracefully
└── Add to resource map

PHASE 6: STATE TRIGGERING
├── Keyboard shortcuts (single, combo, sequence)
├── Menu/toolbar clicking (positional)
├── Viewport resizing (5 breakpoints)
├── Full-page scrolling
└── File format testing (drag-drop)

PHASE 7: WEBGL CAPTURE (if applicable)
├── Hook shader source methods
├── Capture uniforms and textures
├── Track draw calls
├── Extract canvas pixels
└── Save shaders.json

PHASE 8: DOMAIN PATCHING
├── Load main application JS
├── Apply bypass patterns
├── Replace domain check functions
├── Mutate feature flags
└── Cache patched content

PHASE 9: SAVE EXTRACTION
├── Write all resources to cache/
├── Generate url-map.json
├── Save original HTML
├── Generate serve.js
└── Save analysis reports

PHASE 10: VALIDATION
├── Start local server
├── Compare online vs offline
├── Count matching elements
├── Track console errors
├── Calculate completeness score
```

### File Structure

```
output/<domain>-<timestamp>/
├── cache/                    # All resources
│   ├── r0.js
│   ├── r1.css
│   ├── r2.wasm
│   └── ...
├── url-map.json              # URL -> local file mapping
├── index.html                # Original landing page
├── serve.js                  # Auto-generated server
├── analysis.json             # Feature/API discovery
├── shaders.json              # WebGL shaders (if applicable)
└── validation-report.json    # Completeness metrics
```

---

## Quick Reference: Essential Tools

| Tool | Purpose | Key Files |
|------|---------|-----------|
| **v7/extract.js** | Unified extraction with WebGL | Main extractor |
| **v7/auto-login.js** | Auth detection + extraction | Login handling |
| **v7/with-cookies.js** | Cookie-based extraction | Session restore |
| **v7/exhaust.js** | State exhaustion | Feature triggering |
| **v7/chunk-discovery.js** | Lazy chunk finding | Manifest parsing |
| **v7/domain-bypass.js** | Patch domain checks | 14 patterns |
| **v7/serve-generator.js** | Generate local server | Offline serving |
| **v7/validator.js** | Compare online/offline | Completeness scoring |

---

## Success Criteria Checklist

- [ ] All network responses captured
- [ ] Webpack chunks discovered and fetched
- [ ] WebGL shaders extracted (if applicable)
- [ ] All menu items triggered
- [ ] All keyboard shortcuts tested
- [ ] All viewports tested
- [ ] Domain checks bypassed
- [ ] Auth mocked/injected
- [ ] Local server serves all resources
- [ ] No critical console errors
- [ ] UI renders correctly offline
- [ ] Features work without network

---

*Generated from analysis of visual-cloner extraction system - January 2025*
