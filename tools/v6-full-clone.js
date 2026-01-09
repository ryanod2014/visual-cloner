#!/usr/bin/env node
/**
 * V6 Full Clone - Extracts everything including external resources
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import http from 'http';

const VIEWPORT = { width: 1440, height: 900 };

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  const url = process.argv[2] || 'https://excalidraw.com';
  
  const domain = new URL(url).hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = `./output/${domain}-v6-full-${timestamp}`;
  
  await fs.mkdir(`${outputDir}/assets`, { recursive: true });
  
  console.log('='.repeat(60));
  console.log('V6 FULL CLONE');
  console.log('='.repeat(60));
  console.log(`URL: ${url}`);
  console.log(`Output: ${outputDir}`);
  console.log('');
  
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: VIEWPORT });
  
  try {
    // Collect all external resources
    const externalScripts = [];
    const externalStyles = [];
    
    page.on('response', async (response) => {
      const resUrl = response.url();
      const contentType = response.headers()['content-type'] || '';
      
      if (contentType.includes('javascript') && !resUrl.includes('analytics')) {
        try {
          const body = await response.text();
          externalScripts.push({ url: resUrl, content: body });
        } catch(e) {}
      }
      if (contentType.includes('css')) {
        try {
          const body = await response.text();
          externalStyles.push({ url: resUrl, content: body });
        } catch(e) {}
      }
    });
    
    console.log('[1/5] Navigating and capturing resources...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);
    
    console.log(`  ✓ Captured ${externalScripts.length} JS files`);
    console.log(`  ✓ Captured ${externalStyles.length} CSS files`);
    
    // Extract inline content
    console.log('[2/5] Extracting inline content...');
    const pageData = await page.evaluate(() => {
      const inlineStyles = [];
      document.querySelectorAll('style').forEach((el, i) => {
        inlineStyles.push(el.textContent);
      });
      
      const inlineScripts = [];
      document.querySelectorAll('script:not([src])').forEach((el, i) => {
        if (el.textContent.trim()) {
          inlineScripts.push(el.textContent);
        }
      });
      
      return {
        title: document.title,
        bodyHTML: document.body.innerHTML,
        inlineStyles,
        inlineScripts
      };
    });
    
    // Build combined CSS
    console.log('[3/5] Building combined CSS...');
    let allCSS = '/* V6 Full Clone - Extracted CSS */\n\n';
    
    // Add external CSS first
    for (const style of externalStyles) {
      allCSS += `/* External: ${style.url} */\n${style.content}\n\n`;
    }
    
    // Add inline styles
    pageData.inlineStyles.forEach((css, i) => {
      allCSS += `/* Inline style ${i} */\n${css}\n\n`;
    });
    
    await fs.writeFile(`${outputDir}/assets/styles.css`, allCSS);
    console.log(`  ✓ Combined CSS: ${(allCSS.length/1024).toFixed(1)}KB`);
    
    // Build combined JS
    console.log('[4/5] Building combined JS...');
    let allJS = '/* V6 Full Clone - Extracted JS */\n\n';
    
    // Add external JS
    for (const script of externalScripts) {
      const filename = path.basename(new URL(script.url).pathname);
      allJS += `/* External: ${filename} */\n${script.content}\n\n`;
    }
    
    // Add inline scripts
    pageData.inlineScripts.forEach((js, i) => {
      allJS += `/* Inline script ${i} */\n${js}\n\n`;
    });
    
    await fs.writeFile(`${outputDir}/assets/scripts.js`, allJS);
    console.log(`  ✓ Combined JS: ${(allJS.length/1024).toFixed(1)}KB`);
    
    // Build final HTML
    console.log('[5/5] Building clone.html...');
    const finalHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageData.title} - V6 Full Clone</title>
  <link rel="stylesheet" href="assets/styles.css">
</head>
<body>
${pageData.bodyHTML}
<script src="assets/scripts.js"></script>
</body>
</html>`;
    
    await fs.writeFile(`${outputDir}/clone.html`, finalHTML);
    
    // Also save reference screenshot
    await page.screenshot({ path: `${outputDir}/reference.png`, fullPage: true });
    
    console.log('\n' + '='.repeat(60));
    console.log('FULL CLONE COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nOutput: ${outputDir}`);
    console.log(`  clone.html + assets/`);
    console.log(`\nNote: Some functionality may not work due to:`);
    console.log(`  - API calls to original domain`);
    console.log(`  - Dynamic imports not captured`);
    console.log(`  - WebSocket connections`);
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
