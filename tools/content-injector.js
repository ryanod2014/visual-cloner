#!/usr/bin/env node
/**
 * Content Injector
 *
 * Takes extracted behavioral content (modals, dropdowns, panels) and
 * wires them into the clone's React app.
 *
 * Input:
 * - frontend-behaviors.json: What each button does
 * - content/*.html: Extracted HTML for each opened UI
 *
 * Output:
 * - Updates App.jsx with state, handlers, and rendered content
 * - Creates CSS for extracted content
 *
 * Usage: node content-injector.js <behavioral-dir> <app-jsx-path>
 */

import fs from 'fs';
import path from 'path';

const behavioralDir = process.argv[2] || './output/v4-clone-app/behavioral-v2';
const appJsxPath = process.argv[3] || './output/v4-clone-app/src/App.jsx';

async function main() {
  console.log('============================================================');
  console.log('Content Injector');
  console.log('Wiring extracted UI content into the clone');
  console.log('============================================================');
  console.log(`Behavioral dir: ${behavioralDir}`);
  console.log(`App.jsx: ${appJsxPath}`);

  // Load behavioral data
  const behaviorsPath = path.join(behavioralDir, 'frontend-behaviors.json');
  if (!fs.existsSync(behaviorsPath)) {
    console.error(`ERROR: ${behaviorsPath} not found`);
    process.exit(1);
  }

  const { behaviors, content } = JSON.parse(fs.readFileSync(behaviorsPath, 'utf-8'));

  // Filter to only behaviors that open UI with extracted content
  const uiBehaviors = behaviors.filter(b => b.pattern === 'opens_ui' && b.contentId);

  console.log(`\nFound ${uiBehaviors.length} UI behaviors with extracted content:`);
  uiBehaviors.forEach(b => {
    console.log(`   - ${b.label || b.element} → ${b.contentId}`);
  });

  // Load each content file
  const contentDir = path.join(behavioralDir, 'content');
  const extractedContent = {};

  for (const behavior of uiBehaviors) {
    const contentPath = path.join(contentDir, `${behavior.contentId}.html`);
    if (fs.existsSync(contentPath)) {
      extractedContent[behavior.contentId] = {
        html: fs.readFileSync(contentPath, 'utf-8'),
        trigger: behavior.element,
        label: behavior.label,
        bounds: behavior.frontendContent?.bounds,
        interactiveElements: behavior.frontendContent?.interactiveElements || [],
        styles: behavior.frontendContent?.styles
      };
    }
  }

  console.log(`\nLoaded ${Object.keys(extractedContent).length} content files`);

  // Generate the injection code
  const injection = generateInjection(extractedContent, uiBehaviors);

  // Read current App.jsx
  const currentApp = fs.readFileSync(appJsxPath, 'utf-8');

  // Find injection points and modify
  const modifiedApp = injectIntoApp(currentApp, injection);

  // Save modified App.jsx
  const backupPath = appJsxPath.replace('.jsx', '.backup.jsx');
  fs.writeFileSync(backupPath, currentApp);
  console.log(`\nBacked up original to: ${backupPath}`);

  fs.writeFileSync(appJsxPath, modifiedApp);
  console.log(`Updated: ${appJsxPath}`);

  // Generate CSS for extracted content
  const cssPath = path.join(path.dirname(appJsxPath), 'ExtractedContent.css');
  fs.writeFileSync(cssPath, injection.css);
  console.log(`Created: ${cssPath}`);

  // Save content mapping for reference
  const mappingPath = path.join(behavioralDir, 'content-mapping.json');
  fs.writeFileSync(mappingPath, JSON.stringify({
    injectedContent: Object.keys(extractedContent).map(id => ({
      id,
      trigger: extractedContent[id].trigger,
      label: extractedContent[id].label
    })),
    stateVariables: injection.stateNames,
    generatedAt: new Date().toISOString()
  }, null, 2));
  console.log(`Created: ${mappingPath}`);

  console.log('\n============================================================');
  console.log('INJECTION COMPLETE');
  console.log('============================================================');
  console.log(`Added ${injection.stateNames.length} new state variables`);
  console.log(`Added ${Object.keys(extractedContent).length} content components`);
  console.log('\nNext: Run `npm run dev` to test the injected content');
}

