/**
 * I/O Spec Synthesis
 *
 * Combine static analysis results to generate complete I/O specifications
 * for every possible interaction. This is pure computation.
 */

const crypto = require('crypto');

/**
 * Synthesize I/O specs from all analysis results
 */
function synthesizeIOSpecs({ elements, css, js, exhaustive, eventListeners }) {
  const specs = [];
  let idCounter = 0;

  // 1. Element-based interactions (from HTML analysis)
  for (const el of elements.interactive) {
    for (const eventType of el.interactionTypes) {
      const spec = createElementSpec(el, eventType, css, js, eventListeners, idCounter++);
      specs.push(spec);
    }
  }

  // 2. CSS state transitions (hover, focus, etc.)
  const processedSelectors = new Set();
  for (const rule of css.stateRules) {
    const key = `${rule.baseSelector}:${rule.state}`;
    if (processedSelectors.has(key)) continue;
    processedSelectors.add(key);

    const spec = createCSSStateSpec(rule, elements, css, idCounter++);
    specs.push(spec);
  }

  // 3. Keyboard shortcuts from exhaustive AST analysis
  if (exhaustive?.shortcuts?.length > 0) {
    const shortcutSpecs = synthesizeExhaustiveKeyboardSpecs(exhaustive.shortcuts, idCounter);
    idCounter += shortcutSpecs.length;
    specs.push(...shortcutSpecs);
  } else {
    // Fall back to basic keyboard spec synthesis
    const keyboardSpecs = synthesizeKeyboardSpecs(js, eventListeners, idCounter);
    idCounter += keyboardSpecs.length;
    specs.push(...keyboardSpecs);
  }

  // 4. Form interactions
  for (const form of elements.forms) {
    const spec = createFormSpec(form, js, idCounter++);
    specs.push(spec);
  }

  // 5. Responsive breakpoints
  for (const breakpoint of css.breakpoints) {
    const spec = createBreakpointSpec(breakpoint, css, elements, idCounter++);
    specs.push(spec);
  }

  // 6. Canvas operations from exhaustive analysis
  if (exhaustive?.canvasOperations?.length > 0) {
    const canvasSpecs = synthesizeCanvasSpecs(exhaustive.canvasOperations, idCounter);
    idCounter += canvasSpecs.length;
    specs.push(...canvasSpecs);
  }

  // 7. Blending modes from exhaustive analysis
  if (exhaustive?.blendingModes?.length > 0) {
    const blendSpecs = synthesizeBlendingModeSpecs(exhaustive.blendingModes, idCounter);
    idCounter += blendSpecs.length;
    specs.push(...blendSpecs);
  }

  // 8. Tool definitions from exhaustive analysis
  if (exhaustive?.toolDefinitions?.length > 0) {
    const toolSpecs = synthesizeToolSpecs(exhaustive.toolDefinitions, idCounter);
    idCounter += toolSpecs.length;
    specs.push(...toolSpecs);
  }

  // 9. Menu items from exhaustive analysis
  if (exhaustive?.menuItems?.length > 0) {
    const menuSpecs = synthesizeMenuSpecs(exhaustive.menuItems, idCounter);
    idCounter += menuSpecs.length;
    specs.push(...menuSpecs);
  }

  // 10. WebGL operations from exhaustive analysis
  if (exhaustive?.webglOperations?.length > 0) {
    const webglSpecs = synthesizeWebGLSpecs(exhaustive.webglOperations, idCounter);
    idCounter += webglSpecs.length;
    specs.push(...webglSpecs);
  }

  // 11. API endpoints from exhaustive analysis
  if (exhaustive?.apiCalls?.length > 0) {
    const apiSpecs = synthesizeAPISpecs(exhaustive.apiCalls, idCounter);
    idCounter += apiSpecs.length;
    specs.push(...apiSpecs);
  }

  // Calculate statistics
  const highConfidence = specs.filter(s => s.confidence >= 0.9).length;
  const needsVerification = specs.filter(s => s.confidence < 0.9).length;

  return {
    specs,
    total: specs.length,
    highConfidence,
    needsVerification,
    byType: {
      element: specs.filter(s => s.type === 'element').length,
      cssState: specs.filter(s => s.type === 'css-state').length,
      keyboard: specs.filter(s => s.type === 'keyboard').length,
      form: specs.filter(s => s.type === 'form').length,
      breakpoint: specs.filter(s => s.type === 'breakpoint').length,
      canvas: specs.filter(s => s.type === 'canvas').length,
      blendMode: specs.filter(s => s.type === 'blend-mode').length,
      tool: specs.filter(s => s.type === 'tool').length,
      menu: specs.filter(s => s.type === 'menu').length,
      webgl: specs.filter(s => s.type === 'webgl').length,
      api: specs.filter(s => s.type === 'api').length
    }
  };
}

