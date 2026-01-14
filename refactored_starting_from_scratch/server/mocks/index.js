/**
 * Mock Registry
 * Exports all mocks as injectable scripts
 */

import { generateApiMock, getApiMockScript } from './api.js';
import { generateAuthMock, getAuthMockScript } from './auth.js';
import { generateAnalyticsMock, getAnalyticsMockScript } from './analytics.js';

/**
 * Get all mocks combined as a single injectable script
 * @param {Object} options - Configuration options
 * @param {boolean} options.api - Include API mock (default: true)
 * @param {boolean} options.auth - Include auth mock (default: true)
 * @param {boolean} options.analytics - Include analytics mock (default: true)
 * @param {Object} options.authConfig - Auth mock configuration
 * @param {Object} options.analyticsConfig - Analytics mock configuration
 * @returns {string} Combined JavaScript code
 */
export function generateAllMocks(options = {}) {
  const includeApi = options.api !== false;
  const includeAuth = options.auth !== false;
  const includeAnalytics = options.analytics !== false;

  const parts = [];

  parts.push(`
// =============================================================================
// VISUAL CLONER RUNTIME MOCKS
// Generated at: ${new Date().toISOString()}
// =============================================================================
`);

  if (includeAnalytics) {
    parts.push(generateAnalyticsMock(options.analyticsConfig));
  }

  if (includeAuth) {
    parts.push(generateAuthMock(options.authConfig));
  }

  if (includeApi) {
    parts.push(generateApiMock(options.apiConfig));
  }

  parts.push(`
// =============================================================================
// MOCK REGISTRY INITIALIZED
// =============================================================================
window.__MOCKS_INITIALIZED__ = true;
window.__MOCKS_CONFIG__ = ${JSON.stringify({
  api: includeApi,
  auth: includeAuth,
  analytics: includeAnalytics
})};
console.log('[Mocks] All runtime mocks initialized');
`);

  return parts.join('\n');
}

/**
 * Get all mocks as a single script tag
 * @param {Object} options - Configuration options
 * @returns {string} Script tag with all mocks
 */
export function getAllMocksScript(options = {}) {
  return `<script>${generateAllMocks(options)}</script>`;
}

/**
 * Get mocks as separate script tags
 * @param {Object} options - Configuration options
 * @returns {Object} Object with individual script tags
 */
export function getMockScripts(options = {}) {
  return {
    api: options.api !== false ? getApiMockScript() : '',
    auth: options.auth !== false ? getAuthMockScript(options.authConfig) : '',
    analytics: options.analytics !== false ? getAnalyticsMockScript(options.analyticsConfig) : ''
  };
}

/**
 * Get mock code for writing to file
 * @param {Object} options - Configuration options
 * @returns {Object} Object with mock code strings
 */
export function getMockCode(options = {}) {
  return {
    api: generateApiMock(options.apiConfig),
    auth: generateAuthMock(options.authConfig),
    analytics: generateAnalyticsMock(options.analyticsConfig),
    all: generateAllMocks(options)
  };
}

/**
 * Available mock types
 */
export const MOCK_TYPES = {
  API: 'api',
  AUTH: 'auth',
  ANALYTICS: 'analytics'
};

/**
 * Default mock configuration
 */
export const DEFAULT_CONFIG = {
  api: true,
  auth: true,
  analytics: true,
  authConfig: {
    user: {
      id: 1,
      name: 'Mock User',
      email: 'mock@example.com'
    }
  },
  analyticsConfig: {
    verbose: false
  }
};

export {
  generateApiMock,
  getApiMockScript,
  generateAuthMock,
  getAuthMockScript,
  generateAnalyticsMock,
  getAnalyticsMockScript
};

export default {
  generateAllMocks,
  getAllMocksScript,
  getMockScripts,
  getMockCode,
  MOCK_TYPES,
  DEFAULT_CONFIG,
  api: { generateApiMock, getApiMockScript },
  auth: { generateAuthMock, getAuthMockScript },
  analytics: { generateAnalyticsMock, getAnalyticsMockScript }
};
