# IndexedDB Mock - Complete Implementation

A full-featured, in-memory IndexedDB implementation for universal webapp extraction. This implementation provides complete compatibility with the IndexedDB API specification, allowing webapps to run without modifications.

## Features

### ✅ Complete API Coverage

- **IDBFactory** - Database creation and deletion
- **IDBDatabase** - Object store management
- **IDBTransaction** - Transaction lifecycle management
- **IDBObjectStore** - CRUD operations with full query support
- **IDBIndex** - Secondary indexes with multi-entry support
- **IDBCursor** - Iteration with all directions
- **IDBRequest** - Async operations with proper event handling
- **IDBKeyRange** - Range queries (bound, upperBound, lowerBound, only)

### ✅ Advanced Features

- **Auto-increment keys** - Automatic key generation
- **Key paths** - Deep object property access
- **Structured cloning** - Deep copying of values
- **Unique constraints** - Index uniqueness validation
- **Multi-entry indexes** - Array value indexing
- **Cursor directions** - next, prev, nextunique, prevunique
- **Transaction modes** - readonly, readwrite, versionchange
- **Event system** - Complete event propagation
- **Async behavior** - Microtask-based event scheduling

## Installation

### Browser (Global)

```html
<script src="indexeddb-mock.js"></script>
<script>
  // IndexedDB is now available globally
  const request = indexedDB.open('MyDatabase', 1);
</script>
```

### Node.js (CommonJS)

```javascript
const { indexedDB, IDBKeyRange } = require('./indexeddb-mock.js');
```

### ES6 Module

```javascript
import { indexedDB, IDBKeyRange } from './indexeddb-mock.js';
```

## Usage Examples

### Basic Operations

```javascript
// Open database
const request = indexedDB.open('MyApp', 1);

request.onupgradeneeded = (event) => {
  const db = event.target.result;

  // Create object store
  const store = db.createObjectStore('users', { keyPath: 'id' });

  // Create indexes
  store.createIndex('emailIdx', 'email', { unique: true });
  store.createIndex('ageIdx', 'age', { unique: false });
};

request.onsuccess = (event) => {
  const db = event.target.result;

  // Start transaction
  const tx = db.transaction('users', 'readwrite');
  const store = tx.objectStore('users');

  // Add data
  store.add({ id: 1, name: 'Alice', email: 'alice@example.com', age: 30 });

  tx.oncomplete = () => {
    console.log('Transaction completed');
  };
};
```

### Reading Data

```javascript
const tx = db.transaction('users', 'readonly');
const store = tx.objectStore('users');

// Get single record
const getRequest = store.get(1);
getRequest.onsuccess = () => {
  console.log('User:', getRequest.result);
};

// Get all records
const getAllRequest = store.getAll();
getAllRequest.onsuccess = () => {
  console.log('All users:', getAllRequest.result);
};

// Count records
const countRequest = store.count();
countRequest.onsuccess = () => {
  console.log('Total users:', countRequest.result);
};
```

### Using Indexes

```javascript
const tx = db.transaction('users', 'readonly');
const store = tx.objectStore('users');
const index = store.index('ageIdx');

// Get by index
const request = index.get(30);
request.onsuccess = () => {
  console.log('User aged 30:', request.result);
};

// Get all by index
const getAllRequest = index.getAll();
getAllRequest.onsuccess = () => {
  console.log('Users by age:', getAllRequest.result);
};
```

### Using Cursors

```javascript
const tx = db.transaction('users', 'readonly');
const store = tx.objectStore('users');
const cursorRequest = store.openCursor();

cursorRequest.onsuccess = (event) => {
  const cursor = event.target.result;

  if (cursor) {
    console.log('User:', cursor.value);
    cursor.continue(); // Move to next record
  } else {
    console.log('No more records');
  }
};
```

### Key Ranges

```javascript
const tx = db.transaction('users', 'readonly');
const store = tx.objectStore('users');

// Get users with age between 25 and 35
const range = IDBKeyRange.bound(25, 35);
const index = store.index('ageIdx');

const request = index.getAll(range);
request.onsuccess = () => {
  console.log('Users aged 25-35:', request.result);
};

// Other range types
IDBKeyRange.only(30);              // Exactly 30
IDBKeyRange.lowerBound(25);        // >= 25
IDBKeyRange.upperBound(35);        // <= 35
IDBKeyRange.bound(25, 35, true, true); // 25 < x < 35 (exclusive)
```

