/**
 * Interactive Element Extractor
 *
 * Extracts all interactive elements from a page and generates a manifest
 * that maps elements to their state and behavior.
 *
 * Usage:
 *   node tools/extract-interactivity.js <url>
 *
 * Or programmatically:
 *   const { extractInteractivity } = require('./extract-interactivity');
 *   const manifest = await extractInteractivity(page);
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract interactive elements from a Playwright page
 */
async function extractInteractivity(page) {
  const manifest = await page.evaluate(() => {
    const result = {
      meta: {
        generated: new Date().toISOString(),
        source: window.location.href,
        totalElements: 0,
        interactiveElements: 0
      },
      elements: {
        buttons: [],
        inputs: [],
        links: [],
        clickable: []
      },
      stateGroups: {},
      indicators: [],
      labels: []
    };

    // Helper to get element identifier
    function getElementId(el, index) {
      return el.id || el.className.split(' ')[0] || `el-${index}`;
    }

    // Helper to extract semantic info from element
    function extractSemanticInfo(el) {
      return {
        title: el.getAttribute('title'),
        ariaLabel: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
        name: el.getAttribute('name'),
        type: el.getAttribute('type'),
        value: el.getAttribute('value'),
        textContent: el.textContent?.trim().slice(0, 50),
        tagName: el.tagName.toLowerCase()
      };
    }

    // Helper to extract position info
    function extractPosition(el) {
      const rect = el.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    }

    // Helper to check if element is interactive
    function isInteractive(el) {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role');
      const tabIndex = el.getAttribute('tabindex');
      const hasClickHandler = el.onclick !== null;
      const cursor = window.getComputedStyle(el).cursor;

      return (
        tag === 'button' ||
        tag === 'a' ||
        tag === 'input' ||
        tag === 'select' ||
        tag === 'textarea' ||
        role === 'button' ||
        role === 'link' ||
        role === 'checkbox' ||
        role === 'radio' ||
        role === 'tab' ||
        role === 'menuitem' ||
        tabIndex !== null ||
        hasClickHandler ||
        cursor === 'pointer'
      );
    }

    // Helper to infer state group from title/label
    function inferStateGroup(semantic) {
      const text = (semantic.title || semantic.ariaLabel || semantic.textContent || '').toLowerCase();

      // Tool patterns
      if (text.includes('hand') || text.includes('pan')) return { group: 'selectedTool', value: 'hand' };
      if (text.includes('selection') || text.includes('select')) return { group: 'selectedTool', value: 'selection' };
      if (text.includes('rectangle') || text.includes('rect')) return { group: 'selectedTool', value: 'rectangle' };
      if (text.includes('diamond')) return { group: 'selectedTool', value: 'diamond' };
      if (text.includes('ellipse') || text.includes('circle')) return { group: 'selectedTool', value: 'ellipse' };
      if (text.includes('arrow')) return { group: 'selectedTool', value: 'arrow' };
      if (text.includes('line')) return { group: 'selectedTool', value: 'line' };
      if (text.includes('draw') || text.includes('pencil') || text.includes('pen')) return { group: 'selectedTool', value: 'draw' };
      if (text.includes('text')) return { group: 'selectedTool', value: 'text' };
      if (text.includes('image')) return { group: 'selectedTool', value: 'image' };
      if (text.includes('eraser')) return { group: 'selectedTool', value: 'eraser' };

      // Color patterns (hex colors)
      const hexMatch = text.match(/#[0-9a-f]{6}/i);
      if (hexMatch) {
        // Determine if stroke or fill based on position/context
        return { group: 'color', value: hexMatch[0] };
      }
      if (text === 'transparent') return { group: 'fillColor', value: 'transparent' };

      // Stroke width patterns
      if (text === 'thin') return { group: 'strokeWidth', value: 'thin' };
      if (text === 'bold' && !text.includes('extra')) return { group: 'strokeWidth', value: 'bold' };
      if (text.includes('extra bold')) return { group: 'strokeWidth', value: 'extraBold' };

      // Stroke style patterns
      if (text === 'solid') return { group: 'strokeStyle', value: 'solid' };
      if (text === 'dashed') return { group: 'strokeStyle', value: 'dashed' };
      if (text === 'dotted') return { group: 'strokeStyle', value: 'dotted' };

      // Sloppiness patterns
      if (text === 'architect') return { group: 'sloppiness', value: 'architect' };
      if (text === 'artist') return { group: 'sloppiness', value: 'artist' };
      if (text === 'cartoonist') return { group: 'sloppiness', value: 'cartoonist' };

      // Edge patterns
      if (text === 'sharp') return { group: 'edges', value: 'sharp' };
      if (text === 'round') return { group: 'edges', value: 'round' };

      // Action patterns
      if (text.includes('undo')) return { group: 'action', value: 'undo' };
      if (text.includes('redo')) return { group: 'action', value: 'redo' };
      if (text.includes('zoom in')) return { group: 'action', value: 'zoomIn' };
      if (text.includes('zoom out')) return { group: 'action', value: 'zoomOut' };
      if (text.includes('reset zoom')) return { group: 'action', value: 'resetZoom' };
      if (text.includes('send to back')) return { group: 'action', value: 'sendToBack' };
      if (text.includes('send backward')) return { group: 'action', value: 'sendBackward' };
      if (text.includes('bring forward')) return { group: 'action', value: 'bringForward' };
      if (text.includes('bring to front')) return { group: 'action', value: 'bringToFront' };
      if (text.includes('help')) return { group: 'toggle', value: 'showHelp' };
      if (text.includes('library')) return { group: 'toggle', value: 'showLibrary' };

      return null;
    }

    // Helper to extract keyboard shortcut from title
    function extractShortcut(title) {
      if (!title) return null;
      const match = title.match(/—\s*(.+)$/);
      return match ? match[1].trim() : null;
    }

    // Scan all elements
    let index = 0;
    const allElements = document.querySelectorAll('*');

    allElements.forEach(el => {
      result.meta.totalElements++;

      if (!isInteractive(el)) return;

      result.meta.interactiveElements++;
      const id = getElementId(el, index++);
      const semantic = extractSemanticInfo(el);
      const position = extractPosition(el);
      const stateInfo = inferStateGroup(semantic);
      const shortcut = extractShortcut(semantic.title);

      const elementData = {
        id,
        ...semantic,
        ...position,
        stateGroup: stateInfo?.group || null,
        stateValue: stateInfo?.value || null,
        shortcut
      };

      // Categorize by type
      const tag = el.tagName.toLowerCase();
      if (tag === 'button' || semantic.role === 'button') {
        result.elements.buttons.push(elementData);
      } else if (tag === 'input' || tag === 'select' || tag === 'textarea') {
        result.elements.inputs.push(elementData);
      } else if (tag === 'a') {
        result.elements.links.push(elementData);
      } else {
        result.elements.clickable.push(elementData);
      }

      // Group by state
      if (stateInfo) {
        if (!result.stateGroups[stateInfo.group]) {
          result.stateGroups[stateInfo.group] = [];
        }
        result.stateGroups[stateInfo.group].push({
          elementId: id,
          value: stateInfo.value
        });
      }
    });

    return result;
  });

  return manifest;
}

/**
 * Generate React state declarations from manifest
 */
function generateStateDeclarations(manifest) {
  const states = new Set();

  Object.keys(manifest.stateGroups).forEach(group => {
    if (group !== 'action' && group !== 'toggle') {
      states.add(group);
    }
  });

  let code = '// Auto-generated state declarations\n';
  states.forEach(state => {
    const values = manifest.stateGroups[state];
    const defaultValue = values[0]?.value || 'null';
    const isString = typeof defaultValue === 'string';
    code += `const [${state}, set${state.charAt(0).toUpperCase() + state.slice(1)}] = useState(${isString ? `'${defaultValue}'` : defaultValue});\n`;
  });

  return code;
}

/**
 * Generate element bindings from manifest
 */
function generateElementBindings(manifest) {
  let bindings = [];

  Object.entries(manifest.stateGroups).forEach(([group, elements]) => {
    elements.forEach(({ elementId, value }) => {
      const setter = `set${group.charAt(0).toUpperCase() + group.slice(1)}`;
      const isString = typeof value === 'string';

      if (group === 'action') {
        bindings.push({
          elementId,
          binding: `onClick={() => handle${value.charAt(0).toUpperCase() + value.slice(1)}()}`
        });
      } else if (group === 'toggle') {
        bindings.push({
          elementId,
          binding: `onClick={() => ${setter}(prev => !prev)}`
        });
      } else {
        bindings.push({
          elementId,
          binding: `onClick={() => ${setter}(${isString ? `'${value}'` : value})}`,
          className: `\${${group} === ${isString ? `'${value}'` : value} ? 'selected' : ''}`
        });
      }
    });
  });

  return bindings;
}

/**
 * CLI entry point
 */
async function main() {
  const url = process.argv[2];

  if (!url) {
    console.log('Usage: node extract-interactivity.js <url>');
    console.log('');
    console.log('Extracts interactive elements from a page and generates:');
    console.log('  - interactive-manifest.json: Full element mapping');
    console.log('  - state-declarations.js: React useState hooks');
    console.log('  - element-bindings.js: onClick handlers and classNames');
    process.exit(1);
  }

  const { chromium } = require('playwright');

  console.log(`Extracting interactivity from: ${url}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(url, { waitUntil: 'networkidle' });

  // Wait for dynamic content
  await page.waitForTimeout(2000);

  const manifest = await extractInteractivity(page);

  await browser.close();

  // Output directory
  const outputDir = path.join(__dirname, '..', 'output', 'extracted');
  fs.mkdirSync(outputDir, { recursive: true });

  // Write manifest
  const manifestPath = path.join(outputDir, 'interactive-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Wrote: ${manifestPath}`);

  // Write state declarations
  const stateCode = generateStateDeclarations(manifest);
  const statePath = path.join(outputDir, 'state-declarations.js');
  fs.writeFileSync(statePath, stateCode);
  console.log(`Wrote: ${statePath}`);

  // Write bindings
  const bindings = generateElementBindings(manifest);
  const bindingsPath = path.join(outputDir, 'element-bindings.json');
  fs.writeFileSync(bindingsPath, JSON.stringify(bindings, null, 2));
  console.log(`Wrote: ${bindingsPath}`);

  // Summary
  console.log('\nSummary:');
  console.log(`  Total elements: ${manifest.meta.totalElements}`);
  console.log(`  Interactive elements: ${manifest.meta.interactiveElements}`);
  console.log(`  Buttons: ${manifest.elements.buttons.length}`);
  console.log(`  Inputs: ${manifest.elements.inputs.length}`);
  console.log(`  Links: ${manifest.elements.links.length}`);
  console.log(`  Other clickable: ${manifest.elements.clickable.length}`);
  console.log('\nState groups detected:');
  Object.entries(manifest.stateGroups).forEach(([group, elements]) => {
    console.log(`  ${group}: ${elements.length} elements`);
  });
}

module.exports = { extractInteractivity, generateStateDeclarations, generateElementBindings };

if (require.main === module) {
  main().catch(console.error);
}
