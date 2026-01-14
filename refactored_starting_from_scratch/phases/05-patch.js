/**
 * Phase 05: Patch
 * Domain bypass patching phase
 *
 * Applies domain and license check bypasses to JavaScript resources.
 * Uses generic patchers and app-specific patchers if available.
 * Stores patch report in context for debugging.
 *
 * NOTE: Patching can be done at build time (here) or at runtime (in serve.js).
 * Runtime patching is more flexible but adds startup time.
 * This phase prepares the patch report but actual patching is done by serve.js.
 */

import { Phase } from '../core/pipeline.js';

// Dynamic import for patchers to handle potential missing files
async function loadPatchers() {
  const patchers = [];

  try {
    const { PhotopeaPatcher } = await import('../plugins/patchers/photopea.js');
    patchers.push(new PhotopeaPatcher());
  } catch (e) {
    // Patcher not available
  }

  try {
    const { DomainBypassPatcher } = await import('../plugins/patchers/domain-bypass.js');
    patchers.push(new DomainBypassPatcher());
  } catch (e) {
    // Patcher not available
  }

  return patchers;
}

export class PatchPhase extends Phase {
  constructor(config = {}) {
    super('patch', 'Apply domain bypass patches');
    this.config = config;
    this.patchers = [];
  }

  async execute(context) {
    const { resources, appPlugin } = context;

    // Load patchers dynamically
    this.patchers = await loadPatchers();

    // Add app-specific patchers if available
    if (appPlugin) {
      const appPatchers = await this.loadAppPatchers(appPlugin.name);
      this.patchers.push(...appPatchers);
    }

    this.logger.info(`Available patchers: ${this.patchers.map(p => p.name).join(', ') || 'none'}`);

    // Get JS resources
    const jsResources = [];
    for (const [url, data] of resources) {
      if (url.endsWith('.js') || data.contentType?.includes('javascript')) {
        jsResources.push({ url, data });
      }
    }

    this.logger.info(`Found ${jsResources.length} JavaScript resources to analyze`);

    if (this.config.dryRun) {
      this.logger.info('Would scan all JS resources for patchable patterns');
      this.logger.info('Would apply domain bypass patches');
      this.logger.info('Would apply app-specific patches if available');
      this.logger.info('Would generate patch report');

      return {
        totalFiles: jsResources.length,
        patchedFiles: 0,
        totalPatches: 0,
        report: {},
        dryRun: true,
      };
    }

    if (this.patchers.length === 0) {
      this.logger.warn('No patchers available, skipping patch phase');
      this.trackWarning();

      context.patchReport = {
        patchers: [],
        files: {},
        totalPatches: 0,
      };

      return {
        totalFiles: jsResources.length,
        patchedFiles: 0,
        totalPatches: 0,
        report: {},
      };
    }

    // Analyze and collect patch information
    // NOTE: We don't actually modify resources here - serve.js does runtime patching
    // This phase just identifies what needs to be patched
    const patchReport = {
      generatedAt: new Date().toISOString(),
      patchers: this.patchers.map(p => ({
        name: p.name,
        description: p.description,
        patterns: p.getPatterns(),
      })),
      files: {},
      totalPatches: 0,
    };

    let patchedFiles = 0;
    let totalPatches = 0;

    for (const { url, data } of jsResources) {
      try {
        const content = data.body.toString('utf-8');
        const filename = this.getFilename(url);
        const filePatches = [];

        for (const patcher of this.patchers) {
          if (patcher.shouldApply(content, filename)) {
            // Do a dry run to see what would be patched
            const result = patcher.apply(content);

            if (result.patches.length > 0) {
              filePatches.push({
                patcher: patcher.name,
                patches: result.patches.map(p => ({
                  name: p.name,
                  count: p.count,
                  examples: p.examples,
                })),
              });

              totalPatches += result.patches.reduce((sum, p) => sum + p.count, 0);
            }
          }
        }

        if (filePatches.length > 0) {
          patchReport.files[url] = {
            filename,
            size: data.size,
            patches: filePatches,
          };
          patchedFiles++;

          this.logger.info(`[PATCHABLE] ${filename}`);
          for (const fp of filePatches) {
            for (const patch of fp.patches) {
              this.logger.info(`  - ${fp.patcher}/${patch.name}: ${patch.count} occurrence(s)`);
            }
          }
        }

        this.trackProcessed();
      } catch (error) {
        this.logger.debug(`Error analyzing ${url}: ${error.message}`);
        this.trackError();
      }
    }

    patchReport.totalPatches = totalPatches;

    // Store patch report in context
    context.patchReport = patchReport;

    this.logger.info(`\n--- Patch Analysis Complete ---`);
    this.logger.info(`  Files analyzed:     ${jsResources.length}`);
    this.logger.info(`  Files with patches: ${patchedFiles}`);
    this.logger.info(`  Total patches:      ${totalPatches}`);

    if (patchedFiles > 0) {
      this.logger.info(`\nNOTE: Runtime patching will be applied by serve.js`);
      this.trackAction(`Identified ${totalPatches} patches in ${patchedFiles} files`);
    } else {
      this.logger.info(`\nNo patches needed for this site`);
      this.trackAction('No patches needed');
    }

    return {
      totalFiles: jsResources.length,
      patchedFiles,
      totalPatches,
      report: patchReport,
    };
  }

  /**
   * Load app-specific patchers
   * @param {string} appName - Name of the app plugin
   * @returns {Array} - Array of patcher instances
   */
  async loadAppPatchers(appName) {
    const patchers = [];

    try {
      // Try to load app-specific patchers
      const module = await import(`../plugins/apps/${appName}/patchers.js`);
      if (module.getPatchers) {
        patchers.push(...module.getPatchers());
      }
    } catch (e) {
      // No app-specific patchers available
    }

    return patchers;
  }

  /**
   * Extract filename from URL
   * @param {string} url - Full URL
   * @returns {string} - Filename
   */
  getFilename(url) {
    try {
      const urlObj = new URL(url);
      const parts = urlObj.pathname.split('/');
      return parts[parts.length - 1] || 'index.js';
    } catch (e) {
      return 'unknown.js';
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
