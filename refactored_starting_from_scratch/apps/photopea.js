/**
 * Photopea App Plugin
 *
 * Photopea is a complex web-based image editor supporting PSD, AI, XCF, and other formats.
 * This plugin provides:
 * - Custom triggers for Photopea's unique UI interactions
 * - Patchers to bypass domain/license checks for offline use
 *
 * Reference: Existing working extractions at output/photopea.com-[timestamp]/
 *
 * WHAT MAKES PHOTOPEA SPECIAL:
 * - Supports file format drag-drop (PSD, AI, etc.)
 * - Uses long-press (300ms) for toolbar sub-menus
 * - Has positional context menus (right-click varies by location)
 * - Contains domain validation (J.adQ) and license checks (ak6)
 * - Uses U.alp() for app mode detection (Photopea vs Vectorpea)
 * - Has analytics (lm) that should be removed for offline
 */

import { BaseAppPlugin } from './base.js';
import { ITrigger } from '../plugins/triggers/interface.js';
import { IPatcher, PatchResult } from '../plugins/patchers/interface.js';

// =============================================================================
// CUSTOM TRIGGERS FOR PHOTOPEA
// =============================================================================

/**
 * File Format Drop Trigger
 * Tests dropping various file formats that Photopea supports
 * This reveals format-specific UI and handlers
 */
class FileFormatDropTrigger extends ITrigger {
  constructor() {
    super('photopea-file-drop', 'Test file format drop handlers');
  }

  async execute(page, options = {}) {
    const { onProgress = null } = options;
    const log = (msg) => onProgress?.(msg);

    const stats = {
      formatsTested: 0,
      dropsSimulated: 0,
    };

    // Photopea's supported formats
    const formats = [
      { ext: 'psd', mime: 'image/vnd.adobe.photoshop', name: 'Adobe Photoshop' },
      { ext: 'ai', mime: 'application/postscript', name: 'Adobe Illustrator' },
      { ext: 'xcf', mime: 'image/x-xcf', name: 'GIMP' },
      { ext: 'sketch', mime: 'application/sketch', name: 'Sketch' },
      { ext: 'xd', mime: 'application/xd', name: 'Adobe XD' },
      { ext: 'fig', mime: 'application/figma', name: 'Figma' },
      { ext: 'pdf', mime: 'application/pdf', name: 'PDF' },
      { ext: 'svg', mime: 'image/svg+xml', name: 'SVG' },
      { ext: 'eps', mime: 'application/postscript', name: 'EPS' },
      { ext: 'raw', mime: 'image/x-raw', name: 'Camera RAW' },
    ];

    log('Simulating file format drop events...');

    for (const format of formats) {
      try {
        // Simulate dragenter event with format-specific dataTransfer
        await page.evaluate((fmt) => {
          const event = new DragEvent('dragenter', {
            bubbles: true,
            cancelable: true,
            dataTransfer: new DataTransfer(),
          });

          // Create a mock file
          const file = new File([''], `test.${fmt.ext}`, { type: fmt.mime });
          event.dataTransfer.items.add(file);

          document.body.dispatchEvent(event);
        }, format);

        stats.formatsTested++;

        // Simulate dragover
        await page.evaluate(() => {
          const event = new DragEvent('dragover', {
            bubbles: true,
            cancelable: true,
          });
          document.body.dispatchEvent(event);
        });

        // Simulate dragleave (cancel drop)
        await page.evaluate(() => {
          const event = new DragEvent('dragleave', {
            bubbles: true,
            cancelable: true,
          });
          document.body.dispatchEvent(event);
        });

        stats.dropsSimulated++;
        await page.waitForTimeout(50);
      } catch (e) {
        // Format handler may not exist, continue
      }
    }

    return stats;
  }
}

/**
 * Long Press Toolbar Trigger
 * Photopea shows additional tools on 300ms hold
 */
class LongPressToolbarTrigger extends ITrigger {
  constructor() {
    super('photopea-long-press', 'Test long-press toolbar interactions');
  }

