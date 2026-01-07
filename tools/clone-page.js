/**
 * Visual Page Cloner - End-to-End Orchestrator
 *
 * Usage: node tools/clone-page.js <url>
 *
 * This script automates the entire visual cloning process:
 * 1. Analyze page structure (detect sections)
 * 2. Extract each section in parallel (via Claude API)
 * 3. Capture hover states
 * 4. Assemble into single HTML file
 * 5. Validate against original
 */

import Anthropic from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const VIEWPORT = { width: 1440, height: 900 };
const HOVER_PROPERTIES = [
  'color', 'background-color', 'background', 'border-color',
  'box-shadow', 'transform', 'opacity', 'text-decoration'
];

// ============================================================================
// Page Analysis (browser scripts as strings to avoid transpilation issues)
// ============================================================================

const ANALYZE_PAGE_SCRIPT = `
() => {
  const sections = [];
  const seenBounds = new Set();

  function getSelector(el) {
    if (el.id) return '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.split(' ').filter(c => c.trim() && !c.includes(':'));
      if (classes.length) return '.' + classes[0];
    }
    return el.tagName.toLowerCase();
  }

  function boundsKey(rect) {
    return Math.round(rect.top / 50) + '-' + Math.round(rect.height / 50);
  }

  function describeSection(el) {
    const headings = el.querySelectorAll('h1, h2, h3');
    if (headings.length > 0) {
      return Array.from(headings).slice(0, 2).map(h => (h.textContent || '').trim().substring(0, 50)).join(' | ');
    }
    const text = (el.textContent || '').trim().substring(0, 100);
    return text.replace(/\\s+/g, ' ');
  }

  // Strategy 1: Semantic elements
  document.querySelectorAll('header, nav, main, footer').forEach(function(el) {
    const rect = el.getBoundingClientRect();
    if (rect.height < 50) return;

    const key = boundsKey(rect);
    if (seenBounds.has(key)) return;
    seenBounds.add(key);

    sections.push({
      id: el.tagName.toLowerCase(),
      type: 'semantic',
      bounds: { top: rect.top + window.scrollY, left: rect.left, width: rect.width, height: rect.height },
      selector: getSelector(el),
      description: describeSection(el)
    });
  });

  // Strategy 2: Section elements
  document.querySelectorAll('section, article').forEach(function(el, i) {
    const rect = el.getBoundingClientRect();
    if (rect.height < 100) return;

    const key = boundsKey(rect);
    if (seenBounds.has(key)) return;
    seenBounds.add(key);

    sections.push({
      id: 'section-' + i,
      type: 'section',
      bounds: { top: rect.top + window.scrollY, left: rect.left, width: rect.width, height: rect.height },
      selector: getSelector(el),
      description: describeSection(el)
    });
  });

  // Strategy 3: Top-level divs with significant content
  document.querySelectorAll('body > div, main > div, #__next > div > div').forEach(function(el, i) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);

    if (rect.height < 150 || rect.width < window.innerWidth * 0.5) return;

    const key = boundsKey(rect);
    if (seenBounds.has(key)) return;

    const hasBackground = style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.backgroundImage !== 'none';
    const hasContent = el.querySelectorAll('h1, h2, h3, p, img, button').length > 0;

    if (!hasBackground && !hasContent) return;

    seenBounds.add(key);
    sections.push({
      id: 'block-' + i,
      type: 'visual-block',
      bounds: { top: rect.top + window.scrollY, left: rect.left, width: rect.width, height: rect.height },
      selector: getSelector(el),
      description: describeSection(el)
    });
  });

  sections.sort(function(a, b) { return a.bounds.top - b.bounds.top; });
  sections.forEach(function(s, i) { s.order = i; });

  // Find interactive elements for hover capture
  const interactive = [];
  document.querySelectorAll('a, button, [role="button"], [class*="card"], [class*="btn"]').forEach(function(el, i) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return;
    if (!el.offsetParent) return;

    const computed = getComputedStyle(el);
    const defaultStyles = {};
    ['color', 'background-color', 'background', 'border-color', 'box-shadow', 'transform', 'opacity', 'text-decoration']
      .forEach(function(prop) { defaultStyles[prop] = computed.getPropertyValue(prop); });

    interactive.push({
      id: 'interactive-' + i,
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().substring(0, 30),
      bounds: { top: rect.top + window.scrollY, left: rect.left, width: rect.width, height: rect.height },
      selector: getSelector(el),
      defaultStyles: defaultStyles
    });
  });

  return {
    url: window.location.href,
    title: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    fullHeight: document.documentElement.scrollHeight,
    sections: sections,
    interactive: interactive.slice(0, 50)
  };
}
`;

// ============================================================================
// Page Analysis
// ============================================================================

async function analyzePage(page) {
  // Scroll through entire page first to trigger lazy loading
  const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < fullHeight; y += 500) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // Use eval to convert string to function (avoids transpilation issues)
  const manifest = await page.evaluate(eval(ANALYZE_PAGE_SCRIPT));
  return manifest;
}

