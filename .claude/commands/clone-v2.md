---
name: clone-v2
description: Clone a website with token-first architecture for pixel-perfect reproduction
arguments:
  - name: url
    description: The URL to clone
    required: true
---

# Clone Website Command v2

Clone the website at **$ARGUMENTS** with improved token-first architecture for pixel-perfect reproduction.

## Key Improvements Over v1

| Feature | v1 | v2 |
|---------|-----|-----|
| Token extraction | After screenshots | **Before screenshots (Phase 0)** |
| Token usage | Guessed from screenshots | **Exact values passed to all agents** |
| Fixed elements | Visible in all screenshots | **Hidden during section capture** |
| Lazy content | May miss content | **Full page scroll triggers loading** |
| Section detection | Single selector strategy | **Heading-based + fallbacks** |
| CSS output | Hardcoded values | **CSS variables mapped to tokens** |

## Architecture

```
PHASE 0: Token Extraction (FIRST!)
├── Navigate to URL
├── Extract comprehensive design tokens from LIVE page
└── Store tokens for ALL subsequent phases

PHASE 1: Lazy Load + Section Detection
├── Scroll entire page to trigger lazy loading
├── Wait for network idle
├── Detect sections using heading-based strategy
└── Save manifest with section data

PHASE 2: Screenshot Capture
├── Hide fixed/sticky elements
├── Capture each section screenshot
├── Restore fixed elements
└── Save all screenshots

PHASE 3: Parallel HTML Generation
├── Pass EXACT tokens to each agent
├── Each agent generates HTML with CSS variables
├── Each agent writes output file
└── Exit (NO iteration)

PHASE 4: Assembly + CSS Variable Injection
├── Generate CSS variables block from tokens
├── Run assembler with variables injected
└── Verify assembled.html created

PHASE 5: Templatize (Generic Copy)
├── Spawn parallel agents to rewrite text
├── Each agent preserves CSS variables
└── Assemble template version

PHASE 6: Final Assembly + Validation
├── Extract design tokens to JSON
├── Generate theme.css
├── Validate all files present
└── Open result and report
```

---

## Phase 0: Token Extraction (CRITICAL - DO THIS FIRST)

Navigate to URL and extract ALL design tokens from the live page before any screenshots.

### 0.1: Navigate

```
mcp__playwright__browser_navigate({ url: "$ARGUMENTS" })
```

### 0.2: Create Output Directory (Clean Start)

```bash
# Create directories
mkdir -p output/<domain>-<timestamp>/screenshots/

# CRITICAL: Remove any existing HTML files to prevent duplicates from previous runs
rm -f output/<domain>-<timestamp>/*.html
```

**Why clean?** If a previous clone run left HTML files with different names (e.g., different section detection), the assembler will glob ALL `*.html` files and combine them, causing duplicate content.

### 0.3: Extract Comprehensive Design Tokens

Run this via `mcp__playwright__browser_evaluate`:

