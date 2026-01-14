/**
 * Generic API Mock
 * Returns empty success responses and logs API calls for debugging
 */

/**
 * Generate API mock script for injection
 * @returns {string} JavaScript code to inject
 */
export function generateApiMock() {
  return `
// =============================================================================
// API MOCK - Generic API Response Handler
// =============================================================================
(function() {
  'use strict';

  const API_LOG_ENABLED = true;
  const API_RESPONSES = {
    default: { success: true, data: {} },
    list: { success: true, data: [], total: 0 },
    user: { success: true, data: { id: 1, name: 'Mock User' } },
    error: { success: false, error: 'Mock error' }
  };

  // Store original fetch for potential passthrough
  const originalFetch = window.fetch;

  // API call logger
  function logApiCall(method, url, data, response) {
    if (!API_LOG_ENABLED) return;

    console.groupCollapsed('[API Mock] ' + method + ' ' + url);
    console.log('Request:', { method, url, data });
    console.log('Response:', response);
    console.groupEnd();
  }

  // Determine mock response based on URL patterns
  function getMockResponse(url, method) {
    const urlLower = url.toLowerCase();

    // User/auth endpoints
    if (urlLower.includes('/user') || urlLower.includes('/me') || urlLower.includes('/profile')) {
      return API_RESPONSES.user;
    }

    // List endpoints
    if (urlLower.includes('/list') || urlLower.includes('/search') ||
        urlLower.includes('/items') || urlLower.includes('/results')) {
      return API_RESPONSES.list;
    }

    // Analytics/tracking - return success silently
    if (urlLower.includes('/track') || urlLower.includes('/analytics') ||
        urlLower.includes('/event') || urlLower.includes('/log')) {
      return { success: true, tracked: true };
    }

    // Config/settings
    if (urlLower.includes('/config') || urlLower.includes('/settings')) {
      return { success: true, data: {}, config: {} };
    }

    // Default response
    return API_RESPONSES.default;
  }

  // Create mock Response object
  function createMockResponse(data, status = 200) {
    const body = JSON.stringify(data);
    return new Response(body, {
      status: status,
      statusText: 'OK',
      headers: {
        'Content-Type': 'application/json',
        'X-Mock-Response': 'true'
      }
    });
  }

  // Mock XMLHttpRequest API calls
  const XHROpen = XMLHttpRequest.prototype.open;
  const XHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    this._mockMethod = method;
    this._mockUrl = url;
    this._mockAsync = async !== false;
    return XHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(data) {
    const xhr = this;
    const url = this._mockUrl || '';
    const method = this._mockMethod || 'GET';

    // Check if this should be mocked (API calls, not resources)
    const isApiCall = url.includes('/api/') ||
                      url.includes('/v1/') ||
                      url.includes('/v2/') ||
                      url.includes('/graphql');

    if (isApiCall && !url.includes('localhost')) {
      const mockResponse = getMockResponse(url, method);
      logApiCall(method, url, data, mockResponse);

      // Simulate async response
      setTimeout(function() {
        Object.defineProperty(xhr, 'readyState', { value: 4, writable: false });
        Object.defineProperty(xhr, 'status', { value: 200, writable: false });
        Object.defineProperty(xhr, 'statusText', { value: 'OK', writable: false });
        Object.defineProperty(xhr, 'responseText', {
          value: JSON.stringify(mockResponse),
          writable: false
        });
        Object.defineProperty(xhr, 'response', {
          value: JSON.stringify(mockResponse),
          writable: false
        });

        // Trigger events
        if (xhr.onreadystatechange) xhr.onreadystatechange();
        if (xhr.onload) xhr.onload();

        xhr.dispatchEvent(new Event('readystatechange'));
        xhr.dispatchEvent(new Event('load'));
      }, 10);

      return;
    }

    return XHRSend.apply(this, arguments);
  };

  // Expose API mock utilities
  window.__API_MOCK__ = {
    enabled: true,
    log: logApiCall,
    getResponse: getMockResponse,
    createResponse: createMockResponse,
    responses: API_RESPONSES,

    // Add custom response pattern
    addPattern: function(pattern, response) {
      API_RESPONSES[pattern] = response;
    },

    // Toggle logging
    setLogging: function(enabled) {
      API_LOG_ENABLED = enabled;
    }
  };

  console.log('[API Mock] Initialized - API calls will return mock responses');
})();
`;
}

/**
 * Get API mock as inline script tag
 * @returns {string} Script tag with API mock
 */
export function getApiMockScript() {
  return `<script>${generateApiMock()}</script>`;
}

export default {
  generateApiMock,
  getApiMockScript
};
