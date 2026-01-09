#!/usr/bin/env node
/**
 * Behavior-to-Code Generator
 *
 * Takes a behavior model and generates functional React code that
 * implements the detected features, state management, and interactions.
 */

import fs from 'fs';
import path from 'path';

// ===== CODE TEMPLATES =====

const APP_TEMPLATE = `
import React, { useState, useEffect, useRef, useCallback } from 'react';

{{IMPORTS}}

function App() {
  // ===== STATE =====
{{STATE_DECLARATIONS}}

  // ===== REFS =====
{{REF_DECLARATIONS}}

  // ===== EFFECTS =====
{{EFFECTS}}

  // ===== EVENT HANDLERS =====
{{EVENT_HANDLERS}}

  // ===== KEYBOARD SHORTCUTS =====
{{KEYBOARD_HANDLER}}

  // ===== RENDER =====
  return (
    <div className="app-container" tabIndex={0} onKeyDown={handleKeyDown}>
{{JSX_CONTENT}}
    </div>
  );
}

export default App;
`;

const CANVAS_COMPONENT_TEMPLATE = `
// Canvas component with drawing support
function CanvasLayer({ width = 1920, height = 1080, onDraw }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('selection');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(zoom, zoom);
    ctx.translate(pan.x, pan.y);

    // Clear and redraw
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-pan.x, -pan.y, width / zoom, height / zoom);

    if (onDraw) onDraw(ctx);
  }, [zoom, pan, width, height, onDraw]);

  const handleWheel = useCallback((e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => Math.max(0.1, Math.min(5, z * delta)));
    } else {
      setPan(p => ({
        x: p.x - e.deltaX,
        y: p.y - e.deltaY
      }));
    }
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (tool !== 'selection') {
      setIsDrawing(true);
    }
  }, [tool]);

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: tool === 'selection' ? 'default' : 'crosshair' }}
    />
  );
}
`;

const MODAL_COMPONENT_TEMPLATE = `
// Modal component
function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}
`;

const TOOLBAR_COMPONENT_TEMPLATE = `
// Toolbar component
function Toolbar({ tools, activeTool, onToolSelect }) {
  return (
    <div className="toolbar">
      {tools.map(tool => (
        <button
          key={tool.id}
          className={\`tool-button \${activeTool === tool.id ? 'active' : ''}\`}
          onClick={() => onToolSelect(tool.id)}
          title={tool.label}
        >
          {tool.icon || tool.label}
        </button>
      ))}
    </div>
  );
}
`;

// ===== GENERATOR FUNCTIONS =====

function generateStateDeclarations(model) {
  const lines = [];
  const addedStates = new Set();

  // From state machine
  if (model.stateMachine?.states?.length > 0) {
    lines.push(`  const [currentState, setCurrentState] = useState('${model.stateMachine.initialState || 'state-0'}');`);
    addedStates.add('currentState');
  }

  // From features
  for (const feature of model.features) {
    if (feature.type === 'state-management' && feature.name) {
      const stateName = camelCase(feature.name.replace('State: ', ''));
      if (!addedStates.has(stateName)) {
        const defaultValue = feature.valueType === 'object' ? '{}' :
                            feature.valueType === 'array' ? '[]' :
                            feature.valueType === 'boolean' ? 'false' : "''";
        lines.push(`  const [${stateName}, set${capitalize(stateName)}] = useState(${defaultValue});`);
        addedStates.add(stateName);
      }
    }

    // Modal states from UI actions
    if (feature.type === 'ui-action' && feature.name.includes('Click:')) {
      const actionName = feature.name.replace('Click: ', '');
      if (actionName.toLowerCase().includes('help') ||
          actionName.toLowerCase().includes('settings') ||
          actionName.toLowerCase().includes('share') ||
          actionName.toLowerCase().includes('collaboration')) {
        const modalName = `show${capitalize(camelCase(actionName))}Modal`;
        if (!addedStates.has(modalName)) {
          lines.push(`  const [${modalName}, set${capitalize(modalName)}] = useState(false);`);
          addedStates.add(modalName);
        }
      }
    }
  }

  // Canvas-related states
  const hasCanvas = model.features.some(f => f.type.startsWith('canvas-'));
  if (hasCanvas) {
    if (!addedStates.has('zoom')) {
      lines.push(`  const [zoom, setZoom] = useState(1);`);
      addedStates.add('zoom');
    }
    if (!addedStates.has('activeTool')) {
      lines.push(`  const [activeTool, setActiveTool] = useState('selection');`);
      addedStates.add('activeTool');
    }
    if (!addedStates.has('elements')) {
      lines.push(`  const [elements, setElements] = useState([]);`);
      addedStates.add('elements');
    }
    if (!addedStates.has('history')) {
      lines.push(`  const [history, setHistory] = useState({ past: [], future: [] });`);
      addedStates.add('history');
    }
  }

  // Theme state
  const hasTheme = model.features.some(f => f.name?.includes('Theme'));
  if (hasTheme && !addedStates.has('theme')) {
    lines.push(`  const [theme, setTheme] = useState('light');`);
    addedStates.add('theme');
  }

  return lines.join('\n');
}

