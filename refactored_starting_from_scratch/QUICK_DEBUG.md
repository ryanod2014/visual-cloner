# Quick Debug Reference

## One-Liners

```bash
# Debug latest extraction
node debug-browser.js $(ls -td output/*/ | head -1)

# Debug with short wait
node debug-browser.js ./output/example/ --wait 3000

# Debug and save output
node debug-browser.js ./output/example/ > debug.log 2>&1

# Debug running server
node debug-browser.js http://localhost:3333
```

## Quick Diagnosis

### 1. Check First Error
The FIRST error in the report is usually the root cause. Fix that first.

### 2. Missing Files?
Look at "FAILED NETWORK REQUESTS" section for 404s.

### 3. JavaScript Errors?
Check the stack trace in the error output.

### 4. Too Fast?
Increase wait time if page needs longer to initialize:
```bash
node debug-browser.js ./output/example/ --wait 20000
```

## Common Fixes

| Error Type | Likely Cause | Solution |
|------------|--------------|----------|
| `net::ERR_FILE_NOT_FOUND` | Missing resource | Check if file was extracted |
| `TypeError: Cannot read...` | Missing dependency | Check initialization order |
| `CORS error` | Cross-origin request | Add runtime mock |
| `404 on /api/*` | API endpoint | Add mock or proxy |

## Report Sections

```
FIRST ERROR          ← Start here - root cause
FAILED REQUESTS      ← Missing files/resources
SUMMARY              ← Overview statistics
TIMELINE             ← Event sequence
DIAGNOSIS            ← Recommended next steps
```

## Color Guide

- 🔴 RED = Error or failure
- 🟡 YELLOW = Warning
- 🔵 BLUE = Info
- ⚪ GRAY = Log/debug
- 🟢 GREEN = Success (HTTP 200)

## Exit Codes

- `0` = No errors (success)
- `1` = Errors found (needs fixing)
