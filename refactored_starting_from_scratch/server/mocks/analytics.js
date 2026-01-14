/**
 * Analytics Stub
 * No-op implementations of gtag, fbq, etc.
 * Prevents errors without tracking
 */

/**
 * Generate analytics stub script for injection
 * @param {Object} options - Configuration options
 * @param {boolean} options.verbose - Log analytics calls
 * @returns {string} JavaScript code to inject
 */
export function generateAnalyticsMock(options = {}) {
  const verbose = options.verbose || false;

  return `
// =============================================================================
// ANALYTICS STUB - No-op Implementations
// =============================================================================
(function() {
  'use strict';

  const VERBOSE = ${verbose};
  const analyticsLog = [];

  // Helper to log analytics calls
  function logAnalytics(provider, method, args) {
    const entry = {
      timestamp: Date.now(),
      provider: provider,
      method: method,
      args: Array.from(args)
    };

    analyticsLog.push(entry);

    if (VERBOSE) {
      console.log('[Analytics Stub] ' + provider + '.' + method, args);
    }
  }

  // ==========================================================================
  // Google Analytics / gtag
  // ==========================================================================
  window.dataLayer = window.dataLayer || [];

  window.gtag = function() {
    logAnalytics('gtag', arguments[0], arguments);
    window.dataLayer.push(arguments);
  };

  // Legacy ga() function
  window.ga = window.ga || function() {
    logAnalytics('ga', 'send', arguments);
    (window.ga.q = window.ga.q || []).push(arguments);
  };
  window.ga.l = Date.now();

  // Google Tag Manager
  window.google_tag_manager = window.google_tag_manager || {};

  // ==========================================================================
  // Facebook Pixel
  // ==========================================================================
  window.fbq = window.fbq || function() {
    logAnalytics('fbq', arguments[0], arguments);
    (window.fbq.q = window.fbq.q || []).push(arguments);
  };
  window.fbq.loaded = true;
  window.fbq.version = '2.0';
  window._fbq = window.fbq;

  // ==========================================================================
  // Twitter/X Pixel
  // ==========================================================================
  window.twq = window.twq || function() {
    logAnalytics('twq', arguments[0], arguments);
    (window.twq.q = window.twq.q || []).push(arguments);
  };

  // ==========================================================================
  // LinkedIn Insight Tag
  // ==========================================================================
  window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
  window.lintrk = window.lintrk || function(action, data) {
    logAnalytics('lintrk', action, arguments);
  };

  // ==========================================================================
  // Segment
  // ==========================================================================
  window.analytics = window.analytics || {
    track: function() { logAnalytics('segment', 'track', arguments); },
    page: function() { logAnalytics('segment', 'page', arguments); },
    identify: function() { logAnalytics('segment', 'identify', arguments); },
    group: function() { logAnalytics('segment', 'group', arguments); },
    alias: function() { logAnalytics('segment', 'alias', arguments); },
    ready: function(cb) { if (cb) cb(); },
    reset: function() { logAnalytics('segment', 'reset', arguments); },
    user: function() { return { id: function() { return 'mock-user'; } }; },
    load: function() { logAnalytics('segment', 'load', arguments); },
    _writeKey: 'mock-key'
  };

  // ==========================================================================
  // Mixpanel
  // ==========================================================================
  window.mixpanel = window.mixpanel || {
    track: function() { logAnalytics('mixpanel', 'track', arguments); },
    identify: function() { logAnalytics('mixpanel', 'identify', arguments); },
    alias: function() { logAnalytics('mixpanel', 'alias', arguments); },
    people: {
      set: function() { logAnalytics('mixpanel', 'people.set', arguments); },
      increment: function() { logAnalytics('mixpanel', 'people.increment', arguments); }
    },
    register: function() { logAnalytics('mixpanel', 'register', arguments); },
    init: function() { logAnalytics('mixpanel', 'init', arguments); }
  };

  // ==========================================================================
  // Amplitude
  // ==========================================================================
  window.amplitude = window.amplitude || {
    getInstance: function() {
      return {
        logEvent: function() { logAnalytics('amplitude', 'logEvent', arguments); },
        setUserId: function() { logAnalytics('amplitude', 'setUserId', arguments); },
        setUserProperties: function() { logAnalytics('amplitude', 'setUserProperties', arguments); },
        init: function() { logAnalytics('amplitude', 'init', arguments); }
      };
    }
  };

  // ==========================================================================
  // Heap
  // ==========================================================================
  window.heap = window.heap || {
    track: function() { logAnalytics('heap', 'track', arguments); },
    identify: function() { logAnalytics('heap', 'identify', arguments); },
    addUserProperties: function() { logAnalytics('heap', 'addUserProperties', arguments); },
    addEventProperties: function() { logAnalytics('heap', 'addEventProperties', arguments); },
    load: function() { logAnalytics('heap', 'load', arguments); }
  };

  // ==========================================================================
  // Hotjar
  // ==========================================================================
  window.hj = window.hj || function() {
    logAnalytics('hotjar', 'hj', arguments);
    (window.hj.q = window.hj.q || []).push(arguments);
  };
  window._hjSettings = window._hjSettings || { hjid: 0, hjsv: 6 };

  // ==========================================================================
  // Intercom
  // ==========================================================================
  window.Intercom = window.Intercom || function() {
    logAnalytics('intercom', arguments[0], arguments);
    (window.Intercom.q = window.Intercom.q || []).push(arguments);
  };
  window.Intercom.booted = true;

  // ==========================================================================
  // Drift
  // ==========================================================================
  window.drift = window.drift || {
    on: function() { logAnalytics('drift', 'on', arguments); },
    off: function() { logAnalytics('drift', 'off', arguments); },
    track: function() { logAnalytics('drift', 'track', arguments); },
    identify: function() { logAnalytics('drift', 'identify', arguments); },
    reset: function() { logAnalytics('drift', 'reset', arguments); },
    page: function() { logAnalytics('drift', 'page', arguments); },
    SNIPPET_VERSION: '0.3.1'
  };

  // ==========================================================================
  // Sentry (Error tracking)
  // ==========================================================================
  window.Sentry = window.Sentry || {
    init: function() { logAnalytics('sentry', 'init', arguments); },
    captureException: function() { logAnalytics('sentry', 'captureException', arguments); },
    captureMessage: function() { logAnalytics('sentry', 'captureMessage', arguments); },
    setUser: function() { logAnalytics('sentry', 'setUser', arguments); },
    setTag: function() { logAnalytics('sentry', 'setTag', arguments); },
    setExtra: function() { logAnalytics('sentry', 'setExtra', arguments); },
    addBreadcrumb: function() { logAnalytics('sentry', 'addBreadcrumb', arguments); },
    withScope: function(cb) { if (cb) cb({ setTag: function() {} }); }
  };

  // ==========================================================================
  // LogRocket
  // ==========================================================================
  window.LogRocket = window.LogRocket || {
    init: function() { logAnalytics('logrocket', 'init', arguments); },
    identify: function() { logAnalytics('logrocket', 'identify', arguments); },
    track: function() { logAnalytics('logrocket', 'track', arguments); },
    getSessionURL: function() { return 'https://mock.logrocket.io/session'; }
  };

  // ==========================================================================
  // FullStory
  // ==========================================================================
  window.FS = window.FS || {
    identify: function() { logAnalytics('fullstory', 'identify', arguments); },
    setUserVars: function() { logAnalytics('fullstory', 'setUserVars', arguments); },
    event: function() { logAnalytics('fullstory', 'event', arguments); },
    shutdown: function() { logAnalytics('fullstory', 'shutdown', arguments); },
    restart: function() { logAnalytics('fullstory', 'restart', arguments); }
  };

  // ==========================================================================
  // Google Ads Conversion Tracking
  // ==========================================================================
  window.gtag_report_conversion = function() {
    logAnalytics('google_ads', 'conversion', arguments);
    return false;
  };

  // ==========================================================================
  // Crisp Chat
  // ==========================================================================
  window.$crisp = window.$crisp || [];
  window.CRISP_WEBSITE_ID = window.CRISP_WEBSITE_ID || 'mock-id';

  // ==========================================================================
  // Zendesk Widget
  // ==========================================================================
  window.zE = window.zE || function() {
    logAnalytics('zendesk', 'zE', arguments);
  };

  // ==========================================================================
  // Expose analytics stub utilities
  // ==========================================================================
  window.__ANALYTICS_STUB__ = {
    enabled: true,
    verbose: VERBOSE,
    log: analyticsLog,

    // Get all logged analytics calls
    getLog: function() {
      return analyticsLog;
    },

    // Clear the log
    clearLog: function() {
      analyticsLog.length = 0;
    },

    // Toggle verbose logging
    setVerbose: function(enabled) {
      // Note: Can't change const, but this is for API completeness
      console.log('[Analytics Stub] Verbose mode:', enabled);
    },

    // Get calls by provider
    getByProvider: function(provider) {
      return analyticsLog.filter(function(entry) {
        return entry.provider === provider;
      });
    }
  };

  console.log('[Analytics Stub] Initialized - All analytics calls will be no-ops');
})();
`;
}

/**
 * Get analytics mock as inline script tag
 * @param {Object} options - Configuration options
 * @returns {string} Script tag with analytics mock
 */
export function getAnalyticsMockScript(options = {}) {
  return `<script>${generateAnalyticsMock(options)}</script>`;
}

export default {
  generateAnalyticsMock,
  getAnalyticsMockScript
};
