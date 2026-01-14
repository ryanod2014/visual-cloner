"""
Template-Based Documentation Generator
Generates JSDoc comments based on code patterns - no AI required
"""

import re
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass


@dataclass
class FunctionInfo:
    """Information about a function"""
    name: str
    params: List[str]
    body: str
    is_async: bool
    start_pos: int
    end_pos: int
    line_number: int


@dataclass
class GeneratedDoc:
    """A generated JSDoc comment"""
    function_name: str
    jsdoc: str
    description: str
    param_docs: List[str]
    return_doc: str
    tags: List[str]


@dataclass
class DocumentationResult:
    """Results from documentation generation"""
    file_path: Path
    documented_code: str
    functions_documented: int
    total_functions: int
    generated_docs: List[GeneratedDoc]


class TemplateDocumenter:
    """
    Generates JSDoc comments using template patterns.
    Analyzes function signatures and bodies to infer documentation.
    """

    # Pattern-based descriptions
    FUNCTION_PATTERNS = {
        # Auth patterns
        r'401|unauthorized': 'Handles authentication/authorization',
        r'login|signin|signIn': 'Handles user login',
        r'logout|signout|signOut': 'Handles user logout',
        r'register|signup|signUp': 'Handles user registration',
        r'authenticate': 'Authenticates the user',
        r'verify|validate.*token': 'Validates authentication token',

        # API patterns
        r'fetch\s*\(': 'Makes an HTTP request',
        r'axios|xhr|XMLHttpRequest': 'Makes an HTTP request',
        r'\.get\s*\(|\.post\s*\(|\.put\s*\(|\.delete\s*\(': 'Makes an API call',

        # Data patterns
        r'JSON\.parse': 'Parses JSON data',
        r'JSON\.stringify': 'Serializes data to JSON',
        r'localStorage|sessionStorage': 'Handles browser storage',

        # DOM patterns
        r'document\.getElementById|querySelector': 'Queries DOM elements',
        r'createElement': 'Creates DOM elements',
        r'appendChild|insertBefore|replaceChild': 'Modifies DOM structure',
        r'addEventListener': 'Attaches event listeners',
        r'removeEventListener': 'Removes event listeners',
        r'innerHTML|textContent': 'Updates element content',
        r'classList|className': 'Modifies element classes',
        r'style\.': 'Modifies element styles',

        # Navigation patterns
        r'window\.location|history\.push': 'Handles navigation/routing',
        r'router\.push|navigate\(': 'Navigates to a route',
        r'redirect': 'Redirects to another page',

        # Event patterns
        r'onClick|onclick': 'Handles click events',
        r'onSubmit|onsubmit': 'Handles form submission',
        r'onChange|onchange': 'Handles change events',
        r'onKeyDown|onkeydown|keyCode': 'Handles keyboard events',
        r'onMouse|onmouse': 'Handles mouse events',

        # Async patterns
        r'Promise|\.then\(|async\s+function': 'Performs asynchronous operation',
        r'await': 'Awaits asynchronous result',
        r'setTimeout|setInterval': 'Schedules delayed execution',

        # Error handling
        r'try\s*{|catch\s*\(': 'Handles errors',
        r'throw\s+new\s+Error': 'Throws an error',

        # Utility patterns
        r'map\s*\(|filter\s*\(|reduce\s*\(': 'Processes array data',
        r'sort\s*\(': 'Sorts data',
        r'find\s*\(|indexOf|includes': 'Searches for data',
        r'split\s*\(|join\s*\(': 'Manipulates strings',
        r'Math\.|floor|ceil|round|random': 'Performs mathematical operations',
        r'Date|getTime|toISOString': 'Handles date/time operations',
        r'RegExp|\.test\(|\.match\(|\.replace\(': 'Performs text pattern matching',

        # Validation patterns
        r'validate|isValid': 'Validates data',
        r'check|verify': 'Checks conditions',
        r'sanitize|escape|encode': 'Sanitizes input data',

        # State patterns
        r'setState|useState|dispatch': 'Updates application state',
        r'getState|useSelector': 'Retrieves application state',
    }

    # Parameter type inference
    PARAM_TYPE_PATTERNS = {
        # By name
        r'^e$|^event$|^evt$': ('Event', 'The event object'),
        r'^err$|^error$|^ex$': ('Error', 'The error object'),
        r'^el$|^elem$|^element$': ('HTMLElement', 'The DOM element'),
        r'^id$|.*Id$|.*ID$': ('string', 'The identifier'),
        r'^url$|^endpoint$|^path$': ('string', 'The URL or path'),
        r'^data$|^payload$|^body$': ('Object', 'The data payload'),
        r'^options$|^opts$|^config$': ('Object', 'Configuration options'),
        r'^callback$|^cb$|^fn$|^handler$': ('Function', 'Callback function'),
        r'^str$|^text$|^message$|^msg$': ('string', 'The text string'),
        r'^num$|^count$|^index$|^i$|^j$': ('number', 'The numeric value'),
        r'^arr$|^list$|^items$|^array$': ('Array', 'The array'),
        r'^obj$|^object$': ('Object', 'The object'),
        r'^bool$|^flag$|^is.*|^has.*|^should.*': ('boolean', 'The boolean flag'),
        r'^response$|^res$': ('Response', 'The response object'),
        r'^request$|^req$': ('Request', 'The request object'),
        r'^user$': ('Object', 'The user object'),
        r'^token$': ('string', 'The authentication token'),
        r'^key$': ('string', 'The key'),
        r'^value$|^val$': ('*', 'The value'),

        # By usage context (checked in body)
        r'\.length': ('Array|string', 'The array or string'),
        r'\.map\(|\.filter\(': ('Array', 'The array'),
        r'\.status\s*===?\s*\d+': ('Response', 'The HTTP response'),
        r'\.preventDefault': ('Event', 'The event object'),
    }

    # Return type inference
    RETURN_PATTERNS = {
        r'return\s+true|return\s+false': ('boolean', 'Boolean result'),
        r'return\s+null': ('null', 'Null on failure'),
        r'return\s+\[\s*\]|return\s+\[': ('Array', 'Array of results'),
        r'return\s+{\s*}|return\s+{': ('Object', 'Object containing results'),
        r'return\s+["\']': ('string', 'String result'),
        r'return\s+\d+': ('number', 'Numeric result'),
        r'return\s+new\s+Promise': ('Promise', 'Promise that resolves'),
        r'return\s+fetch|return\s+axios': ('Promise<Response>', 'Promise resolving to response'),
        r'async\s+function|=>\s*{\s*await': ('Promise', 'Promise that resolves'),
    }

    def __init__(self):
        self.compiled_func_patterns = {
            re.compile(pattern, re.IGNORECASE): desc
            for pattern, desc in self.FUNCTION_PATTERNS.items()
        }
        self.compiled_return_patterns = {
            re.compile(pattern, re.IGNORECASE): (rtype, desc)
            for pattern, (rtype, desc) in self.RETURN_PATTERNS.items()
        }

    def document_file(self, file_path: Path) -> DocumentationResult:
        """Add JSDoc comments to a file"""
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            code = f.read()

        return self.document_code(code, file_path)

    def document_code(self, code: str, file_path: Path = None) -> DocumentationResult:
        """Add JSDoc comments to code"""
        # Extract all functions
        functions = self._extract_functions(code)

        # Generate docs for each function
        generated_docs = []
        for func in functions:
            doc = self._generate_jsdoc(func)
            if doc:
                generated_docs.append(doc)

        # Insert JSDoc comments into code
        documented_code = self._insert_jsdocs(code, functions, generated_docs)

        return DocumentationResult(
            file_path=file_path or Path('unknown'),
            documented_code=documented_code,
            functions_documented=len(generated_docs),
            total_functions=len(functions),
            generated_docs=generated_docs
        )

    def _extract_functions(self, code: str) -> List[FunctionInfo]:
        """Extract all functions from code"""
        functions = []

        # Regular function declarations
        func_pattern = r'(async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*\{'
        for match in re.finditer(func_pattern, code):
            is_async = match.group(1) is not None
            name = match.group(2)
            params = self._parse_params(match.group(3))
            start_pos = match.start()

            body, end_pos = self._extract_body(code, match.end() - 1)
            line_number = code[:start_pos].count('\n') + 1

            functions.append(FunctionInfo(
                name=name,
                params=params,
                body=body,
                is_async=is_async,
                start_pos=start_pos,
                end_pos=end_pos,
                line_number=line_number
            ))

        # Arrow functions assigned to variables
        arrow_pattern = r'(?:const|let|var)\s+(\w+)\s*=\s*(async\s*)?\(([^)]*)\)\s*=>\s*\{'
        for match in re.finditer(arrow_pattern, code):
            name = match.group(1)
            is_async = match.group(2) is not None
            params = self._parse_params(match.group(3))
            start_pos = match.start()

            # Find the opening brace
            brace_pos = code.find('{', match.end() - 1)
            body, end_pos = self._extract_body(code, brace_pos)
            line_number = code[:start_pos].count('\n') + 1

            functions.append(FunctionInfo(
                name=name,
                params=params,
                body=body,
                is_async=is_async,
                start_pos=start_pos,
                end_pos=end_pos,
                line_number=line_number
            ))

        return functions

    def _parse_params(self, params_str: str) -> List[str]:
        """Parse function parameters"""
        if not params_str.strip():
            return []

        params = []
        for param in params_str.split(','):
            param = param.strip()
            # Handle default values
            if '=' in param:
                param = param.split('=')[0].strip()
            # Handle destructuring
            if param.startswith('{') or param.startswith('['):
                param = 'options'  # Generic name for destructured params
            # Handle rest params
            if param.startswith('...'):
                param = param[3:]
            if param:
                params.append(param)

        return params

    def _extract_body(self, code: str, start_brace: int) -> Tuple[str, int]:
        """Extract function body by matching braces"""
        if start_brace >= len(code) or code[start_brace] != '{':
            return '', start_brace

        brace_count = 0
        in_string = False
        string_char = None
        escape_next = False

        for i in range(start_brace, len(code)):
            char = code[i]

            if escape_next:
                escape_next = False
                continue

            if char == '\\':
                escape_next = True
                continue

            if char in ('"', "'", '`'):
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
                if brace_count == 0:
                    return code[start_brace:i+1], i+1

        return code[start_brace:], len(code)

    def _generate_jsdoc(self, func: FunctionInfo) -> Optional[GeneratedDoc]:
        """Generate JSDoc for a function"""
        # Infer description from function body
        description = self._infer_description(func.name, func.body)

        # Infer parameter types
        param_docs = []
        for param in func.params:
            ptype, pdesc = self._infer_param_type(param, func.body)
            param_docs.append(f"@param {{{ptype}}} {param} - {pdesc}")

        # Infer return type
        return_type, return_desc = self._infer_return_type(func.body, func.is_async)
        return_doc = f"@returns {{{return_type}}} {return_desc}"

        # Add tags
        tags = []
        if func.is_async:
            tags.append('@async')

        # Build JSDoc
        jsdoc_lines = ['/**', f' * {description}', ' *']

        for pdoc in param_docs:
            jsdoc_lines.append(f' * {pdoc}')

        if param_docs:
            jsdoc_lines.append(' *')

        jsdoc_lines.append(f' * {return_doc}')

        for tag in tags:
            jsdoc_lines.append(f' * {tag}')

        jsdoc_lines.append(' */')

        jsdoc = '\n'.join(jsdoc_lines)

        return GeneratedDoc(
            function_name=func.name,
            jsdoc=jsdoc,
            description=description,
            param_docs=param_docs,
            return_doc=return_doc,
            tags=tags
        )

    def _infer_description(self, name: str, body: str) -> str:
        """Infer function description from name and body"""
        # Check body against patterns
        for pattern, description in self.compiled_func_patterns.items():
            if pattern.search(body):
                return description

        # Infer from function name
        if name.startswith('get'):
            return f"Gets {self._camel_to_words(name[3:])}"
        elif name.startswith('set'):
            return f"Sets {self._camel_to_words(name[3:])}"
        elif name.startswith('is') or name.startswith('has') or name.startswith('can'):
            return f"Checks if {self._camel_to_words(name)}"
        elif name.startswith('handle'):
            return f"Handles {self._camel_to_words(name[6:])}"
        elif name.startswith('on'):
            return f"Handler for {self._camel_to_words(name[2:])} event"
        elif name.startswith('create'):
            return f"Creates {self._camel_to_words(name[6:])}"
        elif name.startswith('update'):
            return f"Updates {self._camel_to_words(name[6:])}"
        elif name.startswith('delete') or name.startswith('remove'):
            return f"Removes {self._camel_to_words(name[6:])}"
        elif name.startswith('fetch') or name.startswith('load'):
            return f"Fetches {self._camel_to_words(name[5:] or name[4:])}"
        elif name.startswith('render'):
            return f"Renders {self._camel_to_words(name[6:])}"
        elif name.startswith('init'):
            return f"Initializes {self._camel_to_words(name[4:])}"

        return f"Performs {self._camel_to_words(name)} operation"

    def _camel_to_words(self, name: str) -> str:
        """Convert camelCase to words"""
        if not name:
            return "the operation"
        # Insert space before uppercase letters
        words = re.sub(r'([A-Z])', r' \1', name).strip().lower()
        return words or "the operation"

    def _infer_param_type(self, param: str, body: str) -> Tuple[str, str]:
        """Infer parameter type from name and usage"""
        # Check name patterns
        for pattern, (ptype, desc) in self.PARAM_TYPE_PATTERNS.items():
            if re.match(pattern, param, re.IGNORECASE):
                return ptype, desc

        # Check usage in body
        escaped = re.escape(param)
        for pattern, (ptype, desc) in self.PARAM_TYPE_PATTERNS.items():
            if not pattern.startswith('^'):  # Usage patterns (not name patterns)
                if re.search(rf'\b{escaped}\b.*{pattern}', body):
                    return ptype, f"The {param}"

        # Default
        return '*', f"The {param} parameter"

    def _infer_return_type(self, body: str, is_async: bool) -> Tuple[str, str]:
        """Infer return type from function body"""
        # Check return patterns
        for pattern, (rtype, desc) in self.compiled_return_patterns.items():
            if pattern.search(body):
                if is_async and not rtype.startswith('Promise'):
                    return f'Promise<{rtype}>', f"Promise resolving to {desc.lower()}"
                return rtype, desc

        # Check if function has return statement
        if not re.search(r'\breturn\b', body):
            return 'void', 'No return value'

        # Default for async
        if is_async:
            return 'Promise<*>', 'Promise resolving to result'

        return '*', 'The result'

    def _insert_jsdocs(
        self,
        code: str,
        functions: List[FunctionInfo],
        docs: List[GeneratedDoc]
    ) -> str:
        """Insert JSDoc comments into code"""
        # Create mapping of function name to doc
        doc_map = {doc.function_name: doc for doc in docs}

        # Sort functions by position (reverse order to insert from end)
        sorted_funcs = sorted(functions, key=lambda f: f.start_pos, reverse=True)

        result = code
        for func in sorted_funcs:
            if func.name in doc_map:
                doc = doc_map[func.name]

                # Check if already has JSDoc
                before = result[:func.start_pos].rstrip()
                if before.endswith('*/'):
                    continue  # Already documented

                # Get indentation
                line_start = result.rfind('\n', 0, func.start_pos) + 1
                indent = ''
                for char in result[line_start:func.start_pos]:
                    if char in ' \t':
                        indent += char
                    else:
                        break

                # Add indentation to JSDoc
                indented_jsdoc = '\n'.join(
                    indent + line if i > 0 else line
                    for i, line in enumerate(doc.jsdoc.split('\n'))
                )

                # Insert JSDoc before function
                result = result[:func.start_pos] + indented_jsdoc + '\n' + indent + result[func.start_pos:]

        return result

    def print_summary(self, result: DocumentationResult):
        """Print documentation summary"""
        print(f"\n  Documentation: {result.file_path.name if result.file_path else 'code'}")
        print(f"  Functions documented: {result.functions_documented}/{result.total_functions}")

        if result.generated_docs:
            print(f"\n  Generated JSDoc for:")
            for doc in result.generated_docs[:10]:
                print(f"    • {doc.function_name}: {doc.description[:50]}...")

            if len(result.generated_docs) > 10:
                print(f"    ... and {len(result.generated_docs) - 10} more")
