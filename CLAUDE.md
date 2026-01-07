# Visual Cloner

Pixel-perfect website cloning system using Claude Code and Playwright.

## Skills

### /clone <url>
Clone a website pixel-perfect using section-by-section parallel agents.

```
/clone https://linear.app
/clone https://spotify.com
```

See `.claude/skills/clone.md` for the full skill definition.

## Tools

- `tools/assemble.js` - Standalone assembler to merge section files
- `tools/progress.js` - Checkpoint/resume tracking
- `tools/extract-tokens.js` - Design token extractor
- `tools/config.js` - Configuration with presets

## Architecture

The cloning system works by:
1. Analyzing page structure into sections
2. Spawning parallel sub-agents (one per section)
3. Each agent clones its section with fresh context
4. Assembler merges completed sections
5. Hover states captured separately

This approach prevents context window exhaustion by giving each section agent its own fresh context.

## Output Structure

```
output/<domain>-<timestamp>/
  manifest.json       # Page analysis
  00-header.html      # Individual sections
  01-hero.html
  ...
  hover-states.css    # Hover rules
  assembled.html      # Final output
```
