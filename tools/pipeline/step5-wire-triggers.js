#!/usr/bin/env node
/**
 * Step 5: Wire Triggers
 *
 * Connects triggers in the clone to show generated components.
 *
 * Input:  components-manifest.json, clone's App.jsx
 * Output: Updated App.jsx with wiring
 */

import fs from 'fs';
import path from 'path';

const inputDir = process.argv[2] || './pipeline-output';
const appJsxPath = process.argv[3];

async function main() {
  console.log('='.repeat(60));
  console.log('Step 5: Wire Triggers');
  console.log('='.repeat(60));

  if (!appJsxPath) {
    console.error('Usage: node step5-wire-triggers.js <pipeline-dir> <app-jsx-path>');
    process.exit(1);
  }

  // Load components manifest
  const manifestPath = path.join(inputDir, 'components-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`ERROR: ${manifestPath} not found. Run Step 4 first.`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  console.log(`Found ${manifest.componentCount} components to wire`);

  if (manifest.componentCount === 0) {
    console.log('No components to wire. Step 5 complete!');
    return;
  }

  // Load App.jsx
  if (!fs.existsSync(appJsxPath)) {
    console.error(`ERROR: ${appJsxPath} not found`);
    process.exit(1);
  }

  let appCode = fs.readFileSync(appJsxPath, 'utf-8');
  console.log(`Loaded: ${appJsxPath}`);

  // Load the clone's CSS to find element positions
  const cssPath = appJsxPath.replace('App.jsx', 'Hybrid.css');
  let cssCode = '';
  if (fs.existsSync(cssPath)) {
    cssCode = fs.readFileSync(cssPath, 'utf-8');
  }

  // Parse element positions from CSS
  const elementPositions = parseElementPositions(cssCode);
  console.log(`Parsed ${Object.keys(elementPositions).length} element positions from CSS`);

  // Match components to clone elements
  const matches = [];
  for (const comp of manifest.components) {
    if (!comp.triggerCenter) continue;

    const match = findMatchingElement(comp.triggerCenter, elementPositions);
    if (match) {
      matches.push({
        ...comp,
        cloneElement: match.element,
        distance: match.distance
      });
      console.log(`  ${comp.label} → ${match.element} (dist: ${match.distance}px)`);
    } else {
      console.log(`  ${comp.label} → no match found`);
    }
  }

  console.log(`\nMatched ${matches.length}/${manifest.components.length} components`);

  if (matches.length === 0) {
    console.log('No matches to wire. Step 5 complete!');
    return;
  }

  // Generate wiring code
  const wiring = generateWiring(matches, inputDir);

  // Backup original
  const backupPath = appJsxPath.replace('.jsx', '.pre-wiring.jsx');
  fs.writeFileSync(backupPath, appCode);
  console.log(`\nBacked up to: ${backupPath}`);

  // Apply wiring to App.jsx
  appCode = applyWiring(appCode, wiring, matches);

  // Save updated App.jsx
  fs.writeFileSync(appJsxPath, appCode);
  console.log(`Updated: ${appJsxPath}`);

  // Copy components to src directory
  const srcComponentsDir = path.join(path.dirname(appJsxPath), 'extracted-components');
  fs.mkdirSync(srcComponentsDir, { recursive: true });

  const pipelineComponentsDir = path.join(inputDir, 'components');
  const componentFiles = fs.readdirSync(pipelineComponentsDir);
  for (const file of componentFiles) {
    fs.copyFileSync(
      path.join(pipelineComponentsDir, file),
      path.join(srcComponentsDir, file)
    );
  }
  console.log(`Copied ${componentFiles.length} component files to src/extracted-components/`);

  console.log('\nStep 5 complete!');
  console.log('\nNext: Run `npm run dev` to test the wired components');
}

function parseElementPositions(css) {
  const positions = {};

  // Match CSS rules like .el-123 { position: absolute; left: 100px; top: 200px; }
  const regex = /\.(el-\d+)\s*\{([^}]+)\}/g;
  let match;

  while ((match = regex.exec(css)) !== null) {
    const className = match[1];
    const rules = match[2];

    const leftMatch = rules.match(/left:\s*(-?\d+(?:\.\d+)?)/);
    const topMatch = rules.match(/top:\s*(-?\d+(?:\.\d+)?)/);
    const widthMatch = rules.match(/width:\s*(\d+(?:\.\d+)?)/);
    const heightMatch = rules.match(/height:\s*(\d+(?:\.\d+)?)/);

    if (leftMatch && topMatch) {
      const left = parseFloat(leftMatch[1]);
      const top = parseFloat(topMatch[1]);
      const width = widthMatch ? parseFloat(widthMatch[1]) : 40;
      const height = heightMatch ? parseFloat(heightMatch[1]) : 40;

      positions[className] = {
        x: left,
        y: top,
        width,
        height,
        center: {
          x: left + width / 2,
          y: top + height / 2
        }
      };
    }
  }

  return positions;
}

