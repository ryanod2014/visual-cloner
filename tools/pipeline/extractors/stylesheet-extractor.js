/**
 * Stylesheet Extractor
 *
 * Captures ALL CSS rules including:
 * - Standard style rules
 * - Pseudo-selectors (:hover, :focus, :active, :nth-child, etc.)
 * - Pseudo-elements (::before, ::after, ::placeholder)
 * - Media queries (responsive breakpoints)
 * - Keyframe animations
 * - Font-face declarations
 * - CSS layers (@layer)
 * - Container queries
 * - Supports queries (@supports)
 * - Import rules
 */

export const stylesheetExtractor = {
  name: 'stylesheet',

  getInjectionScript() {
    return `
(function() {
  if (window.__stylesheetExtractorInstalled) return;
  window.__stylesheetExtractorInstalled = true;

  window.__stylesheetsCaptured = {
    rules: [],
    keyframes: {},
    fontFaces: [],
    mediaQueries: [],
    containerQueries: [],
    supportsQueries: [],
    layers: [],
    imports: [],
    variables: {},
    rawSheets: [],
  };

  // Calculate CSS specificity
  function calculateSpecificity(selector) {
    // Count IDs, classes/attributes/pseudo-classes, elements/pseudo-elements
    let ids = 0, classes = 0, elements = 0;

    // Remove pseudo-elements for counting (they don't affect specificity much)
    const withoutPseudoElements = selector.replace(/::[a-z-]+/gi, '');

    // Count IDs
    ids = (withoutPseudoElements.match(/#[a-z_-][a-z0-9_-]*/gi) || []).length;

    // Count classes, attribute selectors, pseudo-classes
    classes = (withoutPseudoElements.match(/\\.[a-z_-][a-z0-9_-]*/gi) || []).length;
    classes += (withoutPseudoElements.match(/\\[[^\\]]+\\]/gi) || []).length;
    classes += (withoutPseudoElements.match(/:[a-z-]+(?:\\([^)]*\\))?/gi) || []).length;

    // Count elements and pseudo-elements
    elements = (withoutPseudoElements.match(/^[a-z]+|\\s+[a-z]+/gi) || []).length;
    elements += (selector.match(/::[a-z-]+/gi) || []).length;

    return { ids, classes, elements, value: ids * 100 + classes * 10 + elements };
  }

  // Extract selector parts for analysis
  function analyzeSelector(selector) {
    const analysis = {
      raw: selector,
      hasPseudoClass: false,
      hasPseudoElement: false,
      hasMediaQuery: false,
      pseudoClasses: [],
      pseudoElements: [],
      baseSelector: selector,
    };

    // Find pseudo-classes
    const pseudoClassMatches = selector.match(/:[a-z-]+(?:\\([^)]*\\))?/gi) || [];
    if (pseudoClassMatches.length > 0) {
      analysis.hasPseudoClass = true;
      analysis.pseudoClasses = pseudoClassMatches;
      analysis.baseSelector = selector.replace(/:[a-z-]+(?:\\([^)]*\\))?/gi, '').trim();
    }

    // Find pseudo-elements
    const pseudoElementMatches = selector.match(/::[a-z-]+/gi) || [];
    if (pseudoElementMatches.length > 0) {
      analysis.hasPseudoElement = true;
      analysis.pseudoElements = pseudoElementMatches;
      analysis.baseSelector = analysis.baseSelector.replace(/::[a-z-]+/gi, '').trim();
    }

    return analysis;
  }

  // Extract rules from a CSSStyleSheet
  function extractRulesFromSheet(sheet, sheetInfo) {
    const extracted = {
      rules: [],
      keyframes: [],
      fontFaces: [],
      mediaQueries: [],
      containerQueries: [],
      supportsQueries: [],
      layers: [],
    };

    function processRules(rules, parentCondition = null) {
      for (const rule of rules) {
        try {
          if (rule instanceof CSSStyleRule) {
            const selectorAnalysis = analyzeSelector(rule.selectorText);

            extracted.rules.push({
              selector: rule.selectorText,
              cssText: rule.style.cssText,
              specificity: calculateSpecificity(rule.selectorText),
              analysis: selectorAnalysis,
              parentCondition,
              source: sheetInfo,
            });

          } else if (rule instanceof CSSKeyframesRule) {
            const keyframes = [];
            for (const keyframe of rule.cssRules) {
              keyframes.push({
                key: keyframe.keyText,
                styles: keyframe.style.cssText,
              });
            }
            extracted.keyframes.push({
              name: rule.name,
              keyframes,
              source: sheetInfo,
            });

          } else if (rule instanceof CSSFontFaceRule) {
            extracted.fontFaces.push({
              cssText: rule.cssText,
              fontFamily: rule.style.fontFamily,
              src: rule.style.src,
              fontWeight: rule.style.fontWeight,
              fontStyle: rule.style.fontStyle,
              source: sheetInfo,
            });

          } else if (rule instanceof CSSMediaRule) {
            const mediaRules = [];
            processRulesIntoArray(rule.cssRules, mediaRules, rule.conditionText);

            extracted.mediaQueries.push({
              condition: rule.conditionText,
              rules: mediaRules,
              source: sheetInfo,
            });

          } else if (rule instanceof CSSSupportsRule) {
            const supportsRules = [];
            processRulesIntoArray(rule.cssRules, supportsRules, '@supports ' + rule.conditionText);

            extracted.supportsQueries.push({
              condition: rule.conditionText,
              rules: supportsRules,
              source: sheetInfo,
            });

          } else if (rule.constructor.name === 'CSSContainerRule') {
            const containerRules = [];
            processRulesIntoArray(rule.cssRules, containerRules, '@container ' + rule.conditionText);

            extracted.containerQueries.push({
              condition: rule.conditionText,
              rules: containerRules,
              source: sheetInfo,
            });

          } else if (rule instanceof CSSLayerBlockRule) {
            const layerRules = [];
            processRulesIntoArray(rule.cssRules, layerRules, '@layer ' + rule.name);

            extracted.layers.push({
              name: rule.name,
              rules: layerRules,
              source: sheetInfo,
            });
          }
        } catch (e) {
          // Skip problematic rules
        }
      }
    }

    function processRulesIntoArray(rules, targetArray, condition) {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          targetArray.push({
            selector: rule.selectorText,
            cssText: rule.style.cssText,
            specificity: calculateSpecificity(rule.selectorText),
            analysis: analyzeSelector(rule.selectorText),
            parentCondition: condition,
          });
        } else if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) {
          // Nested queries - recurse
          processRulesIntoArray(rule.cssRules, targetArray, condition + ' / ' + rule.conditionText);
        }
      }
    }

    try {
      processRules(sheet.cssRules || sheet.rules || []);
    } catch (e) {
      console.log('[Stylesheet Extractor] Could not read rules from:', sheetInfo, e.message);
    }

    return extracted;
  }

  // Main capture function
  window.__captureStylesheets = function() {
    const allExtracted = {
      rules: [],
      keyframes: {},
      fontFaces: [],
      mediaQueries: [],
      containerQueries: [],
      supportsQueries: [],
      layers: [],
      imports: [],
      variables: {},
      sheetCount: 0,
      crossOriginSheets: [],
    };

    for (const sheet of document.styleSheets) {
      const sheetInfo = {
        href: sheet.href,
        title: sheet.title,
        disabled: sheet.disabled,
        ownerNode: sheet.ownerNode?.tagName,
        index: allExtracted.sheetCount,
      };

      allExtracted.sheetCount++;

      try {
        // Check if we can access the rules
        const rules = sheet.cssRules || sheet.rules;

        if (!rules) {
          allExtracted.crossOriginSheets.push(sheetInfo);
          continue;
        }

        const extracted = extractRulesFromSheet(sheet, sheetInfo);

        // Merge into allExtracted
        allExtracted.rules.push(...extracted.rules);
        extracted.keyframes.forEach(kf => {
          allExtracted.keyframes[kf.name] = kf;
        });
        allExtracted.fontFaces.push(...extracted.fontFaces);
        allExtracted.mediaQueries.push(...extracted.mediaQueries);
        allExtracted.containerQueries.push(...extracted.containerQueries);
        allExtracted.supportsQueries.push(...extracted.supportsQueries);
        allExtracted.layers.push(...extracted.layers);

      } catch (e) {
        // Cross-origin stylesheet
        allExtracted.crossOriginSheets.push({
          ...sheetInfo,
          error: e.message,
        });
      }
    }

    // Extract CSS variables from :root
    const rootStyles = getComputedStyle(document.documentElement);
    const cssVarRegex = /--[a-z0-9-_]+/gi;

    for (const sheet of document.styleSheets) {
      try {
        for (const rule of (sheet.cssRules || [])) {
          if (rule instanceof CSSStyleRule && rule.selectorText === ':root') {
            const matches = rule.cssText.match(cssVarRegex) || [];
            matches.forEach(varName => {
              allExtracted.variables[varName] = rootStyles.getPropertyValue(varName).trim();
            });
          }
        }
      } catch (e) {}
    }

    window.__stylesheetsCaptured = allExtracted;
    return allExtracted;
  };

  // Get rules matching a specific element
  window.__getRulesForElement = function(selector) {
    const el = document.querySelector(selector);
    if (!el) return [];

    if (!window.__stylesheetsCaptured.rules.length) {
      window.__captureStylesheets();
    }

    const matchingRules = [];
    for (const rule of window.__stylesheetsCaptured.rules) {
      try {
        if (el.matches(rule.analysis.baseSelector)) {
          matchingRules.push(rule);
        }
      } catch (e) {}
    }

    // Sort by specificity
    return matchingRules.sort((a, b) => b.specificity.value - a.specificity.value);
  };

  // Get all pseudo-class rules
  window.__getPseudoClassRules = function() {
    if (!window.__stylesheetsCaptured.rules.length) {
      window.__captureStylesheets();
    }

    return window.__stylesheetsCaptured.rules.filter(r => r.analysis.hasPseudoClass);
  };

  // Get all pseudo-element rules
  window.__getPseudoElementRules = function() {
    if (!window.__stylesheetsCaptured.rules.length) {
      window.__captureStylesheets();
    }

    return window.__stylesheetsCaptured.rules.filter(r => r.analysis.hasPseudoElement);
  };

  console.log('[Stylesheet Extractor] Installed');
})();
`;
  },

  async extractData(page) {
    return await page.evaluate(() => {
      if (window.__captureStylesheets) {
        return window.__captureStylesheets();
      }
      return window.__stylesheetsCaptured || { rules: [] };
    });
  },

  async getRulesForElement(page, selector) {
    return await page.evaluate((sel) => {
      if (window.__getRulesForElement) {
        return window.__getRulesForElement(sel);
      }
      return [];
    }, selector);
  },

  async getPseudoClassRules(page) {
    return await page.evaluate(() => {
      if (window.__getPseudoClassRules) {
        return window.__getPseudoClassRules();
      }
      return [];
    });
  },

  async getPseudoElementRules(page) {
    return await page.evaluate(() => {
      if (window.__getPseudoElementRules) {
        return window.__getPseudoElementRules();
      }
      return [];
    });
  },

  generateCSS(data) {
    const lines = [];

    // CSS Variables
    if (Object.keys(data.variables).length > 0) {
      lines.push(':root {');
      for (const [varName, value] of Object.entries(data.variables)) {
        lines.push(`  ${varName}: ${value};`);
      }
      lines.push('}');
      lines.push('');
    }

    // Font faces
    data.fontFaces.forEach(ff => {
      lines.push(ff.cssText);
      lines.push('');
    });

    // Keyframes
    for (const [name, kf] of Object.entries(data.keyframes)) {
      lines.push(`@keyframes ${name} {`);
      kf.keyframes.forEach(frame => {
        lines.push(`  ${frame.key} { ${frame.styles} }`);
      });
      lines.push('}');
      lines.push('');
    }

    // Regular rules (sorted by specificity)
    const sortedRules = [...data.rules].sort((a, b) => a.specificity.value - b.specificity.value);
    sortedRules.forEach(rule => {
      if (!rule.parentCondition && rule.cssText) {
        lines.push(`${rule.selector} { ${rule.cssText} }`);
      }
    });
    lines.push('');

    // Media queries
    data.mediaQueries.forEach(mq => {
      lines.push(`@media ${mq.condition} {`);
      mq.rules.forEach(rule => {
        if (rule.cssText) {
          lines.push(`  ${rule.selector} { ${rule.cssText} }`);
        }
      });
      lines.push('}');
      lines.push('');
    });

    // Container queries
    data.containerQueries.forEach(cq => {
      lines.push(`@container ${cq.condition} {`);
      cq.rules.forEach(rule => {
        if (rule.cssText) {
          lines.push(`  ${rule.selector} { ${rule.cssText} }`);
        }
      });
      lines.push('}');
      lines.push('');
    });

    // Supports queries
    data.supportsQueries.forEach(sq => {
      lines.push(`@supports ${sq.condition} {`);
      sq.rules.forEach(rule => {
        if (rule.cssText) {
          lines.push(`  ${rule.selector} { ${rule.cssText} }`);
        }
      });
      lines.push('}');
      lines.push('');
    });

    // Layers
    data.layers.forEach(layer => {
      lines.push(`@layer ${layer.name} {`);
      layer.rules.forEach(rule => {
        if (rule.cssText) {
          lines.push(`  ${rule.selector} { ${rule.cssText} }`);
        }
      });
      lines.push('}');
      lines.push('');
    });

    return lines.join('\n');
  }
};
