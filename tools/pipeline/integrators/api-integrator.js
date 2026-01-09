/**
 * API Mock Integrator
 *
 * Generates mock API server and client-side fetch interceptor:
 * - Express server for captured API responses
 * - WebSocket mock server
 * - Client-side fetch/XHR interceptor for offline mode
 *
 * Part of V6 Reconstruction Integration
 */

/**
 * Generate Express mock server
 * @param {Object} data - api extraction data
 * @returns {string} Node.js server code
 */
export function generateMockServer(data) {
  if (!data) return '';

  const hasContent = (data.fetchRequests?.length > 0) ||
                     (data.xhrRequests?.length > 0) ||
                     (data.websocketConnections?.length > 0);

  if (!hasContent) return '';

  const lines = [];
  lines.push(`/**
 * Mock API Server
 * Generated from extracted API traffic
 * ${new Date().toISOString()}
 */

const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(\`[\${new Date().toISOString()}] \${req.method} \${req.path}\`);
  next();
});
`);

  // Group requests by URL pattern
  const routes = new Map();

  // Process fetch requests
  (data.fetchRequests || []).forEach(req => {
    const key = `${req.method || 'GET'}:${req.url}`;
    if (!routes.has(key)) {
      routes.set(key, {
        method: (req.method || 'GET').toLowerCase(),
        url: req.url,
        responses: [],
      });
    }
    if (req.response) {
      routes.get(key).responses.push(req.response);
    }
  });

  // Process XHR requests
  (data.xhrRequests || []).forEach(req => {
    const key = `${req.method || 'GET'}:${req.url}`;
    if (!routes.has(key)) {
      routes.set(key, {
        method: (req.method || 'GET').toLowerCase(),
        url: req.url,
        responses: [],
      });
    }
    if (req.response) {
      routes.get(key).responses.push(req.response);
    }
  });

  // Generate routes
  lines.push('// API Routes');
  lines.push('');

  routes.forEach((route, key) => {
    // Extract path from full URL
    let path;
    try {
      const url = new URL(route.url);
      path = url.pathname + url.search;
    } catch {
      path = route.url;
    }

    // Use first response as default
    const response = route.responses[0];

    lines.push(`// ${route.method.toUpperCase()} ${path}`);
    lines.push(`app.${route.method}('${path}', (req, res) => {`);

    if (response) {
      lines.push(`  res.status(${response.status || 200});`);

      if (response.headers) {
        Object.entries(response.headers).forEach(([key, value]) => {
          if (key.toLowerCase() !== 'content-length') {
            lines.push(`  res.set('${key}', '${value}');`);
          }
        });
      }

      if (response.body) {
        if (typeof response.body === 'object') {
          lines.push(`  res.json(${JSON.stringify(response.body, null, 2).split('\n').join('\n  ')});`);
        } else {
          lines.push(`  res.send(${JSON.stringify(response.body)});`);
        }
      } else {
        lines.push('  res.end();');
      }
    } else {
      lines.push('  res.status(200).json({ mock: true });');
    }

    lines.push('});');
    lines.push('');
  });

  // WebSocket server
  if (data.websocketConnections && data.websocketConnections.length > 0) {
    lines.push(`
// WebSocket Server
const WebSocket = require('ws');
const wss = new WebSocket.Server({ noServer: true });

const wsConnections = ${JSON.stringify(data.websocketConnections, null, 2)};

wss.on('connection', (ws, req) => {
  console.log('[WS] New connection:', req.url);

  // Find matching connection config
  const config = wsConnections.find(c => req.url.includes(c.url));

  // Send captured messages
  if (config?.messages) {
    config.messages.forEach((msg, i) => {
      setTimeout(() => {
        ws.send(JSON.stringify(msg.data));
      }, i * 100);
    });
  }

  ws.on('message', (data) => {
    console.log('[WS] Received:', data.toString());
  });

  ws.on('close', () => {
    console.log('[WS] Connection closed');
  });
});

// Upgrade HTTP to WebSocket
const server = app.listen(3001, () => {
  console.log('[Mock API] Running on http://localhost:3001');
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});
`);
  } else {
    lines.push(`
// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(\`[Mock API] Running on http://localhost:\${PORT}\`);
});
`);
  }

  return lines.join('\n');
}

/**
 * Generate client-side fetch interceptor for offline mode
 * @param {Object} data - api extraction data
 * @returns {string} JavaScript code
 */
