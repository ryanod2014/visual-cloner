#!/usr/bin/env node
/**
 * Standalone HTML Assembler
 *
 * Combines multiple section HTML files into a single assembled.html
 * Zero AI tokens - pure file manipulation
 *
 * Usage: node tools/assemble.js ./output/spotify
 *        node tools/assemble.js ./output/notion --output final.html
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const SECTION_PATTERNS = [
  /^\d{2}-.*\.html$/,           // 01-hero.html, 02-features.html
  /^section-.*\.html$/,         // section-hero.html, section-features.html
  /^.*-attempt-\d+\.html$/,     // hero-attempt-1.html
  /^.*-final\.html$/,           // section-hero-final.html
];

const IGNORE_PATTERNS = [
  /^assembled\.html$/,
  /^clone\.html$/,
  /^final\.html$/,
  /^index\.html$/,
];

// ============================================================================
// HTML Parsing Utilities
// ============================================================================

/**
 * Extract all CSS from <style> tags in HTML content
 */
function extractStyles(html) {
  const styles = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match;

  while ((match = styleRegex.exec(html)) !== null) {
    styles.push(match[1].trim());
  }

  return styles.join('\n\n');
}

/**
 * Extract content from <body> tag
 */
function extractBodyContent(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    return bodyMatch[1].trim();
  }

  // If no body tag, try to extract content after </head> or just return everything
  const headEndMatch = html.match(/<\/head>\s*([\s\S]*?)$/i);
  if (headEndMatch) {
    return headEndMatch[1].replace(/<\/?html[^>]*>/gi, '').trim();
  }

  return '';
}

/**
 * Extract <head> content (fonts, meta tags, etc.)
 */
