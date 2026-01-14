# Phase Flag Implementation

## Overview

Added `--phase` command line flag to `/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/refactored_starting_from_scratch/extract.js` to enable running individual phases in isolation for debugging and re-execution.

## Features

### 1. Command Line Argument Parsing
- Supports both `--phase=<name>` and `--phase <name>` syntax
- Added to `parseArgs()` function (lines 85-93)
- Stored in args.phase property

### 2. Phase Validation
- Validates phase name against valid list: `init`, `capture`, `trigger`, `discover`, `assemble`
- Shows clear error message with valid options if invalid phase provided
- Implemented in main() function (lines 194-200)

### 3. Checkpoint Loading
- Automatically loads checkpoint for phases that need prior context
- All phases except `init` require a checkpoint
- Clear error message with instructions if checkpoint not found
- Implemented in main() function (lines 238-253)

### 4. Conditional Pipeline Building
- When --phase specified, only adds that single phase to pipeline
- Without --phase, runs full pipeline (all phases)
- Uses phase map to instantiate correct phase class
- Implemented in main() function (lines 267-286)

### 5. Help Documentation
- Updated printUsage() with --phase flag documentation
- Added PHASE ISOLATION section with phase descriptions
- Shows examples of phase flag usage
- Updated in printUsage() function (lines 138-151)

## Usage

### Full Extraction (default)
```bash
node extract.js https://photopea.com
```

### Single Phase Execution
```bash
# Run only capture phase
node extract.js https://photopea.com --phase=capture

# Run only discover phase
node extract.js https://photopea.com --phase=discover
```

### Sequential Phase Execution
```bash
# Step by step execution
node extract.js https://example.com --phase=init --output ./my-extraction
node extract.js https://example.com --phase=capture --output ./my-extraction
node extract.js https://example.com --phase=trigger --output ./my-extraction
node extract.js https://example.com --phase=discover --output ./my-extraction
node extract.js https://example.com --phase=assemble --output ./my-extraction
```

## Valid Phase Names

| Phase | Description | Requires Checkpoint |
|-------|-------------|---------------------|
| `init` | Initialize browser and page | No |
| `capture` | Capture network responses | Yes (needs init) |
| `trigger` | Trigger dynamic content | Yes (needs capture) |
| `discover` | Discover resources in page | Yes (needs capture) |
| `assemble` | Assemble final output | Yes (needs all prior) |

## Implementation Details

### Code Changes

**File**: `/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/refactored_starting_from_scratch/extract.js`

#### 1. parseArgs() function (lines 33-114)
```javascript
// Added phase to result object
const result = {
  // ... other fields ...
  phase: null,
};

// Added phase parsing
if (arg.startsWith('--phase=')) {
  result.phase = arg.split('=')[1];
  continue;
}

if (arg === '--phase') {
  result.phase = args[++i];
  continue;
}
```

#### 2. printUsage() function (lines 116-151)
```javascript
// Added examples
node extract.js https://example.com --phase=capture
node extract.js https://example.com --phase=discover

// Added option documentation
--phase <name>        Run single phase in isolation (init, capture, trigger, discover, assemble)
                      For phases needing prior context, loads from checkpoint

// Added PHASE ISOLATION section
PHASE ISOLATION:
  Run a single phase for debugging or re-execution:
    --phase=init        Initialize browser and page
    --phase=capture     Capture network responses (needs init)
    --phase=trigger     Trigger dynamic content (needs capture)
    --phase=discover    Discover resources in page (needs capture)
    --phase=assemble    Assemble final output (needs all prior)
```

#### 3. main() function (lines 175-292)
```javascript
// Phase validation
const validPhases = ['init', 'capture', 'trigger', 'discover', 'assemble'];
if (args.phase && !validPhases.includes(args.phase)) {
  console.error(`Error: Invalid phase '${args.phase}'`);
  console.error(`Valid phases: ${validPhases.join(', ')}`);
  process.exit(1);
}

// Log phase mode
if (args.phase) {
  logger.info(`Mode: Single phase (${args.phase})`);
}

// Load checkpoint for dependent phases
if (args.phase && args.phase !== 'init') {
  const checkpointLoaded = await state.loadCheckpoint(outputDir);
  if (!checkpointLoaded) {
    console.error('');
    console.error(`Error: No checkpoint found in ${outputDir}`);
    console.error('');
    console.error('Phase isolation requires a checkpoint from prior phases.');
    console.error('Either run the full extraction first, or run phases in sequence:');
    console.error(`  node extract.js ${args.url} --phase=init`);
    console.error(`  node extract.js ${args.url} --phase=capture --output ${outputDir}`);
    console.error('');
    process.exit(1);
  }
  logger.info('Loaded checkpoint from prior phases');
}

// Conditional pipeline building
if (args.phase) {
  const phaseMap = {
    'init': InitPhase,
    'capture': CapturePhase,
    'trigger': TriggerPhase,
    'discover': DiscoverPhase,
    'assemble': AssemblePhase,
  };
  const PhaseClass = phaseMap[args.phase];
  pipeline.addPhase(new PhaseClass(config));
  logger.info(`Running only: ${args.phase}`);
} else {
  // Full pipeline
  pipeline.addPhase(new InitPhase(config));
  pipeline.addPhase(new CapturePhase(config));
  pipeline.addPhase(new TriggerPhase(config));
  pipeline.addPhase(new DiscoverPhase(config));
  pipeline.addPhase(new AssemblePhase(config));
}
```

## Error Handling

### Invalid Phase Name
```
Error: Invalid phase 'badname'
Valid phases: init, capture, trigger, discover, assemble
```

### Missing Checkpoint
```
Error: No checkpoint found in [output-dir]

Phase isolation requires a checkpoint from prior phases.
Either run the full extraction first, or run phases in sequence:
  node extract.js https://example.com --phase=init
  node extract.js https://example.com --phase=capture --output [output-dir]
```

## Testing

All functionality verified with test script (`test-phase-flag.sh`):
- ✅ Help text displays phase documentation
- ✅ Invalid phase names show error with valid options
- ✅ Both `--phase=value` and `--phase value` syntax work
- ✅ Checkpoint loading for dependent phases
- ✅ Error message when checkpoint missing
- ✅ Single phase mode logging

## Integration

The --phase flag integrates seamlessly with existing flags:
- Works with `--debug` for debug logging
- Works with `--verbose` for detailed logging
- Works with `--dry-run` for dry run mode
- Works with `--output` to specify output directory
- Works with `--headless` to control browser visibility
- Works with `--timeout` to adjust timeouts
- Does not conflict with `serve` command

## Use Cases

### 1. Debugging a Specific Phase
```bash
# Debug only the capture phase
node extract.js https://photopea.com --phase=capture --debug
```

### 2. Re-running Failed Phase
```bash
# If discover phase failed, re-run it
node extract.js https://photopea.com --phase=discover --output ./output/existing-dir
```

### 3. Development/Testing
```bash
# Test changes to discover phase without running full pipeline
node extract.js https://photopea.com --phase=discover --output ./test-output
```

### 4. Incremental Processing
```bash
# Run phases incrementally with breaks between
node extract.js https://example.com --phase=init --output ./my-extraction
# ... analyze init results ...
node extract.js https://example.com --phase=capture --output ./my-extraction
# ... analyze capture results ...
# etc.
```

## Notes

- The pipeline still creates checkpoints after each phase completes
- Phase skipping (for resume) works independently of --phase flag
- Full pipeline behavior unchanged when --phase not specified
- Output directory must exist and contain checkpoint for dependent phases
- The `init` phase is special as it doesn't require a checkpoint
