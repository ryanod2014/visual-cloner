#!/usr/bin/env node
/**
 * Step 5.1: Behavior Capture
 *
 * Captures the EXACT behavior of interactive tools by intercepting:
 * - Canvas 2D context operations (arc, fillRect, stroke, etc.)
 * - WebGL/WebGL2 operations (shaders, buffers, textures, draw calls)
 * - CSS animations and transitions
 * - SVG manipulations
 * - Animation libraries (GSAP, anime.js, etc.)
 * - Scroll/Intersection observer behaviors
 * - RequestAnimationFrame calls
 * - Mouse/pointer event responses
 *
 * For each tool, we:
 * 1. Activate it
 * 2. Perform canonical interactions (move, click, drag)
 * 3. Record ALL rendering operations with timing
 * 4. Generate exact replica code
 *
 * Input:  action-map.json, state-registry.json
 * Output: behavior-patterns.json, generated-behaviors.js, extracted-behaviors/
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { getCombinedInjectionScript, extractAllData, generateCombinedReplayModule, getCaptureStatistics } from './extractors/index.js';
import { detectInteractionPattern, getPatternHints, inferBehaviorWithPattern } from './interaction-pattern-detector.js';

const inputDir = process.argv[2] || './pipeline-output';

// Canvas methods to intercept
const CANVAS_METHODS = [
  'arc', 'arcTo', 'beginPath', 'bezierCurveTo', 'clearRect', 'clip', 'closePath',
  'createLinearGradient', 'createRadialGradient', 'drawImage', 'ellipse', 'fill',
  'fillRect', 'fillText', 'lineTo', 'moveTo', 'quadraticCurveTo', 'rect', 'restore',
  'rotate', 'save', 'scale', 'setLineDash', 'setTransform', 'stroke', 'strokeRect',
  'strokeText', 'transform', 'translate'
];

// Canvas properties to track
const CANVAS_PROPERTIES = [
  'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'globalAlpha',
  'globalCompositeOperation', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY',
  'font', 'textAlign', 'textBaseline'
];

async function main() {
  console.log('='.repeat(60));
  console.log('Step 5.1: Behavior Capture');
  console.log('='.repeat(60));

  // Load action map to know which tools to test
  const actionMapPath = path.join(inputDir, 'action-map.json');
  if (!fs.existsSync(actionMapPath)) {
    console.error(`ERROR: ${actionMapPath} not found. Run step 3.0 first.`);
    process.exit(1);
  }

  const { url, actionMap } = JSON.parse(fs.readFileSync(actionMapPath, 'utf-8'));

  // Tool keyboard shortcuts for reliable activation
  const toolShortcuts = {
    'toolbar-hand': 'h',
    'toolbar-selection': 'v',
    'toolbar-rectangle': 'r',
    'toolbar-diamond': 'd',
    'toolbar-ellipse': 'o',
    'toolbar-arrow': 'a',
    'toolbar-line': 'l',
    'toolbar-freedraw': 'p',
    'toolbar-text': 't',
    'toolbar-eraser': 'e',
    'toolbar-frame': 'f',
    'toolbar-laser': 'k',
  };

  // Find canvas-interactive tools (tools that likely draw on canvas)
  const canvasTools = Object.entries(actionMap).filter(([actionId, data]) => {
    const toolId = data.stateChanges?.activeTool;
    return toolId && (
      toolId.includes('laser') ||
      toolId.includes('frame') ||
      toolId.includes('freedraw') ||
      toolId.includes('eraser') ||
      toolId.includes('lasso') ||
      toolId.includes('rectangle') ||
      toolId.includes('ellipse') ||
      toolId.includes('arrow') ||
      toolId.includes('line') ||
      toolId.includes('text') ||
      toolId.includes('hand')
    );
  });

  console.log(`Found ${canvasTools.length} canvas-interactive tools to capture`);

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const behaviorPatterns = {};

  try {
    // Inject ALL extractors BEFORE navigating (important for catching early operations)
    const combinedScript = getCombinedInjectionScript();
    await page.addInitScript(combinedScript);

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Inject canvas interception (legacy - kept for backward compatibility)
    await injectCanvasInterceptor(page);

    console.log('Comprehensive extractors installed: WebGL, CSS animations, transitions, SVG, scroll/intersection, animation libs');

    console.log('\nCapturing behavior patterns for each tool...\n');

    for (const [actionId, data] of canvasTools) {
      const toolId = data.stateChanges?.activeTool;
      const label = data.label || toolId;

      process.stdout.write(`[${toolId?.padEnd(25)}] `);

      try {
        // Clear previous recordings
        await page.evaluate(() => {
          window.__canvasRecordings = [];
          window.__rafCallbacks = [];
        });

        // Activate the tool - prefer keyboard shortcuts for reliability
        let activated = false;

        // Try keyboard shortcut first
        const shortcut = toolShortcuts[toolId];
        if (shortcut) {
          await page.keyboard.press(shortcut);
          await page.waitForTimeout(300);
          activated = true;
        }

        // Fallback to clicking
        if (!activated) {
          const selector = `[data-testid="${toolId}"]`;
          try {
            await page.click(selector, { timeout: 2000 });
            activated = true;
          } catch {
            // Try finding in dropdown
            const moreToolsBtn = await page.$('[data-testid="toolbar-extra-tools-trigger"]');
            if (moreToolsBtn) {
              await moreToolsBtn.click();
              await page.waitForTimeout(300);
              try {
                await page.click(selector, { timeout: 2000 });
                activated = true;
              } catch {
                // Tool not found
              }
              await page.keyboard.press('Escape');
            }
          }
        }

        if (!activated) {
          console.log('→ could not activate');
          continue;
        }

        await page.waitForTimeout(300);

        // Perform canonical interactions based on tool type
        const pattern = await captureToolBehavior(page, toolId);

        behaviorPatterns[toolId] = {
          label,
          actionId,
          ...pattern
        };

        const opCount = pattern.canvasOperations?.length || 0;
        const hasAnimation = pattern.usesRequestAnimationFrame;
        console.log(`→ ${opCount} canvas ops${hasAnimation ? ', uses RAF' : ''}`);

        // Reset to selection tool
        await page.keyboard.press('Escape');
        await page.keyboard.press('v');
        await page.waitForTimeout(200);

      } catch (err) {
        console.log(`→ error: ${err.message.slice(0, 40)}`);
        behaviorPatterns[toolId] = { error: err.message };
      }
    }

    // Extract comprehensive data from ALL extractors
    console.log('\n' + '='.repeat(60));
    console.log('Extracting comprehensive behavior data...');

    const allExtractedData = await extractAllData(page);
    const captureStats = getCaptureStatistics(allExtractedData);

    console.log('\nCapture Statistics:');
    console.log(`  Total items captured: ${captureStats.total}`);
    for (const [name, stats] of Object.entries(captureStats.byExtractor)) {
      if (stats.items > 0) {
        console.log(`  ${name}: ${stats.items} items`);
        for (const [key, count] of Object.entries(stats.details)) {
          if (count > 0) console.log(`    - ${key}: ${count}`);
        }
      }
    }

    // Generate behavior code (legacy)
    console.log('\n' + '='.repeat(60));
    console.log('Generating behavior code...');

    const generatedCode = generateBehaviorCode(behaviorPatterns);

    // Generate comprehensive replay module
    const comprehensiveReplayCode = generateCombinedReplayModule(allExtractedData);

    // Create extracted-behaviors directory
    const extractedDir = path.join(inputDir, 'extracted-behaviors');
    if (!fs.existsSync(extractedDir)) {
      fs.mkdirSync(extractedDir, { recursive: true });
    }

    // Save outputs
    const patternsPath = path.join(inputDir, 'behavior-patterns.json');
    fs.writeFileSync(patternsPath, JSON.stringify({
      url,
      timestamp: new Date().toISOString(),
      toolCount: Object.keys(behaviorPatterns).length,
      patterns: behaviorPatterns,
      captureStatistics: captureStats
    }, null, 2));
    console.log(`Saved: ${patternsPath}`);

    const codePath = path.join(inputDir, 'generated-behaviors.js');
    fs.writeFileSync(codePath, generatedCode);
    console.log(`Saved: ${codePath}`);

    // Save comprehensive extracted data
    const extractedDataPath = path.join(extractedDir, 'all-extracted-data.json');
    fs.writeFileSync(extractedDataPath, JSON.stringify(allExtractedData, null, 2));
    console.log(`Saved: ${extractedDataPath}`);

    // Save comprehensive replay module
    const replayModulePath = path.join(extractedDir, 'comprehensive-replay.js');
    fs.writeFileSync(replayModulePath, comprehensiveReplayCode);
    console.log(`Saved: ${replayModulePath}`);

    // Save individual extractor data
    for (const [name, data] of Object.entries(allExtractedData)) {
      if (data) {
        const extractorPath = path.join(extractedDir, `${name}.json`);
        fs.writeFileSync(extractorPath, JSON.stringify(data, null, 2));
      }
    }
    console.log(`Saved individual extractor data to: ${extractedDir}/`);

    await browser.close();
    console.log('\nStep 5.1 complete!');

  } catch (err) {
    console.error('Error:', err.message);
    await browser.close();
    process.exit(1);
  }
}

async function injectCanvasInterceptor(page) {
  await page.evaluate(({ methods, properties }) => {
    window.__canvasRecordings = [];
    window.__rafCallbacks = [];
    window.__propertyChanges = [];
    window.__domMutations = [];

    // Also observe DOM mutations for tools that use DOM elements (like laser pointer)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) {
              window.__domMutations.push({
                type: 'added',
                tagName: node.tagName,
                className: node.className,
                style: node.style?.cssText,
                timestamp: performance.now()
              });
            }
          });
        } else if (mutation.type === 'attributes') {
          window.__domMutations.push({
            type: 'attribute',
            tagName: mutation.target.tagName,
            attribute: mutation.attributeName,
            value: mutation.target.getAttribute(mutation.attributeName),
            timestamp: performance.now()
          });
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'transform'] });

    // Find all canvases
    const canvases = document.querySelectorAll('canvas');

    canvases.forEach((canvas, canvasIndex) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Intercept methods
      methods.forEach(method => {
        const original = ctx[method];
        if (typeof original === 'function') {
          ctx[method] = function(...args) {
            window.__canvasRecordings.push({
              canvasIndex,
              type: 'method',
              method,
              args: JSON.parse(JSON.stringify(args.map(a =>
                typeof a === 'object' ? '[object]' : a
              ))),
              timestamp: performance.now()
            });
            return original.apply(this, args);
          };
        }
      });

      // Intercept property setters
      properties.forEach(prop => {
        const descriptor = Object.getOwnPropertyDescriptor(ctx.__proto__, prop);
        if (descriptor && descriptor.set) {
          let currentValue = ctx[prop];
          Object.defineProperty(ctx, prop, {
            get() { return currentValue; },
            set(value) {
              window.__canvasRecordings.push({
                canvasIndex,
                type: 'property',
                property: prop,
                value: typeof value === 'object' ? JSON.stringify(value) : value,
                timestamp: performance.now()
              });
              currentValue = value;
              descriptor.set.call(ctx, value);
            }
          });
        }
      });
    });

    // Intercept requestAnimationFrame
    const originalRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = function(callback) {
      window.__rafCallbacks.push({
        timestamp: performance.now(),
        callbackName: callback.name || 'anonymous'
      });
      return originalRAF.call(window, callback);
    };

    console.log(`Canvas interceptor injected on ${canvases.length} canvases`);
  }, { methods: CANVAS_METHODS, properties: CANVAS_PROPERTIES });
}

async function captureToolBehavior(page, toolId) {
  const canvasSelector = 'canvas';
  const canvas = await page.$(canvasSelector);

  if (!canvas) {
    return { error: 'No canvas found' };
  }

  const box = await canvas.boundingBox();
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  // Clear recordings before interaction
  await page.evaluate(() => {
    window.__canvasRecordings = [];
    window.__rafCallbacks = [];
    window.__domMutations = [];
  });

  // ============================================
  // STEP 1: DETECT INTERACTION PATTERN
  // Instead of assuming, test multiple interaction patterns
  // to determine if tool is hover, click, or drag based
  // ============================================
  let interactionPattern = null;
  try {
    interactionPattern = await detectInteractionPattern(page, toolId, box);
    if (interactionPattern.confidence > 50) {
      console.log(`[Pattern: ${interactionPattern.detectedPattern}]`);
    }
  } catch (err) {
    // Pattern detection failed, continue with heuristics
  }

  // Clear recordings again after pattern detection
  await page.evaluate(() => {
    window.__canvasRecordings = [];
    window.__rafCallbacks = [];
    window.__domMutations = [];
  });

  // ============================================
  // STEP 2: PERFORM CANONICAL INTERACTION
  // Use detected pattern, or fall back to tool-name heuristics
  // ============================================
  const detectedPattern = interactionPattern?.detectedPattern;

  // Use detected pattern if confident
  if (detectedPattern === 'drag' || detectedPattern === 'click-drag') {
    // DRAG-BASED: Click and drag
    await page.mouse.move(centerX - 50, centerY);
    await page.mouse.down();
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(centerX - 50 + i * 15, centerY + Math.sin(i) * 30, { steps: 2 });
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

  } else if (detectedPattern === 'hover') {
    // HOVER-BASED: Just move mouse
    await page.mouse.move(centerX, centerY);
    await page.waitForTimeout(100);
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(centerX + i * 20, centerY + i * 10);
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(300);

  } else if (detectedPattern === 'click') {
    // CLICK-BASED: Single click
    await page.mouse.click(centerX, centerY);
    await page.waitForTimeout(300);

  } else if (toolId.includes('hand')) {
    // Hand tool: click and drag to pan
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 100, centerY + 50, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);

  } else if (toolId.includes('freedraw') || toolId.includes('eraser')) {
    // Drawing tools: click and drag
    await page.mouse.move(centerX - 50, centerY);
    await page.mouse.down();
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(centerX - 50 + i * 10, centerY + Math.sin(i) * 20, { steps: 2 });
    }
    await page.mouse.up();
    await page.waitForTimeout(200);

  } else if (toolId.includes('lasso')) {
    // Lasso: draw a closed shape
    await page.mouse.move(centerX, centerY - 50);
    await page.mouse.down();
    await page.mouse.move(centerX + 50, centerY, { steps: 5 });
    await page.mouse.move(centerX, centerY + 50, { steps: 5 });
    await page.mouse.move(centerX - 50, centerY, { steps: 5 });
    await page.mouse.move(centerX, centerY - 50, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

  } else if (toolId.includes('frame') || toolId.includes('rectangle') || toolId.includes('ellipse')) {
    // Shape tools: click and drag to create shape
    await page.mouse.move(centerX - 50, centerY - 50);
    await page.mouse.down();
    await page.mouse.move(centerX + 50, centerY + 50, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);

  } else if (toolId.includes('arrow') || toolId.includes('line')) {
    // Line tools: click start, drag to end
    await page.mouse.move(centerX - 100, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 100, centerY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);

  } else if (toolId.includes('text')) {
    // Text tool: click to place
    await page.mouse.click(centerX, centerY);
    await page.waitForTimeout(300);
    await page.keyboard.type('Test');
    await page.waitForTimeout(200);

  } else {
    // Default: simple click and move
    await page.mouse.move(centerX, centerY);
    await page.mouse.click(centerX, centerY);
    await page.waitForTimeout(300);
  }

  // Collect recordings from legacy canvas interceptor
  const legacyRecordings = await page.evaluate(() => ({
    canvasOperations: window.__canvasRecordings,
    rafCallbacks: window.__rafCallbacks,
    domMutations: window.__domMutations
  }));

  // Collect recordings from comprehensive extractors
  const extractorData = await page.evaluate(() => {
    if (window.__captureAllData) {
      return window.__captureAllData();
    }
    return null;
  });

  // Analyze the pattern using all available data
  const analysis = analyzePattern(legacyRecordings, toolId, extractorData);

  return {
    canvasOperations: legacyRecordings.canvasOperations,
    domMutations: legacyRecordings.domMutations,
    rafCallbackCount: legacyRecordings.rafCallbacks.length,
    usesRequestAnimationFrame: legacyRecordings.rafCallbacks.length > 0,
    usesDomRendering: legacyRecordings.domMutations.length > 0,
    // Include extractor data summary
    webglOperations: extractorData?.webgl?.drawCalls?.length || 0,
    webglShaders: extractorData?.webgl?.shaders?.length || 0,
    cssAnimations: extractorData?.cssAnimation?.animatedElements?.length || 0,
    svgOperations: extractorData?.svg?.pathChanges?.length || 0,
    extractorData: extractorData,
    // Include detected interaction pattern for behavior generation
    interactionPattern: interactionPattern?.detectedPattern || null,
    interactionPatternConfidence: interactionPattern?.confidence || 0,
    interactionPatternPhases: interactionPattern?.phases || null,
    ...analysis
  };
}

function analyzePattern(recordings, toolId, extractorData = null) {
  const ops = recordings.canvasOperations;
  const domMuts = recordings.domMutations || [];
  const rafCount = recordings.rafCallbacks?.length || 0;

  // Check for WebGL operations first (from comprehensive extractors)
  if (extractorData?.webgl) {
    const webgl = extractorData.webgl;
    const hasWebGL = (webgl.drawCalls?.length > 0) ||
                     (webgl.shaders?.length > 0) ||
                     (webgl.buffers?.length > 0);

    if (hasWebGL) {
      return {
        patternType: 'webgl-rendering',
        description: `Renders via WebGL (${webgl.drawCalls?.length || 0} draw calls, ${webgl.shaders?.length || 0} shaders)`,
        webglData: {
          drawCalls: webgl.drawCalls?.length || 0,
          shaders: webgl.shaders?.length || 0,
          buffers: webgl.buffers?.length || 0,
          textures: webgl.textures?.length || 0,
          uniforms: webgl.uniforms?.length || 0
        },
        capturedFromExtractor: true
      };
    }
  }

  // Check for SVG operations (from comprehensive extractors)
  if (extractorData?.svg) {
    const svg = extractorData.svg;
    const hasSVG = (svg.pathChanges?.length > 0) ||
                   (svg.attributeChanges?.length > 0) ||
                   (svg.smilAnimations?.length > 0);

    if (hasSVG && ops.length === 0) {
      return {
        patternType: 'svg-rendering',
        description: `Renders via SVG (${svg.pathChanges?.length || 0} path changes, ${svg.attributeChanges?.length || 0} attribute changes)`,
        svgData: {
          pathChanges: svg.pathChanges?.length || 0,
          attributeChanges: svg.attributeChanges?.length || 0,
          smilAnimations: svg.smilAnimations?.length || 0
        },
        capturedFromExtractor: true
      };
    }
  }

  // Check for CSS animations/transitions (from comprehensive extractors)
  if (extractorData?.cssAnimation || extractorData?.cssTransition) {
    const cssAnim = extractorData.cssAnimation;
    const cssTrans = extractorData.cssTransition;
    const hasCSS = (cssAnim?.webAnimations?.length > 0) ||
                   (cssTrans?.transitionEvents?.length > 0);

    if (hasCSS && ops.length === 0) {
      return {
        patternType: 'css-animation-rendering',
        description: `Renders via CSS animations/transitions`,
        cssData: {
          webAnimations: cssAnim?.webAnimations?.length || 0,
          keyframes: cssAnim?.keyframes?.length || 0,
          transitions: cssTrans?.transitionEvents?.length || 0
        },
        capturedFromExtractor: true
      };
    }
  }

  // Check for animation library usage (from comprehensive extractors)
  if (extractorData?.animationLibs) {
    const libs = extractorData.animationLibs;
    const hasAnimLib = (libs.gsap?.length > 0) ||
                       (libs.anime?.length > 0) ||
                       (libs.framerMotion?.length > 0);

    if (hasAnimLib && ops.length === 0) {
      return {
        patternType: 'animation-library-rendering',
        description: `Renders via animation library (${libs.detected?.map(d => d.library).join(', ') || 'unknown'})`,
        animationLibData: {
          gsap: libs.gsap?.length || 0,
          anime: libs.anime?.length || 0,
          framerMotion: libs.framerMotion?.length || 0,
          detected: libs.detected
        },
        capturedFromExtractor: true
      };
    }
  }

  // Check for DOM-based rendering (like laser pointer)
  if (ops.length === 0 && domMuts.length > 0) {
    // Analyze DOM mutations
    const svgMutations = domMuts.filter(m => m.tagName === 'svg' || m.tagName === 'SVG' || m.tagName?.toLowerCase().includes('svg'));
    const transformMutations = domMuts.filter(m => m.attribute === 'transform' || m.attribute === 'style');

    if (svgMutations.length > 0 || transformMutations.length > 0) {
      return {
        patternType: 'dom-pointer',
        description: 'Renders via DOM elements (SVG or positioned element)',
        domMutationCount: domMuts.length,
        domMutationSample: domMuts.slice(0, 20)
      };
    }
  }

  // No rendering captured from any source
  if (ops.length === 0) {
    return {
      patternType: 'none',
      description: 'No rendering operations captured from any extractor',
      domMutations: domMuts.slice(0, 20),
      rafCount,
      note: 'Tool may use unsupported rendering method or requires specific interaction pattern'
    };
  }

  // Analyze what methods are used
  const methodCounts = {};
  const propertyValues = {};

  ops.forEach(op => {
    if (op.type === 'method') {
      methodCounts[op.method] = (methodCounts[op.method] || 0) + 1;
    } else if (op.type === 'property') {
      propertyValues[op.property] = op.value;
    }
  });

  // Detect pattern type
  let patternType = 'unknown';
  let description = '';

  if (methodCounts.arc && (methodCounts.fill || methodCounts.stroke)) {
    patternType = 'circle-drawing';
    description = 'Draws circles/arcs on canvas';
  } else if (methodCounts.moveTo && methodCounts.lineTo) {
    patternType = 'path-drawing';
    description = 'Draws paths with lines';
  } else if (methodCounts.fillRect || methodCounts.strokeRect) {
    patternType = 'rectangle-drawing';
    description = 'Draws rectangles';
  } else if (methodCounts.clearRect) {
    patternType = 'clearing';
    description = 'Clears canvas regions';
  } else if (methodCounts.drawImage) {
    patternType = 'image-composite';
    description = 'Composites images';
  } else if (methodCounts.translate || methodCounts.scale) {
    patternType = 'transform';
    description = 'Applies transformations';
  }

  // Extract key style properties
  const styles = {};
  if (propertyValues.fillStyle) styles.fillStyle = propertyValues.fillStyle;
  if (propertyValues.strokeStyle) styles.strokeStyle = propertyValues.strokeStyle;
  if (propertyValues.lineWidth) styles.lineWidth = propertyValues.lineWidth;
  if (propertyValues.globalAlpha) styles.globalAlpha = propertyValues.globalAlpha;

  return {
    patternType,
    description,
    methodCounts,
    styles,
    operationSequence: ops.slice(0, 50) // First 50 operations as sample
  };
}

function generateBehaviorCode(patterns) {
  let code = `/**
 * Generated Behavior Implementations
 *
 * These implementations are derived from captured canvas operations
 * from the original webapp.
 *
 * Generated: ${new Date().toISOString()}
 */

