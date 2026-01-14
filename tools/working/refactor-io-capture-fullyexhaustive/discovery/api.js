/**
 * Discover all callable API functions on window
 */
const logger = require('../utils/logger');

async function discoverAPIFunctions(page) {
  logger.info('Discovering API functions...');

  const functions = await page.evaluate(() => {
    const results = [];
    const builtins = new Set([
      'window', 'self', 'document', 'location', 'navigator', 'history',
      'localStorage', 'sessionStorage', 'console', 'Math', 'JSON',
      'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'RegExp',
      'Error', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol',
      'Proxy', 'Reflect', 'Intl', 'eval', 'parseInt', 'parseFloat',
      'isNaN', 'isFinite', 'decodeURI', 'encodeURI', 'setTimeout', 'setInterval',
      'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'fetch',
      'alert', 'confirm', 'prompt', 'open', 'close', 'print',
      'getComputedStyle', 'matchMedia', 'scroll', 'scrollTo', 'scrollBy'
    ]);

    function extractFunctions(obj, prefix, depth = 0) {
      if (depth > 2) return;  // Limit depth

      try {
        const names = Object.getOwnPropertyNames(obj);
        for (const name of names) {
          if (builtins.has(name)) continue;
          if (name.startsWith('_')) continue;  // Skip private

          try {
            const val = obj[name];
            if (typeof val === 'function') {
              results.push({
                path: prefix ? `${prefix}.${name}` : name,
                name,
                arity: val.length,
                isConstructor: /^[A-Z]/.test(name)
              });
            } else if (typeof val === 'object' && val !== null && depth < 2) {
              extractFunctions(val, prefix ? `${prefix}.${name}` : name, depth + 1);
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    // Global functions
    extractFunctions(window, '');

    // Common app namespaces
    const appNamespaces = ['app', 'App', 'Photopea', 'api', 'API', 'editor'];
    for (const ns of appNamespaces) {
      if (window[ns] && typeof window[ns] === 'object') {
        extractFunctions(window[ns], ns);
      }
    }

    return results;
  });

  logger.info(`Found ${functions.length} API functions`);
  return functions;
}

module.exports = { discoverAPIFunctions };