```javascript
() => {
  const getStyle = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el) : null;
  };

  const getAllColors = () => {
    const colors = new Set();
    document.querySelectorAll('*').forEach(el => {
      const style = getComputedStyle(el);
      colors.add(style.color);
      colors.add(style.backgroundColor);
      colors.add(style.borderColor);
    });
    return [...colors].filter(c => c && c !== 'rgba(0, 0, 0, 0)');
  };

  const body = getComputedStyle(document.body);
  const html = getComputedStyle(document.documentElement);
  const h1 = getStyle('h1');
  const h2 = getStyle('h2');
  const h3 = getStyle('h3');
  const h4 = getStyle('h4');
  const p = getStyle('p');
  const small = getStyle('small, .text-sm, .text-muted, [class*="muted"]');
  const btn = getStyle('button, [class*="btn"], a[class*="button"], [class*="cta"]');
  const btnSecondary = getStyle('[class*="secondary"], [class*="outline"]');
  const link = getStyle('a:not([class*="btn"]):not([class*="button"])');
  const nav = getStyle('nav, header, [class*="nav"], [class*="header"]');
  const card = getStyle('[class*="card"], [class*="panel"], [class*="box"]');
  const input = getStyle('input, textarea, [class*="input"]');
  const section = getStyle('section, [class*="section"]');

  // Determine theme type
  const bgColor = body.backgroundColor || html.backgroundColor || 'rgb(255,255,255)';
  const bgRgb = bgColor.match(/\d+/g)?.map(Number) || [255, 255, 255];
  const luminance = (0.299 * bgRgb[0] + 0.587 * bgRgb[1] + 0.114 * bgRgb[2]) / 255;
  const themeType = luminance < 0.5 ? 'dark' : 'light';

  return {
    themeType,

    colors: {
      // Page colors
      pageBackground: body.backgroundColor || html.backgroundColor,
      pageForeground: body.color,

      // Text colors
      textPrimary: body.color,
      textSecondary: small?.color || (themeType === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'),
      textMuted: small?.color || (themeType === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'),
      textInverse: themeType === 'dark' ? '#000000' : '#ffffff',

      // Heading colors
      headingPrimary: h1?.color || body.color,
      headingSecondary: h2?.color || h1?.color || body.color,

      // Interactive colors
      accent: btn?.backgroundColor || '#6366f1',
      accentHover: btn?.backgroundColor ? adjustColor(btn.backgroundColor, themeType === 'dark' ? 10 : -10) : '#4f46e5',
      accentForeground: btn?.color || '#ffffff',

      // Secondary button
      secondaryBg: btnSecondary?.backgroundColor || 'transparent',
      secondaryBorder: btnSecondary?.borderColor || btn?.backgroundColor || '#6366f1',
      secondaryForeground: btnSecondary?.color || btn?.backgroundColor || '#6366f1',

      // Link color
      link: link?.color || btn?.backgroundColor || '#6366f1',

      // Surface colors
      cardBackground: card?.backgroundColor || (themeType === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'),
      navBackground: nav?.backgroundColor || body.backgroundColor,
      inputBackground: input?.backgroundColor || (themeType === 'dark' ? 'rgba(255,255,255,0.05)' : '#ffffff'),
      sectionAltBackground: section?.backgroundColor || body.backgroundColor,

      // Border colors
      borderDefault: card?.borderColor || input?.borderColor || (themeType === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
      borderLight: themeType === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
      borderFocus: btn?.backgroundColor || '#6366f1',

      // Status colors
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6'
    },

    typography: {
      // Font families
      fontPrimary: body.fontFamily,
      fontHeading: h1?.fontFamily || body.fontFamily,
      fontMono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',

      // Font sizes
      h1Size: h1?.fontSize || '48px',
      h2Size: h2?.fontSize || '36px',
      h3Size: h3?.fontSize || '28px',
      h4Size: h4?.fontSize || '22px',
      h5Size: '18px',
      h6Size: '16px',
      bodySize: body.fontSize || '16px',
      bodySmallSize: small?.fontSize || '14px',
      smallSize: '13px',
      xsmallSize: '12px',
      xxsmallSize: '11px',

      // Font weights
      h1Weight: h1?.fontWeight || '700',
      h2Weight: h2?.fontWeight || '700',
      h3Weight: h3?.fontWeight || '600',
      h4Weight: h4?.fontWeight || '600',
      bodyWeight: body.fontWeight || '400',
      boldWeight: '700',
      semiboldWeight: '600',
      mediumWeight: '500',

      // Line heights
      headingLineHeight: h1?.lineHeight || '1.1',
      bodyLineHeight: body.lineHeight || '1.6',
      tightLineHeight: '1.2',

      // Letter spacing
      headingLetterSpacing: h1?.letterSpacing || '-0.02em',
      bodyLetterSpacing: body.letterSpacing || '0',
      wideLetterSpacing: '0.05em'
    },

    spacing: {
      // Base spacing scale
      xxs: '4px',
      xs: '8px',
      sm: '12px',
      md: '16px',
      lg: '24px',
      xl: '32px',
      xxl: '48px',
      xxxl: '64px',

      // Component spacing
      sectionPaddingY: section?.paddingTop || '80px',
      sectionPaddingX: section?.paddingLeft || '24px',
      cardPadding: card?.padding || '24px',
      inputPaddingX: input?.paddingLeft || '16px',
      inputPaddingY: input?.paddingTop || '12px',
      buttonPaddingX: btn?.paddingLeft || '24px',
      buttonPaddingY: btn?.paddingTop || '12px',
      navHeight: nav?.height || '64px',

      // Gap values
      gridGap: '24px',
      stackGap: '16px',
      inlineGap: '8px'
    },

    borders: {
      // Border radius
      radiusNone: '0',
      radiusXs: '2px',
      radiusSm: '4px',
      radiusMd: card?.borderRadius || '8px',
      radiusLg: '12px',
      radiusXl: '16px',
      radiusXxl: '24px',
      radiusFull: '9999px',

      // Specific component radius
      buttonRadius: btn?.borderRadius || '8px',
      inputRadius: input?.borderRadius || '6px',
      cardRadius: card?.borderRadius || '12px',

      // Border widths
      widthThin: '1px',
      widthMedium: '2px',
      widthThick: '4px'
    },

    shadows: {
      // Shadow scale (opacity adjusted for theme)
      none: 'none',
      xs: themeType === 'dark'
        ? '0 1px 2px rgba(0,0,0,0.3)'
        : '0 1px 2px rgba(0,0,0,0.05)',
      sm: themeType === 'dark'
        ? '0 2px 4px rgba(0,0,0,0.4)'
        : '0 1px 3px rgba(0,0,0,0.1)',
      md: themeType === 'dark'
        ? '0 4px 12px rgba(0,0,0,0.5)'
        : '0 4px 12px rgba(0,0,0,0.15)',
      lg: themeType === 'dark'
        ? '0 8px 24px rgba(0,0,0,0.6)'
        : '0 8px 24px rgba(0,0,0,0.2)',
      xl: themeType === 'dark'
        ? '0 16px 48px rgba(0,0,0,0.7)'
        : '0 16px 48px rgba(0,0,0,0.25)',

      // Component shadows
      cardShadow: card?.boxShadow || 'none',
      buttonShadow: btn?.boxShadow || 'none',
      navShadow: nav?.boxShadow || 'none'
    },

    transitions: {
      fast: '150ms',
      normal: '250ms',
      slow: '400ms',
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      easingIn: 'cubic-bezier(0.4, 0, 1, 1)',
      easingOut: 'cubic-bezier(0, 0, 0.2, 1)'
    },

    zIndex: {
      dropdown: '100',
      sticky: '200',
      fixed: '300',
      modal: '400',
      popover: '500',
      tooltip: '600'
    },

    breakpoints: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      xxl: '1536px'
    },

    // Raw extracted values for reference
    rawColors: getAllColors().slice(0, 20)
  };

  function adjustColor(color, amount) {
    const rgb = color.match(/\d+/g)?.map(Number);
    if (!rgb) return color;
    const adjusted = rgb.slice(0, 3).map(c => Math.max(0, Math.min(255, c + amount)));
    return `rgb(${adjusted.join(', ')})`;
  }
}
```

### 0.4: Store Tokens

Save tokens to `manifest.json` for use in all subsequent phases. These exact values will be passed to every sub-agent.

---

## Phase 1: Lazy Load + Section Detection

### 1.1: Trigger Lazy Loading

Before detecting sections, scroll through the entire page to trigger lazy-loaded content:

```javascript
// Run via mcp__playwright__browser_run_code
async (page) => {
  // Get full page height
  const height = await page.evaluate(() => document.body.scrollHeight);

  // Scroll through page in increments
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(150);
  }

  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));

  // Wait for any final content to load
  await page.waitForLoadState('networkidle');

  return { scrolledHeight: height, complete: true };
}
```

