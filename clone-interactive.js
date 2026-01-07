#!/usr/bin/env node

/**
 * INTERACTIVE VISUAL CLONING SYSTEM
 *
 * This script prepares screenshots and HTML files for the cloning process.
 * It's designed to be driven by Claude Code which handles the AI vision comparisons.
 *
 * Commands:
 *   capture <url>              - Capture full page and identify sections
 *   capture-section <index>    - Capture a specific section screenshot
 *   render <htmlfile>          - Render an HTML file and take screenshot
 *   side-by-side <orig> <attempt> - Create a side-by-side comparison image
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  outputDir: path.join(__dirname, 'output'),
  screenshotDir: path.join(__dirname, 'screenshots'),
  viewportWidth: 1440,
  viewportHeight: 900,
  sectionsFile: path.join(__dirname, 'sections.json'),
};

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

// ============================================================================
// CAPTURE COMMAND
// ============================================================================

async function captureFullPage(url) {
  console.log(`\n📸 Capturing full page: ${url}`);

  await ensureDir(CONFIG.outputDir);
  await ensureDir(CONFIG.screenshotDir);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({
    width: CONFIG.viewportWidth,
    height: CONFIG.viewportHeight
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Get page dimensions
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));

  console.log(`Page dimensions: ${dimensions.width}x${dimensions.height}`);

  // Take full page screenshot
  const fullPagePath = path.join(CONFIG.screenshotDir, 'full-page.png');
  await page.screenshot({ path: fullPagePath, fullPage: true });
  console.log(`Full page saved: ${fullPagePath}`);

  // Take viewport screenshot (above the fold)
  const viewportPath = path.join(CONFIG.screenshotDir, 'viewport.png');
  await page.screenshot({ path: viewportPath });
  console.log(`Viewport saved: ${viewportPath}`);

  // Save page info
  const pageInfo = {
    url,
    dimensions,
    capturedAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(CONFIG.outputDir, 'page-info.json'),
    JSON.stringify(pageInfo, null, 2)
  );

  await browser.close();

  console.log('\n✅ Capture complete!');
  console.log(`\nNext step: Analyze ${fullPagePath} to identify sections`);
  console.log('Then save sections to sections.json using format:');
  console.log(`[
  { "name": "header", "description": "...", "yStart": 0, "height": 80 },
  { "name": "hero", "description": "...", "yStart": 80, "height": 700 },
  ...
]`);

  return { fullPagePath, viewportPath, dimensions };
}

// ============================================================================
// CAPTURE SECTION COMMAND
// ============================================================================

async function captureSection(sectionIndex, url) {
  // Load sections
  let sections;
  try {
    const sectionsData = await fs.readFile(CONFIG.sectionsFile, 'utf-8');
    sections = JSON.parse(sectionsData);
  } catch (e) {
    console.error('No sections.json found. Run capture first and create sections.json');
    process.exit(1);
  }

  if (sectionIndex < 0 || sectionIndex >= sections.length) {
    console.error(`Invalid section index. Available: 0-${sections.length - 1}`);
    process.exit(1);
  }

  const section = sections[sectionIndex];
  console.log(`\n📸 Capturing section ${sectionIndex}: ${section.name}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({
    width: CONFIG.viewportWidth,
    height: Math.max(section.height, CONFIG.viewportHeight)
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Scroll to section
  await page.evaluate((y) => window.scrollTo(0, y), section.yStart);
  await page.waitForTimeout(500);

  // Capture section
  const sectionPath = path.join(CONFIG.screenshotDir, `original-${section.name}.png`);
  await page.screenshot({
    path: sectionPath,
    clip: {
      x: 0,
      y: 0,
      width: CONFIG.viewportWidth,
      height: section.height
    }
  });

  console.log(`Section saved: ${sectionPath}`);
  await browser.close();

  return sectionPath;
}

// ============================================================================
// CAPTURE ALL SECTIONS COMMAND
// ============================================================================

async function captureAllSections(url) {
  // Load sections
  let sections;
  try {
    const sectionsData = await fs.readFile(CONFIG.sectionsFile, 'utf-8');
    sections = JSON.parse(sectionsData);
  } catch (e) {
    console.error('No sections.json found. Create it first.');
    process.exit(1);
  }

  console.log(`\n📸 Capturing ${sections.length} sections from ${url}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({
    width: CONFIG.viewportWidth,
    height: CONFIG.viewportHeight
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    console.log(`  Capturing ${section.name}...`);

    await page.evaluate((y) => window.scrollTo(0, y), section.yStart);
    await page.waitForTimeout(500);

    const sectionPath = path.join(CONFIG.screenshotDir, `original-${section.name}.png`);
    await page.screenshot({
      path: sectionPath,
      clip: {
        x: 0,
        y: 0,
        width: CONFIG.viewportWidth,
        height: Math.min(section.height, CONFIG.viewportHeight)
      }
    });
  }

  await browser.close();
  console.log('\n✅ All sections captured!');
}

// ============================================================================
// RENDER COMMAND
// ============================================================================

async function renderHtml(htmlFile, outputName) {
  console.log(`\n🖥️  Rendering: ${htmlFile}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({
    width: CONFIG.viewportWidth,
    height: CONFIG.viewportHeight
  });

  const absolutePath = path.resolve(htmlFile);
  await page.goto(`file://${absolutePath}`);
  await page.waitForTimeout(1000);

  const screenshotName = outputName || path.basename(htmlFile, '.html');
  const screenshotPath = path.join(CONFIG.screenshotDir, `rendered-${screenshotName}.png`);
  await page.screenshot({ path: screenshotPath });

  console.log(`Screenshot saved: ${screenshotPath}`);
  await browser.close();

  return screenshotPath;
}

// ============================================================================
// RENDER FULL PAGE COMMAND
// ============================================================================

async function renderHtmlFullPage(htmlFile, outputName) {
  console.log(`\n🖥️  Rendering full page: ${htmlFile}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({
    width: CONFIG.viewportWidth,
    height: CONFIG.viewportHeight
  });

  const absolutePath = path.resolve(htmlFile);
  await page.goto(`file://${absolutePath}`);
  await page.waitForTimeout(1000);

  const screenshotName = outputName || path.basename(htmlFile, '.html');
  const screenshotPath = path.join(CONFIG.screenshotDir, `rendered-${screenshotName}-full.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(`Screenshot saved: ${screenshotPath}`);
  await browser.close();

  return screenshotPath;
}

// ============================================================================
// CLI
// ============================================================================

const [,, command, ...args] = process.argv;

switch (command) {
  case 'capture':
    if (!args[0]) {
      console.error('Usage: node clone-interactive.js capture <url>');
      process.exit(1);
    }
    captureFullPage(args[0]);
    break;

  case 'capture-section':
    if (args.length < 2) {
      console.error('Usage: node clone-interactive.js capture-section <index> <url>');
      process.exit(1);
    }
    captureSection(parseInt(args[0]), args[1]);
    break;

  case 'capture-all':
    if (!args[0]) {
      console.error('Usage: node clone-interactive.js capture-all <url>');
      process.exit(1);
    }
    captureAllSections(args[0]);
    break;

  case 'render':
    if (!args[0]) {
      console.error('Usage: node clone-interactive.js render <htmlfile> [outputname]');
      process.exit(1);
    }
    renderHtml(args[0], args[1]);
    break;

  case 'render-full':
    if (!args[0]) {
      console.error('Usage: node clone-interactive.js render-full <htmlfile> [outputname]');
      process.exit(1);
    }
    renderHtmlFullPage(args[0], args[1]);
    break;

  default:
    console.log(`
Visual Cloning System - Interactive Mode

Commands:
  capture <url>                    Capture full page and viewport screenshots
  capture-section <index> <url>    Capture a specific section
  capture-all <url>                Capture all sections defined in sections.json
  render <htmlfile> [name]         Render HTML file and screenshot
  render-full <htmlfile> [name]    Render HTML file full page screenshot

Workflow:
  1. node clone-interactive.js capture https://example.com
  2. Analyze full-page.png to identify sections
  3. Create sections.json with section definitions
  4. node clone-interactive.js capture-all https://example.com
  5. For each section:
     a. Create attempt HTML
     b. node clone-interactive.js render output/attempt.html
     c. Compare screenshots, refine, repeat
  6. Assemble final page
`);
}
