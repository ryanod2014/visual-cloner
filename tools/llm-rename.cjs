#!/usr/bin/env node
/**
 * LLM-Powered Variable Renamer
 *
 * Uses Claude API to intelligently rename obfuscated variables that
 * couldn't be resolved through static analysis alone.
 *
 * Usage:
 *   node llm-rename.cjs input.js output.js [--model sonnet|haiku|opus] [--dry-run]
 *
 * Options:
 *   --model     Model to use: sonnet (default), haiku, opus
 *   --dry-run   Show what would be renamed without making changes
 */

const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

// ============================================================
// CLI ARGUMENT PARSING
// ============================================================

const args = process.argv.slice(2);
const flags = {
  dryRun: false,
  model: 'sonnet'
};

// Extract flags
const positionalArgs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dry-run') {
    flags.dryRun = true;
  } else if (args[i] === '--model' && args[i + 1]) {
    flags.model = args[i + 1].toLowerCase();
    i++;
  } else if (!args[i].startsWith('--')) {
    positionalArgs.push(args[i]);
  }
}

const inputFile = positionalArgs[0];
const outputFile = positionalArgs[1];

if (!inputFile) {
  console.log('Usage: node llm-rename.cjs <input.js> [output.js] [--model sonnet|haiku|opus] [--dry-run]');
  console.log('');
  console.log('Options:');
  console.log('  --model     Model to use: sonnet (default), haiku, opus');
  console.log('  --dry-run   Show what would be renamed without making changes');
  process.exit(1);
}

// Map friendly model names to actual model IDs
const MODEL_MAP = {
  'sonnet': 'claude-sonnet-4-20250514',
  'haiku': 'claude-3-5-haiku-20241022',
  'opus': 'claude-3-opus-20240229'
};

const modelId = MODEL_MAP[flags.model] || MODEL_MAP['sonnet'];

// Pricing per 1K tokens (approximate)
const PRICING = {
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'claude-haiku-4-20250514': { input: 0.00025, output: 0.00125 },
  'claude-opus-4-20250514': { input: 0.015, output: 0.075 }
};

// ============================================================
// OBFUSCATED IDENTIFIER DETECTION
// ============================================================

// Names that are already meaningful - don't rename these
const MEANINGFUL_NAMES = new Set([
  // Reserved words
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'return', 'function', 'const', 'let', 'var', 'class', 'new', 'this',
  'true', 'false', 'null', 'undefined', 'typeof', 'instanceof', 'in',
  'try', 'catch', 'finally', 'throw', 'async', 'await', 'yield',
  'import', 'export', 'default', 'from', 'as',
  // Built-in objects
  'window', 'document', 'console', 'Math', 'JSON', 'Object', 'Array',
  'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Error', 'Promise',
  'Map', 'Set', 'Symbol', 'Proxy', 'Reflect', 'Intl',
  // Common globals
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'fetch', 'XMLHttpRequest', 'localStorage', 'sessionStorage',
  'alert', 'confirm', 'prompt', 'location', 'history', 'navigator',
  // Common short names that are acceptable
  'e', 'i', 'j', 'k', 'n', 'x', 'y', 'z', 'd', 'el', 'fn', 'cb', 'id', 'ok',
  'tag', 'url', 'key', 'val', 'ref', 'src', 'err', 'res', 'req', 'opt',
  'obj', 'arr', 'str', 'num', 'idx', 'len', 'min', 'max', 'sum', 'avg',
  'cnt', 'ptr', 'buf', 'tmp', 'ret', 'acc', 'evt', 'msg', 'data', 'item',
  'node', 'text', 'name', 'type', 'size', 'path', 'file', 'list', 'index',
  // Common IIFE parameter names
  'a', 'b', 'c', 'f', 'g', 'h', 'm', 'o', 'p', 'r', 's', 't', 'u', 'v', 'w'
]);