  async execute(page, options = {}) {
    const { holdDurationMs = 350, onProgress = null } = options;
    const log = (msg) => onProgress?.(msg);

    const stats = {
      toolbarsFound: 0,
      longPressesPerformed: 0,
      subMenusRevealed: 0,
    };

    log('Finding toolbar items for long-press...');

    // Find toolbar items (typically on left side of Photopea)
    const toolbarItems = await page.$$('[class*="tool"], [class*="Tool"], .toolbar > *, [data-tool]');
    stats.toolbarsFound = toolbarItems.length;

    for (const item of toolbarItems) {
      try {
        const box = await item.boundingBox();
        if (!box) continue;

        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        // Perform long press: mousedown, wait, mouseup
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.waitForTimeout(holdDurationMs);
        stats.longPressesPerformed++;

        // Check if sub-menu appeared
        const subMenu = await page.$('[class*="submenu"], [class*="SubMenu"], [class*="flyout"]');
        if (subMenu) {
          stats.subMenusRevealed++;
          // Click away to close
          await page.mouse.click(x + 200, y);
        } else {
          await page.mouse.up();
        }

        await page.waitForTimeout(50);
      } catch (e) {
        // Continue on error
      }
    }

    // Also try specific known tool positions (left toolbar)
    log('Testing known tool positions...');
    const knownToolY = [50, 80, 110, 140, 170, 200, 230, 260, 290, 320];
    const toolX = 25; // Left toolbar is typically around x=25

    for (const y of knownToolY) {
      try {
        await page.mouse.move(toolX, y);
        await page.mouse.down();
        await page.waitForTimeout(holdDurationMs);
        stats.longPressesPerformed++;
        await page.mouse.up();
        await page.waitForTimeout(30);
        await page.keyboard.press('Escape');
      } catch (e) {
        // Continue
      }
    }

    return stats;
  }
}

/**
 * Positional Menu Trigger
 * Photopea's context menus vary by click location
 */
class PositionalMenuTrigger extends ITrigger {
  constructor() {
    super('photopea-positional-menu', 'Test position-sensitive context menus');
  }

  async execute(page, options = {}) {
    const { onProgress = null } = options;
    const log = (msg) => onProgress?.(msg);

    const stats = {
      positionsTested: 0,
      menusRevealed: 0,
    };

    // Get viewport dimensions
    const viewport = await page.viewportSize();
    if (!viewport) return stats;

    // Key positions to test in Photopea:
    // - Canvas area (center): Layer operations
    // - Layers panel (right): Layer management
    // - Toolbar (left): Tool options
    // - Menu bar (top): App menus
    // - History panel: History operations
    // - Color swatches: Color management
    const positions = [
      { name: 'canvas-center', x: viewport.width * 0.5, y: viewport.height * 0.5 },
      { name: 'canvas-top-left', x: viewport.width * 0.3, y: viewport.height * 0.3 },
      { name: 'canvas-bottom-right', x: viewport.width * 0.7, y: viewport.height * 0.7 },
      { name: 'layers-panel', x: viewport.width - 100, y: viewport.height * 0.5 },
      { name: 'layers-panel-top', x: viewport.width - 100, y: viewport.height * 0.3 },
      { name: 'layers-panel-bottom', x: viewport.width - 100, y: viewport.height * 0.7 },
      { name: 'toolbar-top', x: 25, y: 100 },
      { name: 'toolbar-middle', x: 25, y: 250 },
      { name: 'toolbar-bottom', x: 25, y: 400 },
      { name: 'color-swatches', x: 25, y: viewport.height - 50 },
      { name: 'options-bar', x: viewport.width * 0.5, y: 60 },
      { name: 'tab-bar', x: viewport.width * 0.4, y: 30 },
    ];

    log('Testing context menus at different positions...');

    for (const pos of positions) {
      try {
        log(`  Testing ${pos.name}...`);

        // Right-click at position
        await page.mouse.click(pos.x, pos.y, { button: 'right' });
        stats.positionsTested++;

        await page.waitForTimeout(100);

        // Check for menu
        const menu = await page.$('[class*="context"], [class*="Context"], [class*="menu"]:not([class*="menubar"])');
        if (menu) {
          stats.menusRevealed++;
        }

        // Dismiss menu
        await page.keyboard.press('Escape');
        await page.waitForTimeout(50);
      } catch (e) {
        // Continue on error
      }
    }

    return stats;
  }
}

// =============================================================================
// CUSTOM PATCHERS FOR PHOTOPEA
// =============================================================================

/**
 * Photopea Domain Check Patcher
 * Bypasses J.adQ domain validation function
 */
class PhotopeaDomainPatcher extends IPatcher {
  constructor() {
    super('photopea-domain', 'Bypass J.adQ domain validation');
  }

  shouldApply(content, filename) {
    return content.includes('J.adQ');
  }

  apply(content) {
    const patches = [];
    let modified = content;

    // Replace J.adQ function body with simple return 1
    const startPattern = /J\.adQ\s*=\s*function\s*\(\s*\)\s*\{/;
    const match = content.match(startPattern);

    if (match) {
      const startIndex = match.index + match[0].length;
      let braceCount = 1;
      let endIndex = startIndex;

      while (braceCount > 0 && endIndex < content.length) {
        if (content[endIndex] === '{') braceCount++;
        if (content[endIndex] === '}') braceCount--;
        endIndex++;
      }

      while (endIndex < content.length && content[endIndex] !== ';') {
        endIndex++;
      }
      endIndex++;

      modified = content.substring(0, match.index) +
        'J.adQ=function(){return 1;};' +
        content.substring(endIndex);

      patches.push(new PatchResult('J.adQ', 1, ['J.adQ=function(){return 1;}']));
    }

    return { content: modified, patches };
  }

  getPatterns() {
    return [
      { name: 'J.adQ', description: 'Domain validation function - always return valid (1)' },
    ];
  }
}

/**
 * Photopea License Check Patcher
 * Bypasses ak6 license flag
 */
class PhotopeaLicensePatcher extends IPatcher {
  constructor() {
    super('photopea-license', 'Bypass ak6 license check');
  }

