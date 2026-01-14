# Phase Summary System - Quick Start Guide

## What's New?

The extraction pipeline now shows detailed summaries after each phase completes, making it easy to see what happened and debug issues.

## Basic Usage

### Standard Mode
```bash
node extract.js https://example.com
```

You'll see phase summaries like this after each phase:
```
==================================================
PHASE COMPLETE: capture
==================================================
Duration:    45.2s
Processed:   489 resources
Created:     489 files
Errors:      0
Warnings:    2
==================================================
```

### Verbose Mode (Recommended for Debugging)
```bash
node extract.js https://example.com --verbose
```

Shows additional details:
```
==================================================
PHASE COMPLETE: capture
==================================================
Duration:    45.2s
Processed:   489 resources
Created:     489 files
Warnings:    2

Key Actions:
  - Navigating to target URL
  - Page loaded successfully
  - Captured landing page HTML (52.3 KB)
  - Clicked start button to load SPA
  - Loaded 127 resources after interaction
==================================================
```

## After Extraction

Check the detailed metrics file:
```bash
# View complete summary
cat output/example.com-*/phase-summary.json | jq .

# View specific phase
cat output/example.com-*/phase-summary.json | jq '.phases.capture'

# Check for errors
cat output/example.com-*/phase-summary.json | jq '.phases | to_entries | map(select(.value.metrics.errors > 0))'
```

## Testing the System

Run the demo:
```bash
node test-phase-summary.js
```

This shows how the phase summary system works without doing a full extraction.

## For Phase Developers

When implementing a new phase, use these methods:

```javascript
import { Phase } from '../core/pipeline.js';

export class MyPhase extends Phase {
  async execute(context) {
    // Track what you're doing
    this.trackAction('Starting my phase');

    // Track items processed
    for (const item of items) {
      this.trackProcessed();  // +1 to processed count

      try {
        // Your work here
        this.trackCreated();  // +1 to created count
      } catch (error) {
        this.trackError();    // +1 to error count
      }
    }

    return { /* your results */ };
  }
}
```

## Available Tracking Methods

| Method | Purpose |
|--------|---------|
| `trackProcessed(count)` | Track items processed |
| `trackCreated(count)` | Track items created |
| `trackModified(count)` | Track items modified |
| `trackError()` | Track error occurrence |
| `trackWarning()` | Track warning occurrence |
| `trackAction(description)` | Track key action (verbose mode) |

## Benefits

- **See progress** - Know exactly what each phase accomplished
- **Find bottlenecks** - Duration tracking shows slow phases
- **Debug issues** - Errors and warnings are immediately visible
- **Understand actions** - Verbose mode shows what happened
- **Post-mortem** - Complete JSON report for debugging

## Documentation

- `PHASE_SUMMARY.md` - Full feature documentation
- `IMPLEMENTATION_SUMMARY.md` - Technical implementation details
- `EXAMPLE_OUTPUT.md` - Real output examples
- `TASK_COMPLETION_SUMMARY.md` - Implementation summary

## Need Help?

Run the test to see it in action:
```bash
node test-phase-summary.js
```

Check the example output:
```bash
cat EXAMPLE_OUTPUT.md
```
