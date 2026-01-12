"""
V8 Code Enhancement Pipeline Orchestrator
Coordinates all enhancement phases for readable, documented code

Pipeline:
  Phase 0: Analysis      → Detect obfuscator, bundler, source maps
  Phase 1: Recovery      → Extract from source maps (if available)
  Phase 2: Deobfuscation → webcrack, synchrony, restringer
  Phase 3: Formatting    → Prettier
  Phase 4: Naming        → Heuristic-based variable renaming
  Phase 5: Documentation → Template-based JSDoc
  Phase 6: Validation    → Verify code still parses
"""

import time
import json
import shutil
from pathlib import Path
from typing import Optional, List, Dict
from dataclasses import dataclass, asdict, field

from .tool_manager import ToolManager
from .detector import CodeDetector, DetectionResult
from .deobfuscator import Deobfuscator, DeobfuscationResult
from .namer import HeuristicNamer, NamingResult
from .documenter import TemplateDocumenter, DocumentationResult
from .validator import CodeValidator, ValidationResult
from .formatter import PrettierFormatter
from .source_mapper import SourceMapRecovery


@dataclass
class V8Config:
    """Configuration for V8 enhancement pipeline"""
    # Pipeline control
    skip_deobfuscation: bool = False
    skip_naming: bool = False
    skip_documentation: bool = False
    skip_validation: bool = False

    # Output options
    keep_intermediates: bool = True  # Keep files from each phase
    overwrite_existing: bool = False

    # Naming options
    min_naming_confidence: float = 0.7

    # Validation options
    fail_on_invalid: bool = False  # Stop if validation fails


@dataclass
class V8Result:
    """Results from V8 enhancement pipeline"""
    # Input
    input_path: Path
    input_files: int = 0

    # Timing
    start_time: str = ""
    duration_seconds: float = 0.0

    # Phase results
    detection: Dict = field(default_factory=dict)
    source_map_recovery: Dict = field(default_factory=dict)
    deobfuscation: Dict = field(default_factory=dict)
    formatting: Dict = field(default_factory=dict)
    naming: Dict = field(default_factory=dict)
    documentation: Dict = field(default_factory=dict)
    validation: Dict = field(default_factory=dict)

    # Output
    output_dir: Path = None
    final_files: int = 0

    # Summary
    success: bool = True
    errors: List[str] = field(default_factory=list)

    def to_dict(self):
        result = asdict(self)
        result['input_path'] = str(self.input_path)
        result['output_dir'] = str(self.output_dir) if self.output_dir else None
        return result