`;

  for (const [toolId, pattern] of Object.entries(patterns)) {
    if (pattern.error) continue;

    code += `// ============================================\n`;
    code += `// Tool: ${toolId}\n`;
    code += `// Pattern: ${pattern.patternType || 'unknown'}\n`;
    code += `// Interaction: ${pattern.interactionPattern || 'unknown'} (confidence: ${pattern.interactionPatternConfidence || 0}%)\n`;
    code += `// Description: ${pattern.description || 'N/A'}\n`;
    code += `// ============================================\n\n`;

    // Select generator based on pattern type (from actual capture)
    let ptype = pattern.patternType;

    // INFERENCE: When capture fails ('none' or 'unknown'), infer from tool name
    // Also use inference when captured pattern is generic/misleading (clearing, transform)
    // and we can infer a specific tool type from the name
    const genericPatterns = ['none', 'unknown', 'clearing', 'transform', 'generic', null, undefined];
    const inferred = inferToolTypeFromName(toolId);

    if (genericPatterns.includes(ptype) || (inferred && !ptype)) {
      if (inferred) {
        ptype = inferred;
        code = code.replace(
          `// Pattern: ${pattern.patternType || 'unknown'}`,
          `// Pattern: ${inferred}\n// Note: Inferred from tool name (capture got '${pattern.patternType}' - synthetic events may not trigger actual rendering)`
        );
      }
    }

    // New comprehensive extractor pattern types
    if (ptype === 'webgl-rendering') {
      code += generateWebGLBehavior(toolId, pattern);
    } else if (ptype === 'svg-rendering') {
      code += generateSVGBehavior(toolId, pattern);
    } else if (ptype === 'css-animation-rendering') {
      code += generateCSSAnimationBehavior(toolId, pattern);
    } else if (ptype === 'animation-library-rendering') {
      code += generateAnimationLibBehavior(toolId, pattern);
    // Inferred pattern types (from tool name analysis)
    } else if (ptype === 'laser-pointer') {
      code += generateLaserPointerBehavior(toolId, pattern);
    } else if (ptype === 'lasso-selection') {
      code += generateLassoSelectionBehavior(toolId, pattern);
    } else if (ptype === 'pan-tool') {
      code += generatePanToolBehavior(toolId, pattern);
    } else if (ptype === 'frame-tool') {
      code += generateFrameToolBehavior(toolId, pattern);
    } else if (ptype === 'eraser-tool') {
      code += generateEraserToolBehavior(toolId, pattern);
    } else if (ptype === 'freehand-drawing') {
      code += generateFreehandDrawingBehavior(toolId, pattern);
    } else if (ptype === 'rectangle-shape') {
      code += generateRectangleShapeBehavior(toolId, pattern);
    } else if (ptype === 'ellipse-shape') {
      code += generateEllipseShapeBehavior(toolId, pattern);
    } else if (ptype === 'line-shape') {
      code += generateLineShapeBehavior(toolId, pattern);
    } else if (ptype === 'arrow-shape') {
      code += generateArrowShapeBehavior(toolId, pattern);
    } else if (ptype === 'diamond-shape') {
      code += generateDiamondShapeBehavior(toolId, pattern);
    } else if (ptype === 'text-tool') {
      code += generateTextToolBehavior(toolId, pattern);
    // Legacy pattern types (from Canvas 2D capture)
    } else if (ptype === 'dom-pointer') {
      code += generateLaserPointerBehavior(toolId, pattern);
    } else if (ptype === 'circle-drawing') {
      code += generateCircleDrawingBehavior(toolId, pattern);
    } else if (ptype === 'path-drawing') {
      code += generatePathDrawingBehavior(toolId, pattern);
    } else if (ptype === 'rectangle-drawing') {
      code += generateRectangleDrawingBehavior(toolId, pattern);
    } else if (ptype === 'transform') {
      code += generateTransformBehavior(toolId, pattern);
    } else {
      code += generateGenericBehavior(toolId, pattern);
    }

    code += '\n\n';
  }

  // Add behavior registry
  code += `// ============================================\n`;
  code += `// Behavior Registry\n`;
  code += `// ============================================\n\n`;
  code += `export const behaviorRegistry = {\n`;

  for (const [toolId, pattern] of Object.entries(patterns)) {
    if (pattern.error) continue;
    const funcName = toolIdToFunctionName(toolId);
    code += `  '${toolId}': ${funcName}Behavior,\n`;
  }

  code += `};\n\n`;

  // Add hook for using behaviors
  code += `/**
 * Hook to apply tool behavior to canvas
 * Usage: const applyBehavior = useToolBehavior(canvasRef, activeTool);
 */
export function useToolBehavior(canvasRef, activeTool) {
  const behavior = behaviorRegistry[activeTool];

  if (!behavior) return null;

  return {
    onMouseMove: (e) => behavior.onMouseMove?.(canvasRef.current, e),
    onMouseDown: (e) => behavior.onMouseDown?.(canvasRef.current, e),
    onMouseUp: (e) => behavior.onMouseUp?.(canvasRef.current, e),
    onMouseLeave: (e) => behavior.onMouseLeave?.(canvasRef.current, e),
  };
}
`;

  return code;
}

