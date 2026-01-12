/**
 * Operations - Define all Photopea operations to capture
 *
 * Each operation specifies:
 * - name: Operation identifier
 * - path: Menu navigation path
 * - params: Default parameters
 * - variations: Different parameter combinations to test
 * - hasDialog: Whether operation opens a dialog
 */

const operations = [
  // ═══════════════════════════════════════════════════════════════
  // IMAGE ADJUSTMENTS (no dialog, instant apply)
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Invert',
    path: ['Image', 'Adjustments', 'Invert'],
    hasDialog: false,
    params: {},
    shortcut: 'Control+i'
  },
  {
    name: 'Desaturate',
    path: ['Image', 'Adjustments', 'Desaturate'],
    hasDialog: false,
    params: {},
    shortcut: 'Control+Shift+u'
  },
  {
    name: 'AutoTone',
    path: ['Image', 'Adjustments', 'Auto Tone'],
    hasDialog: false,
    params: {}
  },
  {
    name: 'AutoContrast',
    path: ['Image', 'Adjustments', 'Auto Contrast'],
    hasDialog: false,
    params: {}
  },
  {
    name: 'AutoColor',
    path: ['Image', 'Adjustments', 'Auto Color'],
    hasDialog: false,
    params: {}
  },

  // ═══════════════════════════════════════════════════════════════
  // IMAGE ADJUSTMENTS (with dialog)
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'BrightnessContrast',
    path: ['Image', 'Adjustments', 'Brightness/Contrast...'],
    hasDialog: true,
    params: { brightness: 0, contrast: 0 },
    variations: [
      { brightness: 25, contrast: 0 },
      { brightness: -25, contrast: 0 },
      { brightness: 0, contrast: 25 },
      { brightness: 0, contrast: -25 },
      { brightness: 50, contrast: 50 },
      { brightness: -50, contrast: -50 }
    ]
  },
  {
    name: 'Levels',
    path: ['Image', 'Adjustments', 'Levels...'],
    hasDialog: true,
    shortcut: 'Control+l',
    params: { inputBlack: 0, gamma: 1, inputWhite: 255, outputBlack: 0, outputWhite: 255 },
    variations: [
      { inputBlack: 20, gamma: 1, inputWhite: 235 },
      { inputBlack: 0, gamma: 0.5, inputWhite: 255 },
      { inputBlack: 0, gamma: 2.0, inputWhite: 255 },
      { outputBlack: 20, outputWhite: 235 }
    ]
  },
  {
    name: 'Curves',
    path: ['Image', 'Adjustments', 'Curves...'],
    hasDialog: true,
    shortcut: 'Control+m',
    params: { points: [[0, 0], [255, 255]] },
    // Curves are complex - capture default behavior
    variations: []
  },
  {
    name: 'Exposure',
    path: ['Image', 'Adjustments', 'Exposure...'],
    hasDialog: true,
    params: { exposure: 0, offset: 0, gamma: 1 },
    variations: [
      { exposure: 1, offset: 0, gamma: 1 },
      { exposure: -1, offset: 0, gamma: 1 },
      { exposure: 0, offset: 0.1, gamma: 1 },
      { exposure: 0, offset: 0, gamma: 1.5 }
    ]
  },
  {
    name: 'Vibrance',
    path: ['Image', 'Adjustments', 'Vibrance...'],
    hasDialog: true,
    params: { vibrance: 0, saturation: 0 },
    variations: [
      { vibrance: 50, saturation: 0 },
      { vibrance: -50, saturation: 0 },
      { vibrance: 0, saturation: 50 },
      { vibrance: 50, saturation: 25 }
    ]
  },
  {
    name: 'HueSaturation',
    path: ['Image', 'Adjustments', 'Hue/Saturation...'],
    hasDialog: true,
    shortcut: 'Control+u',
    params: { hue: 0, saturation: 0, lightness: 0 },
    variations: [
      { hue: 30, saturation: 0, lightness: 0 },
      { hue: -30, saturation: 0, lightness: 0 },
      { hue: 0, saturation: 30, lightness: 0 },
      { hue: 0, saturation: -30, lightness: 0 },
      { hue: 0, saturation: 0, lightness: 20 },
      { hue: 0, saturation: 0, lightness: -20 },
      { hue: 180, saturation: 0, lightness: 0 }
    ]
  },
  {
    name: 'ColorBalance',
    path: ['Image', 'Adjustments', 'Color Balance...'],
    hasDialog: true,
    shortcut: 'Control+b',
    params: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
    variations: [
      { cyanRed: 30, magentaGreen: 0, yellowBlue: 0 },
      { cyanRed: -30, magentaGreen: 0, yellowBlue: 0 },
      { cyanRed: 0, magentaGreen: 30, yellowBlue: 0 },
      { cyanRed: 0, magentaGreen: 0, yellowBlue: 30 }
    ]
  },
  {
    name: 'BlackWhite',
    path: ['Image', 'Adjustments', 'Black & White...'],
    hasDialog: true,
    params: { reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80 },
    variations: []
  },
  {
    name: 'PhotoFilter',
    path: ['Image', 'Adjustments', 'Photo Filter...'],
    hasDialog: true,
    params: { color: '#ec8a00', density: 25 },
    variations: [
      { density: 50 },
      { density: 75 }
    ]
  },
  {
    name: 'ChannelMixer',
    path: ['Image', 'Adjustments', 'Channel Mixer...'],
    hasDialog: true,
    params: {},
    variations: []
  },
  {
    name: 'Posterize',
    path: ['Image', 'Adjustments', 'Posterize...'],
    hasDialog: true,
    params: { levels: 4 },
    variations: [
      { levels: 2 },
      { levels: 3 },
      { levels: 4 },
      { levels: 8 },
      { levels: 16 }
    ]
  },
  {
    name: 'Threshold',
    path: ['Image', 'Adjustments', 'Threshold...'],
    hasDialog: true,
    params: { threshold: 128 },
    variations: [
      { threshold: 64 },
      { threshold: 128 },
      { threshold: 192 }
    ]
  },
  {
    name: 'GradientMap',
    path: ['Image', 'Adjustments', 'Gradient Map...'],
    hasDialog: true,
    params: {},
    variations: []
  },
  {
    name: 'SelectiveColor',
    path: ['Image', 'Adjustments', 'Selective Color...'],
    hasDialog: true,
    params: {},
    variations: []
  },
  {
    name: 'Shadows/Highlights',
    path: ['Image', 'Adjustments', 'Shadows/Highlights...'],
    hasDialog: true,
    params: { shadows: 35, highlights: 0 },
    variations: [
      { shadows: 50, highlights: 0 },
      { shadows: 0, highlights: 50 },
      { shadows: 50, highlights: 50 }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // BLUR FILTERS
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'GaussianBlur',
    path: ['Filter', 'Blur', 'Gaussian Blur...'],
    hasDialog: true,
    params: { radius: 5 },
    variations: [
      { radius: 1 },
      { radius: 2 },
      { radius: 5 },
      { radius: 10 },
      { radius: 25 },
      { radius: 50 }
    ]
  },
  {
    name: 'BoxBlur',
    path: ['Filter', 'Blur', 'Box Blur...'],
    hasDialog: true,
    params: { radius: 5 },
    variations: [
      { radius: 1 },
      { radius: 3 },
      { radius: 5 },
      { radius: 10 }
    ]
  },
  {
    name: 'MotionBlur',
    path: ['Filter', 'Blur', 'Motion Blur...'],
    hasDialog: true,
    params: { angle: 0, distance: 10 },
    variations: [
      { angle: 0, distance: 10 },
      { angle: 45, distance: 10 },
      { angle: 90, distance: 10 },
      { angle: 0, distance: 25 }
    ]
  },
  {
    name: 'RadialBlur',
    path: ['Filter', 'Blur', 'Radial Blur...'],
    hasDialog: true,
    params: { amount: 10, method: 'spin' },
    variations: [
      { amount: 10, method: 'spin' },
      { amount: 25, method: 'spin' },
      { amount: 10, method: 'zoom' }
    ]
  },
  {
    name: 'SurfaceBlur',
    path: ['Filter', 'Blur', 'Surface Blur...'],
    hasDialog: true,
    params: { radius: 5, threshold: 15 },
    variations: [
      { radius: 5, threshold: 15 },
      { radius: 10, threshold: 30 }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // SHARPEN FILTERS
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Sharpen',
    path: ['Filter', 'Sharpen', 'Sharpen'],
    hasDialog: false,
    params: {}
  },
  {
    name: 'SharpenMore',
    path: ['Filter', 'Sharpen', 'Sharpen More'],
    hasDialog: false,
    params: {}
  },
  {
    name: 'UnsharpMask',
    path: ['Filter', 'Sharpen', 'Unsharp Mask...'],
    hasDialog: true,
    params: { amount: 100, radius: 1, threshold: 0 },
    variations: [
      { amount: 50, radius: 1, threshold: 0 },
      { amount: 100, radius: 1, threshold: 0 },
      { amount: 150, radius: 1, threshold: 0 },
      { amount: 100, radius: 2, threshold: 0 },
      { amount: 100, radius: 1, threshold: 10 }
    ]
  },
  {
    name: 'SmartSharpen',
    path: ['Filter', 'Sharpen', 'Smart Sharpen...'],
    hasDialog: true,
    params: { amount: 100, radius: 1 },
    variations: [
      { amount: 100, radius: 1 },
      { amount: 200, radius: 2 }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // NOISE FILTERS
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'AddNoise',
    path: ['Filter', 'Noise', 'Add Noise...'],
    hasDialog: true,
    params: { amount: 10, distribution: 'uniform', monochromatic: false },
    variations: [
      { amount: 5 },
      { amount: 10 },
      { amount: 25 },
      { amount: 50 }
    ]
  },
  {
    name: 'Median',
    path: ['Filter', 'Noise', 'Median...'],
    hasDialog: true,
    params: { radius: 1 },
    variations: [
      { radius: 1 },
      { radius: 2 },
      { radius: 3 },
      { radius: 5 }
    ]
  },
  {
    name: 'ReduceNoise',
    path: ['Filter', 'Noise', 'Reduce Noise...'],
    hasDialog: true,
    params: { strength: 6, preserveDetails: 60, reduceColorNoise: 60, sharpenDetails: 25 },
    variations: []
  },
  {
    name: 'Despeckle',
    path: ['Filter', 'Noise', 'Despeckle'],
    hasDialog: false,
    params: {}
  },

  // ═══════════════════════════════════════════════════════════════
  // DISTORT FILTERS
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Wave',
    path: ['Filter', 'Distort', 'Wave...'],
    hasDialog: true,
    params: { generators: 5, wavelength: [10, 120], amplitude: [5, 35] },
    variations: []
  },
  {
    name: 'Ripple',
    path: ['Filter', 'Distort', 'Ripple...'],
    hasDialog: true,
    params: { amount: 100, size: 'medium' },
    variations: [
      { amount: 100 },
      { amount: 200 },
      { amount: 500 }
    ]
  },
  {
    name: 'Spherize',
    path: ['Filter', 'Distort', 'Spherize...'],
    hasDialog: true,
    params: { amount: 100, mode: 'normal' },
    variations: [
      { amount: 50 },
      { amount: 100 },
      { amount: -50 }
    ]
  },
  {
    name: 'Twirl',
    path: ['Filter', 'Distort', 'Twirl...'],
    hasDialog: true,
    params: { angle: 50 },
    variations: [
      { angle: 50 },
      { angle: 180 },
      { angle: -90 }
    ]
  },
  {
    name: 'Pinch',
    path: ['Filter', 'Distort', 'Pinch...'],
    hasDialog: true,
    params: { amount: 50 },
    variations: [
      { amount: 25 },
      { amount: 50 },
      { amount: -25 }
    ]
  },
  {
    name: 'ZigZag',
    path: ['Filter', 'Distort', 'ZigZag...'],
    hasDialog: true,
    params: { amount: 10, ridges: 5 },
    variations: []
  },
  {
    name: 'PolarCoordinates',
    path: ['Filter', 'Distort', 'Polar Coordinates...'],
    hasDialog: true,
    params: { mode: 'rectangular' },
    variations: []
  },

  // ═══════════════════════════════════════════════════════════════
  // STYLIZE FILTERS
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'FindEdges',
    path: ['Filter', 'Stylize', 'Find Edges'],
    hasDialog: false,
    params: {}
  },
  {
    name: 'Emboss',
    path: ['Filter', 'Stylize', 'Emboss...'],
    hasDialog: true,
    params: { angle: 135, height: 3, amount: 100 },
    variations: [
      { angle: 135, height: 3, amount: 100 },
      { angle: 45, height: 5, amount: 150 }
    ]
  },
  {
    name: 'OilPaint',
    path: ['Filter', 'Stylize', 'Oil Paint...'],
    hasDialog: true,
    params: { stylization: 4, cleanliness: 3, scale: 0.1 },
    variations: []
  },
  {
    name: 'Solarize',
    path: ['Filter', 'Stylize', 'Solarize'],
    hasDialog: false,
    params: {}
  },
  {
    name: 'WindFilter',
    path: ['Filter', 'Stylize', 'Wind...'],
    hasDialog: true,
    params: { method: 'wind', direction: 'left' },
    variations: []
  },
  {
    name: 'Diffuse',
    path: ['Filter', 'Stylize', 'Diffuse...'],
    hasDialog: true,
    params: { mode: 'normal' },
    variations: []
  },

  // ═══════════════════════════════════════════════════════════════
  // PIXELATE FILTERS
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Mosaic',
    path: ['Filter', 'Pixelate', 'Mosaic...'],
    hasDialog: true,
    params: { cellSize: 10 },
    variations: [
      { cellSize: 5 },
      { cellSize: 10 },
      { cellSize: 20 },
      { cellSize: 50 }
    ]
  },
  {
    name: 'Crystallize',
    path: ['Filter', 'Pixelate', 'Crystallize...'],
    hasDialog: true,
    params: { cellSize: 10 },
    variations: [
      { cellSize: 5 },
      { cellSize: 10 },
      { cellSize: 25 }
    ]
  },
  {
    name: 'Pointillize',
    path: ['Filter', 'Pixelate', 'Pointillize...'],
    hasDialog: true,
    params: { cellSize: 10 },
    variations: [
      { cellSize: 5 },
      { cellSize: 10 },
      { cellSize: 15 }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // OTHER FILTERS
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'HighPass',
    path: ['Filter', 'Other', 'High Pass...'],
    hasDialog: true,
    params: { radius: 10 },
    variations: [
      { radius: 1 },
      { radius: 5 },
      { radius: 10 },
      { radius: 25 }
    ]
  },
  {
    name: 'Maximum',
    path: ['Filter', 'Other', 'Maximum...'],
    hasDialog: true,
    params: { radius: 1 },
    variations: [
      { radius: 1 },
      { radius: 2 },
      { radius: 5 }
    ]
  },
  {
    name: 'Minimum',
    path: ['Filter', 'Other', 'Minimum...'],
    hasDialog: true,
    params: { radius: 1 },
    variations: [
      { radius: 1 },
      { radius: 2 },
      { radius: 5 }
    ]
  },
  {
    name: 'Offset',
    path: ['Filter', 'Other', 'Offset...'],
    hasDialog: true,
    params: { horizontal: 100, vertical: 100, wrap: true },
    variations: []
  }
];

// Group operations by category for easier access
const operationsByCategory = {
  adjustments: operations.filter(op => op.path[0] === 'Image' && op.path[1] === 'Adjustments'),
  blur: operations.filter(op => op.path[1] === 'Blur'),
  sharpen: operations.filter(op => op.path[1] === 'Sharpen'),
  noise: operations.filter(op => op.path[1] === 'Noise'),
  distort: operations.filter(op => op.path[1] === 'Distort'),
  stylize: operations.filter(op => op.path[1] === 'Stylize'),
  pixelate: operations.filter(op => op.path[1] === 'Pixelate'),
  other: operations.filter(op => op.path[1] === 'Other')
};

module.exports = { operations, operationsByCategory };
