/**
 * Animation Libraries Extractor
 *
 * Captures animations from popular libraries:
 * - GSAP (GreenSock Animation Platform)
 * - anime.js
 * - Framer Motion (via DOM observation)
 * - Velocity.js
 * - Motion One
 */

export const animationLibsExtractor = {
  name: 'animation-libs',

  getInjectionScript() {
    return `
(function() {
  if (window.__animationLibsExtractorInstalled) return;
  window.__animationLibsExtractorInstalled = true;

  window.__animationLibsCaptured = {
    gsap: [],
    anime: [],
    framerMotion: [],
    velocity: [],
    motionOne: [],
    detected: [],
  };

  function getUniqueSelector(el) {
    if (!el || typeof el === 'string') return el || 'unknown';
    if (el.id) return '#' + el.id;
    if (el === document.body) return 'body';
    if (el === window || el === document) return 'window';
    if (el.nodeType !== 1) return 'non-element';

    const path = [];
    while (el && el !== document.body) {
      let selector = el.tagName?.toLowerCase() || 'unknown';
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
  // GSAP INTERCEPTION
  // ============================================

  function interceptGSAP() {
    if (!window.gsap) return;

    window.__animationLibsCaptured.detected.push({ library: 'gsap', version: window.gsap.version });

    const originalTo = window.gsap.to;
    const originalFrom = window.gsap.from;
    const originalFromTo = window.gsap.fromTo;
    const originalTimeline = window.gsap.timeline;

    window.gsap.to = function(targets, vars) {
      const targetSelectors = Array.isArray(targets)
        ? targets.map(t => getUniqueSelector(t))
        : [getUniqueSelector(targets)];

      window.__animationLibsCaptured.gsap.push({
        type: 'to',
        targets: targetSelectors,
        vars: serializeVars(vars),
        timestamp: Date.now(),
      });

      return originalTo.call(this, targets, vars);
    };

    window.gsap.from = function(targets, vars) {
      const targetSelectors = Array.isArray(targets)
        ? targets.map(t => getUniqueSelector(t))
        : [getUniqueSelector(targets)];

      window.__animationLibsCaptured.gsap.push({
        type: 'from',
        targets: targetSelectors,
        vars: serializeVars(vars),
        timestamp: Date.now(),
      });

      return originalFrom.call(this, targets, vars);
    };

    window.gsap.fromTo = function(targets, fromVars, toVars) {
      const targetSelectors = Array.isArray(targets)
        ? targets.map(t => getUniqueSelector(t))
        : [getUniqueSelector(targets)];

      window.__animationLibsCaptured.gsap.push({
        type: 'fromTo',
        targets: targetSelectors,
        fromVars: serializeVars(fromVars),
        toVars: serializeVars(toVars),
        timestamp: Date.now(),
      });

      return originalFromTo.call(this, targets, fromVars, toVars);
    };

    // Timeline interception
    window.gsap.timeline = function(vars) {
      const tl = originalTimeline.call(this, vars);
      const timelineId = Date.now();

      window.__animationLibsCaptured.gsap.push({
        type: 'timeline',
        timelineId,
        vars: serializeVars(vars),
        timestamp: Date.now(),
      });

      const originalTlTo = tl.to.bind(tl);
      const originalTlFrom = tl.from.bind(tl);

      tl.to = function(targets, vars, position) {
        window.__animationLibsCaptured.gsap.push({
          type: 'timeline.to',
          timelineId,
          targets: Array.isArray(targets) ? targets.map(t => getUniqueSelector(t)) : [getUniqueSelector(targets)],
          vars: serializeVars(vars),
          position,
          timestamp: Date.now(),
        });
        return originalTlTo(targets, vars, position);
      };

      tl.from = function(targets, vars, position) {
        window.__animationLibsCaptured.gsap.push({
          type: 'timeline.from',
          timelineId,
          targets: Array.isArray(targets) ? targets.map(t => getUniqueSelector(t)) : [getUniqueSelector(targets)],
          vars: serializeVars(vars),
          position,
          timestamp: Date.now(),
        });
        return originalTlFrom(targets, vars, position);
      };

      return tl;
    };

    function serializeVars(vars) {
      if (!vars) return vars;
      const result = {};
      for (const [key, value] of Object.entries(vars)) {
        if (typeof value === 'function') {
          result[key] = '[function]';
        } else if (value instanceof Element) {
          result[key] = getUniqueSelector(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    }
  }

  // ============================================
  // ANIME.JS INTERCEPTION
  // ============================================

  function interceptAnime() {
    if (!window.anime) return;

    window.__animationLibsCaptured.detected.push({ library: 'anime', version: window.anime.version });

    const originalAnime = window.anime;

    window.anime = function(params) {
      const targets = params.targets;
      const targetSelectors = targets
        ? (typeof targets === 'string' ? targets :
           Array.isArray(targets) ? targets.map(t => getUniqueSelector(t)) :
           [getUniqueSelector(targets)])
        : [];

      // Extract animation properties
      const animProps = {};
      const nonAnimProps = ['targets', 'duration', 'delay', 'easing', 'round', 'complete', 'begin', 'update', 'loop', 'direction', 'autoplay'];

      Object.keys(params).forEach(key => {
        if (!nonAnimProps.includes(key)) {
          animProps[key] = params[key];
        }
      });

      window.__animationLibsCaptured.anime.push({
        targets: targetSelectors,
        properties: animProps,
        duration: params.duration,
        delay: params.delay,
        easing: params.easing,
        loop: params.loop,
        direction: params.direction,
        timestamp: Date.now(),
      });

      return originalAnime.call(this, params);
    };

    // Copy static methods
    Object.keys(originalAnime).forEach(key => {
      window.anime[key] = originalAnime[key];
    });
  }

  // ============================================
  // FRAMER MOTION DETECTION (via DOM)
  // ============================================

  function detectFramerMotion() {
    // Framer Motion typically adds data-framer-* attributes
    const framerElements = document.querySelectorAll('[data-framer-appear-id], [data-framer-component-type]');

    if (framerElements.length > 0) {
      window.__animationLibsCaptured.detected.push({ library: 'framer-motion', detected: true });

      framerElements.forEach(el => {
        window.__animationLibsCaptured.framerMotion.push({
          selector: getUniqueSelector(el),
          attributes: {
            appearId: el.getAttribute('data-framer-appear-id'),
            componentType: el.getAttribute('data-framer-component-type'),
          },
          transform: getComputedStyle(el).transform,
          opacity: getComputedStyle(el).opacity,
        });
      });
    }
  }

  // ============================================
  // VELOCITY.JS INTERCEPTION
  // ============================================

  function interceptVelocity() {
    if (!window.Velocity && !window.$.velocity) return;

    const Velocity = window.Velocity || window.$.velocity;
    window.__animationLibsCaptured.detected.push({ library: 'velocity' });

    // Velocity extends jQuery or works standalone
    if (window.$ && window.$.fn && window.$.fn.velocity) {
      const originalVelocity = window.$.fn.velocity;

      window.$.fn.velocity = function(properties, options) {
        window.__animationLibsCaptured.velocity.push({
          targets: this.toArray().map(el => getUniqueSelector(el)),
          properties: properties,
          options: typeof options === 'object' ? options : { duration: options },
          timestamp: Date.now(),
        });

        return originalVelocity.call(this, properties, options);
      };
    }
  }

  // ============================================
  // MOTION ONE INTERCEPTION
  // ============================================

  function interceptMotionOne() {
    if (!window.Motion) return;

    window.__animationLibsCaptured.detected.push({ library: 'motion-one' });

    const originalAnimate = window.Motion.animate;
    if (originalAnimate) {
      window.Motion.animate = function(element, keyframes, options) {
        window.__animationLibsCaptured.motionOne.push({
          target: getUniqueSelector(element),
          keyframes: keyframes,
          options: options,
          timestamp: Date.now(),
        });

        return originalAnimate.call(this, element, keyframes, options);
      };
    }
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  function init() {
    interceptGSAP();
    interceptAnime();
    detectFramerMotion();
    interceptVelocity();
    interceptMotionOne();
  }

  // Run immediately and also after potential library loads
  init();

  // Re-check after DOM ready (some libs load async)
  if (document.readyState === 'complete') {
    setTimeout(init, 100);
  } else {
    window.addEventListener('load', () => setTimeout(init, 100));
  }

  // Watch for script additions that might load libraries
  const scriptObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node.tagName === 'SCRIPT') {
          setTimeout(init, 500);
        }
      });
    }
  });

  scriptObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.__captureAnimationLibs = function() {
    detectFramerMotion();
    return window.__animationLibsCaptured;
  };

  console.log('[Animation Libraries Extractor] Installed');
})();
`;
  },

  async extractData(page) {
    return await page.evaluate(() => {
      if (window.__captureAnimationLibs) {
        return window.__captureAnimationLibs();
      }
      return window.__animationLibsCaptured || {
        gsap: [],
        anime: [],
        framerMotion: [],
        velocity: [],
        motionOne: [],
        detected: [],
      };
    });
  },

  generateReplayCode(data) {
    const hasContent = data.gsap.length || data.anime.length ||
                       data.framerMotion.length || data.velocity.length ||
                       data.motionOne.length;

    if (!hasContent) return null;

    const lines = [];
    lines.push('// Animation Libraries Replay Code');
    lines.push('');

    // Generate GSAP replay
    if (data.gsap.length) {
      lines.push('// GSAP Animations');
      lines.push('export function replayGSAPAnimations(gsap) {');
      data.gsap.forEach((anim, i) => {
        if (anim.type === 'to') {
          lines.push(`  gsap.to('${anim.targets[0]}', ${JSON.stringify(anim.vars)});`);
        } else if (anim.type === 'from') {
          lines.push(`  gsap.from('${anim.targets[0]}', ${JSON.stringify(anim.vars)});`);
        } else if (anim.type === 'fromTo') {
          lines.push(`  gsap.fromTo('${anim.targets[0]}', ${JSON.stringify(anim.fromVars)}, ${JSON.stringify(anim.toVars)});`);
        }
      });
      lines.push('}');
      lines.push('');
    }

    // Generate anime.js replay
    if (data.anime.length) {
      lines.push('// anime.js Animations');
      lines.push('export function replayAnimeAnimations(anime) {');
      data.anime.forEach(anim => {
        const params = {
          targets: anim.targets[0],
          ...anim.properties,
        };
        if (anim.duration) params.duration = anim.duration;
        if (anim.easing) params.easing = anim.easing;
        if (anim.delay) params.delay = anim.delay;
        lines.push(`  anime(${JSON.stringify(params)});`);
      });
      lines.push('}');
      lines.push('');
    }

    // Generate Framer Motion data (can't replay directly, but can provide data)
    if (data.framerMotion.length) {
      lines.push('// Framer Motion Elements');
      lines.push('export const framerMotionElements = [');
      data.framerMotion.forEach(el => {
        lines.push(`  { selector: '${el.selector}', transform: '${el.transform}', opacity: '${el.opacity}' },`);
      });
      lines.push('];');
      lines.push('');
    }

    // Detected libraries info
    if (data.detected.length) {
      lines.push('// Detected Animation Libraries');
      lines.push(`export const detectedLibraries = ${JSON.stringify(data.detected)};`);
    }

    return lines.join('\n');
  },
};

export default animationLibsExtractor;
