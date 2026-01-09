/**
 * Canvas Behavior Integrator
 *
 * Integrates extracted canvas behaviors:
 * - Canvas 2D drawing operations
 * - WebGL shaders and draw calls
 * - Tool behaviors (from behavioral extraction)
 *
 * Part of V6 Reconstruction Integration
 */

/**
 * Generate Canvas 2D replay code
 * @param {Object} data - canvas2d extraction data
 * @returns {string} JavaScript code
 */
export function generateCanvas2DJS(data) {
  if (!data || !data.operations || data.operations.length === 0) return '';

  const lines = [];
  lines.push('// Canvas 2D Operations (from extraction)');
  lines.push('');

  // Group operations by canvas
  const byCanvas = {};
  data.operations.forEach(op => {
    const canvasId = op.canvasId || 'default';
    if (!byCanvas[canvasId]) {
      byCanvas[canvasId] = [];
    }
    byCanvas[canvasId].push(op);
  });

  // Generate replay function for each canvas
  Object.entries(byCanvas).forEach(([canvasId, operations]) => {
    lines.push(`function replayCanvas_${canvasId.replace(/[^a-zA-Z0-9]/g, '_')}(ctx) {`);
    lines.push('  ctx.save();');
    lines.push('');

    operations.forEach(op => {
      if (op.type === 'method') {
        const args = (op.args || []).map(arg => {
          if (typeof arg === 'string') return `'${arg}'`;
          if (typeof arg === 'object') return JSON.stringify(arg);
          return arg;
        }).join(', ');
        lines.push(`  ctx.${op.method}(${args});`);
      } else if (op.type === 'property') {
        if (typeof op.value === 'string') {
          lines.push(`  ctx.${op.property} = '${op.value}';`);
        } else {
          lines.push(`  ctx.${op.property} = ${op.value};`);
        }
      }
    });

    lines.push('');
    lines.push('  ctx.restore();');
    lines.push('}');
    lines.push('');
  });

  // Main initialization
  lines.push('function initCanvasReplay() {');
  lines.push('  const canvases = document.querySelectorAll("canvas");');
  lines.push('  canvases.forEach((canvas, i) => {');
  lines.push('    const ctx = canvas.getContext("2d");');
  lines.push('    if (!ctx) return;');
  lines.push('');
  lines.push('    const replayFn = window[`replayCanvas_${canvas.id || "default"}`];');
  lines.push('    if (replayFn) replayFn(ctx);');
  lines.push('  });');
  lines.push('}');
  lines.push('');
  lines.push('// Run on DOM ready');
  lines.push('document.addEventListener("DOMContentLoaded", initCanvasReplay);');

  return lines.join('\n');
}

/**
 * Generate WebGL initialization code
 * @param {Object} data - webgl extraction data
 * @returns {string} JavaScript code
 */
