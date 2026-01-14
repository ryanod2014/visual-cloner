/**
 * Runtime Mock Script for Universal WebApp Extraction
 *
 * This script MUST be injected FIRST before any app code runs.
 * It provides comprehensive location spoofing and runtime mocking to make
 * extracted webapps believe they're running on their original domain.
 *
 * @version 1.0.0
 * @license MIT
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Load configuration from window.__EXTRACTED_CONFIG__
   * This should be set by the extraction system before this script runs
   */
  const config = window.__EXTRACTED_CONFIG__ || {};

  // Parse original location or fallback to current
  const originalOrigin = config.originalOrigin || window.location.origin;
  const originalHost = config.originalHost || window.location.host;
  const originalProtocol = config.originalProtocol || window.location.protocol;
  const originalHref = config.originalHref || window.location.href;

  // Parse URL components
  const originalUrl = new URL(originalHref);
  const originalHostname = originalUrl.hostname;
  const originalPort = originalUrl.port;
  const originalPathname = originalUrl.pathname;
  const originalSearch = originalUrl.search;
  const originalHash = originalUrl.hash;

  // Store real location for internal use
  const realLocation = window.location;
  const realOrigin = realLocation.origin;

  console.log('[RuntimeMock] Initializing with config:', {
    originalOrigin,
    originalHost,
    originalProtocol,
    originalHref,
    realOrigin
  });

  // ============================================================================
  // LOCATION PROXY IMPLEMENTATION
  // ============================================================================

  /**
   * Create a location-like object with spoofed values
   */
  const createLocationProxy = () => {
    // Base object with all location properties
    const locationMock = {
      // URL components
      href: originalHref,
      origin: originalOrigin,
      protocol: originalProtocol,
      host: originalHost,
      hostname: originalHostname,
      port: originalPort,
      pathname: originalPathname,
      search: originalSearch,
      hash: originalHash,

      // Methods
      assign: function(url) {
        console.log('[RuntimeMock] location.assign called with:', url);
        realLocation.assign(url);
      },
      replace: function(url) {
        console.log('[RuntimeMock] location.replace called with:', url);
        realLocation.replace(url);
      },
      reload: function(forceReload) {
        console.log('[RuntimeMock] location.reload called');
        realLocation.reload(forceReload);
      },
      toString: function() {
        return originalHref;
      },
      valueOf: function() {
        return originalHref;
      },

      // ancestorOrigins (DOMStringList-like object)
      ancestorOrigins: {
        length: 1,
        0: originalOrigin,
        contains: function(origin) {
          return origin === originalOrigin;
        },
        item: function(index) {
          return index === 0 ? originalOrigin : null;
        },
        toString: function() {
          return '[object DOMStringList]';
        }
      }
    };

    // Create proxy to intercept property access
    const locationProxy = new Proxy(locationMock, {
      get(target, prop, receiver) {
        // Handle property access
        if (prop in target) {
          const value = target[prop];
          // Return functions bound to the mock
          if (typeof value === 'function') {
            return value.bind(target);
          }
          return value;
        }

        // Fallback to real location for unknown properties
        const realValue = realLocation[prop];
        if (typeof realValue === 'function') {
          return realValue.bind(realLocation);
        }
        return realValue;
      },

      set(target, prop, value) {
        console.log('[RuntimeMock] Setting location property:', prop, '=', value);

        // Handle href assignment (navigation)
        if (prop === 'href') {
          realLocation.href = value;
          return true;
        }

        // Handle hash changes
        if (prop === 'hash') {
          realLocation.hash = value;
          target.hash = value;
          return true;
        }

        // Handle search changes
        if (prop === 'search') {
          realLocation.search = value;
          target.search = value;
          return true;
        }

        // Store on target
        target[prop] = value;
        return true;
      },

      has(target, prop) {
        return prop in target || prop in realLocation;
      },

      ownKeys(target) {
        return Reflect.ownKeys(target);
      },

      getOwnPropertyDescriptor(target, prop) {
        if (prop in target) {
          return {
            enumerable: true,
            configurable: true,
            value: target[prop]
          };
        }
        return Reflect.getOwnPropertyDescriptor(realLocation, prop);
      }
    });

    // Make it undetectable
    Object.defineProperty(locationProxy, Symbol.toStringTag, {
      value: 'Location',
      writable: false,
      enumerable: false,
      configurable: true
    });

    return locationProxy;
  };

  // ============================================================================
  // INSTALL LOCATION OVERRIDES
  // ============================================================================

  const spoofedLocation = createLocationProxy();

  /**
   * Override window.location with our proxy
   * Make it non-configurable to prevent detection
   */
  try {
    Object.defineProperty(window, 'location', {
      get: function() {
        return spoofedLocation;
      },
      set: function(value) {
        console.log('[RuntimeMock] window.location set to:', value);
        realLocation.href = value;
      },
      enumerable: true,
      configurable: false
    });
    console.log('[RuntimeMock] window.location overridden');
  } catch (e) {
    console.warn('[RuntimeMock] Failed to override window.location:', e);
  }

  /**
   * Override document.location
   */
  try {
    Object.defineProperty(document, 'location', {
      get: function() {
        return spoofedLocation;
      },
      set: function(value) {
        console.log('[RuntimeMock] document.location set to:', value);
        realLocation.href = value;
      },
      enumerable: true,
      configurable: false
    });
    console.log('[RuntimeMock] document.location overridden');
  } catch (e) {
    console.warn('[RuntimeMock] Failed to override document.location:', e);
  }

  /**
   * Override document.domain
   */
  try {
    Object.defineProperty(document, 'domain', {
      get: function() {
        return originalHostname;
      },
      set: function(value) {
        console.log('[RuntimeMock] document.domain set to:', value);
        // Allow setting but don't actually change
      },
      enumerable: true,
      configurable: false
    });
    console.log('[RuntimeMock] document.domain overridden');
  } catch (e) {
    console.warn('[RuntimeMock] Failed to override document.domain:', e);
  }

  /**
   * Override document.referrer
   */
  try {
    const originalReferrer = config.originalReferrer || originalOrigin + '/';
    Object.defineProperty(document, 'referrer', {
      get: function() {
        return originalReferrer;
      },
      enumerable: true,
      configurable: false
    });
    console.log('[RuntimeMock] document.referrer overridden');
  } catch (e) {
    console.warn('[RuntimeMock] Failed to override document.referrer:', e);
  }

  /**
   * Override window.origin
   */
  try {
    Object.defineProperty(window, 'origin', {
      get: function() {
        return originalOrigin;
      },
      enumerable: true,
      configurable: false
    });
    console.log('[RuntimeMock] window.origin overridden');
  } catch (e) {
    console.warn('[RuntimeMock] Failed to override window.origin:', e);
  }

  /**
   * Override self.location for web workers
   */
  if (typeof self !== 'undefined' && self !== window) {
    try {
      Object.defineProperty(self, 'location', {
        get: function() {
          return spoofedLocation;
        },
        set: function(value) {
          console.log('[RuntimeMock] self.location set to:', value);
          realLocation.href = value;
        },
        enumerable: true,
        configurable: false
      });
      console.log('[RuntimeMock] self.location overridden');
    } catch (e) {
      console.warn('[RuntimeMock] Failed to override self.location:', e);
    }
  }

  // ============================================================================
  // NAVIGATOR SPOOFING
  // ============================================================================

  /**
   * Override navigator.onLine to always return true
   */
  try {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      get: function() {
        return true;
      },
      enumerable: true,
      configurable: false
    });
    console.log('[RuntimeMock] navigator.onLine overridden');
  } catch (e) {
    console.warn('[RuntimeMock] Failed to override navigator.onLine:', e);
  }

  /**
   * Optionally spoof user agent if specified in config
   */
  if (config.spoofUserAgent) {
    try {
      Object.defineProperty(Navigator.prototype, 'userAgent', {
        get: function() {
          return config.spoofUserAgent;
        },
        enumerable: true,
        configurable: false
      });
      console.log('[RuntimeMock] navigator.userAgent overridden');
    } catch (e) {
      console.warn('[RuntimeMock] Failed to override navigator.userAgent:', e);
    }
  }

  // ============================================================================
  // POSTMESSAGE ORIGIN HANDLING
  // ============================================================================

  /**
   * Intercept window.postMessage to fix origin in messages
   */
  const originalPostMessage = window.postMessage.bind(window);
  window.postMessage = function(message, targetOrigin, transfer) {
    console.log('[RuntimeMock] postMessage intercepted:', { message, targetOrigin });

    // If targetOrigin matches our spoofed origin, use real origin
    if (targetOrigin === originalOrigin) {
      targetOrigin = realOrigin;
    }

    return originalPostMessage(message, targetOrigin, transfer);
  };

  /**
   * Intercept addEventListener to spoof origin in message events
   */
  const originalAddEventListener = window.addEventListener.bind(window);
  window.addEventListener = function(type, listener, options) {
    if (type === 'message' && typeof listener === 'function') {
      // Wrap listener to spoof origin
      const wrappedListener = function(event) {
        // Create spoofed event if origin matches real origin
        if (event.origin === realOrigin) {
          const spoofedEvent = new MessageEvent('message', {
            data: event.data,
            origin: originalOrigin,
            lastEventId: event.lastEventId,
            source: event.source,
            ports: event.ports
          });

          // Copy other properties
          Object.defineProperty(spoofedEvent, 'isTrusted', {
            value: event.isTrusted,
            writable: false
          });

          return listener.call(this, spoofedEvent);
        }

        return listener.call(this, event);
      };

      // Preserve original listener reference for removeEventListener
      wrappedListener.__original = listener;

      return originalAddEventListener(type, wrappedListener, options);
    }

    return originalAddEventListener(type, listener, options);
  };

  /**
   * Intercept removeEventListener to handle wrapped listeners
   */
  const originalRemoveEventListener = window.removeEventListener.bind(window);
  window.removeEventListener = function(type, listener, options) {
    if (type === 'message' && typeof listener === 'function') {
      // Find wrapped listener
      // Note: This is a simplified implementation
      // In production, you'd need a WeakMap to track wrapped listeners
    }

    return originalRemoveEventListener(type, listener, options);
  };

  // ============================================================================
  // JSON.STRINGIFY HANDLING
  // ============================================================================

  /**
   * Make location.toJSON() return spoofed values
   */
  if (!spoofedLocation.toJSON) {
    Object.defineProperty(spoofedLocation, 'toJSON', {
      value: function() {
        return {
          href: originalHref,
          origin: originalOrigin,
          protocol: originalProtocol,
          host: originalHost,
          hostname: originalHostname,
          port: originalPort,
          pathname: originalPathname,
          search: originalSearch,
          hash: originalHash
        };
      },
      writable: false,
      enumerable: false,
      configurable: true
    });
  }

  // ============================================================================
  // FETCH & XMLHTTPREQUEST ORIGIN HEADERS
  // ============================================================================

  /**
   * Intercept fetch to add proper Origin header
   */
  const originalFetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    console.log('[RuntimeMock] fetch intercepted:', input);

    // Add or modify Origin header if not present
    if (!init) {
      init = {};
    }
    if (!init.headers) {
      init.headers = {};
    }

    // Convert Headers object to plain object if needed
    if (init.headers instanceof Headers) {
      const plainHeaders = {};
      init.headers.forEach((value, key) => {
        plainHeaders[key] = value;
      });
      init.headers = plainHeaders;
    }

    // Set Origin header to spoofed origin
    if (!init.headers['Origin'] && !init.headers['origin']) {
      init.headers['Origin'] = originalOrigin;
    }

    return originalFetch(input, init);
  };

  /**
   * Intercept XMLHttpRequest to add proper Origin header
   */
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    this.__url = url;
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    console.log('[RuntimeMock] XHR send intercepted:', this.__url);

    // Set Origin header to spoofed origin
    if (!this.getResponseHeader('Origin')) {
      this.setRequestHeader('Origin', originalOrigin);
    }

    return originalXHRSend.apply(this, arguments);
  };

  // ============================================================================
  // URL CONSTRUCTOR OVERRIDE (Optional)
  // ============================================================================

  /**
   * Intercept new URL() to resolve relative URLs against spoofed origin
   */
  const OriginalURL = window.URL;
  window.URL = function(url, base) {
    // If no base provided, use spoofed origin as base
    if (!base && typeof url === 'string' && !url.match(/^https?:\/\//)) {
      base = originalOrigin;
    }

    return new OriginalURL(url, base);
  };

  // Copy static methods
  window.URL.createObjectURL = OriginalURL.createObjectURL.bind(OriginalURL);
  window.URL.revokeObjectURL = OriginalURL.revokeObjectURL.bind(OriginalURL);

  // Preserve prototype
  window.URL.prototype = OriginalURL.prototype;

  // ============================================================================
  // CORS & SECURITY OVERRIDES (Use with caution)
  // ============================================================================

  /**
   * Optionally disable security features if specified in config
   * WARNING: This can introduce security vulnerabilities
   */
  if (config.disableCORS) {
    console.warn('[RuntimeMock] CORS disabled - this is a security risk!');

    // Override Response to ignore CORS
    const OriginalResponse = window.Response;
    window.Response = function(body, init) {
      if (init && init.headers) {
        if (!init.headers['Access-Control-Allow-Origin']) {
          init.headers['Access-Control-Allow-Origin'] = '*';
        }
      }
      return new OriginalResponse(body, init);
    };
    window.Response.prototype = OriginalResponse.prototype;
  }

  // ============================================================================
  // DEBUGGING & TESTING
  // ============================================================================

  /**
   * Expose testing interface in development mode
   */
  if (config.debug) {
    window.__runtimeMock = {
      config: config,
      realLocation: realLocation,
      realOrigin: realOrigin,
      spoofedLocation: spoofedLocation,
      test: function() {
        console.group('[RuntimeMock] Testing Location Spoofing');
        console.log('window.location.href:', window.location.href);
        console.log('window.location.origin:', window.location.origin);
        console.log('window.location.host:', window.location.host);
        console.log('document.location.href:', document.location.href);
        console.log('document.domain:', document.domain);
        console.log('document.referrer:', document.referrer);
        console.log('window.origin:', window.origin);
        console.log('navigator.onLine:', navigator.onLine);
        console.log('location.toString():', window.location.toString());
        console.log('JSON.stringify(location):', JSON.stringify(window.location));
        console.groupEnd();
      }
    };

    console.log('[RuntimeMock] Debug mode enabled. Run window.__runtimeMock.test() to test.');
  }

  // ============================================================================
  // INITIALIZATION COMPLETE
  // ============================================================================

  console.log('[RuntimeMock] Initialization complete');

  // Dispatch custom event to signal runtime mock is ready
  window.dispatchEvent(new CustomEvent('runtimemock:ready', {
    detail: {
      originalOrigin,
      realOrigin,
      spoofedLocation
    }
  }));

})();

/**
 * EXAMPLE USAGE:
 *
 * 1. In your HTML, inject this script FIRST:
 *
 *    <script>
 *      window.__EXTRACTED_CONFIG__ = {
 *        originalOrigin: 'https://example.com',
 *        originalHost: 'example.com',
 *        originalProtocol: 'https:',
 *        originalHref: 'https://example.com/app/dashboard',
 *        originalReferrer: 'https://example.com/',
 *        debug: true
 *      };
 *    </script>
 *    <script src="runtime-mock.js"></script>
 *    <script src="app.js"></script>
 *
 * 2. Test that spoofing works:
 *
 *    console.log(window.location.origin); // 'https://example.com'
 *    console.log(window.location.href);   // 'https://example.com/app/dashboard'
 *    console.log(document.domain);        // 'example.com'
 *
 * 3. Test with debug mode:
 *
 *    window.__runtimeMock.test();
 *
 * 4. Listen for ready event:
 *
 *    window.addEventListener('runtimemock:ready', (event) => {
 *      console.log('Runtime mock ready:', event.detail);
 *    });
 */