function findMatchingElement(targetCenter, elementPositions, threshold = 50) {
  let bestMatch = null;
  let bestDistance = Infinity;

  for (const [element, pos] of Object.entries(elementPositions)) {
    const dx = pos.center.x - targetCenter.x;
    const dy = pos.center.y - targetCenter.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < bestDistance && distance < threshold) {
      bestDistance = distance;
      bestMatch = { element, distance: Math.round(distance) };
    }
  }

  return bestMatch;
}

function generateWiring(matches, inputDir) {
  // Load action map from Step 3.0 (comprehensive action->effect mapping)
  const actionMapPath = path.join(inputDir, 'action-map.json');
  let fullActionMap = {};

  if (fs.existsSync(actionMapPath)) {
    const { actionMap } = JSON.parse(fs.readFileSync(actionMapPath, 'utf-8'));
    fullActionMap = actionMap;
    console.log(`Loaded ${Object.keys(actionMap).length} actions from action-map.json`);
  }

  // Load state registry from Step 3.0
  const stateRegistryPath = path.join(inputDir, 'state-registry.json');
  let stateRegistry = {};

  if (fs.existsSync(stateRegistryPath)) {
    const { stateRegistry: sr } = JSON.parse(fs.readFileSync(stateRegistryPath, 'utf-8'));
    stateRegistry = sr;
    console.log(`Loaded ${Object.keys(sr).length} state variables from state-registry.json`);
  }

  // Also load elements for element class mapping
  const elementsPath = path.join(inputDir, 'elements.json');
  let elementClassMap = {};

  if (fs.existsSync(elementsPath)) {
    const { elements } = JSON.parse(fs.readFileSync(elementsPath, 'utf-8'));
    for (const el of elements) {
      const testId = el.identifiers.testId;
      const ariaLabel = el.identifiers.ariaLabel;
      const className = `el-${el.index}`;

      if (testId) elementClassMap[testId] = className;
      if (ariaLabel) {
        const normalized = ariaLabel.toLowerCase().replace(/[^a-z0-9]/g, '-');
        elementClassMap[normalized] = className;
      }
    }
  }

  // Load deep elements if available
  const elementsDeepPath = path.join(inputDir, 'elements-deep.json');
  if (fs.existsSync(elementsDeepPath)) {
    const { elements } = JSON.parse(fs.readFileSync(elementsDeepPath, 'utf-8'));
    for (const el of elements) {
      if (el.identifiers?.testId) {
        // Map deep element testIds to their action definitions
        elementClassMap[el.identifiers.testId] = `el-${el.index}`;
      }
    }
  }

  // Generate imports
  const imports = matches.map(m =>
    `import ${m.componentName} from './extracted-components/${m.componentName}';`
  ).join('\n');

  // Generate state declarations - include position tracking for dropdowns
  const componentStates = matches.map(m => {
    if (m.type === 'dropdown') {
      return `const [show${m.componentName}, setShow${m.componentName}] = useState(false);
  const [pos${m.componentName}, setPos${m.componentName}] = useState({ x: 0, y: 0 });`;
    }
    return `const [show${m.componentName}, setShow${m.componentName}] = useState(false);`;
  }).join('\n  ');

  // Generate extracted state variables from state registry
  const extractedStates = Object.entries(stateRegistry).map(([name, config]) => {
    const defaultValue = config.default !== undefined
      ? (typeof config.default === 'string' ? `'${config.default}'` : JSON.stringify(config.default))
      : 'null';
    return `const [extracted${capitalize(name)}, setExtracted${capitalize(name)}] = useState(${defaultValue});`;
  }).join('\n  ');

  // Combine all states
  const states = componentStates + (extractedStates ? `\n\n  // Extracted app state\n  ${extractedStates}` : '');

  // Generate toggle functions that capture position
  const togglers = matches.filter(m => m.type === 'dropdown').map(m => {
    return `const toggle${m.componentName} = (e) => {
    if (e?.currentTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      setPos${m.componentName}({ x: rect.left, y: rect.bottom + 5 });
    }
    setShow${m.componentName}(prev => !prev);
  };`;
  }).join('\n  ');

  // Generate action handler function using full action map from Step 3.0
  const fullActionMapJson = JSON.stringify(fullActionMap, null, 4).replace(/\n/g, '\n    ');
  const elementClassMapJson = JSON.stringify(elementClassMap, null, 4).replace(/\n/g, '\n    ');

  const actionHandler = `const handleExtractedAction = (actionId, setters = {}) => {
    // Full action map from Step 3.0 - includes state changes and side effects
    const actionMap = ${fullActionMapJson};

    // Element class mappings
    const elementClassMap = ${elementClassMapJson};

    // Find the action definition
    const action = actionMap[actionId];

    if (action) {
      console.log('Executing action:', actionId, action);

      // Apply state changes
      if (action.stateChanges) {
        for (const [key, value] of Object.entries(action.stateChanges)) {
          // Setter is named setExtracted{Key} to avoid conflicts with clone's existing state
          const setterName = 'setExtracted' + key.charAt(0).toUpperCase() + key.slice(1);
          if (setters[setterName]) {
            setters[setterName](value);
            console.log('  State change:', key, '→', value);

            // Show visual feedback for state change
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:#4CAF50;color:#fff;padding:12px 24px;border-radius:8px;z-index:9999;font-size:14px;';
            toast.textContent = key + ' = ' + value;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 1500);
          } else {
            console.log('  No setter found for:', setterName);
          }
        }
      }

      // Handle side effects
      if (action.sideEffects) {
        for (const effect of action.sideEffects) {
          if (effect.action === 'close_ui') {
            console.log('  Side effect: close', effect.target);
            // UI closing is handled by the component's onItemClick
          } else if (effect.action === 'show_ui') {
            console.log('  Side effect: show', effect.target);
          }
        }
      }

      return { success: true, action };
    }

    // Fallback: try to find and click a matching element
    let targetClass = elementClassMap[actionId];
    if (!targetClass) {
      const normalized = actionId.toLowerCase().replace(/[^a-z0-9]/g, '-');
      targetClass = elementClassMap[normalized];
    }

    if (targetClass) {
      const el = document.querySelector('.' + targetClass);
      if (el) {
        el.click();
        console.log('Fallback click:', actionId, '→', targetClass);
        return { success: true, fallback: true };
      }
    }

    // Show visual feedback for unmapped actions
    console.log('Unmapped action:', actionId);
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:12px 24px;border-radius:8px;z-index:9999;font-size:14px;';
    toast.textContent = 'Action: ' + actionId + ' (not mapped)';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);

    return { success: false };
  };`;

  // Generate setters object for action handler
  const settersList = Object.keys(stateRegistry).map(name =>
    `setExtracted${capitalize(name)}`
  );
  const settersObject = settersList.length > 0
    ? `{ ${settersList.join(', ')} }`
    : '{}';

  // Generate component renders with action handler
  const renders = matches.map(m => {
    if (m.type === 'dropdown') {
      return `      <${m.componentName}
        isOpen={show${m.componentName}}
        onClose={() => setShow${m.componentName}(false)}
        onItemClick={(action) => {
          handleExtractedAction(action, ${settersObject});
          setShow${m.componentName}(false);
        }}
        position={pos${m.componentName}}
      />`;
    } else {
      return `      <${m.componentName}
        isOpen={show${m.componentName}}
        onClose={() => setShow${m.componentName}(false)}
        onAction={(action) => { handleExtractedAction(action, ${settersObject}); }}
      />`;
    }
  }).join('\n');

  // Load visual feedback map if available
  const visualFeedbackPath = path.join(inputDir, 'visual-feedback-map.json');
  let visualFeedbackMap = {};

  if (fs.existsSync(visualFeedbackPath)) {
    const vfData = JSON.parse(fs.readFileSync(visualFeedbackPath, 'utf-8'));
    visualFeedbackMap = vfData.visualFeedbackMap || {};
    console.log(`Loaded visual feedback for ${Object.keys(visualFeedbackMap).length} tools`);
  }

  // Generate useEffect for visual feedback based on state changes
  const visualFeedbackEffect = generateVisualFeedbackEffect(visualFeedbackMap, elementClassMap);

  return { imports, states, togglers, actionHandler, renders, stateRegistry, visualFeedbackEffect };
}

