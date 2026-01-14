#!/usr/bin/env node

/**
 * IndexedDB Mock - Quick Verification Script
 *
 * Runs basic tests to verify the implementation works correctly.
 */

const { indexedDB, IDBKeyRange } = require('./indexeddb-mock.js');

console.log('=== IndexedDB Mock - Quick Verification ===\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log('✓', message);
    testsPassed++;
  } else {
    console.error('✗', message);
    testsFailed++;
  }
}

async function runVerification() {
  // Test 1: Factory exists
  assert(typeof indexedDB === 'object', 'indexedDB factory exists');
  assert(typeof indexedDB.open === 'function', 'indexedDB.open is a function');
  assert(typeof indexedDB.deleteDatabase === 'function', 'indexedDB.deleteDatabase is a function');
  assert(typeof indexedDB.databases === 'function', 'indexedDB.databases is a function');

  // Test 2: IDBKeyRange exists
  assert(typeof IDBKeyRange === 'function', 'IDBKeyRange constructor exists');
  assert(typeof IDBKeyRange.only === 'function', 'IDBKeyRange.only exists');
  assert(typeof IDBKeyRange.bound === 'function', 'IDBKeyRange.bound exists');

  // Test 3: Database operations
  await new Promise((resolve) => {
    const request = indexedDB.open('VerifyDB', 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const store = db.createObjectStore('test', { keyPath: 'id' });
      assert(store.name === 'test', 'Object store created');
      assert(store.keyPath === 'id', 'Object store has correct keyPath');
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      assert(db.name === 'VerifyDB', 'Database name is correct');
      assert(db.version === 1, 'Database version is correct');
      assert(db.objectStoreNames.length === 1, 'Database has 1 object store');

      // Test 4: Write data
      const tx = db.transaction('test', 'readwrite');
      const store = tx.objectStore('test');
      const addReq = store.add({ id: 1, name: 'Test' });

      addReq.onsuccess = () => {
        assert(addReq.result === 1, 'Add operation returned correct key');
      };

      tx.oncomplete = () => {
        // Test 5: Read data
        const tx2 = db.transaction('test', 'readonly');
        const store2 = tx2.objectStore('test');
        const getReq = store2.get(1);

        getReq.onsuccess = () => {
          const result = getReq.result;
          assert(result !== undefined, 'Data retrieved successfully');
          assert(result.id === 1, 'Retrieved data has correct id');
          assert(result.name === 'Test', 'Retrieved data has correct name');
        };

        tx2.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    };

    request.onerror = () => {
      assert(false, 'Database open failed');
      resolve();
    };
  });

  // Test 6: Key Range
  const range1 = IDBKeyRange.only(5);
  assert(range1.lower === 5 && range1.upper === 5, 'IDBKeyRange.only works');

  const range2 = IDBKeyRange.bound(1, 10);
  assert(range2.lower === 1 && range2.upper === 10, 'IDBKeyRange.bound works');

  const range3 = IDBKeyRange.lowerBound(5);
  assert(range3.lower === 5 && range3.upper === undefined, 'IDBKeyRange.lowerBound works');

  // Test 7: Database listing
  const databases = await indexedDB.databases();
  assert(Array.isArray(databases), 'databases() returns an array');
  assert(databases.length > 0, 'databases() shows created databases');
  assert(databases.some(db => db.name === 'VerifyDB'), 'VerifyDB is in the list');

  // Test 8: Transaction modes
  await new Promise((resolve) => {
    const request = indexedDB.open('VerifyDB', 1);
    request.onsuccess = (event) => {
      const db = event.target.result;

      const roTx = db.transaction('test', 'readonly');
      assert(roTx.mode === 'readonly', 'Readonly transaction created');

      const rwTx = db.transaction('test', 'readwrite');
      assert(rwTx.mode === 'readwrite', 'Readwrite transaction created');

      db.close();
      resolve();
    };
  });

  // Test 9: Auto-increment
  await new Promise((resolve) => {
    const request = indexedDB.open('AutoDB', 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore('auto', { autoIncrement: true });
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction('auto', 'readwrite');
      const store = tx.objectStore('auto');

      const keys = [];
      const add1 = store.add({ value: 'first' });
      add1.onsuccess = () => keys.push(add1.result);

      const add2 = store.add({ value: 'second' });
      add2.onsuccess = () => keys.push(add2.result);

      tx.oncomplete = () => {
        assert(keys[0] === 1, 'First auto-increment key is 1');
        assert(keys[1] === 2, 'Second auto-increment key is 2');
        db.close();
        resolve();
      };
    };
  });

  // Test 10: Cursor iteration
  await new Promise((resolve) => {
    const request = indexedDB.open('CursorDB', 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore('items', { keyPath: 'id' });
    };

    request.onsuccess = (event) => {
      const db = event.target.result;

      const tx1 = db.transaction('items', 'readwrite');
      const store1 = tx1.objectStore('items');

      for (let i = 1; i <= 3; i++) {
        store1.add({ id: i, value: `Item ${i}` });
      }

      tx1.oncomplete = () => {
        const tx2 = db.transaction('items', 'readonly');
        const store2 = tx2.objectStore('items');
        const cursorReq = store2.openCursor();

        let count = 0;
        cursorReq.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            count++;
            cursor.continue();
          } else {
            assert(count === 3, 'Cursor iterated 3 items');
          }
        };

        tx2.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    };
  });

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Tests Failed: ${testsFailed}`);
  console.log('='.repeat(50));

  if (testsFailed === 0) {
    console.log('\n🎉 All tests passed! IndexedDB mock is working correctly.');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed. Please check the implementation.');
    process.exit(1);
  }
}

runVerification().catch(error => {
  console.error('Verification failed with error:', error);
  process.exit(1);
});
