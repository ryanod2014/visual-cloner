#!/usr/bin/env node

/**
 * ELEMENT-LEVEL VISUAL CLONING SYSTEM
 *
 * Breaks sections into individual elements and clones each one
 * with its own refinement loop until pixel-perfect.
 *
 * Architecture:
 * 1. Section Screenshot → Element Identifier (AI lists all elements)
 * 2. For each element → dedicated cloning loop
 * 3. Assemble all pixel-perfect elements
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  outputDir: path.join(__dirname, 'elements'),
  screenshotDir: path.join(__dirname, 'element-screenshots'),
  viewportWidth: 1440,
  viewportHeight: 900,
};

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

// ============================================================================
// ELEMENT DEFINITIONS - What we need to clone for each section
// ============================================================================

const HERO_ELEMENTS = [
  {
    id: 'logo',
    name: 'Logo (icon + text)',
    description: 'Linear logo with checkmark icon and "Linear" text',
    cssTarget: 'header logo area',
    priority: 1
  },
  {
    id: 'nav-links',
    name: 'Navigation Links',
    description: 'Product, Resources, Pricing, Customers, Now, Contact links',
    cssTarget: 'horizontal nav link row',
    priority: 2
  },
  {
    id: 'nav-buttons',
    name: 'Nav Action Buttons',
    description: 'Log in text link and Sign up button',
    cssTarget: 'header right side buttons',
    priority: 3
  },
  {
    id: 'headline',
    name: 'Hero Headline',
    description: 'Large headline "Linear is a purpose-built tool..."',
    cssTarget: 'main h1 text',
    priority: 4
  },
  {
    id: 'subtitle',
    name: 'Hero Subtitle',
    description: 'Gray subtitle text below headline',
    cssTarget: 'paragraph below h1',
    priority: 5
  },
  {
    id: 'cta-primary',
    name: 'Primary CTA Button',
    description: '"Start building" white button',
    cssTarget: 'primary action button',
    priority: 6
  },
  {
    id: 'cta-secondary',
    name: 'Secondary CTA Link',
    description: '"New: Linear agent for Slack" with arrow',
    cssTarget: 'secondary text link with icon',
    priority: 7
  },
  {
    id: 'hero-image',
    name: 'Hero Image',
    description: 'Large product screenshot below CTAs',
    cssTarget: 'main product image',
    priority: 8
  }
];

// ============================================================================
// GENERATE ELEMENT HTML TEMPLATES
// ============================================================================

async function generateElementTemplates() {
  await ensureDir(CONFIG.outputDir);

  // Generate individual HTML files for each element to be refined
  const templates = {
    'logo': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0a0b;
      padding: 20px;
      display: flex;
      align-items: center;
      -webkit-font-smoothing: antialiased;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #fff;
      font-weight: 500;
      font-size: 15px;
    }
    .logo svg {
      width: 18px;
      height: 18px;
    }
  </style>
</head>
<body>
  <a href="#" class="logo">
    <svg viewBox="0 0 20 20" fill="currentColor">
      <rect width="20" height="20" rx="4" fill="currentColor"/>
      <path d="M5.5 10L8.5 13L14.5 7" stroke="#0a0a0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
    Linear
  </a>
</body>
</html>`,

    'nav-links': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0a0b;
      padding: 20px;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-decoration: none; }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 32px;
    }
    .nav-link {
      font-size: 14px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.7);
    }
  </style>
</head>
<body>
  <div class="nav-links">
    <a href="#" class="nav-link">Product</a>
    <a href="#" class="nav-link">Resources</a>
    <a href="#" class="nav-link">Pricing</a>
    <a href="#" class="nav-link">Customers</a>
    <a href="#" class="nav-link">Now</a>
    <a href="#" class="nav-link">Contact</a>
  </div>
</body>
</html>`,

    'nav-buttons': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0a0b;
      padding: 20px;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-decoration: none; }
    .nav-actions {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .btn-ghost {
      font-size: 14px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.7);
    }
    .btn-signup {
      display: inline-flex;
      align-items: center;
      font-size: 14px;
      font-weight: 500;
      padding: 7px 12px;
      background: #fff;
      color: #0a0a0b;
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <div class="nav-actions">
    <a href="#" class="btn-ghost">Log in</a>
    <a href="#" class="btn-signup">Sign up</a>
  </div>
</body>
</html>`,

    'headline': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0a0b;
      padding: 40px;
      -webkit-font-smoothing: antialiased;
    }
    h1 {
      font-size: 56px;
      font-weight: 500;
      line-height: 1.08;
      letter-spacing: -0.025em;
      color: #fff;
      max-width: 780px;
    }
  </style>
</head>
<body>
  <h1>Linear is a purpose-built tool for planning and building products</h1>
</body>
</html>`,

    'subtitle': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0a0b;
      padding: 40px;
      -webkit-font-smoothing: antialiased;
    }
    p {
      font-size: 17px;
      line-height: 1.55;
      color: rgba(255, 255, 255, 0.5);
      max-width: 480px;
    }
  </style>
</head>
<body>
  <p>Meet the system for modern software development. Streamline issues, projects, and product roadmaps.</p>
</body>
</html>`,

    'cta-primary': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0a0b;
      padding: 40px;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-decoration: none; }
    .btn-primary {
      display: inline-flex;
      align-items: center;
      font-size: 15px;
      font-weight: 500;
      padding: 12px 20px;
      background: #fff;
      color: #0a0a0b;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <a href="#" class="btn-primary">Start building</a>
</body>
</html>`,

    'cta-secondary': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0a0b;
      padding: 40px;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-decoration: none; }
    .btn-secondary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 15px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.65);
    }
    .btn-secondary svg {
      width: 16px;
      height: 16px;
    }
  </style>
</head>
<body>
  <a href="#" class="btn-secondary">
    New: Linear agent for Slack
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
  </a>
</body>
</html>`
  };

  // Write all templates
  for (const [id, html] of Object.entries(templates)) {
    const filepath = path.join(CONFIG.outputDir, `${id}.html`);
    await fs.writeFile(filepath, html);
    console.log(`Created: ${filepath}`);
  }

  console.log('\n✅ Element templates created!');
  console.log('\nWorkflow:');
  console.log('1. Run: node element-cloner.js render-all');
  console.log('2. Compare each rendered element to original section');
  console.log('3. Refine individual element files');
  console.log('4. Re-render and compare until pixel-perfect');
  console.log('5. Run: node element-cloner.js assemble');
}

// ============================================================================
// RENDER ALL ELEMENTS
// ============================================================================

async function renderAllElements() {
  await ensureDir(CONFIG.screenshotDir);

  const browser = await chromium.launch({ headless: true });

  const files = await fs.readdir(CONFIG.outputDir);
  const htmlFiles = files.filter(f => f.endsWith('.html'));

  for (const file of htmlFiles) {
    const elementId = path.basename(file, '.html');
    const page = await browser.newPage();
    await page.setViewportSize({ width: 800, height: 400 });

    const filepath = path.join(CONFIG.outputDir, file);
    await page.goto(`file://${filepath}`);
    await page.waitForTimeout(500);

    // Get actual content size
    const bbox = await page.evaluate(() => {
      const body = document.body;
      const rect = body.getBoundingClientRect();
      return {
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height)
      };
    });

    const screenshotPath = path.join(CONFIG.screenshotDir, `${elementId}.png`);
    await page.screenshot({
      path: screenshotPath,
      clip: { x: 0, y: 0, width: Math.min(bbox.width + 40, 800), height: Math.min(bbox.height + 40, 400) }
    });

    console.log(`Rendered: ${elementId} → ${screenshotPath}`);
    await page.close();
  }

  await browser.close();
  console.log('\n✅ All elements rendered!');
}

// ============================================================================
// ASSEMBLE ELEMENTS INTO SECTION
// ============================================================================

async function assembleSection() {
  console.log('Assembling elements into complete section...');

  // Read all element HTML files and extract their styles and content
  const elements = {};
  const files = await fs.readdir(CONFIG.outputDir);

  for (const file of files.filter(f => f.endsWith('.html'))) {
    const id = path.basename(file, '.html');
    const content = await fs.readFile(path.join(CONFIG.outputDir, file), 'utf-8');
    elements[id] = content;
  }

  // Extract styles from each element
  const extractStyles = (html) => {
    const match = html.match(/<style>([\s\S]*?)<\/style>/);
    return match ? match[1] : '';
  };

  const extractBody = (html) => {
    const match = html.match(/<body>([\s\S]*?)<\/body>/);
    return match ? match[1].trim() : '';
  };

  // Build assembled HTML
  const assembledHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Linear Clone - Assembled from Elements</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    /* === RESET === */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html {
      font-size: 16px;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0a0b;
      color: #fff;
      min-height: 100vh;
    }
    a { color: inherit; text-decoration: none; }

    /* === HEADER === */
    .header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
      height: 56px;
      background: rgba(10, 10, 11, 0.8);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 100%;
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* === ELEMENT STYLES === */
    ${extractStyles(elements['logo'] || '')}
    ${extractStyles(elements['nav-links'] || '')}
    ${extractStyles(elements['nav-buttons'] || '')}

    /* === HERO === */
    .hero {
      padding-top: 130px;
      padding-bottom: 40px;
    }
    .hero-content {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 24px;
    }
    ${extractStyles(elements['headline'] || '')}
    .hero h1 { margin-bottom: 24px; }

    ${extractStyles(elements['subtitle'] || '')}
    .hero p { margin-bottom: 32px; }

    .hero-actions {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    ${extractStyles(elements['cta-primary'] || '')}
    ${extractStyles(elements['cta-secondary'] || '')}

    .hero-image {
      max-width: 1400px;
      margin: 48px auto 0;
      padding: 0 24px;
    }
    .hero-image img {
      width: 100%;
      border-radius: 12px;
    }
  </style>
</head>
<body>
  <header class="header">
    <nav class="nav">
      ${extractBody(elements['logo'] || '')}
      ${extractBody(elements['nav-links'] || '')}
      ${extractBody(elements['nav-buttons'] || '')}
    </nav>
  </header>

  <main>
    <section class="hero">
      <div class="hero-content">
        ${extractBody(elements['headline'] || '')}
        ${extractBody(elements['subtitle'] || '')}
        <div class="hero-actions">
          ${extractBody(elements['cta-primary'] || '')}
          ${extractBody(elements['cta-secondary'] || '')}
        </div>
      </div>
      <div class="hero-image">
        <img src="https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/93514696-592a-4764-aa98-b6101349a100/f=auto,dpr=2,q=95,fit=scale-down,metadata=none" alt="Linear app">
      </div>
    </section>
  </main>
</body>
</html>`;

  const outputPath = path.join(CONFIG.outputDir, 'assembled-from-elements.html');
  await fs.writeFile(outputPath, assembledHtml);
  console.log(`\n✅ Assembled: ${outputPath}`);
}

// ============================================================================
// CLI
// ============================================================================

const [,, command] = process.argv;

switch (command) {
  case 'init':
    generateElementTemplates();
    break;
  case 'render-all':
    renderAllElements();
    break;
  case 'assemble':
    assembleSection();
    break;
  default:
    console.log(`
Element-Level Visual Cloning System

Commands:
  init          Create individual HTML templates for each element
  render-all    Render all element templates to screenshots
  assemble      Combine all elements into complete section

Workflow:
  1. node element-cloner.js init
  2. node element-cloner.js render-all
  3. Compare element screenshots to original
  4. Edit individual element files in ./elements/
  5. Repeat steps 2-4 until each element is pixel-perfect
  6. node element-cloner.js assemble

Element files to refine:
  elements/logo.html
  elements/nav-links.html
  elements/nav-buttons.html
  elements/headline.html
  elements/subtitle.html
  elements/cta-primary.html
  elements/cta-secondary.html
`);
}
