/**
 * Scroll & Intersection Observer Extractor
 *
 * Captures scroll-linked and visibility-triggered behaviors:
 * - Scroll event handlers and their effects
 * - IntersectionObserver callbacks and thresholds
 * - Scroll-linked animations/transforms
 * - Parallax effects
 * - Sticky element behavior
 */

export const scrollIntersectionExtractor = {
  name: 'scroll-intersection',

  getInjectionScript() {
    return `
(function() {
  if (window.__scrollIntersectionExtractorInstalled) return;
  window.__scrollIntersectionExtractorInstalled = true;

  window.__scrollIntersectionCaptured = {
    scrollEvents: [],
    intersectionCallbacks: [],
    observedElements: [],
    stickyElements: [],
    parallaxElements: [],
    scrollPositions: [],
  };

  let lastScrollCapture = 0;
  const SCROLL_THROTTLE = 100; // ms

  function getUniqueSelector(el) {
    if (el.id) return '#' + el.id;
    if (el === document.body) return 'body';
    if (el === window || el === document) return 'window';

    const path = [];
    while (el && el !== document.body) {
      let selector = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        selector += '.' + el.className.trim().split(/\\s+/).join('.');
      }
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
        if (siblings.length > 1) {
          selector += ':nth-of-type(' + (siblings.indexOf(el) + 1) + ')';
        }
      }
      path.unshift(selector);
      el = parent;
    }
    return path.join(' > ');
  }

  // ============================================
  // TRACK SCROLL EVENTS
  // ============================================

  const scrollableElements = new Set();

  function captureScrollState(target) {
    const now = Date.now();
    if (now - lastScrollCapture < SCROLL_THROTTLE) return;
    lastScrollCapture = now;

    const scrollData = {
      timestamp: now,
      window: {
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        innerHeight: window.innerHeight,
        innerWidth: window.innerWidth,
      },
    };

    if (target && target !== window && target !== document) {
      scrollData.element = {
        selector: getUniqueSelector(target),
        scrollTop: target.scrollTop,
        scrollLeft: target.scrollLeft,
        scrollHeight: target.scrollHeight,
        scrollWidth: target.scrollWidth,
        clientHeight: target.clientHeight,
        clientWidth: target.clientWidth,
      };
    }

    window.__scrollIntersectionCaptured.scrollPositions.push(scrollData);
  }

  // Capture window scroll
  window.addEventListener('scroll', () => {
    captureScrollState(window);
  }, { passive: true, capture: true });

  // Intercept addEventListener to track scroll listeners
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (type === 'scroll') {
      const selector = this === window ? 'window' :
                       this === document ? 'document' :
                       getUniqueSelector(this);

      scrollableElements.add(this);

      window.__scrollIntersectionCaptured.scrollEvents.push({
        type: 'listenerAdded',
        target: selector,
        hasOptions: !!options,
        passive: options?.passive,
        capture: options?.capture,
        timestamp: Date.now(),
      });

      // Wrap the listener to capture its effects
      const wrappedListener = function(e) {
        captureScrollState(e.target);
        return listener.call(this, e);
      };

      return originalAddEventListener.call(this, type, wrappedListener, options);
    }

    return originalAddEventListener.call(this, type, listener, options);
  };

  // ============================================
  // INTERCEPT INTERSECTION OBSERVER
  // ============================================

  const OriginalIntersectionObserver = window.IntersectionObserver;
  let observerCounter = 0;

  window.IntersectionObserver = function(callback, options) {
    const observerId = observerCounter++;

    // Wrap callback to capture intersection events
    const wrappedCallback = function(entries, observer) {
      entries.forEach(entry => {
        window.__scrollIntersectionCaptured.intersectionCallbacks.push({
          observerId,
          selector: getUniqueSelector(entry.target),
          isIntersecting: entry.isIntersecting,
          intersectionRatio: entry.intersectionRatio,
          boundingClientRect: {
            top: entry.boundingClientRect.top,
            left: entry.boundingClientRect.left,
            width: entry.boundingClientRect.width,
            height: entry.boundingClientRect.height,
          },
          timestamp: Date.now(),
        });
      });

      return callback.call(this, entries, observer);
    };

    const observer = new OriginalIntersectionObserver(wrappedCallback, options);

    // Store options for reference
    window.__scrollIntersectionCaptured.observedElements.push({
      observerId,
      options: {
        root: options?.root ? getUniqueSelector(options.root) : null,
        rootMargin: options?.rootMargin || '0px',
        threshold: options?.threshold || 0,
      },
      targets: [],
    });

    // Wrap observe to track which elements are observed
    const originalObserve = observer.observe.bind(observer);
    observer.observe = function(target) {
      const observerData = window.__scrollIntersectionCaptured.observedElements.find(o => o.observerId === observerId);
      if (observerData) {
        observerData.targets.push(getUniqueSelector(target));
      }
      return originalObserve(target);
    };

    return observer;
  };

  // Copy static properties
  Object.setPrototypeOf(window.IntersectionObserver, OriginalIntersectionObserver);
  window.IntersectionObserver.prototype = OriginalIntersectionObserver.prototype;

  // ============================================
  // DETECT STICKY ELEMENTS
  // ============================================

  function detectStickyElements() {
    const sticky = [];
    document.querySelectorAll('*').forEach(el => {
      const style = getComputedStyle(el);
      if (style.position === 'sticky') {
        sticky.push({
          selector: getUniqueSelector(el),
          top: style.top,
          bottom: style.bottom,
          left: style.left,
          right: style.right,
          zIndex: style.zIndex,
        });
      }
    });
    return sticky;
  }

  // ============================================
  // DETECT SCROLL-LINKED TRANSFORMS
  // ============================================

  function detectParallaxElements() {
    const parallax = [];
    document.querySelectorAll('[data-parallax], [data-scroll], [data-speed]').forEach(el => {
      parallax.push({
        selector: getUniqueSelector(el),
        attributes: {
          parallax: el.getAttribute('data-parallax'),
          scroll: el.getAttribute('data-scroll'),
          speed: el.getAttribute('data-speed'),
        },
      });
    });
    return parallax;
  }

  // ============================================
  // SNAPSHOT FUNCTION
  // ============================================

  window.__captureScrollState = function() {
    window.__scrollIntersectionCaptured.stickyElements = detectStickyElements();
    window.__scrollIntersectionCaptured.parallaxElements = detectParallaxElements();

    // Capture current scroll position
    captureScrollState(window);

    return window.__scrollIntersectionCaptured;
  };

  // Initial capture
  if (document.readyState === 'complete') {
    window.__captureScrollState();
  } else {
    window.addEventListener('load', () => window.__captureScrollState());
  }

  console.log('[Scroll/Intersection Extractor] Installed');
})();
`;
  },

  async extractData(page) {
    return await page.evaluate(() => {
      if (window.__captureScrollState) {
        return window.__captureScrollState();
      }
      return window.__scrollIntersectionCaptured || {
        scrollEvents: [],
        intersectionCallbacks: [],
        observedElements: [],
        stickyElements: [],
        parallaxElements: [],
        scrollPositions: [],
      };
    });
  },

  generateReplayCode(data) {
    if (!data.observedElements.length && !data.stickyElements.length && !data.intersectionCallbacks.length) {
      return null;
    }

    const lines = [];
    lines.push('// Scroll & Intersection Observer Replay Code');
    lines.push('');

    // Generate sticky element styles
    if (data.stickyElements.length) {
      lines.push('export const stickyElementStyles = {');
      data.stickyElements.forEach(el => {
        lines.push(`  '${el.selector}': {`);
        lines.push(`    position: 'sticky',`);
        lines.push(`    top: '${el.top}',`);
        if (el.zIndex !== 'auto') {
          lines.push(`    zIndex: '${el.zIndex}',`);
        }
        lines.push(`  },`);
      });
      lines.push('};');
      lines.push('');
    }

    // Generate intersection observer setup
    if (data.observedElements.length) {
      lines.push('export function setupIntersectionObservers(callbacks) {');
      data.observedElements.forEach((obs, i) => {
        lines.push(`  // Observer ${obs.observerId}`);
        lines.push(`  const observer${i} = new IntersectionObserver(callbacks[${i}] || (() => {}), {`);
        lines.push(`    rootMargin: '${obs.options.rootMargin}',`);
        lines.push(`    threshold: ${JSON.stringify(obs.options.threshold)},`);
        lines.push(`  });`);
        obs.targets.forEach(target => {
          lines.push(`  document.querySelector('${target}')?.let(el => observer${i}.observe(el));`);
        });
        lines.push('');
      });
      lines.push('}');
      lines.push('');
    }

    // Generate intersection callback replay
    if (data.intersectionCallbacks.length) {
      // Group by selector for visibility states
      const bySelector = {};
      data.intersectionCallbacks.forEach(cb => {
        if (!bySelector[cb.selector]) bySelector[cb.selector] = [];
        bySelector[cb.selector].push({
          isIntersecting: cb.isIntersecting,
          ratio: cb.intersectionRatio,
        });
      });

      lines.push('export const intersectionStates = {');
      Object.entries(bySelector).forEach(([selector, states]) => {
        const lastState = states[states.length - 1];
        lines.push(`  '${selector}': { isIntersecting: ${lastState.isIntersecting}, ratio: ${lastState.ratio} },`);
      });
      lines.push('};');
    }

    return lines.join('\n');
  },
};

export default scrollIntersectionExtractor;
