# Ideas

Future improvements and features for the Visual Cloner system.

---

## 1. Image Generation Tool for Agents

**Problem:** When cloning pages, agents currently use placeholder rectangles for complex graphics, illustrations, and images. This breaks visual fidelity.

**Solution:** Create a tool call that sub-agents can use to generate images on-the-fly via the NanoBanana API.

**How it would work:**
- Agent analyzes a visual element (illustration, icon, graphic)
- Agent calls `generateImage({ prompt: "...", style: "..." })` tool
- NanoBanana API returns a generated image
- Image is saved locally and referenced in the HTML output

**Benefits:**
- Much closer to pixel-perfect clones
- No manual asset extraction needed
- Agents can describe what they see and generate matching visuals

**Implementation notes:**
- Add new MCP tool or custom tool wrapper
- Cache generated images to avoid redundant API calls
- Consider style presets (flat illustration, 3D, photorealistic, etc.)
- Rate limiting / cost management

---

## 2. 3D Element Generation

**Problem:** Many modern sites use 3D elements (floating objects, product renders, animated meshes). Currently these become static placeholders.

**Solution:** Tool call for agents to generate or reference 3D elements that can be embedded in clones.

**How it would work:**
- Agent identifies a 3D element in the screenshot
- Agent calls `generate3D({ description: "floating purple sphere with metallic finish", format: "glb" })`
- Returns embeddable 3D model or Three.js snippet
- Clone includes `<model-viewer>` or inline Three.js canvas

**Options to explore:**
- Meshy API for AI-generated 3D models
- Pre-built Three.js primitive library (spheres, toruses, abstract shapes)
- Spline embeds for interactive 3D
- GLTF/GLB asset generation

**Benefits:**
- Preserve the "wow factor" of 3D hero sections
- Interactive elements instead of static images
- Modern sites increasingly use 3D - this keeps clones current

---

## 3. WebGL Shader Generation

**Problem:** Sites like Stripe, Linear, and many others use custom WebGL shaders for backgrounds (gradients, noise, particles, waves). These are impossible to clone with CSS alone.

**Solution:** Tool call for agents to generate GLSL shaders based on visual description.

**How it would work:**
- Agent sees animated gradient/noise background
- Agent calls `generateShader({ description: "dark purple to blue gradient with subtle noise and slow wave animation" })`
- Returns working GLSL fragment shader + Three.js/vanilla WebGL boilerplate
- Shader is embedded in clone as a `<canvas>` background

**Potential approaches:**
- Fine-tuned model for GLSL generation
- Library of common shader patterns (noise, gradients, particles, waves)
- ShaderToy API integration for reference shaders
- Pre-built shader components that can be parameterized (colors, speed, intensity)

**Common shader types to support:**
- Gradient meshes (Stripe-style)
- Perlin/simplex noise backgrounds
- Particle systems
- Wave/ripple effects
- Blur/glow effects
- Aurora/northern lights

**Benefits:**
- Capture the "feel" of premium sites
- Animated backgrounds are a key differentiator
- Could build a reusable shader library over time

---
