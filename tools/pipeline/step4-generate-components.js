#!/usr/bin/env node
/**
 * Step 4: Generate Components
 *
 * Creates React components from extracted UI content.
 *
 * Input:  content/*.json
 * Output: components/*.jsx
 */

import fs from 'fs';
import path from 'path';

const inputDir = process.argv[2] || './pipeline-output';

async function main() {
  console.log('='.repeat(60));
  console.log('Step 4: Generate Components');
  console.log('='.repeat(60));

  // Load content manifest
  const manifestPath = path.join(inputDir, 'content-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`ERROR: ${manifestPath} not found. Run Step 3 first.`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  console.log(`Found ${manifest.extractedCount} content files to process`);

  // Create components directory
  const componentsDir = path.join(inputDir, 'components');
  fs.mkdirSync(componentsDir, { recursive: true });

  const generatedComponents = [];

  for (const item of manifest.content) {
    const contentPath = path.join(inputDir, 'content', item.filename);
    const content = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));

    console.log(`\nGenerating: ${item.label} (${content.type})`);

    let componentCode;
    let componentName;

    if (content.type === 'dropdown') {
      componentName = `Dropdown${item.elementIndex}`;
      componentCode = generateDropdownComponent(componentName, content);
    } else if (content.type === 'modal') {
      componentName = `Modal${item.elementIndex}`;
      componentCode = generateModalComponent(componentName, content);
    }

    if (componentCode) {
      const filename = `${componentName}.jsx`;
      const filepath = path.join(componentsDir, filename);
      fs.writeFileSync(filepath, componentCode);
      console.log(`  Saved: ${filename}`);

      generatedComponents.push({
        elementIndex: item.elementIndex,
        label: item.label,
        type: content.type,
        componentName,
        filename,
        triggerSelector: content.triggeredBy?.selector,
        triggerCenter: content.triggeredBy?.center
      });
    }
  }

  // Generate index file that exports all components
  const indexCode = generateIndexFile(generatedComponents);
  fs.writeFileSync(path.join(componentsDir, 'index.js'), indexCode);
  console.log('\nSaved: index.js');

  // Generate CSS file for all components
  const cssCode = generateComponentsCSS();
  fs.writeFileSync(path.join(componentsDir, 'ExtractedComponents.css'), cssCode);
  console.log('Saved: ExtractedComponents.css');

  // Save components manifest
  const componentsManifest = {
    timestamp: new Date().toISOString(),
    componentCount: generatedComponents.length,
    components: generatedComponents
  };
  fs.writeFileSync(
    path.join(inputDir, 'components-manifest.json'),
    JSON.stringify(componentsManifest, null, 2)
  );
  console.log('Saved: components-manifest.json');

  console.log('\nStep 4 complete!');
}

function generateDropdownComponent(name, content) {
  const items = content.items || [];

  // Generate item JSX
  const itemsJsx = items.map((item, i) => {
    const iconJsx = item.icon
      ? `<span className="dropdown-item-icon" dangerouslySetInnerHTML={{ __html: \`${escapeForJsx(item.icon)}\` }} />`
      : '';

    const shortcutJsx = item.shortcut
      ? `<span className="dropdown-item-shortcut">${escapeForJsx(item.shortcut)}</span>`
      : '';

    if (item.isLink && item.href) {
      return `      <a
        key={${i}}
        href="${escapeForJsx(item.href)}"
        className="dropdown-item"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${iconJsx}
        <span className="dropdown-item-label">${escapeForJsx(item.label)}</span>
        ${shortcutJsx}
      </a>`;
    }

    return `      <button
        key={${i}}
        className="dropdown-item"
        onClick={() => onItemClick?.('${escapeForJsx(item.testId || item.label)}')}
      >
        ${iconJsx}
        <span className="dropdown-item-label">${escapeForJsx(item.label)}</span>
        ${shortcutJsx}
      </button>`;
  }).join('\n');

  return `import React from 'react';

/**
 * ${name}
 * Triggered by: ${content.triggeredBy?.label || 'unknown'}
 * Items: ${items.length}
 */
export default function ${name}({ isOpen, onClose, onItemClick, position }) {
  if (!isOpen) return null;

  return (
    <div
      className="extracted-dropdown-overlay"
      onClick={onClose}
    >
      <div
        className="extracted-dropdown"
        style={{
          position: 'absolute',
          left: position?.x || ${content.bounds?.x || 0},
          top: position?.y || ${content.bounds?.y || 0}
        }}
        onClick={(e) => e.stopPropagation()}
      >
${itemsJsx}
      </div>
    </div>
  );
}
`;
}

