const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'orders.db');
const db = new sqlite3.Database(dbPath);

// Initialize database schema
db.serialize(() => {
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
    const stmt = db.prepare(
      `INSERT INTO order_items (orderRef, productName, quantity, price) VALUES (?, ?, ?, ?)`
    );

    items.forEach(item => {
      stmt.run([orderRef, item.name, item.quantity, item.price]);
    });

    stmt.finalize((err) => {
      if (err) reject(err);
      else resolve();
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
  updateOrderStatus,
  getAllOrders,
  closeDb
};
