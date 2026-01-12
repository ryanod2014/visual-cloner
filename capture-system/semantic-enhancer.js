#!/usr/bin/env node
/**
 * Semantic Enhancer - AI-powered semantic information generation
 *
 * Like V8 does for variable renaming, this uses Claude Haiku to automatically
 * generate semantic information from programmatic discovery results.
 *
 * Input:  operations-catalog-with-params.json (programmatic)
 * Output: operations-with-semantics.json (programmatic + AI-generated semantics)
 *
 * NO MANUAL WORK REQUIRED! ✅
 *
 * Usage:
 *   node semantic-enhancer.js operations-catalog-with-params.json
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

const catalogPath = process.argv[2];

if (!catalogPath || !fs.existsSync(catalogPath)) {
  console.error('Usage: node semantic-enhancer.js <operations-catalog-with-params.json>');
  process.exit(1);
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable not set');
  console.error('');
  console.error('Set it with:');
  console.error('  export ANTHROPIC_API_KEY=your-api-key-here');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

console.log('='.repeat(80));
console.log('SEMANTIC ENHANCER - AI-Powered Semantic Information');
console.log('='.repeat(80));
console.log(`Input: ${catalogPath}`);
console.log('Model: claude-3-haiku-20240307 (fast & cheap)');
console.log('');

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));

async function generateSemantics(operationName, operationData) {
  const prompt = `You are analyzing an image editing operation discovered through static analysis.

Operation name: ${operationName}
Category: ${operationData.category || 'unknown'}
Parameters: ${operationData.parameters?.parameterCount || 0}

${operationData.parameters?.parameterCount > 0 ? `
Parameter details:
${JSON.stringify(operationData.parameters, null, 2)}
` : ''}

Based ONLY on the operation name and parameter signatures, infer:
1. Display name (human-readable)
2. Brief description (1-2 sentences, what it does technically)
3. Common use cases (when users would use this)
4. Parameter names (semantic names for param0, param1, etc.)
5. Parameter descriptions (what each parameter controls)
6. Recommended common values (typical values users would try)

Respond in JSON format:
{
  "displayName": "...",
  "description": "...",
  "commonUse": "...",
  "menuPath": "...", // Infer likely menu location
  "parameters": {
    "param0": {
      "name": "...",
      "displayName": "...",
      "unit": "...", // pixels, percent, degrees, etc.
      "description": "...",
      "commonValues": [...],
      "recommended": { ... }
    }
  }
}

IMPORTANT:
- Use standard image processing terminology
- Base inferences on operation name patterns (e.g., "gaussianBlur" → Gaussian kernel blur)
- Parameter ranges inform what they control (0-250 for blur = likely radius in pixels)
- Be confident in standard operations (blur, sharpen, brightness, etc.)
- For unknown operations, make educated guesses based on patterns

Return ONLY the JSON, no explanation.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const responseText = message.content[0].text;
    const semantics = JSON.parse(responseText);

    return {
      success: true,
      semantics
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function main() {
  const enhanced = {
    meta: {
      ...catalog.meta,
      enhancedAt: new Date().toISOString(),
      enhancedBy: 'claude-3-haiku-20240307',
      enhancementMethod: 'ai-semantic-inference'
    },
    operations: {}
  };

  const operationNames = Object.keys(catalog.operations);
  let successCount = 0;
  let failCount = 0;

  console.log(`Processing ${operationNames.length} operations with Haiku...\n`);

  for (let i = 0; i < operationNames.length; i++) {
    const opName = operationNames[i];
    const opData = catalog.operations[opName];

    process.stdout.write(`[${i + 1}/${operationNames.length}] ${opName.padEnd(30)} `);

    const result = await generateSemantics(opName, opData);

    if (result.success) {
      enhanced.operations[opName] = {
        // Original programmatic data
        ...opData,

        // AI-generated semantic information
        ...result.semantics,

        // Merge parameters
        parameters: {
          ...opData.parameters,
          ranges: opData.parameters?.ranges || {},

          // Add semantic names to each parameter
          ...(result.semantics.parameters || {})
        },

        // Mark as AI-enhanced
        _aiEnhanced: true,
        _enhancedBy: 'claude-3-haiku-20240307'
      };

      console.log('✅ SUCCESS');
      successCount++;
    } else {
      // Keep original data if AI fails
      enhanced.operations[opName] = {
        ...opData,
        _aiEnhanced: false,
        _enhancementError: result.error
      };

      console.log(`❌ FAILED: ${result.error}`);
      failCount++;
    }

    // Rate limiting - Haiku is fast but be respectful
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Save enhanced catalog
  const outputPath = catalogPath.replace('.json', '-with-semantics.json');
  fs.writeFileSync(outputPath, JSON.stringify(enhanced, null, 2));

  console.log('\n' + '='.repeat(80));
  console.log('SEMANTIC ENHANCEMENT COMPLETE');
  console.log('='.repeat(80));
  console.log('');
  console.log(`Successfully enhanced: ${successCount}/${operationNames.length}`);
  console.log(`Failed:                ${failCount}/${operationNames.length}`);
  console.log('');
  console.log(`Saved: ${outputPath}`);
  console.log('');

  // Show example
  if (successCount > 0) {
    const exampleOp = Object.keys(enhanced.operations).find(k => enhanced.operations[k]._aiEnhanced);
    if (exampleOp) {
      console.log('='.repeat(80));
      console.log('EXAMPLE ENHANCEMENT');
      console.log('='.repeat(80));
      console.log('');
      console.log(`Operation: ${exampleOp}`);
      console.log('');
      console.log('AI-generated semantic information:');
      console.log(JSON.stringify({
        displayName: enhanced.operations[exampleOp].displayName,
        description: enhanced.operations[exampleOp].description,
        commonUse: enhanced.operations[exampleOp].commonUse,
        menuPath: enhanced.operations[exampleOp].menuPath,
        parameters: enhanced.operations[exampleOp].parameters
      }, null, 2));
      console.log('');
    }
  }

  console.log('='.repeat(80));
  console.log('NEXT STEPS');
  console.log('='.repeat(80));
  console.log('');
  console.log('1. Review AI-generated semantic information (optional)');
  console.log('2. Use enhanced catalog for universal capture:');
  console.log('');
  console.log(`   node universal-capture-v5-complete.js ${outputPath}`);
  console.log('');
  console.log('NO MANUAL WORK REQUIRED! ✅');
  console.log('');
}

main().catch(console.error);
