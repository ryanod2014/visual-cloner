/**
 * V4 Pixel-Perfect Code Generator
 * Takes extracted state data and generates working React + CSS
 */

import fs from 'fs';
import path from 'path';

const INPUT_DIR = 'output/v4-full-excalidraw';
const OUTPUT_DIR = 'output/v4-clone-app';

// ============================================
// STYLE PROCESSOR
// ============================================

class StyleProcessor {
  constructor() {
    this.classMap = new Map(); // style hash -> class name
    this.classCounter = 0;
    this.cssRules = [];
  }

  // Generate hash for style object to deduplicate
  hashStyle(styles) {
    const relevant = {};
    for (const [k, v] of Object.entries(styles)) {
      if (!k.startsWith('__') && v) {
        relevant[k] = v;
      }
    }
    return JSON.stringify(relevant);
  }

  // Convert camelCase to kebab-case
  toKebab(str) {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  // Get or create class for style
  getClass(styles, tag) {
    const hash = this.hashStyle(styles);

    if (this.classMap.has(hash)) {
      return this.classMap.get(hash);
    }

    const className = `${tag}-${this.classCounter++}`;
    this.classMap.set(hash, className);

    // Generate CSS rule
    const cssProps = [];
    for (const [k, v] of Object.entries(styles)) {
      if (k.startsWith('__')) continue;
      if (!v || v === 'none' || v === 'normal' || v === 'auto') continue;
      // Skip defaults
      if (k === 'display' && v === 'block') continue;
      if (k === 'position' && v === 'static') continue;
      if (k === 'visibility' && v === 'visible') continue;
      if (k === 'opacity' && v === '1') continue;
      if (k === 'flexDirection' && v === 'row') continue;
      if (k === 'flexWrap' && v === 'nowrap') continue;

      cssProps.push(`  ${this.toKebab(k)}: ${v};`);
    }

    if (cssProps.length > 0) {
      this.cssRules.push(`.${className} {\n${cssProps.join('\n')}\n}`);
    }

    return className;
  }

  getCSS() {
    return this.cssRules.join('\n\n');
  }
}

// ============================================
// ELEMENT TREE BUILDER
// ============================================

function buildElementTree(elements) {
  // Sort by position (top to bottom, left to right)
  const sorted = [...elements].sort((a, b) => {
    const rectA = a.styles.__rect || { y: 0, x: 0 };
    const rectB = b.styles.__rect || { y: 0, x: 0 };
    if (Math.abs(rectA.y - rectB.y) < 10) {
      return rectA.x - rectB.x;
    }
    return rectA.y - rectB.y;
  });

  // Group into regions by Y position
  const regions = {
    topBar: [],
    sidebar: [],
    main: [],
    footer: []
  };

  for (const el of sorted) {
    const rect = el.styles.__rect || { x: 0, y: 0, width: 0, height: 0 };

    // Skip invisible elements
    if (rect.width === 0 || rect.height === 0) continue;
    if (el.styles.visibility === 'hidden') continue;
    if (el.styles.display === 'none') continue;

    if (rect.y < 60) {
      regions.topBar.push(el);
    } else if (rect.x < 200 && rect.y < 800) {
      regions.sidebar.push(el);
    } else if (rect.y > 900) {
      regions.footer.push(el);
    } else {
      regions.main.push(el);
    }
  }

  return regions;
}

// ============================================
// JSX GENERATOR
// ============================================

function escapeJsx(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/{/g, '&#123;')
    .replace(/}/g, '&#125;')
    .replace(/"/g, '&quot;');
}

function generateElementJsx(el, styleProcessor, svgMap) {
  const tag = el.tag;
  const className = styleProcessor.getClass(el.styles, tag);
  const text = el.text ? escapeJsx(el.text) : '';

  // Handle SVG separately
  if (el.svg) {
    const svgId = `svg-${Math.random().toString(36).slice(2, 8)}`;
    return `<span className="${className}" dangerouslySetInnerHTML={{ __html: \`${el.svg.replace(/`/g, '\\`')}\` }} />`;
  }

  // Map HTML tags to React
  const tagMap = {
    'div': 'div',
    'span': 'span',
    'button': 'button',
    'a': 'a',
    'input': 'input',
    'label': 'label',
    'h1': 'h1',
    'h2': 'h2',
    'h3': 'h3',
    'p': 'p',
    'header': 'header',
    'footer': 'footer',
    'main': 'main',
    'aside': 'aside',
    'nav': 'nav',
    'section': 'section',
    'canvas': 'canvas',
    'img': 'img',
    'svg': 'svg'
  };

  const reactTag = tagMap[tag] || 'div';

  // Build attributes
  let attrs = `className="${className}"`;

  if (el.attributes.href) {
    attrs += ` href="${el.attributes.href}"`;
  }
  if (el.attributes.type) {
    attrs += ` type="${el.attributes.type}"`;
  }
  if (el.attributes['aria-label']) {
    attrs += ` aria-label="${el.attributes['aria-label']}"`;
  }
  if (el.attributes.title) {
    attrs += ` title="${el.attributes.title}"`;
  }
  if (el.attributes.role) {
    attrs += ` role="${el.attributes.role}"`;
  }

  // Self-closing tags
  if (['input', 'img', 'canvas'].includes(reactTag)) {
    return `<${reactTag} ${attrs} />`;
  }

  return `<${reactTag} ${attrs}>${text}</${reactTag}>`;
}