// ============================================================================
// Section Extraction
// ============================================================================

async function extractSectionData(page, section) {
  // Scroll section into view
  await page.evaluate((top) => window.scrollTo(0, Math.max(0, top - 100)), section.bounds.top);
  await page.waitForTimeout(300);

  const extractScript = `
    (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;

      const computed = getComputedStyle(el);
      const containerStyles = {
        backgroundColor: computed.backgroundColor,
        background: computed.background,
        color: computed.color,
        fontFamily: computed.fontFamily,
        padding: computed.padding,
        margin: computed.margin,
        maxWidth: computed.maxWidth,
        display: computed.display,
        flexDirection: computed.flexDirection,
        alignItems: computed.alignItems,
        justifyContent: computed.justifyContent,
        gap: computed.gap,
        gridTemplateColumns: computed.gridTemplateColumns,
      };

      const children = [];
      el.querySelectorAll('h1, h2, h3, h4, p, a, button, img, [class*="card"]').forEach(function(child, i) {
        if (i > 20) return;
        const childComputed = getComputedStyle(child);
        const rect = child.getBoundingClientRect();
        children.push({
          tag: child.tagName.toLowerCase(),
          classes: child.className,
          text: (child.textContent || '').trim().substring(0, 100),
          styles: {
            color: childComputed.color,
            fontSize: childComputed.fontSize,
            fontWeight: childComputed.fontWeight,
            fontFamily: childComputed.fontFamily,
            backgroundColor: childComputed.backgroundColor,
            padding: childComputed.padding,
            borderRadius: childComputed.borderRadius,
            border: childComputed.border,
          },
          bounds: { width: rect.width, height: rect.height }
        });
      });

      return {
        outerHTML: el.outerHTML.substring(0, 5000),
        containerStyles: containerStyles,
        children: children
      };
    }
  `;

  return await page.evaluate(eval(extractScript), section.selector);
}

