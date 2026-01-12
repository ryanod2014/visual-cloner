/**
 * Coverage Merger - Collect and merge results from all browsers
 */

async function collectCoverage(page) {
  return await page.evaluate(() => {
    if (!window.__capture) {
      return { io: [], calledFunctions: [], wrappedMethods: [], totalCaptures: 0 };
    }
    return window.__capture.getResults();
  });
}

function mergeCoverage(results) {
  const merged = {
    io: [],
    calledFunctions: new Set(),
    wrappedMethods: new Set(),
  };

  for (const result of results) {
    merged.io.push(...(result.io || []));
    for (const fn of result.calledFunctions || []) {
      merged.calledFunctions.add(fn);
    }
    for (const method of result.wrappedMethods || []) {
      merged.wrappedMethods.add(method);
    }
  }

  // Group I/O by function
  const byFunction = {};
  for (const io of merged.io) {
    const fn = io.function;
    if (!byFunction[fn]) {
      byFunction[fn] = [];
    }
    byFunction[fn].push(io);
  }

  // Count successful vs error captures per function
  const functionStats = {};
  for (const [fn, ios] of Object.entries(byFunction)) {
    const successes = ios.filter(io => !io.error);
    const errors = ios.filter(io => io.error);
    functionStats[fn] = {
      total: ios.length,
      successes: successes.length,
      errors: errors.length
    };
  }

  return {
    io: merged.io,
    byFunction,
    functionStats,
    calledFunctions: [...merged.calledFunctions],
    wrappedMethods: [...merged.wrappedMethods],
    totalCaptures: merged.io.length,
    uniqueFunctions: merged.calledFunctions.size,
    totalWrapped: merged.wrappedMethods.size
  };
}

async function sweepGaps(page, uncalledMethods) {
  // For methods that weren't called naturally, try to trigger them directly
  await page.evaluate((methods) => {
    for (const method of methods) {
      const parts = method.split('.');
      const className = parts.length > 1 ? parts[0] : null;
      const methodName = parts.length > 1 ? parts[1] : parts[0];

      try {
        // Try to find an existing instance via window.__instances
        if (className) {
          const Constructor = window[className];
          if (Constructor?.prototype?.[methodName]) {
            // Create test instance if possible
            try {
              const instance = new Constructor();
              if (typeof instance[methodName] === 'function') {
                try { instance[methodName](); } catch (e) {}
                try { instance[methodName](null); } catch (e) {}
                try { instance[methodName](0, 0); } catch (e) {}
                try { instance[methodName]('test'); } catch (e) {}
              }
            } catch (e) {}
          }
        } else {
          // Global function
          const fn = window[methodName];
          if (typeof fn === 'function') {
            try { fn(); } catch (e) {}
            try { fn(null); } catch (e) {}
            try { fn(0, 0); } catch (e) {}
          }
        }
      } catch (e) {}
    }
  }, uncalledMethods);
}

function identifyUncalledMethods(analysis, calledFunctions) {
  const calledSet = new Set(calledFunctions);
  const uncalled = [];

  // Check prototype methods
  for (const pm of analysis.prototypeMethods || []) {
    const fullName = `${pm.className}.${pm.methodName}`;
    if (!calledSet.has(fullName)) {
      uncalled.push(fullName);
    }
  }

  // Check global functions
  for (const fn of analysis.globalFunctions || []) {
    if (!calledSet.has(fn)) {
      uncalled.push(fn);
    }
  }

  return uncalled;
}

module.exports = { collectCoverage, mergeCoverage, sweepGaps, identifyUncalledMethods };
