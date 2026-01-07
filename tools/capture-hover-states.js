/**
 * Hover State Capture Tool
 *
 * This script captures CSS hover states from interactive elements on a page.
 * It works by:
 * 1. Finding all interactive elements (links, buttons, cards)
 * 2. Capturing their default computed styles
 * 3. Hovering over each element
 * 4. Capturing hover state computed styles
 * 5. Comparing and extracting CSS differences
 * 6. Generating :hover CSS rules
 *
 * Usage with Playwright MCP:
 * - Navigate to target page
 * - Run this script via browser_evaluate
 */

// Properties most commonly changed on hover
const HOVER_PROPERTIES = [
  'opacity',
  'color',
  'backgroundColor',
  'borderColor',
  'transform',
  'boxShadow',
  'textDecoration',
  'textDecorationColor',
  'scale',
  'filter',
  'backdropFilter',
  'outline',
  'outlineColor',
  'fill',
  'stroke',
  'transition'
];

// Capture computed styles for relevant properties
function captureStyles(element) {
  const computed = window.getComputedStyle(element);
  const styles = {};

  HOVER_PROPERTIES.forEach(prop => {
    styles[prop] = computed.getPropertyValue(
      prop.replace(/([A-Z])/g, '-$1').toLowerCase()
    );
  });

  return styles;
}

// Compare two style objects and return differences
function compareStyles(defaultStyles, hoverStyles) {
  const diff = {};

  for (const prop of HOVER_PROPERTIES) {
    if (defaultStyles[prop] !== hoverStyles[prop]) {
      diff[prop] = {
        from: defaultStyles[prop],
        to: hoverStyles[prop]
      };
    }
  }

  return diff;
}

// Generate CSS selector for an element
function generateSelector(element) {
  // Try to use class or ID
  if (element.id) {
    return `#${element.id}`;
  }

  if (element.className && typeof element.className === 'string') {
    const classes = element.className.split(' ').filter(c => c.trim());
    if (classes.length > 0) {
      return `.${classes.join('.')}`;
    }
  }

  // Fall back to tag + nth-child
  const tag = element.tagName.toLowerCase();
  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter(c => c.tagName === element.tagName);
    const index = siblings.indexOf(element) + 1;
    return `${tag}:nth-of-type(${index})`;
  }

  return tag;
}

// Convert camelCase to kebab-case
function toKebab(str) {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

// Generate CSS rule from diff
function generateCSSRule(selector, diff) {
  const props = Object.entries(diff)
    .map(([prop, { to }]) => `  ${toKebab(prop)}: ${to};`)
    .join('\n');

  return `${selector}:hover {\n${props}\n}`;
}

// Main function to capture all hover states
async function captureAllHoverStates() {
  // Find interactive elements
  const selectors = [
    'a',
    'button',
    '[role="button"]',
    '.card',
    '.btn',
    '[class*="card"]',
    '[class*="button"]',
    '[class*="link"]',
    'nav a',
    'header a',
    '.nav-link',
    '.cta'
  ];

  const elements = new Set();
  selectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => elements.add(el));
  });

  const results = [];

  for (const element of elements) {
    // Skip invisible elements
    if (!element.offsetParent && element.tagName !== 'BODY') continue;

    const selector = generateSelector(element);

    // Capture default styles
    const defaultStyles = captureStyles(element);

    // Simulate hover using :hover pseudo-class
    // Since we can't truly trigger CSS :hover from JS,
    // we need to use Playwright's hover() method externally
    // This function captures the diff after Playwright hovers

    results.push({
      selector,
      element: element.outerHTML.substring(0, 200),
      defaultStyles,
      rect: element.getBoundingClientRect()
    });
  }

  return results;
}

// Export for use
if (typeof module !== 'undefined') {
  module.exports = { captureAllHoverStates, captureStyles, compareStyles, generateCSSRule };
}
