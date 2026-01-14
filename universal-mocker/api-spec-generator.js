/**
 * API SPEC GENERATOR
 * Converts captured API calls into documentation
 * Outputs: OpenAPI 3.0, Markdown, Implementation Guide
 */

class APISpecGenerator {
  constructor(mockerReport) {
    this.report = mockerReport;
  }

  /**
   * Generate all documentation formats
   */
  generateAll() {
    return {
      openapi: this.generateOpenAPI(),
      markdown: this.generateMarkdown(),
      implementationGuide: this.generateImplementationGuide(),
      mockConfig: this.generateMockConfig()
    };
  }

  /**
   * Generate OpenAPI 3.0 spec
   */
  generateOpenAPI() {
    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'Cloned App API',
        version: '1.0.0',
        description: `Auto-generated from ${this.report.summary.totalAPIs} captured endpoints in ${this.report.summary.iterations} iterations`
      },
      servers: [
        {
          url: 'https://api.example.com',
          description: 'Replace with your backend URL'
        }
      ],
      paths: {}
    };

    // Add each API endpoint
    this.report.apis.forEach(api => {
      const path = this.extractPath(api.url);
      const method = api.method.toLowerCase();

      if (!spec.paths[path]) {
        spec.paths[path] = {};
      }

      spec.paths[path][method] = {
        summary: `${api.method} ${path}`,
        description: `Called ${api.calls} times during app exploration`,
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: this.generateSchema(api.mock),
                example: api.mock
              }
            }
          }
        }
      };
    });

    return spec;
  }

  /**
   * Generate Markdown documentation
   */
  generateMarkdown() {
    let md = '# API Documentation\n\n';
    md += `Auto-generated from cloned app analysis\n\n`;
    md += `**Stats:**\n`;
    md += `- Total Endpoints: ${this.report.summary.totalAPIs}\n`;
    md += `- Iterations: ${this.report.summary.iterations}\n`;
    md += `- Auth Patterns: ${this.report.summary.authPatterns.length}\n\n`;

    // Authentication section
    md += '## Authentication\n\n';
    if (this.report.summary.authPatterns.length > 0) {
      md += 'Detected auth patterns:\n\n';
      this.report.summary.authPatterns.forEach(pattern => {
        md += `- \`${pattern}\`\n`;
      });
    } else {
      md += 'No authentication detected (app may be public)\n';
    }
    md += '\n';

    // Endpoints section
    md += '## Endpoints\n\n';

    // Sort by call frequency
    const sortedAPIs = [...this.report.apis].sort((a, b) => b.calls - a.calls);

    sortedAPIs.forEach((api, index) => {
      md += `### ${index + 1}. ${api.method} ${this.extractPath(api.url)}\n\n`;
      md += `**Full URL:** \`${api.url}\`\n\n`;
      md += `**Called:** ${api.calls} times\n\n`;
      md += `**Priority:** ${this.getPriority(api.calls)}\n\n`;

      md += '**Response Shape:**\n\n';
      md += '```json\n';
      md += JSON.stringify(api.mock, null, 2);
      md += '\n```\n\n';

      md += '---\n\n';
    });

    return md;
  }

  /**
   * Generate implementation guide with priorities
   */
  generateImplementationGuide() {
    const sorted = [...this.report.apis].sort((a, b) => b.calls - a.calls);

    const guide = {
      title: 'Backend Implementation Guide',
      summary: {
        totalEndpoints: sorted.length,
        critical: sorted.filter(a => a.calls > 10).length,
        important: sorted.filter(a => a.calls > 5 && a.calls <= 10).length,
        optional: sorted.filter(a => a.calls <= 5).length
      },
      endpoints: sorted.map((api, index) => ({
        priority: index + 1,
        level: this.getPriority(api.calls),
        method: api.method,
        url: api.url,
        path: this.extractPath(api.url),
        callCount: api.calls,
        mockResponse: api.mock,
        notes: this.generateNotes(api)
      }))
    };

    return guide;
  }

  /**
   * Generate mock config file for dev server
   */
  generateMockConfig() {
    const config = {
      version: '1.0',
      description: 'Mock API configuration - replace with real endpoints as you implement them',
      endpoints: {}
    };

    this.report.apis.forEach(api => {
      config.endpoints[api.url] = {
        mode: 'mock',  // Change to 'real' when implemented
        method: api.method,
        response: api.mock,
        target: null,  // Set to real backend URL when ready
        notes: `Called ${api.calls} times`
      };
    });

    return config;
  }

  /**
   * Extract clean path from full URL
   */
  extractPath(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname + (urlObj.search || '');
    } catch (e) {
      // If URL parsing fails, return as-is
      return url;
    }
  }

  /**
   * Determine priority level
   */
  getPriority(callCount) {
    if (callCount > 10) return 'Critical';
    if (callCount > 5) return 'Important';
    if (callCount > 2) return 'Normal';
    return 'Optional';
  }

  /**
   * Generate implementation notes
   */
  generateNotes(api) {
    const notes = [];

    if (api.calls > 10) {
      notes.push('Frequently called - implement first');
    }

    if (Object.keys(api.mock).length === 0) {
      notes.push('Returns empty object - verify if this is correct');
    }

    if (Array.isArray(api.mock)) {
      notes.push('Returns array - likely a list/collection endpoint');
    }

    if (api.mock.id || api.mock._id) {
      notes.push('Returns entity with ID - likely a single resource');
    }

    if (api.method === 'POST') {
      notes.push('POST endpoint - handles create/update operations');
    }

    if (api.method === 'DELETE') {
      notes.push('DELETE endpoint - handles resource deletion');
    }

    return notes.join('; ');
  }

  /**
   * Generate JSON Schema from mock object
   */
  generateSchema(obj, depth = 0) {
    if (depth > 3) return { type: 'object' };  // Prevent infinite recursion

    if (Array.isArray(obj)) {
      return {
        type: 'array',
        items: obj.length > 0 ? this.generateSchema(obj[0], depth + 1) : { type: 'object' }
      };
    }

    if (obj === null) {
      return { type: 'null' };
    }

    if (typeof obj === 'object') {
      const properties = {};
      const required = [];

      Object.keys(obj).forEach(key => {
        properties[key] = this.generateSchema(obj[key], depth + 1);
        required.push(key);
      });

      return {
        type: 'object',
        properties,
        required
      };
    }

    // Primitive types
    if (typeof obj === 'string') {
      // Try to detect specific string formats
      if (/^\d{4}-\d{2}-\d{2}/.test(obj)) {
        return { type: 'string', format: 'date-time' };
      }
      if (/@/.test(obj)) {
        return { type: 'string', format: 'email' };
      }
      if (/^https?:\/\//.test(obj)) {
        return { type: 'string', format: 'uri' };
      }
      return { type: 'string' };
    }

    if (typeof obj === 'number') {
      return Number.isInteger(obj) ? { type: 'integer' } : { type: 'number' };
    }

    if (typeof obj === 'boolean') {
      return { type: 'boolean' };
    }

    return { type: 'string' };  // Fallback
  }

  /**
   * Save all docs to files (for Node.js environment)
   */
  saveToFiles(outputDir) {
    const fs = require('fs');
    const path = require('path');

    const docs = this.generateAll();

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save each format
    fs.writeFileSync(
      path.join(outputDir, 'openapi.json'),
      JSON.stringify(docs.openapi, null, 2)
    );

    fs.writeFileSync(
      path.join(outputDir, 'API_SPEC.md'),
      docs.markdown
    );

    fs.writeFileSync(
      path.join(outputDir, 'implementation-guide.json'),
      JSON.stringify(docs.implementationGuide, null, 2)
    );

    fs.writeFileSync(
      path.join(outputDir, 'mock-config.json'),
      JSON.stringify(docs.mockConfig, null, 2)
    );

    console.log(`✅ Documentation saved to ${outputDir}`);
  }

  /**
   * Generate browser-downloadable files
   */
  generateDownloads() {
    const docs = this.generateAll();

    // Create download links
    const downloads = [
      {
        filename: 'openapi.json',
        content: JSON.stringify(docs.openapi, null, 2),
        type: 'application/json'
      },
      {
        filename: 'API_SPEC.md',
        content: docs.markdown,
        type: 'text/markdown'
      },
      {
        filename: 'implementation-guide.json',
        content: JSON.stringify(docs.implementationGuide, null, 2),
        type: 'application/json'
      },
      {
        filename: 'mock-config.json',
        content: JSON.stringify(docs.mockConfig, null, 2),
        type: 'application/json'
      }
    ];

    downloads.forEach(file => {
      const blob = new Blob([file.content], { type: file.type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.textContent = `Download ${file.filename}`;
      a.style.display = 'block';
      a.style.margin = '10px';
      document.body.appendChild(a);
    });

    console.log('📥 Download links created');
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APISpecGenerator;
} else {
  window.APISpecGenerator = APISpecGenerator;
}