// Already renamed identifiers (from previous tools in pipeline)
const ALREADY_RENAMED_PATTERNS = [
  /^fetch/i, /^get/i, /^set/i, /^add/i, /^remove/i, /^create/i, /^update/i,
  /^delete/i, /^handle/i, /^on[A-Z]/, /^is[A-Z]/, /^has[A-Z]/, /^can[A-Z]/,
  /^show/i, /^hide/i, /^toggle/i, /^render/i, /^load/i, /^save/i, /^init/i,
  /^validate/i, /^parse/i, /^format/i, /^convert/i, /^transform/i,
  /^element\d*$/i, /^response$/i, /^request$/i, /^callback$/i, /^handler$/i,
  /^logger$/i, /^config$/i, /^options$/i, /^params$/i, /^args$/i,
  /^result$/i, /^value$/i, /^values$/i, /^items$/i, /^entries$/i
];

/**
 * Check if a name is obfuscated and needs LLM renaming
 */
function isObfuscatedName(name) {
  // Skip meaningful names
  if (MEANINGFUL_NAMES.has(name)) return false;

  // Skip already renamed patterns
  for (const pattern of ALREADY_RENAMED_PATTERNS) {
    if (pattern.test(name)) return false;
  }

  // Skip escape sequence patterns (x0a, x09, etc.) - these are string content, not identifiers
  if (/^x[0-9a-fA-F]{2}$/.test(name)) return false;

  // Skip things that look like hex color codes or numeric prefixes
  if (/^[0-9a-fA-F]+$/.test(name) && name.length <= 6) return false;

  // Single letters are handled by MEANINGFUL_NAMES now
  if (/^[a-zA-Z]$/.test(name)) {
    return !MEANINGFUL_NAMES.has(name);
  }

  // Two letters that look obfuscated (ZX, Dm, DR, etc.)
  if (/^[A-Z][a-zA-Z]$/.test(name)) return true;
  if (/^[a-z][A-Z]$/.test(name)) return true;

  // Letter followed by numbers (D2, Z0, i1, etc.) - but not common patterns
  if (/^[A-Za-z]\d+$/.test(name)) {
    // Skip common patterns like v2, h1, etc.
    if (/^[vh]\d$/.test(name)) return false;
    return true;
  }

  // Two-letter combos with numbers (D4, D5, etc.)
  if (/^[A-Z][a-z]?\d*$/.test(name) && name.length <= 3) return true;

  // Patterns like ZX, ZA, etc.
  if (/^[A-Z]{2}$/.test(name)) return true;

  // Very short names (2-3 chars) that aren't meaningful
  if (name.length <= 3 && !/^(the|and|for|but|not|you|all|can|had|her|was|one|our|out)$/.test(name)) {
    // Check if it's a common abbreviation (lowercase)
    if (/^[a-z]{2,3}$/.test(name)) return false;
    return true;
  }

  return false;
}

// ============================================================
// CONTEXT EXTRACTION
// ============================================================

/**
 * Extract usage context for an identifier
 */
function extractContext(code, identifier) {
  const contexts = [];
  const escapedId = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Match the identifier with word boundaries
  const regex = new RegExp(`\\b${escapedId}\\b`, 'g');
  let match;

  while ((match = regex.exec(code)) !== null) {
    const start = Math.max(0, match.index - 50);
    const end = Math.min(code.length, match.index + identifier.length + 50);

    let context = code.substring(start, end);

    // Clean up the context
    context = context
      .replace(/\s+/g, ' ')
      .trim();

    // Add ellipsis if truncated
    if (start > 0) context = '...' + context;
    if (end < code.length) context = context + '...';

    // Avoid duplicate contexts
    if (!contexts.some(c => c.includes(context.slice(10, 40)))) {
      contexts.push(context);
    }

    // Limit to 3 contexts
    if (contexts.length >= 3) break;
  }

  return contexts;
}

/**
 * Check if identifier is a function
 */
