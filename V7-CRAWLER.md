# V7 Crawler - Intelligent Multi-Page Extraction

**Automatically discover and extract all pages from a webapp with smart content detection.**

---

## What It Does

The V7 Crawler extends V7's extraction capabilities to handle multi-page webapps:

✅ **Discovers all pages** - Crawls entire site (same domain + subdomains)
✅ **Smart classification** - Distinguishes app pages from content (blog posts, help articles)
✅ **Exhaustive extraction** - Extracts all app pages completely
✅ **Content sampling** - Samples representative pages from content zones
✅ **Resource deduplication** - Shared resources (app.bundle.js) extracted once
✅ **Multi-domain support** - Includes `example.com`, `app.example.com`, `admin.example.com`

---

## Quick Start

```bash
# Basic usage - crawl entire app
node tools/v7-crawler.js https://app.example.com output/app

# With options
node tools/v7-crawler.js https://example.com output/site \
  --max-pages 200 \
  --max-depth 4 \
  --sample-size 5
```

---

## How It Works

### 4-Phase Process

```
┌─────────────────────────────────────────────────────────────┐
│  V7 CRAWLER - 4 PHASES                                      │
└─────────────────────────────────────────────────────────────┘

Phase 1: DISCOVER (Breadth-First Crawl)
  • Starts at provided URL
  • Discovers all linked pages
  • Follows links up to max depth
  • Respects scope (same domain + subdomains)
  • Example: Finds 127 pages across app.example.com

Phase 2: CLASSIFY (Smart Zone Detection)
  • Groups pages by parent path
  • Applies heuristics to classify zones:
    ✓ App zones (dashboard, settings, admin)
    ✓ Content zones (blog, help, docs)
  • Example:
    - /dashboard → App (12 pages)
    - /blog → Content (247 pages)

Phase 3: EXTRACT (Multi-Page Extraction)
  • Exhaustively extracts all app pages
  • Samples 5 representative pages from content zones
  • Monitors and deduplicates resources
  • Example: Extracts 40 pages, 1.2MB resources

Phase 4: SAVE (Structured Output)
  • Saves pages/ directory with HTML + screenshots
  • Saves resources/ directory with deduplicated assets
  • Generates manifest.json and sitemap.json
```

---

## Classification Heuristics

The crawler uses 5 heuristics to detect content zones:

### 1. Too Many Siblings
```
/dashboard/settings      → 8 pages  → App ✅
/blog/                   → 247 pages → Content (sample 5)
```

**Threshold:** 20 siblings (configurable with `--max-siblings`)

### 2. URL Pattern Matching
```
/dashboard/*    → App ✅
/settings/*     → App ✅
/admin/*        → App ✅

/blog/*         → Content (sample)
/help/*         → Content (sample)
/docs/*         → Content (sample)
```

**Built-in content patterns:**
- `/blog/`, `/post/`, `/article/`, `/news/`
- `/help/`, `/docs/`, `/tutorial/`, `/guide/`
- `/category/`, `/tag/`
- Date URLs: `/2024/01/12/`

### 3. Slug Complexity
```
/settings              → 0 hyphens → App ✅
/blog/how-to-use-app   → 4 hyphens → Content (sample)
```

**Threshold:** Avg 3+ hyphens per URL = content

### 4. Path Depth
```
/dashboard              → depth 1 → App ✅
/blog/2024/jan/post    → depth 4 → Content (sample)
```

**Threshold:** Avg depth > 4 = content

### 5. Force Classification
```javascript
// Force app (always extract)
appPatterns: [
  /\/dashboard/i,
  /\/settings/i,
  /\/admin/i
]

// Force content (always sample)
contentPatterns: [
  /\/blog\//i,
  /\/news\//i
]
```

---

## Output Structure

