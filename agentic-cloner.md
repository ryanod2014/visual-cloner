# Agentic Visual Cloning System

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ORCHESTRATOR                                     │
│  - Captures target URL                                                   │
│  - Identifies sections                                                   │
│  - Spawns Section Cloner for each section                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
            │  SECTION 1  │ │  SECTION 2  │ │  SECTION N  │
            │   CLONER    │ │   CLONER    │ │   CLONER    │
            └─────────────┘ └─────────────┘ └─────────────┘
                    │
        ┌───────────┼───────────┬───────────┐
        ▼           ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
   │ ELEMENT │ │ ELEMENT │ │ ELEMENT │ │ ELEMENT │
   │ AGENT 1 │ │ AGENT 2 │ │ AGENT 3 │ │ AGENT N │
   │ (logo)  │ │ (nav)   │ │ (hero)  │ │ (cta)   │
   └─────────┘ └─────────┘ └─────────┘ └─────────┘
        │           │           │           │
        ▼           ▼           ▼           ▼
   ┌─────────────────────────────────────────────┐
   │  Each agent loops:                          │
   │  1. Generate HTML for element               │
   │  2. Render to screenshot                    │
   │  3. Compare to original                     │
   │  4. Identify pixel differences              │
   │  5. Refine CSS values                       │
   │  6. Repeat until match                      │
   └─────────────────────────────────────────────┘
                    │
                    ▼
            ┌─────────────┐
            │  ASSEMBLER  │
            │  Combines   │
            │  all pixel- │
            │  perfect    │
            │  elements   │
            └─────────────┘
```

## Element Agent Loop

Each element agent runs this loop:

```
MAX_ITERATIONS = 10
MATCH_THRESHOLD = 95%

for i in 1..MAX_ITERATIONS:
    1. Look at original element crop
    2. Look at current attempt render
    3. Identify SPECIFIC differences:
       - Font size off by Xpx
       - Color wrong (#abc vs #def)
       - Padding too wide by Xpx
       - Border radius incorrect
       - etc.
    4. Make TARGETED fixes to HTML/CSS
    5. Re-render
    6. Compare again
    7. If match >= MATCH_THRESHOLD: DONE
```

## Running the System

```bash
# Clone a URL with parallel element agents
node agentic-cloner.js https://linear.app
```
