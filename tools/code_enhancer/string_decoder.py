"""
Custom String Array Decoder for JavaScript obfuscation

Handles the common pattern:
- function decoder(x) { return stringArray[x - offset] }
- function stringArray() { return ['str1', 'str2', ...] }
- rotation IIFE that shuffles the array

This decoder extracts strings statically and replaces all decoder calls.
"""

import re
import json
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, List, Tuple


@dataclass
class StringArrayInfo:
    """Info about detected string array obfuscation"""
    array_func_name: str
    decoder_func_name: str
    offset: int
    strings: List[str]
    rotation_checksum: Optional[int] = None


@dataclass
class DecodingResult:
    """Result of string decoding"""
    success: bool
    decoded_code: str
    strings_replaced: int
    error: Optional[str] = None


class StringArrayDecoder:
    """
    Decodes string array obfuscation pattern.

    Pattern detected:
    - String array function: function XXX() { return ['...', '...'] }
    - Decoder function: function YYY(a,b) { a = a - 0xNNN; return XXX()[a] }
    - Rotation IIFE: (function(arr, checksum) { ... })(XXX, NNNNN)
    """

    def __init__(self):
        self.debug = False

    def _extract_array_content(self, code: str, start: int) -> Optional[str]:
        """Extract content between matching [ and ] handling nested strings"""
        if code[start] != '[':
            return None

        bracket_count = 0
        in_string = False
        quote_char = None
        i = start

        while i < len(code):
            c = code[i]

            if not in_string:
                if c == '[':
                    bracket_count += 1
                elif c == ']':
                    bracket_count -= 1
                    if bracket_count == 0:
                        # Return content without the brackets
                        return code[start + 1:i]
                elif c in '"\'':
                    in_string = True
                    quote_char = c
            else:
                if c == '\\' and i + 1 < len(code):
                    i += 1  # Skip escaped char
                elif c == quote_char:
                    in_string = False
                    quote_char = None
            i += 1

        return None

    def analyze_file(self, file_path: Path) -> Optional[StringArrayInfo]:
        """Analyze a file for string array obfuscation"""
        code = file_path.read_text(encoding='utf-8', errors='ignore')
        return self.analyze_code(code)

    def analyze_code(self, code: str) -> Optional[StringArrayInfo]:
        """Analyze code for string array obfuscation pattern"""

        # Find string array function start
        # Pattern: function XXX(){const YY=['
        func_match = re.search(
            r'function\s+(\w+)\s*\(\s*\)\s*\{\s*(?:const|var|let)\s+(\w+)\s*=\s*\[',
            code
        )

        if not func_match:
            return None

        array_func_name = func_match.group(1)

        # Find the full array by matching brackets
        start = func_match.end() - 1  # Position of [
        raw_strings = self._extract_array_content(code, start)

        if not raw_strings:
            return None

        # Pattern 2: Find decoder function
        # function wavvv1Z(D,Z){D=D-0x174;const i=wavvv1D();let d=i[D];return d;}
        decoder_match = re.search(
            rf'function\s+(\w+)\s*\(\s*(\w+)\s*,\s*\w*\s*\)\s*\{{\s*\2\s*=\s*\2\s*-\s*(0x[0-9a-fA-F]+|\d+)',
            code
        )

        if not decoder_match:
            return None

        decoder_func_name = decoder_match.group(1)
        offset_str = decoder_match.group(3)
        offset = int(offset_str, 16) if offset_str.startswith('0x') else int(offset_str)

        # Parse the string array
        strings = self._parse_string_array(raw_strings)

        if not strings:
            return None

        # Pattern 3: Find rotation IIFE (optional)
        # (function(D,Z){...while(!![]){try{...}catch(e){D.push(D.shift())}}})(wavvv1D, 0x66018)
        rotation_match = re.search(
            rf'\(function\s*\(\s*\w+\s*,\s*\w+\s*\)\s*\{{.*?while\s*\(\s*!!\s*\[\s*\]\s*\).*?\}}\s*\)\s*\(\s*{array_func_name}\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*\)',
            code,
            re.DOTALL
        )

        rotation_checksum = None
        if rotation_match:
            checksum_str = rotation_match.group(1)
            rotation_checksum = int(checksum_str, 16) if checksum_str.startswith('0x') else int(checksum_str)

            # Apply rotation to strings
            strings = self._apply_rotation(strings, code, array_func_name, decoder_func_name, offset)

        return StringArrayInfo(
            array_func_name=array_func_name,
            decoder_func_name=decoder_func_name,
            offset=offset,
            strings=strings,
            rotation_checksum=rotation_checksum
        )

    def _parse_string_array(self, raw: str) -> List[str]:
        """Parse the raw string array content"""
        strings = []

        # Handle escaped strings in the array
        # Pattern: 'string' or "string" separated by commas
        current = ""
        in_string = False
        quote_char = None
        i = 0

        while i < len(raw):
            c = raw[i]

            if not in_string:
                if c in '"\'':
                    in_string = True
                    quote_char = c
                    current = ""
            else:
                if c == '\\' and i + 1 < len(raw):
                    # Handle escape sequences
                    next_c = raw[i + 1]
                    if next_c == 'x' and i + 3 < len(raw):
                        # \xNN hex escape
                        hex_val = raw[i+2:i+4]
                        try:
                            current += chr(int(hex_val, 16))
                            i += 3
                        except:
                            current += c
                    elif next_c == 'u' and i + 5 < len(raw):
                        # \uNNNN unicode escape
                        hex_val = raw[i+2:i+6]
                        try:
                            current += chr(int(hex_val, 16))
                            i += 5
                        except:
                            current += c
                    elif next_c == 'n':
                        current += '\n'
                        i += 1
                    elif next_c == 't':
                        current += '\t'
                        i += 1
                    elif next_c == 'r':
                        current += '\r'
                        i += 1
                    elif next_c == '0':
                        current += '\0'
                        i += 1
                    elif next_c == quote_char:
                        current += next_c
                        i += 1
                    elif next_c == '\\':
                        current += '\\'
                        i += 1
                    else:
                        current += next_c
                        i += 1
                elif c == quote_char:
                    strings.append(current)
                    in_string = False
                    quote_char = None
                else:
                    current += c

            i += 1

        return strings

    def _apply_rotation(self, strings: List[str], code: str, array_func: str, decoder_func: str, offset: int) -> List[str]:
        """
        Apply rotation to match the checksum.

        The rotation IIFE shuffles array until parseInt expressions sum to checksum.
        Since we can't easily evaluate the JS, we use a heuristic:
        - Find first few decoder calls and their expected outputs
        - Rotate until they match
        """
        # Find some known decoder calls with context clues
        # Look for patterns like: decoder(0xNNN) + 'known text'

        # Try rotating and checking if known patterns work
        known_patterns = [
            (r"'https'", 'https'),
            (r"'http'", 'http'),
            (r"'/api'", '/api'),
            (r"'POST'", 'POST'),
            (r"'GET'", 'GET'),
            (r"'function'", 'function'),
            (r"'undefined'", 'undefined'),
        ]

        # Look for decoder calls followed by string concatenation
        concat_pattern = rf'{decoder_func}\s*\(\s*(0x[0-9a-fA-F]+)\s*\)\s*\+\s*["\']([^"\']+)["\']'
        concats = re.findall(concat_pattern, code)

        if concats:
            # Try to find the rotation that makes sense
            for rotation in range(len(strings)):
                rotated = strings[rotation:] + strings[:rotation]
                matches = 0
                for hex_idx, suffix in concats[:5]:  # Check first 5
                    idx = int(hex_idx, 16) - offset
                    if 0 <= idx < len(rotated):
                        val = rotated[idx]
                        # Check if this forms a valid string
                        combined = val + suffix
                        if combined.startswith('http') or combined.startswith('/') or combined in ['POST', 'GET']:
                            matches += 1

                if matches >= 2:
                    return rotated

        # Fallback: return as-is
        return strings

    def decode_file(self, file_path: Path) -> DecodingResult:
        """Decode a file with string array obfuscation"""
        code = file_path.read_text(encoding='utf-8', errors='ignore')
        return self.decode_code(code)

    def decode_code(self, code: str) -> DecodingResult:
        """Decode string array obfuscation in code"""

        info = self.analyze_code(code)

        if not info:
            return DecodingResult(
                success=False,
                decoded_code=code,
                strings_replaced=0,
                error="No string array obfuscation detected"
            )

        # Find all aliases to the decoder function
        # Pattern: const XX = decoderFunc  or  XX = decoderFunc
        aliases = [info.decoder_func_name]
        alias_pattern = rf'(?:const|let|var)?\s*(\w+)\s*=\s*{info.decoder_func_name}(?:\s*[,;]|\s*$)'
        for match in re.finditer(alias_pattern, code):
            alias = match.group(1)
            if alias not in aliases:
                aliases.append(alias)

        # Replace all decoder calls with actual strings
        decoded = code
        replaced = 0

        def replace_call(match):
            nonlocal replaced
            idx_str = match.group(1)
            idx = int(idx_str, 16) if idx_str.startswith('0x') else int(idx_str)
            actual_idx = idx - info.offset

            if 0 <= actual_idx < len(info.strings):
                replaced += 1
                # Escape the string for JS
                s = info.strings[actual_idx]
                s = s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t')
                return f"'{s}'"

            return match.group(0)  # Keep original if out of bounds

        # Replace calls for decoder and all aliases
        for alias in aliases:
            pattern = rf'{re.escape(alias)}\s*\(\s*(0x[0-9a-fA-F]+|\d+)\s*\)'
            decoded = re.sub(pattern, replace_call, decoded)

        return DecodingResult(
            success=replaced > 0,
            decoded_code=decoded,
            strings_replaced=replaced
        )


def decode_file(input_path: Path, output_path: Path = None) -> DecodingResult:
    """Convenience function to decode a file"""
    decoder = StringArrayDecoder()
    result = decoder.decode_file(input_path)

    if result.success and output_path:
        output_path.write_text(result.decoded_code, encoding='utf-8')

    return result


if __name__ == '__main__':
    import sys

    if len(sys.argv) < 2:
        print("Usage: python string_decoder.py <input.js> [output.js]")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None

    result = decode_file(input_path, output_path)

    print(f"Success: {result.success}")
    print(f"Strings replaced: {result.strings_replaced}")
    if result.error:
        print(f"Error: {result.error}")

    if output_path:
        print(f"Output written to: {output_path}")
