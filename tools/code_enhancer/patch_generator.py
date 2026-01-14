"""
Patch Guide Generator
Creates user-friendly guides for common issues
"""

from pathlib import Path
from typing import List, Dict
from collections import defaultdict

from .pattern_detector import CriticalFunction


class PatchGuideGenerator:
    """
    Analyzes critical functions and generates patch guides
    """

    def generate_guides(
        self,
        critical_functions: List[CriticalFunction],
        output_dir: Path
    ) -> List[Path]:
        """
        Generate patch guides for common issues found
        Returns list of generated guide paths
        """
        guides = []

        # Detect common issues
        issues = self._detect_issues(critical_functions)

        # Generate guide for each issue type
        if issues['auth_redirects']:
            guide = self._generate_auth_redirect_guide(issues['auth_redirects'], output_dir)
            guides.append(guide)

        if issues['api_401_handlers']:
            guide = self._generate_401_handler_guide(issues['api_401_handlers'], output_dir)
            guides.append(guide)

        if issues['router_guards']:
            guide = self._generate_router_guard_guide(issues['router_guards'], output_dir)
            guides.append(guide)

        # Generate master guide
        master = self._generate_master_guide(critical_functions, guides, output_dir)
        guides.insert(0, master)

        return guides

    def _detect_issues(self, functions: List[CriticalFunction]) -> Dict[str, List[CriticalFunction]]:
        """Detect common patchable issues"""
        issues = defaultdict(list)

        for func in functions:
            code_lower = func.code.lower()

            # Auth redirect patterns
            if any(pattern in code_lower for pattern in ['window.location.href', 'location.replace', 'location.assign']):
                if any(pattern in code_lower for pattern in ['401', 'unauthorized', 'notauthorized']):
                    issues['auth_redirects'].append(func)

            # API 401 handlers
            if any(pattern in code_lower for pattern in ['status === 401', 'status == 401', 'statuscode === 401']):
                issues['api_401_handlers'].append(func)

            # Router guards
            if any(pattern in code_lower for pattern in ['router', 'beforeenter', 'guard']):
                if any(pattern in code_lower for pattern in ['auth', 'login', 'redirect']):
                    issues['router_guards'].append(func)

        return issues

    def _generate_master_guide(
        self,
        all_functions: List[CriticalFunction],
        issue_guides: List[Path],
        output_dir: Path
    ) -> Path:
        """Generate master README"""
        path = output_dir / 'README.md'

        with open(path, 'w') as f:
            f.write("# Code Enhancement Report\n\n")
            f.write("This directory contains analysis and guides for the cloned application.\n\n")

            f.write("## Summary\n\n")
            f.write(f"- **Total critical functions found**: {len(all_functions)}\n")

            # Category breakdown
            categories = {}
            for func in all_functions:
                for cat in func.categories:
                    categories[cat] = categories.get(cat, 0) + 1

            if categories:
                f.write(f"\n### Functions by Category\n\n")
                for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
                    f.write(f"- **{cat}**: {count} functions\n")

            f.write("\n## Available Patch Guides\n\n")

            if len(issue_guides) > 1:  # More than just master
                for guide in issue_guides:
                    if guide.name != 'README.md':
                        title = guide.stem.replace('-', ' ').title()
                        f.write(f"- [{title}](./{guide.name})\n")
            else:
                f.write("No specific issues detected. See formatted code in `../enhanced/3-formatted/` directory.\n")

            f.write("\n## How to Use\n\n")
            f.write("1. **Read the patch guides** above to understand common issues\n")
            f.write("2. **Review formatted code** in `../enhanced/3-formatted/`\n")
            f.write("3. **Apply runtime patches** (recommended) or modify source code\n\n")

            f.write("## Runtime Patches (Already Applied)\n\n")
            f.write("The following workarounds are active in `index.html`:\n\n")
            f.write("- ✅ **Nuclear location blocker** - Prevents unwanted redirects to login\n")
            f.write("- ✅ **Router guard bypass** - Allows access to protected routes\n")
            f.write("- ✅ **Auto-mocker** - Mocks API responses with realistic data\n\n")

            f.write("These are **runtime patches** that work without modifying source code.\n")

        return path

    def _generate_auth_redirect_guide(self, functions: List[CriticalFunction], output_dir: Path) -> Path:
        """Generate guide for bypassing auth redirects"""
        path = output_dir / 'auth-redirect-bypass.md'

        with open(path, 'w') as f:
            f.write("# Fix: Auth Redirect to Login Page\n\n")

            f.write("## Problem\n\n")
            f.write("The application redirects to the login page when authentication fails (401/unauthorized).\n\n")

            f.write("## ✅ Solution (Already Implemented)\n\n")
            f.write("The **Nuclear Location Blocker** is already active in `index.html`.\n\n")
            f.write("It intercepts all `window.location` assignments and blocks redirects to `/` or login pages.\n\n")

            f.write("```javascript\n")
            f.write("// In index.html:\n")
            f.write("Location.prototype.href = function(url) {\n")
            f.write("  if (url === '/' || url.includes('login')) {\n")
            f.write("    console.log('☢️ BLOCKED redirect to:', url);\n")
            f.write("    return; // Don't redirect\n")
            f.write("  }\n")
            f.write("  // Allow other URLs\n")
            f.write("};\n")
            f.write("```\n\n")

            f.write("## Functions Involved\n\n")
            f.write(f"Found {len(functions)} functions that handle auth redirects:\n\n")

            for i, func in enumerate(functions[:10], 1):  # Top 10
                f.write(f"### {i}. `{func.name}`\n\n")
                f.write(f"**File**: `{Path(func.file_path).name}:{func.line_number}`\n\n")
                f.write(f"**Categories**: {', '.join(func.categories)}\n\n")
                f.write("**Matched patterns**:\n")
                for pattern in func.matched_patterns[:3]:
                    f.write(f"- `{pattern}`\n")
                f.write("\n")

            if len(functions) > 10:
                f.write(f"\n...and {len(functions) - 10} more functions\n\n")

            f.write("## Alternative: Source Code Patch\n\n")
            f.write("If you need to patch the source code instead:\n\n")
            f.write("1. Open the formatted file in `../enhanced/3-formatted/`\n")
            f.write("2. Search for `window.location.href =`\n")
            f.write("3. Comment out or modify the redirect logic\n\n")

        return path

    def _generate_401_handler_guide(self, functions: List[CriticalFunction], output_dir: Path) -> Path:
        """Generate guide for handling 401 responses"""
        path = output_dir / 'api-401-handler.md'

        with open(path, 'w') as f:
            f.write("# Fix: API 401 Unauthorized Errors\n\n")

            f.write("## Problem\n\n")
            f.write("API calls return 401 Unauthorized, causing authentication flows to fail.\n\n")

            f.write("## ✅ Solution (Already Implemented)\n\n")
            f.write("The **Auto-Mocker** in `universal-mocker/auto-mocker.js` intercepts API calls.\n\n")
            f.write("It returns mock success responses for failed API calls.\n\n")

            f.write("## Functions Involved\n\n")
            f.write(f"Found {len(functions)} functions that handle 401 errors:\n\n")

            for i, func in enumerate(functions[:10], 1):
                f.write(f"### {i}. `{func.name}`\n\n")
                f.write(f"**File**: `{Path(func.file_path).name}:{func.line_number}`\n\n")
                f.write("**What it does**: Checks response status and handles 401 errors\n\n")

            f.write("## How Auto-Mocker Works\n\n")
            f.write("```javascript\n")
            f.write("// Intercepts fetch/XHR requests\n")
            f.write("if (response.status === 401) {\n")
            f.write("  return mockSuccessResponse();\n")
            f.write("}\n")
            f.write("```\n\n")

        return path

    def _generate_router_guard_guide(self, functions: List[CriticalFunction], output_dir: Path) -> Path:
        """Generate guide for bypassing router guards"""
        path = output_dir / 'router-guard-bypass.md'

        with open(path, 'w') as f:
            f.write("# Fix: Router Navigation Guards\n\n")

            f.write("## Problem\n\n")
            f.write("Vue Router navigation guards block access to protected routes.\n\n")

            f.write("## ✅ Solution (Already Implemented)\n\n")
            f.write("The **Router Guard Bypass** in `universal-mocker/router-guard-bypass.js` removes guards.\n\n")
            f.write("It patches the router to strip `beforeEnter` guards from all routes.\n\n")

            f.write("## Functions Involved\n\n")
            f.write(f"Found {len(functions)} functions related to routing:\n\n")

            for func in functions[:10]:
                f.write(f"- `{func.name}` in `{Path(func.file_path).name}:{func.line_number}`\n")

            f.write("\n")

        return path