class V8Pipeline:
    """
    V8 Code Enhancement Pipeline

    Transforms minified/obfuscated code into readable, documented code.
    100% programmatic - no AI/LLM required.
    """

    def __init__(self, config: V8Config = None):
        self.config = config or V8Config()

        # Initialize components
        self.tool_manager = ToolManager()
        self.detector = CodeDetector()
        self.deobfuscator = Deobfuscator(self.tool_manager)
        self.formatter = PrettierFormatter()
        self.namer = HeuristicNamer()
        self.documenter = TemplateDocumenter()
        self.validator = CodeValidator()
        self.source_mapper = SourceMapRecovery()

    def enhance(self, input_path: Path, output_dir: Path = None) -> V8Result:
        """
        Run the full V8 enhancement pipeline.

        Args:
            input_path: Path to JS file or directory
            output_dir: Output directory (default: auto-detected based on input)

        Returns:
            V8Result with all phase results and final output
        """
        start_time = time.time()
        input_path = Path(input_path)

        # Setup output directory
        if output_dir is None:
            # Detect if this is a V7 extraction (has resources/ folder and manifest.json)
            is_v7_extraction = (
                input_path.name == 'resources' and
                (input_path.parent / 'manifest.json').exists()
            )

            if is_v7_extraction:
                # Save beautified code to resources-beautified/ to preserve raw extraction
                output_dir = input_path.parent / 'resources-beautified'
            else:
                # Default behavior for non-V7 extractions
                output_dir = input_path.parent / 'enhanced'
        output_dir = Path(output_dir)

        if output_dir.exists() and not self.config.overwrite_existing:
            # Create timestamped directory
            timestamp = int(time.time())
            output_dir = output_dir.parent / f"{output_dir.name}-{timestamp}"

        output_dir.mkdir(parents=True, exist_ok=True)

        # Initialize result
        result = V8Result(
            input_path=input_path,
            input_files=0,
            start_time=time.strftime('%Y-%m-%d %H:%M:%S'),
            output_dir=output_dir
        )

        print("\n" + "=" * 70)
        print("  V8 CODE ENHANCEMENT PIPELINE")
        print("  Programmatic code beautification and documentation")
        print("=" * 70)

        # Print tool status
        self.tool_manager.print_status()

        try:
            # Get input files
            if input_path.is_file():
                js_files = [input_path]
            else:
                js_files = [f for f in input_path.glob('**/*.js')
                           if 'node_modules' not in str(f)
                           and '.formatted.' not in f.name
                           and '.deob.' not in f.name]

            result.input_files = len(js_files)
            print(f"\n  Input: {len(js_files)} JavaScript file(s)")

            if not js_files:
                result.success = False
                result.errors.append("No JavaScript files found")
                return result

            # Process each file
            for js_file in js_files:
                print(f"\n{'─' * 70}")
                print(f"  Processing: {js_file.name}")
                print(f"{'─' * 70}")

                self._process_file(js_file, output_dir, result)

            # Generate summary
            result.final_files = len(list(output_dir.rglob('*.js')))
            result.duration_seconds = round(time.time() - start_time, 2)

            # Save report
            report_path = output_dir / 'v8-report.json'
            with open(report_path, 'w') as f:
                json.dump(result.to_dict(), f, indent=2)

            # Print summary
            self._print_summary(result)

            return result

        except Exception as e:
            result.success = False
            result.errors.append(str(e))
            result.duration_seconds = round(time.time() - start_time, 2)
            print(f"\n❌ Pipeline error: {e}")
            return result

    def _process_file(self, js_file: Path, output_dir: Path, result: V8Result):
        """Process a single JavaScript file through the pipeline"""

        # Create file-specific output directory
        file_output = output_dir / js_file.stem
        file_output.mkdir(exist_ok=True)

        current_file = js_file  # Track current state of the file

        # ─────────────────────────────────────────────────────────────────────
        # PHASE 0: ANALYSIS
        # ─────────────────────────────────────────────────────────────────────
        print("\n  📊 Phase 0: Analysis")

        detection = self.detector.analyze_file(js_file)
        result.detection[str(js_file)] = {
            'obfuscators': detection.obfuscators,
            'obfuscation_level': detection.obfuscation_level,
            'bundler': detection.bundler,
            'has_source_map': detection.has_source_map,
            'is_minified': detection.is_minified,
            'recommended_tools': detection.recommended_tools
        }

        self.detector.print_analysis(detection)

        # ─────────────────────────────────────────────────────────────────────
        # PHASE 1: SOURCE MAP RECOVERY
        # ─────────────────────────────────────────────────────────────────────
        if detection.has_source_map and detection.source_map_path:
            print("\n  📥 Phase 1: Source Map Recovery")

            source_dir = file_output / '1-source'
            map_path = Path(detection.source_map_path)

            if map_path.exists():
                source_maps = self.source_mapper.discover_and_download([js_file])
                if source_maps:
                    result.source_map_recovery[str(js_file)] = {
                        'found': True,
                        'files_extracted': len(source_maps[0].source_files) if source_maps else 0
                    }
                    print(f"  ✅ Extracted original source files")

                    # If source maps exist, we have original code - skip deobfuscation
                    if source_maps and source_maps[0].success:
                        print("  ℹ️  Skipping deobfuscation (have original source)")
                        current_file = source_dir
            else:
                print(f"  ⚠️  Source map referenced but not found: {map_path}")

        # ─────────────────────────────────────────────────────────────────────
        # PHASE 2: DEOBFUSCATION
        # ─────────────────────────────────────────────────────────────────────
        if not self.config.skip_deobfuscation and detection.obfuscation_level != 'none':
            print("\n  🔓 Phase 2: Deobfuscation")

            deob_dir = file_output / '2-deobfuscated'
            deob_result = self.deobfuscator.deobfuscate(current_file, deob_dir, detection)

            result.deobfuscation[str(js_file)] = {
                'success': deob_result.success,
                'tool_used': deob_result.tool_succeeded,
                'tools_tried': deob_result.tools_tried,
                'improvement_score': deob_result.improvement_score
            }

            if deob_result.success:
                print(f"  ✅ Deobfuscated with {deob_result.tool_succeeded}")
                print(f"     Improvement score: {deob_result.improvement_score:.0%}")
                current_file = deob_result.output_path
            else:
                print(f"  ⚠️  Deobfuscation failed, continuing with original")

        # ─────────────────────────────────────────────────────────────────────
        # PHASE 3: FORMATTING
        # ─────────────────────────────────────────────────────────────────────
        print("\n  📝 Phase 3: Formatting")

        format_dir = file_output / '3-formatted'
        format_dir.mkdir(exist_ok=True)

        # Get files to format
        if current_file.is_dir():
            files_to_format = list(current_file.rglob('*.js'))
        else:
            files_to_format = [current_file]

        formatted_count = 0
        for f in files_to_format:
            format_result = self.tool_manager.run_prettier(f, format_dir / f.name)
            if format_result.success:
                formatted_count += 1

        result.formatting[str(js_file)] = {
            'files_formatted': formatted_count,
            'total_files': len(files_to_format)
        }

        print(f"  ✅ Formatted {formatted_count}/{len(files_to_format)} files")

        if formatted_count > 0:
            current_file = format_dir

        # ─────────────────────────────────────────────────────────────────────
        # PHASE 4: NAMING
        # ─────────────────────────────────────────────────────────────────────
        if not self.config.skip_naming:
            print("\n  🏷️  Phase 4: Variable Naming")

            naming_dir = file_output / '4-named'
            naming_dir.mkdir(exist_ok=True)

            # Get files to analyze
            if current_file.is_dir():
                files_to_name = list(current_file.rglob('*.js'))
            else:
                files_to_name = [current_file]

            total_vars_renamed = 0
            total_funcs_renamed = 0

            for f in files_to_name:
                naming_result = self.namer.analyze_file(f)

                if naming_result.variables_renamed > 0 or naming_result.functions_renamed > 0:
                    # Save renamed code
                    output_path = naming_dir / f.name
                    with open(output_path, 'w', encoding='utf-8') as out:
                        out.write(naming_result.renamed_code)

                    total_vars_renamed += naming_result.variables_renamed
                    total_funcs_renamed += naming_result.functions_renamed
                else:
                    # Copy unchanged
                    shutil.copy(f, naming_dir / f.name)

            result.naming[str(js_file)] = {
                'variables_renamed': total_vars_renamed,
                'functions_renamed': total_funcs_renamed
            }

            print(f"  ✅ Renamed {total_vars_renamed} variables, {total_funcs_renamed} functions")

            if total_vars_renamed > 0 or total_funcs_renamed > 0:
                current_file = naming_dir

        # ─────────────────────────────────────────────────────────────────────
        # PHASE 5: DOCUMENTATION
        # ─────────────────────────────────────────────────────────────────────
        if not self.config.skip_documentation:
            print("\n  📚 Phase 5: Documentation")

            docs_dir = file_output / '5-documented'
            docs_dir.mkdir(exist_ok=True)

            # Get files to document
            if current_file.is_dir():
                files_to_doc = list(current_file.rglob('*.js'))
            else:
                files_to_doc = [current_file]

            total_funcs_documented = 0

            for f in files_to_doc:
                doc_result = self.documenter.document_file(f)

                # Save documented code
                output_path = docs_dir / f.name
                with open(output_path, 'w', encoding='utf-8') as out:
                    out.write(doc_result.documented_code)

                total_funcs_documented += doc_result.functions_documented

            result.documentation[str(js_file)] = {
                'functions_documented': total_funcs_documented
            }

            print(f"  ✅ Added JSDoc to {total_funcs_documented} functions")
            current_file = docs_dir

        # ─────────────────────────────────────────────────────────────────────
        # PHASE 6: VALIDATION
        # ─────────────────────────────────────────────────────────────────────
        if not self.config.skip_validation:
            print("\n  ✓ Phase 6: Validation")

            # Get final files
            if current_file.is_dir():
                files_to_validate = list(current_file.rglob('*.js'))
            else:
                files_to_validate = [current_file]

            valid_count = 0
            invalid_count = 0

            for f in files_to_validate:
                val_result = self.validator.validate_file(f)
                if val_result.is_valid:
                    valid_count += 1
                else:
                    invalid_count += 1
                    if self.config.fail_on_invalid:
                        result.errors.append(f"Invalid file: {f.name}")

            result.validation[str(js_file)] = {
                'valid_files': valid_count,
                'invalid_files': invalid_count
            }

            if invalid_count == 0:
                print(f"  ✅ All {valid_count} files valid")
            else:
                print(f"  ⚠️  {invalid_count}/{valid_count + invalid_count} files have issues")

        # ─────────────────────────────────────────────────────────────────────
        # FINAL OUTPUT
        # ─────────────────────────────────────────────────────────────────────
        # Copy final files to root of output
        final_dir = file_output / 'final'
        final_dir.mkdir(exist_ok=True)

        if current_file.is_dir():
            for f in current_file.rglob('*.js'):
                shutil.copy(f, final_dir / f.name)
        else:
            shutil.copy(current_file, final_dir / current_file.name)

        print(f"\n  📁 Output: {final_dir}")

    def _print_summary(self, result: V8Result):
        """Print final summary"""
        print("\n" + "=" * 70)
        print("  V8 ENHANCEMENT COMPLETE")
        print("=" * 70)

        print(f"\n  Input:    {result.input_files} file(s)")
        print(f"  Output:   {result.final_files} file(s)")
        print(f"  Duration: {result.duration_seconds}s")

        # Aggregate stats
        total_deob = sum(1 for v in result.deobfuscation.values() if v.get('success'))
        total_vars = sum(v.get('variables_renamed', 0) for v in result.naming.values())
        total_funcs = sum(v.get('functions_renamed', 0) for v in result.naming.values())
        total_docs = sum(v.get('functions_documented', 0) for v in result.documentation.values())
        total_valid = sum(v.get('valid_files', 0) for v in result.validation.values())
        total_invalid = sum(v.get('invalid_files', 0) for v in result.validation.values())

        print(f"\n  Deobfuscated:  {total_deob} file(s)")
        print(f"  Vars renamed:  {total_vars}")
        print(f"  Funcs renamed: {total_funcs}")
        print(f"  Funcs documented: {total_docs}")
        print(f"  Validation:    {total_valid} valid, {total_invalid} invalid")

        if result.errors:
            print(f"\n  ⚠️  Errors: {len(result.errors)}")
            for err in result.errors[:5]:
                print(f"    • {err}")

        print(f"\n  📁 Output directory: {result.output_dir}")
        print(f"  📄 Report: {result.output_dir}/v8-report.json")

        if result.success:
            print("\n  ✅ Pipeline completed successfully!")
        else:
            print("\n  ⚠️  Pipeline completed with errors")


# Backwards compatibility with old EnhancementConfig
EnhancementConfig = V8Config
EnhancementResult = V8Result
CodeEnhancementPipeline = V8Pipeline
