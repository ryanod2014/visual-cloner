# Enable Shaders - Complete Example

This document demonstrates a complete workflow using the `enable-shaders.js` tool.

## Scenario: Adding Shader Support to Stripe Extraction

### Step 1: Extract the Page

First, extract the page using V7 extractor:

```bash
node tools/v7-extract.js https://stripe.com
```

This creates an extraction directory:
```
output/stripe/stripe.com-1768261639764/
├── index.html
├── shaders.json
├── animations.json
├── extracted-css.css
├── reference.png
└── assets/
```

### Step 2: Check Shader Data

Verify that shaders were captured:

```bash
cat output/stripe/stripe.com-1768261639764/shaders.json | head -20
```

Expected output:
```json
{
  "meta": {
    "source": "https://stripe.com",
    "extractedAt": "2026-01-12T23:50:52.735Z",
    "context": "webgl2",
    "threeJs": null
  },
  "shaders": [
    {
      "type": "vertex",
      "source": "#version 300 es\nprecision mediump sampler2DArray...",
      "timestamp": 1768261844428,
      "context": "webgl2",
      "parsedUniforms": [...]
    },
    ...
  ]
}
```

### Step 3: Enable Shaders

Run the enable-shaders tool:

```bash
node tools/enable-shaders.js output/stripe/stripe.com-1768261639764
```

Expected output:
```
🎨 Enabling shader support...
   Extraction: /path/to/output/stripe/stripe.com-1768261639764

   Found 10 shaders
   Vertex shader: 2192 chars
   Fragment shader: 2048 chars

   Parsed 16 unique uniforms

   Backing up index.html → index.html.original
   Injecting shader-runtime.js

✅ Shader support enabled
   Modified: /path/to/index.html
   Backup: /path/to/index.html.original

💡 Test the shader rendering:
   cd /path/to/output/stripe/stripe.com-1768261639764
   python3 -m http.server 8080
   open http://localhost:8080

💡 To revert changes:
   cp /path/to/index.html.original /path/to/index.html
```

### Step 4: Verify the Injection

Check that backup was created:

```bash
ls -lh output/stripe/stripe.com-1768261639764/index.html*
```

Output:
```
-rw-r--r--  1 user  staff    13M Jan 12 17:01 index.html
-rw-r--r--  1 user  staff    12M Jan 12 17:01 index.html.original
```

Notice the modified file is slightly larger (shader runtime added).

Check for the shader runtime marker:

```bash
grep -c "SHADER-RUNTIME-INJECTED" output/stripe/stripe.com-1768261639764/index.html
```

Output: `1` (marker found once)

### Step 5: Test in Browser

Serve the extraction and open in browser:

```bash
cd output/stripe/stripe.com-1768261639764
python3 -m http.server 8080
```

Open http://localhost:8080 in your browser.

Expected results:
- ✅ Page loads successfully
- ✅ Gradient animation visible
- ✅ Canvas renders WebGL shader
- ✅ Animation is smooth
- ✅ Drag interaction works

### Step 6: Inspect Browser Console

Check browser console for shader runtime logs:

```
[Shader Runtime] Found canvas: <canvas class="Gradient__canvas">
[Shader Runtime] Using WebGL2
[Shader Runtime] Shader program compiled successfully
[Shader Runtime] Attributes: {position: 0, uv: 1, rndId: 2}
[Shader Runtime] Uniforms: ["u_time", "u_drag_time", "u_resolution", ...]
[Shader Runtime] Resized to 1920 x 1080
[Shader Runtime] Starting render loop
```

### Step 7: Test Idempotency

Try running the tool again:

```bash
node tools/enable-shaders.js output/stripe/stripe.com-1768261639764
```

Expected output:
```
🎨 Enabling shader support...
   Extraction: /path/to/output/stripe/stripe.com-1768261639764

   Found 10 shaders
   Vertex shader: 2192 chars
   Fragment shader: 2048 chars

ℹ️  Shader support already enabled - skipping injection
   (Found shader runtime marker in HTML)

💡 To re-inject, restore from backup first:
   cp /path/to/index.html.original /path/to/index.html
   node tools/enable-shaders.js /path/to/extraction
```

### Step 8: Revert Changes (Optional)

To restore the original HTML:

```bash
cp output/stripe/stripe.com-1768261639764/index.html.original \
   output/stripe/stripe.com-1768261639764/index.html
```

Verify restoration:
```bash
grep -c "SHADER-RUNTIME-INJECTED" output/stripe/stripe.com-1768261639764/index.html
```

Output: `0` (marker not found - original restored)

### Step 9: Re-enable (Optional)

After restoring, you can re-enable:

```bash
node tools/enable-shaders.js output/stripe/stripe.com-1768261639764
```

This creates a fresh injection with the same backup preserved.

## Complete Workflow Summary