function generateVisualFeedbackEffect(visualFeedbackMap, elementClassMap) {
  // Build a mapping from tool/state value to which clone elements should get .selected
  const toolToCloneElementMap = {};

  // FIRST: Map tool testIds to their own clone elements
  // When activeTool = 'toolbar-rectangle', the element WITH testId 'toolbar-rectangle' should be selected
  for (const toolId of Object.keys(visualFeedbackMap)) {
    const cloneClass = elementClassMap[toolId];
    if (cloneClass) {
      if (!toolToCloneElementMap[toolId]) {
        toolToCloneElementMap[toolId] = [];
      }
      toolToCloneElementMap[toolId].push(cloneClass);
    }
  }

  // ALSO: Map any additional elements that gained .selected
  for (const [toolId, data] of Object.entries(visualFeedbackMap)) {
    if (data.visualChanges?.elementsGainedSelected) {
      for (const el of data.visualChanges.elementsGainedSelected) {
        // Try to find this element in our clone's element map
        const cloneClass = elementClassMap[el.testId] ||
                          elementClassMap[el.ariaLabel?.toLowerCase().replace(/[^a-z0-9]/g, '-')];

        if (cloneClass && !toolToCloneElementMap[toolId]?.includes(cloneClass)) {
          if (!toolToCloneElementMap[toolId]) {
            toolToCloneElementMap[toolId] = [];
          }
          toolToCloneElementMap[toolId].push(cloneClass);
        }
      }
    }
  }

  if (Object.keys(toolToCloneElementMap).length === 0) {
    return ''; // No visual feedback to wire
  }

  const mapJson = JSON.stringify(toolToCloneElementMap, null, 4).replace(/\n/g, '\n    ');

  // Build tool ID to simple name mapping for syncing with any existing selectedTool state
  const toolIdToSimpleName = {};
  for (const toolId of Object.keys(toolToCloneElementMap)) {
    // Convert 'toolbar-rectangle' -> 'rectangle', 'toolbar-freedraw' -> 'draw'
    const simpleName = toolId
      .replace('toolbar-', '')
      .replace('freedraw', 'draw');
    toolIdToSimpleName[toolId] = simpleName;
  }
  const syncMapJson = JSON.stringify(toolIdToSimpleName, null, 4).replace(/\n/g, '\n    ');

  return `// Sync extractedActiveTool with selectedTool for canvas behavior
  // Maps 'toolbar-rectangle' -> 'rectangle', 'toolbar-freedraw' -> 'draw', etc.
  useEffect(() => {
    const toolMap = ${syncMapJson};
    const mappedTool = toolMap[extractedActiveTool] || 'selection';
    setSelectedTool(mappedTool);
  }, [extractedActiveTool]);

  // Visual feedback effect - applies .selected class based on active tool
  useEffect(() => {
    const toolToElementMap = ${mapJson};

    // Remove .selected from all tool-related elements
    const allToolElements = new Set(Object.values(toolToElementMap).flat());
    allToolElements.forEach(cls => {
      const el = document.querySelector('.' + cls);
      if (el) el.classList.remove('selected', 'active');
    });

    // Add .selected to elements for current tool
    const elementsToSelect = toolToElementMap[extractedActiveTool] || [];
    elementsToSelect.forEach(cls => {
      const el = document.querySelector('.' + cls);
      if (el) el.classList.add('selected');
    });
  }, [extractedActiveTool]);`;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function applyWiring(code, wiring, matches) {
  // Add imports after last import statement
  const lastImportMatch = code.match(/^import .+$/gm);
  if (lastImportMatch) {
    const lastImport = lastImportMatch[lastImportMatch.length - 1];
    const cssImport = `import './extracted-components/ExtractedComponents.css';`;
    code = code.replace(lastImport, `${lastImport}\n\n// Extracted components\n${wiring.imports}\n${cssImport}`);
  }

  // Add useEffect import if visual feedback is needed
  if (wiring.visualFeedbackEffect) {
    // Check if useEffect is already imported
    if (!code.includes('useEffect')) {
      code = code.replace(
        /import \{ useState \} from 'react';/,
        "import { useState, useEffect } from 'react';"
      );
      // Also try the alternative import format
      code = code.replace(
        /import React, \{ useState \} from 'react';/,
        "import React, { useState, useEffect } from 'react';"
      );
    }
  }

  // Add state after first useState
  const useStateMatch = code.match(/const \[.+\] = useState\(.+\);/);
  if (useStateMatch) {
    let stateInsertion = `${useStateMatch[0]}\n\n  // Extracted component state\n  ${wiring.states}`;
    if (wiring.togglers) {
      stateInsertion += `\n\n  // Extracted component togglers\n  ${wiring.togglers}`;
    }
    if (wiring.actionHandler) {
      stateInsertion += `\n\n  // Extracted action handler\n  ${wiring.actionHandler}`;
    }
    if (wiring.visualFeedbackEffect) {
      stateInsertion += `\n\n  ${wiring.visualFeedbackEffect}`;
    }
    code = code.replace(useStateMatch[0], stateInsertion);
  }

  // Add onClick handlers to matched elements
  for (const match of matches) {
    // Use toggle function for dropdowns (captures position), direct setState for modals
    let handler;
    if (match.type === 'dropdown') {
      handler = `onClick={(e) => toggle${match.componentName}(e)}`;
    } else {
      handler = `onClick={() => setShow${match.componentName}(!show${match.componentName})}`;
    }

    // First, try to replace existing onClick handlers on this element
    const existingOnClickPattern = new RegExp(
      `(<(?:button|div)[^>]*className="${match.cloneElement}"[^>]*?)\\s*onClick=\\{[^}]+\\}([^>]*?)(/?>)`,
      'g'
    );

    let replaced = false;
    code = code.replace(existingOnClickPattern, (fullMatch, before, after, closing) => {
      replaced = true;
      return `${before} ${handler}${after}${closing}`;
    });

    // If no existing onClick was replaced, add new handler
    if (!replaced) {
      // Try self-closing tags first: <button className="el-123" />
      const selfClosingPattern = new RegExp(
        `(<(?:button|div)[^>]*className="${match.cloneElement}"[^>]*)\\s*/>`,
        'g'
      );
      code = code.replace(selfClosingPattern, (fullMatch, before) => {
        replaced = true;
        return `${before} ${handler} />`;
      });
    }

    // Also try non-self-closing tags: <button className="el-123">
    if (!replaced) {
      const openTagPattern = new RegExp(
        `(<(?:button|div)[^>]*className="${match.cloneElement}"[^>]*)>`,
        'g'
      );
      code = code.replace(openTagPattern, (fullMatch, before) => {
        // Don't add if already has onClick
        if (before.includes('onClick')) return fullMatch;
        return `${before} ${handler}>`;
      });
    }
  }

  // Add rendered components before closing div of app-container
  const closingPattern = /(\s*<\/div>\s*\);\s*})/;
  const closingMatch = code.match(closingPattern);
  if (closingMatch) {
    const insertion = `\n      {/* Extracted Components */}\n${wiring.renders}\n    `;
    code = code.replace(closingPattern, insertion + closingMatch[1]);
  }

  return code;
}

main();
