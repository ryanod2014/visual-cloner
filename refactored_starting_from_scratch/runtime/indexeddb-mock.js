/**
 * Complete In-Memory IndexedDB Implementation
 *
 * A full-featured IndexedDB mock for universal webapp extraction.
 * Supports all major IDB operations including transactions, cursors, and indexes.
 *
 * @module indexeddb-mock
 */

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Deep clone an object (structured clone simulation)
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 */
function structuredClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  if (obj instanceof RegExp) {
    return new RegExp(obj.source, obj.flags);
  }

  if (obj instanceof Array) {
    return obj.map(item => structuredClone(item));
  }

  if (obj instanceof Map) {
    const map = new Map();
    obj.forEach((value, key) => {
      map.set(structuredClone(key), structuredClone(value));
    });
    return map;
  }

  if (obj instanceof Set) {
    const set = new Set();
    obj.forEach(value => {
      set.add(structuredClone(value));
    });
    return set;
  }

  if (obj.constructor === Object) {
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = structuredClone(obj[key]);
      }
    }
    return cloned;
  }

  // For other objects, try to clone
  return Object.assign(Object.create(Object.getPrototypeOf(obj)), obj);
}

/**
 * Get value from object using keyPath
 * @param {Object} obj - Object to extract from
 * @param {string|string[]} keyPath - Key path
 * @returns {*} Extracted value
 */
function getKeyPathValue(obj, keyPath) {
  if (!keyPath) return undefined;

  const paths = Array.isArray(keyPath) ? keyPath : keyPath.split('.');
  let value = obj;

  for (const path of paths) {
    if (value == null) return undefined;
    value = value[path];
  }

  return value;
}

/**
 * Set value in object using keyPath
 * @param {Object} obj - Object to modify
 * @param {string|string[]} keyPath - Key path
 * @param {*} value - Value to set
 */
function setKeyPathValue(obj, keyPath, value) {
  if (!keyPath) return;

  const paths = Array.isArray(keyPath) ? keyPath : keyPath.split('.');
  let current = obj;

  for (let i = 0; i < paths.length - 1; i++) {
    const path = paths[i];
    if (!(path in current)) {
      current[path] = {};
    }
    current = current[path];
  }

  current[paths[paths.length - 1]] = value;
}

/**
 * Compare keys for sorting
 * @param {*} a - First key
 * @param {*} b - Second key
 * @returns {number} Comparison result
 */
function compareKeys(a, b) {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  if (a === null) return 1;
  if (b === null) return -1;

  const typeA = typeof a;
  const typeB = typeof b;

  if (typeA !== typeB) {
    const order = { number: 0, string: 1, date: 2, array: 3 };
    return (order[typeA] || 4) - (order[typeB] || 4);
  }

  if (typeA === 'number' || typeA === 'string') {
    return a < b ? -1 : 1;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const cmp = compareKeys(a[i], b[i]);
      if (cmp !== 0) return cmp;
    }
    return a.length - b.length;
  }

  return 0;
}

/**
 * Check if key matches range
 * @param {*} key - Key to check
 * @param {IDBKeyRange|*} range - Range or single key
 * @returns {boolean} True if key is in range
 */
function keyInRange(key, range) {
  if (!range) return true;

  if (!(range instanceof IDBKeyRange)) {
    return compareKeys(key, range) === 0;
  }

  if (range.lower !== undefined) {
    const cmp = compareKeys(key, range.lower);
    if (cmp < 0 || (cmp === 0 && range.lowerOpen)) {
      return false;
    }
  }

  if (range.upper !== undefined) {
    const cmp = compareKeys(key, range.upper);
    if (cmp > 0 || (cmp === 0 && range.upperOpen)) {
      return false;
    }
  }

  return true;
}

/**
 * Generate auto-increment key
 * @param {number} current - Current key value
 * @returns {number} Next key value
 */
function nextAutoIncrementKey(current) {
  return Math.floor(current) + 1;
}

// ============================================================================
// Event Target Base Class
// ============================================================================

class IDBEventTarget {
  constructor() {
    this._listeners = {};
  }