export function generateWebGLJS(data) {
  if (!data) return '';

  const hasContent = (data.shaders?.length > 0) ||
                     (data.programs?.length > 0) ||
                     (data.drawCalls?.length > 0);

  if (!hasContent) return '';

  const lines = [];
  lines.push('// WebGL Initialization (from extraction)');
  lines.push('');

  // Shader sources
  if (data.shaders && data.shaders.length > 0) {
    lines.push('const webglShaders = {');

    const vertexShaders = data.shaders.filter(s => s.type === 'vertex');
    const fragmentShaders = data.shaders.filter(s => s.type === 'fragment');

    if (vertexShaders.length > 0) {
      lines.push('  vertex: [');
      vertexShaders.forEach(shader => {
        lines.push('    `' + (shader.source || '').replace(/`/g, '\\`') + '`,');
      });
      lines.push('  ],');
    }

    if (fragmentShaders.length > 0) {
      lines.push('  fragment: [');
      fragmentShaders.forEach(shader => {
        lines.push('    `' + (shader.source || '').replace(/`/g, '\\`') + '`,');
      });
      lines.push('  ],');
    }

    lines.push('};');
    lines.push('');
  }

  // Uniforms
  if (data.uniforms && data.uniforms.length > 0) {
    lines.push('const webglUniforms = [');
    data.uniforms.forEach(uniform => {
      lines.push('  {');
      lines.push(`    name: '${uniform.name}',`);
      lines.push(`    type: '${uniform.type}',`);
      if (uniform.value !== undefined) {
        lines.push(`    value: ${JSON.stringify(uniform.value)},`);
      }
      lines.push('  },');
    });
    lines.push('];');
    lines.push('');
  }

  // WebGL initialization function
  lines.push('function initWebGL(canvas) {');
  lines.push('  const gl = canvas.getContext("webgl") || canvas.getContext("webgl2");');
  lines.push('  if (!gl) {');
  lines.push('    console.warn("[WebGL] Not supported");');
  lines.push('    return null;');
  lines.push('  }');
  lines.push('');
  lines.push('  // Compile shaders');
  lines.push('  function compileShader(gl, source, type) {');
  lines.push('    const shader = gl.createShader(type);');
  lines.push('    gl.shaderSource(shader, source);');
  lines.push('    gl.compileShader(shader);');
  lines.push('    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {');
  lines.push('      console.error("[WebGL] Shader compile error:", gl.getShaderInfoLog(shader));');
  lines.push('      return null;');
  lines.push('    }');
  lines.push('    return shader;');
  lines.push('  }');
  lines.push('');
  lines.push('  // Create program from shaders');
  lines.push('  if (webglShaders.vertex?.length && webglShaders.fragment?.length) {');
  lines.push('    const vs = compileShader(gl, webglShaders.vertex[0], gl.VERTEX_SHADER);');
  lines.push('    const fs = compileShader(gl, webglShaders.fragment[0], gl.FRAGMENT_SHADER);');
  lines.push('');
  lines.push('    if (vs && fs) {');
  lines.push('      const program = gl.createProgram();');
  lines.push('      gl.attachShader(program, vs);');
  lines.push('      gl.attachShader(program, fs);');
  lines.push('      gl.linkProgram(program);');
  lines.push('');
  lines.push('      if (gl.getProgramParameter(program, gl.LINK_STATUS)) {');
  lines.push('        gl.useProgram(program);');
  lines.push('        console.log("[WebGL] Program linked successfully");');
  lines.push('      }');
  lines.push('    }');
  lines.push('  }');
  lines.push('');
  lines.push('  return gl;');
  lines.push('}');
  lines.push('');

  // State info
  if (data.stateChanges && data.stateChanges.length > 0) {
    lines.push(`// WebGL state changes captured: ${data.stateChanges.length}`);
  }
  if (data.drawCalls && data.drawCalls.length > 0) {
    lines.push(`// WebGL draw calls captured: ${data.drawCalls.length}`);
  }

  return lines.join('\n');
}

/**
 * Generate tool behavior registry
 * @param {Object} data - behavioral extraction data with tool behaviors
 * @returns {string} JavaScript code
 */
export function generateToolBehaviorsJS(data) {
  if (!data || !data.toolBehaviors) return '';

  const lines = [];
  lines.push('// Tool Behavior Registry (from extraction)');
  lines.push('');
  lines.push('const toolBehaviors = {');

  Object.entries(data.toolBehaviors).forEach(([toolId, behavior]) => {
    lines.push(`  '${toolId}': {`);
    lines.push(`    type: '${behavior.patternType || 'unknown'}',`);
    lines.push(`    description: '${behavior.description || ''}',`);

    if (behavior.interactionPattern) {
      lines.push(`    interactionPattern: '${behavior.interactionPattern}',`);
    }

    // Generate mouse handlers
    if (behavior.canvasOperations?.length > 0) {
      lines.push('    onMouseMove(canvas, e) {');
      lines.push('      const ctx = canvas.getContext("2d");');
      lines.push('      const rect = canvas.getBoundingClientRect();');
      lines.push('      const x = e.clientX - rect.left;');
      lines.push('      const y = e.clientY - rect.top;');
      lines.push('      // Captured behavior would be replayed here');
      lines.push('    },');
    }

    lines.push('  },');
  });

  lines.push('};');
  lines.push('');

  // Wire up active tool
  lines.push('// Wire tool behaviors to canvas');
  lines.push('function wireToolBehaviors(canvas, getActiveTool) {');
  lines.push('  canvas.addEventListener("mousemove", (e) => {');
  lines.push('    const tool = getActiveTool();');
  lines.push('    toolBehaviors[tool]?.onMouseMove?.(canvas, e);');
  lines.push('  });');
  lines.push('  canvas.addEventListener("mousedown", (e) => {');
  lines.push('    const tool = getActiveTool();');
  lines.push('    toolBehaviors[tool]?.onMouseDown?.(canvas, e);');
  lines.push('  });');
  lines.push('  canvas.addEventListener("mouseup", (e) => {');
  lines.push('    const tool = getActiveTool();');
  lines.push('    toolBehaviors[tool]?.onMouseUp?.(canvas, e);');
  lines.push('  });');
  lines.push('}');

  return lines.join('\n');
}

/**
 * Combine all canvas generation
 * @param {Object} extractionData - Full extraction results
 * @returns {string} Combined JavaScript
 */
export function generateAllCanvasJS(extractionData) {
  const sections = [];

  sections.push(`/**
 * V6 Canvas Integration
 * Generated from extraction data
 * ${new Date().toISOString()}
 */
`);

  // Canvas 2D
  const canvas2DJS = generateCanvas2DJS(extractionData.canvas2d);
  if (canvas2DJS) {
    sections.push('// ============================================');
    sections.push('// CANVAS 2D REPLAY');
    sections.push('// ============================================');
    sections.push(canvas2DJS);
    sections.push('');
  }

  // WebGL
  const webglJS = generateWebGLJS(extractionData.webgl);
  if (webglJS) {
    sections.push('// ============================================');
    sections.push('// WEBGL INITIALIZATION');
    sections.push('// ============================================');
    sections.push(webglJS);
    sections.push('');
  }

  // Tool behaviors
  const toolsJS = generateToolBehaviorsJS(extractionData.behavioral);
  if (toolsJS) {
    sections.push('// ============================================');
    sections.push('// TOOL BEHAVIORS');
    sections.push('// ============================================');
    sections.push(toolsJS);
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Get statistics about canvas data
 * @param {Object} extractionData - Full extraction results
 * @returns {Object} Stats
 */
export function getCanvasStats(extractionData) {
  return {
    canvas2d: {
      operations: extractionData.canvas2d?.operations?.length || 0,
      canvases: extractionData.canvas2d?.canvases?.length || 0,
    },
    webgl: {
      shaders: extractionData.webgl?.shaders?.length || 0,
      programs: extractionData.webgl?.programs?.length || 0,
      drawCalls: extractionData.webgl?.drawCalls?.length || 0,
      uniforms: extractionData.webgl?.uniforms?.length || 0,
    },
    toolBehaviors: Object.keys(extractionData.behavioral?.toolBehaviors || {}).length,
  };
}

export default {
  generateCanvas2DJS,
  generateWebGLJS,
  generateToolBehaviorsJS,
  generateAllCanvasJS,
  getCanvasStats,
};
