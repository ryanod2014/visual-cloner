"""
Code Validation
Validates that transformed code is still valid JavaScript
"""

import subprocess
import json
from pathlib import Path
from typing import Optional, List
from dataclasses import dataclass


@dataclass
class ValidationResult:
    """Results from code validation"""
    file_path: Path
    is_valid: bool
    syntax_errors: List[str]
    warnings: List[str]

    # Metrics
    line_count: int = 0
    function_count: int = 0
    parse_time_ms: float = 0.0


class CodeValidator:
    """
    Validates JavaScript code for syntax correctness.
    Uses Node.js to parse and validate.
    """

    def __init__(self):
        self.has_node = self._check_node()

    def _check_node(self) -> bool:
        """Check if Node.js is available"""
        try:
            result = subprocess.run(
                ['node', '--version'],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except Exception:
            return False

    def validate_file(self, file_path: Path) -> ValidationResult:
        """Validate a JavaScript file"""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                code = f.read()
        except Exception as e:
            return ValidationResult(
                file_path=file_path,
                is_valid=False,
                syntax_errors=[f"Could not read file: {e}"],
                warnings=[]
            )

        return self.validate_code(code, file_path)

    def validate_code(self, code: str, file_path: Path = None) -> ValidationResult:
        """Validate JavaScript code"""
        errors = []
        warnings = []
        is_valid = True

        # Count lines and basic metrics
        lines = code.split('\n')
        line_count = len(lines)

        # Count functions (rough estimate)
        import re
        function_count = len(re.findall(r'\bfunction\b|\=\>\s*\{', code))

        # Try to parse with Node.js
        if self.has_node:
            parse_result = self._parse_with_node(code)
            if parse_result['error']:
                is_valid = False
                errors.append(parse_result['error'])
            warnings.extend(parse_result.get('warnings', []))
        else:
            # Fallback: basic syntax checks
            basic_result = self._basic_validation(code)
            is_valid = basic_result['valid']
            errors.extend(basic_result.get('errors', []))
            warnings.extend(basic_result.get('warnings', []))

        return ValidationResult(
            file_path=file_path or Path('unknown'),
            is_valid=is_valid,
            syntax_errors=errors,
            warnings=warnings,
            line_count=line_count,
            function_count=function_count
        )

    def _parse_with_node(self, code: str) -> dict:
        """Parse code using Node.js"""
        # Create a Node.js script to parse the code
        parse_script = '''
        const code = process.argv[1];
        try {
            new Function(code);
            console.log(JSON.stringify({ valid: true }));
        } catch (e) {
            console.log(JSON.stringify({
                valid: false,
                error: e.message,
                line: e.lineNumber || null
            }));
        }
        '''

        try:
            # Use Node to evaluate syntax
            result = subprocess.run(
                ['node', '-e', f'''
                    const code = {json.dumps(code)};
                    try {{
                        new Function(code);
                        console.log(JSON.stringify({{ valid: true }}));
                    }} catch (e) {{
                        console.log(JSON.stringify({{
                            valid: false,
                            error: e.message
                        }}));
                    }}
                '''],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0 and result.stdout.strip():
                try:
                    parsed = json.loads(result.stdout.strip())
                    if parsed.get('valid'):
                        return {'error': None, 'warnings': []}
                    else:
                        return {'error': parsed.get('error', 'Unknown parse error'), 'warnings': []}
                except json.JSONDecodeError:
                    pass

            # If Node itself failed, check stderr
            if result.stderr:
                return {'error': result.stderr[:200], 'warnings': []}

            return {'error': None, 'warnings': []}

        except subprocess.TimeoutExpired:
            return {'error': 'Parse timeout', 'warnings': []}
        except Exception as e:
            return {'error': str(e), 'warnings': []}

    def _basic_validation(self, code: str) -> dict:
        """Basic syntax validation without Node.js"""
        errors = []
        warnings = []

        # Check brace balance
        brace_count = 0
        paren_count = 0
        bracket_count = 0
        in_string = False
        string_char = None

        for i, char in enumerate(code):
            # Track strings
            if char in ('"', "'", '`') and (i == 0 or code[i-1] != '\\'):
                if not in_string:
                    in_string = True
                    string_char = char
                elif char == string_char:
                    in_string = False
                continue

            if in_string:
                continue

            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
            elif char == '(':
                paren_count += 1
            elif char == ')':
                paren_count -= 1
            elif char == '[':
                bracket_count += 1
            elif char == ']':
                bracket_count -= 1

            # Check for negative counts (closing without opening)
            if brace_count < 0:
                errors.append(f"Unexpected '}}' at position {i}")
                break
            if paren_count < 0:
                errors.append(f"Unexpected ')' at position {i}")
                break
            if bracket_count < 0:
                errors.append(f"Unexpected ']' at position {i}")
                break

        # Check final balance
        if brace_count > 0:
            errors.append(f"Unclosed braces: {brace_count} opening '{{' without closing '}}'")
        if paren_count > 0:
            errors.append(f"Unclosed parentheses: {paren_count} opening '(' without closing ')'")
        if bracket_count > 0:
            errors.append(f"Unclosed brackets: {bracket_count} opening '[' without closing ']'")
        if in_string:
            errors.append(f"Unclosed string starting with {string_char}")

        # Check for common issues
        import re

        # Missing semicolons (warning only)
        # Look for patterns like "} const" or "} let" which suggest missing semicolons
        if re.search(r'\}\s*(const|let|var|function)\s', code):
            warnings.append("Possible missing semicolons detected")

        return {
            'valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings
        }

    def compare_files(self, original: Path, modified: Path) -> dict:
        """Compare original and modified files"""
        orig_result = self.validate_file(original)
        mod_result = self.validate_file(modified)

        return {
            'original_valid': orig_result.is_valid,
            'modified_valid': mod_result.is_valid,
            'both_valid': orig_result.is_valid and mod_result.is_valid,
            'introduced_errors': not mod_result.is_valid and orig_result.is_valid,
            'original_errors': orig_result.syntax_errors,
            'modified_errors': mod_result.syntax_errors,
            'line_count_change': mod_result.line_count - orig_result.line_count,
            'function_count_change': mod_result.function_count - orig_result.function_count
        }

    def validate_directory(self, directory: Path) -> List[ValidationResult]:
        """Validate all JS files in a directory"""
        results = []

        for js_file in directory.rglob('*.js'):
            # Skip node_modules
            if 'node_modules' in str(js_file):
                continue

            result = self.validate_file(js_file)
            results.append(result)

        return results

    def print_result(self, result: ValidationResult):
        """Print validation result"""
        status = "✅ Valid" if result.is_valid else "❌ Invalid"
        print(f"\n  {result.file_path.name}: {status}")
        print(f"  Lines: {result.line_count}, Functions: {result.function_count}")

        if result.syntax_errors:
            print(f"  Errors:")
            for err in result.syntax_errors[:5]:
                print(f"    • {err[:80]}")
            if len(result.syntax_errors) > 5:
                print(f"    ... and {len(result.syntax_errors) - 5} more")

        if result.warnings:
            print(f"  Warnings:")
            for warn in result.warnings[:3]:
                print(f"    ⚠ {warn}")
