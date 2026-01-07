#!/usr/bin/env node

/**
 * VISUAL FEEDBACK CLONING SYSTEM
 *
 * Clones websites by iteratively comparing rendered output to original screenshots.
 * Uses AI vision to identify differences and refine HTML/CSS until pixel-perfect match.
 *
 * Architecture:
 * 1. Section Splitter - Identifies sections on the target page
 * 2. Section Cloner - Iteratively clones each section with visual feedback
 * 3. Assembler - Combines all cloned sections into final output
 */

import Anthropic from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const anthropic = new Anthropic();

// Configuration
const CONFIG = {
  maxIterations: 5,        // Max refinement iterations per section
  outputDir: './output',
  screenshotDir: './screenshots',
  viewportWidth: 1440,
  viewportHeight: 900,
};

// ============================================================================
// UTILITIES
// ============================================================================

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function imageToBase64(imagePath) {
  const buffer = await fs.readFile(imagePath);
  return buffer.toString('base64');
}

async function saveScreenshot(page, filename) {
  await ensureDir(CONFIG.screenshotDir);
  const filepath = path.join(CONFIG.screenshotDir, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  return filepath;
}

// ============================================================================
// SECTION SPLITTER
// ============================================================================

async function identifySections(page, targetUrl) {
  console.log('\n=== SECTION SPLITTER ===');
  console.log(`Analyzing page structure: ${targetUrl}`);

  // Take full page screenshot
  await ensureDir(CONFIG.screenshotDir);
  const fullPagePath = path.join(CONFIG.screenshotDir, 'full-page.png');
  await page.screenshot({ path: fullPagePath, fullPage: true });

  const imageBase64 = await imageToBase64(fullPagePath);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: imageBase64
          }
        },
        {
          type: 'text',
          text: `Analyze this landing page and identify the major sections. For each section, provide:
1. A short name (e.g., "header", "hero", "features", "testimonials", "cta", "footer")
2. A brief description of what's in the section
3. The approximate Y position (in pixels from top) where the section starts
4. The approximate height of the section in pixels

Return your response as a JSON array:
[
  {
    "name": "section-name",
    "description": "Brief description",
    "yStart": 0,
    "height": 500
  }
]

Be thorough - identify ALL distinct sections on the page. Focus on major content blocks.
Return ONLY the JSON array, no other text.`
        }
      ]
    }]
  });

  try {
    const jsonMatch = response.content[0].text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const sections = JSON.parse(jsonMatch[0]);
      console.log(`Found ${sections.length} sections:`);
      sections.forEach((s, i) => console.log(`  ${i + 1}. ${s.name}: ${s.description}`));
      return sections;
    }
  } catch (e) {
    console.error('Failed to parse sections:', e);
  }

  // Fallback: return basic sections
  return [
    { name: 'header', description: 'Navigation header', yStart: 0, height: 80 },
    { name: 'hero', description: 'Hero section', yStart: 80, height: 700 }
  ];
}

async function captureSectionScreenshot(page, section, filename) {
  await ensureDir(CONFIG.screenshotDir);
  const filepath = path.join(CONFIG.screenshotDir, filename);

  // Scroll to section and capture
  await page.evaluate((y) => window.scrollTo(0, y), section.yStart);
  await page.waitForTimeout(500); // Wait for any animations

  // Capture the visible viewport which should show the section
  await page.screenshot({
    path: filepath,
    clip: {
      x: 0,
      y: 0,
      width: CONFIG.viewportWidth,
      height: Math.min(section.height, CONFIG.viewportHeight)
    }
  });

  return filepath;
}

// ============================================================================
// SECTION CLONER
// ============================================================================

async function generateInitialAttempt(sectionScreenshotPath, sectionName, sectionDescription) {
  console.log(`\n  Generating initial HTML/CSS for ${sectionName}...`);

  const imageBase64 = await imageToBase64(sectionScreenshotPath);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: imageBase64
          }
        },
        {
          type: 'text',
          text: `Create pixel-perfect HTML and CSS to replicate this ${sectionName} section.

Section description: ${sectionDescription}

Requirements:
1. Match the EXACT visual appearance - colors, fonts, spacing, layout
2. Use modern CSS (flexbox/grid) for layout
3. Use Inter font from Google Fonts
4. All measurements should be precise (use px for exact values)
5. Include any SVG icons inline
6. Use realistic placeholder images if needed (use picsum.photos or placeholder URLs)
7. The HTML should be a complete, self-contained document

Return your response in this exact format:

===HTML===
<!DOCTYPE html>
<html>
...complete HTML with embedded CSS in <style> tag...
</html>
===END===

Return ONLY the HTML between the markers, nothing else before or after.`
        }
      ]
    }]
  });

  const text = response.content[0].text;
  const htmlMatch = text.match(/===HTML===\s*([\s\S]*?)\s*===END===/);

  if (htmlMatch) {
    return htmlMatch[1].trim();
  }

  // Fallback: try to find HTML directly
  const directHtmlMatch = text.match(/<!DOCTYPE html>[\s\S]*<\/html>/i);
  if (directHtmlMatch) {
    return directHtmlMatch[0];
  }

  throw new Error('Failed to extract HTML from response');
}

