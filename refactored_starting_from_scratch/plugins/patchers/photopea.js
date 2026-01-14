/**
 * Photopea Patcher
 * Specific patches for Photopea's domain/license protection
 */

import { IPatcher, PatchResult } from './interface.js';

export class PhotopeaPatcher extends IPatcher {
  constructor() {
    super('photopea', 'Photopea-specific domain bypass patches');
  }

  shouldApply(content, filename) {
    // Check by extension OR content patterns
    const isJsExtension = filename.endsWith('.js');
    const hasJsContent = content.includes('function') && content.includes('var ');
    const hasPhotopeaPatterns = content.includes('U.alp') ||
                                content.includes('this.aat') ||
                                content.includes('J.adQ') ||
                                content.includes('this.ak6') ||
                                content.includes('photopea.com') ||
                                content.includes('vecpea.com') ||
                                content.includes('jampea.com');

    // If it doesn't look like JS at all, skip it
    if (!isJsExtension && !hasJsContent && !hasPhotopeaPatterns) return false;

    // Look for Photopea-specific patterns
    return hasPhotopeaPatterns;
  }

  apply(content) {
    const patches = [];
    let modified = content;

    // PATCH 1: U.alp() function - returns 0 for Photopea mode (NEW VERSION)
    const alpResult = this.patchAlpFunction(modified);
    if (alpResult.patched) {
      modified = alpResult.content;
      patches.push(new PatchResult('U.alp', 1, ['U.alp=function(){return 0;}']));
    }

    // PATCH 2: aat flag - keep disabled (change !0 to !1 when B==0) (NEW VERSION)
    const aatResult = this.patchAatFlag(modified);
    if (aatResult.count > 0) {
      modified = aatResult.content;
      patches.push(new PatchResult('aat-flag', aatResult.count, aatResult.examples));
    }

    // PATCH 3: J.adQ function - replace entire body with return 1 (OLD VERSION)
    const adqResult = this.patchAdQFunction(modified);
    if (adqResult.patched) {
      modified = adqResult.content;
      patches.push(new PatchResult('J.adQ', 1, ['J.adQ=function(){return 1;}']));
    }

    // PATCH 4: ak6 flag - prevent it from being set to true (OLD VERSION)
    const ak6Result = this.patchAk6Flag(modified);
    if (ak6Result.count > 0) {
      modified = ak6Result.content;
      patches.push(new PatchResult('ak6-flag', ak6Result.count, ak6Result.examples));
    }

    return { content: modified, patches };
  }

  /**
   * U.alp() function - returns 0 for Photopea mode (NEW VERSION)
   * This determines the app mode (0=Photopea, 1=Vectorpea)
   */
  patchAlpFunction(content) {
    const alpPattern = /U\.alp\s*=\s*function\s*\(\s*\)\s*\{/;
    const match = content.match(alpPattern);

    if (!match) {
      return { content, patched: false };
    }

    const startIndex = match.index + match[0].length;
    let braceCount = 1;
    let endIndex = startIndex;

    // Find the matching closing brace
    while (braceCount > 0 && endIndex < content.length) {
      if (content[endIndex] === '{') braceCount++;
      if (content[endIndex] === '}') braceCount--;
      endIndex++;
    }

    // Find the end of the statement (semicolon)
    while (endIndex < content.length && content[endIndex] !== ';') {
      endIndex++;
    }
    endIndex++;

    const replacement = 'U.alp=function(){return 0;};';
    const modified = content.substring(0, match.index) +
      replacement +
      content.substring(endIndex);

    return { content: modified, patched: true };
  }

  /**
   * aat flag - keep disabled (NEW VERSION)
   * Prevents restrictions when B==0
   */
  patchAatFlag(content) {
    let modified = content;
    let count = 0;
    const examples = [];

    // Pattern: if(B==0)this.aat=!0;
    const aatPattern = /if\s*\(\s*B\s*==\s*0\s*\)\s*this\.aat\s*=\s*!\s*0\s*;/g;
    const aatMatches = content.match(aatPattern);

    if (aatMatches && aatMatches.length > 0) {
      modified = modified.replace(aatPattern, 'if(B==0)this.aat=!1;');
      count += aatMatches.length;
      examples.push('if(B==0)this.aat=!0 -> !1');
    } else {
      // Alternative pattern: this.aat=!0
      const alt = /this\.aat\s*=\s*!\s*0/g;
      const altMatches = content.match(alt);
      if (altMatches) {
        modified = modified.replace(alt, 'this.aat=!1');
        count += altMatches.length;
        examples.push('this.aat=!0 -> !1');
      }
    }

    return { content: modified, count, examples };
  }

  /**
   * Replace J.adQ function body with simple return 1 (OLD VERSION)
   * This function checks domain validity - we make it always return valid
   */
  patchAdQFunction(content) {
    const startPattern = /J\.adQ\s*=\s*function\s*\(\s*\)\s*\{/;
    const match = content.match(startPattern);

    if (!match) {
      return { content, patched: false };
    }

    // Find the matching closing brace
    const startIndex = match.index + match[0].length;
    let braceCount = 1;
    let endIndex = startIndex;

    while (braceCount > 0 && endIndex < content.length) {
      if (content[endIndex] === '{') braceCount++;
      if (content[endIndex] === '}') braceCount--;
      endIndex++;
    }

    // Find the semicolon after the closing brace
    while (endIndex < content.length && content[endIndex] !== ';') {
      endIndex++;
    }
    endIndex++;

    // Replace the entire function
    const modified = content.substring(0, match.index) +
      'J.adQ=function(){return 1;};' +
      content.substring(endIndex);

    return { content: modified, patched: true };
  }

  /**
   * Patch ak6 flag - change !0 (true) to !1 (false)
   * This flag restricts features when set to true
   */
  patchAk6Flag(content) {
    // Pattern: if($==0)this.ak6=!0;
    const pattern1 = /if\s*\(\s*\$\s*==\s*0\s*\)\s*this\.ak6\s*=\s*!\s*0\s*;/g;
    const matches1 = content.match(pattern1);

    let modified = content;
    let count = 0;
    const examples = [];

    if (matches1 && matches1.length > 0) {
      modified = modified.replace(pattern1, 'if($==0)this.ak6=!1;');
      count += matches1.length;
      examples.push('if($==0)this.ak6=!0 -> !1');
    }

    // Alternative pattern: this.ak6=!0
    const pattern2 = /this\.ak6\s*=\s*!\s*0/g;
    const matches2 = modified.match(pattern2);

    if (matches2 && matches2.length > 0) {
      modified = modified.replace(pattern2, 'this.ak6=!1');
      count += matches2.length;
      examples.push('this.ak6=!0 -> !1');
    }

    return { content: modified, count, examples };
  }

  getPatterns() {
    return [
      { name: 'U.alp', description: 'App mode function - return 0 for Photopea mode (new version)' },
      { name: 'aat-flag', description: 'Feature restriction flag - keep disabled (new version)' },
      { name: 'J.adQ', description: 'Domain validation function - always return 1 (old version)' },
      { name: 'ak6-flag', description: 'Feature restriction flag - keep false (old version)' },
    ];
  }
}

export default PhotopeaPatcher;
