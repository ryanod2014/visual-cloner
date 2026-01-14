#!/usr/bin/env python3
"""
V8 Code Enhancement Pipeline - CLI Entry Point

Usage:
    python -m tools.code_enhancer <input> [options]

Examples:
    python -m tools.code_enhancer ./minified.js
    python -m tools.code_enhancer ./resources/ --output ./enhanced/
    python -m tools.code_enhancer ./code.js --skip-docs --skip-naming
"""

import argparse
import sys
from pathlib import Path

from .orchestrator import V8Pipeline, V8Config


def main():
    parser = argparse.ArgumentParser(
        description='V8 Code Enhancement Pipeline - Transform minified code into readable, documented code',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
    %(prog)s ./minified.js
    %(prog)s ./resources/ --output ./enhanced/
    %(prog)s ./code.js --skip-docs
    %(prog)s ./bundle.js --analyze-only

Pipeline Phases:
    0. Analysis      - Detect obfuscator, bundler, source maps
    1. Recovery      - Extract from source maps (if available)
    2. Deobfuscation - webcrack, synchrony, restringer
    3. Formatting    - Prettier
    4. Naming        - Heuristic-based variable renaming
    5. Documentation - Template-based JSDoc
    6. Validation    - Verify code still parses
        '''
    )

    parser.add_argument(
        'input',
        type=str,
        help='Input JavaScript file or directory'
    )

    parser.add_argument(
        '-o', '--output',
        type=str,
        default=None,
        help='Output directory (default: <input_dir>/enhanced/)'
    )

    parser.add_argument(
        '--skip-deobfuscation',
        action='store_true',
        help='Skip deobfuscation phase'
    )

    parser.add_argument(
        '--skip-naming',
        action='store_true',
        help='Skip variable naming phase'
    )

    parser.add_argument(
        '--skip-docs',
        action='store_true',
        help='Skip documentation phase'
    )

    parser.add_argument(
        '--skip-validation',
        action='store_true',
        help='Skip validation phase'
    )

    parser.add_argument(
        '--analyze-only',
        action='store_true',
        help='Only analyze code, don\'t transform'
    )

    parser.add_argument(
        '--overwrite',
        action='store_true',
        help='Overwrite existing output directory'
    )

    parser.add_argument(
        '--fail-on-invalid',
        action='store_true',
        help='Fail if validation detects invalid code'
    )

    parser.add_argument(
        '--version',
        action='version',
        version='V8 Code Enhancement Pipeline v8.0.0'
    )

    args = parser.parse_args()

    # Validate input
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input path does not exist: {input_path}")
        sys.exit(1)

    # Handle analyze-only mode
    if args.analyze_only:
        from .detector import CodeDetector
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

        sys.exit(0)

    # Create config
    config = V8Config(
        skip_deobfuscation=args.skip_deobfuscation,
        skip_naming=args.skip_naming,
        skip_documentation=args.skip_docs,
        skip_validation=args.skip_validation,
        overwrite_existing=args.overwrite,
        fail_on_invalid=args.fail_on_invalid,
    )

    # Create pipeline
    pipeline = V8Pipeline(config)

    # Run enhancement
    output_dir = Path(args.output) if args.output else None
    result = pipeline.enhance(input_path, output_dir)

    # Exit code
    sys.exit(0 if result.success else 1)


if __name__ == '__main__':
    main()
