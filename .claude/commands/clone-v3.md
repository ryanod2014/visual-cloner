---
name: clone-v3
description: Clone a website by extracting actual source HTML/CSS/assets (not generating from screenshots)
arguments:
  - name: url
    description: The URL to clone
    required: true
---

# Clone Website Command v3 - Source Extraction

Clone the website at **$ARGUMENTS** by extracting actual source code, not generating from screenshots.

## Key Difference from v1/v2

| Approach | v1/v2 | v3 |
|----------|-------|-----|
| **Method** | Screenshot → AI guesses HTML | Extract actual HTML → Clean it |
| **Fonts** | Guessed (system fallbacks) | **Downloaded and embedded** |
| **Images** | AI-drawn SVG approximations | **Actual images downloaded** |
| **CSS** | AI-estimated values | **Actual computed styles extracted** |
| **Gradients** | Approximated | **Exact values extracted** |
| **Accuracy** | ~60% visual match | **~95%+ visual match** |

## Why This Works Better

Screenshots lose information:
- Font files are invisible in pixels
- Exact CSS values can't be reverse-engineered
- Complex gradients (conic, radial) are hard to recreate
- Animation/transition values are invisible
- Images get redrawn poorly

Source extraction preserves everything:
- `document.documentElement.outerHTML` = exact HTML
- `document.styleSheets` = all CSS rules
- `@font-face` declarations = font URLs
- `img.src` = actual image URLs
- `getComputedStyle()` = exact values

---

## Architecture

```
PHASE 0: Navigate & Analyze
├── Navigate to URL
├── Trigger lazy loading (scroll full page)
├── Wait for fonts/images to load
└── Take reference screenshot

PHASE 1: Extract Source
├── Extract full HTML (document.documentElement.outerHTML)
├── Extract all CSS rules from stylesheets
├── Find all @font-face declarations
├── Find all image URLs
├── Find all inline SVGs
└── Extract computed styles for key elements

PHASE 2: Download Assets
├── Download font files → convert to base64
├── Download images → convert to base64 or keep as files
├── Extract SVGs inline
└── Build asset manifest

PHASE 3: Clean & Transform
├── Remove <script> tags (no JS needed for visual clone)
├── Remove tracking/analytics
├── Remove data-* framework attributes (optional)
├── Inline critical CSS
├── Replace external URLs with local/base64
├── Simplify class names (optional)

PHASE 4: Assemble
├── Generate self-contained HTML file
├── Embed fonts as base64 @font-face
├── Embed images as base64 or relative paths
├── Inline all CSS
└── Output single index.html

PHASE 5: Validate
├── Screenshot the clone
├── Compare to original reference
├── Report any missing assets
└── Open result
```

---

## Phase 0: Navigate & Analyze

### 0.1: Navigate and Setup

```javascript
mcp__playwright__browser_navigate({ url: "$ARGUMENTS" })
```

### 0.2: Create Output Directory

```bash
mkdir -p output/<domain>-v3-<timestamp>/assets/fonts
mkdir -p output/<domain>-v3-<timestamp>/assets/images
```

### 0.3: Trigger Lazy Loading

Scroll through the entire page to load all lazy content:

```javascript
// Run via mcp__playwright__browser_run_code
async (page) => {
  // Get initial height
  let lastHeight = 0;
  let currentHeight = await page.evaluate(() => document.body.scrollHeight);

  // Keep scrolling until height stops changing
  while (currentHeight > lastHeight) {
    lastHeight = currentHeight;

    // Scroll in chunks
    for (let y = 0; y < currentHeight; y += 500) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(100);
    }

    // Wait for new content
    await page.waitForTimeout(500);
    currentHeight = await page.evaluate(() => document.body.scrollHeight);
  }

  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));

  // Wait for everything to settle
  await page.waitForLoadState('networkidle');

  return { finalHeight: currentHeight };
}
```

### 0.4: Wait for Fonts

```javascript
// Run via mcp__playwright__browser_evaluate
() => {
  return document.fonts.ready.then(() => {
    return {
      fontsLoaded: document.fonts.size,
      fonts: Array.from(document.fonts).map(f => ({
        family: f.family,
        weight: f.weight,
        status: f.status
      }))
    };
  });
}
```

### 0.5: Take Reference Screenshot

```javascript
mcp__playwright__browser_take_screenshot({
  filename: "reference-fullpage.png",
  fullPage: true
})
```

---

## Phase 1: Extract Source

### 1.1: Extract Complete HTML

```javascript
// Run via mcp__playwright__browser_evaluate
() => {
  return {
    html: document.documentElement.outerHTML,
    doctype: document.doctype ?
      `<!DOCTYPE ${document.doctype.name}>` : '<!DOCTYPE html>'
  };
}
```

Save the HTML to `raw-source.html` for reference.

### 1.2: Extract All CSS Rules

```javascript
// Run via mcp__playwright__browser_evaluate
() => {
  const allCSS = [];
  const fontFaces = [];
  const externalSheets = [];

  for (const sheet of document.styleSheets) {
    try {
      // Check if it's an external stylesheet
      if (sheet.href) {
        externalSheets.push(sheet.href);
      }

      // Get all rules
      for (const rule of sheet.cssRules) {
        allCSS.push(rule.cssText);

        // Capture @font-face specifically
        if (rule instanceof CSSFontFaceRule) {
          fontFaces.push({
            cssText: rule.cssText,
            family: rule.style.fontFamily,
            src: rule.style.src,
            weight: rule.style.fontWeight,
            style: rule.style.fontStyle
          });
        }
      }
    } catch (e) {
      // Cross-origin stylesheet - note it
      if (sheet.href) {
        externalSheets.push({ href: sheet.href, error: 'cross-origin' });
      }
    }
  }

  return {
    cssRules: allCSS,
    cssText: allCSS.join('\n'),
    fontFaces,
    externalSheets,
    totalRules: allCSS.length
  };
}
```

### 1.3: Extract All Asset URLs

