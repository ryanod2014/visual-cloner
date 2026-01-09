/**
 * React Code Generator from Interactive Manifest
 *
 * Takes an interactive-manifest.json and generates:
 * 1. State declarations (useState hooks)
 * 2. Element JSX with bindings (onClick, className)
 * 3. CSS for selection states
 *
 * Usage:
 *   node tools/generate-from-manifest.js <manifest.json> <output-dir>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate React useState declarations
 */
function generateStateCode(manifest) {
  const lines = [
    '// ============================================',
    '// AUTO-GENERATED STATE DECLARATIONS',
    '// From: ' + manifest.meta.source,
    '// ============================================',
    ''
  ];

  // Generate state for each state definition
  Object.entries(manifest.states).forEach(([stateName, config]) => {
    let defaultValue;

    if (config.type === 'enum') {
      defaultValue = `'${config.default}'`;
    } else if (config.type === 'color') {
      defaultValue = `'${config.default}'`;
    } else if (config.type === 'number') {
      defaultValue = config.default;
    } else if (config.type === 'boolean') {
      defaultValue = config.default;
    } else {
      defaultValue = 'null';
    }

    const capitalizedName = stateName.charAt(0).toUpperCase() + stateName.slice(1);
    lines.push(`const [${stateName}, set${capitalizedName}] = useState(${defaultValue});`);
  });

  return lines.join('\n');
}

/**
 * Generate element JSX with bindings
 */
function generateElementBindings(manifest) {
  const bindings = {};

  // Process each element category
  const categories = ['tools', 'strokeColors', 'fillColors', 'strokeWidth', 'strokeStyle', 'sloppiness', 'edges', 'zoom', 'layers', 'history', 'toggles'];

  categories.forEach(category => {
    const elements = manifest.elements[category];
    if (!elements) return;

    Object.entries(elements).forEach(([elementId, config]) => {
      const binding = {
        elementId,
        category,
        ...config
      };

      // Determine the binding type
      if (config.controls) {
        const stateName = config.controls;
        const capitalizedName = stateName.charAt(0).toUpperCase() + stateName.slice(1);

        if (config.type === 'toggle' || config.type === 'checkbox') {
          binding.onClick = `() => set${capitalizedName}(prev => !prev)`;
          binding.className = null; // Toggles don't have selection state
        } else if (config.type === 'range') {
          binding.onChange = `(e) => set${capitalizedName}(parseInt(e.target.value))`;
          binding.value = stateName;
        } else {
          // Enum selection
          binding.onClick = `() => set${capitalizedName}('${config.value}')`;

          // Determine selection class
          let selectionClass = 'option-selected';
          if (category === 'tools') selectionClass = 'tool-selected';
          if (category === 'strokeColors' || category === 'fillColors') selectionClass = 'color-selected';

          binding.conditionalClass = `${stateName} === '${config.value}' ? '${selectionClass}' : ''`;
        }
      } else if (config.action) {
        // Action binding
        const actionName = config.action;
        const capitalizedAction = actionName.charAt(0).toUpperCase() + actionName.slice(1);
        binding.onClick = `handle${capitalizedAction}`;
      }

      bindings[elementId] = binding;
    });
  });

  // Process indicators
  if (manifest.indicators) {
    Object.entries(manifest.indicators).forEach(([elementId, config]) => {
      bindings[elementId] = {
        elementId,
        category: 'indicator',
        reflects: config.reflects,
        styleBinding: config.style,
        transparentStyle: config.transparentStyle
      };
    });
  }

  return bindings;
}

/**
 * Generate JSX for a single element
 */
function generateElementJSX(elementId, binding, originalJSX) {
  if (!binding) return originalJSX;

  let jsx = originalJSX || `<button className="${elementId}" />`;

  // Parse the original JSX to extract existing props
  const classMatch = jsx.match(/className="([^"]+)"/);
  const baseClass = classMatch ? classMatch[1] : elementId;

  // Build new className
  let newClassName = baseClass;
  if (binding.conditionalClass) {
    newClassName = `\`${baseClass} \${${binding.conditionalClass}}\``;
  }

  // Build props
  const props = [];

  if (binding.conditionalClass) {
    props.push(`className={${newClassName}}`);
  } else {
    props.push(`className="${baseClass}"`);
  }

  if (binding.onClick) {
    props.push(`onClick={${binding.onClick}}`);
  }

  if (binding.onChange) {
    props.push(`onChange={${binding.onChange}}`);
  }

  if (binding.value) {
    props.push(`value={${binding.value}}`);
  }

  if (binding.styleBinding) {
    if (binding.transparentStyle) {
      props.push(`style={{ ${binding.styleBinding}: ${binding.reflects} === 'transparent' ? '${binding.transparentStyle.backgroundColor}' : ${binding.reflects}, border: ${binding.reflects} === 'transparent' ? '${binding.transparentStyle.border}' : 'none' }}`);
    } else {
      props.push(`style={{ ${binding.styleBinding}: ${binding.reflects} }}`);
    }
  }

  if (binding.title) {
    props.push(`title="${binding.title}"`);
  }

  // Generate the element
  const tag = jsx.match(/<(\w+)/)?.[1] || 'button';
  return `<${tag} ${props.join(' ')} />`;
}

/**
 * Generate action handlers
 */
