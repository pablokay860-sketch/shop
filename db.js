const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'orders.db');
const db = new sqlite3.Database(dbPath);

// Initialize database schema
db.serialize(() => {
  // Performance/consistency pragmas
  try {
    db.run(`PRAGMA journal_mode = WAL`);
    db.run(`PRAGMA synchronous = NORMAL`);
  } catch (err) {
    console.warn('Failed to set PRAGMA:', err.message || err);
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderRef TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      mpesaTransactionRef TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating orders table:', err);
    } else {
      console.log('✓ Orders table initialized');
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderRef TEXT NOT NULL,
      productName TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY (orderRef) REFERENCES orders(orderRef)
    )
  `, (err) => {
    if (err) {
      console.error('Error creating order_items table:', err);
    } else {
      console.log('✓ Order items table initialized');
    }
  });

  // Add checkoutRequestId column if it doesn't exist yet (safe to run on startup)
  db.run(`ALTER TABLE orders ADD COLUMN checkoutRequestId TEXT`, (err) => {
    // SQLite will error if column already exists — ignore that error
    if (err) {
      // Only log unexpected errors
      if (!/duplicate column name/i.test(err.message)) {
        console.debug('ALTER TABLE skipped or failed (likely already present):', err.message);
      }
    } else {
      console.log('✓ Added checkoutRequestId column to orders table');
    }
  });

  // Create useful indexes to speed common lookups
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_checkoutRequestId ON orders(checkoutRequestId)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_createdAt ON orders(createdAt)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone)`);
});

// Create a new order
const createOrder = (orderRef, phone, amount) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO orders (orderRef, phone, amount, status) VALUES (?, ?, ?, 'pending')`,
      [orderRef, phone, amount],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
};

// Add items to an order
const addOrderItems = (orderRef, items) => {
  return new Promise((resolve, reject) => {
    db.run('BEGIN TRANSACTION', (beginErr) => {
      if (beginErr) return reject(beginErr);

      const stmt = db.prepare(
        `INSERT INTO order_items (orderRef, productName, quantity, price) VALUES (?, ?, ?, ?)`
      );

      for (const item of items) {
        stmt.run([orderRef, item.name, item.quantity, item.price]);
      }

      stmt.finalize((err) => {
        if (err) {
          db.run('ROLLBACK', () => reject(err));
        } else {
          db.run('COMMIT', (commitErr) => {
            if (commitErr) return reject(commitErr);
            resolve();
          });
        }
      });
    });
  });
};

// Get order by reference
const getOrder = (orderRef) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM orders WHERE orderRef = ?`,
      [orderRef],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
};

// Get order by CheckoutRequestID
const getOrderByCheckoutRequestId = (checkoutRequestId) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM orders WHERE checkoutRequestId = ? LIMIT 1`,
      [checkoutRequestId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
};

// Get items for an order
const getOrderItems = (orderRef) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT productName, quantity, price FROM order_items WHERE orderRef = ? ORDER BY id ASC`,
      [orderRef],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
};

// Save CheckoutRequestID returned by M-Pesa when initiating STK push
const saveCheckoutRequestId = (orderRef, checkoutRequestId) => {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE orders SET checkoutRequestId = ?, updatedAt = CURRENT_TIMESTAMP WHERE orderRef = ?`,
      [checkoutRequestId, orderRef],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
};

// Update order status
const updateOrderStatus = (orderRef, status, mpesaTransactionRef = null) => {
  return new Promise((resolve, reject) => {
    const query = mpesaTransactionRef
      ? `UPDATE orders SET status = ?, mpesaTransactionRef = ?, updatedAt = CURRENT_TIMESTAMP WHERE orderRef = ?`
      : `UPDATE orders SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE orderRef = ?`;
    
    const params = mpesaTransactionRef
      ? [status, mpesaTransactionRef, orderRef]
      : [status, orderRef];

    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};

// Get all orders (for admin/analytics)
const getAllOrders = () => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM orders ORDER BY createdAt DESC`,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
};

// Close database connection gracefully
const closeDb = () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('✓ Database connection closed');
    }
  });
};

module.exports = {
  db,
  createOrder,
  addOrderItems,
  getOrder,
  getOrderItems,
  saveCheckoutRequestId,
  getOrderByCheckoutRequestId,
  updateOrderStatus,
  getAllOrders,
  closeDb
};
