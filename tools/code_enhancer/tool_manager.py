"""
Tool Manager for V8 Code Enhancement Pipeline
Detects available tools and provides unified interface to run them
"""

import subprocess
import shutil
from pathlib import Path
from typing import Optional, Dict, List
from dataclasses import dataclass


@dataclass
class ToolResult:
    """Result from running a tool"""
    tool: str
    success: bool
    output_path: Optional[Path] = None
    stdout: str = ""
    stderr: str = ""
    error: Optional[str] = None


class ToolManager:
    """
    Manages external tools for code enhancement pipeline.
    Checks availability and provides unified interface.
    """

    # Tool definitions: name -> (check_command, install_hint)
    TOOLS = {
        'prettier': {
            'check': ['npx', 'prettier', '--version'],
            'install': 'npm install -g prettier',
            'type': 'formatter',
        },
        'string-decoder': {
            'check': ['node', '--version'],  # Just needs Node.js
            'install': 'Built-in tool (requires Node.js)',
            'type': 'deobfuscator',
        },
        'string-simplifier': {
            'check': ['node', '--version'],  # Just needs Node.js
            'install': 'Built-in tool (requires Node.js)',
            'type': 'deobfuscator',
        },
        'webcrack': {
            'check': ['npx', 'webcrack', '--help'],
            'install': 'npm install -g webcrack',
            'type': 'deobfuscator',
        },
        'synchrony': {
            'check': ['npx', 'deobfuscator', '--help'],  # synchrony CLI
            'install': 'npm install -g synchrony',
            'type': 'deobfuscator',
        },
        'restringer': {
            'check': ['npx', 'restringer', '--help'],
            'install': 'npm install -g restringer',
            'type': 'deobfuscator',
        },
        'reverse-sourcemap': {
            'check': ['npx', 'reverse-sourcemap', '--help'],
            'install': 'npm install -g reverse-sourcemap',
            'type': 'sourcemap',
        },
    }

    def __init__(self):
        self.available: Dict[str, bool] = {}
        self._check_all_tools()

    def _check_all_tools(self):
        """Check which tools are available"""
        for name, config in self.TOOLS.items():
            self.available[name] = self._check_tool(config['check'])

    def _check_tool(self, check_cmd: List[str]) -> bool:
        """Check if a tool is available"""
        try:
            result = subprocess.run(
                check_cmd,
                capture_output=True,
                timeout=10
            )
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError, Exception):
            return False

    def get_available_tools(self, tool_type: Optional[str] = None) -> List[str]:
        """Get list of available tools, optionally filtered by type"""
        tools = []
        for name, config in self.TOOLS.items():
            if self.available.get(name, False):
                if tool_type is None or config['type'] == tool_type:
                    tools.append(name)
        return tools

    def get_missing_tools(self) -> Dict[str, str]:
        """Get dict of missing tools and their install commands"""
        missing = {}
        for name, config in self.TOOLS.items():
            if not self.available.get(name, False):
                missing[name] = config['install']
        return missing

    def print_status(self):
        """Print tool availability status"""
        print("\n  Tool Status:")
        for name, config in self.TOOLS.items():
            status = "✅" if self.available.get(name, False) else "❌"
            print(f"    {status} {name} ({config['type']})")

        missing = self.get_missing_tools()
        if missing:
            print("\n  To install missing tools:")
            for name, cmd in missing.items():
                print(f"    {cmd}")

    # =========================================================================
    # Tool Runners
    # =========================================================================

    def run_prettier(self, input_path: Path, output_path: Optional[Path] = None) -> ToolResult:
        """Run Prettier on a file"""
        if not self.available.get('prettier'):
            return ToolResult(
                tool='prettier',
                success=False,
                error='Prettier not available'
            )

        try:
            # Read input
            with open(input_path, 'r', encoding='utf-8', errors='ignore') as f:
                code = f.read()

            # Run prettier via stdin/stdout
            result = subprocess.run(
                ['npx', 'prettier', '--parser', 'babel', '--print-width', '100'],
                input=code,
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode == 0:
                # Write output
                out_path = output_path or input_path.with_suffix('.formatted.js')
                with open(out_path, 'w', encoding='utf-8') as f:
                    f.write(result.stdout)

                return ToolResult(
                    tool='prettier',
                    success=True,
                    output_path=out_path,
                    stdout=result.stdout
                )
            else:
                return ToolResult(
                    tool='prettier',
                    success=False,
                    stderr=result.stderr,
                    error=f'Prettier failed: {result.stderr[:200]}'
                )

        except subprocess.TimeoutExpired:
            return ToolResult(tool='prettier', success=False, error='Timeout')
        except Exception as e:
            return ToolResult(tool='prettier', success=False, error=str(e))

    def run_webcrack(self, input_path: Path, output_dir: Path) -> ToolResult:
        """Run webcrack for deobfuscation and webpack unpacking"""
        if not self.available.get('webcrack'):
            return ToolResult(
                tool='webcrack',
                success=False,
                error='webcrack not available'
            )

        try:
            output_dir.mkdir(parents=True, exist_ok=True)

            result = subprocess.run(
                ['npx', 'webcrack', str(input_path), '-o', str(output_dir)],
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode == 0:
                return ToolResult(
                    tool='webcrack',
                    success=True,
                    output_path=output_dir,
                    stdout=result.stdout,
                    stderr=result.stderr
                )
            else:
                return ToolResult(
                    tool='webcrack',
                    success=False,
                    stderr=result.stderr,
                    error=f'webcrack failed: {result.stderr[:200]}'
                )

        except subprocess.TimeoutExpired:
            return ToolResult(tool='webcrack', success=False, error='Timeout')
        except Exception as e:
            return ToolResult(tool='webcrack', success=False, error=str(e))

    def run_synchrony(self, input_path: Path, output_path: Optional[Path] = None) -> ToolResult:
        """Run Synchrony for javascript-obfuscator deobfuscation"""
        if not self.available.get('synchrony'):
            return ToolResult(
                tool='synchrony',
                success=False,
                error='synchrony not available'
            )

        try:
            out_path = output_path or input_path.with_suffix('.deob.js')

            result = subprocess.run(
                ['npx', 'deobfuscator', str(input_path), '-o', str(out_path)],
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode == 0 and out_path.exists():
                return ToolResult(
                    tool='synchrony',
                    success=True,
                    output_path=out_path,
                    stdout=result.stdout
                )
            else:
                return ToolResult(
                    tool='synchrony',
                    success=False,
                    stderr=result.stderr,
                    error=f'synchrony failed: {result.stderr[:200]}'
                )

        except subprocess.TimeoutExpired:
            return ToolResult(tool='synchrony', success=False, error='Timeout')
        except Exception as e:
            return ToolResult(tool='synchrony', success=False, error=str(e))

    def run_restringer(self, input_path: Path, output_path: Optional[Path] = None) -> ToolResult:
        """Run REstringer for general deobfuscation"""
        if not self.available.get('restringer'):
            return ToolResult(
                tool='restringer',
                success=False,
                error='restringer not available'
            )

        try:
            # REstringer outputs to stdout by default
            result = subprocess.run(
                ['npx', 'restringer', str(input_path)],
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode == 0 and result.stdout:
                out_path = output_path or input_path.with_suffix('.deob.js')
                with open(out_path, 'w', encoding='utf-8') as f:
                    f.write(result.stdout)

                return ToolResult(
                    tool='restringer',
                    success=True,
                    output_path=out_path,
                    stdout=result.stdout
                )
            else:
                return ToolResult(
                    tool='restringer',
                    success=False,
                    stderr=result.stderr,
                    error=f'restringer failed'
                )

        except subprocess.TimeoutExpired:
            return ToolResult(tool='restringer', success=False, error='Timeout')
        except Exception as e:
            return ToolResult(tool='restringer', success=False, error=str(e))

    def run_reverse_sourcemap(self, map_path: Path, output_dir: Path) -> ToolResult:
        """Run reverse-sourcemap to extract original source"""
        if not self.available.get('reverse-sourcemap'):
            return ToolResult(
                tool='reverse-sourcemap',
                success=False,
                error='reverse-sourcemap not available'
            )

        try:
            output_dir.mkdir(parents=True, exist_ok=True)

            result = subprocess.run(
                ['npx', 'reverse-sourcemap', '--output-dir', str(output_dir), str(map_path)],
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode == 0:
                return ToolResult(
                    tool='reverse-sourcemap',
                    success=True,
                    output_path=output_dir,
                    stdout=result.stdout
                )
            else:
                return ToolResult(
                    tool='reverse-sourcemap',
                    success=False,
                    stderr=result.stderr,
                    error=f'reverse-sourcemap failed: {result.stderr[:200]}'
                )

        except subprocess.TimeoutExpired:
            return ToolResult(tool='reverse-sourcemap', success=False, error='Timeout')
        except Exception as e:
            return ToolResult(tool='reverse-sourcemap', success=False, error=str(e))

    def run_string_decoder(self, input_path: Path, output_path: Optional[Path] = None) -> ToolResult:
        """
        Run custom string array decoder for javascript-obfuscator.

        This handles the common pattern where strings are stored in a rotated array
        and accessed via a decoder function. webcrack crashes on this pattern.
        """
        if not self.available.get('string-decoder'):
            return ToolResult(
                tool='string-decoder',
                success=False,
                error='Node.js not available'
            )

        try:
            # Find the decoder script (relative to this file)
            script_dir = Path(__file__).parent.parent  # tools/
            decoder_script = script_dir / 'decode-strings-v3.cjs'

            if not decoder_script.exists():
                return ToolResult(
                    tool='string-decoder',
                    success=False,
                    error=f'Decoder script not found: {decoder_script}'
                )

            out_path = output_path or input_path.with_suffix('.decoded.js')

            result = subprocess.run(
                ['node', str(decoder_script), str(input_path), str(out_path)],
                capture_output=True,
                text=True,
                timeout=60
            )

            # Check if decoder found and replaced strings
            if result.returncode == 0 and out_path.exists():
                # Parse output to check success
                stdout = result.stdout
                if 'Replaced' in stdout and 'decoder calls' in stdout:
                    # Extract replacement count
                    import re
                    match = re.search(r'Replaced (\d+) decoder calls', stdout)
                    if match and int(match.group(1)) > 0:
                        return ToolResult(
                            tool='string-decoder',
                            success=True,
                            output_path=out_path,
                            stdout=stdout,
                            stderr=result.stderr
                        )

                # No strings found to decode
                return ToolResult(
                    tool='string-decoder',
                    success=False,
                    stdout=stdout,
                    stderr=result.stderr,
                    error='No string array obfuscation found'
                )
            else:
                return ToolResult(
                    tool='string-decoder',
                    success=False,
                    stderr=result.stderr,
                    error=f'String decoder failed: {result.stderr[:200]}'
                )

        except subprocess.TimeoutExpired:
            return ToolResult(tool='string-decoder', success=False, error='Timeout')
        except Exception as e:
            return ToolResult(tool='string-decoder', success=False, error=str(e))

    def run_string_simplifier(self, input_path: Path, output_path: Optional[Path] = None) -> ToolResult:
        """
        Run string concatenation simplifier.

        This joins adjacent string literals like 'foo' + 'bar' -> 'foobar'
        and converts hex escapes to readable characters.
        """
        if not self.available.get('string-simplifier'):
            return ToolResult(
                tool='string-simplifier',
                success=False,
                error='Node.js not available'
            )

        try:
            # Find the simplifier script (relative to this file)
            script_dir = Path(__file__).parent.parent  # tools/
            simplifier_script = script_dir / 'simplify-strings.cjs'

            if not simplifier_script.exists():
                return ToolResult(
                    tool='string-simplifier',
                    success=False,
                    error=f'Simplifier script not found: {simplifier_script}'
                )

            out_path = output_path or input_path.with_suffix('.simplified.js')

            result = subprocess.run(
                ['node', str(simplifier_script), str(input_path), str(out_path)],
                capture_output=True,
                text=True,
                timeout=60
            )

            # Check if simplifier worked
            if result.returncode == 0 and out_path.exists():
                stdout = result.stdout
                # Check if any simplifications were made
                if 'simplified' in stdout.lower() or 'concatenations' in stdout:
                    import re
                    # Look for "X → Y (Z simplified)" pattern
                    match = re.search(r'(\d+)\s*→\s*(\d+)', stdout)
                    if match:
                        before = int(match.group(1))
                        after = int(match.group(2))
                        if before > after:
                            return ToolResult(
                                tool='string-simplifier',
                                success=True,
                                output_path=out_path,
                                stdout=stdout,
                                stderr=result.stderr
                            )

                # Still return success if file was created (may have had no work to do)
                return ToolResult(
                    tool='string-simplifier',
                    success=True,
                    output_path=out_path,
                    stdout=stdout,
                    stderr=result.stderr
                )
            else:
                return ToolResult(
                    tool='string-simplifier',
                    success=False,
                    stderr=result.stderr,
                    error=f'String simplifier failed: {result.stderr[:200]}'
                )

        except subprocess.TimeoutExpired:
            return ToolResult(tool='string-simplifier', success=False, error='Timeout')
        except Exception as e:
            return ToolResult(tool='string-simplifier', success=False, error=str(e))