### 1.2: Enhanced Section Detection

Use heading positions as primary markers with fallbacks for flat DOM structures:

```javascript
// Run via mcp__playwright__browser_evaluate
() => {
  const sections = [];
  const seenRanges = []; // Track vertical ranges to prevent overlap

  // Helper to check if a range overlaps with existing sections
  const overlaps = (top, bottom) => {
    return seenRanges.some(range => {
      const overlap = Math.max(0, Math.min(bottom, range.bottom) - Math.max(top, range.top));
      const minHeight = Math.min(bottom - top, range.bottom - range.top);
      return overlap > minHeight * 0.3; // More than 30% overlap
    });
  };

  // STRATEGY 1: Find major headings and their parent sections
  const headings = document.querySelectorAll('h1, h2');
  headings.forEach((heading, i) => {
    // Walk up to find a suitable container
    let container = heading.parentElement;
    let maxHeight = 0;
    let bestContainer = heading;

    while (container && container !== document.body) {
      const rect = container.getBoundingClientRect();
      // Prefer containers that are wider than half viewport and reasonably tall
      if (rect.width > window.innerWidth * 0.5 && rect.height > 200) {
        if (rect.height > maxHeight) {
          maxHeight = rect.height;
          bestContainer = container;
        }
      }
      container = container.parentElement;
    }

    const rect = bestContainer.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const bottom = top + rect.height;

    if (rect.height >= 150 && !overlaps(top, bottom)) {
      const sectionId = `clone-section-${sections.length}`;
      bestContainer.setAttribute('data-clone-section', sectionId);

      sections.push({
        index: sections.length,
        sectionId,
        selector: `[data-clone-section="${sectionId}"]`,
        top,
        height: rect.height,
        description: heading.textContent?.trim().substring(0, 30).replace(/[^a-zA-Z0-9\s]/g, '').trim().toLowerCase().replace(/\s+/g, '-') || `section-${sections.length}`,
        strategy: 'heading'
      });

      seenRanges.push({ top, bottom });
    }
  });

  // STRATEGY 2: Check for semantic elements not yet captured
  const semanticElements = document.querySelectorAll('header, nav, main, footer, [class*="hero"], [class*="cta"], [role="banner"], [role="main"], [role="contentinfo"]');
  semanticElements.forEach(el => {
    if (el.hasAttribute('data-clone-section')) return;

    const rect = el.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const bottom = top + rect.height;

    if (rect.height >= 100 && rect.width > window.innerWidth * 0.5 && !overlaps(top, bottom)) {
      const sectionId = `clone-section-${sections.length}`;
      el.setAttribute('data-clone-section', sectionId);

      const tagHint = el.tagName.toLowerCase();
      const classHint = el.className?.split?.(' ')?.find(c => c.includes('hero') || c.includes('nav') || c.includes('footer')) || '';

      sections.push({
        index: sections.length,
        sectionId,
        selector: `[data-clone-section="${sectionId}"]`,
        top,
        height: rect.height,
        description: classHint || tagHint || `section-${sections.length}`,
        strategy: 'semantic'
      });

      seenRanges.push({ top, bottom });
    }
  });

  // STRATEGY 3: Large direct children of body/main (fallback for flat structures)
  const mainContainer = document.querySelector('main') || document.body;
  Array.from(mainContainer.children).forEach(el => {
    if (el.hasAttribute('data-clone-section')) return;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;

    const rect = el.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const bottom = top + rect.height;

    if (rect.height >= 200 && rect.width > window.innerWidth * 0.5 && !overlaps(top, bottom)) {
      const sectionId = `clone-section-${sections.length}`;
      el.setAttribute('data-clone-section', sectionId);

      const innerHeading = el.querySelector('h1, h2, h3');
      const description = innerHeading?.textContent?.trim().substring(0, 30).replace(/[^a-zA-Z0-9\s]/g, '').trim().toLowerCase().replace(/\s+/g, '-') || `block-${sections.length}`;

      sections.push({
        index: sections.length,
        sectionId,
        selector: `[data-clone-section="${sectionId}"]`,
        top,
        height: rect.height,
        description,
        strategy: 'fallback'
      });

      seenRanges.push({ top, bottom });
    }
  });

  // Sort by vertical position and re-index
  sections.sort((a, b) => a.top - b.top);
  return sections.slice(0, 15).map((s, i) => ({
    ...s,
    index: i,
    filename: `${String(i).padStart(2, '0')}-${s.description}`
  }));
}
```

### 1.3: Save Manifest

Save manifest.json with sections and tokens:

```json
{
  "url": "<original URL>",
  "timestamp": "<ISO timestamp>",
  "tokens": { /* full tokens from Phase 0 */ },
  "sections": [ /* array from detection */ ]
}
```

---

## Phase 2: Screenshot Capture (with Fixed Element Hiding)

### 2.1: Capture Section 0 (with nav)

First section is captured WITH fixed elements visible. Use **element screenshot** to capture ONLY the section element (no overlap):

```javascript
// Take ELEMENT screenshot (not viewport) using Playwright native API
mcp__playwright__browser_run_code({
  code: `async (page) => {
    const el = await page.$('[data-clone-section="clone-section-0"]');
    if (el) {
      await el.screenshot({
        path: 'output/<domain>-<timestamp>/screenshots/00-<description>.png'
      });
      return { success: true };
    }
    return { success: false, error: 'Element not found' };
  }`
})
```

**Why element screenshots?** Viewport screenshots cause overlap - adjacent section content bleeds into the capture. Element screenshots clip precisely to the section bounds.

### 2.2: Hide Fixed Elements

Before capturing sections 1+, hide all fixed/sticky elements:

