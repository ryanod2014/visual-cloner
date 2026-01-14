/**
 * State Capture, Hashing, and Restoration Module
 * Critical for BFS exploration - enables deduplication and state tracking
 */

const crypto = require('crypto');

// ============================================================================
// Internal Helpers (not exported)
// ============================================================================

/**
 * Serialize DOM to a minimal structure for comparison
 */
function serializeDOM(document) {
  const elements = [];
  const visibleElements = getVisibleElements(document);

  for (const el of visibleElements) {
    elements.push({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: Array.from(el.classList).sort(),
      text: el.textContent?.trim().slice(0, 100) || null,
      href: el.href || null,
      type: el.type || null
    });
  }

  return elements;
}

/**
 * Get only visible elements from document
 */
function getVisibleElements(document) {
  const all = document.querySelectorAll('*');
  const visible = [];

  for (const el of all) {
    const style = window.getComputedStyle(el);
    const isVisible = style.display !== 'none' &&
                      style.visibility !== 'hidden' &&
                      style.opacity !== '0' &&
                      el.offsetWidth > 0 &&
                      el.offsetHeight > 0;

    if (isVisible && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK'].includes(el.tagName)) {
      visible.push(el);
    }
  }

  return visible;
}

/**
 * Capture all form field values
 */
function captureFormState(document) {
  const forms = {};
  const inputs = document.querySelectorAll('input, select, textarea');

  for (const input of inputs) {
    const selector = generateSelector(input);

    if (input.type === 'checkbox' || input.type === 'radio') {
      forms[selector] = input.checked;
    } else if (input.tagName === 'SELECT') {
      forms[selector] = Array.from(input.selectedOptions).map(o => o.value);
    } else {
      forms[selector] = input.value;
    }
  }

  return forms;
}

/**
 * Generate a unique selector for an element
 */
function generateSelector(el) {
  if (el.id) return `#${el.id}`;
  if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;

  const path = [];
  let current = el;

  while (current && current.tagName) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector = `#${current.id}`;
      path.unshift(selector);
      break;
    }

    const siblings = current.parentElement?.children || [];
    const sameTag = Array.from(siblings).filter(s => s.tagName === current.tagName);
    if (sameTag.length > 1) {
      const index = sameTag.indexOf(current) + 1;
      selector += `:nth-of-type(${index})`;
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Create canonical hash from state for deduplication
 * Deterministic - same state always produces same hash
 */
function hashState(state) {
  const canonical = {
    url: state.url,
    dom: state.dom,
    forms: state.forms
  };

  const str = JSON.stringify(canonical, Object.keys(canonical).sort());
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Compare two states for equality using hash comparison
 */
function statesEqual(state1, state2) {
  return state1.hash === state2.hash;
}

/**
 * Compute what changed between two states
 */
function computeStateDelta(before, after) {
  const urlChanged = before.url !== after.url;
  const domChanged = JSON.stringify(before.dom) !== JSON.stringify(after.dom);
  const formsChanged = JSON.stringify(before.forms) !== JSON.stringify(after.forms);
  const storageChanged = JSON.stringify(before.storage) !== JSON.stringify(after.storage);

  const changedElements = [];

  if (formsChanged) {
    const allKeys = new Set([...Object.keys(before.forms), ...Object.keys(after.forms)]);
    for (const key of allKeys) {
      if (JSON.stringify(before.forms[key]) !== JSON.stringify(after.forms[key])) {
        changedElements.push(key);
      }
    }
  }

  const hasChanges = urlChanged || domChanged || formsChanged || storageChanged;

  const changes = [];
  if (urlChanged) changes.push('URL');
  if (domChanged) changes.push('DOM');
  if (formsChanged) changes.push(`forms (${changedElements.length} fields)`);
  if (storageChanged) changes.push('storage');

  return {
    hasChanges,
    urlChanged,
    domChanged,
    formsChanged,
    storageChanged,
    changedElements,
    summary: hasChanges ? `Changed: ${changes.join(', ')}` : 'No changes'
  };
}

/**
 * Capture complete application state
 */
async function captureState(page) {
  const state = await page.evaluate(() => {
    // Re-define helpers inside evaluate context
    function getVisibleElements(doc) {
      const all = doc.querySelectorAll('*');
      const visible = [];
      for (const el of all) {
        const style = window.getComputedStyle(el);
        const isVisible = style.display !== 'none' &&
                          style.visibility !== 'hidden' &&
                          style.opacity !== '0' &&
                          el.offsetWidth > 0 &&
                          el.offsetHeight > 0;
        if (isVisible && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK'].includes(el.tagName)) {
          visible.push(el);
        }
      }
      return visible;
    }

    function generateSelector(el) {
      if (el.id) return `#${el.id}`;
      if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
      const path = [];
      let current = el;
      while (current && current.tagName) {
        let selector = current.tagName.toLowerCase();
        if (current.id) {
          path.unshift(`#${current.id}`);
          break;
        }
        const siblings = current.parentElement?.children || [];
        const sameTag = Array.from(siblings).filter(s => s.tagName === current.tagName);
        if (sameTag.length > 1) {
          selector += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
        }
        path.unshift(selector);
        current = current.parentElement;
      }
      return path.join(' > ');
    }

    const visibleElements = getVisibleElements(document);
    const dom = visibleElements.map(el => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: Array.from(el.classList).sort(),
      text: el.textContent?.trim().slice(0, 100) || null,
      href: el.href || null,
      type: el.type || null
    }));

    const forms = {};
    const inputs = document.querySelectorAll('input, select, textarea');
    for (const input of inputs) {
      const selector = generateSelector(input);
      if (input.type === 'checkbox' || input.type === 'radio') {
        forms[selector] = input.checked;
      } else if (input.tagName === 'SELECT') {
        forms[selector] = Array.from(input.selectedOptions).map(o => o.value);
      } else {
        forms[selector] = input.value;
      }
    }

    const activeEl = document.activeElement;
    const activeSelector = activeEl && activeEl !== document.body ? generateSelector(activeEl) : null;

    return {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      dom,
      forms,
      storage: {
        localStorage: { ...localStorage },
        sessionStorage: { ...sessionStorage }
      },
      scroll: { x: window.scrollX, y: window.scrollY },
      activeElement: activeSelector
    };
  });

  state.hash = hashState(state);
  return state;
}