function generateInjection(extractedContent, behaviors) {
  const stateNames = [];
  const stateDeclarations = [];
  const handlers = [];
  const renderedContent = [];
  const triggerMappings = [];
  let css = `/* Extracted Content Styles */\n\n`;

  // Process each piece of extracted content
  for (const [contentId, data] of Object.entries(extractedContent)) {
    // Generate state name from content ID
    const stateName = `show${contentId.replace('content-', 'Content')}`;
    stateNames.push(stateName);

    // State declaration
    stateDeclarations.push(`const [${stateName}, set${capitalize(stateName)}] = useState(false);`);

    // Handler
    handlers.push(`const toggle${capitalize(stateName)} = () => set${capitalize(stateName)}(prev => !prev);`);

    // Find what type of content this is (modal, dropdown, etc)
    const isModal = data.html.includes('Modal') || data.html.includes('Dialog');
    const isDropdown = data.html.includes('dropdown') || data.html.includes('menu');

    // Clean the HTML for React (escape issues, etc)
    const cleanedHtml = cleanHtmlForReact(data.html);

    // Generate rendered content
    if (isModal) {
      renderedContent.push(`
      {/* Extracted: ${data.label || contentId} */}
      {${stateName} && (
        <div className="extracted-modal-overlay" onClick={() => set${capitalize(stateName)}(false)}>
          <div className="extracted-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="extracted-modal-close" onClick={() => set${capitalize(stateName)}(false)}>×</button>
            <div dangerouslySetInnerHTML={{ __html: \`${escapeTemplateString(cleanedHtml)}\` }} />
          </div>
        </div>
      )}`);

      css += `
/* Modal: ${data.label || contentId} */
.extracted-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.extracted-modal-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  overflow: auto;
}
.extracted-modal-close {
  position: absolute;
  top: 10px;
  right: 10px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  z-index: 10;
}
`;
    } else if (isDropdown) {
      // Get position from trigger element
      const behavior = behaviors.find(b => b.contentId === contentId);

      renderedContent.push(`
      {/* Extracted: ${data.label || contentId} */}
      {${stateName} && (
        <div
          className="extracted-dropdown"
          style={{
            position: 'absolute',
            ${data.bounds ? `left: ${Math.round(data.bounds.x)},\n            top: ${Math.round(data.bounds.y + data.bounds.height)},` : ''}
            zIndex: 1000
          }}
        >
          <div dangerouslySetInnerHTML={{ __html: \`${escapeTemplateString(cleanedHtml)}\` }} />
        </div>
      )}`);

      css += `
/* Dropdown: ${data.label || contentId} */
.extracted-dropdown {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  z-index: 1000;
}
`;
    } else {
      // Generic panel/popover
      renderedContent.push(`
      {/* Extracted: ${data.label || contentId} */}
      {${stateName} && (
        <div className="extracted-panel">
          <div dangerouslySetInnerHTML={{ __html: \`${escapeTemplateString(cleanedHtml)}\` }} />
        </div>
      )}`);
    }

    // Track trigger mapping
    triggerMappings.push({
      trigger: data.trigger,
      label: data.label,
      stateName,
      handler: `toggle${capitalize(stateName)}`
    });
  }

  // Add escape handler
  const escapeHandler = `
  // Close extracted content on Escape
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        ${stateNames.map(s => `set${capitalize(s)}(false);`).join('\n        ')}
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);`;

  return {
    stateNames,
    stateDeclarations: stateDeclarations.join('\n  '),
    handlers: handlers.join('\n  '),
    renderedContent: renderedContent.join('\n'),
    triggerMappings,
    escapeHandler,
    css
  };
}

function injectIntoApp(appCode, injection) {
  let modified = appCode;

  // 1. Add import for the CSS
  if (!modified.includes('ExtractedContent.css')) {
    modified = modified.replace(
      "import './Hybrid.css';",
      "import './Hybrid.css';\nimport './ExtractedContent.css';"
    );
  }

  // 2. Find the state section and add new state declarations
  // Look for existing useState declarations
  const stateMarker = '// UI State';
  if (modified.includes(stateMarker)) {
    modified = modified.replace(
      stateMarker,
      `${stateMarker}\n  // Extracted content state\n  ${injection.stateDeclarations}\n`
    );
  } else {
    // Find first useState and add before it
    const firstUseState = modified.indexOf('const [');
    if (firstUseState > -1) {
      modified = modified.slice(0, firstUseState) +
        `// Extracted content state\n  ${injection.stateDeclarations}\n\n  ` +
        modified.slice(firstUseState);
    }
  }

  // 3. Add handlers after state declarations
  const handlersMarker = '// Action handlers';
  if (modified.includes(handlersMarker)) {
    modified = modified.replace(
      handlersMarker,
      `// Extracted content handlers\n  ${injection.handlers}\n\n  ${handlersMarker}`
    );
  }

  // 4. Add escape handler in useEffect section
  // Find the closing of the component function and add before it
  const returnIndex = modified.lastIndexOf('return (');
  if (returnIndex > -1) {
    modified = modified.slice(0, returnIndex) +
      `${injection.escapeHandler}\n\n  ` +
      modified.slice(returnIndex);
  }

  // 5. Add rendered content before the closing </div> of app-container
  const closingDiv = modified.lastIndexOf('</div>\n  );');
  if (closingDiv > -1) {
    modified = modified.slice(0, closingDiv) +
      `\n      {/* EXTRACTED CONTENT */}${injection.renderedContent}\n    ` +
      modified.slice(closingDiv);
  }

  // 6. Wire up trigger buttons
  for (const mapping of injection.triggerMappings) {
    // Try to find the button by its selector pattern and add onClick
    const triggerPatterns = [
      // Try to find by title
      `title="${mapping.label}"`,
      // Try to find by data-testid
      mapping.trigger.includes('data-testid') ? mapping.trigger : null,
    ].filter(Boolean);

    for (const pattern of triggerPatterns) {
      if (modified.includes(pattern)) {
        // Check if this element already has onClick
        const patternIndex = modified.indexOf(pattern);
        const elementStart = modified.lastIndexOf('<', patternIndex);
        const elementEnd = modified.indexOf('>', patternIndex);
        const elementStr = modified.slice(elementStart, elementEnd + 1);

        if (!elementStr.includes('onClick')) {
          // Add onClick handler
          modified = modified.replace(
            pattern,
            `${pattern} onClick={() => { ${mapping.handler}(); }}`
          );
          console.log(`   Wired: ${mapping.label || mapping.trigger} → ${mapping.handler}`);
        }
        break;
      }
    }
  }

  return modified;
}

function cleanHtmlForReact(html) {
  return html
    // Remove event handlers
    .replace(/\s*on\w+="[^"]*"/g, '')
    // Fix self-closing tags
    .replace(/<(img|input|br|hr)([^>]*)>/g, '<$1$2 />')
    // Escape problematic characters
    .replace(/<!--[\s\S]*?-->/g, '') // Remove comments
    .replace(/\\/g, '\\\\') // Escape backslashes
    .replace(/`/g, '\\`'); // Escape backticks
}

function escapeTemplateString(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\${/g, '\\${');
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Run
main().catch(console.error);
