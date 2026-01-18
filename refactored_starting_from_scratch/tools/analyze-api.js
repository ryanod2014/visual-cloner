#!/usr/bin/env node
/**
 * API Spec Analyzer
 *
 * Analyzes extracted web apps to generate comprehensive API specifications.
 * Parses network data from extraction checkpoints and generates detailed
 * endpoint documentation for backend reconstruction.
 *
 * Usage:
 *   node tools/analyze-api.js <extraction-dir>
 *   node tools/analyze-api.js ./output/app.example.com-1234567890/
 *   node tools/analyze-api.js --help
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { createHash } from 'crypto';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const c = (color, text) => `${colors[color]}${text}${colors.reset}`;

// Help message
const HELP = `
${c('cyan', c('bold', 'API Spec Analyzer'))}

Analyzes extracted web apps to generate API specifications for backend reconstruction.

${c('yellow', 'Usage:')}
  node tools/analyze-api.js <extraction-dir>

${c('yellow', 'Options:')}
  --help, -h     Show this help message

${c('yellow', 'Examples:')}
  node tools/analyze-api.js ./output/app.gohighlevel.com-1768017088003/
  node tools/analyze-api.js ../output/myapp/

${c('yellow', 'Output:')}
  Generates api-spec.json in the extraction directory containing:
  - All detected API endpoints
  - Request/response schemas
  - Authentication patterns
  - Call sequences
  - Type definitions

${c('dim', 'The generated spec can be used by backend engineers to rebuild the API.')}
`;

/**
 * Checks if a URL is likely an API call vs static resource
 */
function isApiCall(url, contentType) {
  // Parse URL
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }

  const path = parsedUrl.pathname.toLowerCase();
  const ext = path.split('.').pop();

  // Exclude static file extensions
  const staticExtensions = [
    'js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'woff', 'woff2', 'ttf', 'eot',
    'mp4', 'webm', 'mp3', 'wav', 'pdf', 'zip', 'map'
  ];

  if (staticExtensions.includes(ext)) {
    return false;
  }

  // Include API path patterns
  const apiPatterns = [
    '/api/',
    '/v1/',
    '/v2/',
    '/v3/',
    '/graphql',
    '/rest/',
    '/data/',
    '/internal-tools/',
    '/backend.',
  ];

  if (apiPatterns.some(pattern => path.includes(pattern))) {
    return true;
  }

  // Check content type
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.includes('application/json') ||
        ct.includes('application/vnd.api+json') ||
        ct.includes('application/ld+json')) {
      return true;
    }
  }

  // If it returns JSON-like content type and has no file extension
  if (!ext || ext.length > 5) {
    if (contentType && contentType.includes('json')) {
      return true;
    }
  }

  return false;
}

/**
 * Infers type from a value
 */
function inferType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Generates JSON schema from a value
 */
function generateSchema(value, maxDepth = 3, currentDepth = 0) {
  if (currentDepth > maxDepth) {
    return { type: 'unknown', note: 'max depth reached' };
  }

  if (value === null) {
    return { type: 'null' };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: 'array', items: {} };
    }
    // Use first item as schema
    return {
      type: 'array',
      items: generateSchema(value[0], maxDepth, currentDepth + 1)
    };
  }

  if (typeof value === 'object') {
    const properties = {};
    for (const [key, val] of Object.entries(value)) {
      properties[key] = generateSchema(val, maxDepth, currentDepth + 1);
    }
    return {
      type: 'object',
      properties
    };
  }

  return { type: typeof value };
}

/**
 * Extracts types from schema
 */
function extractTypes(schema, typeName, types = {}) {
  if (schema.type === 'object' && schema.properties) {
    const typeSchema = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (prop.type === 'object') {
        const nestedTypeName = `${typeName}_${key}`;
        typeSchema[key] = nestedTypeName;
        extractTypes(prop, nestedTypeName, types);
      } else if (prop.type === 'array' && prop.items?.type === 'object') {
        const nestedTypeName = `${typeName}_${key}_Item`;
        typeSchema[key] = `${nestedTypeName}[]`;
        extractTypes(prop.items, nestedTypeName, types);
      } else {
        typeSchema[key] = prop.type;
      }
    }
    types[typeName] = typeSchema;
  }
  return types;
}

/**
 * Parses query parameters from URL
 */
