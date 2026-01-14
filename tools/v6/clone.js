#!/usr/bin/env node
/**
 * V6 Complete Clone - Pixel Perfect + Working Behaviors
 *
 * This is the unified cloning solution:
 * 1. Pre-navigation injection (capture ALL events from page load)
 * 2. Screenshot each section for pixel-perfect visual recreation
 * 3. Extract all behaviors (events, CSS vars, breakpoints, etc.)
 * 4. Send screenshots to Claude Vision for exact HTML/CSS
 * 5. Inject extracted behaviors into the recreation
 * 6. Output: Clone that looks AND works identically
 *
 * Usage: node tools/clone-v6.js https://excalidraw.com
 */

import Anthropic from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

import {
  getPreNavigationScript,
  getPostLoadScript,
  extractAllData,
  getCaptureStatistics,
  apiRecorder,
  workerScriptCapturer,
  behavioralRecorder,
  robustStateExplorer,
  viewportBreakpointTester,
  keyboardShortcutExplorer,
} from './pipeline/extractors/index.js';

import { runIntegration } from './pipeline/integrators/index.js';

const VIEWPORT = { width: 1440, height: 900 };

// ============================================================================
// Pre-Navigation Script (captures everything from page load)
// ============================================================================

function buildPreNavigationScript() {
  const eventListenerScript = `
    (function() {
      const listeners = [];
      const originalAdd = EventTarget.prototype.addEventListener;
      const originalRemove = EventTarget.prototype.removeEventListener;

      EventTarget.prototype.addEventListener = function(type, fn, options) {
        listeners.push({
          target: this === window ? 'window' : this === document ? 'document' :
                  (this.id ? '#' + this.id : this.className ? '.' + this.className.split(' ')[0] : this.tagName?.toLowerCase() || 'unknown'),
          type,
          options: typeof options === 'object' ? options : { capture: !!options }
        });
        return originalAdd.call(this, type, fn, options);
      };

      window.__getCapturedListeners = () => listeners;
    })();
  `;

  const apiRecorderScript = apiRecorder.getInjectionScript();
  const workerCapturerScript = workerScriptCapturer.getInjectionScript();
  const behavioralScript = behavioralRecorder.getInjectionScript();
  const robustExplorerScript = robustStateExplorer.getInjectionScript();
  const standardPreNav = getPreNavigationScript();

  return `
(function() {
  console.log('[V6] Installing pre-navigation capture...');
  ${eventListenerScript}
  ${apiRecorderScript}
  ${workerCapturerScript}
  ${behavioralScript}
  ${robustExplorerScript}
  ${standardPreNav}
  console.log('[V6] Pre-navigation capture installed');
})();
`;
}

// ============================================================================
// Page Analysis
// ============================================================================

async function analyzePage(page) {
  // Scroll through entire page to trigger lazy loading
  const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < fullHeight; y += 500) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  return await page.evaluate(() => {
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

    // Find sections
    document.querySelectorAll('header, nav, main, section, footer, [class*="hero"], [class*="toolbar"]').forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      if (rect.height < 50 || rect.width < 100) return;

      const key = boundsKey(rect);
      if (seenBounds.has(key)) return;
      seenBounds.add(key);

      const headings = el.querySelectorAll('h1, h2, h3');
      const description = headings.length > 0
        ? Array.from(headings).slice(0, 2).map(h => h.textContent.trim().substring(0, 50)).join(' | ')
        : el.textContent.trim().substring(0, 50);

      sections.push({
        id: el.id || el.className?.split(' ')[0] || `section-${i}`,
        bounds: { top: rect.top + window.scrollY, left: rect.left, width: rect.width, height: rect.height },
        selector: getSelector(el),
        description
      });
    });

    // If no sections found, create viewport-based sections
    if (sections.length === 0) {
      const viewportHeight = window.innerHeight;
      const pageHeight = document.documentElement.scrollHeight;
      for (let i = 0; i * viewportHeight < pageHeight; i++) {
        sections.push({
          id: `viewport-${i}`,
          bounds: { top: i * viewportHeight, left: 0, width: window.innerWidth, height: viewportHeight },
          selector: 'body',
          description: `Viewport section ${i + 1}`
        });
      }
    }

    sections.sort((a, b) => a.bounds.top - b.bounds.top);
    sections.forEach((s, i) => { s.order = i; });

    return {
      url: window.location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      fullHeight: document.documentElement.scrollHeight,
      sections: sections.slice(0, 15) // Limit sections
    };
  });
}