```javascript
// Run via mcp__playwright__browser_evaluate
() => {
  const assets = {
    images: [],
    fonts: [],
    svgs: [],
    backgroundImages: []
  };

  // Get all images
  document.querySelectorAll('img').forEach(img => {
    if (img.src) {
      assets.images.push({
        src: img.src,
        srcset: img.srcset || null,
        alt: img.alt,
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    }
  });

  // Get inline SVGs
  document.querySelectorAll('svg').forEach((svg, i) => {
    assets.svgs.push({
      index: i,
      outerHTML: svg.outerHTML,
      width: svg.getAttribute('width'),
      height: svg.getAttribute('height'),
      viewBox: svg.getAttribute('viewBox')
    });
  });

  // Get background images from computed styles
  document.querySelectorAll('*').forEach(el => {
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== 'none' && bg.includes('url(')) {
      const urls = bg.match(/url\(['"]?([^'")\s]+)['"]?\)/g);
      if (urls) {
        urls.forEach(url => {
          const cleanUrl = url.replace(/url\(['"]?|['"]?\)/g, '');
          if (!assets.backgroundImages.includes(cleanUrl)) {
            assets.backgroundImages.push(cleanUrl);
          }
        });
      }
    }
  });

  // Get font URLs from @font-face
  const fontUrls = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSFontFaceRule) {
          const src = rule.style.src;
          const urls = src.match(/url\(['"]?([^'")\s]+)['"]?\)/g);
          if (urls) {
            urls.forEach(url => {
              const cleanUrl = url.replace(/url\(['"]?|['"]?\)/g, '');
              fontUrls.push({
                url: cleanUrl,
                family: rule.style.fontFamily,
                format: cleanUrl.split('.').pop()
              });
            });
          }
        }
      }
    } catch (e) {}
  }
  assets.fonts = fontUrls;

  return assets;
}
```

### 1.4: Extract Key Computed Styles (Design Tokens)

```javascript
// Run via mcp__playwright__browser_evaluate
() => {
  const getStyle = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el) : null;
  };

  const body = getComputedStyle(document.body);
  const html = getComputedStyle(document.documentElement);
  const h1 = getStyle('h1');
  const h2 = getStyle('h2');
  const h3 = getStyle('h3');
  const btn = getStyle('button, [class*="btn"], a[class*="button"]');
  const nav = getStyle('nav, header');
  const card = getStyle('[class*="card"], [class*="panel"]');

  // Determine theme
  const bgColor = body.backgroundColor || html.backgroundColor;
  const bgRgb = bgColor.match(/\d+/g)?.map(Number) || [255, 255, 255];
  const luminance = (0.299 * bgRgb[0] + 0.587 * bgRgb[1] + 0.114 * bgRgb[2]) / 255;
  const themeType = luminance < 0.5 ? 'dark' : 'light';

  return {
    themeType,
    colors: {
      pageBackground: body.backgroundColor,
      textPrimary: body.color,
      headingColor: h1?.color || body.color,
      accentColor: btn?.backgroundColor,
      borderColor: card?.borderColor
    },
    typography: {
      fontPrimary: body.fontFamily,
      fontHeading: h1?.fontFamily || body.fontFamily,
      h1Size: h1?.fontSize,
      h1Weight: h1?.fontWeight,
      h1LineHeight: h1?.lineHeight,
      h1LetterSpacing: h1?.letterSpacing,
      bodySize: body.fontSize,
      bodyLineHeight: body.lineHeight
    },
    borders: {
      buttonRadius: btn?.borderRadius,
      cardRadius: card?.borderRadius
    }
  };
}
```

---

## Phase 2: Download Assets

### 2.1: Download Fonts

For each font URL found in Phase 1.3, download and convert to base64:

```javascript
// Run via mcp__playwright__browser_run_code
async (page) => {
  const fontUrl = '<FONT_URL>';

  try {
    const response = await page.evaluate(async (url) => {
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve({
          success: true,
          base64: reader.result,
          type: blob.type,
          size: blob.size
        });
        reader.readAsDataURL(blob);
      });
    }, fontUrl);

    return response;
  } catch (e) {
    return { success: false, error: e.message, url: fontUrl };
  }
}
```

Save each font's base64 data for embedding in the final CSS.

### 2.2: Download Images

For each image URL, download and optionally convert to base64:

```javascript
// Run via mcp__playwright__browser_run_code
async (page) => {
  const imageUrl = '<IMAGE_URL>';

  try {
    const response = await page.evaluate(async (url) => {
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve({
          success: true,
          base64: reader.result,
          type: blob.type,
          size: blob.size
        });
        reader.readAsDataURL(blob);
      });
    }, imageUrl);

    return response;
  } catch (e) {
    return { success: false, error: e.message, url: imageUrl };
  }
}
```

**Decision point**: For small images (<50KB), embed as base64. For larger images, save as files.

### 2.3: Build Asset Manifest

Create `assets/manifest.json`:

```json
{
  "fonts": [
    {
      "family": "Ein",
      "originalUrl": "https://example.com/font/ein.woff",
      "localPath": "assets/fonts/ein.woff",
      "base64": "data:font/woff;base64,..."
    }
  ],
  "images": [
    {
      "originalUrl": "https://example.com/hero.png",
      "localPath": "assets/images/hero.png",
      "base64": "data:image/png;base64,..."
    }
  ]
}
```

---

## Phase 3: Clean & Transform

### 3.1: Clean HTML

Use a sub-agent or do inline transformation:

**Removals:**
- All `<script>` tags (JS not needed for visual clone)
- All `<noscript>` tags
- Tracking pixels (1x1 images, analytics)
- Comments (optional)
- `data-*` framework attributes like `data-svelte-*`, `data-react-*` (optional)
- `onclick`, `onload`, event handlers
- `<link rel="preload">` for JS
- `<meta>` tags for SEO/social (keep charset, viewport)

**Keep:**
- All visible HTML structure
- `<link rel="stylesheet">` (will inline later)
- `<style>` blocks
- `class` and `id` attributes
- `aria-*` attributes (accessibility)
- `<img>`, `<svg>`, `<picture>` elements