```javascript
// Run via mcp__playwright__browser_evaluate
() => {
  // Find and hide fixed/sticky elements
  const fixedSelectors = [
    'nav',
    'header',
    '[style*="position: fixed"]',
    '[style*="position:fixed"]',
    '[style*="position: sticky"]',
    '[style*="position:sticky"]',
    '[class*="nav"]',
    '[class*="header"]',
    '[class*="fixed"]',
    '[class*="sticky"]'
  ];

  const elements = document.querySelectorAll(fixedSelectors.join(', '));
  let hiddenCount = 0;

  elements.forEach(el => {
    const style = getComputedStyle(el);
    if (style.position === 'fixed' || style.position === 'sticky') {
      el.setAttribute('data-clone-hidden', 'true');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      hiddenCount++;
    }
  });

  return { hiddenCount };
}
```

### 2.3: Capture Remaining Sections

For each section index > 0, use **element screenshot** (not viewport):

```javascript
// Take ELEMENT screenshot using Playwright native API
mcp__playwright__browser_run_code({
  code: `async (page) => {
    const el = await page.$('[data-clone-section="clone-section-${index}"]');
    if (el) {
      await el.screenshot({
        path: 'output/<domain>-<timestamp>/screenshots/${String(index).padStart(2, '0')}-${description}.png'
      });
      return { success: true, index: ${index} };
    }
    return { success: false, error: 'Element not found' };
  }`
})
```

**CRITICAL:** Element screenshots capture ONLY that section's DOM element. No scrolling needed, no overlap with adjacent sections.

### 2.4: Restore Fixed Elements

After all screenshots captured:

```javascript
// Run via mcp__playwright__browser_evaluate
() => {
  document.querySelectorAll('[data-clone-hidden]').forEach(el => {
    el.style.removeProperty('visibility');
    el.style.removeProperty('pointer-events');
    el.removeAttribute('data-clone-hidden');
  });
  return { restored: true };
}
```

---

## Phase 3: Parallel HTML Generation (with Tokens)

Spawn ALL section agents in a SINGLE message using multiple Task tool calls.

### Structured Agent Prompt Template

Each agent receives this structured prompt with EXACT tokens:

