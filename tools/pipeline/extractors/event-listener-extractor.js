/**
 * Event Listener Extractor
 *
 * Captures ALL event listeners attached to elements including:
 * - addEventListener calls (with listener source code)
 * - Inline event handlers (onclick, onmouseover, etc.)
 * - Event delegation patterns
 * - Removal of event listeners
 * - Stack traces for debugging
 */

export const eventListenerExtractor = {
  name: 'event-listener',

  getInjectionScript() {
    return `
(function() {
  if (window.__eventListenerExtractorInstalled) return;
  window.__eventListenerExtractorInstalled = true;

  window.__eventListenersCaptured = {
    listeners: [],
    removed: [],
    inline: [],
  };

  const listenerRegistry = [];
  const removedListeners = [];
  const inlineHandlers = [];

  // Map to track listeners by target for removal matching
  const targetListenerMap = new WeakMap();

  // Generate unique selector for an element
  function getUniqueSelector(el) {
    if (!el || !(el instanceof Element)) return null;

    // Try ID first
    if (el.id) {
      return '#' + CSS.escape(el.id);
    }

    // Try unique class combination
    if (el.classList.length > 0) {
      const classes = Array.from(el.classList).map(c => '.' + CSS.escape(c)).join('');
      const matches = document.querySelectorAll(el.tagName + classes);
      if (matches.length === 1) {
        return el.tagName.toLowerCase() + classes;
      }
    }

    // Use nth-child path
    const path = [];
    let current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector = '#' + CSS.escape(current.id);
        path.unshift(selector);
        break;
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += ':nth-of-type(' + index + ')';
        }
      }
      path.unshift(selector);
      current = parent;
    }

    return path.join(' > ');
  }

  // Extract serializable function info
  function serializeListener(listener) {
    if (typeof listener !== 'function') {
      return { type: 'non-function', value: String(listener) };
    }

    const source = listener.toString();
    const name = listener.name || 'anonymous';

    // Try to detect common patterns
    let pattern = 'custom';
    if (source.includes('setState') || source.includes('useState')) {
      pattern = 'react-state';
    } else if (source.includes('dispatch')) {
      pattern = 'redux-action';
    } else if (source.includes('emit') || source.includes('$emit')) {
      pattern = 'event-emitter';
    } else if (source.includes('navigate') || source.includes('push') || source.includes('router')) {
      pattern = 'navigation';
    } else if (source.includes('fetch') || source.includes('axios') || source.includes('XMLHttpRequest')) {
      pattern = 'network-request';
    } else if (source.includes('classList') || source.includes('className') || source.includes('style')) {
      pattern = 'dom-manipulation';
    }

    return {
      name,
      source: source.slice(0, 1000), // First 1000 chars
      fullLength: source.length,
      pattern,
      isArrow: source.startsWith('(') || source.startsWith('async (') || !source.startsWith('function'),
      isAsync: source.includes('async') || source.includes('.then('),
    };
  }

  // Normalize options
  function normalizeOptions(options) {
    if (typeof options === 'boolean') {
      return { capture: options, passive: false, once: false };
    }
    if (typeof options === 'object' && options !== null) {
      return {
        capture: !!options.capture,
        passive: !!options.passive,
        once: !!options.once,
        signal: options.signal ? 'AbortSignal' : undefined,
      };
    }
    return { capture: false, passive: false, once: false };
  }

  // ============================================
  // INTERCEPT addEventListener
  // ============================================

  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    const target = this;

    // Determine target type
    let selector = null;
    let targetType = 'unknown';

    if (target instanceof Element) {
      selector = getUniqueSelector(target);
      targetType = 'element';
    } else if (target === window) {
      selector = 'window';
      targetType = 'window';
    } else if (target === document) {
      selector = 'document';
      targetType = 'document';
    } else if (target === document.body) {
      selector = 'body';
      targetType = 'body';
    }

    // Capture stack trace for debugging
    let stackTrace = null;
    try {
      throw new Error();
    } catch (e) {
      stackTrace = e.stack.split('\\n').slice(2, 6).join('\\n');
    }

    // Build listener info
    const listenerInfo = {
      id: listenerRegistry.length,
      selector,
      targetType,
      eventType: type,
      listener: serializeListener(listener),
      options: normalizeOptions(options),
      timestamp: Date.now(),
      stackTrace,
      active: true,
    };

    listenerRegistry.push(listenerInfo);

    // Track per-target for removal matching
    if (target instanceof EventTarget) {
      let targetListeners = targetListenerMap.get(target);
      if (!targetListeners) {
        targetListeners = [];
        targetListenerMap.set(target, targetListeners);
      }
      targetListeners.push({
        ...listenerInfo,
        originalListener: listener,
        originalOptions: options,
      });
    }

    return originalAddEventListener.call(this, type, listener, options);
  };

  // ============================================
  // INTERCEPT removeEventListener
  // ============================================

  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.removeEventListener = function(type, listener, options) {
    const target = this;

    // Try to find and mark the listener as removed
    const targetListeners = targetListenerMap.get(target);
    if (targetListeners) {
      const normalizedOptions = normalizeOptions(options);
      const match = targetListeners.find(l =>
        l.eventType === type &&
        l.originalListener === listener &&
        l.options.capture === normalizedOptions.capture &&
        l.active
      );

      if (match) {
        match.active = false;

        // Update registry
        const registryEntry = listenerRegistry[match.id];
        if (registryEntry) {
          registryEntry.active = false;
          registryEntry.removedAt = Date.now();
        }

        removedListeners.push({
          listenerId: match.id,
          eventType: type,
          selector: match.selector,
          timestamp: Date.now(),
        });
      }
    }

    return originalRemoveEventListener.call(this, type, listener, options);
  };

  // ============================================
  // INTERCEPT inline event handlers
  // ============================================

  const inlineEventProps = [
    'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover', 'onmouseout',
    'onmousemove', 'onmouseenter', 'onmouseleave', 'onwheel', 'oncontextmenu',
    'onkeydown', 'onkeyup', 'onkeypress',
    'onfocus', 'onblur', 'oninput', 'onchange', 'onsubmit', 'onreset',
    'ontouchstart', 'ontouchmove', 'ontouchend', 'ontouchcancel',
    'ondragstart', 'ondrag', 'ondragend', 'ondragenter', 'ondragleave', 'ondragover', 'ondrop',
    'onscroll', 'onresize', 'onload', 'onerror',
    'onanimationstart', 'onanimationend', 'onanimationiteration',
    'ontransitionend', 'ontransitionstart', 'ontransitionrun', 'ontransitioncancel',
    'onpointerdown', 'onpointermove', 'onpointerup', 'onpointercancel',
    'onpointerenter', 'onpointerleave', 'onpointerover', 'onpointerout',
  ];

  const originalSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    const lowerName = name.toLowerCase();

    if (lowerName.startsWith('on')) {
      const eventType = lowerName.slice(2);
      const selector = getUniqueSelector(this);

      inlineHandlers.push({
        id: inlineHandlers.length,
        selector,
        eventType,
        handlerSource: String(value).slice(0, 500),
        method: 'setAttribute',
        timestamp: Date.now(),
      });
    }

    return originalSetAttribute.call(this, name, value);
  };

  // Also intercept direct property assignment
  function interceptInlineProperty(proto, propName) {
    const eventType = propName.slice(2);
    const descriptor = Object.getOwnPropertyDescriptor(proto, propName);

    if (descriptor && descriptor.set) {
      const originalSetter = descriptor.set;

      Object.defineProperty(proto, propName, {
        ...descriptor,
        set(value) {
          const selector = getUniqueSelector(this);

          if (value !== null) {
            inlineHandlers.push({
              id: inlineHandlers.length,
              selector,
              eventType,
              handlerSource: value ? (typeof value === 'function' ? value.toString().slice(0, 500) : String(value)) : null,
              method: 'property',
              timestamp: Date.now(),
            });
          }

          return originalSetter.call(this, value);
        }
      });
    }
  }

  // Intercept inline handlers on HTMLElement, SVGElement
  inlineEventProps.forEach(prop => {
    try {
      interceptInlineProperty(HTMLElement.prototype, prop);
    } catch (e) {}
    try {
      interceptInlineProperty(SVGElement.prototype, prop);
    } catch (e) {}
  });

  // Also intercept window inline handlers
  ['onload', 'onerror', 'onresize', 'onscroll', 'onhashchange', 'onpopstate', 'onunload', 'onbeforeunload'].forEach(prop => {
    try {
      const originalDescriptor = Object.getOwnPropertyDescriptor(window, prop);
      if (originalDescriptor) {
        Object.defineProperty(window, prop, {
          ...originalDescriptor,
          set(value) {
            inlineHandlers.push({
              id: inlineHandlers.length,
              selector: 'window',
              eventType: prop.slice(2),
              handlerSource: value ? (typeof value === 'function' ? value.toString().slice(0, 500) : String(value)) : null,
              method: 'window-property',
              timestamp: Date.now(),
            });
            return originalDescriptor.set?.call(this, value);
          }
        });
      }
    } catch (e) {}
  });

  // ============================================
  // SNAPSHOT FUNCTIONS
  // ============================================

  window.__captureEventListeners = function() {
    window.__eventListenersCaptured.listeners = listenerRegistry;
    window.__eventListenersCaptured.removed = removedListeners;
    window.__eventListenersCaptured.inline = inlineHandlers;

    return window.__eventListenersCaptured;
  };

  // Get active listeners only
  window.__getActiveListeners = function() {
    return listenerRegistry.filter(l => l.active);
  };

  // Get listeners for a specific element
  window.__getElementListeners = function(selector) {
    return listenerRegistry.filter(l => l.selector === selector && l.active);
  };

  // Get listeners by event type
  window.__getListenersByType = function(eventType) {
    return listenerRegistry.filter(l => l.eventType === eventType && l.active);
  };

  // Statistics
  window.__getListenerStats = function() {
    const active = listenerRegistry.filter(l => l.active);
    const byType = {};
    const byTarget = {};
    const byPattern = {};

    active.forEach(l => {
      byType[l.eventType] = (byType[l.eventType] || 0) + 1;
      byTarget[l.targetType] = (byTarget[l.targetType] || 0) + 1;
      if (l.listener.pattern) {
        byPattern[l.listener.pattern] = (byPattern[l.listener.pattern] || 0) + 1;
      }
    });

    return {
      total: listenerRegistry.length,
      active: active.length,
      removed: removedListeners.length,
      inline: inlineHandlers.length,
      byType,
      byTarget,
      byPattern,
    };
  };

  console.log('[Event Listener Extractor] Installed');
})();
`;
  },

  async extractData(page) {
    return await page.evaluate(() => {
      if (window.__captureEventListeners) {
        return window.__captureEventListeners();
      }
      return { listeners: [], removed: [], inline: [] };
    });
  },

  async getStats(page) {
    return await page.evaluate(() => {
      if (window.__getListenerStats) {
        return window.__getListenerStats();
      }
      return null;
    });
  },

  async getElementListeners(page, selector) {
    return await page.evaluate((sel) => {
      if (window.__getElementListeners) {
        return window.__getElementListeners(sel);
      }
      return [];
    }, selector);
  },

  generateReplayCode(data) {
    const lines = [];
    lines.push('// Auto-generated event listener bindings');
    lines.push('');

    // Group by selector for cleaner output
    const bySelector = {};
    data.listeners.filter(l => l.active).forEach(l => {
      if (!bySelector[l.selector]) {
        bySelector[l.selector] = [];
      }
      bySelector[l.selector].push(l);
    });

    for (const [selector, listeners] of Object.entries(bySelector)) {
      if (selector === 'window') {
        listeners.forEach(l => {
          lines.push(`window.addEventListener('${l.eventType}', ${l.listener.name || 'handler'});`);
        });
      } else if (selector === 'document') {
        listeners.forEach(l => {
          lines.push(`document.addEventListener('${l.eventType}', ${l.listener.name || 'handler'});`);
        });
      } else {
        lines.push(`// ${selector}`);
        lines.push(`const el = document.querySelector('${selector}');`);
        lines.push(`if (el) {`);
        listeners.forEach(l => {
          const optStr = l.options.capture || l.options.passive || l.options.once
            ? `, { capture: ${l.options.capture}, passive: ${l.options.passive}, once: ${l.options.once} }`
            : '';
          lines.push(`  el.addEventListener('${l.eventType}', ${l.listener.name || 'handler'}${optStr});`);
        });
        lines.push(`}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }
};
