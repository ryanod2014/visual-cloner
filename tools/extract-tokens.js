#!/usr/bin/env node
/**
 * Design Token Extractor
 *
 * Extracts design tokens from a webpage via Playwright:
 * - Color palette (text, backgrounds, borders)
 * - Font families and weights
 * - Common spacing values
 * - Base sizes
 *
 * Usage:
 *   node tools/extract-tokens.js <url> [output-dir]
 *
 * Or use programmatically:
 *   import { extractTokens, getExtractionScript } from './extract-tokens.js';
 */

import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Browser Extraction Script
// ============================================================================

/**
 * Script that runs in the browser to extract design tokens
 * Returns as a string to avoid transpilation issues
 */
const EXTRACTION_SCRIPT = `
() => {
  const tokens = {
    colors: {
      text: {},
      background: {},
      border: {},
      all: {}
    },
    fonts: {
      families: {},
      weights: {},
      sizes: {}
    },
    spacing: {},
    borderRadius: {},
    shadows: {},
    transitions: {}
  };

  // Helper to normalize colors
  function normalizeColor(color) {
    if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') {
      return null;
    }
    return color;
  }

  // Helper to count occurrences
  function countOccurrence(obj, key, value) {
    if (!key || key === 'none' || key === 'normal' || key === '0px') return;
    if (!obj[key]) {
      obj[key] = { count: 0, example: value || key };
    }
    obj[key].count++;
  }

  // Get all elements
  const elements = document.querySelectorAll('*');

  elements.forEach(el => {
    try {
      const style = window.getComputedStyle(el);

      // Colors
      const textColor = normalizeColor(style.color);
      const bgColor = normalizeColor(style.backgroundColor);
      const borderColor = normalizeColor(style.borderColor);

      if (textColor) {
        countOccurrence(tokens.colors.text, textColor);
        countOccurrence(tokens.colors.all, textColor, 'text');
      }
      if (bgColor) {
        countOccurrence(tokens.colors.background, bgColor);
        countOccurrence(tokens.colors.all, bgColor, 'background');
      }
      if (borderColor && borderColor !== textColor) {
        countOccurrence(tokens.colors.border, borderColor);
        countOccurrence(tokens.colors.all, borderColor, 'border');
      }

      // Fonts
      const fontFamily = style.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
      const fontWeight = style.fontWeight;
      const fontSize = style.fontSize;

      countOccurrence(tokens.fonts.families, fontFamily);
      countOccurrence(tokens.fonts.weights, fontWeight);
      countOccurrence(tokens.fonts.sizes, fontSize);

      // Spacing (margin and padding)
      const margin = style.margin;
      const padding = style.padding;
      const gap = style.gap;

      if (margin && margin !== '0px') {
        const values = margin.split(' ').filter(v => v && v !== '0px');
        values.forEach(v => countOccurrence(tokens.spacing, v));
      }
      if (padding && padding !== '0px') {
        const values = padding.split(' ').filter(v => v && v !== '0px');
        values.forEach(v => countOccurrence(tokens.spacing, v));
      }
      if (gap && gap !== 'normal' && gap !== '0px') {
        countOccurrence(tokens.spacing, gap);
      }

      // Border radius
      const borderRadius = style.borderRadius;
      if (borderRadius && borderRadius !== '0px') {
        countOccurrence(tokens.borderRadius, borderRadius);
      }

      // Box shadow
      const boxShadow = style.boxShadow;
      if (boxShadow && boxShadow !== 'none') {
        countOccurrence(tokens.shadows, boxShadow);
      }

      // Transitions
      const transition = style.transition;
      if (transition && transition !== 'all 0s ease 0s' && transition !== 'none') {
        // Extract just the duration and property
        const simplified = transition.replace(/,\\s*/g, ', ').substring(0, 100);
        countOccurrence(tokens.transitions, simplified);
      }
    } catch (e) {
      // Skip problematic elements
    }
  });

  // Sort by count and limit results
  function sortAndLimit(obj, limit = 20) {
    return Object.entries(obj)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});
  }

  return {
    colors: {
      text: sortAndLimit(tokens.colors.text, 15),
      background: sortAndLimit(tokens.colors.background, 15),
      border: sortAndLimit(tokens.colors.border, 10),
    },
    fonts: {
      families: sortAndLimit(tokens.fonts.families, 10),
      weights: sortAndLimit(tokens.fonts.weights, 10),
      sizes: sortAndLimit(tokens.fonts.sizes, 15),
    },
    spacing: sortAndLimit(tokens.spacing, 20),
    borderRadius: sortAndLimit(tokens.borderRadius, 10),
    shadows: sortAndLimit(tokens.shadows, 10),
    transitions: sortAndLimit(tokens.transitions, 10),
  };
}
`;

// ============================================================================
// Token Processing
// ============================================================================

/**
 * Process raw tokens into a cleaner format
 */
