/**
 * Interaction Pattern Detector
 *
 * When behavior capture fails (0 canvas ops), this module determines
 * the interaction pattern by testing multiple phases:
 *
 * 1. HOVER: Move without clicking - does rendering happen?
 * 2. CLICK: Single click - does rendering happen?
 * 3. DRAG: Click + drag - does rendering happen?
 * 4. POST-RELEASE: Move after release - does rendering continue?
 *
 * This tells us if a tool is:
 * - hover-based (rendering follows mouse always)
 * - click-based (rendering on click only)
 * - drag-based (rendering only while dragging)
 * - click-to-toggle (click starts, click stops)
 */

/**
 * Detect the interaction pattern for a tool
 * @param {Page} page - Playwright page
 * @param {string} toolId - The tool being tested
 * @param {Object} canvasBox - Bounding box of the canvas
 * @returns {Object} Detected interaction pattern
 */
export async function detectInteractionPattern(page, toolId, canvasBox) {
  const results = {
    toolId,
    phases: {},
    detectedPattern: null,
    confidence: 0
  };

  const centerX = canvasBox.x + canvasBox.width / 2;
  const centerY = canvasBox.y + canvasBox.height / 2;

  // Helper to count rendering activity
  async function measureRenderingActivity(duration = 300) {
    const before = await page.evaluate(() => ({
      canvasOps: window.__canvasRecordings?.length || 0,
      rafCalls: window.__rafCallbacks?.length || 0,
      domMutations: window.__domMutations?.length || 0
    }));

    await page.waitForTimeout(duration);

    const after = await page.evaluate(() => ({
      canvasOps: window.__canvasRecordings?.length || 0,
      rafCalls: window.__rafCallbacks?.length || 0,
      domMutations: window.__domMutations?.length || 0
    }));

    return {
      canvasOps: after.canvasOps - before.canvasOps,
      rafCalls: after.rafCalls - before.rafCalls,
      domMutations: after.domMutations - before.domMutations,
      anyActivity: (after.canvasOps - before.canvasOps) > 0 ||
                   (after.domMutations - before.domMutations) > 0
    };
  }

  // Reset counters
  async function resetCounters() {
    await page.evaluate(() => {
      window.__canvasRecordings = [];
      window.__rafCallbacks = [];
      window.__domMutations = [];
    });
  }

  // ============================================
  // PHASE 1: HOVER (move without clicking)
  // ============================================
  await resetCounters();

  // Move mouse in a pattern without clicking
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(centerX - 100 + i * 20, centerY);
    await page.waitForTimeout(30);
  }

  results.phases.hover = await measureRenderingActivity(200);

  // ============================================
  // PHASE 2: CLICK ONLY (single click, no drag)
  // ============================================
  await resetCounters();

  await page.mouse.click(centerX, centerY);

  results.phases.click = await measureRenderingActivity(200);

  // ============================================
  // PHASE 3: DRAG (click + move + release)
  // ============================================
  await resetCounters();

  await page.mouse.move(centerX - 100, centerY + 50);
  await page.mouse.down();

  for (let i = 0; i < 15; i++) {
    await page.mouse.move(centerX - 100 + i * 15, centerY + 50);
    await page.waitForTimeout(20);
  }

  results.phases.drag = await measureRenderingActivity(100);

  await page.mouse.up();

  // ============================================
  // PHASE 4: POST-RELEASE (move after releasing)
  // ============================================
  await resetCounters();

  // Wait a moment after release
  await page.waitForTimeout(100);

  // Move without clicking
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(centerX + i * 20, centerY - 50);
    await page.waitForTimeout(30);
  }

  results.phases.postRelease = await measureRenderingActivity(200);

  // ============================================
  // ANALYZE RESULTS TO DETERMINE PATTERN
  // ============================================
  results.detectedPattern = analyzePattern(results.phases);
  results.confidence = calculateConfidence(results.phases, results.detectedPattern);

  return results;
}

/**
 * Analyze phase results to determine interaction pattern
 */
function analyzePattern(phases) {
  const hover = phases.hover?.anyActivity;
  const click = phases.click?.anyActivity;
  const drag = phases.drag?.anyActivity;
  const postRelease = phases.postRelease?.anyActivity;

  // HOVER-BASED: Renders on hover, continues after release
  if (hover && postRelease) {
    return 'hover';
  }

  // DRAG-BASED: Only renders during drag, stops after release
  if (drag && !hover && !postRelease) {
    return 'drag';
  }

  // CLICK-BASED: Renders on click only
  if (click && !hover && !drag) {
    return 'click';
  }

  // CLICK-TO-START: Click initiates, drag continues, release stops
  if (drag && !hover && !postRelease) {
    return 'click-drag';
  }

  // TOGGLE: Click starts continuous rendering
  if (click && postRelease && !hover) {
    return 'click-toggle';
  }

  // Fallback: Check RAF activity as secondary signal
  if (phases.drag?.rafCalls > phases.hover?.rafCalls * 2) {
    return 'drag';
  }

  return 'unknown';
}

