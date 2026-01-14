/**
 * HTML Static Analyzer
 *
 * Extract all elements and their interactive potential from HTML.
 * No browser needed - pure parsing.
 */

const { JSDOM } = require('jsdom');

/**
 * Analyze HTML to extract all elements and interaction points
 */
function analyzeHTML(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const elements = [];
  const interactive = [];
  const forms = [];
  const landmarks = [];

  // Process all elements
  const allElements = document.querySelectorAll('*');

  allElements.forEach((el, index) => {
    const element = extractElementInfo(el, index);
    elements.push(element);

    // Check if interactive
    if (isInteractive(el, element)) {
      interactive.push({
        ...element,
        interactionTypes: getInteractionTypes(el, element)
      });
    }

    // Track forms
    if (el.tagName === 'FORM') {
      forms.push(extractFormInfo(el, element));
    }

    // Track landmarks
    if (isLandmark(el)) {
      landmarks.push({
        ...element,
        role: el.getAttribute('role') || getLandmarkRole(el)
      });
    }
  });

  return {
    elements,
    interactive,
    forms,
    landmarks,
    summary: {
      total: elements.length,
      interactive: interactive.length,
      forms: forms.length,
      landmarks: landmarks.length
    }
  };
}

/**
 * Extract information about a single element
 */
function extractElementInfo(el, index) {
  // Handle className which can be SVGAnimatedString for SVG elements
  const className = typeof el.className === 'string' ? el.className :
                    el.className?.baseVal || el.getAttribute('class') || null;

  return {
    index,
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    className,
    name: el.getAttribute('name') || null,
    type: el.getAttribute('type') || null,
    role: el.getAttribute('role') || null,
    ariaLabel: el.getAttribute('aria-label') || null,
    ariaExpanded: el.getAttribute('aria-expanded'),
    ariaHaspopup: el.getAttribute('aria-haspopup'),
    tabIndex: el.getAttribute('tabindex'),
    href: el.getAttribute('href') || null,
    src: el.getAttribute('src') || null,
    disabled: el.hasAttribute('disabled'),
    readonly: el.hasAttribute('readonly'),
    required: el.hasAttribute('required'),
    placeholder: el.getAttribute('placeholder'),
    value: el.getAttribute('value'),
    // Generate unique selector
    selector: generateSelector(el),
    // Event handler attributes
    handlers: {
      onclick: el.hasAttribute('onclick'),
      onchange: el.hasAttribute('onchange'),
      oninput: el.hasAttribute('oninput'),
      onsubmit: el.hasAttribute('onsubmit'),
      onfocus: el.hasAttribute('onfocus'),
      onblur: el.hasAttribute('onblur'),
      onmouseover: el.hasAttribute('onmouseover'),
      onmouseout: el.hasAttribute('onmouseout'),
      onkeydown: el.hasAttribute('onkeydown'),
      onkeyup: el.hasAttribute('onkeyup')
    },
    // Data attributes (often used for JS bindings)
    dataAttributes: extractDataAttributes(el),
    // Text content (truncated)
    textContent: el.textContent?.trim().substring(0, 100) || null
  };
}

/**
 * Generate a unique CSS selector for an element
 */
function generateSelector(el) {
  if (el.id) {
    return `#${el.id}`;
  }

  const parts = [];
  let current = el;

  while (current && current.tagName) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      parts.unshift(`#${current.id}`);
      break;
    }

    // Handle className which can be SVGAnimatedString for SVG elements
    const classNameStr = typeof current.className === 'string' ? current.className :
                         current.className?.baseVal || current.getAttribute('class') || '';
    if (classNameStr) {
      const classes = classNameStr.trim().split(/\s+/).filter(c => c);
      if (classes.length > 0) {
        selector += '.' + classes.slice(0, 2).join('.');
      }
    }

    // Add nth-child if needed for specificity
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
    }

    parts.unshift(selector);
    current = current.parentElement;

    // Limit depth
    if (parts.length > 5) break;
  }

  return parts.join(' > ');
}

/**
 * Extract data-* attributes
 */
function extractDataAttributes(el) {
  const data = {};
  for (const attr of el.attributes) {
    if (attr.name.startsWith('data-')) {
      data[attr.name] = attr.value;
    }
  }
  return Object.keys(data).length > 0 ? data : null;
}