function generateRegionJsx(name, elements, styleProcessor) {
  if (elements.length === 0) return '';

  const jsx = elements
    .slice(0, 50) // Limit for readability
    .map(el => `        ${generateElementJsx(el, styleProcessor)}`)
    .join('\n');

  return `      {/* ${name} - ${elements.length} elements */}\n      <div className="region-${name.toLowerCase()}">\n${jsx}\n      </div>`;
}

// ============================================
// FULL APP GENERATOR
// ============================================

function generateApp(stateData, svgs) {
  const styleProcessor = new StyleProcessor();
  const regions = buildElementTree(stateData.elements);

  // Create SVG map
  const svgMap = new Map();
  svgs.forEach((svg, i) => svgMap.set(`svg-${i}`, svg.html));

  // Generate JSX for each region
  const topBarJsx = generateRegionJsx('TopBar', regions.topBar, styleProcessor);
  const sidebarJsx = generateRegionJsx('Sidebar', regions.sidebar, styleProcessor);
  const mainJsx = generateRegionJsx('Main', regions.main, styleProcessor);
  const footerJsx = generateRegionJsx('Footer', regions.footer, styleProcessor);

  // App component
  const appJsx = `import React from 'react';
import './App.css';

/**
 * Pixel-Perfect Clone Generated by V4 Extractor
 * Source: Excalidraw (https://excalidraw.com)
 * Elements: ${stateData.elements.length}
 * Viewport: ${stateData.viewport.width}x${stateData.viewport.height}
 */

export default function App() {
  return (
    <div className="app-root">
${topBarJsx}

${sidebarJsx}

${mainJsx}

${footerJsx}
    </div>
  );
}
`;

  // Generate base CSS
  const baseCSS = `/* V4 Generated Styles */
/* Source: Excalidraw */
/* Total classes: ${styleProcessor.classMap.size} */

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  width: 100%;
  height: 100%;
}

.app-root {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  font-family: ${stateData.fonts[1] || 'system-ui'}, sans-serif;
  background: #fff;
}

.region-topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
}

.region-sidebar {
  position: fixed;
  left: 0;
  top: 60px;
  bottom: 0;
  width: 200px;
  overflow-y: auto;
  z-index: 50;
}

.region-main {
  position: fixed;
  left: 200px;
  top: 60px;
  right: 0;
  bottom: 60px;
}

.region-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
}

/* Generated Element Styles */
${styleProcessor.getCSS()}
`;

  return { appJsx, css: baseCSS };
}

// ============================================
// DESIGN TOKENS TO CSS VARIABLES
// ============================================