function toolIdToFunctionName(toolId) {
  return toolId
    .replace('toolbar-', '')
    .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Infer tool behavior type from tool name/id
 * Used when canvas/DOM capture fails (WebGL, separate layers, etc.)
 */
function inferToolTypeFromName(toolId) {
  const id = toolId.toLowerCase();

  // Pointer/laser tools - follow cursor with visual indicator
  if (id.includes('laser') || id.includes('pointer') || id.includes('cursor')) {
    return 'laser-pointer';
  }

  // Selection tools - draw selection area
  if (id.includes('lasso') || id.includes('select') || id.includes('marquee')) {
    return 'lasso-selection';
  }

  // Pan/hand tools - drag to move viewport
  if (id.includes('hand') || id.includes('pan') || id.includes('grab')) {
    return 'pan-tool';
  }

  // Frame/region tools - draw rectangular regions
  if (id.includes('frame') || id.includes('artboard') || id.includes('slice')) {
    return 'frame-tool';
  }

  // Eraser tools - remove content under cursor
  if (id.includes('eraser') || id.includes('delete')) {
    return 'eraser-tool';
  }

  // Freeform drawing tools
  if (id.includes('draw') || id.includes('pencil') || id.includes('pen') || id.includes('brush')) {
    return 'freehand-drawing';
  }

  // Shape tools
  if (id.includes('rect') || id.includes('square')) {
    return 'rectangle-shape';
  }
  if (id.includes('ellipse') || id.includes('circle') || id.includes('oval')) {
    return 'ellipse-shape';
  }
  if (id.includes('line')) {
    return 'line-shape';
  }
  if (id.includes('arrow')) {
    return 'arrow-shape';
  }
  if (id.includes('diamond') || id.includes('rhombus')) {
    return 'diamond-shape';
  }

  // Text tools
  if (id.includes('text') || id.includes('type')) {
    return 'text-tool';
  }

  return null; // Unknown tool type
}

/**
 * Generate behavior code with correct interaction pattern
 * This ensures behaviors match the detected interaction pattern (hover vs drag vs click)
 *
 * @param {string} funcName - The function name for the behavior
 * @param {string} interactionPattern - Detected pattern: 'hover', 'drag', 'click-drag', 'click', 'unknown'
 * @param {string} coreRenderCode - The core rendering code (canvas operations)
 * @param {object} options - Additional options (styles, etc.)
 */
function generateBehaviorWithInteractionPattern(funcName, interactionPattern, coreRenderCode, options = {}) {
  const { styles = {}, description = '' } = options;

  // HOVER-BASED: Renders continuously as mouse moves (no click required)
  if (interactionPattern === 'hover') {
    return `export const ${funcName}Behavior = {
  ${description ? `// ${description}\n  ` : ''}// Interaction: hover (renders on mouse move)

  onMouseMove(canvas, e) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.save();
${coreRenderCode}
    ctx.restore();
  }
};`;
  }

  // DRAG-BASED or CLICK-DRAG: Only renders while mouse is down
  if (interactionPattern === 'drag' || interactionPattern === 'click-drag') {
    return `export const ${funcName}Behavior = {
  ${description ? `// ${description}\n  ` : ''}// Interaction: ${interactionPattern} (renders only while mouse is down)
  isDrawing: false,
  startPoint: null,

  onMouseDown(canvas, e) {
    this.isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    this.startPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  },

  onMouseMove(canvas, e) {
    if (!this.isDrawing || !canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.save();
${coreRenderCode}
    ctx.restore();
  },

  onMouseUp(canvas, e) {
    this.isDrawing = false;
    this.startPoint = null;
  }
};`;
  }

  // CLICK-BASED: Single action on click
  if (interactionPattern === 'click') {
    return `export const ${funcName}Behavior = {
  ${description ? `// ${description}\n  ` : ''}// Interaction: click (action on click only)

  onMouseDown(canvas, e) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.save();
${coreRenderCode}
    ctx.restore();
  }
};`;
  }

  // CLICK-TOGGLE: Click to start continuous rendering, click again to stop
  if (interactionPattern === 'click-toggle') {
    return `export const ${funcName}Behavior = {
  ${description ? `// ${description}\n  ` : ''}// Interaction: click-toggle (click to start/stop)
  isActive: false,

  onMouseDown(canvas, e) {
    this.isActive = !this.isActive;
  },

  onMouseMove(canvas, e) {
    if (!this.isActive || !canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.save();
${coreRenderCode}
    ctx.restore();
  }
};`;
  }

  // UNKNOWN/DEFAULT: Use drag-based as safe default (most common for drawing tools)
  return `export const ${funcName}Behavior = {
  ${description ? `// ${description}\n  ` : ''}// Interaction: unknown (using drag-based as safe default)
  isDrawing: false,
  startPoint: null,

  onMouseDown(canvas, e) {
    this.isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    this.startPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  },

  onMouseMove(canvas, e) {
    if (!this.isDrawing || !canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.save();
${coreRenderCode}
    ctx.restore();
  },

  onMouseUp(canvas, e) {
    this.isDrawing = false;
    this.startPoint = null;
  }
};`;
}

/**
 * Generate WebGL behavior from captured shader/draw call data
 */
function generateWebGLBehavior(toolId, pattern) {
  const funcName = toolIdToFunctionName(toolId);
  const webglData = pattern.webglData || {};
  const extractorData = pattern.extractorData?.webgl || {};

  // If we have shaders, generate shader-based rendering
  if (extractorData.shaders?.length > 0) {
    const vertexShader = extractorData.shaders.find(s => s.type === 'vertex');
    const fragmentShader = extractorData.shaders.find(s => s.type === 'fragment');

    return `export const ${funcName}Behavior = {
  // WebGL rendering - captured shaders and draw calls
  gl: null,
  program: null,
  initialized: false,

  init(canvas) {
    if (this.initialized) return;
    this.gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
    if (!this.gl) return;

    // Vertex shader
    const vsSource = \`${vertexShader?.source?.replace(/`/g, '\\`') || 'attribute vec4 aPos; void main() { gl_Position = aPos; }'}\`;

    // Fragment shader
    const fsSource = \`${fragmentShader?.source?.replace(/`/g, '\\`') || 'void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }'}\`;

    const vs = this.gl.createShader(this.gl.VERTEX_SHADER);
    this.gl.shaderSource(vs, vsSource);
    this.gl.compileShader(vs);

    const fs = this.gl.createShader(this.gl.FRAGMENT_SHADER);
    this.gl.shaderSource(fs, fsSource);
    this.gl.compileShader(fs);

    this.program = this.gl.createProgram();
    this.gl.attachShader(this.program, vs);
    this.gl.attachShader(this.program, fs);
    this.gl.linkProgram(this.program);
    this.gl.useProgram(this.program);

    this.initialized = true;
  },

  onMouseMove(canvas, e) {
    if (!canvas) return;
    if (!this.initialized) this.init(canvas);
    if (!this.gl) return;

    // Captured ${webglData.drawCalls || 0} draw calls
    // Additional rendering logic would be generated from captured data
  },

  cleanup() {
    this.gl = null;
    this.program = null;
    this.initialized = false;
  }
};`;
  }

  // Fallback for WebGL without captured shaders
  return `export const ${funcName}Behavior = {
  // WebGL rendering detected (${webglData.drawCalls || 0} draw calls, ${webglData.shaders || 0} shaders)
  // Shader source not captured - likely using library or bundled shaders
  onMouseMove(canvas, e) {
    // WebGL behavior detected but shader source not available
    // See extracted-behaviors/ directory for captured WebGL data
  }
};`;
}

