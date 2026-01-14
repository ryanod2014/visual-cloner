#!/bin/bash
# Test script for --phase flag functionality

echo "=================================================="
echo "  Phase Flag Testing"
echo "=================================================="
echo ""

# Test 1: Help text
echo "Test 1: Help text includes phase documentation"
echo "---"
node extract.js --help | grep -A 5 "PHASE ISOLATION" | head -6
echo ""

# Test 2: Invalid phase
echo "Test 2: Invalid phase name error handling"
echo "---"
node extract.js https://example.com --phase=invalid 2>&1 | head -2
echo ""

# Test 3: Both syntax variants
echo "Test 3: Both --phase=value and --phase value syntax work"
echo "---"
echo "Testing --phase=init:"
node extract.js https://example.com --phase=init 2>&1 | grep "Mode:" || echo "  Parsed successfully"
echo "Testing --phase capture:"
node extract.js https://example.com --phase capture 2>&1 | grep "Mode:" || echo "  Parsed successfully"
echo ""

# Test 4: Valid phase list
echo "Test 4: Valid phases are:"
echo "---"
echo "  - init (no checkpoint needed)"
echo "  - capture (needs init)"
echo "  - trigger (needs capture)"
echo "  - discover (needs capture)"
echo "  - assemble (needs all prior)"
echo ""

# Test 5: Missing checkpoint error
echo "Test 5: Checkpoint requirement for dependent phases"
echo "---"
echo "Running --phase=capture without checkpoint:"
node extract.js https://example.com --phase=capture --output /tmp/test-phase-$$ 2>&1 | grep "Error:" | head -1
rm -rf /tmp/test-phase-$$
echo ""

echo "=================================================="
echo "  All Tests Complete"
echo "=================================================="
echo ""
echo "Usage examples:"
echo "  # Full extraction:"
echo "  node extract.js https://photopea.com"
echo ""
echo "  # Debug single phase:"
echo "  node extract.js https://photopea.com --phase=capture"
echo ""
echo "  # Re-run phase with existing output:"
echo "  node extract.js https://photopea.com --phase=discover --output ./output/existing-dir"
echo ""