  addEventListener(type, listener) {
    if (!this._listeners[type]) {
      this._listeners[type] = [];
    }
    if (!this._listeners[type].includes(listener)) {
      this._listeners[type].push(listener);
    }
  }

  removeEventListener(type, listener) {
    if (this._listeners[type]) {
      this._listeners[type] = this._listeners[type].filter(l => l !== listener);
    }
  }

  dispatchEvent(event) {
    event.target = this;

    // Call on* handler
    const handler = this[`on${event.type}`];
    if (handler) {
      handler.call(this, event);
    }

    // Call registered listeners
    if (this._listeners[event.type]) {
      this._listeners[event.type].forEach(listener => {
        listener.call(this, event);
      });
    }

    return !event.defaultPrevented;
  }
}

// ============================================================================
// IDBRequest
// ============================================================================

class IDBRequest extends IDBEventTarget {
  constructor(source, transaction) {
    super();
    this.source = source;
    this.transaction = transaction;
    this.readyState = 'pending';
    this.result = undefined;
    this.error = null;
    this.onsuccess = null;
    this.onerror = null;
  }

  _setResult(result) {
    this.result = result;
    this.readyState = 'done';

    queueMicrotask(() => {
      const event = new Event('success');
      this.dispatchEvent(event);
    });
  }

  _setError(error) {
    this.error = error;
    this.readyState = 'done';

    queueMicrotask(() => {
      const event = new Event('error');
      event.error = error;
      this.dispatchEvent(event);

      if (this.transaction) {
        this.transaction._abort(error);
      }
    });
  }
}

// ============================================================================
// IDBOpenDBRequest
// ============================================================================

class IDBOpenDBRequest extends IDBRequest {
  constructor() {
    super(null, null);
    this.onupgradeneeded = null;
    this.onblocked = null;
  }
}

// ============================================================================
// IDBKeyRange
// ============================================================================

class IDBKeyRange {
  constructor(lower, upper, lowerOpen, upperOpen) {
    this.lower = lower;
    this.upper = upper;
    this.lowerOpen = lowerOpen;
    this.upperOpen = upperOpen;
  }

  static only(value) {
    return new IDBKeyRange(value, value, false, false);
  }

  static lowerBound(lower, open = false) {
    return new IDBKeyRange(lower, undefined, open, true);
  }

  static upperBound(upper, open = false) {
    return new IDBKeyRange(undefined, upper, true, open);
  }

  static bound(lower, upper, lowerOpen = false, upperOpen = false) {
    return new IDBKeyRange(lower, upper, lowerOpen, upperOpen);
  }

  includes(key) {
    return keyInRange(key, this);
  }
}

// ============================================================================
// IDBCursor
// ============================================================================

class IDBCursor {
  constructor(source, direction, request, records, transaction) {
    this.source = source;
    this.direction = direction;
    this.key = undefined;
    this.primaryKey = undefined;
    this.value = undefined;

    this._request = request;
    this._records = records;
    this._position = -1;
    this._transaction = transaction;

    this._advance();
  }

  _advance() {
    this._position++;

    if (this._position >= this._records.length) {
      this.key = undefined;
      this.primaryKey = undefined;
      this.value = undefined;
      this._request._setResult(null);
      return;
    }

    const record = this._records[this._position];
    this.key = record.key;
    this.primaryKey = record.primaryKey || record.key;
    this.value = record.value;

    this._request._setResult(this);
  }

  advance(count) {
    if (!count || count <= 0) {
      throw new TypeError('Count must be positive');
    }

    this._position += count - 1;
    this._advance();
  }

  continue(key) {
    if (key !== undefined) {
      // Skip to the specified key
      while (this._position < this._records.length - 1) {
        this._position++;
        const record = this._records[this._position];
        if (compareKeys(record.key, key) >= 0) {
          this._position--;
          break;
        }
      }
    }

    this._advance();
  }

  continuePrimaryKey(key, primaryKey) {
    // For simplicity, just continue to next matching key
    this.continue(key);
  }

