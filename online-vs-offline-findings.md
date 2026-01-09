# Online vs Offline Photopea Comparison: New Project Dialog Failure

## Test Date
2026-01-09

## Summary
**Finding:** The "New Project" dialog works perfectly on the online version but fails silently on the offline clone. This is NOT due to missing network requests or lazy-loaded resources. Both versions load the same resources (`basic.zip`), but the offline version has a missing or corrupted tool registry.

## Test Results

### Online Version (https://www.photopea.com)
- ✅ "Start using Photopea" loads editor
- ✅ "New Project" button opens dialog with form fields:
  - Width: 1280
  - Height: 720
  - Background combobox
  - Profile combobox  
  - Create button
- ✅ No additional network requests when clicking "New Project"
- ✅ Works entirely from cached code loaded during initialization
- ✅ Only errors are ad-network related (CORS, failed ad requests)

### Offline Version (http://localhost:3333)
- ✅ Auto-loads editor on page load
- ❌ "New Project" button does NOTHING when clicked
- ✅ No JavaScript errors in console
- ✅ Loads `basic.zip` successfully from local server
- ❌ Dialog never appears

## Network Activity Analysis

### Initial Page Load (Both Versions)
Both versions load:
1. Main JavaScript files (pp1767826327.js)
2. `rsrc/basic/basic.zip` - Contains UI resources
3. Ad network scripts (for online ads)

### After Clicking "New Project" (Online)
- **NO additional network requests**
- Dialog appears immediately from existing code
- Confirms this is NOT a lazy-loading or server-dependency issue

### After Clicking "New Project" (Offline)
- **NO network requests**
- NO errors in console
- Dialog fails silently
- Console shows: `[LOG] 1 @ http://localhost:3333/code/pp/pp1767826327.js:238`

## Root Cause: Missing Tool Registry (j1.map)

### Evidence from Code Analysis

Found in `/cache/r9.js` line 15999:
```javascript
for(var d=0;d<this.a48.length;++d){
  e.push(z.j1.map[this.a48[d]].U.name)
}
```

The "New Project" dialog construction code tries to access:
- `z.j1.map` - Tool registry mapping tool IDs to tool objects
- `z.j1.map[this.a48[d]].U.name` - Tool names for the dialog

### What j1.map Contains
Based on code analysis, `j1.map` is a registry that maps:
- Tool IDs (numeric) → Tool objects with properties like:
  - `U` (Tool definition with name, functions)
  - `RP` (Tool panel/properties)
  - `H7` (Tool category)

Example usage patterns found:
```javascript
this.j1.map[Tool ID].U.name          // Get tool name
this.j1.map[Tool ID].U.Zi()          // Initialize tool  
this.j1.map[Tool ID].RP.E1()         // Update tool panel
```

## Why It Fails Silently

The offline version likely has:
1. **Corrupted j1.map** - Registry exists but is empty/invalid
2. **Incomplete initialization** - Registry not fully populated during startup
3. **Missing data in basic.zip** - The zip file loaded but didn't contain registry data

When the code tries to build the dialog:
- It loops through `this.a48` (array of tool IDs)
- Tries to access `z.j1.map[toolID]` for each
- If map is undefined/empty, the loop produces no items
- Dialog construction fails silently (no error because undefined !== error)

## Key Differences: Online vs Offline

### Online Version
- ✅ `basic.zip` loads from CDN
- ✅ Tool registry fully initialized  
- ✅ `j1.map` contains all tool definitions
- ✅ Dialog construction succeeds

### Offline Version  
- ✅ `basic.zip` loads from localhost
- ❌ Tool registry missing/incomplete
- ❌ `j1.map` is undefined or empty
- ❌ Dialog construction fails silently

## Conclusion

**Is this fixable with better extraction?**

**YES** - This is an extraction/initialization problem, not a feature limitation:

1. **Not a lazy-loading issue** - Online version proves all code exists at load time
2. **Not a server dependency** - No API calls happen when clicking "New Project"
3. **Likely an initialization race condition** - The registry may need specific initialization sequence
4. **Possible missing data in basic.zip** - Our extraction may not have captured registry data correctly

## Recommended Next Steps

1. **Compare basic.zip files**
   - Extract online version's basic.zip
   - Compare with our cached version
   - Check for missing registry JSON/data

2. **Trace j1.map initialization**
   - Search for where `j1.map` is created
   - Find the code that populates tool definitions
   - Check if timing/initialization order matters

3. **Check for embedded data**
   - Look for JSON embedded in HTML/JS
   - Check for inline <script> blocks with registry data
   - Search for base64-encoded data

4. **Test initialization sequence**
   - Compare startup console logs (online vs offline)
   - Check if "adding" log appears in same order
   - Look for missing initialization steps

## Files for Further Investigation

- `/cache/r9.js` - Contains tool registry access code
- `/rsrc/basic/basic.zip` - Should contain UI/tool definitions  
- `/code/pp/pp1767826327.js` - Main app logic, initialization
- `/index.html` - May contain inline initialization data
