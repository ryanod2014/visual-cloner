/**
 * Location Spoofing Mock
 * Makes extracted apps believe they're running on their original domain
 *
 * MUST be injected FIRST before any app code runs
 */

/**
 * Generate location spoofing script
 * @returns {string} JavaScript code for location spoofing
 */
export function generateLocationMock() {
  return `
// =============================================================================
// LOCATION SPOOFING - Must run before any app code
// =============================================================================
(function() {
  'use strict';

  const config = window.__EXTRACTED_CONFIG__ || {};

  // Parse original location
  const originalOrigin = config.originalOrigin || window.location.origin;
  const originalHost = config.originalHost || window.location.host;
  const originalProtocol = config.originalProtocol || window.location.protocol;
  const originalHref = config.originalHref || window.location.href;

  // Parse URL components
  let originalUrl;
  try {
    originalUrl = new URL(originalHref);
  } catch (e) {
    originalUrl = new URL(window.location.href);
  }

  const originalHostname = originalUrl.hostname;
  const originalPort = originalUrl.port;
  const originalPathname = window.location.pathname; // Keep current path
  const originalSearch = window.location.search;
  const originalHash = window.location.hash;

  // Store real location
  const realLocation = window.location;
  const realHref = realLocation.href;

  console.log('[LocationSpoof] Spoofing location to:', originalHostname);

  // Create location mock object
  const locationMock = {
    get href() { return originalProtocol + '//' + originalHost + originalPathname + originalSearch + originalHash; },
    get origin() { return originalOrigin; },
    get protocol() { return originalProtocol; },
    get host() { return originalHost; },
    get hostname() { return originalHostname; },
    get port() { return originalPort; },
    get pathname() { return originalPathname; },
    get search() { return originalSearch; },
    get hash() { return originalHash; },

    set href(v) { realLocation.href = v; },
    set hash(v) { realLocation.hash = v; },
    set search(v) { realLocation.search = v; },

    assign: function(url) { realLocation.assign(url); },
    replace: function(url) { realLocation.replace(url); },
    reload: function(force) { realLocation.reload(force); },
    toString: function() { return this.href; },
    valueOf: function() { return this.href; },

    ancestorOrigins: {
      length: 0,
      contains: function() { return false; },
      item: function() { return null; }
    }
  };

  // Create proxy for complete interception
  const locationProxy = new Proxy(locationMock, {
    get(target, prop) {
      if (prop in target) {
        const val = target[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      }
      return realLocation[prop];
    },
    set(target, prop, value) {
      if (prop in target) {
        target[prop] = value;
      } else {
        realLocation[prop] = value;
      }
      return true;
    }
  });

  // Override window.location
  try {
    Object.defineProperty(window, 'location', {
      get: () => locationProxy,
      set: (v) => { realLocation.href = v; },
      configurable: false
    });
  } catch (e) {
    console.warn('[LocationSpoof] Could not override window.location:', e.message);
  }

  // Override document.location
  try {
    Object.defineProperty(document, 'location', {
      get: () => locationProxy,
      set: (v) => { realLocation.href = v; },
      configurable: false
    });
  } catch (e) {
    console.warn('[LocationSpoof] Could not override document.location:', e.message);
  }

  // Override document.domain
  try {
    Object.defineProperty(document, 'domain', {
      get: () => originalHostname,
      set: () => {},
      configurable: false
    });
  } catch (e) {}

  // Override document.referrer
  try {
    Object.defineProperty(document, 'referrer', {
      get: () => originalOrigin + '/',
      configurable: false
    });
  } catch (e) {}

  // Override window.origin
  try {
    Object.defineProperty(window, 'origin', {
      get: () => originalOrigin,
      configurable: false
    });
  } catch (e) {}

  // Override URL constructor to handle relative URLs
  const OriginalURL = window.URL;
  window.URL = function(url, base) {
    // Use spoofed origin as default base for relative URLs
    if (!base && typeof url === 'string' && !url.match(/^[a-z]+:/i)) {
      base = originalOrigin;
    }
    return new OriginalURL(url, base);
  };
  window.URL.prototype = OriginalURL.prototype;
  window.URL.createObjectURL = OriginalURL.createObjectURL.bind(OriginalURL);
  window.URL.revokeObjectURL = OriginalURL.revokeObjectURL.bind(OriginalURL);

  // Test function
  window.__testLocationSpoof = function() {
    console.log('window.location.hostname:', window.location.hostname);
    console.log('window.location.origin:', window.location.origin);
    console.log('window.location.href:', window.location.href);
    console.log('document.domain:', document.domain);
  };

  console.log('[LocationSpoof] Active - hostname:', window.location.hostname);
})();
`;
}

/**
 * Get location mock as script tag
 * @returns {string} Script tag
 */
export function getLocationMockScript() {
  return `<script>${generateLocationMock()}</script>`;
}

export default {
  generateLocationMock,
  getLocationMockScript
};
