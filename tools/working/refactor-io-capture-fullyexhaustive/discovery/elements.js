/**
 * Programmatically discover ALL interactive elements
 * No manual lists - purely algorithmic
 */
const logger = require('../utils/logger');

async function discoverElements(page) {
  logger.info('Discovering all interactive elements...');

  const elements = await page.evaluate(() => {
    const results = [];
    const seen = new Set();

    document.querySelectorAll('*').forEach(el => {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);

      // Skip invisible elements
      if (rect.width === 0 || rect.height === 0) return;
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (cs.pointerEvents === 'none') return;

      // Generate selector
      const selector = window.__getUniqueSelector?.(el) ||
        el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}`;
      if (seen.has(selector)) return;
      seen.add(selector);

      // Compute interactivity score
      const score = computeInteractivityScore(el, cs);
      if (score === 0) return;

      results.push({
        selector,
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        role: el.getAttribute('role'),
        text: (el.textContent || '').slice(0, 50).trim(),
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        score,
        attributes: {
          id: el.id || null,
          name: el.name || null,
          href: el.href || null,
          disabled: el.disabled || false,
          readonly: el.readOnly || false
        }
      });
    });

    function computeInteractivityScore(el, cs) {
      let score = 0;
      const tag = el.tagName.toLowerCase();

      // Intrinsically interactive
      if (['a', 'button', 'input', 'select', 'textarea', 'summary'].includes(tag)) {
        score += 100;
      }

      // ARIA roles
      const role = el.getAttribute('role');
      if (['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio',
           'switch', 'option', 'slider', 'textbox'].includes(role)) {
        score += 90;
      }

      // Cursor pointer
      if (cs.cursor === 'pointer') score += 50;

      // Tabindex
      const tabindex = el.getAttribute('tabindex');
      if (tabindex !== null && tabindex !== '-1') score += 40;

      // Event handler attributes
      const handlerAttrs = ['onclick', 'onmousedown', 'onkeydown', 'onchange'];
      for (const attr of handlerAttrs) {
        if (el.hasAttribute(attr)) score += 30;
      }

      // Contenteditable
      if (el.isContentEditable) score += 80;

      return score;
    }

    return results.sort((a, b) => b.score - a.score);
  });

  logger.info(`Found ${elements.length} interactive elements`);
  return elements;
}

module.exports = { discoverElements };
