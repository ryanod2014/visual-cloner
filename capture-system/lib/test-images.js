/**
 * Test Images - Generate test images for capturing operation behavior
 *
 * Different test images reveal different aspects of each algorithm:
 * - Solid colors: Edge cases, basic behavior
 * - Gradients: Tests interpolation, color transitions
 * - Patterns: Tests frequency response, edge detection
 * - Natural images: Realistic behavior
 */

// Generate test image data in the browser
const testImageGenerators = {
  // Solid colors - edge cases
  solidRed: {
    name: 'solid-red',
    description: 'Solid red - tests single color handling',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255;     // R
        data[i + 1] = 0;   // G
        data[i + 2] = 0;   // B
        data[i + 3] = 255; // A
      }
      return data;
    }
  },

  solidGray: {
    name: 'solid-gray',
    description: 'Solid 50% gray - neutral baseline',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 128;
        data[i + 1] = 128;
        data[i + 2] = 128;
        data[i + 3] = 255;
      }
      return data;
    }
  },

  solidWhite: {
    name: 'solid-white',
    description: 'Solid white - tests clipping at max',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
      return data;
    }
  },

  solidBlack: {
    name: 'solid-black',
    description: 'Solid black - tests clipping at min',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
      return data;
    }
  },

  // Gradients - tests interpolation
  horizontalGradient: {
    name: 'gradient-horizontal',
    description: 'Horizontal black to white gradient',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const v = Math.round((x / (width - 1)) * 255);
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = 255;
        }
      }
      return data;
    }
  },

  verticalGradient: {
    name: 'gradient-vertical',
    description: 'Vertical black to white gradient',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const v = Math.round((y / (height - 1)) * 255);
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = 255;
        }
      }
      return data;
    }
  },

  diagonalGradient: {
    name: 'gradient-diagonal',
    description: 'Diagonal gradient (corner to corner)',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      const maxDist = Math.sqrt(width * width + height * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const dist = Math.sqrt(x * x + y * y);
          const v = Math.round((dist / maxDist) * 255);
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = 255;
        }
      }
      return data;
    }
  },

  radialGradient: {
    name: 'gradient-radial',
    description: 'Radial gradient from center',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      const cx = width / 2;
      const cy = height / 2;
      const maxDist = Math.sqrt(cx * cx + cy * cy);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const v = Math.round((1 - dist / maxDist) * 255);
          data[i] = Math.max(0, v);
          data[i + 1] = Math.max(0, v);
          data[i + 2] = Math.max(0, v);
          data[i + 3] = 255;
        }
      }
      return data;
    }
  },

  colorGradient: {
    name: 'gradient-color',
    description: 'RGB color gradient',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          data[i] = Math.round((x / (width - 1)) * 255);       // R increases left to right
          data[i + 1] = Math.round((y / (height - 1)) * 255);  // G increases top to bottom
          data[i + 2] = 128;                                    // B constant
          data[i + 3] = 255;
        }
      }
      return data;
    }
  },

  // Patterns - tests frequency response
  checkerboard: {
    name: 'checkerboard',
    description: '8x8 checkerboard pattern',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      const cellSize = 8;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const cx = Math.floor(x / cellSize);
          const cy = Math.floor(y / cellSize);
          const v = ((cx + cy) % 2 === 0) ? 255 : 0;
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = 255;
        }
      }
      return data;
    }
  },

  stripes: {
    name: 'stripes',
    description: 'Vertical stripes pattern',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      const stripeWidth = 4;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const v = (Math.floor(x / stripeWidth) % 2 === 0) ? 255 : 0;
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = 255;
        }
      }
      return data;
    }
  },

  concentricCircles: {
    name: 'concentric-circles',
    description: 'Concentric circles pattern',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      const cx = width / 2;
      const cy = height / 2;
      const ringWidth = 10;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const ring = Math.floor(dist / ringWidth);
          const v = (ring % 2 === 0) ? 255 : 0;
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = 255;
        }
      }
      return data;
    }
  },

  // Edges - tests edge detection/preservation
  sharpEdges: {
    name: 'sharp-edges',
    description: 'Sharp black/white edge (vertical)',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      const mid = Math.floor(width / 2);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const v = (x < mid) ? 0 : 255;
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = 255;
        }
      }
      return data;
    }
  },

  boxShape: {
    name: 'box-shape',
    description: 'White box on black background',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      const margin = Math.floor(Math.min(width, height) / 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const inside = x >= margin && x < width - margin &&
                        y >= margin && y < height - margin;
          const v = inside ? 255 : 0;
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = 255;
        }
      }
      return data;
    }
  },

  circleShape: {
    name: 'circle-shape',
    description: 'White circle on black background',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) / 3;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const v = (dist <= radius) ? 255 : 0;
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = 255;
        }
      }
      return data;
    }
  },

  // Noise - tests denoising algorithms
  noisePattern: {
    name: 'noise',
    description: 'Random noise pattern',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.floor(Math.random() * 256);
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
      return data;
    }
  },

  // Color test patterns
  colorBars: {
    name: 'color-bars',
    description: 'Color bar pattern (RGBCMY)',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      const colors = [
        [255, 0, 0],     // Red
        [0, 255, 0],     // Green
        [0, 0, 255],     // Blue
        [0, 255, 255],   // Cyan
        [255, 0, 255],   // Magenta
        [255, 255, 0],   // Yellow
        [255, 255, 255], // White
        [0, 0, 0]        // Black
      ];
      const barWidth = Math.floor(width / colors.length);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const colorIndex = Math.min(Math.floor(x / barWidth), colors.length - 1);
          const color = colors[colorIndex];
          data[i] = color[0];
          data[i + 1] = color[1];
          data[i + 2] = color[2];
          data[i + 3] = 255;
        }
      }
      return data;
    }
  },

  skinTones: {
    name: 'skin-tones',
    description: 'Skin tone gradient for color adjustment testing',
    generate: (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      // Approximate skin tones from light to dark
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const t = x / (width - 1);
          // Interpolate from light to dark skin tones
          data[i] = Math.round(255 - t * 130);     // R: 255 -> 125
          data[i + 1] = Math.round(224 - t * 134); // G: 224 -> 90
          data[i + 2] = Math.round(189 - t * 129); // B: 189 -> 60
          data[i + 3] = 255;
        }
      }
      return data;
    }
  }
};

// Default test images to use for capture
const defaultTestImages = [
  'horizontalGradient',
  'checkerboard',
  'colorBars',
  'circleShape',
  'radialGradient'
];

// Minimal test images for quick captures
const minimalTestImages = [
  'horizontalGradient',
  'checkerboard'
];

// Full test suite
const fullTestImages = Object.keys(testImageGenerators);

module.exports = {
  testImageGenerators,
  defaultTestImages,
  minimalTestImages,
  fullTestImages
};