```
=== WEBSITE SECTION CLONING TASK ===

You are cloning section ${index} of a website. Generate pixel-perfect HTML using CSS variables.

== INPUT FILES ==
Screenshot: <output_dir>/screenshots/${filename}.png
Output to:  <output_dir>/${filename}.html

== DESIGN TOKENS (USE THESE EXACT VALUES) ==

COLORS:
- Page Background: ${tokens.colors.pageBackground}
- Text Primary: ${tokens.colors.textPrimary}
- Text Secondary: ${tokens.colors.textSecondary}
- Text Muted: ${tokens.colors.textMuted}
- Heading Color: ${tokens.colors.headingPrimary}
- Accent/Button: ${tokens.colors.accent}
- Accent Foreground: ${tokens.colors.accentForeground}
- Card Background: ${tokens.colors.cardBackground}
- Border Color: ${tokens.colors.borderDefault}
- Link Color: ${tokens.colors.link}

TYPOGRAPHY:
- Primary Font: ${tokens.typography.fontPrimary}
- Heading Font: ${tokens.typography.fontHeading}
- H1 Size: ${tokens.typography.h1Size}
- H2 Size: ${tokens.typography.h2Size}
- H3 Size: ${tokens.typography.h3Size}
- Body Size: ${tokens.typography.bodySize}
- Small Size: ${tokens.typography.bodySmallSize}
- Heading Weight: ${tokens.typography.h1Weight}
- Body Weight: ${tokens.typography.bodyWeight}
- Heading Line Height: ${tokens.typography.headingLineHeight}
- Body Line Height: ${tokens.typography.bodyLineHeight}
- Heading Letter Spacing: ${tokens.typography.headingLetterSpacing}

SPACING:
- Section Padding Y: ${tokens.spacing.sectionPaddingY}
- Section Padding X: ${tokens.spacing.sectionPaddingX}
- Card Padding: ${tokens.spacing.cardPadding}
- Grid Gap: ${tokens.spacing.gridGap}
- Stack Gap: ${tokens.spacing.stackGap}

BORDERS:
- Button Radius: ${tokens.borders.buttonRadius}
- Card Radius: ${tokens.borders.cardRadius}
- Input Radius: ${tokens.borders.inputRadius}

SHADOWS:
- Card Shadow: ${tokens.shadows.cardShadow}
- Button Shadow: ${tokens.shadows.buttonShadow}

THEME TYPE: ${tokens.themeType}

== SECTION CONTEXT ==
Section Index: ${index} (${index === 0 ? 'FIRST SECTION - include nav bar' : 'NOT first section - do NOT include nav bar'})
Section Description: ${description}
Previous Section: ${prevDescription || 'none (this is first)'}
Next Section: ${nextDescription || 'none (this is last)'}

== YOUR TASK ==
1. Read the screenshot using the Read tool
2. Generate HTML that matches the screenshot EXACTLY
3. Use CSS variables (defined below) instead of hardcoding values
4. Write to the output file
5. Exit immediately

== CSS VARIABLES BLOCK (include at top of <style>) ==
<style>
:root {
  /* Colors */
  --color-background: ${tokens.colors.pageBackground};
  --color-foreground: ${tokens.colors.textPrimary};
  --color-text-primary: ${tokens.colors.textPrimary};
  --color-text-secondary: ${tokens.colors.textSecondary};
  --color-text-muted: ${tokens.colors.textMuted};
  --color-heading: ${tokens.colors.headingPrimary};
  --color-accent: ${tokens.colors.accent};
  --color-accent-foreground: ${tokens.colors.accentForeground};
  --color-card: ${tokens.colors.cardBackground};
  --color-border: ${tokens.colors.borderDefault};
  --color-border-light: ${tokens.colors.borderLight};
  --color-link: ${tokens.colors.link};
  --color-success: ${tokens.colors.success};
  --color-warning: ${tokens.colors.warning};
  --color-error: ${tokens.colors.error};

  /* Typography */
  --font-primary: ${tokens.typography.fontPrimary};
  --font-heading: ${tokens.typography.fontHeading};
  --font-mono: ${tokens.typography.fontMono};
  --text-h1: ${tokens.typography.h1Size};
  --text-h2: ${tokens.typography.h2Size};
  --text-h3: ${tokens.typography.h3Size};
  --text-h4: ${tokens.typography.h4Size};
  --text-body: ${tokens.typography.bodySize};
  --text-small: ${tokens.typography.bodySmallSize};
  --text-xs: ${tokens.typography.smallSize};
  --weight-normal: ${tokens.typography.bodyWeight};
  --weight-medium: ${tokens.typography.mediumWeight};
  --weight-semibold: ${tokens.typography.semiboldWeight};
  --weight-bold: ${tokens.typography.boldWeight};
  --leading-tight: ${tokens.typography.tightLineHeight};
  --leading-normal: ${tokens.typography.bodyLineHeight};
  --tracking-tight: ${tokens.typography.headingLetterSpacing};
  --tracking-normal: ${tokens.typography.bodyLetterSpacing};

  /* Spacing */
  --space-xs: ${tokens.spacing.xs};
  --space-sm: ${tokens.spacing.sm};
  --space-md: ${tokens.spacing.md};
  --space-lg: ${tokens.spacing.lg};
  --space-xl: ${tokens.spacing.xl};
  --space-xxl: ${tokens.spacing.xxl};
  --space-section-y: ${tokens.spacing.sectionPaddingY};
  --space-section-x: ${tokens.spacing.sectionPaddingX};
  --space-card: ${tokens.spacing.cardPadding};
  --space-grid-gap: ${tokens.spacing.gridGap};
  --space-stack-gap: ${tokens.spacing.stackGap};

  /* Borders */
  --radius-sm: ${tokens.borders.radiusSm};
  --radius-md: ${tokens.borders.radiusMd};
  --radius-lg: ${tokens.borders.radiusLg};
  --radius-xl: ${tokens.borders.radiusXl};
  --radius-full: ${tokens.borders.radiusFull};
  --radius-button: ${tokens.borders.buttonRadius};
  --radius-card: ${tokens.borders.cardRadius};
  --radius-input: ${tokens.borders.inputRadius};

  /* Shadows */
  --shadow-sm: ${tokens.shadows.sm};
  --shadow-md: ${tokens.shadows.md};
  --shadow-lg: ${tokens.shadows.lg};
  --shadow-card: ${tokens.shadows.cardShadow};

  /* Transitions */
  --transition-fast: ${tokens.transitions.fast};
  --transition-normal: ${tokens.transitions.normal};
  --easing: ${tokens.transitions.easing};
}
</style>

== CRITICAL RULES ==

**VIEWPORT OVERLAP RULE (MOST IMPORTANT FOR SECTIONS 1+):**
Screenshots use viewport chunking, so your screenshot MAY SHOW CONTENT FROM ADJACENT SECTIONS.
- Content visible at TOP of screenshot from previous section → DO NOT CLONE
- Content visible at BOTTOM of screenshot from next section → DO NOT CLONE

For section ${index}:
- Previous section was: "${prevDescription || 'none'}" → If you see ANY content from this, SKIP IT
- Your section is: "${description}" → ONLY clone content that belongs to THIS section
- Next section is: "${nextDescription || 'none'}" → If visible at bottom, SKIP IT

Example: If previous section was "hero" and you see a large headline at the top of your screenshot,
that's leftover from the hero - DO NOT include it. Start cloning from YOUR section's content.

**NAV BAR RULE:**
- Section 0: Include navigation bar
- Section 1+: Do NOT include navigation bar (even if visible in screenshot - it's the fixed nav)

**CSS USAGE:**
- Use CSS variables for ALL colors, fonts, spacing, and radii
- Example: \`color: var(--color-text-primary);\` NOT \`color: #ffffff;\`
- This enables token switching for templates

**CLASS NAMING:**
- Prefix ALL classes with "${sectionId}-" for namespacing
- Example: .${sectionId}-hero, .${sectionId}-title

**NO EXTERNAL RESOURCES:**
- Use CSS-only graphics (gradients, shapes, box-shadows)
- No external images, fonts, or scripts

== VISUAL DETAIL CHECKLIST ==

Before writing, verify you've captured:
[ ] Corner radius - Check if rounded or square
[ ] Letter spacing - Tight headlines? Normal body?
[ ] Text transform - UPPERCASE via CSS or actual caps?
[ ] Border style - Which sides? Width? Solid/dashed?
[ ] Shadows - Present or flat? Subtle or prominent?
[ ] Text opacity - Muted text using rgba?
[ ] Font weight - 500/600 are common, not just 400/700
[ ] Max width - Text containers constrained?
[ ] Alignment - Left, center, or right?
[ ] Spacing gaps - Consistent or varied?
[ ] Backdrop blur - Glass effect on overlays?

== BACKGROUND COLOR WARNING ==

The PAGE background is: ${tokens.colors.pageBackground}
Theme type is: ${tokens.themeType}

If this is a DARK theme, ensure:
- Main section backgrounds use var(--color-background)
- Do NOT make sections white/light unless explicitly in screenshot
- Inner mockup/preview images may show light UI - that's OK, they're content
- The SECTION CONTAINER should respect the dark theme

== OUTPUT FORMAT ==

<style>
:root { /* CSS variables from above */ }

.${sectionId} {
  background: var(--color-background);
  color: var(--color-foreground);
  padding: var(--space-section-y) var(--space-section-x);
}

.${sectionId}-title {
  font-family: var(--font-heading);
  font-size: var(--text-h1);
  font-weight: var(--weight-bold);
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
  color: var(--color-heading);
}

/* ... more styles using variables ... */
</style>

<div class="${sectionId}">
  <!-- Content matching screenshot -->
</div>

== EXECUTION ==
Read screenshot -> Generate HTML with CSS variables -> Write file -> Exit.
You have NO Playwright access. Use only Read and Write tools.
```

---

## Phase 4: Assembly + CSS Variable Injection

