/**
 * Touch Gesture Explorer
 *
 * Systematically discovers touch-based interactions:
 * - Tap (single touch)
 * - Double tap
 * - Long press
 * - Swipe (left, right, up, down)
 * - Pinch (zoom in/out)
 * - Pan/drag
 * - Multi-touch gestures
 *
 * Tests on both:
 * - Global level (anywhere on page)
 * - Specific elements (carousels, maps, images, etc.)
 */

export const touchGestureExplorer = {
  name: 'touch-gesture-explorer',

  // Common touch targets
  TOUCH_TARGET_SELECTORS: [
    // Carousels/Sliders
    '.carousel', '.slider', '.swiper', '[data-carousel]', '[data-swiper]',
    '.slick-slider', '.owl-carousel', '.glide',

    // Images/Galleries
    '.gallery', '.lightbox', '[data-gallery]', 'img[data-zoom]',
    '.image-container', '.photo-viewer',

    // Maps
    '.map', '[data-map]', '.leaflet-container', '.mapboxgl-map',
    '#map', '.google-map',

    // Lists/Grids
    '.list', '.grid', '[data-list]', 'ul', 'ol',
    '.sortable', '[data-sortable]', '.draggable-list',

    // Modals/Drawers
    '.drawer', '.sheet', '.bottom-sheet', '[data-drawer]',
    '.sidebar', '.panel', '.offcanvas',

    // Canvas/Interactive
    'canvas', 'svg', '.canvas-container',

    // Generic scrollable
    '[style*="overflow: auto"]', '[style*="overflow: scroll"]',
    '[style*="overflow-x: auto"]', '[style*="overflow-y: auto"]',
  ],

  getInjectionScript() {
    return `
(function() {
  if (window.__touchGestureExplorerInstalled) return;
  window.__touchGestureExplorerInstalled = true;

  window.__touchGesturesCaptured = {
    gestures: [],
    touchListeners: [],
    hammerInstances: [],
  };

  // Track touch event listeners
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    const touchEvents = ['touchstart', 'touchmove', 'touchend', 'touchcancel',
                        'gesturestart', 'gesturechange', 'gestureend',
                        'pointerdown', 'pointermove', 'pointerup', 'pointercancel'];

    if (touchEvents.includes(type)) {
      const selector = this === window ? 'window' :
                      this === document ? 'document' :
                      this instanceof Element ? getSelector(this) : 'unknown';

      window.__touchGesturesCaptured.touchListeners.push({
        selector,
        type,
        timestamp: Date.now(),
      });
    }

    return originalAddEventListener.call(this, type, listener, options);
  };

  // Detect Hammer.js or similar libraries
  if (typeof Hammer !== 'undefined') {
    const originalHammer = Hammer;
    window.Hammer = function(element, options) {
      const instance = new originalHammer(element, options);
      window.__touchGesturesCaptured.hammerInstances.push({
        selector: getSelector(element),
        options,
      });
      return instance;
    };
  }

  // Record gesture
  window.__recordGesture = function(gesture, stateChanged, diff) {
    window.__touchGesturesCaptured.gestures.push({
      ...gesture,
      stateChanged,
      diff,
      timestamp: Date.now(),
    });
  };

  // Get touch listeners
  window.__getTouchListeners = function() {
    return window.__touchGesturesCaptured.touchListeners;
  };

  // Find potential swipeable elements
  window.__findSwipeableElements = function() {
    const swipeable = [];

    document.querySelectorAll('*').forEach(el => {
      const style = getComputedStyle(el);

      // Check for horizontal scroll
      if (el.scrollWidth > el.clientWidth &&
          (style.overflowX === 'auto' || style.overflowX === 'scroll')) {
        swipeable.push({ selector: getSelector(el), type: 'horizontal-scroll' });
      }

      // Check for vertical scroll
      if (el.scrollHeight > el.clientHeight &&
          (style.overflowY === 'auto' || style.overflowY === 'scroll')) {
        swipeable.push({ selector: getSelector(el), type: 'vertical-scroll' });
      }

      // Check for transform (might be animatable)
      if (style.transform !== 'none' || style.transition.includes('transform')) {
        swipeable.push({ selector: getSelector(el), type: 'transformable' });
      }
    });

    return swipeable;
  };

  function getSelector(el) {
    if (!el || !(el instanceof Element)) return null;
    if (el.id) return '#' + el.id;
    if (el.className) return el.tagName.toLowerCase() + '.' + el.className.split(' ')[0];
    return el.tagName.toLowerCase();
  }

  console.log('[Touch Gesture Explorer] Installed');
})();
`;
  },

  /**
   * Perform a tap gesture
   */
  async tap(page, x, y, options = {}) {
    const { settleTime = 300 } = options;

    const beforeHash = await page.evaluate(() => window.__getrobustStateHash?.()?.hash || 'unknown');

    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(settleTime);

    const afterHash = await page.evaluate(() => window.__getrobustStateHash?.()?.hash || 'unknown');

    return {
      gesture: 'tap',
      x, y,
      stateChanged: beforeHash !== afterHash,
      beforeHash,
      afterHash,
    };
  },

  /**
   * Perform a double tap gesture
   */
  async doubleTap(page, x, y, options = {}) {
    const { settleTime = 300, tapDelay = 100 } = options;

    const beforeHash = await page.evaluate(() => window.__getrobustStateHash?.()?.hash || 'unknown');

    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(tapDelay);
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(settleTime);

    const afterHash = await page.evaluate(() => window.__getrobustStateHash?.()?.hash || 'unknown');

    return {
      gesture: 'double-tap',
      x, y,
      stateChanged: beforeHash !== afterHash,
      beforeHash,
      afterHash,
    };
  },

  /**
   * Perform a long press gesture
   */
  async longPress(page, x, y, options = {}) {
    const { duration = 800, settleTime = 300 } = options;

    const beforeHash = await page.evaluate(() => window.__getrobustStateHash?.()?.hash || 'unknown');

    // Simulate long press by holding touch
    await page.evaluate(async ({ x, y, duration }) => {
      const touch = new Touch({
        identifier: 1,
        target: document.elementFromPoint(x, y) || document.body,
        clientX: x,
        clientY: y,
        pageX: x,
        pageY: y,
      });

      const touchStart = new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [touch],
        targetTouches: [touch],
        changedTouches: [touch],
      });

      const target = document.elementFromPoint(x, y) || document.body;
      target.dispatchEvent(touchStart);

      await new Promise(r => setTimeout(r, duration));

      const touchEnd = new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        touches: [],
        targetTouches: [],
        changedTouches: [touch],
      });

      target.dispatchEvent(touchEnd);
    }, { x, y, duration });

    await page.waitForTimeout(settleTime);

    const afterHash = await page.evaluate(() => window.__getrobustStateHash?.()?.hash || 'unknown');

    // Check for context menu
    const hasContextMenu = await page.evaluate(() => {
      const menu = document.querySelector('[role="menu"], .context-menu, .popup-menu');
      return menu && getComputedStyle(menu).display !== 'none';
    });

    return {
      gesture: 'long-press',
      x, y,
      duration,
      stateChanged: beforeHash !== afterHash,
      hasContextMenu,
      beforeHash,
      afterHash,
    };
  },

  /**
   * Perform a swipe gesture
   */
  async swipe(page, startX, startY, endX, endY, options = {}) {
    const { steps = 10, settleTime = 300 } = options;

    const beforeHash = await page.evaluate(() => window.__getrobustStateHash?.()?.hash || 'unknown');
    const beforeScroll = await page.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY,
    }));

    // Calculate direction
    const dx = endX - startX;
    const dy = endY - startY;
    const direction = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');

    // Perform swipe using mouse (works better in Playwright)
    await page.mouse.move(startX, startY);
    await page.mouse.down();

    for (let i = 1; i <= steps; i++) {
      const x = startX + (dx * i / steps);
      const y = startY + (dy * i / steps);
      await page.mouse.move(x, y);
      await page.waitForTimeout(10);
    }

    await page.mouse.up();
    await page.waitForTimeout(settleTime);

    const afterHash = await page.evaluate(() => window.__getrobustStateHash?.()?.hash || 'unknown');
    const afterScroll = await page.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY,
    }));

    return {
      gesture: 'swipe',
      direction,
      startX, startY, endX, endY,
      stateChanged: beforeHash !== afterHash,
      scrollChanged: beforeScroll.x !== afterScroll.x || beforeScroll.y !== afterScroll.y,
      scrollDelta: {
        x: afterScroll.x - beforeScroll.x,
        y: afterScroll.y - beforeScroll.y,
      },
      beforeHash,
      afterHash,
    };
  },

  /**
   * Perform a pinch gesture (zoom)
   */
  async pinch(page, centerX, centerY, scale, options = {}) {
    const { settleTime = 300 } = options;

    const beforeHash = await page.evaluate(() => window.__getrobustStateHash?.()?.hash || 'unknown');

    // Simulate pinch via wheel event with ctrl (how browsers interpret pinch)
    await page.evaluate(({ x, y, scale }) => {
      const delta = scale > 1 ? -100 : 100; // Negative = zoom in

      const wheelEvent = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        deltaY: delta,
        ctrlKey: true, // This makes it a pinch gesture
      });

      const target = document.elementFromPoint(x, y) || document.body;
      target.dispatchEvent(wheelEvent);
    }, { x: centerX, y: centerY, scale });

    await page.waitForTimeout(settleTime);

    const afterHash = await page.evaluate(() => window.__getrobustStateHash?.()?.hash || 'unknown');

    return {
      gesture: 'pinch',
      centerX, centerY,
      scale,
      direction: scale > 1 ? 'zoom-in' : 'zoom-out',
      stateChanged: beforeHash !== afterHash,
      beforeHash,
      afterHash,
    };
  },

  /**
   * Test all gestures on an element
   */
  async testElement(page, selector, options = {}) {
    const results = {
      selector,
      gestures: [],
    };

    // Get element bounds
    const bounds = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        width: rect.width,
        height: rect.height,
      };
    }, selector);

    if (!bounds) {
      return { selector, error: 'Element not found', gestures: [] };
    }

    const { x, y, width, height } = bounds;

    // Test tap
    const tapResult = await this.tap(page, x, y, options);
    if (tapResult.stateChanged) results.gestures.push(tapResult);

    // Test double tap
    const doubleTapResult = await this.doubleTap(page, x, y, options);
    if (doubleTapResult.stateChanged) results.gestures.push(doubleTapResult);

    // Test long press
    const longPressResult = await this.longPress(page, x, y, options);
    if (longPressResult.stateChanged || longPressResult.hasContextMenu) {
      results.gestures.push(longPressResult);
      // Close any menu that opened
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }

    // Test swipes
    const swipeDistance = Math.min(width, height, 100);

    // Swipe right
    const swipeRight = await this.swipe(page, x - swipeDistance/2, y, x + swipeDistance/2, y, options);
    if (swipeRight.stateChanged || swipeRight.scrollChanged) results.gestures.push(swipeRight);

    // Swipe left
    const swipeLeft = await this.swipe(page, x + swipeDistance/2, y, x - swipeDistance/2, y, options);
    if (swipeLeft.stateChanged || swipeLeft.scrollChanged) results.gestures.push(swipeLeft);

    // Swipe down
    const swipeDown = await this.swipe(page, x, y - swipeDistance/2, x, y + swipeDistance/2, options);
    if (swipeDown.stateChanged || swipeDown.scrollChanged) results.gestures.push(swipeDown);

    // Swipe up
    const swipeUp = await this.swipe(page, x, y + swipeDistance/2, x, y - swipeDistance/2, options);
    if (swipeUp.stateChanged || swipeUp.scrollChanged) results.gestures.push(swipeUp);

    // Test pinch (zoom in)
    const pinchIn = await this.pinch(page, x, y, 1.5, options);
    if (pinchIn.stateChanged) results.gestures.push(pinchIn);

    // Test pinch (zoom out)
    const pinchOut = await this.pinch(page, x, y, 0.5, options);
    if (pinchOut.stateChanged) results.gestures.push(pinchOut);

    return results;
  },

  /**
   * Explore all touch gestures on the page
   */
  async explore(page, options = {}) {
    const {
      testGlobalGestures = true,
      testElementGestures = true,
      onProgress = null,
    } = options;

    const results = {
      global: [],
      elements: [],
      touchListeners: [],
      swipeableElements: [],
    };

    // Get viewport size
    const viewport = page.viewportSize();
    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;

    // Test global gestures
    if (testGlobalGestures) {
      // Test swipes on page body
      const globalSwipeRight = await this.swipe(page, 50, centerY, viewport.width - 50, centerY, options);
      if (globalSwipeRight.stateChanged || globalSwipeRight.scrollChanged) {
        results.global.push({ ...globalSwipeRight, target: 'page' });
      }

      const globalSwipeLeft = await this.swipe(page, viewport.width - 50, centerY, 50, centerY, options);
      if (globalSwipeLeft.stateChanged || globalSwipeLeft.scrollChanged) {
        results.global.push({ ...globalSwipeLeft, target: 'page' });
      }

      const globalSwipeDown = await this.swipe(page, centerX, 50, centerX, viewport.height - 50, options);
      if (globalSwipeDown.stateChanged || globalSwipeDown.scrollChanged) {
        results.global.push({ ...globalSwipeDown, target: 'page' });
      }

      const globalSwipeUp = await this.swipe(page, centerX, viewport.height - 50, centerX, 50, options);
      if (globalSwipeUp.stateChanged || globalSwipeUp.scrollChanged) {
        results.global.push({ ...globalSwipeUp, target: 'page' });
      }
    }

    // Find swipeable elements
    results.swipeableElements = await page.evaluate(() => window.__findSwipeableElements?.() || []);

    // Find elements with touch listeners
    results.touchListeners = await page.evaluate(() => window.__getTouchListeners?.() || []);

    // Test specific elements
    if (testElementGestures) {
      // Combine selectors
      const selectorsToTest = new Set([
        ...this.TOUCH_TARGET_SELECTORS,
        ...results.swipeableElements.map(e => e.selector),
        ...results.touchListeners.map(l => l.selector).filter(s => s !== 'window' && s !== 'document'),
      ]);

      let tested = 0;
      for (const selector of selectorsToTest) {
        const exists = await page.evaluate((sel) => !!document.querySelector(sel), selector);
        if (!exists) continue;

        const elementResults = await this.testElement(page, selector, options);
        if (elementResults.gestures.length > 0) {
          results.elements.push(elementResults);
        }

        tested++;
        if (onProgress) {
          onProgress({ tested, total: selectorsToTest.size, found: results.elements.length });
        }
      }
    }

    return results;
  },

  /**
   * Generate touch handler code
   */
  generateTouchHandlers(results) {
    const lines = [];
    lines.push('// Discovered touch gestures');
    lines.push('');

    // Global gestures
    if (results.global.length > 0) {
      lines.push('// Global gestures');
      lines.push('let touchStartX, touchStartY;');
      lines.push('');
      lines.push('document.addEventListener("touchstart", (e) => {');
      lines.push('  touchStartX = e.touches[0].clientX;');
      lines.push('  touchStartY = e.touches[0].clientY;');
      lines.push('});');
      lines.push('');
      lines.push('document.addEventListener("touchend", (e) => {');
      lines.push('  const dx = e.changedTouches[0].clientX - touchStartX;');
      lines.push('  const dy = e.changedTouches[0].clientY - touchStartY;');
      lines.push('  const absDx = Math.abs(dx);');
      lines.push('  const absDy = Math.abs(dy);');
      lines.push('');
      lines.push('  if (absDx > 50 || absDy > 50) {');
      lines.push('    if (absDx > absDy) {');
      lines.push('      // Horizontal swipe');
      lines.push('      if (dx > 0) handleSwipeRight();');
      lines.push('      else handleSwipeLeft();');
      lines.push('    } else {');
      lines.push('      // Vertical swipe');
      lines.push('      if (dy > 0) handleSwipeDown();');
      lines.push('      else handleSwipeUp();');
      lines.push('    }');
      lines.push('  }');
      lines.push('});');
      lines.push('');
    }

    // Element-specific gestures
    for (const element of results.elements) {
      lines.push(`// Gestures for ${element.selector}`);
      for (const gesture of element.gestures) {
        lines.push(`// - ${gesture.gesture}${gesture.direction ? ' ' + gesture.direction : ''}: causes state change`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
};