function generateRefDeclarations(model) {
  const lines = [];

  const hasCanvas = model.features.some(f => f.type.startsWith('canvas-'));
  if (hasCanvas) {
    lines.push(`  const canvasRef = useRef(null);`);
  }

  lines.push(`  const containerRef = useRef(null);`);

  return lines.join('\n');
}

function generateEffects(model) {
  const effects = [];

  // Load from localStorage
  const persistedStates = model.features.filter(f => f.type === 'data-persistence');
  if (persistedStates.length > 0) {
    const loadLines = [];
    const saveLines = [];

    for (const feature of persistedStates) {
      if (feature.storageKey) {
        const stateName = camelCase(feature.name);
        loadLines.push(`      const saved${capitalize(stateName)} = localStorage.getItem('${feature.storageKey}');`);
        loadLines.push(`      if (saved${capitalize(stateName)}) {`);
        loadLines.push(`        try { set${capitalize(stateName)}(JSON.parse(saved${capitalize(stateName)})); } catch(e) { set${capitalize(stateName)}(saved${capitalize(stateName)}); }`);
        loadLines.push(`      }`);
      }
    }

    effects.push(`
  // Load persisted state
  useEffect(() => {
    try {
${loadLines.join('\n')}
    } catch (e) {
      console.warn('Failed to load persisted state:', e);
    }
  }, []);`);
  }

  // Theme effect
  const hasTheme = model.features.some(f => f.name?.includes('Theme'));
  if (hasTheme) {
    effects.push(`
  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);`);
  }

  // Canvas redraw effect
  const hasCanvas = model.features.some(f => f.type.startsWith('canvas-'));
  if (hasCanvas) {
    effects.push(`
  // Canvas redraw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(zoom, zoom);

    // Clear
    ctx.fillStyle = theme === 'dark' ? '#1e1e1e' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width / zoom, canvas.height / zoom);

    // Draw elements
    for (const el of elements) {
      drawElement(ctx, el);
    }
  }, [elements, zoom, theme]);`);
  }

  return effects.join('\n');
}

