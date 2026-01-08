# Visual Cloner

Pixel-perfect website cloning with WebGL shader extraction and reusable template generation.

## Key Features

### 🎨 V3 Clone with Shader Extraction

Clone any website and automatically extract:
- Complete HTML/CSS
- **WebGL shaders** (animated gradients, effects)
- CSS animations
- Design tokens (colors, typography, spacing)
- Reusable template files

```bash
node tools/clone-v3-with-shaders.js https://stripe.com
```

**Output:**
```
output/stripe.com-v3-20260108/
├── index.html           # Self-contained clone
├── shaders.json         # Extracted WebGL shaders
├── animations.json      # CSS animations
├── template/            # Reusable design system
│   ├── template.json    # Design specification
│   ├── template.css     # CSS with tokens
│   ├── template.js      # Shader + animations
│   └── example.html     # Usage example
└── shader-editor.html   # Interactive customizer
```

---

### 🌈 WebGL Shader Editor

Interactive tool to customize extracted gradient shaders in real-time.

![Shader Editor](https://raw.githubusercontent.com/ryanod2014/visual-cloner/main/docs/shader-editor.png)

**Features:**
- **6 Presets:** Stripe, Ocean, Sunset, Forest, Neon, Midnight
- **4 Color Pickers:** Base color + 3 wave layers
- **Animation Controls:** Speed, Flow
- **Noise Controls:** Frequency X/Y, Amplitude
- **Effects:** Shadow power, Darken top
- **Export:** JSON config or embed code

**Open the editor:**
```bash
open output/stripe.com-v3-20260108/shader-editor.html
```

**Customize colors programmatically:**
```html
<script>
window.GRADIENT_CONFIG = {
  baseColor: [0.2, 0.3, 0.8],    // Blue
  wave0Color: [0.9, 0.2, 0.5],   // Pink
  wave1Color: [0.3, 0.9, 0.7],   // Teal
  wave2Color: [1.0, 0.6, 0.2],   // Orange
  speed: 1.2,
  amplitude: 350
};
</script>
<canvas class="Gradient__canvas"></canvas>
<script src="template.js"></script>
```

---

## Quick Start

```bash
# Clone a website with full shader extraction
node tools/clone-v3-with-shaders.js https://stripe.com

# Generate template from existing clone
node tools/generate-template.js output/stripe.com-v3-20260108

# Open the shader editor
open output/stripe.com-v3-20260108/shader-editor.html
```

---

## Template System

Every clone generates a reusable template with:

| File | Purpose |
|------|---------|
| `template.json` | Machine-readable design spec (tokens, components) |
| `template.css` | CSS with design tokens as variables |
| `template.js` | GradientShader class + ScrollAnimations + NumberCounter |
| `example.html` | Shows how to use everything |

**Use the template to build new pages in the same style:**

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="template.css">
</head>
<body>
  <section class="hero bg-dark">
    <canvas class="Gradient__canvas"></canvas>
    <div class="hero__content text-white">
      <h1 class="headline-hero">Your Title</h1>
      <a href="#" class="btn btn-primary">Get Started</a>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="grid grid-3">
        <div class="card" data-animate="slideUp">Feature 1</div>
        <div class="card" data-animate="slideUp" data-delay="0.1">Feature 2</div>
        <div class="card" data-animate="slideUp" data-delay="0.2">Feature 3</div>
      </div>
    </div>
  </section>

  <script src="template.js"></script>
</body>
</html>
```

---

## Tools

| Tool | Description |
|------|-------------|
| `clone-v3-with-shaders.js` | Full clone with WebGL shader extraction |
| `generate-template.js` | Generate reusable template from clone |
| `stripe-gradient.js` | Standalone Stripe gradient shader module |

---

## How It Works

1. **Intercept WebGL** - Hooks `shaderSource()` before page load to capture all shader code
2. **Extract Uniforms** - Reads live uniform values from running WebGL programs
3. **Capture CSS** - Extracts all computed styles and CSS variables
4. **Generate Template** - Creates reusable CSS/JS with design tokens
5. **Build Editor** - Generates interactive shader customizer

---

## License

MIT
