/**
 * Phase 04: Trigger
 * Exhaustively trigger features to load lazy resources
 *
 * Uses various trigger strategies to load lazy-loaded content:
 * - Keyboard shortcuts and key presses
 * - Menu interactions
 * - Viewport changes (scroll, resize)
 * - Custom triggers from app plugins
 *
 * Monitors for new resources during triggers and adds them to context.resources.
 */

import { Phase } from '../core/pipeline.js';

// Dynamic import for triggers to handle potential missing files
async function loadTriggers() {
  const triggers = [];

  try {
    const { KeyboardTrigger } = await import('../plugins/triggers/keyboard.js');
    triggers.push(new KeyboardTrigger());
  } catch (e) {
    // Trigger not available
  }

  try {
    const { MenuTrigger } = await import('../plugins/triggers/menu.js');
    triggers.push(new MenuTrigger());
  } catch (e) {
    // Trigger not available
  }

  try {
    const { ViewportTrigger } = await import('../plugins/triggers/viewport.js');
    triggers.push(new ViewportTrigger());
  } catch (e) {
    // Trigger not available
  }

  return triggers;
}

export class TriggerPhase extends Phase {
  constructor(config = {}) {
    super('trigger', 'Trigger lazy-loaded features');
    this.config = config;
    this.triggers = [];
  }

  async execute(context) {
    const { page, resources, appPlugin } = context;

    // Load triggers dynamically
    this.triggers = await loadTriggers();

    // Add app-specific triggers if available
    if (appPlugin) {
      const appTriggers = await this.loadAppTriggers(appPlugin.name);
      this.triggers.push(...appTriggers);
    }

    const initialCount = resources.size;
    this.logger.info(`Starting with ${initialCount} resources`);
    this.logger.info(`Available triggers: ${this.triggers.map(t => t.name).join(', ') || 'none'}`);

    if (this.config.dryRun) {
      this.logger.info('Would run keyboard trigger (letters, shortcuts, function keys)');
      this.logger.info('Would run menu trigger (top menu, toolbar, right panel)');
      this.logger.info('Would run viewport trigger (resize, scroll)');
      this.logger.info('Would wait for lazy-loaded resources after each trigger');

      const simulatedNewResources = 25;
      this.logger.info(`Would discover approximately ${simulatedNewResources} additional lazy-loaded resources`);

      return {
        initialCount,
        finalCount: initialCount + simulatedNewResources,
        newResources: simulatedNewResources,
        triggers: {
          keyboard: 50,
          menu: 30,
          viewport: 10,
        },
        stats: {},
        dryRun: true,
      };
    }

    if (this.triggers.length === 0) {
      this.logger.warn('No triggers available, skipping trigger phase');
      this.trackWarning();
      return {
        initialCount,
        finalCount: initialCount,
        newResources: 0,
        triggers: {},
        stats: {},
      };
    }

    const allStats = {};

    // Track resources captured during this phase
    let capturedDuringTrigger = 0;
    const resourceCountBefore = resources.size;

    // Set up resource capture during triggers
    const captureHandler = async (response) => {
      const resUrl = response.url();
      const status = response.status();

      if (resUrl.startsWith('data:') || resUrl.startsWith('blob:')) return;
      if (resources.has(resUrl)) return;
      if (status !== 200) return;

      try {
        const contentType = response.headers()['content-type'] || '';
        const body = await response.body();

        resources.set(resUrl, {
          url: resUrl,
          contentType,
          body,
          size: body.length,
          capturedAt: new Date().toISOString(),
          source: 'trigger',
        });

        capturedDuringTrigger++;
        this.trackCreated();
      } catch (error) {
        // Failed to capture, ignore
      }
    };

    page.on('response', captureHandler);

    // Run each trigger
    for (const trigger of this.triggers) {
      this.logger.info(`Running ${trigger.name} trigger...`);
      this.trackAction(`Running ${trigger.name} trigger`);

      const countBefore = resources.size;

      try {
        const stats = await trigger.execute(page, {
          delayMs: this.config.triggerDelay || 50,
          onProgress: (msg) => this.logger.debug(msg),
        });

        allStats[trigger.name] = stats;
        this.trackProcessed();

        const newResources = resources.size - countBefore;
        if (newResources > 0) {
          this.logger.info(`  +${newResources} resources loaded`);
        }
      } catch (error) {
        this.logger.warn(`${trigger.name} trigger failed: ${error.message}`);
        this.trackError();
        allStats[trigger.name] = { error: error.message };
      }

      // Brief pause between triggers
      await page.waitForTimeout(500);
    }

    // Final wait for any pending loads
    this.logger.info('Waiting for final resource loads...');
    await page.waitForTimeout(3000);

    // Clean up
    page.off('response', captureHandler);

    capturedDuringTrigger = resources.size - resourceCountBefore;
    const finalCount = resources.size;

    // Log summary
    this.logger.info(`Trigger phase complete: +${capturedDuringTrigger} resources`);
    this.trackAction(`Triggered ${capturedDuringTrigger} new resources`);

    // Compute totals
    const triggerCounts = {};
    for (const trigger of this.triggers) {
      const stats = allStats[trigger.name];
      if (stats && !stats.error) {
        let total = 0;
        for (const [key, value] of Object.entries(stats)) {
          if (typeof value === 'number') {
            total += value;
          }
        }
        triggerCounts[trigger.name] = total;
      }
    }

    return {
      initialCount,
      finalCount,
      newResources: capturedDuringTrigger,
      triggers: triggerCounts,
      stats: allStats,
    };
  }

  /**
   * Load app-specific triggers
   * @param {string} appName - Name of the app plugin
   * @returns {Array} - Array of trigger instances
   */
  async loadAppTriggers(appName) {
    const triggers = [];

    try {
      // Try to load app-specific triggers
      const module = await import(`../plugins/apps/${appName}/triggers.js`);
      if (module.getTriggers) {
        triggers.push(...module.getTriggers());
      }
    } catch (e) {
      // No app-specific triggers available
    }

    return triggers;
  }

  /**
   * Get all available triggers
   */
  getTriggers() {
    return this.triggers.map(t => ({
      name: t.name,
      description: t.description,
    }));
  }
}

export default TriggerPhase;
