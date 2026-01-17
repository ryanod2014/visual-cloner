/**
 * Phase 05b: Code Normalization
 *
 * Transforms environment-dependent code into clean standalone code.
 *
 * Pipeline:
 *   1. Deobfuscate - Decode encoded strings
 *   2. AST Evaluate - Replace location.hostname, evaluate expressions
 *   3. Simplify - Simplify ternaries, remove dead code
 *
 * This ensures extracted code works regardless of deployment domain.
 */

import { Phase } from '../core/pipeline.js';
import { normalizeCode } from '../strategies/normalize/index.js';

export class NormalizePhase extends Phase {
  constructor(config = {}) {
    super('05b-normalize', 'Code normalization (deobfuscate, evaluate, simplify)');
    this.phaseConfig = config;
  }

  async execute(context) {
    const { resources, url, outputDir } = context;

    // Get hostname from URL
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    this.info(`Normalizing code for hostname: ${hostname}`);

    // Track stats
    let jsFilesProcessed = 0;
    let totalDecoders = 0;
    let totalReplacements = 0;
    let totalEvalChanges = 0;
    let totalSimplifications = 0;

    // Process each JavaScript resource
    for (const [resourceUrl, resource] of resources) {
      // Skip non-JS files
      if (!this.isJavaScript(resource)) continue;

      // Get content as string (handle both body Buffer and content string)
      let content;
      if (resource.body) {
        content = resource.body.toString('utf-8');
      } else if (resource.content) {
        content = resource.content;
      } else {
        continue; // No content to process
      }

      // Skip if content is too small (likely empty or trivial)
      if (content.length < 100) continue;

      jsFilesProcessed++;
      const filename = resource.localFile || resourceUrl;

      try {
        this.debug(`Normalizing: ${filename} (${(content.length / 1024).toFixed(1)} KB)`);

        const result = normalizeCode(content, hostname, {
          verbose: false,
        });

        // Update resource body/content with normalized code
        const normalizedBuffer = Buffer.from(result.code, 'utf-8');
        resource.body = normalizedBuffer;
        resource.content = result.code;
        resource.size = normalizedBuffer.length;
        resource.normalized = true;

        // Track stats
        totalDecoders += result.changes.deobfuscate.decoders.length;
        totalReplacements += result.changes.deobfuscate.replacements;
        totalEvalChanges += result.changes.evaluate.changes.length;
        totalSimplifications += result.changes.simplify.changes.length;

        const totalChanges =
          result.changes.deobfuscate.replacements +
          result.changes.evaluate.changes.length +
          result.changes.simplify.changes.length;

        if (totalChanges > 0) {
          this.trackModified();
          this.info(`  ${filename}: ${totalChanges} changes`);
        }
      } catch (error) {
        this.warn(`Failed to normalize ${filename}: ${error.message}`);
        this.trackError();
      }

      this.trackProcessed();
    }

    // Log summary
    this.info(`\nNormalization Summary:`);
    this.info(`  JS files processed: ${jsFilesProcessed}`);
    this.info(`  Decoders found: ${totalDecoders}`);
    this.info(`  String replacements: ${totalReplacements}`);
    this.info(`  AST evaluations: ${totalEvalChanges}`);
    this.info(`  Simplifications: ${totalSimplifications}`);

    this.trackAction(`Normalized ${jsFilesProcessed} JS files`);
    this.trackAction(`${totalReplacements} string deobfuscations`);
    this.trackAction(`${totalEvalChanges} expression evaluations`);
    this.trackAction(`${totalSimplifications} control flow simplifications`);

    return {
      jsFilesProcessed,
      totalDecoders,
      totalReplacements,
      totalEvalChanges,
      totalSimplifications,
    };
  }

  /**
   * Check if a resource is JavaScript
   */
  isJavaScript(resource) {
    // Check content type
    if (resource.contentType?.includes('javascript')) return true;

    // Check file extension
    if (resource.localFile?.endsWith('.js')) return true;

    // Check URL
    if (resource.url?.endsWith('.js')) return true;

    return false;
  }
}

export default NormalizePhase;
