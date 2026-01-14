/**
 * ITrigger Interface
 * Base class for all feature triggers
 */

export class ITrigger {
  constructor(name, description) {
    this.name = name;
    this.description = description;
  }

  /**
   * Execute the trigger on a page
   * @param {Object} page - Playwright page object
   * @param {Object} options - Trigger options
   * @returns {Object} - Stats about what was triggered
   */
  async execute(page, options = {}) {
    throw new Error('ITrigger.execute() must be implemented');
  }
}

export default ITrigger;
