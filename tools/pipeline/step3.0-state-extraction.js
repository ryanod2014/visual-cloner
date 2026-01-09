#!/usr/bin/env node
/**
 * Step 3.0: State Extraction
 *
 * Consolidates all discovered state into a unified state registry.
 * Also generates action handlers that map element interactions to state changes.
 *
 * Input:  elements-deep.json, behaviors.json, behaviors-deep.json
 * Output: state-registry.json, action-map.json
 */

import fs from 'fs';
import path from 'path';

const inputDir = process.argv[2] || './pipeline-output';

async function main() {
  console.log('='.repeat(60));
  console.log('Step 3.0: State Extraction');
  console.log('='.repeat(60));

  // Load all behavior data
  const behaviorsPath = path.join(inputDir, 'behaviors.json');
  const behaviorsDeepPath = path.join(inputDir, 'behaviors-deep.json');
  const elementsDeepPath = path.join(inputDir, 'elements-deep.json');

  if (!fs.existsSync(behaviorsPath)) {
    console.error(`ERROR: ${behaviorsPath} not found.`);
    process.exit(1);
  }

  const surfaceBehaviors = JSON.parse(fs.readFileSync(behaviorsPath, 'utf-8'));

  let deepBehaviors = { behaviors: [], stateRegistry: {} };
  if (fs.existsSync(behaviorsDeepPath)) {
    deepBehaviors = JSON.parse(fs.readFileSync(behaviorsDeepPath, 'utf-8'));
  } else {
    console.log('Note: behaviors-deep.json not found, using surface behaviors only');
  }

  let elementsDeep = { elements: [] };
  if (fs.existsSync(elementsDeepPath)) {
    elementsDeep = JSON.parse(fs.readFileSync(elementsDeepPath, 'utf-8'));
  }

  console.log(`Loaded ${surfaceBehaviors.behaviors.length} surface behaviors`);
  console.log(`Loaded ${deepBehaviors.behaviors.length} deep behaviors`);
  console.log(`Loaded ${elementsDeep.elements.length} total elements`);

  // Build unified state registry
  const stateRegistry = buildUnifiedStateRegistry(
    surfaceBehaviors.behaviors,
    deepBehaviors.behaviors,
    deepBehaviors.stateRegistry || {},
    elementsDeep.elements
  );

  // Build action map
  const actionMap = buildActionMap(
    surfaceBehaviors.behaviors,
    deepBehaviors.behaviors,
    elementsDeep.elements,
    stateRegistry
  );

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('State Registry:');
  for (const [name, config] of Object.entries(stateRegistry)) {
    console.log(`  ${name}:`);
    console.log(`    type: ${config.type}`);
    console.log(`    values: [${config.values.slice(0, 5).join(', ')}${config.values.length > 5 ? '...' : ''}]`);
    console.log(`    setBy: ${Object.keys(config.setBy).length} element(s)`);
  }

  console.log(`\nAction Map: ${Object.keys(actionMap).length} actions`);

  // Save state registry
  const registryOutput = {
    url: surfaceBehaviors.url,
    timestamp: new Date().toISOString(),
    stateVariables: Object.keys(stateRegistry).length,
    stateRegistry
  };

  const registryPath = path.join(inputDir, 'state-registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(registryOutput, null, 2));
  console.log(`\nSaved: ${registryPath}`);

  // Save action map
  const actionOutput = {
    url: surfaceBehaviors.url,
    timestamp: new Date().toISOString(),
    totalActions: Object.keys(actionMap).length,
    actionMap
  };

  const actionPath = path.join(inputDir, 'action-map.json');
  fs.writeFileSync(actionPath, JSON.stringify(actionOutput, null, 2));
  console.log(`Saved: ${actionPath}`);

  // Generate React state code
  const stateCode = generateStateCode(stateRegistry, actionMap);
  const statePath = path.join(inputDir, 'generated-state.js');
  fs.writeFileSync(statePath, stateCode);
  console.log(`Saved: ${statePath}`);

  console.log('\nStep 3.0 complete!');
}

function buildUnifiedStateRegistry(surfaceBehaviors, deepBehaviors, existingRegistry, elements) {
  const registry = { ...existingRegistry };

  // Add activeTool state from tool selections
  const toolSelections = [
    ...surfaceBehaviors.filter(b => b.type === 'selects_tool'),
    ...deepBehaviors.filter(b => b.effect?.type === 'selects_tool')
  ];

  if (toolSelections.length > 0 && !registry.activeTool) {
    registry.activeTool = {
      type: 'enum',
      values: [],
      setBy: {},
      default: null
    };
  }

  for (const behavior of toolSelections) {
    const toolId = behavior.toolId ||
                   behavior.effect?.stateChanges?.activeTool ||
                   behavior.label;

    if (toolId && registry.activeTool) {
      if (!registry.activeTool.values.includes(toolId)) {
        registry.activeTool.values.push(toolId);
      }

      if (!registry.activeTool.setBy[toolId]) {
        registry.activeTool.setBy[toolId] = [];
      }

      registry.activeTool.setBy[toolId].push({
        elementIndex: behavior.elementIndex,
        testId: behavior.identifiers?.testId || behavior.testId,
        label: behavior.label,
        location: behavior.parentUI || 'surface'
      });

      // First tool is default
      if (!registry.activeTool.default) {
        registry.activeTool.default = toolId;
      }
    }
  }

  // Find any toggle states from CSS class changes
  const toggleBehaviors = [
    ...surfaceBehaviors.filter(b => b.type === 'toggles_state'),
    ...deepBehaviors.filter(b => b.effect?.type === 'toggles_theme')
  ];

  for (const behavior of toggleBehaviors) {
    const stateName = behavior.stateChange || 'themeMode';
    if (!registry[stateName]) {
      registry[stateName] = {
        type: 'toggle',
        values: ['on', 'off'],
        setBy: {},
        default: 'off'
      };
    }
  }

  // Infer state from element identifiers
  for (const element of elements) {
    const testId = element.identifiers?.testId || '';

    // Stroke width buttons
    if (testId.includes('stroke') || testId.includes('width')) {
      if (!registry.strokeWidth) {
        registry.strokeWidth = {
          type: 'enum',
          values: [],
          setBy: {},
          default: 'thin'
        };
      }
      const value = testId.replace('toolbar-', '').replace('-width', '');
      if (!registry.strokeWidth.values.includes(value)) {
        registry.strokeWidth.values.push(value);
      }
    }

    // Fill style buttons
    if (testId.includes('fill')) {
      if (!registry.fillStyle) {
        registry.fillStyle = {
          type: 'enum',
          values: [],
          setBy: {},
          default: 'solid'
        };
      }
    }
  }

  return registry;
}

function buildActionMap(surfaceBehaviors, deepBehaviors, elements, stateRegistry) {
  const actionMap = {};

  // Map surface element actions
  for (const behavior of surfaceBehaviors) {
    const actionId = behavior.selector ||
                     behavior.identifiers?.testId ||
                     `el-${behavior.elementIndex}`;

    actionMap[actionId] = {
      elementIndex: behavior.elementIndex,
      type: behavior.type,
      location: 'surface',
      stateChanges: {},
      sideEffects: []
    };

    if (behavior.type === 'selects_tool') {
      actionMap[actionId].stateChanges.activeTool = behavior.toolId || behavior.label;
    }

    if (behavior.type === 'opens_dropdown' || behavior.type === 'opens_modal') {
      actionMap[actionId].sideEffects.push({
        action: 'show_ui',
        target: `${behavior.type.replace('opens_', '')}-${behavior.elementIndex}`
      });
    }
  }

  // Map deep element actions
  for (const behavior of deepBehaviors) {
    const actionId = behavior.testId || `el-${behavior.elementIndex}`;

    actionMap[actionId] = {
      elementIndex: behavior.elementIndex,
      type: behavior.effect?.type || 'unknown',
      location: behavior.parentUI,
      stateChanges: behavior.effect?.stateChanges || {},
      sideEffects: []
    };

    // Add close parent UI as side effect
    if (behavior.parentUI) {
      actionMap[actionId].sideEffects.push({
        action: 'close_ui',
        target: behavior.parentUI
      });
    }

    // Add UI changes
    if (behavior.effect?.uiChanges) {
      for (const change of behavior.effect.uiChanges) {
        actionMap[actionId].sideEffects.push(change);
      }
    }
  }

  return actionMap;
}

function generateStateCode(stateRegistry, actionMap) {
  const lines = [];

  lines.push('// Generated State Management');
  lines.push('// Auto-generated by Step 3.0: State Extraction');
  lines.push('');
  lines.push("import { useState, useCallback } from 'react';");
  lines.push('');

  // Generate hook
  lines.push('export function useExtractedState() {');

  // State declarations
  for (const [name, config] of Object.entries(stateRegistry)) {
    const defaultValue = config.default !== undefined ?
      (typeof config.default === 'string' ? `'${config.default}'` : config.default) :
      (config.type === 'toggle' ? 'false' : 'null');
    lines.push(`  const [${name}, set${capitalize(name)}] = useState(${defaultValue});`);
  }

  lines.push('');

  // Action handler
  lines.push('  const handleAction = useCallback((actionId) => {');
  lines.push('    const actionMap = ' + JSON.stringify(actionMap, null, 4).replace(/\n/g, '\n    ') + ';');
  lines.push('');
  lines.push('    const action = actionMap[actionId];');
  lines.push('    if (!action) {');
  lines.push("      console.log('Unknown action:', actionId);");
  lines.push('      return false;');
  lines.push('    }');
  lines.push('');
  lines.push('    // Apply state changes');
  lines.push('    if (action.stateChanges) {');

  for (const name of Object.keys(stateRegistry)) {
    lines.push(`      if (action.stateChanges.${name} !== undefined) {`);
    lines.push(`        set${capitalize(name)}(action.stateChanges.${name});`);
    lines.push('      }');
  }

  lines.push('    }');
  lines.push('');
  lines.push("    console.log('Action executed:', actionId, action);");
  lines.push('    return { action, sideEffects: action.sideEffects };');
  lines.push('  }, []);');

  lines.push('');

  // Return state and handler
  lines.push('  return {');
  for (const name of Object.keys(stateRegistry)) {
    lines.push(`    ${name},`);
    lines.push(`    set${capitalize(name)},`);
  }
  lines.push('    handleAction,');
  lines.push('  };');
  lines.push('}');

  lines.push('');

  // Export state variable names for reference
  lines.push('export const STATE_VARIABLES = ' + JSON.stringify(Object.keys(stateRegistry)) + ';');
  lines.push('');

  // Export action IDs
  lines.push('export const ACTION_IDS = ' + JSON.stringify(Object.keys(actionMap)) + ';');

  return lines.join('\n');
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

main();
