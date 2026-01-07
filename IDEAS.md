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
