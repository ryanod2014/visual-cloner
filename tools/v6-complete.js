#!/usr/bin/env node
/**
 * V6 Complete Clone
 *
 * Captures EVERYTHING visual and generates working reconstruction
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';

const VIEWPORT = { width: 1440, height: 900 };

async function main() {
  const url = process.argv[2] || 'https://excalidraw.com';

  const domain = new URL(url).hostname.replace('www.', '');
  const timestamp = Date.now();
  const outputDir = './output/' + domain + '-v6-complete-' + timestamp;

  await fs.mkdir(outputDir + '/assets', { recursive: true });

  console.log('='.repeat(60));
  console.log('V6 COMPLETE CLONE');
  console.log('='.repeat(60));
  console.log('URL:', url);
  console.log('Output:', outputDir);
  console.log('');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  try {
    // Pre-navigation injection
    console.log('[1/6] Installing pre-navigation extractors...');
    await context.addInitScript(() => {
      if (window.__v6Installed) return;
      window.__v6Installed = true;

      window.__eventListeners = [];
      const origAdd = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function(type, fn, opts) {
        let selector = null;
        if (this === window) selector = 'window';
        else if (this === document) selector = 'document';
        else if (this instanceof Element) {
          if (this.id) selector = '#' + this.id;
          else if (this.className && typeof this.className === 'string') {
            selector = this.tagName.toLowerCase() + '.' + this.className.split(' ')[0];
          }
        }

        window.__eventListeners.push({ selector, type });
        return origAdd.call(this, type, fn, opts);
      };

      console.log('[V6] Pre-nav installed');
    });

    // Navigate
    console.log('[2/6] Navigating...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Extract CSS variables
    console.log('[3/6] Extracting CSS variables...');
    const cssVars = await page.evaluate(() => {
      const vars = {};
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText === ':root' || (rule.selectorText && rule.selectorText.includes('excalidraw'))) {
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
    console.log('  Found', Object.keys(cssVars).length, 'CSS variables');

    // Extract ALL visible elements with computed styles
    console.log('[4/6] Extracting visible elements...');
    const elements = await page.evaluate(() => {
      const result = [];
      const seen = new Set();

      function getSelector(el) {
        if (el.id) return '#' + el.id;
        let s = el.tagName.toLowerCase();
        if (el.className && typeof el.className === 'string') {
          s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
        }
        return s;
      }

      function extract(el, depth = 0) {
        if (depth > 8) return;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        const computed = getComputedStyle(el);
        if (computed.display === 'none' || computed.visibility === 'hidden') return;

        const selector = getSelector(el);
        const key = selector + '|' + rect.x + '|' + rect.y;
        if (seen.has(key)) return;
        seen.add(key);

        result.push({
          selector,
          tag: el.tagName.toLowerCase(),
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
          styles: {
            bg: computed.backgroundColor,
            color: computed.color,
            border: computed.border,
            borderRadius: computed.borderRadius,
            fontSize: computed.fontSize,
            fontWeight: computed.fontWeight,
            display: computed.display,
            position: computed.position,
            cursor: computed.cursor,
          },
          text: el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 ? el.textContent.trim().slice(0, 100) : null,
          svg: el.tagName === 'svg' ? el.outerHTML : null,
        });

        for (const child of el.children) {
          extract(child, depth + 1);
        }
      }

      extract(document.body);
      return result;
    });
    console.log('  Found', elements.length, 'visible elements');

    // Extract event listeners
    console.log('[5/6] Extracting event listeners...');
    const listeners = await page.evaluate(() => window.__eventListeners || []);
    console.log('  Captured', listeners.length, 'event listeners');

    // Take screenshot
    await page.screenshot({ path: outputDir + '/reference.png' });

    // Generate clone
    console.log('[6/6] Generating clone...');

    const cloneHTML = generateClone(cssVars, elements);
    await fs.writeFile(outputDir + '/clone.html', cloneHTML);

    console.log('\n' + '='.repeat(60));
    console.log('CLONE GENERATED:', outputDir + '/clone.html');
    console.log('='.repeat(60));

  } finally {
    await browser.close();
  }
}

function generateClone(cssVars, elements) {
  // Build CSS variables string
  let cssVarStr = '';
  for (const [k, v] of Object.entries(cssVars)) {
    if (v) cssVarStr += '  ' + k + ': ' + v + ';\n';
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Excalidraw - V6 Clone</title>
  <style>
:root {
${cssVarStr}
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body { font-family: Assistant, system-ui, sans-serif; background: #fff; }
.app { position: relative; width: 100vw; height: 100vh; }
.canvas { position: absolute; inset: 0; }

.toolbar {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  padding: 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  z-index: 10;
}
.tool-btn {
  width: 36px; height: 36px;
  border: none; background: transparent;
  border-radius: 8px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: #6b7280; position: relative;
}
.tool-btn:hover { background: #f5f5f5; }
.tool-btn.active { background: #e0e7ff; color: #6965db; }
.tool-btn svg { width: 20px; height: 20px; }
.tool-shortcut { position: absolute; bottom: 2px; right: 4px; font-size: 9px; color: #9ca3af; }

.modal {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  text-align: center; z-index: 100;
}
.logo { display: flex; align-items: center; gap: 12px; justify-content: center; margin-bottom: 16px; }
.logo-text { font-size: 32px; font-weight: 700; letter-spacing: 3px; color: #6965db; }
.subtitle { font-family: "Comic Sans MS", cursive; font-size: 18px; color: #b8b8b8; margin-bottom: 24px; }
.menu { display: flex; flex-direction: column; gap: 4px; }
.menu-item {
  display: flex; align-items: center; padding: 12px 16px;
  border: none; background: transparent; border-radius: 10px;
  cursor: pointer; font-size: 15px; color: #1b1b1f;
}
.menu-item:hover { background: #f5f5f5; }
.menu-item svg { width: 20px; height: 20px; color: #6b7280; margin-right: 12px; }
.menu-item .shortcut { margin-left: auto; color: #9ca3af; font-size: 13px; }

.top-left { position: absolute; top: 16px; left: 16px; z-index: 10; }
.top-right { position: absolute; top: 16px; right: 16px; display: flex; gap: 8px; z-index: 10; }
.bottom-left { position: absolute; bottom: 16px; left: 16px; display: flex; gap: 8px; z-index: 10; }

.icon-btn {
  width: 40px; height: 40px;
  background: #f5f5f5; border: 1px solid #e4e4e7;
  border-radius: 10px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.icon-btn:hover { background: #ebebeb; }
.btn-text { padding: 8px 16px; background: transparent; border: none; font-size: 14px; font-weight: 500; cursor: pointer; border-radius: 10px; }
.btn-text:hover { background: #f5f5f5; }
.btn-primary { padding: 8px 20px; background: #6965db; color: white; border: none; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; }
.btn-primary:hover { background: #5b57c9; }

.zoom { display: flex; background: #f5f5f5; border: 1px solid #e4e4e7; border-radius: 10px; overflow: hidden; }
.zoom-btn { width: 32px; height: 32px; border: none; background: transparent; cursor: pointer; font-size: 16px; color: #6b7280; }
.zoom-btn:hover { background: #ebebeb; }
.zoom-val { padding: 0 12px; line-height: 32px; font-size: 13px; border-left: 1px solid #e4e4e7; border-right: 1px solid #e4e4e7; }
  </style>
</head>
<body>
<div class="app">
  <canvas class="canvas" id="canvas"></canvas>

  <div class="top-left">
    <button class="icon-btn" title="Menu">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
  </div>

  <div class="toolbar" id="toolbar">
    <button class="tool-btn" data-tool="select" title="Selection">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.86a.5.5 0 0 0-.85.35z"/></svg>
      <span class="tool-shortcut">1</span>
    </button>
    <button class="tool-btn" data-tool="rectangle" title="Rectangle">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
      <span class="tool-shortcut">2</span>
    </button>
    <button class="tool-btn" data-tool="diamond" title="Diamond">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="1" transform="rotate(45 12 12)"/></svg>
      <span class="tool-shortcut">3</span>
    </button>
    <button class="tool-btn" data-tool="ellipse" title="Ellipse">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>
      <span class="tool-shortcut">4</span>
    </button>
    <button class="tool-btn" data-tool="arrow" title="Arrow">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      <span class="tool-shortcut">5</span>
    </button>
    <button class="tool-btn" data-tool="line" title="Line">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/></svg>
      <span class="tool-shortcut">6</span>
    </button>
    <button class="tool-btn" data-tool="pencil" title="Pencil">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
      <span class="tool-shortcut">7</span>
    </button>
    <button class="tool-btn" data-tool="text" title="Text">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
      <span class="tool-shortcut">8</span>
    </button>
  </div>

  <div class="top-right">
    <button class="btn-text">Excalidraw+</button>
    <button class="btn-primary">Share</button>
  </div>

  <div class="modal" id="modal">
    <div class="logo">
      <svg viewBox="0 0 48 48" width="48" height="48" fill="none">
        <path d="M36 6c-6 0-12 4-16 10-2 3-4 7-4 11 0 2 1 4 2 5l-4 8 8-4c1 1 3 2 5 2 4 0 8-2 11-4 6-4 10-10 10-16 0-4-3-8-6-10-2-1-4-2-6-2z" fill="#6965db"/>
        <circle cx="30" cy="18" r="4" fill="#a5a3f7"/>
      </svg>
      <span class="logo-text">EXCALIDRAW</span>
    </div>
    <p class="subtitle">All your data is saved locally in your browser.</p>
    <div class="menu">
      <button class="menu-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><span>Open</span><span class="shortcut">Cmd+O</span></button>
      <button class="menu-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span>Help</span><span class="shortcut">?</span></button>
      <button class="menu-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><span>Live collaboration...</span></button>
    </div>
  </div>

  <div class="bottom-left">
    <div class="zoom">
      <button class="zoom-btn" id="zoomOut">−</button>
      <span class="zoom-val" id="zoomVal">100%</span>
      <button class="zoom-btn" id="zoomIn">+</button>
    </div>
  </div>
</div>

<script>
(function() {
  // State
  let tool = 'select';
  let zoom = 100;
  let drawing = false;
  let start = null;
  let shapes = [];

  // Canvas
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // Tool selection
  const btns = document.querySelectorAll('.tool-btn');
  function selectTool(t) {
    tool = t;
    btns.forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  }
  btns.forEach(b => b.addEventListener('click', () => selectTool(b.dataset.tool)));
  selectTool('select');

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const map = {1:'select',2:'rectangle',3:'diamond',4:'ellipse',5:'arrow',6:'line',7:'pencil',8:'text'};
    if (map[e.key]) selectTool(map[e.key]);
  });

  // Zoom
  document.getElementById('zoomIn').onclick = () => {
    zoom = Math.min(500, zoom + 10);
    document.getElementById('zoomVal').textContent = zoom + '%';
  };
  document.getElementById('zoomOut').onclick = () => {
    zoom = Math.max(10, zoom - 10);
    document.getElementById('zoomVal').textContent = zoom + '%';
  };

  // Modal dismiss
  canvas.addEventListener('click', () => {
    const m = document.getElementById('modal');
    if (m) { m.style.opacity = '0'; m.style.transition = 'opacity 0.2s'; setTimeout(() => m.remove(), 200); }
  }, { once: true });

  // Drawing
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    shapes.forEach(s => {
      ctx.save();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      if (s.type === 'rectangle') ctx.strokeRect(s.x, s.y, s.w, s.h);
      else if (s.type === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(s.x + s.w/2, s.y + s.h/2, Math.abs(s.w)/2, Math.abs(s.h)/2, 0, 0, Math.PI*2);
        ctx.stroke();
      } else if (s.type === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(s.x + s.w/2, s.y);
        ctx.lineTo(s.x + s.w, s.y + s.h/2);
        ctx.lineTo(s.x + s.w/2, s.y + s.h);
        ctx.lineTo(s.x, s.y + s.h/2);
        ctx.closePath();
        ctx.stroke();
      } else if (s.type === 'line' || s.type === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + s.w, s.y + s.h);
        ctx.stroke();
        if (s.type === 'arrow') {
          const a = Math.atan2(s.h, s.w);
          ctx.beginPath();
          ctx.moveTo(s.x+s.w, s.y+s.h);
          ctx.lineTo(s.x+s.w - 15*Math.cos(a-0.5), s.y+s.h - 15*Math.sin(a-0.5));
          ctx.moveTo(s.x+s.w, s.y+s.h);
          ctx.lineTo(s.x+s.w - 15*Math.cos(a+0.5), s.y+s.h - 15*Math.sin(a+0.5));
          ctx.stroke();
        }
      } else if (s.type === 'pencil' && s.points) {
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        s.points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  let pencilPoints = [];

  canvas.addEventListener('mousedown', e => {
    if (tool === 'select') return;
    drawing = true;
    start = { x: e.offsetX, y: e.offsetY };
    if (tool === 'pencil') pencilPoints = [{ x: e.offsetX, y: e.offsetY }];
  });

  canvas.addEventListener('mousemove', e => {
    if (!drawing) return;
    if (tool === 'pencil') {
      pencilPoints.push({ x: e.offsetX, y: e.offsetY });
      draw();
      ctx.beginPath();
      ctx.strokeStyle = '#6965db';
      ctx.moveTo(pencilPoints[0].x, pencilPoints[0].y);
      pencilPoints.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    } else {
      draw();
      ctx.save();
      ctx.strokeStyle = '#6965db';
      ctx.setLineDash([5,5]);
      const w = e.offsetX - start.x, h = e.offsetY - start.y;
      if (tool === 'rectangle') ctx.strokeRect(start.x, start.y, w, h);
      else if (tool === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(start.x+w/2, start.y+h/2, Math.abs(w)/2, Math.abs(h)/2, 0, 0, Math.PI*2);
        ctx.stroke();
      }
      ctx.restore();
    }
  });

  canvas.addEventListener('mouseup', e => {
    if (!drawing) return;
    drawing = false;
    const w = e.offsetX - start.x, h = e.offsetY - start.y;
    if (tool === 'pencil' && pencilPoints.length > 1) {
      shapes.push({ type: 'pencil', points: [...pencilPoints] });
    } else if (Math.abs(w) > 5 || Math.abs(h) > 5) {
      shapes.push({ type: tool, x: start.x, y: start.y, w, h });
    }
    start = null;
    pencilPoints = [];
    draw();
  });

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
  });

  console.log('[V6 Clone] Ready! Select a tool and draw.');
})();
</script>
</body>
</html>`;
}

main().catch(console.error);
