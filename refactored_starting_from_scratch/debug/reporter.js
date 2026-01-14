/**
 * Debug Report Generator
 *
 * Generates a comprehensive DEBUG.md report for troubleshooting extraction issues.
 * Includes extraction summary, detection results, discovery stats, patch reports,
 * validation results, and actionable recommendations.
 *
 * Usage:
 *   await generateReport(context, issues, outputDir);
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Issue severity levels
 */
export const Severity = {
  CRITICAL: 'critical',  // Extraction will not work
  HIGH: 'high',          // Major functionality broken
  MEDIUM: 'medium',      // Some features may not work
  LOW: 'low',            // Minor issues
  INFO: 'info',          // Informational
};

/**
 * Issue categories
 */
export const Category = {
  NETWORK: 'network',
  DETECTION: 'detection',
  DISCOVERY: 'discovery',
  TRIGGER: 'trigger',
  PATCH: 'patch',
  VALIDATION: 'validation',
  PERFORMANCE: 'performance',
};

/**
 * Generate a comprehensive debug report
 * @param {Object} context - Extraction context
 * @param {Object[]} issues - Array of issues found
 * @param {string} outputDir - Output directory for the report
 * @returns {Promise<string>} Path to generated report
 */
export async function generateReport(context, issues = [], outputDir = null) {
  const dir = outputDir || context.outputDir;

  if (!dir) {
    throw new Error('No output directory specified for debug report');
  }

  const report = [];
  const timestamp = new Date().toISOString();

  // Header
  report.push('# DEBUG REPORT');
  report.push('');
  report.push(`Generated: ${timestamp}`);
  report.push('');

  // Quick Summary
  report.push('## Quick Summary');
  report.push('');
  report.push(generateQuickSummary(context, issues));
  report.push('');

  // Extraction Summary
  report.push('## Extraction Summary');
  report.push('');
  report.push(generateExtractionSummary(context));
  report.push('');

  // Detection Results
  if (context.detection) {
    report.push('## Detection Results');
    report.push('');
    report.push(generateDetectionSection(context.detection));
    report.push('');
  }

  // Discovery Stats
  if (context.state) {
    report.push('## Discovery Statistics');
    report.push('');
    report.push(generateDiscoverySection(context));
    report.push('');
  }

  // Trigger Stats
  report.push('## Trigger Statistics');
  report.push('');
  report.push(generateTriggerSection(context));
  report.push('');

  // Resource Breakdown
  report.push('## Resource Breakdown');
  report.push('');
  report.push(generateResourceSection(context.resources));
  report.push('');

  // Patch Report
  if (context.patchReport) {
    report.push('## Patch Report');
    report.push('');
    report.push(generatePatchSection(context.patchReport));
    report.push('');
  }

  // Validation Results
  if (context.validation) {
    report.push('## Validation Results');
    report.push('');
    report.push(generateValidationSection(context.validation));
    report.push('');
  }

  // Issues
  if (issues.length > 0) {
    report.push('## Issues Found');
    report.push('');
    report.push(generateIssuesSection(issues));
    report.push('');
  }

  // Timeline
  if (context.timeline && context.timeline.length > 0) {
    report.push('## Extraction Timeline');
    report.push('');
    report.push(generateTimelineSection(context.timeline));
    report.push('');
  }

  // Recommendations
  report.push('## Recommendations');
  report.push('');
  report.push(generateRecommendations(context, issues));
  report.push('');

  // Debug Data
  report.push('## Debug Data');
  report.push('');
  report.push('Raw context data available in `.checkpoint.json` and `phase-summary.json`');
  report.push('');

  // Write report
  const reportPath = path.join(dir, 'DEBUG.md');
  await fs.writeFile(reportPath, report.join('\n'));

  return reportPath;
}

/**
 * Generate quick summary
 */
