# V7 vs V8 - Quick Reference

## TL;DR

**V7 = Extraction** (gets all the files)
**V8 = Beautification** (makes code pretty)

---

## What Each Does

| Task | V7 | V8 |
|------|----|----|
| Extract HTML/CSS/JS/WASM | ✅ | ❌ |
| Capture WebGL shaders | ✅ | ❌ |
| Capture lazy-loaded files | ✅ | ❌ |
| Map backend APIs | ✅ | ❌ |
| Generate BACKEND-BLUEPRINT.md | ✅ | ❌ |
| Validate completeness | ✅ | ❌ |
| **Beautify JavaScript** | ❌ | ✅ |
| **Rename variables** | ❌ | ✅ |
| Add documentation | ❌ | ✅ |

---

## Run Order

```bash
# STEP 1: V7 (REQUIRED - Extract everything)
node tools/v7-extractor.js output/app https://app.com http://localhost:3000

# STEP 2: V8 (OPTIONAL - Make code readable)
python tools/v8-enhance.py output/app/resources/
```

---

## Visual Comparison

### Before V7
```
You: "I want to clone this webapp"
Computer: "I don't have the files yet"
```

### After V7
```
output/app/
├── index.html                    ✅
├── resources/                    ✅ (raw extracted code)
│   ├── app.js                    ✅ (minified: function a(b){...})
│   ├── libheif.wasm             ✅ (lazy-loaded, captured!)
│   └── shaders.json             ✅ (WebGL extracted!)
├── manifest.json                 ✅
└── BACKEND-BLUEPRINT.md          ✅ (API contract documented!)

Result: Fully functional clone, but JS is unreadable
```

### After V8 (optional)
```
output/app/
├── resources/                    ✅ (raw extracted code - preserved!)
│   ├── app.js                    ✅ (original minified)
│   └── ...
├── resources-beautified/         ✅ (beautified code - new!)
│   ├── app.js                    ✅ (beautified: function addNumbers(a, b){...})
│   └── ...

Result: Both raw AND beautified code preserved
```

---

## When You Need Each

### Always Need V7
- ✅ Initial extraction
- ✅ Cloning a new webapp
- ✅ Updating an existing clone
- ✅ Getting backend API documentation

### Only Need V8 If
- You want to read the JavaScript
- You need to modify the code
- You're debugging behavior
- You're learning how it works

---

## Example Commands

### Photopea (Client-Side App)
```bash
# V7: Extract everything
node tools/v7-extractor.js \
  output/photopea \
  https://www.photopea.com \
  http://localhost:3344

# Result:
# ✅ 3,987 resources extracted
# ✅ 18 file formats captured
# ✅ No backend needed
# ✅ Ready to deploy!

# V8: Optional beautification
python tools/v8-enhance.py output/photopea/resources/launchpad.js

# Result:
# ✅ Code now readable
# ✅ Variables renamed
```

### Project Management App (With Backend)
```bash
# V7: Extract + document backend
node tools/v7-extractor.js \
  output/projectapp \
  https://projectapp.com \
  http://localhost:3000

# Result:
# ✅ Frontend extracted
# ✅ Backend documented in BACKEND-BLUEPRINT.md
# ✅ 24 API endpoints listed
# ✅ Implementation guide provided

# Read BACKEND-BLUEPRINT.md and implement backend
# Then deploy!

# V8: Optional beautification
python tools/v8-enhance.py output/projectapp/resources/
```

---

## Key Differences

### V7 Extractor
- **Input:** Website URL
- **Output:** All files + backend docs
- **Time:** 5-15 minutes
- **Required:** Always
- **Technologies:** Playwright, CDP, browser automation

### V8 Enhancer
- **Input:** JavaScript files (from V7)
- **Output:** Beautified code
- **Time:** 1-5 minutes
- **Required:** Optional
- **Technologies:** Prettier, AST parsing

---

## What "Beautifying" Means

```javascript
// BEFORE V8 (from V7 extraction)
function a(b,c){return b+c}const d=a(1,2);console.log(d);

// AFTER V8 (beautified + renamed)
/**
 * Adds two numbers together
 * @param {number} num1 - First number
 * @param {number} num2 - Second number
 * @returns {number} Sum
 */
function add(num1, num2) {
  return num1 + num2;
}

const sum = add(1, 2);
console.log(sum);
```

That's what V8 does. V7 gets the files, V8 makes them pretty.

---

## FAQ

**Q: Can I skip V8?**
A: Yes! V8 is optional. Only run it if you need readable code.

**Q: Can I skip V7?**
A: No. V7 extracts everything. Without V7, you have no files.

**Q: Which extracts WebGL shaders?**
A: V7. V8 doesn't extract anything.

**Q: Which creates BACKEND-BLUEPRINT.md?**
A: V7. V8 doesn't document backends.

**Q: Which renames variables?**
A: V8. V7 keeps original names.

**Q: Which do I run first?**
A: V7 (extraction), then optionally V8 (beautification).

**Q: If I just want to deploy the clone, do I need V8?**
A: No. V7 extracts a fully functional clone. V8 just makes the code prettier.

---

## Remember

**V7 = Get the files**
**V8 = Make them pretty**

V7 is the extraction engine.
V8 is the beautifier.

Both are powerful. Both serve different purposes.

📖 Full details: [SYSTEM-OVERVIEW.md](./SYSTEM-OVERVIEW.md)