/**
 * Lighter weight capture for quick comparisons
 */
async function captureStateSnapshot(page) {
  const snapshot = await page.evaluate(() => {
    const visibleCount = Array.from(document.querySelectorAll('*')).filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0;
    }).length;

    const forms = {};
    const inputs = document.querySelectorAll('input, select, textarea');
    for (const input of inputs) {
      const key = input.id || input.name || `${input.tagName}-${Array.from(inputs).indexOf(input)}`;
      forms[key] = input.type === 'checkbox' ? input.checked : input.value;
    }

    return {
      url: window.location.href,
      visibleElementCount: visibleCount,
      forms
    };
  });

  snapshot.hash = crypto.createHash('sha256')
    .update(JSON.stringify(snapshot))
    .digest('hex');

  return snapshot;
}

/**
 * Restore page to a captured state (best-effort)
 */
async function restoreState(page, state) {
  try {
    const currentUrl = page.url();
    if (currentUrl !== state.url) {
      await page.goto(state.url, { waitUntil: 'domcontentloaded' });
    }

    await page.evaluate((stateData) => {
      // Restore storage
      if (stateData.storage?.localStorage) {
        localStorage.clear();
        for (const [key, value] of Object.entries(stateData.storage.localStorage)) {
          localStorage.setItem(key, value);
        }
      }
      if (stateData.storage?.sessionStorage) {
        sessionStorage.clear();
        for (const [key, value] of Object.entries(stateData.storage.sessionStorage)) {
          sessionStorage.setItem(key, value);
        }
      }

      // Restore form values
      for (const [selector, value] of Object.entries(stateData.forms)) {
        try {
          const el = document.querySelector(selector);
          if (!el) continue;

          if (el.type === 'checkbox' || el.type === 'radio') {
            el.checked = value;
          } else if (el.tagName === 'SELECT' && Array.isArray(value)) {
            for (const opt of el.options) {
              opt.selected = value.includes(opt.value);
            }
          } else {
            el.value = value;
          }
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) { /* best effort */ }
      }

      // Restore scroll
      if (stateData.scroll) {
        window.scrollTo(stateData.scroll.x, stateData.scroll.y);
      }
    }, state);

    return true;
  } catch (error) {
    console.error('State restoration failed:', error.message);
    return false;
  }
}

module.exports = {
  captureState,
  hashState,
  captureStateSnapshot,
  restoreState,
  statesEqual,
  computeStateDelta
};