```bash
# 1. Extract page
node tools/v7-extract.js https://stripe.com

# 2. Enable shaders
node tools/enable-shaders.js output/stripe/stripe.com-TIMESTAMP

# 3. Test
cd output/stripe/stripe.com-TIMESTAMP && python3 -m http.server 8080

# 4. Open browser
open http://localhost:8080

# 5. (Optional) Revert
cp index.html.original index.html
```

## Troubleshooting Example

### Problem: Shader Not Rendering

Check browser console for errors:

```javascript
// Expected logs:
[Shader Runtime] Found canvas: ...
[Shader Runtime] Using WebGL2
[Shader Runtime] Shader program compiled successfully

// Error example:
[Shader Runtime] No canvas element found
```

**Solution**: Verify canvas selector in shader runtime matches your page:

```javascript
const CANVAS_SELECTORS = [
  '.Gradient__canvas',        // Stripe
  'canvas[class*="gradient"]', // Generic
  'canvas[class*="shader"]',   // Generic
  'canvas'                     // Fallback
];
```

### Problem: Black Canvas

Check shader compilation:

```javascript
// Error log example:
[Shader Runtime] Compilation error: ERROR: 0:1: 'version' : must occur first in shader
```

**Solution**: This indicates a shader version mismatch. Check the extracted shader source.

### Problem: Already Enabled Message

```bash
ℹ️  Shader support already enabled - skipping injection
```

**Solution**: This is expected behavior. To re-inject, restore from backup first:

```bash
cp index.html.original index.html
node tools/enable-shaders.js output/stripe/stripe.com-TIMESTAMP
```

## Advanced Usage

### Extract and Enable in One Command

```bash
node tools/v7-extract.js https://stripe.com && \
  node tools/enable-shaders.js $(ls -td output/stripe/* | head -1)
```

This extracts the page and immediately enables shaders on the latest extraction.

### Batch Processing

Enable shaders for all extractions in a directory:

```bash
for dir in output/stripe/stripe.com-*; do
  echo "Processing $dir..."
  node tools/enable-shaders.js "$dir"
done
```

### Verify All Extractions

Check which extractions have shaders enabled:

```bash
for dir in output/stripe/stripe.com-*; do
  if grep -q "SHADER-RUNTIME-INJECTED" "$dir/index.html" 2>/dev/null; then
    echo "✅ $dir - Enabled"
  else
    echo "❌ $dir - Not enabled"
  fi
done
```

## Performance Comparison

### Before Enabling Shaders

```html
<!-- Static HTML with placeholder canvas -->
<canvas class="Gradient__canvas" style="display: block;"></canvas>
```

Result: Empty black canvas, no animation

### After Enabling Shaders

```html
<!-- Same canvas, now with injected runtime -->
<canvas class="Gradient__canvas" style="display: block;"></canvas>

<script>
// Shader runtime code injected here
(function initShaderRuntime() {
  // WebGL setup
  // Shader compilation
  // Animation loop
})();
</script>
```

Result: Animated gradient, interactive, smooth 60fps

## Success Metrics

After enabling shaders, verify these metrics:

- ✅ **Visual**: Gradient animation visible
- ✅ **Performance**: 60fps in browser
- ✅ **Interaction**: Drag response works
- ✅ **Responsive**: Resizes with window
- ✅ **Console**: No errors in browser console
- ✅ **File size**: HTML increased by ~10-15KB (runtime code)
- ✅ **Backup**: `.original` file exists

## Comparison with Original

### Original Stripe.com
- Uses Three.js WebGL renderer
- Complex shader setup
- Multiple uniforms and attributes
- Drag interaction effects

### Extracted + Enabled
- Uses custom lightweight runtime
- Same shaders (captured from original)
- Same visual effect
- Same interaction behavior
- No Three.js dependency

## Next Steps

After successfully enabling shaders:

1. **Compare Visual Output**: Open original and extracted side-by-side
2. **Performance Test**: Monitor FPS and GPU usage
3. **Interaction Test**: Test drag, scroll, resize behaviors
4. **Cross-Browser**: Test in Chrome, Firefox, Safari
5. **Mobile Test**: Test on mobile devices
6. **Optimize**: Adjust mesh density if needed

## Related Documentation

- `ENABLE-SHADERS-README.md` - Full tool documentation
- `V7-EXTRACTOR.md` - V7 extraction pipeline
- `V7-QUICK-START.md` - Quick start guide
- `THREE-PIPELINES.md` - Complete pipeline overview

## Support

If you encounter issues:

1. Check `shaders.json` exists and has valid data
2. Verify canvas element exists in HTML
3. Check browser WebGL support
4. Review browser console logs
5. Compare with `shader-demo.html` in extraction
6. Try reverting and re-enabling

## Conclusion

The `enable-shaders.js` tool provides a simple, reliable way to add WebGL shader rendering to extracted pages. It's non-destructive, reversible, and integrates seamlessly with the V7 extraction pipeline.