/**
 * Calculate confidence in the detected pattern
 */
function calculateConfidence(phases, pattern) {
  let confidence = 0;

  switch (pattern) {
    case 'hover':
      if (phases.hover?.anyActivity) confidence += 40;
      if (phases.postRelease?.anyActivity) confidence += 40;
      if (!phases.drag?.anyActivity || phases.hover?.canvasOps >= phases.drag?.canvasOps) confidence += 20;
      break;

    case 'drag':
    case 'click-drag':
      if (phases.drag?.anyActivity) confidence += 50;
      if (!phases.hover?.anyActivity) confidence += 25;
      if (!phases.postRelease?.anyActivity) confidence += 25;
      break;

    case 'click':
      if (phases.click?.anyActivity) confidence += 50;
      if (!phases.hover?.anyActivity) confidence += 25;
      if (!phases.drag?.anyActivity) confidence += 25;
      break;

    case 'click-toggle':
      if (phases.click?.anyActivity) confidence += 40;
      if (phases.postRelease?.anyActivity) confidence += 40;
      if (!phases.hover?.anyActivity) confidence += 20;
      break;

    default:
      confidence = 0;
  }

  return confidence;
}

/**
 * Map detected pattern to behavior generator hints
 */
export function getPatternHints(pattern) {
  const hints = {
    hover: {
      usesMouseDown: false,
      usesMouseMove: true,
      usesMouseUp: false,
      requiresClick: false,
      description: 'Renders continuously as mouse moves'
    },
    drag: {
      usesMouseDown: true,
      usesMouseMove: true,
      usesMouseUp: true,
      requiresClick: true,
      description: 'Renders only while mouse is down and moving'
    },
    'click-drag': {
      usesMouseDown: true,
      usesMouseMove: true,
      usesMouseUp: true,
      requiresClick: true,
      description: 'Click to start, drag to continue, release to stop'
    },
    click: {
      usesMouseDown: true,
      usesMouseMove: false,
      usesMouseUp: false,
      requiresClick: true,
      description: 'Single click triggers action'
    },
    'click-toggle': {
      usesMouseDown: true,
      usesMouseMove: true,
      usesMouseUp: false,
      requiresClick: true,
      description: 'Click to start continuous rendering'
    },
    unknown: {
      usesMouseDown: true,
      usesMouseMove: true,
      usesMouseUp: true,
      requiresClick: false,
      description: 'Unknown pattern - using safe defaults'
    }
  };

  return hints[pattern] || hints.unknown;
}

/**
 * Enhanced tool behavior inference using detected pattern
 */
export function inferBehaviorWithPattern(toolId, pattern, patternHints) {
  const toolType = inferToolTypeFromName(toolId);

  return {
    toolType,
    interactionPattern: pattern,
    ...patternHints,
    // Override based on pattern detection
    behaviorConfig: {
      trackIsDrawing: patternHints.requiresClick,
      startOnMouseDown: patternHints.usesMouseDown && patternHints.requiresClick,
      updateOnMouseMove: patternHints.usesMouseMove,
      stopOnMouseUp: patternHints.usesMouseUp && patternHints.requiresClick,
      fadeOnRelease: pattern === 'click-drag' || pattern === 'drag'
    }
  };
}

/**
 * Infer tool type from name (existing function)
 */
function inferToolTypeFromName(toolId) {
  const id = toolId.toLowerCase();

  if (id.includes('laser') || id.includes('pointer')) return 'laser-pointer';
  if (id.includes('lasso') || id.includes('select')) return 'lasso-selection';
  if (id.includes('hand') || id.includes('pan')) return 'pan-tool';
  if (id.includes('frame') || id.includes('artboard')) return 'frame-tool';
  if (id.includes('eraser')) return 'eraser-tool';
  if (id.includes('draw') || id.includes('pencil') || id.includes('brush')) return 'freehand-drawing';
  if (id.includes('rect')) return 'rectangle-shape';
  if (id.includes('ellipse') || id.includes('circle')) return 'ellipse-shape';
  if (id.includes('line')) return 'line-shape';
  if (id.includes('arrow')) return 'arrow-shape';
  if (id.includes('text')) return 'text-tool';

  return 'unknown';
}

export default {
  detectInteractionPattern,
  getPatternHints,
  inferBehaviorWithPattern
};
