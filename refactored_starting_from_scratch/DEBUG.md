# Browser Debug Tool

Comprehensive browser console and network debugger for extracted webapps.

## Overview

`debug-browser.js` launches a headless browser, loads your extraction, and captures all console output, network requests, and errors in real-time. It provides a detailed diagnosis report focusing on the FIRST error - usually the root cause of issues.

## Usage

### Basic Usage

```bash
node debug-browser.js <target>
```

### Examples

```bash
# Debug a local extraction
node debug-browser.js ./output/photopea.com-123456/

# Debug a running server
node debug-browser.js http://localhost:3333

# Debug a remote URL
node debug-browser.js https://www.photopea.com

# With custom wait time (15 seconds)
node debug-browser.js ./output/photopea.com-123456/ --wait 15000

# Using npm script
npm run debug ./output/photopea.com-123456/
```

## Features

### 1. Real-Time Console Capture

Captures ALL console output in chronological order with precise timestamps:

```
[0.00s] [LOG] Runtime mock initializing...
[0.05s] [WARN] Failed to override window.location
[0.10s] [LOG] Network interceptor ready
[1.20s] [ERROR] TypeError: Cannot read 'ou' of undefined
[1.25s] [LOG] web_VPea event sent
```

Console types captured:
- LOG (gray)
- INFO (blue)
- WARN (yellow)
- ERROR (red)
- DEBUG (magenta)

### 2. Network Request Tracking

Monitors all network requests and failures:

```
[0.50s] [NET] GET /code/pp/pp1768174632.js → 200
[0.80s] [NET] GET /rsrc/basic/basic.zip → 404 ❌
[1.00s] [NET] GET /manifest.json → FAILED (net::ERR_FILE_NOT_FOUND)
```

### 3. Comprehensive Report

After page stabilization, generates a detailed diagnosis:

```
══════════════════════════════════════
BROWSER DEBUG REPORT
══════════════════════════════════════

FIRST ERROR:
  [1.20s] TypeError: Cannot read 'ou' of undefined
  at dP.ale (pp1768174632.js:17746)

FAILED NETWORK REQUESTS:
  /rsrc/basic/basic.zip (404)
  /manifest.json (404)

SUMMARY:
  WARNINGS: 3
  ERRORS: 2
  FAILED REQUESTS: 2
  TOTAL LOGS: 15

TIMELINE:
  0.00s - Page load started
  0.50s - Main JS loaded
  1.20s - FIRST ERROR ← Investigate this
  1.50s - UI rendered
  11.50s - Debug session complete

DIAGNOSIS:
  The first error occurred at 1.20s.
  This is likely the root cause of subsequent issues.

══════════════════════════════════════
```

### 4. Timeline Events

Tracks key milestones:
- Page load started
- Initial page load complete
- Scripts discovered
- First error occurrence
- UI rendered
- Debug session complete

## Options

### --wait <milliseconds>

Set custom wait time for page stabilization (default: 10000ms / 10 seconds):

```bash
node debug-browser.js ./output/example/ --wait 5000   # Wait 5 seconds
node debug-browser.js ./output/example/ --wait 30000  # Wait 30 seconds
```

Adjust based on your app's complexity:
- Simple sites: 5000ms (5 seconds)
- Medium complexity: 10000ms (10 seconds, default)
- Complex SPAs: 20000-30000ms (20-30 seconds)

### --help, -h

Display help information:

```bash
node debug-browser.js --help
```

## Exit Codes

- `0`: Success (no errors found)
- `1`: Errors detected or debug session failed

Useful for CI/CD pipelines:

```bash
node debug-browser.js ./output/example/ || echo "Errors found!"
```

## Target Types

The tool accepts three types of targets:

### 1. Local Directory

```bash
node debug-browser.js ./output/photopea.com-123456/
```

Automatically looks for `index.html` in the directory.

### 2. Local HTML File

```bash
node debug-browser.js ./output/photopea.com-123456/index.html
```

### 3. Remote URL

```bash
node debug-browser.js http://localhost:3333
node debug-browser.js https://www.photopea.com
```

## Debugging Workflow

1. **Run the debugger** on your extraction:
   ```bash
   node debug-browser.js ./output/example/
   ```

2. **Check the FIRST ERROR** - this is usually the root cause

3. **Review failed network requests** - missing files or resources

4. **Examine the timeline** - understand the sequence of events

5. **Fix issues** and re-run until no errors

## Common Issues

### File Not Found Errors

```
[ERROR] Failed to load resource: net::ERR_FILE_NOT_FOUND
/img/logo.png
```

**Solution:** Check if the file was extracted. May need to update extraction logic.

### CORS Errors

```
[ERROR] Access to fetch at 'https://api.example.com' has been blocked by CORS
```

**Solution:** May need runtime mocks or CORS proxying.

### JavaScript Errors

```
[ERROR] TypeError: Cannot read property 'x' of undefined
```

**Solution:** Often caused by missing dependencies or incorrect initialization order.

### Timeout Issues

If the page takes longer to load:

```bash
node debug-browser.js ./output/example/ --wait 20000
```

## Integration with Visual Cloner

Use after extraction to verify the clone:

```bash
# Extract a site
node extract.js https://example.com

# Debug the extraction
node debug-browser.js ./output/example.com-*/

# Fix any issues found
# Re-extract if needed
```

## Advanced Usage

### Debugging Multiple Extractions

```bash
# Debug all extractions of a domain
for dir in output/example.com-*; do
  echo "Debugging $dir"
  node debug-browser.js "$dir" --wait 5000
done
```

### CI/CD Integration

```bash
#!/bin/bash
# Extract and verify
node extract.js https://example.com
LATEST=$(ls -td output/example.com-* | head -1)
node debug-browser.js "$LATEST" || exit 1
```

## Technical Details

- **Browser:** Chromium (headless via Playwright)
- **Viewport:** 1920x1080
- **Security:** Disabled web security for local testing
- **Navigation:** Waits for network idle before timing
- **Timeout:** 30 seconds for initial navigation

## Tips

1. **Focus on the first error** - subsequent errors are often cascading effects
2. **Check timestamps** - helps understand the initialization sequence
3. **Use timeline** - identifies when things go wrong
4. **Adjust wait time** - longer for complex apps, shorter for simple pages
5. **Run multiple times** - some errors may be intermittent

## Troubleshooting

### Browser Not Installed

If you see "Executable doesn't exist at...", install Playwright browsers:

```bash
npx playwright install chromium
```

### Permission Errors

Make the script executable:

```bash
chmod +x debug-browser.js
```

### Module Not Found

Ensure Playwright is installed:

```bash
npm install
```

## Output Colors

The tool uses ANSI colors for better readability:

- **Timestamps:** Dim gray
- **LOG:** Gray
- **INFO:** Blue
- **WARN:** Yellow
- **ERROR:** Red
- **DEBUG:** Magenta
- **NET:** Cyan
- **Success (2xx):** Green
- **Redirect (3xx):** Yellow
- **Error (4xx/5xx):** Red
