/**
 * API Recorder & Mock Server Generator
 *
 * The closest we can get to capturing "server logic":
 *
 * 1. RECORD all network traffic:
 *    - REST API calls (fetch, XHR)
 *    - GraphQL queries/mutations
 *    - WebSocket messages
 *    - Server-Sent Events
 *
 * 2. INFER API contracts:
 *    - Request/response schemas
 *    - URL patterns and parameters
 *    - Authentication headers
 *    - Error response patterns
 *
 * 3. GENERATE mock server:
 *    - Express.js server code
 *    - Response fixtures
 *    - Request matching logic
 *    - Dynamic response templates
 *
 * 4. GENERATE documentation:
 *    - OpenAPI/Swagger spec
 *    - Endpoint documentation
 */

export const apiRecorder = {
  name: 'api-recorder',

  getInjectionScript() {
    return `
(function() {
  if (window.__apiRecorderInstalled) return;
  window.__apiRecorderInstalled = true;

  window.__apiRecorded = {
    requests: [],
    websockets: [],
    eventSources: [],
    graphql: [],
  };

  let requestIdCounter = 0;

  // ============================================
  // INTERCEPT FETCH
  // ============================================

  const originalFetch = window.fetch;
  window.fetch = async function(input, init = {}) {
    const requestId = requestIdCounter++;
    const url = typeof input === 'string' ? input : input.url;
    const method = init.method || (input.method) || 'GET';
    const headers = init.headers || input.headers || {};

    // Capture request
    const request = {
      id: requestId,
      type: 'fetch',
      url,
      method: method.toUpperCase(),
      headers: serializeHeaders(headers),
      body: await serializeBody(init.body),
      timestamp: Date.now(),
    };

    // Detect GraphQL
    if (url.includes('graphql') || (request.body?.query)) {
      request.isGraphQL = true;
      if (request.body?.query) {
        request.graphql = {
          query: request.body.query,
          operationName: request.body.operationName,
          variables: request.body.variables,
        };
      }
    }

    try {
      const response = await originalFetch(input, init);

      // Clone response to read body without consuming it
      const clone = response.clone();
      let responseBody;

      try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          responseBody = await clone.json();
        } else if (contentType.includes('text')) {
          responseBody = await clone.text();
        } else {
          responseBody = { __binary: true, contentType };
        }
      } catch (e) {
        responseBody = { __parseError: e.message };
      }

      request.response = {
        status: response.status,
        statusText: response.statusText,
        headers: serializeHeaders(response.headers),
        body: responseBody,
        timing: Date.now() - request.timestamp,
      };

      // Save GraphQL responses separately
      if (request.isGraphQL) {
        window.__apiRecorded.graphql.push({
          ...request,
          response: request.response,
        });
      }

      window.__apiRecorded.requests.push(request);

      return response;
    } catch (error) {
      request.error = {
        message: error.message,
        name: error.name,
      };
      window.__apiRecorded.requests.push(request);
      throw error;
    }
  };

  // ============================================
  // INTERCEPT XMLHttpRequest
  // ============================================

  const OriginalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new OriginalXHR();
    const requestId = requestIdCounter++;

    let requestData = {
      id: requestId,
      type: 'xhr',
      method: 'GET',
      url: '',
      headers: {},
      timestamp: null,
    };

    // Intercept open
    const originalOpen = xhr.open.bind(xhr);
    xhr.open = function(method, url, ...args) {
      requestData.method = method.toUpperCase();
      requestData.url = url;
      return originalOpen(method, url, ...args);
    };

    // Intercept setRequestHeader
    const originalSetHeader = xhr.setRequestHeader.bind(xhr);
    xhr.setRequestHeader = function(name, value) {
      requestData.headers[name] = value;
      return originalSetHeader(name, value);
    };

    // Intercept send
    const originalSend = xhr.send.bind(xhr);
    xhr.send = function(body) {
      requestData.timestamp = Date.now();
      requestData.body = typeof body === 'string' ? tryParseJSON(body) : body;

      // Detect GraphQL
      if (requestData.url.includes('graphql') || requestData.body?.query) {
        requestData.isGraphQL = true;
      }

      return originalSend(body);
    };

    // Intercept response
    xhr.addEventListener('load', function() {
      let responseBody;
      try {
        responseBody = xhr.responseType === 'json' ? xhr.response : tryParseJSON(xhr.responseText);
      } catch (e) {
        responseBody = xhr.responseText;
      }

      requestData.response = {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: parseXHRHeaders(xhr.getAllResponseHeaders()),
        body: responseBody,
        timing: Date.now() - requestData.timestamp,
      };

      if (requestData.isGraphQL) {
        window.__apiRecorded.graphql.push(requestData);
      }

      window.__apiRecorded.requests.push(requestData);
    });

    xhr.addEventListener('error', function() {
      requestData.error = { message: 'Network error' };
      window.__apiRecorded.requests.push(requestData);
    });

    return xhr;
  };
  window.XMLHttpRequest.prototype = OriginalXHR.prototype;

  // ============================================
  // INTERCEPT WEBSOCKET
  // ============================================

  const OriginalWebSocket = window.WebSocket;
  let wsIdCounter = 0;

  window.WebSocket = function(url, protocols) {
    const wsId = wsIdCounter++;
    const ws = new OriginalWebSocket(url, protocols);

    const wsData = {
      id: wsId,
      url,
      protocols: protocols || [],
      connectedAt: Date.now(),
      messages: [],
    };

    ws.addEventListener('open', () => {
      wsData.status = 'connected';
    });

    ws.addEventListener('message', (event) => {
      wsData.messages.push({
        direction: 'received',
        data: tryParseJSON(event.data) || event.data,
        timestamp: Date.now(),
      });
    });

    ws.addEventListener('close', (event) => {
      wsData.status = 'closed';
      wsData.closeCode = event.code;
      wsData.closeReason = event.reason;
      wsData.closedAt = Date.now();
    });

    ws.addEventListener('error', () => {
      wsData.status = 'error';
    });

    // Intercept send
    const originalSend = ws.send.bind(ws);
    ws.send = function(data) {
      wsData.messages.push({
        direction: 'sent',
        data: tryParseJSON(data) || data,
        timestamp: Date.now(),
      });
      return originalSend(data);
    };

    window.__apiRecorded.websockets.push(wsData);

    return ws;
  };
  window.WebSocket.prototype = OriginalWebSocket.prototype;
  window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
  window.WebSocket.OPEN = OriginalWebSocket.OPEN;
  window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
  window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;

  // ============================================
  // INTERCEPT EventSource (SSE)
  // ============================================

  if (window.EventSource) {
    const OriginalEventSource = window.EventSource;
    let sseIdCounter = 0;

    window.EventSource = function(url, config) {
      const sseId = sseIdCounter++;
      const es = new OriginalEventSource(url, config);

      const sseData = {
        id: sseId,
        url,
        withCredentials: config?.withCredentials || false,
        connectedAt: Date.now(),
        events: [],
      };

      es.addEventListener('open', () => {
        sseData.status = 'connected';
      });

      es.addEventListener('message', (event) => {
        sseData.events.push({
          type: 'message',
          data: tryParseJSON(event.data) || event.data,
          lastEventId: event.lastEventId,
          timestamp: Date.now(),
        });
      });

      es.addEventListener('error', () => {
        sseData.status = 'error';
      });

      window.__apiRecorded.eventSources.push(sseData);

      return es;
    };
    window.EventSource.prototype = OriginalEventSource.prototype;
  }

  // ============================================
  // HELPERS
  // ============================================

  function serializeHeaders(headers) {
    const result = {};
    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        result[key] = value;
      });
    } else if (typeof headers === 'object') {
      Object.assign(result, headers);
    }
    return result;
  }

  async function serializeBody(body) {
    if (!body) return null;
    if (typeof body === 'string') return tryParseJSON(body);
    if (body instanceof FormData) {
      const result = {};
      body.forEach((value, key) => {
        result[key] = value instanceof File ? { __file: value.name, size: value.size } : value;
      });
      return { __formData: result };
    }
    if (body instanceof URLSearchParams) {
      return { __urlSearchParams: Object.fromEntries(body) };
    }
    if (body instanceof Blob) {
      return { __blob: true, size: body.size, type: body.type };
    }
    if (body instanceof ArrayBuffer) {
      return { __arrayBuffer: true, byteLength: body.byteLength };
    }
    return body;
  }

  function tryParseJSON(str) {
    if (typeof str !== 'string') return str;
    try {
      return JSON.parse(str);
    } catch (e) {
      return str;
    }
  }

  function parseXHRHeaders(headerStr) {
    const headers = {};
    if (!headerStr) return headers;
    headerStr.split('\\r\\n').forEach(line => {
      const [key, ...valueParts] = line.split(':');
      if (key) {
        headers[key.trim().toLowerCase()] = valueParts.join(':').trim();
      }
    });
    return headers;
  }

  // ============================================
  // PUBLIC API
  // ============================================

  window.__getRecordedAPI = function() {
    return window.__apiRecorded;
  };

  window.__clearRecordedAPI = function() {
    window.__apiRecorded = {
      requests: [],
      websockets: [],
      eventSources: [],
      graphql: [],
    };
  };

  console.log('[API Recorder] Installed');
})();
`;
  },

  /**
   * Extract recorded API data
   */
  async extractData(page) {
    return await page.evaluate(() => {
      if (window.__getRecordedAPI) {
        return window.__getRecordedAPI();
      }
      return { requests: [], websockets: [], eventSources: [], graphql: [] };
    });
  },

  /**
   * Also capture via Playwright's network interception
   * This catches requests made before injection
   */
  async setupPlaywrightInterception(page) {
    const requests = [];

    await page.route('**/*', async (route, request) => {
      const url = request.url();

      // Skip non-API requests
      if (!this.isAPIRequest(url, request)) {
        return route.continue();
      }

      const requestData = {
        url,
        method: request.method(),
        headers: request.headers(),
        postData: request.postData(),
        timestamp: Date.now(),
      };

      // Continue the request and capture response
      const response = await route.fetch();

      let body;
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json')) {
          body = await response.json();
        } else if (contentType.includes('text')) {
          body = await response.text();
        } else {
          body = { __binary: true };
        }
      } catch (e) {
        body = null;
      }

      requestData.response = {
        status: response.status(),
        headers: response.headers(),
        body,
      };

      requests.push(requestData);

      // Fulfill with the captured response
      await route.fulfill({
        status: response.status(),
        headers: response.headers(),
        body: await response.body(),
      });
    });

    return {
      getRequests: () => requests,
    };
  },

  /**
   * Check if a request is an API request
   */
  isAPIRequest(url, request) {
    // Check by URL pattern
    if (url.includes('/api/') || url.includes('/graphql') ||
        url.includes('/v1/') || url.includes('/v2/')) {
      return true;
    }

    // Check by content type
    const accept = request.headers()['accept'] || '';
    if (accept.includes('application/json')) {
      return true;
    }

    // Check method (POST/PUT/DELETE are usually API calls)
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method())) {
      return true;
    }

    return false;
  },

  /**
   * Generate Express.js mock server
   */
  generateMockServer(data) {
    const lines = [];

    lines.push(`/**`);
    lines.push(` * Auto-generated Mock Server`);
    lines.push(` * Generated: ${new Date().toISOString()}`);
    lines.push(` * Endpoints: ${data.requests.length}`);
    lines.push(` */`);
    lines.push('');
    lines.push(`const express = require('express');`);
    lines.push(`const cors = require('cors');`);
    lines.push(`const app = express();`);
    lines.push('');
    lines.push('app.use(cors());');
    lines.push('app.use(express.json());');
    lines.push('');

    // Group requests by URL pattern
    const endpoints = this.groupByEndpoint(data.requests);

    for (const [pattern, requests] of Object.entries(endpoints)) {
      const { method, pathPattern, examples } = requests;

      lines.push(`// ${pattern}`);
      lines.push(`// ${examples.length} recorded request(s)`);
      lines.push(`app.${method.toLowerCase()}('${pathPattern}', (req, res) => {`);

      if (examples.length === 1) {
        // Simple case: one example
        const example = examples[0];
        lines.push(`  res.status(${example.response?.status || 200}).json(${JSON.stringify(example.response?.body, null, 2).split('\n').join('\n  ')});`);
      } else {
        // Multiple examples: add request matching
        lines.push(`  // Match request to recorded examples`);
        lines.push(`  const requestBody = JSON.stringify(req.body);`);

        for (let i = 0; i < Math.min(examples.length, 5); i++) {
          const example = examples[i];
          if (example.body) {
            lines.push(`  if (requestBody === '${JSON.stringify(example.body)}') {`);
            lines.push(`    return res.status(${example.response?.status || 200}).json(${JSON.stringify(example.response?.body)});`);
            lines.push(`  }`);
          }
        }

        // Default response
        const defaultExample = examples[0];
        lines.push(`  // Default response`);
        lines.push(`  res.status(${defaultExample.response?.status || 200}).json(${JSON.stringify(defaultExample.response?.body, null, 2).split('\n').join('\n  ')});`);
      }

      lines.push('});');
      lines.push('');
    }

    // Handle GraphQL separately
    if (data.graphql.length > 0) {
      lines.push('// GraphQL endpoint');
      lines.push(`app.post('/graphql', (req, res) => {`);
      lines.push(`  const { query, operationName, variables } = req.body;`);
      lines.push('');

      // Group by operation name
      const gqlOps = {};
      for (const gql of data.graphql) {
        const opName = gql.graphql?.operationName || 'unknown';
        if (!gqlOps[opName]) {
          gqlOps[opName] = gql;
        }
      }

      for (const [opName, gql] of Object.entries(gqlOps)) {
        lines.push(`  if (operationName === '${opName}') {`);
        lines.push(`    return res.json(${JSON.stringify(gql.response?.body, null, 2).split('\n').join('\n    ')});`);
        lines.push(`  }`);
        lines.push('');
      }

      lines.push(`  res.status(400).json({ error: 'Unknown operation' });`);
      lines.push('});');
      lines.push('');
    }

    // WebSocket support
    if (data.websockets.length > 0) {
      lines.push('// WebSocket support (using ws library)');
      lines.push(`const WebSocket = require('ws');`);
      lines.push('const wss = new WebSocket.Server({ noServer: true });');
      lines.push('');
      lines.push('wss.on("connection", (ws) => {');
      lines.push('  console.log("WebSocket connected");');
      lines.push('');
      lines.push('  // Replay recorded messages');
      lines.push('  const messages = ' + JSON.stringify(data.websockets[0]?.messages?.filter(m => m.direction === 'received').slice(0, 10)) + ';');
      lines.push('  messages.forEach((msg, i) => {');
      lines.push('    setTimeout(() => ws.send(JSON.stringify(msg.data)), i * 1000);');
      lines.push('  });');
      lines.push('});');
      lines.push('');
    }

    lines.push('const PORT = process.env.PORT || 3001;');
    lines.push('const server = app.listen(PORT, () => {');
    lines.push('  console.log(`Mock server running on port ${PORT}`);');
    lines.push('});');

    if (data.websockets.length > 0) {
      lines.push('');
      lines.push('server.on("upgrade", (request, socket, head) => {');
      lines.push('  wss.handleUpgrade(request, socket, head, (ws) => {');
      lines.push('    wss.emit("connection", ws, request);');
      lines.push('  });');
      lines.push('});');
    }

    lines.push('');
    lines.push('module.exports = app;');

    return lines.join('\n');
  },

  /**
   * Group requests by endpoint pattern
   */
  groupByEndpoint(requests) {
    const endpoints = {};

    for (const req of requests) {
      if (!req.url || !req.response) continue;

      // Parse URL
      let urlPath;
      try {
        urlPath = new URL(req.url).pathname;
      } catch (e) {
        urlPath = req.url;
      }

      // Create pattern (replace IDs with :id)
      const pattern = urlPath
        .replace(/\/\d+/g, '/:id')
        .replace(/\/[0-9a-f-]{36}/gi, '/:uuid');

      const key = `${req.method} ${pattern}`;

      if (!endpoints[key]) {
        endpoints[key] = {
          method: req.method,
          pathPattern: pattern,
          examples: [],
        };
      }

      endpoints[key].examples.push(req);
    }

    return endpoints;
  },

  /**
   * Generate OpenAPI spec
   */
  generateOpenAPISpec(data) {
    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'Recorded API',
        version: '1.0.0',
        description: 'Auto-generated from recorded API traffic',
      },
      paths: {},
    };

    const endpoints = this.groupByEndpoint(data.requests);

    for (const [key, endpointData] of Object.entries(endpoints)) {
      const { method, pathPattern, examples } = endpointData;
      const example = examples[0];

      if (!spec.paths[pathPattern]) {
        spec.paths[pathPattern] = {};
      }

      spec.paths[pathPattern][method.toLowerCase()] = {
        summary: `${method} ${pathPattern}`,
        responses: {
          [example.response?.status || 200]: {
            description: 'Recorded response',
            content: {
              'application/json': {
                schema: this.inferSchema(example.response?.body),
                example: example.response?.body,
              },
            },
          },
        },
      };

      // Add request body for POST/PUT/PATCH
      if (['POST', 'PUT', 'PATCH'].includes(method) && example.body) {
        spec.paths[pathPattern][method.toLowerCase()].requestBody = {
          content: {
            'application/json': {
              schema: this.inferSchema(example.body),
              example: example.body,
            },
          },
        };
      }
    }

    return spec;
  },

  /**
   * Infer JSON schema from example
   */
  inferSchema(obj) {
    if (obj === null) return { type: 'null' };
    if (obj === undefined) return {};

    const type = typeof obj;

    if (type === 'string') return { type: 'string' };
    if (type === 'number') return { type: Number.isInteger(obj) ? 'integer' : 'number' };
    if (type === 'boolean') return { type: 'boolean' };

    if (Array.isArray(obj)) {
      return {
        type: 'array',
        items: obj.length > 0 ? this.inferSchema(obj[0]) : {},
      };
    }

    if (type === 'object') {
      const properties = {};
      for (const [key, value] of Object.entries(obj)) {
        properties[key] = this.inferSchema(value);
      }
      return {
        type: 'object',
        properties,
      };
    }

    return {};
  },

  /**
   * Generate fixture files
   */
  generateFixtures(data) {
    const fixtures = {};

    for (const req of data.requests) {
      if (!req.response?.body) continue;

      // Create fixture filename
      let urlPath;
      try {
        urlPath = new URL(req.url).pathname;
      } catch (e) {
        urlPath = req.url;
      }

      const filename = `${req.method.toLowerCase()}_${urlPath.replace(/\//g, '_').replace(/^_/, '')}.json`;

      fixtures[filename] = {
        request: {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: req.body,
        },
        response: req.response,
      };
    }

    return fixtures;
  }
};
