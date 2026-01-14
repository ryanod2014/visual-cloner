import { ScrollTrigger } from './scroll.js';
import { ClickTrigger } from './click.js';
import { ViewportTrigger } from './viewport.js';
import { KeyboardTrigger } from './keyboard.js';
import { NavigationTrigger } from './navigation.js';

// Export individual triggers
export { BaseTrigger } from './base.js';
export { ScrollTrigger } from './scroll.js';
export { ClickTrigger } from './click.js';
export { ViewportTrigger } from './viewport.js';
export { KeyboardTrigger } from './keyboard.js';
export { NavigationTrigger } from './navigation.js';

/**
 * Default trigger options
 */
const DEFAULT_OPTIONS = {
  scroll: true,
  click: true,
  viewport: true,
  keyboard: true,
  navigation: true
};

/**
 * All available triggers mapped by their option key
 */
const TRIGGER_MAP = {
  scroll: ScrollTrigger,
  click: ClickTrigger,
  viewport: ViewportTrigger,
  keyboard: KeyboardTrigger,
  navigation: NavigationTrigger
};

/**
 * Run all enabled triggers to load lazy resources
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {object} logger - Logger instance
 * @param {object} options - Trigger options
 * @param {boolean} [options.scroll=true] - Enable scroll trigger
 * @param {boolean} [options.click=true] - Enable click trigger
 * @param {boolean} [options.viewport=true] - Enable viewport trigger
 * @param {boolean} [options.keyboard=true] - Enable keyboard trigger
 * @param {boolean} [options.navigation=true] - Enable navigation trigger
 * @returns {Promise<number>} - Total count of new resources loaded
 */
export async function runTriggers(page, logger, options = {}) {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  let totalResourcesLoaded = 0;

  logger.info('Starting lazy resource triggers...');

  // Get enabled triggers in optimal order
  // Order matters: scroll first (most common), then click, viewport, keyboard, navigation
  const triggerOrder = ['scroll', 'click', 'viewport', 'keyboard', 'navigation'];

  for (const triggerKey of triggerOrder) {
    if (!mergedOptions[triggerKey]) {
      logger.debug(`Trigger '${triggerKey}' is disabled, skipping`);
      continue;
    }

    const TriggerClass = TRIGGER_MAP[triggerKey];
    if (!TriggerClass) {
      logger.warn(`Unknown trigger: ${triggerKey}`);
      continue;
    }

    try {
      const trigger = new TriggerClass();
      logger.debug(`Running trigger: ${trigger.name}`);

      const resourcesLoaded = await trigger.trigger(page, logger);
      totalResourcesLoaded += resourcesLoaded;

      logger.info(`Trigger '${trigger.name}' loaded ${resourcesLoaded} resources`);

    } catch (error) {
      logger.error(`Trigger '${triggerKey}' failed: ${error.message}`);
    }
  }

  logger.info(`Lazy resource triggers complete. Total resources loaded: ${totalResourcesLoaded}`);

  return totalResourcesLoaded;
}

/**
 * Run a single trigger by name
 * @param {string} triggerName - Name of the trigger to run
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {object} logger - Logger instance
 * @returns {Promise<number>} - Count of new resources loaded
 */
export async function runSingleTrigger(triggerName, page, logger) {
  const TriggerClass = TRIGGER_MAP[triggerName];

  if (!TriggerClass) {
    logger.error(`Unknown trigger: ${triggerName}`);
    return 0;
  }

  try {
    const trigger = new TriggerClass();
    return await trigger.trigger(page, logger);
  } catch (error) {
    logger.error(`Trigger '${triggerName}' failed: ${error.message}`);
    return 0;
  }
}

/**
 * Get list of available trigger names
 * @returns {string[]} - Array of trigger names
 */
export function getAvailableTriggers() {
  return Object.keys(TRIGGER_MAP);
}

/**
 * Create a custom trigger instance
 * @param {string} triggerName - Name of the trigger
 * @returns {BaseTrigger|null} - Trigger instance or null if not found
 */
export function createTrigger(triggerName) {
  const TriggerClass = TRIGGER_MAP[triggerName];
  return TriggerClass ? new TriggerClass() : null;
}
