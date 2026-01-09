/**
 * Coverage Verifier
 *
 * The final answer to: "Did we find everything?"
 *
 * This module provides definitive coverage metrics by:
 *
 * 1. STATIC ANALYSIS - What COULD exist:
 *    - Parse all CSS for selectors (including :hover, :focus, etc.)
 *    - Find all elements that match those selectors
 *    - Find all elements with event listeners
 *    - Find all forms, inputs, links, buttons
 *    - Find all ARIA roles and interactive patterns
 *
 * 2. DYNAMIC TRACKING - What we ACTUALLY explored:
 *    - Track every element we interacted with
 *    - Track every state we visited
 *    - Track every event we triggered
 *    - Track every CSS rule that was activated
 *
 * 3. GAP ANALYSIS - What we MISSED:
 *    - Elements never interacted with
 *    - CSS pseudo-selectors never triggered
 *    - Routes/URLs never visited
 *    - Event types never fired
 *    - States never reached
 *
 * 4. COMPLETENESS CERTIFICATE - Proof of coverage
 */

export const coverageVerifier = {
  name: 'coverage-verifier',

  getInjectionScript() {
    return `
(function() {
  if (window.__coverageVerifierInstalled) return;
  window.__coverageVerifierInstalled = true;

  // ============================================
  // STATIC ANALYSIS: WHAT COULD EXIST
  // ============================================

  window.__staticAnalysis = {
    computed: false,
    elements: {
      interactive: [],      // All potentially interactive elements
      withListeners: [],    // Elements with event listeners
      withHoverStyles: [],  // Elements with :hover CSS
      withFocusStyles: [],  // Elements with :focus CSS
      forms: [],            // All form elements
      links: [],            // All links
      buttons: [],          // All buttons
    },
    cssRules: {
      total: 0,
      withPseudoClass: [],  // Rules with :hover, :focus, etc.
      withPseudoElement: [], // Rules with ::before, ::after
      mediaQueries: [],     // Media query breakpoints
    },
    routes: {
      internal: [],         // Internal links
      external: [],         // External links
      anchors: [],          // Hash links
    },
    eventTypes: new Set(),  // All event types found
  };

  // ============================================
  // DYNAMIC TRACKING: WHAT WE EXPLORED
  // ============================================

  window.__dynamicTracking = {
    elementsInteracted: new Set(),
    elementsHovered: new Set(),
    elementsFocused: new Set(),
    elementsClicked: new Set(),
    statesVisited: new Set(),
    eventsTriggered: new Map(), // eventType -> count
    cssRulesActivated: new Set(),
    routesVisited: new Set(),
    errorsEncountered: [],
  };

  // ============================================
  // PERFORM STATIC ANALYSIS
  // ============================================

  window.__performStaticAnalysis = function() {
    const analysis = window.__staticAnalysis;

    // Reset
    analysis.elements = {
      interactive: [],
      withListeners: [],
      withHoverStyles: [],
      withFocusStyles: [],
      forms: [],
      links: [],
      buttons: [],
    };
    analysis.cssRules = {
      total: 0,
      withPseudoClass: [],
      withPseudoElement: [],
      mediaQueries: [],
    };
    analysis.routes = { internal: [], external: [], anchors: [] };
    analysis.eventTypes = new Set();

    // 1. Find all interactive elements
    const interactiveSelectors = [
      'button', 'a[href]', 'input', 'select', 'textarea',
      '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
      '[role="menuitem"]', '[role="tab"]', '[role="switch"]', '[role="slider"]',
      '[role="option"]', '[role="combobox"]', '[role="listbox"]',
      '[tabindex]:not([tabindex="-1"])',
      '[onclick]', '[onmousedown]', '[onmouseenter]', '[ondblclick]',
      '[draggable="true"]', '[contenteditable="true"]',
      'summary', 'details', 'dialog', 'label[for]',
    ];

    const seenSelectors = new Set();
    interactiveSelectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          const uniqueSel = getUniqueSelector(el);
          if (uniqueSel && !seenSelectors.has(uniqueSel)) {
            seenSelectors.add(uniqueSel);
            analysis.elements.interactive.push({
              selector: uniqueSel,
              type: sel,
              visible: isVisible(el),
            });
          }
        });
      } catch (e) {}
    });

    // 2. Elements with cursor: pointer
    document.querySelectorAll('*').forEach(el => {
      try {
        if (getComputedStyle(el).cursor === 'pointer') {
          const uniqueSel = getUniqueSelector(el);
          if (uniqueSel && !seenSelectors.has(uniqueSel)) {
            seenSelectors.add(uniqueSel);
            analysis.elements.interactive.push({
              selector: uniqueSel,
              type: 'cursor-pointer',
              visible: isVisible(el),
            });
          }
        }
      } catch (e) {}
    });

    // 3. Analyze CSS rules
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        const rules = sheet.cssRules || sheet.rules || [];
        analysis.cssRules.total += rules.length;

        Array.from(rules).forEach(rule => {
          if (rule instanceof CSSStyleRule) {
            const selector = rule.selectorText;

            // Check for pseudo-classes
            if (selector.match(/:hover|:focus|:active|:focus-within|:focus-visible|:checked|:disabled|:valid|:invalid/)) {
              analysis.cssRules.withPseudoClass.push({
                selector,
                baseSelector: selector.replace(/:(hover|focus|active|focus-within|focus-visible|checked|disabled|valid|invalid)/g, '').trim(),
                pseudoClasses: selector.match(/:(hover|focus|active|focus-within|focus-visible|checked|disabled|valid|invalid)/g) || [],
              });

              // Track elements that have hover styles
              const baseSelector = selector.replace(/:(hover|focus|active|focus-within|focus-visible|checked|disabled|valid|invalid)/g, '').trim();
              try {
                document.querySelectorAll(baseSelector).forEach(el => {
                  const uniqueSel = getUniqueSelector(el);
                  if (uniqueSel) {
                    if (selector.includes(':hover') && !analysis.elements.withHoverStyles.includes(uniqueSel)) {
                      analysis.elements.withHoverStyles.push(uniqueSel);
                    }
                    if (selector.includes(':focus') && !analysis.elements.withFocusStyles.includes(uniqueSel)) {
                      analysis.elements.withFocusStyles.push(uniqueSel);
                    }
                  }
                });
              } catch (e) {}
            }

            // Check for pseudo-elements
            if (selector.match(/::before|::after|::placeholder|::selection/)) {
              analysis.cssRules.withPseudoElement.push({
                selector,
                pseudoElements: selector.match(/::before|::after|::placeholder|::selection/g) || [],
              });
            }
          } else if (rule instanceof CSSMediaRule) {
            analysis.cssRules.mediaQueries.push({
              condition: rule.conditionText,
              rulesCount: rule.cssRules?.length || 0,
            });
          }
        });
      } catch (e) {
        // Cross-origin stylesheet
      }
    });

    // 4. Find all links/routes
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;

      if (href.startsWith('#')) {
        analysis.routes.anchors.push(href);
      } else if (href.startsWith('http') && !href.includes(window.location.host)) {
        analysis.routes.external.push(href);
      } else {
        analysis.routes.internal.push(href);
      }

      const uniqueSel = getUniqueSelector(a);
      if (uniqueSel) {
        analysis.elements.links.push(uniqueSel);
      }
    });

    // 5. Find all buttons
    document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]').forEach(btn => {
      const uniqueSel = getUniqueSelector(btn);
      if (uniqueSel) {
        analysis.elements.buttons.push(uniqueSel);
      }
    });

    // 6. Find all forms
    document.querySelectorAll('form').forEach(form => {
      const uniqueSel = getUniqueSelector(form);
      if (uniqueSel) {
        const inputs = Array.from(form.querySelectorAll('input, select, textarea')).map(el => ({
          selector: getUniqueSelector(el),
          type: el.type || el.tagName.toLowerCase(),
          required: el.required,
        }));
        analysis.elements.forms.push({ selector: uniqueSel, inputs });
      }
    });

    // 7. Find elements with event listeners (if event extractor ran)
    if (window.__eventListenersCaptured?.listeners) {
      window.__eventListenersCaptured.listeners.forEach(l => {
        if (l.selector && l.active) {
          if (!analysis.elements.withListeners.some(e => e.selector === l.selector)) {
            analysis.elements.withListeners.push({
              selector: l.selector,
              eventTypes: [l.eventType],
            });
          } else {
            const existing = analysis.elements.withListeners.find(e => e.selector === l.selector);
            if (!existing.eventTypes.includes(l.eventType)) {
              existing.eventTypes.push(l.eventType);
            }
          }
          analysis.eventTypes.add(l.eventType);
        }
      });
    }

    analysis.computed = true;
    return analysis;
  };

  // ============================================
  // TRACK DYNAMIC INTERACTIONS
  // ============================================

  window.__trackInteraction = function(selector, interactionType) {
    const tracking = window.__dynamicTracking;

    tracking.elementsInteracted.add(selector);

    switch (interactionType) {
      case 'hover':
        tracking.elementsHovered.add(selector);
        break;
      case 'focus':
        tracking.elementsFocused.add(selector);
        break;
      case 'click':
        tracking.elementsClicked.add(selector);
        break;
    }
  };

  window.__trackEvent = function(eventType) {
    const tracking = window.__dynamicTracking;
    tracking.eventsTriggered.set(
      eventType,
      (tracking.eventsTriggered.get(eventType) || 0) + 1
    );
  };

  window.__trackState = function(stateHash) {
    window.__dynamicTracking.statesVisited.add(stateHash);
  };

  window.__trackRoute = function(url) {
    window.__dynamicTracking.routesVisited.add(url);
  };

  window.__trackError = function(error) {
    window.__dynamicTracking.errorsEncountered.push({
      message: error.message || error,
      timestamp: Date.now(),
    });
  };

  // ============================================
  // COMPUTE COVERAGE GAP
  // ============================================

  window.__computeCoverageGap = function() {
    // Ensure static analysis is done
    if (!window.__staticAnalysis.computed) {
      window.__performStaticAnalysis();
    }

    const static_ = window.__staticAnalysis;
    const dynamic = window.__dynamicTracking;

    const gap = {
      // Elements
      elementsNeverInteracted: [],
      elementsNeverHovered: [],
      elementsNeverFocused: [],
      elementsNeverClicked: [],

      // CSS
      hoverStylesNeverTriggered: [],
      focusStylesNeverTriggered: [],

      // Events
      eventTypesNeverFired: [],

      // Routes
      internalRoutesNeverVisited: [],
      anchorsNeverVisited: [],

      // Summary
      summary: {
        totalInteractive: 0,
        interacted: 0,
        coverage: 0,
      },
    };

    // Find uninteracted elements
    static_.elements.interactive.forEach(el => {
      if (!dynamic.elementsInteracted.has(el.selector)) {
        gap.elementsNeverInteracted.push(el);
      }
    });

    // Find unhovered elements (that have :hover styles)
    static_.elements.withHoverStyles.forEach(sel => {
      if (!dynamic.elementsHovered.has(sel)) {
        gap.hoverStylesNeverTriggered.push(sel);
      }
    });

    // Find unfocused elements (that have :focus styles)
    static_.elements.withFocusStyles.forEach(sel => {
      if (!dynamic.elementsFocused.has(sel)) {
        gap.focusStylesNeverTriggered.push(sel);
      }
    });

    // Find buttons never clicked
    static_.elements.buttons.forEach(sel => {
      if (!dynamic.elementsClicked.has(sel)) {
        gap.elementsNeverClicked.push(sel);
      }
    });

    // Find event types never fired
    static_.eventTypes.forEach(eventType => {
      if (!dynamic.eventsTriggered.has(eventType)) {
        gap.eventTypesNeverFired.push(eventType);
      }
    });

    // Find routes never visited
    const visitedPaths = new Set(
      Array.from(dynamic.routesVisited).map(url => new URL(url, window.location.origin).pathname)
    );
    static_.routes.internal.forEach(href => {
      try {
        const path = new URL(href, window.location.origin).pathname;
        if (!visitedPaths.has(path)) {
          gap.internalRoutesNeverVisited.push(href);
        }
      } catch (e) {}
    });

    // Summary
    gap.summary.totalInteractive = static_.elements.interactive.length;
    gap.summary.interacted = dynamic.elementsInteracted.size;
    gap.summary.coverage = static_.elements.interactive.length > 0
      ? ((dynamic.elementsInteracted.size / static_.elements.interactive.length) * 100).toFixed(1)
      : 100;

    return gap;
  };

  // ============================================
  // GENERATE COMPLETENESS CERTIFICATE
  // ============================================

  window.__generateCompletenessCertificate = function() {
    const gap = window.__computeCoverageGap();
    const static_ = window.__staticAnalysis;
    const dynamic = window.__dynamicTracking;

    const certificate = {
      timestamp: new Date().toISOString(),
      url: window.location.href,

      // Coverage scores
      coverage: {
        elements: {
          total: static_.elements.interactive.length,
          covered: dynamic.elementsInteracted.size,
          percentage: parseFloat(gap.summary.coverage),
          complete: gap.elementsNeverInteracted.length === 0,
        },
        hoverStyles: {
          total: static_.elements.withHoverStyles.length,
          covered: dynamic.elementsHovered.size,
          percentage: static_.elements.withHoverStyles.length > 0
            ? ((dynamic.elementsHovered.size / static_.elements.withHoverStyles.length) * 100).toFixed(1)
            : 100,
          complete: gap.hoverStylesNeverTriggered.length === 0,
        },
        focusStyles: {
          total: static_.elements.withFocusStyles.length,
          covered: dynamic.elementsFocused.size,
          percentage: static_.elements.withFocusStyles.length > 0
            ? ((dynamic.elementsFocused.size / static_.elements.withFocusStyles.length) * 100).toFixed(1)
            : 100,
          complete: gap.focusStylesNeverTriggered.length === 0,
        },
        states: {
          visited: dynamic.statesVisited.size,
        },
        routes: {
          total: static_.routes.internal.length,
          visited: dynamic.routesVisited.size,
        },
      },

      // What's missing
      gaps: {
        elementsNeverInteracted: gap.elementsNeverInteracted.slice(0, 50),
        hoverStylesNeverTriggered: gap.hoverStylesNeverTriggered.slice(0, 50),
        focusStylesNeverTriggered: gap.focusStylesNeverTriggered.slice(0, 50),
        eventTypesNeverFired: gap.eventTypesNeverFired,
        internalRoutesNeverVisited: gap.internalRoutesNeverVisited.slice(0, 50),
      },

      // Errors encountered
      errors: dynamic.errorsEncountered,

      // Overall status
      isComplete: gap.elementsNeverInteracted.length === 0 &&
                 gap.hoverStylesNeverTriggered.length === 0 &&
                 gap.focusStylesNeverTriggered.length === 0,

      // Recommendations for missed items
      recommendations: [],
    };

    // Generate recommendations
    if (gap.elementsNeverInteracted.length > 0) {
      certificate.recommendations.push({
        type: 'uninteracted-elements',
        count: gap.elementsNeverInteracted.length,
        action: 'These elements were never clicked/hovered. They may be hidden, require scrolling, or need specific conditions to become interactive.',
        examples: gap.elementsNeverInteracted.slice(0, 5).map(e => e.selector),
      });
    }

    if (gap.hoverStylesNeverTriggered.length > 0) {
      certificate.recommendations.push({
        type: 'untriggered-hover-styles',
        count: gap.hoverStylesNeverTriggered.length,
        action: 'These elements have :hover CSS rules that were never activated. Ensure hover extraction probed these elements.',
        examples: gap.hoverStylesNeverTriggered.slice(0, 5),
      });
    }

    if (gap.internalRoutesNeverVisited.length > 0) {
      certificate.recommendations.push({
        type: 'unvisited-routes',
        count: gap.internalRoutesNeverVisited.length,
        action: 'These internal links were never followed. Consider exploring multi-page flows.',
        examples: gap.internalRoutesNeverVisited.slice(0, 5),
      });
    }

    return certificate;
  };

  // Helper functions
  function getUniqueSelector(el) {
    if (!el || !(el instanceof Element)) return null;

    if (el.id && !el.id.match(/^[0-9]/)) {
      return '#' + CSS.escape(el.id);
    }

    const path = [];
    let current = el;
    let depth = 0;

    while (current && current !== document.body && depth < 8) {
      let selector = current.tagName.toLowerCase();

      if (current.id && !current.id.match(/^[0-9]/)) {
        path.unshift('#' + CSS.escape(current.id));
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
      depth++;
    }

    return path.join(' > ');
  }

  function isVisible(el) {
    const computed = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return computed.display !== 'none' &&
           computed.visibility !== 'hidden' &&
           computed.opacity !== '0' &&
           rect.width > 0 &&
           rect.height > 0;
  }

  console.log('[Coverage Verifier] Installed');
})();
`;
  },

  async performStaticAnalysis(page) {
    return await page.evaluate(() => {
      if (window.__performStaticAnalysis) {
        return window.__performStaticAnalysis();
      }
      return null;
    });
  },

  async computeCoverageGap(page) {
    return await page.evaluate(() => {
      if (window.__computeCoverageGap) {
        return window.__computeCoverageGap();
      }
      return null;
    });
  },

  async generateCertificate(page) {
    return await page.evaluate(() => {
      if (window.__generateCompletenessCertificate) {
        return window.__generateCompletenessCertificate();
      }
      return null;
    });
  },

  /**
   * Full verification workflow
   */
  async verify(page, explorationResults = null) {
    // 1. Inject the verifier
    await page.evaluate(this.getInjectionScript());

    // 2. Perform static analysis
    const staticAnalysis = await this.performStaticAnalysis(page);

    // 3. If exploration results provided, sync dynamic tracking
    if (explorationResults) {
      await page.evaluate((results) => {
        const tracking = window.__dynamicTracking;

        // Sync elements interacted
        if (results.elementsCovered) {
          results.elementsCovered.forEach(sel => tracking.elementsInteracted.add(sel));
        }

        // Sync states visited
        if (results.stateGraph?.nodes) {
          Object.keys(results.stateGraph.nodes).forEach(hash => {
            tracking.statesVisited.add(hash);
          });
        }

        // Sync from action log
        if (results.actionLog) {
          results.actionLog.forEach(action => {
            if (action.selector) {
              tracking.elementsInteracted.add(action.selector);
              if (action.action === 'click') tracking.elementsClicked.add(action.selector);
              if (action.action === 'hover') tracking.elementsHovered.add(action.selector);
              if (action.action === 'focus') tracking.elementsFocused.add(action.selector);
            }
          });
        }
      }, {
        elementsCovered: explorationResults.elementsInteracted
          ? Array.from(explorationResults.elementsInteracted)
          : [],
        stateGraph: explorationResults.stateGraph,
        actionLog: explorationResults.actionLog,
      });
    }

    // 4. Compute coverage gap
    const gap = await this.computeCoverageGap(page);

    // 5. Generate certificate
    const certificate = await this.generateCertificate(page);

    return {
      staticAnalysis,
      gap,
      certificate,
      isComplete: certificate?.isComplete || false,
    };
  },

  /**
   * Generate human-readable report
   */
  generateReport(verification) {
    const { certificate, gap } = verification;
    const lines = [];

    lines.push('# Coverage Verification Report');
    lines.push('');
    lines.push(`Generated: ${certificate.timestamp}`);
    lines.push(`URL: ${certificate.url}`);
    lines.push('');

    // Overall status
    lines.push('## Status: ' + (certificate.isComplete ? 'COMPLETE' : 'INCOMPLETE'));
    lines.push('');

    // Coverage scores
    lines.push('## Coverage Scores');
    lines.push('');
    lines.push('| Category | Total | Covered | Percentage | Complete |');
    lines.push('|----------|-------|---------|------------|----------|');

    const cov = certificate.coverage;
    lines.push(`| Interactive Elements | ${cov.elements.total} | ${cov.elements.covered} | ${cov.elements.percentage}% | ${cov.elements.complete ? 'Yes' : 'No'} |`);
    lines.push(`| Hover Styles | ${cov.hoverStyles.total} | ${cov.hoverStyles.covered} | ${cov.hoverStyles.percentage}% | ${cov.hoverStyles.complete ? 'Yes' : 'No'} |`);
    lines.push(`| Focus Styles | ${cov.focusStyles.total} | ${cov.focusStyles.covered} | ${cov.focusStyles.percentage}% | ${cov.focusStyles.complete ? 'Yes' : 'No'} |`);
    lines.push(`| States Visited | - | ${cov.states.visited} | - | - |`);
    lines.push(`| Routes | ${cov.routes.total} | ${cov.routes.visited} | - | - |`);
    lines.push('');

    // Gaps
    if (!certificate.isComplete) {
      lines.push('## Gaps Found');
      lines.push('');

      if (certificate.gaps.elementsNeverInteracted.length > 0) {
        lines.push(`### Elements Never Interacted (${certificate.gaps.elementsNeverInteracted.length})`);
        certificate.gaps.elementsNeverInteracted.slice(0, 10).forEach(el => {
          lines.push(`- \`${el.selector}\` (${el.type}${el.visible ? '' : ', hidden'})`);
        });
        if (certificate.gaps.elementsNeverInteracted.length > 10) {
          lines.push(`- ... and ${certificate.gaps.elementsNeverInteracted.length - 10} more`);
        }
        lines.push('');
      }

      if (certificate.gaps.hoverStylesNeverTriggered.length > 0) {
        lines.push(`### Hover Styles Never Triggered (${certificate.gaps.hoverStylesNeverTriggered.length})`);
        certificate.gaps.hoverStylesNeverTriggered.slice(0, 10).forEach(sel => {
          lines.push(`- \`${sel}\``);
        });
        lines.push('');
      }

      if (certificate.gaps.internalRoutesNeverVisited.length > 0) {
        lines.push(`### Routes Never Visited (${certificate.gaps.internalRoutesNeverVisited.length})`);
        certificate.gaps.internalRoutesNeverVisited.slice(0, 10).forEach(route => {
          lines.push(`- ${route}`);
        });
        lines.push('');
      }

      if (certificate.gaps.eventTypesNeverFired.length > 0) {
        lines.push(`### Event Types Never Fired`);
        lines.push(certificate.gaps.eventTypesNeverFired.join(', '));
        lines.push('');
      }
    }

    // Recommendations
    if (certificate.recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');
      certificate.recommendations.forEach((rec, i) => {
        lines.push(`### ${i + 1}. ${rec.type} (${rec.count} items)`);
        lines.push(rec.action);
        lines.push('');
        lines.push('Examples:');
        rec.examples.forEach(ex => lines.push(`- \`${ex}\``));
        lines.push('');
      });
    }

    return lines.join('\n');
  }
};
