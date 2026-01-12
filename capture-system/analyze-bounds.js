#!/usr/bin/env node
/**
 * Analyze the canvas screenshot to find document bounds
 */

const fs = require('fs');
const PNG = require('pngjs').PNG;

// Load the test content image
const data = fs.readFileSync('test-content.png');
const png = PNG.sync.read(data);

console.log(`Image size: ${png.width}x${png.height}`);

// The document area is lighter than the gray workspace
// Find the bounding box of non-gray pixels

// Gray workspace is approximately RGB(60, 60, 60)
const isGray = (r, g, b) => {
  return Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && r < 100 && r > 30;
};

let minX = png.width, maxX = 0, minY = png.height, maxY = 0;

for (let y = 0; y < png.height; y++) {
  for (let x = 0; x < png.width; x++) {
    const idx = (y * png.width + x) * 4;
    const r = png.data[idx];
    const g = png.data[idx + 1];
    const b = png.data[idx + 2];

    if (!isGray(r, g, b)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

console.log(`Document bounds: (${minX}, ${minY}) to (${maxX}, ${maxY})`);
console.log(`Document size: ${maxX - minX + 1}x${maxY - minY + 1}`);

// Sample some pixels from the detected area
console.log('\nSample pixels from document area:');
for (let i = 0; i < 5; i++) {
  const x = minX + Math.floor(Math.random() * (maxX - minX));
  const y = minY + Math.floor(Math.random() * (maxY - minY));
  const idx = (y * png.width + x) * 4;
  console.log(`  (${x}, ${y}): RGB(${png.data[idx]}, ${png.data[idx+1]}, ${png.data[idx+2]})`);
}