function processTokens(rawTokens) {
  // Extract just the values as arrays, sorted by frequency
  const processed = {
    palette: [],
    typography: {
      families: [],
      weights: [],
      sizes: [],
    },
    spacing: [],
    radii: [],
    shadows: [],
  };

  // Build color palette
  const allColors = new Map();

  // Combine all color categories
  for (const [color, data] of Object.entries(rawTokens.colors.text || {})) {
    allColors.set(color, (allColors.get(color) || 0) + data.count);
  }
  for (const [color, data] of Object.entries(rawTokens.colors.background || {})) {
    allColors.set(color, (allColors.get(color) || 0) + data.count);
  }
  for (const [color, data] of Object.entries(rawTokens.colors.border || {})) {
    allColors.set(color, (allColors.get(color) || 0) + data.count);
  }

  // Sort and deduplicate colors
  processed.palette = Array.from(allColors.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([color]) => color);

  // Typography
  processed.typography.families = Object.keys(rawTokens.fonts.families || {});
  processed.typography.weights = Object.keys(rawTokens.fonts.weights || {})
    .map(w => parseInt(w))
    .filter(w => !isNaN(w))
    .sort((a, b) => a - b);
  processed.typography.sizes = Object.keys(rawTokens.fonts.sizes || {})
    .sort((a, b) => parseFloat(a) - parseFloat(b));

  // Spacing
  processed.spacing = Object.keys(rawTokens.spacing || {})
    .filter(s => s.endsWith('px') || s.endsWith('rem') || s.endsWith('em'))
    .sort((a, b) => parseFloat(a) - parseFloat(b));

  // Border radii
  processed.radii = Object.keys(rawTokens.borderRadius || {})
    .sort((a, b) => parseFloat(a) - parseFloat(b));

  // Shadows (take top 5)
  processed.shadows = Object.keys(rawTokens.shadows || {}).slice(0, 5);

  return processed;
}

/**
 * Generate CSS custom properties from tokens
 */
function generateCSSVariables(tokens) {
  const lines = ['/* Design Tokens - Auto-extracted */\n:root {'];

  // Colors
  tokens.palette.forEach((color, i) => {
    lines.push(`  --color-${i + 1}: ${color};`);
  });

  // Font families
  tokens.typography.families.forEach((family, i) => {
    const name = family.toLowerCase().replace(/\s+/g, '-');
    lines.push(`  --font-${name}: ${family};`);
  });

  // Font sizes
  tokens.typography.sizes.forEach((size, i) => {
    lines.push(`  --text-${i + 1}: ${size};`);
  });

  // Spacing
  tokens.spacing.slice(0, 10).forEach((space, i) => {
    lines.push(`  --space-${i + 1}: ${space};`);
  });

  // Border radii
  tokens.radii.forEach((radius, i) => {
    lines.push(`  --radius-${i + 1}: ${radius};`);
  });

  lines.push('}');
  return lines.join('\n');
}

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract design tokens from a URL
 *
 * @param {string} url - URL to extract tokens from
 * @param {Object} options - Options
 * @returns {Object} - Extracted tokens
 */
async function extractTokens(url, options = {}) {
  const { headless = true, viewport = { width: 1440, height: 900 } } = options;

  console.log(`Extracting design tokens from: ${url}`);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for any animations to settle
    await page.waitForTimeout(1000);

    // Run extraction script
    const rawTokens = await page.evaluate(EXTRACTION_SCRIPT);

    // Process into cleaner format
    const tokens = processTokens(rawTokens);

    return {
      url,
      extractedAt: new Date().toISOString(),
      raw: rawTokens,
      processed: tokens,
      css: generateCSSVariables(tokens),
    };
  } finally {
    await browser.close();
  }
}

/**
 * Get the extraction script for running in an existing Playwright context
 */
function getExtractionScript() {
  return EXTRACTION_SCRIPT;
}

/**
 * Save tokens to file
 */
async function saveTokens(tokens, outputDir, filename = 'design-tokens.json') {
  await fs.mkdir(outputDir, { recursive: true });

  // Save JSON
  const jsonPath = path.join(outputDir, filename);
  await fs.writeFile(jsonPath, JSON.stringify(tokens, null, 2));

  // Save CSS variables
  const cssPath = path.join(outputDir, 'tokens.css');
  await fs.writeFile(cssPath, tokens.css);

  return { jsonPath, cssPath };
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Design Token Extractor

Extracts colors, fonts, spacing, and other design tokens from a webpage.

Usage:
  node tools/extract-tokens.js <url> [output-dir]

Options:
  --no-headless     Run browser in visible mode
  --help, -h        Show this help

Examples:
  node tools/extract-tokens.js https://linear.app
  node tools/extract-tokens.js https://spotify.com ./output/spotify
  node tools/extract-tokens.js https://stripe.com ./tokens --no-headless

Output:
  - design-tokens.json  Complete token data
  - tokens.css          CSS custom properties
`);
    process.exit(0);
  }

  const url = args[0];
  const outputDir = args[1] ? path.resolve(args[1]) : path.resolve('./output');
  const headless = !args.includes('--no-headless');

  try {
    // Validate URL
    new URL(url);
  } catch {
    console.error(`Error: Invalid URL: ${url}`);
    process.exit(1);
  }

  try {
    const tokens = await extractTokens(url, { headless });

    // Save to files
    const { jsonPath, cssPath } = await saveTokens(tokens, outputDir);

    console.log('\n=== Extraction Complete ===\n');
    console.log(`Colors found: ${tokens.processed.palette.length}`);
    console.log(`Font families: ${tokens.processed.typography.families.length}`);
    console.log(`Font sizes: ${tokens.processed.typography.sizes.length}`);
    console.log(`Spacing values: ${tokens.processed.spacing.length}`);
    console.log(`Border radii: ${tokens.processed.radii.length}`);
    console.log(`\nSaved to:`);
    console.log(`  ${jsonPath}`);
    console.log(`  ${cssPath}`);

    // Print color palette preview
    console.log('\nColor Palette (top 10):');
    tokens.processed.palette.slice(0, 10).forEach((color, i) => {
      console.log(`  ${i + 1}. ${color}`);
    });

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1].endsWith('extract-tokens.js')) {
  main();
}

// Export for use as module
export {
  extractTokens,
  getExtractionScript,
  processTokens,
  generateCSSVariables,
  saveTokens,
  EXTRACTION_SCRIPT,
};