function isFunctionIdentifier(code, identifier) {
  const escapedId = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Check for function declaration patterns
  const patterns = [
    new RegExp(`const\\s+${escapedId}\\s*=\\s*(?:async\\s+)?(?:function|\\()`),
    new RegExp(`function\\s+${escapedId}\\s*\\(`),
    new RegExp(`${escapedId}\\s*=\\s*(?:async\\s+)?\\([^)]*\\)\\s*=>`),
    new RegExp(`${escapedId}\\s*\\([^)]*\\)\\s*\\{`),  // method definition
    new RegExp(`\\b${escapedId}\\s*\\(`)  // function call
  ];

  return patterns.some(p => p.test(code));
}

/**
 * Get function signature if available
 */
function getFunctionSignature(code, identifier) {
  const escapedId = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Try to find the function definition
  const patterns = [
    new RegExp(`const\\s+${escapedId}\\s*=\\s*(?:async\\s+)?(?:function\\s*)?\\(([^)]*)\\)`, 'g'),
    new RegExp(`function\\s+${escapedId}\\s*\\(([^)]*)\\)`, 'g'),
    new RegExp(`${escapedId}\\s*=\\s*(?:async\\s+)?\\(([^)]*)\\)\\s*=>`, 'g')
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(code);
    if (match) {
      return `(${match[1]})`;
    }
  }

  return null;
}

// ============================================================
// IDENTIFIER COLLECTION
// ============================================================

/**
 * Find all obfuscated identifiers and their usage counts
 */
function findObfuscatedIdentifiers(code) {
  const identifiers = new Map();

  // Match all potential identifiers
  const regex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
  let match;

  while ((match = regex.exec(code)) !== null) {
    const name = match[1];

    if (isObfuscatedName(name)) {
      const count = identifiers.get(name) || 0;
      identifiers.set(name, count + 1);
    }
  }

  // Filter to only those appearing 3+ times (high-value targets)
  const filtered = new Map();
  for (const [name, count] of identifiers) {
    if (count >= 3) {
      filtered.set(name, count);
    }
  }

  return filtered;
}

// ============================================================
// PROMPT BUILDING
// ============================================================

/**
 * Build the prompt for Claude
 */
function buildPrompt(identifiersWithContext) {
  let prompt = `Rename these obfuscated JavaScript identifiers based on their usage context.
Return ONLY a JSON object mapping old names to new names.
Use camelCase for variables/functions. Be concise but meaningful.

Identifiers:
`;

  let index = 1;
  for (const [name, info] of identifiersWithContext) {
    prompt += `\n${index}. \`${name}\``;
    if (info.isFunction) {
      prompt += ' (function)';
      if (info.signature) {
        prompt += ` - signature: ${info.signature}`;
      }
    }
    prompt += ` - appears ${info.count} times`;
    prompt += '\n   Usage examples:';
    for (const ctx of info.contexts) {
      prompt += `\n   - \`${ctx}\``;
    }
    index++;
  }

  prompt += `\n\nResponse format: {"${identifiersWithContext.keys().next().value}": "meaningfulName", ...}`;
  prompt += '\nOnly return valid JSON. No explanation needed.';

  return prompt;
}

// ============================================================
// CODE TRANSFORMATION
// ============================================================

/**
 * Apply renames to code
 */