function generateEventHandlers(model) {
  const handlers = [];
  const addedHandlers = new Set();

  // From trigger-effect mappings
  for (const te of model.triggerEffects) {
    if (te.trigger.type === 'click' && te.trigger.target) {
      const label = te.trigger.target.ariaLabel || te.trigger.target.textContent || '';
      if (!label) continue;

      const handlerName = `handle${capitalize(camelCase(label))}Click`;
      if (addedHandlers.has(handlerName)) continue;
      addedHandlers.add(handlerName);

      const effects = generateEffectCode(te.commonEffects, label);

      handlers.push(`
  const ${handlerName} = useCallback(() => {
    console.log('${label} clicked');
${effects}
  }, []);`);
    }
  }

  // Zoom handlers
  const hasCanvas = model.features.some(f => f.type.startsWith('canvas-'));
  if (hasCanvas) {
    if (!addedHandlers.has('handleZoomIn')) {
      handlers.push(`
  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(5, z * 1.1));
  }, []);`);
      addedHandlers.add('handleZoomIn');
    }

    if (!addedHandlers.has('handleZoomOut')) {
      handlers.push(`
  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(0.1, z * 0.9));
  }, []);`);
      addedHandlers.add('handleZoomOut');
    }

    if (!addedHandlers.has('handleResetZoom')) {
      handlers.push(`
  const handleResetZoom = useCallback(() => {
    setZoom(1);
  }, []);`);
      addedHandlers.add('handleResetZoom');
    }

    // Undo/Redo
    handlers.push(`
  const handleUndo = useCallback(() => {
    setHistory(h => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1];
      const newPast = h.past.slice(0, -1);
      setElements(previous);
      return { past: newPast, future: [elements, ...h.future] };
    });
  }, [elements]);

  const handleRedo = useCallback(() => {
    setHistory(h => {
      if (h.future.length === 0) return h;
      const next = h.future[0];
      const newFuture = h.future.slice(1);
      setElements(next);
      return { past: [...h.past, elements], future: newFuture };
    });
  }, [elements]);`);
  }

  // Modal toggle handlers
  const modalFeatures = model.features.filter(f =>
    f.type === 'ui-action' &&
    (f.name.toLowerCase().includes('help') ||
     f.name.toLowerCase().includes('settings') ||
     f.name.toLowerCase().includes('share') ||
     f.name.toLowerCase().includes('collaboration'))
  );

  for (const feature of modalFeatures) {
    const actionName = feature.name.replace('Click: ', '');
    const modalName = camelCase(actionName);
    const handlerName = `handleToggle${capitalize(modalName)}Modal`;

    if (!addedHandlers.has(handlerName)) {
      handlers.push(`
  const ${handlerName} = useCallback(() => {
    setShow${capitalize(modalName)}Modal(prev => !prev);
  }, []);`);
      addedHandlers.add(handlerName);
    }
  }

  return handlers.join('\n');
}

function generateEffectCode(effects, label) {
  const lines = [];

  for (const effect of effects) {
    if (effect.type === 'storage-change') {
      lines.push(`    // Storage: ${effect.key}`);
      lines.push(`    localStorage.setItem('${effect.key}', JSON.stringify(/* value */));`);
    } else if (effect.type === 'dom-change') {
      lines.push(`    // DOM update triggered`);
    } else if (effect.type === 'canvas-update') {
      lines.push(`    // Canvas redraw triggered`);
    }
  }

  // Infer behavior from label
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes('zoom in')) {
    lines.push(`    handleZoomIn();`);
  } else if (lowerLabel.includes('zoom out')) {
    lines.push(`    handleZoomOut();`);
  } else if (lowerLabel.includes('reset zoom')) {
    lines.push(`    handleResetZoom();`);
  } else if (lowerLabel.includes('undo')) {
    lines.push(`    handleUndo();`);
  } else if (lowerLabel.includes('redo')) {
    lines.push(`    handleRedo();`);
  } else if (lowerLabel.includes('help')) {
    lines.push(`    setShowHelpModal(true);`);
  } else if (lowerLabel.includes('share')) {
    lines.push(`    setShowShareModal(true);`);
  } else if (lowerLabel.includes('collaboration')) {
    lines.push(`    setShowLiveCollaborationModal(true);`);
  }

  return lines.length > 0 ? lines.join('\n') : '    // TODO: Implement effect';
}

