# Hybrid Approach: Programmatic + Manual

**The Problem:** Pure programmatic extraction achieves 100% completeness but lacks semantic understanding. Pure manual extraction has semantic knowledge but misses operations.

**The Solution:** Combine both approaches for the best of both worlds!

---

## Comparison

| Aspect | Pure Programmatic | Pure Manual | ✅ Hybrid |
|--------|-------------------|-------------|----------|
| **Completeness** | 100% ✅ | ~60% ❌ | 100% ✅ |
| **Semantic understanding** | None ❌ | Full ✅ | Full ✅ |
| **Parameter names** | param0, param1 ❌ | radius, brightness ✅ | radius, brightness ✅ |
| **Domain knowledge** | None ❌ | Full ✅ | Full ✅ |
| **Scalability** | High ✅ | Low ❌ | High ✅ |
| **Maintenance** | Auto ✅ | Manual ❌ | Semi-auto ✅ |

---

## The Hybrid Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    HYBRID WORKFLOW                          │
└─────────────────────────────────────────────────────────────┘

STEP 1: Programmatic Discovery (100% Completeness)
  ├─ Static analysis → ALL operation names
  ├─ Parameter discovery → Parameter signatures
  └─ Output: operations-catalog-with-params.json
       {
         "gaussianBlur": {
           "parameters": {
             "param0": {  ← Technical, no semantic meaning
               "type": "number",
               "min": 0.1,
               "max": 250
             }
           }
         }
       }

        ↓

STEP 2: Manual Curation (Semantic Understanding)
  ├─ Human reviews programmatic results
  ├─ Adds semantic information (names, descriptions, etc.)
  └─ Output: manual-curation.json
       {
         "gaussianBlur": {
           "displayName": "Gaussian Blur",
           "menuPath": "Filter > Blur > Gaussian Blur",
           "description": "Smooths image using Gaussian kernel",
           "parameters": {
             "param0": {
               "name": "radius",  ← Semantic meaning added!
               "displayName": "Blur Radius",
               "unit": "pixels",
               "commonValues": [5, 10, 25],
               "description": "Larger = more blur"
             }
           }
         }
       }

        ↓

STEP 3: Merge (Best of Both Worlds)
  ├─ Combines programmatic + manual
  ├─ Marks operations needing review
  └─ Output: operations-enhanced.json
       {
         "gaussianBlur": {
           "name": "gaussianBlur",
           "displayName": "Gaussian Blur",  ← From manual
           "menuPath": "Filter > Blur > Gaussian Blur",  ← From manual
           "parameters": {
             "param0": {
               "type": "number",  ← From programmatic
               "min": 0.1,  ← From programmatic
               "max": 250,  ← From programmatic
               "name": "radius",  ← From manual
               "unit": "pixels",  ← From manual
               "commonValues": [5, 10, 25]  ← From manual
             }
           },
           "_enhanced": true,
           "_sources": { "programmatic": true, "manual": true }
         }
       }

        ↓

STEP 4: Universal Capture (Complete I/O)
  ├─ Uses enhanced catalog
  └─ Output: complete-io-catalog.json (100% + semantic info)
```

---

## What Programmatic Discovery Provides

✅ **Completeness** - Finds ALL operations (47 for Photopea)
✅ **Parameter signatures** - Type, min, max, working values
✅ **Technical accuracy** - Exact ranges that work
✅ **No human error** - Won't miss operations
✅ **Scalability** - Works for any app

Example:
```json
{
  "gaussianBlur": {
    "parameters": {
      "parameterCount": 1,
      "parameterTypes": ["number"],
      "ranges": {
        "param0": {
          "type": "number",
          "min": 0.1,
          "max": 250,
          "workingValues": [1, 5, 10, 25, 50, 100, 250]
        }
      }
    }
  }
}
```

---

## What Manual Curation Adds

✅ **Semantic meaning** - Parameter names (radius vs param0)
✅ **Domain knowledge** - Common values, recommended settings
✅ **Context** - When to use, why it's useful
✅ **Organization** - Categories, menu paths
✅ **Quality** - Performance notes, edge cases
✅ **Relationships** - Related operations, alternatives

Example:
```json
{
  "gaussianBlur": {
    "displayName": "Gaussian Blur",
    "menuPath": "Filter > Blur > Gaussian Blur",
    "description": "Smooths image using Gaussian kernel",
    "commonUse": "Remove noise, soften edges, create depth of field",
    "performance": "Medium - slows down at radius > 50",

    "parameters": {
      "param0": {
        "name": "radius",
        "displayName": "Blur Radius",
        "unit": "pixels",
        "description": "Size of Gaussian kernel. Larger = more blur.",
        "commonValues": [5, 10, 25],
        "recommended": {
          "soft": 5,
          "medium": 10,
          "heavy": 25
        },
        "notes": "Values > 50 are very slow"
      }
    },

    "examples": {
      "portraitBlur": "gaussianBlur(25) - Smooth skin texture",
      "backgroundBlur": "gaussianBlur(50) - Depth of field effect"
    },

    "relatedOperations": ["boxBlur", "motionBlur", "smartBlur"]
  }
}
```

---

## Hybrid Workflow Commands

### Step 1: Programmatic Discovery

```bash
# Extract source with V7
node tools/v7-extractor.js output/photopea https://www.photopea.com http://localhost:3344

# Discover operations from source
cd capture-system
node analyze-photopea-source.js ../output/photopea/resources/app.js
# → operations-catalog.json (47 operations)

