/**
 * Shader Parser Utility
 *
 * Parses GLSL shader source code to extract:
 *   - Uniform declarations (name, type)
 *   - Attribute declarations (name, type)
 *   - Varying declarations (name, type)
 *   - Precision qualifiers
 *
 * Usage:
 *   import { parseUniforms, parseShader } from './utils/shader-parser.js';
 *
 *   const uniforms = parseUniforms(shaderSource);
 *   // [{ name: 'uTime', type: 'float' }, { name: 'uResolution', type: 'vec2' }]
 *
 *   const parsed = parseShader(shaderSource);
 *   // { uniforms: [...], attributes: [...], varyings: [...], precision: '...' }
 */

/**
 * GLSL types for validation
 */
const GLSL_TYPES = [
  // Scalars
  'float', 'int', 'uint', 'bool',
  // Vectors
  'vec2', 'vec3', 'vec4',
  'ivec2', 'ivec3', 'ivec4',
  'uvec2', 'uvec3', 'uvec4',
  'bvec2', 'bvec3', 'bvec4',
  // Matrices
  'mat2', 'mat3', 'mat4',
  'mat2x2', 'mat2x3', 'mat2x4',
  'mat3x2', 'mat3x3', 'mat3x4',
  'mat4x2', 'mat4x3', 'mat4x4',
  // Samplers
  'sampler2D', 'samplerCube', 'sampler3D',
  'sampler2DShadow', 'samplerCubeShadow',
  'sampler2DArray', 'sampler2DArrayShadow',
  'isampler2D', 'isampler3D', 'isamplerCube', 'isampler2DArray',
  'usampler2D', 'usampler3D', 'usamplerCube', 'usampler2DArray',
];

/**
 * Parse uniform declarations from GLSL source
 *
 * @param {string} source - GLSL shader source code
 * @returns {Array<{name: string, type: string, arraySize?: number}>}
 */
export function parseUniforms(source) {
  if (!source || typeof source !== 'string') {
    return [];
  }

  const uniforms = [];

  // Pattern: uniform <type> <name>[<arraySize>];
  // Handles: uniform float uTime;
  //          uniform vec3 uColors[10];
  //          uniform sampler2D uTexture;
  const uniformRegex = /uniform\s+([\w]+)\s+([\w]+)(?:\s*\[\s*(\d+)\s*\])?/g;

  let match;
  while ((match = uniformRegex.exec(source)) !== null) {
    const [, type, name, arraySize] = match;

    // Validate type
    if (GLSL_TYPES.includes(type)) {
      const uniform = { name, type };
      if (arraySize) {
        uniform.arraySize = parseInt(arraySize, 10);
      }
      uniforms.push(uniform);
    }
  }

  return uniforms;
}

/**
 * Parse attribute declarations from GLSL source (vertex shaders)
 *
 * @param {string} source - GLSL shader source code
 * @returns {Array<{name: string, type: string}>}
 */
export function parseAttributes(source) {
  if (!source || typeof source !== 'string') {
    return [];
  }

  const attributes = [];

  // Pattern: attribute <type> <name>;
  // Also handles: in <type> <name>; (GLSL 300+)
  const attributeRegex = /(?:attribute|in)\s+([\w]+)\s+([\w]+)\s*;/g;

  let match;
  while ((match = attributeRegex.exec(source)) !== null) {
    const [, type, name] = match;

    if (GLSL_TYPES.includes(type)) {
      attributes.push({ name, type });
    }
  }

  return attributes;
}

/**
 * Parse varying declarations from GLSL source
 *
 * @param {string} source - GLSL shader source code
 * @returns {Array<{name: string, type: string}>}
 */
export function parseVaryings(source) {
  if (!source || typeof source !== 'string') {
    return [];
  }

  const varyings = [];

  // Pattern: varying <type> <name>;
  // Also handles: out <type> <name>; (vertex) / in <type> <name>; (fragment) in GLSL 300+
  const varyingRegex = /varying\s+([\w]+)\s+([\w]+)\s*;/g;

  let match;
  while ((match = varyingRegex.exec(source)) !== null) {
    const [, type, name] = match;

    if (GLSL_TYPES.includes(type)) {
      varyings.push({ name, type });
    }
  }

  return varyings;
}

/**
 * Parse precision qualifier from GLSL source
 *
 * @param {string} source - GLSL shader source code
 * @returns {string|null} - 'lowp', 'mediump', or 'highp'
 */
export function parsePrecision(source) {
  if (!source || typeof source !== 'string') {
    return null;
  }

  // Pattern: precision <qualifier> float;
  const precisionRegex = /precision\s+(lowp|mediump|highp)\s+float\s*;/;
  const match = source.match(precisionRegex);

  return match ? match[1] : null;
}

/**
 * Parse GLSL version from source
 *
 * @param {string} source - GLSL shader source code
 * @returns {string|null} - e.g., '300 es', '100', null
 */
export function parseVersion(source) {
  if (!source || typeof source !== 'string') {
    return null;
  }

  // Pattern: #version <number> [es]
  const versionRegex = /#version\s+(\d+(?:\s+es)?)/i;
  const match = source.match(versionRegex);

  return match ? match[1].trim() : null;
}

/**
 * Full shader parse - extracts all declarations
 *
 * @param {string} source - GLSL shader source code
 * @returns {Object} Parsed shader data
 */
export function parseShader(source) {
  return {
    uniforms: parseUniforms(source),
    attributes: parseAttributes(source),
    varyings: parseVaryings(source),
    precision: parsePrecision(source),
    version: parseVersion(source),
    lineCount: source ? source.split('\n').length : 0,
    charCount: source ? source.length : 0,
  };
}

/**
 * Check if shader source appears to be a vertex shader
 *
 * @param {string} source - GLSL shader source code
 * @returns {boolean}
 */
export function isVertexShader(source) {
  if (!source) return false;

  // Vertex shaders typically have:
  // - gl_Position assignment
  // - attribute declarations
  return (
    source.includes('gl_Position') ||
    /attribute\s+\w+\s+\w+/.test(source)
  );
}

/**
 * Check if shader source appears to be a fragment shader
 *
 * @param {string} source - GLSL shader source code
 * @returns {boolean}
 */
export function isFragmentShader(source) {
  if (!source) return false;

  // Fragment shaders typically have:
  // - gl_FragColor assignment (GLSL 100)
  // - out vec4 (GLSL 300+)
  return (
    source.includes('gl_FragColor') ||
    source.includes('gl_FragData') ||
    /out\s+vec4\s+\w+/.test(source)
  );
}

export default {
  parseUniforms,
  parseAttributes,
  parseVaryings,
  parsePrecision,
  parseVersion,
  parseShader,
  isVertexShader,
  isFragmentShader,
  GLSL_TYPES,
};
