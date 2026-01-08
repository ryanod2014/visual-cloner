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
| Duplicate content | Scroll-based screenshots overlap | Use element-based screenshots (one per section) |
| Missing sections | JS analysis doesn't find all sections | Check snapshot for marked elements, adjust selector query |
| Wrong colors | Agent guesses instead of reading screenshot | Main agent reads screenshots first, passes color notes to sub-agents |
| Purple instead of blue | Agent makes assumptions | Explicitly tell agents the exact hex colors from analysis |
| Light mode appearing | UI mockups inside dark page captured as-is | Tell agents the PAGE background is dark, inner mockups may differ |

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

### Phase 1: Setup & Element-Based Screenshot Capture

1. Navigate to the URL using `mcp__playwright__browser_navigate`

2. Create output directory: `output/<domain>-<timestamp>/`

3. Create screenshots subdirectory: `output/<domain>-<timestamp>/screenshots/`

4. **DETECT SECTIONS** - Run this script via `mcp__playwright__browser_evaluate` to find and mark all sections:

```javascript
() => {
  const sections = [];
  const seenTops = new Set();

  // Find all section-like elements
  const candidates = document.querySelectorAll('header, nav, main > *, section, footer, [class*="hero"], [class*="section"], [class*="container"] > div');

  candidates.forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    if (rect.height < 100 || rect.width < 200) return; // Skip tiny elements

    // Dedupe by top position (rounded to 50px)
    const topKey = Math.round((rect.top + window.scrollY) / 50);
    if (seenTops.has(topKey)) return;
    seenTops.add(topKey);

    // Mark element for screenshot
    const sectionId = `clone-section-${sections.length}`;
    el.setAttribute('data-clone-section', sectionId);

    // Get description from headings
    const heading = el.querySelector('h1, h2, h3');
    const description = heading?.textContent?.trim().substring(0, 40) || `section-${sections.length}`;

    sections.push({
      index: sections.length,
      sectionId: sectionId,
      selector: `[data-clone-section="${sectionId}"]`,
      top: rect.top + window.scrollY,
      height: rect.height,
      description: description.replace(/[^a-zA-Z0-9\s]/g, '').trim().toLowerCase().replace(/\s+/g, '-')
    });
  });

  // Sort by vertical position
  sections.sort((a, b) => a.top - b.top);

  // Re-index after sorting
  return sections.slice(0, 12).map((s, i) => ({ ...s, index: i }));
}
```

5. **CAPTURE ELEMENT SCREENSHOTS** (Main agent does this, NOT sub-agents):

   For each section detected, use `mcp__playwright__browser_take_screenshot` with the `ref` parameter to screenshot that specific element:

   ```javascript
   // First, get a snapshot to get element refs
   mcp__playwright__browser_snapshot()

   // Then for each section, find its ref in the snapshot and screenshot it
   // The ref will be in the snapshot output for elements with data-clone-section attribute

   mcp__playwright__browser_take_screenshot({
     ref: "<ref from snapshot>",
     element: "Section: <description>",
     filename: `${index}-${description}.png`  // e.g., "00-nav-hero.png", "01-features.png"
   })
   ```

   **ALTERNATIVE**: If element refs are hard to match, use `mcp__playwright__browser_run_code` to screenshot elements directly:

   ```javascript
   mcp__playwright__browser_run_code({
     code: `async (page) => {
       const sections = await page.$$('[data-clone-section]');
       const results = [];
       for (let i = 0; i < sections.length; i++) {
         const section = sections[i];
         const id = await section.getAttribute('data-clone-section');
         const buffer = await section.screenshot();
         // Save screenshot - you'll need to handle this via file system
         results.push({ index: i, id, captured: true });
       }
       return results;
     }`
   })
   ```

   **SIMPLEST APPROACH**: After marking sections, scroll each into view and take a viewport screenshot with clipping:

   ```javascript
   // For each section:
   mcp__playwright__browser_evaluate({
     function: `() => {
       const el = document.querySelector('[data-clone-section="clone-section-${index}"]');
       el.scrollIntoView({ block: 'start' });
       const rect = el.getBoundingClientRect();
       return { top: rect.top, height: Math.min(rect.height, 1200) }; // Cap height at 1200px
     }`
   })

   mcp__playwright__browser_wait_for({ time: 0.3 })

   mcp__playwright__browser_take_screenshot({
     filename: `${index}-${description}.png`
   })
   ```

   **KEY DIFFERENCE FROM BEFORE**: Each screenshot corresponds to exactly ONE section element. No overlapping content. If a section is very tall (>1200px), it will be cropped - that's OK, agents can infer the pattern.

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

=== VISUAL DETAILS - CRITICAL ===
Pay close attention to these commonly-missed details:

**Corner Radius:**
- Some buttons may be fully rounded (border-radius: 9999px), others square (border-radius: 0)
- Cards may have rounded corners or sharp edges - check each element individually
- Don't assume all similar elements share the same radius

**Letter Spacing:**
- Headlines often have TIGHT negative letter-spacing (-0.02em, -1px)
- Body text usually has normal (0) letter-spacing
- Check if text looks tightly or loosely spaced