# Discover parameters
node discover-parameters.js ../output/photopea/resources/operations-catalog.json
# → operations-catalog-with-params.json
```

### Step 2: Manual Curation

```bash
# Copy template
cp manual-curation-template.json manual-curation.json

# Edit manual-curation.json to add semantic information
# (Use operations-catalog-with-params.json as reference)
```

**Example manual curation:**
```json
{
  "operations": {
    "gaussianBlur": {
      "name": "gaussianBlur",
      "category": "blur",

      "_MANUAL_FIELDS": {
        "displayName": "Gaussian Blur",
        "menuPath": "Filter > Blur > Gaussian Blur",
        "description": "Smooths image using Gaussian kernel",
        "commonUse": "Remove noise, soften edges",
        "performance": "Medium - slows at radius > 50"
      },

      "parameters": {
        "param0": {
          "_MANUAL_ENHANCEMENT": {
            "name": "radius",
            "displayName": "Blur Radius",
            "unit": "pixels",
            "commonValues": [5, 10, 25],
            "notes": "Values > 50 are very slow"
          }
        }
      }
    }
  }
}
```

### Step 3: Merge

```bash
# Merge programmatic + manual
node merge-with-curation.js \
  operations-catalog-with-params.json \
  manual-curation.json \
  operations-enhanced.json

# Output:
# ✅ 3 operations enhanced (both sources)
# ⚠️  44 operations need manual curation
```

### Step 4: Universal Capture with Enhanced Catalog

```bash
# Use enhanced catalog for I/O capture
node universal-capture-v5-complete.js operations-enhanced.json

# Result: complete-io-catalog.json with:
# - 100% completeness (from programmatic)
# - Full semantic information (from manual)
```

---

## Benefits of Hybrid Approach

### 1. **No Missing Operations**

```
Pure Manual:  29 operations (missed 18) ❌
Programmatic: 47 operations ✅
Hybrid:       47 operations ✅
```

### 2. **Semantic Understanding**

```
Programmatic: param0 (type: number, min: 0.1, max: 250) ❌
Hybrid:       radius (type: number, min: 0.1, max: 250, unit: pixels, commonValues: [5, 10, 25]) ✅
```

### 3. **Maintainable**

When app updates:
1. Re-run programmatic discovery (finds new operations)
2. Merge with existing manual curation (keeps semantic info)
3. Only new operations need manual review

### 4. **Quality Documentation**

```json
// Pure programmatic:
{
  "brightness": {
    "parameters": {
      "param0": { "type": "number", "min": -150, "max": 150 },
      "param1": { "type": "number", "min": -150, "max": 150 }
    }
  }
}

// Hybrid:
{
  "brightness": {
    "displayName": "Brightness/Contrast",
    "menuPath": "Image > Adjustments > Brightness/Contrast",
    "description": "Adjusts brightness and contrast",
    "commonUse": "Correct underexposed photos",
    "parameters": {
      "param0": {
        "type": "number",
        "min": -150,
        "max": 150,
        "name": "brightness",
        "unit": "percent",
        "commonValues": [-50, 0, 50],
        "notes": "Values near ±150 cause clipping"
      },
      "param1": {
        "type": "number",
        "min": -150,
        "max": 150,
        "name": "contrast",
        "unit": "percent",
        "commonValues": [0, 50, 100]
      }
    },
    "examples": {
      "brightPhoto": "brightness(50, 0) - Brighten photo",
      "addContrast": "brightness(0, 50) - Increase contrast"
    }
  }
}
```

---

## Iterative Curation Process

**First iteration** (focus on completeness):
```bash
# Step 1: Get ALL operations
node analyze-photopea-source.js app.js
node discover-parameters.js operations-catalog.json

# Step 2: Quick manual pass (just names and categories)
# Edit manual-curation.json - add displayName and category only

# Step 3: Merge and capture
node merge-with-curation.js ... operations-v1.json
node universal-capture-v5-complete.js operations-v1.json

# Result: 100% complete catalog with basic info ✅
```

**Second iteration** (add semantic depth):
```bash
# Step 1: Add parameter names and descriptions
# Edit manual-curation.json - add name, unit, description for each param

# Step 2: Merge
node merge-with-curation.js ... operations-v2.json

# Result: Better documentation ✅
```

**Third iteration** (domain knowledge):
```bash
# Step 1: Add domain knowledge
# Edit manual-curation.json - add commonValues, recommended, examples

# Step 2: Merge
node merge-with-curation.js ... operations-v3.json

# Result: Production-ready catalog ✅
```

---

## When Manual Curation is NOT Needed

Skip manual curation if:
- You only need black-box I/O matching (clean-room implementation)
- You don't need human-readable documentation
- Parameter names don't matter (param0 is fine)
- You're doing automated testing only

In these cases, pure programmatic discovery is sufficient!

---

## Summary

**Pure Programmatic:**
- ✅ 100% completeness
- ❌ No semantic understanding
- Use when: Automated testing, I/O matching only

**Pure Manual:**
- ✅ Semantic understanding
- ❌ ~60% completeness (misses operations)
- Use when: Small apps, you know all features

**✅ Hybrid (Best):**
- ✅ 100% completeness (from programmatic)
- ✅ Semantic understanding (from manual)
- ✅ Maintainable (programmatic discovers, manual enhances)
- Use when: Production-quality documentation needed

---

## Next Steps

1. **Run programmatic discovery** to get 100% operation list
2. **Copy manual-curation-template.json** to manual-curation.json
3. **Add semantic information** for important operations first
4. **Merge** programmatic + manual with merge-with-curation.js
5. **Iterate** - add more semantic info over time

**The hybrid approach gives you 100% completeness with human understanding!** ✅
