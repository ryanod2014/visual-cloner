/**
 * CSS Variables Extractor
 *
 * Captures ALL CSS custom properties including:
 * - :root level variables
 * - Element-scoped variables
 * - Variable changes over time
 * - Variable usage in stylesheets
 */

export const cssVariablesExtractor = {
  name: 'css-variables',

  getInjectionScript() {
    return `
(function() {
  if (window.__cssVariablesExtractorInstalled) return;
  window.__cssVariablesExtractorInstalled = true;

  window.__cssVariablesCaptured = {
    rootVariables: {},
    scopedVariables: [],
    variableChanges: [],
    variableUsage: [],
  };

  // ============================================
  // EXTRACT ROOT VARIABLES
  // ============================================

  function extractRootVariables() {
    const root = document.documentElement;
    const computed = getComputedStyle(root);
    const variables = {};

    // Get all custom properties from stylesheets
    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;

        for (const rule of rules) {
          if (rule.type === CSSRule.STYLE_RULE) {
            if (rule.selectorText === ':root' || rule.selectorText === 'html') {
              for (const prop of rule.style) {
                if (prop.startsWith('--')) {
                  variables[prop] = rule.style.getPropertyValue(prop).trim();
                }
              }
            }
          }
        }
      } catch (e) {
        // CORS restriction
      }
    }

    // Also get computed values (in case set via JS)
    const allProps = [];
    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;

        for (const rule of rules) {
          if (rule.style) {
            for (const prop of rule.style) {
              if (prop.startsWith('--')) {
                allProps.push(prop);
              }
            }
          }
        }
      } catch (e) {
        // CORS
      }
    }

    // Get computed values for known variables
    allProps.forEach(prop => {
      const value = computed.getPropertyValue(prop).trim();
      if (value) variables[prop] = value;
    });

    return variables;
  }

  // ============================================
  // EXTRACT SCOPED VARIABLES
  // ============================================

  function getUniqueSelector(el) {
    if (el.id) return '#' + el.id;
    if (el === document.body) return 'body';
    if (el === document.documentElement) return 'html';

    const path = [];
    while (el && el !== document.body && el !== document.documentElement) {
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

  function extractScopedVariables() {
    const scoped = [];

    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;

        for (const rule of rules) {
          if (rule.type === CSSRule.STYLE_RULE) {
            const hasVariables = [];
            for (const prop of rule.style) {
              if (prop.startsWith('--')) {
                hasVariables.push({
                  name: prop,
                  value: rule.style.getPropertyValue(prop).trim(),
                });
              }
            }

            if (hasVariables.length && rule.selectorText !== ':root' && rule.selectorText !== 'html') {
              scoped.push({
                selector: rule.selectorText,
                variables: hasVariables,
                source: sheet.href || 'inline',
              });
            }
          }
        }
      } catch (e) {
        // CORS
      }
    }

    return scoped;
  }

  // ============================================
  // EXTRACT VARIABLE USAGE
  // ============================================

  function extractVariableUsage() {
    const usage = [];

    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;

        for (const rule of rules) {
          if (rule.type === CSSRule.STYLE_RULE) {
            for (const prop of rule.style) {
              const value = rule.style.getPropertyValue(prop);
              const varMatches = value.match(/var\\(--[^)]+\\)/g);

              if (varMatches) {
                varMatches.forEach(match => {
                  const varName = match.match(/var\\((--[^,)]+)/)?.[1];
                  if (varName) {
                    usage.push({
                      selector: rule.selectorText,
                      property: prop,
                      variableName: varName,
                      fullValue: value,
                    });
                  }
                });
              }
            }
          }
        }
      } catch (e) {
        // CORS
      }
    }

    return usage;
  }

  // ============================================
  // INTERCEPT setProperty FOR VARIABLE CHANGES
  // ============================================

  const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function(property, value, priority) {
    if (property.startsWith('--')) {
      window.__cssVariablesCaptured.variableChanges.push({
        property,
        value,
        timestamp: Date.now(),
        context: this === document.documentElement.style ? 'root' : 'element',
      });
    }
    return originalSetProperty.call(this, property, value, priority);
  };

  // ============================================
  // SNAPSHOT FUNCTION
  // ============================================

  window.__captureCSSVariables = function() {
    window.__cssVariablesCaptured.rootVariables = extractRootVariables();
    window.__cssVariablesCaptured.scopedVariables = extractScopedVariables();
    window.__cssVariablesCaptured.variableUsage = extractVariableUsage();
    return window.__cssVariablesCaptured;
  };

  // Initial capture
  if (document.readyState === 'complete') {
    window.__captureCSSVariables();
  } else {
    window.addEventListener('load', () => window.__captureCSSVariables());
  }

  console.log('[CSS Variables Extractor] Installed');
})();
`;
  },

  async extractData(page) {
    return await page.evaluate(() => {
      if (window.__captureCSSVariables) {
        return window.__captureCSSVariables();
      }
      return window.__cssVariablesCaptured || {
        rootVariables: {},
        scopedVariables: [],
        variableChanges: [],
        variableUsage: [],
      };
    });
  },

  generateReplayCode(data) {
    if (!Object.keys(data.rootVariables).length && !data.scopedVariables.length) {
      return null;
    }

    const lines = [];
    lines.push('// CSS Variables Replay Code');
    lines.push('');

    // Generate root variables CSS
    if (Object.keys(data.rootVariables).length) {
      lines.push('export const rootVariablesCSS = `');
      lines.push(':root {');
      Object.entries(data.rootVariables).forEach(([name, value]) => {
        lines.push(`  ${name}: ${value};`);
      });
      lines.push('}');
      lines.push('`;');
      lines.push('');
    }

    // Generate scoped variables CSS
    if (data.scopedVariables.length) {
      lines.push('export const scopedVariablesCSS = `');
      data.scopedVariables.forEach(scope => {
        lines.push(`${scope.selector} {`);
        scope.variables.forEach(v => {
          lines.push(`  ${v.name}: ${v.value};`);
        });
        lines.push('}');
        lines.push('');
      });
      lines.push('`;');
      lines.push('');
    }

    // Generate JS for dynamic variable changes
    if (data.variableChanges.length) {
      lines.push('export const variableChanges = [');
      data.variableChanges.forEach(change => {
        lines.push(`  { property: '${change.property}', value: '${change.value}', context: '${change.context}' },`);
      });
      lines.push('];');
      lines.push('');

      lines.push('export function applyVariableChange(change) {');
      lines.push('  if (change.context === "root") {');
      lines.push('    document.documentElement.style.setProperty(change.property, change.value);');
      lines.push('  }');
      lines.push('}');
    }

    return lines.join('\n');
  },
};

export default cssVariablesExtractor;
