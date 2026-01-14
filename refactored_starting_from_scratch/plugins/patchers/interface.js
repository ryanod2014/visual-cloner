/**
 * IPatcher Interface
 * Base class for all patchers
 */

export class IPatcher {
  constructor(name, description) {
    this.name = name;
    this.description = description;
  }

  /**
   * Check if this patcher should apply to a file
   * @param {string} content - File content
   * @param {string} filename - Filename
   * @returns {boolean}
   */
  shouldApply(content, filename) {
    throw new Error('IPatcher.shouldApply() must be implemented');
  }

  /**
   * Apply patches to content
   * @param {string} content - File content
   * @returns {{ content: string, patches: PatchResult[] }}
   */
  apply(content) {
    throw new Error('IPatcher.apply() must be implemented');
  }

  /**
   * Get patterns this patcher looks for (for documentation)
   * @returns {Array<{name: string, description: string}>}
   */
  getPatterns() {
    return [];
  }
}

/**
 * Patch result descriptor
 */
export class PatchResult {
  constructor(name, count, examples = []) {
    this.name = name;
    this.count = count;
    this.examples = examples;
  }
}

export default { IPatcher, PatchResult };
