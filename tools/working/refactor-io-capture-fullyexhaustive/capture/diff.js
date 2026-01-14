/**
 * Compute diffs between before/after states
 */
const logger = require('../utils/logger');

/**
 * Compute comprehensive diff between snapshots
 */
function computeDiff(before, after) {
  return {
    urlChanged: before.url !== after.url,
    titleChanged: before.title !== after.title,
    domChanges: computeDOMDiff(before.html, after.html),
    styleChanges: computeStyleDiff(before.styles, after.styles),
    hasChanges: false  // Set below
  };
}

/**
 * Compute DOM diff (simplified)
 */
function computeDOMDiff(beforeHTML, afterHTML) {
  if (beforeHTML === afterHTML) {
    return { changed: false, additions: 0, removals: 0 };
  }

  // Simple line-based diff
  const beforeLines = beforeHTML.split('\n');
  const afterLines = afterHTML.split('\n');

  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);

  let additions = 0;
  let removals = 0;

  for (const line of afterLines) {
    if (!beforeSet.has(line)) additions++;
  }

  for (const line of beforeLines) {
    if (!afterSet.has(line)) removals++;
  }

  return {
    changed: true,
    additions,
    removals,
    totalChanges: additions + removals
  };
}

/**
 * Compute style diff
 */
function computeStyleDiff(beforeStyles, afterStyles) {
  const changes = [];

  const allSelectors = new Set([
    ...Object.keys(beforeStyles || {}),
    ...Object.keys(afterStyles || {})
  ]);

  for (const selector of allSelectors) {
    const before = beforeStyles?.[selector];
    const after = afterStyles?.[selector];

    if (!before && after) {
      changes.push({ selector, type: 'added' });
    } else if (before && !after) {
      changes.push({ selector, type: 'removed' });
    } else if (before && after) {
      const propChanges = [];
      for (const prop of Object.keys(after)) {
        if (before[prop] !== after[prop]) {
          propChanges.push({
            property: prop,
            before: before[prop],
            after: after[prop]
          });
        }
      }
      if (propChanges.length > 0) {
        changes.push({ selector, type: 'modified', changes: propChanges });
      }
    }
  }

  return {
    changed: changes.length > 0,
    changes
  };
}

/**
 * Compute pixel diff (requires pixelmatch)
 */
async function computePixelDiff(beforeScreenshot, afterScreenshot) {
  // For now, just compare base64 strings
  // TODO: Use pixelmatch for actual pixel comparison
  const same = beforeScreenshot === afterScreenshot;

  return {
    changed: !same,
    diffPercent: same ? 0 : null  // Would need pixelmatch for actual %
  };
}

module.exports = {
  computeDiff,
  computeDOMDiff,
  computeStyleDiff,
  computePixelDiff
};
