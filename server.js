require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('crypto').randomUUID ? null : require('uuid');
const crypto = require('crypto');

const mpesa = require('./mpesa');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Generate unique order reference
const generateOrderRef = () => {
  return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
};

/**
 * Health check endpoint (used by Railway)
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Checkout endpoint: Initiate M-Pesa STK Push payment
 * POST /api/checkout
 * Body: { phone, amount, items: [{name, quantity, price}, ...] }
 */
app.post('/api/checkout', async (req, res) => {
  try {
    const { phone, amount, items } = req.body;

    // Validate input
    if (!phone || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid phone or amount'
      });
    }

    // Generate unique order reference
    const orderRef = generateOrderRef();

    // Create order in database
    await db.createOrder(orderRef, phone, amount);

    // Add order items if provided
    if (items && Array.isArray(items) && items.length > 0) {
      await db.addOrderItems(orderRef, items);
    }

    // Get base URL from environment or construct from request
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

    // Initiate M-Pesa STK Push
    const stkResult = await mpesa.initiateSTKPush(phone, amount, orderRef, baseUrl);

    if (stkResult.success) {
      res.json({
        success: true,
        orderRef: orderRef,
        checkoutRequestId: stkResult.checkoutRequestId,
        message: 'Payment prompt sent to phone. Please enter your M-Pesa PIN.',
        amount: amount,
        phone: phone
      });
    } else {
      // Update order status to failed
      await db.updateOrderStatus(orderRef, 'failed');
      res.status(400).json({
        success: false,
        message: stkResult.message || 'Failed to initiate payment'
      });
    }
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during checkout',
      error: error.message
    });
  }
});

/**
 * M-Pesa Callback endpoint
 * POST /api/mpesa/callback
 * Receives payment result from Safaricom
 */
app.post('/api/mpesa/callback', async (req, res) => {
  try {
    const callbackData = req.body.Body?.stkCallback;

    if (!callbackData) {
      console.warn('Invalid callback structure:', req.body);
      return res.json({ ResultCode: 1, ResultDesc: 'Invalid callback' });
    }

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callbackData;
    const metadata = CallbackMetadata?.Item || [];

    console.log(`📨 M-Pesa Callback received - CheckoutRequestID: ${CheckoutRequestID}, ResultCode: ${ResultCode}`);

    // Success result codes
    if (ResultCode === 0) {
      // Extract transaction details from metadata
      let amount = 0, mpesaRef = '', phone = '';

      metadata.forEach(item => {
        if (item.Name === 'Amount') amount = item.Value;
        if (item.Name === 'MpesaReceiptNumber') mpesaRef = item.Value;
        if (item.Name === 'PhoneNumber') phone = item.Value;
      });

      console.log(`✓ Payment successful - Amount: KES ${amount}, Phone: ${phone}, M-Pesa Ref: ${mpesaRef}`);

      // Find and update order in database
      // Note: In production, you'd match using CheckoutRequestID stored during checkout
      // For now, we'll search by phone and amount (matching most recent)
      const orders = await db.getAllOrders();
      const matchingOrder = orders.find(
        o => o.phone === phone && o.amount === amount && o.status === 'pending'
      );

      if (matchingOrder) {
        await db.updateOrderStatus(matchingOrder.orderRef, 'completed', mpesaRef);
        console.log(`✓ Order ${matchingOrder.orderRef} marked as completed`);
      }

      // Return success response to Safaricom
      return res.json({
        ResultCode: 0,
        ResultDesc: 'Payment received successfully'
      });
    } else {
      // Payment failed or cancelled
      console.log(`✗ Payment failed/cancelled - ResultDesc: ${ResultDesc}`);
      return res.json({
        ResultCode: 1,
        ResultDesc: 'Payment not completed'
      });
    }
  } catch (error) {
    console.error('Callback processing error:', error);
    return res.json({
      ResultCode: 1,
      ResultDesc: 'Error processing callback'
    });
  }
});

/**
 * Get order status
 * GET /api/orders/:orderRef
 */
app.get('/api/orders/:orderRef', async (req, res) => {
  try {
    const { orderRef } = req.params;

    const order = await db.getOrder(orderRef);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      order: {
        orderRef: order.orderRef,
        phone: order.phone,
        amount: order.amount,
        status: order.status,
        mpesaTransactionRef: order.mpesaTransactionRef,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving order'
    });
  }
});

/**
 * Get all orders (admin endpoint)
 * GET /api/orders
 */
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await db.getAllOrders();
    res.json({
      success: true,
      count: orders.length,
      orders: orders
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving orders'
    });
  }
});

/**
 * Serve storefront HTML
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║     Jack's Brand API Server            ║
║     Listening on port ${PORT}              ║
╚════════════════════════════════════════╝
  `);
  console.log(`📍 Base URL: ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💳 M-Pesa Env: ${process.env.MPESA_ENV || 'sandbox'}`);
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  db.closeDb();
  process.exit(0);
});
