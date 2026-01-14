"""
Critical Code Pattern Detection
Identifies important functions using regex patterns
"""

import re
from typing import List, Dict, Set
from dataclasses import dataclass

from .ast_analyzer import ExtractedFunction


@dataclass
class CriticalFunction:
    """A function identified as critical for understanding the app"""
    name: str
    code: str
    file_path: str
    file_hash: str
    line_number: int
    categories: Set[str]
    criticality_score: int
    matched_patterns: List[str]
    call_count: int = 0


class PatternDetector:
    """
    Detects critical code patterns using regex
    Scores functions by importance
    """

    # Pattern categories with associated patterns
    AUTH_PATTERNS = [
        r'401|unauthorized',
        r'\btoken\b|\bjwt\b|\bbearer\b',
        r'localStorage\.getItem|sessionStorage\.getItem',
        r'firebase\.auth\(\)|getIdToken',
        r'Authorization.*Bearer',
        r'\.sign(?:In|Out|Up)',
        r'login|logout|authenticate',
    ]

    ROUTING_PATTERNS = [
        r'window\.location\.href\s*=',
        r'location\.(?:replace|assign)\(',
        r'router\.(?:push|replace|go)\(',
        r'navigate\(',
        r'history\.(?:push|replace)State',
        r'redirect\(',
        r'beforeEnter|beforeRouteEnter',
    ]

    API_INTERCEPTOR_PATTERNS = [
        r'interceptors\.(?:request|response)',
        r'axios\.create',
        r'new XMLHttpRequest',
        r'fetch\s*\(',
        r'response\.status',
        r'error\.response',
        r'\.get\(|\.post\(|\.put\(|\.delete\(',
    ]

    ERROR_HANDLER_PATTERNS = [
        r'try\s*\{',
        r'catch\s*\(',
        r'console\.error',
        r'throw new Error',
        r'Promise\.reject',
        r'\.catch\(',
    ]

    def __init__(self, weights: Dict[str, int]):
        """
        Initialize with scoring weights
        weights: dict like {'auth': 10, 'routing': 10, 'api_interceptor': 8, ...}
        """
        self.weights = weights

        # Compile all patterns
        self.patterns = {
            'auth': [re.compile(p, re.IGNORECASE) for p in self.AUTH_PATTERNS],
            'routing': [re.compile(p, re.IGNORECASE) for p in self.ROUTING_PATTERNS],
            'api_interceptor': [re.compile(p, re.IGNORECASE) for p in self.API_INTERCEPTOR_PATTERNS],
            'error_handler': [re.compile(p, re.IGNORECASE) for p in self.ERROR_HANDLER_PATTERNS],
        }

    def find_critical_functions(
        self,
        functions: List[ExtractedFunction],
        call_counts: Dict[str, int] = None
    ) -> List[CriticalFunction]:
        """
        Score and filter functions based on criticality patterns
        Returns list of critical functions sorted by score
        """
        critical = []

        for func in functions:
            score, categories, matched = self._score_function(func, call_counts)

            if score >= 5:  # Threshold for "critical"
                critical.append(CriticalFunction(
                    name=func.name,
                    code=func.code,
                    file_path=str(func.file_path),
                    file_hash=func.file_hash,
                    line_number=func.line_number,
                    categories=categories,
                    criticality_score=score,
                    matched_patterns=matched,
                    call_count=call_counts.get(func.name, 0) if call_counts else 0
                ))

        # Sort by score (highest first)
        critical.sort(key=lambda f: f.criticality_score, reverse=True)

        return critical

    def _score_function(
        self,
        func: ExtractedFunction,
        call_counts: Dict[str, int] = None
    ) -> tuple[int, Set[str], List[str]]:
        """
        Score a function's criticality
        Returns: (score, categories, matched_patterns)
        """
        score = 0
        categories = set()
        matched_patterns = []

        code = func.code

        # Check each pattern category
        for category, patterns in self.patterns.items():
            category_matched = False

            for pattern in patterns:
                if pattern.search(code):
                    if not category_matched:
                        # Only add weight once per category
                        score += self.weights.get(category, 1)
                        categories.add(category)
                        category_matched = True

                    matched_patterns.append(pattern.pattern)

        # Bonus for high call frequency
        if call_counts:
            call_count = call_counts.get(func.name, 0)
            if call_count > 50:
                score += self.weights.get('frequently_called', 3)
                categories.add('frequently_called')
            elif call_count > 20:
                score += 2
                categories.add('frequently_called')

        return score, categories, matched_patterns

    def categorize_by_file(self, functions: List[CriticalFunction]) -> Dict[str, List[CriticalFunction]]:
        """
        Group critical functions by source file
        Returns: {file_path: [functions]}
        """
        by_file = {}

        for func in functions:
            if func.file_path not in by_file:
                by_file[func.file_path] = []
            by_file[func.file_path].append(func)

        return by_file

    def get_category_stats(self, functions: List[CriticalFunction]) -> Dict[str, int]:
        """
        Get counts of functions in each category
        Returns: {'auth': 5, 'routing': 3, ...}
        """
        stats = {}

        for func in functions:
            for category in func.categories:
                stats[category] = stats.get(category, 0) + 1

        return stats