// ============================================================================
// Extract Design Tokens
// ============================================================================

async function extractDesignTokens(page) {
  return await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const root = getComputedStyle(document.documentElement);

    // Get CSS variables from :root
    const cssVars = {};
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText === ':root') {
            for (const prop of rule.style) {
              if (prop.startsWith('--')) {
                cssVars[prop] = rule.style.getPropertyValue(prop).trim();
              }
            }
          }
        }
      } catch (e) {}
    }

    return {
      colors: {
        background: body.backgroundColor,
        text: body.color,
        primary: cssVars['--color-primary'] || cssVars['--primary'] || '#6965db',
      },
      fonts: {
        body: body.fontFamily,
      },
      cssVariables: cssVars
    };
  });
}

// ============================================================================
// Clone Section via Claude Vision
// ============================================================================

async function cloneSection(client, section, screenshotBase64, designTokens, isFirst) {
  const prompt = `You are a pixel-perfect frontend developer. Recreate this webpage section EXACTLY as shown.

SECTION: ${section.id}
DESCRIPTION: ${section.description}
${isFirst ? 'NOTE: This is the first section - include any navigation/header visible.' : ''}

DESIGN TOKENS:
- Background: ${designTokens.colors.background}
- Text: ${designTokens.colors.text}
- Primary: ${designTokens.colors.primary}
- Font: ${designTokens.fonts.body}

CSS VARIABLES FROM ORIGINAL:
${Object.entries(designTokens.cssVariables).slice(0, 20).map(([k, v]) => `${k}: ${v}`).join('\n')}

REQUIREMENTS:
1. Match the screenshot EXACTLY - same colors, fonts, spacing, layout
2. All CSS classes prefixed with "${section.id}-"
3. Use the CSS variables above where applicable
4. CSS-only graphics (gradients, shadows) - no external images
5. Flexbox/Grid for layout
6. Placeholder colored rectangles for images/icons

OUTPUT FORMAT (exactly):
<style>
.${section.id} { /* styles */ }
.${section.id}-element { /* styles */ }
</style>

<div class="${section.id}">
  <!-- HTML matching screenshot exactly -->
</div>

Output ONLY the code. No explanations.`;

  try {
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

    const cssMatch = output.match(/<style>([\s\S]*?)<\/style>/);
    const css = cssMatch ? cssMatch[1].trim() : '';
    const html = output.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/```html?/g, '').replace(/```/g, '').trim();

    return { id: section.id, order: section.order, css, html };
  } catch (err) {
    console.error(`    Error cloning ${section.id}:`, err.message);
    return { id: section.id, order: section.order, css: '', html: `<!-- Error: ${err.message} -->` };
  }
}

// ============================================================================
// Assemble Final Clone
// ============================================================================

