/**
 * Async Utilities
 * Helper functions for async operations, batching, and error handling
 */

/**
 * Process items in batches with a concurrency limit
 * @param {Array<T>} items - Array of items to process
 * @param {number} size - Maximum number of concurrent operations
 * @param {function(T, number): Promise<R>} fn - Async function to apply to each item
 * @returns {Promise<Array<R>>} - Array of results in the same order as inputs
 * @template T, R
 */
export async function batch(items, size, fn) {
  // Validate inputs
  if (!Array.isArray(items)) {
    throw new Error('Items must be an array');
  }

  if (typeof size !== 'number' || size < 1) {
    throw new Error('Batch size must be a positive number');
  }

  if (typeof fn !== 'function') {
    throw new Error('Callback must be a function');
  }

  // Handle empty array
  if (items.length === 0) {
    return [];
  }

  // Process in batches
  const results = [];

  for (let i = 0; i < items.length; i += size) {
    const batchItems = items.slice(i, i + size);
    const batchPromises = batchItems.map((item, batchIndex) => {
      const globalIndex = i + batchIndex;
      return fn(item, globalIndex);
    });

    // Wait for current batch to complete before starting next
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Retry a function with exponential backoff
 * @param {function(): Promise<T>} fn - The async function to retry
 * @param {number} [attempts=3] - Maximum number of attempts
 * @param {number} [delay=1000] - Initial delay in milliseconds
 * @param {number} [backoffFactor=2] - Multiplier for exponential backoff
 * @returns {Promise<T>} - The result of the function
 * @template T
 */
export async function retry(fn, attempts = 3, delay = 1000, backoffFactor = 2) {
  // Validate inputs
  if (typeof fn !== 'function') {
    throw new Error('First argument must be a function');
  }

  if (typeof attempts !== 'number' || attempts < 1) {
    attempts = 3;
  }

  if (typeof delay !== 'number' || delay < 0) {
    delay = 1000;
  }

  let lastError;
  let currentDelay = delay;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't wait after the last attempt
      if (attempt < attempts) {
        await sleep(currentDelay);
        currentDelay *= backoffFactor;
      }
    }
  }

  // All attempts failed
  throw lastError;
}

/**
 * Add a timeout to a promise
 * @param {Promise<T>} promise - The promise to add timeout to
 * @param {number} ms - Timeout in milliseconds
 * @param {string} [message] - Custom timeout error message
 * @returns {Promise<T>} - The original promise result or timeout error
 * @template T
 */
export async function timeout(promise, ms, message) {
  // Validate inputs
  if (!(promise instanceof Promise)) {
    return Promise.resolve(promise);
  }

  if (typeof ms !== 'number' || ms <= 0) {
    return promise;
  }

  const timeoutMessage = message || `Operation timed out after ${ms}ms`;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, ms);

      // Clean up timer if promise resolves first
      promise.finally(() => clearTimeout(timer)).catch(() => {});
    }),
  ]);
}

/**
 * Promisified setTimeout
 * @param {number} ms - Time to sleep in milliseconds
 * @returns {Promise<void>} - Resolves after the specified time
 */
export function sleep(ms) {
  // Handle invalid inputs
  if (typeof ms !== 'number' || ms <= 0) {
    return Promise.resolve();
  }

  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute promises with a concurrency limit (alternative to batch for dynamic workloads)
 * @param {Array<function(): Promise<T>>} tasks - Array of functions that return promises
 * @param {number} concurrency - Maximum concurrent executions
 * @returns {Promise<Array<{status: 'fulfilled'|'rejected', value?: T, reason?: Error}>>}
 * @template T
 */
export async function pool(tasks, concurrency) {
  // Validate inputs
  if (!Array.isArray(tasks)) {
    throw new Error('Tasks must be an array');
  }

  if (typeof concurrency !== 'number' || concurrency < 1) {
    concurrency = 1;
  }

  const results = new Array(tasks.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < tasks.length) {
      const index = currentIndex++;
      const task = tasks[index];

      try {
        const value = await task();
        results[index] = { status: 'fulfilled', value };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  // Start workers up to concurrency limit
  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}

/**
 * Debounce an async function
 * @param {function(...args): Promise<T>} fn - The function to debounce
 * @param {number} wait - Debounce wait time in milliseconds
 * @returns {function(...args): Promise<T>} - Debounced function
 * @template T
 */
export function debounce(fn, wait) {
  let timeoutId = null;
  let pendingPromise = null;
  let resolve = null;
  let reject = null;

  return function debounced(...args) {
    // Clear existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Create new promise if needed
    if (!pendingPromise) {
      pendingPromise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
    }

    // Set new timeout
    timeoutId = setTimeout(async () => {
      try {
        const result = await fn.apply(this, args);
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        timeoutId = null;
        pendingPromise = null;
        resolve = null;
        reject = null;
      }
    }, wait);

    return pendingPromise;
  };
}

export default {
  batch,
  retry,
  timeout,
  sleep,
  pool,
  debounce,
};