### 4.1: Generate Global CSS Variables File

Create `variables.css` with all tokens:

```css
/* Generated from design tokens - DO NOT EDIT MANUALLY */
:root {
  /* === COLORS === */
  --color-background: ${tokens.colors.pageBackground};
  --color-foreground: ${tokens.colors.textPrimary};
  --color-text-primary: ${tokens.colors.textPrimary};
  --color-text-secondary: ${tokens.colors.textSecondary};
  --color-text-muted: ${tokens.colors.textMuted};
  --color-text-inverse: ${tokens.colors.textInverse};
  --color-heading: ${tokens.colors.headingPrimary};
  --color-accent: ${tokens.colors.accent};
  --color-accent-hover: ${tokens.colors.accentHover};
  --color-accent-foreground: ${tokens.colors.accentForeground};
  --color-secondary-bg: ${tokens.colors.secondaryBg};
  --color-secondary-border: ${tokens.colors.secondaryBorder};
  --color-secondary-foreground: ${tokens.colors.secondaryForeground};
  --color-card: ${tokens.colors.cardBackground};
  --color-nav: ${tokens.colors.navBackground};
  --color-input: ${tokens.colors.inputBackground};
  --color-border: ${tokens.colors.borderDefault};
  --color-border-light: ${tokens.colors.borderLight};
  --color-border-focus: ${tokens.colors.borderFocus};
  --color-link: ${tokens.colors.link};
  --color-success: ${tokens.colors.success};
  --color-warning: ${tokens.colors.warning};
  --color-error: ${tokens.colors.error};
  --color-info: ${tokens.colors.info};

  /* === TYPOGRAPHY === */
  --font-primary: ${tokens.typography.fontPrimary};
  --font-heading: ${tokens.typography.fontHeading};
  --font-mono: ${tokens.typography.fontMono};

  --text-h1: ${tokens.typography.h1Size};
  --text-h2: ${tokens.typography.h2Size};
  --text-h3: ${tokens.typography.h3Size};
  --text-h4: ${tokens.typography.h4Size};
  --text-h5: ${tokens.typography.h5Size};
  --text-h6: ${tokens.typography.h6Size};
  --text-body: ${tokens.typography.bodySize};
  --text-body-small: ${tokens.typography.bodySmallSize};
  --text-small: ${tokens.typography.smallSize};
  --text-xs: ${tokens.typography.xsmallSize};
  --text-xxs: ${tokens.typography.xxsmallSize};

  --weight-normal: ${tokens.typography.bodyWeight};
  --weight-medium: ${tokens.typography.mediumWeight};
  --weight-semibold: ${tokens.typography.semiboldWeight};
  --weight-bold: ${tokens.typography.boldWeight};

  --leading-tight: ${tokens.typography.tightLineHeight};
  --leading-snug: 1.3;
  --leading-normal: ${tokens.typography.bodyLineHeight};
  --leading-relaxed: 1.75;

  --tracking-tight: ${tokens.typography.headingLetterSpacing};
  --tracking-normal: ${tokens.typography.bodyLetterSpacing};
  --tracking-wide: ${tokens.typography.wideLetterSpacing};

  /* === SPACING === */
  --space-xxs: ${tokens.spacing.xxs};
  --space-xs: ${tokens.spacing.xs};
  --space-sm: ${tokens.spacing.sm};
  --space-md: ${tokens.spacing.md};
  --space-lg: ${tokens.spacing.lg};
  --space-xl: ${tokens.spacing.xl};
  --space-xxl: ${tokens.spacing.xxl};
  --space-xxxl: ${tokens.spacing.xxxl};

  --space-section-y: ${tokens.spacing.sectionPaddingY};
  --space-section-x: ${tokens.spacing.sectionPaddingX};
  --space-card: ${tokens.spacing.cardPadding};
  --space-input-x: ${tokens.spacing.inputPaddingX};
  --space-input-y: ${tokens.spacing.inputPaddingY};
  --space-button-x: ${tokens.spacing.buttonPaddingX};
  --space-button-y: ${tokens.spacing.buttonPaddingY};
  --space-grid-gap: ${tokens.spacing.gridGap};
  --space-stack-gap: ${tokens.spacing.stackGap};
  --space-inline-gap: ${tokens.spacing.inlineGap};

  --nav-height: ${tokens.spacing.navHeight};

  /* === BORDERS === */
  --radius-none: ${tokens.borders.radiusNone};
  --radius-xs: ${tokens.borders.radiusXs};
  --radius-sm: ${tokens.borders.radiusSm};
  --radius-md: ${tokens.borders.radiusMd};
  --radius-lg: ${tokens.borders.radiusLg};
  --radius-xl: ${tokens.borders.radiusXl};
  --radius-xxl: ${tokens.borders.radiusXxl};
  --radius-full: ${tokens.borders.radiusFull};

  --radius-button: ${tokens.borders.buttonRadius};
  --radius-card: ${tokens.borders.cardRadius};
  --radius-input: ${tokens.borders.inputRadius};

  --border-thin: ${tokens.borders.widthThin};
  --border-medium: ${tokens.borders.widthMedium};
  --border-thick: ${tokens.borders.widthThick};

  /* === SHADOWS === */
  --shadow-none: ${tokens.shadows.none};
  --shadow-xs: ${tokens.shadows.xs};
  --shadow-sm: ${tokens.shadows.sm};
  --shadow-md: ${tokens.shadows.md};
  --shadow-lg: ${tokens.shadows.lg};
  --shadow-xl: ${tokens.shadows.xl};
  --shadow-card: ${tokens.shadows.cardShadow};
  --shadow-button: ${tokens.shadows.buttonShadow};
  --shadow-nav: ${tokens.shadows.navShadow};

  /* === TRANSITIONS === */
  --transition-fast: ${tokens.transitions.fast};
  --transition-normal: ${tokens.transitions.normal};
  --transition-slow: ${tokens.transitions.slow};
  --easing: ${tokens.transitions.easing};
  --easing-in: ${tokens.transitions.easingIn};
  --easing-out: ${tokens.transitions.easingOut};

  /* === Z-INDEX === */
  --z-dropdown: ${tokens.zIndex.dropdown};
  --z-sticky: ${tokens.zIndex.sticky};
  --z-fixed: ${tokens.zIndex.fixed};
  --z-modal: ${tokens.zIndex.modal};
  --z-popover: ${tokens.zIndex.popover};
  --z-tooltip: ${tokens.zIndex.tooltip};
}
```

