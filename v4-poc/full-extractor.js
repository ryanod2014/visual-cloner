/**
 * V4 Full Webapp Extractor - Complete Style & Code Extraction
 * Extracts everything needed for pixel-perfect recreation
 */

import { chromium } from 'playwright';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = 'output/v4-full-excalidraw';

// ============================================
// DEEP STYLE EXTRACTION
// ============================================

const STYLE_EXTRACTOR_SCRIPT = `
window.__V4_STYLE_EXTRACTOR__ = {

  // All CSS properties we care about for pixel-perfect recreation
  STYLE_PROPERTIES: [
    // Box Model
    'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
    'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'border', 'borderWidth', 'borderStyle', 'borderColor', 'borderRadius',
    'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',

    // Typography
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
    'letterSpacing', 'textAlign', 'textDecoration', 'textTransform',
    'whiteSpace', 'wordBreak', 'overflow', 'textOverflow',

    // Colors
    'color', 'backgroundColor', 'borderColor', 'outlineColor',
    'fill', 'stroke',

    // Layout
    'display', 'position', 'top', 'right', 'bottom', 'left',
    'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'alignContent',
    'gap', 'rowGap', 'columnGap', 'flex', 'flexGrow', 'flexShrink', 'flexBasis',
    'gridTemplateColumns', 'gridTemplateRows', 'gridGap',

    // Visual
    'opacity', 'visibility', 'zIndex', 'cursor', 'pointerEvents',
    'boxShadow', 'textShadow', 'filter', 'backdropFilter',
    'transform', 'transformOrigin',
    'transition', 'animation',

    // Background
    'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat',

    // SVG specific
    'strokeWidth', 'strokeLinecap', 'strokeLinejoin'
  ],

  extractElementStyles(el) {
    const computed = window.getComputedStyle(el);
    const styles = {};

    for (const prop of this.STYLE_PROPERTIES) {
      const value = computed.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase());
      if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== '0px') {
        styles[prop] = value;
      }
    }

    // Get bounding rect for absolute positioning
    const rect = el.getBoundingClientRect();
    styles.__rect = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    };

    return styles;
  },

  getElementSelector(el) {
    if (el.id) return '#' + el.id;

    const parts = [];
    let current = el;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\\s+/).filter(c => c && !c.includes(':'));
        if (classes.length) {
          selector += '.' + classes.slice(0, 2).join('.');
        }
      }

      // Add nth-child for uniqueness
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += ':nth-child(' + index + ')';
        }
      }

      parts.unshift(selector);
      current = current.parentElement;
    }

    return parts.join(' > ');
  },

  extractSVG(el) {
    if (el.tagName === 'SVG' || el.tagName === 'svg') {
      return el.outerHTML;
    }
    return null;
  },

  extractAllElements() {
    const elements = [];
    const seen = new Set();

    // Get all visible elements
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          const style = window.getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      const selector = this.getElementSelector(node);
      if (seen.has(selector)) continue;
      seen.add(selector);

      const el = {
        tag: node.tagName.toLowerCase(),
        selector: selector,
        styles: this.extractElementStyles(node),
        attributes: {},
        text: null,
        svg: null
      };

      // Extract important attributes
      for (const attr of ['role', 'aria-label', 'title', 'placeholder', 'type', 'href', 'src']) {
        const val = node.getAttribute(attr);
        if (val) el.attributes[attr] = val;
      }

      // Extract text content (only direct text)
      if (node.childNodes.length === 1 && node.childNodes[0].nodeType === Node.TEXT_NODE) {
        el.text = node.textContent.trim();
      }

      // Extract SVG
      if (node.tagName.toLowerCase() === 'svg') {
        el.svg = node.outerHTML;
      }

      // Extract background images
      const bgImage = el.styles.backgroundImage;
      if (bgImage && bgImage !== 'none') {
        el.backgroundImage = bgImage;
      }

      elements.push(el);
    }

    return elements;
  },

  extractCSSVariables() {
    const variables = {};
    const root = document.documentElement;
    const computed = window.getComputedStyle(root);

    // Get all CSS custom properties from stylesheets
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.style) {
            for (const prop of rule.style) {
              if (prop.startsWith('--')) {
                variables[prop] = computed.getPropertyValue(prop).trim();
              }
            }
          }
        }
      } catch (e) {
        // Cross-origin stylesheet
      }
    }

    return variables;
  },

  extractFonts() {
    const fonts = new Set();

    document.querySelectorAll('*').forEach(el => {
      const computed = window.getComputedStyle(el);
      const fontFamily = computed.fontFamily;
      if (fontFamily) {
        // Parse font family
        fontFamily.split(',').forEach(f => {
          const font = f.trim().replace(/["']/g, '');
          if (font && !['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy'].includes(font)) {
            fonts.add(font);
          }
        });
      }
    });

    return Array.from(fonts);
  },

  extractColors() {
    const colors = new Set();

    document.querySelectorAll('*').forEach(el => {
      const computed = window.getComputedStyle(el);
      ['color', 'backgroundColor', 'borderColor', 'fill', 'stroke'].forEach(prop => {
        const val = computed[prop];
        if (val && val !== 'transparent' && val !== 'rgba(0, 0, 0, 0)') {
          colors.add(val);
        }
      });
    });

    return Array.from(colors);
  },

  extractAll() {
    return {
      elements: this.extractAllElements(),
      cssVariables: this.extractCSSVariables(),
      fonts: this.extractFonts(),
      colors: this.extractColors(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  }
};
`;