/**
 * Create spec for an element interaction
 */
function createElementSpec(element, eventType, css, js, eventListeners, id) {
  // Find matching event listener from CDP extraction
  const listener = findMatchingListener(element, eventType, eventListeners);

  // Find matching handler in JS analysis
  const handler = listener ? findHandler(listener, js) : null;

  // Determine effects from handler analysis
  const effects = handler ? handler.effects : [];

  // Find CSS state changes
  const cssChanges = findCSSChanges(element.selector, eventType, css);

  // Calculate confidence
  const confidence = calculateConfidence({
    hasListener: !!listener,
    hasHandler: !!handler,
    handlerAnalyzed: handler?.effects?.length > 0,
    hasCSSChanges: cssChanges.length > 0
  });

  return {
    id: `io-${id}`,
    type: 'element',
    element: {
      selector: element.selector,
      tag: element.tag,
      id: element.id,
      className: element.className
    },
    eventType,
    input: {
      type: eventType,
      target: element.selector
    },
    output: {
      predicted: {
        domChanges: effects.filter(e => e.type?.startsWith('dom-')),
        styleChanges: [...effects.filter(e => e.type === 'style-change'), ...cssChanges],
        classChanges: effects.filter(e => e.type === 'class-change'),
        networkCalls: effects.filter(e => e.type === 'network'),
        navigation: effects.filter(e => e.type === 'navigation'),
        focus: effects.filter(e => e.type === 'focus'),
        scroll: effects.filter(e => e.type === 'scroll'),
        timer: effects.filter(e => e.type === 'timer')
      },
      cssTransition: findTransition(element.selector, css)
    },
    confidence,
    analysis: {
      listenerFound: !!listener,
      handlerFound: !!handler,
      effectsAnalyzed: effects.length,
      cssStatesFound: cssChanges.length
    }
  };
}

/**
 * Create spec for a CSS state transition
 */
function createCSSStateSpec(rule, elements, css, id) {
  // Find elements this rule applies to
  const matchingElements = findMatchingElements(rule.baseSelector, elements);

  // This is a visual change only - high confidence
  return {
    id: `io-${id}`,
    type: 'css-state',
    selector: rule.selector,
    baseSelector: rule.baseSelector,
    state: rule.state,
    mediaQuery: rule.mediaQuery,
    input: {
      type: stateToEventType(rule.state),
      target: rule.baseSelector
    },
    output: {
      predicted: {
        styleChanges: rule.declarations.map(d => ({
          property: d.property,
          value: d.value
        }))
      },
      cssTransition: findTransition(rule.baseSelector, css)
    },
    matchingElements: matchingElements.length,
    confidence: 1.0 // CSS rules are deterministic
  };
}

/**
 * Synthesize keyboard shortcut specs
 */
