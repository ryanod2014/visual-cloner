/**
 * Worker Script Capturer
 *
 * Captures Web Workers and Service Workers:
 * - Worker script URLs and content
 * - Messages passed to/from workers
 * - SharedWorker connections
 * - Service Worker registrations and caching strategies
 *
 * This allows us to clone the parallel processing logic.
 */

export const workerScriptCapturer = {
  name: 'worker-script-capturer',

  getInjectionScript() {
    return `
(function() {
  if (window.__workerCapturerInstalled) return;
  window.__workerCapturerInstalled = true;

  window.__workersCaptured = {
    workers: [],
    sharedWorkers: [],
    serviceWorkers: [],
    messages: [],
    workerScripts: {},
  };

  // ============================================
  // CAPTURE WEB WORKERS
  // ============================================

  const OriginalWorker = window.Worker;
  let workerIdCounter = 0;

  window.Worker = function(scriptURL, options) {
    const workerId = workerIdCounter++;
    const resolvedURL = new URL(scriptURL, window.location.href).href;

    const workerInfo = {
      id: workerId,
      url: resolvedURL,
      options: options || {},
      createdAt: Date.now(),
      messages: [],
      type: options?.type || 'classic',
    };

    window.__workersCaptured.workers.push(workerInfo);

    // Fetch the worker script
    fetch(resolvedURL)
      .then(res => res.text())
      .then(script => {
        window.__workersCaptured.workerScripts[resolvedURL] = {
          url: resolvedURL,
          content: script,
          fetchedAt: Date.now(),
        };
        workerInfo.scriptCaptured = true;
      })
      .catch(err => {
        workerInfo.scriptError = err.message;
      });

    // Create the actual worker
    const worker = new OriginalWorker(scriptURL, options);

    // Intercept postMessage to worker
    const originalPostMessage = worker.postMessage.bind(worker);
    worker.postMessage = function(message, transfer) {
      const msgRecord = {
        workerId,
        direction: 'to-worker',
        message: safeSerialize(message),
        timestamp: Date.now(),
      };
      window.__workersCaptured.messages.push(msgRecord);
      workerInfo.messages.push(msgRecord);

      return originalPostMessage(message, transfer);
    };

    // Intercept messages from worker
    worker.addEventListener('message', (event) => {
      const msgRecord = {
        workerId,
        direction: 'from-worker',
        message: safeSerialize(event.data),
        timestamp: Date.now(),
      };
      window.__workersCaptured.messages.push(msgRecord);
      workerInfo.messages.push(msgRecord);
    });

    // Track errors
    worker.addEventListener('error', (event) => {
      workerInfo.errors = workerInfo.errors || [];
      workerInfo.errors.push({
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        timestamp: Date.now(),
      });
    });

    return worker;
  };

  // Copy static properties
  window.Worker.prototype = OriginalWorker.prototype;

  // ============================================
  // CAPTURE SHARED WORKERS
  // ============================================

  if (window.SharedWorker) {
    const OriginalSharedWorker = window.SharedWorker;
    let sharedWorkerIdCounter = 0;

    window.SharedWorker = function(scriptURL, options) {
      const workerId = sharedWorkerIdCounter++;
      const resolvedURL = new URL(scriptURL, window.location.href).href;
      const name = typeof options === 'string' ? options : options?.name || '';

      const workerInfo = {
        id: workerId,
        url: resolvedURL,
        name,
        options: typeof options === 'object' ? options : {},
        createdAt: Date.now(),
        messages: [],
      };

      window.__workersCaptured.sharedWorkers.push(workerInfo);

      // Fetch the worker script
      fetch(resolvedURL)
        .then(res => res.text())
        .then(script => {
          window.__workersCaptured.workerScripts[resolvedURL] = {
            url: resolvedURL,
            content: script,
            fetchedAt: Date.now(),
            type: 'shared',
          };
          workerInfo.scriptCaptured = true;
        })
        .catch(err => {
          workerInfo.scriptError = err.message;
        });

      // Create the actual shared worker
      const worker = new OriginalSharedWorker(scriptURL, options);

      // Intercept port messages
      const port = worker.port;
      const originalPortPostMessage = port.postMessage.bind(port);

      port.postMessage = function(message, transfer) {
        const msgRecord = {
          workerId,
          workerType: 'shared',
          direction: 'to-worker',
          message: safeSerialize(message),
          timestamp: Date.now(),
        };
        window.__workersCaptured.messages.push(msgRecord);
        workerInfo.messages.push(msgRecord);

        return originalPortPostMessage(message, transfer);
      };

      port.addEventListener('message', (event) => {
        const msgRecord = {
          workerId,
          workerType: 'shared',
          direction: 'from-worker',
          message: safeSerialize(event.data),
          timestamp: Date.now(),
        };
        window.__workersCaptured.messages.push(msgRecord);
        workerInfo.messages.push(msgRecord);
      });

      return worker;
    };

    window.SharedWorker.prototype = OriginalSharedWorker.prototype;
  }

  // ============================================
  // CAPTURE SERVICE WORKERS
  // ============================================

  if (navigator.serviceWorker) {
    const originalRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);

    navigator.serviceWorker.register = async function(scriptURL, options) {
      const resolvedURL = new URL(scriptURL, window.location.href).href;

      const swInfo = {
        url: resolvedURL,
        scope: options?.scope || '/',
        options: options || {},
        registeredAt: Date.now(),
      };

      window.__workersCaptured.serviceWorkers.push(swInfo);

      // Fetch the service worker script
      try {
        const response = await fetch(resolvedURL);
        const script = await response.text();
        window.__workersCaptured.workerScripts[resolvedURL] = {
          url: resolvedURL,
          content: script,
          fetchedAt: Date.now(),
          type: 'service',
        };
        swInfo.scriptCaptured = true;
      } catch (err) {
        swInfo.scriptError = err.message;
      }

      // Actually register the service worker
      const registration = await originalRegister(scriptURL, options);

      swInfo.registration = {
        scope: registration.scope,
        updateViaCache: registration.updateViaCache,
      };

      return registration;
    };
  }

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  function safeSerialize(obj, maxDepth = 3) {
    if (maxDepth <= 0) return '[max depth]';

    if (obj === null || obj === undefined) return obj;

    const type = typeof obj;
    if (type === 'string' || type === 'number' || type === 'boolean') return obj;

    if (obj instanceof ArrayBuffer) {
      return { __type: 'ArrayBuffer', byteLength: obj.byteLength };
    }

    if (obj instanceof Blob) {
      return { __type: 'Blob', size: obj.size, type: obj.type };
    }

    if (obj instanceof ImageData) {
      return { __type: 'ImageData', width: obj.width, height: obj.height };
    }

    if (ArrayBuffer.isView(obj)) {
      return {
        __type: obj.constructor.name,
        length: obj.length,
        sample: Array.from(obj.slice(0, 10)),
      };
    }

    if (Array.isArray(obj)) {
      return obj.slice(0, 100).map(item => safeSerialize(item, maxDepth - 1));
    }

    if (type === 'object') {
      const result = {};
      let count = 0;
      for (const [key, value] of Object.entries(obj)) {
        if (count++ > 50) {
          result.__truncated = true;
          break;
        }
        result[key] = safeSerialize(value, maxDepth - 1);
      }
      return result;
    }

    if (type === 'function') {
      return { __type: 'function', name: obj.name || 'anonymous' };
    }

    return String(obj);
  }

  // ============================================
  // CAPTURE EXISTING SERVICE WORKERS
  // ============================================

  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(reg => {
        const swInfo = {
          url: reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL,
          scope: reg.scope,
          existingAtCapture: true,
          state: reg.active ? 'active' : reg.waiting ? 'waiting' : 'installing',
        };

        // Don't duplicate if already captured
        if (!window.__workersCaptured.serviceWorkers.some(sw => sw.url === swInfo.url)) {
          window.__workersCaptured.serviceWorkers.push(swInfo);

          // Try to fetch the script
          if (swInfo.url) {
            fetch(swInfo.url)
              .then(res => res.text())
              .then(script => {
                window.__workersCaptured.workerScripts[swInfo.url] = {
                  url: swInfo.url,
                  content: script,
                  fetchedAt: Date.now(),
                  type: 'service',
                };
              })
              .catch(() => {});
          }
        }
      });
    });
  }

  // ============================================
  // PUBLIC API
  // ============================================

  window.__getWorkerData = function() {
    return window.__workersCaptured;
  };

  window.__getWorkerScripts = function() {
    return window.__workersCaptured.workerScripts;
  };

  window.__getWorkerMessages = function() {
    return window.__workersCaptured.messages;
  };

  console.log('[Worker Script Capturer] Installed');
})();
`;
  },

  /**
   * Extract all captured worker data
   */
  async extractData(page) {
    return await page.evaluate(() => {
      if (window.__getWorkerData) {
        return window.__getWorkerData();
      }
      return {
        workers: [],
        sharedWorkers: [],
        serviceWorkers: [],
        messages: [],
        workerScripts: {},
      };
    });
  },

  /**
   * Get worker scripts content
   */
  async getWorkerScripts(page) {
    return await page.evaluate(() => {
      if (window.__getWorkerScripts) {
        return window.__getWorkerScripts();
      }
      return {};
    });
  },

  /**
   * Wait for worker scripts to be captured
   */
  async waitForWorkerScripts(page, timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const data = await this.extractData(page);

      // Check if all workers have their scripts captured or errored
      const allCaptured = [
        ...data.workers,
        ...data.sharedWorkers,
        ...data.serviceWorkers,
      ].every(w => w.scriptCaptured || w.scriptError);

      if (allCaptured) {
        return true;
      }

      await page.waitForTimeout(200);
    }

    return false;
  },

  /**
   * Generate worker replay code
   */
  generateWorkerReplay(data) {
    const lines = [];

    lines.push('// Worker Script Replay');
    lines.push('// Captured worker scripts and message patterns');
    lines.push('');

    // Generate inline worker scripts
    for (const [url, scriptData] of Object.entries(data.workerScripts)) {
      if (!scriptData.content) continue;

      const varName = 'worker_' + url.replace(/[^a-zA-Z0-9]/g, '_').slice(-30);

      lines.push(`// Worker: ${url}`);
      lines.push(`const ${varName}_code = \`${scriptData.content.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;`);
      lines.push(`const ${varName}_blob = new Blob([${varName}_code], { type: 'application/javascript' });`);
      lines.push(`const ${varName}_url = URL.createObjectURL(${varName}_blob);`);
      lines.push('');
    }

    // Generate worker creation code
    for (const worker of data.workers) {
      const varName = 'worker_' + worker.url.replace(/[^a-zA-Z0-9]/g, '_').slice(-30);
      lines.push(`// Create worker (originally: ${worker.url})`);
      lines.push(`const worker${worker.id} = new Worker(${varName}_url);`);
      lines.push('');
    }

    // Generate message patterns
    if (data.messages.length > 0) {
      lines.push('// Recorded message patterns');
      lines.push('const workerMessagePatterns = [');
      for (const msg of data.messages.slice(0, 50)) { // Limit to 50 messages
        lines.push(`  ${JSON.stringify(msg)},`);
      }
      lines.push('];');
    }

    return lines.join('\n');
  },

  /**
   * Generate service worker registration code
   */
  generateServiceWorkerCode(data) {
    const lines = [];

    lines.push('// Service Worker Registration');
    lines.push('');

    for (const sw of data.serviceWorkers) {
      if (!data.workerScripts[sw.url]?.content) {
        lines.push(`// Service worker script not captured: ${sw.url}`);
        continue;
      }

      lines.push(`// Service Worker: ${sw.url}`);
      lines.push(`// Scope: ${sw.scope}`);
      lines.push('');
      lines.push('// Original service worker code:');
      lines.push('/*');
      lines.push(data.workerScripts[sw.url].content.slice(0, 2000));
      if (data.workerScripts[sw.url].content.length > 2000) {
        lines.push('... (truncated)');
      }
      lines.push('*/');
      lines.push('');
    }

    return lines.join('\n');
  },

  /**
   * Analyze worker for caching strategies
   */
  analyzeServiceWorker(scriptContent) {
    const analysis = {
      strategies: [],
      cacheName: null,
      cachedUrls: [],
      features: [],
    };

    // Detect caching strategies
    if (scriptContent.includes('cache.put') || scriptContent.includes('caches.open')) {
      analysis.strategies.push('cache-first');
    }
    if (scriptContent.includes('fetch(') && scriptContent.includes('cache')) {
      analysis.strategies.push('network-first');
    }
    if (scriptContent.includes('stale-while-revalidate') || scriptContent.includes('StaleWhileRevalidate')) {
      analysis.strategies.push('stale-while-revalidate');
    }

    // Find cache name
    const cacheNameMatch = scriptContent.match(/cacheName\s*[=:]\s*['"]([^'"]+)['"]/);
    if (cacheNameMatch) {
      analysis.cacheName = cacheNameMatch[1];
    }

    // Find cached URLs
    const urlMatches = scriptContent.match(/['"]\/[^'"]*['"]/g);
    if (urlMatches) {
      analysis.cachedUrls = [...new Set(urlMatches.map(u => u.slice(1, -1)))];
    }

    // Detect features
    if (scriptContent.includes('push')) {
      analysis.features.push('push-notifications');
    }
    if (scriptContent.includes('sync')) {
      analysis.features.push('background-sync');
    }
    if (scriptContent.includes('indexedDB') || scriptContent.includes('IDBDatabase')) {
      analysis.features.push('indexeddb');
    }

    return analysis;
  }
};
