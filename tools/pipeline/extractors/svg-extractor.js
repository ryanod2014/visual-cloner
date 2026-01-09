/**
 * SVG Manipulation Extractor
 *
 * Captures ALL SVG operations including:
 * - SVG element creation and structure
 * - Path data changes (d attribute)
 * - Attribute mutations (fill, stroke, transform, etc.)
 * - SMIL animations
 * - SVG via JavaScript manipulation
 */

export const svgExtractor = {
  name: 'svg',

  getInjectionScript() {
    return `
(function() {
  if (window.__svgExtractorInstalled) return;
  window.__svgExtractorInstalled = true;

  window.__svgCaptured = {
    svgElements: [],
    pathChanges: [],
    attributeChanges: [],
    smilAnimations: [],
    styleChanges: [],
  };

  let svgCounter = 0;
  const svgMap = new WeakMap();

  function getUniqueSelector(el) {
    if (el.id) return '#' + el.id;
    if (el === document.body) return 'body';

    const path = [];
    while (el && el !== document.body) {
      let selector = el.tagName.toLowerCase();
      if (el.id) {
        path.unshift('#' + el.id);
        break;
      }
      if (el.className && typeof el.className === 'string' && el.className.trim()) {
        selector += '.' + el.className.trim().split(/\\s+/).join('.');
      } else if (el.className?.baseVal) {
        selector += '.' + el.className.baseVal.trim().split(/\\s+/).join('.');
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

  function getSvgId(svg) {
    if (!svgMap.has(svg)) {
      svgMap.set(svg, svgCounter++);
    }
    return svgMap.get(svg);
  }

  // ============================================
  // EXTRACT ALL SVG ELEMENTS
  // ============================================

  function extractSvgElements() {
    const svgs = [];
    document.querySelectorAll('svg').forEach(svg => {
      const id = getSvgId(svg);
      svgs.push({
        id,
        selector: getUniqueSelector(svg),
        viewBox: svg.getAttribute('viewBox'),
        width: svg.getAttribute('width'),
        height: svg.getAttribute('height'),
        innerHTML: svg.innerHTML,
        outerHTML: svg.outerHTML,
        computedStyle: {
          fill: getComputedStyle(svg).fill,
          stroke: getComputedStyle(svg).stroke,
        },
      });
    });
    return svgs;
  }

  // ============================================
  // EXTRACT SMIL ANIMATIONS
  // ============================================

  function extractSmilAnimations() {
    const animations = [];
    const animationElements = document.querySelectorAll('animate, animateTransform, animateMotion, set');

    animationElements.forEach(anim => {
      const parentSvg = anim.closest('svg');
      animations.push({
        svgId: parentSvg ? getSvgId(parentSvg) : null,
        tagName: anim.tagName,
        attributeName: anim.getAttribute('attributeName'),
        from: anim.getAttribute('from'),
        to: anim.getAttribute('to'),
        values: anim.getAttribute('values'),
        dur: anim.getAttribute('dur'),
        repeatCount: anim.getAttribute('repeatCount'),
        fill: anim.getAttribute('fill'),
        begin: anim.getAttribute('begin'),
        keyTimes: anim.getAttribute('keyTimes'),
        keySplines: anim.getAttribute('keySplines'),
        calcMode: anim.getAttribute('calcMode'),
        type: anim.getAttribute('type'),
        path: anim.getAttribute('path'),
      });
    });

    return animations;
  }

  // ============================================
  // OBSERVE SVG MUTATIONS
  // ============================================

  const svgObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const target = mutation.target;

      // Check if target is an SVG element
      if (target.ownerSVGElement || target.tagName === 'svg' || target instanceof SVGElement) {
        const svg = target.ownerSVGElement || target;
        const svgId = getSvgId(svg);

        if (mutation.type === 'attributes') {
          const attrName = mutation.attributeName;
          const newValue = target.getAttribute(attrName);

          if (attrName === 'd') {
            window.__svgCaptured.pathChanges.push({
              svgId,
              selector: getUniqueSelector(target),
              oldValue: mutation.oldValue,
              newValue,
              timestamp: Date.now(),
            });
          } else {
            window.__svgCaptured.attributeChanges.push({
              svgId,
              selector: getUniqueSelector(target),
              attribute: attrName,
              oldValue: mutation.oldValue,
              newValue,
              timestamp: Date.now(),
            });
          }
        } else if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node instanceof SVGElement) {
              window.__svgCaptured.attributeChanges.push({
                svgId,
                type: 'nodeAdded',
                tagName: node.tagName,
                outerHTML: node.outerHTML,
                timestamp: Date.now(),
              });
            }
          });

          mutation.removedNodes.forEach(node => {
            if (node instanceof SVGElement) {
              window.__svgCaptured.attributeChanges.push({
                svgId,
                type: 'nodeRemoved',
                tagName: node.tagName,
                timestamp: Date.now(),
              });
            }
          });
        }
      }
    }
  });

  svgObserver.observe(document.body, {
    attributes: true,
    attributeOldValue: true,
    childList: true,
    subtree: true,
  });

  // ============================================
  // INTERCEPT setAttribute FOR SVG ELEMENTS
  // ============================================

  const originalSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    if (this instanceof SVGElement) {
      const svg = this.ownerSVGElement || this;
      const svgId = getSvgId(svg);

      if (name === 'd') {
        window.__svgCaptured.pathChanges.push({
          svgId,
          selector: getUniqueSelector(this),
          oldValue: this.getAttribute('d'),
          newValue: value,
          timestamp: Date.now(),
          source: 'setAttribute',
        });
      } else if (['fill', 'stroke', 'transform', 'opacity', 'stroke-width', 'stroke-dasharray'].includes(name)) {
        window.__svgCaptured.attributeChanges.push({
          svgId,
          selector: getUniqueSelector(this),
          attribute: name,
          oldValue: this.getAttribute(name),
          newValue: value,
          timestamp: Date.now(),
          source: 'setAttribute',
        });
      }
    }

    return originalSetAttribute.call(this, name, value);
  };

  // ============================================
  // INTERCEPT SVG STYLE CHANGES
  // ============================================

  const svgStyleProps = ['fill', 'stroke', 'opacity', 'strokeWidth', 'strokeDasharray', 'transform'];

  svgStyleProps.forEach(prop => {
    const descriptor = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, prop);
    if (descriptor && descriptor.set) {
      const originalSetter = descriptor.set;
      Object.defineProperty(CSSStyleDeclaration.prototype, prop, {
        ...descriptor,
        set: function(value) {
          const el = this.parentElement;
          if (el instanceof SVGElement) {
            const svg = el.ownerSVGElement || el;
            window.__svgCaptured.styleChanges.push({
              svgId: getSvgId(svg),
              selector: getUniqueSelector(el),
              property: prop,
              value,
              timestamp: Date.now(),
            });
          }
          return originalSetter.call(this, value);
        },
      });
    }
  });

  // ============================================
  // SNAPSHOT FUNCTION
  // ============================================

  window.__captureSvgState = function() {
    window.__svgCaptured.svgElements = extractSvgElements();
    window.__svgCaptured.smilAnimations = extractSmilAnimations();
    return window.__svgCaptured;
  };

  // Initial capture
  if (document.readyState === 'complete') {
    window.__captureSvgState();
  } else {
    window.addEventListener('load', () => window.__captureSvgState());
  }

  console.log('[SVG Extractor] Installed');
})();
`;
  },

  async extractData(page) {
    return await page.evaluate(() => {
      if (window.__captureSvgState) {
        return window.__captureSvgState();
      }
      return window.__svgCaptured || {
        svgElements: [],
        pathChanges: [],
        attributeChanges: [],
        smilAnimations: [],
        styleChanges: [],
      };
    });
  },

  generateReplayCode(data) {
    if (!data.svgElements.length && !data.pathChanges.length) {
      return null;
    }

    const lines = [];
    lines.push('// SVG Replay Code');
    lines.push('');

    // Generate SVG elements
    if (data.svgElements.length) {
      lines.push('export const svgElements = [');
      data.svgElements.forEach(svg => {
        lines.push('  {');
        lines.push(`    selector: '${svg.selector}',`);
        lines.push(`    viewBox: '${svg.viewBox || ''}',`);
        lines.push(`    content: \`${svg.innerHTML.replace(/`/g, '\\`')}\`,`);
        lines.push('  },');
      });
      lines.push('];');
      lines.push('');
    }

    // Generate SMIL animations
    if (data.smilAnimations.length) {
      lines.push('export const smilAnimations = [');
      data.smilAnimations.forEach(anim => {
        const attrs = Object.entries(anim)
          .filter(([k, v]) => v !== null && k !== 'svgId')
          .map(([k, v]) => `    ${k}: '${v}'`)
          .join(',\n');
        lines.push('  {');
        lines.push(attrs);
        lines.push('  },');
      });
      lines.push('];');
      lines.push('');
    }

    // Generate path animation sequences
    if (data.pathChanges.length) {
      lines.push('export const pathAnimations = [');
      data.pathChanges.forEach(change => {
        lines.push('  {');
        lines.push(`    selector: '${change.selector}',`);
        lines.push(`    from: '${change.oldValue || ''}',`);
        lines.push(`    to: '${change.newValue}',`);
        lines.push('  },');
      });
      lines.push('];');
      lines.push('');

      lines.push('export function animatePath(selector, from, to, duration = 300) {');
      lines.push('  const el = document.querySelector(selector);');
      lines.push('  if (!el) return;');
      lines.push('  el.setAttribute("d", to);');
      lines.push('}');
    }

    return lines.join('\n');
  },
};

export default svgExtractor;