```
output/app/
├── pages/                    # All extracted pages
│   ├── dashboard.html
│   ├── dashboard.png
│   ├── settings.html
│   ├── settings.png
│   ├── blog_post-1.html     # Sampled content
│   ├── blog_post-1.png
│   └── ...
├── resources/                # Shared resources (DEDUPLICATED)
│   ├── app.bundle.js         # Extracted once, used by all pages
│   ├── vendor.chunk.js
│   ├── styles.css
│   └── ...
├── manifest.json             # Extraction metadata
└── sitemap.json              # Site structure

manifest.json:
{
  "timestamp": "2026-01-12T...",
  "discovery": {
    "totalDiscovered": 247,
    "totalExtracted": 40,
    "zones": {
      "app": [
        { "path": "/dashboard", "pageCount": 12 },
        { "path": "/settings", "pageCount": 8 }
      ],
      "content": [
        {
          "path": "/blog",
          "pageCount": 247,
          "sampled": 5,
          "reason": "Too many siblings (247)"
        }
      ]
    }
  },
  "pages": [...],
  "resources": {
    "total": 47,
    "deduplicated": true
  }
}
```

---

## Configuration Options

### Scope

```bash
# Same origin only (exact domain + port)
node tools/v7-crawler.js https://app.example.com output/app \
  --scope same-origin

# Same domain (includes all subdomains) - DEFAULT
node tools/v7-crawler.js https://example.com output/app \
  --scope same-domain
```

**`same-origin`:**
- ✅ `https://app.example.com/dashboard`
- ❌ `https://admin.example.com` (different subdomain)
- ❌ `http://app.example.com` (different protocol)

**`same-domain`:**
- ✅ `https://example.com`
- ✅ `https://app.example.com`
- ✅ `https://admin.example.com`
- ✅ `http://example.com`
- ❌ `https://google.com`

### Limits

```bash
--max-pages 200      # Stop after discovering 200 pages (default: 200)
--max-depth 4        # Maximum crawl depth (default: 4)
--sample-size 5      # Pages to sample from content zones (default: 5)
```

### Custom Patterns

Modify `v7-crawler.js` to add custom patterns:

```javascript
const crawler = new V7Crawler({
  startUrl: 'https://example.com',
  outputDir: 'output/app',

  // Force these paths as content (will sample)
  contentPatterns: [
    /\/blog\//i,
    /\/custom-content\//i,  // Your custom pattern
  ],

  // Force these paths as app (will extract all)
  appPatterns: [
    /\/dashboard/i,
    /\/custom-app\//i,      // Your custom pattern
  ],

  // Exclude these entirely
  excludePatterns: [
    /\/api\//,
    /logout/i,
    /\.pdf$/i,
  ]
});
```

---

## Examples

### Example 1: SaaS App with Blog

```bash
node tools/v7-crawler.js https://example.com output/example

# Discovers:
# example.com               (5 pages)  → App
# app.example.com/dashboard (12 pages) → App
# example.com/blog          (247 pages) → Content (sample 5)

# Result:
# ✅ Extracted 17 app pages
# ✅ Sampled 5 blog posts
# ✅ Saved 84 deduplicated resources
```

### Example 2: Multi-Subdomain Platform

```bash
node tools/v7-crawler.js https://platform.io output/platform --max-pages 300

# Discovers:
# platform.io               (8 pages)   → App
# app.platform.io          (23 pages)  → App
# admin.platform.io        (12 pages)  → App
# docs.platform.io         (156 pages) → Content (sample 5)
# blog.platform.io         (89 pages)  → Content (sample 5)

# Result:
# ✅ Extracted 43 app pages
# ✅ Sampled 10 content pages
# ✅ Saved 127 deduplicated resources
```

### Example 3: Documentation Site

```bash
node tools/v7-crawler.js https://docs.example.com output/docs \
  --max-pages 100 \
  --sample-size 10

# Discovers:
# docs.example.com/guides  (67 pages) → Content (sample 10)
# docs.example.com/api     (43 pages) → Content (sample 10)

# Result:
# ✅ Extracted 0 app pages (all content)
# ✅ Sampled 20 documentation pages
# ✅ Saved 12 deduplicated resources
```

