/**
 * Generate unique, stable selectors for elements
 */

function getUniqueSelector(element) {
  // Priority 1: ID
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  // Priority 2: Data attributes
  const dataAttrs = ['data-testid', 'data-cy', 'data-test', 'data-id'];
  for (const attr of dataAttrs) {
    const val = element.getAttribute(attr);
    if (val) return `[${attr}="${CSS.escape(val)}"]`;
  }

  // Priority 3: Name attribute
  if (element.name) {
    return `[name="${CSS.escape(element.name)}"]`;
  }

  // Priority 4: Unique class combination
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\s+/).filter(c => c);
    if (classes.length > 0) {
      const selector = '.' + classes.map(c => CSS.escape(c)).join('.');
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    }
  }

  // Priority 5: Structural path
  return getStructuralSelector(element);
}

function getStructuralSelector(element) {
  const path = [];
  let current = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    // Add nth-child if needed
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        c => c.tagName === current.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    path.unshift(selector);
    current = parent;
  }

  return 'body > ' + path.join(' > ');
}

function getXPath(element) {
  if (element.id) return `//*[@id="${element.id}"]`;

  const parts = [];
  while (element && element.nodeType === Node.ELEMENT_NODE) {
    let index = 1;
    let sibling = element.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === element.tagName) index++;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(`${element.tagName.toLowerCase()}[${index}]`);
    element = element.parentElement;
  }
  return '/' + parts.join('/');
}

// For use in browser context
const SELECTOR_SCRIPT = `
  window.__getUniqueSelector = ${getUniqueSelector.toString()};
  window.__getStructuralSelector = ${getStructuralSelector.toString()};
  window.__getXPath = ${getXPath.toString()};
`;

module.exports = {
  getUniqueSelector,
  getStructuralSelector,
  getXPath,
  SELECTOR_SCRIPT
};