/**
 * Generate SVG behavior from captured path/attribute changes
 */
function generateSVGBehavior(toolId, pattern) {
  const funcName = toolIdToFunctionName(toolId);
  const svgData = pattern.svgData || {};
  const extractorData = pattern.extractorData?.svg || {};

  // Generate based on captured path changes
  if (extractorData.pathChanges?.length > 0) {
    const pathChange = extractorData.pathChanges[0];
    return `export const ${funcName}Behavior = {
  // SVG path manipulation - captured ${svgData.pathChanges || 0} path changes
  targetSelector: '${pathChange.selector || 'svg path'}',

  onMouseMove(canvas, e) {
    const svg = document.querySelector(this.targetSelector);
    if (!svg) return;

    const rect = canvas?.getBoundingClientRect() || { left: 0, top: 0 };
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Apply captured path transformations
    // Original path data available in extracted-behaviors/svg.json
  }
};`;
  }

  return `export const ${funcName}Behavior = {
  // SVG rendering detected (${svgData.pathChanges || 0} path changes, ${svgData.attributeChanges || 0} attribute changes)
  onMouseMove(canvas, e) {
    // SVG behavior - see extracted-behaviors/svg.json for captured data
  }
};`;
}

/**
 * Generate CSS animation behavior from captured keyframes/animations
 */
