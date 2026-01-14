# Debug Serve Utility

A debugging wrapper for `serve.js` that logs EVERY HTTP request and response to help diagnose serve-time issues.

## Usage

```bash
node debug-serve.js ./output/photopea.com-123456/
```

## Features

### 1. Detailed Request Logging

Every request is logged with full details:

```
[REQUEST] GET /code/pp/pp1768174632.js
[LOOKUP]  Checking url-map for path...
[MATCH]   Found: resources/r8.js (2.60 MB)
[SERVE]   200 OK - application/javascript
```

### 2. Miss Tracking

Clearly identifies requests that fail:

```
[REQUEST] GET /manifest.json
[LOOKUP]  Not in url-map
[MISS]    404 - File not found
```

### 3. Proxy Logging

Shows when content is proxied from the original server:

```
[REQUEST] GET /api/data.json
[LOOKUP]  Not in url-map
[PROXY]   Fetching from origin: https://example.com/api/data.json
[SERVE]   200 - application/json (1.23 KB)
```

### 4. Runtime Script Tracking

Logs when runtime scripts are served:

```
[REQUEST] GET /__runtime__/runtime-mock.js
[RUNTIME] Serving: runtime-mock.js
[SERVE]   200 OK - application/javascript
```

### 5. Summary Statistics

Press `Ctrl+C` to see a comprehensive summary:

```
══════════════════════════════════════════════════════════════
  REQUEST SUMMARY
══════════════════════════════════════════════════════════════

  Total requests:  156
  Uptime:          45s

  Hits:            152 (97.4%)
  Misses:          4 (2.6%)
  Proxied:         3

  MISSED REQUESTS:
    - /manifest.json (3x)
    - /favicon.ico (1x)

  TOP SERVED FILES:
    - resources/r8.js (12x)
    - resources/style.css (8x)
    - resources/bundle.js (5x)
    - resources/logo.png (3x)

══════════════════════════════════════════════════════════════
```

## What Gets Logged

- **[REQUEST]** - The incoming HTTP request (method + URL)
- **[LOOKUP]** - Checking the url-map for the requested path
- **[MATCH]** - Found in url-map, showing the local file and size
- **[MISS]** - Not found in url-map
- **[PROXY]** - Proxying to the original server
- **[RUNTIME]** - Serving a runtime script
- **[INDEX]** - Serving index.html
- **[STATUS]** - Serving the status endpoint
- **[SERVE]** - The response being sent (status + content-type)
- **[ERROR]** - An error occurred

## Statistics Tracked

- **Total requests** - All HTTP requests received
- **Hits** - Requests successfully served from local files
- **Misses** - Requests that returned 404
- **Proxied** - Requests proxied to the original server
- **Missed requests** - URLs that weren't found (with counts)
- **Top served files** - Most frequently requested files
- **Error requests** - Requests that resulted in errors

## Use Cases

### Debug Missing Resources

See exactly which files the browser is requesting but not finding:

```
MISSED REQUESTS:
  - /fonts/custom-font.woff2 (15x)
  - /images/icon.svg (5x)
```

### Identify Heavy Traffic

Find which resources are requested most frequently:

```
TOP SERVED FILES:
  - resources/main.bundle.js (45x)
  - resources/analytics.js (23x)
```

### Track Proxy Usage

See when the proxy is being used to fetch missing resources:

```
Proxied: 12
```

### Monitor Performance

Track uptime and request volume:

```
Total requests: 1,234
Uptime: 300s
```

## Configuration

The debug server runs on the same configuration as `serve.js`:

- **Port:** 3333
- **Proxy:** Enabled (fetches missing resources from origin)
- **CORS:** Fully enabled
- **Runtime injection:** Automatic

## Endpoints

- `http://localhost:3333/` - Main site
- `http://localhost:3333/__status__` - JSON status endpoint
- `http://localhost:3333/__runtime__/` - Runtime scripts

## Differences from serve.js

The debug server:

1. Logs EVERY request with full details
2. Tracks statistics about requests, hits, and misses
3. Shows a summary on exit (Ctrl+C)
4. Provides more verbose output for debugging
5. Same behavior as serve.js otherwise

## Tips

- Run this when diagnosing missing resources
- Use the summary to identify patterns in failures
- Check missed requests to find resources that need extraction
- Look at proxy usage to see what's being fetched at runtime
- Compare hit/miss ratios to gauge extraction completeness

## Example Session

```bash
$ node debug-serve.js ./output/photopea.com-1768366209046/

═══════════════════════════════════════════════════════════════
  DEBUG SERVER (with request logging)
═══════════════════════════════════════════════════════════════

  URL:          http://localhost:3333
  Directory:    /path/to/output/photopea.com-1768366209046
  Original:     https://www.photopea.com
  Resources:    234
  Proxy:        Enabled
  Runtime:      http://localhost:3333/__runtime__/
  Status:       http://localhost:3333/__status__

  Press Ctrl+C to see summary statistics

═══════════════════════════════════════════════════════════════

Starting request logging...

[REQUEST] GET /
[INDEX]   Serving index.html
[SERVE]   200 OK - text/html

[REQUEST] GET /code/pp/pp1768174632.js
[LOOKUP]  Checking url-map for path...
[MATCH]   Found: resources/r8.js (2.60 MB)
[SERVE]   200 OK - application/javascript

[REQUEST] GET /manifest.json
[LOOKUP]  Not in url-map
[PROXY]   Fetching from origin: https://www.photopea.com/manifest.json
[SERVE]   200 - application/json (234 B)

^C
Shutting down...

═══════════════════════════════════════════════════════════════
  REQUEST SUMMARY
═══════════════════════════════════════════════════════════════

  Total requests:  23
  Uptime:          15s

  Hits:            20 (87.0%)
  Misses:          0 (0.0%)
  Proxied:         3

  TOP SERVED FILES:
    - resources/r8.js (1x)
    - resources/style.css (1x)

═══════════════════════════════════════════════════════════════
```