function synthesizeKeyboardSpecs(js, eventListeners, startId) {
  const specs = [];
  let id = startId;

  // Find keyboard event listeners
  const keyListeners = eventListeners.filter(l =>
    ['keydown', 'keyup', 'keypress'].includes(l.type)
  );

  // Also check JS analysis for keyboard bindings
  const keyBindings = js.eventBindings.filter(b =>
    ['keydown', 'keyup', 'keypress'].includes(b.eventType)
  );

  // Common keyboard shortcuts to check
  const commonShortcuts = [
    { key: 'Escape', modifiers: [] },
    { key: 'Enter', modifiers: [] },
    { key: 'Tab', modifiers: [] },
    { key: 'Tab', modifiers: ['Shift'] },
    { key: 'Space', modifiers: [] },
    { key: 'ArrowUp', modifiers: [] },
    { key: 'ArrowDown', modifiers: [] },
    { key: 'ArrowLeft', modifiers: [] },
    { key: 'ArrowRight', modifiers: [] },
    // Common app shortcuts
    { key: 'k', modifiers: ['Meta'] }, // Command palette
    { key: 'p', modifiers: ['Meta'] }, // Quick open
    { key: 's', modifiers: ['Meta'] }, // Save
    { key: 'z', modifiers: ['Meta'] }, // Undo
    { key: 'z', modifiers: ['Meta', 'Shift'] }, // Redo
    { key: '/', modifiers: [] }, // Search
    { key: '?', modifiers: [] }, // Help
  ];

  // If there are keyboard listeners, add specs for them
  if (keyListeners.length > 0 || keyBindings.length > 0) {
    for (const shortcut of commonShortcuts) {
      const handler = findKeyboardHandler(shortcut, js, keyBindings);

      specs.push({
        id: `io-${id++}`,
        type: 'keyboard',
        shortcut,
        input: {
          type: 'keydown',
          key: shortcut.key,
          modifiers: shortcut.modifiers
        },
        output: {
          predicted: {
            effects: handler?.effects || []
          }
        },
        confidence: handler ? 0.8 : 0.5, // Need verification
        analysis: {
          handlerFound: !!handler,
          listenersFound: keyListeners.length
        }
      });
    }
  }

  return specs;
}

/**
 * Create spec for form submission
 */
function createFormSpec(form, js, id) {
  // Find submit handler
  const submitHandler = js.eventBindings.find(b =>
    b.eventType === 'submit' &&
    (b.callee?.includes(form.selector) || b.callee?.includes('form'))
  );

  // Check for AJAX submission patterns
  const isAjaxSubmit = submitHandler?.handler &&
    js.functions.find(f => f.name === submitHandler.handler)?.effects
      ?.some(e => e.type === 'network');

  return {
    id: `io-${id}`,
    type: 'form',
    form: {
      selector: form.selector,
      action: form.action,
      method: form.method,
      fields: form.fields.length
    },
    input: {
      type: 'submit',
      target: form.selector,
      fields: form.fields.map(f => f.name)
    },
    output: {
      predicted: {
        navigation: !isAjaxSubmit && form.action ? [{ url: form.action }] : [],
        networkCalls: isAjaxSubmit ? [{ method: form.method, url: form.action }] : [],
        validation: form.hasValidation ? 'client-side' : 'none'
      }
    },
    confidence: form.action ? 0.9 : 0.7,
    analysis: {
      hasAction: !!form.action,
      isAjax: isAjaxSubmit,
      hasValidation: form.hasValidation
    }
  };
}

/**
 * Create spec for responsive breakpoint
 */
function createBreakpointSpec(breakpoint, css, elements, id) {
  // Find rules that change at this breakpoint
  const mediaRules = css.stateRules.filter(r =>
    r.mediaQuery?.includes(breakpoint)
  );

  return {
    id: `io-${id}`,
    type: 'breakpoint',
    breakpoint,
    input: {
      type: 'viewport-resize',
      width: parseInt(breakpoint)
    },
    output: {
      predicted: {
        styleChanges: mediaRules.flatMap(r =>
          r.declarations.map(d => ({
            selector: r.selector,
            property: d.property,
            value: d.value
          }))
        )
      }
    },
    rulesAffected: mediaRules.length,
    confidence: 1.0 // CSS is deterministic
  };
}

/**
 * Find matching event listener from CDP data
 */
function findMatchingListener(element, eventType, listeners) {
  return listeners.find(l =>
    l.type === eventType &&
    (l.path?.includes(element.tag) ||
     l.path?.includes(element.id) ||
     l.path?.includes(element.className?.split(' ')[0]))
  );
}

