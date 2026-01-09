/**
 * Universal Behavior Recorder
 *
 * Captures ALL observable behavior from ANY web application:
 * - User events (mouse, keyboard, touch, pointer)
 * - Network activity (fetch, XHR, WebSocket)
 * - Storage operations (localStorage, sessionStorage, IndexedDB)
 * - DOM mutations
 * - Canvas operations
 * - Navigation/history changes
 * - Console output
 * - Timer activity
 *
 * Works without any knowledge of the app's framework or architecture.
 */

/**
 * This script is injected into the page via page.evaluateOnNewDocument()
 * It must be a string that creates window.__RECORDER__
 */
export const RECORDER_INJECTION_SCRIPT = `
(function() {
  // Prevent double initialization
  if (window.__RECORDER__) return;

  window.__RECORDER__ = {
    // Configuration
    config: {
      maxLogSize: 100000,        // Max entries before rotation
      captureMouseMove: false,   // mousemove is very noisy
      captureScroll: false,      // scroll is also noisy
      truncateValues: 10000,     // Max string length for values
      consoleCapture: true,      // Capture console.log etc
      timerCapture: false,       // Capture setTimeout/setInterval (noisy)
    },

    // Main log storage
    log: [],
    stateSnapshots: [],
    errors: [],

    // Tracking
    startTime: Date.now(),
    eventCounter: 0,

    // ═══════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════

    init() {
      console.log('[Recorder] Initializing universal recorder...');

      this.hookUserEvents();
      this.hookNetwork();
      this.hookStorage();
      this.hookDOM();
      this.hookCanvas();
      this.hookHistory();

      if (this.config.consoleCapture) {
        this.hookConsole();
      }
      if (this.config.timerCapture) {
        this.hookTimers();
      }

      // Take initial state snapshot when DOM is ready
      if (document.readyState === 'complete') {
        this.captureStateSnapshot('init');
      } else {
        window.addEventListener('load', () => {
          this.captureStateSnapshot('init');
        });
      }

      console.log('[Recorder] Initialization complete');
    },

    // ═══════════════════════════════════════════════════════════════
    // USER EVENT HOOKS
    // ═══════════════════════════════════════════════════════════════

    hookUserEvents() {
      const captureEvents = [
        // Mouse events
        'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu',
        // Keyboard events
        'keydown', 'keyup', 'keypress',
        // Pointer events (unified mouse/touch/pen)
        'pointerdown', 'pointerup', 'pointercancel',
        // Touch events
        'touchstart', 'touchend', 'touchcancel',
        // Drag events
        'dragstart', 'drag', 'dragend', 'dragenter', 'dragleave', 'dragover', 'drop',
        // Form events
        'focus', 'blur', 'input', 'change', 'submit', 'reset',
        // Clipboard
        'copy', 'cut', 'paste',
        // Selection
        'select', 'selectstart'
      ];

      // Optionally capture noisy events
      if (this.config.captureMouseMove) {
        captureEvents.push('mousemove', 'pointermove', 'touchmove');
      }
      if (this.config.captureScroll) {
        captureEvents.push('scroll', 'wheel');
      }

      captureEvents.forEach(eventType => {
        document.addEventListener(eventType, (e) => {
          this.logEntry({
            category: 'user-event',
            type: eventType,
            target: this.describeElement(e.target),
            position: {
              clientX: e.clientX,
              clientY: e.clientY,
              pageX: e.pageX,
              pageY: e.pageY
            },
            key: e.key,
            code: e.code,
            button: e.button,
            buttons: e.buttons,
            modifiers: {
              ctrl: e.ctrlKey,
              shift: e.shiftKey,
              alt: e.altKey,
              meta: e.metaKey
            },
            value: e.target?.value?.substring?.(0, 1000),
            checked: e.target?.checked,
            selectedIndex: e.target?.selectedIndex,
            // For drag events
            dataTransfer: e.dataTransfer ? {
              types: Array.from(e.dataTransfer.types || []),
              effectAllowed: e.dataTransfer.effectAllowed
            } : null
          });

          // Capture state after significant events
          if (['click', 'keydown', 'submit', 'drop'].includes(eventType)) {
            // Debounce state capture
            clearTimeout(this._stateDebounce);
            this._stateDebounce = setTimeout(() => {
              this.captureStateSnapshot('after-' + eventType);
            }, 100);
          }
        }, true); // Capture phase to see all events
      });
    },

    // ═══════════════════════════════════════════════════════════════
    // NETWORK HOOKS
    // ═══════════════════════════════════════════════════════════════

    hookNetwork() {
      this.hookFetch();
      this.hookXHR();
      this.hookWebSocket();
    },

    hookFetch() {
      const originalFetch = window.fetch;
      const recorder = this;

      window.fetch = async function(input, init = {}) {
        const url = typeof input === 'string' ? input : input.url;
        const method = init.method || (input.method) || 'GET';
        const requestId = recorder.eventCounter++;
        const startTime = Date.now();

        recorder.logEntry({
          category: 'network',
          type: 'fetch-request',
          requestId,
          url,
          method,
          headers: recorder.safeHeaders(init.headers),
          body: recorder.truncate(init.body)
        });

        try {
          const response = await originalFetch.apply(this, arguments);
          const clone = response.clone();

          // Try to read response body
          let responseBody = null;
          try {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('json')) {
              responseBody = await clone.json();
            } else if (contentType.includes('text')) {
              responseBody = await clone.text();
            }
          } catch (e) {
            responseBody = '[Could not read body]';
          }

          recorder.logEntry({
            category: 'network',
            type: 'fetch-response',
            requestId,
            url,
            status: response.status,
            statusText: response.statusText,
            headers: recorder.headersToObject(response.headers),
            body: recorder.truncate(JSON.stringify(responseBody)),
            duration: Date.now() - startTime
          });

          return response;
        } catch (error) {
          recorder.logEntry({
            category: 'network',
            type: 'fetch-error',
            requestId,
            url,
            error: error.message,
            duration: Date.now() - startTime
          });
          throw error;
        }
      };
    },

    hookXHR() {
      const recorder = this;
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function(method, url) {
        this._recorderData = {
          method,
          url,
          requestId: recorder.eventCounter++,
          startTime: null
        };
        return originalOpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function(body) {
        const xhr = this;
        const data = this._recorderData || {};
        data.startTime = Date.now();

        recorder.logEntry({
          category: 'network',
          type: 'xhr-request',
          requestId: data.requestId,
          url: data.url,
          method: data.method,
          body: recorder.truncate(body)
        });

        xhr.addEventListener('load', function() {
          recorder.logEntry({
            category: 'network',
            type: 'xhr-response',
            requestId: data.requestId,
            url: data.url,
            status: xhr.status,
            statusText: xhr.statusText,
            responseType: xhr.responseType,
            response: recorder.truncate(
              xhr.responseType === '' || xhr.responseType === 'text'
                ? xhr.responseText
                : '[Binary data]'
            ),
            duration: Date.now() - data.startTime
          });
        });

        xhr.addEventListener('error', function() {
          recorder.logEntry({
            category: 'network',
            type: 'xhr-error',
            requestId: data.requestId,
            url: data.url,
            duration: Date.now() - data.startTime
          });
        });

        return originalSend.apply(this, arguments);
      };
    },

    hookWebSocket() {
      const recorder = this;
      const OriginalWebSocket = window.WebSocket;

      window.WebSocket = function(url, protocols) {
        const ws = new OriginalWebSocket(url, protocols);
        const wsId = recorder.eventCounter++;

        recorder.logEntry({
          category: 'network',
          type: 'websocket-create',
          wsId,
          url
        });

        ws.addEventListener('open', () => {
          recorder.logEntry({
            category: 'network',
            type: 'websocket-open',
            wsId,
            url
          });
        });

        ws.addEventListener('message', (event) => {
          recorder.logEntry({
            category: 'network',
            type: 'websocket-message',
            wsId,
            direction: 'incoming',
            data: recorder.truncate(
              typeof event.data === 'string' ? event.data : '[Binary]'
            )
          });
        });

        ws.addEventListener('close', (event) => {
          recorder.logEntry({
            category: 'network',
            type: 'websocket-close',
            wsId,
            code: event.code,
            reason: event.reason
          });
        });

        ws.addEventListener('error', () => {
          recorder.logEntry({
            category: 'network',
            type: 'websocket-error',
            wsId
          });
        });

        // Hook send method
        const originalSend = ws.send.bind(ws);
        ws.send = function(data) {
          recorder.logEntry({
            category: 'network',
            type: 'websocket-message',
            wsId,
            direction: 'outgoing',
            data: recorder.truncate(typeof data === 'string' ? data : '[Binary]')
          });
          return originalSend(data);
        };

        return ws;
      };
      window.WebSocket.prototype = OriginalWebSocket.prototype;
    },

    // ═══════════════════════════════════════════════════════════════
    // STORAGE HOOKS
    // ═══════════════════════════════════════════════════════════════

    hookStorage() {
      const recorder = this;

      // localStorage
      const originalLocalSetItem = localStorage.setItem.bind(localStorage);
      const originalLocalRemoveItem = localStorage.removeItem.bind(localStorage);
      const originalLocalClear = localStorage.clear.bind(localStorage);

      localStorage.setItem = function(key, value) {
        recorder.logEntry({
          category: 'storage',
          type: 'localStorage-set',
          key,
          value: recorder.truncate(value)
        });
        return originalLocalSetItem(key, value);
      };

      localStorage.removeItem = function(key) {
        recorder.logEntry({
          category: 'storage',
          type: 'localStorage-remove',
          key
        });
        return originalLocalRemoveItem(key);
      };

      localStorage.clear = function() {
        recorder.logEntry({
          category: 'storage',
          type: 'localStorage-clear'
        });
        return originalLocalClear();
      };

      // sessionStorage
      const originalSessionSetItem = sessionStorage.setItem.bind(sessionStorage);
      const originalSessionRemoveItem = sessionStorage.removeItem.bind(sessionStorage);
      const originalSessionClear = sessionStorage.clear.bind(sessionStorage);

      sessionStorage.setItem = function(key, value) {
        recorder.logEntry({
          category: 'storage',
          type: 'sessionStorage-set',
          key,
          value: recorder.truncate(value)
        });
        return originalSessionSetItem(key, value);
      };

      sessionStorage.removeItem = function(key) {
        recorder.logEntry({
          category: 'storage',
          type: 'sessionStorage-remove',
          key
        });
        return originalSessionRemoveItem(key);
      };

      sessionStorage.clear = function() {
        recorder.logEntry({
          category: 'storage',
          type: 'sessionStorage-clear'
        });
        return originalSessionClear();
      };
    },

    // ═══════════════════════════════════════════════════════════════
    // DOM MUTATION HOOKS
    // ═══════════════════════════════════════════════════════════════

    hookDOM() {
      const recorder = this;

      // Wait for body to exist
      const setupObserver = () => {
        if (!document.body) {
          setTimeout(setupObserver, 10);
          return;
        }

        const observer = new MutationObserver((mutations) => {
          // Filter and batch mutations
          const significant = mutations.filter(m => {
            // Skip style-only changes (too noisy)
            if (m.type === 'attributes' && m.attributeName === 'style') {
              return false;
            }
            // Skip script/link tags
            if (m.target.tagName === 'SCRIPT' || m.target.tagName === 'LINK') {
              return false;
            }
            return true;
          });

          if (significant.length === 0) return;

          // Summarize mutations
          const summary = {
            added: 0,
            removed: 0,
            attributeChanges: [],
            textChanges: 0
          };

          for (const m of significant) {
            if (m.type === 'childList') {
              summary.added += m.addedNodes.length;
              summary.removed += m.removedNodes.length;
            } else if (m.type === 'attributes') {
              summary.attributeChanges.push({
                target: recorder.describeElement(m.target),
                attribute: m.attributeName,
                oldValue: m.oldValue,
                newValue: m.target.getAttribute(m.attributeName)
              });
            } else if (m.type === 'characterData') {
              summary.textChanges++;
            }
          }

          recorder.logEntry({
            category: 'dom-mutation',
            count: significant.length,
            summary
          });
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeOldValue: true,
          characterData: true
        });
      };

      setupObserver();
    },

    // ═══════════════════════════════════════════════════════════════
    // CANVAS HOOKS
    // ═══════════════════════════════════════════════════════════════

    hookCanvas() {
      const recorder = this;
      const originalGetContext = HTMLCanvasElement.prototype.getContext;

      HTMLCanvasElement.prototype.getContext = function(type, options) {
        const ctx = originalGetContext.apply(this, arguments);

        if (type === '2d' && ctx && !ctx.__recorded) {
          recorder.wrapCanvas2DContext(ctx, this);
          ctx.__recorded = true;
        }

        // Could also hook WebGL here if needed

        return ctx;
      };
    },

    wrapCanvas2DContext(ctx, canvas) {
      const recorder = this;
      const canvasId = canvas.id || 'canvas-' + this.eventCounter++;

      // Methods that draw/modify the canvas
      const drawMethods = [
        'fillRect', 'strokeRect', 'clearRect',
        'fill', 'stroke', 'clip',
        'fillText', 'strokeText',
        'drawImage',
        'putImageData'
      ];

      // Path methods (group them)
      const pathMethods = [
        'beginPath', 'closePath', 'moveTo', 'lineTo',
        'bezierCurveTo', 'quadraticCurveTo',
        'arc', 'arcTo', 'ellipse', 'rect'
      ];

      // Transform methods
      const transformMethods = [
        'save', 'restore', 'translate', 'rotate', 'scale',
        'transform', 'setTransform', 'resetTransform'
      ];

      // Track current path operations to batch them
      let currentPath = [];

      drawMethods.forEach(method => {
        if (typeof ctx[method] !== 'function') return;
        const original = ctx[method].bind(ctx);
        ctx[method] = function(...args) {
          // Log any pending path operations first
          if (currentPath.length > 0) {
            recorder.logEntry({
              category: 'canvas',
              canvasId,
              type: 'path',
              operations: currentPath
            });
            currentPath = [];
          }

          recorder.logEntry({
            category: 'canvas',
            canvasId,
            type: 'draw',
            method,
            args: recorder.sanitizeCanvasArgs(args)
          });
          return original(...args);
        };
      });

      pathMethods.forEach(method => {
        if (typeof ctx[method] !== 'function') return;
        const original = ctx[method].bind(ctx);
        ctx[method] = function(...args) {
          currentPath.push({ method, args: recorder.sanitizeCanvasArgs(args) });
          return original(...args);
        };
      });

      transformMethods.forEach(method => {
        if (typeof ctx[method] !== 'function') return;
        const original = ctx[method].bind(ctx);
        ctx[method] = function(...args) {
          recorder.logEntry({
            category: 'canvas',
            canvasId,
            type: 'transform',
            method,
            args: recorder.sanitizeCanvasArgs(args)
          });
          return original(...args);
        };
      });
    },

    sanitizeCanvasArgs(args) {
      return args.map(arg => {
        if (arg instanceof HTMLImageElement) {
          return { type: 'Image', src: arg.src?.substring(0, 200) };
        }
        if (arg instanceof HTMLCanvasElement) {
          return { type: 'Canvas', id: arg.id };
        }
        if (arg instanceof ImageData) {
          return { type: 'ImageData', width: arg.width, height: arg.height };
        }
        return arg;
      });
    },

    // ═══════════════════════════════════════════════════════════════
    // HISTORY/NAVIGATION HOOKS
    // ═══════════════════════════════════════════════════════════════

    hookHistory() {
      const recorder = this;

      // pushState
      const originalPushState = history.pushState.bind(history);
      history.pushState = function(state, title, url) {
        recorder.logEntry({
          category: 'navigation',
          type: 'pushState',
          url,
          state: recorder.truncate(JSON.stringify(state))
        });
        return originalPushState(state, title, url);
      };

      // replaceState
      const originalReplaceState = history.replaceState.bind(history);
      history.replaceState = function(state, title, url) {
        recorder.logEntry({
          category: 'navigation',
          type: 'replaceState',
          url,
          state: recorder.truncate(JSON.stringify(state))
        });
        return originalReplaceState(state, title, url);
      };

      // popstate event
      window.addEventListener('popstate', (event) => {
        recorder.logEntry({
          category: 'navigation',
          type: 'popstate',
          url: location.href,
          state: recorder.truncate(JSON.stringify(event.state))
        });
      });

      // hashchange
      window.addEventListener('hashchange', (event) => {
        recorder.logEntry({
          category: 'navigation',
          type: 'hashchange',
          oldURL: event.oldURL,
          newURL: event.newURL
        });
      });
    },

    // ═══════════════════════════════════════════════════════════════
    // CONSOLE HOOKS
    // ═══════════════════════════════════════════════════════════════

    hookConsole() {
      const recorder = this;
      const methods = ['log', 'info', 'warn', 'error', 'debug'];

      methods.forEach(method => {
        const original = console[method].bind(console);
        console[method] = function(...args) {
          // Don't record our own logs
          if (args[0]?.toString?.().startsWith?.('[Recorder]')) {
            return original(...args);
          }

          recorder.logEntry({
            category: 'console',
            type: method,
            args: args.map(arg => recorder.truncate(recorder.safeStringify(arg)))
          });
          return original(...args);
        };
      });
    },

    // ═══════════════════════════════════════════════════════════════
    // TIMER HOOKS (optional, very noisy)
    // ═══════════════════════════════════════════════════════════════

    hookTimers() {
      const recorder = this;

      const originalSetTimeout = window.setTimeout;
      window.setTimeout = function(fn, delay, ...args) {
        recorder.logEntry({
          category: 'timer',
          type: 'setTimeout',
          delay
        });
        return originalSetTimeout(fn, delay, ...args);
      };

      const originalSetInterval = window.setInterval;
      window.setInterval = function(fn, delay, ...args) {
        recorder.logEntry({
          category: 'timer',
          type: 'setInterval',
          delay
        });
        return originalSetInterval(fn, delay, ...args);
      };

      const originalRAF = window.requestAnimationFrame;
      window.requestAnimationFrame = function(fn) {
        recorder.logEntry({
          category: 'timer',
          type: 'requestAnimationFrame'
        });
        return originalRAF(fn);
      };
    },

    // ═══════════════════════════════════════════════════════════════
    // STATE CAPTURE
    // ═══════════════════════════════════════════════════════════════

    captureStateSnapshot(label) {
      const snapshot = {
        label,
        timestamp: Date.now(),
        relativeTime: Date.now() - this.startTime,

        // URL state
        url: location.href,
        hash: location.hash,

        // DOM state
        title: document.title,
        activeElement: this.describeElement(document.activeElement),

        // Try to get app-specific state
        appState: this.captureAppState(),

        // Storage state
        localStorage: this.captureStorage(localStorage),
        sessionStorage: this.captureStorage(sessionStorage),

        // Visual state indicators
        visibleModals: this.findVisibleModals(),
        selectedElements: this.findSelectedElements(),
        inputValues: this.captureInputValues(),
        scrollPositions: this.captureScrollPositions(),

        // Canvas state (if any)
        canvasStates: this.captureCanvasStates()
      };

      this.stateSnapshots.push(snapshot);
      return snapshot;
    },

    captureAppState() {
      // Try various common patterns for exposed state
      const attempts = [
        () => window.__APP_STATE__,
        () => window.__REDUX_DEVTOOLS_EXTENSION__?.() ?.getState?.(),
        () => window.store?.getState?.(),
        () => window.__NEXT_DATA__,
        () => window.__NUXT__,
        () => window.__PRELOADED_STATE__,
        () => window.initialState,
        () => window.appState,
        // React specific
        () => {
          const root = document.getElementById('root') || document.getElementById('app');
          const fiber = root?._reactRootContainer?._internalRoot?.current;
          return fiber?.memoizedState ? '[React State Present]' : null;
        },
        // Try to find Zustand stores
        () => {
          const zustandStores = Object.keys(window).filter(k =>
            k.includes('store') || k.includes('Store')
          );
          if (zustandStores.length > 0) {
            return { zustandStores };
          }
        }
      ];

      for (const attempt of attempts) {
        try {
          const state = attempt();
          if (state) {
            return this.truncate(this.safeStringify(state));
          }
        } catch (e) {}
      }

      return null;
    },

    captureStorage(storage) {
      const data = {};
      try {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          data[key] = this.truncate(storage.getItem(key));
        }
      } catch (e) {}
      return data;
    },

    findVisibleModals() {
      const selectors = [
        '[role="dialog"]',
        '[role="alertdialog"]',
        '.modal:not(.hidden)',
        '.modal.show',
        '.modal.open',
        '[data-modal]',
        '.overlay:not(.hidden)',
        '.popup:not(.hidden)'
      ];

      const modals = [];
      for (const selector of selectors) {
        try {
          document.querySelectorAll(selector).forEach(el => {
            const style = getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              modals.push(this.describeElement(el));
            }
          });
        } catch (e) {}
      }
      return modals;
    },

    findSelectedElements() {
      const selectors = [
        '.selected',
        '.is-selected',
        '[aria-selected="true"]',
        '[data-selected="true"]',
        '.active:not(button):not(a)',
        '.is-active'
      ];

      const selected = [];
      for (const selector of selectors) {
        try {
          document.querySelectorAll(selector).forEach(el => {
            selected.push(this.describeElement(el));
          });
        } catch (e) {}
      }
      return selected;
    },

    captureInputValues() {
      const inputs = {};
      document.querySelectorAll('input, textarea, select').forEach((el, idx) => {
        const key = el.id || el.name || 'input-' + idx;
        if (el.type === 'password') {
          inputs[key] = '[password]';
        } else if (el.type === 'checkbox' || el.type === 'radio') {
          inputs[key] = el.checked;
        } else {
          inputs[key] = this.truncate(el.value, 500);
        }
      });
      return inputs;
    },

    captureScrollPositions() {
      const positions = {
        window: { x: window.scrollX, y: window.scrollY }
      };

      // Find scrollable containers
      document.querySelectorAll('[style*="overflow"], .overflow-auto, .overflow-scroll')
        .forEach((el, idx) => {
          if (el.scrollTop > 0 || el.scrollLeft > 0) {
            const key = el.id || el.className?.split(' ')[0] || 'scroll-' + idx;
            positions[key] = { x: el.scrollLeft, y: el.scrollTop };
          }
        });

      return positions;
    },

    captureCanvasStates() {
      const canvases = document.querySelectorAll('canvas');
      return Array.from(canvases).map((canvas, idx) => ({
        id: canvas.id || 'canvas-' + idx,
        width: canvas.width,
        height: canvas.height,
        // Store a small thumbnail for comparison
        thumbnail: this.getCanvasThumbnail(canvas)
      }));
    },

    getCanvasThumbnail(canvas) {
      try {
        // Create small thumbnail
        const thumb = document.createElement('canvas');
        const scale = Math.min(100 / canvas.width, 100 / canvas.height);
        thumb.width = canvas.width * scale;
        thumb.height = canvas.height * scale;
        const ctx = thumb.getContext('2d');
        ctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);
        return thumb.toDataURL('image/png', 0.5);
      } catch (e) {
        return null;
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // UTILITY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    logEntry(data) {
      const entry = {
        ...data,
        timestamp: Date.now(),
        relativeTime: Date.now() - this.startTime,
        index: this.eventCounter++
      };

      this.log.push(entry);

      // Rotation if too large
      if (this.log.length > this.config.maxLogSize) {
        this.log = this.log.slice(-Math.floor(this.config.maxLogSize * 0.8));
      }
    },

    describeElement(el) {
      if (!el || !el.tagName) return null;

      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        classes: Array.from(el.classList || []).slice(0, 5),
        ariaLabel: el.getAttribute('aria-label'),
        ariaRole: el.getAttribute('role'),
        title: el.getAttribute('title'),
        name: el.getAttribute('name'),
        type: el.getAttribute('type'),
        href: el.tagName === 'A' ? el.getAttribute('href') : null,
        textContent: el.textContent?.trim().substring(0, 50),
        rect: el.getBoundingClientRect ? {
          x: Math.round(el.getBoundingClientRect().x),
          y: Math.round(el.getBoundingClientRect().y),
          width: Math.round(el.getBoundingClientRect().width),
          height: Math.round(el.getBoundingClientRect().height)
        } : null
      };
    },

    safeStringify(obj) {
      try {
        return JSON.stringify(obj, (key, value) => {
          if (value instanceof HTMLElement) return '[HTMLElement: ' + value.tagName + ']';
          if (value instanceof Window) return '[Window]';
          if (value instanceof Document) return '[Document]';
          if (typeof value === 'function') return '[Function]';
          if (value instanceof Error) return '[Error: ' + value.message + ']';
          if (value instanceof Event) return '[Event: ' + value.type + ']';
          return value;
        });
      } catch (e) {
        return '[Unserializable]';
      }
    },

    truncate(str, maxLen) {
      maxLen = maxLen || this.config.truncateValues;
      if (!str) return str;
      if (typeof str !== 'string') {
        str = this.safeStringify(str);
      }
      if (str.length > maxLen) {
        return str.substring(0, maxLen) + '...[truncated]';
      }
      return str;
    },

    safeHeaders(headers) {
      if (!headers) return null;
      try {
        if (headers instanceof Headers) {
          return this.headersToObject(headers);
        }
        return headers;
      } catch (e) {
        return '[Headers]';
      }
    },

    headersToObject(headers) {
      const obj = {};
      try {
        headers.forEach((value, key) => {
          obj[key] = value;
        });
      } catch (e) {}
      return obj;
    },

    // ═══════════════════════════════════════════════════════════════
    // EXPORT FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    getRecording() {
      return {
        metadata: {
          url: location.href,
          title: document.title,
          startTime: this.startTime,
          endTime: Date.now(),
          duration: Date.now() - this.startTime,
          eventCount: this.eventCounter,
          logEntries: this.log.length,
          stateSnapshots: this.stateSnapshots.length
        },
        log: this.log,
        stateSnapshots: this.stateSnapshots,
        errors: this.errors
      };
    },

    clear() {
      this.log = [];
      this.stateSnapshots = [];
      this.errors = [];
      this.eventCounter = 0;
      this.startTime = Date.now();
    }
  };

  // Initialize
  window.__RECORDER__.init();
})();
`;

