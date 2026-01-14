/**
 * INTEGRATION HELPER
 * Adds the universal mocker to any extracted app
 */

const fs = require('fs');
const path = require('path');

function integrateUniversalMocker(extractedAppDir) {
  const indexPath = path.join(extractedAppDir, 'index.html');

  if (!fs.existsSync(indexPath)) {
    throw new Error(`index.html not found in ${extractedAppDir}`);
  }

  console.log('📝 Reading index.html...');
  let html = fs.readFileSync(indexPath, 'utf8');

  // Check if already integrated
  if (html.includes('auto-mocker.js')) {
    console.log('⚠️  Auto-mocker already integrated');
    return;
  }

  // Copy mocker files to app directory
  const mockerDir = path.join(extractedAppDir, 'universal-mocker');
  if (!fs.existsSync(mockerDir)) {
    fs.mkdirSync(mockerDir, { recursive: true });
  }

  console.log('📋 Copying mocker files...');
  fs.copyFileSync(
    path.join(__dirname, 'auto-mocker.js'),
    path.join(mockerDir, 'auto-mocker.js')
  );

  fs.copyFileSync(
    path.join(__dirname, 'api-spec-generator.js'),
    path.join(mockerDir, 'api-spec-generator.js')
  );

  // Add script tag at the very beginning of <head>
  const scriptTag = `
<!-- UNIVERSAL AUTO-MOCKER - Injected automatically -->
<script src="universal-mocker/auto-mocker.js"></script>
<script>
  // After app stabilizes, generate docs
  window.addEventListener('load', function() {
    setTimeout(function() {
      if (window.__AUTO_MOCKER_READY__ && window.__AUTO_MOCKER__) {
        const report = window.__AUTO_MOCKER__.generateReport();

        // Load spec generator
        const script = document.createElement('script');
        script.src = 'universal-mocker/api-spec-generator.js';
        script.onload = function() {
          const generator = new APISpecGenerator(report);
          const docs = generator.generateAll();

          console.log('\\n📚 ============ API DOCUMENTATION READY ============');
          console.log('Run this to download docs:');
          console.log('  generator.generateDownloads()');
          console.log('\\nOr access via:');
          console.log('  window.__API_DOCS__ = docs');
          console.log('==================================================\\n');

          window.__API_DOCS__ = docs;
          window.__API_GENERATOR__ = generator;
        };
        document.head.appendChild(script);
      }
    }, 5000);
  });
</script>
<!-- End Auto-Mocker Integration -->
`;

  // Insert at beginning of <head>
  html = html.replace('<head>', '<head>' + scriptTag);

  // Write back
  console.log('💾 Updating index.html...');
  fs.writeFileSync(indexPath, html, 'utf8');

  console.log('✅ Universal mocker integrated!');
  console.log('\n📋 Next steps:');
  console.log('  1. Start the dev server');
  console.log('  2. Open the app in browser');
  console.log('  3. Watch the console for auto-mocking progress');
  console.log('  4. After stabilization, download API docs');
  console.log('\n');
}

// CLI usage
if (require.main === module) {
  const appDir = process.argv[2];

  if (!appDir) {
    console.error('Usage: node integrate.js <extracted-app-directory>');
    process.exit(1);
  }

  try {
    integrateUniversalMocker(appDir);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

module.exports = { integrateUniversalMocker };