/**
 * Find handler function from JS analysis
 */
function findHandler(listener, js) {
  // Try to match by handler description
  if (listener.handler) {
    // Look for named function
    const fn = js.functions.find(f =>
      listener.handler.includes(f.name) ||
      f.name === listener.handler
    );
    if (fn) return fn;
  }

  // Look for binding at same location
  const binding = js.eventBindings.find(b =>
    b.loc?.start?.line === listener.lineNumber &&
    b.eventType === listener.type
  );

  if (binding?.handler) {
    return js.functions.find(f => f.name === binding.handler);
  }

  return null;
}

/**
 * Find CSS changes for a state
 */
function findCSSChanges(selector, eventType, css) {
  const state = eventTypeToState(eventType);
  if (!state) return [];

  return css.stateRules
    .filter(r => r.state === state && matchesSelector(r.baseSelector, selector))
    .flatMap(r => r.declarations.map(d => ({
      property: d.property,
      value: d.value,
      selector: r.selector
    })));
}

/**
 * Find CSS transition for a selector
 */
function findTransition(selector, css) {
  const transition = css.transitions.find(t =>
    matchesSelector(t.selector, selector)
  );
  return transition?.transition || null;
}

/**
 * Find elements matching a selector
 */
function findMatchingElements(selector, elements) {
  // Simplified matching
  return elements.elements.filter(el =>
    matchesSelector(selector, el.selector)
  );
}

/**
 * Check if two selectors might match the same element
 */
function matchesSelector(ruleSelector, elementSelector) {
  // Very simplified - in production would use proper CSS selector matching
  const ruleParts = ruleSelector.split(/[\s>+~]/);
  const elementParts = elementSelector.split(/[\s>+~]/);

  return ruleParts.some(rp =>
    elementParts.some(ep =>
      rp === ep ||
      ep.includes(rp) ||
      rp.includes(ep) ||
      (rp.startsWith('.') && ep.includes(rp)) ||
      (rp.startsWith('#') && ep.includes(rp))
    )
  );
}

/**
 * Map event type to CSS pseudo-class state
 */
function eventTypeToState(eventType) {
  const mapping = {
    hover: 'hover',
    click: 'active',
    mousedown: 'active',
    focus: 'focus',
    blur: 'focus',
    input: 'focus',
    change: 'checked',
    check: 'checked'
  };
  return mapping[eventType] || null;
}

/**
 * Map CSS state to event type
 */
function stateToEventType(state) {
  const mapping = {
    hover: 'hover',
    active: 'mousedown',
    focus: 'focus',
    'focus-within': 'focus',
    'focus-visible': 'focus',
    visited: 'click',
    checked: 'change',
    disabled: null,
    valid: 'input',
    invalid: 'input'
  };
  return mapping[state] || state;
}

/**
 * Find keyboard handler
 */
function findKeyboardHandler(shortcut, js, keyBindings) {
  // Look for matching binding
  const binding = keyBindings.find(b =>
    b.eventType === 'keydown' || b.eventType === 'keyup'
  );

  if (binding?.handler) {
    return js.functions.find(f => f.name === binding.handler);
  }

  return null;
}

/**
 * Calculate confidence score
 */
function calculateConfidence({ hasListener, hasHandler, handlerAnalyzed, hasCSSChanges }) {
  let score = 0.5; // Base confidence

  if (hasListener) score += 0.15;
  if (hasHandler) score += 0.15;
  if (handlerAnalyzed) score += 0.15;
  if (hasCSSChanges) score += 0.05;

  return Math.min(score, 1.0);
}

/**
 * Synthesize keyboard specs from exhaustive AST analysis
 */
