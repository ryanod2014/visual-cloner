/**
 * V4 Hybrid Generator - TRUE Pixel-Perfect + Interactive
 *
 * This generator ACTUALLY uses the extracted data instead of hardcoding.
 * Every element positioned at exact __rect coordinates.
 * Actual SVGs from extraction, not Unicode approximations.
 * Click handlers based on semantic classification.
 */

import fs from 'fs';

const INPUT_DIR = 'output/v4-full-excalidraw';
const OUTPUT_DIR = 'output/v4-clone-app';

// Semantic classification based on aria-labels, title, and position
function classifyElement(element) {
  const ariaLabel = element.attributes?.['aria-label'] || '';
  const title = element.attributes?.title || '';
  const selector = element.selector || '';
  const rect = element.styles?.__rect || {};

  // Combined label for checking (check both aria-label and title)
  const label = ariaLabel || title;

  // Tool buttons in toolbar
  if (label.includes('Hand') || label.includes('panning')) {
    return { role: 'tool-button', tool: 'hand', stateKey: 'selectedTool' };
  }
  if (label.includes('Selection')) {
    return { role: 'tool-button', tool: 'selection', stateKey: 'selectedTool' };
  }
  if (label.includes('Rectangle')) {
    return { role: 'tool-button', tool: 'rectangle', stateKey: 'selectedTool' };
  }
  if (label.includes('Diamond')) {
    return { role: 'tool-button', tool: 'diamond', stateKey: 'selectedTool' };
  }
  if (label.includes('Ellipse')) {
    return { role: 'tool-button', tool: 'ellipse', stateKey: 'selectedTool' };
  }
  if (label.includes('Arrow')) {
    return { role: 'tool-button', tool: 'arrow', stateKey: 'selectedTool' };
  }
  if (label.includes('Line') && !label.includes('collaboration')) {
    return { role: 'tool-button', tool: 'line', stateKey: 'selectedTool' };
  }
  if (label.includes('Draw') || label.includes('Freedraw')) {
    return { role: 'tool-button', tool: 'draw', stateKey: 'selectedTool' };
  }
  if (label.includes('Text')) {
    return { role: 'tool-button', tool: 'text', stateKey: 'selectedTool' };
  }
  if (label.includes('image') || label.includes('Image')) {
    return { role: 'tool-button', tool: 'image', stateKey: 'selectedTool' };
  }
  if (label.includes('Eraser')) {
    return { role: 'tool-button', tool: 'eraser', stateKey: 'selectedTool' };
  }

  // Color pickers
  if (label === 'Stroke' || label.includes('stroke color')) {
    return { role: 'color-picker-trigger', picker: 'stroke', stateKey: 'showStrokeColors' };
  }
  if (label === 'Background' || label.includes('background color')) {
    return { role: 'color-picker-trigger', picker: 'background', stateKey: 'showBackgroundColors' };
  }

  // Zoom controls
  if (label.includes('Zoom out')) {
    return { role: 'zoom-control', action: 'out' };
  }
  if (label.includes('Zoom in')) {
    return { role: 'zoom-control', action: 'in' };
  }
  if (label.includes('Reset zoom')) {
    return { role: 'zoom-control', action: 'reset' };
  }

  // Undo/Redo
  if (label.includes('Undo')) {
    return { role: 'history-control', action: 'undo' };
  }
  if (label.includes('Redo')) {
    return { role: 'history-control', action: 'redo' };
  }

  // Help
  if (label.includes('Help')) {
    return { role: 'modal-trigger', modal: 'help' };
  }

  // Library
  if (label.includes('Library')) {
    return { role: 'modal-trigger', modal: 'library' };
  }

  // Canvas
  if (element.tag === 'canvas') {
    return { role: 'canvas' };
  }

  // Menu button
  if (selector.includes('menu') || label.includes('Menu')) {
    return { role: 'menu-trigger' };
  }

  // Default: visual-only element
  return { role: 'visual' };
}

