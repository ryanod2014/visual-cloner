#!/usr/bin/env node
/**
 * V7 Backend Mapper
 * Documents all backend dependencies and creates a clear blueprint for engineers
 * Shows exactly what needs to be mocked/recreated for full functionality
 */

import fs from 'fs';
import path from 'path';

export class V7BackendMapper {
  constructor(extractedDir) {
    this.extractedDir = extractedDir;
    this.code = null;
    this.dependencies = {
      apiEndpoints: [],
      websockets: [],
      authentication: [],
      externalServices: [],
      dataStructures: [],
      storageUsage: []
    };
  }

  /**
   * Load all extracted code for analysis
   */
  loadCode() {
    const jsFiles = this.findJSFiles(this.extractedDir);
    this.code = jsFiles.map(file => {
      return {
        path: file,
        content: fs.readFileSync(file, 'utf-8')
      };
    }).reduce((acc, file) => acc + '\n' + file.content, '');

    console.log(`Loaded ${jsFiles.length} JavaScript files for backend analysis`);
    return this.code;
  }

  /**
   * Map all backend dependencies
   */
  mapBackend() {
    if (!this.code) this.loadCode();

    console.log('\n=== MAPPING BACKEND DEPENDENCIES ===\n');

    this.dependencies = {
      apiEndpoints: this.mapAPIEndpoints(),
      websockets: this.mapWebSockets(),
      authentication: this.mapAuthentication(),
      externalServices: this.mapExternalServices(),
      dataStructures: this.mapDataStructures(),
      storageUsage: this.mapStorageUsage()
    };

    return this.dependencies;
  }

  /**
   * Map all API endpoints
   */
  mapAPIEndpoints() {
    console.log('Mapping API endpoints...');
    const endpoints = [];
    const seen = new Set();

    // Pattern 1: fetch() calls
    const fetchCalls = this.code.matchAll(/fetch\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{([^}]+)\}/gs);
    for (const match of fetchCalls) {
      const url = match[1];
      const options = match[2];

      if (url.startsWith('/api') || url.startsWith('http')) {
        const key = url;
        if (!seen.has(key)) {
          seen.add(key);

          // Extract method
          const methodMatch = options.match(/method\s*:\s*['"](\w+)['"]/);
          const method = methodMatch ? methodMatch[1] : 'GET';

          // Extract body structure
          const bodyMatch = options.match(/body\s*:\s*JSON\.stringify\(([^)]+)\)/);
          const body = bodyMatch ? bodyMatch[1].trim() : null;

          // Extract headers
          const headersMatch = options.match(/headers\s*:\s*\{([^}]+)\}/);
          const headers = headersMatch ? headersMatch[1].trim() : null;

          endpoints.push({
            url: url,
            method: method,
            requestBody: body,
            headers: headers,
            type: 'fetch',
            isExternal: url.startsWith('http')
          });
        }
      }
    }