async function compareScreenshots(originalPath, attemptPath, sectionName, currentHtml) {
  console.log(`  Comparing screenshots for ${sectionName}...`);

  const originalBase64 = await imageToBase64(originalPath);
  const attemptBase64 = await imageToBase64(attemptPath);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Here is the ORIGINAL target design we want to match:'
        },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: originalBase64
          }
        },
        {
          type: 'text',
          text: 'Here is our CURRENT ATTEMPT at replicating it:'
        },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: attemptBase64
          }
        },
        {
          type: 'text',
          text: `Compare these two screenshots and identify ALL visual differences. Be extremely specific and detailed.

For each difference, specify:
1. What element is affected
2. What the difference is (e.g., "font-size is too large", "color is wrong", "spacing is too wide")
3. What the approximate correct value should be

Return your response as JSON:
{
  "isMatch": false,
  "matchPercentage": 75,
  "differences": [
    {
      "element": "element description",
      "issue": "what's wrong",
      "currentValue": "what it is now (estimate)",
      "targetValue": "what it should be (estimate)"
    }
  ]
}

If the screenshots match well enough (95%+ match), set isMatch to true.
Return ONLY the JSON, nothing else.`
        }
      ]
    }]
  });

  try {
    const jsonMatch = response.content[0].text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse comparison:', e);
  }

  return { isMatch: false, matchPercentage: 0, differences: [] };
}

async function refineHtml(currentHtml, differences, originalPath, sectionName) {
  console.log(`  Refining HTML based on ${differences.length} differences...`);

  const originalBase64 = await imageToBase64(originalPath);

  const differencesText = differences.map((d, i) =>
    `${i + 1}. ${d.element}: ${d.issue} (current: ${d.currentValue}, target: ${d.targetValue})`
  ).join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: originalBase64
          }
        },
        {
          type: 'text',
          text: `Here is the target design we're trying to match.

Current HTML that needs fixing:
\`\`\`html
${currentHtml}
\`\`\`

The following differences were identified between our attempt and the target:
${differencesText}

Please fix ALL of these issues in the HTML/CSS. Be precise with values.

Return the COMPLETE fixed HTML (not just the changes) in this format:

===HTML===
<!DOCTYPE html>
<html>
...complete fixed HTML...
</html>
===END===

Return ONLY the HTML between the markers.`
        }
      ]
    }]
  });

  const text = response.content[0].text;
  const htmlMatch = text.match(/===HTML===\s*([\s\S]*?)\s*===END===/);

  if (htmlMatch) {
    return htmlMatch[1].trim();
  }

  const directHtmlMatch = text.match(/<!DOCTYPE html>[\s\S]*<\/html>/i);
  if (directHtmlMatch) {
    return directHtmlMatch[0];
  }

  return currentHtml; // Return unchanged if parsing failed
}

