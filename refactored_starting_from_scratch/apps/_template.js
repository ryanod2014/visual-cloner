/**
 * App Plugin Template
 *
 * Copy this file to create a new app plugin.
 *
 * Steps to create a new plugin:
 * 1. Copy this file: cp _template.js myapp.js
 * 2. Replace 'MyAppPlugin' with your app name
 * 3. Set the urlPattern to match your app's URL
 * 4. Implement custom triggers, patchers, and hooks as needed
 * 5. Add the plugin to index.js
 *
 * Guidelines:
 * - Only override methods you actually need
 * - Document what makes your app special
 * - Include test cases in comments
 * - Keep all app-specific logic in one file
 */

import { BaseAppPlugin } from './base.js';
import { ITrigger } from '../plugins/triggers/interface.js';
import { IPatcher, PatchResult } from '../plugins/patchers/interface.js';

// =============================================================================
// CUSTOM TRIGGERS (Optional)
// =============================================================================

/**
 * Example: Custom Trigger
 *
 * Triggers reveal hidden UI states by simulating user interactions.
 * Common use cases:
 * - Special keyboard shortcuts
 * - Gesture recognition (swipe, pinch, long-press)
 * - File type handling
 * - Custom hover behaviors
 */
class MyAppCustomTrigger extends ITrigger {
  constructor() {
    // Give your trigger a unique name and description
    super('myapp-custom', 'Description of what this trigger does');
  }

  /**
   * Execute the trigger on a page
   *
   * @param {Object} page - Playwright page instance
   * @param {Object} options - Options passed from pipeline
   * @returns {Object} - Stats about what was triggered
   */
  async execute(page, options = {}) {
    const { onProgress = null } = options;
    const log = (msg) => onProgress?.(msg);

    const stats = {
      actionsTaken: 0,
      featuresRevealed: 0,
    };

    log('Executing custom trigger...');

    // Example: Simulate a custom interaction
    try {
      // Find elements to interact with
      // const elements = await page.$$('selector');
      //
      // for (const el of elements) {
      //   await el.click();
      //   stats.actionsTaken++;
      // }

      // Or execute JavaScript in the page
      // await page.evaluate(() => {
      //   // Custom interaction code
      // });
    } catch (e) {
      // Handle errors gracefully
    }

    return stats;
  }
}

// =============================================================================
// CUSTOM PATCHERS (Optional)
// =============================================================================

/**
 * Example: Custom Patcher
 *
 * Patchers modify JavaScript/HTML content for offline functionality.
 * Common use cases:
 * - Bypass domain validation
 * - Remove license checks
 * - Disable analytics
 * - Fix hardcoded URLs
 */
class MyAppCustomPatcher extends IPatcher {
  constructor() {
    // Give your patcher a unique name and description
    super('myapp-custom', 'Description of what this patcher does');
  }

  /**
   * Check if this patcher should apply to a file
   *
   * @param {string} content - File content
   * @param {string} filename - Filename
   * @returns {boolean} - True if patcher should apply
   */
  shouldApply(content, filename) {
    // Only apply to files that need patching
    // Example: Check for specific patterns
    return content.includes('myapp.validation') ||
           content.includes('license.check');
  }

  /**
   * Apply patches to content
   *
   * @param {string} content - Original content
   * @returns {{ content: string, patches: PatchResult[] }}
   */
  apply(content) {
    const patches = [];
    let modified = content;

    // Example: Replace a function body
    //
    // const pattern = /myapp\.validate\s*=\s*function\s*\(\)\s*\{[^}]+\}/;
    // if (pattern.test(modified)) {
    //   modified = modified.replace(pattern, 'myapp.validate=function(){return true;}');
    //   patches.push(new PatchResult('validate-bypass', 1, ['myapp.validate=function(){return true;}']));
    // }

    // Example: Replace a boolean flag
    //
    // const flagMatches = modified.match(/this\.restricted\s*=\s*true/g);
    // if (flagMatches) {
    //   modified = modified.replace(/this\.restricted\s*=\s*true/g, 'this.restricted=false');
    //   patches.push(new PatchResult('restriction-flag', flagMatches.length, ['this.restricted=true -> false']));
    // }

    return { content: modified, patches };
  }

  /**
   * Get documentation for the patterns this patcher handles
   */
  getPatterns() {
    return [
      { name: 'validate-bypass', description: 'Bypass validation function' },
      { name: 'restriction-flag', description: 'Disable restriction flags' },
    ];
  }
}

// =============================================================================
// APP PLUGIN
// =============================================================================

export class MyAppPlugin extends BaseAppPlugin {
  /**
   * Human-readable name of the app
   */
  name = 'myapp';

