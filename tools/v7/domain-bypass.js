#!/usr/bin/env node
/**
 * V7 Domain Bypass
 * Universal domain/license check bypassing for offline webapps
 *
 * Detects and patches common domain restriction patterns:
 * - hostname/origin checks
 * - license validation functions
 * - navigator.onLine checks
 * - Boolean flags tied to domain
 */

import fs from 'fs';
import path from 'path';

/**
 * Domain bypass patterns - UNIVERSAL (not app-specific)
 */
const BYPASS_PATTERNS = [
  {
    name: 'hostname-ternary',
    description: 'Ternary operator checking hostname (var x = hostname.endsWith(...) ? ... : 0)',
    // Matches: var lm=window.location.hostname.endsWith("x.com")?2:window.location.hostname=="y.com"?1:0
    pattern: /var\s+(\w+)\s*=\s*window\.location\.hostname\.[a-zA-Z]+\([^)]+\)\s*\?[^;]+:\s*0/g,
    replace: (match, varName) => `var ${varName}=1`,
  },
  {
    name: 'hostname-equals-ternary',
    description: 'Ternary with hostname equals check',
    // Matches: var x = location.hostname === "example.com" ? 1 : 0
    pattern: /var\s+(\w+)\s*=\s*(?:window\.)?location\.hostname\s*===?\s*["'][^"']+["']\s*\?\s*\d+\s*:\s*0/g,
    replace: (match, varName) => `var ${varName}=1`,
  },
  {
    name: 'hostname-includes',
    description: 'Hostname includes check',
    // Matches: if(location.hostname.includes("x.com"))
    pattern: /if\s*\(\s*(?:window\.)?location\.hostname\.includes\s*\([^)]+\)\s*\)/g,
    replace: 'if(true)',
  },
  {
    name: 'origin-check',
    description: 'Origin-based validation',
    // Matches: window.location.origin !== "https://example.com"
    pattern: /(?:window\.)?location\.origin\s*!==?\s*["'][^"']+["']/g,
    replace: 'false',
  },
  {
    name: 'origin-equals',
    description: 'Origin equality check',
    // Matches: window.location.origin === "https://example.com"
    pattern: /(?:window\.)?location\.origin\s*===?\s*["'][^"']+["']/g,
    replace: 'true',
  },
  {
    name: 'host-check',
    description: 'Host-based validation',
    // Matches: if(location.host !== "example.com")
    pattern: /if\s*\(\s*(?:window\.)?location\.host\s*!==?\s*["'][^"']+["']\s*\)/g,
    replace: 'if(false)',
  },
  {
    name: 'navigator-online-false',
    description: 'navigator.onLine check (set to always online)',
    // Matches: if(!navigator.onLine) or if(navigator.onLine===false)
    pattern: /if\s*\(\s*!navigator\.onLine\s*\)/g,
    replace: 'if(false)',
  },
  {
    name: 'navigator-online-check',
    description: 'Direct navigator.onLine reference',
    // Matches: navigator.onLine in conditionals
    pattern: /navigator\.onLine\s*===?\s*false/g,
    replace: 'false',
  },
  {
    name: 'domain-validation-func',
    description: 'Domain validation function returning boolean',
    // Matches: isDomainValid=function(){...return false;}
    pattern: /(isDomainValid|isValidDomain|checkDomain|validateDomain|domainCheck)\s*=\s*function\s*\([^)]*\)\s*\{[^}]{0,500}return\s+false[^}]*\}/g,
    replace: (match, funcName) => `${funcName}=function(){return true}`,
  },
  {
    name: 'license-check-func',
    description: 'License check function',
    // Matches: isLicensed=function(){...return 0;}
    pattern: /(isLicensed|checkLicense|validateLicense|licenseValid)\s*=\s*function\s*\([^)]*\)\s*\{[^}]{0,500}return\s+0[^}]*\}/g,
    replace: (match, funcName) => `${funcName}=function(){return 1}`,
  },
  {
    name: 'adq-pattern',
    description: 'Specific adQ function pattern (common in some apps)',
    // Matches: X.adQ=function(){...}
    pattern: /(\w+)\.adQ\s*=\s*function\s*\(\s*\)\s*\{[^}]+\}/g,
    replace: (match, obj) => `${obj}.adQ=function(){return 1}`,
  },
  {
    name: 'ak6-flag',
    description: 'Boolean flag pattern (ak6)',
    // Matches: if($==0)this.ak6=!0;
    pattern: /if\s*\(\s*\$\s*==\s*0\s*\)\s*this\.ak6\s*=\s*!0/g,
    replace: 'if($==0)this.ak6=!1',
  },
  {
    name: 'throw-domain-error',
    description: 'Throw on domain mismatch',
    // Matches: throw new Error("Invalid domain")
    pattern: /throw\s+new\s+Error\s*\(\s*["'][^"']*domain[^"']*["']\s*\)/gi,
    replace: '/* domain check bypassed */',
  },
];

/**
 * Apply domain bypass patterns to JavaScript content
 * @param {string} content - JavaScript file content
 * @returns {Object} - { content, patches: [{pattern, count}] }
 */
export function applyDomainBypass(content) {
  const patches = [];
  let modified = content;

  for (const pattern of BYPASS_PATTERNS) {
    const matches = modified.match(pattern.pattern);
    if (matches && matches.length > 0) {
      const count = matches.length;

      if (typeof pattern.replace === 'function') {
        modified = modified.replace(pattern.pattern, pattern.replace);
      } else {
        modified = modified.replace(pattern.pattern, pattern.replace);
      }

      patches.push({
        name: pattern.name,
        description: pattern.description,
        count,
        examples: matches.slice(0, 2).map(m => m.slice(0, 100)),
      });
    }
  }

  return { content: modified, patches };
}

/**
 * Check if a file likely contains domain checks (quick scan)
 * @param {string} content - File content
 * @returns {boolean}
 */
export function hasDomainChecks(content) {
  const quickPatterns = [
    /location\.hostname/,
    /location\.origin/,
    /location\.host[^n]/,
    /navigator\.onLine/,
    /isDomainValid|checkDomain|validateDomain/i,
    /isLicensed|checkLicense/i,
    /\.adQ\s*=/,
    /this\.ak6/,
  ];

  return quickPatterns.some(p => p.test(content));
}

/**
 * Process all JS files in a directory
 * @param {string} resourceDir - Directory containing JS files
 * @returns {Object} - { totalPatched, files: [{path, patches}] }
 */
export async function bypassDomainChecks(resourceDir) {
  const results = {
    totalPatched: 0,
    files: [],
  };

  const files = await fs.promises.readdir(resourceDir);
  const jsFiles = files.filter(f => f.endsWith('.js'));

  for (const file of jsFiles) {
    const filePath = path.join(resourceDir, file);
    const content = await fs.promises.readFile(filePath, 'utf-8');

    // Quick check first
    if (!hasDomainChecks(content)) {
      continue;
    }

    const { content: modified, patches } = applyDomainBypass(content);

    if (patches.length > 0) {
      await fs.promises.writeFile(filePath, modified);
      results.files.push({ path: filePath, file, patches });
      results.totalPatched += patches.reduce((sum, p) => sum + p.count, 0);

      console.log(`[domain-bypass] Patched ${file}:`);
      for (const patch of patches) {
        console.log(`  - ${patch.name}: ${patch.count} occurrence(s)`);
      }
    }
  }

  return results;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: node domain-bypass.js <resources-dir>');
    console.log('');
    console.log('Scans JS files for domain/license checks and patches them');
    process.exit(1);
  }

  const resourceDir = args[0];

  if (!fs.existsSync(resourceDir)) {
    console.error('Error: Directory not found:', resourceDir);
    process.exit(1);
  }

  console.log('Scanning for domain checks...\n');

  bypassDomainChecks(resourceDir)
    .then(results => {
      console.log('\n════════════════════════════════════════');
      console.log('DOMAIN BYPASS COMPLETE');
      console.log('════════════════════════════════════════');
      console.log(`Files patched: ${results.files.length}`);
      console.log(`Total patches: ${results.totalPatched}`);

      if (results.files.length > 0) {
        console.log('\nPatched files:');
        for (const f of results.files) {
          console.log(`  ${f.file}`);
        }
      }
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}
