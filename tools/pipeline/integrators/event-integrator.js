/**
 * Event Integrator
 *
 * Generates JavaScript to wire captured event listeners:
 * - DOM event listeners (click, mouseover, etc.)
 * - Keyboard shortcuts
 * - Touch gestures
 * - Behavioral interactions
 *
 * Part of V6 Reconstruction Integration
 */

/**
 * Generate event listener wiring code
 * @param {Object} data - eventListener extraction data
 * @returns {string} JavaScript code
 */
export function generateEventListenerJS(data) {
  if (!data || !data.listeners || data.listeners.length === 0) return '';

  const lines = [];
  lines.push('// Event Listener Wiring (from extraction)');
  lines.push('');

  // Group listeners by selector for cleaner output
  const bySelector = {};
  const windowListeners = [];
  const documentListeners = [];

  data.listeners.forEach(listener => {
    if (!listener.active) return; // Skip inactive/removed listeners

    if (listener.selector === 'window') {
      windowListeners.push(listener);
    } else if (listener.selector === 'document') {
      documentListeners.push(listener);
    } else {
      if (!bySelector[listener.selector]) {
        bySelector[listener.selector] = [];
      }
      bySelector[listener.selector].push(listener);
    }
  });

  // Window listeners
  if (windowListeners.length > 0) {
    lines.push('// Window-level listeners');
    windowListeners.forEach(l => {
      const options = formatListenerOptions(l);
      lines.push(`window.addEventListener('${l.eventType}', (e) => {`);
      lines.push(`  // Handler: ${l.listener?.name || 'anonymous'}`);
      lines.push(`  console.log('[Event] window.${l.eventType}', e);`);
      lines.push(`}${options});`);
    });
    lines.push('');
  }

  // Document listeners
  if (documentListeners.length > 0) {
    lines.push('// Document-level listeners');
    documentListeners.forEach(l => {
      const options = formatListenerOptions(l);
      lines.push(`document.addEventListener('${l.eventType}', (e) => {`);
      lines.push(`  // Handler: ${l.listener?.name || 'anonymous'}`);
      lines.push(`  console.log('[Event] document.${l.eventType}', e);`);
      lines.push(`}${options});`);
    });
    lines.push('');
  }

  // Element listeners
  for (const [selector, listeners] of Object.entries(bySelector)) {
    lines.push(`// Listeners for: ${selector}`);
    lines.push(`(function() {`);
    lines.push(`  const elements = document.querySelectorAll('${escapeSelector(selector)}');`);
    lines.push(`  elements.forEach(el => {`);

    listeners.forEach(l => {
      const options = formatListenerOptions(l);
      lines.push(`    el.addEventListener('${l.eventType}', (e) => {`);
      lines.push(`      // Handler: ${l.listener?.name || 'anonymous'}`);
      lines.push(`      console.log('[Event] ${selector}.${l.eventType}', e);`);
      lines.push(`    }${options});`);
    });

    lines.push(`  });`);
    lines.push(`})();`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate inline handler code
 * @param {Object} data - eventListener extraction data (inline handlers)
 * @returns {string} JavaScript code to apply inline handlers
 */
export function generateInlineHandlersJS(data) {
  if (!data || !data.inline || data.inline.length === 0) return '';

  const lines = [];
  lines.push('// Inline Event Handlers (from extraction)');
  lines.push('');

  data.inline.forEach(handler => {
    lines.push(`// ${handler.selector} ${handler.attribute}`);
    lines.push(`(function() {`);
    lines.push(`  const el = document.querySelector('${escapeSelector(handler.selector)}');`);
    lines.push(`  if (el) {`);
    lines.push(`    el.${handler.attribute} = function(event) {`);
    lines.push(`      ${handler.code || '// Original handler code not captured'}`);
    lines.push(`    };`);
    lines.push(`  }`);
    lines.push(`})();`);
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Generate keyboard shortcut handlers
 * @param {Object} data - keyboardShortcut exploration data
 * @returns {string} JavaScript code
 */
export function generateKeyboardShortcutsJS(data) {
  if (!data || !data.shortcuts || data.shortcuts.length === 0) return '';

  const lines = [];
  lines.push('// Keyboard Shortcuts (from extraction)');
  lines.push('');
  lines.push('const keyboardShortcuts = {');

  // Group by modifier keys
  const simpleKeys = [];
  const ctrlKeys = [];
  const shiftKeys = [];
  const altKeys = [];
  const metaKeys = [];

  data.shortcuts.forEach(shortcut => {
    const entry = {
      key: shortcut.key,
      effect: shortcut.effect || 'state change',
      stateChange: shortcut.stateChange,
    };

    if (shortcut.modifiers?.ctrl) {
      ctrlKeys.push(entry);
    } else if (shortcut.modifiers?.shift) {
      shiftKeys.push(entry);
    } else if (shortcut.modifiers?.alt) {
      altKeys.push(entry);
    } else if (shortcut.modifiers?.meta) {
      metaKeys.push(entry);
    } else {
      simpleKeys.push(entry);
    }
  });

  // Simple keys (no modifiers)
  if (simpleKeys.length > 0) {
    lines.push('  simple: {');
    simpleKeys.forEach(s => {
      lines.push(`    '${s.key}': { effect: '${s.effect}' },`);
    });
    lines.push('  },');
  }

  // Ctrl+key
  if (ctrlKeys.length > 0) {
    lines.push('  ctrl: {');
    ctrlKeys.forEach(s => {
      lines.push(`    '${s.key}': { effect: '${s.effect}' },`);
    });
    lines.push('  },');
  }

  // Shift+key
  if (shiftKeys.length > 0) {
    lines.push('  shift: {');
    shiftKeys.forEach(s => {
      lines.push(`    '${s.key}': { effect: '${s.effect}' },`);
    });
    lines.push('  },');
  }

  // Alt+key
  if (altKeys.length > 0) {
    lines.push('  alt: {');
    altKeys.forEach(s => {
      lines.push(`    '${s.key}': { effect: '${s.effect}' },`);
    });
    lines.push('  },');
  }

  // Meta+key (Cmd on Mac)
  if (metaKeys.length > 0) {
    lines.push('  meta: {');
    metaKeys.forEach(s => {
      lines.push(`    '${s.key}': { effect: '${s.effect}' },`);
    });
    lines.push('  },');
  }

  lines.push('};');
  lines.push('');

  // Generate handler
  lines.push('function handleKeyboardShortcut(e) {');
  lines.push('  const key = e.key.toLowerCase();');
  lines.push('  let shortcut = null;');
  lines.push('');
  lines.push('  // Skip if typing in input');
  lines.push('  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) {');
  lines.push('    return;');
  lines.push('  }');
  lines.push('');
  lines.push('  if (e.ctrlKey && keyboardShortcuts.ctrl?.[key]) {');
  lines.push('    shortcut = keyboardShortcuts.ctrl[key];');
  lines.push('  } else if (e.shiftKey && keyboardShortcuts.shift?.[key]) {');
  lines.push('    shortcut = keyboardShortcuts.shift[key];');
  lines.push('  } else if (e.altKey && keyboardShortcuts.alt?.[key]) {');
  lines.push('    shortcut = keyboardShortcuts.alt[key];');
  lines.push('  } else if (e.metaKey && keyboardShortcuts.meta?.[key]) {');
  lines.push('    shortcut = keyboardShortcuts.meta[key];');
  lines.push('  } else if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && keyboardShortcuts.simple?.[key]) {');
  lines.push('    shortcut = keyboardShortcuts.simple[key];');
  lines.push('  }');
  lines.push('');
  lines.push('  if (shortcut) {');
  lines.push('    console.log("[Shortcut]", key, shortcut.effect);');
  lines.push('    // Emit custom event for app to handle');
  lines.push('    document.dispatchEvent(new CustomEvent("shortcut", { detail: { key, ...shortcut } }));');
  lines.push('  }');
  lines.push('}');
  lines.push('');
  lines.push('document.addEventListener("keydown", handleKeyboardShortcut);');

  return lines.join('\n');
}

/**
 * Generate touch gesture handlers
 * @param {Object} data - touchGesture exploration data
 * @returns {string} JavaScript code
 */
export function generateTouchGesturesJS(data) {
  if (!data || !data.gestures || data.gestures.length === 0) return '';

  const lines = [];
  lines.push('// Touch Gesture Handlers (from extraction)');
  lines.push('');

  // Generate touch tracking state
  lines.push('const touchState = {');
  lines.push('  startX: 0,');
  lines.push('  startY: 0,');
  lines.push('  startTime: 0,');
  lines.push('  touches: [],');
  lines.push('  initialPinchDistance: 0,');
  lines.push('};');
  lines.push('');

  // Detected gestures from extraction
  const gestureTypes = new Set(data.gestures.map(g => g.type));

  lines.push('const detectedGestures = {');
  data.gestures.forEach(g => {
    lines.push(`  '${g.type}': {`);
    lines.push(`    selector: '${g.selector || 'body'}',`);
    lines.push(`    effect: '${g.effect || 'state change'}',`);
    if (g.threshold) {
      lines.push(`    threshold: ${g.threshold},`);
    }
    lines.push(`  },`);
  });
  lines.push('};');
  lines.push('');

  // Touch start handler
  lines.push('function handleTouchStart(e) {');
  lines.push('  touchState.startX = e.touches[0].clientX;');
  lines.push('  touchState.startY = e.touches[0].clientY;');
  lines.push('  touchState.startTime = Date.now();');
  lines.push('  touchState.touches = Array.from(e.touches);');
  lines.push('');
  lines.push('  // Pinch detection');
  lines.push('  if (e.touches.length === 2) {');
  lines.push('    const dx = e.touches[0].clientX - e.touches[1].clientX;');
  lines.push('    const dy = e.touches[0].clientY - e.touches[1].clientY;');
  lines.push('    touchState.initialPinchDistance = Math.sqrt(dx * dx + dy * dy);');
  lines.push('  }');
  lines.push('}');
  lines.push('');

  // Touch move handler
  lines.push('function handleTouchMove(e) {');
  lines.push('  if (e.touches.length === 2 && touchState.initialPinchDistance > 0) {');
  lines.push('    // Pinch gesture');
  lines.push('    const dx = e.touches[0].clientX - e.touches[1].clientX;');
  lines.push('    const dy = e.touches[0].clientY - e.touches[1].clientY;');
  lines.push('    const currentDistance = Math.sqrt(dx * dx + dy * dy);');
  lines.push('    const scale = currentDistance / touchState.initialPinchDistance;');
  lines.push('');
  lines.push('    if (detectedGestures.pinch) {');
  lines.push('      document.dispatchEvent(new CustomEvent("gesture", {');
  lines.push('        detail: { type: "pinch", scale }');
  lines.push('      }));');
  lines.push('    }');
  lines.push('  }');
  lines.push('}');
  lines.push('');

  // Touch end handler
  lines.push('function handleTouchEnd(e) {');
  lines.push('  const dx = e.changedTouches[0].clientX - touchState.startX;');
  lines.push('  const dy = e.changedTouches[0].clientY - touchState.startY;');
  lines.push('  const duration = Date.now() - touchState.startTime;');
  lines.push('  const distance = Math.sqrt(dx * dx + dy * dy);');
  lines.push('');
  lines.push('  // Tap detection');
  lines.push('  if (duration < 200 && distance < 10 && detectedGestures.tap) {');
  lines.push('    document.dispatchEvent(new CustomEvent("gesture", {');
  lines.push('      detail: { type: "tap", x: touchState.startX, y: touchState.startY }');
  lines.push('    }));');
  lines.push('  }');
  lines.push('');
  lines.push('  // Swipe detection');
  lines.push('  if (duration < 500 && distance > 50) {');
  lines.push('    const direction = Math.abs(dx) > Math.abs(dy)');
  lines.push('      ? (dx > 0 ? "right" : "left")');
  lines.push('      : (dy > 0 ? "down" : "up");');
  lines.push('');
  lines.push('    if (detectedGestures.swipe || detectedGestures[`swipe-${direction}`]) {');
  lines.push('      document.dispatchEvent(new CustomEvent("gesture", {');
  lines.push('        detail: { type: "swipe", direction, distance }');
  lines.push('      }));');
  lines.push('    }');
  lines.push('  }');
  lines.push('');
  lines.push('  // Long press detection');
  lines.push('  if (duration > 500 && distance < 10 && detectedGestures.longPress) {');
  lines.push('    document.dispatchEvent(new CustomEvent("gesture", {');
  lines.push('      detail: { type: "longPress", x: touchState.startX, y: touchState.startY }');
  lines.push('    }));');
  lines.push('  }');
  lines.push('');
  lines.push('  // Reset pinch state');
  lines.push('  touchState.initialPinchDistance = 0;');
  lines.push('}');
  lines.push('');

  // Attach handlers
  lines.push('document.addEventListener("touchstart", handleTouchStart, { passive: true });');
  lines.push('document.addEventListener("touchmove", handleTouchMove, { passive: true });');
  lines.push('document.addEventListener("touchend", handleTouchEnd, { passive: true });');

  return lines.join('\n');
}

/**
 * Generate behavioral interaction replay
 * @param {Object} data - behavioral extraction data
 * @returns {string} JavaScript code
 */
export function generateBehavioralJS(data) {
  if (!data || !data.interactions || data.interactions.length === 0) return '';

  const lines = [];
  lines.push('// Behavioral Interactions (from extraction)');
  lines.push('');
  lines.push('const capturedInteractions = [');

  data.interactions.forEach(interaction => {
    lines.push('  {');
    lines.push(`    selector: '${escapeSelector(interaction.selector)}',`);
    lines.push(`    action: '${interaction.action}',`);
    if (interaction.effect) {
      lines.push(`    effect: '${interaction.effect}',`);
    }
    if (interaction.stateChange) {
      lines.push(`    stateChange: ${JSON.stringify(interaction.stateChange)},`);
    }
    lines.push('  },');
  });

  lines.push('];');
  lines.push('');
  lines.push('// Log for debugging');
  lines.push('console.log("[Behaviors] Captured", capturedInteractions.length, "interactions");');

  return lines.join('\n');
}

/**
 * Combine all JS generation into one
 * @param {Object} extractionData - Full extraction results
 * @returns {string} Combined JavaScript
 */
export function generateAllJS(extractionData) {
  const sections = [];

  // Header
  sections.push(`/**
 * V6 Integrated JavaScript
 * Generated from extraction data
 * ${new Date().toISOString()}
 */

(function() {
  'use strict';
`);

  // Event listeners
  const eventListenerJS = generateEventListenerJS(extractionData.eventListener);
  if (eventListenerJS) {
    sections.push('  // ============================================');
    sections.push('  // EVENT LISTENERS');
    sections.push('  // ============================================');
    sections.push(indent(eventListenerJS, 2));
    sections.push('');
  }

  // Inline handlers
  const inlineJS = generateInlineHandlersJS(extractionData.eventListener);
  if (inlineJS) {
    sections.push('  // ============================================');
    sections.push('  // INLINE HANDLERS');
    sections.push('  // ============================================');
    sections.push(indent(inlineJS, 2));
    sections.push('');
  }

  // Keyboard shortcuts
  const keyboardJS = generateKeyboardShortcutsJS(extractionData.keyboardShortcuts);
  if (keyboardJS) {
    sections.push('  // ============================================');
    sections.push('  // KEYBOARD SHORTCUTS');
    sections.push('  // ============================================');
    sections.push(indent(keyboardJS, 2));
    sections.push('');
  }

  // Touch gestures
  const touchJS = generateTouchGesturesJS(extractionData.touchGestures);
  if (touchJS) {
    sections.push('  // ============================================');
    sections.push('  // TOUCH GESTURES');
    sections.push('  // ============================================');
    sections.push(indent(touchJS, 2));
    sections.push('');
  }

  // Behavioral
  const behavioralJS = generateBehavioralJS(extractionData.behavioral);
  if (behavioralJS) {
    sections.push('  // ============================================');
    sections.push('  // BEHAVIORAL INTERACTIONS');
    sections.push('  // ============================================');
    sections.push(indent(behavioralJS, 2));
    sections.push('');
  }

  // Footer
  sections.push(`
  console.log('[V6 Integration] Event wiring complete');
})();`);

  return sections.join('\n');
}

/**
 * Get statistics about generated JS
 * @param {Object} extractionData - Full extraction results
 * @returns {Object} Stats
 */
export function getEventStats(extractionData) {
  return {
    eventListeners: extractionData.eventListener?.listeners?.length || 0,
    inlineHandlers: extractionData.eventListener?.inline?.length || 0,
    keyboardShortcuts: extractionData.keyboardShortcuts?.shortcuts?.length || 0,
    touchGestures: extractionData.touchGestures?.gestures?.length || 0,
    behavioralInteractions: extractionData.behavioral?.interactions?.length || 0,
  };
}

// Helper: Format listener options
function formatListenerOptions(listener) {
  const options = [];
  if (listener.options?.capture) options.push('capture: true');
  if (listener.options?.passive) options.push('passive: true');
  if (listener.options?.once) options.push('once: true');

  if (options.length === 0) return '';
  return `, { ${options.join(', ')} }`;
}

// Helper: Escape CSS selector for JS
function escapeSelector(selector) {
  return selector.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// Helper: Indent code
function indent(code, spaces) {
  const prefix = ' '.repeat(spaces);
  return code.split('\n').map(line => prefix + line).join('\n');
}

export default {
  generateEventListenerJS,
  generateInlineHandlersJS,
  generateKeyboardShortcutsJS,
  generateTouchGesturesJS,
  generateBehavioralJS,
  generateAllJS,
  getEventStats,
};
