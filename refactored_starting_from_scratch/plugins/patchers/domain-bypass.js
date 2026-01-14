/**
 * Domain Bypass Patcher
 * Generic patterns for bypassing domain/license checks
 */

import { IPatcher, PatchResult } from './interface.js';

const PATTERNS = [
  {
    name: 'hostname-ternary',
    description: 'Ternary operator checking hostname (skip lm for Photopea)',
    pattern: /var\s+(\w+)\s*=\s*window\.location\.hostname\.[a-zA-Z]+\([^)]+\)\s*\?[^;]+:\s*0/g,
    replace: (match, varName) => {
      // Skip 'lm' variable - handled by Photopea patcher
      if (varName === 'lm') return match;
      return `var ${varName}=1`;
    },
  },
  {
    name: 'hostname-equals-ternary',
    description: 'Ternary with hostname equals check',
    pattern: /var\s+(\w+)\s*=\s*(?:window\.)?location\.hostname\s*===?\s*["'][^"']+["']\s*\?\s*\d+\s*:\s*0/g,
    replace: (match, varName) => `var ${varName}=1`,
  },
  {
    name: 'hostname-includes',
    description: 'Hostname includes check',
    pattern: /if\s*\(\s*(?:window\.)?location\.hostname\.includes\s*\([^)]+\)\s*\)/g,
    replace: 'if(true)',
  },
  {
    name: 'origin-not-equals',
    description: 'Origin not equals check',
    pattern: /(?:window\.)?location\.origin\s*!==?\s*["'][^"']+["']/g,
    replace: 'false',
  },
  {
    name: 'origin-equals',
    description: 'Origin equals check',
    pattern: /(?:window\.)?location\.origin\s*===?\s*["'][^"']+["']/g,
    replace: 'true',
  },
  {
    name: 'host-check',
    description: 'Host-based validation',
    pattern: /if\s*\(\s*(?:window\.)?location\.host\s*!==?\s*["'][^"']+["']\s*\)/g,
    replace: 'if(false)',
  },
  {
    name: 'navigator-online-false',
    description: 'navigator.onLine check - always online',
    pattern: /if\s*\(\s*!navigator\.onLine\s*\)/g,
    replace: 'if(false)',
  },
  {
    name: 'navigator-online-check',
    description: 'Direct navigator.onLine === false',
    pattern: /navigator\.onLine\s*===?\s*false/g,
    replace: 'false',
  },
  {
    name: 'throw-domain-error',
    description: 'Throw on domain mismatch',
    pattern: /throw\s+new\s+Error\s*\(\s*["'][^"']*domain[^"']*["']\s*\)/gi,
    replace: '/* domain check bypassed */',
  },
];

// Quick detection patterns
const QUICK_PATTERNS = [
  /location\.hostname/,
  /location\.origin/,
  /location\.host[^n]/,
  /navigator\.onLine/,
  /isDomainValid|checkDomain|validateDomain/i,
  /isLicensed|checkLicense/i,
];

export class DomainBypassPatcher extends IPatcher {
  constructor() {
    super('domain-bypass', 'Generic domain/license check bypass');
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
          matches.slice(0, 2).map(m => m.slice(0, 80))
        ));
      }
    }

    return { content: modified, patches };
  }

  getPatterns() {
    return PATTERNS.map(p => ({ name: p.name, description: p.description }));
  }
}

export default DomainBypassPatcher;
