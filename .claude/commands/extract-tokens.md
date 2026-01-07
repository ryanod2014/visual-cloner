---
name: extract-tokens
description: Extract design tokens from a cloned/templatized site for coding agents
arguments:
  - name: path
    description: Path to the clone/template directory (e.g., output/cal-clone-template)
    required: true
---

# Extract Design Tokens Command

Extract all CSS styles from a cloned/templatized site and organize them into a clean `design-tokens.json` file that coding agents can easily reference.

## Usage
```
/extract-tokens output/cal-clone-template
/extract-tokens output/resend-clone
```

## Process

### Phase 1: Read All Section Files

1. Read the assembled.html file from the input directory
2. Parse all `<style>` blocks to extract CSS rules

### Phase 2: Analyze and Categorize

Analyze the CSS and organize into categories:

**Colors:**
- Extract all color values (hex, rgb, rgba)
- Categorize: primary, secondary, accent, background, text, border, etc.
- Identify color patterns (most used = primary, etc.)

**Typography:**
- Font families
- Font sizes (h1, h2, h3, body, small)
- Font weights
- Line heights
- Letter spacing

**Buttons:**
- Primary button styles (bg, text, border, radius, padding)
- Secondary button styles
- Ghost/outline button styles
- Hover states

**Spacing:**
- Section padding
- Card padding
- Gap values
- Margins

**Borders:**
- Border radius values
- Border colors
- Border widths

**Shadows:**
- Box shadow values
- Text shadow values

**Layout:**
- Max-width values
- Container widths
- Grid/flex patterns

### Phase 3: Generate Output

Create `design-tokens.json` in the input directory:

```json
{
  "meta": {
    "source": "cal-clone-template",
    "generated": "2024-01-07T12:00:00Z"
  },
  "colors": {
    "primary": "#000000",
    "secondary": "#f4f4f4",
    "accent": "#6366f1",
    "background": "#ffffff",
    "text": {
      "primary": "#000000",
      "secondary": "#666666",
      "muted": "#999999"
    },
    "border": "#e5e5e5"
  },
  "typography": {
    "fonts": {
      "heading": "Cal Sans, sans-serif",
      "body": "system-ui, sans-serif"
    },
    "sizes": {
      "h1": "48px",
      "h2": "36px",
      "h3": "24px",
      "body": "16px",
      "small": "14px"
    },
    "weights": {
      "normal": "400",
      "medium": "500",
      "bold": "700"
    },
    "lineHeights": {
      "tight": "1.2",
      "normal": "1.5",
      "relaxed": "1.75"
    }
  },
  "buttons": {
    "primary": {
      "background": "#000000",
      "color": "#ffffff",
      "borderRadius": "8px",
      "padding": "12px 24px",
      "fontSize": "15px",
      "fontWeight": "500",
      "hover": {
        "background": "#333333"
      }
    },
    "secondary": {
      "background": "#ffffff",
      "color": "#000000",
      "border": "1px solid #e5e5e5",
      "borderRadius": "8px",
      "padding": "12px 24px",
      "hover": {
        "borderColor": "#000000"
      }
    }
  },
  "spacing": {
    "section": "80px",
    "sectionMobile": "48px",
    "card": "24px",
    "element": "16px",
    "tight": "8px"
  },
  "borders": {
    "radius": {
      "small": "4px",
      "medium": "8px",
      "large": "12px",
      "full": "9999px"
    },
    "width": "1px",
    "color": "#e5e5e5"
  },
  "shadows": {
    "small": "0 1px 2px rgba(0,0,0,0.05)",
    "medium": "0 4px 6px rgba(0,0,0,0.1)",
    "large": "0 10px 25px rgba(0,0,0,0.15)"
  },
  "layout": {
    "maxWidth": "1200px",
    "containerPadding": "24px"
  },
  "components": {
    "card": {
      "background": "#ffffff",
      "borderRadius": "12px",
      "padding": "24px",
      "border": "1px solid #e5e5e5",
      "shadow": "0 1px 2px rgba(0,0,0,0.05)"
    },
    "badge": {
      "background": "#f4f4f4",
      "color": "#666666",
      "borderRadius": "9999px",
      "padding": "6px 12px",
      "fontSize": "12px"
    },
    "input": {
      "background": "#ffffff",
      "border": "1px solid #e5e5e5",
      "borderRadius": "8px",
      "padding": "12px 16px",
      "fontSize": "15px"
    }
  }
}
```

### Phase 4: Generate CSS Variables File (Optional)

Also create `design-tokens.css` with CSS custom properties:

```css
:root {
  /* Colors */
  --color-primary: #000000;
  --color-secondary: #f4f4f4;
  --color-accent: #6366f1;
  --color-background: #ffffff;
  --color-text: #000000;
  --color-text-secondary: #666666;
  --color-border: #e5e5e5;

  /* Typography */
  --font-heading: "Cal Sans", sans-serif;
  --font-body: system-ui, sans-serif;
  --text-h1: 48px;
  --text-h2: 36px;
  --text-h3: 24px;
  --text-body: 16px;
  --text-small: 14px;

  /* Spacing */
  --space-section: 80px;
  --space-card: 24px;
  --space-element: 16px;

  /* Borders */
  --radius-small: 4px;
  --radius-medium: 8px;
  --radius-large: 12px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-small: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-medium: 0 4px 6px rgba(0,0,0,0.1);
}
```

## Output Files

After running, the directory will contain:
```
output/cal-clone-template/
  assembled.html          # The template
  design-tokens.json      # Structured tokens for coding agents
  design-tokens.css       # CSS custom properties version
```

## For Coding Agents

When giving a template to a coding agent, provide:
1. `assembled.html` - Visual reference
2. `design-tokens.json` - Exact values to use

Example prompt for coding agent:
```
Build a pricing page using these design tokens:
- Reference: output/cal-clone-template/assembled.html
- Tokens: output/cal-clone-template/design-tokens.json

Use the exact colors, typography, button styles, and spacing from the tokens.
```
