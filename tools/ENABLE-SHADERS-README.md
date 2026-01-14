# Enable Shaders Tool

Post-processing tool that adds WebGL shader rendering to extracted pages.

## Overview

`enable-shaders.js` reads shader data from an extraction directory's `shaders.json` file and injects a runtime renderer that recreates the original WebGL shader effects.

## Features

- ✅ **Non-destructive**: Backs up original HTML before modification
- ✅ **Reversible**: Can restore from backup at any time
- ✅ **Idempotent**: Won't double-inject if already enabled
- ✅ **Validates**: Checks shader data structure before injection
- ✅ **Interactive**: Supports mouse/touch drag interactions
- ✅ **Responsive**: Handles canvas resizing automatically

## Usage

```bash
node tools/enable-shaders.js <extraction-dir>
```

### Example

```bash
# Enable shaders for a Stripe extraction
node tools/enable-shaders.js output/stripe/stripe.com-1768261639764

# Expected output:
# 🎨 Enabling shader support...
#    Extraction: /path/to/output/stripe/stripe.com-1768261639764
#
#    Found 10 shaders
#    Vertex shader: 2192 chars
#    Fragment shader: 2048 chars
#
#    Parsed 16 unique uniforms
#
#    Backing up index.html → index.html.original
#    Injecting shader-runtime.js
#
# ✅ Shader support enabled
#    Modified: /path/to/index.html
#    Backup: /path/to/index.html.original
```

## Testing

After enabling shaders, test the extraction:

```bash
cd output/stripe/stripe.com-1768261639764
python3 -m http.server 8080
open http://localhost:8080
```

## How It Works

### 1. Validation
- Checks that extraction directory exists
- Verifies `shaders.json` is present
- Validates shader data structure

### 2. Shader Analysis
- Reads vertex and fragment shader sources
- Parses uniform declarations
- Validates shader pair completeness

### 3. Runtime Generation
- Creates WebGL context (WebGL2 or WebGL1)
- Compiles and links shader program
- Generates mesh geometry (100x100 grid)
- Sets up vertex buffers and attributes

### 4. Injection
- Backs up original HTML to `index.html.original`
- Injects shader runtime script before `</body>`
- Adds marker to prevent double-injection

### 5. Animation Loop
- Handles time-based animations
- Supports drag interactions
- Manages canvas resizing
- Sets uniform values automatically

## Shader Runtime Features

The injected runtime includes:

### Canvas Detection
Automatically finds canvas element using multiple selectors:
- `.Gradient__canvas`
- `canvas[class*="gradient"]`
- `canvas[class*="shader"]`
- Generic `canvas` fallback

### WebGL Context
- Prefers WebGL2 when available
- Falls back to WebGL1
- Logs context type for debugging

### Geometry
- Dense 100x100 mesh grid for smooth animations
- Position, UV, and random ID attributes
- Indexed triangle rendering

### Uniforms
Auto-detects and sets common uniforms:
- `u_time`, `time` - Animation time
- `u_resolution`, `resolution` - Canvas dimensions
- `u_dragging`, `u_drag_time` - Interaction state
- `u_r`, `u_g`, `u_b` - Color channels
- Matrix uniforms (`projectionMatrix`, `modelViewMatrix`, etc.)

### Interaction
- Pointer events (mouse/touch)
- Drag tracking
- Drag duration calculation

### Error Handling
- Shader compilation errors with line numbers
- Program linking errors
- Missing canvas warnings
- WebGL availability checks

## Reverting Changes

To restore the original HTML:

```bash
cp index.html.original index.html
```

Or to re-inject with different settings:

```bash
# Restore original
cp index.html.original index.html

# Re-inject
node tools/enable-shaders.js output/stripe/stripe.com-1768261639764
```

## Error Cases

### No Extraction Directory
```
❌ Extraction directory not found: /path/to/nonexistent
```
**Fix**: Check the path and ensure extraction was successful.

### Missing shaders.json
```
❌ shaders.json not found in extraction directory
💡 Make sure you ran V7 extraction with shader capture enabled.
```
**Fix**: Re-run extraction using `v7-extract.js` or `v7-crawler.js`.

### Empty Shaders
```
ℹ️  No shaders found in shaders.json - nothing to inject
   The page may not use WebGL shaders.
```
**Info**: Page doesn't use WebGL shaders, no injection needed.

### Missing Shader Pair
```
❌ Missing shader pair (need both vertex and fragment)
   Found: vertex
💡 Shader runtime requires at least one vertex and one fragment shader.
```
**Fix**: Ensure extraction captured complete shader programs.

### Already Enabled
```
ℹ️  Shader support already enabled - skipping injection
   (Found shader runtime marker in HTML)

💡 To re-inject, restore from backup first:
   cp index.html.original index.html
```
**Info**: Prevents double-injection. Restore from backup to re-inject.

## Integration with V7 Pipeline

This tool is designed for the V7 extraction pipeline:

```bash
# 1. Extract page with shaders
node tools/v7-extract.js https://stripe.com

# 2. Enable shader rendering
node tools/enable-shaders.js output/stripe/stripe.com-TIMESTAMP

# 3. Test
cd output/stripe/stripe.com-TIMESTAMP
python3 -m http.server 8080
```

## Technical Details

### Shader Data Format

The tool expects `shaders.json` in this format:

```json
{
  "meta": {
    "source": "https://example.com",
    "extractedAt": "2026-01-12T...",
    "context": "webgl2"
  },
  "shaders": [
    {
      "type": "vertex",
      "source": "#version 300 es\n...",
      "timestamp": 1768261844428,
      "context": "webgl2",
      "parsedUniforms": [...]
    },
    {
      "type": "fragment",
      "source": "#version 300 es\n...",
      "timestamp": 1768261844429,
      "context": "webgl2",
      "parsedUniforms": [...]
    }
  ]
}
```

### Uniform Parsing

The tool parses uniforms using regex:

```javascript
/uniform\s+(float|int|bool|vec2|vec3|vec4|mat3|mat4|sampler2D|sampler2DArray)\s+(\w+)/g
```

Supports standard GLSL types and deduplicates by name.

### Injection Strategy

Injects inline `<script>` tag before `</body>`:
- ✅ No CORS issues (inline code)
- ✅ No additional HTTP requests
- ✅ Self-contained and portable
- ✅ Easy to debug (view source)

### Marker System

Uses HTML comment marker to track injection:
```html
<!-- SHADER-RUNTIME-INJECTED -->
```

This prevents double-injection and allows verification.

## Troubleshooting

### Shader Not Rendering
1. Check browser console for errors
2. Verify canvas element exists
3. Check WebGL support: `about:gpu` in Chrome
4. Compare with `shader-demo.html` in extraction

### Black Canvas
1. Uniform values may be incorrect
2. Check shader compilation logs
3. Try different default values
4. Compare with original page

### Performance Issues
1. Reduce mesh density (MESH_DENSITY constant)
2. Check GPU capabilities
3. Simplify shader code
4. Test on different devices

## Future Enhancements

Possible improvements:
- [ ] Support multiple shader programs
- [ ] Custom uniform value configuration
- [ ] Texture loading and binding
- [ ] Animation timeline controls
- [ ] Performance monitoring
- [ ] Shader hot-reloading

## See Also

- `v7-extract.js` - Main extraction tool
- `v7-crawler.js` - Multi-page crawler
- `inject-shader-renderer.js` - Original injector (superseded)
- `shader-demo.html` - Standalone shader test file

## License

Part of the visual-cloner project.