// Convert camelCase to kebab-case
function toKebab(str) {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

// Build exact CSS from extracted styles
function buildExactCSS(styles, className, zOrder, hasContent) {
  const rect = styles.__rect || {};

  let css = `.${className} {\n`;
  css += `  position: absolute;\n`;
  css += `  left: ${Math.round(rect.x || 0)}px;\n`;
  css += `  top: ${Math.round(rect.y || 0)}px;\n`;
  css += `  width: ${Math.round(rect.width || 0)}px;\n`;
  css += `  height: ${Math.round(rect.height || 0)}px;\n`;
  css += `  z-index: ${zOrder};\n`;

  // Non-interactive containers should not intercept clicks
  if (!hasContent) {
    css += `  pointer-events: none;\n`;
  }

  // Visual styles to include
  const visualProps = [
    'backgroundColor', 'color', 'opacity',
    'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
    'borderBottomLeftRadius', 'borderBottomRightRadius',
    'border', 'borderColor', 'borderWidth', 'borderStyle',
    'boxShadow', 'backdropFilter',
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
    'textAlign', 'textDecoration', 'textTransform',
    'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'display', 'flexDirection', 'alignItems', 'justifyContent', 'gap',
    'cursor', 'pointerEvents', 'overflow', 'zIndex'
  ];

  for (const prop of visualProps) {
    const val = styles[prop];
    if (val &&
        val !== 'rgba(0, 0, 0, 0)' &&
        val !== 'none' &&
        val !== 'normal' &&
        val !== 'auto' &&
        val !== 'visible' &&
        val !== 'static' &&
        val !== 'row' &&
        val !== '0 1 auto' &&
        val !== 'start') {
      css += `  ${toKebab(prop)}: ${val};\n`;
    }
  }

  css += `}\n`;
  return css;
}

// Clean SVG for React
function cleanSVG(svg) {
  if (!svg) return null;
  return svg
    .replace(/class=/g, 'className=')
    .replace(/stroke-width=/g, 'strokeWidth=')
    .replace(/stroke-linecap=/g, 'strokeLinecap=')
    .replace(/stroke-linejoin=/g, 'strokeLinejoin=')
    .replace(/fill-rule=/g, 'fillRule=')
    .replace(/clip-rule=/g, 'clipRule=')
    .replace(/clip-path=/g, 'clipPath=')
    .replace(/aria-hidden=/g, 'ariaHidden=')
    .replace(/focusable=/g, 'focusable=')
    .replace(/tabindex=/g, 'tabIndex=')
    .replace(/xmlns:xlink=/g, 'xmlnsXlink=');
}

// Escape text for JSX
function escapeJSX(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/{/g, '&#123;')
    .replace(/}/g, '&#125;')
    .replace(/"/g, '&quot;');
}

// Generate click handler code based on semantic role
function generateHandler(semantic) {
  if (!semantic || semantic.role === 'visual') return '';

  switch (semantic.role) {
    case 'tool-button':
      return ` onClick={() => setSelectedTool('${semantic.tool}')}`;
    case 'color-picker-trigger':
      if (semantic.picker === 'stroke') {
        return ` onClick={(e) => { e.stopPropagation(); setShowStrokeColors(!showStrokeColors); }}`;
      }
      if (semantic.picker === 'background') {
        return ` onClick={(e) => { e.stopPropagation(); setShowBackgroundColors(!showBackgroundColors); }}`;
      }
      break;
    case 'zoom-control':
      if (semantic.action === 'in') return ` onClick={() => setZoom(z => Math.min(500, z + 10))}`;
      if (semantic.action === 'out') return ` onClick={() => setZoom(z => Math.max(10, z - 10))}`;
      if (semantic.action === 'reset') return ` onClick={() => setZoom(100)}`;
      break;
    case 'history-control':
      return ` onClick={() => console.log('${semantic.action}')} disabled`;
    case 'modal-trigger':
      if (semantic.modal === 'help') return ` onClick={() => setShowHelp(true)}`;
      if (semantic.modal === 'library') return ` onClick={() => setShowLibrary(true)}`;
      break;
  }
  return '';
}

function generateHybridApp(stateData) {
  const elements = stateData.elements;

  // Filter to visible elements with real dimensions
  let visibleElements = elements.filter(el => {
    const rect = el.styles?.__rect;
    if (!rect) return false;
    if (rect.width < 1 && rect.height < 1) return false;
    if (el.styles?.visibility === 'hidden') return false;
    if (el.styles?.display === 'none') return false;
    // Skip very large container elements
    if (rect.width > 1900 && rect.height > 900) return false;
    // Skip elements that are just wrappers with no visual content
    if (el.styles?.backgroundColor === 'rgba(0, 0, 0, 0)' &&
        !el.svg && !el.text &&
        el.styles?.border === '0px none rgb(0, 0, 0)' &&
        !el.styles?.boxShadow) {
      // But keep if it has aria-label (interactive)
      if (!el.attributes?.['aria-label'] && !el.attributes?.title) {
        return false;
      }
    }
    return true;
  });

  // De-duplicate elements at the same position (keep the one with content)
  const positionMap = new Map();
  for (const el of visibleElements) {
    const rect = el.styles?.__rect;
    const key = `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}`;

    const existing = positionMap.get(key);
    if (!existing) {
      positionMap.set(key, el);
    } else {
      // Prefer element with content (SVG > text > aria-label > visual)
      const existingScore = (existing.svg ? 4 : 0) + (existing.text ? 3 : 0) +
                           (existing.attributes?.['aria-label'] ? 2 : 0) +
                           (existing.styles?.backgroundColor !== 'rgba(0, 0, 0, 0)' ? 1 : 0);
      const newScore = (el.svg ? 4 : 0) + (el.text ? 3 : 0) +
                      (el.attributes?.['aria-label'] ? 2 : 0) +
                      (el.styles?.backgroundColor !== 'rgba(0, 0, 0, 0)' ? 1 : 0);
      if (newScore > existingScore) {
        positionMap.set(key, el);
      }
    }
  }

  visibleElements = Array.from(positionMap.values());

  console.log(`[Hybrid] Processing ${visibleElements.length} visible elements (after de-duplication)`);

  // Classify all elements
  const classified = visibleElements.map((el, idx) => ({
    ...el,
    id: `el-${idx}`,
    semantic: classifyElement(el)
  }));

  // Sort by z-index and area (larger behind), interactive elements on top
  const sorted = [...classified].sort((a, b) => {
    // First by z-index
    const zA = parseInt(a.styles?.zIndex) || 0;
    const zB = parseInt(b.styles?.zIndex) || 0;
    if (zA !== zB) return zA - zB;

    // Then by interactivity (interactive elements on top)
    const interA = a.semantic?.role !== 'visual' ? 1 : 0;
    const interB = b.semantic?.role !== 'visual' ? 1 : 0;
    if (interA !== interB) return interA - interB;

    // Then by content (elements with content on top)
    const contentA = (a.svg ? 3 : 0) + (a.text ? 2 : 0) + (a.attributes?.['aria-label'] ? 1 : 0);
    const contentB = (b.svg ? 3 : 0) + (b.text ? 2 : 0) + (b.attributes?.['aria-label'] ? 1 : 0);
    if (contentA !== contentB) return contentA - contentB;

    // Finally by area (larger elements behind)
    const areaA = (a.styles?.__rect?.width || 0) * (a.styles?.__rect?.height || 0);
    const areaB = (b.styles?.__rect?.width || 0) * (b.styles?.__rect?.height || 0);
    return areaB - areaA;
  });

  // Assign z-index based on sort order
  sorted.forEach((el, idx) => {
    el.zOrder = idx + 1;
  });

  // Generate CSS
  let css = `/* V4 Hybrid Clone - TRUE Pixel-Perfect from Extracted Data */
/* Generated: ${new Date().toISOString()} */
/* Elements: ${sorted.length} */

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  width: 100%;
  height: 100%;
  font-family: Assistant, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.app-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #fff;
}

.pixel-perfect-container {
  position: relative;
  width: 1920px;
  height: 1080px;
  overflow: hidden;
}

/* State indicator */
.state-indicator {
  position: fixed;
  bottom: 10px;
  right: 10px;
  background: rgba(0,0,0,0.8);
  color: #fff;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  z-index: 9999;
  pointer-events: none;
}

/* Modal overlay */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #fff;
  padding: 24px;
  border-radius: 12px;
  max-width: 400px;
  text-align: center;
}

.modal-content h2 {
  margin-bottom: 16px;
}

.modal-content p {
  color: #666;
  margin-bottom: 16px;
}

/* Interactive element hover states */
button:hover, [role="button"]:hover, a:hover {
  filter: brightness(0.95);
}

/* Tool selected state - purple background */
.tool-selected {
  background-color: rgb(224, 223, 255) !important;
}

/* SVG containers should not intercept clicks */
div[class^="el-"] svg,
div[class^="el-"] svg * {
  pointer-events: none;
}

/* Elements containing only SVGs should pass clicks through */
div[class^="el-"]:has(> svg:only-child) {
  pointer-events: none;
}

`;

  // Generate CSS for each element
  for (const el of sorted) {
    const hasContent = el.svg || el.text || el.attributes?.['aria-label'] ||
                       el.semantic?.role !== 'visual';
    css += buildExactCSS(el.styles, el.id, el.zOrder, hasContent);
  }

  // Generate JSX
  let elementJSX = '';

  for (const el of sorted) {
    const handler = generateHandler(el.semantic);
    const ariaLabel = el.attributes?.['aria-label'] || '';
    const title = el.attributes?.title || '';

    // Build attributes string - use dynamic className for tool buttons
    let attrs;
    if (el.semantic?.role === 'tool-button') {
      // Tool buttons get conditional class for selected state
      attrs = `className={\`${el.id} \${selectedTool === '${el.semantic.tool}' ? 'tool-selected' : ''}\`}`;
    } else {
      attrs = `className="${el.id}"`;
    }
    if (ariaLabel) attrs += ` aria-label="${escapeJSX(ariaLabel)}"`;
    if (title) attrs += ` title="${escapeJSX(title)}"`;
    if (handler) attrs += handler;

    // Determine element type and content
    if (el.svg) {
      // SVG element - use dangerouslySetInnerHTML
      const safeSvg = el.svg.replace(/`/g, '\\`').replace(/\$/g, '\\$');
      elementJSX += `      <div ${attrs} dangerouslySetInnerHTML={{ __html: \`${safeSvg}\` }} />\n`;
    } else if (el.text && el.text.trim()) {
      // Text element
      const tag = el.tag === 'button' ? 'button' :
                  el.tag === 'a' ? 'a' :
                  el.tag === 'h1' ? 'h1' :
                  el.tag === 'h2' ? 'h2' :
                  el.tag === 'h3' ? 'h3' :
                  el.tag === 'label' ? 'label' :
                  el.tag === 'span' ? 'span' : 'div';

      if (tag === 'a') {
        const href = el.attributes?.href || '#';
        elementJSX += `      <a ${attrs} href="${href}">${escapeJSX(el.text)}</a>\n`;
      } else {
        elementJSX += `      <${tag} ${attrs}>${escapeJSX(el.text)}</${tag}>\n`;
      }
    } else {
      // Empty visual element
      if (el.tag === 'canvas') {
        elementJSX += `      <canvas ${attrs} />\n`;
      } else if (el.tag === 'input') {
        const type = el.attributes?.type || 'text';
        elementJSX += `      <input ${attrs} type="${type}" />\n`;
      } else if (el.tag === 'button' || el.semantic?.role?.includes('button') || el.semantic?.role?.includes('trigger')) {
        elementJSX += `      <button ${attrs} />\n`;
      } else {
        elementJSX += `      <div ${attrs} />\n`;
      }
    }
  }

  // Count interactive elements
  const interactiveCount = sorted.filter(el => el.semantic?.role !== 'visual').length;
  const svgCount = sorted.filter(el => el.svg).length;

  // Full App JSX
  const appJSX = `import React, { useState, useEffect } from 'react';
import './Hybrid.css';

/**
 * V4 Hybrid Clone - TRUE Pixel-Perfect + Interactive
 *
 * Generated from extracted data:
 * - ${sorted.length} elements with exact positioning
 * - ${svgCount} actual SVG icons
 * - ${interactiveCount} interactive elements
 * - Viewport: ${stateData.viewport?.width || 1920}x${stateData.viewport?.height || 1080}
 */

export default function App() {
  // UI State
  const [selectedTool, setSelectedTool] = useState('rectangle');
  const [zoom, setZoom] = useState(100);
  const [showStrokeColors, setShowStrokeColors] = useState(false);
  const [showBackgroundColors, setShowBackgroundColors] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  // Close modals on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowStrokeColors(false);
        setShowBackgroundColors(false);
        setShowHelp(false);
        setShowLibrary(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close color pickers on outside click
  const handleContainerClick = () => {
    setShowStrokeColors(false);
    setShowBackgroundColors(false);
  };

  return (
    <div className="app-container" onClick={handleContainerClick}>
      <div className="pixel-perfect-container">
        {/* All ${sorted.length} elements from extraction */}
${elementJSX}
      </div>

      {/* State indicator */}
      <div className="state-indicator">
        Tool: {selectedTool} | Zoom: {zoom}%
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Help</h2>
            <p>Keyboard shortcuts and documentation</p>
            <p style={{fontSize: '12px', color: '#888'}}>Press Escape to close</p>
          </div>
        </div>
      )}

      {/* Library Modal */}
      {showLibrary && (
        <div className="modal-overlay" onClick={() => setShowLibrary(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Library</h2>
            <p>Your saved shapes and components</p>
            <p style={{fontSize: '12px', color: '#888'}}>Press Escape to close</p>
          </div>
        </div>
      )}
    </div>
  );
}
`;

  return { appJSX, css };
}

async function main() {
  console.log('=== V4 Hybrid Generator ===');
  console.log('TRUE pixel-perfect using ACTUAL extracted data\n');

  const stateFile = `${INPUT_DIR}/state-initial.json`;
  if (!fs.existsSync(stateFile)) {
    console.error('Error: Run full-extractor.js first');
    process.exit(1);
  }

  const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  console.log(`Loaded ${stateData.elements.length} total elements`);

  const { appJSX, css } = generateHybridApp(stateData);

  // Ensure output directory exists
  if (!fs.existsSync(`${OUTPUT_DIR}/src`)) {
    fs.mkdirSync(`${OUTPUT_DIR}/src`, { recursive: true });
  }

  // Write files
  fs.writeFileSync(`${OUTPUT_DIR}/src/App.jsx`, appJSX);
  fs.writeFileSync(`${OUTPUT_DIR}/src/Hybrid.css`, css);

  // Update main.jsx
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

  console.log('\n=== HYBRID GENERATION COMPLETE ===');
  console.log(`Output: ${OUTPUT_DIR}/`);
  console.log('Key differences from previous generators:');
  console.log('  - Uses ACTUAL __rect coordinates (not guessed)');
  console.log('  - Uses ACTUAL extracted SVGs (not Unicode symbols)');
  console.log('  - Uses ACTUAL extracted styles (not hardcoded)');
  console.log('  - Click handlers based on semantic classification');
  console.log('\nRun: cd output/v4-clone-app && npm run dev');
}

main().catch(console.error);
