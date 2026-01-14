"""
Code Analysis and Obfuscator Detection
Detects obfuscation type, bundler, and code characteristics
"""

import re
from pathlib import Path
from typing import List, Dict, Set, Optional
from dataclasses import dataclass, field


@dataclass
class DetectionResult:
    """Results from code analysis"""
    # File info
    file_path: Path
    file_size: int
    line_count: int

    # Obfuscation detection
    obfuscators: List[str] = field(default_factory=list)
    obfuscation_level: str = "none"  # none, light, moderate, heavy

    # Bundler detection
    bundler: Optional[str] = None  # webpack, rollup, parcel, esbuild, none

    # Source map
    has_source_map: bool = False
    source_map_path: Optional[str] = None

    # Code characteristics
    is_minified: bool = False
    single_char_vars: int = 0
    total_vars: int = 0
    avg_line_length: float = 0.0

    # Recommended tools
    recommended_tools: List[str] = field(default_factory=list)


class CodeDetector:
    """
    Analyzes JavaScript code to detect:
    - Obfuscator type (obfuscator.io, javascript-obfuscator, etc.)
    - Bundler type (webpack, rollup, etc.)
    - Code characteristics (minification level, variable naming)
    """

    # Obfuscator signatures
    OBFUSCATOR_SIGNATURES = {
        'obfuscator.io': [
            r'_0x[a-f0-9]{4,6}\s*=\s*\[',          # Array of strings
            r'_0x[a-f0-9]{4,6}\s*\(\s*0x[a-f0-9]+', # Function calls with hex
            r'\\x[0-9a-fA-F]{2}',                   # Hex escape sequences
            r'atob\s*\(\s*["\'][A-Za-z0-9+/=]+',    # Base64 decoding
            r'_0x[a-f0-9]{4,6}\s*-\s*0x',          # Hex arithmetic
        ],
        'javascript-obfuscator': [
            r'_0x[a-f0-9]{4}\s*=\s*function',      # Function assignments
            r'parseInt\s*\(\s*_0x[a-f0-9]{4}',     # parseInt with hex vars
            r'\[\'\\x',                             # Array with hex strings
            r'_0x[a-f0-9]{4}\[\'push\'\]',         # Array method calls
            r'while\s*\(\s*!!\s*\[\s*\]\s*\)',     # Infinite loop pattern
        ],
        'jscrambler': [
            r'_\$_[a-f0-9]{4}',                    # JScrambler variable pattern
            r'B[0-9a-zA-Z]{4}\s*\(',               # Encoded function calls
        ],
        'uglifyjs': [
            r'!function\s*\(\s*[a-z]\s*,\s*[a-z]\s*\)',  # IIFE pattern
            r'return\s+[a-z]\s*\.\s*[a-z]\s*\(',        # Chained calls
        ],
        'terser': [
            r'const\s+[a-z]\s*=\s*\(\s*\)\s*=>',   # Arrow function
            r'\?\.',                                # Optional chaining (preserved)
            r'\?\?',                                # Nullish coalescing
        ],
    }

    # Bundler signatures
    BUNDLER_SIGNATURES = {
        'webpack': [
            r'__webpack_require__',
            r'__webpack_modules__',
            r'webpackJsonp',
            r'/\*!\s*\*{3}\*/\s*\(function',       # Webpack comment
            r'__webpack_exports__',
            r'\/\*\*\*\/\s*\(function\(module',
        ],
        'rollup': [
            r"define\s*\(\s*\[\s*['\"]exports['\"]",
            r'Object\.defineProperty\s*\(\s*exports',
            r'var\s+\w+\s*=\s*\(function\s*\(\s*exports\s*\)',
        ],
        'parcel': [
            r'parcelRequire',
            r'__parcel__',
        ],
        'esbuild': [
            r'__toESM\s*\(',
            r'__toCommonJS\s*\(',
            r'__export\s*\(',
        ],
        'browserify': [
            r'require\s*\(\s*["\']_process["\']\s*\)',
            r'\(function\s*\(\)\s*\{\s*function\s+r\s*\(\s*e\s*,\s*n\s*,\s*t\s*\)',
        ],
    }

    def analyze_file(self, file_path: Path) -> DetectionResult:
        """Analyze a JavaScript file"""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                code = f.read()
        except Exception as e:
            return DetectionResult(
                file_path=file_path,
                file_size=0,
                line_count=0,
            )

        return self.analyze_code(code, file_path)

    def analyze_code(self, code: str, file_path: Path = None) -> DetectionResult:
        """Analyze JavaScript code"""
        lines = code.split('\n')
        line_count = len(lines)
        file_size = len(code.encode('utf-8'))

        # Detect obfuscators
        obfuscators = self._detect_obfuscators(code)

        # Detect bundler
        bundler = self._detect_bundler(code)

        # Check for source map
        has_source_map, source_map_path = self._check_source_map(code, file_path)

        # Analyze code characteristics
        is_minified = self._is_minified(code, lines)
        single_char_vars, total_vars = self._count_variables(code)
        avg_line_length = sum(len(line) for line in lines) / max(line_count, 1)

        # Determine obfuscation level
        obfuscation_level = self._determine_obfuscation_level(
            obfuscators, single_char_vars, total_vars, avg_line_length
        )

        # Get recommended tools
        recommended_tools = self._get_recommended_tools(
            obfuscators, bundler, has_source_map, obfuscation_level
        )

        return DetectionResult(
            file_path=file_path or Path('unknown'),
            file_size=file_size,
            line_count=line_count,
            obfuscators=obfuscators,
            obfuscation_level=obfuscation_level,
            bundler=bundler,
            has_source_map=has_source_map,
            source_map_path=source_map_path,
            is_minified=is_minified,
            single_char_vars=single_char_vars,
            total_vars=total_vars,
            avg_line_length=avg_line_length,
            recommended_tools=recommended_tools,
        )

    def _detect_obfuscators(self, code: str) -> List[str]:
        """Detect which obfuscators were used"""
        detected = []

        for name, patterns in self.OBFUSCATOR_SIGNATURES.items():
            matches = 0
            for pattern in patterns:
                if re.search(pattern, code):
                    matches += 1

            # Require at least 2 pattern matches for confident detection
            if matches >= 2:
                detected.append(name)

        return detected

    def _detect_bundler(self, code: str) -> Optional[str]:
        """Detect which bundler was used"""
        for name, patterns in self.BUNDLER_SIGNATURES.items():
            matches = 0
            for pattern in patterns:
                if re.search(pattern, code):
                    matches += 1

            # Require at least 1 match for bundler detection
            if matches >= 1:
                return name

        return None

    def _check_source_map(self, code: str, file_path: Path = None) -> tuple:
        """Check if source map exists"""
        # Check for inline source map
        if '//# sourceMappingURL=data:' in code:
            return True, 'inline'

        # Check for external source map reference
        match = re.search(r'//[#@]\s*sourceMappingURL\s*=\s*(\S+)', code)
        if match:
            map_ref = match.group(1)

            # If we have a file path, check if the map file exists
            if file_path:
                if map_ref.startswith('data:'):
                    return True, 'inline'

                # Try to find the map file
                map_path = file_path.parent / map_ref
                if map_path.exists():
                    return True, str(map_path)

                # Also check for .js.map
                map_path = file_path.with_suffix('.js.map')
                if map_path.exists():
                    return True, str(map_path)

            return True, map_ref

        # Check for .map file alongside
        if file_path:
            map_path = file_path.with_suffix('.js.map')
            if map_path.exists():
                return True, str(map_path)

            map_path = Path(str(file_path) + '.map')
            if map_path.exists():
                return True, str(map_path)

        return False, None

    def _is_minified(self, code: str, lines: List[str]) -> bool:
        """Check if code is minified"""
        if not lines:
            return False

        # Check average line length (minified code has very long lines)
        non_empty_lines = [l for l in lines if l.strip()]
        if not non_empty_lines:
            return False

        avg_len = sum(len(l) for l in non_empty_lines) / len(non_empty_lines)

        # Check for lack of whitespace
        whitespace_ratio = code.count(' ') / max(len(code), 1)

        # Minified: long lines, little whitespace
        return avg_len > 200 or whitespace_ratio < 0.05

    def _count_variables(self, code: str) -> tuple:
        """Count single-character and total variables"""
        # Find variable declarations
        var_patterns = [
            r'\b(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)',
            r'function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)',
            r'([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*function',
            r'([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*function',
        ]

        all_vars = set()
        for pattern in var_patterns:
            matches = re.findall(pattern, code)
            all_vars.update(matches)

        single_char = sum(1 for v in all_vars if len(v) == 1)
        return single_char, len(all_vars)

    def _determine_obfuscation_level(
        self,
        obfuscators: List[str],
        single_char_vars: int,
        total_vars: int,
        avg_line_length: float
    ) -> str:
        """Determine overall obfuscation level"""

        # Heavy obfuscation indicators
        if obfuscators and any(o in ['obfuscator.io', 'javascript-obfuscator', 'jscrambler'] for o in obfuscators):
            return 'heavy'

        # Calculate single-char variable ratio
        var_ratio = single_char_vars / max(total_vars, 1)

        if var_ratio > 0.7 and avg_line_length > 500:
            return 'heavy'
        elif var_ratio > 0.5 or avg_line_length > 300:
            return 'moderate'
        elif var_ratio > 0.3 or avg_line_length > 150:
            return 'light'
        else:
            return 'none'

    def _get_recommended_tools(
        self,
        obfuscators: List[str],
        bundler: Optional[str],
        has_source_map: bool,
        obfuscation_level: str
    ) -> List[str]:
        """Get recommended tools based on analysis"""
        tools = []

        # Source map recovery is always first priority
        if has_source_map:
            tools.append('reverse-sourcemap')
            return tools  # If source maps exist, that's all we need

        # Deobfuscation tools based on detected obfuscator
        if 'obfuscator.io' in obfuscators:
            tools.append('webcrack')
        elif 'javascript-obfuscator' in obfuscators:
            tools.append('synchrony')
            tools.append('webcrack')  # webcrack also handles some js-obfuscator

        # Webpack unpacking
        if bundler == 'webpack':
            if 'webcrack' not in tools:
                tools.append('webcrack')

        # General deobfuscation for unknown obfuscators
        if obfuscation_level in ['moderate', 'heavy'] and not tools:
            tools.append('restringer')
            tools.append('webcrack')

        # Always format at the end
        tools.append('prettier')

        return tools

    def analyze_directory(self, directory: Path) -> Dict[str, DetectionResult]:
        """Analyze all JS files in a directory"""
        results = {}

        js_files = list(directory.glob('**/*.js'))
        for js_file in js_files:
            # Skip node_modules and already processed files
            if 'node_modules' in str(js_file):
                continue
            if '.formatted.' in js_file.name or '.deob.' in js_file.name:
                continue

            results[str(js_file)] = self.analyze_file(js_file)

        return results

    def print_analysis(self, result: DetectionResult):
        """Print analysis results"""
        print(f"\n  File: {result.file_path.name}")
        print(f"  Size: {result.file_size:,} bytes, {result.line_count:,} lines")
        print(f"  Avg line length: {result.avg_line_length:.0f} chars")

        print(f"\n  Obfuscation: {result.obfuscation_level}")
        if result.obfuscators:
            print(f"  Detected obfuscators: {', '.join(result.obfuscators)}")

        if result.bundler:
            print(f"  Bundler: {result.bundler}")

        print(f"  Minified: {'Yes' if result.is_minified else 'No'}")
        print(f"  Variables: {result.single_char_vars}/{result.total_vars} single-char")

        if result.has_source_map:
            print(f"  Source map: ✅ {result.source_map_path}")
        else:
            print(f"  Source map: ❌ Not found")

        print(f"\n  Recommended tools: {' → '.join(result.recommended_tools)}")