```javascript
// Run via mcp__playwright__browser_evaluate
() => {
  // Clone the document to avoid modifying the live page
  const clone = document.documentElement.cloneNode(true);

  // Remove scripts
  clone.querySelectorAll('script').forEach(el => el.remove());
  clone.querySelectorAll('noscript').forEach(el => el.remove());

  // Remove event handlers
  clone.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
      // Remove framework data attributes (optional - keep if structure matters)
      // if (attr.name.startsWith('data-') &&
      //     (attr.name.includes('svelte') || attr.name.includes('react') || attr.name.includes('vue'))) {
      //   el.removeAttribute(attr.name);
      // }
    });
  });

  // Remove tracking/analytics
  clone.querySelectorAll('img[width="1"], img[height="1"], [class*="tracking"], [id*="analytics"]')
    .forEach(el => el.remove());

  // Remove preload links for JS
  clone.querySelectorAll('link[rel="preload"][as="script"], link[rel="modulepreload"]')
    .forEach(el => el.remove());

  return clone.outerHTML;
}
```

### 3.2: Inline External CSS

For each `<link rel="stylesheet" href="...">`:

1. Fetch the CSS content
2. Replace the `<link>` with a `<style>` block containing the CSS
3. Resolve relative URLs in the CSS to absolute or base64

```javascript
// Run via mcp__playwright__browser_run_code
async (page) => {
  // Get all external stylesheets and their content
  const stylesheets = await page.evaluate(async () => {
    const sheets = [];

    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      try {
        const response = await fetch(link.href);
        const css = await response.text();
        sheets.push({
          href: link.href,
          css: css
        });
      } catch (e) {
        sheets.push({
          href: link.href,
          error: e.message
        });
      }
    }

    return sheets;
  });

  return stylesheets;
}
```

### 3.3: Replace Asset URLs

In the cleaned HTML and CSS, replace all external URLs with:
- Base64 data URIs (for small assets)
- Local relative paths (for large assets saved to files)

**In CSS:**
```css
/* Before */
@font-face {
  font-family: 'Ein';
  src: url('../../../font/ein.woff') format('woff');
}

/* After */
@font-face {
  font-family: 'Ein';
  src: url('data:font/woff;base64,d09GRgAB...') format('woff');
}
```

**In HTML:**
```html
<!-- Before -->
<img src="https://example.com/plugin/select-mode.png">

<!-- After -->
<img src="data:image/png;base64,iVBORw0KGgo...">
<!-- OR -->
<img src="assets/images/select-mode.png">
```

### 3.4: Build Final CSS Block

Combine all CSS into a single `<style>` block:

1. @font-face declarations (with embedded fonts)
2. CSS custom properties (:root variables)
3. All other CSS rules
4. Remove duplicate rules

---

## Phase 4: Assemble

### 4.1: Generate Self-Contained HTML

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clone of <ORIGINAL_TITLE></title>
  <style>
    /* === EMBEDDED FONTS === */
    @font-face {
      font-family: 'Ein';
      src: url('data:font/woff;base64,...') format('woff');
    }

    /* === ALL CSS RULES === */
    /* ... extracted and cleaned CSS ... */
  </style>
</head>
<body>
  <!-- CLEANED HTML BODY -->
</body>
</html>
```

### 4.2: Write Output Files

```
output/<domain>-v3-<timestamp>/
├── index.html           # Self-contained clone (primary output)
├── raw-source.html      # Original extracted HTML (for reference)
├── extracted-css.css    # All CSS rules (for reference)
├── assets/
│   ├── manifest.json    # Asset mapping
│   ├── fonts/           # Downloaded fonts (if not inlined)
│   └── images/          # Downloaded images (if not inlined)
├── tokens.json          # Extracted design tokens
└── reference.png        # Full-page screenshot of original
```

### 4.3: Generate Design Tokens File

```json
{
  "meta": {
    "source": "<ORIGINAL_URL>",
    "extracted": "<TIMESTAMP>",
    "version": "v3"
  },
  "fonts": {
    "primary": "<extracted fontFamily>",
    "heading": "<extracted heading fontFamily>"
  },
  "colors": {
    "background": "<extracted>",
    "text": "<extracted>",
    "heading": "<extracted>",
    "accent": "<extracted>"
  },
  "typography": {
    "h1": { "size": "...", "weight": "...", "lineHeight": "...", "letterSpacing": "..." },
    "body": { "size": "...", "weight": "...", "lineHeight": "..." }
  }
}
```

---

## Phase 5: Validate

### 5.1: Screenshot the Clone

Open the generated `index.html` in Playwright and take a screenshot:

```javascript
// Navigate to the local clone file
mcp__playwright__browser_navigate({ url: 'file://<OUTPUT_DIR>/index.html' })

// Take screenshot
mcp__playwright__browser_take_screenshot({
  filename: "clone-fullpage.png",
  fullPage: true
})
```

### 5.2: Visual Comparison Report

Report to user:

```
=== CLONE COMPLETE (v3 Source Extraction) ===

Original: <URL>
Output:   output/<domain>-v3-<timestamp>/index.html

=== ASSETS EXTRACTED ===
Fonts:  X fonts downloaded (Ein, ...)
Images: X images downloaded
SVGs:   X inline SVGs preserved
CSS:    X rules extracted

=== FILES ===
output/<domain>-v3-<timestamp>/
├── index.html           # ← OPEN THIS (self-contained clone)
├── raw-source.html      # Original HTML for reference
├── extracted-css.css    # All CSS rules
├── tokens.json          # Design tokens
└── assets/              # Downloaded assets

=== VALIDATION ===
Reference screenshot: reference.png
Clone screenshot:     clone-fullpage.png

