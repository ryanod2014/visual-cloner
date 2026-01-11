#!/usr/bin/env node
/**
 * LLM Global Object Renamer
 *
 * Uses Claude Haiku to infer meaningful names for global objects
 * based on their usage patterns.
 *
 * Usage: node llm-rename-globals.js input.js output.js
 */

const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2];
const outputFile = process.argv[3] || inputFile.replace('.js', '.globals-renamed.js');

if (!inputFile) {
  console.log('Usage: node llm-rename-globals.js <input.js> [output.js]');
  process.exit(1);
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not set');
  process.exit(1);
}

console.log('LLM Global Object Renamer (Haiku)');
console.log('==================================');
console.log(`Input: ${inputFile}`);

const code = fs.readFileSync(inputFile, 'utf8');

// Find all obj* globals and their usage counts
const objPattern = /\bobj(\d+)\b/g;
const objCounts = {};
let match;
while ((match = objPattern.exec(code)) !== null) {
  const name = match[0];
  objCounts[name] = (objCounts[name] || 0) + 1;
}

// Sort by usage count, take top 30
const topObjects = Object.entries(objCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30)
  .map(([name]) => name);

console.log(`\nFound ${Object.keys(objCounts).length} global objects`);
console.log(`Analyzing top ${topObjects.length} most-used objects\n`);

// Extract usage samples for each object
function extractSamples(objName, code, maxSamples = 15) {
  const samples = [];
  const lines = code.split('\n');

  // Find method/property accesses
  const accessPattern = new RegExp(`${objName}\\.([a-zA-Z_][a-zA-Z0-9_]*)`, 'g');
  const methods = {};
  let m;
  while ((m = accessPattern.exec(code)) !== null) {
    methods[m[1]] = (methods[m[1]] || 0) + 1;
  }

  // Get top methods
  const topMethods = Object.entries(methods)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => `${name} (${count}x)`);

  // Get a few context lines
  const contextLines = [];
  for (let i = 0; i < lines.length && contextLines.length < maxSamples; i++) {
    if (lines[i].includes(objName + '.')) {
      const line = lines[i].trim().slice(0, 120);
      if (line.length > 10) {
        contextLines.push(line);
      }
    }
  }

  return {
    methods: topMethods,
    context: contextLines
  };
}

// Build the prompt
const objectSamples = {};
for (const objName of topObjects) {
  objectSamples[objName] = extractSamples(objName, code);
}

const prompt = `You are analyzing minified JavaScript code from Photopea (a Photoshop clone).
I need you to infer meaningful names for global namespace objects based on their usage patterns.

For each object, I'll show you:
- Its most-used methods/properties
- Sample code lines where it's used

Based on this, suggest a clear, descriptive name following JavaScript conventions (PascalCase for namespaces).

Here are the objects to rename:

${topObjects.map(objName => {
  const samples = objectSamples[objName];
  return `## ${objName} (used ${objCounts[objName]} times)
Methods: ${samples.methods.join(', ')}
Context:
${samples.context.slice(0, 8).map(l => '  ' + l).join('\n')}
`;
}).join('\n')}

Respond with ONLY a JSON object mapping old names to new names, like:
{
  "obj6": "WebGLContext",
  "obj15": "MatrixUtils",
  ...
}

Choose names that clearly indicate the purpose. Common patterns in image editors:
- Rendering/WebGL
- Matrix/Transform math
- Color operations
- Layer management
- Tool handling
- UI/DOM utilities
- Localization/i18n
- File I/O
- History/Undo`;

async function callHaiku(prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-20250414',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

async function main() {
  console.log('Sending to Claude Haiku...\n');

  const startTime = Date.now();
  const response = await callHaiku(prompt);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`Response received in ${elapsed}s\n`);

  // Parse the JSON response
  let renames;
  try {
    // Extract JSON from response (might have markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    renames = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('Failed to parse response:', response);
    throw err;
  }

  console.log('Inferred names:');
  for (const [oldName, newName] of Object.entries(renames)) {
    console.log(`  ${oldName} → ${newName}`);
  }

  // Apply renames
  console.log('\nApplying renames...');
  let newCode = code;
  let totalReplacements = 0;

  for (const [oldName, newName] of Object.entries(renames)) {
    // Only rename if it's a valid identifier
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
      console.log(`  Skipping invalid name: ${newName}`);
      continue;
    }

    const pattern = new RegExp(`\\b${oldName}\\b`, 'g');
    const matches = (newCode.match(pattern) || []).length;
    newCode = newCode.replace(pattern, newName);
    totalReplacements += matches;
    console.log(`  ${oldName} → ${newName}: ${matches} replacements`);
  }

  fs.writeFileSync(outputFile, newCode);
  console.log(`\nTotal replacements: ${totalReplacements}`);
  console.log(`Output: ${outputFile}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