  /**
   * URL pattern to match
   * This determines which URLs this plugin handles
   *
   * Examples:
   *   /myapp\.com/           - Matches myapp.com
   *   /myapp\.(com|io)/      - Matches myapp.com or myapp.io
   *   /app\.myapp\.com/      - Matches app.myapp.com specifically
   *   /(^|\.)myapp\.com/     - Matches myapp.com and all subdomains
   */
  urlPattern = /myapp\.com/;

  /**
   * Get custom triggers for this app
   * Return empty array to use only default triggers
   *
   * @returns {ITrigger[]}
   */
  getTriggers() {
    // Uncomment and customize:
    // return [
    //   new MyAppCustomTrigger(),
    // ];
    return [];
  }

  /**
   * Get custom patchers for this app
   * Return empty array to use only default patchers
   *
   * @returns {IPatcher[]}
   */
  getPatchers() {
    // Uncomment and customize:
    // return [
    //   new MyAppCustomPatcher(),
    // ];
    return [];
  }

  /**
   * Get configuration overrides for this app
   * Return empty object to use default configuration
   *
   * @returns {Object}
   */
  getConfig() {
    return {
      // Uncomment and customize:
      //
      // capture: {
      //   timeout: 60000,           // Max time for capture phase
      //   networkIdleTimeout: 3000, // Wait for network to settle
      // },
      // trigger: {
      //   delayMs: 50,              // Delay between trigger actions
      // },
      // discover: {
      //   includeWorkers: true,     // Capture web workers
      //   includeWasm: true,        // Capture WebAssembly files
      // },
    };
  }

  /**
   * Hook called before extraction starts
   * Use for app-specific setup
   *
   * @param {Object} page - Playwright page instance
   * @param {Object} state - Pipeline state
   */
  async beforeExtraction(page, state) {
    // Example: Wait for app to initialize
    // try {
    //   await page.waitForSelector('#app-loaded', { timeout: 10000 });
    // } catch (e) {
    //   // App may use different initialization
    // }

    // Example: Accept cookie consent
    // try {
    //   await page.click('[data-accept-cookies]');
    // } catch (e) {
    //   // May not have cookie banner
    // }

    // Example: Dismiss onboarding
    // try {
    //   await page.click('[data-dismiss-tour]');
    // } catch (e) {
    //   // May not have onboarding
    // }
  }

  /**
   * Hook called after extraction completes
   * Use for cleanup or post-processing
   *
   * @param {Object} page - Playwright page instance
   * @param {Object} state - Pipeline state
   */
  async afterExtraction(page, state) {
    // Example: Log extracted modules
    // const modules = await page.evaluate(() => window.__appModules || []);
    // state.metadata.modules = modules;
  }

  /**
   * Get custom detector for this app
   * Return null to use default detection
   */
  getDetector() {
    // Uncomment for custom detection:
    // return {
    //   async detect(page) {
    //     const framework = await page.evaluate(() => {
    //       if (window.React) return 'react';
    //       if (window.Vue) return 'vue';
    //       if (window.Angular) return 'angular';
    //       return 'unknown';
    //     });
    //     return { appType: 'spa', framework };
    //   }
    // };
    return null;
  }

  /**
   * Get custom discoverer for this app
   * Return null to use default discovery
   */
  getDiscoverer() {
    // Uncomment for custom discovery:
    // return {
    //   async discover(page, options) {
    //     // Custom URL discovery logic
    //     return { urls: [], resources: [] };
    //   }
    // };
    return null;
  }

  /**
   * Documentation for debugging
   * Include:
   * - What makes this app special
   * - Known issues
   * - Test cases
   */
  getDocumentation() {
    return `# MyApp Plugin

## Overview
Brief description of the app and why it needs a custom plugin.

## Special Considerations
- List unique UI patterns
- List protection mechanisms that need bypassing
- List any initialization requirements

## Test Cases

### Trigger Tests
\`\`\`javascript
// Test 1: [Description]
// Steps: ...
// Expected: ...

// Test 2: [Description]
// Steps: ...
// Expected: ...
\`\`\`

### Patcher Tests
\`\`\`javascript
// Test 1: [Description]
// Steps: ...
// Expected: ...

// Test 2: [Description]
// Steps: ...
// Expected: ...
\`\`\`

## Reference
- Link to app documentation
- Link to working extractions
`;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

// Export the main plugin class
export default MyAppPlugin;

// Export individual triggers/patchers if they might be useful elsewhere
export {
  MyAppCustomTrigger,
  MyAppCustomPatcher,
};