// ============================================
// CODE GENERATOR
// ============================================

function generateReactComponent(stateData, stateName) {
  const elements = stateData.elements;

  // Group elements by their parent structure
  let jsx = '';
  let styles = '';

  // Generate unique class names
  const classMap = new Map();
  let classCounter = 0;

  for (const el of elements) {
    const className = `el-${classCounter++}`;
    classMap.set(el.selector, className);

    // Generate CSS
    const styleProps = Object.entries(el.styles)
      .filter(([k, v]) => !k.startsWith('__'))
      .map(([k, v]) => {
        const cssProp = k.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `  ${cssProp}: ${v};`;
      })
      .join('\n');

    if (styleProps) {
      styles += `.${className} {\n${styleProps}\n}\n\n`;
    }
  }

  // Generate simplified JSX structure
  jsx = `import React from 'react';
import './${stateName}.css';

export function ${stateName}() {
  return (
    <div className="state-${stateName}">
      {/* Generated from ${elements.length} extracted elements */}
      {/* See ${stateName}.css for styles */}

      {/* TODO: Reconstruct component hierarchy */}
      {/* Elements extracted: */}
${elements.slice(0, 20).map(el => `      {/* ${el.tag}: ${el.text || el.selector.slice(-50)} */}`).join('\n')}
    </div>
  );
}
`;

  return { jsx, styles };
}

