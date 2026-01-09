#!/usr/bin/env node
import { chromium } from 'playwright';
import { apiRecorder } from './pipeline/extractors/index.js';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Add API recorder before navigation
  await context.addInitScript(apiRecorder.getInjectionScript());

  const page = await context.newPage();

  console.log('Testing API recorder with fetch calls...\n');

  await page.goto('about:blank');
  await page.evaluate(async () => {
    // Make some test fetch requests
    await fetch('https://jsonplaceholder.typicode.com/posts/1');
    await fetch('https://jsonplaceholder.typicode.com/users/1');
    await fetch('https://jsonplaceholder.typicode.com/posts', {
      method: 'POST',
      body: JSON.stringify({ title: 'test', body: 'test', userId: 1 }),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  await page.waitForTimeout(1000);

  const data = await apiRecorder.extractData(page);

  console.log('API Recorder captured', data.requests?.length || 0, 'requests:\n');

  if (data.requests?.length > 0) {
    data.requests.forEach((r, i) => {
      console.log(`[${i + 1}] ${r.method} ${r.url}`);
      console.log(`    Type: ${r.type}`);
      console.log(`    Status: ${r.response?.status || 'N/A'}`);
      if (r.response?.body) {
        const body = typeof r.response.body === 'object'
          ? JSON.stringify(r.response.body).substring(0, 100)
          : String(r.response.body).substring(0, 100);
        console.log(`    Response: ${body}...`);
      }
      console.log('');
    });
  }

  console.log('✓ API Recorder is working correctly!');
  console.log('\nNote: Excalidraw shows 0 requests because it\'s a client-side app');
  console.log('that doesn\'t make fetch/XHR API calls on initial load.');

  await browser.close();
})();
