/**
 * IndexedDB Mock - Node.js Example
 *
 * Demonstrates how to use the IndexedDB mock in Node.js environment
 */

// Import the mock
const { indexedDB, IDBKeyRange } = require('./indexeddb-mock.js');

console.log('=== IndexedDB Mock - Node.js Example ===\n');

// Example 1: Basic Usage
async function basicExample() {
  console.log('--- Example 1: Basic CRUD Operations ---');

  return new Promise((resolve) => {
    const request = indexedDB.open('ExampleDB', 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const store = db.createObjectStore('books', { keyPath: 'isbn' });
      store.createIndex('titleIdx', 'title', { unique: false });
      store.createIndex('authorIdx', 'author', { unique: false });
      console.log('✓ Database schema created');
    };

    request.onsuccess = (event) => {
      const db = event.target.result;

      // Add books
      const tx = db.transaction('books', 'readwrite');
      const store = tx.objectStore('books');

      store.add({
        isbn: '978-0-7475-3269-9',
        title: 'Harry Potter and the Philosopher\'s Stone',
        author: 'J.K. Rowling',
        year: 1997
      });

      store.add({
        isbn: '978-0-06-112008-4',
        title: 'To Kill a Mockingbird',
        author: 'Harper Lee',
        year: 1960
      });

      tx.oncomplete = () => {
        console.log('✓ Books added\n');

        // Read books
        const tx2 = db.transaction('books', 'readonly');
        const store2 = tx2.objectStore('books');

        const getAll = store2.getAll();
        getAll.onsuccess = () => {
          console.log('All books:', JSON.stringify(getAll.result, null, 2));
        };

        tx2.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    };
  });
}

// Example 2: Index Queries
async function indexExample() {
  console.log('\n--- Example 2: Index Queries ---');

  return new Promise((resolve) => {
    const request = indexedDB.open('ExampleDB', 1);

    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction('books', 'readonly');
      const store = tx.objectStore('books');

      // Query by author index
      const authorIndex = store.index('authorIdx');
      const getByAuthor = authorIndex.get('Harper Lee');

      getByAuthor.onsuccess = () => {
        console.log('Book by Harper Lee:', getByAuthor.result.title);
      };

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };
  });
}

// Example 3: Cursor Iteration
async function cursorExample() {
  console.log('\n--- Example 3: Cursor Iteration ---');

  return new Promise((resolve) => {
    const request = indexedDB.open('ExampleDB', 1);

    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction('books', 'readonly');
      const store = tx.objectStore('books');

      console.log('Iterating through books:');
      const cursorReq = store.openCursor();

      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;

        if (cursor) {
          console.log(`  - ${cursor.value.title} (${cursor.value.year})`);
          cursor.continue();
        } else {
          console.log('Iteration complete');
        }
      };

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };
  });
}

// Example 4: Auto-increment with Key Path
async function autoIncrementExample() {
  console.log('\n--- Example 4: Auto-increment Keys ---');

  return new Promise((resolve) => {
    const request = indexedDB.open('LogDB', 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
      console.log('✓ Log store created with auto-increment');
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction('logs', 'readwrite');
      const store = tx.objectStore('logs');

      // Add logs without specifying ID
      const log1 = store.add({ message: 'Application started', timestamp: Date.now() });
      const log2 = store.add({ message: 'User logged in', timestamp: Date.now() });
      const log3 = store.add({ message: 'Data processed', timestamp: Date.now() });

      let generatedIds = [];

      log1.onsuccess = () => {
        generatedIds.push(log1.result);
      };

      log2.onsuccess = () => {
        generatedIds.push(log2.result);
      };

      log3.onsuccess = () => {
        generatedIds.push(log3.result);
      };

      tx.oncomplete = () => {
        console.log('✓ Generated IDs:', generatedIds.join(', '));
        db.close();
        resolve();
      };
    };
  });
}

// Example 5: Key Ranges
async function keyRangeExample() {
  console.log('\n--- Example 5: Key Range Queries ---');

  return new Promise((resolve) => {
    const request = indexedDB.open('ScoreDB', 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore('scores', { keyPath: 'score' });
    };

    request.onsuccess = (event) => {
      const db = event.target.result;

      // Add scores
      const tx1 = db.transaction('scores', 'readwrite');
      const store1 = tx1.objectStore('scores');

      [85, 92, 78, 95, 88, 73, 90].forEach(score => {
        store1.add({ score, grade: score >= 90 ? 'A' : score >= 80 ? 'B' : 'C' });
      });

      tx1.oncomplete = () => {
        console.log('✓ Scores added');

        // Query high scores (>= 90)
        const tx2 = db.transaction('scores', 'readonly');
        const store2 = tx2.objectStore('scores');

        const range = IDBKeyRange.lowerBound(90);
        const highScores = store2.getAll(range);

        highScores.onsuccess = () => {
          console.log('High scores (≥90):', highScores.result.map(s => s.score).join(', '));
        };

        tx2.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    };
  });
}

// Example 6: Complex Transaction
async function complexTransactionExample() {
  console.log('\n--- Example 6: Complex Transaction with Multiple Stores ---');

  return new Promise((resolve) => {
    const request = indexedDB.open('EcommerceDB', 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore('customers', { keyPath: 'id' });
      db.createObjectStore('orders', { keyPath: 'id', autoIncrement: true });
      console.log('✓ E-commerce schema created');
    };

    request.onsuccess = (event) => {
      const db = event.target.result;

      // Multi-store transaction
      const tx = db.transaction(['customers', 'orders'], 'readwrite');

      const customers = tx.objectStore('customers');
      const orders = tx.objectStore('orders');

      // Add customer
      customers.add({
        id: 'CUST001',
        name: 'John Doe',
        email: 'john@example.com'
      });

      // Add order for customer
      const orderReq = orders.add({
        customerId: 'CUST001',
        items: ['Item A', 'Item B'],
        total: 99.99,
        date: new Date().toISOString()
      });

      orderReq.onsuccess = () => {
        console.log(`✓ Order created with ID: ${orderReq.result}`);
      };

      tx.oncomplete = () => {
        console.log('✓ Transaction completed successfully');
        db.close();
        resolve();
      };

      tx.onerror = () => {
        console.error('✗ Transaction failed:', tx.error);
      };
    };
  });
}

// Example 7: Database Management
async function databaseManagementExample() {
  console.log('\n--- Example 7: Database Management ---');

  // List databases
  const databases = await indexedDB.databases();
  console.log('Current databases:');
  databases.forEach(db => {
    console.log(`  - ${db.name} (v${db.version})`);
  });

  // Delete a database
  return new Promise((resolve) => {
    const deleteReq = indexedDB.deleteDatabase('LogDB');

    deleteReq.onsuccess = () => {
      console.log('✓ LogDB deleted');
      resolve();
    };
  });
}

// Run all examples
async function runAllExamples() {
  try {
    await basicExample();
    await indexExample();
    await cursorExample();
    await autoIncrementExample();
    await keyRangeExample();
    await complexTransactionExample();
    await databaseManagementExample();

    console.log('\n=== All Examples Completed Successfully ===');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Execute
runAllExamples();