function generateTailwindComponent(stateData, stateName) {
  const elements = stateData.elements;

  // Map CSS values to Tailwind classes
  function cssToTailwind(styles) {
    const classes = [];

    // Display
    if (styles.display === 'flex') classes.push('flex');
    if (styles.display === 'grid') classes.push('grid');
    if (styles.display === 'none') classes.push('hidden');

    // Flex direction
    if (styles.flexDirection === 'column') classes.push('flex-col');
    if (styles.flexDirection === 'row') classes.push('flex-row');

    // Justify/Align
    if (styles.justifyContent === 'center') classes.push('justify-center');
    if (styles.justifyContent === 'space-between') classes.push('justify-between');
    if (styles.alignItems === 'center') classes.push('items-center');

    // Gap
    if (styles.gap) {
      const gapPx = parseInt(styles.gap);
      if (gapPx) classes.push(`gap-${Math.round(gapPx/4)}`);
    }

    // Padding
    if (styles.padding) {
      const padPx = parseInt(styles.padding);
      if (padPx) classes.push(`p-${Math.round(padPx/4)}`);
    }

    // Border radius
    if (styles.borderRadius) {
      const rad = parseInt(styles.borderRadius);
      if (rad >= 9999) classes.push('rounded-full');
      else if (rad >= 12) classes.push('rounded-lg');
      else if (rad >= 6) classes.push('rounded-md');
      else if (rad > 0) classes.push('rounded');
    }

    // Background color (simplified)
    if (styles.backgroundColor && styles.backgroundColor !== 'transparent') {
      classes.push('bg-[' + styles.backgroundColor.replace(/\s/g, '') + ']');
    }

    // Text color
    if (styles.color) {
      classes.push('text-[' + styles.color.replace(/\s/g, '') + ']');
    }

    // Font size
    if (styles.fontSize) {
      const size = parseInt(styles.fontSize);
      if (size <= 12) classes.push('text-xs');
      else if (size <= 14) classes.push('text-sm');
      else if (size <= 16) classes.push('text-base');
      else if (size <= 18) classes.push('text-lg');
      else if (size <= 20) classes.push('text-xl');
      else classes.push('text-2xl');
    }

    // Font weight
    if (styles.fontWeight) {
      const weight = parseInt(styles.fontWeight);
      if (weight >= 700) classes.push('font-bold');
      else if (weight >= 600) classes.push('font-semibold');
      else if (weight >= 500) classes.push('font-medium');
    }

    return classes.join(' ');
  }

  // Build component tree (simplified)
  let jsx = `import React from 'react';

export function ${stateName}() {
  return (
    <div className="min-h-screen bg-white">
`;

  // Group elements by approximate position for layout
  const topBar = elements.filter(el => el.styles.__rect && el.styles.__rect.y < 60);
  const sidebar = elements.filter(el => el.styles.__rect && el.styles.__rect.x < 200 && el.styles.__rect.y >= 60);
  const main = elements.filter(el => el.styles.__rect && el.styles.__rect.x >= 200 && el.styles.__rect.y >= 60);

  jsx += `      {/* Top Bar - ${topBar.length} elements */}\n`;
  jsx += `      <header className="h-14 border-b flex items-center px-4">\n`;

  for (const el of topBar.slice(0, 10)) {
    const tw = cssToTailwind(el.styles);
    if (el.tag === 'button') {
      jsx += `        <button className="${tw}">${el.text || ''}</button>\n`;
    } else if (el.svg) {
      jsx += `        {/* SVG icon */}\n`;
    }
  }

  jsx += `      </header>\n\n`;

  jsx += `      <div className="flex">\n`;
  jsx += `        {/* Sidebar - ${sidebar.length} elements */}\n`;
  jsx += `        <aside className="w-48 border-r p-4">\n`;

  for (const el of sidebar.slice(0, 15)) {
    const tw = cssToTailwind(el.styles);
    if (el.text) {
      jsx += `          <div className="${tw}">${el.text}</div>\n`;
    }
  }

  jsx += `        </aside>\n\n`;

  jsx += `        {/* Main Content - ${main.length} elements */}\n`;
  jsx += `        <main className="flex-1 p-4">\n`;
  jsx += `          {/* Canvas/content area */}\n`;
  jsx += `        </main>\n`;
  jsx += `      </div>\n`;

  jsx += `    </div>
  );
}
`;

  return jsx;
}

// ============================================
// SVG EXTRACTION
// ============================================

async function extractSVGs(page) {
  return await page.evaluate(() => {
    const svgs = [];
    document.querySelectorAll('svg').forEach((svg, i) => {
      svgs.push({
        id: `svg-${i}`,
        html: svg.outerHTML,
        width: svg.getAttribute('width') || svg.getBoundingClientRect().width,
        height: svg.getAttribute('height') || svg.getBoundingClientRect().height
      });
    });
    return svgs;
  });
}

// ============================================
// MAIN EXTRACTION
// ============================================

