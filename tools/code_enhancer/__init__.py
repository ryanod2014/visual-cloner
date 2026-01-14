"""
V8 Code Enhancement Pipeline
100% programmatic code beautification and documentation

Usage:
    from tools.code_enhancer import V8Pipeline, V8Config

    # Default config
    pipeline = V8Pipeline()
    result = pipeline.enhance('/path/to/minified.js')

    # Custom config
    config = V8Config(
        skip_deobfuscation=False,
        skip_naming=False,
        skip_documentation=False,
    )
    pipeline = V8Pipeline(config)
    result = pipeline.enhance('/path/to/code/')

CLI Usage:
    python -m tools.code_enhancer /path/to/code.js
    python -m tools.code_enhancer /path/to/directory/ --output ./enhanced/
"""

from .orchestrator import V8Pipeline, V8Config, V8Result
from .detector import CodeDetector, DetectionResult
from .deobfuscator import Deobfuscator, DeobfuscationResult
from .namer import HeuristicNamer, NamingResult
from .documenter import TemplateDocumenter, DocumentationResult
from .validator import CodeValidator, ValidationResult
from .tool_manager import ToolManager, ToolResult

# Backwards compatibility
CodeEnhancementPipeline = V8Pipeline
EnhancementConfig = V8Config
EnhancementResult = V8Result

__version__ = '8.0.0'
__all__ = [
    'V8Pipeline',
    'V8Config',
    'V8Result',
    'CodeDetector',
    'DetectionResult',
    'Deobfuscator',
    'DeobfuscationResult',
    'HeuristicNamer',
    'NamingResult',
    'TemplateDocumenter',
    'DocumentationResult',
    'CodeValidator',
    'ValidationResult',
    'ToolManager',
    'ToolResult',
    # Backwards compat
    'CodeEnhancementPipeline',
    'EnhancementConfig',
    'EnhancementResult',
]
