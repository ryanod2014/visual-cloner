/**
 * Patcher Orchestrator
 *
 * Applies all registered patchers to JavaScript resources
 * to bypass domain checks, license validation, and remove tracking.
 */

import { DomainCheckPatcher } from './domain-check.js';
import { LicenseCheckPatcher } from './license-check.js';
import { AnalyticsPatcher } from './analytics.js';

// Registry of all patchers
const PATCHERS = [
  new DomainCheckPatcher(),
  new LicenseCheckPatcher(),
  new AnalyticsPatcher()
];

/**
 * Apply all patchers to a collection of resources
 * @param {Map<string, { content: string, contentType: string, url: string }>} resources - Resources to patch
 * @param {Object} logger - Logger instance
 * @returns {{ patched: Map<string, { content: string, contentType: string, url: string }>, report: PatchReport }}
 */
export function patchResources(resources, logger = console) {
  const patched = new Map();
  const report = new PatchReport();

  logger.info?.(`[Patcher] Starting to patch ${resources.size} resources`);

  for (const [key, resource] of resources) {
    const { content, contentType, url } = resource;
    let patchedContent = content;
    const resourcePatches = [];

    for (const patcher of PATCHERS) {
      try {
        if (patcher.shouldPatch(url, patchedContent, contentType)) {
          logger.debug?.(`[Patcher] Applying ${patcher.name} to ${url}`);

          const result = patcher.patch(patchedContent, url);
          patchedContent = result.content;

          if (result.patches.length > 0) {
            resourcePatches.push({
              patcher: patcher.name,
              patches: result.patches
            });

            logger.info?.(`[Patcher] ${patcher.name} made ${result.patches.length} patch(es) to ${url}`);
          }
        }
      } catch (error) {
        logger.error?.(`[Patcher] Error applying ${patcher.name} to ${url}: ${error.message}`);
        report.addError(url, patcher.name, error.message);
      }
    }

    // Store the patched resource
    patched.set(key, {
      ...resource,
      content: patchedContent,
      wasPatched: resourcePatches.length > 0,
      patchInfo: resourcePatches
    });

    // Add to report
    if (resourcePatches.length > 0) {
      report.addPatchedResource(url, resourcePatches);
    }
  }

  logger.info?.(`[Patcher] Completed patching. ${report.patchedCount} resources modified.`);

  return { patched, report };
}

/**
 * Register a custom patcher
 * @param {BasePatcher} patcher - Patcher instance to register
 */
export function registerPatcher(patcher) {
  if (!patcher.name || typeof patcher.shouldPatch !== 'function' || typeof patcher.patch !== 'function') {
    throw new Error('Invalid patcher: must have name, shouldPatch, and patch methods');
  }
  PATCHERS.push(patcher);
}

/**
 * Get list of registered patchers
 * @returns {string[]} - Names of registered patchers
 */
export function getRegisteredPatchers() {
  return PATCHERS.map(p => p.name);
}

/**
 * Patch Report - tracks what was patched for debugging
 */
export class PatchReport {
  constructor() {
    this.resources = new Map();
    this.errors = [];
    this.startTime = Date.now();
  }

  addPatchedResource(url, patches) {
    this.resources.set(url, patches);
  }

  addError(url, patcher, message) {
    this.errors.push({ url, patcher, message, timestamp: Date.now() });
  }

  get patchedCount() {
    return this.resources.size;
  }

  get totalPatches() {
    let count = 0;
    for (const patches of this.resources.values()) {
      for (const patchGroup of patches) {
        count += patchGroup.patches.length;
      }
    }
    return count;
  }

  /**
   * Generate a human-readable summary
   * @returns {string}
   */
  getSummary() {
    const lines = [
      '=== Patch Report ===',
      `Resources patched: ${this.patchedCount}`,
      `Total patches applied: ${this.totalPatches}`,
      `Errors: ${this.errors.length}`,
      `Duration: ${Date.now() - this.startTime}ms`,
      ''
    ];

    if (this.resources.size > 0) {
      lines.push('Patched Resources:');
      for (const [url, patches] of this.resources) {
        lines.push(`  ${url}`);
        for (const patchGroup of patches) {
          lines.push(`    [${patchGroup.patcher}]`);
          for (const patch of patchGroup.patches) {
            lines.push(`      - ${patch.pattern} (${patch.count}x)`);
          }
        }
      }
      lines.push('');
    }

    if (this.errors.length > 0) {
      lines.push('Errors:');
      for (const error of this.errors) {
        lines.push(`  ${error.url}`);
        lines.push(`    [${error.patcher}] ${error.message}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get report as JSON for programmatic access
   * @returns {Object}
   */
  toJSON() {
    const resources = {};
    for (const [url, patches] of this.resources) {
      resources[url] = patches;
    }

    return {
      patchedCount: this.patchedCount,
      totalPatches: this.totalPatches,
      duration: Date.now() - this.startTime,
      resources,
      errors: this.errors
    };
  }
}

// Re-export base class and individual patchers for extension
export { BasePatcher } from './base.js';
export { DomainCheckPatcher } from './domain-check.js';
export { LicenseCheckPatcher } from './license-check.js';
export { AnalyticsPatcher } from './analytics.js';