  shouldApply(content, filename) {
    return content.includes('this.ak6');
  }

  apply(content) {
    const patches = [];
    let modified = content;
    let count = 0;
    const examples = [];

    // Pattern: if($==0)this.ak6=!0;
    const pattern1 = /if\s*\(\s*\$\s*==\s*0\s*\)\s*this\.ak6\s*=\s*!\s*0\s*;/g;
    const matches1 = content.match(pattern1);

    if (matches1 && matches1.length > 0) {
      modified = modified.replace(pattern1, 'if($==0)this.ak6=!1;');
      count += matches1.length;
      examples.push('if($==0)this.ak6=!0 -> !1');
    }

    // Alternative pattern: this.ak6=!0
    const pattern2 = /this\.ak6\s*=\s*!\s*0/g;
    const matches2 = modified.match(pattern2);

    if (matches2 && matches2.length > 0) {
      modified = modified.replace(pattern2, 'this.ak6=!1');
      count += matches2.length;
      examples.push('this.ak6=!0 -> !1');
    }

    if (count > 0) {
      patches.push(new PatchResult('ak6-flag', count, examples));
    }

    return { content: modified, patches };
  }

  getPatterns() {
    return [
      { name: 'ak6-flag', description: 'License restriction flag - keep disabled (false)' },
    ];
  }
}

/**
 * Photopea Analytics Patcher
 * Removes lm analytics tracking
 */
class PhotopeaAnalyticsPatcher extends IPatcher {
  constructor() {
    super('photopea-analytics', 'Remove lm analytics tracking');
  }

  shouldApply(content, filename) {
    // Look for analytics patterns
    return content.includes('.lm(') ||
           content.includes('lm:function') ||
           content.includes('analytics') ||
           content.includes('google-analytics') ||
           content.includes('gtag');
  }

  apply(content) {
    const patches = [];
    let modified = content;
    let count = 0;
    const examples = [];

    // Remove common analytics calls
    const analyticsPatterns = [
      // lm function calls
      { pattern: /[A-Za-z]\.[A-Za-z]*\.lm\([^)]*\)/g, name: 'lm()' },
      // gtag calls
      { pattern: /gtag\([^)]*\)/g, name: 'gtag()' },
      // ga() calls
      { pattern: /\bga\(['"][^'"]+['"][^)]*\)/g, name: 'ga()' },
    ];

    for (const { pattern, name } of analyticsPatterns) {
      const matches = modified.match(pattern);
      if (matches && matches.length > 0) {
        modified = modified.replace(pattern, '/* analytics removed */');
        count += matches.length;
        examples.push(`${name} removed (${matches.length})`);
      }
    }

    if (count > 0) {
      patches.push(new PatchResult('analytics-removal', count, examples));
    }

    return { content: modified, patches };
  }

  getPatterns() {
    return [
      { name: 'analytics-removal', description: 'Remove tracking and analytics code' },
    ];
  }
}

/**
 * Photopea App Mode Patcher
 * Handles U.alp() function for app mode (Photopea vs Vectorpea)
 */
class PhotopeaAppModePatcher extends IPatcher {
  constructor() {
    super('photopea-appmode', 'Handle U.alp app mode detection');
  }

  shouldApply(content, filename) {
    return content.includes('U.alp');
  }