function generateKeyboardHandler(model) {
  const shortcuts = model.features.filter(f => f.type === 'keyboard-shortcut');

  if (shortcuts.length === 0) {
    return `
  const handleKeyDown = useCallback((e) => {
    // No keyboard shortcuts detected
  }, []);`;
  }

  const cases = [];

  for (const shortcut of shortcuts) {
    const key = shortcut.trigger?.key || shortcut.name.replace('Shortcut: ', '');
    const mods = shortcut.trigger?.modifiers || {};

    let condition = `e.key === '${key}'`;
    if (mods.ctrl) condition = `e.ctrlKey && ${condition}`;
    if (mods.alt) condition = `e.altKey && ${condition}`;
    if (mods.shift) condition = `e.shiftKey && ${condition}`;
    if (mods.meta) condition = `e.metaKey && ${condition}`;

    const action = inferKeyboardAction(key, mods);

    cases.push(`    if (${condition}) {
      e.preventDefault();
      ${action}
    }`);
  }

  return `
  const handleKeyDown = useCallback((e) => {
${cases.join('\n')}
  }, [handleUndo, handleRedo]);`;
}

function inferKeyboardAction(key, mods) {
  const keyLower = key.toLowerCase();

  // Tool shortcuts (common in drawing apps)
  if (keyLower === 'v' || keyLower === '1') return "setActiveTool('selection');";
  if (keyLower === 'r') return "setActiveTool('rectangle');";
  if (keyLower === 'e' || keyLower === '2') return "setActiveTool('ellipse');";
  if (keyLower === 'l' || keyLower === '3') return "setActiveTool('line');";
  if (keyLower === 'p') return "setActiveTool('pen');";
  if (keyLower === 't') return "setActiveTool('text');";
  if (keyLower === 'h') return "setActiveTool('hand');";

  // Undo/Redo
  if (keyLower === 'z' && mods?.ctrl) return 'handleUndo();';
  if (keyLower === 'y' && mods?.ctrl) return 'handleRedo();';

  // Escape
  if (keyLower === 'escape') return "setActiveTool('selection'); // Close any modals";

  // Delete
  if (keyLower === 'delete' || keyLower === 'backspace') {
    return "setElements(els => els.filter(el => !el.selected));";
  }

  return `console.log('Shortcut: ${key}');`;
}

function generateJSXContent(model) {
  const lines = [];

  // Check for canvas
  const hasCanvas = model.features.some(f => f.type.startsWith('canvas-'));

  if (hasCanvas) {
    lines.push(`      {/* Toolbar */}`);
    lines.push(`      <Toolbar`);
    lines.push(`        tools={[`);
    lines.push(`          { id: 'selection', label: 'Select', icon: '\\u2B9A' },`);
    lines.push(`          { id: 'rectangle', label: 'Rectangle', icon: '\\u25A1' },`);
    lines.push(`          { id: 'ellipse', label: 'Ellipse', icon: '\\u25CB' },`);
    lines.push(`          { id: 'line', label: 'Line', icon: '/' },`);
    lines.push(`          { id: 'pen', label: 'Pen', icon: '\\u270E' },`);
    lines.push(`          { id: 'text', label: 'Text', icon: 'T' },`);
    lines.push(`        ]}`);
    lines.push(`        activeTool={activeTool}`);
    lines.push(`        onToolSelect={setActiveTool}`);
    lines.push(`      />`);
    lines.push(``);
    lines.push(`      {/* Canvas */}`);
    lines.push(`      <canvas`);
    lines.push(`        ref={canvasRef}`);
    lines.push(`        width={1920}`);
    lines.push(`        height={1080}`);
    lines.push(`        className="main-canvas"`);
    lines.push(`      />`);
    lines.push(``);
    lines.push(`      {/* Zoom Controls */}`);
    lines.push(`      <div className="zoom-controls">`);
    lines.push(`        <button onClick={handleZoomOut}>-</button>`);
    lines.push(`        <span>{Math.round(zoom * 100)}%</span>`);
    lines.push(`        <button onClick={handleZoomIn}>+</button>`);
    lines.push(`        <button onClick={handleResetZoom}>Reset</button>`);
    lines.push(`      </div>`);
  }

  // Modals
  const modalFeatures = model.features.filter(f =>
    f.type === 'ui-action' &&
    (f.name.toLowerCase().includes('help') ||
     f.name.toLowerCase().includes('share') ||
     f.name.toLowerCase().includes('collaboration'))
  );

  for (const feature of modalFeatures) {
    const actionName = feature.name.replace('Click: ', '');
    const modalName = camelCase(actionName);
    const title = actionName.replace(/([A-Z])/g, ' $1').trim();

    lines.push(``);
    lines.push(`      {/* ${title} Modal */}`);
    lines.push(`      <Modal`);
    lines.push(`        isOpen={show${capitalize(modalName)}Modal}`);
    lines.push(`        onClose={() => setShow${capitalize(modalName)}Modal(false)}`);
    lines.push(`        title="${title}"`);
    lines.push(`      >`);
    lines.push(`        <p>${title} content goes here.</p>`);
    lines.push(`      </Modal>`);
  }

  return lines.join('\n');
}

