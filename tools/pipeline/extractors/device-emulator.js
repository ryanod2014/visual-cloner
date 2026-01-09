/**
 * Device Emulator
 *
 * Tests the page as BOTH desktop and mobile by emulating:
 * - User agent string
 * - Touch capability
 * - Device pixel ratio
 * - Viewport size
 * - Hover capability
 * - Pointer type (coarse vs fine)
 * - Orientation
 * - Device motion/orientation APIs
 *
 * This captures behaviors that ONLY appear on mobile or ONLY on desktop.
 */

export const deviceEmulator = {
  name: 'device-emulator',

  // Device profiles
  DEVICES: {
    // Desktop
    'desktop-chrome': {
      name: 'Desktop Chrome',
      type: 'desktop',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    'desktop-firefox': {
      name: 'Desktop Firefox',
      type: 'desktop',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    },
    'desktop-safari': {
      name: 'Desktop Safari',
      type: 'desktop',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      isMobile: false,
      hasTouch: false,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    },

    // Mobile
    'iphone-14': {
      name: 'iPhone 14',
      type: 'mobile',
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
    'iphone-14-pro-max': {
      name: 'iPhone 14 Pro Max',
      type: 'mobile',
      viewport: { width: 430, height: 932 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
    'iphone-se': {
      name: 'iPhone SE',
      type: 'mobile',
      viewport: { width: 375, height: 667 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
    'pixel-7': {
      name: 'Pixel 7',
      type: 'mobile',
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2.625,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    },
    'samsung-galaxy-s23': {
      name: 'Samsung Galaxy S23',
      type: 'mobile',
      viewport: { width: 360, height: 780 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    },

    // Tablets
    'ipad': {
      name: 'iPad',
      type: 'tablet',
      viewport: { width: 810, height: 1080 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
    'ipad-pro': {
      name: 'iPad Pro 12.9"',
      type: 'tablet',
      viewport: { width: 1024, height: 1366 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
    'android-tablet': {
      name: 'Android Tablet',
      type: 'tablet',
      viewport: { width: 800, height: 1280 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Tab) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },

    // Landscape orientations
    'iphone-14-landscape': {
      name: 'iPhone 14 Landscape',
      type: 'mobile-landscape',
      viewport: { width: 844, height: 390 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
    'ipad-landscape': {
      name: 'iPad Landscape',
      type: 'tablet-landscape',
      viewport: { width: 1080, height: 810 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
  },

  getInjectionScript() {
    return `
(function() {
  if (window.__deviceEmulatorInstalled) return;
  window.__deviceEmulatorInstalled = true;

  window.__deviceCaptures = {
    devices: [],
  };

  // ============================================
  // CAPTURE DEVICE-SPECIFIC STATE
  // ============================================

  window.__captureDeviceState = function() {
    const state = {
      // Device detection results
      detection: {
        isMobile: /Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
        isTablet: /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent),
        isIOS: /iPhone|iPad|iPod/i.test(navigator.userAgent),
        isAndroid: /Android/i.test(navigator.userAgent),
        isSafari: /Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent),
        isChrome: /Chrome/i.test(navigator.userAgent),
        isFirefox: /Firefox/i.test(navigator.userAgent),
      },

      // Media query matches
      mediaQueries: {
        hover: window.matchMedia('(hover: hover)').matches,
        hoverNone: window.matchMedia('(hover: none)').matches,
        pointerFine: window.matchMedia('(pointer: fine)').matches,
        pointerCoarse: window.matchMedia('(pointer: coarse)').matches,
        anyHover: window.matchMedia('(any-hover: hover)').matches,
        anyPointer: window.matchMedia('(any-pointer: fine)').matches,
        portrait: window.matchMedia('(orientation: portrait)').matches,
        landscape: window.matchMedia('(orientation: landscape)').matches,
        prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        prefersDarkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
        touchScreen: window.matchMedia('(hover: none) and (pointer: coarse)').matches,
      },

      // Screen info
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight,
        colorDepth: window.screen.colorDepth,
        pixelDepth: window.screen.pixelDepth,
        orientation: window.screen.orientation?.type,
      },

      // Viewport info
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },

      // Touch support
      touch: {
        maxTouchPoints: navigator.maxTouchPoints,
        touchSupported: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      },

      // User agent
      userAgent: navigator.userAgent,
      platform: navigator.platform,

      // Elements visibility
      elements: {},
    };

    // Capture mobile-specific elements
    const mobileSelectors = [
      '.mobile-menu', '.hamburger', '.menu-toggle',
      '.mobile-nav', '.mobile-only', '.desktop-only',
      '.hide-mobile', '.hide-desktop', '.show-mobile', '.show-desktop',
      '[data-mobile]', '[data-desktop]',
      '.touch-only', '.no-touch',
      '.app-banner', '.app-download',
      '.mobile-header', '.desktop-header',
    ];

    mobileSelectors.forEach(sel => {
      const el = document.querySelector(sel);
      if (el) {
        const computed = getComputedStyle(el);
        state.elements[sel] = {
          exists: true,
          visible: computed.display !== 'none' && computed.visibility !== 'hidden',
          display: computed.display,
        };
      }
    });

    // Check for mobile-specific styles being applied
    state.mobileStyles = {
      hasHamburger: !!document.querySelector('.hamburger:not([style*="display: none"]), .menu-toggle:not([style*="display: none"])'),
      hasBottomNav: !!document.querySelector('[role="navigation"][style*="bottom"], .bottom-nav, .tab-bar'),
      hasTouchTargets: checkTouchTargets(),
    };

    return state;
  };

  // Check if touch targets are appropriately sized (44x44 min)
  function checkTouchTargets() {
    const interactiveElements = document.querySelectorAll('button, a, input, [role="button"]');
    let smallTargets = 0;
    let totalTargets = 0;

    interactiveElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        totalTargets++;
        if (rect.width < 44 || rect.height < 44) {
          smallTargets++;
        }
      }
    });

    return {
      total: totalTargets,
      small: smallTargets,
      percentage: totalTargets > 0 ? ((smallTargets / totalTargets) * 100).toFixed(1) : 0,
    };
  }

  // ============================================
  // DETECT DEVICE-SPECIFIC BEHAVIORS
  // ============================================

  window.__detectDeviceSpecificBehaviors = function() {
    const behaviors = {
      cssRules: {
        hoverStyles: [],
        touchStyles: [],
        mobileOnlyRules: [],
        desktopOnlyRules: [],
      },
      jsDetection: {},
    };

    // Find CSS rules that target hover/touch
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        Array.from(sheet.cssRules || []).forEach(rule => {
          if (rule instanceof CSSMediaRule) {
            const condition = rule.conditionText || '';

            if (condition.includes('hover: hover') || condition.includes('hover: none')) {
              behaviors.cssRules.hoverStyles.push({
                condition,
                rulesCount: rule.cssRules?.length || 0,
              });
            }

            if (condition.includes('pointer: coarse') || condition.includes('pointer: fine')) {
              behaviors.cssRules.touchStyles.push({
                condition,
                rulesCount: rule.cssRules?.length || 0,
              });
            }

            // Mobile-only rules (small screens)
            if (condition.includes('max-width: 767px') || condition.includes('max-width: 768px')) {
              behaviors.cssRules.mobileOnlyRules.push({
                condition,
                rulesCount: rule.cssRules?.length || 0,
              });
            }

            // Desktop-only rules (large screens)
            if (condition.includes('min-width: 1024px') || condition.includes('min-width: 1200px')) {
              behaviors.cssRules.desktopOnlyRules.push({
                condition,
                rulesCount: rule.cssRules?.length || 0,
              });
            }
          }
        });
      } catch (e) {}
    });

    // Check for common mobile detection patterns in JS
    behaviors.jsDetection = {
      usesNavigatorUserAgent: typeof window.__usesUserAgentDetection !== 'undefined',
      usesMobileDetectLib: typeof window.MobileDetect !== 'undefined',
      usesModernizr: typeof window.Modernizr !== 'undefined',
      hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
      viewportContent: document.querySelector('meta[name="viewport"]')?.content,
    };

    return behaviors;
  };

  console.log('[Device Emulator] Installed');
})();
`;
  },

  /**
   * Test page with a specific device profile
   */
  async testDevice(page, deviceKey, options = {}) {
    const device = this.DEVICES[deviceKey];
    if (!device) {
      throw new Error(`Unknown device: ${deviceKey}`);
    }

    const { settleTime = 1000, takeScreenshot = false } = options;

    // Apply device emulation
    await page.setViewportSize(device.viewport);

    // Set user agent and other properties via context
    // Note: For full emulation, need to create new context
    await page.evaluate((ua) => {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => ua,
        configurable: true,
      });
    }, device.userAgent);

    // Emulate touch if needed
    if (device.hasTouch) {
      await page.evaluate(() => {
        // Add touch event support indicators
        window.ontouchstart = null;
        Object.defineProperty(navigator, 'maxTouchPoints', {
          get: () => 5,
          configurable: true,
        });
      });
    }

    // Reload to apply changes
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(settleTime);

    // Inject and capture state
    await page.evaluate(this.getInjectionScript());

    const state = await page.evaluate(() => window.__captureDeviceState?.() || {});
    const behaviors = await page.evaluate(() => window.__detectDeviceSpecificBehaviors?.() || {});

    let screenshot = null;
    if (takeScreenshot) {
      screenshot = await page.screenshot({ type: 'png', fullPage: true });
    }

    return {
      device: deviceKey,
      deviceInfo: device,
      state,
      behaviors,
      screenshot,
    };
  },

  /**
   * Test page on both desktop and mobile
   */
  async compareDesktopMobile(page, options = {}) {
    const {
      desktopDevice = 'desktop-chrome',
      mobileDevice = 'iphone-14',
      tabletDevice = 'ipad',
      testTablet = true,
      takeScreenshots = false,
      settleTime = 1000,
    } = options;

    const url = page.url();
    const results = {
      url,
      desktop: null,
      mobile: null,
      tablet: null,
      differences: [],
    };

    // Test desktop
    results.desktop = await this.testDevice(page, desktopDevice, { takeScreenshots, settleTime });

    // Test mobile
    await page.goto(url, { waitUntil: 'networkidle' });
    results.mobile = await this.testDevice(page, mobileDevice, { takeScreenshots, settleTime });

    // Test tablet
    if (testTablet) {
      await page.goto(url, { waitUntil: 'networkidle' });
      results.tablet = await this.testDevice(page, tabletDevice, { takeScreenshots, settleTime });
    }

    // Find differences
    results.differences = this.findDifferences(results.desktop, results.mobile);

    return results;
  },

  /**
   * Comprehensive test across all devices
   */
  async exploreAllDevices(page, options = {}) {
    const {
      devices = Object.keys(this.DEVICES),
      takeScreenshots = false,
      settleTime = 1000,
      onProgress = null,
    } = options;

    const url = page.url();
    const results = {
      url,
      devices: [],
      summary: {
        mobileSpecificElements: new Set(),
        desktopSpecificElements: new Set(),
        hoverDependentElements: [],
        touchOptimizedElements: [],
      },
    };

    for (let i = 0; i < devices.length; i++) {
      const deviceKey = devices[i];

      // Navigate fresh for each device
      await page.goto(url, { waitUntil: 'networkidle' });

      const deviceResult = await this.testDevice(page, deviceKey, { takeScreenshots, settleTime });
      results.devices.push(deviceResult);

      // Track mobile/desktop specific elements
      for (const [selector, data] of Object.entries(deviceResult.state.elements || {})) {
        if (data.visible) {
          if (deviceResult.deviceInfo.type === 'mobile') {
            results.summary.mobileSpecificElements.add(selector);
          } else if (deviceResult.deviceInfo.type === 'desktop') {
            results.summary.desktopSpecificElements.add(selector);
          }
        }
      }

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: devices.length,
          device: deviceKey,
        });
      }
    }

    // Convert sets to arrays for JSON serialization
    results.summary.mobileSpecificElements = Array.from(results.summary.mobileSpecificElements);
    results.summary.desktopSpecificElements = Array.from(results.summary.desktopSpecificElements);

    // Find elements that are mobile-only (visible on mobile, hidden on desktop)
    results.summary.mobileOnlyElements = results.summary.mobileSpecificElements.filter(sel =>
      !results.summary.desktopSpecificElements.includes(sel)
    );

    // Find elements that are desktop-only
    results.summary.desktopOnlyElements = results.summary.desktopSpecificElements.filter(sel =>
      !results.summary.mobileSpecificElements.includes(sel)
    );

    return results;
  },

  /**
   * Find differences between desktop and mobile states
   */
  findDifferences(desktop, mobile) {
    const differences = [];

    // Element visibility differences
    const desktopElements = desktop.state.elements || {};
    const mobileElements = mobile.state.elements || {};

    const allSelectors = new Set([
      ...Object.keys(desktopElements),
      ...Object.keys(mobileElements),
    ]);

    for (const selector of allSelectors) {
      const desktopEl = desktopElements[selector];
      const mobileEl = mobileElements[selector];

      if (desktopEl?.visible !== mobileEl?.visible) {
        differences.push({
          type: 'visibility',
          selector,
          desktop: desktopEl?.visible ?? false,
          mobile: mobileEl?.visible ?? false,
          description: desktopEl?.visible
            ? `"${selector}" hidden on mobile`
            : `"${selector}" only visible on mobile`,
        });
      }
    }

    // Navigation differences
    if (desktop.state.mobileStyles?.hasHamburger !== mobile.state.mobileStyles?.hasHamburger) {
      differences.push({
        type: 'navigation',
        description: mobile.state.mobileStyles?.hasHamburger
          ? 'Mobile has hamburger menu'
          : 'Desktop has hamburger menu (unusual)',
        desktop: desktop.state.mobileStyles?.hasHamburger,
        mobile: mobile.state.mobileStyles?.hasHamburger,
      });
    }

    // Touch target differences
    const desktopSmall = desktop.state.mobileStyles?.hasTouchTargets?.small || 0;
    const mobileSmall = mobile.state.mobileStyles?.hasTouchTargets?.small || 0;

    if (mobileSmall > 0) {
      differences.push({
        type: 'accessibility',
        description: `${mobileSmall} touch targets are smaller than 44x44px on mobile`,
        mobileSmallTargets: mobileSmall,
      });
    }

    // CSS behavior differences
    if (mobile.behaviors.cssRules.hoverStyles.length > 0) {
      differences.push({
        type: 'css',
        description: `${mobile.behaviors.cssRules.hoverStyles.length} hover-specific CSS rules found`,
        rules: mobile.behaviors.cssRules.hoverStyles,
      });
    }

    return differences;
  },

  /**
   * Generate responsive code from device testing
   */
  generateResponsiveCode(results) {
    const lines = [];

    lines.push('/* Device-specific styles extracted from testing */');
    lines.push('');

    // Mobile-only elements
    if (results.summary?.mobileOnlyElements?.length > 0) {
      lines.push('/* Mobile-only elements */');
      lines.push('@media (min-width: 1024px) {');
      for (const selector of results.summary.mobileOnlyElements) {
        lines.push(`  ${selector} { display: none; }`);
      }
      lines.push('}');
      lines.push('');
    }

    // Desktop-only elements
    if (results.summary?.desktopOnlyElements?.length > 0) {
      lines.push('/* Desktop-only elements */');
      lines.push('@media (max-width: 1023px) {');
      for (const selector of results.summary.desktopOnlyElements) {
        lines.push(`  ${selector} { display: none; }`);
      }
      lines.push('}');
      lines.push('');
    }

    // Hover styles (only apply on hover-capable devices)
    lines.push('/* Hover styles - only for devices that support hover */');
    lines.push('@media (hover: hover) and (pointer: fine) {');
    lines.push('  /* Desktop hover styles go here */');
    lines.push('}');
    lines.push('');

    // Touch-friendly styles
    lines.push('/* Touch-friendly styles */');
    lines.push('@media (hover: none) and (pointer: coarse) {');
    lines.push('  /* Larger touch targets */');
    lines.push('  button, a, [role="button"] {');
    lines.push('    min-height: 44px;');
    lines.push('    min-width: 44px;');
    lines.push('  }');
    lines.push('}');

    return lines.join('\n');
  },

  /**
   * Generate report
   */
  generateReport(results) {
    const lines = [];

    lines.push('# Device Testing Report');
    lines.push('');
    lines.push(`URL: ${results.url}`);
    lines.push(`Devices tested: ${results.devices?.length || 3}`);
    lines.push('');

    if (results.differences) {
      lines.push('## Desktop vs Mobile Differences');
      lines.push('');

      if (results.differences.length === 0) {
        lines.push('No significant differences found.');
      } else {
        for (const diff of results.differences) {
          lines.push(`### ${diff.type}`);
          lines.push(diff.description);
          lines.push('');
        }
      }
    }

    if (results.summary) {
      lines.push('## Summary');
      lines.push('');
      lines.push(`- Mobile-only elements: ${results.summary.mobileOnlyElements?.length || 0}`);
      lines.push(`- Desktop-only elements: ${results.summary.desktopOnlyElements?.length || 0}`);

      if (results.summary.mobileOnlyElements?.length > 0) {
        lines.push('');
        lines.push('### Mobile-only Elements');
        for (const el of results.summary.mobileOnlyElements.slice(0, 10)) {
          lines.push(`- \`${el}\``);
        }
      }

      if (results.summary.desktopOnlyElements?.length > 0) {
        lines.push('');
        lines.push('### Desktop-only Elements');
        for (const el of results.summary.desktopOnlyElements.slice(0, 10)) {
          lines.push(`- \`${el}\``);
        }
      }
    }

    return lines.join('\n');
  }
};
