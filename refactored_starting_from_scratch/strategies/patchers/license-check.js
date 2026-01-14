/**
 * License Check Patcher
 *
 * Neutralizes license validation and trial expiration checks
 * to allow cloned applications to function without valid licenses.
 */

import { BasePatcher } from './base.js';

export class LicenseCheckPatcher extends BasePatcher {
  name = 'license-check';

  shouldPatch(url, content, contentType) {
    if (!this.isJavaScript(contentType)) return false;

    // Check for common license/trial patterns
    const licensePatterns = [
      /license[_-]?key/i,
      /validateLicense/i,
      /checkLicense/i,
      /isLicensed/i,
      /isValid[_-]?License/i,
      /trial[_-]?expired/i,
      /isTrialExpired/i,
      /checkTrial/i,
      /trialEnded/i,
      /subscription[_-]?valid/i,
      /isPro\s*[=:]/i,
      /isPremium\s*[=:]/i,
      /isEnterprise\s*[=:]/i,
      /featureEnabled/i,
      /hasFeature/i,
      /canAccess/i
    ];

    return licensePatterns.some(pattern => pattern.test(content));
  }

  patch(content, url) {
    const patches = [];
    let patched = content;

    // Pattern 1: License validation functions that return boolean
    // function validateLicense() { ... } -> function validateLicense() { return true; }
    const validateFunctions = this.replacePattern(
      patched,
      /function\s+(validateLicense|checkLicense|isLicensed|isValidLicense|verifyLicense)\s*\([^)]*\)\s*\{[^}]*\}/gi,
      (match, funcName) => {
        return `/* PATCHED: ${funcName} */ function ${funcName}() { return true; }`;
      },
      'License validation function'
    );
    patched = validateFunctions.content;
    if (validateFunctions.patch) patches.push(validateFunctions.patch);

    // Pattern 2: Arrow function license checks
    // const validateLicense = () => { ... } -> const validateLicense = () => true
    const arrowLicenseChecks = this.replacePattern(
      patched,
      /(const|let|var)\s+(validateLicense|checkLicense|isLicensed|isValidLicense|verifyLicense)\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*\}/gi,
      (match, decl, funcName) => {
        return `/* PATCHED: ${funcName} */ ${decl} ${funcName} = () => true`;
      },
      'Arrow function license check'
    );
    patched = arrowLicenseChecks.content;
    if (arrowLicenseChecks.patch) patches.push(arrowLicenseChecks.patch);

    // Pattern 3: Trial expiration checks
    // function isTrialExpired() { ... } -> function isTrialExpired() { return false; }
    const trialFunctions = this.replacePattern(
      patched,
      /function\s+(isTrialExpired|trialExpired|checkTrialExpiry|hasTrialEnded|isTrialOver)\s*\([^)]*\)\s*\{[^}]*\}/gi,
      (match, funcName) => {
        return `/* PATCHED: ${funcName} */ function ${funcName}() { return false; }`;
      },
      'Trial expiration function'
    );
    patched = trialFunctions.content;
    if (trialFunctions.patch) patches.push(trialFunctions.patch);

    // Pattern 4: Arrow function trial checks
    const arrowTrialChecks = this.replacePattern(
      patched,
      /(const|let|var)\s+(isTrialExpired|trialExpired|checkTrialExpiry|hasTrialEnded)\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*\}/gi,
      (match, decl, funcName) => {
        return `/* PATCHED: ${funcName} */ ${decl} ${funcName} = () => false`;
      },
      'Arrow function trial check'
    );
    patched = arrowTrialChecks.content;
    if (arrowTrialChecks.patch) patches.push(arrowTrialChecks.patch);

    // Pattern 5: Feature flag checks based on license tier
    // isPro: false -> isPro: true
    const featureFlags = this.replacePattern(
      patched,
      /(isPro|isPremium|isEnterprise|isUnlocked|hasFullAccess|isActivated)\s*:\s*false/gi,
      (match, prop) => {
        return `/* PATCHED */ ${prop}: true`;
      },
      'Feature flag (isPro/isPremium/etc): false'
    );
    patched = featureFlags.content;
    if (featureFlags.patch) patches.push(featureFlags.patch);

    // Pattern 6: License key validation returning false
    // return !isValid || return false for license checks
    const licenseReturns = this.replacePattern(
      patched,
      /(license|subscription)[^}]*return\s+false\s*;/gi,
      (match) => {
        return match.replace(/return\s+false/, '/* PATCHED */ return true');
      },
      'License validation returning false'
    );
    patched = licenseReturns.content;
    if (licenseReturns.patch) patches.push(licenseReturns.patch);

    // Pattern 7: Trial days remaining <= 0 checks
    const trialDaysCheck = this.replacePattern(
      patched,
      /(trialDays|daysRemaining|trialRemaining)\s*<=?\s*0/gi,
      (match, varName) => {
        return `/* PATCHED: ${match} */ false`;
      },
      'Trial days remaining check'
    );
    patched = trialDaysCheck.content;
    if (trialDaysCheck.patch) patches.push(trialDaysCheck.patch);

    // Pattern 8: Expiration date comparisons
    // new Date() > expirationDate -> false
    const expirationDateCheck = this.replacePattern(
      patched,
      /new\s+Date\s*\(\s*\)\s*>\s*(expir[a-zA-Z]*Date|trialEnd|licenseExpiry)/gi,
      (match) => {
        return `/* PATCHED: ${match} */ false`;
      },
      'Expiration date comparison'
    );
    patched = expirationDateCheck.content;
    if (expirationDateCheck.patch) patches.push(expirationDateCheck.patch);

    // Pattern 9: hasFeature/canAccess checks that might return false
    const featureAccessMethods = this.replacePattern(
      patched,
      /function\s+(hasFeature|canAccess|isFeatureEnabled|checkFeature)\s*\([^)]*\)\s*\{[^}]*return\s+false[^}]*\}/gi,
      (match, funcName) => {
        return `/* PATCHED: ${funcName} */ function ${funcName}() { return true; }`;
      },
      'Feature access check function'
    );
    patched = featureAccessMethods.content;
    if (featureAccessMethods.patch) patches.push(featureAccessMethods.patch);

    // Pattern 10: License status enums/constants set to invalid states
    const licenseStatus = this.replacePattern(
      patched,
      /(licenseStatus|subscriptionStatus)\s*[=:]\s*["'`](expired|invalid|trial|inactive|none)["'`]/gi,
      (match, varName) => {
        return `/* PATCHED */ ${varName}: "active"`;
      },
      'License status set to inactive state'
    );
    patched = licenseStatus.content;
    if (licenseStatus.patch) patches.push(licenseStatus.patch);

    // Pattern 11: Throw statements in license validation
    const licenseThrows = this.replacePattern(
      patched,
      /throw\s+new\s+Error\s*\(\s*["'`][^"'`]*(license|subscription|trial|expired|invalid)[^"'`]*["'`]\s*\)/gi,
      (match) => {
        return `/* PATCHED: ${match} */ void 0`;
      },
      'License validation throw statement'
    );
    patched = licenseThrows.content;
    if (licenseThrows.patch) patches.push(licenseThrows.patch);

    // Pattern 12: Class method license checks
    const classMethodLicense = this.replacePattern(
      patched,
      /(validateLicense|checkLicense|isLicensed)\s*\(\s*\)\s*\{[^}]*return\s+[^}]*\}/gi,
      (match, methodName) => {
        return `/* PATCHED */ ${methodName}() { return true; }`;
      },
      'Class method license check'
    );
    patched = classMethodLicense.content;
    if (classMethodLicense.patch) patches.push(classMethodLicense.patch);

    return { content: patched, patches };
  }
}