function generateCSSAnimationBehavior(toolId, pattern) {
  const funcName = toolIdToFunctionName(toolId);
  const cssData = pattern.cssData || {};
  const extractorData = pattern.extractorData?.cssAnimation || {};

  // Generate based on captured Web Animations API calls
  if (extractorData.webAnimations?.length > 0) {
    const anim = extractorData.webAnimations[0];
    return `export const ${funcName}Behavior = {
  // CSS/Web Animation - captured ${cssData.webAnimations || 0} animations
  animation: null,

  onMouseMove(canvas, e) {
    const target = document.querySelector('${anim.selector || 'body'}');
    if (!target) return;

    // Apply captured animation
    if (!this.animation) {
      this.animation = target.animate(
        ${JSON.stringify(anim.keyframes || [])},
        ${JSON.stringify(anim.options || { duration: 300 })}
      );
    }
  },

  cleanup() {
    this.animation?.cancel();
    this.animation = null;
  }
};`;
  }

  return `export const ${funcName}Behavior = {
  // CSS animation rendering (${cssData.keyframes || 0} keyframes, ${cssData.webAnimations || 0} web animations)
  onMouseMove(canvas, e) {
    // CSS animation behavior - see extracted-behaviors/cssAnimation.json for captured data
  }
};`;
}

/**
 * Generate animation library behavior from captured GSAP/anime.js calls
 */
function generateAnimationLibBehavior(toolId, pattern) {
  const funcName = toolIdToFunctionName(toolId);
  const animData = pattern.animationLibData || {};
  const extractorData = pattern.extractorData?.animationLibs || {};

  // Generate based on detected library
  const detectedLibs = animData.detected || [];
  const libNames = detectedLibs.map(d => d.library).join(', ') || 'unknown';

  // GSAP
  if (extractorData.gsap?.length > 0) {
    const gsapCall = extractorData.gsap[0];
    return `export const ${funcName}Behavior = {
  // GSAP animation - captured ${animData.gsap || 0} calls
  // Requires GSAP library to be loaded

  onMouseMove(canvas, e) {
    if (!window.gsap) return;

    // Replay captured GSAP animation
    gsap.${gsapCall.type || 'to'}('${gsapCall.targets?.[0] || 'body'}', ${JSON.stringify(gsapCall.vars || {})});
  }
};`;
  }

  // anime.js
  if (extractorData.anime?.length > 0) {
    const animeCall = extractorData.anime[0];
    return `export const ${funcName}Behavior = {
  // anime.js animation - captured ${animData.anime || 0} calls
  // Requires anime.js library to be loaded

  onMouseMove(canvas, e) {
    if (!window.anime) return;

    // Replay captured anime.js animation
    anime({
      targets: '${animeCall.targets?.[0] || 'body'}',
      ${Object.entries(animeCall.properties || {}).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(',\n      ')}
    });
  }
};`;
  }

  return `export const ${funcName}Behavior = {
  // Animation library detected: ${libNames}
  // See extracted-behaviors/animationLibs.json for captured calls
  onMouseMove(canvas, e) {
    // Animation library behavior - requires library to be loaded
  }
};`;
}

/**
 * Generate laser pointer behavior - SVG-based trail matching Excalidraw's implementation
 * Based on analysis of Excalidraw's LaserTrails class:
 * - SVG path rendering with smooth bezier curves
 * - 1000ms time-based decay
 * - 50-point trail length
 * - streamline: 0.4 path smoothing
 * - RAF-based animation loop
 */