function applyRenames(code, renames) {
  // Sort by length descending to avoid partial replacements
  const sortedRenames = [...renames.entries()].sort((a, b) => b[0].length - a[0].length);

  let result = code;
  for (const [oldName, newName] of sortedRenames) {
    const escapedOld = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedOld}\\b`, 'g');
    result = result.replace(regex, newName);
  }

  return result;
}

/**
 * Verify no naming conflicts
 */
function checkConflicts(code, renames) {
  const newNames = new Set(renames.values());
  const conflicts = [];

  for (const newName of newNames) {
    // Check if this name already exists in code (not as a rename target)
    const escapedName = newName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedName}\\b`);

    // Check if it exists and isn't being renamed FROM
    if (regex.test(code) && !renames.has(newName)) {
      conflicts.push(newName);
    }
  }

  return conflicts;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('LLM Variable Renamer');
  console.log('====================');
  console.log(`Model: ${modelId}`);
  console.log(`Input: ${inputFile}`);
  console.log(`Output: ${outputFile || '(stdout)'}`);
  console.log(`Dry run: ${flags.dryRun}`);
  console.log('');

  // Read input file
  let code;
  try {
    code = fs.readFileSync(inputFile, 'utf8');
  } catch (err) {
    console.error(`Error reading input file: ${err.message}`);
    process.exit(1);
  }

  console.log(`File size: ${code.length} bytes`);

  // Find obfuscated identifiers
  const obfuscated = findObfuscatedIdentifiers(code);
  console.log(`Found ${obfuscated.size} obfuscated identifiers (appearing 3+ times)`);

  if (obfuscated.size === 0) {
    console.log('No obfuscated identifiers found. Nothing to rename.');
    if (outputFile && !flags.dryRun) {
      fs.writeFileSync(outputFile, code);
    }
    return;
  }

  // Extract context for each identifier
  const identifiersWithContext = new Map();
  for (const [name, count] of obfuscated) {
    const contexts = extractContext(code, name);
    const isFunction = isFunctionIdentifier(code, name);
    const signature = isFunction ? getFunctionSignature(code, name) : null;

    identifiersWithContext.set(name, {
      count,
      contexts,
      isFunction,
      signature
    });
  }

  // Log what we found
  console.log('\nObfuscated identifiers to rename:');
  for (const [name, info] of identifiersWithContext) {
    console.log(`  ${name} (${info.count}x)${info.isFunction ? ' [function]' : ''}`);
  }
  console.log('');

  // Build prompt
  const prompt = buildPrompt(identifiersWithContext);
  console.log(`Prompt length: ${prompt.length} characters`);

  if (flags.dryRun) {
    console.log('\n--- DRY RUN: Prompt that would be sent ---');
    console.log(prompt);
    console.log('--- END PROMPT ---\n');
  }

  // Call Claude API
  console.log('Calling Claude API...');

  let renames;
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: modelId,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].text;

    // Parse response
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = text;
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      } else {
        // Try to find JSON object directly
        const objMatch = text.match(/\{[\s\S]*\}/);
        if (objMatch) {
          jsonStr = objMatch[0];
        }
      }

      renames = new Map(Object.entries(JSON.parse(jsonStr)));
    } catch (parseErr) {
      console.error('Failed to parse Claude response as JSON:');
      console.error(text);
      console.error('Parse error:', parseErr.message);
      process.exit(1);
    }

    // Log token usage and cost
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const pricing = PRICING[modelId] || PRICING['claude-sonnet-4-20250514'];
    const cost = (inputTokens / 1000 * pricing.input) + (outputTokens / 1000 * pricing.output);

    console.log(`\nToken usage:`);
    console.log(`  Input:  ${inputTokens} tokens`);
    console.log(`  Output: ${outputTokens} tokens`);
    console.log(`  Estimated cost: $${cost.toFixed(4)}`);

  } catch (apiErr) {
    console.error('Claude API error:', apiErr.message);
    process.exit(1);
  }

  // Log renames
  console.log('\nProposed renames:');
  for (const [oldName, newName] of renames) {
    console.log(`  ${oldName} -> ${newName}`);
  }

  // Check for conflicts
  const conflicts = checkConflicts(code, renames);
  if (conflicts.length > 0) {
    console.warn('\nWarning: Potential naming conflicts detected:');
    for (const conflict of conflicts) {
      console.warn(`  - "${conflict}" already exists in code`);
    }
  }

  if (flags.dryRun) {
    console.log('\n--- DRY RUN: No changes made ---');
    return;
  }

  // Apply renames
  console.log('\nApplying renames...');
  const result = applyRenames(code, renames);

  // Write output
  if (outputFile) {
    fs.writeFileSync(outputFile, result);
    console.log(`Output written to: ${outputFile}`);
  } else {
    console.log('\n--- RESULT ---');
    console.log(result);
  }

  // Summary
  console.log(`\nSummary: Renamed ${renames.size} identifiers`);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
