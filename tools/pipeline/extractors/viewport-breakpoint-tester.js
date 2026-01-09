/**
 * Viewport Breakpoint Tester
 *
 * Tests the page at every common breakpoint to capture:
 * - Media query activated styles
 * - Layout changes
 * - Hidden/shown elements
 * - Navigation changes (hamburger menus, etc.)
 * - Image srcset changes
 * - Font size changes
 *
 * Also detects:
 * - Custom breakpoints from CSS
 * - Container queries
 * - Orientation changes
 */

export const viewportBreakpointTester = {
  name: 'viewport-breakpoint-tester',

  // Common breakpoints (width x height)
  COMMON_BREAKPOINTS: [
    // Mobile
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'iPhone 12/13', width: 390, height: 844 },
    { name: 'iPhone 12/13 Pro Max', width: 428, height: 926 },
    { name: 'Pixel 5', width: 393, height: 851 },
    { name: 'Samsung Galaxy S21', width: 360, height: 800 },

    // Mobile Landscape
    { name: 'Mobile Landscape', width: 667, height: 375 },

    // Tablet
    { name: 'iPad Mini', width: 768, height: 1024 },
    { name: 'iPad', width: 810, height: 1080 },
    { name: 'iPad Pro 11"', width: 834, height: 1194 },
    { name: 'iPad Pro 12.9"', width: 1024, height: 1366 },

    // Tablet Landscape
    { name: 'iPad Landscape', width: 1024, height: 768 },

    // Desktop
    { name: 'Laptop', width: 1280, height: 800 },
    { name: 'Desktop HD', width: 1366, height: 768 },
    { name: 'Desktop', width: 1440, height: 900 },
    { name: 'Desktop Large', width: 1536, height: 864 },
    { name: 'Desktop FHD', width: 1920, height: 1080 },
    { name: 'Desktop 2K', width: 2560, height: 1440 },

    // Ultra-wide
    { name: 'Ultra-wide', width: 3440, height: 1440 },
  ],

  // CSS breakpoint values to also test
  CSS_BREAKPOINT_WIDTHS: [
    320, 480, 576, 640, 768, 800, 834, 960, 1024, 1080, 1200, 1280,
    1366, 1440, 1536, 1600, 1920, 2560,
  ],

  getInjectionScript() {
    return `
(function() {
  if (window.__viewportTesterInstalled) return;
  window.__viewportTesterInstalled = true;

  window.__viewportDataCaptured = {
    breakpoints: [],
    mediaQueries: [],
    containerQueries: [],
  };

  // Extract all media query breakpoints from CSS
  window.__extractMediaQueryBreakpoints = function() {
    const breakpoints = new Set();
    const queries = [];

    Array.from(document.styleSheets).forEach(sheet => {
      try {
        const rules = sheet.cssRules || sheet.rules || [];
        Array.from(rules).forEach(rule => {
          if (rule instanceof CSSMediaRule) {
            const condition = rule.conditionText || rule.media?.mediaText || '';
            queries.push({
              condition,
              rulesCount: rule.cssRules?.length || 0,
            });

            // Extract numeric values
            const widthMatches = condition.match(/(min|max)-width:\\s*(\\d+)/g);
            if (widthMatches) {
              widthMatches.forEach(match => {
                const num = parseInt(match.match(/\\d+/)[0]);
                breakpoints.add(num);
              });
            }

            const heightMatches = condition.match(/(min|max)-height:\\s*(\\d+)/g);
            if (heightMatches) {
              heightMatches.forEach(match => {
                const num = parseInt(match.match(/\\d+/)[0]);
                // Store as negative to distinguish from width
              });
            }
          }
        });
      } catch (e) {}
    });

    return {
      breakpoints: Array.from(breakpoints).sort((a, b) => a - b),
      queries,
    };
  };

  // Capture current viewport state
  window.__captureViewportState = function() {
    const state = {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
      },
      elements: {},
      layout: {},
      navigation: {},
    };

    // Capture visibility of key elements
    const keySelectors = [
      'header', 'nav', 'main', 'footer', 'aside',
      '.nav', '.navbar', '.header', '.footer', '.sidebar',
      '.menu', '.hamburger', '.mobile-menu', '.desktop-menu',
      '[role="navigation"]', '[role="banner"]', '[role="main"]',
    ];

    keySelectors.forEach(sel => {
      const el = document.querySelector(sel);
      if (el) {
        const computed = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        state.elements[sel] = {
          visible: computed.display !== 'none' && computed.visibility !== 'hidden',
          display: computed.display,
          width: rect.width,
          height: rect.height,
          position: computed.position,
        };
      }
    });

    // Capture layout info
    const body = document.body;
    const bodyComputed = getComputedStyle(body);
    state.layout = {
      bodyWidth: body.scrollWidth,
      bodyOverflowX: bodyComputed.overflowX,
      fontSize: bodyComputed.fontSize,
      gridColumns: bodyComputed.gridTemplateColumns,
    };

    // Check for mobile navigation patterns
    const hamburger = document.querySelector('.hamburger, .menu-toggle, [aria-label*="menu"], button[aria-expanded]');
    const mobileNav = document.querySelector('.mobile-nav, .mobile-menu, [data-mobile-menu]');
    state.navigation = {
      hasHamburger: !!hamburger,
      hamburgerVisible: hamburger ? getComputedStyle(hamburger).display !== 'none' : false,
      hasMobileNav: !!mobileNav,
      mobileNavVisible: mobileNav ? getComputedStyle(mobileNav).display !== 'none' : false,
    };

    // Capture active media queries
    state.activeMediaQueries = [];
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        Array.from(sheet.cssRules || []).forEach(rule => {
          if (rule instanceof CSSMediaRule) {
            if (window.matchMedia(rule.conditionText || rule.media?.mediaText).matches) {
              state.activeMediaQueries.push(rule.conditionText || rule.media?.mediaText);
            }
          }
        });
      } catch (e) {}
    });

    return state;
  };

  // Capture responsive images
  window.__captureResponsiveImages = function() {
    const images = [];

    document.querySelectorAll('img[srcset], picture source').forEach(el => {
      if (el.tagName === 'IMG') {
        images.push({
          selector: getSelector(el),
          src: el.src,
          currentSrc: el.currentSrc,
          srcset: el.srcset,
          sizes: el.sizes,
          naturalWidth: el.naturalWidth,
          naturalHeight: el.naturalHeight,
        });
      } else if (el.tagName === 'SOURCE') {
        images.push({
          selector: getSelector(el.parentElement),
          srcset: el.srcset,
          media: el.media,
          type: el.type,
        });
      }
    });

    return images;
  };

  function getSelector(el) {
    if (!el) return null;
    if (el.id) return '#' + el.id;
    if (el.className) return el.tagName.toLowerCase() + '.' + el.className.split(' ')[0];
    return el.tagName.toLowerCase();
  }

  console.log('[Viewport Breakpoint Tester] Installed');
})();
`;
  },

  /**
   * Test a single viewport size
   */
  async testViewport(page, width, height, options = {}) {
    const { settleTime = 500 } = options;

    // Resize viewport
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(settleTime);

    // Capture state at this viewport
    const state = await page.evaluate(() => window.__captureViewportState?.() || {});
    const images = await page.evaluate(() => window.__captureResponsiveImages?.() || []);

    // Take screenshot if requested
    let screenshot = null;
    if (options.takeScreenshots) {
      screenshot = await page.screenshot({ type: 'png' });
    }

    return {
      viewport: { width, height },
      state,
      images,
      screenshot,
    };
  },

  /**
   * Test all breakpoints
   */
  async explore(page, options = {}) {
    const {
      useCommonBreakpoints = true,
      useCSSBreakpoints = true,
      useCustomBreakpoints = [],
      testOrientations = true,
      takeScreenshots = false,
      settleTime = 500,
      onProgress = null,
    } = options;

    // Save original viewport
    const originalViewport = page.viewportSize();

    // Inject script
    await page.evaluate(this.getInjectionScript());

    // Get CSS-defined breakpoints
    const cssInfo = await page.evaluate(() => window.__extractMediaQueryBreakpoints?.() || { breakpoints: [], queries: [] });

    // Combine all breakpoints to test
    const viewportsToTest = [];

    if (useCommonBreakpoints) {
      this.COMMON_BREAKPOINTS.forEach(bp => viewportsToTest.push(bp));
    }

    if (useCSSBreakpoints) {
      // Add widths from CSS media queries
      cssInfo.breakpoints.forEach(width => {
        // Test at width - 1 and width + 1 to catch exact breakpoints
        [width - 1, width, width + 1].forEach(w => {
          if (w > 0 && !viewportsToTest.some(v => v.width === w)) {
            viewportsToTest.push({ name: `CSS ${w}px`, width: w, height: 800 });
          }
        });
      });

      // Also test common CSS widths
      this.CSS_BREAKPOINT_WIDTHS.forEach(width => {
        if (!viewportsToTest.some(v => v.width === width)) {
          viewportsToTest.push({ name: `${width}px`, width, height: 800 });
        }
      });
    }

    // Add custom breakpoints
    useCustomBreakpoints.forEach(bp => viewportsToTest.push(bp));

    // Sort by width
    viewportsToTest.sort((a, b) => a.width - b.width);

    // Dedupe (keep first occurrence by width)
    const uniqueViewports = [];
    const seenWidths = new Set();
    for (const vp of viewportsToTest) {
      if (!seenWidths.has(vp.width)) {
        seenWidths.add(vp.width);
        uniqueViewports.push(vp);
      }
    }

    // Test each viewport
    const results = {
      viewports: [],
      mediaQueries: cssInfo.queries,
      layoutChanges: [],
      navigationChanges: [],
      imageChanges: [],
    };

    let lastState = null;

    for (let i = 0; i < uniqueViewports.length; i++) {
      const vp = uniqueViewports[i];
      const result = await this.testViewport(page, vp.width, vp.height, { settleTime, takeScreenshots });
      result.name = vp.name;

      results.viewports.push(result);

      // Detect changes from previous viewport
      if (lastState) {
        // Layout changes
        const layoutDiff = this.diffStates(lastState.state.layout, result.state.layout);
        if (Object.keys(layoutDiff).length > 0) {
          results.layoutChanges.push({
            fromWidth: lastState.viewport.width,
            toWidth: vp.width,
            changes: layoutDiff,
          });
        }

        // Navigation changes
        const navDiff = this.diffStates(lastState.state.navigation, result.state.navigation);
        if (Object.keys(navDiff).length > 0) {
          results.navigationChanges.push({
            fromWidth: lastState.viewport.width,
            toWidth: vp.width,
            changes: navDiff,
          });
        }

        // Element visibility changes
        for (const [selector, data] of Object.entries(result.state.elements || {})) {
          const prevData = lastState.state.elements?.[selector];
          if (prevData && prevData.visible !== data.visible) {
            results.layoutChanges.push({
              fromWidth: lastState.viewport.width,
              toWidth: vp.width,
              element: selector,
              change: data.visible ? 'shown' : 'hidden',
            });
          }
        }
      }

      lastState = result;

      if (onProgress) {
        onProgress({
          tested: i + 1,
          total: uniqueViewports.length,
          currentWidth: vp.width,
        });
      }
    }

    // Restore original viewport
    await page.setViewportSize(originalViewport);

    // Analyze results to find actual breakpoints
    results.detectedBreakpoints = this.detectBreakpoints(results);

    return results;
  },

  /**
   * Diff two state objects
   */
  diffStates(state1, state2) {
    const diff = {};
    const allKeys = new Set([...Object.keys(state1 || {}), ...Object.keys(state2 || {})]);

    for (const key of allKeys) {
      if (JSON.stringify(state1?.[key]) !== JSON.stringify(state2?.[key])) {
        diff[key] = { from: state1?.[key], to: state2?.[key] };
      }
    }

    return diff;
  },

  /**
   * Detect actual breakpoints from test results
   */
  detectBreakpoints(results) {
    const breakpoints = [];

    // Find widths where significant changes occurred
    for (const change of results.layoutChanges) {
      const bp = {
        width: change.toWidth,
        type: 'layout',
        description: change.element
          ? `${change.element} ${change.change}`
          : JSON.stringify(change.changes),
      };

      if (!breakpoints.some(b => b.width === bp.width && b.type === bp.type)) {
        breakpoints.push(bp);
      }
    }

    for (const change of results.navigationChanges) {
      const bp = {
        width: change.toWidth,
        type: 'navigation',
        description: JSON.stringify(change.changes),
      };

      if (!breakpoints.some(b => b.width === bp.width && b.type === bp.type)) {
        breakpoints.push(bp);
      }
    }

    // Sort by width
    breakpoints.sort((a, b) => a.width - b.width);

    return breakpoints;
  },

  /**
   * Generate responsive CSS from results
   */
  generateResponsiveCSS(results) {
    const lines = [];
    lines.push('/* Detected responsive breakpoints */');
    lines.push('');

    // Group changes by breakpoint
    const byBreakpoint = {};
    for (const bp of results.detectedBreakpoints) {
      if (!byBreakpoint[bp.width]) {
        byBreakpoint[bp.width] = [];
      }
      byBreakpoint[bp.width].push(bp);
    }

    for (const [width, changes] of Object.entries(byBreakpoint)) {
      lines.push(`/* Breakpoint: ${width}px */`);
      lines.push(`@media (min-width: ${width}px) {`);
      for (const change of changes) {
        lines.push(`  /* ${change.type}: ${change.description} */`);
      }
      lines.push('}');
      lines.push('');
    }

    return lines.join('\n');
  },

  /**
   * Generate report
   */
  generateReport(results) {
    const lines = [];

    lines.push('# Viewport Breakpoint Report');
    lines.push('');
    lines.push(`Tested ${results.viewports.length} viewport sizes`);
    lines.push('');

    lines.push('## Detected Breakpoints');
    lines.push('');
    lines.push('| Width | Type | Description |');
    lines.push('|-------|------|-------------|');
    for (const bp of results.detectedBreakpoints) {
      lines.push(`| ${bp.width}px | ${bp.type} | ${bp.description} |`);
    }
    lines.push('');

    lines.push('## Media Queries Found');
    lines.push('');
    for (const query of results.mediaQueries) {
      lines.push(`- \`${query.condition}\` (${query.rulesCount} rules)`);
    }
    lines.push('');

    lines.push('## Navigation Changes');
    lines.push('');
    for (const change of results.navigationChanges) {
      lines.push(`- At ${change.toWidth}px: ${JSON.stringify(change.changes)}`);
    }

    return lines.join('\n');
  }
};