Compare these visually to verify accuracy.
```

### 5.3: Open Result

```bash
open output/<domain>-v3-<timestamp>/index.html
```

---

## Quick Reference

### When to Use v3 vs v2

| Scenario | Use |
|----------|-----|
| Site with custom fonts | **v3** (extracts actual fonts) |
| Site with complex images/mockups | **v3** (downloads actual images) |
| Site with complex CSS animations | **v3** (preserves exact CSS) |
| Need template with swappable content | v2 (generates clean markup) |
| Need to modify structure | v2 (AI-generated markup is simpler) |
| Quick visual reference | **v3** (faster, more accurate) |

### Limitations of v3

- Output HTML may be complex (preserves original structure)
- May include unused CSS rules
- Doesn't simplify or optimize markup
- Cross-origin assets may fail to download (CORS)
- Some JS-rendered content may not be captured

### Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Fonts not loading | CORS blocking font download | Try fetching via page.evaluate |
| Images missing | Cross-origin restriction | Use browser's fetch API |
| CSS rules missing | Cross-origin stylesheet | Note in output, manual add |
| Layout broken | Missing CSS | Check extracted-css.css |
| Wrong colors | Computed style vs rule | Verify in extracted styles |

---

## Example Execution

For `https://droplette.app`:

1. Navigate → load page
2. Scroll → trigger lazy loading
3. Extract HTML (126KB)
4. Extract CSS (30KB across 3 files)
5. Find fonts (Ein → download woff)
6. Find images (4 PNGs → download)
7. Clean HTML (remove scripts)
8. Inline CSS + fonts + images
9. Output single `index.html` (~500KB with embedded assets)
10. Screenshot and validate

Expected result: Near pixel-perfect clone with correct fonts, images, and styling.

---

## Phase 6: Templatize (Optional but Recommended)

This phase transforms the clone into a **reusable template** by replacing specific content with placeholder tokens.

### 6.1: Why Templatize?

The clone is a stepping stone—the real goal is a reusable template:
- **Don't use their content** - replace it with placeholders
- **Keep their design** - preserve styles, layout, colors
- **Make it customizable** - tokens that users can fill in

### 6.2: Text Token Replacement

Replace key text elements with placeholder tokens:

```javascript
// Run via mcp__playwright__browser_run_code or post-process the HTML
const tokenMap = {
  // Headings
  'h1': '{{headline}}',
  'h2.section-title': '{{section_title_N}}',
  'h3': '{{subheading_N}}',

  // Body text
  'p.hero-desc': '{{hero_description}}',
  'p.feature-desc': '{{feature_description_N}}',

  // Buttons
  'button, a.cta': '{{cta_text_N}}',

  // Navigation
  'nav a': '{{nav_link_N}}',

  // Footer
  'footer p': '{{footer_text}}'
};
```

**Example transformations:**
```html
<!-- Before -->
<h1>An AI tool made to enhance designers.</h1>
<p>Create palettes in Figma & FigJam based on your color styles</p>
<a class="cta" href="https://figma.com/plugin/123">Try in Figma</a>

<!-- After -->
<h1>{{headline}}</h1>
<p>{{hero_description}}</p>
<a class="cta" href="{{cta_link}}">{{cta_text}}</a>
```

### 6.3: Image Placeholder Replacement

Replace all images with generic placeholders:

```javascript
// Generate placeholder data URIs
const createPlaceholder = (width, height, text) => {
  // Create a simple SVG placeholder
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="#374151"/>
      <text x="50%" y="50%" font-family="sans-serif" font-size="14" fill="#9CA3AF"
            text-anchor="middle" dominant-baseline="middle">${text}</text>
    </svg>
  `;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

// Replace images
document.querySelectorAll('img').forEach((img, i) => {
  const name = `image_${i + 1}`;
  img.setAttribute('src', createPlaceholder(img.width || 400, img.height || 300, `{{${name}}}`));
  img.setAttribute('data-token', name);
  img.removeAttribute('srcset'); // Remove srcset to avoid broken paths
});
```

**Placeholder options:**
1. **Gray boxes with token names** (recommended - shows where images go)
2. **Single color SVG** (minimal)
3. **"Replace Me" text** (explicit)

### 6.4: Link Placeholder Replacement

Replace external links with placeholder tokens:

```javascript
// Replace hrefs
document.querySelectorAll('a[href]').forEach((a, i) => {
  const originalHref = a.getAttribute('href');

  // Skip anchor links
  if (originalHref.startsWith('#')) return;

  // Replace with token
  a.setAttribute('data-original-href', originalHref);
  a.setAttribute('href', `{{link_${i + 1}}}`);
});
```

### 6.5: Generate Token Manifest

Create a manifest listing all tokens that need to be filled:

```json
{
  "meta": {
    "source": "https://droplette.app",
    "templateCreated": "2024-01-15T12:00:00Z"
  },
  "tokens": {
    "text": [
      { "token": "{{headline}}", "selector": "h1", "originalValue": "An AI tool made to enhance designers." },
      { "token": "{{hero_description}}", "selector": ".hero p", "originalValue": "Create palettes in..." },
      { "token": "{{feature_1_title}}", "selector": ".feature:nth-child(1) h3", "originalValue": "Select from your frames" },
      { "token": "{{cta_text}}", "selector": ".cta-button", "originalValue": "Try in Figma" }
    ],
    "images": [
      { "token": "{{image_1}}", "selector": ".hero img", "originalUrl": "/plugin/select-mode.png", "dimensions": "320x480" },
      { "token": "{{image_2}}", "selector": ".feature:nth-child(1) img", "originalUrl": "/plugin/library-mode.png" }
    ],
    "links": [
      { "token": "{{link_1}}", "selector": ".cta-button", "originalUrl": "https://figma.com/plugin/123" },
      { "token": "{{link_2}}", "selector": ".footer a", "originalUrl": "https://relay.design" }
    ]
  }
}
```

### 6.6: Templatization Script

Run this post-processing step on the assembled HTML:

```javascript
// Run via Node.js script or mcp__playwright__browser_run_code