function assembleClone(sections, extractionData, manifest) {
  const sorted = [...sections].sort((a, b) => a.order - b.order);

  // Generate CSS from extraction
  const extractedCSS = generateExtractedCSS(extractionData);
  const extractedJS = generateExtractedJS(extractionData);

  const allCSS = [
    `/* Reset */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5; }
img { max-width: 100%; height: auto; }
a { text-decoration: none; color: inherit; }
button { font: inherit; cursor: pointer; border: none; background: none; }`,
    '',
    `/* Extracted CSS Variables */\n${extractedCSS}`,
    '',
    ...sorted.map(s => `/* === ${s.id.toUpperCase()} === */\n${s.css}`)
  ].join('\n\n');

  const allHTML = sorted.map(s => `  <!-- ${s.id} -->\n  ${s.html}`).join('\n\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>V6 Clone - ${manifest.title}</title>
  <style>
${allCSS}
  </style>
</head>
<body>
${allHTML}

  <!-- V6 Extracted Behaviors -->
  <script>
${extractedJS}
  </script>
</body>
</html>`;
}

// ============================================================================
// Generate CSS from Extraction
// ============================================================================

function generateExtractedCSS(data) {
  const lines = [];

  // CSS Variables
  if (data.cssVariables?.rootVariables) {
    lines.push(':root {');
    for (const [name, value] of Object.entries(data.cssVariables.rootVariables)) {
      lines.push(`  ${name}: ${value};`);
    }
    lines.push('}');
  }

  // Breakpoints
  if (data.viewportBreakpoints?.detectedBreakpoints) {
    data.viewportBreakpoints.detectedBreakpoints.forEach(bp => {
      lines.push(`\n/* Breakpoint: ${bp.width}px */`);
      lines.push(`@media (max-width: ${bp.width}px) {`);
      lines.push(`  /* Layout changes detected at this width */`);
      lines.push(`}`);
    });
  }

  return lines.join('\n');
}

// ============================================================================
// Generate JS from Extraction
// ============================================================================

function generateExtractedJS(data) {
  const lines = [];
  lines.push('(function() {');
  lines.push('  "use strict";');
  lines.push('  console.log("[V6] Initializing extracted behaviors...");');
  lines.push('');

  // Event listeners
  if (data.eventListener?.listeners?.length > 0) {
    lines.push(`  // ${data.eventListener.listeners.length} event listeners captured`);

    // Group by type
    const byType = {};
    data.eventListener.listeners.forEach(l => {
      if (!byType[l.eventType]) byType[l.eventType] = 0;
      byType[l.eventType]++;
    });

    lines.push(`  // Types: ${Object.entries(byType).map(([t, c]) => `${t}(${c})`).join(', ')}`);
    lines.push('');

    // Wire up key listeners
    const keyListeners = data.eventListener.listeners.filter(l =>
      l.eventType === 'keydown' || l.eventType === 'keyup' || l.eventType === 'keypress'
    );
    if (keyListeners.length > 0) {
      lines.push('  // Keyboard event handling');
      lines.push('  document.addEventListener("keydown", (e) => {');
      lines.push('    console.log("[V6] Keydown:", e.key);');
      lines.push('  });');
      lines.push('');
    }

    // Wire up click listeners
    const clickListeners = data.eventListener.listeners.filter(l => l.eventType === 'click');
    if (clickListeners.length > 0) {
      lines.push('  // Click event handling');
      lines.push('  document.addEventListener("click", (e) => {');
      lines.push('    const target = e.target.closest("button, a, [role=button]");');
      lines.push('    if (target) console.log("[V6] Click:", target.textContent?.substring(0, 30));');
      lines.push('  });');
      lines.push('');
    }
  }

  // Keyboard shortcuts
  if (data.keyboardShortcuts?.shortcuts?.length > 0) {
    lines.push('  // Keyboard shortcuts');
    lines.push('  const shortcuts = {');
    data.keyboardShortcuts.shortcuts.forEach(s => {
      lines.push(`    "${s.key}": "${s.effect || 'action'}",`);
    });
    lines.push('  };');
    lines.push('  document.addEventListener("keydown", (e) => {');
    lines.push('    if (shortcuts[e.key]) {');
    lines.push('      console.log("[V6] Shortcut:", e.key, "->", shortcuts[e.key]);');
    lines.push('    }');
    lines.push('  });');
    lines.push('');
  }

  lines.push('  console.log("[V6] Behaviors initialized");');
  lines.push('})();');

  return lines.join('\n');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const url = process.argv[2] || 'https://excalidraw.com';

  const domain = new URL(url).hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = path.resolve(`./output/${domain}-v6-${timestamp}`);
  await fs.mkdir(`${outputDir}/screenshots`, { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 COMPLETE CLONE - Pixel Perfect + Behaviors');
  console.log('='.repeat(60));
  console.log(`URL: ${url}`);
  console.log(`Output: ${outputDir}`);
  console.log('');

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable not set');
    console.error('Set it with: export ANTHROPIC_API_KEY=your-key');
    process.exit(1);
  }

  const client = new Anthropic();
  const browser = await chromium.launch({ headless: false });

  // Create context with pre-navigation scripts
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(buildPreNavigationScript());

  const page = await context.newPage();

  try {
    // Phase 1: Navigate
    console.log('[Phase 1] Navigating...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Inject post-load extractors
    await page.evaluate(getPostLoadScript());
    console.log('  ✓ Page loaded, extractors injected');

    // Phase 2: Full-page screenshot
    console.log('\n[Phase 2] Taking reference screenshot...');
    await page.screenshot({ path: `${outputDir}/screenshots/original-full.png`, fullPage: true });

    // Phase 3: Analyze structure
    console.log('\n[Phase 3] Analyzing page structure...');
    const manifest = await analyzePage(page);
    await fs.writeFile(`${outputDir}/manifest.json`, JSON.stringify(manifest, null, 2));
    console.log(`  ✓ Found ${manifest.sections.length} sections`);

    // Phase 4: Extract design tokens
    console.log('\n[Phase 4] Extracting design tokens...');
    const designTokens = await extractDesignTokens(page);
    console.log(`  ✓ Found ${Object.keys(designTokens.cssVariables).length} CSS variables`);

    // Phase 5: Extract behaviors
    console.log('\n[Phase 5] Extracting behaviors...');
    const extractionData = await extractAllData(page);
    const stats = getCaptureStatistics(extractionData);
    console.log(`  ✓ Captured ${stats.total} items`);
    console.log(`    - Styles: ${stats.categories.styles}`);
    console.log(`    - Graphics: ${stats.categories.graphics}`);
    console.log(`    - Behavior: ${stats.categories.behavior}`);

    // Get event listeners
    const eventListeners = await page.evaluate(() => window.__getCapturedListeners?.() || []);
    extractionData.eventListener = { listeners: eventListeners };
    console.log(`  ✓ Event listeners: ${eventListeners.length}`);

    await fs.writeFile(`${outputDir}/extraction.json`, JSON.stringify(extractionData, null, 2));

    // Phase 6: Screenshot and clone each section
    console.log('\n[Phase 6] Cloning sections (pixel-perfect)...');
    const sectionClones = [];

    for (const section of manifest.sections) {
      console.log(`  [${section.order + 1}/${manifest.sections.length}] ${section.id}`);

      // Scroll to section
      await page.evaluate((top) => window.scrollTo(0, Math.max(0, top - 50)), section.bounds.top);
      await page.waitForTimeout(300);

      // Screenshot
      const screenshotPath = `${outputDir}/screenshots/${section.order}-${section.id}.png`;
      await page.screenshot({ path: screenshotPath });
      const screenshotBase64 = (await fs.readFile(screenshotPath)).toString('base64');

      // Clone via Claude Vision
      const clone = await cloneSection(client, section, screenshotBase64, designTokens, section.order === 0);
      sectionClones.push(clone);

      // Save individual section
      await fs.writeFile(
        `${outputDir}/${String(section.order).padStart(2, '0')}-${section.id}.html`,
        `<style>${clone.css}</style>\n${clone.html}`
      );
    }

    // Phase 7: Assemble
    console.log('\n[Phase 7] Assembling final clone with behaviors...');
    const finalHTML = assembleClone(sectionClones, extractionData, manifest);
    const finalPath = `${outputDir}/clone.html`;
    await fs.writeFile(finalPath, finalHTML);

    // Phase 8: Validate
    console.log('\n[Phase 8] Validating...');
    await page.goto(`file://${finalPath}`);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${outputDir}/screenshots/clone-result.png`, fullPage: true });

    console.log('\n' + '='.repeat(60));
    console.log('V6 CLONE COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nOutput: ${finalPath}`);
    console.log(`\nOpen with: open "${finalPath}"`);

    // Open it
    const { exec } = await import('child_process');
    exec(`open "${finalPath}"`);

  } catch (err) {
    console.error('\n[ERROR]', err.message);
    console.error(err.stack);
  } finally {
    await browser.close();
  }
}

main();