async function main() {
  console.log('=== V4 Full Extractor - Pixel Perfect Recreation ===\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(`${OUTPUT_DIR}/components`, { recursive: true });
  fs.mkdirSync(`${OUTPUT_DIR}/assets`, { recursive: true });
  fs.mkdirSync(`${OUTPUT_DIR}/screenshots`, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Inject style extractor
  await page.addInitScript(STYLE_EXTRACTOR_SCRIPT);

  console.log('[V4] Navigating to Excalidraw...');
  await page.goto('https://excalidraw.com', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // =================================================================
  // STATE NORMALIZATION - Ensure elements are in unselected state
  // This prevents "selected" styles from being baked into base CSS
  // =================================================================
  console.log('[V4] Normalizing UI state (deselecting all elements)...');

  // 1. Press Escape to close any modals/dropdowns/welcome screens
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 2. Click on canvas center to deselect any selected elements
  await page.mouse.click(960, 540);
  await page.waitForTimeout(300);

  // 3. Press Escape again to ensure nothing is selected
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 4. Remove any lingering selection classes via JS
  await page.evaluate(() => {
    // Remove common selection classes from all elements
    const selectionClasses = ['selected', 'active', 'tool-selected', 'option-selected', 'is-selected', 'is-active', 'ToolIcon--selected'];
    document.querySelectorAll('*').forEach(el => {
      selectionClasses.forEach(cls => el.classList.remove(cls));
    });

    // Reset aria-selected attributes
    document.querySelectorAll('[aria-selected="true"]').forEach(el => {
      el.setAttribute('aria-selected', 'false');
    });

    // Uncheck any checked radio/checkbox inputs that indicate tool selection
    document.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked').forEach(el => {
      // Don't uncheck if it's a form input
      if (!el.closest('form')) {
        el.checked = false;
      }
    });
  });
  await page.waitForTimeout(500);

  console.log('[V4] UI state normalized - capturing unselected styles');

  // Re-inject script (in case page reloaded)
  await page.evaluate(STYLE_EXTRACTOR_SCRIPT);

  console.log('[V4] Extracting initial state...');

  // Extract everything
  const stateData = await page.evaluate(() => {
    return window.__V4_STYLE_EXTRACTOR__.extractAll();
  });

  console.log(`[V4] Extracted ${stateData.elements.length} elements`);
  console.log(`[V4] Found ${stateData.fonts.length} fonts: ${stateData.fonts.join(', ')}`);
  console.log(`[V4] Found ${stateData.colors.length} unique colors`);
  console.log(`[V4] Found ${Object.keys(stateData.cssVariables).length} CSS variables`);

  // Save raw extraction
  fs.writeFileSync(
    `${OUTPUT_DIR}/state-initial.json`,
    JSON.stringify(stateData, null, 2)
  );

  // Extract SVGs
  console.log('[V4] Extracting SVG icons...');
  const svgs = await extractSVGs(page);
  console.log(`[V4] Found ${svgs.length} SVG icons`);

  // Save SVGs individually
  for (const svg of svgs) {
    fs.writeFileSync(`${OUTPUT_DIR}/assets/${svg.id}.svg`, svg.html);
  }

  // Take screenshot
  await page.screenshot({
    path: `${OUTPUT_DIR}/screenshots/initial-state.png`,
    fullPage: false
  });

  // Generate React component
  console.log('[V4] Generating React component...');
  const { jsx, styles } = generateReactComponent(stateData, 'InitialState');
  fs.writeFileSync(`${OUTPUT_DIR}/components/InitialState.jsx`, jsx);
  fs.writeFileSync(`${OUTPUT_DIR}/components/InitialState.css`, styles);

  // Generate Tailwind component
  console.log('[V4] Generating Tailwind component...');
  const tailwindJsx = generateTailwindComponent(stateData, 'ExcalidrawClone');
  fs.writeFileSync(`${OUTPUT_DIR}/components/ExcalidrawClone.jsx`, tailwindJsx);

  // Generate design tokens
  console.log('[V4] Generating design tokens...');
  const tokens = {
    colors: stateData.colors,
    fonts: stateData.fonts,
    cssVariables: stateData.cssVariables
  };
  fs.writeFileSync(`${OUTPUT_DIR}/design-tokens.json`, JSON.stringify(tokens, null, 2));

  // Now let's explore more states
  console.log('\n[V4] Exploring additional states...\n');

  const states = [
    { name: 'stroke-picker', action: async () => {
      await page.click('[aria-label="Stroke"]');
      await page.waitForTimeout(500);
    }},
    { name: 'help-panel', action: async () => {
      await page.keyboard.press('Escape');
      await page.click('[aria-label="Help"]');
      await page.waitForTimeout(500);
    }},
    { name: 'collaboration-modal', action: async () => {
      await page.keyboard.press('Escape');
      await page.click('[title*="collaboration"]').catch(() => {});
      await page.waitForTimeout(500);
    }}
  ];

  for (const state of states) {
    try {
      console.log(`[V4] Capturing state: ${state.name}`);
      await state.action();

      // Re-inject and extract
      await page.evaluate(STYLE_EXTRACTOR_SCRIPT);
      const data = await page.evaluate(() => window.__V4_STYLE_EXTRACTOR__.extractAll());

      fs.writeFileSync(`${OUTPUT_DIR}/state-${state.name}.json`, JSON.stringify(data, null, 2));
      await page.screenshot({ path: `${OUTPUT_DIR}/screenshots/${state.name}.png` });

      console.log(`[V4] State ${state.name}: ${data.elements.length} elements`);
    } catch (e) {
      console.log(`[V4] Could not capture ${state.name}: ${e.message}`);
    }
  }

  // Generate index file
  const indexHtml = `<!DOCTYPE html>
<html>
<head>
  <title>V4 Excalidraw Extraction</title>
  <style>
    body { font-family: system-ui; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
    .card { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
    .card img { width: 100%; }
    .card h3 { margin: 0; padding: 10px; background: #f5f5f5; }
    .stats { padding: 10px; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <h1>V4 Full Extraction - Excalidraw</h1>

  <h2>Captured States</h2>
  <div class="grid">
    <div class="card">
      <img src="screenshots/initial-state.png" alt="Initial State">
      <h3>Initial State</h3>
      <div class="stats">${stateData.elements.length} elements, ${svgs.length} SVGs</div>
    </div>
  </div>

  <h2>Design Tokens</h2>
  <pre>${JSON.stringify(tokens, null, 2).slice(0, 2000)}...</pre>

  <h2>Generated Components</h2>
  <ul>
    <li><a href="components/InitialState.jsx">InitialState.jsx</a> (React)</li>
    <li><a href="components/InitialState.css">InitialState.css</a></li>
    <li><a href="components/ExcalidrawClone.jsx">ExcalidrawClone.jsx</a> (Tailwind)</li>
  </ul>

  <h2>Assets</h2>
  <ul>
    ${svgs.map(s => `<li><a href="assets/${s.id}.svg">${s.id}.svg</a></li>`).join('\n    ')}
  </ul>
</body>
</html>`;

  fs.writeFileSync(`${OUTPUT_DIR}/index.html`, indexHtml);

  console.log('\n=== EXTRACTION COMPLETE ===\n');
  console.log(`Output: ${OUTPUT_DIR}/`);
  console.log(`  - index.html (overview)`);
  console.log(`  - state-*.json (raw extraction data)`);
  console.log(`  - components/*.jsx (generated React)`);
  console.log(`  - components/*.css (generated styles)`);
  console.log(`  - assets/*.svg (extracted icons)`);
  console.log(`  - screenshots/*.png (visual reference)`);
  console.log(`  - design-tokens.json (colors, fonts, variables)`);

  console.log('\n[V4] Browser left open. Press Ctrl+C to exit.\n');
  await new Promise(() => {});
}

main().catch(console.error);
