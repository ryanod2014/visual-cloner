# Phase Flag Implementation Test Results

## Implementation Summary

Added `--phase` flag to extract.js that allows running individual phases in isolation.

### Features Implemented:

1. **Argument Parsing**: Both `--phase=<name>` and `--phase <name>` syntax supported
2. **Phase Validation**: Validates phase names against valid list (init, capture, trigger, discover, assemble)
3. **Checkpoint Loading**: Automatically loads checkpoint for phases that need prior context
4. **Conditional Pipeline**: Only adds requested phase to pipeline when --phase is specified
5. **Help Documentation**: Updated help text with phase flag and examples

### Valid Phase Names:
- `init` - Initialize browser and page
- `capture` - Capture network responses (needs init)
- `trigger` - Trigger dynamic content (needs capture)
- `discover` - Discover resources in page (needs capture)
- `assemble` - Assemble final output (needs all prior)

## Test Results

### 1. Help Text Display
```bash
$ node extract.js --help
```
**Result**: PASS - Help text displays --phase flag documentation with examples

### 2. Invalid Phase Error Handling
```bash
$ node extract.js https://example.com --phase=invalid
```
**Result**: PASS - Shows error message with valid phase list:
```
Error: Invalid phase 'invalid'
Valid phases: init, capture, trigger, discover, assemble
```

### 3. Syntax Support
Both syntax variants work correctly:
- `--phase=capture` ✓
- `--phase capture` ✓

### 4. Checkpoint Requirement
When running a phase that needs prior context (any phase except `init`), the system:
- Attempts to load checkpoint from output directory
- If no checkpoint found, displays helpful error message with instructions
- If checkpoint found, logs "Loaded checkpoint from prior phases"

## Usage Examples

### Full Extraction (default behavior)
```bash
node extract.js https://photopea.com
```

### Run Single Phase for Debugging
```bash
# Initialize only
node extract.js https://photopea.com --phase=init

# Capture only (requires prior phases)
node extract.js https://photopea.com --phase=capture --output ./output/existing-dir

# Re-run discover phase
node extract.js https://photopea.com --phase=discover --output ./output/existing-dir
```

### Sequential Phase Execution
```bash
# Step 1: Initialize
node extract.js https://example.com --phase=init --output ./my-extraction

# Step 2: Capture (loads checkpoint)
node extract.js https://example.com --phase=capture --output ./my-extraction

# Step 3: Trigger
node extract.js https://example.com --phase=trigger --output ./my-extraction

# Step 4: Discover
node extract.js https://example.com --phase=discover --output ./my-extraction

# Step 5: Assemble
node extract.js https://example.com --phase=assemble --output ./my-extraction
```

## Code Changes

### Files Modified:
- `/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/refactored_starting_from_scratch/extract.js`

### Key Changes:
1. Added `phase: null` to parseArgs result object (line 43)
2. Added phase parsing logic for both `--phase=value` and `--phase value` syntax (lines 85-93)
3. Added phase validation after URL validation (lines 194-200)
4. Added phase logging to header output (lines 219-221)
5. Added checkpoint loading logic for non-init phases (lines 238-253)
6. Added conditional pipeline building based on phase flag (lines 267-286)
7. Updated help text with phase documentation (lines 138-151)

## Behavior

### Without --phase flag:
- Runs all phases in sequence (init → capture → trigger → discover → assemble)
- Creates checkpoints after each phase
- Normal full extraction behavior

### With --phase flag:
- Only runs specified phase
- Validates phase name
- Loads checkpoint if phase needs prior context
- Logs "Mode: Single phase (phasename)"
- Logs "Running only: phasename"
- Still creates checkpoint after phase completes

## Error Messages

### Missing Checkpoint Error:
```
Error: No checkpoint found in [output-dir]

Phase isolation requires a checkpoint from prior phases.
Either run the full extraction first, or run phases in sequence:
  node extract.js https://example.com --phase=init
  node extract.js https://example.com --phase=capture --output [output-dir]
```

## Integration

The implementation integrates cleanly with existing features:
- Works with `--debug` flag
- Works with `--dry-run` flag
- Works with `--verbose` flag
- Works with `--output` flag
- Works with `--headless` flag
- Works with `--timeout` flag
- Does not conflict with `serve` command

## Testing Recommendations

1. **Unit Test**: Test phase parsing with various inputs
2. **Integration Test**: Run each phase individually on a test URL
3. **Error Test**: Verify checkpoint missing error handling
4. **Sequential Test**: Run all phases sequentially and verify output matches full extraction
5. **Edge Cases**: Test invalid phase names, missing output dirs, etc.
