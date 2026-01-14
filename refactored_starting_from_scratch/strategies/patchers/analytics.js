/**
 * Analytics Patcher
 *
 * Removes tracking scripts and error reporting to prevent
 * cloned sites from sending data to third-party services.
 */

import { BasePatcher } from './base.js';

export class AnalyticsPatcher extends BasePatcher {
  name = 'analytics';

  shouldPatch(url, content, contentType) {
    if (!this.isJavaScript(contentType)) return false;

    // Check for common analytics/tracking patterns
    const analyticsPatterns = [
      /\bgtag\s*\(/,
      /\bga\s*\(/,
      /\b_gaq\s*\./,
      /google-analytics/i,
      /googletagmanager/i,
      /\bfbq\s*\(/,
      /facebook.*pixel/i,
      /hotjar/i,
      /mixpanel/i,
      /amplitude/i,
      /segment\.com/i,
      /analytics\.js/i,
      /\bSentry\./,
      /\bBugsnag\./,
      /\bLogRocket\./,
      /\bFullStory\./,
      /\bHeap\./,
      /\bIntercom\(/,
      /dataLayer\.push/,
      /trackEvent/i,
      /trackPageView/i
    ];

    return analyticsPatterns.some(pattern => pattern.test(content));
  }

  patch(content, url) {
    const patches = [];
    let patched = content;

    // Pattern 1: Google Analytics gtag
    // gtag('event', ...) -> void 0
    const gtagCalls = this.replacePattern(
      patched,
      /\bgtag\s*\([^)]*\)/g,
      (match) => {
        return `/* PATCHED: ${match.substring(0, 50)}... */ void 0`;
      },
      'gtag() calls'
    );
    patched = gtagCalls.content;
    if (gtagCalls.patch) patches.push(gtagCalls.patch);

    // Pattern 2: Classic Google Analytics ga()
    const gaCalls = this.replacePattern(
      patched,
      /\bga\s*\(\s*["'`](send|create|set|require)[^)]*\)/g,
      (match) => {
        return `/* PATCHED: ${match.substring(0, 50)}... */ void 0`;
      },
      'ga() calls'
    );
    patched = gaCalls.content;
    if (gaCalls.patch) patches.push(gaCalls.patch);

    // Pattern 3: Legacy _gaq.push
    const gaqPush = this.replacePattern(
      patched,
      /_gaq\.push\s*\([^)]*\)/g,
      (match) => {
        return `/* PATCHED: _gaq.push */ void 0`;
      },
      '_gaq.push() calls'
    );
    patched = gaqPush.content;
    if (gaqPush.patch) patches.push(gaqPush.patch);

    // Pattern 4: Facebook Pixel fbq
    const fbqCalls = this.replacePattern(
      patched,
      /\bfbq\s*\([^)]*\)/g,
      (match) => {
        return `/* PATCHED: ${match.substring(0, 50)}... */ void 0`;
      },
      'fbq() calls'
    );
    patched = fbqCalls.content;
    if (fbqCalls.patch) patches.push(fbqCalls.patch);

    // Pattern 5: Google Tag Manager dataLayer
    const dataLayerPush = this.replacePattern(
      patched,
      /dataLayer\.push\s*\([^)]*\)/g,
      (match) => {
        return `/* PATCHED: dataLayer.push */ void 0`;
      },
      'dataLayer.push() calls'
    );
    patched = dataLayerPush.content;
    if (dataLayerPush.patch) patches.push(dataLayerPush.patch);

    // Pattern 6: Sentry error reporting
    const sentryCalls = this.replacePattern(
      patched,
      /Sentry\.(init|captureException|captureMessage|captureEvent|configureScope|withScope)\s*\([^)]*\)/g,
      (match) => {
        return `/* PATCHED: ${match.substring(0, 50)}... */ void 0`;
      },
      'Sentry calls'
    );
    patched = sentryCalls.content;
    if (sentryCalls.patch) patches.push(sentryCalls.patch);

    // Pattern 7: Bugsnag error reporting
    const bugsnagCalls = this.replacePattern(
      patched,
      /Bugsnag\.(start|notify|leaveBreadcrumb|setUser)\s*\([^)]*\)/g,
      (match) => {
        return `/* PATCHED: ${match.substring(0, 50)}... */ void 0`;
      },
      'Bugsnag calls'
    );
    patched = bugsnagCalls.content;
    if (bugsnagCalls.patch) patches.push(bugsnagCalls.patch);

    // Pattern 8: LogRocket session recording
    const logRocketCalls = this.replacePattern(
      patched,
      /LogRocket\.(init|identify|track|getSessionURL|captureException)\s*\([^)]*\)/g,
      (match) => {
        return `/* PATCHED: ${match.substring(0, 50)}... */ void 0`;
      },
      'LogRocket calls'
    );
    patched = logRocketCalls.content;
    if (logRocketCalls.patch) patches.push(logRocketCalls.patch);

