/**
 * Extract exact parameters from UnicornStudio compiled shaders
 */

import fs from 'fs';

const data = JSON.parse(fs.readFileSync('output/aura-shader-data.json', 'utf-8'));

console.log('=== EXACT VALUES FROM UNICORNSTUDIO SHADERS ===\n');

const allParams = {};

for (const layer of data.history) {
  if (!layer.compiledFragmentShaders) continue;

  const layerKey = `${layer.id} (${layer.type || layer.layerType})`;
  allParams[layerKey] = {};

  console.log(`--- Layer: ${layer.id} | Type: ${layer.type || layer.layerType} ---`);
  console.log(`    Name: ${layer.layerName || 'unnamed'}`);
  console.log(`    Visible: ${layer.visible !== false}`);
  console.log(`    Speed: ${layer.speed || 0}`);
  console.log(`    BlendMode: ${layer.blendMode || 'NORMAL'}`);

  for (let i = 0; i < layer.compiledFragmentShaders.length; i++) {
    const shader = layer.compiledFragmentShaders[i];

    if (layer.compiledFragmentShaders.length > 1) {
      console.log(`    Pass ${i + 1}:`);
    }

    // Extract colors (non-black)
    const colorMatches = [...shader.matchAll(/vec3\(([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/g)];
    for (const c of colorMatches) {
      const r = parseFloat(c[1]), g = parseFloat(c[2]), b = parseFloat(c[3]);
      if (r > 0.01 || g > 0.01 || b > 0.01) {
        const hex = '#' + [r,g,b].map(v => Math.round(v*255).toString(16).padStart(2,'0')).join('');
        console.log(`      Color: [${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}] → ${hex}`);
      }
    }

    // Glow thickness
    const glowMatches = [...shader.matchAll(/glowThickness\s*=\s*([\d.]+)\s*\*/g)];
    for (const m of glowMatches) {
      console.log(`      glowThickness: ${m[1]}`);
    }

    // Ring scale
    const scaleMatch = shader.match(/drawExpandingRings\(uv,\s*pos,\s*([\d.]+)/);
    if (scaleMatch) console.log(`      ringScale: ${scaleMatch[1]}`);

    // Ring width / line radius
    const lineRadiusMatch = shader.match(/lineRadius\s*=\s*([\d.]+)\s*\*/);
    if (lineRadiusMatch) console.log(`      ringWidth: ${lineRadiusMatch[1]}`);

    // Skew
    const skewMatch = shader.match(/vec2\(([\d.]+),\s*1\.\s*-\s*([\d.]+)\)\s*\*\s*2/);
    if (skewMatch) console.log(`      skew: [${skewMatch[1]}, ${skewMatch[2]}]`);

    // Blur amount
    const blurMatch = shader.match(/\(([\d.]+)\s*\*\s*amt\)\s*\*\s*ease/);
    if (blurMatch) console.log(`      blurAmount: ${blurMatch[1]}`);

    // Kernel size
    const kernelMatch = shader.match(/kernelSize\s*=\s*(\d+)/);
    if (kernelMatch) console.log(`      kernelSize: ${kernelMatch[1]}`);

    // Noise amount
    const noiseAmtMatch = shader.match(/mix\(textureCoord,\s*offset,\s*([\d.]+)\)/);
    if (noiseAmtMatch) console.log(`      noiseAmount: ${noiseAmtMatch[1]}`);

    // Noise scale
    const noiseScaleMatch = shader.match(/st\s*\*=\s*([\d.]+)\s*\*\s*1/);
    if (noiseScaleMatch) console.log(`      noiseScale: ${noiseScaleMatch[1]}`);

    // Drift
    const driftMatch = shader.match(/0,\s*([\d.]+)\s*\*\s*uTime/);
    if (driftMatch) console.log(`      drift: ${driftMatch[1]}`);

    // Diffuse amount
    const diffuseMatch = shader.match(/amount\s*=\s*([\d.]+)\s*\*\s*2/);
    if (diffuseMatch) console.log(`      diffuseAmount: ${diffuseMatch[1]}`);

    // Repeat spacing (replicate)
    const repeatMatch = shader.match(/repeatSpacing\s*=\s*([\d.]+)\s*\*/);
    if (repeatMatch) console.log(`      repeatSpacing: ${repeatMatch[1]}`);

    // Max iterations/repeats
    const iterMatch = shader.match(/float\(i\)\s*>=\s*([\d.]+)\)/);
    if (iterMatch) console.log(`      maxRepeats: ${iterMatch[1]}`);

    // Rotation
    const rotMatch = shader.match(/rotation\s*=\s*\(([\d.]+)\s*\*\s*2/);
    if (rotMatch) console.log(`      rotation: ${rotMatch[1]} (* 2π)`);

    // Grid size (glyph dither)
    const gridMatch = shader.match(/gridSize\s*=\s*mix\([\d.]+,\s*[\d.]+,\s*([\d.]+)\)/);
    if (gridMatch) console.log(`      glyphGrid: ${gridMatch[1]}`);

    // Gamma
    const gammaMatch = shader.match(/gamma\s*=\s*pow\(mix\([\d.]+,\s*[\d.]+,\s*([\d.]+)\)/);
    if (gammaMatch) console.log(`      glyphGamma: ${gammaMatch[1]}`);

    // Mix amount for dither
    const ditherMixMatch = shader.match(/mix\(bg\.rgb,\s*dithered,\s*([\d.]+)\)/);
    if (ditherMixMatch) console.log(`      ditherMix: ${ditherMixMatch[1]}`);
  }

  console.log('');
}

// Output summary
console.log('\n=== SUMMARY OF KEY PARAMETERS ===\n');
console.log('Beam/Glow:');
console.log('  Inner glow: 0.0200 * 0.8 = 0.016');
console.log('  Outer glow: 0.0800 * 0.8 = 0.064');
console.log('  Color: #459aff (cyan-blue)');

console.log('\nExpanding Ring:');
console.log('  Scale: 2.2380');
console.log('  Width: 0.5000');
console.log('  Skew: [0.41, 0.59]');
console.log('  Color: #0081f7 (blue)');

console.log('\nBlur:');
console.log('  Amount: 0.4700');
console.log('  Kernel: 36 samples');
console.log('  Passes: 4 (H-V-H-V)');

console.log('\nNoise:');
console.log('  Amount: 0.1000');
console.log('  Scale: 12.0');
console.log('  Drift: 0.3600');

console.log('\nDiffuse:');
console.log('  Amount: 0.0900 * 2 = 0.18');
console.log('  Iterations: 24');

console.log('\nReplicate:');
console.log('  Spacing: 0.0300, 0.0500');
console.log('  Repeats: 100, 46');
console.log('  Rotation: 0.7506, 0.0 (* 2π)');

console.log('\nGlyph Dither:');
console.log('  Grid: 1.0 (very fine)');
console.log('  Gamma: 0.5800');
console.log('  Mix: 0.5000');
console.log('  Sprite: squares.png');