### 4.2: Run Assembler

```bash
node tools/assemble.js output/<domain>-<timestamp>/
```

---

## Phase 5: Templatize (Generic Copy)

### 5.1: Create Template Directory

```bash
mkdir -p output/<domain>-<timestamp>-template/
cp output/<domain>-<timestamp>/variables.css output/<domain>-<timestamp>-template>/
```

### 5.2: Spawn Templatize Agents

For each section, spawn a sub-agent (in parallel):

```
Templatize this HTML section by rewriting all text to generic placeholders.

=== INPUT ===
HTML file: <clone_dir>/${filename}.html
Output file: <template_dir>/${filename}.html

=== YOUR TASK ===
1. Read the HTML file using the Read tool
2. Rewrite ALL text content to generic/placeholder
3. PRESERVE all CSS including CSS variables exactly
4. Write the templatized HTML to output
5. Exit immediately

=== TEXT REPLACEMENT RULES ===

**IMPORTANT: Write REAL copy, NOT placeholder brackets like [Feature]. Write actual text.**

**Company Names:** "Acme" (consistent throughout)
**Headlines:** Write real marketing copy with same tone/length
**Statistics:** "2000+ customers", "99.9% uptime"
**Testimonials:** "Sarah J.", "Mike T." with generic companies
**Features:** Benefit-focused descriptions
**CTAs:** "Get Started", "Learn More", "Sign Up"
**Logos:** "Nexus", "Cloudify", "DataSync", "Flowbase", "TechCorp"

=== CRITICAL ===
- DO NOT modify CSS variables or HTML structure
- DO NOT change class names, IDs, or element hierarchy
- ONLY replace text content inside elements
- Keep approximately same text length
```

### 5.3: Assemble Template

```bash
node tools/assemble.js output/<domain>-<timestamp>-template/
```

---

## Phase 6: Final Assembly + Validation

### 6.1: Generate design-tokens.json

Write tokens in the required structure for coding agents:

```json
{
  "meta": {
    "name": "<Template Name>",
    "type": "<dark|light>",
    "description": "<Brief description>"
  },

  "colors": {
    "primary": "${tokens.colors.headingPrimary}",
    "secondary": "${tokens.colors.textSecondary}",
    "accent": "${tokens.colors.accent}",
    "background": {
      "page": "${tokens.colors.pageBackground}",
      "card": "${tokens.colors.cardBackground}",
      "hover": "rgba(255,255,255,0.05)"
    },
    "text": {
      "primary": "${tokens.colors.textPrimary}",
      "secondary": "${tokens.colors.textSecondary}",
      "muted": "${tokens.colors.textMuted}",
      "inverse": "${tokens.colors.textInverse}"
    },
    "border": {
      "default": "${tokens.colors.borderDefault}",
      "light": "${tokens.colors.borderLight}"
    },
    "status": {
      "success": "${tokens.colors.success}",
      "warning": "${tokens.colors.warning}",
      "error": "${tokens.colors.error}"
    }
  },

  "typography": {
    "fonts": {
      "primary": "${tokens.typography.fontPrimary}",
      "heading": "${tokens.typography.fontHeading}"
    },
    "sizes": {
      "h1": "${tokens.typography.h1Size}",
      "h2": "${tokens.typography.h2Size}",
      "h3": "${tokens.typography.h3Size}",
      "h4": "${tokens.typography.h4Size}",
      "body": "${tokens.typography.bodySize}",
      "bodySmall": "${tokens.typography.bodySmallSize}",
      "small": "${tokens.typography.smallSize}",
      "xsmall": "${tokens.typography.xsmallSize}",
      "xxsmall": "${tokens.typography.xxsmallSize}"
    },
    "weights": {
      "normal": "${tokens.typography.bodyWeight}",
      "medium": "${tokens.typography.mediumWeight}",
      "semibold": "${tokens.typography.semiboldWeight}",
      "bold": "${tokens.typography.boldWeight}"
    },
    "lineHeights": {
      "tight": "1.1",
      "snug": "1.3",
      "normal": "${tokens.typography.bodyLineHeight}",
      "relaxed": "1.75"
    },
    "letterSpacing": {
      "tight": "${tokens.typography.headingLetterSpacing}",
      "normal": "${tokens.typography.bodyLetterSpacing}",
      "wide": "${tokens.typography.wideLetterSpacing}"
    }
  },

  "spacing": {
    "xxs": "${tokens.spacing.xxs}",
    "xs": "${tokens.spacing.xs}",
    "sm": "${tokens.spacing.sm}",
    "md": "${tokens.spacing.md}",
    "lg": "${tokens.spacing.lg}",
    "xl": "${tokens.spacing.xl}",
    "xxl": "${tokens.spacing.xxl}",
    "section": "${tokens.spacing.sectionPaddingY}"
  },

  "borders": {
    "radius": {
      "none": "0",
      "xs": "${tokens.borders.radiusXs}",
      "sm": "${tokens.borders.radiusSm}",
      "md": "${tokens.borders.radiusMd}",
      "lg": "${tokens.borders.radiusLg}",
      "xl": "${tokens.borders.radiusXl}",
      "xxl": "${tokens.borders.radiusXxl}",
      "full": "${tokens.borders.radiusFull}"
    },
    "width": {
      "thin": "${tokens.borders.widthThin}",
      "medium": "${tokens.borders.widthMedium}",
      "thick": "${tokens.borders.widthThick}"
    }
  },

  "shadows": {
    "xs": "${tokens.shadows.xs}",
    "sm": "${tokens.shadows.sm}",
    "md": "${tokens.shadows.md}",
    "lg": "${tokens.shadows.lg}",
    "xl": "${tokens.shadows.xl}"
  },

  "transitions": {
    "fast": "${tokens.transitions.fast}",
    "normal": "${tokens.transitions.normal}",
    "slow": "${tokens.transitions.slow}",
    "easing": "${tokens.transitions.easing}"
  },

  "zIndex": {
    "dropdown": "${tokens.zIndex.dropdown}",
    "sticky": "${tokens.zIndex.sticky}",
    "modal": "${tokens.zIndex.modal}",
    "toast": "${tokens.zIndex.tooltip}"
  }
}
```