  apply(content) {
    const patches = [];
    let modified = content;

    // Replace U.alp function to return 0 (Photopea mode)
    const alpPattern = /U\.alp\s*=\s*function\s*\(\s*\)\s*\{/;
    const match = content.match(alpPattern);

    if (match) {
      const startIndex = match.index + match[0].length;
      let braceCount = 1;
      let endIndex = startIndex;

      while (braceCount > 0 && endIndex < content.length) {
        if (content[endIndex] === '{') braceCount++;
        if (content[endIndex] === '}') braceCount--;
        endIndex++;
      }

      while (endIndex < content.length && content[endIndex] !== ';') {
        endIndex++;
      }
      endIndex++;

      modified = content.substring(0, match.index) +
        'U.alp=function(){return 0;};' +
        content.substring(endIndex);

      patches.push(new PatchResult('U.alp', 1, ['U.alp=function(){return 0;}']));
    }

    // Also handle aat flag
    const aatPattern = /if\s*\(\s*B\s*==\s*0\s*\)\s*this\.aat\s*=\s*!\s*0\s*;/g;
    const aatMatches = modified.match(aatPattern);

    if (aatMatches && aatMatches.length > 0) {
      modified = modified.replace(aatPattern, 'if(B==0)this.aat=!1;');
      patches.push(new PatchResult('aat-flag', aatMatches.length, ['if(B==0)this.aat=!0 -> !1']));
    }

    return { content: modified, patches };
  }

  getPatterns() {
    return [
      { name: 'U.alp', description: 'App mode function - return 0 for Photopea mode' },
      { name: 'aat-flag', description: 'Feature restriction flag - keep disabled' },
    ];
  }
}

// =============================================================================
// PHOTOPEA APP PLUGIN
// =============================================================================

export class PhotopeaAppPlugin extends BaseAppPlugin {
  name = 'photopea';
  urlPattern = /photopea\.com/;

  /**
   * Get Photopea-specific triggers
   */
  getTriggers() {
    return [
      new FileFormatDropTrigger(),
      new LongPressToolbarTrigger(),
      new PositionalMenuTrigger(),
    ];
  }

  /**
   * Get Photopea-specific patchers
   */
  getPatchers() {
    return [
      new PhotopeaDomainPatcher(),
      new PhotopeaLicensePatcher(),
      new PhotopeaAnalyticsPatcher(),
      new PhotopeaAppModePatcher(),
    ];
  }

  /**
   * Photopea-specific configuration overrides
   */
  getConfig() {
    return {
      // Photopea needs longer timeouts due to complex initialization
      capture: {
        timeout: 90000,
        networkIdleTimeout: 5000,
      },
      // Faster trigger delays since Photopea is highly responsive
      trigger: {
        delayMs: 30,
      },
      // Additional discovery settings
      discover: {
        includeWorkers: true,  // Photopea uses web workers
        includeWasm: true,     // May use WebAssembly
      },
    };
  }

  /**
   * Setup before extraction
   * Wait for Photopea to fully initialize
   */
  async beforeExtraction(page, state) {
    // Wait for Photopea's main container
    try {
      await page.waitForSelector('#root, #app, .photopea', { timeout: 10000 });
    } catch (e) {
      // Continue even if selector not found
    }

    // Inject helper to track loaded modules
    await page.evaluate(() => {
      window.__photopeaModules = [];
      const originalDefine = window.define;
      if (typeof originalDefine === 'function') {
        window.define = function(...args) {
          window.__photopeaModules.push(args[0]);
          return originalDefine.apply(this, args);
        };
      }
    });
  }

  /**
   * Documentation for debugging
   */
  getDocumentation() {
    return `# Photopea App Plugin

## Overview
Photopea is a complex web-based image editor supporting multiple file formats
including PSD, AI, XCF, Sketch, XD, and more.

## Special Considerations

### UI Interactions
- **Long-press toolbar**: Hold tool icons for 300ms to reveal sub-tools
- **Positional menus**: Right-click behavior varies by location (canvas, layers, etc.)
- **File drops**: Supports drag-drop for many file formats

### Domain/License Checks
- **J.adQ**: Domain validation function - must return 1 (valid)
- **ak6**: License flag - must be false (disabled)
- **U.alp**: App mode (0=Photopea, 1=Vectorpea)
- **aat**: Feature restriction flag - must be false

### Analytics
- Uses various analytics (gtag, ga, lm) that should be removed for offline use

## Test Cases

### Trigger Tests
\`\`\`javascript
// Test 1: File format drop
// Drag a .psd file onto the canvas
// Expected: PSD import dialog appears

// Test 2: Long-press toolbar
// Hold the brush tool for 350ms
// Expected: Sub-menu with pencil, mixer brush, etc.

// Test 3: Positional menu
// Right-click on canvas vs layers panel
// Expected: Different context menus
\`\`\`

### Patcher Tests
\`\`\`javascript
// Test 1: Domain bypass
// Run on localhost
// Expected: No "unauthorized domain" errors

// Test 2: License bypass
// Check premium features available
// Expected: All features accessible

// Test 3: Analytics removal
// Monitor network requests
// Expected: No analytics calls
\`\`\`

## Reference Extractions
See output/photopea.com-*/ for working examples
`;
  }
}

// Export triggers and patchers for direct use if needed
export {
  FileFormatDropTrigger,
  LongPressToolbarTrigger,
  PositionalMenuTrigger,
  PhotopeaDomainPatcher,
  PhotopeaLicensePatcher,
  PhotopeaAnalyticsPatcher,
  PhotopeaAppModePatcher,
};

export default PhotopeaAppPlugin;
