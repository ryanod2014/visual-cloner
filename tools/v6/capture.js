#!/usr/bin/env node
/**
 * V6 Capture - Screenshots + Behavior Extraction
 *
 * This captures everything needed for V6 clone:
 * 1. Screenshots of each viewport section
 * 2. CSS variables
 * 3. Event listener patterns
 * 4. Breakpoints
 * 5. Design tokens
 *
 * After running this, Claude reads the screenshots and recreates pixel-perfect.
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

  await fs.mkdir(`${outputDir}/screenshots`, { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 CAPTURE');
  console.log('='.repeat(60));
  console.log(`URL: ${url}`);
  console.log(`Output: ${outputDir}`);
  console.log('');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: VIEWPORT });

  try {
    // Navigate
    console.log('[1/5] Navigating...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Get page info
    const pageInfo = await page.evaluate(() => ({
      title: document.title,
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    }));
    console.log(`  Page: ${pageInfo.title}`);
    console.log(`  Size: ${pageInfo.width}x${pageInfo.height}`);

    // Extract CSS variables
    console.log('\n[2/5] Extracting CSS variables...');
    const cssVars = await page.evaluate(() => {
      const vars = {};
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText === ':root') {
              for (const prop of rule.style) {
                if (prop.startsWith('--')) {
                  vars[prop] = rule.style.getPropertyValue(prop).trim();
                }
              }
            }
          }
        } catch(e) {}
      }
      return vars;
    });
    console.log(`  Found ${Object.keys(cssVars).length} CSS variables`);

    // Extract design tokens
    console.log('\n[3/5] Extracting design tokens...');
    const tokens = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const h1 = document.querySelector('h1');
      const btn = document.querySelector('button, [class*="btn"]');

      return {
        colors: {
          background: body.backgroundColor,
          text: body.color,
          heading: h1 ? getComputedStyle(h1).color : body.color,
          accent: btn ? getComputedStyle(btn).backgroundColor : '#6965db'
        },
        fonts: {
          body: body.fontFamily,
          heading: h1 ? getComputedStyle(h1).fontFamily : body.fontFamily
        }
      };
    });
    console.log(`  Background: ${tokens.colors.background}`);
    console.log(`  Text: ${tokens.colors.text}`);

    // Extract breakpoints from CSS
    console.log('\n[4/5] Extracting breakpoints...');
    const breakpoints = await page.evaluate(() => {
      const bps = new Set();
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSMediaRule) {
              const matches = rule.conditionText.match(/(\d+)px/g);
              if (matches) {
                matches.forEach(m => bps.add(parseInt(m)));
              }
            }
          }
        } catch(e) {}
      }
      return [...bps].sort((a,b) => a-b);
    });
    console.log(`  Found ${breakpoints.length} breakpoints: ${breakpoints.slice(0,5).join(', ')}...`);

    // Take screenshots by scrolling through page
    console.log('\n[5/5] Capturing screenshots...');
    const screenshots = [];
    const scrollStep = 800;
    let scrollY = 0;
    let sectionNum = 0;

    // First, take a full-page screenshot
    await page.screenshot({
      path: `${outputDir}/screenshots/full-page.png`,
      fullPage: true
    });
    console.log(`  ✓ full-page.png`);

    // Then take viewport-by-viewport screenshots
    while (scrollY < pageInfo.height) {
      await page.evaluate((y) => window.scrollTo(0, y), scrollY);
      await page.waitForTimeout(300);

      const filename = `${String(sectionNum).padStart(2, '0')}-viewport-${scrollY}.png`;
      await page.screenshot({ path: `${outputDir}/screenshots/${filename}` });

      screenshots.push({
        filename,
        scrollY,
        order: sectionNum
      });

      console.log(`  ✓ ${filename}`);

      scrollY += scrollStep;
      sectionNum++;
    }

    // Save manifest
    const manifest = {
      url,
      title: pageInfo.title,
      captured: new Date().toISOString(),
      pageSize: { width: pageInfo.width, height: pageInfo.height },
      viewport: VIEWPORT,
      screenshots,
      extraction: {
        cssVariables: cssVars,
        designTokens: tokens,
        breakpoints
      }
    };

    await fs.writeFile(
      `${outputDir}/manifest.json`,
      JSON.stringify(manifest, null, 2)
    );

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('CAPTURE COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nOutput: ${outputDir}`);
    console.log(`Screenshots: ${screenshots.length}`);
    console.log(`CSS Variables: ${Object.keys(cssVars).length}`);
    console.log(`Breakpoints: ${breakpoints.length}`);
    console.log(`\nNext: Claude reads screenshots and recreates pixel-perfect`);
    console.log(`\nManifest: ${outputDir}/manifest.json`);

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
