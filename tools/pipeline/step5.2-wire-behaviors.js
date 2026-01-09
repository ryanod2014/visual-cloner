#!/usr/bin/env node
/**
 * Step 5.2: Wire Behaviors
 *
 * Integrates the generated behavior code into App.jsx.
 * - Imports the behavior registry
 * - Wires mouse handlers on canvas based on activeTool
 * - Handles cleanup when tool changes
 *
 * Input:  generated-behaviors.js, App.jsx
 * Output: Updated App.jsx with behavior wiring
 */

import fs from 'fs';
import path from 'path';

const inputDir = process.argv[2] || './pipeline-output';
const appJsxPath = process.argv[3];

if (!appJsxPath) {
  console.log('Usage: node step5.2-wire-behaviors.js <pipeline-dir> <app-jsx-path>');
  process.exit(1);
}

async function main() {
  console.log('='.repeat(60));
  console.log('Step 5.2: Wire Behaviors');
  console.log('='.repeat(60));

  // Check for generated behaviors
  const behaviorsPath = path.join(inputDir, 'generated-behaviors.js');
  if (!fs.existsSync(behaviorsPath)) {
    console.error(`ERROR: ${behaviorsPath} not found. Run step 5.1 first.`);
    process.exit(1);
  }

  // Check for App.jsx
  if (!fs.existsSync(appJsxPath)) {
    console.error(`ERROR: ${appJsxPath} not found.`);
    process.exit(1);
  }

  let appCode = fs.readFileSync(appJsxPath, 'utf-8');
  const behaviorsCode = fs.readFileSync(behaviorsPath, 'utf-8');

  // Copy generated-behaviors.js to src directory
  const srcDir = path.dirname(appJsxPath);
  const targetBehaviorsPath = path.join(srcDir, 'generated-behaviors.js');
  fs.writeFileSync(targetBehaviorsPath, behaviorsCode);
  console.log(`Copied behaviors to: ${targetBehaviorsPath}`);

  // Check if behaviors already wired
  if (appCode.includes('behaviorRegistry')) {
    console.log('Behaviors already wired. Updating...');
    // Remove old behavior wiring for clean re-wire
    appCode = appCode.replace(/\/\/ BEGIN BEHAVIOR WIRING[\s\S]*?\/\/ END BEHAVIOR WIRING\n?/g, '');
  }

  // Add import for behavior registry
  if (!appCode.includes("from './generated-behaviors'")) {
    // Add import after the last import statement
    const lastImportMatch = appCode.match(/^import .+$/gm);
    if (lastImportMatch) {
      const lastImport = lastImportMatch[lastImportMatch.length - 1];
      appCode = appCode.replace(
        lastImport,
        `${lastImport}\nimport { behaviorRegistry } from './generated-behaviors';`
      );
    }
  }

  // Find the canvas element and add behavior handlers
  // We need to:
  // 1. Add a useEffect that watches activeTool and wires handlers
  // 2. Add refs for behavior state

  const behaviorWiringCode = `
  // BEGIN BEHAVIOR WIRING
  // Wire tool behaviors to canvas
  const currentBehavior = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Cleanup previous behavior
    if (currentBehavior.current?.cleanup) {
      currentBehavior.current.cleanup();
    }

    // Get new behavior
    const behavior = behaviorRegistry[extractedActiveTool];
    currentBehavior.current = behavior;

    if (!behavior) return;

    // Initialize if needed
    if (behavior.init) {
      behavior.init(canvas.parentElement);
    }

    // Create bound handlers
    const handleMouseMove = (e) => behavior.onMouseMove?.(canvas, e);
    const handleMouseDown = (e) => behavior.onMouseDown?.(canvas, e);
    const handleMouseUp = (e) => behavior.onMouseUp?.(canvas, e);
    const handleMouseLeave = (e) => behavior.onMouseLeave?.(canvas, e);

    // Add listeners
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [extractedActiveTool]);
  // END BEHAVIOR WIRING
`;

  // Find a good place to insert the behavior wiring
  // Look for the useEffect with extractedActiveTool (visual feedback effect)
  const visualFeedbackEffectMatch = appCode.match(/\/\/ Visual feedback effect[\s\S]*?\}, \[extractedActiveTool\]\);/);
  if (visualFeedbackEffectMatch) {
    // Insert after the visual feedback effect
    appCode = appCode.replace(
      visualFeedbackEffectMatch[0],
      visualFeedbackEffectMatch[0] + '\n' + behaviorWiringCode
    );
    console.log('Added behavior wiring after visual feedback effect');
  } else {
    // Fallback: insert before the return statement
    const returnMatch = appCode.match(/(\s+)(return \()/);
    if (returnMatch) {
      appCode = appCode.replace(returnMatch[0], behaviorWiringCode + returnMatch[0]);
      console.log('Added behavior wiring before return statement');
    }
  }

  // Make sure useRef is imported
  if (!appCode.includes('useRef')) {
    appCode = appCode.replace(
      /import \{ useState(.*?) \} from 'react'/,
      "import { useState$1, useRef } from 'react'"
    );
    // If useRef not added by the above, it might already have useRef or different import pattern
    if (!appCode.includes('useRef')) {
      appCode = appCode.replace(
        "import { useState, useEffect }",
        "import { useState, useEffect, useRef }"
      );
    }
  }

  // Write updated App.jsx
  fs.writeFileSync(appJsxPath, appCode);
  console.log(`Updated: ${appJsxPath}`);

  console.log('\n' + '='.repeat(60));
  console.log('Behavior wiring complete!');
  console.log('='.repeat(60));
  console.log('\nTools with behaviors:');

  // List behaviors from the registry
  const behaviorMatches = behaviorsCode.match(/export const (\w+)Behavior/g) || [];
  behaviorMatches.forEach(match => {
    const name = match.replace('export const ', '').replace('Behavior', '');
    console.log(`  - ${name}`);
  });

  console.log('\nStep 5.2 complete!');
}

main();
