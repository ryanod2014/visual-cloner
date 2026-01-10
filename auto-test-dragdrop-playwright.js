#!/usr/bin/env node
/**
 * Automated drag/drop comparison using MCP Playwright tools
 * Tests online vs offline to find differences
 */

import fs from 'fs';

console.log('🔍 Automated Drag/Drop Diagnostic');
console.log('==================================\n');

const report = {
  timestamp: new Date().toISOString(),
  tests: []
};

async function testURL(url, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${label}`);
  console.log(`URL: ${url}`);
  console.log('='.repeat(60));

  const results = {
    label,
    url,
    consoleLogs: [],
    errors: [],
    dragDropSupport: {},
    fileMenuWorks: false
  };

  console.log(`\n📝 To test ${label}, run these commands in another terminal:\n`);

  console.log(`# 1. Take snapshot to see the UI`);
  console.log(`#    (This will show what elements are available)\n`);

  console.log(`# 2. Try to trigger file load via JavaScript`);
  console.log(`#    Inject code to simulate file drop\n`);

  console.log(`# 3. Check console logs for errors\n`);

  return results;
}

console.log('Manual testing needed via Playwright MCP tools.');
console.log('Use the following approach:\n');

console.log('1. Test ONLINE first:');
console.log('   - Navigate to https://www.photopea.com');
console.log('   - Snapshot to see UI');
console.log('   - Use evaluate to check globals');
console.log('   - Use evaluate to simulate drop event\n');

console.log('2. Test OFFLINE:');
console.log('   - Navigate to http://localhost:3344/?test=1');
console.log('   - Same checks as online');
console.log('   - Compare differences\n');

console.log('3. Look for:');
console.log('   - Error messages in console');
console.log('   - Missing event listeners');
console.log('   - Protection flags set differently\n');

console.log('Creating simpler automated approach...');