function generateModalComponent(name, content) {
  const { title, sections, buttons, links } = content;

  // Generate sections JSX
  const sectionsJsx = (sections || []).filter(s => s.header || s.description).map((section, i) => {
    return `        <div key={${i}} className="modal-section">
          ${section.header ? `<h3 className="modal-section-header">${escapeForJsx(section.header)}</h3>` : ''}
          ${section.description ? `<p className="modal-section-description">${escapeForJsx(section.description)}</p>` : ''}
        </div>`;
  }).join('\n');

  // Generate buttons JSX
  const buttonsJsx = (buttons || []).map((btn, i) => {
    const iconJsx = btn.icon
      ? `<span className="button-icon" dangerouslySetInnerHTML={{ __html: \`${escapeForJsx(btn.icon)}\` }} />`
      : '';

    return `        <button
          key={${i}}
          className="modal-button${btn.isPrimary ? ' modal-button-primary' : ''}"
          onClick={() => onAction?.('${escapeForJsx(btn.testId || btn.label)}')}
        >
          ${iconJsx}
          ${escapeForJsx(btn.label)}
        </button>`;
  }).join('\n');

  // Generate links JSX
  const linksJsx = (links || []).filter(l => l.label && l.href).map((link, i) => {
    return `        <a
          key={${i}}
          href="${escapeForJsx(link.href)}"
          className="modal-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          ${escapeForJsx(link.label)}
        </a>`;
  }).join('\n');

  return `import React from 'react';

/**
 * ${name}
 * Title: ${title || 'Untitled'}
 * Triggered by: ${content.triggeredBy?.label || 'unknown'}
 */
export default function ${name}({ isOpen, onClose, onAction }) {
  if (!isOpen) return null;

  return (
    <div className="extracted-modal-overlay" onClick={onClose}>
      <div className="extracted-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>&times;</button>
        ${title ? `<h2 className="modal-title">${escapeForJsx(title)}</h2>` : ''}
        <div className="modal-content">
${sectionsJsx}
        </div>
        <div className="modal-buttons">
${buttonsJsx}
        </div>
        ${linksJsx ? `<div className="modal-links">\n${linksJsx}\n        </div>` : ''}
      </div>
    </div>
  );
}
`;
}

function generateIndexFile(components) {
  const imports = components.map(c =>
    `import ${c.componentName} from './${c.componentName}';`
  ).join('\n');

  const exports = components.map(c => c.componentName).join(',\n  ');

  const mapping = components.map(c =>
    `  { elementIndex: ${c.elementIndex}, label: '${escapeForJsx(c.label)}', component: ${c.componentName}, type: '${c.type}', triggerCenter: ${JSON.stringify(c.triggerCenter)} }`
  ).join(',\n');

  return `${imports}
import './ExtractedComponents.css';

export {
  ${exports}
};

export const componentMapping = [
${mapping}
];

export default componentMapping;
`;
}

function generateComponentsCSS() {
  return `/* Extracted Components Styles */

/* Dropdown overlay */
.extracted-dropdown-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
}

/* Dropdown container */
.extracted-dropdown {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  padding: 8px;
  min-width: 200px;
  z-index: 1001;
}

/* Dropdown item */
.dropdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  border-radius: 6px;
  font-size: 14px;
  color: #1e1e1e;
  cursor: pointer;
  text-decoration: none;
  text-align: left;
}

.dropdown-item:hover {
  background: #f0f0f0;
}

.dropdown-item-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dropdown-item-icon svg {
  width: 20px;
  height: 20px;
}

.dropdown-item-label {
  flex: 1;
}

.dropdown-item-shortcut {
  color: #888;
  font-size: 12px;
  margin-left: auto;
}

/* Modal overlay */
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

/* Modal container */
.extracted-modal {
  background: white;
  border-radius: 12px;
  padding: 24px;
  max-width: 500px;
  max-height: 80vh;
  overflow: auto;
  position: relative;
}

.modal-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
}

.modal-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px 0;
}

.modal-content {
  margin-bottom: 20px;
}

.modal-section {
  margin-bottom: 16px;
}

.modal-section-header {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.modal-section-description {
  color: #666;
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
}

.modal-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.modal-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: white;
  font-size: 14px;
  cursor: pointer;
}

.modal-button:hover {
  background: #f5f5f5;
}

.modal-button-primary {
  background: #6965db;
  color: white;
  border-color: #6965db;
}

.modal-button-primary:hover {
  background: #5753c9;
}

.button-icon svg {
  width: 16px;
  height: 16px;
}

.modal-links {
  margin-top: 16px;
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.modal-link {
  color: #6965db;
  font-size: 14px;
  text-decoration: none;
}

.modal-link:hover {
  text-decoration: underline;
}
`;
}

function escapeForJsx(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/'/g, "\\'")
    .replace(/\n/g, ' ');
}

main();