async function cloneSection(browser, originalPage, section, sectionIndex) {
  console.log(`\n=== CLONING SECTION: ${section.name} ===`);

  // Capture original section screenshot
  const originalScreenshotPath = await captureSectionScreenshot(
    originalPage,
    section,
    `original-${section.name}.png`
  );
  console.log(`  Captured original: ${originalScreenshotPath}`);

  // Generate initial attempt
  let currentHtml = await generateInitialAttempt(
    originalScreenshotPath,
    section.name,
    section.description
  );

  // Create a new page for rendering our attempts
  const renderPage = await browser.newPage();
  await renderPage.setViewportSize({
    width: CONFIG.viewportWidth,
    height: CONFIG.viewportHeight
  });

  // Iterative refinement loop
  for (let iteration = 1; iteration <= CONFIG.maxIterations; iteration++) {
    console.log(`\n  --- Iteration ${iteration}/${CONFIG.maxIterations} ---`);

    // Save current HTML to temp file
    const tempHtmlPath = path.join(CONFIG.screenshotDir, `temp-${section.name}.html`);
    await fs.writeFile(tempHtmlPath, currentHtml);

    // Render and screenshot our attempt
    await renderPage.goto(`file://${path.resolve(tempHtmlPath)}`);
    await renderPage.waitForTimeout(500);

    const attemptScreenshotPath = path.join(
      CONFIG.screenshotDir,
      `attempt-${section.name}-v${iteration}.png`
    );
    await renderPage.screenshot({ path: attemptScreenshotPath });
    console.log(`  Rendered attempt: ${attemptScreenshotPath}`);

    // Compare screenshots
    const comparison = await compareScreenshots(
      originalScreenshotPath,
      attemptScreenshotPath,
      section.name,
      currentHtml
    );

    console.log(`  Match: ${comparison.matchPercentage}%`);

    if (comparison.isMatch) {
      console.log(`  SUCCESS! Section ${section.name} cloned successfully.`);
      await renderPage.close();
      return currentHtml;
    }

    if (comparison.differences.length === 0) {
      console.log(`  No differences found but not marked as match. Continuing...`);
      break;
    }

    console.log(`  Found ${comparison.differences.length} differences to fix:`);
    comparison.differences.slice(0, 5).forEach((d, i) => {
      console.log(`    ${i + 1}. ${d.element}: ${d.issue}`);
    });

    // Refine HTML based on differences
    currentHtml = await refineHtml(
      currentHtml,
      comparison.differences,
      originalScreenshotPath,
      section.name
    );
  }

  console.log(`  Reached max iterations for ${section.name}`);
  await renderPage.close();
  return currentHtml;
}

// ============================================================================
// ASSEMBLER
// ============================================================================

async function assembleClonedSections(clonedSections) {
  console.log('\n=== ASSEMBLING FINAL OUTPUT ===');

  // Extract styles and body content from each section
  const allStyles = [];
  const allBodyContent = [];

  for (const { name, html } of clonedSections) {
    // Extract <style> content
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
    if (styleMatch) {
      styleMatch.forEach(style => {
        const content = style.replace(/<\/?style[^>]*>/gi, '');
        allStyles.push(`/* === ${name} === */\n${content}`);
      });
    }

    // Extract <body> content
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      allBodyContent.push(`<!-- === ${name} === -->\n${bodyMatch[1].trim()}`);
    }
  }

  // Combine into final HTML
  const finalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cloned Page</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    /* Reset */
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

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    button {
      font: inherit;
      cursor: pointer;
      border: none;
      background: none;
    }

    img {
      max-width: 100%;
      height: auto;
    }

${allStyles.join('\n\n')}
  </style>
</head>
<body>
${allBodyContent.join('\n\n')}
</body>
</html>`;

  return finalHtml;
}

// ============================================================================
// MAIN
// ============================================================================

async function clonePage(targetUrl) {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           VISUAL FEEDBACK CLONING SYSTEM                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`\nTarget URL: ${targetUrl}`);
  console.log(`Max iterations per section: ${CONFIG.maxIterations}`);

  await ensureDir(CONFIG.outputDir);
  await ensureDir(CONFIG.screenshotDir);

  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({
    width: CONFIG.viewportWidth,
    height: CONFIG.viewportHeight
  });

  try {
    // Navigate to target
    console.log(`\nNavigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000); // Wait for any animations and dynamic content

    // Identify sections
    const sections = await identifySections(page, targetUrl);

    // Clone each section
    const clonedSections = [];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const clonedHtml = await cloneSection(browser, page, section, i);
      clonedSections.push({ name: section.name, html: clonedHtml });

      // Save individual section
      const sectionPath = path.join(CONFIG.outputDir, `section-${section.name}.html`);
      await fs.writeFile(sectionPath, clonedHtml);
      console.log(`  Saved: ${sectionPath}`);
    }

    // Assemble final output
    const finalHtml = await assembleClonedSections(clonedSections);
    const finalPath = path.join(CONFIG.outputDir, 'cloned-page.html');
    await fs.writeFile(finalPath, finalHtml);

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    CLONING COMPLETE!                          ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log(`\nFinal output: ${finalPath}`);
    console.log(`Screenshots: ${CONFIG.screenshotDir}/`);
    console.log(`Individual sections: ${CONFIG.outputDir}/section-*.html`);

    return finalPath;

  } finally {
    await browser.close();
  }
}

// CLI Entry Point
const targetUrl = process.argv[2] || 'https://linear.app';

clonePage(targetUrl).catch(console.error);