const templatize = (html) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const tokens = { text: [], images: [], links: [] };

  // === TEXT TOKENS ===
  let textIndex = 1;

  // Headlines
  doc.querySelectorAll('h1').forEach((el, i) => {
    const token = i === 0 ? '{{headline}}' : `{{headline_${i + 1}}}`;
    tokens.text.push({ token, selector: 'h1', originalValue: el.textContent.trim() });
    el.textContent = token;
  });

  doc.querySelectorAll('h2').forEach((el, i) => {
    const token = `{{section_title_${i + 1}}}`;
    tokens.text.push({ token, selector: 'h2', originalValue: el.textContent.trim() });
    el.textContent = token;
  });

  // Paragraphs (skip very short ones)
  doc.querySelectorAll('p').forEach((el, i) => {
    if (el.textContent.trim().length > 20) {
      const token = `{{body_text_${textIndex++}}}`;
      tokens.text.push({ token, selector: 'p', originalValue: el.textContent.trim() });
      el.textContent = token;
    }
  });

  // Buttons/CTAs
  doc.querySelectorAll('button, a.cta, a.button, [class*="btn"]').forEach((el, i) => {
    const token = `{{cta_text_${i + 1}}}`;
    tokens.text.push({ token, selector: el.tagName.toLowerCase(), originalValue: el.textContent.trim() });
    el.textContent = token;
  });

  // === IMAGE TOKENS ===
  const placeholderSvg = (w, h, label) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="100%" height="100%" fill="#374151"/>
      <text x="50%" y="50%" font-family="system-ui" font-size="14" fill="#9CA3AF" text-anchor="middle" dominant-baseline="middle">${label}</text>
    </svg>`;
    return 'data:image/svg+xml;base64,' + btoa(svg);
  };

  doc.querySelectorAll('img').forEach((el, i) => {
    const token = `{{image_${i + 1}}}`;
    const w = el.getAttribute('width') || el.naturalWidth || 400;
    const h = el.getAttribute('height') || el.naturalHeight || 300;

    tokens.images.push({
      token,
      originalUrl: el.src,
      dimensions: `${w}x${h}`
    });

    el.src = placeholderSvg(w, h, token);
    el.removeAttribute('srcset');
    el.setAttribute('data-token', token);
  });

  // === LINK TOKENS ===
  doc.querySelectorAll('a[href]').forEach((el, i) => {
    const href = el.getAttribute('href');
    if (!href.startsWith('#') && !href.startsWith('{{')) {
      const token = `{{link_${i + 1}}}`;
      tokens.links.push({ token, originalUrl: href });
      el.setAttribute('href', '#');
      el.setAttribute('data-token', token);
    }
  });

  return {
    html: doc.documentElement.outerHTML,
    tokens
  };
};
```

### 6.7: Output Template Files

```
output/<domain>-v3-<timestamp>/
├── index.html           # Self-contained clone
├── template.html        # ← TEMPLATE (tokens replaced)
├── tokens.json          # Token manifest with original values
├── raw-source.html      # Original HTML
└── assets/              # Downloaded assets (for reference)
```

### 6.8: Template Report

```
=== TEMPLATE CREATED ===

Source: https://droplette.app
Template: output/droplette-v3/template.html

=== TOKENS TO FILL ===

TEXT (12 tokens):
  {{headline}}           → "An AI tool made to enhance designers."
  {{hero_description}}   → "Create palettes in Figma & FigJam..."
  {{section_title_1}}    → "Simple to setup."
  {{feature_1_title}}    → "Select from your frames"
  ...

IMAGES (5 tokens):
  {{image_1}}            → 320x480 (hero product mockup)
  {{image_2}}            → 400x300 (feature screenshot)
  ...

LINKS (3 tokens):
  {{link_1}}             → "https://figma.com/plugin/123" (CTA)
  {{link_2}}             → "https://relay.design" (footer)
  ...

=== USAGE ===
1. Open template.html
2. Search/replace each {{token}} with your content
3. Replace placeholder images with your own
4. Update links to your URLs

The styling, layout, and design are preserved - just swap content!
```

---

## Phase 7: Extract WebGL Shaders (If Present)

This phase captures any WebGL shaders used for visual effects (gradients, noise, animations). Consistent with v3's philosophy: **extract actual source, don't approximate**.

### 7.1: Why Extract Shaders?

Many modern sites use WebGL for:
- Animated gradient backgrounds (Vercel, Linear)
- Noise/grain effects
- Fluid simulations (Lusion)
- Parallax and scroll effects
- Glassmorphism/blur effects

These are impossible to recreate from screenshots. Extracting the actual shader code preserves the exact "feel" of the site.

### 7.2: Inject Shader Interception (BEFORE Navigation)

**CRITICAL**: This must be injected before `page.goto()` so it captures shaders as they compile.

```javascript
// Run via page.addInitScript() BEFORE navigating
await page.addInitScript(() => {
  // Storage for captured shaders
  window.__capturedShaders = [];
  window.__capturedUniforms = [];

  // Hook WebGLRenderingContext.shaderSource
  const originalShaderSource = WebGLRenderingContext.prototype.shaderSource;
  WebGLRenderingContext.prototype.shaderSource = function(shader, source) {
    try {
      const type = this.getShaderParameter(shader, this.SHADER_TYPE);
      window.__capturedShaders.push({
        type: type === this.VERTEX_SHADER ? 'vertex' : 'fragment',
        source: source,
        timestamp: Date.now(),
        context: 'webgl'
      });
    } catch (e) {}
    return originalShaderSource.call(this, shader, source);
  };

  // Hook WebGL2RenderingContext.shaderSource
  if (window.WebGL2RenderingContext) {
    const originalShaderSource2 = WebGL2RenderingContext.prototype.shaderSource;
    WebGL2RenderingContext.prototype.shaderSource = function(shader, source) {
      try {
        const type = this.getShaderParameter(shader, this.SHADER_TYPE);
        window.__capturedShaders.push({
          type: type === this.VERTEX_SHADER ? 'vertex' : 'fragment',
          source: source,
          timestamp: Date.now(),
          context: 'webgl2'
        });
      } catch (e) {}
      return originalShaderSource2.call(this, shader, source);
    };
  }

  // Track uniform names (for design token mapping)
  const originalGetUniformLocation = WebGLRenderingContext.prototype.getUniformLocation;
  WebGLRenderingContext.prototype.getUniformLocation = function(program, name) {
    const location = originalGetUniformLocation.call(this, program, name);
    if (location) {
      window.__capturedUniforms.push({ name, timestamp: Date.now() });
    }
    return location;
  };

  if (window.WebGL2RenderingContext) {
    const originalGetUniformLocation2 = WebGL2RenderingContext.prototype.getUniformLocation;
    WebGL2RenderingContext.prototype.getUniformLocation = function(program, name) {
      const location = originalGetUniformLocation2.call(this, program, name);
      if (location) {
        window.__capturedUniforms.push({ name, timestamp: Date.now() });
      }
      return location;
    };
  }
});
```

