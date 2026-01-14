"""
Code Formatting with Prettier
Makes minified code structurally readable
"""

import subprocess
import shutil
from pathlib import Path
from typing import List, Optional
from dataclasses import dataclass


@dataclass
class FormatResult:
    """Result from formatting a file"""
    original_file: Path
    formatted_file: Path
    success: bool
    error: Optional[str] = None


class PrettierFormatter:
    """
    Formats JavaScript files using Prettier
    Falls back to js-beautify if Prettier not available
    """

    def __init__(self, prettier_cmd: str = 'npx prettier'):
        self.prettier_cmd = prettier_cmd
        self.has_prettier = self._check_prettier()
        self.has_jsbeautify = self._check_jsbeautify()

        if not self.has_prettier and not self.has_jsbeautify:
            print("  ⚠️  No formatter found. Install: npm install -g prettier")

    def _check_prettier(self) -> bool:
        """Check if Prettier is available"""
        try:
            result = subprocess.run(
                ['npx', 'prettier', '--version'],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except Exception:
            return False

    def _check_jsbeautify(self) -> bool:
        """Check if js-beautify is available"""
        return shutil.which('js-beautify') is not None

    def format_directory(self, directory: Path) -> List[FormatResult]:
        """
        Format all JavaScript files in a directory
        """
        js_files = []

        # Find all JS files (excluding already formatted ones)
        for pattern in ['*.js', '**/*.js']:
            for file in directory.glob(pattern):
                if '.formatted.' not in file.name and '.map' not in file.name:
                    js_files.append(file)

        results = []

        if not js_files:
            return results

        if self.has_prettier:
            results = self._format_with_prettier(js_files)
        elif self.has_jsbeautify:
            results = self._format_with_jsbeautify(js_files)
        else:
            print("  ⚠️  No formatter available, skipping formatting")

        return results

    def format_file(self, file_path: Path) -> Optional[FormatResult]:
        """Format a single file"""
        if self.has_prettier:
            return self._format_file_prettier(file_path)
        elif self.has_jsbeautify:
            return self._format_file_jsbeautify(file_path)
        else:
            return FormatResult(
                original_file=file_path,
                formatted_file=file_path,
                success=False,
                error="No formatter available"
            )

    def _format_with_prettier(self, files: List[Path]) -> List[FormatResult]:
        """Format files using Prettier"""
        results = []

        for file in files:
            result = self._format_file_prettier(file)
            if result:
                results.append(result)

        return results

    def _format_file_prettier(self, file_path: Path) -> Optional[FormatResult]:
        """Format single file with Prettier"""
        output_file = file_path.parent / f"{file_path.stem}.formatted.js"

        try:
            # Read original content
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                original_content = f.read()

            # Format with Prettier
            result = subprocess.run(
                ['npx', 'prettier', '--parser', 'babel', '--print-width', '100', '--stdin-filepath', str(file_path)],
                input=original_content,
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                # Write formatted content
                with open(output_file, 'w', encoding='utf-8') as f:
                    f.write(result.stdout)

                return FormatResult(
                    original_file=file_path,
                    formatted_file=output_file,
                    success=True
                )
            else:
                return FormatResult(
                    original_file=file_path,
                    formatted_file=file_path,
                    success=False,
                    error=result.stderr
                )

        except subprocess.TimeoutExpired:
            return FormatResult(
                original_file=file_path,
                formatted_file=file_path,
                success=False,
                error="Timeout"
            )
        except Exception as e:
            return FormatResult(
                original_file=file_path,
                formatted_file=file_path,
                success=False,
                error=str(e)
            )

    def _format_with_jsbeautify(self, files: List[Path]) -> List[FormatResult]:
        """Format files using js-beautify (fallback)"""
        results = []

        for file in files:
            result = self._format_file_jsbeautify(file)
            if result:
                results.append(result)

        return results

    def _format_file_jsbeautify(self, file_path: Path) -> Optional[FormatResult]:
        """Format single file with js-beautify"""
        output_file = file_path.parent / f"{file_path.stem}.formatted.js"

        try:
            result = subprocess.run(
                ['js-beautify', '-o', str(output_file), str(file_path)],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                return FormatResult(
                    original_file=file_path,
                    formatted_file=output_file,
                    success=True
                )
            else:
                return FormatResult(
                    original_file=file_path,
                    formatted_file=file_path,
                    success=False,
                    error=result.stderr
                )

        except Exception as e:
            return FormatResult(
                original_file=file_path,
                formatted_file=file_path,
                success=False,
                error=str(e)
            )