async function cloneSection(client, section, sectionData, screenshotBase64) {
  const prompt = `You are a pixel-perfect CSS developer. Clone this webpage section visually.

SECTION: ${section.id} (${section.description})

ORIGINAL STRUCTURE (partial):
${sectionData?.outerHTML?.substring(0, 2000) || 'Not available'}

CONTAINER STYLES:
${JSON.stringify(sectionData?.containerStyles, null, 2)}

KEY ELEMENTS:
${JSON.stringify(sectionData?.children?.slice(0, 10), null, 2)}

REQUIREMENTS:
1. Create HTML with embedded <style> tag
2. ALL class names MUST be prefixed with "${section.id}-" to avoid conflicts
3. Match colors, typography, and spacing EXACTLY from the screenshot
4. Use CSS-only for decorative graphics (gradients, shapes, patterns)
5. Use flexbox/grid for layout
6. For images/icons, create colored placeholder rectangles
7. Include realistic placeholder text matching the original

OUTPUT FORMAT (exactly this structure):
<style>
.${section.id} {
  /* container styles */
}
.${section.id}-title {
  /* element styles */
}
/* more styles... */
</style>

<div class="${section.id}">
  <!-- HTML content -->
</div>

Output ONLY the HTML/CSS code. No explanations.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 }
        },
        { type: 'text', text: prompt }
      ]
    }]
  });

  const output = response.content[0].type === 'text' ? response.content[0].text : '';

  // Parse CSS and HTML from output
  const cssMatch = output.match(/<style>([\s\S]*?)<\/style>/);
  const css = cssMatch ? cssMatch[1].trim() : '';

  const html = output
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/```html?/g, '')
    .replace(/```/g, '')
    .trim();

  return {
    id: section.id,
    order: section.order,
    css,
    html
  };
}

// ============================================================================
// Hover State Capture
// ============================================================================

async function captureHoverStates(page, interactive) {
  const hoverRules = [];
  const seenSelectors = new Set();

  // Group by selector to avoid duplicates
  const uniqueElements = interactive.filter(el => {
    if (seenSelectors.has(el.selector)) return false;
    seenSelectors.add(el.selector);
    return true;
  }).slice(0, 30); // Limit to 30 unique elements

  for (const el of uniqueElements) {
    try {
      // Scroll element into view
      await page.evaluate((top) => window.scrollTo(0, Math.max(0, top - 200)), el.bounds.top);
      await page.waitForTimeout(100);

      // Hover over element
      await page.hover(el.selector, { timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(150);

      // Capture hover styles
      const hoverScript = `
        (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const computed = getComputedStyle(element);
          const styles = {};
          ['color', 'background-color', 'background', 'border-color', 'box-shadow', 'transform', 'opacity', 'text-decoration']
            .forEach(function(prop) { styles[prop] = computed.getPropertyValue(prop); });
          return styles;
        }
      `;
      const hoverStyles = await page.evaluate(eval(hoverScript), el.selector);

      if (!hoverStyles) continue;

      // Compare with default styles
      const diffs = [];
      for (const prop of HOVER_PROPERTIES) {
        if (el.defaultStyles[prop] !== hoverStyles[prop]) {
          diffs.push(`  ${prop}: ${hoverStyles[prop]};`);
        }
      }

      if (diffs.length > 0) {
        hoverRules.push(`/* ${el.text || el.tag} */\n${el.selector}:hover {\n${diffs.join('\n')}\n}`);
      }

      // Move mouse away
      await page.mouse.move(0, 0);
      await page.waitForTimeout(50);
    } catch (e) {
      // Skip elements that can't be hovered
    }
  }

  return `/* Hover States - Auto-captured */\n\n${hoverRules.join('\n\n')}`;
}

// ============================================================================
// Assembly
// ============================================================================

function assembleClone(sections, hoverCSS, manifest) {
  // Sort sections by order
  const sorted = [...sections].sort((a, b) => a.order - b.order);

  // Combine all CSS
  const allCSS = [
    // Reset
    `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }`,
    `html { scroll-behavior: smooth; }`,
    `body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5; }`,
    `img { max-width: 100%; height: auto; }`,
    `a { text-decoration: none; color: inherit; }`,
    `button { font: inherit; cursor: pointer; border: none; background: none; }`,
    '',
    // Section CSS
    ...sorted.map(s => `/* === ${s.id.toUpperCase()} === */\n${s.css}`),
    '',
    // Hover states
    hoverCSS
  ].join('\n\n');

  // Combine all HTML
  const allHTML = sorted
    .map(s => `  <!-- ${s.id} -->\n  ${s.html}`)
    .join('\n\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clone of ${manifest.title}</title>
  <style>
${allCSS}
  </style>
</head>
<body>
${allHTML}
</body>
</html>`;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node tools/clone-page.js <url>');
    process.exit(1);
  }

  // Setup
  const domain = new URL(url).hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = path.resolve(`./output/${domain}-${timestamp}`);
  await fs.mkdir(`${outputDir}/screenshots`, { recursive: true });

  console.log(`\n🚀 Visual Page Cloner`);
  console.log(`   URL: ${url}`);
  console.log(`   Output: ${outputDir}\n`);

  // Initialize
  const client = new Anthropic();
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: VIEWPORT });

  try {
    // Navigate
    console.log('📍 Loading page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Take full reference screenshot
    await page.screenshot({
      path: `${outputDir}/screenshots/original-full.png`,
      fullPage: true
    });

    // Phase 1: Analyze
    console.log('📊 Analyzing page structure...');
    const manifest = await analyzePage(page);
    await fs.writeFile(`${outputDir}/manifest.json`, JSON.stringify(manifest, null, 2));
    console.log(`   Found ${manifest.sections.length} sections, ${manifest.interactive.length} interactive elements\n`);

    // Phase 2: Clone sections
    console.log('🔨 Cloning sections...');
    const sectionClones = [];

    for (const section of manifest.sections) {
      console.log(`   [${section.order + 1}/${manifest.sections.length}] ${section.id}: ${section.description.substring(0, 40)}...`);

      // Scroll to section and screenshot
      await page.evaluate((top) => window.scrollTo(0, Math.max(0, top - 50)), section.bounds.top);
      await page.waitForTimeout(300);

      const screenshotPath = `${outputDir}/screenshots/${section.id}.png`;
      await page.screenshot({ path: screenshotPath });
      const screenshotBase64 = (await fs.readFile(screenshotPath)).toString('base64');

      // Extract section data
      const sectionData = await extractSectionData(page, section);

      // Clone via Claude
      const clone = await cloneSection(client, section, sectionData, screenshotBase64);
      sectionClones.push(clone);

      // Save individual section
      await fs.writeFile(
        `${outputDir}/${String(section.order).padStart(2, '0')}-${section.id}.html`,
        `<style>${clone.css}</style>\n${clone.html}`
      );
    }

    // Phase 3: Hover states
    console.log('\n🎯 Capturing hover states...');
    await page.evaluate(() => window.scrollTo(0, 0));
    const hoverCSS = await captureHoverStates(page, manifest.interactive);
    await fs.writeFile(`${outputDir}/hover-states.css`, hoverCSS);
    console.log(`   Captured ${(hoverCSS.match(/:hover/g) || []).length} hover rules`);

    // Phase 4: Assemble
    console.log('\n🔧 Assembling final clone...');
    const finalHTML = assembleClone(sectionClones, hoverCSS, manifest);
    const finalPath = `${outputDir}/clone.html`;
    await fs.writeFile(finalPath, finalHTML);

    // Phase 5: Validate
    console.log('✅ Validating...');
    await page.goto(`file://${finalPath}`);
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `${outputDir}/screenshots/clone-result.png`,
      fullPage: true
    });

    console.log(`\n✨ Done!`);
    console.log(`   Final clone: ${finalPath}`);
    console.log(`   Open with: open "${finalPath}"\n`);

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