export function generateFetchInterceptor(data) {
  if (!data) return '';

  const hasContent = (data.fetchRequests?.length > 0) ||
                     (data.xhrRequests?.length > 0);

  if (!hasContent) return '';

  const lines = [];
  lines.push('// API Fetch Interceptor (for offline mode)');
  lines.push('');

  // Build response map
  const responseMap = new Map();

  (data.fetchRequests || []).forEach(req => {
    const key = `${req.method || 'GET'}:${req.url}`;
    if (req.response && !responseMap.has(key)) {
      responseMap.set(key, req.response);
    }
  });

  (data.xhrRequests || []).forEach(req => {
    const key = `${req.method || 'GET'}:${req.url}`;
    if (req.response && !responseMap.has(key)) {
      responseMap.set(key, req.response);
    }
  });

  lines.push('const mockResponses = new Map([');
  responseMap.forEach((response, key) => {
    lines.push(`  ['${key}', {`);
    lines.push(`    status: ${response.status || 200},`);
    if (response.body) {
      lines.push(`    body: ${JSON.stringify(response.body)},`);
    }
    lines.push('  }],');
  });
  lines.push(']);');
  lines.push('');

  // Intercept fetch
  lines.push('// Override fetch');
  lines.push('const originalFetch = window.fetch;');
  lines.push('window.fetch = async function(url, options = {}) {');
  lines.push('  const method = (options.method || "GET").toUpperCase();');
  lines.push('  const key = `${method}:${url}`;');
  lines.push('');
  lines.push('  // Check for mock response');
  lines.push('  const mock = mockResponses.get(key);');
  lines.push('  if (mock) {');
  lines.push('    console.log("[Mock] Intercepted:", key);');
  lines.push('    return new Response(JSON.stringify(mock.body), {');
  lines.push('      status: mock.status,');
  lines.push('      headers: { "Content-Type": "application/json" }');
  lines.push('    });');
  lines.push('  }');
  lines.push('');
  lines.push('  // Fall through to real fetch');
  lines.push('  return originalFetch.apply(this, arguments);');
  lines.push('};');
  lines.push('');

  // Intercept XHR
  lines.push('// Override XMLHttpRequest');
  lines.push('const OriginalXHR = window.XMLHttpRequest;');
  lines.push('window.XMLHttpRequest = function() {');
  lines.push('  const xhr = new OriginalXHR();');
  lines.push('  const originalOpen = xhr.open;');
  lines.push('  let method, url;');
  lines.push('');
  lines.push('  xhr.open = function(m, u, ...args) {');
  lines.push('    method = m.toUpperCase();');
  lines.push('    url = u;');
  lines.push('    return originalOpen.apply(this, [m, u, ...args]);');
  lines.push('  };');
  lines.push('');
  lines.push('  const originalSend = xhr.send;');
  lines.push('  xhr.send = function(body) {');
  lines.push('    const key = `${method}:${url}`;');
  lines.push('    const mock = mockResponses.get(key);');
  lines.push('');
  lines.push('    if (mock) {');
  lines.push('      console.log("[Mock XHR] Intercepted:", key);');
  lines.push('      Object.defineProperty(xhr, "status", { value: mock.status });');
  lines.push('      Object.defineProperty(xhr, "responseText", { value: JSON.stringify(mock.body) });');
  lines.push('      Object.defineProperty(xhr, "response", { value: mock.body });');
  lines.push('      setTimeout(() => {');
  lines.push('        xhr.onreadystatechange?.();');
  lines.push('        xhr.onload?.();');
  lines.push('      }, 10);');
  lines.push('      return;');
  lines.push('    }');
  lines.push('');
  lines.push('    return originalSend.apply(this, arguments);');
  lines.push('  };');
  lines.push('');
  lines.push('  return xhr;');
  lines.push('};');

  return lines.join('\n');
}

/**
 * Generate service worker for offline caching
 * @param {Object} data - worker extraction data
 * @returns {string} Service worker code
 */
export function generateServiceWorker(data) {
  if (!data || !data.serviceWorkers || data.serviceWorkers.length === 0) return '';

  const lines = [];
  lines.push(`/**
 * Service Worker (from extraction)
 * ${new Date().toISOString()}
 */

const CACHE_NAME = 'v6-integration-cache-v1';

// URLs to cache
const urlsToCache = [
  '/',
  '/integrated.html',
  '/integrated.css',
  '/integrated.js',
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(urlsToCache);
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }
      return fetch(event.request);
    })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME)
                  .map((name) => caches.delete(name))
      );
    })
  );
});
`);

  // Include captured worker scripts
  if (data.workerScripts) {
    Object.entries(data.workerScripts).forEach(([url, script]) => {
      lines.push(`// Original worker from: ${url}`);
      lines.push('/*');
      // Handle both string and object formats
      const scriptContent = typeof script === 'string' ? script : (script?.content || JSON.stringify(script));
      lines.push((scriptContent || '').substring(0, 500) + '...');
      lines.push('*/');
      lines.push('');
    });
  }

  return lines.join('\n');
}

/**
 * Combine all API integration
 * @param {Object} extractionData - Full extraction results
 * @returns {Object} { mockServer, fetchInterceptor, serviceWorker }
 */
export function generateAllAPI(extractionData) {
  return {
    mockServer: generateMockServer(extractionData.api),
    fetchInterceptor: generateFetchInterceptor(extractionData.api),
    serviceWorker: generateServiceWorker(extractionData.workers),
  };
}

/**
 * Get statistics about API data
 * @param {Object} extractionData - Full extraction results
 * @returns {Object} Stats
 */
export function getAPIStats(extractionData) {
  const apiData = extractionData.api;
  const workerData = extractionData.workers;

  return {
    fetchRequests: apiData?.fetchRequests?.length || 0,
    xhrRequests: apiData?.xhrRequests?.length || 0,
    websocketConnections: apiData?.websocketConnections?.length || 0,
    serviceWorkers: workerData?.serviceWorkers?.length || 0,
    webWorkers: workerData?.workers?.length || 0,
  };
}

export default {
  generateMockServer,
  generateFetchInterceptor,
  generateServiceWorker,
  generateAllAPI,
  getAPIStats,
};
