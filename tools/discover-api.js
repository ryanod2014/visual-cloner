#!/usr/bin/env node
/**
 * Discover Photopea's internal API structure
 */

import { chromium } from 'playwright';

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Discover Photopea Internal APIs                     ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Loading Photopea...');
  await page.goto('https://www.photopea.com/', { waitUntil: 'domcontentloaded', timeout: 120000 });

  // Wait for app to initialize
  console.log('Waiting for app to initialize...');
  await page.waitForFunction(() => {
    return typeof window.Photopea !== 'undefined' ||
           typeof window.app !== 'undefined' ||
           document.querySelector('canvas');
  }, { timeout: 60000 }).catch(() => console.log('Timeout waiting for app'));

  await page.waitForTimeout(5000); // Extra wait for full init

  // Discover API structure
  console.log('\nDiscovering API structure...\n');

  const apiInfo = await page.evaluate(() => {
    const result = {
      globals: [],
      appKeys: [],
      photopeaKeys: [],
      documentKeys: [],
      layerKeys: [],
      constructors: [],
      methods: [],
    };

    // Check global objects
    const globalNames = ['app', 'Photopea', 'PP', 'pea', 'Editor', 'Document', 'Layer', 'Selection', 'History'];
    for (const name of globalNames) {
      if (typeof window[name] !== 'undefined') {
        result.globals.push(name);
      }
    }

    // app object
    if (typeof window.app !== 'undefined') {
      result.appKeys = Object.keys(window.app).slice(0, 50);

      // Check for methods
      for (const key of Object.keys(window.app)) {
        if (typeof window.app[key] === 'function') {
          result.methods.push(`app.${key}()`);
        }
      }
    }

    // Photopea namespace
    if (typeof window.Photopea !== 'undefined') {
      result.photopeaKeys = Object.keys(window.Photopea).slice(0, 50);

      for (const key of Object.keys(window.Photopea)) {
        if (typeof window.Photopea[key] === 'function') {
          result.methods.push(`Photopea.${key}()`);
        }
      }
    }

    // Active document
    if (window.app?.activeDocument) {
      result.documentKeys = Object.keys(window.app.activeDocument).slice(0, 50);

      for (const key of Object.keys(window.app.activeDocument)) {
        if (typeof window.app.activeDocument[key] === 'function') {
          result.methods.push(`doc.${key}()`);
        }
      }
    }

    // Active layer
    if (window.app?.activeDocument?.activeLayer) {
      result.layerKeys = Object.keys(window.app.activeDocument.activeLayer).slice(0, 50);

      for (const key of Object.keys(window.app.activeDocument.activeLayer)) {
        if (typeof window.app.activeDocument.activeLayer[key] === 'function') {
          result.methods.push(`layer.${key}()`);
        }
      }
    }

    // Find constructor functions
    for (const key of Object.keys(window)) {
      try {
        const val = window[key];
        if (typeof val === 'function' && /^[A-Z]/.test(key) && val.prototype) {
          result.constructors.push(key);
        }
      } catch (e) {}
    }

    return result;
  });

  console.log('=== Global Objects Found ===');
  console.log(apiInfo.globals.join(', ') || 'None');

  console.log('\n=== app Object Keys ===');
  console.log(apiInfo.appKeys.join(', ') || 'No app object');

  console.log('\n=== Photopea Namespace Keys ===');
  console.log(apiInfo.photopeaKeys.join(', ') || 'No Photopea namespace');

  console.log('\n=== Document Keys ===');
  console.log(apiInfo.documentKeys.join(', ') || 'No active document');

  console.log('\n=== Layer Keys ===');
  console.log(apiInfo.layerKeys.join(', ') || 'No active layer');

  console.log('\n=== Available Methods ===');
  apiInfo.methods.slice(0, 30).forEach(m => console.log(`  ${m}`));
  if (apiInfo.methods.length > 30) {
    console.log(`  ... and ${apiInfo.methods.length - 30} more`);
  }

  console.log('\n=== Constructor Functions ===');
  apiInfo.constructors.slice(0, 20).forEach(c => console.log(`  ${c}`));

  // Try to create a document and explore its API
  console.log('\n=== Trying to create a document ===');

  const docInfo = await page.evaluate(async () => {
    const result = { success: false, methods: [], error: null };

    try {
      // Try various ways to create a document
      if (typeof Photopea !== 'undefined' && Photopea.runScript) {
        // Photopea uses a script-based API
        await Photopea.runScript('app.documents.add(100, 100)');
        result.success = true;
        result.note = 'Created via Photopea.runScript';
      } else if (typeof app !== 'undefined' && app.documents) {
        app.documents.add(100, 100);
        result.success = true;
        result.note = 'Created via app.documents.add';
      }

      // Check what we have now
      if (window.app?.activeDocument) {
        result.docKeys = Object.keys(window.app.activeDocument);
        result.docMethods = result.docKeys.filter(k => typeof window.app.activeDocument[k] === 'function');

        if (window.app.activeDocument.activeLayer) {
          result.layerKeys = Object.keys(window.app.activeDocument.activeLayer);
          result.layerMethods = result.layerKeys.filter(k => typeof window.app.activeDocument.activeLayer[k] === 'function');
        }
      }
    } catch (e) {
      result.error = e.message;
    }

    return result;
  });

  if (docInfo.success) {
    console.log(`Document created: ${docInfo.note}`);
    console.log('Document methods:', docInfo.docMethods?.slice(0, 20).join(', '));
    console.log('Layer methods:', docInfo.layerMethods?.slice(0, 20).join(', '));
  } else {
    console.log('Could not create document:', docInfo.error);
  }

  // Close browser after discovery
  console.log('\nDiscovery complete. Closing browser...');
  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
