---
name: clone
description: Clone a website pixel-perfect, templatize it, and extract design tokens
arguments:
  - name: url
    description: The URL to clone
    required: true
---

# Clone Website Command

Clone the website at **$ARGUMENTS** pixel-perfect, then automatically templatize (generic copy) and extract design tokens for coding agents.

## Quick Start Checklist

1. **Scroll through ENTIRE page** - Capture viewport-by-viewport, don't rely on JS section detection alone
2. **Name sections descriptively** - `00-nav-hero`, `01-logos`, `02-features`, `03-testimonials`, `04-footer`
3. **Pass section index to agents** - So they know if they're section 0 (include nav) or not (skip nav)
4. **Tell agents about colors** - Read screenshots yourself first to note actual colors (don't assume!)
5. **Assemble clone** - `node tools/assemble.js output/<dir>/`
6. **Templatize all sections** - Spawn parallel agents to rewrite text to generic copy
7. **Assemble template** - `node tools/assemble.js output/<dir>-template/`
8. **Extract design tokens** - Parse CSS and write design-tokens.json
9. **Open result** - `open output/<dir>-template/assembled.html`

## Common Pitfalls (Avoid These!)

| Problem | Cause | Solution |
|---------|-------|----------|
| Duplicate nav bars | Each screenshot shows fixed nav, each agent includes it | Only section 0 should include nav bar |
| Missing sections | JS analysis doesn't find all sections | Scroll viewport-by-viewport through entire page |
| Wrong colors | Agent guesses instead of reading screenshot | Main agent reads screenshots first, passes color notes to sub-agents |
| Purple instead of blue | Agent makes assumptions | Explicitly tell agents the exact hex colors from analysis |

## Architecture

```
PHASE 1: Main Agent - Screenshot Capture (Sequential)
├── Navigate once
├── Analyze page structure
├── Capture ALL section screenshots
└── Save manifest with screenshot paths

PHASE 2: Sub-Agents - HTML Generation (Parallel)
├── Read ONE screenshot file
├── Generate HTML/CSS
├── Write output file
└── Exit (NO iteration)

PHASE 3: Main Agent - Assembly (Clone)
├── Run assembler on clone directory
└── Verify assembled.html created

PHASE 4: Sub-Agents - Templatize (Parallel)
├── Read ONE section HTML file
├── Rewrite text to generic copy
├── Write to template directory
└── Exit (NO iteration)

PHASE 5: Main Agent - Extract Design Tokens
├── Read assembled.html
├── Parse CSS and extract values
└── Write design-tokens.json

PHASE 6: Main Agent - Final Output
├── Run assembler on template directory
└── Open result and report paths
```

**Key Insight**: Sub-agents don't need Playwright. They only Read and Write files.

## Process

### Phase 1: Setup & Centralized Screenshot Capture

1. Navigate to the URL using `mcp__playwright__browser_navigate`

2. Create output directory: `output/<domain>-<timestamp>/`

3. Create screenshots subdirectory: `output/<domain>-<timestamp>/screenshots/`

4. Run this script via `mcp__playwright__browser_evaluate` to analyze page structure:

```javascript
() => {
  const sections = [];
  const seenBounds = new Set();

  function boundsKey(rect) {
    return Math.round(rect.top / 100) + '-' + Math.round(rect.height / 100);
  }

  function getDescription(el) {
    const h = el.querySelector('h1, h2, h3');
    return h ? h.textContent.trim().substring(0, 50) : el.textContent.trim().substring(0, 50);
  }

  // Find semantic sections
  document.querySelectorAll('header, nav, main, section, footer, [class*="hero"], [class*="section"]').forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    if (rect.height < 100) return;

    const key = boundsKey(rect);
    if (seenBounds.has(key)) return;
    seenBounds.add(key);

    sections.push({
      id: el.id || el.className?.split(' ')[0] || `section-${i}`,
      selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : `section:nth-of-type(${i+1})`,
      bounds: { top: rect.top + window.scrollY, height: rect.height },
      description: getDescription(el)
    });
  });

  return sections.slice(0, 10); // Limit to 10 sections
}
```

5. **CAPTURE ALL SCREENSHOTS** (Main agent does this, NOT sub-agents):

   **IMPORTANT**: Don't rely solely on the JS analysis. Scroll through the ENTIRE page viewport-by-viewport:

   ```javascript
   // Get total page height
   mcp__playwright__browser_evaluate({
     function: `() => ({ height: document.body.scrollHeight, viewport: window.innerHeight })`
   })
   ```

   Then capture screenshots by scrolling in ~800px increments:
   ```javascript
   // For each viewport position (0, 800, 1600, etc.):
   mcp__playwright__browser_evaluate({
     function: `() => window.scrollTo(0, ${scrollPosition})`
   })

   mcp__playwright__browser_wait_for({ time: 0.5 })

   mcp__playwright__browser_take_screenshot({
     filename: `${sectionNumber}-${sectionName}.png`  // e.g., "00-nav-hero.png", "01-logos.png"
   })
   ```

   Name sections descriptively based on what's visible in each viewport (hero, logos, features, testimonials, footer, etc.).

6. Extract design tokens via `mcp__playwright__browser_evaluate`:
```javascript
() => {
  const body = getComputedStyle(document.body);
  const h1 = document.querySelector('h1');
  const h1Style = h1 ? getComputedStyle(h1) : null;
  const button = document.querySelector('button, [class*="btn"], a[class*="button"]');
  const btnStyle = button ? getComputedStyle(button) : null;

  return {
    colors: {
      background: body.backgroundColor,
      text: body.color,
      heading: h1Style?.color || body.color,
      accent: btnStyle?.backgroundColor || '#5E6AD2'
    },
    fonts: {
      body: body.fontFamily,
      heading: h1Style?.fontFamily || body.fontFamily
    }
  };
}
```

7. Save manifest.json with all section info and screenshot paths

### Phase 2: Parallel HTML Generation

For each section, spawn a **sub-agent** using the Task tool with `subagent_type: "general-purpose"`.

**CRITICAL**: Spawn ALL section agents in a SINGLE message with multiple Task tool calls to run them in parallel.

**CRITICAL**: Sub-agents do NOT use Playwright. They only use Read and Write tools.

Each section agent prompt:

```
Generate pixel-perfect HTML for this website section.

=== INPUT ===
Screenshot file: <output_dir>/screenshots/{order}-{section.id}.png
Section index: {order} (0 = first section)
Section ID: {section.id}
Section description: {section.description}
Output file: <output_dir>/{order}-{section.id}.html

Design tokens:
- Background: {tokens.colors.background}
- Text: {tokens.colors.text}
- Heading: {tokens.colors.heading}
- Accent: {tokens.colors.accent}
- Body font: {tokens.fonts.body}
- Heading font: {tokens.fonts.heading}

=== YOUR TASK ===
1. Read the screenshot file using the Read tool (ONE read)
2. Generate HTML with embedded <style> that matches the screenshot EXACTLY
3. Write to the output file using the Write tool
4. Exit immediately - you are done

=== CRITICAL NAV BAR RULE ===
**If section index is 0**: Include the navigation bar (fixed header with logo, nav links, CTA button)
**If section index is NOT 0**: Do NOT include any navigation bar, even if visible in the screenshot (it's the fixed nav showing through)

This prevents duplicate nav bars in the final assembled page!

=== RULES ===
- You have NO access to Playwright or browser tools
- You can ONLY use Read and Write tools
- Prefix ALL CSS classes with "{section.id}-" for namespacing
- Use CSS-only graphics (gradients, shapes, box-shadows) - no external images
- Match the exact colors, fonts, and spacing from the screenshot
- Use the design tokens provided for consistency
- DO NOT include nav bar unless this is section 0

=== OUTPUT FORMAT ===
<style>
.{section.id} { /* container */ }
.{section.id}-element { /* elements */ }
</style>
<div class="{section.id}">
  <!-- content matching screenshot -->
</div>

Remember: Read screenshot → Generate HTML → Write file → Exit. Nothing else.
```

### Phase 3: Assembly

After all agents complete, run the assembler:
```bash
node tools/assemble.js output/<domain>-<timestamp>/
```

### Phase 4: Templatize (Generic Copy)

Create a template version with generic text (no copyright issues):

1. Create template directory: `output/<domain>-<timestamp>-template/`

2. For each section HTML file, spawn a sub-agent to rewrite text:

**CRITICAL**: Spawn ALL templatize agents in a SINGLE message with multiple Task tool calls.

Each templatize agent prompt:
```
Templatize this HTML section by rewriting all text content to be generic placeholders.

=== INPUT ===
HTML file: <clone_dir>/{filename}
Output file: <template_dir>/{filename}

=== YOUR TASK ===
1. Read the HTML file using the Read tool
2. Rewrite ALL text content to be generic/placeholder while keeping HTML structure and CSS EXACTLY the same
3. Write the templatized HTML to the output file
4. Exit immediately

=== TEXT REPLACEMENT RULES ===

**IMPORTANT: Write REAL copy, NOT placeholder brackets like [Feature] or [Your text here]. Everything should read like a real website.**

**Company/Brand Names:**
- Specific company name → "Acme" (use consistently throughout)
- Domain names → "acme.com"

**Headlines & Copy:**
- Write real marketing copy that sounds professional
- Keep the same tone, length, and energy
- "The better way to schedule meetings" → "The better way to grow your business"
- NO brackets or placeholders - write actual text

**Statistics & Numbers:**
- "5000+ teams" → "2000+ customers"
- Use realistic but generic numbers

**Testimonials:**
- Replace real names with generic: "Sarah J.", "Mike T.", "Alex K."
- Replace real companies with generic: "Tech Startup", "E-commerce Brand"
- Write real-sounding generic praise:
  - "This product transformed how our team works. Highly recommend!"
  - "We switched 6 months ago and never looked back."

**Feature Descriptions:**
- Write real benefit-focused descriptions
- "Connect your Google Calendar" → "Connect your favorite tools"

**CTAs:**
- Keep generic: "Get Started", "Learn More", "Sign Up", "Contact Sales"

**Logos Section:**
- Replace company names with: "Nexus", "Cloudify", "DataSync", "Flowbase", "TechCorp"

=== CRITICAL RULES ===
- DO NOT modify any CSS or HTML structure
- DO NOT change class names, IDs, or element hierarchy
- ONLY replace text content inside elements
- Keep the same text length approximately
```

3. After all agents complete, run assembler on template directory:
```bash
node tools/assemble.js <template_dir>/
```

### Phase 5: Extract Design Tokens & Generate Theme Files

Generate the complete template package with exact structure required by coding agents.

#### 5.1: Determine Theme Type

First, analyze the page to determine if it's a dark or light theme:

```javascript
() => {
  const bg = getComputedStyle(document.body).backgroundColor;
  const rgb = bg.match(/\d+/g)?.map(Number) || [255, 255, 255];
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luminance < 0.5 ? 'dark' : 'light';
}
```

#### 5.2: Extract Comprehensive Design Tokens

Run this extraction script via `mcp__playwright__browser_evaluate`:

```javascript
() => {
  const getStyle = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el) : null;
  };

  const body = getComputedStyle(document.body);
  const h1 = getStyle('h1');
  const h2 = getStyle('h2');
  const h3 = getStyle('h3');
  const h4 = getStyle('h4');
  const btn = getStyle('button, [class*="btn"], a[class*="button"]');
  const card = getStyle('[class*="card"], [class*="panel"]');
  const input = getStyle('input, [class*="input"]');
  const small = getStyle('small, [class*="small"], [class*="muted"]');

  // Determine theme type
  const bgRgb = body.backgroundColor.match(/\d+/g)?.map(Number) || [255,255,255];
  const luminance = (0.299*bgRgb[0] + 0.587*bgRgb[1] + 0.114*bgRgb[2]) / 255;
  const themeType = luminance < 0.5 ? 'dark' : 'light';

  return {
    themeType,
    colors: {
      background: body.backgroundColor,
      text: body.color,
      heading: h1?.color || body.color,
      accent: btn?.backgroundColor || '#6366f1',
      cardBg: card?.backgroundColor || 'transparent',
      border: card?.borderColor || input?.borderColor || '#333',
      muted: small?.color || 'rgba(128,128,128,0.7)'
    },
    typography: {
      fontFamily: body.fontFamily,
      headingFamily: h1?.fontFamily || body.fontFamily,
      h1Size: h1?.fontSize || '48px',
      h2Size: h2?.fontSize || '36px',
      h3Size: h3?.fontSize || '24px',
      h4Size: h4?.fontSize || '18px',
      bodySize: body.fontSize || '16px',
      smallSize: small?.fontSize || '14px',
      lineHeight: body.lineHeight
    },
    spacing: {
      sectionPadding: '60px',
      cardPadding: card?.padding || '24px',
      gap: '16px'
    },
    borders: {
      radius: card?.borderRadius || btn?.borderRadius || '8px',
      inputRadius: input?.borderRadius || '6px'
    },
    shadows: {
      card: card?.boxShadow || 'none',
      button: btn?.boxShadow || 'none'
    }
  };
}
```

#### 5.3: Write design-tokens.json

Write the tokens in this **EXACT STRUCTURE** (required for token switching to work):

```json
{
  "meta": {
    "name": "<Template Name from domain>",
    "type": "<dark|light>",
    "source": "<original URL>"
  },

  "colors": {
    "primary": "<extracted heading/primary color>",
    "secondary": "<extracted secondary color>",
    "accent": "<extracted accent/button color>",
    "background": {
      "page": "<body background>",
      "card": "<card/panel background>",
      "hover": "<hover state background>"
    },
    "text": {
      "primary": "<main text color>",
      "secondary": "<secondary text color>",
      "muted": "<muted/subtle text>",
      "inverse": "<inverse text for buttons>"
    },
    "border": {
      "default": "<default border color>",
      "light": "<subtle border color>"
    },
    "status": {
      "success": "#00b67a",
      "warning": "#ff6b35",
      "error": "#ea4335"
    }
  },

  "typography": {
    "fonts": {
      "primary": "<extracted font family>"
    },
    "sizes": {
      "h1": "<extracted>",
      "h2": "<extracted>",
      "h3": "<extracted>",
      "h4": "<extracted>",
      "body": "<extracted>",
      "bodySmall": "<body - 2px>",
      "small": "<extracted>",
      "xsmall": "<small - 1px>",
      "xxsmall": "<small - 2px>"
    },
    "weights": {
      "normal": "400",
      "medium": "500",
      "semibold": "600",
      "bold": "700"
    },
    "lineHeights": {
      "tight": "1.1",
      "snug": "1.25",
      "normal": "1.5",
      "relaxed": "1.6"
    }
  },

  "spacing": {
    "xxs": "4px",
    "xs": "8px",
    "sm": "12px",
    "md": "16px",
    "lg": "24px",
    "xl": "32px",
    "xxl": "40px",
    "section": "<extracted section padding>"
  },

  "borders": {
    "radius": {
      "xs": "4px",
      "sm": "6px",
      "md": "8px",
      "lg": "12px",
      "xl": "16px",
      "xxl": "24px",
      "full": "9999px"
    }
  },

  "shadows": {
    "xs": "<appropriate for theme type>",
    "sm": "<appropriate for theme type>",
    "md": "<appropriate for theme type>",
    "lg": "<appropriate for theme type>",
    "xl": "<appropriate for theme type>"
  }
}
```

**Shadow opacity by theme type:**
- Dark themes: higher opacity (0.3-0.7) - e.g., `"0 4px 12px rgba(0, 0, 0, 0.5)"`
- Light themes: lower opacity (0.05-0.2) - e.g., `"0 4px 12px rgba(0, 0, 0, 0.1)"`

#### 5.4: Write theme.css

Generate behavioral overrides based on theme type:

**For DARK templates** (`meta.type === "dark"`):

```css
/* theme.css - DARK TEMPLATE */

/* Borders need to be subtle on dark backgrounds */
.card, .panel, .modal, [class*="card"] {
  border-color: rgba(255, 255, 255, 0.1);
}

/* Inputs need visible backgrounds */
input, textarea, select, .input {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

input:focus, textarea:focus, .input:focus {
  border-color: var(--color-accent);
}

/* Buttons often invert on dark themes */
.btn-primary, .btn--primary, [class*="btn-primary"] {
  background: var(--color-primary);
  color: var(--color-background-page);
}

/* Dashed elements (drop zones, etc) */
[style*="dashed"], .dropzone, [class*="drop"] {
  border-color: rgba(255, 255, 255, 0.1);
}

/* Dividers/separators */
hr, .divider, [class*="divider"] {
  border-color: rgba(255, 255, 255, 0.1);
}
```

**For LIGHT templates** (`meta.type === "light"`):

```css
/* theme.css - LIGHT TEMPLATE */

/* Borders can be solid on light backgrounds */
.card, .panel, .modal, [class*="card"] {
  border-color: var(--color-border-default);
  box-shadow: var(--shadow-sm);
}

/* Inputs with standard styling */
input, textarea, select, .input {
  background: var(--color-background-card);
  border-color: var(--color-border-default);
}

/* Standard button colors */
.btn-primary, .btn--primary, [class*="btn-primary"] {
  background: var(--color-accent);
  color: white;
}
```

#### 5.5: Validation Checklist

Before completing Phase 5, verify:

- [ ] All required keys exist in design-tokens.json
- [ ] `meta.type` is set to "dark" or "light"
- [ ] `theme.css` exists with appropriate overrides
- [ ] Shadow opacities match theme type
- [ ] Border colors work on the background color

### Phase 6: Open Result

Open the final templatized result:
```bash
open <template_dir>/assembled.html
```

Report to user:
```
Clone complete!

=== OUTPUT FILES ===
Exact clone: output/<domain>-<timestamp>/assembled.html
Template:    output/<domain>-<timestamp>-template/

=== TEMPLATE PACKAGE ===
<template_dir>/
├── design-tokens.json    # All design values (EXACT structure)
├── theme.css             # Dark/light behavioral overrides
├── assembled.html        # Visual reference page
└── [section files]       # Individual section HTML

=== FOR CODING AGENTS ===
Provide these files:
1. Visual reference: <template_dir>/assembled.html
2. Design tokens:    <template_dir>/design-tokens.json
3. Theme overrides:  <template_dir>/theme.css
```

## Token Budget

| Phase | Agent | Expected Tokens |
|-------|-------|-----------------|
| 1 | Main | ~50K (screenshots + analysis) |
| 2 | Each clone sub-agent | ~70K (read screenshot + generate + write) |
| 3 | Main | ~5K (run assembler) |
| 4 | Each templatize sub-agent | ~30K (read HTML + rewrite text + write) |
| 5 | Main | ~20K (extract design tokens) |
| 6 | Main | ~5K (final assembly + open) |

**Total for 8 sections**: ~50K + (8 × 70K) + 5K + (8 × 30K) + 20K + 5K = **~880K tokens**

## Key Points

- **Full pipeline**: Clone → Templatize → Extract Tokens → Generate Theme in one command
- **Centralized screenshots**: Main agent captures ALL screenshots before spawning sub-agents
- **Sub-agents are constrained**: They only have Read + Write tools, no Playwright
- **Predictable token usage**: Each sub-agent reads ONE file, processes, writes, exits
- **Parallel execution**: Clone agents run in parallel, then templatize agents run in parallel
- **Resilient**: Assembler merges whatever sections completed
- **CSS namespacing**: Prevents conflicts between sections
- **Copyright-safe templates**: Generic text, no real company names or claims
- **Coding agent ready**: Exact token structure for seamless integration
- **Theme-aware**: Auto-detects dark/light and generates appropriate theme.css

## Template Output Structure

Every template MUST include these files:

```
<template_dir>/
├── design-tokens.json    # REQUIRED - exact structure for token switching
├── theme.css             # REQUIRED - dark/light behavioral overrides
├── assembled.html        # REQUIRED - visual reference page
├── 00-section.html       # Section files
├── 01-section.html
└── ...
```

### design-tokens.json Requirements

All tokens must use the EXACT structure specified in Phase 5.3. Missing keys will break token switching in coding agents. Key requirements:

1. `meta.type` must be "dark" or "light"
2. All color paths must exist: `colors.background.page`, `colors.text.primary`, etc.
3. All typography paths must exist: `typography.sizes.h1`, `typography.weights.bold`, etc.
4. Shadows must have appropriate opacity for theme type

### theme.css Requirements

Behavioral overrides that can't be fixed by swapping token values:

- Border colors (rgba for dark, solid for light)
- Input backgrounds
- Button color inversions
- Divider/separator styling
