# Changelog

## [1.1.0] - 2025-01-11

### Added
- **Type Inference Rename** (`type-inference-rename.js`) - FREE tool that infers variable names from usage patterns
  - Analyzes method calls: `z.push()` → `array`, `z.getContext("2d")` → `ctx`
  - Detects property patterns: `{x, y}` → `point`, `{width, height}` → `size`
  - Scope-aware: same letter in different functions gets different names
  - Tested on Photopea 4.8MB: 65,848 variables renamed

- **Class Inference** (`infer-classes.js`) - FREE tool that infers class names from API usage
  - WebGL calls → `WebGLRenderer`
  - DOM manipulation → `DOMUtils`
  - Canvas 2D → `CanvasRenderer`
  - Font/text APIs → `FontManager`
  - Tested on Photopea: 172 classes inferred, 40,349 renames

- **Constant Inlining** (`inline-constants.js`) - FREE tool for constant inlining and purity analysis
  - Finds module-scope constants (assigned once, never mutated)
  - Safely skips values used in `++`/`--` expressions (fixes `0++` syntax error)
  - Inlines literal values throughout code
  - Analyzes function purity: flags functions that reference external state
  - Tested on Photopea: 367 constants inlined, 1,385 pure functions identified

- **Minified Pipeline** (`beautify-minified.js`) - Specialized 4-step pipeline for minified code
  - Optimized for terser/webpack output (not javascript-obfuscator)
  - Steps: Format → Type Inference → Constant Inlining → Format
  - Much faster than full obfuscation pipeline

- **LLM Global Rename** (`llm-rename-globals.js`) - Rename global namespace objects
  - Uses Claude Haiku for ~$0.01 cost
  - `obj6` → `WebGLContext`, `obj15` → `MatrixOps`, etc.

- **Fix Destructure Names** (`fix-destructure-names.js`) - Clean up destructure patterns
  - `{contactId: element2}` → `{contactId}` (shorthand)
  - Scope-aware to avoid cross-function conflicts

### Fixed
- LLM rename now detects `D2`, `D4` as obfuscated (was incorrectly flagged as hex)
- Constant inlining skips mutable properties (prevents `0++` syntax errors)
- Type inference uses function scope (was incorrectly using global scope)

### Changed
- Main pipeline (`beautify.js`) now includes:
  - `type-inference-rename.js` in Phase 5
  - `inline-constants.js` in Phase 4
  - `fix-destructure-names.js` in Phase 5
- Pipeline now has 16 steps (was 14)

## [1.0.0] - 2025-01-10

### Added
- Initial release with full obfuscation pipeline
- String array decoding with rotation and base64
- Control flow deobfuscation (wrapper inlining, opaque predicates)
- Dead code removal
- Property normalization
- Semantic and AST-based renaming
- LLM-powered variable renaming (Haiku/Sonnet)
- Prettier formatting