    // Pattern 9: FullStory session recording
    const fullStoryCalls = this.replacePattern(
      patched,
      /FullStory\.(init|identify|setUserVars|event|log|shutdown)\s*\([^)]*\)/g,
      (match) => {
        return `/* PATCHED: ${match.substring(0, 50)}... */ void 0`;
      },
      'FullStory calls'
    );
    patched = fullStoryCalls.content;
    if (fullStoryCalls.patch) patches.push(fullStoryCalls.patch);

    // Pattern 10: Mixpanel analytics
    const mixpanelCalls = this.replacePattern(
      patched,
      /mixpanel\.(init|track|identify|alias|people\.set|register)\s*\([^)]*\)/g,
      (match) => {
        return `/* PATCHED: ${match.substring(0, 50)}... */ void 0`;
      },
      'Mixpanel calls'
    );
    patched = mixpanelCalls.content;
    if (mixpanelCalls.patch) patches.push(mixpanelCalls.patch);

    // Pattern 11: Amplitude analytics
    const amplitudeCalls = this.replacePattern(
      patched,
      /amplitude\.(init|logEvent|setUserId|setUserProperties|track)\s*\([^)]*\)/g,
      (match) => {
        return `/* PATCHED: ${match.substring(0, 50)}... */ void 0`;
      },
      'Amplitude calls'
    );
    patched = amplitudeCalls.content;
    if (amplitudeCalls.patch) patches.push(amplitudeCalls.patch);

    // Pattern 12: Heap analytics
    const heapCalls = this.replacePattern(
      patched,
      /heap\.(load|track|identify|addUserProperties|addEventProperties)\s*\([^)]*\)/g,
      (match) => {
        return `/* PATCHED: ${match.substring(0, 50)}... */ void 0`;
      },
      'Heap calls'
    );
    patched = heapCalls.content;
    if (heapCalls.patch) patches.push(heapCalls.patch);

    // Pattern 13: Intercom
    const intercomCalls = this.replacePattern(
      patched,
      /Intercom\s*\([^)]*\)/g,
      (match) => {
        return `/* PATCHED: Intercom */ void 0`;
      },
      'Intercom calls'
    );
    patched = intercomCalls.content;
    if (intercomCalls.patch) patches.push(intercomCalls.patch);

    // Pattern 14: Hotjar
    const hotjarCalls = this.replacePattern(
      patched,
      /hj\s*\(\s*["'`](trigger|identify|stateChange|tagRecording)[^)]*\)/g,
      (match) => {
        return `/* PATCHED: Hotjar */ void 0`;
      },
      'Hotjar calls'
    );
    patched = hotjarCalls.content;
    if (hotjarCalls.patch) patches.push(hotjarCalls.patch);

    // Pattern 15: Generic trackEvent/trackPageView functions
    const trackEventCalls = this.replacePattern(
      patched,
      /\b(trackEvent|trackPageView|trackClick|trackConversion|sendAnalytics|logAnalytics)\s*\([^)]*\)/gi,
      (match, funcName) => {
        return `/* PATCHED: ${funcName} */ void 0`;
      },
      'Generic tracking function calls'
    );
    patched = trackEventCalls.content;
    if (trackEventCalls.patch) patches.push(trackEventCalls.patch);

    // Pattern 16: Segment analytics
    const segmentCalls = this.replacePattern(
      patched,
      /analytics\.(track|identify|page|group|alias|ready|on)\s*\([^)]*\)/g,
      (match) => {
        return `/* PATCHED: Segment analytics */ void 0`;
      },
      'Segment analytics calls'
    );
    patched = segmentCalls.content;
    if (segmentCalls.patch) patches.push(segmentCalls.patch);

    // Pattern 17: Posthog analytics
    const posthogCalls = this.replacePattern(
      patched,
      /posthog\.(init|capture|identify|alias|register|people\.set)\s*\([^)]*\)/g,
      (match) => {
        return `/* PATCHED: Posthog */ void 0`;
      },
      'Posthog calls'
    );
    patched = posthogCalls.content;
    if (posthogCalls.patch) patches.push(posthogCalls.patch);

    // Pattern 18: Plausible analytics
    const plausibleCalls = this.replacePattern(
      patched,
      /plausible\s*\([^)]*\)/g,
      (match) => {
        return `/* PATCHED: Plausible */ void 0`;
      },
      'Plausible calls'
    );
    patched = plausibleCalls.content;
    if (plausibleCalls.patch) patches.push(plausibleCalls.patch);

    // Pattern 19: Replace analytics initialization objects with no-ops
    // window.gtag = function() {} style
    const analyticsInit = this.replacePattern(
      patched,
      /window\.(gtag|ga|fbq|dataLayer|_gaq|mixpanel|amplitude|heap|Sentry|Bugsnag|LogRocket|FullStory)\s*=\s*[^;]+;/g,
      (match, name) => {
        if (name === 'dataLayer') {
          return `/* PATCHED */ window.dataLayer = [];`;
        }
        return `/* PATCHED */ window.${name} = function() {};`;
      },
      'Analytics global initialization'
    );
    patched = analyticsInit.content;
    if (analyticsInit.patch) patches.push(analyticsInit.patch);

    return { content: patched, patches };
  }
}
