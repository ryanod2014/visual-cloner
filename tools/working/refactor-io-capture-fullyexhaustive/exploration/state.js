/**
 * State management - capture, hash, and restore application state
 */
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Capture complete application state
 */
async function captureState(page) {
  const state = await page.evaluate(() => {
    return {
      // URL
      url: {
        href: location.href,
        pathname: location.pathname,
        search: location.search,
        hash: location.hash
      },

      // Visible DOM fingerprint
      domFingerprint: captureDOMFingerprint(),

      // Form values
      formState: captureFormState(),

      // Storage
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage },

      // Focus
      activeElement: document.activeElement?.tagName || null
    };

    function captureDOMFingerprint() {
      const parts = [];
      document.querySelectorAll('*').forEach(el => {
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        // Only visible elements
        if (rect.width === 0 || rect.height === 0) return;
        if (cs.display === 'none' || cs.visibility === 'hidden') return;

        parts.push([
          el.tagName,
          el.className || '',
          cs.display,
          el.getAttribute('aria-expanded'),
          el.getAttribute('aria-selected'),
          el.getAttribute('data-state'),
          el.getAttribute('aria-hidden')
        ].join('|'));
      });
      return parts.join('\n');
    }

    function captureFormState() {
      const state = {};
      document.querySelectorAll('input, select, textarea').forEach((el, i) => {
        const key = el.id || el.name || `anon_${i}`;
        state[key] = {
          value: el.value,
          checked: el.checked,
          selectedIndex: el.selectedIndex
        };
      });
      return state;
    }
  });

  state.timestamp = Date.now();
  state.hash = hashState(state);

  return state;
}

/**
 * Create canonical hash of state for comparison
 */
function hashState(state) {
  const canonical = {
    url: state.url.href,
    dom: state.domFingerprint,
    forms: state.formState
  };

  const str = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

/**
 * Hash state directly from page (for quick comparison)
 */
async function hashStatePage(page) {
  const state = await captureState(page);
  return state.hash;
}

/**
 * Restore state by navigating and setting values
 * Note: Full restore may require page reload
 */
async function restoreState(page, state) {
  // Navigate if URL changed
  const currentUrl = page.url();
  if (currentUrl !== state.url.href) {
    await page.goto(state.url.href, { waitUntil: 'networkidle' });
  }

  // Restore form values
  await page.evaluate((formState) => {
    for (const [key, val] of Object.entries(formState)) {
      const el = document.getElementById(key) || document.querySelector(`[name="${key}"]`);
      if (el) {
        if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = val.checked;
        } else if (el.tagName === 'SELECT') {
          el.selectedIndex = val.selectedIndex;
        } else {
          el.value = val.value;
        }
      }
    }
  }, state.formState);

  // Restore storage
  await page.evaluate((localStorage, sessionStorage) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    Object.assign(window.localStorage, localStorage);
    Object.assign(window.sessionStorage, sessionStorage);
  }, state.localStorage, state.sessionStorage);
}

/**
 * Compare two states
 */
function statesEqual(s1, s2) {
  return s1.hash === s2.hash;
}

module.exports = {
  captureState,
  hashState,
  hashStatePage,
  restoreState,
  statesEqual
};