### 7.3: Extract Captured Shaders (After Page Load)

After page loads and settles, retrieve the captured data:

```javascript
// Run via mcp__playwright__browser_evaluate
() => {
  const shaders = window.__capturedShaders || [];
  const uniforms = window.__capturedUniforms || [];

  // Also check for inline shader scripts
  const inlineShaders = [];
  document.querySelectorAll('script[type*="shader"], script[type*="glsl"]').forEach(script => {
    inlineShaders.push({
      type: script.type,
      id: script.id,
      content: script.textContent
    });
  });

  // Check for Three.js
  const threeJs = window.THREE ? { version: window.THREE.REVISION } : null;

  // Get canvas info
  const canvases = Array.from(document.querySelectorAll('canvas')).map(c => ({
    width: c.width,
    height: c.height,
    id: c.id,
    className: c.className
  }));

  return {
    shaders,
    uniforms,
    inlineShaders,
    threeJs,
    canvases,
    hasWebGL: shaders.length > 0 || inlineShaders.length > 0
  };
}
```

### 7.4: Parse Uniforms from Shader Source

Extract uniform declarations to identify parameterizable values:

```javascript
const parseUniforms = (shaderSource) => {
  const uniforms = [];
  const uniformRegex = /uniform\s+(float|int|vec2|vec3|vec4|mat3|mat4|sampler2D)\s+(\w+)/g;

  let match;
  while ((match = uniformRegex.exec(shaderSource)) !== null) {
    uniforms.push({
      type: match[1],
      name: match[2],
      // Map common uniform names to design token purposes
      purpose: inferUniformPurpose(match[2])
    });
  }

  return uniforms;
};

const inferUniformPurpose = (name) => {
  const n = name.toLowerCase();
  if (n.includes('time')) return 'animation_speed';
  if (n.includes('color')) return 'theme_color';
  if (n.includes('resolution') || n.includes('width') || n.includes('height')) return 'viewport';
  if (n.includes('noise') || n.includes('grain')) return 'texture_effect';
  if (n.includes('scale')) return 'effect_intensity';
  if (n.includes('opacity') || n.includes('alpha')) return 'transparency';
  if (n.includes('offset')) return 'position';
  return 'custom';
};
```

### 7.5: Output Shaders.json

Save extracted shaders with design token mapping:

```json
{
  "meta": {
    "source": "https://vercel.com",
    "extractedAt": "2024-01-15T12:00:00Z",
    "context": "webgl2",
    "threeJs": null
  },
  "shaders": [
    {
      "type": "vertex",
      "source": "#version 300 es\nin vec4 position;\nin vec2 uv;\nout vec2 vUv;\nvoid main(){\n  vUv = uv;\n  gl_Position = position;\n}"
    },
    {
      "type": "fragment",
      "source": "#version 300 es\nprecision mediump float;\n\nout vec4 fragColor;\n\nuniform float time;\nuniform float width;\nuniform float height;\n\n// ... full shader code ...",
      "uniforms": [
        { "name": "time", "type": "float", "purpose": "animation_speed" },
        { "name": "width", "type": "float", "purpose": "viewport" },
        { "name": "height", "type": "float", "purpose": "viewport" }
      ]
    }
  ],
  "designTokens": {
    "animation": {
      "speed": "time uniform - controls animation rate"
    },
    "effects": {
      "noiseScale": "Extracted from shader - simplex noise frequency",
      "grainIntensity": "blendOverlay opacity parameter (0.2)"
    },
    "colors": {
      "gradient1": "vec3(0.45, 0.29, 0.45) - purple",
      "gradient2": "vec3(0.5, 0.3, 0.1) - brown",
      "gradient3": "vec3(1.0, 1.1, 1.1) - white",
      "gradient4": "vec3(0.38, 0.25, 1.1) - blue"
    }
  },
  "canvases": [
    { "width": 1920, "height": 1080, "id": "background-canvas" }
  ]
}
```

### 7.6: Updated Phase 0 (Navigation with Shader Hooks)

**IMPORTANT**: Phase 0 must be modified to inject shader hooks BEFORE navigation:

```javascript
// STEP 1: Create browser context
const context = await browser.newContext();
const page = await context.newPage();

// STEP 2: Inject shader interception (BEFORE navigation!)
await page.addInitScript(() => {
  // ... shader interception code from 7.2 ...
});

// STEP 3: Now navigate
await page.goto(url, { waitUntil: 'domcontentloaded' });

// STEP 4: Wait for WebGL to initialize
await page.waitForTimeout(3000);

// STEP 5: Scroll to trigger lazy effects
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
await page.waitForTimeout(1000);

// STEP 6: Extract shaders
const shaderData = await page.evaluate(() => ({
  shaders: window.__capturedShaders,
  uniforms: window.__capturedUniforms
}));
```

### 7.7: Output Files Updated

```
output/<domain>-v3-<timestamp>/
├── index.html           # Self-contained clone
├── template.html        # Template with tokens
├── tokens.json          # Content tokens
├── shaders.json         # ← NEW: WebGL shaders with design tokens
├── raw-source.html      # Original HTML
└── assets/              # Downloaded assets
```

### 7.8: Shader Extraction Report