  update(value) {
    const request = new IDBRequest(this.source, this._transaction);

    queueMicrotask(() => {
      try {
        if (this.source instanceof IDBObjectStore) {
          this.source._putInternal(value, this.primaryKey, false);
        } else if (this.source instanceof IDBIndex) {
          this.source.objectStore._putInternal(value, this.primaryKey, false);
        }

        request._setResult(undefined);
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  delete() {
    const request = new IDBRequest(this.source, this._transaction);

    queueMicrotask(() => {
      try {
        if (this.source instanceof IDBObjectStore) {
          this.source._deleteInternal(this.primaryKey);
        } else if (this.source instanceof IDBIndex) {
          this.source.objectStore._deleteInternal(this.primaryKey);
        }

        request._setResult(undefined);
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }
}

// ============================================================================
// IDBCursorWithValue
// ============================================================================

class IDBCursorWithValue extends IDBCursor {
  constructor(source, direction, request, records, transaction) {
    super(source, direction, request, records, transaction);
  }
}

// ============================================================================
// IDBIndex
// ============================================================================

class IDBIndex {
  constructor(objectStore, name, keyPath, options = {}) {
    this.objectStore = objectStore;
    this.name = name;
    this.keyPath = keyPath;
    this.multiEntry = options.multiEntry || false;
    this.unique = options.unique || false;
  }

  _getIndexRecords() {
    const records = [];
    const store = this.objectStore._data;

    for (const [primaryKey, value] of store) {
      const indexKey = getKeyPathValue(value, this.keyPath);

      if (indexKey !== undefined) {
        if (this.multiEntry && Array.isArray(indexKey)) {
          indexKey.forEach(key => {
            records.push({ key, primaryKey, value });
          });
        } else {
          records.push({ key: indexKey, primaryKey, value });
        }
      }
    }

    records.sort((a, b) => compareKeys(a.key, b.key));
    return records;
  }

  get(key) {
    const request = new IDBRequest(this, this.objectStore._transaction);

    queueMicrotask(() => {
      try {
        const records = this._getIndexRecords();
        const record = records.find(r => compareKeys(r.key, key) === 0);
        request._setResult(record ? structuredClone(record.value) : undefined);
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  getAll(query, count) {
    const request = new IDBRequest(this, this.objectStore._transaction);

    queueMicrotask(() => {
      try {
        const records = this._getIndexRecords();
        const filtered = records.filter(r => keyInRange(r.key, query));
        const limited = count ? filtered.slice(0, count) : filtered;
        const values = limited.map(r => structuredClone(r.value));
        request._setResult(values);
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  getAllKeys(query, count) {
    const request = new IDBRequest(this, this.objectStore._transaction);

    queueMicrotask(() => {
      try {
        const records = this._getIndexRecords();
        const filtered = records.filter(r => keyInRange(r.key, query));
        const limited = count ? filtered.slice(0, count) : filtered;
        const keys = limited.map(r => r.primaryKey);
        request._setResult(keys);
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  getKey(key) {
    const request = new IDBRequest(this, this.objectStore._transaction);

    queueMicrotask(() => {
      try {
        const records = this._getIndexRecords();
        const record = records.find(r => compareKeys(r.key, key) === 0);
        request._setResult(record ? record.primaryKey : undefined);
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  count(query) {
    const request = new IDBRequest(this, this.objectStore._transaction);

    queueMicrotask(() => {
      try {
        const records = this._getIndexRecords();
        const filtered = records.filter(r => keyInRange(r.key, query));
        request._setResult(filtered.length);
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  openCursor(query, direction = 'next') {
    const request = new IDBRequest(this, this.objectStore._transaction);

    queueMicrotask(() => {
      try {
        let records = this._getIndexRecords();
        records = records.filter(r => keyInRange(r.key, query));

        if (direction === 'prev' || direction === 'prevunique') {
          records.reverse();
        }

        if (direction === 'nextunique' || direction === 'prevunique') {
          const seen = new Set();
          records = records.filter(r => {
            const key = JSON.stringify(r.key);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }

        if (records.length > 0) {
          new IDBCursorWithValue(this, direction, request, records, this.objectStore._transaction);
        } else {
          request._setResult(null);
        }
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  openKeyCursor(query, direction = 'next') {
    const request = new IDBRequest(this, this.objectStore._transaction);

    queueMicrotask(() => {
      try {
        let records = this._getIndexRecords();
        records = records.filter(r => keyInRange(r.key, query));

        if (direction === 'prev' || direction === 'prevunique') {
          records.reverse();
        }

        // Remove values for key cursor
        records = records.map(r => ({ key: r.key, primaryKey: r.primaryKey }));

        if (records.length > 0) {
          new IDBCursor(this, direction, request, records, this.objectStore._transaction);
        } else {
          request._setResult(null);
        }
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }
}

// ============================================================================
// IDBObjectStore
// ============================================================================

class IDBObjectStore {
  constructor(transaction, name, options = {}) {
    this._transaction = transaction;
    this.name = name;
    this.keyPath = options.keyPath || null;
    this.autoIncrement = options.autoIncrement || false;
    this.indexNames = [];
    this._indexes = new Map();
    this._data = new Map();
    this._autoIncrementKey = 1;
  }

  _putInternal(value, key, isAdd) {
    // Clone the value
    value = structuredClone(value);

    // Determine the key
    let finalKey = key;

    if (this.keyPath) {
      const keyPathValue = getKeyPathValue(value, this.keyPath);

      if (keyPathValue !== undefined) {
        finalKey = keyPathValue;
      } else if (this.autoIncrement) {
        finalKey = this._autoIncrementKey;
        setKeyPathValue(value, this.keyPath, finalKey);
        this._autoIncrementKey = nextAutoIncrementKey(this._autoIncrementKey);
      } else if (finalKey === undefined) {
        throw new DOMException('Key is required', 'DataError');
      }
    } else if (finalKey === undefined && this.autoIncrement) {
      finalKey = this._autoIncrementKey;
      this._autoIncrementKey = nextAutoIncrementKey(this._autoIncrementKey);
    }

    if (finalKey === undefined) {
      throw new DOMException('Key is required', 'DataError');
    }

    // Check if key exists for add operation
    if (isAdd && this._data.has(finalKey)) {
      throw new DOMException('Key already exists', 'ConstraintError');
    }

    // Check unique constraints on indexes
    for (const [indexName, index] of this._indexes) {
      if (index.unique) {
        const indexKey = getKeyPathValue(value, index.keyPath);
        if (indexKey !== undefined) {
          for (const [existingKey, existingValue] of this._data) {
            if (existingKey !== finalKey) {
              const existingIndexKey = getKeyPathValue(existingValue, index.keyPath);
              if (compareKeys(indexKey, existingIndexKey) === 0) {
                throw new DOMException('Unique constraint violated', 'ConstraintError');
              }
            }
          }
        }
      }
    }

    this._data.set(finalKey, value);
    return finalKey;
  }

  _deleteInternal(key) {
    this._data.delete(key);
  }

  add(value, key) {
    const request = new IDBRequest(this, this._transaction);

    queueMicrotask(() => {
      try {
        const finalKey = this._putInternal(value, key, true);
        request._setResult(finalKey);
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  put(value, key) {
    const request = new IDBRequest(this, this._transaction);

    queueMicrotask(() => {
      try {
        const finalKey = this._putInternal(value, key, false);
        request._setResult(finalKey);
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  get(key) {
    const request = new IDBRequest(this, this._transaction);

    queueMicrotask(() => {
      try {
        const value = this._data.get(key);
        request._setResult(value ? structuredClone(value) : undefined);
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  getAll(query, count) {
    const request = new IDBRequest(this, this._transaction);

    queueMicrotask(() => {
      try {
        let results = [];

        for (const [key, value] of this._data) {
          if (keyInRange(key, query)) {
            results.push(structuredClone(value));
          }
        }

        if (count) {
          results = results.slice(0, count);
        }

        request._setResult(results);
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  getAllKeys(query, count) {
    const request = new IDBRequest(this, this._transaction);

    queueMicrotask(() => {
      try {
        let results = [];

        for (const [key] of this._data) {
          if (keyInRange(key, query)) {
            results.push(key);
          }
        }

        if (count) {
          results = results.slice(0, count);
        }

        request._setResult(results);
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  getKey(key) {
    const request = new IDBRequest(this, this._transaction);

    queueMicrotask(() => {
      try {
        const exists = this._data.has(key);
        request._setResult(exists ? key : undefined);
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  delete(key) {
    const request = new IDBRequest(this, this._transaction);

    queueMicrotask(() => {
      try {
        if (key instanceof IDBKeyRange) {
          for (const [k] of this._data) {
            if (keyInRange(k, key)) {
              this._data.delete(k);
            }
          }
        } else {
          this._data.delete(key);
        }
        request._setResult(undefined);
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  clear() {
    const request = new IDBRequest(this, this._transaction);

    queueMicrotask(() => {
      try {
        this._data.clear();
        request._setResult(undefined);
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  count(query) {
    const request = new IDBRequest(this, this._transaction);

    queueMicrotask(() => {
      try {
        let count = 0;

        for (const [key] of this._data) {
          if (keyInRange(key, query)) {
            count++;
          }
        }

        request._setResult(count);
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  openCursor(query, direction = 'next') {
    const request = new IDBRequest(this, this._transaction);

    queueMicrotask(() => {
      try {
        let records = [];

        for (const [key, value] of this._data) {
          if (keyInRange(key, query)) {
            records.push({ key, value: structuredClone(value) });
          }
        }

        records.sort((a, b) => compareKeys(a.key, b.key));

        if (direction === 'prev' || direction === 'prevunique') {
          records.reverse();
        }

        if (records.length > 0) {
          new IDBCursorWithValue(this, direction, request, records, this._transaction);
        } else {
          request._setResult(null);
        }
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  openKeyCursor(query, direction = 'next') {
    const request = new IDBRequest(this, this._transaction);

    queueMicrotask(() => {
      try {
        let records = [];

        for (const [key] of this._data) {
          if (keyInRange(key, query)) {
            records.push({ key });
          }
        }

        records.sort((a, b) => compareKeys(a.key, b.key));

        if (direction === 'prev' || direction === 'prevunique') {
          records.reverse();
        }

        if (records.length > 0) {
          new IDBCursor(this, direction, request, records, this._transaction);
        } else {
          request._setResult(null);
        }
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  createIndex(name, keyPath, options = {}) {
    if (this._transaction.mode !== 'versionchange') {
      throw new DOMException('Invalid state', 'InvalidStateError');
    }

    if (this._indexes.has(name)) {
      throw new DOMException('Index already exists', 'ConstraintError');
    }

    const index = new IDBIndex(this, name, keyPath, options);
    this._indexes.set(name, index);
    this.indexNames.push(name);

    return index;
  }

  deleteIndex(name) {
    if (this._transaction.mode !== 'versionchange') {
      throw new DOMException('Invalid state', 'InvalidStateError');
    }

    if (!this._indexes.has(name)) {
      throw new DOMException('Index not found', 'NotFoundError');
    }

    this._indexes.delete(name);
    this.indexNames = this.indexNames.filter(n => n !== name);
  }

  index(name) {
    const index = this._indexes.get(name);

    if (!index) {
      throw new DOMException('Index not found', 'NotFoundError');
    }

    return index;
  }
}

// ============================================================================
// IDBTransaction
// ============================================================================

class IDBTransaction extends IDBEventTarget {
  constructor(db, storeNames, mode) {
    super();
    this.db = db;
    this.mode = mode;
    this.objectStoreNames = storeNames;
    this.error = null;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;

    this._stores = new Map();
    this._aborted = false;
    this._finished = false;
    this._requests = 0;

    // Auto-commit when all requests complete
    this._checkComplete = () => {
      if (this._requests === 0 && !this._finished && !this._aborted) {
        queueMicrotask(() => {
          if (this._requests === 0 && !this._finished && !this._aborted) {
            this._complete();
          }
        });
      }
    };
  }

  objectStore(name) {
    if (!this.objectStoreNames.includes(name)) {
      throw new DOMException('Object store not found', 'NotFoundError');
    }

    if (!this._stores.has(name)) {
      const dbStore = this.db._stores.get(name);
      const txStore = new IDBObjectStore(this, name, {
        keyPath: dbStore.keyPath,
        autoIncrement: dbStore.autoIncrement
      });

      // Copy data reference
      txStore._data = dbStore._data;
      txStore._autoIncrementKey = dbStore._autoIncrementKey;

      // Copy indexes
      for (const [indexName, index] of dbStore._indexes) {
        const txIndex = new IDBIndex(txStore, indexName, index.keyPath, {
          unique: index.unique,
          multiEntry: index.multiEntry
        });
        txStore._indexes.set(indexName, txIndex);
        txStore.indexNames.push(indexName);
      }

      this._stores.set(name, txStore);
    }

    return this._stores.get(name);
  }

  abort() {
    if (this._finished) {
      throw new DOMException('Transaction has finished', 'InvalidStateError');
    }

    this._abort(new DOMException('Transaction aborted', 'AbortError'));
  }

  _abort(error) {
    if (this._aborted || this._finished) return;

    this._aborted = true;
    this._finished = true;
    this.error = error;

    queueMicrotask(() => {
      const event = new Event('abort');
      this.dispatchEvent(event);
    });
  }

  commit() {
    if (this._finished) {
      throw new DOMException('Transaction has finished', 'InvalidStateError');
    }

    if (this._requests > 0) {
      throw new DOMException('Cannot commit with pending requests', 'InvalidStateError');
    }

    this._complete();
  }

  _complete() {
    if (this._finished) return;

    this._finished = true;

    // Commit changes back to database
    for (const [name, txStore] of this._stores) {
      const dbStore = this.db._stores.get(name);
      dbStore._autoIncrementKey = txStore._autoIncrementKey;
    }

    queueMicrotask(() => {
      const event = new Event('complete');
      this.dispatchEvent(event);
    });
  }
}

// ============================================================================
// IDBDatabase
// ============================================================================

class IDBDatabase extends IDBEventTarget {
  constructor(name, version) {
    super();
    this.name = name;
    this.version = version;
    this.objectStoreNames = [];
    this.onversionchange = null;
    this.onclose = null;
    this.onerror = null;

    this._stores = new Map();
    this._closed = false;
  }

  createObjectStore(name, options = {}) {
    if (this._versionChangeTransaction &&
        this._versionChangeTransaction.mode === 'versionchange') {

      if (this._stores.has(name)) {
        throw new DOMException('Object store already exists', 'ConstraintError');
      }

      const store = new IDBObjectStore(this._versionChangeTransaction, name, options);
      this._stores.set(name, store);
      this.objectStoreNames.push(name);

      return store;
    }

    throw new DOMException('Not in version change transaction', 'InvalidStateError');
  }

  deleteObjectStore(name) {
    if (this._versionChangeTransaction &&
        this._versionChangeTransaction.mode === 'versionchange') {

      if (!this._stores.has(name)) {
        throw new DOMException('Object store not found', 'NotFoundError');
      }

      this._stores.delete(name);
      this.objectStoreNames = this.objectStoreNames.filter(n => n !== name);

      return;
    }

    throw new DOMException('Not in version change transaction', 'InvalidStateError');
  }

  transaction(storeNames, mode = 'readonly') {
    if (this._closed) {
      throw new DOMException('Database is closed', 'InvalidStateError');
    }

    if (typeof storeNames === 'string') {
      storeNames = [storeNames];
    }

    for (const name of storeNames) {
      if (!this.objectStoreNames.includes(name)) {
        throw new DOMException('Object store not found', 'NotFoundError');
      }
    }

    const transaction = new IDBTransaction(this, storeNames, mode);

    return transaction;
  }

  close() {
    if (!this._closed) {
      this._closed = true;

      queueMicrotask(() => {
        const event = new Event('close');
        this.dispatchEvent(event);
      });
    }
  }
}

// ============================================================================
// IDBFactory
// ============================================================================

class IDBFactory {
  constructor() {
    this._databases = new Map();
  }

  open(name, version) {
    const request = new IDBOpenDBRequest();

    queueMicrotask(() => {
      try {
        let dbInfo = this._databases.get(name);
        let needsUpgrade = false;

        if (!dbInfo) {
          // New database
          version = version || 1;
          needsUpgrade = true;

          dbInfo = {
            name,
            version,
            db: new IDBDatabase(name, version)
          };

          this._databases.set(name, dbInfo);
        } else if (version && version > dbInfo.version) {
          // Upgrade needed
          needsUpgrade = true;
          dbInfo.version = version;
          dbInfo.db.version = version;
        } else if (version && version < dbInfo.version) {
          // Version downgrade not allowed
          const error = new DOMException('Version too low', 'VersionError');
          request._setError(error);
          return;
        }

        if (needsUpgrade) {
          // Create version change transaction
          const transaction = new IDBTransaction(
            dbInfo.db,
            Array.from(dbInfo.db._stores.keys()),
            'versionchange'
          );

          dbInfo.db._versionChangeTransaction = transaction;

          // Fire upgradeneeded event
          const event = new Event('upgradeneeded');
          event.oldVersion = dbInfo.db.version - (version - dbInfo.db.version);
          event.newVersion = version;
          request.transaction = transaction;
          request.result = dbInfo.db;

          setTimeout(() => {
            request.dispatchEvent(event);

            // Wait for transaction to complete
            transaction.addEventListener('complete', () => {
              dbInfo.db._versionChangeTransaction = null;
              request._setResult(dbInfo.db);
            });

            transaction.addEventListener('abort', () => {
              dbInfo.db._versionChangeTransaction = null;
              request._setError(new DOMException('Upgrade aborted', 'AbortError'));
            });

            // Auto-complete if no operations pending
            transaction._checkComplete();
          }, 0);
        } else {
          // No upgrade needed
          request._setResult(dbInfo.db);
        }
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  deleteDatabase(name) {
    const request = new IDBOpenDBRequest();

    queueMicrotask(() => {
      try {
        const dbInfo = this._databases.get(name);

        if (dbInfo) {
          dbInfo.db.close();
          this._databases.delete(name);
        }

        request._setResult(undefined);
      } catch (e) {
        request._setError(e);
      }
    });

    return request;
  }

  databases() {
    return Promise.resolve(
      Array.from(this._databases.values()).map(dbInfo => ({
        name: dbInfo.name,
        version: dbInfo.version
      }))
    );
  }

  cmp(a, b) {
    return compareKeys(a, b);
  }
}

// ============================================================================
// Global Installation
// ============================================================================

const idbFactory = new IDBFactory();

// Export for module usage
const indexedDB = idbFactory;

// Install globally if in browser-like environment
if (typeof window !== 'undefined') {
  window.indexedDB = indexedDB;
  window.IDBFactory = IDBFactory;
  window.IDBDatabase = IDBDatabase;
  window.IDBTransaction = IDBTransaction;
  window.IDBObjectStore = IDBObjectStore;
  window.IDBIndex = IDBIndex;
  window.IDBRequest = IDBRequest;
  window.IDBOpenDBRequest = IDBOpenDBRequest;
  window.IDBCursor = IDBCursor;
  window.IDBCursorWithValue = IDBCursorWithValue;
  window.IDBKeyRange = IDBKeyRange;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    indexedDB,
    IDBFactory,
    IDBDatabase,
    IDBTransaction,
    IDBObjectStore,
    IDBIndex,
    IDBRequest,
    IDBOpenDBRequest,
    IDBCursor,
    IDBCursorWithValue,
    IDBKeyRange
  };
}

// ES6 export
if (typeof exports !== 'undefined') {
  exports.indexedDB = indexedDB;
  exports.IDBFactory = IDBFactory;
  exports.IDBDatabase = IDBDatabase;
  exports.IDBTransaction = IDBTransaction;
  exports.IDBObjectStore = IDBObjectStore;
  exports.IDBIndex = IDBIndex;
  exports.IDBRequest = IDBRequest;
  exports.IDBOpenDBRequest = IDBOpenDBRequest;
  exports.IDBCursor = IDBCursor;
  exports.IDBCursorWithValue = IDBCursorWithValue;
  exports.IDBKeyRange = IDBKeyRange;
}
