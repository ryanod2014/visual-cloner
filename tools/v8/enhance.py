#!/usr/bin/env python3
"""
V8 Code Enhancement Pipeline - JavaScript Beautification

Transform minified/obfuscated JavaScript into readable, documented code.
100% programmatic - no AI/LLM required.

IMPORTANT: V8 is a POST-PROCESSING tool that ONLY beautifies code.
           For webapp extraction, use V7 Extractor FIRST.

           V7 = Extraction (gets all files, WebGL, backend docs)
           V8 = Beautification (makes code readable)

See: V7-V8-QUICK-REFERENCE.md for details

Usage:
    ./v8-enhance.py <input> [options]
    python v8-enhance.py ./minified.js
    python v8-enhance.py ./resources/ --output ./enhanced/

Pipeline Phases:
    0. Analysis      - Detect obfuscator, bundler, source maps
    1. Recovery      - Extract from source maps (if available)
    2. Deobfuscation - webcrack, synchrony, restringer
    3. Formatting    - Prettier (BEAUTIFYING)
    4. Naming        - Heuristic-based variable renaming (a, b, c → meaningful names)
    5. Documentation - Template-based JSDoc
    6. Validation    - Verify code still parses
"""

import argparse
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from code_enhancer import V8Pipeline, V8Config, CodeDetector


def main():
    parser = argparse.ArgumentParser(
        description='V8 Code Enhancement Pipeline',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
    python v8-enhance.py ./minified.js
    python v8-enhance.py ./resources/ -o ./enhanced/
    python v8-enhance.py ./code.js --analyze-only
    python v8-enhance.py ./bundle.js --skip-docs --skip-naming
        '''
    )

    parser.add_argument('input', help='Input JavaScript file or directory')
    parser.add_argument('-o', '--output', help='Output directory')
    parser.add_argument('--skip-deobfuscation', action='store_true')
    parser.add_argument('--skip-naming', action='store_true')
    parser.add_argument('--skip-docs', action='store_true')
    parser.add_argument('--skip-validation', action='store_true')
    parser.add_argument('--analyze-only', action='store_true', help='Only analyze, don\'t transform')
    parser.add_argument('--overwrite', action='store_true')

    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: {input_path} does not exist")
        sys.exit(1)

    # Analyze only mode
    if args.analyze_only:
        detector = CodeDetector()
        print("\n" + "=" * 60)
        print("  V8 CODE ANALYSIS")
        print("=" * 60)

        if input_path.is_file():
            result = detector.analyze_file(input_path)
            detector.print_analysis(result)
        else:
            results = detector.analyze_directory(input_path)
            for path, result in results.items():
                detector.print_analysis(result)
        return

    # Full pipeline
    config = V8Config(
        skip_deobfuscation=args.skip_deobfuscation,
        skip_naming=args.skip_naming,
        skip_documentation=args.skip_docs,
        skip_validation=args.skip_validation,
        overwrite_existing=args.overwrite,
    )

    pipeline = V8Pipeline(config)
    output_dir = Path(args.output) if args.output else None
    result = pipeline.enhance(input_path, output_dir)

    sys.exit(0 if result.success else 1)


if __name__ == '__main__':
    main()
