/**
 * Dynamic Import Bypass Patcher
 * Bypasses hostname allowlist checks for dynamic imports
 *
 * Targets patterns like:
 * var o=Object.freeze(["stripecdn.com"]);
 * function n(r){let{hostname:e}=new URL(r);return o.some(t=>e===t||e.endsWith(`.${t}`))}
 * function i(r){if(n(r))return import(r);throw new Error(`${r} not allowed`)}
 */

import { IPatcher, PatchResult } from './interface.js';

const PATTERNS = [
  {
    name: 'hostname-url-parse-bypass',
    description: 'Replace hostname extraction with try/catch that handles relative URLs',
    // Match: let{hostname:e}=new URL(r) - this throws for relative URLs
    // Replace with safe version that defaults to allowing
    pattern: /let\s*\{\s*hostname\s*:\s*(\w+)\s*\}\s*=\s*new\s+URL\s*\(\s*(\w+)\s*\)/g,
    replace: (match, hostnameVar, urlVar) =>
      `let ${hostnameVar};try{${hostnameVar}=new URL(${urlVar},location.origin).hostname}catch(e){return true}`,
  },
  {
    name: 'frozen-domain-array',
    description: 'Object.freeze domain allowlist array (add localhost)',
    // Match: Object.freeze(["domain.com"]) - add localhost to the array
    pattern: /Object\.freeze\s*\(\s*\[\s*(["'][a-zA-Z0-9.-]+["'](?:\s*,\s*["'][a-zA-Z0-9.-]+["'])*)\s*\]\s*\)/g,
    replace: (match, domains) => `Object.freeze([${domains},"localhost","127.0.0.1"])`,
  },
  {
    name: 'dynamic-import-error-throw',
    description: 'Dynamic import error throw (bypass)',
    // Match: throw new Error(`${r} not allowed for dynamic import`)
    pattern: /throw\s+new\s+Error\s*\(\s*[`"'][^`"']*not\s+allowed\s+for\s+dynamic\s+import[^`"']*[`"']\s*\)/gi,
    replace: '/* dynamic import check bypassed */ return import(r)',
  },
  {
    name: 'url-hostname-validation',
    description: 'URL hostname validation check (always pass)',
    // Match: hostname === t || hostname.endsWith(`.${t}`)
    pattern: /(\w+)\s*===\s*(\w+)\s*\|\|\s*\1\.endsWith\s*\(\s*[`"']\.?\$\{\2\}[`"']\s*\)/g,
    replace: 'true',
  },
];

// Quick detection - look for signs of dynamic import security
const QUICK_PATTERNS = [
  /Object\.freeze\s*\(\s*\[\s*["'][a-zA-Z0-9.-]+\.com["']/,
  /not\s+allowed\s+for\s+dynamic\s+import/i,
  /let\s*\{\s*hostname\s*:\s*\w+\s*\}\s*=\s*new\s+URL/,
  /\.some\s*\(\s*\w+\s*=>\s*\w+\s*===\s*\w+\s*\|\|\s*\w+\.endsWith/,
];

export class DynamicImportBypassPatcher extends IPatcher {
  constructor() {
    super('dynamic-import-bypass', 'Bypass dynamic import hostname allowlist checks');
  }

  shouldApply(content, filename) {
    if (!filename.endsWith('.js')) return false;
    return QUICK_PATTERNS.some(p => p.test(content));
  }

  apply(content) {
    const patches = [];
    let modified = content;

    for (const pattern of PATTERNS) {
      const matches = modified.match(pattern.pattern);
      if (matches && matches.length > 0) {
        const count = matches.length;

        if (typeof pattern.replace === 'function') {
          modified = modified.replace(pattern.pattern, pattern.replace);
        } else {
          modified = modified.replace(pattern.pattern, pattern.replace);
        }

        patches.push(new PatchResult(
          pattern.name,
          count,
          matches.slice(0, 2).map(m => m.slice(0, 100))
        ));
      }
    }

    return { content: modified, patches };
  }

  getPatterns() {
    return PATTERNS.map(p => ({ name: p.name, description: p.description }));
  }
}

export default DynamicImportBypassPatcher;
