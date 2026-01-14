# Phase Flag Quick Reference

## Syntax
```bash
node extract.js <url> --phase=<name>
node extract.js <url> --phase <name>
```

## Valid Phases
- `init` - Initialize browser and page (no checkpoint needed)
- `capture` - Capture network responses (needs init checkpoint)
- `trigger` - Trigger dynamic content (needs capture checkpoint)
- `discover` - Discover resources in page (needs capture checkpoint)
- `assemble` - Assemble final output (needs all prior checkpoints)

## Examples

### Run single phase
```bash
node extract.js https://photopea.com --phase=capture
```

### Debug specific phase
```bash
node extract.js https://photopea.com --phase=discover --debug
```

### Re-run phase with existing output
```bash
node extract.js https://photopea.com --phase=assemble --output ./output/photopea.com-1234567890
```

### Sequential execution
```bash
# Create output dir first time
node extract.js https://example.com --phase=init --output ./my-extraction

# Subsequent phases use same output dir
node extract.js https://example.com --phase=capture --output ./my-extraction
node extract.js https://example.com --phase=trigger --output ./my-extraction
node extract.js https://example.com --phase=discover --output ./my-extraction
node extract.js https://example.com --phase=assemble --output ./my-extraction
```

## Common Errors

### Invalid phase name
```
Error: Invalid phase 'badname'
Valid phases: init, capture, trigger, discover, assemble
```
**Solution**: Use a valid phase name from the list above

### Missing checkpoint
```
Error: No checkpoint found in [output-dir]
```
**Solution**: Either run prior phases first, or run full extraction to create checkpoint

## Tips

- Use `--debug` to see detailed phase execution
- Use `--output` to specify where checkpoint should be loaded from
- Only `init` phase can run without a checkpoint
- Full extraction creates checkpoints automatically
- Checkpoints are saved as `.checkpoint.json` in output directory
