/**
 * Network Interceptor for Universal Webapp Extraction
 *
 * Intercepts all network requests (fetch, XMLHttpRequest, WebSocket) and routes them
 * to local extracted resources when available, with fallback to original network requests.
 *
 * Usage:
 *   <script src="network-interceptor.js"></script>
 *   <script>
 *     window.__URL_MAP__ = { '/api/data': '/extracted/api-data.json', ... };
 *     window.__EXTRACTED_CONFIG__ = { allowNetworkFallback: true, logRequests: true };
 *   </script>
 */

(function() {
  'use strict';

  // Configuration with defaults
  const config = {
    allowNetworkFallback: true,
    logRequests: false,
    proxyUrl: null,
    strictMode: false, // If true, throw errors when resources not found
    enableWebSocketInterception: true,
    enableImageInterception: true,
    enableStylesheetInterception: true,
    ...((window.__EXTRACTED_CONFIG__ || {}).network || window.__EXTRACTED_CONFIG__ || {})
  };

  // URL mapping from server-provided map
  const urlMap = window.__URL_MAP__ || {};

  // Network statistics
  const stats = {
    hits: 0,           // Requests served from local resources
    misses: 0,         // Requests that went to network
    errors: 0,         // Failed requests
    intercepted: 0,    // Total intercepted requests
    byType: {},        // Breakdown by resource type
    byUrl: {},         // Breakdown by URL pattern
    startTime: Date.now()
  };

  // Expose stats globally
  window.__NETWORK_STATS__ = stats;

  // Request log for debugging
  const requestLog = [];
  window.__NETWORK_LOG__ = requestLog;

  /**
   * Normalize URL to absolute form
   */
  function normalizeUrl(input, base) {
    try {
      if (typeof input === 'string') {
        return new URL(input, base || window.location.href).href;
      }
      if (input instanceof Request) {
        return new URL(input.url, base || window.location.href).href;
      }
      if (input instanceof URL) {
        return input.href;
      }
      return String(input);
    } catch (e) {
      console.warn('[NetworkInterceptor] Failed to normalize URL:', input, e);
      return String(input);
    }
  }

  /**
   * Extract pathname from URL for matching
   */
  function getPathnameFromUrl(url) {
    try {
      const urlObj = new URL(url, window.location.href);
      return urlObj.pathname + urlObj.search + urlObj.hash;
    } catch (e) {
      return url;
    }
  }

  /**
   * Determine resource type from URL
   */
  function getResourceType(url) {
    try {
      const pathname = getPathnameFromUrl(url);
      const ext = pathname.split('.').pop().toLowerCase().split('?')[0];

      const typeMap = {
        'js': 'script',
        'mjs': 'script',
        'css': 'stylesheet',
        'json': 'json',
        'wasm': 'wasm',
        'jpg': 'image',
        'jpeg': 'image',
        'png': 'image',
        'gif': 'image',
        'webp': 'image',
        'svg': 'image',
        'avif': 'image',
        'ico': 'image',
        'woff': 'font',
        'woff2': 'font',
        'ttf': 'font',
        'otf': 'font',
        'eot': 'font',
        'mp4': 'video',
        'webm': 'video',
        'mp3': 'audio',
        'wav': 'audio',
        'ogg': 'audio'
      };

      return typeMap[ext] || 'other';
    } catch (e) {
      return 'other';
    }
  }

  /**
   * Get Content-Type header for resource type
   */
  function getContentType(url, resourceType) {
    const typeMap = {
      'script': 'application/javascript',
      'stylesheet': 'text/css',
      'json': 'application/json',
      'wasm': 'application/wasm',
      'image': 'image/*',
      'font': 'font/*',
      'video': 'video/*',
      'audio': 'audio/*',
      'other': 'application/octet-stream'
    };

    // Try to be more specific for images
    if (resourceType === 'image') {
      const ext = url.split('.').pop().toLowerCase().split('?')[0];
      return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    }

    return typeMap[resourceType] || 'application/octet-stream';
  }

  /**
   * Find local resource path for a given URL
   */
  function findLocalResource(url) {
    const fullUrl = normalizeUrl(url);
    const pathname = getPathnameFromUrl(fullUrl);

    // Direct full URL match
    if (urlMap[fullUrl]) {
      return urlMap[fullUrl];
    }

    // Direct pathname match
    if (urlMap[pathname]) {
      return urlMap[pathname];
    }

    // Strip query string and try again
    const pathnameNoQuery = pathname.split('?')[0];
    if (urlMap[pathnameNoQuery]) {
      return urlMap[pathnameNoQuery];
    }

    // Try origin + pathname
    try {
      const urlObj = new URL(fullUrl);
      const originPath = urlObj.origin + urlObj.pathname;
      if (urlMap[originPath]) {
        return urlMap[originPath];
      }
    } catch (e) {
      // Ignore
    }

    // Regex pattern matching (for patterns defined in urlMap)
    for (const [pattern, localPath] of Object.entries(urlMap)) {
      try {
        if (pattern.startsWith('/') && pattern.endsWith('/')) {
          // This is a regex pattern
          const regex = new RegExp(pattern.slice(1, -1));
          if (regex.test(fullUrl) || regex.test(pathname)) {
            return localPath;
          }
        }
      } catch (e) {
        // Invalid regex, skip
      }
    }

    return null;
  }

  /**
   * Log network request
   */
  function logRequest(method, url, status, source, error = null) {
    const entry = {
      timestamp: Date.now(),
      method,
      url,
      status,
      source, // 'local', 'network', 'error'
      error: error ? String(error) : null,
      resourceType: getResourceType(url)
    };

    if (config.logRequests) {
      console.log(`[NetworkInterceptor] ${method} ${url} -> ${source}${error ? ' (ERROR: ' + error + ')' : ''}`);
    }

    requestLog.push(entry);

    // Keep log size manageable
    if (requestLog.length > 1000) {
      requestLog.shift();
    }

    // Update stats
    stats.intercepted++;
    if (source === 'local') {
      stats.hits++;
    } else if (source === 'network') {
      stats.misses++;
    } else if (source === 'error') {
      stats.errors++;
    }

    const resourceType = entry.resourceType;
    stats.byType[resourceType] = (stats.byType[resourceType] || 0) + 1;

    const urlPattern = getPathnameFromUrl(url);
    stats.byUrl[urlPattern] = (stats.byUrl[urlPattern] || 0) + 1;
  }

  /**
   * Create a Response object from local resource
   */
  async function createLocalResponse(localPath, originalUrl) {
    try {
      const response = await originalFetch(localPath);

      if (!response.ok) {
        throw new Error(`Failed to load local resource: ${response.status} ${response.statusText}`);
      }

      // Clone the response to add/modify headers
      const headers = new Headers(response.headers);

      // Add CORS headers to allow cross-origin access
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', '*');

      // Set appropriate Content-Type if not already set
      if (!headers.has('Content-Type')) {
        const resourceType = getResourceType(originalUrl);
        headers.set('Content-Type', getContentType(originalUrl, resourceType));
      }

      // Create new response with updated headers
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers
      });
    } catch (e) {
      console.error('[NetworkInterceptor] Error loading local resource:', localPath, e);
      throw e;
    }
  }

  /**
   * Fetch Interception
   */
  const originalFetch = window.fetch;
  window.fetch = async function(input, init) {
    const url = normalizeUrl(input);
    const localPath = findLocalResource(url);

    if (localPath) {
      try {
        const response = await createLocalResponse(localPath, url);
        logRequest((init && init.method) || 'GET', url, response.status, 'local');
        return response;
      } catch (e) {
        logRequest((init && init.method) || 'GET', url, 0, 'error', e);

        if (config.allowNetworkFallback) {
          console.warn('[NetworkInterceptor] Local resource failed, falling back to network:', url);
          const response = await originalFetch.call(this, input, init);
          logRequest((init && init.method) || 'GET', url, response.status, 'network');
          return response;
        } else {
          throw e;
        }
      }
    }

    // No local resource found
    if (config.allowNetworkFallback) {
      try {
        const response = await originalFetch.call(this, input, init);
        logRequest((init && init.method) || 'GET', url, response.status, 'network');
        return response;
      } catch (e) {
        logRequest((init && init.method) || 'GET', url, 0, 'error', e);
        throw e;
      }
    } else {
      const error = new Error(`Network request blocked: ${url}`);
      logRequest((init && init.method) || 'GET', url, 0, 'error', error);

      if (config.strictMode) {
        throw error;
      }

      // Return empty response
      return new Response('', {
        status: 404,
        statusText: 'Not Found (Network Blocked)',
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  };

  /**
   * XMLHttpRequest Interception
   */
  const OriginalXHR = window.XMLHttpRequest;

  window.XMLHttpRequest = function() {
    const xhr = new OriginalXHR();
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    const originalSetRequestHeader = xhr.setRequestHeader;

    let method = 'GET';
    let url = '';
    let async = true;
    let requestHeaders = {};
    let storedResponseType = '';

    // Intercept responseType setter for sync requests
    // Sync XHRs throw InvalidAccessError if responseType is set to non-empty value
    // We store the value and only apply it for async requests
    try {
      Object.defineProperty(xhr, 'responseType', {
        get: function() {
          return storedResponseType;
        },
        set: function(value) {
          storedResponseType = value;
          // Only set on underlying XHR if async - sync requests throw InvalidAccessError
          if (async) {
            try {
              // Use direct property access on the underlying object
              Object.getPrototypeOf(xhr).__lookupSetter__('responseType').call(xhr, value);
            } catch (e) {
              // Fallback - some browsers may not support __lookupSetter__
              // Just store the value, sync requests will get text response
            }
          }
          // For sync, silently ignore - response will come as text
        },
        configurable: true,
        enumerable: true
      });
    } catch (defineError) {
      // If we can't redefine, at least warn
      console.warn('[NetworkInterceptor] Could not override responseType:', defineError);
    }

    // Override open
    xhr.open = function(m, u, a, user, password) {
      method = m;
      url = normalizeUrl(u);
      async = a !== false;

      // For synchronous requests, do NOT intercept - just pass through
      // Synchronous XHRs have restrictions (e.g., cannot set responseType)
      // and interception can cause InvalidAccessError
      if (!async) {
        if (config.logRequests) {
          console.log('[NetworkInterceptor] Synchronous XHR detected, passing through without interception:', url);
        }
        return originalOpen.call(this, m, u, a, user, password);
      }

      const localPath = findLocalResource(url);

      if (localPath) {
        // Redirect to local resource
        return originalOpen.call(this, m, localPath, a, user, password);
      } else if (config.allowNetworkFallback) {
        // Allow original request
        return originalOpen.call(this, m, u, a, user, password);
      } else {
        // Block request
        if (config.strictMode) {
          throw new Error(`Network request blocked: ${url}`);
        }
        // Open with local empty endpoint
        return originalOpen.call(this, m, 'data:text/plain,', a, user, password);
      }
    };

    // Override setRequestHeader to track headers
    xhr.setRequestHeader = function(header, value) {
      requestHeaders[header] = value;
      return originalSetRequestHeader.call(this, header, value);
    };

    // Override send
    xhr.send = function(data) {
      const localPath = findLocalResource(url);

      // For synchronous requests, we need to handle logging differently
      // because event listeners may not work as expected
      if (!async) {
        // For synchronous requests, log after send completes
        const result = originalSend.call(this, data);

        // Synchronous send blocks, so we can log immediately after
        try {
          if (this.status >= 200 && this.status < 400) {
            logRequest(method, url, this.status, 'network');
          } else {
            logRequest(method, url, this.status, 'error', new Error(`Status ${this.status}`));
          }
        } catch (e) {
          logRequest(method, url, 0, 'error', e);
        }

        return result;
      }

      // For async requests, use event listeners as before
      const originalOnLoad = this.onload;
      const originalOnError = this.onerror;

      this.addEventListener('load', function() {
        logRequest(method, url, this.status, localPath ? 'local' : 'network');
        if (originalOnLoad) {
          originalOnLoad.apply(this, arguments);
        }
      });

      this.addEventListener('error', function(e) {
        logRequest(method, url, 0, 'error', e);
        if (originalOnError) {
          originalOnError.apply(this, arguments);
        }
      });

      return originalSend.call(this, data);
    };

    return xhr;
  };

  // Copy static properties
  for (const prop in OriginalXHR) {
    if (OriginalXHR.hasOwnProperty(prop)) {
      window.XMLHttpRequest[prop] = OriginalXHR[prop];
    }
  }
  window.XMLHttpRequest.prototype = OriginalXHR.prototype;

  /**
   * WebSocket Interception (optional)
   */
  if (config.enableWebSocketInterception) {
    const OriginalWebSocket = window.WebSocket;

    window.WebSocket = function(url, protocols) {
      const normalizedUrl = normalizeUrl(url);

      if (config.logRequests) {
        console.log('[NetworkInterceptor] WebSocket connection attempt:', normalizedUrl);
      }

      logRequest('WEBSOCKET', normalizedUrl, 0, 'network');

      // Check if we should block or allow
      if (!config.allowNetworkFallback) {
        const error = new Error(`WebSocket connection blocked: ${normalizedUrl}`);
        logRequest('WEBSOCKET', normalizedUrl, 0, 'error', error);

        if (config.strictMode) {
          throw error;
        }

        // Create a mock WebSocket that never connects
        const mockWs = {
          readyState: WebSocket.CONNECTING,
          send: function() {
            console.warn('[NetworkInterceptor] WebSocket send() called on blocked connection');
          },
          close: function() {
            this.readyState = WebSocket.CLOSED;
          },
          addEventListener: function() {},
          removeEventListener: function() {}
        };

        setTimeout(() => {
          mockWs.readyState = WebSocket.CLOSED;
          if (mockWs.onerror) {
            mockWs.onerror(new Event('error'));
          }
        }, 0);

        return mockWs;
      }

      // Allow WebSocket connection
      return new OriginalWebSocket(url, protocols);
    };

    // Copy constants
    window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    window.WebSocket.OPEN = OriginalWebSocket.OPEN;
    window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
    window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
    window.WebSocket.prototype = OriginalWebSocket.prototype;
  }

  /**
   * Image loading interception (for <img> elements created dynamically)
   */
  if (config.enableImageInterception) {
    const originalImageSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');

    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      get: function() {
        return originalImageSrc.get.call(this);
      },
      set: function(value) {
        const url = normalizeUrl(value);
        const localPath = findLocalResource(url);

        if (localPath) {
          if (config.logRequests) {
            console.log('[NetworkInterceptor] Image redirected to local:', url, '->', localPath);
          }
          return originalImageSrc.set.call(this, localPath);
        }

        return originalImageSrc.set.call(this, value);
      }
    });
  }

  /**
   * Stylesheet loading interception (for <link> elements)
   */
  if (config.enableStylesheetInterception) {
    const originalLinkHref = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, 'href');

    Object.defineProperty(HTMLLinkElement.prototype, 'href', {
      get: function() {
        return originalLinkHref.get.call(this);
      },
      set: function(value) {
        const url = normalizeUrl(value);
        const localPath = findLocalResource(url);

        if (localPath && this.rel === 'stylesheet') {
          if (config.logRequests) {
            console.log('[NetworkInterceptor] Stylesheet redirected to local:', url, '->', localPath);
          }
          return originalLinkHref.set.call(this, localPath);
        }

        return originalLinkHref.set.call(this, value);
      }
    });
  }

  /**
   * API: Manually add URL mapping
   */
  window.__addUrlMapping__ = function(urlPattern, localPath) {
    urlMap[urlPattern] = localPath;
    console.log('[NetworkInterceptor] Added URL mapping:', urlPattern, '->', localPath);
  };

  /**
   * API: Get network statistics
   */
  window.__getNetworkStats__ = function() {
    return {
      ...stats,
      uptime: Date.now() - stats.startTime,
      hitRate: stats.intercepted > 0 ? (stats.hits / stats.intercepted * 100).toFixed(2) + '%' : '0%'
    };
  };

  /**
   * API: Clear network log
   */
  window.__clearNetworkLog__ = function() {
    requestLog.length = 0;
    stats.hits = 0;
    stats.misses = 0;
    stats.errors = 0;
    stats.intercepted = 0;
    stats.byType = {};
    stats.byUrl = {};
    stats.startTime = Date.now();
    console.log('[NetworkInterceptor] Network log and stats cleared');
  };

  /**
   * API: Export network log
   */
  window.__exportNetworkLog__ = function() {
    return {
      config: config,
      stats: window.__getNetworkStats__(),
      log: requestLog,
      urlMap: urlMap
    };
  };

  /**
   * API: Disable interceptor
   */
  window.__disableNetworkInterceptor__ = function() {
    window.fetch = originalFetch;
    window.XMLHttpRequest = OriginalXHR;
    console.log('[NetworkInterceptor] Interceptor disabled');
  };

  // Log initialization
  console.log('[NetworkInterceptor] Initialized with config:', config);
  console.log('[NetworkInterceptor] URL mappings loaded:', Object.keys(urlMap).length);
  console.log('[NetworkInterceptor] Stats available via window.__NETWORK_STATS__');
  console.log('[NetworkInterceptor] Log available via window.__NETWORK_LOG__');

  // Mark as initialized
  window.__NETWORK_INTERCEPTOR_READY__ = true;

  // Dispatch ready event
  window.dispatchEvent(new CustomEvent('network-interceptor-ready', {
    detail: {
      config: config,
      urlMapSize: Object.keys(urlMap).length
    }
  }));

})();