function generateQuickSummary(context, issues) {
  const lines = [];

  // Status indicator
  const criticalCount = issues.filter(i => i.severity === Severity.CRITICAL).length;
  const highCount = issues.filter(i => i.severity === Severity.HIGH).length;

  let status = '**Status:** ';
  if (criticalCount > 0) {
    status += 'CRITICAL ISSUES';
  } else if (highCount > 0) {
    status += 'Issues Found';
  } else if (issues.length > 0) {
    status += 'Minor Issues';
  } else {
    status += 'OK';
  }

  lines.push(status);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| URL | ${context.url || 'N/A'} |`);
  lines.push(`| Resources | ${context.resources?.size || 0} |`);
  lines.push(`| Issues | ${issues.length} (${criticalCount} critical, ${highCount} high) |`);

  if (context.state) {
    const duration = context.state.phases
      ? Object.values(context.state.phases).reduce((sum, p) => sum + (p.duration || 0), 0)
      : 0;
    lines.push(`| Duration | ${(duration / 1000).toFixed(1)}s |`);
  }

  return lines.join('\n');
}

/**
 * Generate extraction summary section
 */
function generateExtractionSummary(context) {
  const lines = [];

  lines.push(`**Target URL:** ${context.url || 'N/A'}`);
  lines.push(`**Origin:** ${context.origin || 'N/A'}`);
  lines.push(`**Output Directory:** ${context.outputDir || 'N/A'}`);
  lines.push('');

  // Resource counts
  const resources = context.resources;
  if (resources) {
    const total = resources.size;
    let totalSize = 0;

    const byType = {};
    for (const [url, data] of resources) {
      const ct = data.contentType || '';
      const type = ct.includes('javascript') ? 'JavaScript'
        : ct.includes('css') ? 'CSS'
        : ct.includes('image') ? 'Images'
        : ct.includes('font') ? 'Fonts'
        : ct.includes('wasm') ? 'WebAssembly'
        : ct.includes('json') ? 'JSON'
        : ct.includes('html') ? 'HTML'
        : 'Other';

      byType[type] = (byType[type] || 0) + 1;
      totalSize += data.size || 0;
    }

    lines.push(`**Total Resources:** ${total}`);
    lines.push(`**Total Size:** ${formatSize(totalSize)}`);
    lines.push('');
    lines.push('| Type | Count |');
    lines.push('|------|-------|');
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${type} | ${count} |`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate detection section
 */
function generateDetectionSection(detection) {
  const lines = [];

  if (!detection) {
    lines.push('No detection results available.');
    return lines.join('\n');
  }

  lines.push(`**Framework:** ${detection.framework || 'Unknown'}`);
  lines.push(`**Bundler:** ${detection.bundler || 'Unknown'}`);
  lines.push(`**Confidence:** ${detection.confidence || 'N/A'}`);
  lines.push('');

  if (detection.signals && detection.signals.length > 0) {
    lines.push('**Detection Signals:**');
    for (const signal of detection.signals) {
      lines.push(`- ${signal}`);
    }
  }

  if (detection.features) {
    lines.push('');
    lines.push('**Features Detected:**');
    for (const [feature, detected] of Object.entries(detection.features)) {
      const icon = detected ? '+' : '-';
      lines.push(`- [${icon}] ${feature}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate discovery section
 */
function generateDiscoverySection(context) {
  const lines = [];
  const state = context.state;

  if (!state || !state.phases) {
    lines.push('No discovery statistics available.');
    return lines.join('\n');
  }

  const discoverPhase = state.phases['discover'];

  if (discoverPhase) {
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');

    if (discoverPhase.result) {
      const r = discoverPhase.result;
      lines.push(`| Initial Resources | ${r.initialCount || 0} |`);
      lines.push(`| Final Resources | ${r.finalCount || 0} |`);
      lines.push(`| New Discovered | ${r.newResources || 0} |`);
      lines.push(`| Iterations | ${r.iterations || 0} |`);
      lines.push(`| URLs Attempted | ${r.urlsAttempted || 0} |`);
    }

    if (discoverPhase.metrics) {
      const m = discoverPhase.metrics;
      lines.push(`| Items Processed | ${m.itemsProcessed || 0} |`);
      lines.push(`| Errors | ${m.errors || 0} |`);
      lines.push(`| Warnings | ${m.warnings || 0} |`);
    }

    lines.push(`| Duration | ${formatDuration(discoverPhase.duration)} |`);
  } else {
    lines.push('Discover phase not found.');
  }

  return lines.join('\n');
}

/**
 * Generate trigger section
 */
function generateTriggerSection(context) {
  const lines = [];
  const state = context.state;

  if (!state || !state.phases) {
    lines.push('No trigger statistics available.');
    return lines.join('\n');
  }

  const triggerPhase = state.phases['trigger'];

  if (triggerPhase) {
    lines.push('| Trigger | Resources Loaded |');
    lines.push('|---------|-----------------|');

    if (triggerPhase.result && triggerPhase.result.triggerResults) {
      for (const [trigger, count] of Object.entries(triggerPhase.result.triggerResults)) {
        lines.push(`| ${trigger} | ${count} |`);
      }
    } else if (triggerPhase.metrics && triggerPhase.metrics.actions) {
      for (const action of triggerPhase.metrics.actions) {
        lines.push(`| ${action} | - |`);
      }
    } else {
      lines.push('| No trigger data | - |');
    }

    lines.push('');
    lines.push(`**Duration:** ${formatDuration(triggerPhase.duration)}`);
  } else {
    lines.push('Trigger phase not found.');
  }

  return lines.join('\n');
}

/**
 * Generate resource section
 */
function generateResourceSection(resources) {
  const lines = [];

  if (!resources || resources.size === 0) {
    lines.push('No resources captured.');
    return lines.join('\n');
  }

  // Group by domain
  const byDomain = {};
  const bySource = {};

  for (const [url, data] of resources) {
    try {
      const domain = new URL(url).hostname;
      byDomain[domain] = (byDomain[domain] || 0) + 1;
    } catch (e) {
      byDomain['invalid'] = (byDomain['invalid'] || 0) + 1;
    }

    const source = data.source || 'unknown';
    bySource[source] = (bySource[source] || 0) + 1;
  }

  lines.push('### By Domain');
  lines.push('');
  lines.push('| Domain | Count |');
  lines.push('|--------|-------|');
  for (const [domain, count] of Object.entries(byDomain).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    lines.push(`| ${domain} | ${count} |`);
  }
  if (Object.keys(byDomain).length > 10) {
    lines.push(`| ... | ${Object.keys(byDomain).length - 10} more domains |`);
  }

  lines.push('');
  lines.push('### By Source');
  lines.push('');
  lines.push('| Source | Count |');
  lines.push('|--------|-------|');
  for (const [source, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${source} | ${count} |`);
  }

  return lines.join('\n');
}

/**
 * Generate patch section
 */
function generatePatchSection(patchReport) {
  const lines = [];

  if (!patchReport) {
    lines.push('No patch report available.');
    return lines.join('\n');
  }

  lines.push('| Patcher | Files Modified | Changes |');
  lines.push('|---------|----------------|---------|');

  if (Array.isArray(patchReport)) {
    for (const patch of patchReport) {
      lines.push(`| ${patch.name || 'Unknown'} | ${patch.filesModified || 0} | ${patch.changes || 0} |`);
    }
  } else if (typeof patchReport === 'object') {
    for (const [name, data] of Object.entries(patchReport)) {
      const files = data.filesModified || data.files || 0;
      const changes = data.changes || data.modifications || 0;
      lines.push(`| ${name} | ${files} | ${changes} |`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate validation section
 */
function generateValidationSection(validation) {
  const lines = [];

  if (!validation) {
    lines.push('No validation results available.');
    return lines.join('\n');
  }

  const status = validation.match ? 'PASS' : 'FAIL';
  lines.push(`**Overall Status:** ${status}`);
  lines.push(`**Match Score:** ${validation.score || 0}/100`);
  lines.push('');

  if (validation.console) {
    lines.push('### Console Comparison');
    lines.push(`- Online errors: ${validation.console.onlineErrors?.length || 0}`);
    lines.push(`- Offline errors: ${validation.console.offlineErrors?.length || 0}`);
    lines.push(`- New errors: ${validation.console.newErrors?.length || 0}`);
  }

  if (validation.network) {
    lines.push('');
    lines.push('### Network Comparison');
    lines.push(`- Failed requests offline: ${validation.network.failedOffline?.length || 0}`);
  }

  if (validation.visual) {
    lines.push('');
    lines.push('### Visual Comparison');
    lines.push(`- Difference: ${validation.visual.diffPercentage || 0}%`);
  }

  if (validation.differences && validation.differences.length > 0) {
    lines.push('');
    lines.push('### Differences');
    for (const diff of validation.differences) {
      lines.push(`- ${diff}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate issues section
 */
function generateIssuesSection(issues) {
  const lines = [];

  // Group by severity
  const bySeverity = {};
  for (const issue of issues) {
    const sev = issue.severity || Severity.INFO;
    if (!bySeverity[sev]) bySeverity[sev] = [];
    bySeverity[sev].push(issue);
  }

  const severityOrder = [Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.LOW, Severity.INFO];

  for (const severity of severityOrder) {
    const severityIssues = bySeverity[severity];
    if (!severityIssues || severityIssues.length === 0) continue;

    const icon = severity === Severity.CRITICAL ? '!!!'
      : severity === Severity.HIGH ? '!!'
      : severity === Severity.MEDIUM ? '!'
      : severity === Severity.LOW ? '?'
      : '-';

    lines.push(`### ${severity.toUpperCase()} (${severityIssues.length})`);
    lines.push('');

    for (const issue of severityIssues) {
      lines.push(`**[${icon}] ${issue.title || 'Untitled Issue'}**`);
      if (issue.description) {
        lines.push(`  ${issue.description}`);
      }
      if (issue.category) {
        lines.push(`  Category: ${issue.category}`);
      }
      if (issue.suggestion) {
        lines.push(`  Suggestion: ${issue.suggestion}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Generate timeline section
 */
function generateTimelineSection(timeline) {
  const lines = [];

  lines.push('| Time | Event |');
  lines.push('|------|-------|');

  for (const event of timeline.slice(-20)) {
    const time = event.elapsed
      ? `+${(event.elapsed / 1000).toFixed(1)}s`
      : event.timestamp || '';
    const eventText = event.event || event.message || 'Unknown event';
    lines.push(`| ${time} | ${eventText} |`);
  }

  if (timeline.length > 20) {
    lines.push(`| ... | ${timeline.length - 20} earlier events |`);
  }

  return lines.join('\n');
}

/**
 * Generate recommendations section
 */
function generateRecommendations(context, issues) {
  const lines = [];
  const recommendations = new Set();

  // Add recommendations from issues
  for (const issue of issues) {
    if (issue.suggestion) {
      recommendations.add(issue.suggestion);
    }
    if (issue.recommendations) {
      for (const rec of issue.recommendations) {
        recommendations.add(rec);
      }
    }
  }

  // Add context-specific recommendations
  const resources = context.resources;
  if (resources) {
    // Check for missing critical resources
    let hasJs = false;
    let hasCss = false;
    let hasWasm = false;

    for (const [url, data] of resources) {
      const ct = data.contentType || '';
      if (ct.includes('javascript')) hasJs = true;
      if (ct.includes('css')) hasCss = true;
      if (ct.includes('wasm')) hasWasm = true;
    }

    if (!hasJs) {
      recommendations.add('No JavaScript files captured - check if app uses lazy loading');
    }
    if (!hasCss) {
      recommendations.add('No CSS files captured - check for CSS-in-JS or inline styles');
    }
  }

  // Check phase results
  if (context.state && context.state.phases) {
    const phases = context.state.phases;

    for (const [name, phase] of Object.entries(phases)) {
      if (phase.status === 'failed') {
        recommendations.add(`Review ${name} phase failure and fix before re-running`);
      }
      if (phase.metrics && phase.metrics.errors > 0) {
        recommendations.add(`${name} phase had ${phase.metrics.errors} errors - review logs`);
      }
    }
  }

  // Output recommendations
  if (recommendations.size === 0) {
    lines.push('No specific recommendations at this time.');
  } else {
    lines.push('Based on the analysis, here are recommended actions:');
    lines.push('');

    let i = 1;
    for (const rec of recommendations) {
      lines.push(`${i}. ${rec}`);
      i++;
    }
  }

  // General tips
  lines.push('');
  lines.push('### General Debugging Tips');
  lines.push('');
  lines.push('- Run with `--debug` flag for verbose logging');
  lines.push('- Run with `--headless false` to see browser interactions');
  lines.push('- Check the network log for failed requests');
  lines.push('- Compare online vs offline screenshots for visual issues');
  lines.push('- Review console errors in offline mode');

  return lines.join('\n');
}

/**
 * Helper to format file size
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Helper to format duration
 */
function formatDuration(ms) {
  if (!ms) return 'N/A';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Create an issue object
 * @param {string} title - Issue title
 * @param {Object} options - Issue options
 * @returns {Object} Issue object
 */
export function createIssue(title, options = {}) {
  return {
    title,
    description: options.description || null,
    severity: options.severity || Severity.INFO,
    category: options.category || null,
    suggestion: options.suggestion || null,
    recommendations: options.recommendations || [],
    data: options.data || null,
    timestamp: new Date().toISOString(),
  };
}

export default {
  generateReport,
  createIssue,
  Severity,
  Category,
};
