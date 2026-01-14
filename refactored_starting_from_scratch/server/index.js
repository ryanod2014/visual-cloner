/**
 * Server Generator
 * Generates a self-contained serve.js for extracted sites
 */

import fs from 'fs';
import path from 'path';
import { generateServeTemplate, generatePackageJson } from './template.js';
import { generateAllMocks, getMockCode } from './mocks/index.js';
import { createRouter, MIME_TYPES } from './router.js';

/**
 * Generate server files for an extracted site
 * @param {string} outputDir - Output directory path
 * @param {Object} urlMap - URL to local file mapping
 * @param {Object} config - Configuration options
 * @param {number} config.port - Server port (default: 3000)
 * @param {boolean} config.enableProxy - Enable proxy fallback
 * @param {boolean} config.enableCors - Enable CORS headers
 * @param {Object} config.mocks - Mock configuration
 * @param {boolean} config.writePackageJson - Write package.json (default: true)
 * @param {boolean} config.writeMockFiles - Write separate mock files (default: false)
 * @returns {Object} Result with paths to generated files
 */
export async function generateServer(outputDir, urlMap = {}, config = {}) {
  const results = {
    success: false,
    files: [],
    errors: []
  };

  try {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate serve.js content
    const serveContent = generateServeTemplate({
      port: config.port || 3000,
      enableProxy: config.enableProxy || false,
      enableCors: config.enableCors !== false,
      mocks: config.mocks || { api: true, auth: true, analytics: true }
    });

    // Write serve.js
    const servePath = path.join(outputDir, 'serve.js');
    fs.writeFileSync(servePath, serveContent, 'utf-8');
    results.files.push(servePath);
    console.log(`[Server] Generated: ${servePath}`);

    // Write package.json if requested
    if (config.writePackageJson !== false) {
      const packagePath = path.join(outputDir, 'package.json');

      // Only write if it doesn't exist or if forced
      if (!fs.existsSync(packagePath) || config.forcePackageJson) {
        fs.writeFileSync(packagePath, generatePackageJson(), 'utf-8');
        results.files.push(packagePath);
        console.log(`[Server] Generated: ${packagePath}`);
      }
    }

    // Write separate mock files if requested
    if (config.writeMockFiles) {
      const mocksDir = path.join(outputDir, '__mocks__');
      if (!fs.existsSync(mocksDir)) {
        fs.mkdirSync(mocksDir, { recursive: true });
      }

      const mockCode = getMockCode(config.mocks);

      // Write individual mock files
      const apiMockPath = path.join(mocksDir, 'api-mock.js');
      fs.writeFileSync(apiMockPath, mockCode.api, 'utf-8');
      results.files.push(apiMockPath);

      const authMockPath = path.join(mocksDir, 'auth-mock.js');
      fs.writeFileSync(authMockPath, mockCode.auth, 'utf-8');
      results.files.push(authMockPath);

      const analyticsMockPath = path.join(mocksDir, 'analytics-mock.js');
      fs.writeFileSync(analyticsMockPath, mockCode.analytics, 'utf-8');
      results.files.push(analyticsMockPath);

      // Write combined mocks file
      const allMocksPath = path.join(mocksDir, 'all-mocks.js');
      fs.writeFileSync(allMocksPath, mockCode.all, 'utf-8');
      results.files.push(allMocksPath);

      console.log(`[Server] Generated mock files in: ${mocksDir}`);
    }

    // Ensure meta directory exists and write url-map.json if provided
    if (urlMap && Object.keys(urlMap).length > 0) {
      const metaDir = path.join(outputDir, 'meta');
      if (!fs.existsSync(metaDir)) {
        fs.mkdirSync(metaDir, { recursive: true });
      }

      const urlMapPath = path.join(metaDir, 'url-map.json');
      fs.writeFileSync(urlMapPath, JSON.stringify(urlMap, null, 2), 'utf-8');
      results.files.push(urlMapPath);
      console.log(`[Server] Generated: ${urlMapPath}`);
    }

    results.success = true;
  } catch (error) {
    results.errors.push(error.message);
    console.error(`[Server] Error: ${error.message}`);
  }

  return results;
}

/**
 * Create serve.js content without writing to disk
 * @param {Object} config - Configuration options
 * @returns {string} serve.js content
 */
export function createServeContent(config = {}) {
  return generateServeTemplate(config);
}

/**
 * Write serve.js to a specific path
 * @param {string} filePath - Path to write serve.js
 * @param {Object} config - Configuration options
 * @returns {boolean} Success status
 */
export function writeServeFile(filePath, config = {}) {
  try {
    const content = generateServeTemplate(config);
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error(`[Server] Failed to write serve.js: ${error.message}`);
    return false;
  }
}

/**
 * Validate an extracted site's server setup
 * @param {string} outputDir - Output directory to validate
 * @returns {Object} Validation results
 */
export function validateServerSetup(outputDir) {
  const results = {
    valid: true,
    warnings: [],
    errors: [],
    files: {
      serveJs: false,
      packageJson: false,
      indexHtml: false,
      urlMap: false,
      manifest: false
    }
  };

  // Check serve.js
  const servePath = path.join(outputDir, 'serve.js');
  if (fs.existsSync(servePath)) {
    results.files.serveJs = true;
  } else {
    results.errors.push('serve.js not found');
    results.valid = false;
  }

  // Check package.json
  const packagePath = path.join(outputDir, 'package.json');
  if (fs.existsSync(packagePath)) {
    results.files.packageJson = true;
  } else {
    results.warnings.push('package.json not found - run npm init');
  }

  // Check index.html
  const indexPath = path.join(outputDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    results.files.indexHtml = true;
  } else {
    results.errors.push('index.html not found');
    results.valid = false;
  }

  // Check url-map.json
  const urlMapPath = path.join(outputDir, 'meta', 'url-map.json');
  if (fs.existsSync(urlMapPath)) {
    results.files.urlMap = true;
  } else {
    results.warnings.push('meta/url-map.json not found - URL routing may not work');
  }

  // Check manifest.json
  const manifestPath = path.join(outputDir, 'meta', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    results.files.manifest = true;
  } else {
    results.warnings.push('meta/manifest.json not found - original URL info missing');
  }

  return results;
}

/**
 * Get server module information
 * @returns {Object} Module metadata
 */
export function getServerInfo() {
  return {
    name: 'Visual Cloner Server Generator',
    version: '1.0.0',
    exports: [
      'generateServer',
      'createServeContent',
      'writeServeFile',
      'validateServerSetup',
      'generateAllMocks',
      'createRouter',
      'MIME_TYPES'
    ],
    mocks: ['api', 'auth', 'analytics']
  };
}

// Re-export useful utilities
export { generateServeTemplate, generatePackageJson } from './template.js';
export { generateAllMocks, getMockCode, MOCK_TYPES, DEFAULT_CONFIG } from './mocks/index.js';
export { createRouter, MIME_TYPES, getContentType, getExtension } from './router.js';

export default {
  generateServer,
  createServeContent,
  writeServeFile,
  validateServerSetup,
  getServerInfo
};