function generateActionHandlers(manifest) {
  const actions = manifest.elements.layers || {};
  const history = manifest.elements.history || {};
  const zoom = manifest.elements.zoom || {};

  const lines = [
    '// ============================================',
    '// AUTO-GENERATED ACTION HANDLERS',
    '// ============================================',
    ''
  ];

  // Zoom actions
  lines.push('// Zoom actions');
  lines.push('const handleZoomIn = () => setZoom(z => Math.min(500, z + 10));');
  lines.push('const handleZoomOut = () => setZoom(z => Math.max(10, z - 10));');
  lines.push('const handleResetZoom = () => setZoom(100);');
  lines.push('');

  // History actions
  lines.push('// History actions');
  lines.push('const handleUndo = () => setShapes(prev => prev.slice(0, -1));');
  lines.push('const handleRedo = () => { /* TODO: Implement redo with history stack */ };');
  lines.push('');

  // Layer actions
  lines.push('// Layer actions (require selected element)');
  lines.push('const handleSendToBack = () => { /* TODO: Implement with selected element */ };');
  lines.push('const handleSendBackward = () => { /* TODO: Implement with selected element */ };');
  lines.push('const handleBringForward = () => { /* TODO: Implement with selected element */ };');
  lines.push('const handleBringToFront = () => { /* TODO: Implement with selected element */ };');

  return lines.join('\n');
}

/**
 * Generate CSS for selection states
 */
function generateSelectionCSS(manifest) {
  const styles = manifest.selectionStyles || {};

  const lines = [
    '/* ============================================ */',
    '/* AUTO-GENERATED SELECTION STYLES */',
    '/* ============================================ */',
    ''
  ];

  Object.entries(styles).forEach(([type, config]) => {
    lines.push(`/* ${type} selection state */`);
    lines.push(`.${config.class} {`);
    Object.entries(config.css).forEach(([prop, value]) => {
      const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
      lines.push(`  ${cssProp}: ${value} !important;`);
    });
    lines.push('}');
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Generate complete binding report
 */
function generateBindingReport(manifest, bindings) {
  const lines = [
    '# Interactive Element Binding Report',
    '',
    `Source: ${manifest.meta.source}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    `- Total elements: ${manifest.meta.totalElements}`,
    `- Interactive elements: ${manifest.meta.interactiveElements}`,
    `- Bound elements: ${Object.keys(bindings).length}`,
    '',
    '## State Variables',
    ''
  ];

  Object.entries(manifest.states).forEach(([name, config]) => {
    lines.push(`### ${name}`);
    lines.push(`- Type: ${config.type}`);
    if (config.values) lines.push(`- Values: ${config.values.join(', ')}`);
    if (config.default !== undefined) lines.push(`- Default: ${config.default}`);
    lines.push('');
  });

  lines.push('## Element Bindings');
  lines.push('');

  Object.entries(bindings).forEach(([elementId, binding]) => {
    lines.push(`### ${elementId}`);
    lines.push(`- Category: ${binding.category}`);
    if (binding.controls) lines.push(`- Controls: ${binding.controls}`);
    if (binding.value) lines.push(`- Value: ${binding.value}`);
    if (binding.action) lines.push(`- Action: ${binding.action}`);
    if (binding.onClick) lines.push(`- onClick: ${binding.onClick}`);
    if (binding.conditionalClass) lines.push(`- Conditional class: ${binding.conditionalClass}`);
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Main CLI
 */
async function main() {
  const manifestPath = process.argv[2];
  const outputDir = process.argv[3] || './generated';

  if (!manifestPath) {
    console.log('Usage: node generate-from-manifest.js <manifest.json> [output-dir]');
    console.log('');
    console.log('Generates React code from an interactive manifest:');
    console.log('  - state-declarations.js: useState hooks');
    console.log('  - action-handlers.js: Event handler functions');
    console.log('  - element-bindings.json: Element ID to binding map');
    console.log('  - selection-styles.css: CSS for selection states');
    console.log('  - binding-report.md: Human-readable summary');
    process.exit(1);
  }

  // Read manifest
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  console.log(`Loaded manifest: ${manifestPath}`);

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Generate state code
  const stateCode = generateStateCode(manifest);
  fs.writeFileSync(path.join(outputDir, 'state-declarations.js'), stateCode);
  console.log('Wrote: state-declarations.js');

  // Generate action handlers
  const actionCode = generateActionHandlers(manifest);
  fs.writeFileSync(path.join(outputDir, 'action-handlers.js'), actionCode);
  console.log('Wrote: action-handlers.js');

  // Generate bindings
  const bindings = generateElementBindings(manifest);
  fs.writeFileSync(path.join(outputDir, 'element-bindings.json'), JSON.stringify(bindings, null, 2));
  console.log('Wrote: element-bindings.json');

  // Generate CSS
  const css = generateSelectionCSS(manifest);
  fs.writeFileSync(path.join(outputDir, 'selection-styles.css'), css);
  console.log('Wrote: selection-styles.css');

  // Generate report
  const report = generateBindingReport(manifest, bindings);
  fs.writeFileSync(path.join(outputDir, 'binding-report.md'), report);
  console.log('Wrote: binding-report.md');

  console.log(`\nGenerated ${Object.keys(bindings).length} element bindings to: ${outputDir}`);
}

export {
  generateStateCode,
  generateElementBindings,
  generateElementJSX,
  generateActionHandlers,
  generateSelectionCSS,
  generateBindingReport
};

// Run if called directly
main().catch(console.error);