function generateCSSVariables(tokens) {
  const lines = [':root {'];

  // Colors
  tokens.colors.forEach((color, i) => {
    lines.push(`  --color-${i}: ${color};`);
  });

  // CSS Variables from source
  for (const [name, value] of Object.entries(tokens.cssVariables)) {
    if (value) {
      lines.push(`  ${name}: ${value};`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

// ============================================
// INDEX.HTML GENERATOR
// ============================================

function generateIndexHtml() {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Excalidraw Clone - V4 Generated</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;
}

function generateMainJsx() {
  return `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
}

function generatePackageJson() {
  return JSON.stringify({
    name: "excalidraw-clone-v4",
    version: "1.0.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      preview: "vite preview"
    },
    dependencies: {
      react: "^18.2.0",
      "react-dom": "^18.2.0"
    },
    devDependencies: {
      "@types/react": "^18.2.0",
      "@types/react-dom": "^18.2.0",
      "@vitejs/plugin-react": "^4.0.0",
      vite: "^5.0.0"
    }
  }, null, 2);
}

function generateViteConfig() {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()]
});
`;
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('=== V4 Pixel-Perfect Code Generator ===\n');

  // Load extracted data
  const stateFile = `${INPUT_DIR}/state-initial.json`;
  if (!fs.existsSync(stateFile)) {
    console.error('Error: Run full-extractor.js first to generate state data');
    process.exit(1);
  }

  console.log('[V4] Loading extracted state data...');
  const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  console.log(`[V4] Loaded ${stateData.elements.length} elements`);

  // Load tokens
  const tokensFile = `${INPUT_DIR}/design-tokens.json`;
  const tokens = JSON.parse(fs.readFileSync(tokensFile, 'utf-8'));

  // Load SVGs
  const svgDir = `${INPUT_DIR}/assets`;
  const svgs = [];
  if (fs.existsSync(svgDir)) {
    for (const file of fs.readdirSync(svgDir)) {
      if (file.endsWith('.svg')) {
        svgs.push({
          id: file.replace('.svg', ''),
          html: fs.readFileSync(`${svgDir}/${file}`, 'utf-8')
        });
      }
    }
  }
  console.log(`[V4] Loaded ${svgs.length} SVG icons`);

  // Create output directory
  fs.mkdirSync(`${OUTPUT_DIR}/src`, { recursive: true });
  fs.mkdirSync(`${OUTPUT_DIR}/public`, { recursive: true });

  // Generate app
  console.log('[V4] Generating React app...');
  const { appJsx, css } = generateApp(stateData, svgs);

  // Generate CSS variables
  const cssVars = generateCSSVariables(tokens);

  // Write files
  fs.writeFileSync(`${OUTPUT_DIR}/src/App.jsx`, appJsx);
  fs.writeFileSync(`${OUTPUT_DIR}/src/App.css`, css);
  fs.writeFileSync(`${OUTPUT_DIR}/src/variables.css`, cssVars);
  fs.writeFileSync(`${OUTPUT_DIR}/src/main.jsx`, generateMainJsx());
  fs.writeFileSync(`${OUTPUT_DIR}/index.html`, generateIndexHtml());
  fs.writeFileSync(`${OUTPUT_DIR}/package.json`, generatePackageJson());
  fs.writeFileSync(`${OUTPUT_DIR}/vite.config.js`, generateViteConfig());

  // Copy SVGs to public
  for (const svg of svgs) {
    fs.writeFileSync(`${OUTPUT_DIR}/public/${svg.id}.svg`, svg.html);
  }

  console.log('\n=== GENERATION COMPLETE ===\n');
  console.log(`Output: ${OUTPUT_DIR}/`);
  console.log('\nTo run the clone:');
  console.log(`  cd ${OUTPUT_DIR}`);
  console.log('  npm install');
  console.log('  npm run dev');
  console.log('\nFiles generated:');
  console.log('  - src/App.jsx (main component)');
  console.log('  - src/App.css (element styles)');
  console.log('  - src/variables.css (design tokens)');
  console.log('  - package.json (dependencies)');
  console.log('  - vite.config.js (build config)');
}

main().catch(console.error);