function extractHeadContent(html) {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return { fonts: [], meta: [] };

  const headContent = headMatch[1];

  // Extract font links
  const fontLinks = [];
  const linkRegex = /<link[^>]*href=["'][^"']*fonts[^"']*["'][^>]*>/gi;
  let match;
  while ((match = linkRegex.exec(headContent)) !== null) {
    fontLinks.push(match[0]);
  }

  // Extract preconnect links
  const preconnectRegex = /<link[^>]*rel=["']preconnect["'][^>]*>/gi;
  while ((match = preconnectRegex.exec(headContent)) !== null) {
    if (!fontLinks.includes(match[0])) {
      fontLinks.unshift(match[0]);
    }
  }

  return { fonts: fontLinks, meta: [] };
}

/**
 * Extract title from HTML
 */
function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return titleMatch ? titleMatch[1].trim() : null;
}

/**
 * Namespace CSS selectors to avoid conflicts between sections
 */
function namespaceCSS(css, sectionId) {
  if (!css.trim()) return '';

  // For now, just add a comment header - more aggressive namespacing could be added
  return `/* === Section: ${sectionId} === */\n${css}`;
}

/**
 * Deduplicate CSS rules (basic deduplication)
 */
function deduplicateCSS(css) {
  const rules = new Map();
  const lines = css.split('\n');
  let currentRule = '';
  let inRule = false;
  let braceCount = 0;

  for (const line of lines) {
    currentRule += line + '\n';
    braceCount += (line.match(/{/g) || []).length;
    braceCount -= (line.match(/}/g) || []).length;

    if (braceCount === 0 && currentRule.trim()) {
      // Normalize and use as key
      const normalized = currentRule.trim().replace(/\s+/g, ' ');
      const selectorMatch = currentRule.match(/^([^{]+)\s*{/);
      if (selectorMatch) {
        const selector = selectorMatch[1].trim();
        // Keep the last occurrence (usually the most refined)
        rules.set(selector, currentRule);
      }
      currentRule = '';
    }
  }

  return Array.from(rules.values()).join('\n');
}

// ============================================================================
// File Discovery
// ============================================================================

/**
 * Find all section HTML files in a directory
 */
async function findSectionFiles(outputDir) {
  const files = await fs.readdir(outputDir);
  const sectionFiles = [];

  for (const file of files) {
    // Skip ignored files
    if (IGNORE_PATTERNS.some(pattern => pattern.test(file))) {
      continue;
    }

    // Check if matches any section pattern
    if (SECTION_PATTERNS.some(pattern => pattern.test(file))) {
      sectionFiles.push(file);
    }
  }

  // Sort files to maintain order (numbered files first, then alphabetically)
  sectionFiles.sort((a, b) => {
    const numA = parseInt(a.match(/^\d+/)?.[0] || '999');
    const numB = parseInt(b.match(/^\d+/)?.[0] || '999');
    if (numA !== numB) return numA - numB;
    return a.localeCompare(b);
  });

  return sectionFiles;
}

/**
 * Find hover states CSS file
 */
async function findHoverStatesFile(outputDir) {
  const files = await fs.readdir(outputDir);
  const hoverFile = files.find(f =>
    f.includes('hover') && f.endsWith('.css')
  );
  return hoverFile || null;
}

// ============================================================================
// Assembly
// ============================================================================

/**
 * Assemble multiple section files into one HTML file
 */
async function assemble(outputDir, options = {}) {
  const { outputFile = 'assembled.html', verbose = true } = options;

  const log = verbose ? console.log.bind(console) : () => {};

  log('\n=== Visual Cloner Assembler ===\n');
  log(`Input directory: ${outputDir}`);

  // Find section files
  const sectionFiles = await findSectionFiles(outputDir);

  if (sectionFiles.length === 0) {
    // Fall back to looking for any HTML files
    const allFiles = await fs.readdir(outputDir);
    const htmlFiles = allFiles.filter(f =>
      f.endsWith('.html') &&
      !IGNORE_PATTERNS.some(p => p.test(f))
    );

    if (htmlFiles.length === 0) {
      log('No section files found. Looking for clone.html...');

      // Check for a single clone.html
      const cloneFile = path.join(outputDir, 'clone.html');
      try {
        await fs.access(cloneFile);
        log('Found clone.html - copying as assembled.html');
        const content = await fs.readFile(cloneFile, 'utf-8');
        await fs.writeFile(path.join(outputDir, outputFile), content);
        log(`Created: ${outputFile}`);
        return { success: true, file: outputFile, sections: 1 };
      } catch {
        log('No HTML files found to assemble.');
        return { success: false, error: 'No HTML files found' };
      }
    }

    sectionFiles.push(...htmlFiles);
  }

  log(`Found ${sectionFiles.length} section file(s):`);
  sectionFiles.forEach(f => log(`  - ${f}`));

  // Collect all parts
  const allStyles = [];
  const allBodies = [];
  const allFonts = new Set();
  let title = 'Assembled Clone';

  for (const file of sectionFiles) {
    const filePath = path.join(outputDir, file);
    const content = await fs.readFile(filePath, 'utf-8');

    // Extract parts
    const styles = extractStyles(content);
    const body = extractBodyContent(content);
    const head = extractHeadContent(content);
    const fileTitle = extractTitle(content);

    // Get section ID from filename
    const sectionId = path.basename(file, '.html');

    // Collect styles with namespacing
    if (styles) {
      allStyles.push(namespaceCSS(styles, sectionId));
    }

    // Collect body content with section wrapper
    if (body) {
      allBodies.push(`  <!-- Section: ${sectionId} -->\n  ${body}`);
    }

    // Collect fonts
    head.fonts.forEach(f => allFonts.add(f));

    // Use first non-null title
    if (fileTitle && title === 'Assembled Clone') {
      title = fileTitle + ' (Assembled)';
    }
  }

  // Load hover states if available
  const hoverFile = await findHoverStatesFile(outputDir);
  let hoverStyles = '';
  if (hoverFile) {
    log(`Loading hover states: ${hoverFile}`);
    hoverStyles = await fs.readFile(path.join(outputDir, hoverFile), 'utf-8');
  }

  // Build assembled HTML
  const assembledHTML = buildAssembledHTML({
    title,
    fonts: Array.from(allFonts),
    styles: allStyles.join('\n\n'),
    hoverStyles,
    body: allBodies.join('\n\n'),
  });

  // Write output
  const outputPath = path.join(outputDir, outputFile);
  await fs.writeFile(outputPath, assembledHTML);

  log(`\nAssembled ${sectionFiles.length} sections into ${outputFile}`);
  log(`Output: ${outputPath}`);

  return {
    success: true,
    file: outputFile,
    sections: sectionFiles.length,
    path: outputPath,
  };
}

/**
 * Build the final assembled HTML document
 */
function buildAssembledHTML({ title, fonts, styles, hoverStyles, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${fonts.join('\n  ')}
  <style>
    /* === Reset === */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html {
      font-size: 16px;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    img {
      max-width: 100%;
      height: auto;
    }

${styles}

    /* === Hover States === */
${hoverStyles}
  </style>
</head>
<body>
${body}
</body>
</html>
`;
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Visual Cloner Assembler

Usage:
  node tools/assemble.js <output-dir> [options]

Options:
  --output, -o <file>   Output filename (default: assembled.html)
  --quiet, -q           Suppress output
  --help, -h            Show this help

Examples:
  node tools/assemble.js ./output/spotify
  node tools/assemble.js ./output/linear -o final.html
  node tools/assemble.js ./output/notion --quiet
`);
    process.exit(0);
  }

  const outputDir = path.resolve(args[0]);

  // Parse options
  const outputIdx = args.findIndex(a => a === '--output' || a === '-o');
  const outputFile = outputIdx >= 0 ? args[outputIdx + 1] : 'assembled.html';
  const quiet = args.includes('--quiet') || args.includes('-q');

  // Check directory exists
  try {
    await fs.access(outputDir);
  } catch {
    console.error(`Error: Directory not found: ${outputDir}`);
    process.exit(1);
  }

  // Run assembly
  try {
    const result = await assemble(outputDir, {
      outputFile,
      verbose: !quiet,
    });

    if (!result.success) {
      console.error(`Assembly failed: ${result.error}`);
      process.exit(1);
    }

    if (!quiet) {
      console.log('\nAssembly complete!');
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
main();

// Export for use as module
export { assemble, findSectionFiles, extractStyles, extractBodyContent };
