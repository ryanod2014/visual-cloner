/**
 * Auth Bypass Mock
 * Provides fake user session and returns authenticated state
 */

/**
 * Generate auth bypass script for injection
 * @param {Object} options - Configuration options
 * @param {Object} options.user - Mock user data
 * @param {string} options.token - Mock auth token
 * @returns {string} JavaScript code to inject
 */
export function generateAuthMock(options = {}) {
  const mockUser = options.user || {
    id: 1,
    name: 'Mock User',
    email: 'mock@example.com',
    avatar: 'https://via.placeholder.com/150',
    role: 'user',
    permissions: ['read', 'write'],
    preferences: {}
  };

  const mockToken = options.token || 'mock-jwt-token-' + Date.now();

  return `
// =============================================================================
// AUTH BYPASS MOCK - Fake User Session Provider
// =============================================================================
(function() {
  'use strict';

  const MOCK_USER = ${JSON.stringify(mockUser, null, 2)};
  const MOCK_TOKEN = '${mockToken}';
  const MOCK_SESSION = {
    user: MOCK_USER,
    token: MOCK_TOKEN,
    expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
    isAuthenticated: true,
    createdAt: Date.now()
  };

  // Storage keys commonly used for auth
  const AUTH_STORAGE_KEYS = [
    'token', 'accessToken', 'access_token', 'authToken', 'auth_token',
    'jwt', 'jwtToken', 'jwt_token',
    'session', 'sessionToken', 'session_token',
    'user', 'currentUser', 'current_user',
    'auth', 'authentication',
    'idToken', 'id_token',
    'refreshToken', 'refresh_token'
  ];

  // Pre-populate localStorage with auth data
  function populateStorage() {
    const storage = window.localStorage;

    // Set common token keys
    AUTH_STORAGE_KEYS.forEach(function(key) {
      if (key.toLowerCase().includes('token')) {
        storage.setItem(key, MOCK_TOKEN);
      } else if (key.toLowerCase().includes('user')) {
        storage.setItem(key, JSON.stringify(MOCK_USER));
      } else if (key.toLowerCase().includes('session')) {
        storage.setItem(key, JSON.stringify(MOCK_SESSION));
      }
    });

    // Set specific common patterns
    storage.setItem('isLoggedIn', 'true');
    storage.setItem('isAuthenticated', 'true');
    storage.setItem('loggedIn', 'true');
  }

  // Pre-populate sessionStorage
  function populateSessionStorage() {
    const storage = window.sessionStorage;

    AUTH_STORAGE_KEYS.forEach(function(key) {
      if (key.toLowerCase().includes('token')) {
        storage.setItem(key, MOCK_TOKEN);
      } else if (key.toLowerCase().includes('user')) {
        storage.setItem(key, JSON.stringify(MOCK_USER));
      }
    });
  }

  // Set auth cookies
  function setAuthCookies() {
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toUTCString();

    document.cookie = 'token=' + MOCK_TOKEN + '; expires=' + expires + '; path=/';
    document.cookie = 'auth=' + MOCK_TOKEN + '; expires=' + expires + '; path=/';
    document.cookie = 'session=' + encodeURIComponent(JSON.stringify(MOCK_SESSION)) + '; expires=' + expires + '; path=/';
    document.cookie = 'isLoggedIn=true; expires=' + expires + '; path=/';
  }

  // Mock common auth check functions
  function mockAuthFunctions() {
    // Common auth state checkers
    window.isAuthenticated = function() { return true; };
    window.isLoggedIn = function() { return true; };
    window.checkAuth = function() { return Promise.resolve(true); };
    window.requireAuth = function() { return Promise.resolve(MOCK_USER); };

    // Common user getters
    window.getUser = function() { return MOCK_USER; };
    window.getCurrentUser = function() { return MOCK_USER; };
    window.getSession = function() { return MOCK_SESSION; };
    window.getToken = function() { return MOCK_TOKEN; };
    window.getAccessToken = function() { return MOCK_TOKEN; };
  }

  // Intercept auth-related fetches
  const originalFetch = window.fetch;
  window.fetch = function(url, options) {
    const urlStr = typeof url === 'string' ? url : url.toString();
    const urlLower = urlStr.toLowerCase();

    // Auth endpoints that should return success
    const authEndpoints = [
      '/auth/me', '/auth/user', '/auth/session', '/auth/verify',
      '/api/auth', '/api/me', '/api/user', '/api/session',
      '/user/me', '/user/current', '/users/me',
      '/account', '/profile',
      '/oauth/token', '/token/refresh',
      '/login/status', '/session/validate'
    ];

    const isAuthEndpoint = authEndpoints.some(function(endpoint) {
      return urlLower.includes(endpoint);
    });

    if (isAuthEndpoint) {
      console.log('[Auth Mock] Intercepted auth request:', urlStr);

      return Promise.resolve(new Response(JSON.stringify({
        success: true,
        authenticated: true,
        user: MOCK_USER,
        token: MOCK_TOKEN,
        session: MOCK_SESSION
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Add auth header to all requests
    options = options || {};
    options.headers = options.headers || {};

    if (typeof options.headers.set === 'function') {
      options.headers.set('Authorization', 'Bearer ' + MOCK_TOKEN);
    } else {
      options.headers['Authorization'] = 'Bearer ' + MOCK_TOKEN;
    }

    return originalFetch.call(this, url, options);
  };

  // Intercept XHR for auth endpoints
  const XHRSend = XMLHttpRequest.prototype.send;
  const XHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.send = function(data) {
    // Add auth header
    try {
      this.setRequestHeader('Authorization', 'Bearer ' + MOCK_TOKEN);
    } catch (e) {
      // Header might already be set
    }
    return XHRSend.apply(this, arguments);
  };

  // Initialize auth mocks
  populateStorage();
  populateSessionStorage();
  setAuthCookies();
  mockAuthFunctions();

  // Expose auth mock utilities
  window.__AUTH_MOCK__ = {
    enabled: true,
    user: MOCK_USER,
    token: MOCK_TOKEN,
    session: MOCK_SESSION,

    // Update mock user
    setUser: function(user) {
      Object.assign(MOCK_USER, user);
      populateStorage();
    },

    // Get current mock session
    getSession: function() {
      return MOCK_SESSION;
    },

    // Simulate logout (for testing)
    logout: function() {
      MOCK_SESSION.isAuthenticated = false;
      console.log('[Auth Mock] Simulated logout');
    },

    // Simulate login (for testing)
    login: function() {
      MOCK_SESSION.isAuthenticated = true;
      populateStorage();
      console.log('[Auth Mock] Simulated login');
    }
  };

  console.log('[Auth Mock] Initialized - User session:', MOCK_USER.email);
})();
`;
}

/**
 * Get auth mock as inline script tag
 * @param {Object} options - Configuration options
 * @returns {string} Script tag with auth mock
 */
export function getAuthMockScript(options = {}) {
  return `<script>${generateAuthMock(options)}</script>`;
}

export default {
  generateAuthMock,
  getAuthMockScript
};