function generateImports(model) {
  return ''; // All imports are in the template already
}

function generateStyles(model) {
  const hasCanvas = model.features.some(f => f.type.startsWith('canvas-'));
  const hasTheme = model.features.some(f => f.name?.includes('Theme'));

  let css = `
/* Generated styles from behavior model */

:root {
  --bg-color: #ffffff;
  --text-color: #1e1e1e;
  --border-color: #e0e0e0;
  --primary-color: #6965db;
}

[data-theme="dark"] {
  --bg-color: #1e1e1e;
  --text-color: #ffffff;
  --border-color: #3e3e3e;
}

.app-container {
  width: 100vw;
  height: 100vh;
  background: var(--bg-color);
  color: var(--text-color);
  overflow: hidden;
  position: relative;
  outline: none;
}
`;

  if (hasCanvas) {
    css += `
/* Toolbar */
.toolbar {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  padding: 8px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  z-index: 100;
}

.tool-button {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.tool-button:hover {
  background: var(--border-color);
}

.tool-button.active {
  background: var(--primary-color);
  color: white;
}

/* Canvas */
.main-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

/* Zoom Controls */
.zoom-controls {
  position: fixed;
  bottom: 16px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  z-index: 100;
}

.zoom-controls button {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
}

.zoom-controls button:hover {
  background: var(--border-color);
}
`;
  }

  css += `
/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-color);
  border-radius: 12px;
  min-width: 400px;
  max-width: 600px;
  max-height: 80vh;
  overflow: auto;
  box-shadow: 0 4px 24px rgba(0,0,0,0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
}

.modal-close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color);
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close:hover {
  background: var(--border-color);
}

.modal-body {
  padding: 20px;
}
`;

  return css;
}

function generateDrawElement() {
  return `
// Draw element on canvas
function drawElement(ctx, el) {
  ctx.save();
  ctx.strokeStyle = el.strokeColor || '#1e1e1e';
  ctx.fillStyle = el.fillColor || 'transparent';
  ctx.lineWidth = el.strokeWidth || 2;

  switch (el.type) {
    case 'rectangle':
      ctx.strokeRect(el.x, el.y, el.width, el.height);
      if (el.fillColor !== 'transparent') {
        ctx.fillRect(el.x, el.y, el.width, el.height);
      }
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(
        el.x + el.width / 2,
        el.y + el.height / 2,
        el.width / 2,
        el.height / 2,
        0, 0, Math.PI * 2
      );
      ctx.stroke();
      if (el.fillColor !== 'transparent') ctx.fill();
      break;
    case 'line':
      ctx.beginPath();
      ctx.moveTo(el.x, el.y);
      ctx.lineTo(el.x + el.width, el.y + el.height);
      ctx.stroke();
      break;
    default:
      break;
  }

  ctx.restore();
}
`;
}

// ===== MAIN GENERATOR =====