function parseQueryParams(url) {
  try {
    const parsed = new URL(url);
    const params = {};
    for (const [key, value] of parsed.searchParams.entries()) {
      // Infer type from value
      let type = 'string';
      let example = value;

      if (value === 'true' || value === 'false') {
        type = 'boolean';
        example = value === 'true';
      } else if (!isNaN(value) && value !== '') {
        type = 'number';
        example = Number(value);
      }

      params[key] = { type, example };
    }
    return Object.keys(params).length > 0 ? params : null;
  } catch {
    return null;
  }
}

/**
 * Detects authentication pattern
 */
function detectAuth(resources) {
  const authPatterns = {
    bearer: { headerName: 'authorization', pattern: /^bearer\s+/i },
    apiKey: { headerName: 'x-api-key', pattern: /.+/ },
    cookie: { headerName: 'cookie', pattern: /.+/ },
  };

  for (const resource of resources) {
    if (resource.requestHeaders) {
      for (const [type, config] of Object.entries(authPatterns)) {
        const headerValue = resource.requestHeaders[config.headerName];
        if (headerValue && config.pattern.test(headerValue)) {
          return {
            type,
            headerName: config.headerName,
            pattern: type === 'bearer' ? 'Bearer <token>' : '<value>',
          };
        }
      }
    }
  }

  return { type: 'unknown' };
}

/**
 * Generates endpoint ID
 */
