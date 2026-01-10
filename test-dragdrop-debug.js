#!/usr/bin/env node
/**
 * Debug drag and drop functionality
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true
  });

  const page = await browser.newPage();

  // Monitor console messages
  page.on('console', msg => {
    console.log(`[CONSOLE ${msg.type()}]`, msg.text());
  });

  // Monitor errors
  page.on('pageerror', error => {
    console.log('[PAGE ERROR]', error.message);
  });

  console.log('Loading Photopea offline...');
  await page.goto('http://localhost:3344/?test=1', { waitUntil: 'networkidle0' });

  // Wait for initialization
  console.log('Waiting for initialization...');
  await page.waitForTimeout(10000);

  // Inject drag/drop monitoring code
  console.log('\nInjecting drag/drop monitors...');
  await page.evaluate(() => {
    const events = ['drag', 'dragstart', 'dragenter', 'dragover', 'dragleave', 'drop', 'dragend'];

    window.dragDropLog = [];

    events.forEach(eventName => {
      document.addEventListener(eventName, (e) => {
        const log = {
          event: eventName,
          target: e.target.tagName + (e.target.id ? '#' + e.target.id : '') + (e.target.className ? '.' + e.target.className.split(' ')[0] : ''),
          defaultPrevented: e.defaultPrevented,
          timestamp: Date.now()
        };
        window.dragDropLog.push(log);
        console.log(`[DRAG/DROP] ${eventName} on ${log.target}, prevented: ${log.defaultPrevented}`);
      }, true);
    });

    // Also monitor file input changes
    document.addEventListener('change', (e) => {
      if (e.target.type === 'file') {
        console.log('[FILE INPUT] Change detected:', e.target.files);
      }
    }, true);

    console.log('Drag/drop monitors installed');
  });

  // Create a test image file
  const testImagePath = '/tmp/test-drag.png';
  const testImageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(testImagePath, testImageData);

  console.log('\nTest image created at:', testImagePath);
  console.log('\nPlease manually drag and drop an image onto the canvas.');
  console.log('This script will monitor all drag/drop events...\n');

  // Wait for drag/drop events
  await page.waitForTimeout(30000);

  // Get the logged events
  const dragLog = await page.evaluate(() => window.dragDropLog);

  console.log('\n=== DRAG/DROP EVENT LOG ===');
  console.log(JSON.stringify(dragLog, null, 2));

  // Check if there are any file input elements
  const fileInputs = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="file"]');
    return Array.from(inputs).map(input => ({
      id: input.id,
      name: input.name,
      accept: input.accept,
      multiple: input.multiple,
      visible: input.offsetParent !== null,
      display: window.getComputedStyle(input).display
    }));
  });

  console.log('\n=== FILE INPUT ELEMENTS ===');
  console.log(JSON.stringify(fileInputs, null, 2));

  // Check for drag/drop related code in global scope
  const dragDropApi = await page.evaluate(() => {
    const checks = {
      hasDragEventListeners: !!window.ondrag,
      hasDropEventListeners: !!window.ondrop,
      hasDataTransfer: typeof DataTransfer !== 'undefined',
      hasFileReader: typeof FileReader !== 'undefined',
      hasBlob: typeof Blob !== 'undefined',
      hasURL: typeof URL !== 'undefined'
    };
    return checks;
  });

  console.log('\n=== DRAG/DROP API AVAILABILITY ===');
  console.log(JSON.stringify(dragDropApi, null, 2));

  console.log('\nKeeping browser open for manual testing...');
  console.log('Press Ctrl+C to exit');

  // Keep alive
  await new Promise(() => {});
})();
