# Example Phase Summary Output

## Running with Standard Mode

```bash
$ node extract.js https://photopea.com

==================================================
  VISUAL CLONER
==================================================

[2.5s]  Target: https://photopea.com
[2.5s]  Output: /path/to/output/photopea.com-1234567890

==================================================
  PHASE: INIT
  Launch browser and configure context
==================================================

[2.6s]  Target URL: https://photopea.com
[2.7s]  Launching browser...
[4.2s]  Creating browser context...
[4.5s]  Browser ready

==================================================
PHASE COMPLETE: init
==================================================
Duration:    2.0s
Created:     3 items
==================================================

==================================================
  PHASE: CAPTURE
  Capture all network responses
==================================================

[4.5s]  Loading https://photopea.com...
[6.8s]  Captured 50 resources (1.2 MB)
[8.3s]  Captured 100 resources (3.5 MB)
[10.1s] Captured 150 resources (5.8 MB)
[45.2s] Capture complete: 489 resources, 0 failed
[45.2s] Total size: 12.54 MB

==================================================
PHASE COMPLETE: capture
==================================================
Duration:    40.7s
Processed:   489 resources
Created:     489 files
Errors:      0
Warnings:    2
==================================================

... (additional phases) ...

==================================================
  EXTRACTION COMPLETE
==================================================
  URL: https://photopea.com
  Resources: 489
  Total Size: 489 files
  JavaScript: 45
  CSS: 12
  Images: 387
  Time: 95.4s

  To run locally:
    cd /path/to/output/photopea.com-1234567890
    node serve.js
    # Open http://localhost:3333
```

## Running with Verbose Mode

```bash
$ node extract.js https://photopea.com --verbose

==================================================
  VISUAL CLONER
==================================================

... (same as above) ...

==================================================
PHASE COMPLETE: init
==================================================
Duration:    2.0s
Created:     3 items

Key Actions:
  - Target: https://photopea.com
  - Launched browser (v120.0.6099.109)
  - Created browser context (1920x1080, CSP bypassed)
  - Created new page
==================================================

==================================================
PHASE COMPLETE: capture
==================================================
Duration:    40.7s
Processed:   489 resources
Created:     489 files
Errors:      0
Warnings:    2

Key Actions:
  - Navigating to target URL
  - Page loaded successfully
  - Captured landing page HTML (52.3 KB)
  - Clicked start button to load SPA
  - Loaded 127 resources after interaction
==================================================
```

## Generated phase-summary.json

```json
{
  "version": "1.0",
  "generatedAt": "2025-01-13T10:30:45.123Z",
  "url": "https://photopea.com",
  "totalDuration": 95432,
  "phases": {
    "init": {
      "status": "completed",
      "startedAt": "2025-01-13T10:30:00.000Z",
      "completedAt": "2025-01-13T10:30:02.000Z",
      "duration": 2000,
      "metrics": {
        "itemsProcessed": 0,
        "itemsCreated": 3,
        "itemsModified": 0,
        "errors": 0,
        "warnings": 0,
        "actions": [
          "Target: https://photopea.com",
          "Launched browser (v120.0.6099.109)",
          "Created browser context (1920x1080, CSP bypassed)",
          "Created new page"
        ]
      },
      "result": {
        "browserVersion": "120.0.6099.109",
        "viewport": {
          "width": 1920,
          "height": 1080
        }
      },
      "error": null
    },
    "capture": {
      "status": "completed",
      "startedAt": "2025-01-13T10:30:02.000Z",
      "completedAt": "2025-01-13T10:30:42.700Z",
      "duration": 40700,
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
        "totalSize": 13145088,
        "htmlSize": 53555
      },
      "error": null
    },
    "trigger": {
      "status": "completed",
      "startedAt": "2025-01-13T10:30:42.700Z",
      "completedAt": "2025-01-13T10:30:50.200Z",
      "duration": 7500,
      "metrics": {
        "itemsProcessed": 25,
        "itemsCreated": 15,
        "itemsModified": 0,
        "errors": 0,
        "warnings": 0,
        "actions": [
          "Triggering viewport resize events",
          "Clicking menu items to load content",
          "Triggering hover states",
          "Captured 15 additional resources"
        ]
      },
      "result": {
        "additionalResources": 15,
        "triggersExecuted": 8
      },
      "error": null
    },
    "discover": {
      "status": "completed",
      "startedAt": "2025-01-13T10:30:50.200Z",
      "completedAt": "2025-01-13T10:30:55.432Z",
      "duration": 5232,
      "metrics": {
        "itemsProcessed": 504,
        "itemsCreated": 0,
        "itemsModified": 504,
        "errors": 0,
        "warnings": 3,
        "actions": [
          "Analyzing HTML for resource references",
          "Discovered 504 resource URLs",
          "Validated 501 resources (3 missing)"
        ]
      },
      "result": {
        "discoveredUrls": 504,
        "capturedResources": 501,
        "missingResources": 3
      },
      "error": null
    },
    "assemble": {
      "status": "completed",
      "startedAt": "2025-01-13T10:30:55.432Z",
      "completedAt": "2025-01-13T10:31:35.432Z",
      "duration": 40000,
      "metrics": {
        "itemsProcessed": 504,
        "itemsCreated": 505,
        "itemsModified": 1,
        "errors": 0,
        "warnings": 0,
        "actions": [
          "Creating output directory structure",
          "Writing 504 resource files",
          "Patching HTML with local resource paths",
          "Generating serve.js local server",
          "Creating resource index"
        ]
      },
      "result": {
        "filesWritten": 505,
        "outputDir": "/path/to/output/photopea.com-1234567890",
        "indexHtml": "index.html"
      },
      "error": null
    }
  }
}
```

## Error Example

When a phase fails, the summary captures the error:

```json
{
  "phases": {
    "capture": {
      "status": "failed",
      "startedAt": "2025-01-13T10:30:02.000Z",
      "completedAt": "2025-01-13T10:30:15.000Z",
      "duration": 13000,
      "metrics": {
        "itemsProcessed": 45,
        "itemsCreated": 45,
        "itemsModified": 0,
        "errors": 1,
        "warnings": 0,
        "actions": [
          "Navigating to target URL",
          "Navigation timeout occurred"
        ]
      },
      "result": null,
      "error": {
        "name": "TimeoutError",
        "message": "Navigation timeout of 60000ms exceeded",
        "stack": "TimeoutError: Navigation timeout...\n    at ..."
      }
    }
  }
}
```
