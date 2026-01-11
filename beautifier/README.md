# JavaScript Deobfuscator & Beautifier

Universal JavaScript deobfuscation and beautification pipeline. Transforms obfuscated AND minified JavaScript into readable, maintainable code.

## Features

- **String Array Decoding** - Decodes string arrays with rotation and base64 encoding
- **Control Flow Deobfuscation** - Inlines wrapper functions, removes opaque predicates
- **Dead Code Removal** - Removes unreachable code and unused variables
- **Type Inference Renaming** - FREE: Infers variable names from usage patterns (e.g., `z.push()` → `array`)
- **Class Inference** - FREE: Infers class names from API usage (e.g., WebGL calls → `WebGLRenderer`)
- **Constant Inlining** - FREE: Inlines module-scope constants, analyzes function purity
- **LLM Renaming** - Optional: Pattern-based and LLM-powered semantic renaming
- **Code Formatting** - Prettier integration for clean output

## Installation

```bash
cd beautifier
npm install
```

## Usage

### For Obfuscated Code (javascript-obfuscator, etc.)

```bash
# Deobfuscate a file (free, static analysis only)
node lib/beautify.js obfuscated.js output.js

# With verbose output
node lib/beautify.js obfuscated.js output.js --verbose

# With LLM enhancement (~$0.015 with Haiku)
ANTHROPIC_API_KEY=sk-... node lib/beautify.js input.js output.js --quality balanced
```

### For Minified Code (webpack, terser, etc.)

```bash
# Specialized pipeline for minified code (FREE)
node lib/beautify-minified.js minified.js output.js

# Steps: Format → Type Inference → Constant Inlining → Format
```

### Quality Levels

```bash
# Fast (free) - Static + AST analysis, ~90% readable
node lib/beautify.js input.js output.js --quality fast

# Balanced (~$0.015) - Adds LLM rename with Haiku, ~95% readable
ANTHROPIC_API_KEY=sk-... node lib/beautify.js input.js output.js --quality balanced

# Best (~$0.05) - Adds LLM rename with Sonnet, ~98% readable
ANTHROPIC_API_KEY=sk-... node lib/beautify.js input.js output.js --quality best
```

## Pipeline Stages

### Obfuscation Pipeline (`beautify.js`) - 16 steps

#### Phase 1: String Deobfuscation
1. **decode-strings** - Decode string arrays (supports base64, rotation)
2. **simplify-strings** - Simplify string concatenations

#### Phase 2: Dead Code Removal
3. **remove-dead-code** - Remove obfuscator artifacts and dead code

#### Phase 3: Control Flow Deobfuscation
4. **inline-wrappers** - Inline simple wrapper functions `(a,b) => a + b`
5. **remove-opaque** - Remove opaque predicates and dead branches

#### Phase 4: Normalization
6. **normalize-properties** - Convert bracket to dot notation
7. **normalize-literals** - Convert `!![]` to `true`, hex to decimal
8. **inline-constants** - Inline module-scope constants, analyze purity

#### Phase 5: Renaming
9. **semantic-rename** - Pattern-based variable renaming
10. **rename-functions** - Infer function names from body analysis
11. **type-inference-rename** - Infer names from usage (FREE)
12. **remove-dead-refs** - Remove unused variable assignments
13. **ast-rename** - AST-based scope-aware renaming
14. **fix-destructure-names** - Clean up `{id: element2}` → `{id}`

#### Phase 6: LLM Enhancement (optional)
15. **llm-rename** - LLM-powered semantic variable renaming

#### Phase 7: Formatting
16. **prettier** - Final code formatting

### Minified Pipeline (`beautify-minified.js`) - 4 steps

Optimized for minified (not obfuscated) code:

1. **prettier** - Initial formatting
2. **type-inference-rename** - Infer names from usage patterns (FREE)
3. **inline-constants** - Inline constants, analyze purity (FREE)
4. **prettier** - Final formatting

## FREE Tools (No API costs)

### Type Inference Rename
Analyzes how variables are used to infer meaningful names:
- `z.push(x)` → `z` becomes `array`
- `ctx.fillRect()` → `ctx` becomes `canvasContext`
- `{x, y, width, height}` → becomes `rect`

```bash
node lib/type-inference-rename.js input.js output.js
```

### Class Inference
Analyzes what APIs a class uses to infer its purpose:
- WebGL calls → `WebGLRenderer`
- DOM manipulation → `DOMUtils`
- Canvas 2D → `CanvasRenderer`

```bash
node lib/infer-classes.js input.js output.js
```

### Constant Inlining & Purity Analysis
- Finds module-scope constants (assigned once, never mutated)
- Inlines literal values throughout code
- Analyzes function purity (flags functions that reference external state)

```bash
node lib/inline-constants.js input.js output.js --verbose
```

## LLM Tools (Requires API key)

### LLM Variable Rename
Uses Claude to infer semantic names for cryptic variables:

```bash
ANTHROPIC_API_KEY=sk-... node lib/llm-rename.js input.js output.js --model haiku
```

### LLM Global Rename
Renames global namespace objects (e.g., `obj6` → `WebGLContext`):

```bash
# Uses Claude CLI
cat prompt.txt | claude --model haiku --print
```

## Supported Obfuscation Techniques

- [x] String array with rotation
- [x] String array with base64 encoding
- [x] Control flow flattening (wrapper functions)
- [x] Opaque predicates
- [x] Dead code injection
- [x] Bracket notation for properties
- [x] Boolean obfuscation (`!![]`, `![]`)
- [x] Hex literals
- [x] Minified single-letter variables

## Example Results

### GHL (Obfuscated) - 52KB
- String array decoded (rotation 447, 106 aliases)
- 21.8% dead code removed
- Variables renamed semantically

### Photopea (Minified) - 4.8MB
- 65,848 local variables renamed via type inference
- 172 classes inferred from API usage
- 367 constants inlined (1,471 references)
- 1,385 pure functions identified (20.9%)
- Global namespaces renamed: `obj6` → `WebGLContext`, `obj15` → `MatrixOps`

## Individual Tools

Each pipeline stage can be run independently:

```bash
# Decode strings only
node lib/decode-strings.js input.js output.js

# Type inference rename only
node lib/type-inference-rename.js input.js output.js

# Inline constants only
node lib/inline-constants.js input.js output.js --verbose

# Infer class names
node lib/infer-classes.js input.js output.js
```

## License

MIT