---

## When to Use Crawler vs Standard V7

### Use Crawler When:
- ✅ Multi-page webapp (dashboard, settings, profile, etc.)
- ✅ Multiple subdomains (app, admin, api)
- ✅ Large sites with blog/help sections
- ✅ You want complete coverage

### Use Standard V7 When:
- ❌ Single-page app (SPA with client-side routing)
- ❌ Single landing page
- ❌ You know the exact URL to extract

---

## Workflow Integration

### Crawler → V8 (Beautify)

```bash
# Step 1: Crawl and extract
node tools/v7-crawler.js https://app.example.com output/app

# Step 2: Beautify extracted JavaScript
python tools/v8-enhance.py output/app/resources/

# Result:
# output/app/
# ├── resources/              # Raw extracted
# ├── resources-beautified/   # Beautified
# └── pages/                  # HTML pages
```

### Crawler → Complete Pipeline (Photopea-style)

```bash
# Step 1: Crawl and extract
node tools/v7-crawler.js https://app.example.com output/app

# Step 2: Analyze operations from extracted code
cd capture-system
node analyze-photopea-source.js ../output/app/resources/app.js

# Step 3-4: Parameter discovery + I/O capture
node discover-parameters.js ../output/app/resources/operations-catalog.json
node universal-capture-v5-complete.js ../output/app/resources/operations-catalog-with-params.json
```

---

## Troubleshooting

### "Discovered 0 pages"

**Cause:** JavaScript-heavy SPA with client-side routing

**Solution:** SPA routes don't show as `<a href>` links. Use single-page V7 instead, or manually specify URLs.

### "Too many pages discovered (1000+)"

**Cause:** Site has infinite pagination or many content pages

**Solution:** Lower `--max-pages` or add exclusion patterns:

```javascript
excludePatterns: [
  /\/page\/\d+/,  // Exclude /page/2, /page/3, etc.
  /\/user\/\d+/,  // Exclude /user/123, /user/456, etc.
]
```

### "All pages classified as content"

**Cause:** Heuristics too aggressive

**Solution:** Add app patterns:

```javascript
appPatterns: [
  /\/dashboard/i,
  /\/workspace/i,
  /\/your-app-path/i,  // Your specific path
]
```

### "Resources not deduplicated"

**Cause:** Same resource served from different URLs

**Solution:** This is expected. Deduplication is based on exact URL matching.

---

## Performance

**Typical Performance:**

| Pages | Time | Resources |
|-------|------|-----------|
| 20 pages | ~5 min | 50-100 |
| 50 pages | ~15 min | 100-200 |
| 100 pages | ~30 min | 200-400 |

**Factors:**
- Page load time (3-5 seconds per page)
- Resource download (network speed)
- Browser overhead (screenshots, HTML capture)

**Optimization:**
- Use `--max-depth 3` to limit deep crawls
- Use `--sample-size 3` to reduce content sampling
- Exclude known content zones with patterns

---

## Summary

**V7 Crawler = Smart Multi-Page Extraction**

✅ Discovers all pages in a webapp
✅ Classifies app vs content intelligently
✅ Extracts app pages exhaustively
✅ Samples content zones representatively
✅ Deduplicates shared resources
✅ Supports multi-subdomain crawling

**Result:** Complete webapp extraction with minimal redundancy!

---

## Next Steps

1. **Run the crawler:**
   ```bash
   node tools/v7-crawler.js https://your-app.com output/your-app
   ```

2. **Review the output:**
   ```bash
   cat output/your-app/manifest.json
   cat output/your-app/sitemap.json
   ```

3. **Beautify code (optional):**
   ```bash
   python tools/v8-enhance.py output/your-app/resources/
   ```

4. **Run analysis (for Photopea-style apps):**
   ```bash
   cd capture-system
   node analyze-photopea-source.js ../output/your-app/resources/app.js
   ```

🎉 **Happy crawling!**