/**
 * Determine if an element is interactive
 */
function isInteractive(el, info) {
  const tag = el.tagName.toLowerCase();

  // Inherently interactive elements
  if (['a', 'button', 'input', 'select', 'textarea', 'details', 'summary'].includes(tag)) {
    return true;
  }

  // Has click handler
  if (info.handlers.onclick) return true;

  // Has tabindex
  if (info.tabIndex !== null && info.tabIndex !== '-1') return true;

  // Has interactive ARIA role
  const interactiveRoles = ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'switch', 'option', 'slider', 'textbox', 'combobox', 'listbox', 'menu', 'menubar', 'tablist', 'tree', 'treeitem', 'grid', 'gridcell'];
  if (info.role && interactiveRoles.includes(info.role)) return true;

  // Has aria-expanded (typically toggle buttons)
  if (info.ariaExpanded !== null) return true;

  // Has data-* attributes that suggest interaction
  if (info.dataAttributes) {
    const interactiveDataAttrs = ['data-action', 'data-toggle', 'data-target', 'data-bs-toggle', 'data-bs-target', 'data-modal', 'data-dismiss', 'data-slide', 'data-testid'];
    if (Object.keys(info.dataAttributes).some(key => interactiveDataAttrs.some(attr => key.startsWith(attr.replace('data-', ''))))) {
      return true;
    }
  }

  return false;
}

/**
 * Get interaction types for an element
 */
function getInteractionTypes(el, info) {
  const types = [];
  const tag = el.tagName.toLowerCase();

  // Universal interactions
  types.push('click');
  types.push('focus');

  // Hover
  types.push('hover');

  // Element-specific
  if (['input', 'textarea'].includes(tag)) {
    types.push('input');
    types.push('change');
    if (info.type === 'text' || info.type === 'search' || info.type === 'email' || info.type === 'password' || !info.type) {
      types.push('keydown');
    }
  }

  if (tag === 'select') {
    types.push('change');
  }

  if (tag === 'form') {
    types.push('submit');
  }

  if (tag === 'a' && info.href) {
    types.push('navigate');
  }

  if (info.type === 'checkbox' || info.type === 'radio') {
    types.push('check');
  }

  // Keyboard navigation
  if (info.role === 'menu' || info.role === 'listbox' || info.role === 'tablist') {
    types.push('keyboard-nav');
  }

  // Double-click (for editable content)
  if (el.getAttribute('contenteditable') === 'true') {
    types.push('dblclick');
  }

  return types;
}

/**
 * Extract form information
 */
function extractFormInfo(el, elementInfo) {
  const fields = [];

  el.querySelectorAll('input, select, textarea').forEach(field => {
    fields.push({
      name: field.getAttribute('name'),
      type: field.getAttribute('type') || field.tagName.toLowerCase(),
      required: field.hasAttribute('required'),
      pattern: field.getAttribute('pattern'),
      minLength: field.getAttribute('minlength'),
      maxLength: field.getAttribute('maxlength'),
      min: field.getAttribute('min'),
      max: field.getAttribute('max')
    });
  });

  return {
    ...elementInfo,
    action: el.getAttribute('action') || null,
    method: el.getAttribute('method') || 'get',
    fields,
    hasValidation: fields.some(f => f.required || f.pattern || f.minLength)
  };
}

/**
 * Check if element is a landmark
 */
function isLandmark(el) {
  const landmarkTags = ['header', 'footer', 'main', 'nav', 'aside', 'section', 'article'];
  const landmarkRoles = ['banner', 'contentinfo', 'main', 'navigation', 'complementary', 'region', 'article', 'form', 'search'];

  return landmarkTags.includes(el.tagName.toLowerCase()) ||
         landmarkRoles.includes(el.getAttribute('role'));
}

/**
 * Get landmark role for semantic elements
 */
function getLandmarkRole(el) {
  const tag = el.tagName.toLowerCase();
  const mapping = {
    header: 'banner',
    footer: 'contentinfo',
    main: 'main',
    nav: 'navigation',
    aside: 'complementary',
    section: 'region',
    article: 'article'
  };
  return mapping[tag] || null;
}

module.exports = { analyzeHTML };