### 6.2: Generate theme.css

Based on theme type:

**For DARK themes:**
```css
/* === DARK THEME BEHAVIORAL OVERRIDES === */

/* Subtle borders on dark backgrounds */
.card, [class*="card"] {
  border-color: rgba(255,255,255,0.08);
}

/* Input styling */
input, textarea, select {
  background: var(--color-input);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

input:focus, textarea:focus, select:focus {
  border-color: var(--color-border-focus);
  outline: none;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
}

/* Custom scrollbar */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: var(--color-card); }
::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: var(--radius-full);
}
::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}

/* Text selection */
::selection {
  background: var(--color-accent);
  color: var(--color-accent-foreground);
}

/* Link styling */
a:not([class]) {
  color: var(--color-link);
  text-decoration: none;
}
a:not([class]):hover {
  text-decoration: underline;
}
```

**For LIGHT themes:**
```css
/* === LIGHT THEME BEHAVIORAL OVERRIDES === */

/* Solid borders with subtle shadows */
.card, [class*="card"] {
  border-color: var(--color-border);
  box-shadow: var(--shadow-sm);
}

/* Input styling */
input, textarea, select {
  background: #ffffff;
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

input:focus, textarea:focus, select:focus {
  border-color: var(--color-accent);
  outline: none;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

/* Custom scrollbar */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: #f1f1f1; }
::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: var(--radius-full);
}
::-webkit-scrollbar-thumb:hover {
  background: #a1a1a1;
}

/* Text selection */
::selection {
  background: var(--color-accent);
  color: #ffffff;
}

/* Link styling */
a:not([class]) {
  color: var(--color-link);
  text-decoration: none;
}
a:not([class]):hover {
  text-decoration: underline;
}
```

### 6.3: Validation Checklist

Verify all files present:

```
<template_dir>/
├── design-tokens.json    # Required - exact structure
├── theme.css             # Required - behavioral overrides
├── variables.css         # Required - CSS custom properties
├── assembled.html        # Required - visual reference
├── manifest.json         # Metadata
└── [section files]       # Individual sections
```

### 6.4: Open Result

```bash
open <template_dir>/assembled.html
```

### 6.5: Report to User

```
Clone complete!

=== OUTPUT FILES ===
Exact clone: output/<domain>-<timestamp>/assembled.html
Template:    output/<domain>-<timestamp>-template/

=== TEMPLATE PACKAGE ===
<template_dir>/
├── design-tokens.json    # All design values (exact structure for token switching)
├── theme.css             # Dark/light behavioral overrides
├── variables.css         # CSS custom properties (used in HTML)
├── assembled.html        # Visual reference page
└── [section files]       # Individual section HTML

=== FOR CODING AGENTS ===
Provide these files:
1. Visual reference: <template_dir>/assembled.html
2. Design tokens:    <template_dir>/design-tokens.json
3. CSS variables:    <template_dir>/variables.css
4. Theme overrides:  <template_dir>/theme.css

=== KEY IMPROVEMENTS IN V2 ===
- Tokens extracted from LIVE page before screenshots
- Fixed elements hidden during section capture (no duplicate navs)
- Lazy loading triggered (no missing content)
- All CSS uses variables (easy token switching)
- Enhanced section detection (handles flat DOM)
```

---

## Token Budget

| Phase | Agent | Expected Tokens |
|-------|-------|-----------------|
| 0 | Main | ~20K (token extraction) |
| 1 | Main | ~15K (lazy load + section detection) |
| 2 | Main | ~30K (screenshot capture) |
| 3 | Each clone sub-agent | ~60K (read + generate + write) |
| 4 | Main | ~10K (assembly + variables) |
| 5 | Each templatize sub-agent | ~25K (read + rewrite + write) |
| 6 | Main | ~15K (final assembly + validation) |

**Total for 8 sections**: ~20K + 15K + 30K + (8 x 60K) + 10K + (8 x 25K) + 15K = **~770K tokens**

---

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| **Duplicate content across sections** | Viewport screenshots capture adjacent content | **Use ELEMENT screenshots** via `el.screenshot()` - clips to exact element bounds |
| Duplicate nav bars | Fixed nav visible in all sections | Phase 2 hides fixed elements for sections 1+ |
| Duplicate HTML files | Previous run left files with different names | Phase 0.2 cleanup removes old `*.html` files |
| Missing lazy content | Content not loaded on initial view | Phase 1 scrolls entire page first |
| Wrong colors | Agent guessed instead of using tokens | Phase 0 extracts exact values, passed to all agents |
| Inconsistent spacing | Each agent used different values | CSS variables ensure consistency |
| Missed sections | Flat DOM structure | Enhanced detection uses multiple strategies |
| Token switching breaks | Wrong JSON structure | Phase 6 validates exact structure |

---

## Key Principles

1. **Tokens First**: Extract from live page BEFORE screenshots
2. **Hide Fixed Elements**: Prevents duplicate navigation bars
3. **Trigger Lazy Loading**: Ensures all content is visible
4. **CSS Variables**: Enables easy token switching
5. **Structured Prompts**: Every agent gets exact same token values
6. **Validation**: Final phase verifies all required files exist