/**
 * Helper to detect app architecture
 */
export const ARCHITECTURE_DETECTION_SCRIPT = `
(function() {
  const arch = {
    frameworks: [],
    rendering: [],
    stateManagement: [],
    libraries: []
  };

  // Framework detection
  if (window.React || document.querySelector('[data-reactroot]')) {
    arch.frameworks.push('react');
  }
  if (window.Vue || document.querySelector('[data-v-]')) {
    arch.frameworks.push('vue');
  }
  if (window.ng || document.querySelector('[ng-version]')) {
    arch.frameworks.push('angular');
  }
  if (window.Svelte) arch.frameworks.push('svelte');
  if (window.Ember) arch.frameworks.push('ember');
  if (window.Backbone) arch.frameworks.push('backbone');

  // Rendering detection
  if (document.querySelectorAll('canvas').length > 0) {
    arch.rendering.push('canvas');
    // Check WebGL
    try {
      const canvas = document.querySelector('canvas');
      if (canvas?.getContext('webgl') || canvas?.getContext('webgl2')) {
        arch.rendering.push('webgl');
      }
    } catch (e) {}
  }
  if (document.querySelectorAll('svg').length > 10) {
    arch.rendering.push('svg-heavy');
  }
  arch.rendering.push('dom');

  // State management
  if (window.__REDUX_DEVTOOLS_EXTENSION__) arch.stateManagement.push('redux');
  if (window.MobX) arch.stateManagement.push('mobx');

  // Libraries
  if (window.d3) arch.libraries.push('d3');
  if (window.Chart) arch.libraries.push('chartjs');
  if (window.rough) arch.libraries.push('roughjs');
  if (window.fabric) arch.libraries.push('fabricjs');
  if (window.paper) arch.libraries.push('paperjs');

  return arch;
})();
`;
