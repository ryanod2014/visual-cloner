"""
Deobfuscation Pipeline
Runs appropriate deobfuscation tools based on detection results
"""

from pathlib import Path
from typing import List, Optional
from dataclasses import dataclass

from .tool_manager import ToolManager, ToolResult
from .detector import CodeDetector, DetectionResult


@dataclass
class DeobfuscationResult:
    """Results from deobfuscation pipeline"""
    input_path: Path
    output_path: Optional[Path]
    success: bool
    tools_tried: List[str]
    tool_succeeded: Optional[str]
    error: Optional[str] = None

    # Before/after metrics
    original_size: int = 0
    deobfuscated_size: int = 0
    improvement_score: float = 0.0


class Deobfuscator:
    """
    Runs deobfuscation tools in optimal order based on detection.
    Falls back through tools until one succeeds.
    """

    def __init__(self, tool_manager: ToolManager):
        self.tools = tool_manager
        self.detector = CodeDetector()

    def deobfuscate(
        self,
        input_path: Path,
        output_dir: Path,
        detection: Optional[DetectionResult] = None
    ) -> DeobfuscationResult:
        """
        Deobfuscate a file using appropriate tools.

        Args:
            input_path: Path to obfuscated JS file
            output_dir: Directory for output
            detection: Optional pre-computed detection results

        Returns:
            DeobfuscationResult with output path and metrics
        """
        # Get detection results if not provided
        if detection is None:
            detection = self.detector.analyze_file(input_path)

        # Get original file size
        original_size = input_path.stat().st_size

        # If source map exists, that's our best option
        if detection.has_source_map and detection.source_map_path:
            result = self._try_source_map(detection.source_map_path, output_dir)
            if result.success:
                return DeobfuscationResult(
                    input_path=input_path,
                    output_path=result.output_path,
                    success=True,
                    tools_tried=['reverse-sourcemap'],
                    tool_succeeded='reverse-sourcemap',
                    original_size=original_size,
                    deobfuscated_size=self._get_dir_size(result.output_path),
                    improvement_score=1.0  # Perfect recovery
                )

        # Try recommended tools in order
        tools_to_try = detection.recommended_tools.copy()

        # Remove 'prettier' - we'll do that separately after deobfuscation
        tools_to_try = [t for t in tools_to_try if t != 'prettier']

        # If no tools recommended and code is obfuscated, try generic ones
        if not tools_to_try and detection.obfuscation_level != 'none':
            tools_to_try = ['webcrack', 'restringer']

        # Always try string-decoder FIRST for javascript-obfuscator patterns
        # This handles string array rotation that crashes webcrack
        # Then string-simplifier to join 'a' + 'b' concatenations
        if 'javascript-obfuscator' in detection.obfuscators or detection.obfuscation_level in ['moderate', 'heavy']:
            tools_to_try = ['string-decoder', 'string-simplifier'] + [t for t in tools_to_try if t not in ['string-decoder', 'string-simplifier']]

        tools_tried = []
        output_dir.mkdir(parents=True, exist_ok=True)

        # Track current input - may change as we chain tools
        current_input = input_path
        successful_tools = []

        for tool in tools_to_try:
            tools_tried.append(tool)
            result = self._run_tool(tool, current_input, output_dir)

            if result.success:
                successful_tools.append(tool)

                # If string-decoder or string-simplifier succeeded, continue with other tools on output
                if tool in ['string-decoder', 'string-simplifier'] and result.output_path:
                    print(f"     {tool} succeeded, continuing with other tools...")
                    current_input = result.output_path
                    continue  # Try next tool on output

                # Other tools succeed = we're done
                deob_size = self._get_output_size(result.output_path)
                improvement = self._calculate_improvement(input_path, result.output_path)

                return DeobfuscationResult(
                    input_path=input_path,
                    output_path=result.output_path,
                    success=True,
                    tools_tried=tools_tried,
                    tool_succeeded=' + '.join(successful_tools),
                    original_size=original_size,
                    deobfuscated_size=deob_size,
                    improvement_score=improvement
                )

        # If only string-decoder succeeded (and no other tools worked), still return success
        if successful_tools and current_input != input_path:
            deob_size = self._get_output_size(current_input)
            improvement = self._calculate_improvement(input_path, current_input)

            return DeobfuscationResult(
                input_path=input_path,
                output_path=current_input,
                success=True,
                tools_tried=tools_tried,
                tool_succeeded=' + '.join(successful_tools),
                original_size=original_size,
                deobfuscated_size=deob_size,
                improvement_score=improvement
            )

        # No tools succeeded
        return DeobfuscationResult(
            input_path=input_path,
            output_path=None,
            success=False,
            tools_tried=tools_tried,
            tool_succeeded=None,
            error='All deobfuscation tools failed',
            original_size=original_size
        )

    def _try_source_map(self, map_path: str, output_dir: Path) -> ToolResult:
        """Try to extract source from source map"""
        map_file = Path(map_path)
        if not map_file.exists():
            return ToolResult(
                tool='reverse-sourcemap',
                success=False,
                error='Source map file not found'
            )

        source_dir = output_dir / 'source'
        return self.tools.run_reverse_sourcemap(map_file, source_dir)

    def _run_tool(self, tool: str, input_path: Path, output_dir: Path) -> ToolResult:
        """Run a specific deobfuscation tool"""
        if tool == 'string-decoder':
            # Custom string array decoder for javascript-obfuscator
            output_path = output_dir / f"{input_path.stem}.decoded.js"
            return self.tools.run_string_decoder(input_path, output_path)

        elif tool == 'string-simplifier':
            # Simplify string concatenations: 'a' + 'b' -> 'ab'
            output_path = output_dir / f"{input_path.stem}.simplified.js"
            return self.tools.run_string_simplifier(input_path, output_path)

        elif tool == 'webcrack':
            # webcrack outputs to directory
            webcrack_dir = output_dir / 'webcrack'
            return self.tools.run_webcrack(input_path, webcrack_dir)

        elif tool == 'synchrony':
            output_path = output_dir / f"{input_path.stem}.synchrony.js"
            return self.tools.run_synchrony(input_path, output_path)

        elif tool == 'restringer':
            output_path = output_dir / f"{input_path.stem}.restringer.js"
            return self.tools.run_restringer(input_path, output_path)

        elif tool == 'reverse-sourcemap':
            # This should be handled by _try_source_map
            return ToolResult(tool=tool, success=False, error='Use _try_source_map instead')

        else:
            return ToolResult(tool=tool, success=False, error=f'Unknown tool: {tool}')

    def _get_output_size(self, output_path: Optional[Path]) -> int:
        """Get size of output file/directory"""
        if output_path is None:
            return 0

        if output_path.is_file():
            return output_path.stat().st_size
        elif output_path.is_dir():
            return self._get_dir_size(output_path)
        return 0

    def _get_dir_size(self, dir_path: Path) -> int:
        """Get total size of all files in directory"""
        if not dir_path or not dir_path.exists():
            return 0

        total = 0
        for f in dir_path.rglob('*'):
            if f.is_file():
                total += f.stat().st_size
        return total

    def _calculate_improvement(self, input_path: Path, output_path: Optional[Path]) -> float:
        """
        Calculate improvement score based on readability metrics.
        Score 0-1 where 1 is maximum improvement.
        """
        if output_path is None:
            return 0.0

        try:
            # Read original
            with open(input_path, 'r', encoding='utf-8', errors='ignore') as f:
                original = f.read()

            # Read output (handle directory case)
            if output_path.is_dir():
                output = ""
                for js_file in output_path.rglob('*.js'):
                    with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
                        output += f.read() + "\n"
            else:
                with open(output_path, 'r', encoding='utf-8', errors='ignore') as f:
                    output = f.read()

            if not output:
                return 0.0

            # Calculate metrics
            original_analysis = self.detector.analyze_code(original)
            output_analysis = self.detector.analyze_code(output)

            # Improvement factors:
            # 1. Reduction in single-char variables
            var_improvement = 0.0
            if original_analysis.single_char_vars > 0:
                var_improvement = 1 - (output_analysis.single_char_vars / original_analysis.single_char_vars)
                var_improvement = max(0, var_improvement)

            # 2. Reduction in average line length (more readable = shorter lines)
            line_improvement = 0.0
            if original_analysis.avg_line_length > 100:
                target = 80  # Ideal line length
                original_dist = abs(original_analysis.avg_line_length - target)
                output_dist = abs(output_analysis.avg_line_length - target)
                if original_dist > 0:
                    line_improvement = 1 - (output_dist / original_dist)
                    line_improvement = max(0, min(1, line_improvement))

            # 3. Obfuscation level reduction
            level_map = {'none': 0, 'light': 1, 'moderate': 2, 'heavy': 3}
            orig_level = level_map.get(original_analysis.obfuscation_level, 0)
            out_level = level_map.get(output_analysis.obfuscation_level, 0)
            level_improvement = (orig_level - out_level) / max(orig_level, 1) if orig_level > 0 else 0

            # Weighted average
            score = (var_improvement * 0.4) + (line_improvement * 0.3) + (level_improvement * 0.3)
            return round(max(0, min(1, score)), 2)

        except Exception:
            return 0.0

    def deobfuscate_directory(
        self,
        input_dir: Path,
        output_dir: Path
    ) -> List[DeobfuscationResult]:
        """Deobfuscate all JS files in a directory"""
        results = []

        js_files = list(input_dir.glob('*.js'))
        for js_file in js_files:
            # Skip already processed files
            if '.deob.' in js_file.name or '.formatted.' in js_file.name:
                continue

            file_output_dir = output_dir / js_file.stem
            result = self.deobfuscate(js_file, file_output_dir)
            results.append(result)

        return results
