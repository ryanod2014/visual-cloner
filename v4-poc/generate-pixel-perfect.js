/**
 * V4 TRUE Pixel-Perfect Generator
 * Uses absolute positioning from captured __rect coordinates
 * Every element placed EXACTLY where it was on the original
 */

import fs from 'fs';

const INPUT_DIR = 'output/v4-full-excalidraw';
const OUTPUT_DIR = 'output/v4-clone-app';

function generatePixelPerfectApp(stateData) {
  const elements = stateData.elements;

  // Filter to visible elements with actual dimensions
  const visibleElements = elements.filter(el => {
    const rect = el.styles.__rect;
    if (!rect) return false;
    if (rect.width < 1 || rect.height < 1) return false;
    if (el.styles.visibility === 'hidden') return false;
    if (el.styles.display === 'none') return false;
    // Skip very large container elements (likely wrappers)
    if (rect.width > 1900 && rect.height > 1000) return false;
    return true;
  });

  console.log(`[V4] ${visibleElements.length} visible elements with dimensions`);

  // Generate CSS with absolute positioning
  let css = `/* V4 Pixel-Perfect Clone - Absolute Positioning */
/* Every element positioned exactly as on original */

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.pixel-perfect-container {
  position: relative;
  width: 1920px;
  height: 1080px;
  background: #fff;
  overflow: hidden;
}

`;

  let jsx = `import React from 'react';
import './PixelPerfect.css';

/**
 * TRUE Pixel-Perfect Clone
 * ${visibleElements.length} elements with exact positioning
 * Viewport: ${stateData.viewport.width}x${stateData.viewport.height}
 */

export default function App() {
  return (
    <div className="pixel-perfect-container">
`;

  // Sort by z-index and area (larger elements behind)
  const sorted = [...visibleElements].sort((a, b) => {
    const zA = parseInt(a.styles.zIndex) || 0;
    const zB = parseInt(b.styles.zIndex) || 0;
    if (zA !== zB) return zA - zB;
    // Larger elements first (behind)
    const areaA = (a.styles.__rect.width || 0) * (a.styles.__rect.height || 0);
    const areaB = (b.styles.__rect.width || 0) * (b.styles.__rect.height || 0);
    return areaB - areaA;
  });

  let classCounter = 0;

  for (const el of sorted) {
    const rect = el.styles.__rect;
    const className = `el-${classCounter++}`;

    // Build CSS for this element
    let elCss = `.${className} {\n`;
    elCss += `  position: absolute;\n`;
    elCss += `  left: ${Math.round(rect.x)}px;\n`;
    elCss += `  top: ${Math.round(rect.y)}px;\n`;
    elCss += `  width: ${Math.round(rect.width)}px;\n`;
    elCss += `  height: ${Math.round(rect.height)}px;\n`;

    // Add visual styles
    const stylesToInclude = [
      'backgroundColor', 'color', 'borderRadius',
      'border', 'borderColor', 'borderWidth', 'borderStyle',
      'boxShadow', 'opacity',
      'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
      'textAlign', 'display', 'alignItems', 'justifyContent',
      'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'fill', 'stroke', 'strokeWidth',
      'cursor', 'overflow'
    ];

    for (const prop of stylesToInclude) {
      const val = el.styles[prop];
      if (val && val !== 'rgba(0, 0, 0, 0)' && val !== 'none' && val !== 'normal' && val !== 'auto') {
        // Convert camelCase to kebab-case
        const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
        elCss += `  ${cssProp}: ${val};\n`;
      }
    }

    // For flex containers, add flex properties
    if (el.styles.display === 'flex') {
      if (el.styles.flexDirection) elCss += `  flex-direction: ${el.styles.flexDirection};\n`;
      if (el.styles.gap) elCss += `  gap: ${el.styles.gap};\n`;
    }

    elCss += `}\n\n`;
    css += elCss;

    // Build JSX
    const tag = el.tag;
    let content = '';

    // Handle SVG
    if (el.svg) {
      // Clean up SVG for React
      const cleanSvg = el.svg
        .replace(/class=/g, 'className=')
        .replace(/stroke-width=/g, 'strokeWidth=')
        .replace(/stroke-linecap=/g, 'strokeLinecap=')
        .replace(/stroke-linejoin=/g, 'strokeLinejoin=')
        .replace(/fill-rule=/g, 'fillRule=')
        .replace(/clip-rule=/g, 'clipRule=')
        .replace(/aria-hidden=/g, 'ariaHidden=')
        .replace(/focusable=/g, 'focusable=');

      jsx += `      <div className="${className}" dangerouslySetInnerHTML={{ __html: \`${el.svg.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\` }} />\n`;
    } else if (el.text) {
      // Text content
      const escapedText = el.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/{/g, '&#123;')
        .replace(/}/g, '&#125;');

      if (tag === 'button') {
        jsx += `      <button className="${className}">${escapedText}</button>\n`;
      } else if (tag === 'h1') {
        jsx += `      <h1 className="${className}">${escapedText}</h1>\n`;
      } else if (tag === 'h2') {
        jsx += `      <h2 className="${className}">${escapedText}</h2>\n`;
      } else if (tag === 'h3') {
        jsx += `      <h3 className="${className}">${escapedText}</h3>\n`;
      } else if (tag === 'a') {
        const href = el.attributes.href || '#';
        jsx += `      <a className="${className}" href="${href}">${escapedText}</a>\n`;
      } else {
        jsx += `      <div className="${className}">${escapedText}</div>\n`;
      }
    } else {
      // Empty element (visual only)
      if (tag === 'button') {
        const title = el.attributes.title || el.attributes['aria-label'] || '';
        jsx += `      <button className="${className}" title="${title}" />\n`;
      } else if (tag === 'input') {
        const type = el.attributes.type || 'text';
        jsx += `      <input className="${className}" type="${type}" />\n`;
      } else if (tag === 'canvas') {
        jsx += `      <canvas className="${className}" />\n`;
      } else {
        jsx += `      <div className="${className}" />\n`;
      }
    }
  }

  jsx += `    </div>
  );
}
`;

  return { jsx, css };
}

async function main() {
  console.log('=== V4 TRUE Pixel-Perfect Generator ===\n');

  const stateFile = `${INPUT_DIR}/state-initial.json`;
  if (!fs.existsSync(stateFile)) {
    console.error('Error: Run full-extractor.js first');
    process.exit(1);
  }

  const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  console.log(`[V4] Loaded ${stateData.elements.length} elements`);

  const { jsx, css } = generatePixelPerfectApp(stateData);

  // Write files
  fs.writeFileSync(`${OUTPUT_DIR}/src/App.jsx`, jsx);
  fs.writeFileSync(`${OUTPUT_DIR}/src/PixelPerfect.css`, css);

  // Update main.jsx to import correct CSS
  const mainJsx = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
  fs.writeFileSync(`${OUTPUT_DIR}/src/main.jsx`, mainJsx);

  console.log('\n=== PIXEL-PERFECT GENERATION COMPLETE ===');
  console.log(`\nOutput: ${OUTPUT_DIR}/`);
  console.log('Run: cd output/v4-clone-app && npm run dev');
}

main().catch(console.error);