function generateLaserPointerBehavior(toolId, pattern) {
  const funcName = toolIdToFunctionName(toolId);
  return `export const ${funcName}Behavior = {
  // Laser pointer - SVG-based trail (matches Excalidraw implementation)
  // Behavior: Click to start trail, drag to draw, release to stop
  svg: null,
  path: null,
  points: [],
  maxPoints: 50,
  fadeTime: 1000,
  animationId: null,
  isActive: false,
  isDrawing: false,  // Only draw trail when mouse is down
  streamline: 0.4,

  init(container) {
    if (this.svg) return;

    // Create SVG container
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.style.cssText = \`
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 10000;
      overflow: visible;
    \`;
    this.svg.setAttribute('viewBox', '0 0 ' + window.innerWidth + ' ' + window.innerHeight);

    // Create path element for trail
    this.path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.path.setAttribute('fill', 'none');
    this.path.setAttribute('stroke', '#ff0000');
    this.path.setAttribute('stroke-width', '3');
    this.path.setAttribute('stroke-linecap', 'round');
    this.path.setAttribute('stroke-linejoin', 'round');
    this.path.style.filter = 'drop-shadow(0 0 4px #ff0000)';

    this.svg.appendChild(this.path);
    document.body.appendChild(this.svg);

    // Start animation loop
    this.isActive = true;
    this.animate();
  },

  // Smooth path using streamline factor (like Excalidraw)
  getSmoothPath(pts) {
    if (pts.length < 2) return '';

    const smoothed = [];
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) {
        smoothed.push(pts[i]);
      } else {
        const prev = smoothed[smoothed.length - 1];
        smoothed.push({
          x: prev.x + (pts[i].x - prev.x) * (1 - this.streamline),
          y: prev.y + (pts[i].y - prev.y) * (1 - this.streamline),
          time: pts[i].time
        });
      }
    }

    let d = 'M ' + smoothed[0].x + ' ' + smoothed[0].y;

    for (let i = 1; i < smoothed.length - 1; i++) {
      const p0 = smoothed[i - 1];
      const p1 = smoothed[i];
      const p2 = smoothed[i + 1];

      const cx = (p0.x + p1.x) / 2;
      const cy = (p0.y + p1.y) / 2;
      const cx2 = (p1.x + p2.x) / 2;
      const cy2 = (p1.y + p2.y) / 2;

      d += ' Q ' + p1.x + ' ' + p1.y + ' ' + cx2 + ' ' + cy2;
    }

    if (smoothed.length > 1) {
      const last = smoothed[smoothed.length - 1];
      d += ' L ' + last.x + ' ' + last.y;
    }

    return d;
  },

  animate() {
    if (!this.isActive) return;

    const now = Date.now();

    // Filter out old points
    this.points = this.points.filter(p => now - p.time < this.fadeTime);

    // Update path
    if (this.points.length > 1 && this.path) {
      const pathData = this.getSmoothPath(this.points);
      this.path.setAttribute('d', pathData);

      // Calculate opacity based on oldest point
      const oldest = this.points[0];
      const age = now - oldest.time;
      const opacity = Math.max(0.3, 1 - (age / this.fadeTime) * 0.7);
      this.path.setAttribute('stroke-opacity', opacity);
    } else if (this.path) {
      this.path.setAttribute('d', '');
    }

    this.animationId = requestAnimationFrame(() => this.animate());
  },

  onMouseDown(canvas, e) {
    if (!this.svg) this.init(canvas?.parentElement);
    this.isDrawing = true;
    this.points = [];  // Start fresh trail on each click
    this.points.push({
      x: e.clientX,
      y: e.clientY,
      time: Date.now()
    });
  },

  onMouseMove(canvas, e) {
    if (!this.svg) this.init(canvas?.parentElement);
    if (!this.isDrawing) return;  // Only draw when mouse is down

    this.points.push({
      x: e.clientX,
      y: e.clientY,
      time: Date.now()
    });

    // Limit points
    if (this.points.length > this.maxPoints) {
      this.points.shift();
    }
  },

  onMouseUp(canvas, e) {
    this.isDrawing = false;
    // Trail will fade naturally via animation loop
  },

  onMouseLeave(canvas, e) {
    this.isDrawing = false;
    // Let trail fade naturally - don't clear immediately
  },

  cleanup() {
    this.isActive = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.svg?.remove();
    this.svg = null;
    this.path = null;
    this.points = [];
  }
};`;
}

/**
 * Generate lasso selection behavior - freeform selection path
 */
function generateLassoSelectionBehavior(toolId, pattern) {
  const funcName = toolIdToFunctionName(toolId);
  return `export const ${funcName}Behavior = {
  isSelecting: false,
  points: [],
  overlay: null,

  init(container) {
    if (this.overlay) return;
    this.overlay = document.createElement('canvas');
    this.overlay.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 100;';
    container?.appendChild(this.overlay);
  },

  onMouseDown(canvas, e) {
    this.isSelecting = true;
    this.points = [{ x: e.clientX, y: e.clientY }];
    if (!this.overlay) this.init(canvas?.parentElement);
  },

  onMouseMove(canvas, e) {
    if (!this.isSelecting) return;
    this.points.push({ x: e.clientX, y: e.clientY });
    this.render();
  },

  onMouseUp(canvas, e) {
    this.isSelecting = false;
    // Close the path
    if (this.points.length > 2) {
      this.points.push(this.points[0]);
      this.render();
    }
    setTimeout(() => { this.points = []; this.render(); }, 500);
  },

  render() {
    if (!this.overlay) return;
    const ctx = this.overlay.getContext('2d');
    this.overlay.width = this.overlay.offsetWidth;
    this.overlay.height = this.overlay.offsetHeight;
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);

    if (this.points.length < 2) return;
    ctx.strokeStyle = '#6965db';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);
    this.points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
  },

  cleanup() { this.overlay?.remove(); this.overlay = null; this.points = []; }
};`;
}

/**
 * Generate pan tool behavior - drag to move viewport
 */
function generatePanToolBehavior(toolId, pattern) {
  const funcName = toolIdToFunctionName(toolId);
  return `export const ${funcName}Behavior = {
  isPanning: false,
  lastPoint: null,

  onMouseDown(canvas, e) {
    this.isPanning = true;
    this.lastPoint = { x: e.clientX, y: e.clientY };
    if (canvas) canvas.style.cursor = 'grabbing';
  },

  onMouseMove(canvas, e) {
    if (!this.isPanning || !this.lastPoint) return;
    const dx = e.clientX - this.lastPoint.x;
    const dy = e.clientY - this.lastPoint.y;
    this.lastPoint = { x: e.clientX, y: e.clientY };
    // Emit pan event or update canvas transform
    canvas?.dispatchEvent(new CustomEvent('pan', { detail: { dx, dy } }));
  },

  onMouseUp(canvas, e) {
    this.isPanning = false;
    this.lastPoint = null;
    if (canvas) canvas.style.cursor = 'grab';
  },

  onMouseLeave(canvas, e) {
    this.isPanning = false;
    this.lastPoint = null;
  }
};`;
}

/**
 * Generate frame tool behavior - draw rectangular frame
 */
function generateFrameToolBehavior(toolId, pattern) {
  const funcName = toolIdToFunctionName(toolId);
  return `export const ${funcName}Behavior = {
  isDrawing: false,
  startPoint: null,
  overlay: null,

  init(container) {
    if (this.overlay) return;
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position: absolute; border: 2px dashed #6965db; background: rgba(105, 101, 219, 0.1); pointer-events: none; display: none; z-index: 100;';
    container?.appendChild(this.overlay);
  },

  onMouseDown(canvas, e) {
    this.isDrawing = true;
    const rect = canvas?.getBoundingClientRect() || { left: 0, top: 0 };
    this.startPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (!this.overlay) this.init(canvas?.parentElement);
    if (this.overlay) {
      this.overlay.style.display = 'block';
      this.overlay.style.left = this.startPoint.x + 'px';
      this.overlay.style.top = this.startPoint.y + 'px';
      this.overlay.style.width = '0px';
      this.overlay.style.height = '0px';
    }
  },

  onMouseMove(canvas, e) {
    if (!this.isDrawing || !this.startPoint || !this.overlay) return;
    const rect = canvas?.getBoundingClientRect() || { left: 0, top: 0 };
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = x - this.startPoint.x;
    const height = y - this.startPoint.y;

    this.overlay.style.left = (width < 0 ? x : this.startPoint.x) + 'px';
    this.overlay.style.top = (height < 0 ? y : this.startPoint.y) + 'px';
    this.overlay.style.width = Math.abs(width) + 'px';
    this.overlay.style.height = Math.abs(height) + 'px';
  },

  onMouseUp(canvas, e) {
    this.isDrawing = false;
    // Keep frame visible or emit frame-created event
    this.startPoint = null;
  },

  cleanup() { this.overlay?.remove(); this.overlay = null; }
};`;
}

/**
 * Generate eraser tool behavior
 */
function generateEraserToolBehavior(toolId, pattern) {
  const funcName = toolIdToFunctionName(toolId);
  return `export const ${funcName}Behavior = {
  isErasing: false,
  cursorEl: null,

  init() {
    if (this.cursorEl) return;
    this.cursorEl = document.createElement('div');
    this.cursorEl.style.cssText = 'position: fixed; width: 20px; height: 20px; border: 2px solid #666; border-radius: 50%; pointer-events: none; z-index: 10000; display: none;';
    document.body.appendChild(this.cursorEl);
  },

  onMouseDown(canvas, e) { this.isErasing = true; },

  onMouseMove(canvas, e) {
    if (!this.cursorEl) this.init();
    this.cursorEl.style.display = 'block';
    this.cursorEl.style.left = (e.clientX - 10) + 'px';
    this.cursorEl.style.top = (e.clientY - 10) + 'px';

    if (this.isErasing && canvas) {
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(e.clientX - rect.left, e.clientY - rect.top, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },

  onMouseUp(canvas, e) { this.isErasing = false; },

  onMouseLeave(canvas, e) {
    this.isErasing = false;
    if (this.cursorEl) this.cursorEl.style.display = 'none';
  },

  cleanup() { this.cursorEl?.remove(); this.cursorEl = null; }
};`;
}

