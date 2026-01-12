# V7 Quick Start - Extract Any Webapp

**One command to extract any webapp - automatically decides single vs multi-page.**

---

## TL;DR

```bash
# 95% of webapps (React, Vue, Angular SPAs)
node tools/v7-extract.js https://app.example.com output/app

# Multi-page sites (marketing + blog)
node tools/v7-extract.js https://example.com output/site --crawl
```

---

## When to Use Each Mode

### ⚡ Default (No Flags) - 95% of Webapps

**Use for:**
- ✅ **Modern web apps** (React, Vue, Angular)
- ✅ **Dashboards** (Notion, Linear, Figma)
- ✅ **SaaS products** (app.example.com)
- ✅ **Admin panels**
- ✅ **Any app with client-side routing**

**How to tell it's a SPA:**
- Clicking links doesn't reload the page
- URL changes but no page flash
- Built with React/Vue/Angular
- All routes under one domain (app.example.com/*)

**Examples:**
```bash
# Gmail (SPA)
node tools/v7-extract.js https://gmail.com output/gmail

# Notion (SPA)
node tools/v7-extract.js https://notion.so output/notion

# Linear (SPA)
node tools/v7-extract.js https://linear.app output/linear

# Your app (probably SPA)
node tools/v7-extract.js https://app.yourcompany.com output/yourapp
```

---

### 🕷️ Crawler Mode (--crawl) - 5% of Sites

**Use for:**
- ✅ **Marketing sites with blog** (example.com/blog)
- ✅ **Documentation sites** (docs.example.com)
- ✅ **Traditional multi-page sites**
- ✅ **WordPress/static sites**

**How to tell it's multi-page:**
- Clicking links reloads the page
- Page flashes white between navigations
- Each URL loads new HTML
- Server-rendered pages

**Examples:**
```bash
# Company marketing site + blog
node tools/v7-extract.js https://example.com output/marketing --crawl

# Documentation site
node tools/v7-extract.js https://docs.example.com output/docs --crawl

# Multi-page traditional site
node tools/v7-extract.js https://wordpress-site.com output/wp --crawl
```

**With options:**
```bash
node tools/v7-extract.js https://example.com output/site --crawl \
  --max-pages 200 \
  --max-depth 4 \
  --sample-size 5
```

---

## Not Sure? Start Without --crawl

**Just run:**
```bash
node tools/v7-extract.js https://your-site.com output/test
```

**The tool will tell you:**
- ✅ If it extracted everything (SPA) → Done!
- ⚠️ If it might be multi-page → Try adding `--crawl`

---

## Output Structure

### Single-Page Mode (Default)
```
output/app/example.com-123456/
├── index.html                # The app
├── screenshot.png           # Screenshot
├── resources/               # All JS/CSS/WASM
│   ├── app.bundle.js
│   ├── vendor.js
│   └── styles.css
└── manifest.json            # Metadata
```

### Crawler Mode (--crawl)
```
output/site/
├── pages/                   # All discovered pages
│   ├── index.html
│   ├── about.html
│   ├── pricing.html
│   ├── blog_post-1.html    # Sampled (5 of 247)
│   └── ... (+ screenshots)
├── resources/               # Shared resources (deduplicated!)
│   ├── app.bundle.js        # Extracted once
│   └── ...
├── manifest.json
└── sitemap.json             # Site structure
```

---

## Real-World Examples

### Example 1: SaaS Product (Typical)

```bash
# The marketing site (optional)
node tools/v7-extract.js https://example.com output/marketing --crawl

# The actual app (required - THIS IS WHAT YOU WANT)
node tools/v7-extract.js https://app.example.com output/app

# Result: Full app extracted in ONE page!
```

**Why?** Most SaaS apps are SPAs. The entire app is in one HTML file with client-side routing.

### Example 2: Documentation Site

```bash
# Docs have 100s of pages - use crawler
node tools/v7-extract.js https://docs.example.com output/docs --crawl

# Result:
# ✅ Discovered 156 pages
# ✅ Extracted all docs
# ✅ Sampled blog posts
```

### Example 3: Not Sure?

```bash
# Start without --crawl
node tools/v7-extract.js https://unknown-site.com output/test

# Check the output:
# - Got everything? Done!
# - Looks incomplete? Try --crawl
```

---

## Quick Decision Tree

```
Is it a modern web app (React/Vue/Angular)?
├─ YES → node tools/v7-extract.js <url> output/app
└─ NO
    └─ Does it have a blog/docs/many pages?
        ├─ YES → node tools/v7-extract.js <url> output/site --crawl
        └─ NO → node tools/v7-extract.js <url> output/app
```

---

## What Gets Extracted?

Both modes extract:
- ✅ HTML, CSS, JavaScript
- ✅ WASM modules
- ✅ WebGL shaders
- ✅ Lazy-loaded resources
- ✅ All assets

**Difference:**
- **Default:** ONE page (covers entire SPA)
- **--crawl:** MULTIPLE pages (discovers all routes)

---

## Next Steps

### After Extraction

**1. Beautify code (optional):**
```bash
python tools/v8-enhance.py output/app/resources/
```

**2. For image editors (Photopea-style apps):**
```bash
cd capture-system
node analyze-photopea-source.js ../output/app/resources/app.js
node discover-parameters.js ../output/app/resources/operations-catalog.json
node universal-capture-v5-complete.js ../output/app/resources/operations-catalog-with-params.json
```

---

## Troubleshooting

### "I only got one page but the site has many pages"

**Solution:** Add `--crawl`:
```bash
node tools/v7-extract.js <url> output/site --crawl
```

### "Crawler found 1000+ pages"

**Solution:** It's probably crawling blog posts. Lower limits:
```bash
node tools/v7-extract.js <url> output/site --crawl --max-pages 50
```

### "How do I know if it's a SPA?"

**Test:** Click a link on the site
- Page reloads? → Multi-page (use --crawl)
- No reload? → SPA (don't use --crawl)

---

## Summary

**For 95% of webapps:**
```bash
node tools/v7-extract.js https://app.example.com output/app
```

**For marketing sites with blog:**
```bash
node tools/v7-extract.js https://example.com output/site --crawl
```

**Not sure? Start without --crawl!**

---

## Full Documentation

- **[V7-EXTRACTOR.md](./V7-EXTRACTOR.md)** - Complete V7 technical docs
- **[V7-CRAWLER.md](./V7-CRAWLER.md)** - Crawler details and heuristics
- **[THREE-PIPELINES.md](./THREE-PIPELINES.md)** - All pipelines overview
- **[V7-V8-QUICK-REFERENCE.md](./V7-V8-QUICK-REFERENCE.md)** - V7 vs V8
