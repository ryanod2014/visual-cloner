# Debug Server Quick Start

## Start the server

```bash
node debug-serve.js ./output/photopea.com-123456/
```

## What you'll see

### For successful requests:
```
[REQUEST] GET /code/pp/pp1768174632.js
[LOOKUP]  Checking url-map for path...
[MATCH]   Found: resources/r8.js (2.60 MB)
[SERVE]   200 OK - application/javascript
```

### For missing resources:
```
[REQUEST] GET /manifest.json
[LOOKUP]  Not in url-map
[MISS]    404 - File not found
```

### For proxied requests:
```
[REQUEST] GET /api/data.json
[LOOKUP]  Not in url-map
[PROXY]   Fetching from origin: https://example.com/api/data.json
[SERVE]   200 - application/json (1.23 KB)
```

## Stop and see summary

Press `Ctrl+C`:

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

══════════════════════════════════════════════════════════════
```

## Endpoints

- Main site: http://localhost:3333/
- Status: http://localhost:3333/__status__

## Tips

- Use this when resources aren't loading
- Check MISSED REQUESTS to find missing files
- TOP SERVED FILES shows what's working
- Hit/miss ratio shows extraction completeness
- Proxied count shows runtime dependencies

## Test the server

```bash
./test-debug-serve.sh ./output/photopea.com-123456/
```

This makes test requests to verify logging is working properly.
