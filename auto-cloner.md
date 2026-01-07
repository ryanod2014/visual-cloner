# Auto-Cloner System

## Architecture

```
URL Input
    ↓
┌─────────────────────────────────────┐
│     ORCHESTRATOR (Main Agent)       │
│  - Captures full page screenshot    │
│  - Identifies all sections          │
│  - Queues sections for cloning      │
│  - Tracks completion status         │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│     SECTION CLONER (Per Section)    │
│  - Crops section from screenshot    │
│  - Identifies elements in section   │
│  - Spawns element agents in parallel│
│  - Assembles section when complete  │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│    ELEMENT AGENTS (Parallel)        │
│  - Generate HTML for element        │
│  - Render & compare to original     │
│  - Iterate until pixel-perfect      │
│  - Return final HTML                │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│     ASSEMBLER                       │
│  - Combines all sections            │
│  - Generates final HTML             │
│  - Takes comparison screenshot      │
└─────────────────────────────────────┘
```

## Auto-Run Protocol

1. **Section Discovery**: Analyze page screenshot to identify distinct sections
2. **Parallel Processing**: Clone up to 3 sections simultaneously
3. **Element Parallelism**: Within each section, clone all elements in parallel
4. **Completion Tracking**: Mark sections complete only when all elements pass
5. **Assembly**: Combine completed sections into final page

## Current Target: Linear.app

Sections to clone:
- [x] Hero (header + headline + CTA + image)
- [x] Customers (tagline + logos)
- [x] Features (feature cards grid)
- [ ] Build section (product showcase)
- [ ] Plan section (roadmap features)
- [ ] Track section (analytics features)
- [ ] AI section (AI capabilities)
- [ ] Integrations section
- [x] CTA section
- [x] Footer
