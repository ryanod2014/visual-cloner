/**
 * WebGL Extractor Plugin
 *
 * Extracts captured WebGL shader data from the page after the capture phase.
 * Filters shaders to only include those from visible canvases.
 *
 * Usage:
 *   import { extractWebGLData } from './plugins/extractors/webgl-extractor.js';
 *
 *   // After page load (and WebGL capture injection)
 *   const shaderData = await extractWebGLData(page);
 *
 *   // shaderData = {
 *   //   shaders: [...],
 *   //   uniforms: [...],
 *   //   canvases: [...],
 *   //   meta: { ... }
 *   // }
 */

import { parseUniforms } from '../../utils/shader-parser.js';

/**
 * Extract captured WebGL data from the page
 *
 * @param {import('playwright').Page} page - Playwright page instance
 * @returns {Promise<Object>} Extracted shader data
 */
export async function extractWebGLData(page) {
  const rawData = await page.evaluate(() => {
    const allShaders = window.__capturedShaders || [];
    const allUniforms = window.__capturedUniforms || [];

    // ============================================
    // CANVAS DISCOVERY
    // ============================================

    const canvasMap = new Map();
    document.querySelectorAll('canvas').forEach((canvas, index) => {
      const rect = canvas.getBoundingClientRect();
      const style = getComputedStyle(canvas);

      // Determine visibility
      const isVisible = (
        rect.width > 10 &&
        rect.height > 10 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        parseFloat(style.opacity) > 0
      );

      // Check for WebGL context
      let hasWebGL = false;
      try {
        hasWebGL = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
      } catch (e) {
        // Context might already exist with different type
      }

      const key = canvas.id || canvas.className || `canvas-${index}`;
      canvasMap.set(key, {
        id: canvas.id || null,
        className: canvas.className || null,
        width: canvas.width,
        height: canvas.height,
        displayWidth: Math.round(rect.width),
        displayHeight: Math.round(rect.height),
        isVisible,
        hasWebGL,
        index,
      });
    });

    // ============================================
    // FILTER TO VISIBLE CANVASES
    // ============================================

    // Build set of visible canvas identifiers
    const visibleCanvasIds = new Set();
    canvasMap.forEach((info, key) => {
      if (info.isVisible) {
        if (info.id) visibleCanvasIds.add(info.id);
        if (info.className) {
          // Add each class token separately
          info.className.split(/\s+/).forEach(cls => {
            if (cls) visibleCanvasIds.add(cls);
          });
        }
      }
    });

    // Filter shaders to only those from visible canvases
    const visibleShaders = allShaders.filter(shader => {
      // If no canvas tracking info, include if there are any visible canvases
      if (!shader.canvasId && !shader.canvasClass) {
        return Array.from(canvasMap.values()).some(c => c.isVisible);
      }

      // Check for ID match
      if (shader.canvasId && visibleCanvasIds.has(shader.canvasId)) {
        return true;
      }

      // Check for class match (shader class might be partial)
      if (shader.canvasClass) {
        const shaderClasses = shader.canvasClass.split(/\s+/);
        return shaderClasses.some(cls => visibleCanvasIds.has(cls));
      }

      return false;
    });

    // Filter uniforms similarly
    const visibleUniforms = allUniforms.filter(uniform => {
      if (!uniform.canvasId) return visibleCanvasIds.size > 0;
      return visibleCanvasIds.has(uniform.canvasId);
    });

    // ============================================
    // DETECT FRAMEWORKS
    // ============================================

    const frameworks = {
      threeJs: window.THREE ? { version: window.THREE.REVISION } : null,
      babylonJs: window.BABYLON ? { version: window.BABYLON.Engine?.Version } : null,
      pixiJs: window.PIXI ? { version: window.PIXI.VERSION } : null,
    };

    // ============================================
    // RETURN RAW DATA
    // ============================================

    return {
      shaders: visibleShaders,
      uniforms: visibleUniforms,
      canvases: Array.from(canvasMap.values()),
      totalShadersCapture: allShaders.length,
      totalUniformsCaptured: allUniforms.length,
      frameworks,
    };
  });

  // ============================================
  // POST-PROCESS: Parse uniforms from shader source
  // ============================================

  const shadersWithParsedUniforms = rawData.shaders.map(shader => ({
    ...shader,
    parsedUniforms: parseUniforms(shader.source),
  }));

  // Deduplicate uniforms by name
  const uniqueUniformNames = [...new Set(rawData.uniforms.map(u => u.name))];

  // Count visible canvases
  const visibleCanvases = rawData.canvases.filter(c => c.isVisible);

  return {
    shaders: shadersWithParsedUniforms,
    uniforms: uniqueUniformNames,
    canvases: rawData.canvases,
    meta: {
      totalShadersCaptured: rawData.totalShadersCapture,
      filteredShadersCount: shadersWithParsedUniforms.length,
      totalUniformsCaptured: rawData.totalUniformsCaptured,
      uniqueUniformCount: uniqueUniformNames.length,
      canvasCount: rawData.canvases.length,
      visibleCanvasCount: visibleCanvases.length,
      hasWebGL: shadersWithParsedUniforms.length > 0,
      frameworks: rawData.frameworks,
    },
  };
}

/**
 * Check if page has any WebGL content
 *
 * @param {import('playwright').Page} page - Playwright page instance
 * @returns {Promise<boolean>}
 */
export async function hasWebGLContent(page) {
  return await page.evaluate(() => {
    const shaders = window.__capturedShaders || [];
    return shaders.length > 0;
  });
}

/**
 * Get quick summary of captured WebGL data (for logging)
 *
 * @param {import('playwright').Page} page - Playwright page instance
 * @returns {Promise<Object>}
 */
export async function getWebGLSummary(page) {
  return await page.evaluate(() => {
    const shaders = window.__capturedShaders || [];
    const uniforms = window.__capturedUniforms || [];
    const canvases = document.querySelectorAll('canvas').length;

    return {
      shaderCount: shaders.length,
      uniformCount: uniforms.length,
      canvasCount: canvases,
      vertexShaders: shaders.filter(s => s.type === 'vertex').length,
      fragmentShaders: shaders.filter(s => s.type === 'fragment').length,
    };
  });
}

export default {
  extractWebGLData,
  hasWebGLContent,
  getWebGLSummary,
};