function generateEndpointId(method, path) {
  const cleanPath = path
    .replace(/^\//, '')
    .replace(/\//g, '-')
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return `${method.toLowerCase()}-${cleanPath || 'root'}`;
}

/**
 * Analyzes manifest.json for API calls
 */
function analyzeManifest(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const apiCalls = [];

  if (!manifest.resources || !Array.isArray(manifest.resources)) {
    return { sourceUrl: manifest.url, resources: [] };
  }

  for (const resource of manifest.resources) {
    if (isApiCall(resource.url, resource.contentType)) {
      apiCalls.push({
        url: resource.url,
        contentType: resource.contentType,
        size: resource.size,
      });
    }
  }

  return {
    sourceUrl: manifest.url,
    timestamp: manifest.timestamp,
    resources: apiCalls,
  };
}

/**
 * Analyzes mock data file
 */
function analyzeMockData(mockDataPath) {
  try {
    const data = JSON.parse(readFileSync(mockDataPath, 'utf-8'));
    return data;
  } catch {
    return null;
  }
}

/**
 * Generates API spec from analyzed data
 */
function generateApiSpec(sourceUrl, timestamp, apiResources, mockData) {
  const endpoints = [];
  const types = {};
  const methodCount = {};
  let endpointIdCounter = 1;

  // Process API resources from manifest
  for (const resource of apiResources) {
    try {
      const parsedUrl = new URL(resource.url);
      const method = 'GET'; // Default, we don't have method info from manifest
      const path = parsedUrl.pathname;
      const queryParams = parseQueryParams(resource.url);

      methodCount[method] = (methodCount[method] || 0) + 1;

      const endpointId = generateEndpointId(method, path);

      endpoints.push({
        id: `${endpointId}-${endpointIdCounter++}`,
        method,
        url: resource.url,
        path,
        queryParams,
        requestHeaders: {},
        requestBody: null,
        response: {
          status: 200,
          contentType: resource.contentType,
          sample: null,
          schema: null,
        },
        calledAt: timestamp,
      });
    } catch (e) {
      // Skip invalid URLs
    }
  }

  // Process mock data to infer additional endpoint details
  if (mockData) {
    for (const [key, value] of Object.entries(mockData)) {
      const typeName = key.charAt(0).toUpperCase() + key.slice(1);
      const schema = generateSchema(value);
      extractTypes(schema, typeName, types);

      // Create synthetic endpoints for mock data
      const syntheticId = generateEndpointId('GET', `/api/${key}`);
      const syntheticEndpoint = {
        id: `${syntheticId}-synthetic`,
        method: 'GET',
        url: `${sourceUrl}/api/${key}`,
        path: `/api/${key}`,
        queryParams: null,
        requestHeaders: {},
        requestBody: null,
        response: {
          status: 200,
          contentType: 'application/json',
          sample: value,
          schema,
        },
        calledAt: timestamp,
        note: 'Inferred from mock data',
      };

      methodCount['GET'] = (methodCount['GET'] || 0) + 1;
      endpoints.push(syntheticEndpoint);
    }
  }

  // Detect auth from endpoints (stub implementation)
  const auth = { type: 'unknown' };

  return {
    generatedAt: new Date().toISOString(),
    sourceUrl,
    summary: {
      totalEndpoints: endpoints.length,
      methods: methodCount,
    },
    auth,
    endpoints,
    types,
    callSequence: endpoints.map((ep, index) => ({
      order: index + 1,
      endpointId: ep.id,
      timestamp: ep.calledAt,
    })),
  };
}

/**
 * Main analysis function
 */
async function analyzeExtraction(extractionDir) {
  const absPath = resolve(extractionDir);

  console.log(c('cyan', c('bold', '\n  API Spec Analyzer\n')));
  console.log(c('white', `  Analyzing: ${c('dim', absPath)}\n`));

  // Check if directory exists
  if (!existsSync(absPath)) {
    console.error(c('red', `Error: Directory not found: ${absPath}`));
    process.exit(1);
  }

  // Look for manifest.json
  const manifestPath = join(absPath, 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(c('red', `Error: manifest.json not found in ${absPath}`));
    console.log(c('dim', '\nExpected structure:'));
    console.log(c('dim', '  extraction-dir/'));
    console.log(c('dim', '    manifest.json       <- Required'));
    console.log(c('dim', '    mocks/data.json     <- Optional'));
    process.exit(1);
  }

  console.log(c('blue', '[1/4]') + ' Reading manifest.json...');
  const manifestData = analyzeManifest(manifestPath);
  console.log(c('green', `  Found ${manifestData.resources.length} potential API calls`));

  // Look for mock data
  console.log(c('blue', '\n[2/4]') + ' Checking for mock data...');
  const mockDataPath = join(absPath, 'mocks', 'data.json');
  let mockData = null;
  if (existsSync(mockDataPath)) {
    mockData = analyzeMockData(mockDataPath);
    console.log(c('green', `  Found mock data with ${Object.keys(mockData || {}).length} entities`));
  } else {
    console.log(c('dim', '  No mock data found (optional)'));
  }

  // Generate API spec
  console.log(c('blue', '\n[3/4]') + ' Generating API specification...');
  const apiSpec = generateApiSpec(
    manifestData.sourceUrl,
    manifestData.timestamp,
    manifestData.resources,
    mockData
  );

  console.log(c('green', `  Generated spec with ${apiSpec.summary.totalEndpoints} endpoints`));
  console.log(c('dim', `  - Methods: ${JSON.stringify(apiSpec.summary.methods)}`));
  console.log(c('dim', `  - Types extracted: ${Object.keys(apiSpec.types).length}`));

  // Write API spec
  console.log(c('blue', '\n[4/4]') + ' Writing api-spec.json...');
  const outputPath = join(absPath, 'api-spec.json');
  writeFileSync(outputPath, JSON.stringify(apiSpec, null, 2));
  console.log(c('green', `  Written to: ${outputPath}`));

  // Summary
  console.log(c('green', '\n' + '='.repeat(50)));
  console.log(c('green', c('bold', '  Analysis Complete!')));
  console.log(c('green', '='.repeat(50)));
  console.log('');
  console.log(`  ${c('white', 'Endpoints:')} ${apiSpec.summary.totalEndpoints}`);
  console.log(`  ${c('white', 'Types:')} ${Object.keys(apiSpec.types).length}`);
  console.log(`  ${c('white', 'Output:')} ${c('dim', outputPath)}`);
  console.log('');

  // Show sample endpoints
  if (apiSpec.endpoints.length > 0) {
    console.log(c('yellow', 'Sample endpoints:'));
    apiSpec.endpoints.slice(0, 5).forEach(ep => {
      console.log(`  ${c('cyan', ep.method.padEnd(6))} ${c('dim', ep.path)}`);
    });
    if (apiSpec.endpoints.length > 5) {
      console.log(c('dim', `  ... and ${apiSpec.endpoints.length - 5} more`));
    }
    console.log('');
  }
}

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  return {
    extractionDir: args[0],
  };
}

// Main
async function main() {
  const { extractionDir } = parseArgs();

  try {
    await analyzeExtraction(extractionDir);
  } catch (error) {
    console.error(c('red', `\nError: ${error.message}`));
    if (process.env.DEBUG) {
      console.error(c('dim', error.stack));
    }
    process.exit(1);
  }
}

main();