```
=== WEBGL SHADERS EXTRACTED ===

Context: WebGL2
Three.js: No

Shaders Captured: 2
  [vertex]   Basic passthrough (position, UV)
  [fragment] Simplex noise gradient with film grain

Uniforms (Design Tokens):
  time     float  → animation_speed
  width    float  → viewport
  height   float  → viewport

Embedded Colors:
  color1: rgb(115, 74, 115)  - purple
  color2: rgb(128, 77, 26)   - brown
  color3: rgb(255, 255, 255) - white
  color4: rgb(97, 64, 255)   - blue

Effects Detected:
  ✓ Simplex noise (snoise function)
  ✓ Film grain (random + blendOverlay)
  ✓ Color palette animation
  ✓ Brightness/contrast adjustment

Output: shaders.json
```

### 7.9: Using Extracted Shaders

To recreate the effect in your clone:

1. **Include the shader code** - Copy vertex + fragment shaders
2. **Set up WebGL canvas** - Create canvas and get WebGL context
3. **Compile shaders** - Use standard WebGL shader compilation
4. **Set uniforms** - Pass time, resolution values
5. **Animate** - Use requestAnimationFrame to update time uniform

```javascript
// Basic setup to use extracted shader
const canvas = document.getElementById('bg-canvas');
const gl = canvas.getContext('webgl2');

// ... compile shaders from shaders.json ...

// Animation loop
function render(time) {
  gl.uniform1f(timeLocation, time * 0.001);
  gl.uniform1f(widthLocation, canvas.width);
  gl.uniform1f(heightLocation, canvas.height);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
```

---

## Phase 8: Convert JS-Driven Animations to CSS

Many modern sites use JavaScript (React, Svelte, Vue) to control animations via inline style changes. When we strip JS, these animations break. This phase detects and converts them to pure CSS.

### 8.1: Why This Matters

JS-driven animations work by:
```javascript
// Svelte/React pattern
element.style.opacity = isVisible ? 1 : 0;
element.style.transform = isVisible ? 'scale(1)' : 'scale(0.5)';
```

The CSS has `transition: all 1s ease-in-out` but the actual trigger is JS. Without JS, elements stay at their initial state (often invisible).

**Example from Droplette:**
```css
.circle {
  opacity: 0;                    /* Initial: invisible */
  transform: scale(.5);          /* Initial: small */
  transition: all 1s ease-in-out; /* Ready to animate... but JS never fires */
}
```

### 8.2: Detect JS-Controlled Animations

Look for elements with:
1. `transition` property set
2. Initial state that suggests animation (opacity: 0, transform with scale < 1, translateY offset)
3. No corresponding `@keyframes` animation

```javascript
// Run via mcp__playwright__browser_evaluate
() => {
  const jsAnimatedElements = [];

  document.querySelectorAll('*').forEach(el => {
    const style = getComputedStyle(el);
    const transition = style.transition;

    // Skip if no transition or if already has keyframe animation
    if (!transition || transition === 'all 0s ease 0s') return;
    if (style.animationName && style.animationName !== 'none') return;

    // Check for "hidden" initial states that suggest JS animation
    const opacity = parseFloat(style.opacity);
    const transform = style.transform;

    const isHidden = opacity === 0 || opacity < 0.1;
    const isScaledDown = transform.includes('scale') &&
      (transform.includes('0.') || transform.includes('scale(0'));
    const isOffscreen = transform.includes('translate') &&
      (transform.includes('100') || transform.includes('-100'));

    if (isHidden || isScaledDown || isOffscreen) {
      jsAnimatedElements.push({
        selector: generateSelector(el),
        className: el.className,
        transition: transition,
        initialState: {
          opacity: style.opacity,
          transform: style.transform,
        },
        suggestedAnimation: inferAnimation(style)
      });
    }
  });

  return jsAnimatedElements;
}
```

### 8.3: Generate CSS Keyframe Replacements

Convert detected patterns to CSS animations:

```javascript
const generateKeyframes = (element) => {
  const { initialState, transition } = element;
  const duration = parseTransitionDuration(transition);
  const easing = parseTransitionEasing(transition);

  // Parse initial transform values
  const initialOpacity = parseFloat(initialState.opacity) || 0;
  const initialScale = parseScale(initialState.transform) || 0.5;
  const initialRotate = parseRotate(initialState.transform) || 0;

  return {
    keyframes: `
      @keyframes auto-animate-${element.id} {
        0%, 100% {
          opacity: ${initialOpacity};
          transform: scale(${initialScale}) rotate(${initialRotate}deg);
        }
        50% {
          opacity: 1;
          transform: scale(1) rotate(0deg);
        }
      }
    `,
    rule: `.${element.className} { animation: auto-animate-${element.id} ${duration * 2}s ${easing} infinite; }`,
    tokens: {
      duration: duration,
      easing: easing,
      initialOpacity: initialOpacity,
      initialScale: initialScale,
      peakOpacity: 1,
      peakScale: 1
    }
  };
};
```

### 8.4: Stagger Pattern Detection

For grid/list animations, detect and generate staggered delays:

```javascript
const generateStaggeredDelays = (elements, baseDelay = 0.1) => {
  const rules = [];

  // Group by parent (for grid detection)
  const groups = groupByParent(elements);

  groups.forEach(group => {
    const isGrid = group.length > 6; // Likely a grid pattern

    if (isGrid) {
      // Generate nth-child based stagger
      rules.push(`
        /* Staggered animation for ${group[0].parentSelector} */
        ${group[0].parentSelector} > *:nth-child(1) { animation-delay: 0s; }
        ${group[0].parentSelector} > *:nth-child(2) { animation-delay: ${baseDelay}s; }
        ${group[0].parentSelector} > *:nth-child(3) { animation-delay: ${baseDelay * 2}s; }
        /* ... pattern continues with prime-based pseudo-random delays */
        ${group[0].parentSelector} > *:nth-child(3n) { animation-delay: ${baseDelay * 7}s; }
        ${group[0].parentSelector} > *:nth-child(5n) { animation-delay: ${baseDelay * 13}s; }
        ${group[0].parentSelector} > *:nth-child(7n) { animation-delay: ${baseDelay * 4}s; }
      `);
    }
  });

  return rules;
};
```

