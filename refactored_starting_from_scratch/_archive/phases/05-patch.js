/**
 * Phase 05: Patch
 * Apply domain bypass and app-specific patches to captured resources
 */

import { Phase } from '../core/pipeline.js';
import { DomainBypassPatcher } from '../plugins/patchers/domain-bypass.js';
import { PhotopeaPatcher } from '../plugins/patchers/photopea.js';

export class PatchPhase extends Phase {
  constructor(config = {}) {
    super('patch', 'Apply domain bypass patches');
    this.config = config;

    // Initialize patchers
    this.patchers = [
      new PhotopeaPatcher(),
      new DomainBypassPatcher(),
    ];
  }

  async execute(context) {
    const { resources } = context;

    let totalPatches = 0;
    let patchedFiles = 0;
    const patchReport = [];

    this.logger.info(`Checking ${resources.size} resources for patches...`);

    for (const [url, resource] of resources) {
      // Only patch text content (JS files mainly)
      // Allow missing content-type headers and application/ types
      const isTextContent = !resource.contentType ||
                            resource.contentType.includes('javascript') ||
                            resource.contentType.includes('text/') ||
                            resource.contentType.includes('application/');
      if (!isTextContent) {
        continue;
      }

      // Get filename from URL
      const filename = this.getFilename(url);

      // Convert buffer to string for patching
      let content = resource.body.toString('utf-8');
      let wasPatched = false;
      const filePatches = [];

      // Try each patcher
      for (const patcher of this.patchers) {
        if (!patcher.shouldApply(content, filename)) {
          continue;
        }

        this.logger.debug(`Applying ${patcher.name} to ${filename}`);

        const result = patcher.apply(content);

        if (result.patches.length > 0) {
          content = result.content;
          wasPatched = true;

          for (const patch of result.patches) {
            filePatches.push({
              patcher: patcher.name,
              pattern: patch.name,
              count: patch.count,
              examples: patch.examples,
            });
            totalPatches += patch.count;
          }
        }
      }

      // Update resource with patched content
      if (wasPatched) {
        resource.body = Buffer.from(content, 'utf-8');
        resource.patched = true;
        resource.originalSize = resource.size;
        resource.size = resource.body.length;
        patchedFiles++;

        // Log what was patched
        for (const p of filePatches) {
          this.logger.info(`  ${filename}: ${p.pattern} (${p.count}x)`);
        }

        patchReport.push({
          file: filename,
          url: url,
          patches: filePatches,
        });
      }
    }

    // Store patch report in context
    context.patchReport = patchReport;

    // Log summary
    if (totalPatches > 0) {
      this.logger.info(`Applied ${totalPatches} patches to ${patchedFiles} files`);
    } else {
      this.logger.info('No patches needed (no domain-restricted patterns found)');
    }

    return {
      patchedFiles,
      totalPatches,
      report: patchReport,
    };
  }

  /**
   * Extract filename from URL
   */
  getFilename(url) {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;
      return pathname.split('/').pop() || 'index.html';
    } catch {
      return url.split('/').pop() || 'unknown';
    }
  }

  /**
   * Get all available patchers
   */
  getPatchers() {
    return this.patchers.map(p => ({
      name: p.name,
      description: p.description,
      patterns: p.getPatterns(),
    }));
  }
}

export default PatchPhase;
