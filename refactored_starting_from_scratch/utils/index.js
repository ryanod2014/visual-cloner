/**
 * Utility Functions Index
 * Re-exports all utility modules for convenient importing
 */

// URL manipulation utilities
export {
  resolveUrl,
  normalizeUrl,
  getUrlType,
  isResourceUrl,
  extractOrigin,
} from './url.js';

// File system utilities
export {
  ensureDir,
  writeFile,
  readFile,
  getOutputPath,
  sanitizeFilename,
  pathExists,
} from './file.js';

// Async utilities
export {
  batch,
  retry,
  timeout,
  sleep,
  pool,
  debounce,
} from './async.js';

// Hash utilities
export {
  hashContent,
  shortHash,
  hashMultiple,
  contentFilename,
  contentEquals,
  cacheKey,
} from './hash.js';

// Also export namespaced versions for cases where you want to import all from one module
import * as urlUtils from './url.js';
import * as fileUtils from './file.js';
import * as asyncUtils from './async.js';
import * as hashUtils from './hash.js';

export { urlUtils, fileUtils, asyncUtils, hashUtils };

// Default export with all utilities grouped
export default {
  url: urlUtils,
  file: fileUtils,
  async: asyncUtils,
  hash: hashUtils,
};
