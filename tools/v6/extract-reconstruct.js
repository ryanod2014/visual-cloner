#!/usr/bin/env node
/**
 * V6 Extract & Reconstruct
 * 
 * Actually extracts DOM, styles, and behaviors from the page
 * then reconstructs into a working HTML file.
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const VIEWPORT = { width: 1440, height: 900 };

async function main() {
  const url = process.argv[2] || 'https://excalidraw.com';
  
  const domain = new URL(url).hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = `./output/${domain}-v6-${timestamp}`;
  
  await fs.mkdir(outputDir, { recursive: true });
  
  console.log('='.repeat(60));
  console.log('V6 EXTRACT & RECONSTRUCT');
  console.log('='.repeat(60));
  console.log(`URL: ${url}`);
  console.log(`Output: ${outputDir}`);
  console.log('');
  
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: VIEWPORT });
  
  try {
    // Navigate
    console.log('[1/6] Navigating...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    // Extract full page HTML
    console.log('[2/6] Extracting DOM...');
    const fullHTML = await page.content();
    await fs.writeFile(`${outputDir}/original.html`, fullHTML);
    console.log(`  ✓ Saved original HTML (${(fullHTML.length/1024).toFixed(1)}KB)`);
    
    // Extract all stylesheets
    console.log('[3/6] Extracting stylesheets...');
    const styles = await page.evaluate(() => {
      const allStyles = [];
      
      // Get inline styles
      document.querySelectorAll('style').forEach((el, i) => {
        allStyles.push({
          type: 'inline',
          index: i,
          content: el.textContent
        });
      });
      
      // Get linked stylesheets
      for (const sheet of document.styleSheets) {
        try {
          let css = '';
          for (const rule of sheet.cssRules) {
            css += rule.cssText + '\n';
          }
          allStyles.push({
            type: 'stylesheet',
            href: sheet.href,
            content: css
          });
        } catch(e) {
          // Cross-origin stylesheet
          if (sheet.href) {
            allStyles.push({
              type: 'external',
              href: sheet.href,
              content: null
            });
          }
        }
      }
      
      return allStyles;
    });
    
    let combinedCSS = '';
    for (const style of styles) {
      if (style.content) {
        combinedCSS += `/* ${style.type}: ${style.href || 'inline-' + style.index} */\n`;
        combinedCSS += style.content + '\n\n';
      }
    }
    await fs.writeFile(`${outputDir}/extracted-styles.css`, combinedCSS);
    console.log(`  ✓ Extracted ${styles.length} stylesheets (${(combinedCSS.length/1024).toFixed(1)}KB)`);
    
    // Extract event listeners
    console.log('[4/6] Extracting event listeners...');
    const listeners = await page.evaluate(() => {
      // Try to get listeners from Chrome DevTools protocol
      const collected = [];
      
      // Get all elements and check for event attributes
      document.querySelectorAll('*').forEach(el => {
        const attrs = Array.from(el.attributes || []);
        attrs.forEach(attr => {
          if (attr.name.startsWith('on')) {
            collected.push({
              selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase(),
              event: attr.name.replace('on', ''),
              handler: attr.value.substring(0, 100)
            });
          }
        });
      });
      
      return collected;
    });
    console.log(`  ✓ Found ${listeners.length} event handlers`);
    
    // Extract all scripts
    console.log('[5/6] Extracting scripts...');
    const scripts = await page.evaluate(() => {
      const allScripts = [];
      
      document.querySelectorAll('script').forEach((el, i) => {
        if (el.src) {
          allScripts.push({
            type: 'external',
            src: el.src,
            content: null
          });
        } else if (el.textContent.trim()) {
          allScripts.push({
            type: 'inline',
            index: i,
            content: el.textContent
          });
        }
      });
      
      return allScripts;
    });
    
    let combinedJS = '';
    for (const script of scripts) {
      if (script.content) {
        combinedJS += `/* ${script.type}: ${script.src || 'inline-' + script.index} */\n`;
        combinedJS += script.content + '\n\n';
      }
    }
    await fs.writeFile(`${outputDir}/extracted-scripts.js`, combinedJS);
    console.log(`  ✓ Extracted ${scripts.length} scripts (${(combinedJS.length/1024).toFixed(1)}KB)`);
    
    // Extract computed styles for key elements
    console.log('[6/6] Extracting computed styles for key elements...');
    const computedStyles = await page.evaluate(() => {
      const elements = {};
      const keySelectors = [
        'body', 'header', 'nav', 'main', 'footer',
        'h1', 'h2', 'h3', 'p', 'a', 'button',
        '[class*="toolbar"]', '[class*="menu"]', '[class*="modal"]',
        '[class*="btn"]', '[class*="button"]'
      ];
      
      keySelectors.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) {
          const computed = getComputedStyle(el);
          elements[sel] = {
            display: computed.display,
            position: computed.position,
            width: computed.width,
            height: computed.height,
            padding: computed.padding,
            margin: computed.margin,
            backgroundColor: computed.backgroundColor,
            color: computed.color,
            fontFamily: computed.fontFamily,
            fontSize: computed.fontSize,
            fontWeight: computed.fontWeight,
            borderRadius: computed.borderRadius,
            boxShadow: computed.boxShadow
          };
        }
      });
      
      return elements;
    });
    await fs.writeFile(`${outputDir}/computed-styles.json`, JSON.stringify(computedStyles, null, 2));
    
    // Take screenshot for reference
    await page.screenshot({ path: `${outputDir}/reference.png`, fullPage: true });
    console.log('  ✓ Saved reference screenshot');
    
    // Create reconstructed HTML
    console.log('\n[RECONSTRUCT] Building clone.html...');
    
    // Get just the body content
    const bodyContent = await page.evaluate(() => {
      return document.body.innerHTML;
    });
    
    const reconstructed = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${await page.title()} - V6 Clone</title>
  <style>
${combinedCSS}
  </style>
</head>
<body>
${bodyContent}
<script>
${combinedJS}
</script>
</body>
</html>`;
    
    await fs.writeFile(`${outputDir}/clone.html`, reconstructed);
    console.log(`  ✓ Created clone.html (${(reconstructed.length/1024).toFixed(1)}KB)`);
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('EXTRACTION COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nOutput: ${outputDir}`);
    console.log(`  - original.html: Full page HTML`);
    console.log(`  - extracted-styles.css: All CSS`);
    console.log(`  - extracted-scripts.js: All JS`);
    console.log(`  - computed-styles.json: Computed styles`);
    console.log(`  - reference.png: Screenshot`);
    console.log(`  - clone.html: Reconstructed page`);
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