### Auto-increment Keys

```javascript
request.onupgradeneeded = (event) => {
  const db = event.target.result;

  // Create store with auto-increment
  const store = db.createObjectStore('messages', { autoIncrement: true });
};

request.onsuccess = (event) => {
  const db = event.target.result;
  const tx = db.transaction('messages', 'readwrite');
  const store = tx.objectStore('messages');

  // Key will be automatically generated
  const addRequest = store.add({ text: 'Hello World' });

  addRequest.onsuccess = () => {
    console.log('Generated key:', addRequest.result); // 1, 2, 3, etc.
  };
};
```

### Cursor Updates and Deletes

```javascript
const tx = db.transaction('users', 'readwrite');
const store = tx.objectStore('users');
const cursorRequest = store.openCursor();

cursorRequest.onsuccess = (event) => {
  const cursor = event.target.result;

  if (cursor) {
    const user = cursor.value;

    // Update current record
    if (user.age < 18) {
      user.category = 'minor';
      cursor.update(user);
    }

    // Delete current record
    if (user.inactive) {
      cursor.delete();
    }

    cursor.continue();
  }
};
```

### Transaction Management

```javascript
// Read-only transaction (default)
const tx1 = db.transaction('users', 'readonly');

// Read-write transaction
const tx2 = db.transaction('users', 'readwrite');

// Multiple stores
const tx3 = db.transaction(['users', 'orders'], 'readwrite');

// Transaction events
tx3.oncomplete = () => {
  console.log('Transaction completed successfully');
};

tx3.onerror = (event) => {
  console.error('Transaction error:', event.target.error);
};

tx3.onabort = () => {
  console.log('Transaction aborted');
};

// Manual commit (usually auto-commits)
// tx3.commit();

// Abort transaction
// tx3.abort();
```

### Multi-Entry Indexes

```javascript
request.onupgradeneeded = (event) => {
  const db = event.target.result;
  const store = db.createObjectStore('articles', { keyPath: 'id' });

  // Create multi-entry index for tags array
  store.createIndex('tagsIdx', 'tags', { multiEntry: true });
};

// Add article with multiple tags
store.add({
  id: 1,
  title: 'IndexedDB Guide',
  tags: ['database', 'javascript', 'tutorial']
});

// Query by any tag
const index = store.index('tagsIdx');
const request = index.get('javascript');
// Returns articles that have 'javascript' in their tags array
```

### Database Management

```javascript
// List all databases
indexedDB.databases().then(databases => {
  console.log('Databases:', databases);
  // [{ name: 'MyApp', version: 1 }, ...]
});

// Delete database
const deleteRequest = indexedDB.deleteDatabase('MyApp');

deleteRequest.onsuccess = () => {
  console.log('Database deleted');
};

// Close database
db.close();
```

## API Reference

### IDBFactory

```javascript
indexedDB.open(name, version)          // Returns IDBOpenDBRequest
indexedDB.deleteDatabase(name)         // Returns IDBRequest
indexedDB.databases()                  // Returns Promise<Array>
indexedDB.cmp(key1, key2)             // Compare keys
```

### IDBDatabase

```javascript
db.createObjectStore(name, options)    // Returns IDBObjectStore
db.deleteObjectStore(name)             // Deletes store
db.transaction(storeNames, mode)       // Returns IDBTransaction
db.close()                             // Closes database

// Properties
db.name                                // Database name
db.version                            // Database version
db.objectStoreNames                   // DOMStringList of store names

// Events
db.onversionchange
db.onclose
db.onerror
```

### IDBTransaction

```javascript
tx.objectStore(name)                   // Returns IDBObjectStore
tx.abort()                             // Abort transaction
tx.commit()                            // Commit transaction

// Properties
tx.db                                  // Parent database
tx.mode                               // 'readonly', 'readwrite', 'versionchange'
tx.objectStoreNames                   // Stores in transaction
tx.error                              // Error if failed

// Events
tx.oncomplete
tx.onerror
tx.onabort
```