**Text Transform:**
- If text appears in ALL CAPS, use `text-transform: uppercase` (don't just type capitals)
- Check for lowercase transforms too

**Borders:**
- Note which sides have borders: all sides vs bottom-only vs none
- Border width matters: 1px (thin) vs 2px (medium) vs thicker
- Solid vs dashed vs dotted

**Shadows:**
- Some elements are FLAT (no shadow) - don't add shadows that aren't there
- Note subtle shadows vs prominent ones
- Check for inset shadows

**Text Opacity:**
- Secondary text often uses rgba with opacity, not solid gray
- Example: `rgba(255,255,255,0.7)` for muted text on dark bg
- Preserves the color relationship with the background

**Font Weight:**
- Look for medium (500) and semibold (600), not just normal (400) and bold (700)
- Headlines may use 500 or 600, not always 700

**Max Width:**
- Text containers often have max-width limits (600px, 800px)
- Prevents text from spanning too wide on large screens
- Check if content is constrained or full-width

**Alignment:**
- Don't assume center - check if content is left, center, or right aligned
- Hero sections vary: some centered, some left-aligned
- Check each section individually

**Spacing:**
- Use consistent gap values in flex/grid containers
- Note asymmetric padding (more vertical than horizontal, or vice versa)
- Check spacing between specific elements

**Backdrop Effects:**
- Look for glassmorphism: `backdrop-filter: blur(10px)` with semi-transparent bg
- Common on navbars, modals, cards over images

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
    "description": "<Brief description of the template style>"
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
      "primary": "<extracted font family>",
      "heading": "<heading font family or same as primary>"
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
      "tight": "1.08",
      "snug": "1.2",
      "normal": "1.5",
      "relaxed": "1.6"
    },
    "letterSpacing": {
      "tight": "-1px",
      "snug": "-0.5px",
      "normal": "0"
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
      "none": "0",
      "xs": "4px",
      "sm": "6px",
      "md": "8px",
      "lg": "12px",
      "xl": "16px",
      "xxl": "24px",
      "full": "9999px"
    },
    "width": {
      "thin": "1px",
      "medium": "2px",
      "thick": "4px"
    }
  },

  "shadows": {
    "xs": "0 1px 2px rgba(0,0,0,<0.3 dark | 0.05 light>)",
    "sm": "0 1px 3px rgba(0,0,0,<0.4 dark | 0.1 light>)",
    "md": "0 4px 12px rgba(0,0,0,<0.5 dark | 0.15 light>)",
    "lg": "0 8px 24px rgba(0,0,0,<0.6 dark | 0.2 light>)",
    "xl": "0 16px 48px rgba(0,0,0,<0.7 dark | 0.25 light>)"
  },

  "gradients": {
    "primary": "<extracted primary gradient or generate from accent>",
    "subtle": "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)",
    "overlay": "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.8) 100%)"
  },

  "transitions": {
    "fast": "150ms",
    "normal": "250ms",
    "slow": "400ms",
    "easing": "cubic-bezier(0.4, 0, 0.2, 1)"
  },

  "zIndex": {
    "dropdown": "100",
    "sticky": "200",
    "modal": "300",
    "toast": "400"
  },

  "focus": {
    "ringColor": "<accent color>",
    "ringWidth": "2px",
    "ringOffset": "2px"
  },

  "opacity": {
    "disabled": "0.5",
    "hover": "0.8",
    "muted": "0.6"
  },

  "overlay": {
    "backdrop": "rgba(0,0,0,0.5)",
    "blur": "4px"
  },

  "scrollbar": {
    "width": "8px",
    "track": "<card background>",
    "thumb": "<border color>"
  },

  "selection": {
    "background": "<accent color>",
    "color": "#ffffff"
  },

  "divider": {
    "color": "<border light color>",
    "thickness": "1px"
  },

  "skeleton": {
    "base": "rgba(255,255,255,0.05)",
    "shimmer": "rgba(255,255,255,0.1)"
  },

  "icons": {
    "xs": "12px",
    "sm": "16px",
    "md": "20px",
    "lg": "24px",
    "xl": "32px"
  },

  "componentHeights": {
    "inputSm": "32px",
    "inputMd": "40px",
    "inputLg": "48px",
    "buttonSm": "32px",
    "buttonMd": "40px",
    "buttonLg": "48px",
    "nav": "56px"
  }
}
```

**Shadow opacity by theme type:**
- Dark themes: higher opacity (0.3-0.7)
- Light themes: lower opacity (0.05-0.25)

#### 5.4: Write theme.css

Behavioral overrides that can't be expressed as simple token values. Only include what's necessary:

**For DARK templates:**

```css
/* === DARK THEME OVERRIDES === */

/* Subtle borders on dark backgrounds */
.card, .task-card, .kanban-card {
  border-color: rgba(255,255,255,0.08);
}

/* Dashed borders need adjustment */
[style*="dashed"] {
  border-color: rgba(255,255,255,0.1);
}

/* Custom scrollbar for dark mode */
::-webkit-scrollbar { width: var(--scrollbar-width); }
::-webkit-scrollbar-track { background: var(--scrollbar-track); }
::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: var(--radius-full); }

/* Text selection */
::selection {
  background: var(--selection-background);
  color: var(--selection-color);
}
```

**For LIGHT templates:**

```css
/* === LIGHT THEME OVERRIDES === */

/* Solid borders on light backgrounds */
.card, .task-card, .kanban-card {
  border-color: var(--border-default);
  box-shadow: var(--shadow-sm);
}

/* Custom scrollbar for light mode */
::-webkit-scrollbar { width: var(--scrollbar-width); }
::-webkit-scrollbar-track { background: var(--scrollbar-track); }
::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: var(--radius-full); }

/* Text selection */
::selection {
  background: var(--selection-background);
  color: var(--selection-color);
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