### 8.5: Output animations.json

Save detected animations with customizable tokens:

```json
{
  "meta": {
    "source": "https://droplette.app",
    "extractedAt": "2024-01-15T12:00:00Z",
    "totalAnimations": 3
  },
  "animations": [
    {
      "name": "dot-pulse",
      "selector": ".dots .circle",
      "type": "pulse",
      "keyframes": "@keyframes dot-pulse { 0%, 100% { opacity: 0; transform: scale(0.5) rotate(45deg); } 50% { opacity: 1; transform: scale(1) rotate(0deg); } }",
      "tokens": {
        "duration": { "value": 4, "unit": "s", "purpose": "animation_speed" },
        "easing": { "value": "ease-in-out", "purpose": "animation_feel" },
        "stagger_base": { "value": 0.3, "unit": "s", "purpose": "cascade_timing" },
        "initial_opacity": { "value": 0, "purpose": "start_visibility" },
        "initial_scale": { "value": 0.5, "purpose": "start_size" },
        "peak_opacity": { "value": 1, "purpose": "end_visibility" },
        "peak_scale": { "value": 1, "purpose": "end_size" }
      }
    },
    {
      "name": "fade-in-up",
      "selector": ".hero-content",
      "type": "entrance",
      "keyframes": "@keyframes fade-in-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }",
      "tokens": {
        "duration": { "value": 0.6, "unit": "s" },
        "easing": { "value": "cubic-bezier(0.4, 0, 0.2, 1)" },
        "offset_y": { "value": 20, "unit": "px" }
      }
    }
  ],
  "staggerPatterns": [
    {
      "name": "dot-grid-stagger",
      "parentSelector": ".dots .dot-holder",
      "childSelector": ".dot",
      "pattern": "prime-based",
      "baseDelay": 0.3,
      "css": "/* nth-child rules */"
    }
  ],
  "generatedCSS": "/* Full CSS to inject */\n@keyframes dot-pulse {...}\n.dots .circle { animation: dot-pulse 4s ease-in-out infinite; }\n..."
}
```

### 8.6: Inject Generated CSS

Add the generated animations to the clone:

```javascript
// After Phase 3 (Clean & Transform), before Phase 4 (Assemble)

const injectAnimationCSS = (html, animationsData) => {
  const css = animationsData.generatedCSS;

  // Find last </style> tag and inject before it
  const lastStyleClose = html.lastIndexOf('</style>');
  if (lastStyleClose !== -1) {
    html = html.slice(0, lastStyleClose) + '\n' + css + '\n' + html.slice(lastStyleClose);
  }

  return html;
};
```

### 8.7: Animation Token Integration

Add animation tokens to the main tokens.json:

```json
{
  "meta": { ... },
  "tokens": {
    "text": [ ... ],
    "images": [ ... ],
    "links": [ ... ],
    "animations": [
      {
        "token": "{{animation_dot_duration}}",
        "selector": ".dots .circle",
        "property": "animation-duration",
        "originalValue": "4s",
        "purpose": "Controls how fast dots pulse"
      },
      {
        "token": "{{animation_dot_stagger}}",
        "selector": ".dot:nth-child(n)",
        "property": "animation-delay",
        "originalValue": "0.3s base",
        "purpose": "Delay between dot animations"
      },
      {
        "token": "{{animation_easing}}",
        "selector": ".dots .circle",
        "property": "animation-timing-function",
        "originalValue": "ease-in-out",
        "purpose": "Animation feel (snappy vs smooth)"
      }
    ]
  }
}
```

### 8.8: Common Animation Patterns

Detect and label these common JS-animation patterns:

| Pattern | Initial State | Animation Type |
|---------|--------------|----------------|
| **Fade In** | opacity: 0 | Entrance |
| **Scale Up** | transform: scale(0.5-0.9) | Entrance/Pulse |
| **Slide Up** | transform: translateY(20-100px) | Entrance |
| **Slide In** | transform: translateX(-100%) | Entrance |
| **Rotate In** | transform: rotate(45-90deg) | Entrance |
| **Pulse** | opacity: 0 + scale | Looping |
| **Stagger Grid** | Multiple children with transitions | Cascade |

### 8.9: Output Files Updated

```
output/<domain>-v3-<timestamp>/
├── index.html           # Clone with injected CSS animations
├── template.html        # Template with animation tokens
├── tokens.json          # Content + animation tokens
├── animations.json      # ← NEW: Extracted animation definitions
├── shaders.json         # WebGL shaders (if any)
└── assets/
```

### 8.10: Animation Extraction Report

```
=== JS-DRIVEN ANIMATIONS CONVERTED ===

Detected: 3 animation patterns
Converted: 3 to CSS keyframes

[1] Dot Pulse Grid
    Selector: .dots .circle
    Type: Looping pulse
    Original: opacity 0→1, scale 0.5→1, rotate 45°→0°
    Duration: 4s (inferred from transition)
    Stagger: 18 columns × 5 rows with prime-based delays

[2] Hero Fade In
    Selector: .hero-content
    Type: Entrance
    Original: opacity 0→1, translateY 20px→0
    Duration: 0.6s

[3] Button Shine Sweep
    Selector: .shine
    Type: Looping
    Already CSS keyframes ✓ (preserved)

Tokens Generated:
  {{animation_dot_duration}} = 4s
  {{animation_dot_stagger}} = 0.3s
  {{animation_easing}} = ease-in-out

Output: animations.json
```

---

## Quick Reference: Clone vs Template

| Output | Purpose | Use When |
|--------|---------|----------|
| `index.html` | Exact visual clone | Testing, reference, archiving |
| `template.html` | Reusable template | Building new pages using the design |
| `tokens.json` | Content manifest | Programmatic content replacement |
| `shaders.json` | WebGL effects | Recreating animated backgrounds/effects |
| `animations.json` | CSS animations | Customizing timing, easing, effects |