### IDBObjectStore

```javascript
store.add(value, key)                  // Returns IDBRequest
store.put(value, key)                  // Returns IDBRequest
store.get(key)                         // Returns IDBRequest
store.getAll(query, count)             // Returns IDBRequest
store.getAllKeys(query, count)         // Returns IDBRequest
store.getKey(key)                      // Returns IDBRequest
store.delete(key)                      // Returns IDBRequest
store.clear()                          // Returns IDBRequest
store.count(query)                     // Returns IDBRequest
store.openCursor(query, direction)     // Returns IDBRequest
store.openKeyCursor(query, direction)  // Returns IDBRequest
store.createIndex(name, keyPath, opts) // Returns IDBIndex
store.deleteIndex(name)                // Deletes index
store.index(name)                      // Returns IDBIndex

// Properties
store.name
store.keyPath
store.autoIncrement
store.indexNames
store.transaction
```

### IDBIndex

```javascript
index.get(key)                         // Returns IDBRequest
index.getAll(query, count)             // Returns IDBRequest
index.getAllKeys(query, count)         // Returns IDBRequest
index.getKey(key)                      // Returns IDBRequest
index.count(query)                     // Returns IDBRequest
index.openCursor(query, direction)     // Returns IDBRequest
index.openKeyCursor(query, direction)  // Returns IDBRequest

// Properties
index.name
index.objectStore
index.keyPath
index.multiEntry
index.unique
```

### IDBCursor

```javascript
cursor.advance(count)                  // Skip ahead
cursor.continue(key)                   // Move to next
cursor.continuePrimaryKey(key, primaryKey) // Move to key
cursor.update(value)                   // Returns IDBRequest
cursor.delete()                        // Returns IDBRequest

// Properties
cursor.source                          // ObjectStore or Index
cursor.direction                       // 'next', 'prev', etc.
cursor.key                            // Current key
cursor.primaryKey                     // Primary key
cursor.value                          // Current value (if CursorWithValue)
```

### IDBRequest

```javascript
// Properties
request.result                         // Result value
request.error                          // Error if failed
request.source                         // Source object
request.transaction                    // Transaction context
request.readyState                    // 'pending' or 'done'

// Events
request.onsuccess
request.onerror
```

### IDBKeyRange

```javascript
IDBKeyRange.only(value)
IDBKeyRange.lowerBound(lower, open)
IDBKeyRange.upperBound(upper, open)
IDBKeyRange.bound(lower, upper, lowerOpen, upperOpen)

// Properties
range.lower
range.upper
range.lowerOpen
range.upperOpen

// Methods
range.includes(key)
```

## Implementation Details

### Storage

- All data is stored **in-memory** using JavaScript Maps
- Data persists only during the session
- No localStorage/sessionStorage integration by default
- Structured cloning ensures data isolation

### Async Behavior

- All operations complete asynchronously using `queueMicrotask()`
- Events fire in the correct order
- Transactions auto-commit when request queue empties

### Key Comparison

Keys are compared in this order:
1. Numbers (ascending)
2. Strings (lexicographic)
3. Dates (chronological)
4. Arrays (element-wise)

### Limitations

- No persistence (in-memory only)
- No Blob/File support (use structured clone compatible types)
- No database size limits
- Simplified locking (no actual multi-process coordination)

## Testing

Open `indexeddb-mock.test.html` in a browser to run the test suite:

```bash
open indexeddb-mock.test.html
```

Tests cover:
- Basic CRUD operations
- Index operations
- Cursor iteration
- Transaction management
- Key ranges
- Auto-increment keys
- Multiple object stores

## Performance

This implementation is optimized for:
- Fast in-memory operations
- Minimal overhead
- Small memory footprint
- Quick structured cloning

Suitable for:
- Testing and development
- Web scraping and extraction
- Browser automation
- Offline development
- Mock data scenarios

## Browser Compatibility

Works in any JavaScript environment:
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Node.js (with global polyfill)
- Electron
- React Native (with polyfill)
- Web Workers

## License

This implementation is provided as-is for universal webapp extraction purposes.

## Support

For issues or questions, refer to the test file for usage examples.
