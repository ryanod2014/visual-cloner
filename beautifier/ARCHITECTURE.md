# World-Class Architecture

## Current State (Monolithic)
```
beautifier/
├── lib/
│   ├── beautify.js          # Everything in one pipeline
│   ├── decode-strings.js    # Standalone tools
│   └── ...
```

## Target State (Modular Monorepo)

```
js-deobfuscator/
├── packages/
│   ├── core/                     # Orchestration engine
│   │   ├── src/
│   │   │   ├── pipeline.ts       # Pipeline runner
│   │   │   ├── config.ts         # Configuration system
│   │   │   └── types.ts          # Shared types
│   │   └── package.json
│   │
│   ├── transforms/               # Transform plugins (like Babel plugins)
│   │   ├── decode-strings/
│   │   ├── inline-wrappers/
│   │   ├── remove-opaque/
│   │   ├── normalize-literals/
│   │   └── ...
│   │
│   ├── utils/                    # Shared utilities
│   │   ├── src/
│   │   │   ├── ast.ts            # AST helpers
│   │   │   ├── scope.ts          # Scope analysis
│   │   │   ├── patterns.ts       # Pattern matching
│   │   │   └── strings.ts        # String manipulation
│   │   └── package.json
│   │
│   ├── presets/                  # Configuration presets
│   │   ├── javascript-obfuscator/
│   │   ├── uglify/
│   │   ├── webpack/
│   │   └── custom/
│   │
│   ├── cli/                      # Command line interface
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── deobfuscate.ts
│   │   │   │   ├── analyze.ts
│   │   │   │   └── inspect.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── playground/               # Web-based playground
│       ├── src/
│       └── package.json
│
├── config/                       # Shared config
│   ├── tokens/                   # Design tokens / constants
│   │   ├── patterns.json         # Known obfuscation patterns
│   │   ├── operators.json        # Operator mappings
│   │   └── thresholds.json       # Heuristic thresholds
│   └── presets/
│       ├── fast.json
│       ├── balanced.json
│       └── thorough.json
│
├── docs/                         # Documentation
│   ├── api/
│   ├── guides/
│   └── examples/
│
├── tests/
│   ├── fixtures/                 # Test input files
│   │   ├── javascript-obfuscator/
│   │   ├── uglify/
│   │   └── real-world/
│   ├── snapshots/                # Expected outputs
│   └── benchmarks/               # Performance tests
│
├── turbo.json                    # Turborepo config
├── pnpm-workspace.yaml           # Workspace config
└── package.json                  # Root package
```

## Key Concepts

### 1. Transform Plugins (Reusable Components)

Each transform is a standalone plugin with a standard interface:

```typescript
// packages/transforms/inline-wrappers/src/index.ts
import { Transform, AST, Context } from '@deobfuscator/core';

export interface InlineWrappersOptions {
  maxParams?: number;
  inlineNested?: boolean;
}

export const inlineWrappers: Transform<InlineWrappersOptions> = {
  name: 'inline-wrappers',

  // Declare what this transform needs
  dependencies: ['decode-strings'],

  // Declare what this transform produces
  provides: ['inlined-wrappers'],

  // The actual transformation
  visitor: {
    CallExpression(path, state, options) {
      // Transform logic
    }
  },

  // Post-processing
  post(ast, state, options) {
    // Cleanup
  }
};
```

### 2. Configuration Tokens

```typescript
// config/tokens/patterns.json
{
  "stringArray": {
    "rotationLoop": {
      "pattern": "while\\s*\\(\\s*!!\\s*\\[\\s*\\]\\s*\\)",
      "description": "String array rotation loop"
    },
    "decoderFunction": {
      "pattern": "function\\s+(\\w+)\\s*\\(\\s*(\\w+)\\s*,\\s*\\w*\\s*\\)\\s*\\{\\s*\\2\\s*=\\s*\\2\\s*-",
      "description": "String array decoder function"
    }
  },
  "controlFlow": {
    "wrapperBinary": {
      "pattern": "return\\s+\\w+\\s*[+\\-*/%<>=!&|]+\\s*\\w+",
      "description": "Binary operation wrapper"
    },
    "wrapperCall": {
      "pattern": "return\\s+\\w+\\s*\\(",
      "description": "Function call wrapper"
    }
  },
  "base64Alphabet": {
    "standard": "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
    "jsObfuscator": "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/="
  }
}
```

### 3. Presets (Like Babel Presets)

```typescript
// packages/presets/javascript-obfuscator/src/index.ts
import { Preset } from '@deobfuscator/core';
import { decodeStrings } from '@deobfuscator/transform-decode-strings';
import { inlineWrappers } from '@deobfuscator/transform-inline-wrappers';
import { removeOpaque } from '@deobfuscator/transform-remove-opaque';
// ...

export const preset: Preset = {
  name: 'javascript-obfuscator',
  description: 'Handles code obfuscated with javascript-obfuscator',

  transforms: [
    [decodeStrings, { encoding: 'auto' }],
    [inlineWrappers, { inlineNested: true }],
    [removeOpaque, { aggressive: true }],
    // ...
  ],

  // Auto-detection
  detect(code: string): boolean {
    return code.includes('while(!![])')
      || code.includes('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');
  }
};
```

### 4. Shared Utilities

```typescript
// packages/utils/src/ast.ts
export function isSimpleWrapper(func: FunctionExpression): WrapperInfo | null {
  // Reusable logic to detect wrapper functions
}

export function evaluateConstant(node: Expression): EvalResult {
  // Reusable constant evaluation
}

export function findBindingReferences(binding: Binding): Reference[] {
  // Scope-aware reference finding
}
```

### 5. Pipeline Configuration

```typescript
// Usage in code
import { createPipeline } from '@deobfuscator/core';
import jsObfuscatorPreset from '@deobfuscator/preset-javascript-obfuscator';

const pipeline = createPipeline({
  presets: [jsObfuscatorPreset],
  transforms: [
    // Additional custom transforms
  ],
  options: {
    llm: {
      enabled: true,
      model: 'haiku',
      apiKey: process.env.ANTHROPIC_API_KEY,
    }
  }
});

const result = await pipeline.run(obfuscatedCode);
```

### 6. CLI Usage

```bash
# Auto-detect and deobfuscate
deobfuscate input.js -o output.js

# Use specific preset
deobfuscate input.js -o output.js --preset javascript-obfuscator

# Custom pipeline
deobfuscate input.js -o output.js \
  --transform decode-strings \
  --transform inline-wrappers \
  --transform remove-opaque

# Analyze without transforming
deobfuscate analyze input.js

# Interactive inspection
deobfuscate inspect input.js
```

## Benefits

1. **Reusability** - Each transform works independently
2. **Testability** - Unit test each transform in isolation
3. **Extensibility** - Add new transforms without touching core
4. **Configurability** - Mix and match transforms for different obfuscators
5. **Maintainability** - Clear ownership and separation of concerns
6. **Shareability** - Publish transforms as separate npm packages
