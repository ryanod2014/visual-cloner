/**
 * CSS Animation Extractor
 *
 * Captures ALL CSS animations including:
 * - @keyframes rules from all stylesheets
 * - animation-* properties on elements
 * - Web Animations API (element.animate())
 * - Animation events and states
 */

export const cssAnimationExtractor = {
  name: 'css-animation',

  getInjectionScript() {
    return `
(function() {
  if (window.__cssAnimationExtractorInstalled) return;
  window.__cssAnimationExtractorInstalled = true;

  window.__cssAnimationCaptured = {
    keyframes: [],
    animatedElements: [],
    webAnimations: [],
    animationEvents: [],
  };

  // ============================================
  // EXTRACT @KEYFRAMES FROM STYLESHEETS
  // ============================================

  function extractKeyframes() {
    const keyframesMap = new Map();

    try {
      for (const sheet of document.styleSheets) {
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (!rules) continue;

          for (const rule of rules) {
            if (rule.type === CSSRule.KEYFRAMES_RULE) {
              const name = rule.name;
              const frames = [];

              for (const keyframe of rule.cssRules) {
                frames.push({
                  keyText: keyframe.keyText,
                  style: keyframe.style.cssText,
                });
              }

              keyframesMap.set(name, {
                name,
                frames,
                source: sheet.href || 'inline',
              });
            }
          }
        } catch (e) {
          // CORS restriction on external stylesheets
        }
      }
    } catch (e) {
      console.warn('[CSS Animation Extractor] Error reading stylesheets:', e);
    }

    return Array.from(keyframesMap.values());
  }

  // ============================================
  // EXTRACT ANIMATED ELEMENTS
  // ============================================

  function extractAnimatedElements() {
    const animated = [];
    const allElements = document.querySelectorAll('*');

    for (const el of allElements) {
      const style = getComputedStyle(el);
      const animationName = style.animationName;

      if (animationName && animationName !== 'none') {
        const selector = getUniqueSelector(el);
        animated.push({
          selector,
          animationName: animationName,
          animationDuration: style.animationDuration,
          animationTimingFunction: style.animationTimingFunction,
          animationDelay: style.animationDelay,
          animationIterationCount: style.animationIterationCount,
          animationDirection: style.animationDirection,
          animationFillMode: style.animationFillMode,
          animationPlayState: style.animationPlayState,
        });
      }
    }

    return animated;
  }

  function getUniqueSelector(el) {
    if (el.id) return '#' + el.id;
    if (el === document.body) return 'body';

    const path = [];
    while (el && el !== document.body) {
      let selector = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        selector += '.' + el.className.trim().split(/\\s+/).join('.');
      }
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
        if (siblings.length > 1) {
          selector += ':nth-of-type(' + (siblings.indexOf(el) + 1) + ')';
        }
      }
      path.unshift(selector);
      el = parent;
    }
    return path.join(' > ');
  }

  // ============================================
  // INTERCEPT WEB ANIMATIONS API
  // ============================================

  const originalAnimate = Element.prototype.animate;
  Element.prototype.animate = function(keyframes, options) {
    const animation = originalAnimate.call(this, keyframes, options);

    window.__cssAnimationCaptured.webAnimations.push({
      selector: getUniqueSelector(this),
      keyframes: Array.isArray(keyframes) ? keyframes : Object.entries(keyframes).map(([prop, values]) => {
        const frames = [];
        values.forEach((v, i) => {
          if (!frames[i]) frames[i] = {};
          frames[i][prop] = v;
        });
        return frames;
      }).flat(),
      options: typeof options === 'number' ? { duration: options } : options,
      timestamp: Date.now(),
    });

    return animation;
  };

  // ============================================
  // TRACK ANIMATION EVENTS
  // ============================================

  document.addEventListener('animationstart', (e) => {
    window.__cssAnimationCaptured.animationEvents.push({
      type: 'start',
      animationName: e.animationName,
      selector: getUniqueSelector(e.target),
      timestamp: Date.now(),
    });
  }, true);

  document.addEventListener('animationend', (e) => {
    window.__cssAnimationCaptured.animationEvents.push({
      type: 'end',
      animationName: e.animationName,
      selector: getUniqueSelector(e.target),
      timestamp: Date.now(),
    });
  }, true);

  document.addEventListener('animationiteration', (e) => {
    window.__cssAnimationCaptured.animationEvents.push({
      type: 'iteration',
      animationName: e.animationName,
      selector: getUniqueSelector(e.target),
      timestamp: Date.now(),
    });
  }, true);

  // ============================================
  // OBSERVE STYLE CHANGES FOR ANIMATION PROPERTIES
  // ============================================

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        const el = mutation.target;
        const style = el.style;
        if (style.animation || style.animationName) {
          window.__cssAnimationCaptured.animatedElements.push({
            selector: getUniqueSelector(el),
            inlineAnimation: style.animation || null,
            animationName: style.animationName || null,
            timestamp: Date.now(),
            source: 'inline-style-change',
          });
        }
      }
    }
  });

  observer.observe(document.body, {
    attributes: true,
    subtree: true,
    attributeFilter: ['style', 'class'],
  });

  // ============================================
  // SNAPSHOT FUNCTION
  // ============================================

  window.__captureAnimationState = function() {
    window.__cssAnimationCaptured.keyframes = extractKeyframes();
    const currentAnimated = extractAnimatedElements();
    // Merge with existing, avoiding duplicates
    const existingSelectors = new Set(window.__cssAnimationCaptured.animatedElements.map(a => a.selector));
    currentAnimated.forEach(a => {
      if (!existingSelectors.has(a.selector)) {
        window.__cssAnimationCaptured.animatedElements.push(a);
      }
    });
    return window.__cssAnimationCaptured;
  };

  // Initial capture
  if (document.readyState === 'complete') {
    window.__captureAnimationState();
  } else {
    window.addEventListener('load', () => window.__captureAnimationState());
  }

  console.log('[CSS Animation Extractor] Installed');
})();
`;
  },

  async extractData(page) {
    return await page.evaluate(() => {
      if (window.__captureAnimationState) {
        return window.__captureAnimationState();
      }
      return window.__cssAnimationCaptured || {
        keyframes: [],
        animatedElements: [],
        webAnimations: [],
        animationEvents: [],
      };
    });
  },

  generateReplayCode(data) {
    if (!data.keyframes.length && !data.animatedElements.length && !data.webAnimations.length) {
      return null;
    }

    const lines = [];
    lines.push('// CSS Animation Replay Code');
    lines.push('');

    // Generate @keyframes CSS
    if (data.keyframes.length) {
      lines.push('export const animationCSS = `');
      data.keyframes.forEach(kf => {
        lines.push(`@keyframes ${kf.name} {`);
        kf.frames.forEach(frame => {
          lines.push(`  ${frame.keyText} { ${frame.style} }`);
        });
        lines.push('}');
        lines.push('');
      });
      lines.push('`;');
      lines.push('');
    }

    // Generate animation application code
    if (data.animatedElements.length) {
      lines.push('export const animatedElementStyles = {');
      data.animatedElements.forEach(el => {
        lines.push(`  '${el.selector}': {`);
        lines.push(`    animationName: '${el.animationName}',`);
        lines.push(`    animationDuration: '${el.animationDuration}',`);
        lines.push(`    animationTimingFunction: '${el.animationTimingFunction}',`);
        lines.push(`    animationDelay: '${el.animationDelay}',`);
        lines.push(`    animationIterationCount: '${el.animationIterationCount}',`);
        lines.push(`    animationDirection: '${el.animationDirection}',`);
        lines.push(`    animationFillMode: '${el.animationFillMode}',`);
        lines.push(`  },`);
      });
      lines.push('};');
      lines.push('');
    }

    // Generate Web Animations API replay
    if (data.webAnimations.length) {
      lines.push('export function applyWebAnimations() {');
      data.webAnimations.forEach((anim, i) => {
        lines.push(`  const el${i} = document.querySelector('${anim.selector}');`);
        lines.push(`  if (el${i}) {`);
        lines.push(`    el${i}.animate(${JSON.stringify(anim.keyframes)}, ${JSON.stringify(anim.options)});`);
        lines.push(`  }`);
      });
      lines.push('}');
    }

    return lines.join('\n');
  },
};

export default cssAnimationExtractor;
