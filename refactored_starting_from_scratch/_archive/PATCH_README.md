# Standalone Patching Script

The `patch.js` script allows you to apply domain bypass patches to extracted resources independently from the extraction process.

## Overview

This enables a clean separation between:
1. **Extraction** - Pure capture of website resources
2. **Patching** - Modification of JavaScript to bypass domain restrictions
3. **Serving** - Running the patched application locally

## Usage

```bash
# Extract website (pure capture)
node extract.js https://photopea.com

# Apply patches (separate step)
node patch.js ./output/photopea.com-123456/

# Serve the patched application
cd ./output/photopea.com-123456/
node serve.js
```

## Command Line Options

```bash
node patch.js <output-dir> [options]
```

**Options:**
- `--debug, -d` - Enable detailed debug logging
- `--dry-run` - Preview what would be patched without modifying files
- `--backup` - Create `.bak` backup files before patching
- `--help, -h` - Show help message

## Examples

### Basic Usage
```bash
node patch.js ./output/photopea.com-123456/
```

### Dry Run (Preview Changes)
```bash
node patch.js ./output/photopea.com-123456/ --dry-run
```

### With Backup
```bash
node patch.js ./output/photopea.com-123456/ --backup
```

### Debug Mode
```bash
node patch.js ./output/photopea.com-123456/ --debug
```

## What It Does

1. **Validates** the output directory structure
2. **Loads** the url-map.json to find all resources
3. **Initializes** all patchers from `plugins/patchers/`
4. **Processes** each text-based resource (JS, CSS, HTML)
5. **Applies** relevant patches based on pattern matching
6. **Saves** patched files back to the resources/ folder
7. **Creates** a patch-report.json with details
8. **Updates** manifest.json with patch statistics

## Output Files

After running the patch script:

- **resources/*.js** - Patched JavaScript files (modified in place)
- **patch-report.json** - Detailed report of all patches applied
- **manifest.json** - Updated with patch count and timestamp

## Patchers

The script uses all patchers defined in `plugins/patchers/`:

1. **PhotopeaPatcher** - Photopea-specific domain bypass
   - U.alp function (app mode)
   - aat flag (feature restrictions)
   - J.adQ function (domain validation)
   - ak6 flag (license checks)

2. **DomainBypassPatcher** - Generic domain checks
   - hostname checks
   - origin checks
   - navigator.onLine checks
   - domain validation errors

## Re-running

The patch script is **idempotent** and can be run multiple times:
- Already patched files will be re-patched with the same results
- No harm in running it multiple times
- Use `--backup` flag for extra safety on first run

## Integration with Extraction

The patch script reads the exact same format created by `extract.js`:
- Uses `url-map.json` to locate resources
- Respects the `resources/` directory structure
- Updates the same `manifest.json` file

## Troubleshooting

### "Invalid extraction directory"
- Ensure you're pointing to a valid extraction output folder
- Directory must contain `resources/` folder and `url-map.json`

### "No patches needed"
- The extracted files don't contain any domain-restricted patterns
- This is normal for many websites

### Files not patching
- Use `--debug` flag to see which patchers are being applied
- Check if the file is being processed (text content only)
- Verify patterns exist in the JavaScript code

## Advanced Usage

### Creating Custom Patchers

Add new patchers to `plugins/patchers/`:

```javascript
import { IPatcher, PatchResult } from './interface.js';

export class MyCustomPatcher extends IPatcher {
  constructor() {
    super('my-patcher', 'Description of what it does');
  }

  shouldApply(content, filename) {
    // Return true if this patcher should run on this file
    return filename.endsWith('.js') && content.includes('myPattern');
  }

  apply(content) {
    // Apply patches and return result
    const modified = content.replace(/myPattern/g, 'myReplacement');
    const patches = [new PatchResult('my-pattern', 1, ['example'])];
    return { content: modified, patches };
  }
}
```

Then add it to `plugins/patchers/index.js`:

```javascript
import { MyCustomPatcher } from './my-custom.js';

export function getAllPatchers() {
  return [
    new PhotopeaPatcher(),
    new DomainBypassPatcher(),
    new MyCustomPatcher(),  // Add your custom patcher
  ];
}
```
