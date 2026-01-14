/**
 * IndexedDB Mock - Injection Example
 *
 * Shows how to inject the IndexedDB mock into a webpage for extraction purposes.
 * Useful for Puppeteer, Playwright, or other automation tools.
 */

// ===========================================================================
// Example 1: Puppeteer Injection
// ===========================================================================

async function injectInPuppeteer(page) {
  // Read the mock file
  const fs = require('fs');
  const mockCode = fs.readFileSync('./indexeddb-mock.js', 'utf8');

  // Inject before page loads
  await page.evaluateOnNewDocument(mockCode);

  // Or inject after page loads
  await page.evaluate(mockCode);

  console.log('✓ IndexedDB mock injected into page');
}

// Usage:
// const puppeteer = require('puppeteer');
// const browser = await puppeteer.launch();
// const page = await browser.newPage();
// await injectInPuppeteer(page);
// await page.goto('https://example.com');

// ===========================================================================
// Example 2: Playwright Injection
// ===========================================================================

async function injectInPlaywright(page) {
  const fs = require('fs');
  const mockCode = fs.readFileSync('./indexeddb-mock.js', 'utf8');

  // Inject before navigation
  await page.addInitScript(mockCode);

  console.log('✓ IndexedDB mock injected into page');
}

// Usage:
// const { chromium } = require('playwright');
// const browser = await chromium.launch();
// const page = await browser.newPage();
// await injectInPlaywright(page);
// await page.goto('https://example.com');

// ===========================================================================
// Example 3: Manual Injection via DevTools
// ===========================================================================

function getManualInjectionCode() {
  // This can be pasted directly into browser DevTools console
  return `
// Load IndexedDB mock from file
fetch('/path/to/indexeddb-mock.js')
  .then(r => r.text())
  .then(code => {
    eval(code);
    console.log('✓ IndexedDB mock loaded');
  });

// Or inline the entire implementation
(function() {
  // Paste the contents of indexeddb-mock.js here
  console.log('✓ IndexedDB mock initialized');
})();
  `.trim();
}

// ===========================================================================
// Example 4: Preload Script (Electron)
// ===========================================================================

function createElectronPreload() {
  return `
// preload.js
const fs = require('fs');
const path = require('path');

// Load and execute the mock
const mockPath = path.join(__dirname, 'indexeddb-mock.js');
const mockCode = fs.readFileSync(mockPath, 'utf8');

// Execute in context
eval(mockCode);

console.log('✓ IndexedDB mock loaded in Electron renderer');
  `.trim();
}

// ===========================================================================
// Example 5: Web Extension Content Script
// ===========================================================================

function createContentScript() {
  return `
// content-script.js
// Load the mock from extension
chrome.runtime.sendMessage({ action: 'getIndexedDBMock' }, (mockCode) => {
  const script = document.createElement('script');
  script.textContent = mockCode;
  (document.head || document.documentElement).appendChild(script);
  script.remove();

  console.log('✓ IndexedDB mock injected via extension');
});
  `.trim();
}

// ===========================================================================
// Example 6: Conditional Injection (Only if IndexedDB is missing)
// ===========================================================================

async function conditionalInject(page) {
  const fs = require('fs');
  const mockCode = fs.readFileSync('./indexeddb-mock.js', 'utf8');

  // Check if IndexedDB exists
  const hasIndexedDB = await page.evaluate(() => {
    return typeof indexedDB !== 'undefined';
  });

  if (!hasIndexedDB) {
    console.log('IndexedDB not found, injecting mock...');
    await page.evaluate(mockCode);
    console.log('✓ IndexedDB mock injected');
  } else {
    console.log('IndexedDB already exists, skipping injection');
  }
}

// ===========================================================================
// Example 7: Override Native IndexedDB
// ===========================================================================

async function overrideNativeIndexedDB(page) {
  const fs = require('fs');
  const mockCode = fs.readFileSync('./indexeddb-mock.js', 'utf8');

  // Inject code that forcefully replaces native IndexedDB
  await page.evaluateOnNewDocument(`
    // Save native implementation
    window._nativeIndexedDB = window.indexedDB;

    // Load mock
    ${mockCode}

    // Optional: Log all operations
    const originalOpen = indexedDB.open;
    indexedDB.open = function(name, version) {
      console.log('[IDB Mock] Opening database:', name, 'version:', version);
      return originalOpen.call(this, name, version);
    };

    console.log('✓ Native IndexedDB overridden with mock');
  `);
}

// ===========================================================================
// Example 8: Capture and Export Data
// ===========================================================================

