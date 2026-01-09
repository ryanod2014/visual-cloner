/**
 * Pseudo Element Extractor
 *
 * Captures ALL pseudo-element styles:
 * - ::before content and styles
 * - ::after content and styles
 * - ::placeholder styles
 * - ::selection styles
 * - ::first-letter styles
 * - ::first-line styles
 * - ::marker styles (for lists)
 * - ::backdrop styles (for dialogs/modals)
 * - ::file-selector-button styles
 * - ::cue styles (for video captions)
 *
 * These are often critical for accurate cloning but invisible in the DOM.
 */

export const pseudoElementExtractor = {
  name: 'pseudo-element',

  getInjectionScript() {
    return `
(function() {
  if (window.__pseudoElementExtractorInstalled) return;
  window.__pseudoElementExtractorInstalled = true;

  window.__pseudoElementsCaptured = {
    elements: [],
  };

  // All pseudo-elements to check
  const PSEUDO_ELEMENTS = [
    '::before',
    '::after',
    '::placeholder',
    '::selection',
    '::first-letter',
    '::first-line',
    '::marker',
    '::backdrop',
    '::file-selector-button',
  ];

  // Style properties relevant for pseudo-elements
  const STYLE_PROPERTIES = [
    'content',
    'display',
    'position',
    'top', 'right', 'bottom', 'left',
    'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
    'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'backgroundColor', 'color', 'opacity',
    'border', 'borderWidth', 'borderStyle', 'borderColor', 'borderRadius',
    'boxShadow', 'textShadow',
    'font', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
    'letterSpacing', 'textTransform', 'textDecoration',
    'transform', 'transformOrigin',
    'transition', 'animation',
    'zIndex', 'overflow', 'visibility',
    'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat',
    'cursor', 'pointerEvents',
    'flexGrow', 'flexShrink', 'flexBasis',
    'gridArea', 'gridColumn', 'gridRow',
    'filter', 'backdropFilter', 'mixBlendMode',
    'clipPath', 'mask',
  ];

  // Generate unique selector
  function getUniqueSelector(el) {
    if (!el || !(el instanceof Element)) return null;

    if (el.id) {
      return '#' + CSS.escape(el.id);
    }

    if (el.classList.length > 0) {
      const classes = Array.from(el.classList).map(c => '.' + CSS.escape(c)).join('');
      const matches = document.querySelectorAll(el.tagName + classes);
      if (matches.length === 1) {
        return el.tagName.toLowerCase() + classes;
      }
    }

    const path = [];
    let current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector = '#' + CSS.escape(current.id);
        path.unshift(selector);
        break;
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += ':nth-of-type(' + index + ')';
        }
      }
      path.unshift(selector);
      current = parent;
    }

    return path.join(' > ');
  }

  // Check if pseudo-element has meaningful styles
  function hasVisibleStyles(styles) {
    // Check content property (most important for ::before/::after)
    if (styles.content && styles.content !== 'none' && styles.content !== 'normal' && styles.content !== '""') {
      return true;
    }

    // Check if has background
    if (styles.backgroundColor && styles.backgroundColor !== 'rgba(0, 0, 0, 0)' && styles.backgroundColor !== 'transparent') {
      return true;
    }

    if (styles.backgroundImage && styles.backgroundImage !== 'none') {
      return true;
    }

    // Check if has dimensions (could be a visual element)
    if ((styles.width && styles.width !== 'auto' && styles.width !== '0px') ||
        (styles.height && styles.height !== 'auto' && styles.height !== '0px')) {
      return true;
    }

    // Check for border
    if (styles.borderWidth && styles.borderWidth !== '0px' && styles.borderStyle !== 'none') {
      return true;
    }

    // Check for shadow
    if (styles.boxShadow && styles.boxShadow !== 'none') {
      return true;
    }

    return false;
  }

  // Capture pseudo-element styles for a single element
  function capturePseudoElement(el, pseudo) {
    try {
      const computed = getComputedStyle(el, pseudo);

      // Check if this pseudo-element has any meaningful styles
      const testStyles = {
        content: computed.content,
        backgroundColor: computed.backgroundColor,
        backgroundImage: computed.backgroundImage,
        width: computed.width,
        height: computed.height,
        borderWidth: computed.borderWidth,
        borderStyle: computed.borderStyle,
        boxShadow: computed.boxShadow,
      };

      if (!hasVisibleStyles(testStyles)) {
        return null;
      }

      // Capture all relevant styles
      const styles = {};
      STYLE_PROPERTIES.forEach(prop => {
        const value = computed[prop];
        if (value !== undefined && value !== '' && value !== 'none' && value !== 'normal' && value !== 'auto') {
          styles[prop] = value;
        }
      });

      // Don't return if only has default/empty values
      if (Object.keys(styles).length === 0) {
        return null;
      }

      return styles;
    } catch (e) {
      return null;
    }
  }

  // Main capture function
  window.__capturePseudoElements = function() {
    const captured = [];

    // Get all elements
    const elements = document.querySelectorAll('*');

    elements.forEach(el => {
      const selector = getUniqueSelector(el);
      if (!selector) return;

      PSEUDO_ELEMENTS.forEach(pseudo => {
        const styles = capturePseudoElement(el, pseudo);
        if (styles) {
          captured.push({
            selector,
            pseudo,
            fullSelector: selector + pseudo,
            styles,
            tagName: el.tagName.toLowerCase(),
          });
        }
      });
    });

    window.__pseudoElementsCaptured.elements = captured;
    return captured;
  };

  // Capture for a specific element
  window.__capturePseudoElementsFor = function(selector) {
    const el = document.querySelector(selector);
    if (!el) return [];

    const captured = [];

    PSEUDO_ELEMENTS.forEach(pseudo => {
      const styles = capturePseudoElement(el, pseudo);
      if (styles) {
        captured.push({
          selector,
          pseudo,
          fullSelector: selector + pseudo,
          styles,
        });
      }
    });

    return captured;
  };

  // Check if element has ::before or ::after
  window.__hasPseudoContent = function(selector) {
    const el = document.querySelector(selector);
    if (!el) return { before: false, after: false };

    const beforeStyles = capturePseudoElement(el, '::before');
    const afterStyles = capturePseudoElement(el, '::after');

    return {
      before: beforeStyles !== null,
      after: afterStyles !== null,
      beforeContent: beforeStyles?.content,
      afterContent: afterStyles?.content,
    };
  };

  console.log('[Pseudo Element Extractor] Installed');
})();
`;
  },

  async extractData(page) {
    return await page.evaluate(() => {
      if (window.__capturePseudoElements) {
        return window.__capturePseudoElements();
      }
      return [];
    });
  },

  async extractForElement(page, selector) {
    return await page.evaluate((sel) => {
      if (window.__capturePseudoElementsFor) {
        return window.__capturePseudoElementsFor(sel);
      }
      return [];
    }, selector);
  },

  async hasPseudoContent(page, selector) {
    return await page.evaluate((sel) => {
      if (window.__hasPseudoContent) {
        return window.__hasPseudoContent(sel);
      }
      return { before: false, after: false };
    }, selector);
  },

  generateCSS(data) {
    const lines = [];

    // Group by base selector
    const grouped = {};
    data.forEach(item => {
      if (!grouped[item.selector]) {
        grouped[item.selector] = [];
      }
      grouped[item.selector].push(item);
    });

    for (const [selector, pseudoItems] of Object.entries(grouped)) {
      pseudoItems.forEach(item => {
        const cssProperties = Object.entries(item.styles)
          .map(([prop, value]) => {
            const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
            return `  ${cssProp}: ${value};`;
          })
          .join('\n');

        if (cssProperties) {
          lines.push(`${item.fullSelector} {`);
          lines.push(cssProperties);
          lines.push('}');
          lines.push('');
        }
      });
    }

    return lines.join('\n');
  },

  // Generate JSX/HTML equivalent for pseudo-elements
  // (Since pseudo-elements can't exist in JSX, we need to create actual elements)
  generateJSXEquivalent(data, selector) {
    const items = data.filter(d => d.selector === selector);
    const elements = [];

    items.forEach(item => {
      if (item.pseudo === '::before') {
        const content = item.styles.content?.replace(/^["']|["']$/g, '') || '';
        elements.push({
          position: 'before',
          tag: 'span',
          className: `pseudo-before`,
          content,
          styles: { ...item.styles, content: undefined },
        });
      } else if (item.pseudo === '::after') {
        const content = item.styles.content?.replace(/^["']|["']$/g, '') || '';
        elements.push({
          position: 'after',
          tag: 'span',
          className: `pseudo-after`,
          content,
          styles: { ...item.styles, content: undefined },
        });
      }
    });

    return elements;
  }
};
