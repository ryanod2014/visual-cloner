# Phase Summary System

The extraction pipeline now tracks detailed metrics for each phase and generates comprehensive summaries.

## Features

### 1. Real-time Phase Summaries
After each phase completes, a summary box is displayed:

```
==================================================
PHASE COMPLETE: capture
==================================================
Duration:    45.2s
Processed:   489 resources
Created:     489 files
Modified:    0 items
Errors:      0
Warnings:    2
==================================================
```

### 2. Verbose Mode
Use the `--verbose` flag to see detailed actions taken during each phase:

```bash
node extract.js https://example.com --verbose
```

With verbose mode enabled, the summary includes key actions:

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

### 3. Phase Summary JSON
At the end of extraction, `phase-summary.json` is saved to the output directory with complete metrics:

```json
{
  "version": "1.0",
  "generatedAt": "2025-01-13T10:30:45.123Z",
  "url": "https://example.com",
  "totalDuration": 95432,
  "phases": {
    "init": {
      "status": "completed",
      "startedAt": "2025-01-13T10:30:00.000Z",
      "completedAt": "2025-01-13T10:30:05.234Z",
      "duration": 5234,
      "metrics": {
        "itemsProcessed": 0,
        "itemsCreated": 3,
        "itemsModified": 0,
        "errors": 0,
        "warnings": 0,
        "actions": [
          "Target: https://example.com",
          "Launched browser (v120.0.6099.109)",
          "Created browser context (1920x1080, CSP bypassed)",
          "Created new page"
        ]
      },
      "result": {
        "browserVersion": "120.0.6099.109",
        "viewport": { "width": 1920, "height": 1080 }
      }
    },
    "capture": {
      "status": "completed",
      "startedAt": "2025-01-13T10:30:05.234Z",
      "completedAt": "2025-01-13T10:30:50.456Z",
      "duration": 45222,
      "metrics": {
        "itemsProcessed": 489,
        "itemsCreated": 489,
        "itemsModified": 0,
        "errors": 0,
        "warnings": 2,
        "actions": [
          "Navigating to target URL",
          "Page loaded successfully",
          "Captured landing page HTML (52.3 KB)",
          "Clicked start button to load SPA",
          "Loaded 127 resources after interaction"
        ]
      },
      "result": {
        "resourceCount": 489,
        "failedCount": 0,
        "totalSize": 13107200,
        "htmlSize": 53555
      }
    }
  }
}
```

## Usage in Phases

Phase implementers can track metrics using these methods:

```javascript
export class MyPhase extends Phase {
  async execute(context) {
    // Track items processed
    this.trackProcessed(count);

    // Track items created (files, resources, etc)
    this.trackCreated(count);

    // Track items modified
    this.trackModified(count);

    // Track errors
    this.trackError();

    // Track warnings
    this.trackWarning();

    // Track key actions (shown in verbose mode)
    this.trackAction('Launched browser');
    this.trackAction('Captured 150 resources');

    return { /* phase results */ };
  }
}
```

## Debugging with Phase Summaries

When something goes wrong:

1. Check the phase summary output to see which phase failed and how far it got
2. Use `--verbose` to see detailed actions taken during execution
3. Review `phase-summary.json` for complete metrics and timing information
4. Look at errors/warnings counts to identify problematic areas

## Example Output Structure

```
output/example.com-1234567890/
  phase-summary.json         # Complete phase metrics
  .checkpoint.json           # Checkpoint for resume
  resources/                 # Captured resources
  assembled.html             # Final output
  serve.js                   # Local server
```
