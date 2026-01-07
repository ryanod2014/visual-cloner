# Clone Website Skill

Pixel-perfect website cloning using centralized screenshot capture and parallel HTML generation agents.

## Usage
```
/clone https://linear.app
/clone https://spotify.com
```

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

PHASE 3: Main Agent - Assembly
├── Merge all sections
└── Open result
```

**Key Insight**: Sub-agents don't need Playwright. They only Read screenshots and Write HTML.

## Process

When the user invokes this skill with a URL:

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

   For each section, sequentially:
   ```javascript
   // Scroll to section
   mcp__playwright__browser_evaluate({
     function: `() => window.scrollTo(0, ${section.bounds.top})`
   })

   // Wait for render
   mcp__playwright__browser_wait_for({ time: 0.5 })

   // Take screenshot
   mcp__playwright__browser_take_screenshot({
     filename: `screenshots/${order}-${section.id}.png`
   })
   ```

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

=== RULES ===
- You have NO access to Playwright or browser tools
- You can ONLY use Read and Write tools
- Prefix ALL CSS classes with "{section.id}-" for namespacing
- Use CSS-only graphics (gradients, shapes, box-shadows) - no external images
- Match the exact colors, fonts, and spacing from the screenshot
- Use the design tokens provided for consistency

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

### Phase 4: Open Result

Open the final assembled file:
```bash
open output/<domain>-<timestamp>/assembled.html
```

## Token Budget

| Phase | Agent | Expected Tokens |
|-------|-------|-----------------|
| 1 | Main | ~50K (screenshots + analysis) |
| 2 | Each sub-agent | ~70K (read screenshot + generate + write) |
| 3 | Main | ~5K (run assembler) |

**Total for 8 sections**: ~50K + (8 × 70K) + 5K = **~615K tokens**

Compare to previous approach: 8 × 1M+ = **8M+ tokens** (13x more expensive)

## Key Points

- **Centralized screenshots**: Main agent captures ALL screenshots before spawning sub-agents
- **Sub-agents are constrained**: They only have Read + Write tools, no Playwright
- **Predictable token usage**: Each sub-agent reads ONE file, generates HTML, writes, exits
- **Parallel execution**: All sub-agents run simultaneously
- **Resilient**: Assembler merges whatever sections completed
- **CSS namespacing**: Prevents conflicts between sections

## Why This Architecture Works

Previous approach failed because sub-agents had Playwright access and would:
- Navigate multiple times
- Take multiple screenshots
- Read screenshots back to "verify"
- Waste 1M+ tokens before writing HTML

New approach eliminates this by:
- Removing Playwright from sub-agents entirely
- Pre-capturing all screenshots in main agent
- Giving sub-agents a simple, constrained task: read → generate → write → exit

## Example Output Structure

```
output/linear.app-1234567890/
  screenshots/           # Pre-captured by main agent
    00-header.png
    01-hero.png
    02-features.png
    ...
  manifest.json          # Section analysis + paths
  00-header.html         # Generated by sub-agents
  01-hero.html
  02-features.html
  ...
  assembled.html         # Final merged output
```