    // Pattern 2: XMLHttpRequest
    const xhrCalls = this.code.matchAll(/\.open\s*\(\s*['"](\w+)['"]\s*,\s*['"]([^'"]+)['"]/g);
    for (const match of xhrCalls) {
      const method = match[1];
      const url = match[2];

      if (url.startsWith('/api') || url.startsWith('http')) {
        const key = url;
        if (!seen.has(key)) {
          seen.add(key);
          endpoints.push({
            url: url,
            method: method,
            type: 'XMLHttpRequest',
            isExternal: url.startsWith('http')
          });
        }
      }
    }

    // Pattern 3: Axios/other HTTP libraries
    const axiosCalls = this.code.matchAll(/axios\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g);
    for (const match of axiosCalls) {
      const method = match[1].toUpperCase();
      const url = match[2];

      if (!seen.has(url)) {
        seen.add(url);
        endpoints.push({
          url: url,
          method: method,
          type: 'axios',
          isExternal: url.startsWith('http')
        });
      }
    }

    console.log(`  Found ${endpoints.length} API endpoints`);
    return endpoints;
  }

  /**
   * Map WebSocket connections
   */
  mapWebSockets() {
    console.log('Mapping WebSocket connections...');
    const websockets = [];

    // Pattern: new WebSocket(url)
    const wsCalls = this.code.matchAll(/new\s+WebSocket\s*\(\s*['"]([^'"]+)['"]/g);
    for (const match of wsCalls) {
      websockets.push({
        url: match[1],
        protocol: match[1].startsWith('wss://') ? 'WSS' : 'WS'
      });
    }

    console.log(`  Found ${websockets.length} WebSocket connections`);
    return websockets;
  }

  /**
   * Map authentication mechanisms
   */
  mapAuthentication() {
    console.log('Mapping authentication...');
    const auth = [];

    // Pattern 1: Bearer tokens
    if (this.code.includes('Bearer') || this.code.includes('Authorization')) {
      const tokenPatterns = this.code.matchAll(/['"](Bearer\s+[^'"]+)['"]/g);
      for (const match of tokenPatterns) {
        auth.push({
          type: 'Bearer Token',
          usage: 'Authorization header',
          example: match[1]
        });
        break; // Just need one example
      }
    }

    // Pattern 2: API keys
    const apiKeyPatterns = this.code.matchAll(/['"]([xX]-[aA][pP][iI]-[kK][eE][yY])['"]\s*:\s*['"]([^'"]+)['"]/g);
    for (const match of apiKeyPatterns) {
      auth.push({
        type: 'API Key',
        headerName: match[1],
        usage: 'Custom header'
      });
      break;
    }

    // Pattern 3: Session cookies
    if (this.code.includes('document.cookie') || this.code.includes('Set-Cookie')) {
      const cookiePatterns = this.code.matchAll(/document\.cookie\s*=\s*['"]([^=]+)=/g);
      for (const match of cookiePatterns) {
        auth.push({
          type: 'Session Cookie',
          name: match[1],
          usage: 'Session management'
        });
      }
    }

    // Pattern 4: OAuth
    if (this.code.includes('oauth') || this.code.includes('OAuth')) {
      auth.push({
        type: 'OAuth',
        usage: 'Third-party authentication',
        detected: true
      });
    }

    // Pattern 5: JWT
    if (this.code.includes('jwt') || this.code.includes('JWT') || this.code.includes('jsonwebtoken')) {
      auth.push({
        type: 'JWT',
        usage: 'JSON Web Token authentication',
        detected: true
      });
    }

    console.log(`  Found ${auth.length} authentication mechanisms`);
    return auth;
  }

  /**
   * Map external services (CDNs, third-party APIs)
   */
  mapExternalServices() {
    console.log('Mapping external services...');
    const services = new Set();

    // Pattern: URLs to external domains
    const urlPatterns = this.code.matchAll(/https?:\/\/([a-z0-9.-]+)/gi);
    for (const match of urlPatterns) {
      const domain = match[1];

      // Skip common CDNs that are already captured
      if (domain.includes('cloudflare') ||
          domain.includes('jsdelivr') ||
          domain.includes('unpkg')) {
        continue;
      }

      // Identify service type
      let serviceType = 'Unknown';
      if (domain.includes('analytics') || domain.includes('google-analytics')) {
        serviceType = 'Analytics';
      } else if (domain.includes('stripe') || domain.includes('paypal')) {
        serviceType = 'Payment';
      } else if (domain.includes('firebase') || domain.includes('supabase')) {
        serviceType = 'Backend-as-a-Service';
      } else if (domain.includes('api.')) {
        serviceType = 'API Service';
      }

      services.add(JSON.stringify({ domain, serviceType }));
    }

    const servicesList = Array.from(services).map(s => JSON.parse(s));
    console.log(`  Found ${servicesList.length} external services`);
    return servicesList;
  }

  /**
   * Map data structures (expected API responses)
   */
  mapDataStructures() {
    console.log('Mapping data structures...');
    const structures = [];

    // Pattern: Interface definitions
    const interfaces = this.code.matchAll(/interface\s+(\w+)\s*\{([^}]+)\}/gs);
    for (const match of interfaces) {
      structures.push({
        name: match[1],
        type: 'TypeScript Interface',
        fields: match[2].trim()
      });
    }

    // Pattern: Type definitions
    const types = this.code.matchAll(/type\s+(\w+)\s*=\s*\{([^}]+)\}/gs);
    for (const match of types) {
      structures.push({
        name: match[1],
        type: 'TypeScript Type',
        fields: match[2].trim()
      });
    }

    // Pattern: JSON.parse with expected structure
    const jsonParses = this.code.matchAll(/JSON\.parse\([^)]+\)\.(\w+)/g);
    const expectedFields = new Set();
    for (const match of jsonParses) {
      expectedFields.add(match[1]);
    }

    if (expectedFields.size > 0) {
      structures.push({
        name: 'InferredAPIResponse',
        type: 'Inferred from code',
        fields: Array.from(expectedFields).join(', ')
      });
    }

    console.log(`  Found ${structures.length} data structures`);
    return structures;
  }

  /**
   * Map storage usage (localStorage, indexedDB, etc.)
   */
  mapStorageUsage() {
    console.log('Mapping storage usage...');
    const storage = [];

    // localStorage
    const localStorageKeys = this.code.matchAll(/localStorage\.(?:getItem|setItem)\s*\(\s*['"]([^'"]+)['"]/g);
    const lsKeys = new Set();
    for (const match of localStorageKeys) {
      lsKeys.add(match[1]);
    }

    if (lsKeys.size > 0) {
      storage.push({
        type: 'localStorage',
        keys: Array.from(lsKeys),
        count: lsKeys.size
      });
    }

    // sessionStorage
    const sessionStorageKeys = this.code.matchAll(/sessionStorage\.(?:getItem|setItem)\s*\(\s*['"]([^'"]+)['"]/g);
    const ssKeys = new Set();
    for (const match of sessionStorageKeys) {
      ssKeys.add(match[1]);
    }

    if (ssKeys.size > 0) {
      storage.push({
        type: 'sessionStorage',
        keys: Array.from(ssKeys),
        count: ssKeys.size
      });
    }

    // IndexedDB
    if (this.code.includes('indexedDB')) {
      const dbNames = this.code.matchAll(/indexedDB\.open\s*\(\s*['"]([^'"]+)['"]/g);
      const dbNameList = [];
      for (const match of dbNames) {
        dbNameList.push(match[1]);
      }

      storage.push({
        type: 'IndexedDB',
        databases: dbNameList,
        count: dbNameList.length
      });
    }

    console.log(`  Found ${storage.length} storage mechanisms`);
    return storage;
  }

  /**
   * Helper: Find all JS files
   */
  findJSFiles(dir, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        this.findJSFiles(fullPath, files);
      } else if (entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Generate engineer-friendly documentation
   */
  generateDocumentation(dependencies) {
    const doc = {
      generatedAt: new Date().toISOString(),
      summary: {
        hasBackendDependencies: this.hasBackendDependencies(dependencies),
        requiresAuthentication: dependencies.authentication.length > 0,
        requiresExternalServices: dependencies.externalServices.length > 0,
        totalAPIEndpoints: dependencies.apiEndpoints.length,
        totalWebSockets: dependencies.websockets.length
      },
      dependencies: dependencies,
      engineerGuide: this.generateEngineerGuide(dependencies)
    };

    return doc;
  }

  /**
   * Check if app has backend dependencies
   */
  hasBackendDependencies(dependencies) {
    return dependencies.apiEndpoints.length > 0 ||
           dependencies.websockets.length > 0 ||
           dependencies.externalServices.length > 0;
  }

  /**
   * Generate engineer guide
   */
  generateEngineerGuide(dependencies) {
    const guide = {
      overview: '',
      requiredWork: [],
      implementation: []
    };

    // Determine complexity
    const apiCount = dependencies.apiEndpoints.length;
    const wsCount = dependencies.websockets.length;
    const authCount = dependencies.authentication.length;

    if (apiCount === 0 && wsCount === 0) {
      guide.overview = 'This is a fully client-side application with NO backend dependencies. It works 100% offline with no additional work required.';
      guide.requiredWork = ['None - app is fully functional offline'];
      return guide;
    }

    guide.overview = `This application requires backend services. Found ${apiCount} API endpoints, ${wsCount} WebSocket connections, and ${authCount} authentication mechanisms.`;

    // API endpoints
    if (apiCount > 0) {
      guide.requiredWork.push({
        task: 'Implement API Backend',
        priority: 'HIGH',
        complexity: apiCount > 10 ? 'High' : apiCount > 5 ? 'Medium' : 'Low',
        endpoints: apiCount,
        options: [
          'Option 1: Mock API responses with static JSON',
          'Option 2: Proxy requests to original backend',
          'Option 3: Build custom backend with same API contract'
        ]
      });

      guide.implementation.push({
        step: 1,
        title: 'Set up API mock server',
        code: `// Example: Express mock server
import express from 'express';
const app = express();

${dependencies.apiEndpoints.slice(0, 3).map(ep => `
app.${ep.method.toLowerCase()}('${ep.url}', (req, res) => {
  // TODO: Return appropriate response
  res.json({ success: true, data: [] });
});`).join('\n')}

app.listen(3000);`
      });
    }

    // WebSockets
    if (wsCount > 0) {
      guide.requiredWork.push({
        task: 'Implement WebSocket Server',
        priority: 'HIGH',
        complexity: 'Medium',
        connections: wsCount,
        options: [
          'Option 1: ws library for Node.js',
          'Option 2: Socket.io for easier implementation',
          'Option 3: Proxy to original WebSocket server'
        ]
      });

      guide.implementation.push({
        step: 2,
        title: 'Set up WebSocket server',
        code: `// Example: ws server
import { WebSocketServer } from 'ws';
const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    // TODO: Handle messages
    ws.send(JSON.stringify({ type: 'response' }));
  });
});`
      });
    }

    // Authentication
    if (authCount > 0) {
      guide.requiredWork.push({
        task: 'Implement Authentication',
        priority: 'MEDIUM',
        complexity: 'Medium',
        mechanisms: authCount,
        types: dependencies.authentication.map(a => a.type),
        options: [
          'Option 1: Mock authentication (always return success)',
          'Option 2: Simple JWT implementation',
          'Option 3: Full OAuth flow'
        ]
      });
    }

    // Storage
    if (dependencies.storageUsage.length > 0) {
      guide.requiredWork.push({
        task: 'Configure Client Storage',
        priority: 'LOW',
        complexity: 'Low',
        note: 'localStorage/sessionStorage work automatically. IndexedDB may need initialization.',
        storageTypes: dependencies.storageUsage.map(s => s.type)
      });
    }

    return guide;
  }

  /**
   * Generate markdown documentation
   */
  generateMarkdown(doc) {
    let md = '# Backend Dependencies Blueprint\n\n';
    md += `**Generated:** ${doc.generatedAt}\n\n`;

    md += '## Summary\n\n';
    md += `- Backend dependencies: ${doc.summary.hasBackendDependencies ? '✅ YES' : '❌ NO'}\n`;
    md += `- Requires authentication: ${doc.summary.requiresAuthentication ? '✅ YES' : '❌ NO'}\n`;
    md += `- External services: ${doc.summary.requiresExternalServices ? '✅ YES' : '❌ NO'}\n`;
    md += `- API endpoints: ${doc.summary.totalAPIEndpoints}\n`;
    md += `- WebSocket connections: ${doc.summary.totalWebSockets}\n\n`;

    md += '## Overview\n\n';
    md += `${doc.engineerGuide.overview}\n\n`;

    if (!doc.summary.hasBackendDependencies) {
      md += '**This app is fully functional offline with no additional work required.** 🎉\n';
      return md;
    }

    md += '## Required Work\n\n';
    doc.engineerGuide.requiredWork.forEach((task, i) => {
      md += `### ${i + 1}. ${task.task}\n\n`;
      md += `- **Priority:** ${task.priority}\n`;
      md += `- **Complexity:** ${task.complexity}\n`;

      if (task.endpoints) md += `- **Endpoints to implement:** ${task.endpoints}\n`;
      if (task.connections) md += `- **Connections:** ${task.connections}\n`;
      if (task.mechanisms) md += `- **Mechanisms:** ${task.mechanisms}\n`;

      if (task.options && task.options.length > 0) {
        md += '\n**Options:**\n\n';
        task.options.forEach(opt => {
          md += `- ${opt}\n`;
        });
        md += '\n';
      }
    });

    md += '## Implementation Guide\n\n';
    doc.engineerGuide.implementation.forEach(step => {
      md += `### Step ${step.step}: ${step.title}\n\n`;
      md += '```javascript\n';
      md += step.code;
      md += '\n```\n\n';
    });

    md += '## API Endpoints\n\n';
    if (doc.dependencies.apiEndpoints.length === 0) {
      md += '*No API endpoints found*\n\n';
    } else {
      md += '| Method | URL | Type | External |\n';
      md += '|--------|-----|------|----------|\n';
      doc.dependencies.apiEndpoints.forEach(ep => {
        md += `| ${ep.method} | \`${ep.url}\` | ${ep.type} | ${ep.isExternal ? '✅' : '❌'} |\n`;
      });
      md += '\n';
    }

    md += '## WebSocket Connections\n\n';
    if (doc.dependencies.websockets.length === 0) {
      md += '*No WebSocket connections found*\n\n';
    } else {
      doc.dependencies.websockets.forEach(ws => {
        md += `- \`${ws.url}\` (${ws.protocol})\n`;
      });
      md += '\n';
    }

    md += '## Authentication\n\n';
    if (doc.dependencies.authentication.length === 0) {
      md += '*No authentication mechanisms detected*\n\n';
    } else {
      doc.dependencies.authentication.forEach(auth => {
        md += `### ${auth.type}\n\n`;
        md += `- **Usage:** ${auth.usage}\n`;
        if (auth.headerName) md += `- **Header:** \`${auth.headerName}\`\n`;
        md += '\n';
      });
    }

    md += '## External Services\n\n';
    if (doc.dependencies.externalServices.length === 0) {
      md += '*No external services detected*\n\n';
    } else {
      doc.dependencies.externalServices.forEach(svc => {
        md += `- **${svc.domain}** (${svc.serviceType})\n`;
      });
      md += '\n';
    }

    md += '## Storage Usage\n\n';
    if (doc.dependencies.storageUsage.length === 0) {
      md += '*No client storage usage detected*\n\n';
    } else {
      doc.dependencies.storageUsage.forEach(storage => {
        md += `### ${storage.type}\n\n`;
        if (storage.keys) {
          md += `**Keys used:** ${storage.keys.slice(0, 10).join(', ')}${storage.keys.length > 10 ? '...' : ''}\n\n`;
        }
        if (storage.databases) {
          md += `**Databases:** ${storage.databases.join(', ')}\n\n`;
        }
      });
    }

    md += '## Next Steps\n\n';
    md += '1. Review the required work section above\n';
    md += '2. Choose implementation strategy (mock, proxy, or custom backend)\n';
    md += '3. Implement each required component\n';
    md += '4. Test all functionality works as expected\n';
    md += '5. Deploy backend services alongside frontend\n\n';

    return md;
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const extractedDir = process.argv[2] || 'output/photopea.com-complete-1767957633072';

  console.log('V7 Backend Mapper');
  console.log('=================\n');
  console.log('Analyzing:', extractedDir);

  const mapper = new V7BackendMapper(extractedDir);
  const dependencies = mapper.mapBackend();
  const documentation = mapper.generateDocumentation(dependencies);

  // Save JSON report
  const jsonPath = 'v7-backend-report.json';
  fs.writeFileSync(jsonPath, JSON.stringify(documentation, null, 2));

  // Save markdown guide
  const markdown = mapper.generateMarkdown(documentation);
  const mdPath = 'BACKEND-BLUEPRINT.md';
  fs.writeFileSync(mdPath, markdown);

  console.log('\n=== SUMMARY ===');
  console.log(documentation.summary);
  console.log(`\nJSON report saved to: ${jsonPath}`);
  console.log(`Markdown guide saved to: ${mdPath}`);

  if (!documentation.summary.hasBackendDependencies) {
    console.log('\n🎉 This app is fully client-side! No backend work needed.');
  } else {
    console.log(`\n⚠️  Backend work required: ${documentation.engineerGuide.requiredWork.length} tasks`);
    console.log('\nSee BACKEND-BLUEPRINT.md for implementation guide.');
  }
}
