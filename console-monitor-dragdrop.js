// Paste this into browser console (F12) while on Photopea offline
// It will monitor ALL drag/drop events

console.clear();
console.log('🔍 Drag/Drop Monitor Started');
console.log('Try dragging a file now...\n');

const events = ['drag', 'dragstart', 'dragenter', 'dragover', 'dragleave', 'drop', 'dragend'];

events.forEach(eventName => {
  document.addEventListener(eventName, (e) => {
    console.log(`✅ ${eventName.toUpperCase()}`, {
      target: e.target.tagName + (e.target.id ? '#' + e.target.id : '') + (e.target.className ? '.' + e.target.className.split(' ')[0] : ''),
      files: e.dataTransfer?.files?.length || 0,
      types: e.dataTransfer?.types || [],
      defaultPrevented: e.defaultPrevented
    });
  }, true);
});

// Also monitor file input changes
document.addEventListener('change', (e) => {
  if (e.target.type === 'file') {
    console.log('📁 FILE INPUT CHANGE', {
      files: Array.from(e.target.files).map(f => f.name)
    });
  }
}, true);

// Monitor any errors
window.addEventListener('error', (e) => {
  console.error('❌ ERROR:', e.message);
});

// Check if file APIs are available
console.log('\n📊 File API Support:');
console.log({
  FileReader: typeof FileReader !== 'undefined',
  File: typeof File !== 'undefined',
  Blob: typeof Blob !== 'undefined',
  DataTransfer: typeof DataTransfer !== 'undefined',
  showOpenFilePicker: typeof window.showOpenFilePicker !== 'undefined'
});

console.log('\n✅ Monitor ready! Try dragging a file now...');