function generateFromBehavior(model, outputDir) {
  // Generate App.jsx
  let appCode = APP_TEMPLATE
    .replace('{{IMPORTS}}', generateImports(model))
    .replace('{{STATE_DECLARATIONS}}', generateStateDeclarations(model))
    .replace('{{REF_DECLARATIONS}}', generateRefDeclarations(model))
    .replace('{{EFFECTS}}', generateEffects(model))
    .replace('{{EVENT_HANDLERS}}', generateEventHandlers(model))
    .replace('{{KEYBOARD_HANDLER}}', generateKeyboardHandler(model))
    .replace('{{JSX_CONTENT}}', generateJSXContent(model));

  // Add helper components
  const hasCanvas = model.features.some(f => f.type.startsWith('canvas-'));
  if (hasCanvas) {
    appCode = appCode.replace(
      "import React",
      generateDrawElement() + "\n\nimport React"
    );
  }

  // Add Toolbar component
  appCode = appCode.replace(
    "function App()",
    TOOLBAR_COMPONENT_TEMPLATE + "\n\n" + MODAL_COMPONENT_TEMPLATE + "\n\nfunction App()"
  );

  // Generate styles
  const styles = generateStyles(model);

  // Generate index.html
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${model.metadata.title || 'Generated App'}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="main.jsx"></script>
</body>
</html>`;

  // Generate main.jsx
  const mainJsx = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`;

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Write files
  fs.writeFileSync(path.join(outputDir, 'App.jsx'), appCode);
  fs.writeFileSync(path.join(outputDir, 'styles.css'), styles);
  fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml);
  fs.writeFileSync(path.join(outputDir, 'main.jsx'), mainJsx);

  // Generate package.json
  const packageJson = {
    name: "generated-app",
    private: true,
    version: "0.0.0",
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
      vite: "^4.4.0"
    }
  };

  fs.writeFileSync(
    path.join(outputDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // Generate vite.config.js
  const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});`;

  fs.writeFileSync(path.join(outputDir, 'vite.config.js'), viteConfig);

  return {
    files: ['App.jsx', 'styles.css', 'index.html', 'main.jsx', 'package.json', 'vite.config.js'],
    outputDir
  };
}

// ===== HELPERS =====

function camelCase(str) {
  return str
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word, i) => i === 0 ? word.toLowerCase() : capitalize(word))
    .join('');
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ===== CLI =====

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node generate-from-behavior.js <recording-dir> [output-dir]');
    console.log('');
    console.log('Example:');
    console.log('  node generate-from-behavior.js output/behavior-recordings/excalidraw-com-2026-01-08/');
    process.exit(1);
  }

  const recordingDir = args[0];
  const modelPath = path.join(recordingDir, 'behavior-model.json');

  if (!fs.existsSync(modelPath)) {
    console.error(`Behavior model not found: ${modelPath}`);
    console.error('Run analyze-behavior.js first to generate the model.');
    process.exit(1);
  }

  const outputDir = args[1] || path.join(recordingDir, 'generated-app');

  console.log('═'.repeat(65));
  console.log('  BEHAVIOR-TO-CODE GENERATOR');
  console.log('═'.repeat(65));
  console.log(`\nLoading: ${modelPath}`);

  const model = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));

  console.log(`Features: ${model.features.length}`);
  console.log(`States: ${model.stateMachine?.states?.length || 0}`);
  console.log(`Trigger-Effects: ${model.triggerEffects.length}`);
  console.log('\nGenerating code...');

  const result = generateFromBehavior(model, outputDir);

  console.log('\n═'.repeat(65));
  console.log('  GENERATION COMPLETE');
  console.log('═'.repeat(65));
  console.log(`\nOutput: ${result.outputDir}`);
  console.log('\nGenerated files:');
  for (const file of result.files) {
    console.log(`  • ${file}`);
  }
  console.log('\nTo run:');
  console.log(`  cd ${result.outputDir}`);
  console.log('  npm install');
  console.log('  npm run dev');
}

main().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