/**
 * Generate freehand drawing behavior
 */
function generateFreehandDrawingBehavior(toolId, pattern) {
  const funcName = toolIdToFunctionName(toolId);
  const strokeStyle = pattern.styles?.strokeStyle || '#1e1e1e';
  const lineWidth = pattern.styles?.lineWidth || 2;

  return `export const ${funcName}Behavior = {
  isDrawing: false,
  lastPoint: null,

  onMouseDown(canvas, e) {
    this.isDrawing = true;
    const rect = canvas?.getBoundingClientRect() || { left: 0, top: 0 };
    this.lastPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  },

  onMouseMove(canvas, e) {
    if (!this.isDrawing || !canvas || !this.lastPoint) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.strokeStyle = '${strokeStyle}';
    ctx.lineWidth = ${lineWidth};
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    this.lastPoint = { x, y };
  },

  onMouseUp(canvas, e) { this.isDrawing = false; this.lastPoint = null; }
};`;
}

/**
 * Generate rectangle shape behavior
 */
function generateRectangleShapeBehavior(toolId, pattern) {
  const funcName = toolIdToFunctionName(toolId);
  const strokeStyle = pattern.styles?.strokeStyle || '#1e1e1e';
  const fillStyle = pattern.styles?.fillStyle || 'transparent';

  return `export const ${funcName}Behavior = {
  isDrawing: false,
  startPoint: null,
  preview: null,

  onMouseDown(canvas, e) {
    this.isDrawing = true;
    const rect = canvas?.getBoundingClientRect() || { left: 0, top: 0 };
    this.startPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  },

  onMouseMove(canvas, e) {
    if (!this.isDrawing || !this.startPoint) return;
    // Preview would update here
  },

  onMouseUp(canvas, e) {
    if (!this.isDrawing || !this.startPoint || !canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = x - this.startPoint.x;
    const height = y - this.startPoint.y;

    ctx.strokeStyle = '${strokeStyle}';
    ctx.fillStyle = '${fillStyle}';
    ctx.lineWidth = 2;
    if ('${fillStyle}' !== 'transparent') ctx.fillRect(this.startPoint.x, this.startPoint.y, width, height);
    ctx.strokeRect(this.startPoint.x, this.startPoint.y, width, height);

    this.isDrawing = false;
    this.startPoint = null;
  }
};`;
}

/**
 * Generate ellipse shape behavior
 */
function generateEllipseShapeBehavior(toolId, pattern) {
  const funcName = toolIdToFunctionName(toolId);
  const strokeStyle = pattern.styles?.strokeStyle || '#1e1e1e';
  const fillStyle = pattern.styles?.fillStyle || 'transparent';

  return `export const ${funcName}Behavior = {
  isDrawing: false,
  startPoint: null,

  onMouseDown(canvas, e) {
    this.isDrawing = true;
    const rect = canvas?.getBoundingClientRect() || { left: 0, top: 0 };
    this.startPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  },

  onMouseUp(canvas, e) {
    if (!this.isDrawing || !this.startPoint || !canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rx = Math.abs(x - this.startPoint.x) / 2;
    const ry = Math.abs(y - this.startPoint.y) / 2;
    const cx = this.startPoint.x + (x - this.startPoint.x) / 2;
    const cy = this.startPoint.y + (y - this.startPoint.y) / 2;

    ctx.strokeStyle = '${strokeStyle}';
    ctx.fillStyle = '${fillStyle}';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if ('${fillStyle}' !== 'transparent') ctx.fill();
    ctx.stroke();

    this.isDrawing = false;
    this.startPoint = null;
  }
};`;
}

/**
 * Generate line shape behavior
 */
function generateLineShapeBehavior(toolId, pattern) {
  const funcName = toolIdToFunctionName(toolId);
  const strokeStyle = pattern.styles?.strokeStyle || '#1e1e1e';

  return `export const ${funcName}Behavior = {
  isDrawing: false,
  startPoint: null,

  onMouseDown(canvas, e) {
    this.isDrawing = true;
    const rect = canvas?.getBoundingClientRect() || { left: 0, top: 0 };
    this.startPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  },

  onMouseUp(canvas, e) {
    if (!this.isDrawing || !this.startPoint || !canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.strokeStyle = '${strokeStyle}';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.startPoint.x, this.startPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    this.isDrawing = false;
    this.startPoint = null;
  }
};`;
}

/**
 * Generate arrow shape behavior
 */
function generateArrowShapeBehavior(toolId, pattern) {
  const funcName = toolIdToFunctionName(toolId);
  const strokeStyle = pattern.styles?.strokeStyle || '#1e1e1e';

  return `export const ${funcName}Behavior = {
  isDrawing: false,
  startPoint: null,

  onMouseDown(canvas, e) {
    this.isDrawing = true;
    const rect = canvas?.getBoundingClientRect() || { left: 0, top: 0 };
    this.startPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  },

  onMouseUp(canvas, e) {
    if (!this.isDrawing || !this.startPoint || !canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Draw line
    ctx.strokeStyle = '${strokeStyle}';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.startPoint.x, this.startPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    // Draw arrowhead
    const angle = Math.atan2(y - this.startPoint.y, x - this.startPoint.x);
    const headLen = 15;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - headLen * Math.cos(angle - Math.PI / 6), y - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x, y);
    ctx.lineTo(x - headLen * Math.cos(angle + Math.PI / 6), y - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();

    this.isDrawing = false;
    this.startPoint = null;
  }
};`;
}

/**
 * Generate diamond shape behavior
 */
function generateDiamondShapeBehavior(toolId, pattern) {
  const funcName = toolIdToFunctionName(toolId);
  const strokeStyle = pattern.styles?.strokeStyle || '#1e1e1e';
  const fillStyle = pattern.styles?.fillStyle || 'transparent';

  return `export const ${funcName}Behavior = {
  isDrawing: false,
  startPoint: null,

  onMouseDown(canvas, e) {
    this.isDrawing = true;
    const rect = canvas?.getBoundingClientRect() || { left: 0, top: 0 };
    this.startPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  },

  onMouseUp(canvas, e) {
    if (!this.isDrawing || !this.startPoint || !canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = (this.startPoint.x + x) / 2;
    const cy = (this.startPoint.y + y) / 2;
    const hw = Math.abs(x - this.startPoint.x) / 2;
    const hh = Math.abs(y - this.startPoint.y) / 2;

    ctx.strokeStyle = '${strokeStyle}';
    ctx.fillStyle = '${fillStyle}';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh); // top
    ctx.lineTo(cx + hw, cy); // right
    ctx.lineTo(cx, cy + hh); // bottom
    ctx.lineTo(cx - hw, cy); // left
    ctx.closePath();
    if ('${fillStyle}' !== 'transparent') ctx.fill();
    ctx.stroke();

    this.isDrawing = false;
    this.startPoint = null;
  }
};`;
}

/**
 * Generate text tool behavior
 */
function generateTextToolBehavior(toolId, pattern) {
  const funcName = toolIdToFunctionName(toolId);

  return `export const ${funcName}Behavior = {
  inputEl: null,

  onMouseDown(canvas, e) {
    const rect = canvas?.getBoundingClientRect() || { left: 0, top: 0 };
    const x = e.clientX;
    const y = e.clientY;

    // Create input element
    if (this.inputEl) this.inputEl.remove();
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.style.cssText = \`
      position: fixed; left: \${x}px; top: \${y}px;
      font-size: 16px; font-family: inherit;
      border: 1px solid #6965db; outline: none;
      background: white; padding: 2px 4px; z-index: 10000;
    \`;
    document.body.appendChild(this.inputEl);
    this.inputEl.focus();

    this.inputEl.addEventListener('blur', () => {
      const text = this.inputEl.value;
      if (text && canvas) {
        const ctx = canvas.getContext('2d');
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#1e1e1e';
        ctx.fillText(text, x - rect.left, y - rect.top + 16);
      }
      this.inputEl.remove();
      this.inputEl = null;
    });

    this.inputEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') this.inputEl.blur();
    });
  },

  cleanup() { this.inputEl?.remove(); this.inputEl = null; }
};`;
}

