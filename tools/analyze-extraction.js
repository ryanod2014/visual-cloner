#!/usr/bin/env node
import { V7Analyzer } from './v7-analyzer.js';
import { V7TestGenerator } from './v7-test-generator.js';
import { V7BackendMapper } from './v7-backend-mapper.js';
import fs from 'fs';
import path from 'path';

const extractionDir = process.argv[2];
if (!extractionDir) {
  console.error('Usage: node analyze-extraction.js <extraction-directory>');
  process.exit(1);
}

console.log('════════════════════════════════════════════════════════════');
console.log('ANALYZING GOHIGHLEVEL EXTRACTION');
console.log('════════════════════════════════════════════════════════════\n');

const analyzer = new V7Analyzer(extractionDir);
const features = analyzer.discover();
const analysis = analyzer.generateReport(features);

// Save analysis
fs.writeFileSync(
  path.join(extractionDir, 'v7-analysis.json'),
  JSON.stringify(analysis, null, 2)
);

const testGen = new V7TestGenerator(path.join(extractionDir, 'test-files'));
const testFiles = await testGen.generate(features.fileFormats);
const manifest = testGen.generateManifest();

const backendMapper = new V7BackendMapper(extractionDir);
const backendAnalysis = backendMapper.mapBackend();
backendMapper.generateDocumentation(backendAnalysis);

console.log('════════════════════════════════════════════════════════════');
console.log('ANALYSIS RESULTS');
console.log('════════════════════════════════════════════════════════════\n');

console.log('📊 FRONTEND FEATURES:');
console.log(`   - File formats: ${features.fileFormats.length}`);
console.log(`   - Lazy-loaded modules: ${features.lazyLoads.length}`);
console.log(`   - API endpoints: ${features.apiEndpoints.length}`);
console.log(`   - Web Workers: ${features.workers.length}`);
console.log(`   - Iframes: ${features.iframes.length}`);
console.log(`   - Keyboard shortcuts: ${features.shortcuts.length}`);
console.log(`   - Event handlers: ${features.eventHandlers.length}\n`);

console.log('🔧 BACKEND DEPENDENCIES:');
const hasBackend = backendAnalysis.apiEndpoints.length > 0 || backendAnalysis.websockets.length > 0;
const requiresAuth = backendAnalysis.authentication.length > 0;
console.log(`   - Has backend: ${hasBackend ? '✅ YES' : '❌ NO'}`);
console.log(`   - API endpoints: ${backendAnalysis.apiEndpoints.length}`);
console.log(`   - WebSockets: ${backendAnalysis.websockets.length}`);
console.log(`   - External services: ${backendAnalysis.externalServices.length}`);
console.log(`   - Auth mechanisms: ${backendAnalysis.authentication.length}`);
console.log(`   - Requires auth: ${requiresAuth ? '✅ YES' : '❌ NO'}\n`);

console.log('📄 GENERATED FILES:');
console.log(`   - ${extractionDir}/v7-analysis.json`);
console.log(`   - ${extractionDir}/BACKEND-BLUEPRINT.md`);
console.log(`   - ${extractionDir}/v7-backend.json`);
console.log(`   - ${extractionDir}/test-files/`);

console.log('\n✅ Analysis complete!\n');
console.log('💡 Check BACKEND-BLUEPRINT.md for implementation guide\n');
