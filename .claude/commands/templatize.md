---
name: templatize
description: Convert a cloned website into a generic template with placeholder text
arguments:
  - name: path
    description: Path to the clone directory (e.g., output/cal-clone)
    required: true
---

# Templatize Command

Convert a cloned website into a customer-facing template by rewriting all text content to be generic placeholders while keeping the exact design/layout intact.

## Usage
```
/templatize output/cal-clone
/templatize output/resend-clone
```

## Process

### Phase 1: Setup

1. Validate the input directory exists and has section HTML files
2. Create output directory: `<input-dir>-template/` (e.g., `output/cal-clone-template/`)
3. Copy screenshots directory if it exists (for reference)

### Phase 2: Templatize Each Section

For each HTML section file (00-*.html, 01-*.html, etc.), spawn a sub-agent to rewrite the text.

**CRITICAL**: Spawn ALL section agents in a SINGLE message with multiple Task tool calls to run them in parallel.

Each section agent prompt:

```
Templatize this HTML section by rewriting all text content to be generic placeholders.

=== INPUT ===
HTML file: <input_dir>/{filename}
Output file: <output_dir>/{filename}

=== YOUR TASK ===
1. Read the HTML file using the Read tool
2. Rewrite ALL text content to be generic/placeholder while keeping HTML structure and CSS EXACTLY the same
3. Write the templatized HTML to the output file
4. Exit immediately

=== TEXT REPLACEMENT RULES ===

**IMPORTANT: Write REAL copy, NOT placeholder brackets like [Feature] or [Your text here]. Everything should read like a real website.**

**Company/Brand Names:**
- Specific company name → "Acme" (use consistently throughout)
- Domain names (cal.com, resend.com) → "acme.com"

**Headlines & Copy:**
- Write real marketing copy that sounds professional
- Keep the same tone, length, and energy
- "The better way to schedule meetings" → "The better way to grow your business"
- "Email for developers" → "Tools built for modern teams"
- NO brackets or placeholders - write actual text

**Statistics & Numbers:**
- "5000+ teams" → "2000+ customers"
- "98% deliverability" → "99.9% uptime"
- Use realistic but generic numbers

**Testimonials:**
- Replace real names with generic: "Sarah J.", "Mike T.", "Alex K."
- Replace real companies with generic: "Tech Startup", "E-commerce Brand", "SaaS Company"
- Write real-sounding generic praise (NOT bracketed placeholders):
  - "This product transformed how our team works. Highly recommend!"
  - "We switched 6 months ago and never looked back. Best decision we made."
  - "Finally, a solution that just works. Our team loves it."

**Feature Descriptions:**
- Write real benefit-focused descriptions
- "Connect your Google Calendar" → "Connect your favorite tools"
- "Built-in video conferencing" → "Built-in collaboration features"
- "Accept payments via Stripe" → "Accept payments seamlessly"

**CTAs:**
- Keep generic: "Get Started", "Learn More", "Sign Up", "Contact Sales"

**Logos Section:**
- Replace company names with generic tech-sounding names: "Nexus", "Cloudify", "DataSync", "Flowbase", "TechCorp"
- "Trusted by Vercel, Notion, Stripe" → "Trusted by industry leaders"

**Footer:**
- Keep generic link names: "Blog", "Docs", "Pricing", "About", "Careers", "Support"
- Replace product-specific links with generic equivalents

=== CRITICAL RULES ===
- DO NOT modify any CSS or HTML structure
- DO NOT change class names, IDs, or element hierarchy
- ONLY replace text content inside elements
- Keep the same text length approximately (for layout consistency)
- Preserve any icons, SVGs, or visual elements exactly

=== OUTPUT ===
Write the templatized HTML to the output file with all text replaced but structure intact.
```

### Phase 3: Assembly

After all agents complete, run the assembler on the template directory:
```bash
node tools/assemble.js <output_dir>/
```

### Phase 4: Open Result

Open the templatized result:
```bash
open <output_dir>/assembled.html
```

## Example

Input: `output/cal-clone/`
```
output/cal-clone/
  00-nav-hero.html      # "Cal.com - The better way to schedule"
  01-logos.html         # "Trusted by Vercel, Supabase..."
  ...
  assembled.html
```

Output: `output/cal-clone-template/`
```
output/cal-clone-template/
  00-nav-hero.html      # "Acme - The better way to [achieve goal]"
  01-logos.html         # "Trusted by industry leaders"
  ...
  assembled.html
```

## Key Points

- **Preserves design**: All CSS, layout, spacing, colors stay exactly the same
- **Generic text**: All copy becomes placeholder/generic content
- **Customer-ready**: Output can be shown to customers as template options
- **No copyright issues**: No original company names, quotes, or specific claims
- **Parallel execution**: All sections templatized simultaneously for speed