// Keep the old function name for backwards compatibility but redirect
function generateDomPointerBehavior(toolId, pattern) {
  // DOM-based pointer tool (like laser pointer)
  // Creates a DOM element that follows the cursor
  const isLaser = toolId.includes('laser');
  const color = isLaser ? '#ff0000' : '#6965db';
  const size = isLaser ? 8 : 10;

  return `export const ${toolIdToFunctionName(toolId)}Behavior = {
  // DOM-based pointer - renders via positioned element, not canvas
  element: null,
  trail: [],
  maxTrail: ${isLaser ? 30 : 0},
  isActive: false,

  init(container) {
    if (this.element) return;

    this.element = document.createElement('div');
    this.element.style.cssText = \`
      position: fixed;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: 50%;
      pointer-events: none;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.1s;
      box-shadow: 0 0 ${size}px ${color};
    \`;
    document.body.appendChild(this.element);
${isLaser ? `
    // Create trail container
    this.trailContainer = document.createElement('div');
    this.trailContainer.style.cssText = 'position: fixed; top: 0; left: 0; pointer-events: none; z-index: 9999;';
    document.body.appendChild(this.trailContainer);
` : ''}
  },

  onMouseMove(canvas, e) {
    if (!this.element) this.init();

    this.element.style.opacity = '1';
    this.element.style.left = (e.clientX - ${size / 2}) + 'px';
    this.element.style.top = (e.clientY - ${size / 2}) + 'px';
${isLaser ? `
    // Add trail point
    this.trail.push({ x: e.clientX, y: e.clientY, time: Date.now() });
    if (this.trail.length > this.maxTrail) {
      this.trail.shift();
    }
    this.renderTrail();
` : ''}
  },
${isLaser ? `
  renderTrail() {
    const now = Date.now();
    const fadeTime = 300;

    // Clear old trail elements
    while (this.trailContainer.firstChild) {
      this.trailContainer.removeChild(this.trailContainer.firstChild);
    }

    this.trail.forEach((point, i) => {
      const age = now - point.time;
      const alpha = Math.max(0, 1 - age / fadeTime);
      if (alpha > 0.1) {
        const dot = document.createElement('div');
        const size = ${size} * alpha;
        dot.style.cssText = \`
          position: fixed;
          width: \${size}px;
          height: \${size}px;
          background: ${color};
          border-radius: 50%;
          pointer-events: none;
          opacity: \${alpha * 0.7};
          left: \${point.x - size/2}px;
          top: \${point.y - size/2}px;
        \`;
        this.trailContainer.appendChild(dot);
      }
    });

    // Clean up old points
    this.trail = this.trail.filter(p => now - p.time < fadeTime);
  },
` : ''}
  onMouseLeave(canvas, e) {
    if (this.element) {
      this.element.style.opacity = '0';
    }
${isLaser ? `
    // Fade out trail
    this.trail = [];
    if (this.trailContainer) {
      while (this.trailContainer.firstChild) {
        this.trailContainer.removeChild(this.trailContainer.firstChild);
      }
    }
` : ''}
  },

  cleanup() {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
${isLaser ? `
    if (this.trailContainer) {
      this.trailContainer.remove();
      this.trailContainer = null;
    }
` : ''}
  }
};`;
}

function generateCircleDrawingBehavior(toolId, pattern) {
  const styles = pattern.styles || {};
  const fillStyle = styles.fillStyle || '#ff0000';
  const globalAlpha = styles.globalAlpha || 1;

  // Check if this is likely a laser pointer (red circle that fades)
  const isLaser = toolId.includes('laser');

  if (isLaser) {
    return `export const ${toolIdToFunctionName(toolId)}Behavior = {
  // Laser pointer - draws fading red dot at cursor
  points: [],
  maxPoints: 50,

  onMouseMove(canvas, e) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Add point with timestamp
    this.points.push({ x, y, time: Date.now() });

    // Keep only recent points
    if (this.points.length > this.maxPoints) {
      this.points.shift();
    }

    // Request animation frame for smooth rendering
    requestAnimationFrame(() => this.render(ctx));
  },

  render(ctx) {
    const now = Date.now();
    const fadeTime = 500; // ms

    this.points.forEach((point, i) => {
      const age = now - point.time;
      const alpha = Math.max(0, 1 - age / fadeTime);

      if (alpha > 0) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '${fillStyle}';
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    // Clean up old points
    this.points = this.points.filter(p => now - p.time < fadeTime);
  },

  onMouseLeave(canvas) {
    // Let points fade naturally
  }
};`;
  }

  // Generic circle drawing - use interaction pattern for correct event handling
  const funcName = toolIdToFunctionName(toolId);
  const interactionPattern = pattern.interactionPattern || 'unknown';

  const coreRenderCode = `    ctx.globalAlpha = ${globalAlpha};
    ctx.fillStyle = '${fillStyle}';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();`;

  return generateBehaviorWithInteractionPattern(
    funcName,
    interactionPattern,
    coreRenderCode,
    { description: 'Circle drawing from captured canvas operations' }
  );
}

function generatePathDrawingBehavior(toolId, pattern) {
  const styles = pattern.styles || {};
  const strokeStyle = styles.strokeStyle || '#000000';
  const lineWidth = styles.lineWidth || 2;

  return `export const ${toolIdToFunctionName(toolId)}Behavior = {
  isDrawing: false,
  lastPoint: null,

  onMouseDown(canvas, e) {
    this.isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    this.lastPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  },

  onMouseMove(canvas, e) {
    if (!this.isDrawing || !canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.save();
    ctx.strokeStyle = '${strokeStyle}';
    ctx.lineWidth = ${lineWidth};
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();

    this.lastPoint = { x, y };
  },

  onMouseUp(canvas, e) {
    this.isDrawing = false;
    this.lastPoint = null;
  }
};`;
}

function generateRectangleDrawingBehavior(toolId, pattern) {
  const styles = pattern.styles || {};
  const strokeStyle = styles.strokeStyle || '#000000';
  const fillStyle = styles.fillStyle || 'transparent';
  const lineWidth = styles.lineWidth || 2;

  return `export const ${toolIdToFunctionName(toolId)}Behavior = {
  isDrawing: false,
  startPoint: null,

  onMouseDown(canvas, e) {
    this.isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    this.startPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  },

  onMouseMove(canvas, e) {
    if (!this.isDrawing || !canvas) return;
    // Preview would be drawn here
  },

  onMouseUp(canvas, e) {
    if (!this.isDrawing || !canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const width = x - this.startPoint.x;
    const height = y - this.startPoint.y;

    ctx.save();
    ctx.strokeStyle = '${strokeStyle}';
    ctx.fillStyle = '${fillStyle}';
    ctx.lineWidth = ${lineWidth};

    if ('${fillStyle}' !== 'transparent') {
      ctx.fillRect(this.startPoint.x, this.startPoint.y, width, height);
    }
    ctx.strokeRect(this.startPoint.x, this.startPoint.y, width, height);
    ctx.restore();

    this.isDrawing = false;
    this.startPoint = null;
  }
};`;
}

function generateTransformBehavior(toolId, pattern) {
  return `export const ${toolIdToFunctionName(toolId)}Behavior = {
  isPanning: false,
  lastPoint: null,
  offset: { x: 0, y: 0 },

  onMouseDown(canvas, e) {
    this.isPanning = true;
    this.lastPoint = { x: e.clientX, y: e.clientY };
  },

  onMouseMove(canvas, e) {
    if (!this.isPanning) return;

    const dx = e.clientX - this.lastPoint.x;
    const dy = e.clientY - this.lastPoint.y;

    this.offset.x += dx;
    this.offset.y += dy;
    this.lastPoint = { x: e.clientX, y: e.clientY };

    // Apply transform to canvas
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, this.offset.x, this.offset.y);
  },

  onMouseUp(canvas, e) {
    this.isPanning = false;
    this.lastPoint = null;
  }
};`;
}

function generateGenericBehavior(toolId, pattern) {
  const ops = pattern.operationSequence || [];
  const funcName = toolIdToFunctionName(toolId);
  const interactionPattern = pattern.interactionPattern || 'unknown';

  // Generate code that replays the exact sequence
  let coreRenderCode = '';

  ops.forEach((op, i) => {
    if (op.type === 'property') {
      coreRenderCode += `    ctx.${op.property} = ${JSON.stringify(op.value)};\n`;
    } else if (op.type === 'method') {
      const args = op.args.map(a => JSON.stringify(a)).join(', ');
      coreRenderCode += `    ctx.${op.method}(${args});\n`;
    }
  });

  if (!coreRenderCode) {
    coreRenderCode = '    // No canvas operations captured\n';
  }

  // Use the interaction pattern helper to generate behavior with correct event handling
  return generateBehaviorWithInteractionPattern(
    funcName,
    interactionPattern,
    coreRenderCode,
    { description: `Captured operation sequence (${ops.length} ops)` }
  );
}

main();
