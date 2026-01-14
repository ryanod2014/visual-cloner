/**
 * Domain Check Patcher
 *
 * Neutralizes domain verification checks that prevent cloned sites
 * from functioning on different domains.
 */

import { BasePatcher } from './base.js';

export class DomainCheckPatcher extends BasePatcher {
  name = 'domain-check';

  shouldPatch(url, content, contentType) {
    if (!this.isJavaScript(contentType)) return false;

    // Check for common domain verification patterns
    const domainPatterns = [
      /window\.location\.hostname/,
      /location\.host/,
      /document\.domain/,
      /window\.location\.origin/,
      /location\.href/,
      /window\.location\.host/,
      /new\s+URL\s*\(\s*window\.location/,
      /\.hostname\s*[!=]==?\s*["'`]/,
      /\.host\s*\.includes\s*\(/,
      /\.origin\s*[!=]==?\s*["'`]/
    ];

    return domainPatterns.some(pattern => pattern.test(content));
  }

  patch(content, url) {
    const patches = [];
    let patched = content;

    // Pattern 1: window.location.hostname === "example.com" -> true
    // Also handles !== which should become false
    const hostnameEquality = this.replacePattern(
      patched,
      /(\bwindow\.location\.hostname\s*)(===?)\s*(["'`])([^"'`]+)\3/g,
      (match, prefix, operator, quote, domain) => {
        const result = operator.includes('!') ? 'false' : 'true';
        return `/* PATCHED: ${match} */ ${result}`;
      },
      'window.location.hostname === "domain"'
    );
    patched = hostnameEquality.content;
    if (hostnameEquality.patch) patches.push(hostnameEquality.patch);

    // Pattern 2: window.location.hostname !== "example.com" -> false
    const hostnameInequality = this.replacePattern(
      patched,
      /(\bwindow\.location\.hostname\s*)(!==?)\s*(["'`])([^"'`]+)\3/g,
      (match, prefix, operator, quote, domain) => {
        return `/* PATCHED: ${match} */ false`;
      },
      'window.location.hostname !== "domain"'
    );
    patched = hostnameInequality.content;
    if (hostnameInequality.patch) patches.push(hostnameInequality.patch);

    // Pattern 3: location.host.includes("example") -> true
    const hostIncludes = this.replacePattern(
      patched,
      /(\blocation\.host\.includes\s*\(\s*)(["'`])([^"'`]+)\2\s*\)/g,
      (match, prefix, quote, domain) => {
        return `/* PATCHED: ${match} */ true`;
      },
      'location.host.includes("domain")'
    );
    patched = hostIncludes.content;
    if (hostIncludes.patch) patches.push(hostIncludes.patch);

    // Pattern 4: document.domain !== "example.com" -> false
    const documentDomainNeq = this.replacePattern(
      patched,
      /(\bdocument\.domain\s*)(!==?)\s*(["'`])([^"'`]+)\3/g,
      (match) => {
        return `/* PATCHED: ${match} */ false`;
      },
      'document.domain !== "domain"'
    );
    patched = documentDomainNeq.content;
    if (documentDomainNeq.patch) patches.push(documentDomainNeq.patch);

    // Pattern 5: document.domain === "example.com" -> true
    const documentDomainEq = this.replacePattern(
      patched,
      /(\bdocument\.domain\s*)(===?)\s*(["'`])([^"'`]+)\3/g,
      (match) => {
        return `/* PATCHED: ${match} */ true`;
      },
      'document.domain === "domain"'
    );
    patched = documentDomainEq.content;
    if (documentDomainEq.patch) patches.push(documentDomainEq.patch);

    // Pattern 6: window.location.origin !== "https://example.com" -> false
    const originNeq = this.replacePattern(
      patched,
      /(\bwindow\.location\.origin\s*)(!==?)\s*(["'`])([^"'`]+)\3/g,
      (match) => {
        return `/* PATCHED: ${match} */ false`;
      },
      'window.location.origin !== "origin"'
    );
    patched = originNeq.content;
    if (originNeq.patch) patches.push(originNeq.patch);

    // Pattern 7: window.location.origin === "https://example.com" -> true
    const originEq = this.replacePattern(
      patched,
      /(\bwindow\.location\.origin\s*)(===?)\s*(["'`])([^"'`]+)\3/g,
      (match) => {
        return `/* PATCHED: ${match} */ true`;
      },
      'window.location.origin === "origin"'
    );
    patched = originEq.content;
    if (originEq.patch) patches.push(originEq.patch);

    // Pattern 8: new URL(window.location).hostname checks
    const urlHostname = this.replacePattern(
      patched,
      /new\s+URL\s*\(\s*window\.location[^)]*\)\.hostname\s*(===?|!==?)\s*(["'`])([^"'`]+)\2/g,
      (match, operator) => {
        const result = operator.includes('!') ? 'false' : 'true';
        return `/* PATCHED: ${match} */ ${result}`;
      },
      'new URL(window.location).hostname check'
    );
    patched = urlHostname.content;
    if (urlHostname.patch) patches.push(urlHostname.patch);

    // Pattern 9: location.host === or !== checks
    const locationHost = this.replacePattern(
      patched,
      /(\blocation\.host\s*)(===?|!==?)\s*(["'`])([^"'`]+)\3/g,
      (match, prefix, operator) => {
        const result = operator.includes('!') ? 'false' : 'true';
        return `/* PATCHED: ${match} */ ${result}`;
      },
      'location.host === "domain"'
    );
    patched = locationHost.content;
    if (locationHost.patch) patches.push(locationHost.patch);

    // Pattern 10: URL validation regexes that include specific domains
    // Match patterns like /^https?:\/\/(www\.)?example\.com/
    const domainRegex = this.replacePattern(
      patched,
      /\/\^https\?:\\\/\\\/[^/]+\.(com|org|net|io)[^/]*\/[gimsuy]*/g,
      (match) => {
        // Replace with a permissive regex that matches any URL
        return `/* PATCHED: ${match} */ /^https?:\\/\\//`;
      },
      'URL validation regex with specific domain'
    );
    patched = domainRegex.content;
    if (domainRegex.patch) patches.push(domainRegex.patch);

    // Pattern 11: Array includes check for allowed domains
    // e.g., ["example.com", "www.example.com"].includes(location.hostname)
    const allowedDomains = this.replacePattern(
      patched,
      /\[[^\]]*["'`][a-zA-Z0-9.-]+\.(com|org|net|io)["'`][^\]]*\]\.includes\s*\(\s*(window\.)?location\.(hostname|host)\s*\)/g,
      (match) => {
        return `/* PATCHED: ${match} */ true`;
      },
      'Allowed domains array includes check'
    );
    patched = allowedDomains.content;
    if (allowedDomains.patch) patches.push(allowedDomains.patch);

    // Pattern 12: indexOf checks for domain
    const indexOfDomain = this.replacePattern(
      patched,
      /(\blocation\.(host|hostname)\.indexOf\s*\(\s*)(["'`])([^"'`]+)\3\s*\)\s*(===?|!==?|>=?|<=?|>|<)\s*(-?\d+)/g,
      (match, prefix, prop, quote, domain, operator, num) => {
        // indexOf !== -1 or >= 0 means "contains", should be true
        // indexOf === -1 or < 0 means "doesn't contain", should be false
        const isNegativeCheck = (operator === '===' || operator === '==') && num === '-1';
        const isPositiveCheck = operator === '!==' || operator === '!=' || operator === '>=' || operator === '>';
        const result = isPositiveCheck ? 'true' : 'false';
        return `/* PATCHED: ${match} */ ${result}`;
      },
      'location.host.indexOf("domain") check'
    );
    patched = indexOfDomain.content;
    if (indexOfDomain.patch) patches.push(indexOfDomain.patch);

    return { content: patched, patches };
  }
}
