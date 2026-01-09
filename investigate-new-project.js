import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function investigateNewProject() {
  const browser = await chromium.launch({
    headless: false,
    devtools: true
  });

  const results = {
    online: {
      initialLoad: {},
      j1MapKeys: [],
      newProjectNetwork: [],
      consoleLogs: [],
      errors: []
    },
    offline: {
      initialLoad: {},
      j1MapKeys: [],
      newProjectNetwork: [],
      consoleLogs: [],
      errors: []
    }
  };

  // ===== TEST ONLINE VERSION =====
  console.log('\n=== Testing ONLINE version (photopea.com) ===\n');

  const onlinePage = await browser.newPage();

  // Track network requests
  const onlineRequests = [];
  onlinePage.on('request', req => {
    onlineRequests.push({
      url: req.url(),
      method: req.method(),
      resourceType: req.resourceType(),
      timestamp: Date.now()
    });
  });

  // Track console
  onlinePage.on('console', msg => {
    results.online.consoleLogs.push({
      type: msg.type(),
      text: msg.text()
    });
  });

  // Track errors
  onlinePage.on('pageerror', err => {
    results.online.errors.push(err.message);
  });

  console.log('Loading photopea.com...');
  await onlinePage.goto('https://www.photopea.com', {
    waitUntil: 'networkidle',
    timeout: 120000
  });

  // Wait for app to initialize
  console.log('Waiting for app to initialize...');
  await onlinePage.waitForTimeout(5000);

  // Capture initial load network
  results.online.initialLoad = {
    requestCount: onlineRequests.length,
    requestsByType: {}
  };

  onlineRequests.forEach(req => {
    const type = req.resourceType;
    results.online.initialLoad.requestsByType[type] =
      (results.online.initialLoad.requestsByType[type] || 0) + 1;
  });

  // Try to access j1.map
  console.log('Accessing j1.map on online version...');
  const onlineJ1Info = await onlinePage.evaluate(() => {
    const info = {
      j1Found: false,
      j1MapExists: false,
      j1MapKeys: [],
      j1MapSize: 0,
      windowKeys: Object.keys(window).filter(k => k.includes('j1') || k.includes('J1')),
      allGlobalObjects: []
    };

    // Search for j1 in window
    for (let key in window) {
      try {
        const val = window[key];
        if (val && typeof val === 'object' && val.map && val.map instanceof Map) {
          info.allGlobalObjects.push({
            key: key,
            hasMap: true,
            mapSize: val.map.size,
            mapKeys: Array.from(val.map.keys()).slice(0, 20)
          });

          // If this looks like j1, capture more info
          if (key.toLowerCase().includes('j1') || val.map.size > 10) {
            info.j1Found = true;
            info.j1MapExists = true;
            info.j1MapSize = val.map.size;
            info.j1MapKeys = Array.from(val.map.keys()).slice(0, 50);
          }
        }
      } catch (e) {
        // Skip inaccessible properties
      }
    }

    // Alternative: search for objects with a 'map' property that's a Map
    const searchForMaps = () => {
      const found = [];
      for (let key in window) {
        try {
          const obj = window[key];
          if (obj && typeof obj === 'object') {
            for (let prop in obj) {
              try {
                if (obj[prop] instanceof Map && obj[prop].size > 0) {
                  found.push({
                    windowKey: key,
                    property: prop,
                    mapSize: obj[prop].size,
                    sampleKeys: Array.from(obj[prop].keys()).slice(0, 10)
                  });
                }
              } catch (e) {}
            }
          }
        } catch (e) {}
      }
      return found;
    };

    info.mapsFound = searchForMaps();

    return info;
  });

  results.online.j1MapKeys = onlineJ1Info.j1MapKeys || [];
  results.online.j1Info = onlineJ1Info;

  console.log(`Online j1.map info:`, JSON.stringify(onlineJ1Info, null, 2));

  // Clear network tracking and click "New Project"
  console.log('\nClicking "New Project" on online version...');
  const beforeClickCount = onlineRequests.length;

  try {
    // Try to find and click New Project button
    await onlinePage.click('text=New Project', { timeout: 5000 });
    console.log('Clicked "New Project" button');

    // Wait for any network activity
    await onlinePage.waitForTimeout(3000);

    // Capture new requests after click
    const afterClickCount = onlineRequests.length;
    const newRequests = onlineRequests.slice(beforeClickCount);

    results.online.newProjectNetwork = newRequests;
    console.log(`New requests after clicking "New Project": ${newRequests.length}`);

    if (newRequests.length > 0) {
      console.log('New requests:');
      newRequests.forEach(req => {
        console.log(`  - ${req.method} ${req.url} [${req.resourceType}]`);
      });
    }
  } catch (e) {
    console.log(`Error clicking New Project: ${e.message}`);
    results.online.newProjectError = e.message;
  }

  // ===== TEST OFFLINE VERSION =====
  console.log('\n\n=== Testing OFFLINE version (localhost:3333) ===\n');

  const offlinePage = await browser.newPage();

  // Track network requests
  const offlineRequests = [];
  offlinePage.on('request', req => {
    offlineRequests.push({
      url: req.url(),
      method: req.method(),
      resourceType: req.resourceType(),
      timestamp: Date.now()
    });
  });

  // Track console
  offlinePage.on('console', msg => {
    results.offline.consoleLogs.push({
      type: msg.type(),
      text: msg.text()
    });
  });

  // Track errors
  offlinePage.on('pageerror', err => {
    results.offline.errors.push(err.message);
  });

  console.log('Loading localhost:3333...');
  await offlinePage.goto('http://localhost:3333', {
    waitUntil: 'networkidle',
    timeout: 60000
  });

  // Wait for app to initialize
  console.log('Waiting for app to initialize...');
  await offlinePage.waitForTimeout(5000);

  // Capture initial load network
  results.offline.initialLoad = {
    requestCount: offlineRequests.length,
    requestsByType: {}
  };

  offlineRequests.forEach(req => {
    const type = req.resourceType;
    results.offline.initialLoad.requestsByType[type] =
      (results.offline.initialLoad.requestsByType[type] || 0) + 1;
  });

  // Try to access j1.map
  console.log('Accessing j1.map on offline version...');
  const offlineJ1Info = await offlinePage.evaluate(() => {
    const info = {
      j1Found: false,
      j1MapExists: false,
      j1MapKeys: [],
      j1MapSize: 0,
      windowKeys: Object.keys(window).filter(k => k.includes('j1') || k.includes('J1')),
      allGlobalObjects: []
    };

    // Search for j1 in window
    for (let key in window) {
      try {
        const val = window[key];
        if (val && typeof val === 'object' && val.map && val.map instanceof Map) {
          info.allGlobalObjects.push({
            key: key,
            hasMap: true,
            mapSize: val.map.size,
            mapKeys: Array.from(val.map.keys()).slice(0, 20)
          });

          if (key.toLowerCase().includes('j1') || val.map.size > 10) {
            info.j1Found = true;
            info.j1MapExists = true;
            info.j1MapSize = val.map.size;
            info.j1MapKeys = Array.from(val.map.keys()).slice(0, 50);
          }
        }
      } catch (e) {
        // Skip
      }
    }

    // Alternative: search for objects with a 'map' property
    const searchForMaps = () => {
      const found = [];
      for (let key in window) {
        try {
          const obj = window[key];
          if (obj && typeof obj === 'object') {
            for (let prop in obj) {
              try {
                if (obj[prop] instanceof Map && obj[prop].size > 0) {
                  found.push({
                    windowKey: key,
                    property: prop,
                    mapSize: obj[prop].size,
                    sampleKeys: Array.from(obj[prop].keys()).slice(0, 10)
                  });
                }
              } catch (e) {}
            }
          }
        } catch (e) {}
      }
      return found;
    };

    info.mapsFound = searchForMaps();

    return info;
  });

  results.offline.j1MapKeys = offlineJ1Info.j1MapKeys || [];
  results.offline.j1Info = offlineJ1Info;

  console.log(`Offline j1.map info:`, JSON.stringify(offlineJ1Info, null, 2));

  // Clear network tracking and click "New Project"
  console.log('\nClicking "New Project" on offline version...');
  const beforeOfflineClickCount = offlineRequests.length;

  try {
    await offlinePage.click('text=New Project', { timeout: 5000 });
    console.log('Clicked "New Project" button');

    await offlinePage.waitForTimeout(3000);

    const afterOfflineClickCount = offlineRequests.length;
    const newOfflineRequests = offlineRequests.slice(beforeOfflineClickCount);

    results.offline.newProjectNetwork = newOfflineRequests;
    console.log(`New requests after clicking "New Project": ${newOfflineRequests.length}`);

    if (newOfflineRequests.length > 0) {
      console.log('New requests:');
      newOfflineRequests.forEach(req => {
        console.log(`  - ${req.method} ${req.url} [${req.resourceType}]`);
      });
    }
  } catch (e) {
    console.log(`Error clicking New Project: ${e.message}`);
    results.offline.newProjectError = e.message;
  }

  // ===== COMPARISON =====
  console.log('\n\n=== COMPARISON ===\n');

  console.log('Initial Load:');
  console.log(`  Online: ${results.online.initialLoad.requestCount} requests`);
  console.log(`  Offline: ${results.offline.initialLoad.requestCount} requests`);

  console.log('\nj1.map Registry:');
  console.log(`  Online: ${results.online.j1MapKeys.length} keys`);
  console.log(`  Offline: ${results.offline.j1MapKeys.length} keys`);

  if (results.online.j1MapKeys.length > 0 && results.offline.j1MapKeys.length > 0) {
    const onlineSet = new Set(results.online.j1MapKeys);
    const offlineSet = new Set(results.offline.j1MapKeys);

    const onlyOnline = [...onlineSet].filter(k => !offlineSet.has(k));
    const onlyOffline = [...offlineSet].filter(k => !onlineSet.has(k));

    if (onlyOnline.length > 0) {
      console.log(`\n  Keys ONLY in online: ${onlyOnline.join(', ')}`);
    }
    if (onlyOffline.length > 0) {
      console.log(`  Keys ONLY in offline: ${onlyOffline.join(', ')}`);
    }
  }

  console.log('\nNew Project Network Activity:');
  console.log(`  Online: ${results.online.newProjectNetwork.length} new requests`);
  console.log(`  Offline: ${results.offline.newProjectNetwork.length} new requests`);

  console.log('\nErrors:');
  console.log(`  Online: ${results.online.errors.length} errors`);
  console.log(`  Offline: ${results.offline.errors.length} errors`);

  if (results.offline.errors.length > 0) {
    console.log('\n  Offline errors:');
    results.offline.errors.forEach(err => console.log(`    - ${err}`));
  }

  // Save results
  const outputPath = '/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/investigation-results.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);

  // Keep browser open for manual inspection
  console.log('\nBrowser will remain open for 2 minutes for manual inspection...');
  await new Promise(resolve => setTimeout(resolve, 120000));

  await browser.close();

  return results;
}

investigateNewProject().catch(console.error);