function synthesizeExhaustiveKeyboardSpecs(shortcuts, startId) {
  const specs = [];
  let id = startId;

  for (const shortcut of shortcuts) {
    specs.push({
      id: `io-${id++}`,
      type: 'keyboard',
      shortcut: {
        key: shortcut.key,
        modifiers: shortcut.modifiers || [],
        keyCode: shortcut.keyCode,
        pattern: shortcut.pattern
      },
      input: {
        type: 'keydown',
        key: shortcut.key,
        modifiers: shortcut.modifiers || []
      },
      output: {
        predicted: {
          effects: [] // Will be determined from handler analysis or runtime
        }
      },
      source: shortcut.source || 'ast',
      confidence: shortcut.modifiers?.length > 0 ? 0.9 : 0.8 // Higher confidence for modifier combinations
    });
  }

  return specs;
}

/**
 * Synthesize canvas operation specs
 */
function synthesizeCanvasSpecs(operations, startId) {
  const specs = [];
  let id = startId;
  const seenMethods = new Set();

  for (const op of operations) {
    if (seenMethods.has(op.method)) continue;
    seenMethods.add(op.method);

    specs.push({
      id: `io-${id++}`,
      type: 'canvas',
      operation: op.method,
      callee: op.callee,
      input: {
        type: 'canvas-operation',
        method: op.method
      },
      output: {
        predicted: {
          canvasEffect: getCanvasEffectType(op.method)
        }
      },
      confidence: 1.0 // Canvas methods are deterministic
    });
  }

  return specs;
}

/**
 * Get canvas effect type for a method
 */
