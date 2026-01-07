# Clone Website Skill

Pixel-perfect website cloning using section-by-section parallel agents.

## Usage
```
/clone https://linear.app
/clone https://spotify.com --sections 5
```

## Process

When the user invokes this skill with a URL:

### Phase 1: Setup & Analysis
1. Navigate to the URL using `mcp__playwright__browser_navigate`
2. Take a full-page screenshot for reference
3. Run this script via `mcp__playwright__browser_evaluate` to analyze page structure:

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

4. Create output directory: `output/<domain>-<timestamp>/`
5. Save the section manifest

### Phase 2: Parallel Section Cloning

For each section, spawn a **sub-agent** using the Task tool with `subagent_type: "general-purpose"`.

CRITICAL: Spawn ALL section agents in a SINGLE message with multiple Task tool calls to run them in parallel.

Each section agent prompt MUST include these efficiency rules:

```
Clone this website section pixel-perfect using ONE-SHOT generation.

URL: <url>
Section ID: <section.id>
Section selector: <section.selector>
Section bounds: top=<bounds.top>px, height=<bounds.height>px
Section description: <section.description>
Output file: <output_dir>/<order>-<section.id>.html

=== CRITICAL EFFICIENCY RULES (MUST FOLLOW) ===
You have a STRICT TOKEN BUDGET. Do NOT waste tokens on iteration.

1. Navigate ONCE: mcp__playwright__browser_navigate to the URL
2. Scroll ONCE: Use browser_evaluate to scroll to exact Y position: <bounds.top>px
3. Screenshot ONCE: Take ONE screenshot after scrolling (do NOT take multiple)
4. Generate IMMEDIATELY: Write the HTML/CSS in ONE pass based on the screenshot
5. Write ONCE: Save to output file using Write tool
6. EXIT: You are done. Do not iterate or refine.

FORBIDDEN ACTIONS (will waste your token budget):
- Taking more than 1 screenshot
- Reading screenshots back to "verify"
- Iterating or refining your output
- Taking full-page screenshots
- Scrolling multiple times to "find" the section

=== OUTPUT INSTRUCTIONS ===
Generate HTML with embedded <style> that matches the screenshot:
- ALL CSS class names prefixed with "<section.id>-" for namespacing
- Use CSS-only graphics (gradients, shapes, box-shadows) - no external images
- Match exact colors, fonts, spacing from the screenshot
- Include the section's text content exactly as shown

Output format:
<style>
.<section.id> { /* container styles */ }
.<section.id>-element { /* child element styles */ }
</style>
<div class="<section.id>">
  <!-- section content recreated from screenshot -->
</div>

Remember: ONE navigation, ONE scroll, ONE screenshot, ONE generation, ONE write, then EXIT.
```

### Phase 3: Hover State Capture

After sections complete, capture hover states:
1. Scroll to top of page
2. Find interactive elements (links, buttons, cards)
3. For each element:
   - Capture default styles
   - Hover using `mcp__playwright__browser_hover`
   - Capture hover styles
   - Record differences
4. Save to `output/<dir>/hover-states.css`

### Phase 4: Assembly

Run the assembler to merge all sections:
```bash
node tools/assemble.js output/<domain>-<timestamp>/
```

### Phase 5: Open Result

Open the final assembled file in the browser:
```bash
open output/<domain>-<timestamp>/assembled.html
```

## Key Points

- Each section agent has FRESH context (won't run out of tokens)
- Sections are processed in PARALLEL (faster)
- Files are saved IMMEDIATELY (resilient to failures)
- Assembler merges whatever completed (partial success is still useful)
- CSS namespacing prevents conflicts between sections
- **ONE-SHOT generation**: Agents take 1 screenshot and generate immediately (no iteration)
- **Token budget**: Each agent should use ~100K tokens, not 1M+ (no multiple screenshots)

## Example Output Structure

```
output/linear.app-1234567890/
  manifest.json           # Section analysis
  00-header.html          # Individual sections
  01-hero.html
  02-features.html
  ...
  hover-states.css        # Hover rules
  assembled.html          # Final merged output
```
