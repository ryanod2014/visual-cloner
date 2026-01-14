"""
JavaScript Function Extraction
Extracts function definitions from JavaScript code using regex patterns
"""

import re
import hashlib
from pathlib import Path
from typing import List, Dict, Optional
from dataclasses import dataclass


@dataclass
class ExtractedFunction:
    """A function extracted from JavaScript code"""
    name: str
    code: str
    file_path: Path
    file_hash: str
    line_number: int
    start_pos: int
    end_pos: int
    params: List[str]


class ASTAnalyzer:
    """
    Extracts functions from JavaScript code
    Uses regex patterns for MVP (fast, no dependencies)
    """

    # Patterns for different function types
    PATTERNS = {
        # const name = (...) => {...}
        'arrow': r'const\s+(\w+)\s*=\s*(\([^)]*\))\s*=>\s*\{',

        # function name(...) {...}
        'function': r'function\s+(\w+)\s*(\([^)]*\))\s*\{',

        # name: function(...) {...}
        'method': r'(\w+)\s*:\s*function\s*(\([^)]*\))\s*\{',

        # async function name(...) {...}
        'async_function': r'async\s+function\s+(\w+)\s*(\([^)]*\))\s*\{',

        # const name = async (...) => {...}
        'async_arrow': r'const\s+(\w+)\s*=\s*async\s*(\([^)]*\))\s*=>\s*\{',
    }

    def __init__(self):
        self.compiled_patterns = {
            name: re.compile(pattern, re.MULTILINE)
            for name, pattern in self.PATTERNS.items()
        }

    def extract_functions(self, file_path: Path) -> List[ExtractedFunction]:
        """
        Extract all functions from a JavaScript file
        """
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                code = f.read()
        except Exception as e:
            print(f"  ⚠️  Failed to read {file_path}: {e}")
            return []

        # Calculate file hash for caching
        file_hash = hashlib.sha256(code.encode()).hexdigest()[:16]

        functions = []

        # Extract with each pattern
        for pattern_name, pattern in self.compiled_patterns.items():
            for match in pattern.finditer(code):
                func_name = match.group(1)
                params_str = match.group(2)
                start_pos = match.start()

                # Find the matching closing brace
                func_code, end_pos = self._extract_function_body(code, start_pos)

                if not func_code:
                    continue

                # Parse parameters
                params = self._parse_params(params_str)

                # Calculate line number
                line_number = code[:start_pos].count('\n') + 1

                functions.append(ExtractedFunction(
                    name=func_name,
                    code=func_code,
                    file_path=file_path,
                    file_hash=file_hash,
                    line_number=line_number,
                    start_pos=start_pos,
                    end_pos=end_pos,
                    params=params
                ))

        return functions

    def _extract_function_body(self, code: str, start_pos: int) -> tuple[str, int]:
        """
        Extract complete function body by matching braces
        Returns (function_code, end_position)
        """
        # Find the opening brace
        open_brace_pos = code.find('{', start_pos)
        if open_brace_pos == -1:
            return '', start_pos

        # Match braces
        brace_count = 0
        in_string = False
        in_regex = False
        escape_next = False
        string_char = None

        for i in range(open_brace_pos, len(code)):
            char = code[i]

            # Handle escape sequences
            if escape_next:
                escape_next = False
                continue

            if char == '\\':
                escape_next = True
                continue

            # Handle strings
            if char in ('"', "'", '`'):
                if not in_string:
                    in_string = True
                    string_char = char
                elif char == string_char:
                    in_string = False
                    string_char = None
                continue

            # Skip if in string
            if in_string:
                continue

            # Handle regex (simplified - not perfect but good enough)
            if char == '/' and i > 0:
                prev_char = code[i-1]
                if prev_char in ('=', '(', ',', ':', ';', '!', '&', '|', '?', '+', '-', '*', '%', '/', '[', '{'):
                    in_regex = True
                    continue

            if in_regex and char == '/':
                in_regex = False
                continue

            if in_regex:
                continue

            # Count braces
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1

                if brace_count == 0:
                    # Found matching closing brace
                    return code[start_pos:i+1], i+1

        # No matching brace found
        return '', start_pos

    def _parse_params(self, params_str: str) -> List[str]:
        """Parse function parameters from string like '(a, b, c)'"""
        # Remove parentheses
        params_str = params_str.strip('()')

        if not params_str:
            return []

        # Split by comma
        params = [p.strip() for p in params_str.split(',')]

        # Clean up (remove destructuring, defaults, etc.)
        clean_params = []
        for param in params:
            # Take first word (before =, :, or [)
            match = re.match(r'(\w+)', param)
            if match:
                clean_params.append(match.group(1))

        return clean_params

    def count_function_calls(self, code: str, function_name: str) -> int:
        """
        Count how many times a function is called in code
        Simple heuristic: function_name(
        """
        pattern = rf'\b{re.escape(function_name)}\s*\('
        return len(re.findall(pattern, code))

    def analyze_call_graph(self, functions: List[ExtractedFunction]) -> Dict[str, int]:
        """
        Build a simple call graph
        Returns dict of {function_name: call_count}
        """
        # Combine all code
        all_code = '\n'.join(f.code for f in functions)

        call_counts = {}

        for func in functions:
            count = self.count_function_calls(all_code, func.name)
            call_counts[func.name] = count

        return call_counts