async function captureIndexedDBData(page) {
  // Extract all data from the mock
  const data = await page.evaluate(() => {
    if (!window.indexedDB || !window.indexedDB._databases) {
      return null;
    }

    const result = {};

    // Access internal storage (specific to mock implementation)
    const factory = window.indexedDB;
    if (factory._databases) {
      for (const [dbName, dbInfo] of factory._databases) {
        result[dbName] = {
          version: dbInfo.version,
          stores: {}
        };

        for (const [storeName, store] of dbInfo.db._stores) {
          const data = [];
          for (const [key, value] of store._data) {
            data.push({ key, value });
          }

          result[dbName].stores[storeName] = {
            keyPath: store.keyPath,
            autoIncrement: store.autoIncrement,
            data: data
          };
        }
      }
    }

    return result;
  });

  return data;
}

// Usage:
// const data = await captureIndexedDBData(page);
// console.log('Captured data:', JSON.stringify(data, null, 2));

// ===========================================================================
// Example 9: Restore Data to Mock
// ===========================================================================

async function restoreIndexedDBData(page, capturedData) {
  await page.evaluate((data) => {
    const promises = [];

    for (const [dbName, dbInfo] of Object.entries(data)) {
      const promise = new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, dbInfo.version);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          for (const [storeName, storeInfo] of Object.entries(dbInfo.stores)) {
            if (!db.objectStoreNames.contains(storeName)) {
              db.createObjectStore(storeName, {
                keyPath: storeInfo.keyPath,
                autoIncrement: storeInfo.autoIncrement
              });
            }
          }
        };

        request.onsuccess = (event) => {
          const db = event.target.result;

          for (const [storeName, storeInfo] of Object.entries(dbInfo.stores)) {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);

            for (const { key, value } of storeInfo.data) {
              store.put(value, key);
            }
          }

          db.close();
          resolve();
        };

        request.onerror = () => reject(request.error);
      });

      promises.push(promise);
    }

    return Promise.all(promises);
  }, capturedData);

  console.log('✓ Data restored to IndexedDB mock');
}

// ===========================================================================
// Example 10: Complete Extraction Workflow
// ===========================================================================

async function completeExtractionWorkflow() {
  const puppeteer = require('puppeteer');
  const fs = require('fs');

  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Step 1: Inject mock
  await injectInPuppeteer(page);

  // Step 2: Navigate to target site
  await page.goto('https://example-app.com');

  // Step 3: Let app initialize and populate IndexedDB
  await page.waitForTimeout(5000);

  // Step 4: Capture data
  const data = await captureIndexedDBData(page);

  // Step 5: Save to file
  fs.writeFileSync('./extracted-idb-data.json', JSON.stringify(data, null, 2));
  console.log('✓ Data saved to extracted-idb-data.json');

  // Step 6: Create standalone HTML with data
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Extracted App</title>
  <script src="indexeddb-mock.js"></script>
  <script>
    // Restore data on load
    const data = ${JSON.stringify(data)};

    window.addEventListener('load', async () => {
      // Restore IndexedDB data
      for (const [dbName, dbInfo] of Object.entries(data)) {
        const request = indexedDB.open(dbName, dbInfo.version);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          for (const [storeName, storeInfo] of Object.entries(dbInfo.stores)) {
            if (!db.objectStoreNames.contains(storeName)) {
              db.createObjectStore(storeName, {
                keyPath: storeInfo.keyPath,
                autoIncrement: storeInfo.autoIncrement
              });
            }
          }
        };

        request.onsuccess = (event) => {
          const db = event.target.result;
          for (const [storeName, storeInfo] of Object.entries(dbInfo.stores)) {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            for (const { key, value } of storeInfo.data) {
              store.put(value, key);
            }
          }
          db.close();
        };
      }

      console.log('✓ IndexedDB data restored');
    });
  </script>
</head>
<body>
  <!-- App content here -->
</body>
</html>
  `;

  fs.writeFileSync('./extracted-app.html', html);
  console.log('✓ Standalone app created: extracted-app.html');

  await browser.close();
}

// ===========================================================================
// Exports
// ===========================================================================

module.exports = {
  injectInPuppeteer,
  injectInPlaywright,
  conditionalInject,
  overrideNativeIndexedDB,
  captureIndexedDBData,
  restoreIndexedDBData,
  completeExtractionWorkflow,
  getManualInjectionCode,
  createElectronPreload,
  createContentScript
};

// ===========================================================================
// CLI Usage
// ===========================================================================

if (require.main === module) {
  console.log('IndexedDB Mock - Injection Examples');
  console.log('====================================\n');
  console.log('This file contains various injection examples.');
  console.log('Import and use the functions in your automation scripts.\n');
  console.log('Available functions:');
  console.log('  - injectInPuppeteer(page)');
  console.log('  - injectInPlaywright(page)');
  console.log('  - conditionalInject(page)');
  console.log('  - overrideNativeIndexedDB(page)');
  console.log('  - captureIndexedDBData(page)');
  console.log('  - restoreIndexedDBData(page, data)');
  console.log('  - completeExtractionWorkflow()');
  console.log('\nRun completeExtractionWorkflow() to see a full example.');
}
