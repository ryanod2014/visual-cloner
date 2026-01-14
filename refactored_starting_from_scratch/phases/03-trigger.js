/**
 * Phase 03: Trigger
 * Exhaustively trigger features to load lazy resources
 */

import { Phase } from '../core/pipeline.js';
import { KeyboardTrigger } from '../plugins/triggers/keyboard.js';
import { MenuTrigger } from '../plugins/triggers/menu.js';
import { ViewportTrigger } from '../plugins/triggers/viewport.js';

export class TriggerPhase extends Phase {
  constructor(config = {}) {
    super('trigger', 'Trigger lazy-loaded features');
    this.config = config;

    // Initialize triggers
    this.triggers = [
      new KeyboardTrigger(),
      new MenuTrigger(),
      new ViewportTrigger(),
    ];
  }

  async execute(context) {
    const { page, resources } = context;

    const initialCount = resources.size;
    this.logger.info(`Starting with ${initialCount} resources`);

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

    const allStats = {};

    // Track resources captured during this phase
    let capturedDuringTrigger = 0;
    const resourceCountBefore = resources.size;

    // Run each trigger
    for (const trigger of this.triggers) {
      this.logger.info(`Running ${trigger.name} trigger...`);

      const countBefore = resources.size;

      try {
        const stats = await trigger.execute(page, {
          delayMs: this.config.triggerDelay || 50,
          onProgress: (msg) => this.logger.debug(msg),
        });

        allStats[trigger.name] = stats;

        const newResources = resources.size - countBefore;
        if (newResources > 0) {
          this.logger.info(`  +${newResources} resources loaded`);
        }
      } catch (error) {
        this.logger.warn(`${trigger.name} trigger failed: ${error.message}`);
        allStats[trigger.name] = { error: error.message };
      }

      // Brief pause between triggers
      await page.waitForTimeout(500);
    }

    // Final wait for any pending loads
    this.logger.info('Waiting for final resource loads...');
    await page.waitForTimeout(3000);

    capturedDuringTrigger = resources.size - resourceCountBefore;
    const finalCount = resources.size;

    // Log summary
    this.logger.info(`Trigger phase complete: +${capturedDuringTrigger} resources`);

    // Compute totals
    let totalKeyboard = 0;
    let totalMenu = 0;
    let totalViewport = 0;

    if (allStats.keyboard) {
      const k = allStats.keyboard;
      totalKeyboard = (k.letters || 0) + (k.ctrlCombos || 0) + (k.ctrlShiftCombos || 0) +
                      (k.altCombos || 0) + (k.functionKeys || 0) + (k.dialogs || 0);
    }
    if (allStats.menu) {
      const m = allStats.menu;
      totalMenu = (m.topMenuClicks || 0) + (m.toolbarClicks || 0) + (m.rightPanelClicks || 0);
    }
    if (allStats.viewport) {
      const v = allStats.viewport;
      totalViewport = (v.resizes || 0) + (v.scrolls || 0);
    }

    return {
      initialCount,
      finalCount,
      newResources: capturedDuringTrigger,
      triggers: {
        keyboard: totalKeyboard,
        menu: totalMenu,
        viewport: totalViewport,
      },
      stats: allStats,
    };
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
