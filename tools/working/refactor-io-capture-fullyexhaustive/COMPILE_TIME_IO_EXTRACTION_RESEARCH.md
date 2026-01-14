# Compile-Time I/O Extraction Research

## Executive Summary

**Can we extract I/O specs at build time?** YES - with significant caveats.

Modern build tools provide multiple hook points for static analysis. The TypeScript compiler API offers the most complete type information. However, JavaScript's dynamic nature limits what can be statically determined. A hybrid approach combining compile-time extraction with runtime validation is the most practical path forward.

---

## 1. Webpack Plugins for Code Analysis

### What Webpack Can Extract

Webpack performs sophisticated static analysis during bundling:

| Capability | Extractable? | Notes |
|------------|--------------|-------|
| Import/export statements | YES | ES modules only, not CommonJS |
| Module dependencies | YES | Full dependency graph |
| Used vs unused exports | YES | Via tree-shaking analysis |
| Code paths | PARTIAL | Limited to static imports |
| Type information | NO | Webpack doesn't see types |

### Key Webpack Analysis Plugins

1. **[webpack-deep-scope-analysis-plugin](https://github.com/vincentdchan/webpack-deep-scope-analysis-plugin)**
   - Analyzes scope relationships between exports and imports
   - Finds all scopes belonging to module scope
   - Only works with ES `import`/`export` syntax (not CommonJS)

2. **[webpack-ast-traversal-plugin](https://github.com/Vidazoo/webpack-ast-traversal-plugin)**
   - Traverses AST to find specific call expressions
   - Can locate patterns like `fetch()`, `axios()`, etc.

3. **[webpack-bundle-analyzer](https://www.npmjs.com/package/webpack-bundle-analyzer)**
   - Interactive treemap of bundle contents
   - Shows real sizes of bundled modules

### Webpack Plugin Hook Points

```javascript
// Example: Custom webpack plugin for I/O extraction
class IOExtractionPlugin {
  apply(compiler) {
    // Access AST after parsing
    compiler.hooks.compilation.tap('IOExtraction', (compilation) => {
      compilation.hooks.finishModules.tap('IOExtraction', (modules) => {
        for (const module of modules) {
          // Access module.buildInfo, module.dependencies
          // Extract import/export information
        }
      });
    });
  }
}
```

### Limitations

- Cannot analyze dynamic `require()` or dynamic `import()`
- No type information available (types are erased before webpack sees code)
- Side effects detection requires manual `/*#__PURE__*/` annotations

---

## 2. Import/Export Interception and Data Flow Tracing

### What's Possible

| Approach | Capability | Limitation |
|----------|------------|------------|
| AST traversal | Find all static imports/exports | Dynamic imports invisible |
| Babel plugin | Transform and track call sites | Can't infer types |
| Rollup moduleInfo | Full dependency graph | Build-time only |
| Data flow analysis | Track taint from sources to sinks | Computationally expensive |

### Babel Plugin for Call Tracking

**[babel-plugin-track-usage](https://github.com/quinscape/babel-plugin-track-usage)**
- Recognizes requires of configured modules
- Collects statically analyzable function calls
- Useful for tracking transitive call dependencies

```javascript
// Example: Track all fetch() calls
module.exports = function(babel) {
  return {
    visitor: {
      CallExpression(path) {
        if (path.node.callee.name === 'fetch') {
          // Extract URL argument if static string
          const urlArg = path.node.arguments[0];
          if (urlArg.type === 'StringLiteral') {
            collectAPIEndpoint(urlArg.value);
          }
        }
      }
    }
  };
};
```

### Rollup's Module Graph

Rollup builds a comprehensive module graph containing:
- Entry files and their dependencies
- Static dependencies (`Module.sourcesWithAssertions`)
- Dynamic dependencies (`Module.dynamicImports`)
- Exported expressions for tree-shaking

```javascript
// Rollup plugin to extract module info
export default function ioExtractor() {
  return {
    name: 'io-extractor',
    moduleParsed(moduleInfo) {
      console.log('Module:', moduleInfo.id);
      console.log('Imports:', moduleInfo.importedIds);
      console.log('Exports:', moduleInfo.exports);
    }
  };
}
```

### Data Flow Analysis Tools

**[CodeQL](https://codeql.github.com/docs/codeql-language-guides/analyzing-data-flow-in-javascript-and-typescript/)** provides:
- Local data flow (within a function)
- Global data flow (across function boundaries)
- Taint tracking (from sources to sinks)

```ql
// CodeQL query example: Track data from user input to API calls
import javascript

from DataFlow::PathNode source, DataFlow::PathNode sink
where
  source.getNode() instanceof RemoteFlowSource and
  sink.getNode().(DataFlow::InvokeNode).getCalleeName() = "fetch"
select source, sink, "User input flows to fetch call"
```

---

## 3. TypeScript Compiler API for I/O Type Extraction

### THIS IS THE MOST POWERFUL APPROACH

The TypeScript Compiler API provides complete type information that survives compilation:

```typescript
import * as ts from "typescript";

// Create program and get type checker
const program = ts.createProgram([filename], {});
const typeChecker = program.getTypeChecker();
const sourceFile = program.getSourceFile(filename);

// Extract function signatures with full type info
function extractFunctionIO(node: ts.FunctionDeclaration) {
  const signature = typeChecker.getSignatureFromDeclaration(node);

  // Get parameter types
  const params = signature.parameters.map(param => {
    const paramType = typeChecker.getTypeOfSymbolAtLocation(param, node);
    return {
      name: param.name,
      type: typeChecker.typeToString(paramType),
      // Get full type structure
      properties: paramType.getProperties().map(p => ({
        name: p.name,
        type: typeChecker.typeToString(typeChecker.getTypeOfSymbolAtLocation(p, node))
      }))
    };
  });

  // Get return type
  const returnType = signature.getReturnType();

  return { params, returnType: typeChecker.typeToString(returnType) };
}
```

### What TypeScript Compiler API Can Extract

| Information | Extractable? | Method |
|-------------|--------------|--------|
| Function parameters | YES | `getSignatureFromDeclaration()` |
| Return types | YES | `signature.getReturnType()` |
| Interface definitions | YES | `typeChecker.getTypeAtLocation()` |
| Generic type parameters | YES | `type.getTypeArguments()` |
| Inherited properties | YES | `type.getApparentProperties()` |
| Union/intersection types | YES | `type.getUnionTypes()` |
| JSDoc annotations | YES | Built-in JSDoc parser |
| Inferred types | YES | Works on JS files too |

### ts-morph: Simplified TypeScript Analysis

**[ts-morph](https://github.com/dsherret/ts-morph)** wraps the Compiler API with a friendlier interface:

```typescript
import { Project } from "ts-morph";

const project = new Project();
const sourceFile = project.addSourceFileAtPath("api.ts");

// Extract all exported functions with their I/O signatures
const exports = sourceFile.getExportedDeclarations();

for (const [name, declarations] of exports) {
  for (const decl of declarations) {
    if (decl.isKind(SyntaxKind.FunctionDeclaration)) {
      const params = decl.getParameters().map(p => ({
        name: p.getName(),
        type: p.getType().getText(),
        properties: p.getType().getProperties().map(prop => ({
          name: prop.getName(),
          type: prop.getTypeAtLocation(decl).getText()
        }))
      }));

      const returnType = decl.getReturnType().getText();

      console.log(`${name}(${params}) => ${returnType}`);
    }
  }
}
```

### React Component Props Extraction

**[react-scanner](https://github.com/moroshko/react-scanner)** statically analyzes React components:

```typescript
// Extracts component usage and props from JSX
// Output: JSON report of all components and their props
```

Combined with TypeScript:

```typescript
import { ComponentProps } from "react";

// Extract props from any component at compile time
type ButtonProps = ComponentProps<typeof Button>;
```

---

## 4. Source Maps for I/O Reconstruction

### What Source Maps Contain

| Field | Content | Useful for I/O? |
|-------|---------|-----------------|
| `sources` | Original file paths | YES - file identification |
| `sourcesContent` | Original source code | YES - full reconstruction |
| `names` | Variable/method names | PARTIAL - naming only |
| `mappings` | Position mappings | NO - just coordinates |

### Source Map Structure

```json
{
  "version": 3,
  "file": "bundle.js",
  "sources": ["src/api.ts", "src/utils.ts"],
  "sourcesContent": ["// Original TypeScript code..."],
  "names": ["fetchUser", "UserData", "apiCall"],
  "mappings": "AAAA,SAAS..."
}
```

### Reconstruction Capability

Source maps **can** reconstruct original code if `sourcesContent` is included:

```javascript
// Using source-map library
import { SourceMapConsumer } from 'source-map';

const consumer = await new SourceMapConsumer(sourceMap);
const originalSource = consumer.sourceContentFor('src/api.ts');
// Now you have the original TypeScript to analyze
```

### Verdict: Source Maps Are NOT Ideal for I/O Extraction

**Reasons:**
1. They're designed for debugging, not analysis
2. They contain no type information
3. Position mappings don't preserve semantic structure
4. Better to analyze source directly than reconstruct from maps

---

## 5. Tree-Shaking Algorithms and Code Path Computation

### How Tree-Shaking Works

Webpack's tree-shaking involves three optimization types:

1. **usedExports Optimization**
   - Tracks which exports are actually used
   - Marks unused exports for removal
   - Uses scope analysis to trace dependencies

2. **sideEffects Optimization**
   - Removes entire modules if exports unused
   - Requires `"sideEffects": false` in package.json
   - Or `/*#__PURE__*/` annotations

3. **Dead Code Elimination (DCE)**
   - Terser removes unreachable code
   - Works after usedExports marking

### What Tree-Shaking Already Computes

| Analysis | Available? | Can We Leverage? |
|----------|------------|------------------|
| Which exports are used | YES | YES - API surface |
| Which modules are imported | YES | YES - dependencies |
| Complete call graph | NO | Need additional analysis |
| Data flow between functions | NO | Need CodeQL or similar |
| Type information | NO | Need TypeScript API |

### Deep Scope Analysis

**[webpack-deep-scope-analysis-plugin](https://medium.com/webpack/better-tree-shaking-with-deep-scope-analysis-a0b788c0ce77)** computes:

```
exports -> scopes -> references -> imports
```

This is close to what we need for I/O extraction, but lacks type information.

### Key Insight

Tree-shaking proves that **build tools already trace code paths**. We can piggyback on this analysis but need to augment it with type information from TypeScript.

---

## 6. Building an I/O Manifest

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      BUILD PIPELINE                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │  TypeScript  │───▶│   Bundler    │───▶│   Output     │   │
│  │   Compiler   │    │  (Vite/WP)   │    │   Bundle     │   │
│  └──────┬───────┘    └──────┬───────┘    └──────────────┘   │
│         │                   │                               │
│         │ Types             │ Module Graph                  │
│         ▼                   ▼                               │
│  ┌──────────────────────────────────────┐                   │
│  │         I/O EXTRACTION PLUGIN         │                   │
│  ├──────────────────────────────────────┤                   │
│  │ • Function signatures (TS API)        │                   │
│  │ • API endpoints (AST traversal)       │                   │
│  │ • Props types (React scanner)         │                   │
│  │ • Data flow (CodeQL integration)      │                   │
│  └──────────────┬───────────────────────┘                   │
│                 │                                            │
│                 ▼                                            │
│  ┌──────────────────────────────────────┐                   │
│  │           io-manifest.json            │                   │
│  └──────────────────────────────────────┘                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### I/O Manifest Schema

```typescript
interface IOManifest {
  version: string;
  timestamp: string;

  // Component Props (Input)
  components: {
    [componentName: string]: {
      file: string;
      props: PropDefinition[];
      children?: string; // children type
    };
  };

  // API Calls (Output)
  apiCalls: {
    [identifier: string]: {
      file: string;
      line: number;
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      endpoint: string | 'DYNAMIC';
      requestType?: string;
      responseType?: string;
    };
  };

  // Exported Functions (Interface)
  exports: {
    [modulePath: string]: {
      functions: FunctionSignature[];
      types: TypeDefinition[];
      constants: ConstantDefinition[];
    };
  };

  // Event Handlers (Interaction Points)
  eventHandlers: {
    [handlerName: string]: {
      file: string;
      eventType: string;
      parameterType: string;
    };
  };

  // Data Flow (Connections)
  dataFlow: {
    sources: DataSource[];
    sinks: DataSink[];
    flows: DataFlowPath[];
  };
}
```

### Implementation: Vite Plugin Example

```typescript
// vite-plugin-io-manifest.ts
import { Plugin } from 'vite';
import { Project } from 'ts-morph';
import * as ts from 'typescript';

export function ioManifestPlugin(): Plugin {
  const manifest: IOManifest = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    components: {},
    apiCalls: {},
    exports: {},
    eventHandlers: {},
    dataFlow: { sources: [], sinks: [], flows: [] }
  };

  const project = new Project({
    tsConfigFilePath: './tsconfig.json'
  });

  return {
    name: 'io-manifest',

    // Hook into module transformation
    transform(code, id) {
      if (!id.endsWith('.ts') && !id.endsWith('.tsx')) return;

      const sourceFile = project.addSourceFileAtPath(id);

      // Extract function signatures
      sourceFile.getFunctions().forEach(fn => {
        const signature = extractFunctionSignature(fn);
        addToManifest(manifest, id, signature);
      });

      // Extract React components
      sourceFile.getVariableDeclarations().forEach(decl => {
        if (isReactComponent(decl)) {
          const props = extractComponentProps(decl);
          manifest.components[decl.getName()] = { file: id, props };
        }
      });

      // Extract API calls (fetch, axios, etc.)
      sourceFile.getDescendantsOfKind(ts.SyntaxKind.CallExpression)
        .filter(call => isAPICall(call))
        .forEach(call => {
          const apiInfo = extractAPICallInfo(call);
          manifest.apiCalls[generateId()] = apiInfo;
        });

      return null; // Don't transform, just analyze
    },

    // Write manifest at end of build
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'io-manifest.json',
        source: JSON.stringify(manifest, null, 2)
      });
    }
  };
}
```

### Integration with webpack-manifest-plugin

```javascript
// webpack.config.js
const ManifestPlugin = require('webpack-manifest-plugin');

module.exports = {
  plugins: [
    new ManifestPlugin({
      fileName: 'io-manifest.json',
      generate: (seed, files, entries) => {
        // Custom manifest generation with I/O information
        return {
          ...seed,
          files: files.map(f => ({
            name: f.name,
            path: f.path,
            // Add extracted I/O info
            io: extractedIOInfo[f.name]
          })),
          entries
        };
      },
      seed: {
        version: '1.0',
        extractedAt: new Date().toISOString()
      }
    })
  ]
};
```

---

## 7. Practical Extraction Strategies

### Strategy 1: TypeScript-First (Recommended)

```typescript
// Best for: TypeScript projects with good type coverage

import { Project, SyntaxKind } from 'ts-morph';

function extractProjectIO(tsConfigPath: string): IOManifest {
  const project = new Project({ tsConfigFilePath: tsConfigPath });
  const manifest: IOManifest = createEmptyManifest();

  for (const sourceFile of project.getSourceFiles()) {
    // Skip node_modules
    if (sourceFile.isInNodeModules()) continue;

    // Extract all exported declarations
    for (const [name, decls] of sourceFile.getExportedDeclarations()) {
      for (const decl of decls) {
        if (decl.isKind(SyntaxKind.FunctionDeclaration)) {
          manifest.exports[sourceFile.getFilePath()] ??= { functions: [] };
          manifest.exports[sourceFile.getFilePath()].functions.push(
            extractFunctionSignature(decl)
          );
        }

        if (decl.isKind(SyntaxKind.InterfaceDeclaration)) {
          // Extract interface as potential I/O type
        }
      }
    }
  }

  return manifest;
}
```

### Strategy 2: AST Pattern Matching

```typescript
// Best for: Finding specific patterns like API calls

import * as parser from '@babel/parser';
import traverse from '@babel/traverse';

function extractAPIEndpoints(code: string): APICall[] {
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx']
  });

  const endpoints: APICall[] = [];

  traverse(ast, {
    CallExpression(path) {
      // Match fetch() calls
      if (path.node.callee.name === 'fetch') {
        const urlArg = path.node.arguments[0];
        endpoints.push({
          method: 'GET', // Would need to analyze options for actual method
          endpoint: urlArg.type === 'StringLiteral' ? urlArg.value : 'DYNAMIC',
          line: path.node.loc?.start.line
        });
      }

      // Match axios calls
      if (path.node.callee.object?.name === 'axios') {
        const method = path.node.callee.property.name.toUpperCase();
        const urlArg = path.node.arguments[0];
        endpoints.push({
          method,
          endpoint: urlArg.type === 'StringLiteral' ? urlArg.value : 'DYNAMIC',
          line: path.node.loc?.start.line
        });
      }
    }
  });

  return endpoints;
}
```

### Strategy 3: Bundler Integration

```typescript
// Best for: Projects already using Vite/Rollup

// rollup.config.js or vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [{
    name: 'io-extraction',

    buildStart() {
      this.ioManifest = { components: {}, apiCalls: {}, exports: {} };
    },

    moduleParsed(moduleInfo) {
      // moduleInfo contains:
      // - id: module path
      // - code: source code
      // - ast: parsed AST (if available)
      // - importedIds: imported modules
      // - exports: exported names

      this.ioManifest.exports[moduleInfo.id] = {
        imports: moduleInfo.importedIds,
        exports: moduleInfo.exports
      };
    },

    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'io-manifest.json',
        source: JSON.stringify(this.ioManifest, null, 2)
      });
    }
  }]
});
```

---

## 8. Limitations and Challenges

### What CANNOT Be Extracted at Compile Time

| Pattern | Why It's Hard | Workaround |
|---------|---------------|------------|
| Dynamic imports | Path computed at runtime | Mark as DYNAMIC |
| Computed property access | `obj[variable]` | Runtime instrumentation |
| Dynamic API endpoints | `fetch(\`/api/${id}\`)` | Extract template, mark dynamic parts |
| Runtime type narrowing | `if (typeof x === 'string')` | Conservative over-approximation |
| Reflection/eval | Arbitrary code execution | Cannot handle |
| External data | Database schemas, API responses | Fetch at build time or mark unknown |

### JavaScript's Dynamic Nature

```javascript
// These patterns defeat static analysis:

// 1. Dynamic imports
const module = await import(`./${userChoice}.js`);

// 2. Computed methods
const method = condition ? 'get' : 'post';
axios[method](url);

// 3. Metaprogramming
const handler = new Proxy(target, {
  get(obj, prop) { /* anything */ }
});

// 4. eval and Function constructor
eval(`fetch('${userInput}')`);
```

### Mitigation Strategies

1. **Convention over configuration**: Require standard patterns for API calls
2. **TypeScript strict mode**: Catch more issues at compile time
3. **Annotations**: Use JSDoc or decorators to provide hints
4. **Runtime validation**: Generate runtime checks from compile-time specs

---

## 9. Recommended Implementation Path

### Phase 1: TypeScript Analysis (Week 1-2)

```typescript
// Start with ts-morph for type extraction
const project = new Project({ tsConfigFilePath: './tsconfig.json' });

// Extract all exported function signatures
// Extract all interface/type definitions
// Extract React component props
```

### Phase 2: AST Pattern Matching (Week 2-3)

```typescript
// Add Babel-based API call extraction
// Find fetch(), axios, GraphQL queries
// Extract static endpoint strings
// Mark dynamic endpoints
```

### Phase 3: Build Integration (Week 3-4)

```typescript
// Create Vite/Rollup plugin
// Generate io-manifest.json on build
// Include in build output
```

### Phase 4: Runtime Validation (Week 4+)

```typescript
// Generate runtime validators from manifest
// Add instrumentation for dynamic patterns
// Compare runtime behavior against manifest
```

---

## 10. Tools Summary

| Tool | Purpose | Best For |
|------|---------|----------|
| [ts-morph](https://github.com/dsherret/ts-morph) | TypeScript analysis | Function signatures, types |
| [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) | Low-level type info | Complex type extraction |
| [@babel/parser](https://babeljs.io/docs/babel-parser) | AST parsing | Pattern matching |
| [react-scanner](https://github.com/moroshko/react-scanner) | React analysis | Component props |
| [CodeQL](https://codeql.github.com/) | Data flow analysis | Security, taint tracking |
| [webpack-manifest-plugin](https://www.npmjs.com/package/webpack-manifest-plugin) | Manifest generation | Build artifacts |
| [rollup-plugin-visualizer](https://www.npmjs.com/package/rollup-plugin-visualizer) | Bundle analysis | Dependency understanding |

---

## Conclusion

**Compile-time I/O extraction is feasible and valuable**, with these key insights:

1. **TypeScript Compiler API is the most powerful tool** - it provides complete type information including inferred types, generics, and JSDoc.

2. **Tree-shaking already computes much of what we need** - module graphs, used exports, and dependency relationships are already tracked.

3. **Static analysis has fundamental limits** - dynamic patterns cannot be fully analyzed; a hybrid approach is necessary.

4. **The manifest approach is practical** - generating an `io-manifest.json` during build provides a concrete artifact for runtime use.

5. **Start with TypeScript, add AST patterns, integrate with bundler** - this phased approach provides incremental value.

The goal of extracting I/O specs at compile time rather than runtime is achievable for the majority of well-typed TypeScript codebases, with graceful degradation for dynamic patterns.

---

## Sources

- [webpack-deep-scope-analysis-plugin](https://github.com/vincentdchan/webpack-deep-scope-analysis-plugin)
- [webpack-ast-traversal-plugin](https://github.com/Vidazoo/webpack-ast-traversal-plugin)
- [Using the TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
- [ts-morph GitHub](https://github.com/dsherret/ts-morph)
- [ts-morph Types Documentation](https://ts-morph.com/details/types)
- [Tree Shaking - webpack](https://webpack.js.org/guides/tree-shaking/)
- [Better tree shaking with deep scope analysis](https://medium.com/webpack/better-tree-shaking-with-deep-scope-analysis-a0b788c0ce77)
- [Deep dive into Rspack & webpack tree shaking](https://github.com/orgs/web-infra-dev/discussions/17)
- [Source Map Internals](https://www.polarsignals.com/blog/posts/2025/11/04/javascript-source-maps-internals)
- [Introduction to JavaScript Source Maps](https://developer.chrome.com/blog/sourcemaps)
- [Vite Plugin API](https://vite.dev/guide/api-plugin)
- [Rollup Plugin Development](https://rollupjs.org/plugin-development/)
- [webpack-manifest-plugin](https://www.npmjs.com/package/webpack-manifest-plugin)
- [react-scanner](https://github.com/moroshko/react-scanner)
- [CodeQL for JavaScript Data Flow](https://codeql.github.com/docs/codeql-language-guides/analyzing-data-flow-in-javascript-and-typescript/)
- [babel-plugin-track-usage](https://github.com/quinscape/babel-plugin-track-usage)
- [esbuild Plugin API](https://esbuild.github.io/plugins/)
- [@liip/esbuild-plugin-ast](https://www.npmjs.com/package/@liip/esbuild-plugin-ast)
