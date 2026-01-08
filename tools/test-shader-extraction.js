#!/usr/bin/env node
/**
 * Test WebGL Shader Extraction
 * Tests the shader interception approach on sites with WebGL effects
 */

import { chromium } from 'playwright';
import fs from 'fs';

const testUrls = [
  'https://vercel.com',
];

async function extractShaders(url) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${url}`);
  console.log('='.repeat(60));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Inject shader interception BEFORE page loads
  await page.addInitScript(() => {
    window.__capturedShaders = [];
    window.__capturedUniforms = [];
    window.__shaderPrograms = [];

    // Hook WebGLRenderingContext.shaderSource
    const originalShaderSource = WebGLRenderingContext.prototype.shaderSource;
    WebGLRenderingContext.prototype.shaderSource = function(shader, source) {
      try {
        const type = this.getShaderParameter(shader, this.SHADER_TYPE);
        window.__capturedShaders.push({
          type: type === this.VERTEX_SHADER ? 'vertex' : 'fragment',
          source: source,
          timestamp: Date.now(),
          context: 'webgl'
        });
      } catch (e) {}
      return originalShaderSource.call(this, shader, source);
    };

    // Hook WebGL2RenderingContext.shaderSource if available
    if (window.WebGL2RenderingContext) {
      const originalShaderSource2 = WebGL2RenderingContext.prototype.shaderSource;
      WebGL2RenderingContext.prototype.shaderSource = function(shader, source) {
        try {
          const type = this.getShaderParameter(shader, this.SHADER_TYPE);
          window.__capturedShaders.push({
            type: type === this.VERTEX_SHADER ? 'vertex' : 'fragment',
            source: source,
            timestamp: Date.now(),
            context: 'webgl2'
          });
        } catch (e) {}
        return originalShaderSource2.call(this, shader, source);
      };
    }

    // Track uniform locations for later value extraction
    const originalGetUniformLocation = WebGLRenderingContext.prototype.getUniformLocation;
    WebGLRenderingContext.prototype.getUniformLocation = function(program, name) {
      const location = originalGetUniformLocation.call(this, program, name);
      if (location) {
        window.__capturedUniforms.push({
          name: name,
          timestamp: Date.now()
        });
      }
      return location;
    };

    // Also hook WebGL2
    if (window.WebGL2RenderingContext) {
      const originalGetUniformLocation2 = WebGL2RenderingContext.prototype.getUniformLocation;
      WebGL2RenderingContext.prototype.getUniformLocation = function(program, name) {
        const location = originalGetUniformLocation2.call(this, program, name);
        if (location) {
          window.__capturedUniforms.push({
            name: name,
            timestamp: Date.now()
          });
        }
        return location;
      };
    }
  });

  try {
    // Navigate and wait for WebGL to initialize
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Give time for animations/effects to start
    await page.waitForTimeout(5000);

    // Scroll to trigger any lazy-loaded effects
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await page.waitForTimeout(1000);

    // Extract captured data
    const shaders = await page.evaluate(() => window.__capturedShaders || []);
    const uniforms = await page.evaluate(() => window.__capturedUniforms || []);

    // Also check for inline shader scripts
    const inlineShaders = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type*="shader"], script[type*="glsl"]');
      return Array.from(scripts).map(s => ({
        type: s.type,
        id: s.id,
        content: s.textContent.trim().substring(0, 200) + '...'
      }));
    });

    // Check for Three.js
    const threeInfo = await page.evaluate(() => {
      if (window.THREE) {
        return {
          version: window.THREE.REVISION,
          found: true
        };
      }
      return { found: false };
    });

    // Check for canvas elements
    const canvasInfo = await page.evaluate(() => {
      const canvases = document.querySelectorAll('canvas');
      return Array.from(canvases).map(c => ({
        width: c.width,
        height: c.height,
        hasWebGL: !!(c.getContext('webgl') || c.getContext('webgl2')),
        id: c.id,
        className: c.className
      }));
    });

    // Check for CSS animations
    const cssAnimations = await page.evaluate(() => {
      const animations = [];
      const keyframes = [];

      // Find elements with CSS animations
      document.querySelectorAll('*').forEach(el => {
        const style = getComputedStyle(el);
        if (style.animationName && style.animationName !== 'none') {
          animations.push({
            selector: el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ')[0] : ''),
            animationName: style.animationName,
            animationDuration: style.animationDuration,
            animationTimingFunction: style.animationTimingFunction
          });
        }
        if (style.transition && style.transition !== 'all 0s ease 0s') {
          animations.push({
            selector: el.tagName,
            transition: style.transition
          });
        }
      });

      // Find @keyframes rules
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSKeyframesRule) {
              keyframes.push({
                name: rule.name,
                cssText: rule.cssText.substring(0, 200) + '...'
              });
            }
          }
        } catch (e) {}
      }

      return { animations: animations.slice(0, 20), keyframes };
    });

    // Report results
    console.log(`\n📊 Results for ${url}:`);
    console.log(`   Canvases found: ${canvasInfo.length}`);
    canvasInfo.forEach((c, i) => {
      console.log(`     [${i}] ${c.width}x${c.height} webgl=${c.hasWebGL} id="${c.id}" class="${c.className}"`);
    });

    console.log(`   Three.js: ${threeInfo.found ? `Yes (r${threeInfo.version})` : 'No'}`);
    console.log(`   Shaders captured: ${shaders.length}`);
    console.log(`   Uniforms captured: ${uniforms.length}`);
    console.log(`   Inline shader scripts: ${inlineShaders.length}`);

    if (shaders.length > 0) {
      console.log('\n   🎨 Captured Shaders:');
      shaders.forEach((s, i) => {
        const preview = s.source.replace(/\s+/g, ' ').substring(0, 100);
        console.log(`     [${i}] ${s.type} (${s.context}): ${preview}...`);
      });
    }

    if (uniforms.length > 0) {
      // Dedupe uniform names
      const uniqueUniforms = [...new Set(uniforms.map(u => u.name))];
      console.log(`\n   🎛️  Unique Uniforms: ${uniqueUniforms.join(', ')}`);
    }

    if (inlineShaders.length > 0) {
      console.log('\n   📜 Inline Shader Scripts:');
      inlineShaders.forEach((s, i) => {
        console.log(`     [${i}] type="${s.type}" id="${s.id}"`);
      });
    }

    // Report CSS animations
    console.log(`\n   🎬 CSS Animations:`);
    console.log(`   @keyframes rules: ${cssAnimations.keyframes.length}`);
    if (cssAnimations.keyframes.length > 0) {
      cssAnimations.keyframes.forEach((k, i) => {
        console.log(`     [${i}] ${k.name}`);
      });
    }
    console.log(`   Animated elements: ${cssAnimations.animations.filter(a => a.animationName).length}`);
    console.log(`   Transition elements: ${cssAnimations.animations.filter(a => a.transition).length}`);

    await browser.close();

    return {
      url,
      canvases: canvasInfo.length,
      shaders: shaders.length,
      uniforms: uniforms.length,
      inlineShaders: inlineShaders.length,
      threeJs: threeInfo.found,
      rawShaders: shaders,
      rawUniforms: uniforms
    };

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    await browser.close();
    return { url, error: error.message };
  }
}

async function main() {
  console.log('🔬 WebGL Shader Extraction Test');
  console.log('Testing interception approach on multiple sites...\n');

  const results = [];

  for (const url of testUrls) {
    const result = await extractShaders(url);
    results.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 SUMMARY');
  console.log('='.repeat(60));

  results.forEach(r => {
    if (r.error) {
      console.log(`❌ ${r.url}: Error - ${r.error}`);
    } else {
      const status = r.shaders > 0 ? '✅' : '⚠️';
      console.log(`${status} ${r.url}: ${r.shaders} shaders, ${r.uniforms} uniforms, ${r.canvases} canvases`);
    }
  });

  // Save detailed results
  const outputPath = '/Users/ryanodonnell/projects/style_extractor_prototype/clone-system/visual-cloner/output/shader-test-results.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 Detailed results saved to: ${outputPath}`);
}

main().catch(console.error);