function getCanvasEffectType(method) {
  const drawMethods = ['fillRect', 'strokeRect', 'clearRect', 'fill', 'stroke', 'fillText', 'strokeText', 'drawImage'];
  const pathMethods = ['beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'bezierCurveTo', 'quadraticCurveTo'];
  const transformMethods = ['save', 'restore', 'scale', 'rotate', 'translate', 'transform', 'setTransform'];
  const gradientMethods = ['createLinearGradient', 'createRadialGradient', 'createPattern'];
  const imageDataMethods = ['getImageData', 'putImageData', 'createImageData'];

  if (drawMethods.includes(method)) return 'draw';
  if (pathMethods.includes(method)) return 'path';
  if (transformMethods.includes(method)) return 'transform';
  if (gradientMethods.includes(method)) return 'gradient';
  if (imageDataMethods.includes(method)) return 'imageData';
  return 'other';
}

/**
 * Synthesize blending mode specs
 */
function synthesizeBlendingModeSpecs(modes, startId) {
  const specs = [];
  let id = startId;

  for (const mode of modes) {
    specs.push({
      id: `io-${id++}`,
      type: 'blend-mode',
      mode,
      input: {
        type: 'blend-mode-change',
        value: mode
      },
      output: {
        predicted: {
          compositeOperation: mode,
          visualEffect: getBlendModeDescription(mode)
        }
      },
      confidence: 1.0 // Blending modes are deterministic
    });
  }

  return specs;
}

/**
 * Get human-readable description of blending mode
 */
function getBlendModeDescription(mode) {
  const descriptions = {
    'source-over': 'Default composition - new content drawn over existing',
    'source-in': 'New content only where both exist',
    'source-out': 'New content only where it does not overlap',
    'source-atop': 'New content only where existing exists',
    'destination-over': 'New content behind existing',
    'destination-in': 'Existing content only where both exist',
    'destination-out': 'Existing content only where it does not overlap',
    'destination-atop': 'Existing content only where new exists',
    'lighter': 'Adds color values',
    'copy': 'Replaces existing content',
    'xor': 'Exclusive OR - only non-overlapping shown',
    'multiply': 'Multiplies colors (darken)',
    'screen': 'Inverse multiply (lighten)',
    'overlay': 'Multiply or screen based on background',
    'darken': 'Keep darker pixels',
    'lighten': 'Keep lighter pixels',
    'color-dodge': 'Brighten to reflect source',
    'color-burn': 'Darken to reflect source',
    'hard-light': 'Multiply or screen based on source',
    'soft-light': 'Subtle darkening/lightening',
    'difference': 'Subtract colors',
    'exclusion': 'Softer difference',
    'hue': 'Use source hue with dest saturation/luminosity',
    'saturation': 'Use source saturation with dest hue/luminosity',
    'color': 'Use source hue/saturation with dest luminosity',
    'luminosity': 'Use source luminosity with dest hue/saturation'
  };
  return descriptions[mode] || mode;
}

/**
 * Synthesize tool definition specs
 */
function synthesizeToolSpecs(tools, startId) {
  const specs = [];
  let id = startId;

  for (const tool of tools) {
    specs.push({
      id: `io-${id++}`,
      type: 'tool',
      tool: {
        name: tool.name,
        id: tool.id,
        icon: tool.icon,
        cursor: tool.cursor,
        shortcut: tool.shortcut
      },
      input: {
        type: 'tool-select',
        toolName: tool.name
      },
      output: {
        predicted: {
          cursorChange: tool.cursor,
          toolbarHighlight: tool.name,
          optionsPanel: `${tool.name} options`
        }
      },
      confidence: 0.9 // High confidence from source analysis
    });
  }

  return specs;
}

/**
 * Synthesize menu item specs
 */
function synthesizeMenuSpecs(menuItems, startId) {
  const specs = [];
  let id = startId;

  for (const item of menuItems) {
    specs.push({
      id: `io-${id++}`,
      type: 'menu',
      menu: {
        label: item.label,
        path: item.path,
        command: item.command,
        shortcut: item.shortcut
      },
      input: {
        type: 'menu-click',
        path: item.path || [item.label]
      },
      output: {
        predicted: {
          command: item.command,
          dialogOpen: item.label?.includes('...') || false
        }
      },
      confidence: 0.85 // Menu items may have dynamic behavior
    });
  }

  return specs;
}

/**
 * Synthesize WebGL operation specs
 */
function synthesizeWebGLSpecs(operations, startId) {
  const specs = [];
  let id = startId;
  const seenMethods = new Set();

  for (const op of operations) {
    if (seenMethods.has(op.method)) continue;
    seenMethods.add(op.method);

    specs.push({
      id: `io-${id++}`,
      type: 'webgl',
      operation: op.method,
      input: {
        type: 'webgl-operation',
        method: op.method
      },
      output: {
        predicted: {
          gpuEffect: getWebGLEffectType(op.method)
        }
      },
      confidence: 1.0 // WebGL methods are deterministic
    });
  }

  return specs;
}

/**
 * Get WebGL effect type for a method
 */
function getWebGLEffectType(method) {
  const drawMethods = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'];
  const shaderMethods = ['createShader', 'shaderSource', 'compileShader', 'createProgram', 'attachShader', 'linkProgram', 'useProgram'];
  const bufferMethods = ['createBuffer', 'bindBuffer', 'bufferData'];
  const textureMethods = ['createTexture', 'bindTexture', 'texImage2D', 'texParameteri'];
  const stateMethods = ['enable', 'disable', 'blendFunc', 'blendFuncSeparate', 'blendEquation'];

  if (drawMethods.includes(method)) return 'draw';
  if (shaderMethods.includes(method)) return 'shader';
  if (bufferMethods.includes(method)) return 'buffer';
  if (textureMethods.includes(method)) return 'texture';
  if (stateMethods.includes(method)) return 'state';
  return 'other';
}

/**
 * Synthesize API call specs
 */
function synthesizeAPISpecs(apiCalls, startId) {
  const specs = [];
  let id = startId;
  const seenUrls = new Set();

  for (const call of apiCalls) {
    const urlKey = call.url || call.callee;
    if (seenUrls.has(urlKey)) continue;
    seenUrls.add(urlKey);

    specs.push({
      id: `io-${id++}`,
      type: 'api',
      api: {
        type: call.type,
        url: call.url,
        method: call.method || 'GET'
      },
      input: {
        type: 'api-request',
        url: call.url,
        method: call.method || 'GET'
      },
      output: {
        predicted: {
          responseType: 'json', // Assumption
          sideEffects: [] // Depends on response handling
        }
      },
      confidence: 0.7 // API responses are dynamic
    });
  }

  return specs;
}

module.exports = { synthesizeIOSpecs };
