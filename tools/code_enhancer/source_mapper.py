"""
Source Map Discovery and Extraction
Finds and extracts original source code from .js.map files
"""

import json
import subprocess
import shutil
from pathlib import Path
from typing import List, Optional
from dataclasses import dataclass


@dataclass
class SourceMapResult:
    """Result from source map extraction"""
    map_file: Path
    extracted_dir: Path
    source_files: List[Path]
    success: bool
    error: Optional[str] = None


class SourceMapRecovery:
    """
    Discovers and extracts source maps
    Uses reverse-sourcemap if available, falls back to manual extraction
    """

    def __init__(self):
        self.has_reverse_sourcemap = self._check_tool('reverse-sourcemap')
        if not self.has_reverse_sourcemap:
            print("  ℹ️  reverse-sourcemap not found, will use fallback extraction")

    def _check_tool(self, tool_name: str) -> bool:
        """Check if a CLI tool is available"""
        return shutil.which(tool_name) is not None

    def discover_and_download(self, js_files: List[Path]) -> List[SourceMapResult]:
        """
        Discover source maps for JS files
        Looks for existing .js.map files
        """
        results = []

        for js_file in js_files:
            map_file = js_file.parent / f"{js_file.name}.map"

            if map_file.exists():
                print(f"  ✅ Found: {map_file.name}")

                # Extract the source map
                result = self.extract_source_map(map_file)
                if result:
                    results.append(result)
            else:
                # Check if the JS file references a source map
                map_ref = self._check_sourcemap_reference(js_file)
                if map_ref:
                    print(f"  ℹ️  {js_file.name} references: {map_ref}")

        return results

    def _check_sourcemap_reference(self, js_file: Path) -> Optional[str]:
        """Check if JS file has //# sourceMappingURL comment"""
        try:
            with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
                # Read last 5 lines
                lines = f.readlines()[-5:]
                for line in lines:
                    if 'sourceMappingURL=' in line:
                        # Extract the URL
                        parts = line.split('sourceMappingURL=')
                        if len(parts) > 1:
                            return parts[1].strip()
        except Exception:
            pass

        return None

    def extract_source_map(self, map_file: Path) -> Optional[SourceMapResult]:
        """
        Extract original source from a .map file
        """
        output_dir = map_file.parent / 'src' / map_file.stem.replace('.js', '')
        output_dir.mkdir(parents=True, exist_ok=True)

        if self.has_reverse_sourcemap:
            return self._extract_with_tool(map_file, output_dir)
        else:
            return self._extract_manual(map_file, output_dir)

    def _extract_with_tool(self, map_file: Path, output_dir: Path) -> Optional[SourceMapResult]:
        """Extract using reverse-sourcemap CLI tool"""
        try:
            subprocess.run([
                'reverse-sourcemap',
                '--output-dir', str(output_dir),
                str(map_file)
            ], check=True, capture_output=True, text=True)

            source_files = list(output_dir.rglob('*.js'))

            return SourceMapResult(
                map_file=map_file,
                extracted_dir=output_dir,
                source_files=source_files,
                success=True
            )

        except subprocess.CalledProcessError as e:
            return SourceMapResult(
                map_file=map_file,
                extracted_dir=output_dir,
                source_files=[],
                success=False,
                error=f"Tool failed: {e.stderr}"
            )
        except Exception as e:
            return SourceMapResult(
                map_file=map_file,
                extracted_dir=output_dir,
                source_files=[],
                success=False,
                error=str(e)
            )

    def _extract_manual(self, map_file: Path, output_dir: Path) -> Optional[SourceMapResult]:
        """Manual extraction by parsing source map JSON"""
        try:
            with open(map_file, 'r', encoding='utf-8') as f:
                sourcemap = json.load(f)

            sources = sourcemap.get('sources', [])
            sources_content = sourcemap.get('sourcesContent', [])

            if not sources or not sources_content:
                return SourceMapResult(
                    map_file=map_file,
                    extracted_dir=output_dir,
                    source_files=[],
                    success=False,
                    error="No sources or sourcesContent in map"
                )

            extracted_files = []

            # Write each source file
            for source_path, content in zip(sources, sources_content):
                if not content:
                    continue

                # Clean the source path
                clean_path = source_path.replace('../', '').replace('./', '')
                file_path = output_dir / clean_path

                # Create parent directories
                file_path.parent.mkdir(parents=True, exist_ok=True)

                # Write content
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)

                extracted_files.append(file_path)

            return SourceMapResult(
                map_file=map_file,
                extracted_dir=output_dir,
                source_files=extracted_files,
                success=True
            )

        except Exception as e:
            return SourceMapResult(
                map_file=map_file,
                extracted_dir=output_dir,
                source_files=[],
                success=False,
                error=str(e)
            )
